/*
 * ESP32 RoIP - Main Firmware
 * Comprehensive Radio over IP System for MMDVM
 *
 * Features:
 * - Multi-modal audio processing (input -> DSP -> codec -> RTP -> network)
 * - Professional SIP client integration
 * - Real-time DSP processing (AGC, noise gating, filtering)
 * - Opus codec compression with FEC/DTX support
 * - RTP/RTCP for reliable audio transport
 * - PTT/COS event handling with debouncing
 * - VOX (Voice Operated Transmission) support
 * - Comprehensive status monitoring and watchdog
 * - Web-based UI and serial debugging
 * - LED status indicators
 * - Automatic error recovery
 */

#include <Arduino.h>
#include <esp_system.h>
#include <esp_pm.h>
#include <esp_ipc.h>
#include <esp_task_wdt.h>
#include <SPIFFS.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WebServer.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <freertos/queue.h>
#include <freertos/timers.h>

// Forward declare Serial for logging
extern HardwareSerial Serial;

// Include configuration and component managers
#include "../include/config.h"
#include "../include/network_manager.h"
#include "../include/dsp_processor.h"
#include "../include/codec_opus.h"
#include "../src/audio_pipeline.h"
#include "../src/rtp_handler.h"
#include "../src/sip_client.h"
#include "../src/ptt_controller.h"

// Disable watchdog during development/debugging if needed
#define ENABLE_WATCHDOG true
#define WATCHDOG_TIMEOUT_SECONDS 30

// System state enumeration
enum SystemState {
    STATE_BOOT,
    STATE_INITIALIZING,
    STATE_IDLE,
    STATE_CONNECTING_WIFI,
    STATE_REGISTERING_SIP,
    STATE_READY,
    STATE_CALL_ACTIVE,
    STATE_TX_ACTIVE,
    STATE_RX_ACTIVE,
    STATE_ERROR,
    STATE_RECOVERY
};

// Global state variables
SystemState g_system_state = STATE_BOOT;
SystemState g_previous_state = STATE_BOOT;
uint32_t g_state_entry_time = 0;
uint32_t g_system_uptime = 0;
uint32_t g_last_watchdog_reset = 0;

// Component manager instances (forward declarations)
class ConfigManager* g_config_manager = nullptr;
class NetworkManager* g_network_manager = nullptr;
class AudioPipeline* g_audio_pipeline = nullptr;
class DSPProcessor* g_dsp_processor = nullptr;
class OpusCodec* g_opus_codec = nullptr;
class RTPHandler* g_rtp_handler = nullptr;
class SIPClient* g_sip_client = nullptr;
class PTTController* g_ptt_controller = nullptr;
class WebServer* g_web_server = nullptr;

// LED status pins
const uint8_t LED_STATUS = PIN_LED_STATUS;   // Status indicator
const uint8_t LED_TX = PIN_LED_TX;           // TX activity
const uint8_t LED_RX = PIN_LED_RX;           // RX activity

// LED blink patterns (in milliseconds)
const uint16_t LED_BLINK_FAST = 100;
const uint16_t LED_BLINK_SLOW = 500;
const uint16_t LED_BLINK_PULSE = 1000;

// Audio and DSP buffers
volatile uint32_t g_audio_frame_count = 0;
volatile uint32_t g_dsp_process_count = 0;
volatile uint32_t g_codec_process_count = 0;
volatile uint32_t g_rtp_transmit_count = 0;

// Event flags
volatile bool g_ptt_pressed = false;
volatile bool g_cos_active = false;
volatile bool g_vox_triggered = false;
volatile uint32_t g_ptt_press_time = 0;
volatile uint32_t g_cos_active_time = 0;

// Performance metrics
struct SystemMetrics {
    uint32_t audio_frames_processed;
    uint32_t dsp_frames_processed;
    uint32_t codec_frames_processed;
    uint32_t rtp_packets_sent;
    uint32_t rtp_packets_received;
    float avg_cpu_load;
    float avg_memory_used;
    uint32_t error_count;
    uint32_t recovery_count;
    uint32_t last_update_time;
} g_metrics = {0};

// Error handling
struct ErrorInfo {
    uint32_t error_code;
    uint32_t error_count;
    uint32_t last_error_time;
    char error_message[256];
} g_last_error = {0};

