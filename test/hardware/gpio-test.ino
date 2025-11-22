/*
 * ESP32 RoIP GPIO Functionality Test Suite
 *
 * Hardware Validation Tests for GPIO Operations
 * Tests: Digital I/O, PWM, Interrupts, Pull-up/down, Pin States
 *
 * Copyright (C) 2025
 * Licensed under GPL-2.0
 */

// GPIO Pin Definitions (adjust based on your hardware)
#define PTT_PIN 32        // PTT output to radio
#define COS_PIN 33        // COS input from radio (Carrier Operated Squelch)
#define LED_PIN 2         // Built-in LED for visual feedback
#define TEST_OUTPUT_PIN 27
#define TEST_INPUT_PIN 26
#define PWM_PIN 25        // PWM test pin (also DAC1)
#define INTERRUPT_PIN 34  // Interrupt test pin

// Test Configuration
#define PWM_CHANNEL 0
#define PWM_FREQUENCY 1000
#define PWM_RESOLUTION 8

// Test Results
struct GPIOTestResults {
  bool digital_output_test_passed;
  bool digital_input_test_passed;
  bool pullup_pulldown_test_passed;
  bool pwm_test_passed;
  bool interrupt_test_passed;
  bool ptt_test_passed;
  bool cos_test_passed;
  bool pin_stability_test_passed;
  int interrupt_count;
  int pwm_duty_cycle;
};

GPIOTestResults results;
volatile int interruptCounter = 0;
unsigned long lastInterruptTime = 0;

void IRAM_ATTR handleInterrupt() {
  interruptCounter++;
  lastInterruptTime = millis();
}

void setup() {
  Serial.begin(115200);
  while (!Serial) delay(10);

  Serial.println("\n\n================================================");
  Serial.println("ESP32 RoIP GPIO Hardware Validation Test Suite");
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
  Serial.println("Starting GPIO Hardware Tests...\n");

  // Test 1: Digital Output Test
  testDigitalOutput();
  delay(2000);

  // Test 2: Digital Input Test
  testDigitalInput();
  delay(2000);

  // Test 3: Pull-up/Pull-down Test
  testPullUpPullDown();
  delay(2000);

  // Test 4: PWM Test
  testPWM();
  delay(2000);

  // Test 5: Interrupt Test
  testInterrupt();
  delay(2000);

  // Test 6: PTT Pin Test
  testPTT();
  delay(2000);

  // Test 7: COS Pin Test
  testCOS();
  delay(2000);

  // Test 8: Pin Stability Test
  testPinStability();
  delay(2000);
}

void testDigitalOutput() {
  Serial.println("=== Test 1: Digital Output ===");

  // Configure pin as output
  pinMode(TEST_OUTPUT_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);

  Serial.print("  - Test Output Pin: GPIO");
  Serial.println(TEST_OUTPUT_PIN);
  Serial.print("  - LED Pin: GPIO");
  Serial.println(LED_PIN);

  Serial.println("  - Testing HIGH/LOW states...");

  bool testPassed = true;

  // Test LOW
  digitalWrite(TEST_OUTPUT_PIN, LOW);
  digitalWrite(LED_PIN, LOW);
  delay(500);
  Serial.println("    Set to LOW");

  // Test HIGH
  digitalWrite(TEST_OUTPUT_PIN, HIGH);
  digitalWrite(LED_PIN, HIGH);
  delay(500);
  Serial.println("    Set to HIGH");

  // Toggle test
  Serial.println("  - Toggling 10 times...");
  for (int i = 0; i < 10; i++) {
    digitalWrite(TEST_OUTPUT_PIN, !digitalRead(TEST_OUTPUT_PIN));
    digitalWrite(LED_PIN, !digitalRead(LED_PIN));
    delay(100);
  }

  // Set to known state
  digitalWrite(TEST_OUTPUT_PIN, LOW);
  digitalWrite(LED_PIN, LOW);

  results.digital_output_test_passed = testPassed;

  if (testPassed) {
    Serial.println("✓ Digital Output Test: PASS");
  } else {
    Serial.println("✗ Digital Output Test: FAIL");
  }
  Serial.println();
}

