/*
 * ESP32 RoIP - Configuration Management
 * Professional Radio over IP system
 */

#ifndef ROIP_CONFIG_H
#define ROIP_CONFIG_H

#include <Arduino.h>
#include <Preferences.h>

// Audio configuration
#ifndef AUDIO_SAMPLE_RATE
#define AUDIO_SAMPLE_RATE 24000
#endif

#ifndef AUDIO_FRAME_SIZE_MS
#define AUDIO_FRAME_SIZE_MS 20
#endif

#define AUDIO_FRAME_SAMPLES ((AUDIO_SAMPLE_RATE * AUDIO_FRAME_SIZE_MS) / 1000)

#ifndef AUDIO_BUFFER_COUNT
#define AUDIO_BUFFER_COUNT 10
#endif

// Opus codec configuration
#ifndef OPUS_BITRATE
#define OPUS_BITRATE 32000  // 32 kbps for excellent quality
#endif

#ifndef OPUS_COMPLEXITY
#define OPUS_COMPLEXITY 10  // Maximum quality (0-10)
#endif

#ifndef OPUS_APPLICATION
#define OPUS_APPLICATION OPUS_APPLICATION_VOIP
#endif

// Network configuration
#ifndef SIP_PORT
#define SIP_PORT 5060
#endif

#ifndef RTP_PORT_MIN
#define RTP_PORT_MIN 10000
#endif

#ifndef RTP_PORT_MAX
#define RTP_PORT_MAX 20000
#endif

#ifndef RTP_PAYLOAD_TYPE
#define RTP_PAYLOAD_TYPE 96  // Dynamic payload for Opus
#endif

// DSP configuration
#define AGC_TARGET_LEVEL_DB -20.0f
#define AGC_ATTACK_MS 10.0f
#define AGC_RELEASE_MS 100.0f

#define NOISE_GATE_THRESHOLD_DB -50.0f
#define NOISE_GATE_ATTACK_MS 5.0f
#define NOISE_GATE_RELEASE_MS 50.0f

#define HPF_CUTOFF_HZ 300.0f
#define LPF_CUTOFF_HZ 3000.0f

// PTT/COS configuration
#define PTT_TAIL_DELAY_MS 200
#define COS_DEBOUNCE_MS 50
#define VOX_THRESHOLD_DB -40.0f
#define VOX_HANGTIME_MS 500

// Pin definitions (can be overridden)
#ifndef PIN_RX_AUDIO
#define PIN_RX_AUDIO GPIO_NUM_36  // ADC input
#endif

#ifndef PIN_TX_AUDIO
#define PIN_TX_AUDIO GPIO_NUM_25  // DAC output
#endif

#ifndef PIN_PTT
#define PIN_PTT GPIO_NUM_17
#endif

#ifndef PIN_COS
#define PIN_COS GPIO_NUM_16
#endif

#ifndef PIN_LED_STATUS
#define PIN_LED_STATUS GPIO_NUM_2
#endif

#ifndef PIN_LED_TX
#define PIN_LED_TX GPIO_NUM_18
#endif

#ifndef PIN_LED_RX
#define PIN_LED_RX GPIO_NUM_19
#endif

// System configuration
#define CONFIG_NAMESPACE "roip"
#define CONFIG_VERSION 1

struct RoIPConfig {
    // Device identity
    char device_name[32];
    char device_id[64];  // MAC-based unique ID

    // Network settings
    char wifi_ssid[32];
    char wifi_password[64];
    char wifi_hostname[32];
    bool wifi_5ghz_enabled;  // For C6/C5

    // SIP server settings
    char sip_server[128];
    uint16_t sip_port;
    char sip_username[64];
    char sip_password[64];
    char sip_realm[64];

    // STUN/TURN settings
    char stun_server[128];
    uint16_t stun_port;
    char turn_server[128];
    uint16_t turn_port;
    char turn_username[64];
    char turn_password[64];

    // Audio settings
    uint32_t sample_rate;
    uint16_t frame_size_ms;
    uint32_t opus_bitrate;
    uint8_t opus_complexity;

    // DSP settings
    bool agc_enabled;
    float agc_target_db;
    bool noise_suppression_enabled;
    bool vad_enabled;
    bool aec_enabled;

    // PTT/COS settings
    bool ptt_active_high;
    bool cos_active_high;
    uint16_t ptt_tail_ms;
    uint16_t cos_debounce_ms;
    bool vox_enabled;
    float vox_threshold_db;
    uint16_t vox_hangtime_ms;

    // Quality settings
    uint8_t audio_quality_preset;  // 0=low, 1=medium, 2=high, 3=ultra
    bool fec_enabled;  // Forward Error Correction
    bool dtx_enabled;  // Discontinuous Transmission

    // System settings
    uint8_t log_level;
    bool web_ui_enabled;
    uint16_t web_ui_port;
    char admin_password[64];

    // Runtime flags
    uint32_t config_version;
    uint32_t uptime_seconds;
};

class ConfigManager {
public:
    ConfigManager();
    ~ConfigManager();

    bool begin();
    bool load();
    bool save();
    void reset();

    RoIPConfig& getConfig() { return config; }

    // Helper methods
    bool isConfigured();
    void setDefaults();
    void generateDeviceId();

    // Individual setters
    void setWiFi(const char* ssid, const char* password);
    void setSIPServer(const char* server, uint16_t port, const char* user, const char* pass);
    void setAudioQuality(uint8_t preset);

    // JSON import/export
    bool exportToJson(char* buffer, size_t bufferSize);
    bool importFromJson(const char* json);

private:
    RoIPConfig config;
    Preferences prefs;

    void applyQualityPreset(uint8_t preset);
    bool validateConfiguration();
};

#endif // ROIP_CONFIG_H