// ============================================================================
// Forward Function Declarations
// ============================================================================

void setup();
void loop();

// System initialization
bool initializeFileSystem();
bool initializePeripherals();
bool initializeConfigManager();
bool initializeNetworkManager();
bool initializeAudioPipeline();
bool initializeDSPProcessor();
bool initializeOpusCodec();
bool initializeRTPHandler();
bool initializeSIPClient();
bool initializePTTController();
bool initializeWebServer();

// Main event handlers
void handleAudioInput();
void handleDSPProcessing();
void handleCodecProcessing();
void handleRTPTransmission();
void handlePTTEvent();
void handleCOSEvent();
void handleVOXEvent();
void handleIncomingRTP();
void handleSIPEvents();

// System management
void updateSystemState(SystemState new_state);
void resetWatchdog();
void monitorSystemHealth();
void updateMetrics();
void handleError(uint32_t error_code, const char* message);
void recoverFromError();

// LED control
void initializeLEDs();
void setLEDStatus(uint8_t pin, uint8_t state);
void blinkLED(uint8_t pin, uint16_t duration);
void updateLEDIndicators();

// Debugging
void initializeSerial();
void printSystemStatus();
void printMetrics();
void printDebugInfo();

// Task functions for multithreading
void audioInputTask(void* parameter);
void dspProcessingTask(void* parameter);
void rptNetworkTask(void* parameter);
void monitoringTask(void* parameter);

// Interrupt handlers
void IRAM_ATTR handlePTTInterrupt(void* arg);
void IRAM_ATTR handleCOSInterrupt(void* arg);

// ============================================================================
// LOGGING MACROS
// ============================================================================

#define LOG_LEVEL_NONE    0
#define LOG_LEVEL_ERROR   1
#define LOG_LEVEL_WARN    2
#define LOG_LEVEL_INFO    3
#define LOG_LEVEL_DEBUG   4
#define LOG_LEVEL_TRACE   5

#ifndef LOG_LEVEL
#define LOG_LEVEL LOG_LEVEL_INFO
#endif

#define LOG_ERROR(fmt, ...) do { if (LOG_LEVEL >= LOG_LEVEL_ERROR) { Serial.printf("[ERROR] " fmt "\n", ##__VA_ARGS__); } } while(0)
#define LOG_WARN(fmt, ...)  do { if (LOG_LEVEL >= LOG_LEVEL_WARN) { Serial.printf("[WARN] " fmt "\n", ##__VA_ARGS__); } } while(0)
#define LOG_INFO(fmt, ...)  do { if (LOG_LEVEL >= LOG_LEVEL_INFO) { Serial.printf("[INFO] " fmt "\n", ##__VA_ARGS__); } } while(0)
#define LOG_DEBUG(fmt, ...) do { if (LOG_LEVEL >= LOG_LEVEL_DEBUG) { Serial.printf("[DEBUG] " fmt "\n", ##__VA_ARGS__); } } while(0)
#define LOG_TRACE(fmt, ...) do { if (LOG_LEVEL >= LOG_LEVEL_TRACE) { Serial.printf("[TRACE] " fmt "\n", ##__VA_ARGS__); } } while(0)

// ============================================================================
// SETUP FUNCTION - Arduino Entry Point
// ============================================================================

