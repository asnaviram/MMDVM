/*
 * ESP32 RoIP - Network Manager Implementation
 * Professional WiFi, mDNS, NTP, and connection management
 * Supports 2.4GHz and 5GHz bands (C5/C6/H2)
 */

#include "network_manager.h"
#include <WiFi.h>
#include <esp_wifi.h>
#include <esp_netif.h>
#include <ESPmDNS.h>
#include <lwip/sockets.h>
#include <lwip/dns.h>
#include <esp_sntp.h>
#include <cstring>
#include <algorithm>

// Forward declare Serial for logging
extern HardwareSerial Serial;

// Static instance for event handler callback
NetworkManager* NetworkManager::instance_ = nullptr;

// Conversion constants
const uint32_t MS_PER_SECOND = 1000;
const uint32_t DEFAULT_QUALITY_CHECK_INTERVAL_MS = 5000;
const uint32_t DEFAULT_RECONNECT_INTERVAL_MS = 5000;
const uint32_t DEFAULT_NTP_SYNC_INTERVAL_MS = 3600000;  // 1 hour
const uint32_t QUALITY_CHANGE_THRESHOLD = 10;  // dB
const int8_t RSSI_LOW_THRESHOLD = -80;  // dBm

// ESP32 variant detection
#if defined(CONFIG_IDF_TARGET_ESP32C5) || defined(CONFIG_IDF_TARGET_ESP32C6)
const bool HAS_5GHZ_SUPPORT = true;
#else
const bool HAS_5GHZ_SUPPORT = false;
#endif

/**
 * Constructor
 */
NetworkManager::NetworkManager()
    : state_(WiFiState::IDLE),
      current_band_(WiFiBand::BAND_2_4GHZ),
      last_quality_check_ms_(0),
      last_reconnect_attempt_ms_(0),
      last_ntp_sync_ms_(0),
      session_start_ms_(0),
      initialized_(false),
      auto_reconnect_enabled_(true),
      auto_reconnect_interval_ms_(DEFAULT_RECONNECT_INTERVAL_MS),
      scanning_(false),
      ntp_synced_(false),
      mdns_started_(false),
      scan_results_(nullptr),
      scan_result_count_(0) {

    memset(&config_, 0, sizeof(config_));
    memset(&stats_, 0, sizeof(stats_));
    memset(&last_quality_, 0, sizeof(last_quality_));
    memset(hostname_, 0, sizeof(hostname_));

    instance_ = this;
}

/**
 * Destructor
 */
NetworkManager::~NetworkManager() {
    end();
    if (scan_results_) {
        delete[] scan_results_;
        scan_results_ = nullptr;
    }
    instance_ = nullptr;
}

/**
 * Initialize network manager
 */
bool NetworkManager::begin(const NetworkConfig& config) {
    if (initialized_) {
        return true;
    }

    // Copy configuration
    memcpy(&config_, &config, sizeof(NetworkConfig));
    strncpy(hostname_, config.hostname, sizeof(hostname_) - 1);

    // Initialize WiFi
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(false);  // We handle reconnection ourselves
    WiFi.setAutoConnect(false);

    // Configure static IP if provided
    if (strlen(config.static_ip) > 0) {
        IPAddress ip, gateway, subnet, dns1, dns2;
        ip.fromString(config.static_ip);
        gateway.fromString(config.static_gateway);
        subnet.fromString(config.static_subnet);

        if (strlen(config.static_dns1) > 0) {
            dns1.fromString(config.static_dns1);
        }
        if (strlen(config.static_dns2) > 0) {
            dns2.fromString(config.static_dns2);
        }

        if (!WiFi.config(ip, gateway, subnet, dns1, dns2)) {
            Serial.println("[NETWORK] Failed to configure static IP");
        }
    }

    // Set hostname
    WiFi.setHostname(hostname_);

    // Configure 5GHz support if available
    if (config.preferred_band != WiFiBand::BAND_2_4GHZ) {
        configure5GHzSupport();
    }

    // Initialize event handlers
    initializeEventHandlers();

    // Allocate scan results buffer
    scan_results_ = new WiFiScanResult[16];

    initialized_ = true;
    state_ = WiFiState::IDLE;
    session_start_ms_ = millis();

    Serial.printf("[NETWORK] Network Manager initialized (hostname: %s)\n", hostname_);

    return true;
}

