/*
 * ESP32 RoIP - Audio Pipeline Implementation
 * Professional Radio over IP Audio Processing System
 *
 * Supports:
 * - Timer-based ADC sampling at 24kHz
 * - Variant-specific DAC (ESP32/S2) or PWM (S3/C3/C6/H2/C5) output
 * - ISR-safe circular ring buffers
 * - Real-time audio level monitoring
 * - Multi-variant compilation support
 *
 * Copyright (C) 2024,2025 by MMDVM ESP32 Port Contributors
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 */

#ifndef AUDIO_PIPELINE_H
#define AUDIO_PIPELINE_H

#include <Arduino.h>
#include <cstring>
#include <cmath>
#include <driver/adc.h>
#include <driver/timer.h>
#include <esp_intr_alloc.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>

// Variant detection
#if defined(ESP32)
  #define AUDIO_VARIANT_ESP32      1
  #define AUDIO_HAS_BUILTIN_DAC    1
  #define AUDIO_DAC_BITS           8
#elif defined(ESP32S2)
  #define AUDIO_VARIANT_ESP32S2    1
  #define AUDIO_HAS_BUILTIN_DAC    1
  #define AUDIO_DAC_BITS           8
#elif defined(ESP32S3)
  #define AUDIO_VARIANT_ESP32S3    1
  #define AUDIO_HAS_BUILTIN_DAC    0
  #define AUDIO_USE_PWM_DAC        1
  #define AUDIO_DAC_BITS           12
#elif defined(ESP32C3)
  #define AUDIO_VARIANT_ESP32C3    1
  #define AUDIO_HAS_BUILTIN_DAC    0
  #define AUDIO_USE_PWM_DAC        1
  #define AUDIO_DAC_BITS           12
#elif defined(ESP32C5)
  #define AUDIO_VARIANT_ESP32C5    1
  #define AUDIO_HAS_BUILTIN_DAC    0
  #define AUDIO_USE_PWM_DAC        1
  #define AUDIO_DAC_BITS           12
#elif defined(ESP32C6)
  #define AUDIO_VARIANT_ESP32C6    1
  #define AUDIO_HAS_BUILTIN_DAC    0
  #define AUDIO_USE_PWM_DAC        1
  #define AUDIO_DAC_BITS           12
#elif defined(ESP32H2)
  #define AUDIO_VARIANT_ESP32H2    1
  #define AUDIO_HAS_BUILTIN_DAC    0
  #define AUDIO_USE_PWM_DAC        1
  #define AUDIO_DAC_BITS           12
#else
  #error "Unknown ESP32 variant - please define ESP32, ESP32S2, ESP32S3, ESP32C3, ESP32C5, ESP32C6, or ESP32H2"
#endif

// Audio configuration defaults
#ifndef AUDIO_SAMPLE_RATE
#define AUDIO_SAMPLE_RATE           24000      // 24kHz sample rate
#endif

#ifndef AUDIO_FRAME_SIZE_MS
#define AUDIO_FRAME_SIZE_MS         20         // 20ms frames = 480 samples
#endif

#define AUDIO_FRAME_SAMPLES         (AUDIO_SAMPLE_RATE * AUDIO_FRAME_SIZE_MS / 1000)

#ifndef AUDIO_RINGBUFFER_SIZE
#define AUDIO_RINGBUFFER_SIZE       8192       // Large buffer for real-time processing
#endif

#ifndef AUDIO_STATS_WINDOW_MS
#define AUDIO_STATS_WINDOW_MS       1000       // 1-second window for level statistics
#endif

// Timer configuration (APB clock is typically 80MHz)
#define AUDIO_TIMER_GROUP          TIMER_GROUP_0
#define AUDIO_TIMER_IDX            TIMER_0
#define AUDIO_TIMER_DIVIDER        80         // 80MHz / 80 = 1MHz counter
#define AUDIO_TIMER_ALARM          (1000000 / AUDIO_SAMPLE_RATE)  // ~41.67 for 24kHz

// ADC configuration
#define AUDIO_ADC_RESOLUTION       ADC_WIDTH_BIT_12
#define AUDIO_ADC_ATTEN            ADC_ATTEN_DB_12     // Full scale ~3.3V

// PWM DAC configuration (for variants without built-in DAC)
#ifdef AUDIO_USE_PWM_DAC
  #define AUDIO_PWM_FREQUENCY      78125              // 78.125kHz PWM carrier
  #define AUDIO_PWM_RESOLUTION     12                 // 12-bit resolution (0-4095)
  #define AUDIO_PWM_CHANNEL        LEDC_CHANNEL_0
  #define AUDIO_PWM_SPEED_MODE     LEDC_LOW_SPEED_MODE
  #define AUDIO_PWM_TIMER          LEDC_TIMER_0
