/*
 * ESP32 RoIP - Network Manager
 * Professional WiFi, mDNS, NTP, and connection management
 * Supports 2.4GHz and 5GHz bands (C5/C6/H2)
 */

#ifndef ROIP_NETWORK_MANAGER_H
#define ROIP_NETWORK_MANAGER_H

#include <Arduino.h>
#include <WiFi.h>
#include <mdns.h>
#include <time.h>
#include <functional>
#include <queue>

// WiFi band enumeration
enum class WiFiBand : uint8_t {
    BAND_2_4GHZ = 0,
    BAND_5GHZ = 1,
    BAND_AUTO = 2  // Auto-select based on availability
};

// WiFi state enumeration
enum class WiFiState : uint8_t {
    IDLE = 0,
    SCANNING = 1,
    CONNECTING = 2,
    CONNECTED = 3,
    DISCONNECTED = 4,
    FAILED = 5,
    NO_SSID_AVAIL = 6,
    CONNECT_FAILED = 7,
    DISCONNECTING = 8
};

// Quality metrics
struct NetworkQuality {
    int8_t rssi;                      // Signal strength (dBm)
    uint8_t signal_quality;           // 0-100%
    uint32_t rtt_ms;                  // Round trip time
    uint32_t packet_loss_percent;     // 0-100%
    uint32_t bandwidth_est_kbps;      // Estimated bandwidth
    uint32_t jitter_ms;               // Jitter in milliseconds
    bool is_5ghz;                     // Current band
};

// Connection statistics
struct ConnectionStats {
    uint32_t connect_attempts;
    uint32_t successful_connects;
    uint32_t failed_connects;
    uint32_t disconnections;
    uint32_t auto_reconnect_count;
    uint64_t total_uptime_ms;
    uint64_t session_uptime_ms;
    uint32_t last_disconnect_reason;
    time_t last_connect_time;
    time_t last_disconnect_time;
};

// Network event enumeration
enum class NetworkEvent : uint8_t {
    WIFI_CONNECTED = 0,
    WIFI_DISCONNECTED = 1,
    WIFI_SCANNING = 2,
    WIFI_SCAN_COMPLETE = 3,
    QUALITY_CHANGED = 4,
    CONNECTION_FAILED = 5,
    MDNS_STARTED = 6,
    NTP_SYNCED = 7,
    RSSI_LOW = 8,
    RECONNECTING = 9,
    BAND_SWITCHED = 10,
    IP_ASSIGNED = 11,
    DHCP_TIMEOUT = 12
};

// Event callback type
using NetworkEventCallback = std::function<void(NetworkEvent event, const char* details)>;

// WiFi scan result
struct WiFiScanResult {
    char ssid[32];
    int8_t rssi;
    uint8_t channel;
    bool is_5ghz;
    uint8_t security;
    uint8_t signal_quality;
};

// Network configuration for connection
struct NetworkConfig {
    char ssid[32];
    char password[64];
    char hostname[32];
    WiFiBand preferred_band;
    uint16_t connect_timeout_ms;
    bool ipv6_enabled;
    char static_ip[16];           // Empty for DHCP
    char static_gateway[16];
    char static_subnet[16];
    char static_dns1[16];
    char static_dns2[16];
};

class NetworkManager {
public:
    NetworkManager();
    ~NetworkManager();

    // Initialization
    bool begin(const NetworkConfig& config);
    bool end();

    // WiFi connection management
    bool connect();
    bool disconnect();
    bool reconnect();
    bool isConnected();

    // WiFi band selection (for C5/C6/H2)
    bool setBand(WiFiBand band);
    WiFiBand getBand() const;
    bool supports5GHz() const;

    // WiFi scanning
    bool startScan();
    bool isScanning() const;
    uint16_t getScanResults(WiFiScanResult* results, uint16_t max_results);
    void abortScan();

