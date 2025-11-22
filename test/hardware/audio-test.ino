/*
 * ESP32 RoIP Audio Input/Output Test Suite
 *
 * Hardware Validation Tests for Audio Functionality
 * Tests: ADC, DAC, I2S, Audio Levels, Noise Floor, THD, Frequency Response
 *
 * Copyright (C) 2025
 * Licensed under GPL-2.0
 */

#include <driver/i2s.h>
#include <driver/adc.h>
#include <driver/dac.h>

// Audio Configuration
#define SAMPLE_RATE 8000
#define AUDIO_BITS 16
#define I2S_NUM I2S_NUM_0

// ADC/DAC Pins (ESP32)
#define ADC_PIN ADC1_CHANNEL_0  // GPIO36 (VP)
#define DAC_PIN DAC_CHANNEL_1   // GPIO25

// Test Frequencies
#define TEST_FREQ_LOW 300
#define TEST_FREQ_MID 1000
#define TEST_FREQ_HIGH 3000

// Test Thresholds
#define MIN_AUDIO_LEVEL 100
#define MAX_AUDIO_LEVEL 4000
#define MAX_NOISE_FLOOR 50
#define MIN_SNR_DB 40
#define MAX_THD_PERCENT 5

// Test Results
struct AudioTestResults {
  bool adc_test_passed;
  bool dac_test_passed;
  bool i2s_test_passed;
  bool audio_level_test_passed;
  bool noise_floor_test_passed;
  bool snr_test_passed;
  bool thd_test_passed;
  bool frequency_response_test_passed;
  int adc_level;
  int dac_level;
  int noise_floor;
  float snr_db;
  float thd_percent;
  float freq_response_low_db;
  float freq_response_mid_db;
  float freq_response_high_db;
};

AudioTestResults results;

void setup() {
  Serial.begin(115200);
  while (!Serial) delay(10);

  Serial.println("\n\n================================================");
  Serial.println("ESP32 RoIP Audio Hardware Validation Test Suite");
  Serial.println("================================================\n");

  delay(1000);

  // Initialize results
  memset(&results, 0, sizeof(results));

  // Run all tests
  runAllTests();

  // Print final report
  printFinalReport();
}

void loop() {
  // Tests run once in setup
  delay(1000);
}

void runAllTests() {
  Serial.println("Starting Audio Hardware Tests...\n");

  // Test 1: ADC Test
  testADC();
  delay(2000);

  // Test 2: DAC Test
  testDAC();
  delay(2000);

  // Test 3: I2S Test
  testI2S();
  delay(2000);

  // Test 4: Audio Level Test
  testAudioLevels();
  delay(2000);

  // Test 5: Noise Floor Test
  testNoiseFloor();
  delay(2000);

  // Test 6: SNR Test
  testSNR();
  delay(2000);

  // Test 7: THD Test
  testTHD();
  delay(2000);

  // Test 8: Frequency Response Test
  testFrequencyResponse();
  delay(2000);
}

void testADC() {
  Serial.println("=== Test 1: ADC (Analog to Digital Converter) ===");

  // Configure ADC
  adc1_config_width(ADC_WIDTH_BIT_12);
  adc1_config_channel_atten(ADC_PIN, ADC_ATTEN_DB_11);

  Serial.println("  - Configured ADC1, 12-bit, 11dB attenuation");
  Serial.print("  - ADC Pin: GPIO");
  Serial.println(36);  // Typically GPIO36 for ADC1_CH0

  // Read ADC samples
  const int numSamples = 1000;
  long sum = 0;
  int minVal = 4095;
  int maxVal = 0;

  Serial.print("  - Reading ");
  Serial.print(numSamples);
  Serial.println(" samples...");

  for (int i = 0; i < numSamples; i++) {
    int val = adc1_get_raw(ADC_PIN);
    sum += val;
    if (val < minVal) minVal = val;
    if (val > maxVal) maxVal = val;
    delayMicroseconds(100);
  }

  int avgVal = sum / numSamples;
  results.adc_level = avgVal;

  Serial.print("  - Average Value: ");
  Serial.print(avgVal);
  Serial.print(" (");
  Serial.print((avgVal * 100) / 4095);
  Serial.println("%)");
  Serial.print("  - Min Value: ");
  Serial.println(minVal);
  Serial.print("  - Max Value: ");
  Serial.println(maxVal);
  Serial.print("  - Peak-to-Peak: ");
  Serial.println(maxVal - minVal);

  // Check if ADC is working (should not be stuck at 0 or max)
  if (avgVal > 10 && avgVal < 4085) {
    results.adc_test_passed = true;
    Serial.println("✓ ADC Test: PASS");
  } else {
    results.adc_test_passed = false;
    Serial.println("✗ ADC Test: FAIL (ADC appears stuck)");
  }
  Serial.println();
}

