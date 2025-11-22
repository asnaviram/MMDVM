/*
 * ESP32 RoIP - Configuration Management Implementation
 * Professional Radio over IP system
 *
 * Features:
 * - NVS (Non-Volatile Storage) persistence
 * - JSON import/export with ArduinoJson
 * - Factory reset capability
 * - Configuration validation
 * - Default values and migration
 * - Device ID generation from MAC address
 * - Quality presets for different use cases
 */

#include <Arduino.h>
#include <Preferences.h>
#include <WiFi.h>
#include <ArduinoJson.h>
#include "../include/config.h"
#include <cstring>

// Forward declare Serial for logging
extern HardwareSerial Serial;

// Enable debug logging
#define CONFIG_DEBUG 1

#if CONFIG_DEBUG
#define LOG_CONFIG(fmt, ...) do { if (Serial) { Serial.printf("[CONFIG] " fmt "\n", ##__VA_ARGS__); } } while(0)
#else
#define LOG_CONFIG(fmt, ...) do {} while(0)
#endif

// JSON document size for ArduinoJson
#define JSON_BUFFER_SIZE 4096

// Helper function to create default configuration
static RoIPConfig createDefaultConfig() {
    RoIPConfig cfg;
    memset(&cfg, 0, sizeof(cfg));

    // Device identity
    strlcpy(cfg.device_name, "RoIP-Device", sizeof(cfg.device_name));

    // Network settings
    strlcpy(cfg.wifi_hostname, "roip-device", sizeof(cfg.wifi_hostname));
    cfg.wifi_5ghz_enabled = true;

    // SIP server settings
    strlcpy(cfg.sip_server, "192.168.1.100", sizeof(cfg.sip_server));
    cfg.sip_port = SIP_PORT;
    strlcpy(cfg.sip_username, "user", sizeof(cfg.sip_username));
    strlcpy(cfg.sip_password, "password", sizeof(cfg.sip_password));
    strlcpy(cfg.sip_realm, "roip.local", sizeof(cfg.sip_realm));

    // STUN/TURN settings
    strlcpy(cfg.stun_server, "stun.l.google.com", sizeof(cfg.stun_server));
    cfg.stun_port = 3478;
    strlcpy(cfg.turn_server, "turn.example.com", sizeof(cfg.turn_server));
    cfg.turn_port = 3478;

    // Audio settings
    cfg.sample_rate = AUDIO_SAMPLE_RATE;
    cfg.frame_size_ms = AUDIO_FRAME_SIZE_MS;
    cfg.opus_bitrate = OPUS_BITRATE;
    cfg.opus_complexity = OPUS_COMPLEXITY;

    // DSP settings
    cfg.agc_enabled = true;
    cfg.agc_target_db = AGC_TARGET_LEVEL_DB;
    cfg.noise_suppression_enabled = true;
    cfg.vad_enabled = true;
    cfg.aec_enabled = false;

    // PTT/COS settings
    cfg.ptt_active_high = true;
    cfg.cos_active_high = false;
    cfg.ptt_tail_ms = PTT_TAIL_DELAY_MS;
    cfg.cos_debounce_ms = COS_DEBOUNCE_MS;
    cfg.vox_enabled = false;
    cfg.vox_threshold_db = VOX_THRESHOLD_DB;
    cfg.vox_hangtime_ms = VOX_HANGTIME_MS;

    // Quality settings
    cfg.audio_quality_preset = 1;  // Medium quality
    cfg.fec_enabled = true;
    cfg.dtx_enabled = true;

    // System settings
    cfg.log_level = 2;  // INFO level
    cfg.web_ui_enabled = true;
    cfg.web_ui_port = 80;
    strlcpy(cfg.admin_password, "admin123", sizeof(cfg.admin_password));

    // Runtime flags
    cfg.config_version = CONFIG_VERSION;
    cfg.uptime_seconds = 0;

    return cfg;
}

// Static default configuration instance
static const RoIPConfig DEFAULT_CONFIG = createDefaultConfig();

/**
 * Constructor - Initialize configuration manager
 */
ConfigManager::ConfigManager() {
    memset(&config, 0, sizeof(config));
}

/**
 * Destructor - Cleanup
 */
ConfigManager::~ConfigManager() {
    // NVS is automatically closed when Preferences object goes out of scope
}

/**
 * Initialize NVS namespace
 */
