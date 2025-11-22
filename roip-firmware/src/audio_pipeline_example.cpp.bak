/*
 * ESP32 RoIP - Audio Pipeline Usage Example
 *
 * This file demonstrates how to use the AudioPipeline class
 * for real-time audio processing in RoIP applications.
 */

#include "audio_pipeline.h"

// Example: Basic audio pipeline usage
void example_basic_usage() {
  // Initialize the global audio pipeline
  audio_error_t err = g_audioPipeline.begin(GPIO_NUM_36, GPIO_NUM_25);
  if (err != AUDIO_ERR_OK) {
    Serial.printf("Audio pipeline init failed: %s\n",
                  AudioPipeline::getErrorString(err));
    return;
  }

  // Set gain levels
  g_audioPipeline.setRXGain(-6.0f);   // -6dB RX gain
  g_audioPipeline.setTXGain(6.0f);    // +6dB TX gain

  // Start audio processing
  err = g_audioPipeline.start();
  if (err != AUDIO_ERR_OK) {
    Serial.printf("Audio pipeline start failed: %s\n",
                  AudioPipeline::getErrorString(err));
    return;
  }

  // Main audio processing loop
  while (g_audioPipeline.isRunning()) {
    // RX Audio Processing
    audio_sample_t rx_sample;
    while (g_audioPipeline.getRXSample(rx_sample)) {
      // Process received audio sample
      // Example: Send to codec, encoder, etc.
      Serial.printf("RX: %d\n", rx_sample);
    }

    // TX Audio Processing
    // Example: Get encoded audio from network/codec
    audio_sample_t tx_sample = 0;  // Replace with actual encoded data
    if (!g_audioPipeline.putTXSample(tx_sample)) {
      // TX buffer full - handle backpressure
    }

    delay(1);  // Yield to other tasks
  }

  // Stop audio pipeline
  g_audioPipeline.stop();
}

// Example: Batch processing with frame sizes
void example_frame_processing() {
  const uint16_t frame_size = AUDIO_FRAME_SAMPLES;  // 480 samples at 24kHz
  audio_sample_t rx_frame[frame_size];
  audio_sample_t tx_frame[frame_size];

  while (g_audioPipeline.isRunning()) {
    // Wait for a complete frame of RX audio
    uint16_t samples_read = 0;
    while (samples_read < frame_size) {
      uint16_t n = g_audioPipeline.getRXSamples(
        &rx_frame[samples_read],
        frame_size - samples_read
      );
      if (n == 0) {
        vTaskDelay(1);  // Wait 1ms and retry
        continue;
      }
      samples_read += n;
    }

    // Process the complete frame
    // Example: Encode with Opus codec
    process_audio_frame(rx_frame, frame_size);

    // Get TX frame to output
    // Example: Decode from Opus codec
    prepare_tx_frame(tx_frame, frame_size);

    // Output TX frame
    uint16_t samples_written = g_audioPipeline.putTXSamples(tx_frame, frame_size);
    if (samples_written != frame_size) {
      Serial.printf("Warning: Could only write %d/%d TX samples\n",
                    samples_written, frame_size);
    }
  }
}

// Example: Audio statistics monitoring
void example_audio_monitoring(void* arg) {
  while (g_audioPipeline.isRunning()) {
    audio_stats_t stats;
    if (g_audioPipeline.getStats(stats) == AUDIO_ERR_OK) {
      Serial.printf("=== Audio Statistics ===\n");
      Serial.printf("Samples: %lu\n", stats.sample_count);
      Serial.printf("RX Peak: %ld, RMS: %ld, DC: %ld\n",
                    stats.peak_level, stats.rms_level, stats.dc_offset);
      Serial.printf("RX Overflows: %lu\n", stats.overflow_count);
      Serial.printf("TX Underflows: %lu\n", stats.underflow_count);
      Serial.printf("Clipped samples: %lu\n", stats.clip_count);
      Serial.printf("Silent samples: %lu\n", stats.silence_count);
      Serial.printf("RX Buffer: %d%%, TX Buffer: %d%%\n",
                    g_audioPipeline.getRXBufferUtil(),
                    g_audioPipeline.getTXBufferUtil());
      Serial.printf("========================\n");
    }

    vTaskDelay(pdMS_TO_TICKS(1000));  // Update every 1 second
  }
}

// Example: Audio with DC offset correction
void example_dc_offset_correction() {
  // Measure DC offset for a short period
  int32_t dc_sum = 0;
  uint32_t sample_count = 0;
  const uint32_t calibration_samples = AUDIO_SAMPLE_RATE;  // 1 second

  Serial.println("Calibrating DC offset...");

  audio_sample_t sample;
  while (sample_count < calibration_samples) {
    if (g_audioPipeline.getRXSample(sample)) {
      dc_sum += sample;
      sample_count++;
    } else {
      delay(1);
    }
  }

  int16_t dc_offset = dc_sum / calibration_samples;
  Serial.printf("Measured DC offset: %d\n", dc_offset);

  // Apply correction
  g_audioPipeline.setRXDCOffset(dc_offset);
  Serial.println("DC offset correction applied");
}