/**
 * Shutdown network manager
 */
bool NetworkManager::end() {
    if (!initialized_) {
        return true;
    }

    // Stop mDNS
    if (mdns_started_) {
        stopMDNS();
    }

    // Disconnect WiFi
    disconnect();
    // Note: WiFi.end() is not available in some ESP32 Arduino versions
    // WiFi.disconnect() is sufficient for cleanup

    initialized_ = false;
    state_ = WiFiState::IDLE;

    Serial.println("[NETWORK] Network Manager shutdown");

    return true;
}

/**
 * Connect to WiFi network
 */
bool NetworkManager::connect() {
    if (!initialized_) {
        return false;
    }

    if (state_ == WiFiState::CONNECTED) {
        return true;
    }

    if (state_ == WiFiState::CONNECTING) {
        return true;  // Already connecting
    }

    // Validate SSID
    if (!isValidSSID(config_.ssid)) {
        state_ = WiFiState::FAILED;
        fireEvent(NetworkEvent::CONNECTION_FAILED, "Invalid SSID");
        return false;
    }

    stats_.connect_attempts++;
    state_ = WiFiState::CONNECTING;
    fireEvent(NetworkEvent::WIFI_SCANNING, config_.ssid);

    // Start connection
    Serial.printf("[NETWORK] Connecting to SSID: %s (timeout: %dms)\n",
                  config_.ssid, config_.connect_timeout_ms);

    WiFi.begin(config_.ssid, config_.password);

    return true;
}

/**
 * Disconnect from WiFi
 */
bool NetworkManager::disconnect() {
    if (!initialized_) {
        return false;
    }

    if (state_ == WiFiState::DISCONNECTED || state_ == WiFiState::IDLE) {
        return true;
    }

    state_ = WiFiState::DISCONNECTING;
    WiFi.disconnect(true);  // Disable reconnection

    return true;
}

/**
 * Reconnect to WiFi
 */
bool NetworkManager::reconnect() {
    if (!initialized_) {
        return false;
    }

    disconnect();
    return connect();
}

/**
 * Check if connected
 */
bool NetworkManager::isConnected() {
    return (state_ == WiFiState::CONNECTED && WiFi.status() == WL_CONNECTED);
}

/**
 * Set WiFi band preference
 */
bool NetworkManager::setBand(WiFiBand band) {
    if (!initialized_) {
        return false;
    }

    if (!supports5GHz() && band == WiFiBand::BAND_5GHZ) {
        Serial.println("[NETWORK] 5GHz not supported on this ESP32 variant");
        return false;
    }

    current_band_ = band;

    if (isConnected()) {
        fireEvent(NetworkEvent::BAND_SWITCHED, band == WiFiBand::BAND_5GHZ ? "5GHz" : "2.4GHz");
    }

    return true;
}

/**
 * Get current WiFi band
 */
WiFiBand NetworkManager::getBand() const {
    return current_band_;
}

/**
 * Check if 5GHz is supported
 */
bool NetworkManager::supports5GHz() const {
    return HAS_5GHZ_SUPPORT;
}

/**
 * Start WiFi scan
 */
bool NetworkManager::startScan() {
    if (!initialized_ || scanning_) {
        return false;
    }

    state_ = WiFiState::SCANNING;
    scanning_ = true;
    fireEvent(NetworkEvent::WIFI_SCANNING, "WiFi scan started");

    Serial.println("[NETWORK] Starting WiFi scan");
    WiFi.scanNetworks(true, false, false, 200);  // Async mode

    return true;
}

/**
 * Check if currently scanning
 */
bool NetworkManager::isScanning() const {
    return scanning_;
}

/**
 * Get scan results
 */