bool ConfigManager::begin() {
    LOG_CONFIG("Initializing ConfigManager");

    bool result = prefs.begin(CONFIG_NAMESPACE, false);
    if (!result) {
        LOG_CONFIG("ERROR: Failed to open NVS namespace");
        return false;
    }

    LOG_CONFIG("NVS namespace opened successfully");
    return true;
}

/**
 * Load configuration from NVS
 */
bool ConfigManager::load() {
    LOG_CONFIG("Loading configuration from NVS");

    // Check if configuration exists
    uint32_t stored_version = prefs.getUInt("version", 0);

    if (stored_version == 0) {
        LOG_CONFIG("No configuration found, using defaults");
        setDefaults();
        return true;
    }

    // Check version and perform migration if needed
    if (stored_version != CONFIG_VERSION) {
        LOG_CONFIG("Configuration version mismatch: found %d, expected %d",
                   stored_version, CONFIG_VERSION);
        // Perform migration if needed
        setDefaults();
    }

    // Load device identity
    size_t name_len = prefs.getString("device_name", config.device_name, sizeof(config.device_name));
    if (name_len == 0) {
        strcpy(config.device_name, DEFAULT_CONFIG.device_name);
    }

    size_t id_len = prefs.getString("device_id", config.device_id, sizeof(config.device_id));
    if (id_len == 0) {
        generateDeviceId();
    }

    // Load network settings
    prefs.getString("wifi_ssid", config.wifi_ssid, sizeof(config.wifi_ssid));
    prefs.getString("wifi_password", config.wifi_password, sizeof(config.wifi_password));
    prefs.getString("wifi_hostname", config.wifi_hostname, sizeof(config.wifi_hostname));
    config.wifi_5ghz_enabled = prefs.getBool("wifi_5ghz", DEFAULT_CONFIG.wifi_5ghz_enabled);

    // Load SIP settings
    prefs.getString("sip_server", config.sip_server, sizeof(config.sip_server));
    config.sip_port = prefs.getUShort("sip_port", DEFAULT_CONFIG.sip_port);
    prefs.getString("sip_username", config.sip_username, sizeof(config.sip_username));
    prefs.getString("sip_password", config.sip_password, sizeof(config.sip_password));
    prefs.getString("sip_realm", config.sip_realm, sizeof(config.sip_realm));

    // Load STUN/TURN settings
    prefs.getString("stun_server", config.stun_server, sizeof(config.stun_server));
    config.stun_port = prefs.getUShort("stun_port", DEFAULT_CONFIG.stun_port);
    prefs.getString("turn_server", config.turn_server, sizeof(config.turn_server));
    config.turn_port = prefs.getUShort("turn_port", DEFAULT_CONFIG.turn_port);
    prefs.getString("turn_username", config.turn_username, sizeof(config.turn_username));
    prefs.getString("turn_password", config.turn_password, sizeof(config.turn_password));

    // Load audio settings
    config.sample_rate = prefs.getUInt("sample_rate", DEFAULT_CONFIG.sample_rate);
    config.frame_size_ms = prefs.getUShort("frame_size_ms", DEFAULT_CONFIG.frame_size_ms);
    config.opus_bitrate = prefs.getUInt("opus_bitrate", DEFAULT_CONFIG.opus_bitrate);
    config.opus_complexity = prefs.getUChar("opus_complexity", DEFAULT_CONFIG.opus_complexity);

    // Load DSP settings
    config.agc_enabled = prefs.getBool("agc_enabled", DEFAULT_CONFIG.agc_enabled);
    config.agc_target_db = prefs.getFloat("agc_target_db", DEFAULT_CONFIG.agc_target_db);
    config.noise_suppression_enabled = prefs.getBool("noise_suppress", DEFAULT_CONFIG.noise_suppression_enabled);
    config.vad_enabled = prefs.getBool("vad_enabled", DEFAULT_CONFIG.vad_enabled);
    config.aec_enabled = prefs.getBool("aec_enabled", DEFAULT_CONFIG.aec_enabled);

    // Load PTT/COS settings
    config.ptt_active_high = prefs.getBool("ptt_active_high", DEFAULT_CONFIG.ptt_active_high);
    config.cos_active_high = prefs.getBool("cos_active_high", DEFAULT_CONFIG.cos_active_high);
    config.ptt_tail_ms = prefs.getUShort("ptt_tail_ms", DEFAULT_CONFIG.ptt_tail_ms);
    config.cos_debounce_ms = prefs.getUShort("cos_debounce_ms", DEFAULT_CONFIG.cos_debounce_ms);
    config.vox_enabled = prefs.getBool("vox_enabled", DEFAULT_CONFIG.vox_enabled);
    config.vox_threshold_db = prefs.getFloat("vox_threshold_db", DEFAULT_CONFIG.vox_threshold_db);
    config.vox_hangtime_ms = prefs.getUShort("vox_hangtime_ms", DEFAULT_CONFIG.vox_hangtime_ms);

    // Load quality settings
    config.audio_quality_preset = prefs.getUChar("audio_preset", DEFAULT_CONFIG.audio_quality_preset);
    config.fec_enabled = prefs.getBool("fec_enabled", DEFAULT_CONFIG.fec_enabled);
    config.dtx_enabled = prefs.getBool("dtx_enabled", DEFAULT_CONFIG.dtx_enabled);

    // Load system settings
    config.log_level = prefs.getUChar("log_level", DEFAULT_CONFIG.log_level);
    config.web_ui_enabled = prefs.getBool("web_ui_enabled", DEFAULT_CONFIG.web_ui_enabled);
    config.web_ui_port = prefs.getUShort("web_ui_port", DEFAULT_CONFIG.web_ui_port);
    prefs.getString("admin_password", config.admin_password, sizeof(config.admin_password));

    // Load runtime flags
    config.config_version = prefs.getUInt("version", CONFIG_VERSION);
    config.uptime_seconds = prefs.getUInt("uptime", 0);

    LOG_CONFIG("Configuration loaded successfully");
    return true;
}