#endif

// Audio levels and thresholds
#define AUDIO_SILENCE_THRESHOLD    50         // ADC reading threshold for silence detection
#define AUDIO_CLIP_THRESHOLD       4000       // 12-bit ADC clip threshold (>4095 or <0)
#define AUDIO_DC_OFFSET_MA         50         // Moving average window for DC offset

// Error codes
typedef enum {
  AUDIO_ERR_OK = 0,
  AUDIO_ERR_NOT_INITIALIZED = -1,
  AUDIO_ERR_ALREADY_RUNNING = -2,
  AUDIO_ERR_INVALID_PARAMETER = -3,
  AUDIO_ERR_ADC_INIT_FAILED = -4,
  AUDIO_ERR_DAC_INIT_FAILED = -5,
  AUDIO_ERR_TIMER_INIT_FAILED = -6,
  AUDIO_ERR_PWM_INIT_FAILED = -7,
  AUDIO_ERR_BUFFER_OVERFLOW = -8,
  AUDIO_ERR_BUFFER_UNDERFLOW = -9,
  AUDIO_ERR_OUT_OF_MEMORY = -10,
  AUDIO_ERR_ISR_ALLOC_FAILED = -11
} audio_error_t;

// Audio sample type
typedef int16_t audio_sample_t;

// Audio statistics structure
typedef struct {
  uint32_t sample_count;         // Total samples processed
  uint32_t overflow_count;       // RX buffer overflows
  uint32_t underflow_count;      // TX buffer underflows
  int32_t  peak_level;           // Peak audio level since last reset
  int32_t  rms_level;            // RMS level (short-term)
  int32_t  dc_offset;            // DC offset estimation
  uint32_t clip_count;           // Number of samples that clipped
  uint32_t silence_count;        // Consecutive silence samples
  float    cpu_load_percent;     // ISR CPU load percentage
  uint32_t last_update_ms;       // Last statistics update timestamp
} audio_stats_t;

// ISR-safe circular ring buffer for audio samples
class AudioRingBuffer {
public:
  /**
   * Constructor - allocates buffer memory
   * @param size Buffer size in samples (should be power of 2 for efficiency)
   */
  explicit AudioRingBuffer(uint16_t size = AUDIO_RINGBUFFER_SIZE);

  /**
   * Destructor - frees buffer memory
   */
  ~AudioRingBuffer();

  /**
   * Put a sample into the buffer (ISR-safe, from ISR context)
   * @param sample Audio sample to add
   * @return true if successful, false if buffer full
   */
  bool put(audio_sample_t sample);

  /**
   * Get a sample from the buffer (ISR-safe, from main context)
   * @param sample Reference to store retrieved sample
   * @return true if successful, false if buffer empty
   */
  bool get(audio_sample_t& sample);

  /**
   * Get available space in buffer
   * @return Number of samples that can be written
   */
  uint16_t getSpace() const;

  /**
   * Get available data in buffer
   * @return Number of samples available to read
   */
  uint16_t getData() const;

  /**
   * Check if buffer has overflowed
   * @return true if overflow occurred
   */
  bool hasOverflowed() const;

  /**
   * Reset overflow flag
   */
  void resetOverflow();

  /**
   * Clear buffer (reset pointers)
   */
  void clear();

  /**
   * Get buffer utilization percentage
   * @return Percentage (0-100)
   */
  uint8_t getUtilization() const;

private:
  audio_sample_t* m_buffer;
  volatile uint16_t m_head;
  volatile uint16_t m_tail;
  volatile bool m_full;
  volatile bool m_overflow;
  uint16_t m_size;
  uint16_t m_mask;  // For fast modulo operation
};

// Main audio pipeline class
class AudioPipeline {
public:
  /**
   * Constructor - initializes audio pipeline
   */
  AudioPipeline();

  /**
   * Destructor - cleans up resources
   */
  ~AudioPipeline();

  /**
   * Initialize audio subsystem
   * @param rxPin ADC pin for RX audio input
   * @param txPin DAC/PWM pin for TX audio output
   * @return AUDIO_ERR_OK on success, error code on failure
   */
  audio_error_t begin(gpio_num_t rxPin, gpio_num_t txPin);

  /**
   * Start audio processing (enables timer and ISR)
   * @return AUDIO_ERR_OK on success, error code on failure
   */
  audio_error_t start();

  /**
   * Stop audio processing (disables timer and ISR)
   * @return AUDIO_ERR_OK on success, error code on failure
   */
  audio_error_t stop();

  /**
   * Get RX audio sample (main thread context)
   * @param sample Reference to store sample
   * @return true if sample available, false if buffer empty
   */
  bool getRXSample(audio_sample_t& sample);

