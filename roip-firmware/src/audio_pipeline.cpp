/*
 * ESP32 RoIP - Audio Pipeline Implementation
 * Professional Radio over IP Audio Processing System
 *
 * Timer-based ADC sampling at 24kHz with variant-specific DAC/PWM output
 * ISR-safe circular buffers for real-time audio processing
 *
 * Copyright (C) 2024,2025 by MMDVM ESP32 Port Contributors
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 */

#include "audio_pipeline.h"
#include <driver/dac.h>

#ifdef AUDIO_USE_PWM_DAC
#include <driver/ledc.h>
#endif

#include <sys/time.h>

// Debug logging (can be disabled by compiler flag)
#ifndef AUDIO_PIPELINE_DEBUG
#define AUDIO_PIPELINE_DEBUG 0
#endif

#if AUDIO_PIPELINE_DEBUG
  #define AUDIO_LOG(fmt, ...) Serial.printf("[AudioPipeline] " fmt "\n", ##__VA_ARGS__)
  #define AUDIO_LOGE(fmt, ...) Serial.printf("[AudioPipeline ERROR] " fmt "\n", ##__VA_ARGS__)
#else
  #define AUDIO_LOG(fmt, ...)
  #define AUDIO_LOGE(fmt, ...)
#endif

// ============================================================================
// AudioRingBuffer Implementation
// ============================================================================

AudioRingBuffer::AudioRingBuffer(uint16_t size) :
  m_head(0),
  m_tail(0),
  m_full(false),
  m_overflow(false),
  m_size(size),
  m_mask(size - 1)  // Assumes size is power of 2
{
  m_buffer = new audio_sample_t[size];
  if (m_buffer == nullptr) {
    AUDIO_LOGE("Failed to allocate ring buffer memory");
  }
}

AudioRingBuffer::~AudioRingBuffer() {
  if (m_buffer != nullptr) {
    delete[] m_buffer;
    m_buffer = nullptr;
  }
}

bool AudioRingBuffer::put(audio_sample_t sample) {
  if (m_full) {
    m_overflow = true;
    return false;
  }

  m_buffer[m_head] = sample;
  m_head = (m_head + 1) & m_mask;

  if (m_head == m_tail) {
    m_full = true;
  }

  return true;
}

bool AudioRingBuffer::get(audio_sample_t& sample) {
  if (m_head == m_tail && !m_full) {
    return false;  // Buffer empty
  }

  sample = m_buffer[m_tail];
  m_tail = (m_tail + 1) & m_mask;
  m_full = false;

  return true;
}

uint16_t AudioRingBuffer::getSpace() const {
  uint16_t space;

  if (m_head == m_tail) {
    space = m_full ? 0 : m_size;
  } else if (m_head > m_tail) {
    space = m_size - m_head + m_tail;
  } else {
    space = m_tail - m_head;
  }

  return space;
}

uint16_t AudioRingBuffer::getData() const {
  if (m_head == m_tail) {
    return m_full ? m_size : 0;
  } else if (m_head > m_tail) {
    return m_head - m_tail;
  } else {
    return m_size - m_tail + m_head;
  }
}

bool AudioRingBuffer::hasOverflowed() const {
  return m_overflow;
}

void AudioRingBuffer::resetOverflow() {
  m_overflow = false;
}

void AudioRingBuffer::clear() {
  m_head = 0;
  m_tail = 0;
  m_full = false;
  m_overflow = false;
}

uint8_t AudioRingBuffer::getUtilization() const {
  uint16_t data = getData();
  return (data * 100) / m_size;
}

// ============================================================================
// Global Instance and ISR Handler
// ============================================================================

static AudioPipeline* g_pAudioPipeline = nullptr;