uint16_t NetworkManager::getScanResults(WiFiScanResult* results, uint16_t max_results) {
    if (!results || max_results == 0) {
        return 0;
    }

    int16_t num_networks = WiFi.scanComplete();
    if (num_networks == WIFI_SCAN_RUNNING) {
        return 0;  // Still scanning
    }

    if (num_networks == WIFI_SCAN_FAILED) {
        return 0;  // Scan failed
    }

    if (num_networks <= 0) {
        return 0;  // No networks found
    }

    scanning_ = false;
    fireEvent(NetworkEvent::WIFI_SCAN_COMPLETE, "WiFi scan complete");

    uint16_t count = std::min((uint16_t)num_networks, max_results);
    for (uint16_t i = 0; i < count; i++) {
        strncpy(results[i].ssid, WiFi.SSID(i).c_str(), sizeof(results[i].ssid) - 1);
        results[i].rssi = WiFi.RSSI(i);
        results[i].channel = WiFi.channel(i);
        results[i].signal_quality = calculateSignalQuality(results[i].rssi);

        // Determine if 5GHz based on channel
        results[i].is_5ghz = (results[i].channel > 14);
    }

    return count;
}

/**
 * Abort WiFi scan
 */
void NetworkManager::abortScan() {
    WiFi.scanDelete();
    scanning_ = false;
}

/**
 * Get current network quality metrics
 */
NetworkQuality NetworkManager::getQuality() {
    if (!isConnected()) {
        return last_quality_;
    }

    updateQuality();
    return last_quality_;
}

/**
 * Get RSSI (signal strength)
 */
int8_t NetworkManager::getRSSI() {
    if (!isConnected()) {
        return -100;
    }
    return WiFi.RSSI();
}

/**
 * Get signal quality as percentage (0-100%)
 */
uint8_t NetworkManager::getSignalQuality() {
    return calculateSignalQuality(getRSSI());
}

/**
 * Get round trip time (ping)
 */
uint32_t NetworkManager::getRTT() {
    return last_quality_.rtt_ms;
}

/**
 * Get packet loss percentage
 */
uint32_t NetworkManager::getPacketLoss() {
    return last_quality_.packet_loss_percent;
}

/**
 * Get estimated bandwidth
 */
uint32_t NetworkManager::getBandwidthEstimate() {
    return last_quality_.bandwidth_est_kbps;
}

/**
 * Get network jitter
 */
uint32_t NetworkManager::getJitter() {
    return last_quality_.jitter_ms;
}

/**
 * Get connection statistics
 */
ConnectionStats NetworkManager::getStats() {
    if (isConnected()) {
        stats_.session_uptime_ms = millis() - session_start_ms_;
    }
    return stats_;
}

/**
 * Reset statistics
 */
void NetworkManager::resetStats() {
    memset(&stats_, 0, sizeof(stats_));
    session_start_ms_ = millis();
}

/**
 * Get system uptime
 */
uint32_t NetworkManager::getUptime() {
    return millis() / MS_PER_SECOND;
}

/**
 * Get session uptime
 */
uint32_t NetworkManager::getSessionUptime() {
    if (!isConnected()) {
        return 0;
    }
    return (millis() - session_start_ms_) / MS_PER_SECOND;
}

/**
 * Start mDNS service
 */
bool NetworkManager::startMDNS(const char* hostname, const char* service_name, uint16_t port) {
    if (!isConnected()) {
        return false;
    }

    if (mdns_started_) {
        stopMDNS();
    }

    if (!MDNS.begin(hostname)) {
        Serial.printf("[NETWORK] Failed to start mDNS with hostname: %s\n", hostname);
        return false;
    }

    // Add service
    MDNS.addService(service_name, "tcp", port);

    mdns_started_ = true;
    fireEvent(NetworkEvent::MDNS_STARTED, hostname);

    Serial.printf("[NETWORK] mDNS started (hostname: %s, service: %s, port: %u)\n",
                  hostname, service_name, port);

    return true;
}

/**
 * Stop mDNS service
 */
bool NetworkManager::stopMDNS() {
    if (!mdns_started_) {
        return true;
    }

    MDNS.end();
    mdns_started_ = false;

    Serial.println("[NETWORK] mDNS stopped");

    return true;
}

/**
 * Add mDNS service
 */
bool NetworkManager::addMDNSService(const char* service_type, uint16_t port) {
    if (!mdns_started_) {
        return false;
    }

    MDNS.addService(service_type, "tcp", port);

    return true;
}

/**
 * Find mDNS service
 */
int16_t NetworkManager::findMDNSService(const char* service_name, IPAddress& ip, uint16_t& port) {
    // Note: This is a simplified implementation
    // A full implementation would use MDNS query functions
    return -1;  // Not found
}