/**
 * Save configuration to NVS
 */
bool ConfigManager::save() {
    LOG_CONFIG("Saving configuration to NVS");

    // Validate configuration before saving
    if (!validateConfiguration()) {
        LOG_CONFIG("ERROR: Configuration validation failed");
        return false;
    }

    // Save device identity
    prefs.putString("device_name", config.device_name);
    prefs.putString("device_id", config.device_id);

    // Save network settings
    prefs.putString("wifi_ssid", config.wifi_ssid);
    prefs.putString("wifi_password", config.wifi_password);
    prefs.putString("wifi_hostname", config.wifi_hostname);
    prefs.putBool("wifi_5ghz", config.wifi_5ghz_enabled);

    // Save SIP settings
    prefs.putString("sip_server", config.sip_server);
    prefs.putUShort("sip_port", config.sip_port);
    prefs.putString("sip_username", config.sip_username);
    prefs.putString("sip_password", config.sip_password);
    prefs.putString("sip_realm", config.sip_realm);

    // Save STUN/TURN settings
    prefs.putString("stun_server", config.stun_server);
    prefs.putUShort("stun_port", config.stun_port);
    prefs.putString("turn_server", config.turn_server);
    prefs.putUShort("turn_port", config.turn_port);
    prefs.putString("turn_username", config.turn_username);
    prefs.putString("turn_password", config.turn_password);

    // Save audio settings
    prefs.putUInt("sample_rate", config.sample_rate);
    prefs.putUShort("frame_size_ms", config.frame_size_ms);
    prefs.putUInt("opus_bitrate", config.opus_bitrate);
    prefs.putUChar("opus_complexity", config.opus_complexity);

    // Save DSP settings
    prefs.putBool("agc_enabled", config.agc_enabled);
    prefs.putFloat("agc_target_db", config.agc_target_db);
    prefs.putBool("noise_suppress", config.noise_suppression_enabled);
    prefs.putBool("vad_enabled", config.vad_enabled);
    prefs.putBool("aec_enabled", config.aec_enabled);

    // Save PTT/COS settings
    prefs.putBool("ptt_active_high", config.ptt_active_high);
    prefs.putBool("cos_active_high", config.cos_active_high);
    prefs.putUShort("ptt_tail_ms", config.ptt_tail_ms);
    prefs.putUShort("cos_debounce_ms", config.cos_debounce_ms);
    prefs.putBool("vox_enabled", config.vox_enabled);
    prefs.putFloat("vox_threshold_db", config.vox_threshold_db);
    prefs.putUShort("vox_hangtime_ms", config.vox_hangtime_ms);

    // Save quality settings
    prefs.putUChar("audio_preset", config.audio_quality_preset);
    prefs.putBool("fec_enabled", config.fec_enabled);
    prefs.putBool("dtx_enabled", config.dtx_enabled);

    // Save system settings
    prefs.putUChar("log_level", config.log_level);
    prefs.putBool("web_ui_enabled", config.web_ui_enabled);
    prefs.putUShort("web_ui_port", config.web_ui_port);
    prefs.putString("admin_password", config.admin_password);

    // Save version for migration tracking
    prefs.putUInt("version", CONFIG_VERSION);
    prefs.putUInt("uptime", config.uptime_seconds);

    LOG_CONFIG("Configuration saved successfully");
    return true;
}