// ISR-safe timer interrupt handler
bool IRAM_ATTR audioTimerISR(void* arg) {
  AudioPipeline* pThis = (AudioPipeline*)arg;
  if (pThis == nullptr) {
    return false;
  }

  // Read ADC sample
  uint16_t adc_raw = adc1_get_raw(pThis->m_rx_channel);

  // Convert from 12-bit ADC (0-4095) to signed 16-bit (-2048 to 2047)
  int16_t adc_sample = adc_raw - 2048;  // Center at 0

  // Apply DC offset correction
  adc_sample -= pThis->m_rx_dc_offset;

  // Clamp to prevent overflow
  if (adc_sample > 2047) adc_sample = 2047;
  if (adc_sample < -2048) adc_sample = -2048;

  // Scale to 16-bit range
  int16_t rx_sample = adc_sample << 3;  // Shift left by 3 for 16-bit

  // Add to RX buffer
  pThis->m_rx_buffer->put(rx_sample);

  // Get TX sample and output to DAC/PWM
  audio_sample_t tx_sample;
  if (pThis->m_tx_buffer->get(tx_sample)) {
    // Apply TX gain
    int16_t output = pThis->applyGain(tx_sample, pThis->m_tx_gain);

    // Convert from 16-bit to output range
#ifdef AUDIO_HAS_BUILTIN_DAC
    // 8-bit DAC: convert from 16-bit signed to 8-bit unsigned
    uint8_t dac_val = ((output >> 8) + 128) & 0xFF;
    dac_output_voltage(DAC_CHANNEL_1, dac_val);
#else
    // PWM DAC: convert from 16-bit signed to 12-bit unsigned
    uint16_t pwm_val = ((output >> 4) + 2048) & 0xFFF;
    ledc_set_duty(AUDIO_PWM_SPEED_MODE, AUDIO_PWM_CHANNEL, pwm_val);
    ledc_update_duty(AUDIO_PWM_SPEED_MODE, AUDIO_PWM_CHANNEL);
#endif
  } else {
    // No TX sample available - output silence or default value
#ifdef AUDIO_HAS_BUILTIN_DAC
    dac_output_voltage(DAC_CHANNEL_1, 128);  // Mid-scale
#else
    ledc_set_duty(AUDIO_PWM_SPEED_MODE, AUDIO_PWM_CHANNEL, 2048);
    ledc_update_duty(AUDIO_PWM_SPEED_MODE, AUDIO_PWM_CHANNEL);
#endif
  }

  // Update statistics every ~1 second
  pThis->m_isr_tick_count++;

  // Clear timer interrupt
  timer_group_clr_intr_status_in_isr(AUDIO_TIMER_GROUP, AUDIO_TIMER_IDX);

  // Re-enable the alarm
  timer_group_enable_alarm_in_isr(AUDIO_TIMER_GROUP, AUDIO_TIMER_IDX);

  return false;  // No higher priority task woken
}

// ============================================================================
// AudioPipeline Implementation
// ============================================================================

AudioPipeline::AudioPipeline() :
  m_initialized(false),
  m_running(false),
  m_rx_pin(GPIO_NUM_NC),
  m_tx_pin(GPIO_NUM_NC),
  m_rx_channel(ADC1_CHANNEL_MAX),
  m_rx_buffer(nullptr),
  m_tx_buffer(nullptr),
  m_rx_gain(1.0f),
  m_tx_gain(1.0f),
  m_rx_dc_offset(0),
  m_silence_detection(true),
  m_dc_offset_avg(0),
  m_isr_handle(nullptr),
  m_isr_tick_count(0),
  m_isr_max_ticks(0)
{
  memset(&m_stats, 0, sizeof(m_stats));
  m_stats.last_update_ms = millis();
}

AudioPipeline::~AudioPipeline() {
  if (m_running) {
    stop();
  }

  if (m_rx_buffer != nullptr) {
    delete m_rx_buffer;
    m_rx_buffer = nullptr;
  }

  if (m_tx_buffer != nullptr) {
    delete m_tx_buffer;
    m_tx_buffer = nullptr;
  }

  m_initialized = false;
}