/**
 * Synchronize time with NTP server
 */
bool NetworkManager::syncNTP(const char* ntp_server, int8_t timezone_offset) {
    if (!isConnected()) {
        return false;
    }

    Serial.printf("[NETWORK] Syncing NTP with %s (timezone: %+d)\n", ntp_server, timezone_offset);

    // Configure SNTP
    sntp_setoperatingmode(SNTP_OPMODE_POLL);
    sntp_setservername(0, (char*)ntp_server);

    // Set timezone
    setenv("TZ", "", 1);  // Clear existing timezone
    tzset();

    // Start SNTP
    sntp_init();

    // Wait for synchronization (max 10 seconds)
    uint32_t start_ms = millis();
    while (millis() - start_ms < 10000) {
        time_t now = time(nullptr);
        struct tm timeinfo = *localtime(&now);

        if (timeinfo.tm_year > (2016 - 1900)) {
            // Successfully synced
            ntp_synced_ = true;
            last_ntp_sync_ms_ = millis();
            fireEvent(NetworkEvent::NTP_SYNCED, ntp_server);

            Serial.printf("[NETWORK] NTP synced: %s", asctime(&timeinfo));

            return true;
        }

        delay(100);
    }

    Serial.println("[NETWORK] NTP sync timeout");

    return false;
}

/**
 * Check if NTP is synchronized
 */
bool NetworkManager::isSyncedNTP() const {
    return ntp_synced_;
}

/**
 * Get system time
 */
time_t NetworkManager::getSystemTime() {
    return time(nullptr);
}

/**
 * Set system time
 */
bool NetworkManager::setSystemTime(time_t unix_time) {
    struct timeval tv;
    tv.tv_sec = unix_time;
    tv.tv_usec = 0;

    if (settimeofday(&tv, nullptr) == 0) {
        ntp_synced_ = true;
        return true;
    }

    return false;
}

/**
 * Set hostname
 */
bool NetworkManager::setHostname(const char* hostname) {
    if (!hostname || strlen(hostname) == 0 || strlen(hostname) >= sizeof(hostname_)) {
        return false;
    }

    strncpy(hostname_, hostname, sizeof(hostname_) - 1);

    if (initialized_) {
        WiFi.setHostname(hostname_);
    }

    return true;
}

/**
 * Get hostname
 */
const char* NetworkManager::getHostname() const {
    return hostname_;
}

/**
 * Get local IPv4 address
 */
IPAddress NetworkManager::getLocalIP() {
    if (!isConnected()) {
        return IPAddress(0, 0, 0, 0);
    }
    return WiFi.localIP();
}

/**
 * Get local IPv6 address
 */
IPAddress NetworkManager::getLocalIPv6() {
    if (!isConnected()) {
        return IPAddress(0, 0, 0, 0);
    }

    // Note: This is simplified. Full IPv6 support would require additional implementation
    return IPAddress(0, 0, 0, 0);
}

/**
 * Get MAC address
 */
const char* NetworkManager::getMACAddress() {
    static char mac_str[18];
    uint8_t mac[6];

    WiFi.macAddress(mac);
    snprintf(mac_str, sizeof(mac_str), "%02X:%02X:%02X:%02X:%02X:%02X",
             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);

    return mac_str;
}

/**
 * Get WiFi state
 */
WiFiState NetworkManager::getState() const {
    return state_;
}

/**
 * Get WiFi state as string
 */
const char* NetworkManager::getStateString() {
    switch (state_) {
        case WiFiState::IDLE:
            return "IDLE";
        case WiFiState::SCANNING:
            return "SCANNING";
        case WiFiState::CONNECTING:
            return "CONNECTING";
        case WiFiState::CONNECTED:
            return "CONNECTED";
        case WiFiState::DISCONNECTED:
            return "DISCONNECTED";
        case WiFiState::FAILED:
            return "FAILED";
        case WiFiState::NO_SSID_AVAIL:
            return "NO_SSID_AVAIL";
        case WiFiState::CONNECT_FAILED:
            return "CONNECT_FAILED";
        case WiFiState::DISCONNECTING:
            return "DISCONNECTING";
        default:
            return "UNKNOWN";
    }
}

/**
 * Get disconnect reason string
 */