/**
 * Factory reset - Clear all NVS data and restore defaults
 */
void ConfigManager::reset() {
    LOG_CONFIG("Performing factory reset");

    // Clear NVS namespace
    prefs.clear();

    // Restore defaults
    setDefaults();

    // Save defaults to NVS
    save();

    LOG_CONFIG("Factory reset completed");
}

/**
 * Set all configuration to default values
 */
void ConfigManager::setDefaults() {
    LOG_CONFIG("Loading default configuration");

    // Copy default config
    memcpy(&config, &DEFAULT_CONFIG, sizeof(RoIPConfig));

    // Generate device ID if not set
    if (config.device_id[0] == '\0') {
        generateDeviceId();
    }
}

/**
 * Generate unique device ID from MAC address
 */
void ConfigManager::generateDeviceId() {
    uint8_t mac[6];
    WiFi.macAddress(mac);

    snprintf(config.device_id, sizeof(config.device_id),
             "RoIP-%02X%02X%02X%02X%02X%02X",
             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);

    LOG_CONFIG("Generated device ID: %s", config.device_id);
}

/**
 * Check if device has been configured (has WiFi SSID set)
 */
bool ConfigManager::isConfigured() {
    return (strlen(config.wifi_ssid) > 0 &&
            strlen(config.sip_server) > 0);
}

/**
 * Set WiFi credentials
 */
void ConfigManager::setWiFi(const char* ssid, const char* password) {
    if (!ssid || !password) {
        LOG_CONFIG("ERROR: Invalid WiFi credentials");
        return;
    }

    strncpy(config.wifi_ssid, ssid, sizeof(config.wifi_ssid) - 1);
    config.wifi_ssid[sizeof(config.wifi_ssid) - 1] = '\0';

    strncpy(config.wifi_password, password, sizeof(config.wifi_password) - 1);
    config.wifi_password[sizeof(config.wifi_password) - 1] = '\0';

    LOG_CONFIG("WiFi credentials updated: SSID=%s", ssid);
}

/**
 * Set SIP server configuration
 */
void ConfigManager::setSIPServer(const char* server, uint16_t port,
                                 const char* user, const char* pass) {
    if (!server || !user || !pass) {
        LOG_CONFIG("ERROR: Invalid SIP configuration");
        return;
    }

    strncpy(config.sip_server, server, sizeof(config.sip_server) - 1);
    config.sip_server[sizeof(config.sip_server) - 1] = '\0';

    config.sip_port = port;

    strncpy(config.sip_username, user, sizeof(config.sip_username) - 1);
    config.sip_username[sizeof(config.sip_username) - 1] = '\0';

    strncpy(config.sip_password, pass, sizeof(config.sip_password) - 1);
    config.sip_password[sizeof(config.sip_password) - 1] = '\0';

    LOG_CONFIG("SIP configuration updated: server=%s:%d, user=%s", server, port, user);
}

/**
 * Apply audio quality preset
 * 0 = Low quality (low bitrate, fast)
 * 1 = Medium quality (balanced)
 * 2 = High quality (better audio)
 * 3 = Ultra quality (best audio, high bitrate)
 */