audio_error_t AudioPipeline::begin(gpio_num_t rxPin, gpio_num_t txPin) {
  if (m_initialized) {
    return AUDIO_ERR_ALREADY_RUNNING;
  }

  m_rx_pin = rxPin;
  m_tx_pin = txPin;

  // Convert GPIO pin to ADC1 channel
  m_rx_channel = gpioToADC1Channel(rxPin);
  if (m_rx_channel == ADC1_CHANNEL_MAX) {
    AUDIO_LOGE("Invalid ADC1 pin: %d", rxPin);
    return AUDIO_ERR_INVALID_PARAMETER;
  }

  // Allocate ring buffers
  m_rx_buffer = new AudioRingBuffer(AUDIO_RINGBUFFER_SIZE);
  m_tx_buffer = new AudioRingBuffer(AUDIO_RINGBUFFER_SIZE);

  if (m_rx_buffer == nullptr || m_tx_buffer == nullptr) {
    AUDIO_LOGE("Failed to allocate ring buffers");
    return AUDIO_ERR_OUT_OF_MEMORY;
  }

  // Initialize ADC
  audio_error_t err = initADC();
  if (err != AUDIO_ERR_OK) {
    AUDIO_LOGE("ADC initialization failed: %d", err);
    return err;
  }

  // Initialize DAC or PWM
#ifdef AUDIO_HAS_BUILTIN_DAC
  err = initDAC();
  if (err != AUDIO_ERR_OK) {
    AUDIO_LOGE("DAC initialization failed: %d", err);
    return err;
  }
#else
  err = initPWMDAC();
  if (err != AUDIO_ERR_OK) {
    AUDIO_LOGE("PWM DAC initialization failed: %d", err);
    return err;
  }
#endif

  // Initialize timer
  err = initTimer();
  if (err != AUDIO_ERR_OK) {
    AUDIO_LOGE("Timer initialization failed: %d", err);
    return err;
  }

  g_pAudioPipeline = this;
  m_initialized = true;

  AUDIO_LOG("Audio pipeline initialized successfully (%s)", getVariantName());
  return AUDIO_ERR_OK;
}

audio_error_t AudioPipeline::start() {
  if (!m_initialized) {
    return AUDIO_ERR_NOT_INITIALIZED;
  }

  if (m_running) {
    return AUDIO_ERR_ALREADY_RUNNING;
  }

  // Clear buffers
  if (m_rx_buffer) m_rx_buffer->clear();
  if (m_tx_buffer) m_tx_buffer->clear();

  // Start timer
  timer_start(AUDIO_TIMER_GROUP, AUDIO_TIMER_IDX);

  m_running = true;
  m_isr_tick_count = 0;
  m_isr_max_ticks = 0;

  AUDIO_LOG("Audio pipeline started");
  return AUDIO_ERR_OK;
}

audio_error_t AudioPipeline::stop() {
  if (!m_initialized) {
    return AUDIO_ERR_NOT_INITIALIZED;
  }

  if (!m_running) {
    return AUDIO_ERR_OK;  // Already stopped
  }

  // Stop timer
  timer_pause(AUDIO_TIMER_GROUP, AUDIO_TIMER_IDX);

  m_running = false;

  AUDIO_LOG("Audio pipeline stopped");
  return AUDIO_ERR_OK;
}

bool AudioPipeline::getRXSample(audio_sample_t& sample) {
  if (!m_initialized || m_rx_buffer == nullptr) {
    return false;
  }

  return m_rx_buffer->get(sample);
}

uint16_t AudioPipeline::getRXSamples(audio_sample_t* buffer, uint16_t count) {
  if (!m_initialized || m_rx_buffer == nullptr || buffer == nullptr) {
    return 0;
  }

  uint16_t samples_read = 0;
  for (uint16_t i = 0; i < count; i++) {
    if (!m_rx_buffer->get(buffer[i])) {
      break;
    }
    samples_read++;
  }

  return samples_read;
}

bool AudioPipeline::putTXSample(audio_sample_t sample) {
  if (!m_initialized || m_tx_buffer == nullptr) {
    return false;
  }

  return m_tx_buffer->put(sample);
}