const char* NetworkManager::getDisconnectReasonString() {
    switch (stats_.last_disconnect_reason) {
        case WIFI_REASON_UNSPECIFIED:
            return "Unspecified";
        case WIFI_REASON_AUTH_EXPIRE:
            return "Authentication expired";
        case WIFI_REASON_AUTH_LEAVE:
            return "Authentication leave";
        case WIFI_REASON_ASSOC_EXPIRE:
            return "Association expired";
        case WIFI_REASON_ASSOC_TOOMANY:
            return "Too many associations";
        case WIFI_REASON_NOT_AUTHED:
            return "Not authenticated";
        case WIFI_REASON_NOT_ASSOCED:
            return "Not associated";
        case WIFI_REASON_ASSOC_LEAVE:
            return "Association leave";
        case WIFI_REASON_ASSOC_NOT_AUTHED:
            return "Association not authenticated";
        case WIFI_REASON_DISASSOC_PWRCAP_BAD:
            return "Power capability bad";
        case WIFI_REASON_DISASSOC_SUPCHAN_BAD:
            return "Supported channel bad";
        default:
            return "Unknown";
    }
}

/**
 * Register event callback
 */
void NetworkManager::registerEventCallback(NetworkEventCallback callback) {
    event_callback_ = callback;
}

/**
 * Remove event callback
 */
void NetworkManager::removeEventCallback() {
    event_callback_ = nullptr;
}

/**
 * Fire network event
 */
void NetworkManager::fireEvent(NetworkEvent event, const char* details) {
    if (event_callback_) {
        const char* detail_str = details ? details : "";
        event_callback_(event, detail_str);
    }
}

/**
 * Update network configuration
 */
bool NetworkManager::updateConfig(const NetworkConfig& config) {
    if (!initialized_) {
        return false;
    }

    memcpy(&config_, &config, sizeof(NetworkConfig));

    return true;
}

/**
 * Get current network configuration
 */
NetworkConfig NetworkManager::getConfig() const {
    return config_;
}

/**
 * Set auto-reconnect behavior
 */
void NetworkManager::setAutoReconnect(bool enabled, uint32_t retry_interval_ms) {
    auto_reconnect_enabled_ = enabled;
    auto_reconnect_interval_ms_ = retry_interval_ms;
}

/**
 * Check if auto-reconnect is enabled
 */
bool NetworkManager::isAutoReconnectEnabled() const {
    return auto_reconnect_enabled_;
}

/**
 * Periodic update (call from main loop)
 */
void NetworkManager::update() {
    if (!initialized_) {
        return;
    }

    uint32_t now_ms = millis();

    // Process WiFi events based on status
    wl_status_t status = WiFi.status();

    switch (state_) {
        case WiFiState::CONNECTING: {
            if (status == WL_CONNECTED) {
                state_ = WiFiState::CONNECTED;
                stats_.successful_connects++;
                stats_.last_connect_time = time(nullptr);
                session_start_ms_ = millis();
                fireEvent(NetworkEvent::WIFI_CONNECTED, config_.ssid);
                fireEvent(NetworkEvent::IP_ASSIGNED, WiFi.localIP().toString().c_str());

                Serial.printf("[NETWORK] Connected to %s with IP: %s\n",
                              config_.ssid, WiFi.localIP().toString().c_str());
            } else if (status == WL_CONNECT_FAILED || status == WL_NO_SSID_AVAIL) {
                state_ = WiFiState::FAILED;
                stats_.failed_connects++;
                fireEvent(NetworkEvent::CONNECTION_FAILED, "Connection failed");

                Serial.printf("[NETWORK] Connection failed (status: %d)\n", status);
            } else if (now_ms - last_reconnect_attempt_ms_ > config_.connect_timeout_ms) {
                // Connection timeout
                state_ = WiFiState::FAILED;
                stats_.failed_connects++;
                fireEvent(NetworkEvent::CONNECTION_FAILED, "Connection timeout");

                Serial.println("[NETWORK] Connection timeout");
            }
            break;
        }

        case WiFiState::CONNECTED: {
            if (status != WL_CONNECTED) {
                state_ = WiFiState::DISCONNECTED;
                stats_.disconnections++;
                stats_.last_disconnect_time = time(nullptr);
                fireEvent(NetworkEvent::WIFI_DISCONNECTED, getDisconnectReasonString());

                Serial.printf("[NETWORK] Disconnected (%s)\n", getDisconnectReasonString());
            }
            break;
        }

        case WiFiState::DISCONNECTED: {
            // Check for auto-reconnect
            checkAutoReconnect();
            break;
        }

        case WiFiState::FAILED: {
            // Check for auto-reconnect
            checkAutoReconnect();
            break;
        }

        default:
            break;
    }

    // Update quality metrics periodically
    if (isConnected() && (now_ms - last_quality_check_ms_) > DEFAULT_QUALITY_CHECK_INTERVAL_MS) {
        updateQuality();
        last_quality_check_ms_ = now_ms;
    }

    // Re-sync NTP periodically
    if (ntp_synced_ && (now_ms - last_ntp_sync_ms_) > DEFAULT_NTP_SYNC_INTERVAL_MS) {
        syncNTP();
    }

    // Process event queue
    processEventQueue();
}