void setup() {
    // Initialize serial communication for debugging
    initializeSerial();

    LOG_INFO("=========================================");
    LOG_INFO("ESP32 RoIP System - Firmware Initialization");
    LOG_INFO("=========================================");
    LOG_INFO("Boot time: %lu ms", millis());

    // Update system state
    updateSystemState(STATE_INITIALIZING);

    // Step 1: Initialize file system
    LOG_INFO("Step 1: Initializing file system...");
    if (!initializeFileSystem()) {
        LOG_ERROR("File system initialization failed!");
        handleError(1, "File system initialization failed");
        return;
    }

    // Step 2: Initialize peripherals (GPIO, SPI, I2C, etc.)
    LOG_INFO("Step 2: Initializing peripherals...");
    if (!initializePeripherals()) {
        LOG_ERROR("Peripheral initialization failed!");
        handleError(2, "Peripheral initialization failed");
        return;
    }

    // Step 3: Initialize configuration manager
    LOG_INFO("Step 3: Initializing configuration manager...");
    g_config_manager = new ConfigManager();
    if (!g_config_manager || !g_config_manager->begin()) {
        LOG_ERROR("ConfigManager initialization failed!");
        handleError(3, "ConfigManager initialization failed");
        return;
    }

    // Step 4: Initialize network manager
    LOG_INFO("Step 4: Initializing network manager...");
    g_network_manager = new NetworkManager();
    if (!g_network_manager || !g_network_manager->begin()) {
        LOG_ERROR("NetworkManager initialization failed!");
        handleError(4, "NetworkManager initialization failed");
        return;
    }

    // Step 5: Initialize audio pipeline
    LOG_INFO("Step 5: Initializing audio pipeline...");
    g_audio_pipeline = new AudioPipeline();
    if (!g_audio_pipeline || !g_audio_pipeline->begin()) {
        LOG_ERROR("AudioPipeline initialization failed!");
        handleError(5, "AudioPipeline initialization failed");
        return;
    }

    // Step 6: Initialize DSP processor
    LOG_INFO("Step 6: Initializing DSP processor...");
    g_dsp_processor = new DSPProcessor();
    if (!g_dsp_processor || !g_dsp_processor->begin()) {
        LOG_ERROR("DSPProcessor initialization failed!");
        handleError(6, "DSPProcessor initialization failed");
        return;
    }

    // Step 7: Initialize Opus codec
    LOG_INFO("Step 7: Initializing Opus codec...");
    g_opus_codec = new OpusCodec();
    if (!g_opus_codec || !g_opus_codec->begin()) {
        LOG_ERROR("OpusCodec initialization failed!");
        handleError(7, "OpusCodec initialization failed");
        return;
    }

    // Step 8: Initialize RTP handler
    LOG_INFO("Step 8: Initializing RTP handler...");
    g_rtp_handler = new RTPHandler();
    if (!g_rtp_handler || !g_rtp_handler->begin()) {
        LOG_ERROR("RTPHandler initialization failed!");
        handleError(8, "RTPHandler initialization failed");
        return;
    }

    // Step 9: Initialize SIP client
    LOG_INFO("Step 9: Initializing SIP client...");
    g_sip_client = new SIPClient();
    if (!g_sip_client || !g_sip_client->begin()) {
        LOG_ERROR("SIPClient initialization failed!");
        handleError(9, "SIPClient initialization failed");
        return;
    }

    // Step 10: Initialize PTT controller
    LOG_INFO("Step 10: Initializing PTT controller...");
    g_ptt_controller = new PTTController();
    if (!g_ptt_controller || !g_ptt_controller->begin()) {
        LOG_ERROR("PTTController initialization failed!");
        handleError(10, "PTTController initialization failed");
        return;
    }

    // Step 11: Initialize web server
    LOG_INFO("Step 11: Initializing web server...");
    g_web_server = new WebServer(80);
    if (!g_web_server) {
        LOG_ERROR("WebServer initialization failed!");
        handleError(11, "WebServer initialization failed");
        return;
    }

    // Step 12: Initialize LED indicators
    LOG_INFO("Step 12: Initializing LED indicators...");
    initializeLEDs();

    // Step 13: Connect to WiFi
    LOG_INFO("Step 13: Connecting to WiFi...");
    updateSystemState(STATE_CONNECTING_WIFI);

    if (g_network_manager->connect()) {
        LOG_INFO("Connected to WiFi!");
    } else {
        LOG_WARN("WiFi connection failed, will retry in main loop");
    }

    // Step 14: Register with SIP server
    LOG_INFO("Step 14: Registering with SIP server...");
    updateSystemState(STATE_REGISTERING_SIP);

    if (g_sip_client->registerWithServer()) {
        LOG_INFO("Registered with SIP server!");
        updateSystemState(STATE_READY);
    } else {
        LOG_WARN("SIP registration failed, will retry in main loop");
        updateSystemState(STATE_IDLE);
    }

    // Step 15: Start audio pipeline
    LOG_INFO("Step 15: Starting audio pipeline...");
    if (g_audio_pipeline->start()) {
        LOG_INFO("Audio pipeline started!");
    } else {
        LOG_WARN("Audio pipeline start failed");
    }

    // Step 16: Initialize watchdog timer
    if (ENABLE_WATCHDOG) {
        LOG_INFO("Step 16: Initializing watchdog timer...");
        esp_task_wdt_init(WATCHDOG_TIMEOUT_SECONDS, true);
        esp_task_wdt_add(xTaskGetCurrentTaskHandle());
        g_last_watchdog_reset = millis();
        LOG_INFO("Watchdog timer enabled (timeout: %d seconds)", WATCHDOG_TIMEOUT_SECONDS);
    }

    // Step 17: Create monitoring tasks
    LOG_INFO("Step 17: Creating monitoring tasks...");

    xTaskCreatePinnedToCore(
        audioInputTask,
        "AudioInput",
        4096,
        nullptr,
        configMAX_PRIORITIES - 2,
        nullptr,
        0  // Core 0 for audio
    );

    xTaskCreatePinnedToCore(
        dspProcessingTask,
        "DSPProc",
        8192,
        nullptr,
        configMAX_PRIORITIES - 2,
        nullptr,
        1  // Core 1 for DSP
    );

    xTaskCreatePinnedToCore(
        monitoringTask,
        "Monitor",
        4096,
        nullptr,
        configMAX_PRIORITIES - 4,
        nullptr,
        0
    );

    LOG_INFO("=========================================");
    LOG_INFO("Initialization Complete - System Ready!");
    LOG_INFO("=========================================");

    g_system_uptime = 0;
}