uint16_t AudioPipeline::putTXSamples(const audio_sample_t* buffer, uint16_t count) {
  if (!m_initialized || m_tx_buffer == nullptr || buffer == nullptr) {
    return 0;
  }

  uint16_t samples_written = 0;
  for (uint16_t i = 0; i < count; i++) {
    if (!m_tx_buffer->put(buffer[i])) {
      break;
    }
    samples_written++;
  }

  return samples_written;
}

audio_error_t AudioPipeline::getStats(audio_stats_t& stats) {
  if (!m_initialized) {
    return AUDIO_ERR_NOT_INITIALIZED;
  }

  // Create a copy of current stats
  stats = m_stats;

  // Add current buffer information
  if (m_rx_buffer) {
    if (m_rx_buffer->hasOverflowed()) {
      m_stats.overflow_count++;
      m_rx_buffer->resetOverflow();
    }
  }

  if (m_tx_buffer) {
    if (m_tx_buffer->hasOverflowed()) {
      m_stats.underflow_count++;
      m_tx_buffer->resetOverflow();
    }
  }

  stats = m_stats;
  return AUDIO_ERR_OK;
}

audio_error_t AudioPipeline::resetStats() {
  if (!m_initialized) {
    return AUDIO_ERR_NOT_INITIALIZED;
  }

  memset(&m_stats, 0, sizeof(m_stats));
  m_stats.last_update_ms = millis();
  m_stats_sample_count = 0;

  if (m_rx_buffer) m_rx_buffer->resetOverflow();
  if (m_tx_buffer) m_tx_buffer->resetOverflow();

  return AUDIO_ERR_OK;
}

bool AudioPipeline::hasRXOverflow() const {
  if (m_rx_buffer == nullptr) {
    return false;
  }
  return m_rx_buffer->hasOverflowed();
}

bool AudioPipeline::hasTXOverflow() const {
  if (m_tx_buffer == nullptr) {
    return false;
  }
  return m_tx_buffer->hasOverflowed();
}

uint8_t AudioPipeline::getRXBufferUtil() const {
  if (m_rx_buffer == nullptr) {
    return 0;
  }
  return m_rx_buffer->getUtilization();
}

uint8_t AudioPipeline::getTXBufferUtil() const {
  if (m_tx_buffer == nullptr) {
    return 0;
  }
  return m_tx_buffer->getUtilization();
}

audio_error_t AudioPipeline::setRXGain(float gain_db) {
  if (gain_db < -24.0f || gain_db > 24.0f) {
    return AUDIO_ERR_INVALID_PARAMETER;
  }

  // Convert dB to linear gain: gain = 10^(dB/20)
  m_rx_gain = powf(10.0f, gain_db / 20.0f);
  return AUDIO_ERR_OK;
}

audio_error_t AudioPipeline::setTXGain(float gain_db) {
  if (gain_db < -24.0f || gain_db > 24.0f) {
    return AUDIO_ERR_INVALID_PARAMETER;
  }

  // Convert dB to linear gain: gain = 10^(dB/20)
  m_tx_gain = powf(10.0f, gain_db / 20.0f);
  return AUDIO_ERR_OK;
}

audio_error_t AudioPipeline::setRXDCOffset(int16_t dc_offset) {
  m_rx_dc_offset = dc_offset;
  return AUDIO_ERR_OK;
}

audio_error_t AudioPipeline::setSilenceDetection(bool enable) {
  m_silence_detection = enable;
  return AUDIO_ERR_OK;
}

const char* AudioPipeline::getVariantName() const {
#ifdef AUDIO_VARIANT_ESP32
  return "ESP32";
#elif defined(AUDIO_VARIANT_ESP32S2)
  return "ESP32-S2";
#elif defined(AUDIO_VARIANT_ESP32S3)
  return "ESP32-S3";
#elif defined(AUDIO_VARIANT_ESP32C3)
  return "ESP32-C3";
#elif defined(AUDIO_VARIANT_ESP32C5)
  return "ESP32-C5";
#elif defined(AUDIO_VARIANT_ESP32C6)
  return "ESP32-C6";
#elif defined(AUDIO_VARIANT_ESP32H2)
  return "ESP32-H2";
#else
  return "Unknown";
#endif
}