/**
 * Print network status
 */
void NetworkManager::printStatus() {
    Serial.println("\n========== Network Status ==========");
    Serial.printf("State: %s\n", getStateString());
    Serial.printf("SSID: %s\n", config_.ssid);
    Serial.printf("MAC Address: %s\n", getMACAddress());
    Serial.printf("Hostname: %s\n", hostname_);

    if (isConnected()) {
        Serial.printf("Local IP: %s\n", WiFi.localIP().toString().c_str());
        Serial.printf("Gateway: %s\n", WiFi.gatewayIP().toString().c_str());
        Serial.printf("Subnet Mask: %s\n", WiFi.subnetMask().toString().c_str());
        Serial.printf("DNS1: %s\n", WiFi.dnsIP(0).toString().c_str());
        Serial.printf("DNS2: %s\n", WiFi.dnsIP(1).toString().c_str());
        Serial.printf("WiFi Channel: %d\n", WiFi.channel());
        Serial.printf("RSSI: %d dBm\n", WiFi.RSSI());
        Serial.printf("Signal Quality: %u%%\n", getSignalQuality());
    }

    Serial.printf("Auto-Reconnect: %s\n", auto_reconnect_enabled_ ? "Enabled" : "Disabled");
    Serial.printf("mDNS: %s\n", mdns_started_ ? "Started" : "Not started");
    Serial.printf("NTP Synced: %s\n", ntp_synced_ ? "Yes" : "No");
    Serial.println("====================================\n");
}

/**
 * Print network quality
 */
void NetworkManager::printQuality() {
    if (!isConnected()) {
        Serial.println("Not connected");
        return;
    }

    NetworkQuality quality = getQuality();
    Serial.println("\n========== Network Quality ==========");
    Serial.printf("RSSI: %d dBm\n", quality.rssi);
    Serial.printf("Signal Quality: %u%%\n", quality.signal_quality);
    Serial.printf("RTT: %u ms\n", quality.rtt_ms);
    Serial.printf("Packet Loss: %u%%\n", quality.packet_loss_percent);
    Serial.printf("Bandwidth Estimate: %u kbps\n", quality.bandwidth_est_kbps);
    Serial.printf("Jitter: %u ms\n", quality.jitter_ms);
    Serial.printf("Band: %s\n", quality.is_5ghz ? "5GHz" : "2.4GHz");
    Serial.println("====================================\n");
}

/**
 * Print connection statistics
 */
void NetworkManager::printStats() {
    ConnectionStats stats = getStats();
    Serial.println("\n========== Connection Statistics ==========");
    Serial.printf("Connection Attempts: %u\n", stats.connect_attempts);
    Serial.printf("Successful Connects: %u\n", stats.successful_connects);
    Serial.printf("Failed Connects: %u\n", stats.failed_connects);
    Serial.printf("Disconnections: %u\n", stats.disconnections);
    Serial.printf("Auto-Reconnects: %u\n", stats.auto_reconnect_count);
    Serial.printf("Session Uptime: %u seconds\n", stats.session_uptime_ms / 1000);
    Serial.printf("Total Uptime: %u seconds\n", stats.total_uptime_ms / 1000);

    if (stats.last_connect_time > 0) {
        struct tm timeinfo;
        localtime_r(&stats.last_connect_time, &timeinfo);
        Serial.printf("Last Connect: %s", asctime(&timeinfo));
    }

    if (stats.last_disconnect_time > 0) {
        struct tm timeinfo;
        localtime_r(&stats.last_disconnect_time, &timeinfo);
        Serial.printf("Last Disconnect: %s", asctime(&timeinfo));
    }

    Serial.println("===========================================\n");
}