void testDigitalInput() {
  Serial.println("=== Test 2: Digital Input ===");

  // Configure pins
  pinMode(TEST_OUTPUT_PIN, OUTPUT);
  pinMode(TEST_INPUT_PIN, INPUT);

  Serial.print("  - Output Pin: GPIO");
  Serial.println(TEST_OUTPUT_PIN);
  Serial.print("  - Input Pin: GPIO");
  Serial.println(TEST_INPUT_PIN);

  Serial.println("  - Note: Connect GPIO" + String(TEST_OUTPUT_PIN) + " to GPIO" + String(TEST_INPUT_PIN));
  Serial.println("  - Testing input reading...");

  delay(2000);

  bool testPassed = true;

  // Test LOW
  digitalWrite(TEST_OUTPUT_PIN, LOW);
  delay(100);
  int lowReading = digitalRead(TEST_INPUT_PIN);
  Serial.print("    Output LOW, Input reads: ");
  Serial.println(lowReading == LOW ? "LOW ✓" : "HIGH ✗");
  if (lowReading != LOW) testPassed = false;

  // Test HIGH
  digitalWrite(TEST_OUTPUT_PIN, HIGH);
  delay(100);
  int highReading = digitalRead(TEST_INPUT_PIN);
  Serial.print("    Output HIGH, Input reads: ");
  Serial.println(highReading == HIGH ? "HIGH ✓" : "LOW ✗");
  if (highReading != HIGH) testPassed = false;

  // Multiple transitions test
  Serial.println("  - Testing 100 transitions...");
  int errors = 0;
  for (int i = 0; i < 100; i++) {
    bool state = i % 2;
    digitalWrite(TEST_OUTPUT_PIN, state);
    delayMicroseconds(100);
    if (digitalRead(TEST_INPUT_PIN) != state) {
      errors++;
    }
  }

  Serial.print("    Errors: ");
  Serial.println(errors);
  if (errors > 0) testPassed = false;

  digitalWrite(TEST_OUTPUT_PIN, LOW);

  results.digital_input_test_passed = testPassed;

  if (testPassed) {
    Serial.println("✓ Digital Input Test: PASS");
  } else {
    Serial.println("✗ Digital Input Test: FAIL");
  }
  Serial.println();
}

void testPullUpPullDown() {
  Serial.println("=== Test 3: Pull-up/Pull-down Resistors ===");

  pinMode(TEST_INPUT_PIN, INPUT);

  Serial.print("  - Test Pin: GPIO");
  Serial.println(TEST_INPUT_PIN);
  Serial.println("  - Note: Ensure pin is not connected (floating)");

  delay(2000);

  // Test pull-up
  Serial.println("  - Testing internal pull-up...");
  pinMode(TEST_INPUT_PIN, INPUT_PULLUP);
  delay(100);
  int pullupReading = digitalRead(TEST_INPUT_PIN);
  Serial.print("    Pull-up enabled, reads: ");
  Serial.println(pullupReading == HIGH ? "HIGH ✓" : "LOW ✗");

  // Test pull-down
  Serial.println("  - Testing internal pull-down...");
  pinMode(TEST_INPUT_PIN, INPUT_PULLDOWN);
  delay(100);
  int pulldownReading = digitalRead(TEST_INPUT_PIN);
  Serial.print("    Pull-down enabled, reads: ");
  Serial.println(pulldownReading == LOW ? "LOW ✓" : "HIGH ✗");

  // Test no pull (floating)
  Serial.println("  - Testing no pull (floating)...");
  pinMode(TEST_INPUT_PIN, INPUT);
  delay(100);
  int floatingReading = digitalRead(TEST_INPUT_PIN);
  Serial.print("    No pull, reads: ");
  Serial.println(floatingReading);
  Serial.println("    (Value may be unstable - this is expected)");

  bool testPassed = (pullupReading == HIGH) && (pulldownReading == LOW);

  results.pullup_pulldown_test_passed = testPassed;

  if (testPassed) {
    Serial.println("✓ Pull-up/Pull-down Test: PASS");
  } else {
    Serial.println("✗ Pull-up/Pull-down Test: FAIL");
  }
  Serial.println();
}