bool AudioPipeline::isRunning() const {
  return m_running;
}

bool AudioPipeline::isInitialized() const {
  return m_initialized;
}

const char* AudioPipeline::getErrorString(audio_error_t error) {
  switch (error) {
    case AUDIO_ERR_OK:
      return "No error";
    case AUDIO_ERR_NOT_INITIALIZED:
      return "Audio pipeline not initialized";
    case AUDIO_ERR_ALREADY_RUNNING:
      return "Audio pipeline already running or initialized";
    case AUDIO_ERR_INVALID_PARAMETER:
      return "Invalid parameter";
    case AUDIO_ERR_ADC_INIT_FAILED:
      return "ADC initialization failed";
    case AUDIO_ERR_DAC_INIT_FAILED:
      return "DAC initialization failed";
    case AUDIO_ERR_TIMER_INIT_FAILED:
      return "Timer initialization failed";
    case AUDIO_ERR_PWM_INIT_FAILED:
      return "PWM initialization failed";
    case AUDIO_ERR_BUFFER_OVERFLOW:
      return "Buffer overflow";
    case AUDIO_ERR_BUFFER_UNDERFLOW:
      return "Buffer underflow";
    case AUDIO_ERR_OUT_OF_MEMORY:
      return "Out of memory";
    case AUDIO_ERR_ISR_ALLOC_FAILED:
      return "ISR allocation failed";
    default:
      return "Unknown error";
  }
}

// ============================================================================
// Private Methods - Hardware Initialization
// ============================================================================

audio_error_t AudioPipeline::initADC() {
  esp_err_t err;

  // Configure ADC1 unit
  err = adc1_config_width(AUDIO_ADC_RESOLUTION);
  if (err != ESP_OK) {
    AUDIO_LOGE("ADC width config failed");
    return AUDIO_ERR_ADC_INIT_FAILED;
  }

  // Configure ADC1 input pin
  err = adc1_config_channel_atten(m_rx_channel, AUDIO_ADC_ATTEN);
  if (err != ESP_OK) {
    AUDIO_LOGE("ADC channel config failed");
    return AUDIO_ERR_ADC_INIT_FAILED;
  }

  // ADC power management is now automatic in newer ESP-IDF

  AUDIO_LOG("ADC initialized on pin %d, channel %d", m_rx_pin, m_rx_channel);
  return AUDIO_ERR_OK;
}

audio_error_t AudioPipeline::initDAC() {
#ifdef AUDIO_HAS_BUILTIN_DAC
  esp_err_t err;

  // Configure DAC1
  err = dac_output_enable(DAC_CHANNEL_1);
  if (err != ESP_OK) {
    AUDIO_LOGE("DAC enable failed");
    return AUDIO_ERR_DAC_INIT_FAILED;
  }

  // Set initial DAC value (mid-scale silence)
  dac_output_voltage(DAC_CHANNEL_1, 128);

  AUDIO_LOG("DAC initialized on pin %d", m_tx_pin);
  return AUDIO_ERR_OK;
#else
  return AUDIO_ERR_DAC_INIT_FAILED;  // Should not reach here
#endif
}