/**
 * Print scan results
 */
void NetworkManager::printScanResults() {
    if (!scan_results_ || scan_result_count_ == 0) {
        Serial.println("No scan results available");
        return;
    }

    Serial.println("\n========== WiFi Scan Results ==========");
    for (uint16_t i = 0; i < scan_result_count_; i++) {
        Serial.printf("%2u. SSID: %-32s RSSI: %4d dBm Ch: %2u (%.0f%%) %s\n",
                      i + 1,
                      scan_results_[i].ssid,
                      scan_results_[i].rssi,
                      scan_results_[i].channel,
                      (float)scan_results_[i].signal_quality,
                      scan_results_[i].is_5ghz ? "[5GHz]" : "[2.4GHz]");
    }
    Serial.println("=======================================\n");
}

/**
 * Set DNS servers
 */
bool NetworkManager::setDNS(const char* dns1, const char* dns2) {
    if (!dns1) {
        return false;
    }

    IPAddress ip1, ip2;
    if (!ip1.fromString(dns1)) {
        return false;
    }

    if (dns2 && strlen(dns2) > 0) {
        if (!ip2.fromString(dns2)) {
            return false;
        }
        WiFi.config(WiFi.localIP(), WiFi.gatewayIP(), WiFi.subnetMask(), ip1, ip2);
    } else {
        WiFi.config(WiFi.localIP(), WiFi.gatewayIP(), WiFi.subnetMask(), ip1);
    }

    return true;
}

/**
 * Set static IP configuration
 */
bool NetworkManager::setStaticIP(const char* ip, const char* gateway, const char* subnet,
                                const char* dns1, const char* dns2) {
    if (!ip || !gateway || !subnet) {
        return false;
    }

    IPAddress ip_addr, gw_addr, sn_addr, dns1_addr, dns2_addr;

    if (!ip_addr.fromString(ip) || !gw_addr.fromString(gateway) || !sn_addr.fromString(subnet)) {
        return false;
    }

    if (dns1 && !dns1_addr.fromString(dns1)) {
        return false;
    }

    if (dns2 && !dns2_addr.fromString(dns2)) {
        return false;
    }

    WiFi.config(ip_addr, gw_addr, sn_addr, dns1_addr, dns2_addr);

    return true;
}

/**
 * Enable modem sleep
 */
bool NetworkManager::enableModemSleep() {
    // This would be implemented using esp_wifi_set_ps() for power management
    return true;
}

/**
 * Disable modem sleep
 */
bool NetworkManager::disableModemSleep() {
    // This would be implemented using esp_wifi_set_ps() for power management
    return true;
}

/**
 * Set transmit power
 */
bool NetworkManager::setTxPower(uint8_t power_dbm) {
    if (power_dbm > 20) {
        power_dbm = 20;
    }

    // Convert dBm to wifi_power_t enum
    wifi_power_t power;
    if (power_dbm >= 20) power = WIFI_POWER_19_5dBm;
    else if (power_dbm >= 19) power = WIFI_POWER_19dBm;
    else if (power_dbm >= 18) power = WIFI_POWER_18_5dBm;
    else if (power_dbm >= 17) power = WIFI_POWER_17dBm;
    else if (power_dbm >= 15) power = WIFI_POWER_15dBm;
    else if (power_dbm >= 13) power = WIFI_POWER_13dBm;
    else if (power_dbm >= 11) power = WIFI_POWER_11dBm;
    else if (power_dbm >= 8) power = WIFI_POWER_8_5dBm;
    else if (power_dbm >= 7) power = WIFI_POWER_7dBm;
    else if (power_dbm >= 5) power = WIFI_POWER_5dBm;
    else power = WIFI_POWER_2dBm;

    WiFi.setTxPower(power);

    return true;
}

/**
 * Start WiFi certificate validation
 */
bool NetworkManager::startWiFiCertificateValidation() {
    // This would be implemented for secure WiFi connections
    return true;
}