void ConfigManager::applyQualityPreset(uint8_t preset) {
    LOG_CONFIG("Applying audio quality preset: %d", preset);

    config.audio_quality_preset = preset;

    switch (preset) {
        case 0:  // Low quality
            config.opus_bitrate = 16000;      // 16 kbps
            config.opus_complexity = 5;       // Medium complexity
            config.fec_enabled = false;
            config.dtx_enabled = true;
            config.agc_enabled = true;
            config.noise_suppression_enabled = false;
            break;

        case 1:  // Medium quality (default)
            config.opus_bitrate = 32000;      // 32 kbps
            config.opus_complexity = 9;       // High complexity
            config.fec_enabled = true;
            config.dtx_enabled = true;
            config.agc_enabled = true;
            config.noise_suppression_enabled = true;
            break;

        case 2:  // High quality
            config.opus_bitrate = 48000;      // 48 kbps
            config.opus_complexity = 10;      // Maximum complexity
            config.fec_enabled = true;
            config.dtx_enabled = true;
            config.agc_enabled = true;
            config.noise_suppression_enabled = true;
            config.vad_enabled = true;
            break;

        case 3:  // Ultra quality
            config.opus_bitrate = 64000;      // 64 kbps
            config.opus_complexity = 10;      // Maximum complexity
            config.fec_enabled = true;
            config.dtx_enabled = false;       // Disabled for continuous quality
            config.agc_enabled = true;
            config.noise_suppression_enabled = true;
            config.vad_enabled = false;       // Disabled for continuous transmission
            break;

        default:
            LOG_CONFIG("ERROR: Invalid audio preset: %d", preset);
            applyQualityPreset(1);  // Fall back to medium
            break;
    }
}

/**
 * Set audio quality preset
 */
void ConfigManager::setAudioQuality(uint8_t preset) {
    if (preset > 3) {
        LOG_CONFIG("ERROR: Invalid preset value %d, using medium quality", preset);
        preset = 1;
    }

    applyQualityPreset(preset);
}

/**
 * Validate configuration values
 */
bool ConfigManager::validateConfiguration() {
    // Validate device name length
    if (strlen(config.device_name) == 0 || strlen(config.device_name) > 31) {
        LOG_CONFIG("ERROR: Invalid device name length");
        return false;
    }

    // Validate device ID
    if (strlen(config.device_id) == 0) {
        LOG_CONFIG("ERROR: Device ID not set");
        return false;
    }

    // Validate WiFi settings if configured
    if (strlen(config.wifi_ssid) > 0) {
        if (strlen(config.wifi_ssid) > 31 || strlen(config.wifi_password) > 63) {
            LOG_CONFIG("ERROR: Invalid WiFi credentials length");
            return false;
        }
    }

    // Validate SIP settings if configured
    if (strlen(config.sip_server) > 0) {
        if (config.sip_port == 0 || config.sip_port > 65535) {
            LOG_CONFIG("ERROR: Invalid SIP port: %d", config.sip_port);
            return false;
        }
        if (strlen(config.sip_username) == 0 || strlen(config.sip_password) == 0) {
            LOG_CONFIG("ERROR: Invalid SIP credentials");
            return false;
        }
    }

    // Validate audio settings
    if (config.sample_rate < 8000 || config.sample_rate > 48000) {
        LOG_CONFIG("ERROR: Invalid sample rate: %d", config.sample_rate);
        return false;
    }

    if (config.frame_size_ms == 0 || config.frame_size_ms > 100) {
        LOG_CONFIG("ERROR: Invalid frame size: %d ms", config.frame_size_ms);
        return false;
    }

    if (config.opus_bitrate < 6000 || config.opus_bitrate > 128000) {
        LOG_CONFIG("ERROR: Invalid opus bitrate: %d", config.opus_bitrate);
        return false;
    }

    if (config.opus_complexity > 10) {
        LOG_CONFIG("ERROR: Invalid opus complexity: %d", config.opus_complexity);
        return false;
    }

    // Validate quality preset
    if (config.audio_quality_preset > 3) {
        LOG_CONFIG("ERROR: Invalid audio quality preset: %d", config.audio_quality_preset);
        return false;
    }

    // Validate log level
    if (config.log_level > 5) {
        LOG_CONFIG("ERROR: Invalid log level: %d", config.log_level);
        return false;
    }

    // Validate admin password length
    if (strlen(config.admin_password) < 6 || strlen(config.admin_password) > 63) {
        LOG_CONFIG("ERROR: Invalid admin password length");
        return false;
    }

    return true;
}

/**
 * Export configuration to JSON string
 * Uses ArduinoJson library for serialization
 */