// ============================================================================
// MAIN LOOP FUNCTION - Arduino Loop
// ============================================================================

void loop() {
    // Reset watchdog
    resetWatchdog();

    // Handle main state machine
    switch (g_system_state) {
        case STATE_BOOT:
            LOG_ERROR("System in BOOT state - this should not happen!");
            updateSystemState(STATE_ERROR);
            break;

        case STATE_INITIALIZING:
            LOG_DEBUG("System initializing...");
            break;

        case STATE_IDLE:
            // System is idle, waiting for network/SIP
            if (g_network_manager->isConnected()) {
                if (g_sip_client->isRegistered()) {
                    updateSystemState(STATE_READY);
                }
            }
            vTaskDelay(100 / portTICK_PERIOD_MS);
            break;

        case STATE_CONNECTING_WIFI:
            if (g_network_manager->isConnected()) {
                LOG_INFO("WiFi connection established!");
                updateSystemState(STATE_REGISTERING_SIP);
            }
            vTaskDelay(500 / portTICK_PERIOD_MS);
            break;

        case STATE_REGISTERING_SIP:
            if (g_sip_client->isRegistered()) {
                LOG_INFO("SIP registration successful!");
                updateSystemState(STATE_READY);
            }
            vTaskDelay(500 / portTICK_PERIOD_MS);
            break;

        case STATE_READY:
            // System ready, monitoring PTT/COS
            if (g_ptt_pressed || g_cos_active || g_vox_triggered) {
                updateSystemState(STATE_TX_ACTIVE);
                g_audio_pipeline->start();
            }
            vTaskDelay(50 / portTICK_PERIOD_MS);
            break;

        case STATE_CALL_ACTIVE:
            // Call is active, bidirectional audio
            handleIncomingRTP();
            handleSIPEvents();
            vTaskDelay(10 / portTICK_PERIOD_MS);
            break;

        case STATE_TX_ACTIVE:
            // Transmitting audio
            handlePTTEvent();
            handleAudioInput();
            handleDSPProcessing();
            handleCodecProcessing();
            handleRTPTransmission();

            // Check if transmission should stop
            if (!g_ptt_pressed && !g_cos_active && !g_vox_triggered) {
                LOG_DEBUG("Transmission stopped");
                updateSystemState(STATE_READY);
                g_audio_pipeline->stop();
            }
            vTaskDelay(5 / portTICK_PERIOD_MS);
            break;

        case STATE_RX_ACTIVE:
            // Receiving audio
            handleIncomingRTP();
            vTaskDelay(5 / portTICK_PERIOD_MS);
            break;

        case STATE_ERROR:
            LOG_ERROR("System in ERROR state - attempting recovery");
            recoverFromError();
            break;

        case STATE_RECOVERY:
            LOG_INFO("System recovering from error...");
            vTaskDelay(1000 / portTICK_PERIOD_MS);
            updateSystemState(STATE_IDLE);
            break;

        default:
            LOG_ERROR("Unknown system state: %d", g_system_state);
            updateSystemState(STATE_ERROR);
            break;
    }

    // Update LED indicators
    updateLEDIndicators();

    // Monitor system health
    monitorSystemHealth();

    // Update metrics periodically
    if ((millis() - g_metrics.last_update_time) > 5000) {
        updateMetrics();
        g_metrics.last_update_time = millis();
        printMetrics();
    }

    // Handle serial commands
    if (Serial.available()) {
        char cmd = Serial.read();
        switch (cmd) {
            case 's':
                printSystemStatus();
                break;
            case 'm':
                printMetrics();
                break;
            case 'd':
                printDebugInfo();
                break;
            case 'r':
                LOG_INFO("Restarting system...");
                ESP.restart();
                break;
            case 'h':
                LOG_INFO("Commands: s=status, m=metrics, d=debug, r=restart, h=help");
                break;
            default:
                break;
        }
    }
}