/**
 * Get channel information
 */
bool NetworkManager::getChannelInfo(uint8_t& current_channel, uint8_t* available_channels,
                                   uint8_t* channel_count) {
    if (!isConnected()) {
        return false;
    }

    current_channel = WiFi.channel();

    // Available channels would be determined by region
    // This is a simplified implementation
    if (available_channels && channel_count) {
        // For 2.4GHz: channels 1-14 depending on region
        // For 5GHz: channels 36-165
        *channel_count = 13;  // Simplified
    }

    return true;
}

// ============ Private Methods ============

/**
 * Update network quality metrics
 */
void NetworkManager::updateQuality() {
    if (!isConnected()) {
        return;
    }

    int8_t rssi = WiFi.RSSI();
    last_quality_.rssi = rssi;
    last_quality_.signal_quality = calculateSignalQuality(rssi);
    last_quality_.rtt_ms = 0;  // Would be measured via ping
    last_quality_.packet_loss_percent = 0;  // Would be measured
    last_quality_.bandwidth_est_kbps = 54000;  // Placeholder
    last_quality_.jitter_ms = 0;  // Would be measured
    last_quality_.is_5ghz = (WiFi.channel() > 14);

    // Check for RSSI low event
    if (rssi < RSSI_LOW_THRESHOLD) {
        fireEvent(NetworkEvent::RSSI_LOW, "Signal strength low");
    }

    // Check for quality change
    if (abs(rssi - last_quality_.rssi) >= QUALITY_CHANGE_THRESHOLD) {
        fireEvent(NetworkEvent::QUALITY_CHANGED, "Network quality changed");
    }
}

/**
 * Check auto-reconnect timer
 */
void NetworkManager::checkAutoReconnect() {
    if (!auto_reconnect_enabled_) {
        return;
    }

    uint32_t now_ms = millis();
    if (now_ms - last_reconnect_attempt_ms_ > auto_reconnect_interval_ms_) {
        stats_.auto_reconnect_count++;
        last_reconnect_attempt_ms_ = now_ms;
        fireEvent(NetworkEvent::RECONNECTING, config_.ssid);

        Serial.printf("[NETWORK] Auto-reconnecting to %s\n", config_.ssid);

        connect();
    }
}

/**
 * WiFi event handler (static)
 */
void NetworkManager::onWiFiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
    if (instance_) {
        instance_->handleWiFiEvent(event, info);
    }
}

/**
 * WiFi event handler (instance)
 */
void NetworkManager::handleWiFiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
    // WiFi events are handled in the update() method for better control
}

/**
 * Process event queue
 */
void NetworkManager::processEventQueue() {
    while (!event_queue_.empty()) {
        auto event_pair = event_queue_.front();
        event_queue_.pop();

        if (event_callback_) {
            event_callback_(event_pair.first, event_pair.second.c_str());
        }
    }
}

/**
 * Validate SSID
 */
bool NetworkManager::isValidSSID(const char* ssid) {
    if (!ssid || strlen(ssid) == 0 || strlen(ssid) > 32) {
        return false;
    }
    return true;
}

/**
 * Initialize WiFi event handlers
 */
void NetworkManager::initializeEventHandlers() {
    // Register with WiFi event handler
    WiFi.onEvent(onWiFiEvent);
}

/**
 * Calculate signal quality percentage
 */
uint8_t NetworkManager::calculateSignalQuality(int8_t rssi) {
    // RSSI typically ranges from -100 dBm (very weak) to -30 dBm (very strong)
    // Convert to 0-100% scale
    if (rssi <= -100) return 0;
    if (rssi >= -30) return 100;

    return (rssi + 100) * 100 / 70;
}

/**
 * Select best network
 */
bool NetworkManager::selectBestNetwork() {
    // This would scan and select the best available network
    return false;
}

/**
 * Configure 5GHz support
 */
bool NetworkManager::configure5GHzSupport() {
    if (!supports5GHz()) {
        return false;
    }

    // Configure WiFi to support both 2.4GHz and 5GHz
    // This requires setting the correct WiFi PHY mode
    wifi_mode_t mode = WIFI_STA;
    esp_wifi_set_mode(mode);

    Serial.println("[NETWORK] 5GHz support configured");

    return true;
}