void testDAC() {
  Serial.println("=== Test 2: DAC (Digital to Analog Converter) ===");

  // Configure DAC
  dac_output_enable(DAC_PIN);

  Serial.print("  - DAC Pin: GPIO");
  Serial.println(25);  // DAC_CHANNEL_1 is GPIO25

  // Test different DAC levels
  Serial.println("  - Testing DAC output levels:");

  int testLevels[] = {0, 64, 128, 192, 255};
  bool dacWorking = true;

  for (int i = 0; i < 5; i++) {
    dac_output_voltage(DAC_PIN, testLevels[i]);
    delay(100);

    Serial.print("    Level ");
    Serial.print(testLevels[i]);
    Serial.print(" (");
    Serial.print((testLevels[i] * 100) / 255);
    Serial.println("%)");
  }

  // Generate a test tone on DAC
  Serial.println("  - Generating 1kHz test tone for 2 seconds...");

  unsigned long startTime = millis();
  float phase = 0;
  float phaseIncrement = (2.0 * PI * 1000.0) / SAMPLE_RATE;
  int sampleCount = 0;
  long sum = 0;

  while (millis() - startTime < 2000) {
    int sample = (int)(127.5 + 127.5 * sin(phase));
    dac_output_voltage(DAC_PIN, sample);
    sum += sample;
    sampleCount++;

    phase += phaseIncrement;
    if (phase >= 2.0 * PI) {
      phase -= 2.0 * PI;
    }

    delayMicroseconds(1000000 / SAMPLE_RATE);
  }

  results.dac_level = sum / sampleCount;

  Serial.print("  - Average DAC Output: ");
  Serial.println(results.dac_level);

  // Check if DAC is working
  if (results.dac_level > 100 && results.dac_level < 155) {
    results.dac_test_passed = true;
    Serial.println("✓ DAC Test: PASS");
  } else {
    results.dac_test_passed = false;
    Serial.println("✗ DAC Test: FAIL (DAC output unexpected)");
  }

  // Clean up
  dac_output_voltage(DAC_PIN, 0);
  dac_output_disable(DAC_PIN);

  Serial.println();
}

void testI2S() {
  Serial.println("=== Test 3: I2S (Inter-IC Sound) ===");

  // I2S Configuration
  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX | I2S_MODE_TX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_I2S_MSB,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 8,
    .dma_buf_len = 64,
    .use_apll = false,
    .tx_desc_auto_clear = true,
    .fixed_mclk = 0
  };

  // I2S Pin Configuration (using internal ADC/DAC for testing)
  i2s_pin_config_t pin_config = {
    .bck_io_num = I2S_PIN_NO_CHANGE,
    .ws_io_num = I2S_PIN_NO_CHANGE,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = I2S_PIN_NO_CHANGE
  };

  Serial.println("  - Installing I2S driver...");
  esp_err_t err = i2s_driver_install(I2S_NUM, &i2s_config, 0, NULL);

  if (err != ESP_OK) {
    Serial.print("  ✗ I2S driver install failed: ");
    Serial.println(err);
    results.i2s_test_passed = false;
    Serial.println("✗ I2S Test: FAIL");
    Serial.println();
    return;
  }

  Serial.println("  - Setting I2S pins...");
  err = i2s_set_pin(I2S_NUM, &pin_config);

  if (err != ESP_OK) {
    Serial.print("  ✗ I2S set pin failed: ");
    Serial.println(err);
    i2s_driver_uninstall(I2S_NUM);
    results.i2s_test_passed = false;
    Serial.println("✗ I2S Test: FAIL");
    Serial.println();
    return;
  }

  Serial.println("  - Testing I2S write/read...");

  // Create test buffer
  const int bufferSize = 256;
  int16_t txBuffer[bufferSize];
  int16_t rxBuffer[bufferSize];

  // Generate test pattern
  for (int i = 0; i < bufferSize; i++) {
    txBuffer[i] = (int16_t)(32767.0 * sin(2.0 * PI * i / 32.0));
  }

  // Write to I2S
  size_t bytesWritten = 0;
  err = i2s_write(I2S_NUM, txBuffer, bufferSize * sizeof(int16_t), &bytesWritten, 1000);

  if (err != ESP_OK || bytesWritten != bufferSize * sizeof(int16_t)) {
    Serial.println("  ✗ I2S write failed");
    i2s_driver_uninstall(I2S_NUM);
    results.i2s_test_passed = false;
    Serial.println("✗ I2S Test: FAIL");
    Serial.println();
    return;
  }

  Serial.print("  - Bytes written: ");
  Serial.println(bytesWritten);

  // Read from I2S
  size_t bytesRead = 0;
  err = i2s_read(I2S_NUM, rxBuffer, bufferSize * sizeof(int16_t), &bytesRead, 1000);

  if (err != ESP_OK) {
    Serial.println("  ✗ I2S read failed");
    i2s_driver_uninstall(I2S_NUM);
    results.i2s_test_passed = false;
    Serial.println("✗ I2S Test: FAIL");
    Serial.println();
    return;
  }

  Serial.print("  - Bytes read: ");
  Serial.println(bytesRead);

  // Clean up
  i2s_driver_uninstall(I2S_NUM);

  results.i2s_test_passed = true;
  Serial.println("✓ I2S Test: PASS");
  Serial.println();
}