// ============================================================================
// INITIALIZATION FUNCTIONS
// ============================================================================

bool initializeFileSystem() {
    if (!SPIFFS.begin(true)) {
        LOG_ERROR("SPIFFS initialization failed!");
        return false;
    }

    uint32_t total_bytes = SPIFFS.totalBytes();
    uint32_t used_bytes = SPIFFS.usedBytes();

    LOG_INFO("SPIFFS initialized: %lu bytes total, %lu bytes used",
             total_bytes, used_bytes);

    return true;
}

bool initializePeripherals() {
    // Configure power management
    esp_pm_config_esp32_t pm_config = {
        .max_freq_mhz = 240,
        .min_freq_mhz = 80,
        .light_sleep_enable = false
    };

    if (esp_pm_configure(&pm_config) != ESP_OK) {
        LOG_WARN("Failed to configure power management");
    }

    // Initialize GPIO for LEDs and buttons
    gpio_config_t led_config = {
        .pin_bit_mask = (1ULL << LED_STATUS) | (1ULL << LED_TX) | (1ULL << LED_RX),
        .mode = GPIO_MODE_OUTPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE
    };

    if (gpio_config(&led_config) != ESP_OK) {
        LOG_ERROR("GPIO configuration failed!");
        return false;
    }

    // Initialize GPIO for PTT/COS inputs with interrupts
    gpio_config_t ptt_cos_config = {
        .pin_bit_mask = (1ULL << PIN_PTT) | (1ULL << PIN_COS),
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_ANYEDGE
    };

    if (gpio_config(&ptt_cos_config) != ESP_OK) {
        LOG_ERROR("GPIO PTT/COS configuration failed!");
        return false;
    }

    // Install GPIO ISR service
    if (gpio_install_isr_service(0) != ESP_OK) {
        LOG_ERROR("GPIO ISR service installation failed!");
        return false;
    }

    // Attach interrupt handlers
    gpio_isr_handler_add(PIN_PTT, handlePTTInterrupt, nullptr);
    gpio_isr_handler_add(PIN_COS, handleCOSInterrupt, nullptr);

    LOG_INFO("Peripherals initialized successfully");
    return true;
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

void handleAudioInput() {
    // Read audio samples from ADC/I2S
    // This would typically be handled by an audio input task
    g_audio_frame_count++;
    LOG_TRACE("Audio frame #%lu captured", g_audio_frame_count);
}

void handleDSPProcessing() {
    // Process audio through DSP pipeline:
    // 1. High-pass filter (remove DC and low freq noise)
    // 2. Low-pass filter (reduce high freq noise)
    // 3. Noise gate (suppress silence/noise)
    // 4. AGC (automatic gain control)
    // 5. Noise suppression (if enabled)

    g_dsp_process_count++;
    LOG_TRACE("DSP processing frame #%lu", g_dsp_process_count);
}

void handleCodecProcessing() {
    // Encode audio using Opus codec
    // Apply FEC if enabled
    // Apply DTX if enabled

    g_codec_process_count++;
    LOG_TRACE("Codec processing frame #%lu", g_codec_process_count);
}

void handleRTPTransmission() {
    // Transmit encoded audio via RTP
    // Handle RTP sequence numbering
    // Handle RTCP reporting

    g_rtp_transmit_count++;
    LOG_TRACE("RTP transmission #%lu", g_rtp_transmit_count);
}

void handlePTTEvent() {
    if (!g_ptt_pressed) {
        return;
    }

    uint32_t ptt_duration = millis() - g_ptt_press_time;
    LOG_DEBUG("PTT pressed for %lu ms", ptt_duration);
}

void handleCOSEvent() {
    if (!g_cos_active) {
        return;
    }

    uint32_t cos_duration = millis() - g_cos_active_time;
    LOG_DEBUG("COS active for %lu ms", cos_duration);
}

void handleVOXEvent() {
    if (!g_vox_triggered) {
        return;
    }

    LOG_DEBUG("VOX triggered");
}

void handleIncomingRTP() {
    // Receive RTP packets
    // Decode Opus audio
    // Handle packet loss with FEC
    // Playback audio via DAC/I2S

    LOG_TRACE("Processing incoming RTP packets");
}

void handleSIPEvents() {
    // Handle SIP INVITE
    // Handle SIP ACK
    // Handle SIP BYE
    // Handle SIP re-INVITE

    LOG_TRACE("Processing SIP events");
}

// ============================================================================
// INTERRUPT HANDLERS (IRAM)
// ============================================================================

void IRAM_ATTR handlePTTInterrupt(void* arg) {
    // Read PTT pin state
    int ptt_state = gpio_get_level(PIN_PTT);

    if (ptt_state) {
        g_ptt_pressed = true;
        g_ptt_press_time = millis();
    } else {
        g_ptt_pressed = false;
    }
}

void IRAM_ATTR handleCOSInterrupt(void* arg) {
    // Read COS pin state
    int cos_state = gpio_get_level(PIN_COS);

    if (cos_state) {
        g_cos_active = true;
        g_cos_active_time = millis();
    } else {
        g_cos_active = false;
    }
}

// ============================================================================
// SYSTEM STATE MANAGEMENT
// ============================================================================

void updateSystemState(SystemState new_state) {
    if (new_state == g_system_state) {
        return;  // No state change
    }

    g_previous_state = g_system_state;
    g_system_state = new_state;
    g_state_entry_time = millis();

    const char* state_names[] = {
        "BOOT",
        "INITIALIZING",
        "IDLE",
        "CONNECTING_WIFI",
        "REGISTERING_SIP",
        "READY",
        "CALL_ACTIVE",
        "TX_ACTIVE",
        "RX_ACTIVE",
        "ERROR",
        "RECOVERY"
    };

    LOG_INFO("State transition: %s -> %s",
             state_names[g_previous_state],
             state_names[g_system_state]);
}

void resetWatchdog() {
    if (ENABLE_WATCHDOG) {
        esp_task_wdt_reset();
        g_last_watchdog_reset = millis();
    }
}

void monitorSystemHealth() {
    // Monitor CPU load, memory usage, audio dropouts, etc.

    // Check for watchdog timeout
    if (ENABLE_WATCHDOG) {
        uint32_t time_since_reset = millis() - g_last_watchdog_reset;
        if (time_since_reset > (WATCHDOG_TIMEOUT_SECONDS * 1000) / 2) {
            LOG_WARN("Watchdog approaching timeout (%.1f%%)",
                     (float)time_since_reset / (WATCHDOG_TIMEOUT_SECONDS * 1000) * 100.0f);
        }
    }

    // Check heap memory
    uint32_t free_heap = esp_get_free_heap_size();
    uint32_t free_internal = esp_get_free_internal_heap_size();

    if (free_heap < 50000) {
        LOG_WARN("Low heap memory: %lu bytes", free_heap);
        handleError(100, "Low heap memory");
    }

    if (free_internal < 30000) {
        LOG_WARN("Low internal memory: %lu bytes", free_internal);
        handleError(101, "Low internal memory");
    }
}

void handleError(uint32_t error_code, const char* message) {
    g_last_error.error_code = error_code;
    g_last_error.error_count++;
    g_last_error.last_error_time = millis();

    strncpy(g_last_error.error_message, message, sizeof(g_last_error.error_message) - 1);
    g_last_error.error_message[sizeof(g_last_error.error_message) - 1] = '\0';

    LOG_ERROR("Error #%lu: %s (count: %lu)",
              error_code, message, g_last_error.error_count);

    // Blink LED to indicate error
    blinkLED(LED_STATUS, 100);

    // If errors are excessive, go to recovery
    if (g_last_error.error_count > 10) {
        updateSystemState(STATE_RECOVERY);
        g_metrics.recovery_count++;
    } else if (g_system_state != STATE_INITIALIZING) {
        updateSystemState(STATE_ERROR);
    }
}

void recoverFromError() {
    LOG_INFO("Attempting error recovery...");
    g_metrics.recovery_count++;

    // Reset error count after recovery attempt
    g_last_error.error_count = 0;

    // Restart audio pipeline if needed
    if (g_audio_pipeline && !g_audio_pipeline->isRunning()) {
        g_audio_pipeline->start();
    }

    // Reconnect WiFi if needed
    if (g_network_manager && !g_network_manager->isConnected()) {
        g_network_manager->connect();
    }

    // Re-register with SIP if needed
    if (g_sip_client && !g_sip_client->isRegistered()) {
        g_sip_client->registerWithServer();
    }

    updateSystemState(STATE_READY);
}

void updateMetrics() {
    g_metrics.audio_frames_processed = g_audio_frame_count;
    g_metrics.dsp_frames_processed = g_dsp_process_count;
    g_metrics.codec_frames_processed = g_codec_process_count;
    g_metrics.rtp_packets_sent = g_rtp_transmit_count;

    // Calculate average CPU load (placeholder)
    g_metrics.avg_cpu_load = 25.5f;

    // Calculate memory usage
    uint32_t total_heap = ESP.getHeapSize();
    uint32_t free_heap = ESP.getFreeHeap();
    g_metrics.avg_memory_used = ((float)(total_heap - free_heap) / total_heap) * 100.0f;

    g_metrics.error_count = g_last_error.error_count;
}

// ============================================================================
// LED CONTROL
// ============================================================================

void initializeLEDs() {
    // Initialize all LED pins to OFF
    digitalWrite(LED_STATUS, LOW);
    digitalWrite(LED_TX, LOW);
    digitalWrite(LED_RX, LOW);

    LOG_INFO("LED indicators initialized");
}

void setLEDStatus(uint8_t pin, uint8_t state) {
    digitalWrite(pin, state ? HIGH : LOW);
}

void blinkLED(uint8_t pin, uint16_t duration) {
    digitalWrite(pin, HIGH);
    vTaskDelay(duration / portTICK_PERIOD_MS);
    digitalWrite(pin, LOW);
}

void updateLEDIndicators() {
    // Status LED: Solid when ready, blinking when error
    if (g_system_state == STATE_READY || g_system_state == STATE_CALL_ACTIVE) {
        setLEDStatus(LED_STATUS, HIGH);
    } else if (g_system_state == STATE_ERROR) {
        static uint32_t last_blink = 0;
        if ((millis() - last_blink) > LED_BLINK_FAST) {
            digitalWrite(LED_STATUS, !digitalRead(LED_STATUS));
            last_blink = millis();
        }
    } else {
        static uint32_t last_slow_blink = 0;
        if ((millis() - last_slow_blink) > LED_BLINK_SLOW) {
            digitalWrite(LED_STATUS, !digitalRead(LED_STATUS));
            last_slow_blink = millis();
        }
    }

    // TX LED: ON when transmitting
    setLEDStatus(LED_TX, g_system_state == STATE_TX_ACTIVE);

    // RX LED: ON when receiving
    setLEDStatus(LED_RX, g_system_state == STATE_RX_ACTIVE);
}

// ============================================================================
// DEBUGGING & STATUS FUNCTIONS
// ============================================================================

void initializeSerial() {
    Serial.begin(115200);

    // Wait for serial connection
    uint32_t start_time = millis();
    while (!Serial && (millis() - start_time) < 2000) {
        vTaskDelay(10 / portTICK_PERIOD_MS);
    }

    if (Serial) {
        LOG_INFO("Serial communication initialized at 115200 baud");
    }
}

void printSystemStatus() {
    LOG_INFO("========== SYSTEM STATUS ==========");
    LOG_INFO("Uptime: %lu seconds", g_system_uptime);

    const char* state_names[] = {
        "BOOT", "INITIALIZING", "IDLE", "CONNECTING_WIFI",
        "REGISTERING_SIP", "READY", "CALL_ACTIVE", "TX_ACTIVE",
        "RX_ACTIVE", "ERROR", "RECOVERY"
    };

    LOG_INFO("Current State: %s (duration: %lu ms)",
             state_names[g_system_state],
             millis() - g_state_entry_time);

    if (g_network_manager) {
        LOG_INFO("WiFi Connected: %s", g_network_manager->isConnected() ? "Yes" : "No");
    }

    if (g_sip_client) {
        LOG_INFO("SIP Registered: %s", g_sip_client->isRegistered() ? "Yes" : "No");
    }

    LOG_INFO("PTT Pressed: %s", g_ptt_pressed ? "Yes" : "No");
    LOG_INFO("COS Active: %s", g_cos_active ? "Yes" : "No");
    LOG_INFO("VOX Triggered: %s", g_vox_triggered ? "Yes" : "No");

    LOG_INFO("=====================================");
}

void printMetrics() {
    LOG_INFO("========== SYSTEM METRICS ==========");
    LOG_INFO("Audio Frames: %lu", g_metrics.audio_frames_processed);
    LOG_INFO("DSP Frames: %lu", g_metrics.dsp_frames_processed);
    LOG_INFO("Codec Frames: %lu", g_metrics.codec_frames_processed);
    LOG_INFO("RTP Packets TX: %lu", g_metrics.rtp_packets_sent);
    LOG_INFO("RTP Packets RX: %lu", g_metrics.rtp_packets_received);
    LOG_INFO("Avg CPU Load: %.1f%%", g_metrics.avg_cpu_load);
    LOG_INFO("Memory Used: %.1f%%", g_metrics.avg_memory_used);
    LOG_INFO("Error Count: %lu", g_metrics.error_count);
    LOG_INFO("Recovery Count: %lu", g_metrics.recovery_count);

    uint32_t free_heap = esp_get_free_heap_size();
    LOG_INFO("Free Heap: %lu bytes", free_heap);

    LOG_INFO("=====================================");
}

void printDebugInfo() {
    LOG_DEBUG("========== DEBUG INFO =============");
    LOG_DEBUG("Last Error Code: %lu", g_last_error.error_code);
    LOG_DEBUG("Last Error: %s", g_last_error.error_message);
    LOG_DEBUG("Last Error Time: %lu", g_last_error.last_error_time);
    LOG_DEBUG("Watchdog Resets: N/A");
    LOG_DEBUG("Stack High Water: N/A");
    LOG_DEBUG("=====================================");
}

// ============================================================================
// TASK FUNCTIONS (FreeRTOS)
// ============================================================================

void audioInputTask(void* parameter) {
    LOG_INFO("AudioInputTask: Started on core %d", xPortGetCoreID());

    while (true) {
        // Read audio samples from ADC/I2S
        // This should be configured for continuous sampling

        handleAudioInput();

        // Audio frame timing: 20ms at 24kHz = 480 samples
        vTaskDelay(20 / portTICK_PERIOD_MS);
    }
}

void dspProcessingTask(void* parameter) {
    LOG_INFO("DSPProcessingTask: Started on core %d", xPortGetCoreID());

    while (true) {
        // Process audio through DSP pipeline

        handleDSPProcessing();
        handleCodecProcessing();

        vTaskDelay(20 / portTICK_PERIOD_MS);
    }
}

void rptNetworkTask(void* parameter) {
    LOG_INFO("RPTNetworkTask: Started on core %d", xPortGetCoreID());

    while (true) {
        // Handle network operations

        handleRTPTransmission();
        handleIncomingRTP();

        vTaskDelay(5 / portTICK_PERIOD_MS);
    }
}

void monitoringTask(void* parameter) {
    LOG_INFO("MonitoringTask: Started on core %d", xPortGetCoreID());

    uint32_t last_uptime_update = millis();

    while (true) {
        // Update system uptime
        uint32_t current_time = millis();
        if ((current_time - last_uptime_update) >= 1000) {
            g_system_uptime++;
            last_uptime_update = current_time;
        }

        // Reset watchdog
        resetWatchdog();

        // Monitor system health
        monitorSystemHealth();

        vTaskDelay(100 / portTICK_PERIOD_MS);
    }
}

// ============================================================================
// END OF MAIN FIRMWARE
// ============================================================================