    // Network quality monitoring
    NetworkQuality getQuality();
    int8_t getRSSI();
    uint8_t getSignalQuality();  // 0-100%
    uint32_t getRTT();
    uint32_t getPacketLoss();
    uint32_t getBandwidthEstimate();
    uint32_t getJitter();

    // Connection statistics
    ConnectionStats getStats();
    void resetStats();
    uint32_t getUptime();
    uint32_t getSessionUptime();

    // mDNS service discovery
    bool startMDNS(const char* hostname, const char* service_name, uint16_t port);
    bool stopMDNS();
    bool addMDNSService(const char* service_type, uint16_t port);
    int16_t findMDNSService(const char* service_name, IPAddress& ip, uint16_t& port);

    // NTP time synchronization
    bool syncNTP(const char* ntp_server = "pool.ntp.org", int8_t timezone_offset = 0);
    bool isSyncedNTP() const;
    time_t getSystemTime();
    bool setSystemTime(time_t unix_time);

    // Hostname management
    bool setHostname(const char* hostname);
    const char* getHostname() const;
    IPAddress getLocalIP();
    IPAddress getLocalIPv6();
    const char* getMACAddress();

    // Network state machine
    WiFiState getState() const;
    const char* getStateString();
    const char* getDisconnectReasonString();

    // Event system
    void registerEventCallback(NetworkEventCallback callback);
    void removeEventCallback();
    void fireEvent(NetworkEvent event, const char* details = "");

    // Configuration management
    bool updateConfig(const NetworkConfig& config);
    NetworkConfig getConfig() const;

    // Auto-reconnect management
    void setAutoReconnect(bool enabled, uint32_t retry_interval_ms = 5000);
    bool isAutoReconnectEnabled() const;

    // Periodic update (call from main loop)
    void update();

    // Network diagnostics
    void printStatus();
    void printQuality();
    void printStats();
    void printScanResults();

    // DNS management
    bool setDNS(const char* dns1, const char* dns2 = nullptr);
    bool setStaticIP(const char* ip, const char* gateway, const char* subnet,
                     const char* dns1 = nullptr, const char* dns2 = nullptr);

    // Power management
    bool enableModemSleep();
    bool disableModemSleep();
    bool setTxPower(uint8_t power_dbm);  // 0-20 dBm

    // Advanced features
    bool startWiFiCertificateValidation();
    bool getChannelInfo(uint8_t& current_channel, uint8_t* available_channels = nullptr,
                        uint8_t* channel_count = nullptr);

private:
    NetworkConfig config_;
    WiFiState state_;
    WiFiBand current_band_;
    ConnectionStats stats_;
    NetworkQuality last_quality_;
    NetworkEventCallback event_callback_;

    // Timing
    uint32_t last_quality_check_ms_;
    uint32_t last_reconnect_attempt_ms_;
    uint32_t last_ntp_sync_ms_;
    uint32_t session_start_ms_;

    // Flags
    bool initialized_;
    bool auto_reconnect_enabled_;
    uint32_t auto_reconnect_interval_ms_;
    bool scanning_;
    bool ntp_synced_;
    bool mdns_started_;
    char hostname_[32];

    // WiFi scan cache
    WiFiScanResult* scan_results_;
    uint16_t scan_result_count_;

    // Event queue for async processing
    std::queue<std::pair<NetworkEvent, String>> event_queue_;

    // Private methods
    void updateQuality();
    void checkAutoReconnect();
    void handleWiFiEvent(WiFiEvent_t event, WiFiEventInfo_t info);
    void processEventQueue();
    bool isValidSSID(const char* ssid);
    void initializeEventHandlers();
    uint8_t calculateSignalQuality(int8_t rssi);
    bool selectBestNetwork();
    bool configure5GHzSupport();

    // Static event handler
    static void onWiFiEvent(WiFiEvent_t event, WiFiEventInfo_t info);
    static NetworkManager* instance_;
};

#endif // ROIP_NETWORK_MANAGER_H