bool ConfigManager::exportToJson(char* buffer, size_t bufferSize) {
    if (!buffer || bufferSize < 256) {
        LOG_CONFIG("ERROR: Invalid buffer for JSON export");
        return false;
    }

    LOG_CONFIG("Exporting configuration to JSON");

    // Create JSON document
    StaticJsonDocument<JSON_BUFFER_SIZE> doc;

    // Device identity
    doc["device_name"] = config.device_name;
    doc["device_id"] = config.device_id;

    // Network settings
    doc["wifi_ssid"] = config.wifi_ssid;
    doc["wifi_hostname"] = config.wifi_hostname;
    doc["wifi_5ghz_enabled"] = config.wifi_5ghz_enabled;

    // SIP server settings (exclude password for security)
    doc["sip_server"] = config.sip_server;
    doc["sip_port"] = config.sip_port;
    doc["sip_username"] = config.sip_username;
    doc["sip_realm"] = config.sip_realm;

    // STUN/TURN settings (exclude passwords)
    doc["stun_server"] = config.stun_server;
    doc["stun_port"] = config.stun_port;
    doc["turn_server"] = config.turn_server;
    doc["turn_port"] = config.turn_port;

    // Audio settings
    doc["sample_rate"] = config.sample_rate;
    doc["frame_size_ms"] = config.frame_size_ms;
    doc["opus_bitrate"] = config.opus_bitrate;
    doc["opus_complexity"] = config.opus_complexity;

    // DSP settings
    doc["agc_enabled"] = config.agc_enabled;
    doc["agc_target_db"] = config.agc_target_db;
    doc["noise_suppression_enabled"] = config.noise_suppression_enabled;
    doc["vad_enabled"] = config.vad_enabled;
    doc["aec_enabled"] = config.aec_enabled;

    // PTT/COS settings
    doc["ptt_active_high"] = config.ptt_active_high;
    doc["cos_active_high"] = config.cos_active_high;
    doc["ptt_tail_ms"] = config.ptt_tail_ms;
    doc["cos_debounce_ms"] = config.cos_debounce_ms;
    doc["vox_enabled"] = config.vox_enabled;
    doc["vox_threshold_db"] = config.vox_threshold_db;
    doc["vox_hangtime_ms"] = config.vox_hangtime_ms;

    // Quality settings
    doc["audio_quality_preset"] = config.audio_quality_preset;
    doc["fec_enabled"] = config.fec_enabled;
    doc["dtx_enabled"] = config.dtx_enabled;

    // System settings (exclude admin password)
    doc["log_level"] = config.log_level;
    doc["web_ui_enabled"] = config.web_ui_enabled;
    doc["web_ui_port"] = config.web_ui_port;

    // Version
    doc["config_version"] = config.config_version;

    // Serialize to string
    size_t written = serializeJson(doc, buffer, bufferSize);
    if (written == 0) {
        LOG_CONFIG("ERROR: Failed to serialize JSON");
        return false;
    }

    LOG_CONFIG("JSON export successful, size: %d bytes", written);
    return true;
}

/**
 * Import configuration from JSON string
 * Uses ArduinoJson library for deserialization
 */
