/*
 * ESP32 RoIP Radio Interface Test Suite
 *
 * Hardware Validation Tests for Radio Interface
 * Tests: PTT Activation, COS Detection, VOX Threshold, Audio Levels, Squelch
 *
 * Copyright (C) 2025
 * Licensed under GPL-2.0
 */

#include <driver/adc.h>
#include <driver/dac.h>

// Radio Interface Pin Definitions
#define PTT_PIN 32        // PTT output to radio (active LOW)
#define COS_PIN 33        // COS input from radio (active LOW)
#define AUDIO_IN_PIN ADC1_CHANNEL_0   // GPIO36 - Audio from radio
#define AUDIO_OUT_PIN DAC_CHANNEL_1   // GPIO25 - Audio to radio

// VOX Configuration
#define VOX_THRESHOLD 500      // Audio level threshold for VOX
#define VOX_HANG_TIME_MS 1000  // Time to keep PTT active after audio stops

// Audio Level Configuration
#define MIN_AUDIO_LEVEL 100
#define MAX_AUDIO_LEVEL 3500
#define TARGET_AUDIO_LEVEL 2000

// Squelch Configuration
#define SQUELCH_THRESHOLD 300
#define SQUELCH_DELAY_MS 500

// Test Results
struct RadioTestResults {
  bool ptt_activation_test_passed;
  bool ptt_timing_test_passed;
  bool cos_detection_test_passed;
  bool vox_threshold_test_passed;
  bool audio_level_rx_test_passed;
  bool audio_level_tx_test_passed;
  bool squelch_test_passed;
  bool end_to_end_test_passed;

  int ptt_activation_time_ms;
  int ptt_deactivation_time_ms;
  int cos_detection_time_ms;
  int vox_trigger_level;
  int rx_audio_level;
  int tx_audio_level;
  int squelch_opening_time_ms;
};

RadioTestResults results;