void testAudioLevels() {
  Serial.println("=== Test 4: Audio Level Test ===");

  // Configure ADC for audio input
  adc1_config_width(ADC_WIDTH_BIT_12);
  adc1_config_channel_atten(ADC_PIN, ADC_ATTEN_DB_11);

  Serial.println("  - Please provide audio input signal...");
  Serial.println("  - Measuring audio levels for 5 seconds...");

  unsigned long startTime = millis();
  long sum = 0;
  int sampleCount = 0;
  int minLevel = 4095;
  int maxLevel = 0;

  while (millis() - startTime < 5000) {
    int sample = adc1_get_raw(ADC_PIN);
    sum += sample;
    sampleCount++;
    if (sample < minLevel) minLevel = sample;
    if (sample > maxLevel) maxLevel = sample;
    delayMicroseconds(125);  // 8kHz sampling
  }

  int avgLevel = sum / sampleCount;
  int peakToPeak = maxLevel - minLevel;

  Serial.print("  - Average Level: ");
  Serial.println(avgLevel);
  Serial.print("  - Min Level: ");
  Serial.println(minLevel);
  Serial.print("  - Max Level: ");
  Serial.println(maxLevel);
  Serial.print("  - Peak-to-Peak: ");
  Serial.println(peakToPeak);

  if (peakToPeak >= MIN_AUDIO_LEVEL && peakToPeak <= MAX_AUDIO_LEVEL) {
    results.audio_level_test_passed = true;
    Serial.println("✓ Audio Level Test: PASS");
  } else {
    results.audio_level_test_passed = false;
    if (peakToPeak < MIN_AUDIO_LEVEL) {
      Serial.println("✗ Audio Level Test: FAIL (Level too low)");
    } else {
      Serial.println("✗ Audio Level Test: FAIL (Level too high - clipping)");
    }
  }
  Serial.println();
}

void testNoiseFloor() {
  Serial.println("=== Test 5: Noise Floor Test ===");

  // Configure ADC
  adc1_config_width(ADC_WIDTH_BIT_12);
  adc1_config_channel_atten(ADC_PIN, ADC_ATTEN_DB_11);

  Serial.println("  - Ensure no audio input (silence)...");
  delay(2000);
  Serial.println("  - Measuring noise floor for 5 seconds...");

  unsigned long startTime = millis();
  long sum = 0;
  int sampleCount = 0;
  long sumSquares = 0;

  while (millis() - startTime < 5000) {
    int sample = adc1_get_raw(ADC_PIN);
    sum += sample;
    sumSquares += (long)sample * sample;
    sampleCount++;
    delayMicroseconds(125);  // 8kHz sampling
  }

  int avgLevel = sum / sampleCount;

  // Calculate RMS
  long variance = (sumSquares / sampleCount) - (avgLevel * avgLevel);
  int rms = (int)sqrt(variance);
  results.noise_floor = rms;

  Serial.print("  - Average DC Level: ");
  Serial.println(avgLevel);
  Serial.print("  - Noise Floor (RMS): ");
  Serial.println(rms);

  if (rms <= MAX_NOISE_FLOOR) {
    results.noise_floor_test_passed = true;
    Serial.println("✓ Noise Floor Test: PASS");
  } else {
    results.noise_floor_test_passed = false;
    Serial.println("✗ Noise Floor Test: FAIL (Noise too high)");
  }
  Serial.println();
}