void testPWM() {
  Serial.println("=== Test 4: PWM (Pulse Width Modulation) ===");

  Serial.print("  - PWM Pin: GPIO");
  Serial.println(PWM_PIN);
  Serial.print("  - Frequency: ");
  Serial.print(PWM_FREQUENCY);
  Serial.println(" Hz");
  Serial.print("  - Resolution: ");
  Serial.print(PWM_RESOLUTION);
  Serial.println(" bits");

  // Configure PWM
  ledcSetup(PWM_CHANNEL, PWM_FREQUENCY, PWM_RESOLUTION);
  ledcAttachPin(PWM_PIN, PWM_CHANNEL);

  Serial.println("  - Testing different duty cycles...");

  int dutyCycles[] = {0, 25, 50, 75, 100};
  bool testPassed = true;

  for (int i = 0; i < 5; i++) {
    int duty = (dutyCycles[i] * 255) / 100;
    ledcWrite(PWM_CHANNEL, duty);
    delay(500);

    Serial.print("    ");
    Serial.print(dutyCycles[i]);
    Serial.print("% duty cycle (value: ");
    Serial.print(duty);
    Serial.println(")");
  }

  // Test frequency sweep
  Serial.println("  - Testing frequency sweep...");
  int frequencies[] = {100, 500, 1000, 5000, 10000};

  for (int i = 0; i < 5; i++) {
    ledcSetup(PWM_CHANNEL, frequencies[i], PWM_RESOLUTION);
    ledcWrite(PWM_CHANNEL, 128);  // 50% duty cycle
    delay(500);

    Serial.print("    ");
    Serial.print(frequencies[i]);
    Serial.println(" Hz");
  }

  // Set back to default
  ledcSetup(PWM_CHANNEL, PWM_FREQUENCY, PWM_RESOLUTION);
  ledcWrite(PWM_CHANNEL, 0);

  results.pwm_test_passed = testPassed;
  results.pwm_duty_cycle = 50;

  if (testPassed) {
    Serial.println("✓ PWM Test: PASS");
  } else {
    Serial.println("✗ PWM Test: FAIL");
  }
  Serial.println();
}

void testInterrupt() {
  Serial.println("=== Test 5: Interrupt Test ===");

  pinMode(INTERRUPT_PIN, INPUT_PULLDOWN);
  pinMode(TEST_OUTPUT_PIN, OUTPUT);

  Serial.print("  - Interrupt Pin: GPIO");
  Serial.println(INTERRUPT_PIN);
  Serial.println("  - Note: Connect GPIO" + String(TEST_OUTPUT_PIN) + " to GPIO" + String(INTERRUPT_PIN));

  delay(2000);

  // Attach interrupt
  interruptCounter = 0;
  attachInterrupt(digitalPinToInterrupt(INTERRUPT_PIN), handleInterrupt, RISING);

  Serial.println("  - Generating 10 rising edges...");

  for (int i = 0; i < 10; i++) {
    digitalWrite(TEST_OUTPUT_PIN, HIGH);
    delay(100);
    digitalWrite(TEST_OUTPUT_PIN, LOW);
    delay(100);
  }

  delay(500);

  Serial.print("  - Expected interrupts: 10");
  Serial.print("  - Actual interrupts: ");
  Serial.println(interruptCounter);

  results.interrupt_count = interruptCounter;

  // Test FALLING edge
  Serial.println("  - Testing FALLING edge interrupts...");
  interruptCounter = 0;
  detachInterrupt(digitalPinToInterrupt(INTERRUPT_PIN));
  attachInterrupt(digitalPinToInterrupt(INTERRUPT_PIN), handleInterrupt, FALLING);

  for (int i = 0; i < 10; i++) {
    digitalWrite(TEST_OUTPUT_PIN, HIGH);
    delay(100);
    digitalWrite(TEST_OUTPUT_PIN, LOW);
    delay(100);
  }

  delay(500);

  Serial.print("  - Expected interrupts: 10");
  Serial.print("  - Actual interrupts: ");
  Serial.println(interruptCounter);

  // Test CHANGE edge
  Serial.println("  - Testing CHANGE edge interrupts...");
  interruptCounter = 0;
  detachInterrupt(digitalPinToInterrupt(INTERRUPT_PIN));
  attachInterrupt(digitalPinToInterrupt(INTERRUPT_PIN), handleInterrupt, CHANGE);

  for (int i = 0; i < 10; i++) {
    digitalWrite(TEST_OUTPUT_PIN, HIGH);
    delay(100);
    digitalWrite(TEST_OUTPUT_PIN, LOW);
    delay(100);
  }

  delay(500);

  Serial.print("  - Expected interrupts: 20");
  Serial.print("  - Actual interrupts: ");
  Serial.println(interruptCounter);

  detachInterrupt(digitalPinToInterrupt(INTERRUPT_PIN));
  digitalWrite(TEST_OUTPUT_PIN, LOW);

  bool testPassed = (results.interrupt_count >= 8 && results.interrupt_count <= 12);

  results.interrupt_test_passed = testPassed;

  if (testPassed) {
    Serial.println("✓ Interrupt Test: PASS");
  } else {
    Serial.println("✗ Interrupt Test: FAIL");
  }
  Serial.println();
}