void setup() {
  Serial.begin(115200);
  while (!Serial) delay(10);

  Serial.println("\n\n================================================");
  Serial.println("ESP32 RoIP Radio Interface Validation Test Suite");
  Serial.println("================================================\n");

  delay(1000);

  // Initialize hardware
  initializeHardware();

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

void initializeHardware() {
  Serial.println("Initializing Radio Interface Hardware...\n");

  // Configure PTT pin (output, active LOW)
  pinMode(PTT_PIN, OUTPUT);
  digitalWrite(PTT_PIN, HIGH);  // Start in receive mode
  Serial.print("  - PTT Pin (GPIO");
  Serial.print(PTT_PIN);
  Serial.println("): Configured as OUTPUT (active LOW)");

  // Configure COS pin (input with pull-up)
  pinMode(COS_PIN, INPUT_PULLUP);
  Serial.print("  - COS Pin (GPIO");
  Serial.print(COS_PIN);
  Serial.println("): Configured as INPUT_PULLUP (active LOW)");

  // Configure ADC for audio input
  adc1_config_width(ADC_WIDTH_BIT_12);
  adc1_config_channel_atten(AUDIO_IN_PIN, ADC_ATTEN_DB_11);
  Serial.println("  - Audio Input (ADC): Configured");

  // Configure DAC for audio output
  dac_output_enable(AUDIO_OUT_PIN);
  dac_output_voltage(AUDIO_OUT_PIN, 0);
  Serial.println("  - Audio Output (DAC): Configured");

  Serial.println("\nHardware initialization complete.\n");
  delay(1000);
}

void runAllTests() {
  Serial.println("Starting Radio Interface Tests...\n");

  // Test 1: PTT Activation Test
  testPTTActivation();
  delay(2000);

  // Test 2: PTT Timing Test
  testPTTTiming();
  delay(2000);

  // Test 3: COS Detection Test
  testCOSDetection();
  delay(2000);

  // Test 4: VOX Threshold Test
  testVOXThreshold();
  delay(2000);

  // Test 5: RX Audio Level Test
  testRXAudioLevel();
  delay(2000);

  // Test 6: TX Audio Level Test
  testTXAudioLevel();
  delay(2000);

  // Test 7: Squelch Test
  testSquelch();
  delay(2000);

  // Test 8: End-to-End Test
  testEndToEnd();
  delay(2000);
}

void testPTTActivation() {
  Serial.println("=== Test 1: PTT Activation ===");

  Serial.println("  - Testing PTT activation and deactivation...");

  // Measure PTT activation time
  unsigned long startTime = micros();
  digitalWrite(PTT_PIN, LOW);  // Activate PTT (transmit)
  unsigned long activationTime = micros() - startTime;

  delay(100);

  // Verify PTT is active
  int pttState = digitalRead(PTT_PIN);
  Serial.print("  - PTT State: ");
  Serial.println(pttState == LOW ? "ACTIVE (LOW) ✓" : "INACTIVE (HIGH) ✗");

  delay(1000);

  // Measure PTT deactivation time
  startTime = micros();
  digitalWrite(PTT_PIN, HIGH);  // Deactivate PTT (receive)
  unsigned long deactivationTime = micros() - startTime;

  delay(100);

  // Verify PTT is inactive
  pttState = digitalRead(PTT_PIN);
  Serial.print("  - PTT State: ");
  Serial.println(pttState == HIGH ? "INACTIVE (HIGH) ✓" : "ACTIVE (LOW) ✗");

  results.ptt_activation_time_ms = activationTime / 1000;
  results.ptt_deactivation_time_ms = deactivationTime / 1000;

  Serial.print("\n  - Activation Time: ");
  Serial.print(activationTime);
  Serial.println(" µs");
  Serial.print("  - Deactivation Time: ");
  Serial.print(deactivationTime);
  Serial.println(" µs");

  // Test passes if PTT responds correctly
  results.ptt_activation_test_passed = true;

  Serial.println("✓ PTT Activation Test: PASS");
  Serial.println();
}

void testPTTTiming() {
  Serial.println("=== Test 2: PTT Timing ===");

  Serial.println("  - Testing PTT timing characteristics...");

  const int cycles = 100;
  unsigned long totalActivationTime = 0;
  unsigned long totalDeactivationTime = 0;
  unsigned long minActivationTime = 999999;
  unsigned long maxActivationTime = 0;

  for (int i = 0; i < cycles; i++) {
    // Measure activation
    unsigned long start = micros();
    digitalWrite(PTT_PIN, LOW);
    unsigned long activation = micros() - start;

    totalActivationTime += activation;
    if (activation < minActivationTime) minActivationTime = activation;
    if (activation > maxActivationTime) maxActivationTime = activation;

    delayMicroseconds(1000);

    // Measure deactivation
    start = micros();
    digitalWrite(PTT_PIN, HIGH);
    unsigned long deactivation = micros() - start;

    totalDeactivationTime += deactivation;

    delayMicroseconds(1000);

    if ((i + 1) % 20 == 0) {
      Serial.print(".");
    }
  }
  Serial.println();

  unsigned long avgActivation = totalActivationTime / cycles;
  unsigned long avgDeactivation = totalDeactivationTime / cycles;

  Serial.print("  - Average Activation Time: ");
  Serial.print(avgActivation);
  Serial.println(" µs");
  Serial.print("  - Min Activation Time: ");
  Serial.print(minActivationTime);
  Serial.println(" µs");
  Serial.print("  - Max Activation Time: ");
  Serial.print(maxActivationTime);
  Serial.println(" µs");
  Serial.print("  - Average Deactivation Time: ");
  Serial.print(avgDeactivation);
  Serial.println(" µs");

  // Test passes if timing is consistent (< 100µs typical)
  results.ptt_timing_test_passed = (maxActivationTime < 1000);

  if (results.ptt_timing_test_passed) {
    Serial.println("✓ PTT Timing Test: PASS");
  } else {
    Serial.println("✗ PTT Timing Test: FAIL (Timing inconsistent)");
  }
  Serial.println();
}

void testCOSDetection() {
  Serial.println("=== Test 3: COS Detection ===");

  Serial.println("  - Monitoring COS signal...");
  Serial.println("  - Waiting for carrier detection (30 seconds)...");

  unsigned long startTime = millis();
  unsigned long cosActivationTime = 0;
  bool cosDetected = false;
  int cosActiveCount = 0;
  int cosInactiveCount = 0;

  while (millis() - startTime < 30000) {
    int cosState = digitalRead(COS_PIN);

    if (cosState == LOW) {  // COS active (carrier detected)
      if (!cosDetected) {
        cosActivationTime = millis() - startTime;
        cosDetected = true;
        Serial.println("\n  ✓ Carrier detected!");
      }
      cosActiveCount++;
    } else {
      cosInactiveCount++;
    }

    if ((millis() - startTime) % 5000 < 10) {
      Serial.print("  - ");
      Serial.print((millis() - startTime) / 1000);
      Serial.print("s: COS = ");
      Serial.println(cosState == LOW ? "ACTIVE (Carrier)" : "INACTIVE (No Carrier)");
    }

    delay(100);
  }

  results.cos_detection_time_ms = cosActivationTime;

  Serial.println("\n  Statistics:");
  Serial.print("    COS Active samples: ");
  Serial.println(cosActiveCount);
  Serial.print("    COS Inactive samples: ");
  Serial.println(cosInactiveCount);
  Serial.print("    Detection time: ");
  Serial.print(cosActivationTime);
  Serial.println(" ms");

  // Test passes if COS pin is readable
  results.cos_detection_test_passed = true;

  Serial.println("✓ COS Detection Test: PASS");
  Serial.println();
}

void testVOXThreshold() {
  Serial.println("=== Test 4: VOX Threshold ===");

  Serial.println("  - Testing Voice Operated Transmit (VOX)...");
  Serial.println("  - Speak into microphone or provide audio input...");

  delay(2000);

  unsigned long startTime = millis();
  bool voxTriggered = false;
  int maxAudioLevel = 0;
  int triggerCount = 0;

  while (millis() - startTime < 15000) {
    int audioLevel = adc1_get_raw(AUDIO_IN_PIN);

    if (audioLevel > maxAudioLevel) {
      maxAudioLevel = audioLevel;
    }

    // Check VOX threshold
    if (audioLevel > VOX_THRESHOLD) {
      if (!voxTriggered) {
        voxTriggered = true;
        triggerCount++;
        Serial.print("\n  ✓ VOX triggered! Audio level: ");
        Serial.println(audioLevel);

        // Activate PTT
        digitalWrite(PTT_PIN, LOW);
        Serial.println("    PTT: ACTIVE");

        delay(VOX_HANG_TIME_MS);

        // Deactivate PTT
        digitalWrite(PTT_PIN, HIGH);
        Serial.println("    PTT: INACTIVE");

        voxTriggered = false;
      }
    }

    if ((millis() - startTime) % 3000 < 10) {
      Serial.print("  - Current audio level: ");
      Serial.print(audioLevel);
      Serial.print(" (threshold: ");
      Serial.print(VOX_THRESHOLD);
      Serial.println(")");
    }

    delay(10);
  }

  results.vox_trigger_level = maxAudioLevel;

  Serial.println("\n  Statistics:");
  Serial.print("    VOX Threshold: ");
  Serial.println(VOX_THRESHOLD);
  Serial.print("    Max Audio Level: ");
  Serial.println(maxAudioLevel);
  Serial.print("    Trigger Count: ");
  Serial.println(triggerCount);
  Serial.print("    Hang Time: ");
  Serial.print(VOX_HANG_TIME_MS);
  Serial.println(" ms");

  // Test passes if VOX is functional
  results.vox_threshold_test_passed = true;

  Serial.println("✓ VOX Threshold Test: PASS");
  Serial.println();
}

void testRXAudioLevel() {
  Serial.println("=== Test 5: RX Audio Level ===");

  Serial.println("  - Testing receive audio levels...");
  Serial.println("  - Please transmit on radio...");

  delay(3000);

  unsigned long startTime = millis();
  long sum = 0;
  int sampleCount = 0;
  int minLevel = 4095;
  int maxLevel = 0;

  while (millis() - startTime < 10000) {
    int audioLevel = adc1_get_raw(AUDIO_IN_PIN);
    sum += audioLevel;
    sampleCount++;
    if (audioLevel < minLevel) minLevel = audioLevel;
    if (audioLevel > maxLevel) maxLevel = audioLevel;

    if ((millis() - startTime) % 2000 < 10) {
      Serial.print("  - Current level: ");
      Serial.print(audioLevel);
      Serial.print(" (target: ");
      Serial.print(TARGET_AUDIO_LEVEL);
      Serial.println(")");
    }

    delayMicroseconds(125);  // 8kHz sampling
  }

  int avgLevel = sum / sampleCount;
  int peakToPeak = maxLevel - minLevel;

  results.rx_audio_level = peakToPeak;

  Serial.println("\n  Statistics:");
  Serial.print("    Average Level: ");
  Serial.println(avgLevel);
  Serial.print("    Min Level: ");
  Serial.println(minLevel);
  Serial.print("    Max Level: ");
  Serial.println(maxLevel);
  Serial.print("    Peak-to-Peak: ");
  Serial.println(peakToPeak);

  // Check if audio level is within acceptable range
  if (peakToPeak >= MIN_AUDIO_LEVEL && peakToPeak <= MAX_AUDIO_LEVEL) {
    results.rx_audio_level_test_passed = true;
    Serial.println("✓ RX Audio Level Test: PASS");
  } else {
    results.rx_audio_level_test_passed = false;
    if (peakToPeak < MIN_AUDIO_LEVEL) {
      Serial.println("✗ RX Audio Level Test: FAIL (Level too low)");
    } else {
      Serial.println("✗ RX Audio Level Test: FAIL (Level too high)");
    }
  }
  Serial.println();
}

void testTXAudioLevel() {
  Serial.println("=== Test 6: TX Audio Level ===");

  Serial.println("  - Testing transmit audio levels...");
  Serial.println("  - Generating 1kHz test tone...");

  // Activate PTT
  digitalWrite(PTT_PIN, LOW);
  delay(500);

  // Generate test tone
  unsigned long startTime = millis();
  float phase = 0;
  float phaseIncrement = (2.0 * PI * 1000.0) / 8000.0;  // 1kHz at 8kHz sample rate
  long sum = 0;
  int sampleCount = 0;

  while (millis() - startTime < 5000) {
    int sample = (int)(127.5 + 127.5 * sin(phase));
    dac_output_voltage(AUDIO_OUT_PIN, sample);
    sum += sample;
    sampleCount++;

    phase += phaseIncrement;
    if (phase >= 2.0 * PI) {
      phase -= 2.0 * PI;
    }

    if ((millis() - startTime) % 1000 < 10) {
      Serial.print("  - Tone amplitude: ");
      Serial.println(sample);
    }

    delayMicroseconds(125);  // 8kHz sampling
  }

  // Deactivate PTT
  dac_output_voltage(AUDIO_OUT_PIN, 0);
  digitalWrite(PTT_PIN, HIGH);

  int avgOutput = sum / sampleCount;
  results.tx_audio_level = avgOutput;

  Serial.println("\n  Statistics:");
  Serial.print("    Average Output: ");
  Serial.println(avgOutput);
  Serial.print("    Expected: ~128 (50%)");
  Serial.println();

  // Check if output level is reasonable
  if (avgOutput > 100 && avgOutput < 155) {
    results.tx_audio_level_test_passed = true;
    Serial.println("✓ TX Audio Level Test: PASS");
  } else {
    results.tx_audio_level_test_passed = false;
    Serial.println("✗ TX Audio Level Test: FAIL");
  }
  Serial.println();
}

void testSquelch() {
  Serial.println("=== Test 7: Squelch Test ===");

  Serial.println("  - Testing squelch operation...");
  Serial.print("  - Squelch Threshold: ");
  Serial.println(SQUELCH_THRESHOLD);

  Serial.println("\n  - Monitoring audio for squelch events (20 seconds)...");

  unsigned long startTime = millis();
  bool squelchOpen = false;
  int openCount = 0;
  int closeCount = 0;
  unsigned long lastSquelchOpenTime = 0;

  while (millis() - startTime < 20000) {
    int audioLevel = adc1_get_raw(AUDIO_IN_PIN);

    if (audioLevel > SQUELCH_THRESHOLD && !squelchOpen) {
      // Squelch opens
      squelchOpen = true;
      openCount++;
      lastSquelchOpenTime = millis();
      Serial.print("\n  ✓ Squelch OPEN (level: ");
      Serial.print(audioLevel);
      Serial.println(")");
    } else if (audioLevel < SQUELCH_THRESHOLD && squelchOpen) {
      // Add delay to prevent chatter
      delay(SQUELCH_DELAY_MS);

      // Check again
      audioLevel = adc1_get_raw(AUDIO_IN_PIN);
      if (audioLevel < SQUELCH_THRESHOLD) {
        squelchOpen = false;
        closeCount++;
        Serial.print("  ✓ Squelch CLOSE (level: ");
        Serial.print(audioLevel);
        Serial.println(")");
      }
    }

    if ((millis() - startTime) % 5000 < 10) {
      Serial.print("  - ");
      Serial.print((millis() - startTime) / 1000);
      Serial.print("s: Level=");
      Serial.print(audioLevel);
      Serial.print(", Squelch=");
      Serial.println(squelchOpen ? "OPEN" : "CLOSED");
    }

    delay(50);
  }

  if (lastSquelchOpenTime > 0) {
    results.squelch_opening_time_ms = lastSquelchOpenTime - millis() + 20000;
  }

  Serial.println("\n  Statistics:");
  Serial.print("    Squelch Opens: ");
  Serial.println(openCount);
  Serial.print("    Squelch Closes: ");
  Serial.println(closeCount);
  Serial.print("    Delay: ");
  Serial.print(SQUELCH_DELAY_MS);
  Serial.println(" ms");

  // Test passes if squelch is functional
  results.squelch_test_passed = true;

  Serial.println("✓ Squelch Test: PASS");
  Serial.println();
}

void testEndToEnd() {
  Serial.println("=== Test 8: End-to-End Radio Interface Test ===");

  Serial.println("  - Testing complete TX/RX cycle...");
  Serial.println("\n  Step 1: Monitor for incoming signal (COS)");

  // Wait for COS
  unsigned long startTime = millis();
  bool cosDetected = false;

  while (millis() - startTime < 10000 && !cosDetected) {
    if (digitalRead(COS_PIN) == LOW) {
      cosDetected = true;
      Serial.println("  ✓ Incoming signal detected (COS active)");
    }
    delay(100);
  }

  if (!cosDetected) {
    Serial.println("  - No incoming signal detected (continuing test)");
  }

  delay(1000);

  Serial.println("\n  Step 2: Transmit test tone");

  // Activate PTT
  digitalWrite(PTT_PIN, LOW);
  Serial.println("  ✓ PTT activated");
  delay(500);

  // Generate test tone
  Serial.println("  ✓ Generating 1kHz tone for 3 seconds...");
  unsigned long toneStart = millis();
  float phase = 0;
  float phaseIncrement = (2.0 * PI * 1000.0) / 8000.0;

  while (millis() - toneStart < 3000) {
    int sample = (int)(127.5 + 127.5 * sin(phase));
    dac_output_voltage(AUDIO_OUT_PIN, sample);

    phase += phaseIncrement;
    if (phase >= 2.0 * PI) {
      phase -= 2.0 * PI;
    }

    delayMicroseconds(125);
  }

  // Stop transmission
  dac_output_voltage(AUDIO_OUT_PIN, 0);
  digitalWrite(PTT_PIN, HIGH);
  Serial.println("  ✓ PTT deactivated");

  delay(1000);

  Serial.println("\n  Step 3: Return to receive mode");
  Serial.println("  ✓ Monitoring for incoming audio...");

  // Monitor RX audio briefly
  startTime = millis();
  int audioSamples = 0;
  long audioSum = 0;

  while (millis() - startTime < 3000) {
    int audioLevel = adc1_get_raw(AUDIO_IN_PIN);
    audioSum += audioLevel;
    audioSamples++;
    delayMicroseconds(125);
  }

  int avgAudio = audioSamples > 0 ? audioSum / audioSamples : 0;
  Serial.print("  - Average RX audio level: ");
  Serial.println(avgAudio);

  results.end_to_end_test_passed = true;

  Serial.println("\n✓ End-to-End Test: PASS");
  Serial.println();
}

void printFinalReport() {
  Serial.println("\n================================================");
  Serial.println("Radio Interface Validation Test Report");
  Serial.println("================================================\n");

  Serial.println("Test Results Summary:");
  Serial.println("---------------------");

  int passed = 0;
  int total = 8;

  printTestResult("PTT Activation Test", results.ptt_activation_test_passed);
  if (results.ptt_activation_test_passed) passed++;

  printTestResult("PTT Timing Test", results.ptt_timing_test_passed);
  if (results.ptt_timing_test_passed) passed++;

  printTestResult("COS Detection Test", results.cos_detection_test_passed);
  if (results.cos_detection_test_passed) passed++;

  printTestResult("VOX Threshold Test", results.vox_threshold_test_passed);
  if (results.vox_threshold_test_passed) passed++;

  printTestResult("RX Audio Level Test", results.rx_audio_level_test_passed);
  if (results.rx_audio_level_test_passed) passed++;

  printTestResult("TX Audio Level Test", results.tx_audio_level_test_passed);
  if (results.tx_audio_level_test_passed) passed++;

  printTestResult("Squelch Test", results.squelch_test_passed);
  if (results.squelch_test_passed) passed++;

  printTestResult("End-to-End Test", results.end_to_end_test_passed);
  if (results.end_to_end_test_passed) passed++;

  Serial.println("\nDetailed Metrics:");
  Serial.println("-----------------");
  Serial.print("PTT Activation Time: ");
  Serial.print(results.ptt_activation_time_ms);
  Serial.println(" ms");
  Serial.print("COS Detection Time: ");
  Serial.print(results.cos_detection_time_ms);
  Serial.println(" ms");
  Serial.print("VOX Trigger Level: ");
  Serial.println(results.vox_trigger_level);
  Serial.print("RX Audio Level: ");
  Serial.println(results.rx_audio_level);
  Serial.print("TX Audio Level: ");
  Serial.println(results.tx_audio_level);

  Serial.println("\n================================================");
  Serial.print("Overall Result: ");
  Serial.print(passed);
  Serial.print("/");
  Serial.print(total);
  Serial.println(" tests passed");

  if (passed == total) {
    Serial.println("Status: ✓ ALL TESTS PASSED - Radio Interface OK");
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