bool ConfigManager::importFromJson(const char* json) {
    if (!json || strlen(json) == 0) {
        LOG_CONFIG("ERROR: Invalid JSON string");
        return false;
    }

    LOG_CONFIG("Importing configuration from JSON");

    // Create JSON document
    StaticJsonDocument<JSON_BUFFER_SIZE> doc;

    // Parse JSON
    DeserializationError error = deserializeJson(doc, json);
    if (error) {
        LOG_CONFIG("ERROR: JSON parse error: %s", error.c_str());
        return false;
    }

    // Device identity
    if (doc.containsKey("device_name")) {
        strncpy(config.device_name, doc["device_name"] | "",
                sizeof(config.device_name) - 1);
    }

    if (doc.containsKey("device_id")) {
        strncpy(config.device_id, doc["device_id"] | "",
                sizeof(config.device_id) - 1);
    }

    // Network settings
    if (doc.containsKey("wifi_ssid")) {
        strncpy(config.wifi_ssid, doc["wifi_ssid"] | "",
                sizeof(config.wifi_ssid) - 1);
    }

    if (doc.containsKey("wifi_hostname")) {
        strncpy(config.wifi_hostname, doc["wifi_hostname"] | "",
                sizeof(config.wifi_hostname) - 1);
    }

    if (doc.containsKey("wifi_5ghz_enabled")) {
        config.wifi_5ghz_enabled = doc["wifi_5ghz_enabled"] | false;
    }

    // SIP server settings
    if (doc.containsKey("sip_server")) {
        strncpy(config.sip_server, doc["sip_server"] | "",
                sizeof(config.sip_server) - 1);
    }

    if (doc.containsKey("sip_port")) {
        config.sip_port = doc["sip_port"] | SIP_PORT;
    }

    if (doc.containsKey("sip_username")) {
        strncpy(config.sip_username, doc["sip_username"] | "",
                sizeof(config.sip_username) - 1);
    }

    if (doc.containsKey("sip_realm")) {
        strncpy(config.sip_realm, doc["sip_realm"] | "",
                sizeof(config.sip_realm) - 1);
    }

    // STUN/TURN settings
    if (doc.containsKey("stun_server")) {
        strncpy(config.stun_server, doc["stun_server"] | "",
                sizeof(config.stun_server) - 1);
    }

    if (doc.containsKey("stun_port")) {
        config.stun_port = doc["stun_port"] | 3478;
    }

    if (doc.containsKey("turn_server")) {
        strncpy(config.turn_server, doc["turn_server"] | "",
                sizeof(config.turn_server) - 1);
    }

    if (doc.containsKey("turn_port")) {
        config.turn_port = doc["turn_port"] | 3478;
    }

    // Audio settings
    if (doc.containsKey("sample_rate")) {
        config.sample_rate = doc["sample_rate"] | AUDIO_SAMPLE_RATE;
    }

    if (doc.containsKey("frame_size_ms")) {
        config.frame_size_ms = doc["frame_size_ms"] | AUDIO_FRAME_SIZE_MS;
    }

    if (doc.containsKey("opus_bitrate")) {
        config.opus_bitrate = doc["opus_bitrate"] | OPUS_BITRATE;
    }

    if (doc.containsKey("opus_complexity")) {
        config.opus_complexity = doc["opus_complexity"] | OPUS_COMPLEXITY;
    }

    // DSP settings
    if (doc.containsKey("agc_enabled")) {
        config.agc_enabled = doc["agc_enabled"] | true;
    }

    if (doc.containsKey("agc_target_db")) {
        config.agc_target_db = doc["agc_target_db"] | AGC_TARGET_LEVEL_DB;
    }

    if (doc.containsKey("noise_suppression_enabled")) {
        config.noise_suppression_enabled = doc["noise_suppression_enabled"] | true;
    }

    if (doc.containsKey("vad_enabled")) {
        config.vad_enabled = doc["vad_enabled"] | true;
    }

    if (doc.containsKey("aec_enabled")) {
        config.aec_enabled = doc["aec_enabled"] | false;
    }

    // PTT/COS settings
    if (doc.containsKey("ptt_active_high")) {
        config.ptt_active_high = doc["ptt_active_high"] | true;
    }

    if (doc.containsKey("cos_active_high")) {
        config.cos_active_high = doc["cos_active_high"] | false;
    }

    if (doc.containsKey("ptt_tail_ms")) {
        config.ptt_tail_ms = doc["ptt_tail_ms"] | PTT_TAIL_DELAY_MS;
    }

    if (doc.containsKey("cos_debounce_ms")) {
        config.cos_debounce_ms = doc["cos_debounce_ms"] | COS_DEBOUNCE_MS;
    }

    if (doc.containsKey("vox_enabled")) {
        config.vox_enabled = doc["vox_enabled"] | false;
    }

    if (doc.containsKey("vox_threshold_db")) {
        config.vox_threshold_db = doc["vox_threshold_db"] | VOX_THRESHOLD_DB;
    }

    if (doc.containsKey("vox_hangtime_ms")) {
        config.vox_hangtime_ms = doc["vox_hangtime_ms"] | VOX_HANGTIME_MS;
    }

    // Quality settings
    if (doc.containsKey("audio_quality_preset")) {
        uint8_t preset = doc["audio_quality_preset"] | 1;
        applyQualityPreset(preset);
    }

    if (doc.containsKey("fec_enabled")) {
        config.fec_enabled = doc["fec_enabled"] | true;
    }

    if (doc.containsKey("dtx_enabled")) {
        config.dtx_enabled = doc["dtx_enabled"] | true;
    }

    // System settings
    if (doc.containsKey("log_level")) {
        config.log_level = doc["log_level"] | 2;
    }

    if (doc.containsKey("web_ui_enabled")) {
        config.web_ui_enabled = doc["web_ui_enabled"] | true;
    }

    if (doc.containsKey("web_ui_port")) {
        config.web_ui_port = doc["web_ui_port"] | 80;
    }

    // Validate imported configuration
    if (!validateConfiguration()) {
        LOG_CONFIG("ERROR: Imported configuration validation failed");
        return false;
    }

    LOG_CONFIG("Configuration imported successfully from JSON");
    return true;
}