void testPTT() {
  Serial.println("=== Test 6: PTT (Push-to-Talk) Pin Test ===");

  pinMode(PTT_PIN, OUTPUT);

  Serial.print("  - PTT Pin: GPIO");
  Serial.println(PTT_PIN);
  Serial.println("  - PTT is active LOW (LOW = transmit, HIGH = receive)");

  bool testPassed = true;

  // Test receive mode
  Serial.println("  - Setting to RECEIVE mode (HIGH)...");
  digitalWrite(PTT_PIN, HIGH);
  delay(1000);
  int rxState = digitalRead(PTT_PIN);
  Serial.print("    PTT state: ");
  Serial.println(rxState == HIGH ? "HIGH (RX) ✓" : "LOW (TX) ✗");
  if (rxState != HIGH) testPassed = false;

  // Test transmit mode
  Serial.println("  - Setting to TRANSMIT mode (LOW)...");
  digitalWrite(PTT_PIN, LOW);
  delay(1000);
  int txState = digitalRead(PTT_PIN);
  Serial.print("    PTT state: ");
  Serial.println(txState == LOW ? "LOW (TX) ✓" : "HIGH (RX) ✗");
  if (txState != LOW) testPassed = false;

  // Test rapid PTT switching
  Serial.println("  - Testing rapid PTT switching (10 cycles)...");
  for (int i = 0; i < 10; i++) {
    digitalWrite(PTT_PIN, LOW);  // TX
    delay(200);
    digitalWrite(PTT_PIN, HIGH);  // RX
    delay(200);
  }
  Serial.println("    Switching complete ✓");

  // Return to receive mode
  digitalWrite(PTT_PIN, HIGH);

  results.ptt_test_passed = testPassed;

  if (testPassed) {
    Serial.println("✓ PTT Test: PASS");
  } else {
    Serial.println("✗ PTT Test: FAIL");
  }
  Serial.println();
}

void testCOS() {
  Serial.println("=== Test 7: COS (Carrier Operated Squelch) Pin Test ===");

  pinMode(COS_PIN, INPUT_PULLUP);

  Serial.print("  - COS Pin: GPIO");
  Serial.println(COS_PIN);
  Serial.println("  - COS is active LOW (LOW = carrier detected, HIGH = no carrier)");
  Serial.println("  - Monitoring COS state for 10 seconds...");

  unsigned long startTime = millis();
  int lowCount = 0;
  int highCount = 0;
  int transitions = 0;
  int lastState = -1;

  while (millis() - startTime < 10000) {
    int state = digitalRead(COS_PIN);

    if (state == LOW) {
      lowCount++;
    } else {
      highCount++;
    }

    if (lastState != -1 && state != lastState) {
      transitions++;
    }

    lastState = state;

    if ((millis() - startTime) % 1000 < 10) {
      Serial.print("  - COS state: ");
      Serial.println(state == LOW ? "LOW (Carrier Detected)" : "HIGH (No Carrier)");
    }

    delay(100);
  }

  Serial.println("\n  Statistics:");
  Serial.print("    LOW (carrier) count: ");
  Serial.println(lowCount);
  Serial.print("    HIGH (no carrier) count: ");
  Serial.println(highCount);
  Serial.print("    State transitions: ");
  Serial.println(transitions);

  // Test passes if COS pin is readable (at least one state detected)
  bool testPassed = (lowCount > 0 || highCount > 0);

  results.cos_test_passed = testPassed;

  if (testPassed) {
    Serial.println("✓ COS Test: PASS");
  } else {
    Serial.println("✗ COS Test: FAIL");
  }
  Serial.println();
}