  /**
   * Get multiple RX audio samples
   * @param buffer Pointer to output buffer
   * @param count Number of samples to retrieve
   * @return Actual number of samples retrieved
   */
  uint16_t getRXSamples(audio_sample_t* buffer, uint16_t count);

  /**
   * Put TX audio sample (main thread context)
   * @param sample Audio sample to transmit
   * @return true if successful, false if buffer full
   */
  bool putTXSample(audio_sample_t sample);

  /**
   * Put multiple TX audio samples
   * @param buffer Pointer to input buffer
   * @param count Number of samples to write
   * @return Actual number of samples written
   */
  uint16_t putTXSamples(const audio_sample_t* buffer, uint16_t count);

  /**
   * Get current audio statistics
   * @param stats Reference to statistics structure
   * @return AUDIO_ERR_OK on success
   */
  audio_error_t getStats(audio_stats_t& stats);

  /**
   * Reset audio statistics counters
   * @return AUDIO_ERR_OK on success
   */
  audio_error_t resetStats();

  /**
   * Check if RX buffer has overflowed
   * @return true if overflow occurred
   */
  bool hasRXOverflow() const;

  /**
   * Check if TX buffer has overflowed
   * @return true if overflow occurred
   */
  bool hasTXOverflow() const;

  /**
   * Get RX buffer utilization
   * @return Percentage (0-100)
   */
  uint8_t getRXBufferUtil() const;

  /**
   * Get TX buffer utilization
   * @return Percentage (0-100)
   */
  uint8_t getTXBufferUtil() const;

  /**
   * Set RX audio level gain (in dB, -24 to +24)
   * @param gain_db Gain in decibels
   * @return AUDIO_ERR_OK on success
   */
  audio_error_t setRXGain(float gain_db);

  /**
   * Set TX audio level gain (in dB, -24 to +24)
   * @param gain_db Gain in decibels
   * @return AUDIO_ERR_OK on success
   */
  audio_error_t setTXGain(float gain_db);

  /**
   * Set RX DC offset correction
   * @param dc_offset DC offset value to subtract
   * @return AUDIO_ERR_OK on success
   */
  audio_error_t setRXDCOffset(int16_t dc_offset);

  /**
   * Enable/disable silence detection
   * @param enable True to enable, false to disable
   * @return AUDIO_ERR_OK on success
   */
  audio_error_t setSilenceDetection(bool enable);

  /**
   * Get variant information as string
   * @return Pointer to variant name string
   */
  const char* getVariantName() const;

  /**
   * Check if audio pipeline is running
   * @return true if running, false otherwise
   */
  bool isRunning() const;

  /**
   * Check if audio pipeline is initialized
   * @return true if initialized, false otherwise
   */
  bool isInitialized() const;

  /**
   * Get error string description
   * @param error Error code
   * @return Pointer to error description string
   */
  static const char* getErrorString(audio_error_t error);

private:
  // State management
  bool m_initialized;
  bool m_running;
  gpio_num_t m_rx_pin;
  gpio_num_t m_tx_pin;
  adc1_channel_t m_rx_channel;  // ADC1 channel for RX pin

  // Circular ring buffers
  AudioRingBuffer* m_rx_buffer;
  AudioRingBuffer* m_tx_buffer;

  // Audio parameters
  float m_rx_gain;              // RX gain multiplier
  float m_tx_gain;              // TX gain multiplier
  int16_t m_rx_dc_offset;       // RX DC offset
  bool m_silence_detection;     // Enable silence detection
  int32_t m_dc_offset_avg;      // Running DC offset average

  // Statistics
  audio_stats_t m_stats;
  uint32_t m_stats_sample_count; // Samples since last stat update
  uint32_t m_isr_tick_count;    // ISR execution tick counter
  uint32_t m_isr_max_ticks;     // Maximum ISR execution ticks

  // Timer and ISR handles
  intr_handle_t m_isr_handle;

  // Private methods
  audio_error_t initADC();
  audio_error_t initDAC();
  audio_error_t initPWMDAC();
  audio_error_t initTimer();
  void cleanupTimer();
  void cleanupADC();
  void cleanupDAC();
  void updateStatistics(int16_t sample);
  int16_t applyGain(int16_t sample, float gain);
  adc1_channel_t gpioToADC1Channel(gpio_num_t gpio);

  // Static ISR handler wrapper
  friend bool IRAM_ATTR audioTimerISR(void* arg);
};

// Global singleton instance and ISR handler
extern AudioPipeline g_audioPipeline;

// ISR handler function (defined in cpp)
extern bool IRAM_ATTR audioTimerISR(void* arg);

#endif // AUDIO_PIPELINE_H