audio_error_t AudioPipeline::initPWMDAC() {
#ifdef AUDIO_USE_PWM_DAC
  esp_err_t err;

  // Configure LEDC PWM timer
  ledc_timer_config_t timer_conf = {
    .speed_mode = AUDIO_PWM_SPEED_MODE,
    .duty_resolution = LEDC_TIMER_12_BIT,
    .timer_num = AUDIO_PWM_TIMER,
    .freq_hz = AUDIO_PWM_FREQUENCY,
    .clk_cfg = LEDC_AUTO_CLK,
    .decimate = 0
  };

  err = ledc_timer_config(&timer_conf);
  if (err != ESP_OK) {
    AUDIO_LOGE("LEDC timer config failed");
    return AUDIO_ERR_PWM_INIT_FAILED;
  }

  // Configure LEDC PWM channel
  ledc_channel_config_t channel_conf = {
    .gpio_num = m_tx_pin,
    .speed_mode = AUDIO_PWM_SPEED_MODE,
    .channel = AUDIO_PWM_CHANNEL,
    .intr_type = LEDC_INTR_DISABLE,
    .timer_sel = AUDIO_PWM_TIMER,
    .duty = 2048,  // 50% duty cycle (mid-scale)
    .hpoint = 0,
    .flags = {.output_invert = 0}
  };

  err = ledc_channel_config(&channel_conf);
  if (err != ESP_OK) {
    AUDIO_LOGE("LEDC channel config failed");
    return AUDIO_ERR_PWM_INIT_FAILED;
  }

  AUDIO_LOG("PWM DAC initialized on pin %d (freq=%dHz)", m_tx_pin, AUDIO_PWM_FREQUENCY);
  return AUDIO_ERR_OK;
#else
  return AUDIO_ERR_PWM_INIT_FAILED;  // Should not reach here
#endif
}

audio_error_t AudioPipeline::initTimer() {
  esp_err_t err;

  // Stop timer first
  timer_pause(AUDIO_TIMER_GROUP, AUDIO_TIMER_IDX);
  timer_set_counter_value(AUDIO_TIMER_GROUP, AUDIO_TIMER_IDX, 0);

  // Configure timer
  timer_config_t timer_conf = {
    .alarm_en = TIMER_ALARM_EN,
    .counter_en = TIMER_PAUSE,
    .intr_type = TIMER_INTR_LEVEL,
    .counter_dir = TIMER_COUNT_UP,
    .auto_reload = TIMER_AUTORELOAD_EN,
    .divider = AUDIO_TIMER_DIVIDER,
#ifdef TIMER_CLOCK_RESOLUTION_HZ_FIELD
    .clk_src = TIMER_SRC_CLK_APB,
#endif
  };

  err = timer_init(AUDIO_TIMER_GROUP, AUDIO_TIMER_IDX, &timer_conf);
  if (err != ESP_OK) {
    AUDIO_LOGE("Timer config failed");
    return AUDIO_ERR_TIMER_INIT_FAILED;
  }

  // Set alarm value for 24kHz sampling
  err = timer_set_alarm_value(AUDIO_TIMER_GROUP, AUDIO_TIMER_IDX, AUDIO_TIMER_ALARM);
  if (err != ESP_OK) {
    AUDIO_LOGE("Timer alarm config failed");
    return AUDIO_ERR_TIMER_INIT_FAILED;
  }

  // Register ISR handler
  err = timer_isr_callback_add(AUDIO_TIMER_GROUP, AUDIO_TIMER_IDX,
                                audioTimerISR, (void*)this, 0);
  if (err != ESP_OK) {
    AUDIO_LOGE("Timer ISR registration failed");
    return AUDIO_ERR_ISR_ALLOC_FAILED;
  }

  AUDIO_LOG("Timer initialized (sample_rate=%dHz, divider=%d, alarm=%d)",
            AUDIO_SAMPLE_RATE, AUDIO_TIMER_DIVIDER, AUDIO_TIMER_ALARM);

  return AUDIO_ERR_OK;
}

void AudioPipeline::cleanupTimer() {
  if (m_running) {
    timer_pause(AUDIO_TIMER_GROUP, AUDIO_TIMER_IDX);
  }
  // ISR will be automatically removed on application shutdown
}

void AudioPipeline::cleanupADC() {
  // ADC power management is now automatic in newer ESP-IDF
}

void AudioPipeline::cleanupDAC() {
#ifdef AUDIO_HAS_BUILTIN_DAC
  dac_output_disable(DAC_CHANNEL_1);
#endif
}