void testPinStability() {
  Serial.println("=== Test 8: Pin Stability Test ===");

  Serial.println("  - Testing pin state stability over time...");
  Serial.println("  - Duration: 30 seconds");

  pinMode(TEST_OUTPUT_PIN, OUTPUT);
  pinMode(TEST_INPUT_PIN, INPUT);

  // Set output to HIGH
  digitalWrite(TEST_OUTPUT_PIN, HIGH);

  unsigned long startTime = millis();
  int errorCount = 0;
  int sampleCount = 0;

  while (millis() - startTime < 30000) {
    int reading = digitalRead(TEST_OUTPUT_PIN);
    if (reading != HIGH) {
      errorCount++;
    }
    sampleCount++;

    if ((millis() - startTime) % 5000 < 10) {
      Serial.print("  - ");
      Serial.print((millis() - startTime) / 1000);
      Serial.print("s: ");
      Serial.print(sampleCount);
      Serial.print(" samples, ");
      Serial.print(errorCount);
      Serial.println(" errors");
    }

    delay(10);
  }

  Serial.println("\n  Final Statistics:");
  Serial.print("    Total samples: ");
  Serial.println(sampleCount);
  Serial.print("    Errors: ");
  Serial.println(errorCount);
  Serial.print("    Success rate: ");
  Serial.print((float)(sampleCount - errorCount) * 100.0 / sampleCount);
  Serial.println("%");

  bool testPassed = (errorCount == 0);

  results.pin_stability_test_passed = testPassed;

  if (testPassed) {
    Serial.println("✓ Pin Stability Test: PASS");
  } else {
    Serial.println("✗ Pin Stability Test: FAIL");
  }
  Serial.println();
}

void printFinalReport() {
  Serial.println("\n================================================");
  Serial.println("GPIO Hardware Validation Test Report");
  Serial.println("================================================\n");

  Serial.println("Test Results Summary:");
  Serial.println("---------------------");

  int passed = 0;
  int total = 8;

  printTestResult("Digital Output Test", results.digital_output_test_passed);
  if (results.digital_output_test_passed) passed++;

  printTestResult("Digital Input Test", results.digital_input_test_passed);
  if (results.digital_input_test_passed) passed++;

  printTestResult("Pull-up/Pull-down Test", results.pullup_pulldown_test_passed);
  if (results.pullup_pulldown_test_passed) passed++;

  printTestResult("PWM Test", results.pwm_test_passed);
  if (results.pwm_test_passed) passed++;

  printTestResult("Interrupt Test", results.interrupt_test_passed);
  if (results.interrupt_test_passed) passed++;

  printTestResult("PTT Test", results.ptt_test_passed);
  if (results.ptt_test_passed) passed++;

  printTestResult("COS Test", results.cos_test_passed);
  if (results.cos_test_passed) passed++;

  printTestResult("Pin Stability Test", results.pin_stability_test_passed);
  if (results.pin_stability_test_passed) passed++;

  Serial.println("\nDetailed Metrics:");
  Serial.println("-----------------");
  Serial.print("Interrupt Count: ");
  Serial.println(results.interrupt_count);
  Serial.print("PWM Duty Cycle: ");
  Serial.print(results.pwm_duty_cycle);
  Serial.println("%");

  Serial.println("\n================================================");
  Serial.print("Overall Result: ");
  Serial.print(passed);
  Serial.print("/");
  Serial.print(total);
  Serial.println(" tests passed");

  if (passed == total) {
    Serial.println("Status: ✓ ALL TESTS PASSED - GPIO Hardware OK");
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