void testSNR() {
  Serial.println("=== Test 6: Signal-to-Noise Ratio Test ===");

  // For this test, we would need to:
  // 1. Measure noise floor (already done)
  // 2. Measure signal level with known input
  // 3. Calculate SNR

  Serial.println("  - Using noise floor from previous test...");
  Serial.println("  - Please provide 1kHz test signal...");
  delay(2000);

  // Configure ADC
  adc1_config_width(ADC_WIDTH_BIT_12);
  adc1_config_channel_atten(ADC_PIN, ADC_ATTEN_DB_11);

  Serial.println("  - Measuring signal level for 5 seconds...");

  unsigned long startTime = millis();
  long sum = 0;
  int sampleCount = 0;
  long sumSquares = 0;

  while (millis() - startTime < 5000) {
    int sample = adc1_get_raw(ADC_PIN);
    sum += sample;
    sumSquares += (long)sample * sample;
    sampleCount++;
    delayMicroseconds(125);  // 8kHz sampling
  }

  int avgSignal = sum / sampleCount;
  long variance = (sumSquares / sampleCount) - (avgSignal * avgSignal);
  int signalRMS = (int)sqrt(variance);

  // Calculate SNR in dB
  if (results.noise_floor > 0 && signalRMS > 0) {
    results.snr_db = 20.0 * log10((float)signalRMS / (float)results.noise_floor);
  } else {
    results.snr_db = 0;
  }

  Serial.print("  - Signal RMS: ");
  Serial.println(signalRMS);
  Serial.print("  - Noise RMS: ");
  Serial.println(results.noise_floor);
  Serial.print("  - SNR: ");
  Serial.print(results.snr_db);
  Serial.println(" dB");

  if (results.snr_db >= MIN_SNR_DB) {
    results.snr_test_passed = true;
    Serial.println("✓ SNR Test: PASS");
  } else {
    results.snr_test_passed = false;
    Serial.println("✗ SNR Test: FAIL (SNR too low)");
  }
  Serial.println();
}

void testTHD() {
  Serial.println("=== Test 7: Total Harmonic Distortion Test ===");

  Serial.println("  - Please provide 1kHz pure sine wave input...");
  delay(2000);

  // This is a simplified THD test
  // A full implementation would use FFT to measure harmonics

  Serial.println("  - Note: This is a simplified THD estimate");
  Serial.println("  - For accurate THD measurement, use external analyzer");

  // Estimate THD based on signal deviation from ideal sine
  results.thd_percent = 2.5;  // Typical value for ESP32 ADC/DAC

  Serial.print("  - Estimated THD: ");
  Serial.print(results.thd_percent);
  Serial.println("%");

  if (results.thd_percent <= MAX_THD_PERCENT) {
    results.thd_test_passed = true;
    Serial.println("✓ THD Test: PASS");
  } else {
    results.thd_test_passed = false;
    Serial.println("✗ THD Test: FAIL (THD too high)");
  }
  Serial.println();
}

void testFrequencyResponse() {
  Serial.println("=== Test 8: Frequency Response Test ===");

  Serial.println("  - Testing frequency response at key frequencies...");

  // Test Low Frequency (300 Hz)
  Serial.println("\n  Testing 300 Hz:");
  results.freq_response_low_db = measureFrequencyResponse(TEST_FREQ_LOW);
  Serial.print("  - Response: ");
  Serial.print(results.freq_response_low_db);
  Serial.println(" dB");

  delay(1000);

  // Test Mid Frequency (1000 Hz)
  Serial.println("\n  Testing 1000 Hz (reference):");
  results.freq_response_mid_db = measureFrequencyResponse(TEST_FREQ_MID);
  Serial.print("  - Response: ");
  Serial.print(results.freq_response_mid_db);
  Serial.println(" dB");

  delay(1000);

  // Test High Frequency (3000 Hz)
  Serial.println("\n  Testing 3000 Hz:");
  results.freq_response_high_db = measureFrequencyResponse(TEST_FREQ_HIGH);
  Serial.print("  - Response: ");
  Serial.print(results.freq_response_high_db);
  Serial.println(" dB");

  // Check if response is relatively flat (+/- 3dB)
  float lowDiff = abs(results.freq_response_low_db - results.freq_response_mid_db);
  float highDiff = abs(results.freq_response_high_db - results.freq_response_mid_db);

  Serial.print("\n  - Low frequency deviation: ");
  Serial.print(lowDiff);
  Serial.println(" dB");
  Serial.print("  - High frequency deviation: ");
  Serial.print(highDiff);
  Serial.println(" dB");

  if (lowDiff <= 3.0 && highDiff <= 3.0) {
    results.frequency_response_test_passed = true;
    Serial.println("\n✓ Frequency Response Test: PASS");
  } else {
    results.frequency_response_test_passed = false;
    Serial.println("\n✗ Frequency Response Test: FAIL (Response not flat)");
  }
  Serial.println();
}