int16_t AudioPipeline::applyGain(int16_t sample, float gain) {
  // Apply gain with clipping protection
  int32_t output = (int32_t)sample * gain;

  // Clamp to 16-bit range
  if (output > 32767) output = 32767;
  if (output < -32768) output = -32768;

  return (int16_t)output;
}

void AudioPipeline::updateStatistics(int16_t sample) {
  // Update sample counter
  m_stats.sample_count++;
  m_stats_sample_count++;

  // Track peak level
  int32_t abs_sample = sample > 0 ? sample : -sample;
  if (abs_sample > m_stats.peak_level) {
    m_stats.peak_level = abs_sample;
  }

  // Update DC offset estimate using exponential moving average
  m_dc_offset_avg = (m_dc_offset_avg * 99 + sample) / 100;
  m_stats.dc_offset = m_dc_offset_avg;

  // Detect clipping
  if (abs_sample > 30000) {
    m_stats.clip_count++;
  }

  // Detect silence
  if (abs_sample < AUDIO_SILENCE_THRESHOLD) {
    m_stats.silence_count++;
  } else {
    m_stats.silence_count = 0;
  }

  // Update statistics every second
  uint32_t current_ms = millis();
  if (current_ms - m_stats.last_update_ms >= AUDIO_STATS_WINDOW_MS) {
    m_stats.last_update_ms = current_ms;

    // Calculate RMS level
    if (m_stats_sample_count > 0) {
      // Simplified RMS calculation
      m_stats.rms_level = m_stats.peak_level / 2;
    }

    m_stats_sample_count = 0;
  }
}

adc1_channel_t AudioPipeline::gpioToADC1Channel(gpio_num_t gpio) {
  // GPIO to ADC1 channel mapping for ESP32 variants
  switch (gpio) {
#if defined(ESP32)
    case GPIO_NUM_36: return ADC1_CHANNEL_0;
    case GPIO_NUM_37: return ADC1_CHANNEL_1;
    case GPIO_NUM_38: return ADC1_CHANNEL_2;
    case GPIO_NUM_39: return ADC1_CHANNEL_3;
    case GPIO_NUM_32: return ADC1_CHANNEL_4;
    case GPIO_NUM_33: return ADC1_CHANNEL_5;
    case GPIO_NUM_34: return ADC1_CHANNEL_6;
    case GPIO_NUM_35: return ADC1_CHANNEL_7;
#elif defined(ESP32S2) || defined(ESP32S3)
    case GPIO_NUM_1:  return ADC1_CHANNEL_0;
    case GPIO_NUM_2:  return ADC1_CHANNEL_1;
    case GPIO_NUM_3:  return ADC1_CHANNEL_2;
    case GPIO_NUM_4:  return ADC1_CHANNEL_3;
    case GPIO_NUM_5:  return ADC1_CHANNEL_4;
    case GPIO_NUM_6:  return ADC1_CHANNEL_5;
    case GPIO_NUM_7:  return ADC1_CHANNEL_6;
    case GPIO_NUM_8:  return ADC1_CHANNEL_7;
    case GPIO_NUM_9:  return ADC1_CHANNEL_8;
    case GPIO_NUM_10: return ADC1_CHANNEL_9;
#elif defined(ESP32C3) || defined(ESP32C6)
    case GPIO_NUM_0:  return ADC1_CHANNEL_0;
    case GPIO_NUM_1:  return ADC1_CHANNEL_1;
    case GPIO_NUM_2:  return ADC1_CHANNEL_2;
    case GPIO_NUM_3:  return ADC1_CHANNEL_3;
    case GPIO_NUM_4:  return ADC1_CHANNEL_4;
#endif
    default:
      return ADC1_CHANNEL_MAX;  // Invalid channel
  }
}

// ============================================================================
// Global Audio Pipeline Instance
// ============================================================================

AudioPipeline g_audioPipeline;