// Example: Audio with silence detection
void example_silence_detection() {
  g_audioPipeline.setSilenceDetection(true);

  while (g_audioPipeline.isRunning()) {
    audio_stats_t stats;
    if (g_audioPipeline.getStats(stats) == AUDIO_ERR_OK) {
      // Check for extended silence (5 seconds at 24kHz)
      if (stats.silence_count > (AUDIO_SAMPLE_RATE * 5)) {
        Serial.println("Extended silence detected - possible squelch condition");

        // Could trigger hangtime, PTT release, or other actions
      }
    }

    vTaskDelay(pdMS_TO_TICKS(100));
  }
}

// Example: Handling buffer overflow/underflow conditions
void example_error_handling() {
  uint32_t overflow_count = 0;
  uint32_t underflow_count = 0;

  while (g_audioPipeline.isRunning()) {
    // Check for RX buffer overflow
    if (g_audioPipeline.hasRXOverflow()) {
      overflow_count++;
      Serial.printf("RX Buffer overflow #%lu (util: %d%%)\n",
                    overflow_count, g_audioPipeline.getRXBufferUtil());

      // Could implement recovery: skip frame, reduce processing load, etc.
    }

    // Check for TX buffer underflow
    if (g_audioPipeline.hasTXOverflow()) {
      underflow_count++;
      Serial.printf("TX Buffer underflow #%lu (util: %d%%)\n",
                    underflow_count, g_audioPipeline.getTXBufferUtil());

      // Could implement recovery: insert silence, resync, etc.
    }

    vTaskDelay(pdMS_TO_TICKS(100));
  }
}

// Example: Multi-variant support verification
void example_variant_info() {
  Serial.printf("Audio Pipeline Variant: %s\n", g_audioPipeline.getVariantName());
  Serial.printf("Initialized: %s\n", g_audioPipeline.isInitialized() ? "Yes" : "No");
  Serial.printf("Running: %s\n", g_audioPipeline.isRunning() ? "Yes" : "No");

#ifdef AUDIO_HAS_BUILTIN_DAC
  Serial.println("Using built-in DAC (8-bit)");
#else
  Serial.println("Using PWM DAC (12-bit)");
#endif
}

// Example: FreeRTOS task integration
void audio_tx_task(void* arg) {
  while (g_audioPipeline.isRunning()) {
    // Get encoded audio from SIP/network layer
    uint8_t encoded_buffer[480];
    uint16_t encoded_size = 0;

    // Pseudo-code: get_encoded_audio(&encoded_buffer, &encoded_size);

    if (encoded_size > 0) {
      // Decode to PCM samples (example using pseudo-code)
      audio_sample_t decoded_samples[480];
      // decode_opus(encoded_buffer, encoded_size, decoded_samples);

      // Output to audio pipeline
      uint16_t written = g_audioPipeline.putTXSamples(decoded_samples, 480);
      if (written < 480) {
        Serial.printf("Warning: TX underrun, only wrote %d samples\n", written);
      }
    }

    vTaskDelay(pdMS_TO_TICKS(20));  // Process every 20ms frame
  }

  vTaskDelete(NULL);
}

void audio_rx_task(void* arg) {
  while (g_audioPipeline.isRunning()) {
    // Collect a frame of audio samples
    audio_sample_t rx_frame[480];
    uint16_t samples_collected = 0;

    while (samples_collected < 480) {
      uint16_t n = g_audioPipeline.getRXSamples(
        &rx_frame[samples_collected],
        480 - samples_collected
      );
      if (n == 0) {
        vTaskDelay(pdMS_TO_TICKS(1));
        continue;
      }
      samples_collected += n;
    }

    // Encode frame (example using pseudo-code)
    uint8_t encoded_buffer[480];
    uint16_t encoded_size = 0;
    // encode_opus(rx_frame, 480, encoded_buffer, &encoded_size);

    // Send to SIP/network layer (pseudo-code)
    // send_to_network(encoded_buffer, encoded_size);

    vTaskDelay(pdMS_TO_TICKS(1));
  }

  vTaskDelete(NULL);
}

// Example: Complete RoIP audio system initialization
void roip_audio_init() {
  Serial.println("Initializing RoIP audio system...");

  // Initialize audio pipeline with variant-specific pins
  gpio_num_t rx_pin = GPIO_NUM_36;  // ADC pin
  gpio_num_t tx_pin = GPIO_NUM_25;  // DAC/PWM pin

  audio_error_t err = g_audioPipeline.begin(rx_pin, tx_pin);
  if (err != AUDIO_ERR_OK) {
    Serial.printf("ERROR: Audio init failed: %s\n",
                  AudioPipeline::getErrorString(err));
    return;
  }

  // Configure audio levels
  g_audioPipeline.setRXGain(-12.0f);   // -12dB RX to reduce noise
  g_audioPipeline.setTXGain(0.0f);     // 0dB TX (unity gain)

  // Start audio processing
  err = g_audioPipeline.start();
  if (err != AUDIO_ERR_OK) {
    Serial.printf("ERROR: Audio start failed: %s\n",
                  AudioPipeline::getErrorString(err));
    return;
  }

  // Launch audio processing tasks
  xTaskCreatePinnedToCore(
    audio_rx_task,
    "AudioRX",
    4096,  // Stack size
    nullptr,
    5,     // Priority
    nullptr,
    1      // Core 1 (leave core 0 for other tasks)
  );

  xTaskCreatePinnedToCore(
    audio_tx_task,
    "AudioTX",
    4096,
    nullptr,
    5,
    nullptr,
    1
  );

  Serial.println("Audio system initialized successfully");
}