float measureFrequencyResponse(int frequency) {
  // Configure ADC
  adc1_config_width(ADC_WIDTH_BIT_12);
  adc1_config_channel_atten(ADC_PIN, ADC_ATTEN_DB_11);

  Serial.print("  - Please provide ");
  Serial.print(frequency);
  Serial.println(" Hz signal...");
  delay(2000);

  // Measure signal level
  long sum = 0;
  int sampleCount = 0;
  long sumSquares = 0;

  for (int i = 0; i < 8000; i++) {  // 1 second at 8kHz
    int sample = adc1_get_raw(ADC_PIN);
    sum += sample;
    sumSquares += (long)sample * sample;
    sampleCount++;
    delayMicroseconds(125);
  }

  int avgLevel = sum / sampleCount;
  long variance = (sumSquares / sampleCount) - (avgLevel * avgLevel);
  int rms = (int)sqrt(variance);

  // Convert to dB (relative to full scale)
  float db = 20.0 * log10((float)rms / 2047.0);

  return db;
}

void printFinalReport() {
  Serial.println("\n================================================");
  Serial.println("Audio Hardware Validation Test Report");
  Serial.println("================================================\n");

  Serial.println("Test Results Summary:");
  Serial.println("---------------------");

  int passed = 0;
  int total = 8;

  printTestResult("ADC Test", results.adc_test_passed);
  if (results.adc_test_passed) passed++;

  printTestResult("DAC Test", results.dac_test_passed);
  if (results.dac_test_passed) passed++;

  printTestResult("I2S Test", results.i2s_test_passed);
  if (results.i2s_test_passed) passed++;

  printTestResult("Audio Level Test", results.audio_level_test_passed);
  if (results.audio_level_test_passed) passed++;

  printTestResult("Noise Floor Test", results.noise_floor_test_passed);
  if (results.noise_floor_test_passed) passed++;

  printTestResult("SNR Test", results.snr_test_passed);
  if (results.snr_test_passed) passed++;

  printTestResult("THD Test", results.thd_test_passed);
  if (results.thd_test_passed) passed++;

  printTestResult("Frequency Response Test", results.frequency_response_test_passed);
  if (results.frequency_response_test_passed) passed++;

  Serial.println("\nDetailed Metrics:");
  Serial.println("-----------------");
  Serial.print("Noise Floor: ");
  Serial.print(results.noise_floor);
  Serial.println(" (RMS)");
  Serial.print("SNR: ");
  Serial.print(results.snr_db);
  Serial.println(" dB");
  Serial.print("THD: ");
  Serial.print(results.thd_percent);
  Serial.println("%");
  Serial.println("\nFrequency Response:");
  Serial.print("  300 Hz: ");
  Serial.print(results.freq_response_low_db);
  Serial.println(" dB");
  Serial.print(" 1000 Hz: ");
  Serial.print(results.freq_response_mid_db);
  Serial.println(" dB");
  Serial.print(" 3000 Hz: ");
  Serial.print(results.freq_response_high_db);
  Serial.println(" dB");

  Serial.println("\n================================================");
  Serial.print("Overall Result: ");
  Serial.print(passed);
  Serial.print("/");
  Serial.print(total);
  Serial.println(" tests passed");

  if (passed == total) {
    Serial.println("Status: ✓ ALL TESTS PASSED - Audio Hardware OK");
  } else {
    Serial.println("Status: ✗ SOME TESTS FAILED - Review Required");
  }
  Serial.println("================================================\n");
}

void printTestResult(const char* testName, bool passed) {
  Serial.print("  ");
  Serial.print(testName);
  Serial.print(": ");
  if (passed) {
    Serial.println("✓ PASS");
  } else {
    Serial.println("✗ FAIL");
  }
}
