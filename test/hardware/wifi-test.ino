/*
 * ESP32 RoIP WiFi Connectivity Test Suite
 *
 * Hardware Validation Tests for WiFi Functionality
 * Tests: Connection, Stability, Signal Strength, UDP Communication
 *
 * Copyright (C) 2025
 * Licensed under GPL-2.0
 */

#include <WiFi.h>
#include <WiFiUdp.h>

// Test Configuration
#define TEST_SSID "TEST_NETWORK"
#define TEST_PASSWORD "test_password"
#define TEST_SERVER_IP "192.168.1.100"
#define TEST_SERVER_PORT 3200
#define TEST_LOCAL_PORT 3201

// Test Thresholds
#define MIN_RSSI_DBM -75
#define MAX_CONNECTION_TIME_MS 10000
#define UDP_TIMEOUT_MS 5000
#define PING_INTERVAL_MS 1000
#define STABILITY_TEST_DURATION_MS 60000

// Test Results
struct TestResults {
  bool connection_test_passed;
  bool signal_strength_test_passed;
  bool udp_communication_test_passed;
  bool stability_test_passed;
  bool reconnection_test_passed;
  int connection_time_ms;
  int rssi_dbm;
  int udp_packet_loss_percent;
  int reconnection_count;
};

TestResults results;
WiFiUDP udp;

void setup() {
  Serial.begin(115200);
  while (!Serial) delay(10);

  Serial.println("\n\n================================================");
  Serial.println("ESP32 RoIP WiFi Hardware Validation Test Suite");
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
  Serial.println("Starting WiFi Hardware Tests...\n");

  // Test 1: WiFi Connection Test
  testWiFiConnection();
  delay(2000);

  // Test 2: Signal Strength Test
  testSignalStrength();
  delay(2000);

  // Test 3: UDP Communication Test
  testUDPCommunication();
  delay(2000);

  // Test 4: Connection Stability Test
  testConnectionStability();
  delay(2000);

  // Test 5: Reconnection Test
  testReconnection();
  delay(2000);
}

void testWiFiConnection() {
  Serial.println("=== Test 1: WiFi Connection ===");

  unsigned long startTime = millis();
  WiFi.mode(WIFI_STA);
  WiFi.begin(TEST_SSID, TEST_PASSWORD);

  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED && (millis() - startTime) < MAX_CONNECTION_TIME_MS) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  results.connection_time_ms = millis() - startTime;

  if (WiFi.status() == WL_CONNECTED) {
    results.connection_test_passed = true;
    Serial.println("✓ WiFi Connection: PASS");
    Serial.print("  - SSID: ");
    Serial.println(WiFi.SSID());
    Serial.print("  - IP Address: ");
    Serial.println(WiFi.localIP());
    Serial.print("  - Gateway: ");
    Serial.println(WiFi.gatewayIP());
    Serial.print("  - Subnet Mask: ");
    Serial.println(WiFi.subnetMask());
    Serial.print("  - DNS: ");
    Serial.println(WiFi.dnsIP());
    Serial.print("  - MAC Address: ");
    Serial.println(WiFi.macAddress());
    Serial.print("  - Connection Time: ");
    Serial.print(results.connection_time_ms);
    Serial.println(" ms");
  } else {
    results.connection_test_passed = false;
    Serial.println("✗ WiFi Connection: FAIL");
    Serial.print("  - Status Code: ");
    Serial.println(WiFi.status());
    Serial.print("  - Timeout after: ");
    Serial.print(results.connection_time_ms);
    Serial.println(" ms");
  }
  Serial.println();
}

void testSignalStrength() {
  Serial.println("=== Test 2: Signal Strength ===");

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("✗ Signal Strength Test: SKIP (Not Connected)");
    Serial.println();
    return;
  }

  results.rssi_dbm = WiFi.RSSI();

  Serial.print("  - RSSI: ");
  Serial.print(results.rssi_dbm);
  Serial.println(" dBm");

  String signalQuality;
  if (results.rssi_dbm > -50) {
    signalQuality = "Excellent";
  } else if (results.rssi_dbm > -60) {
    signalQuality = "Good";
  } else if (results.rssi_dbm > -70) {
    signalQuality = "Fair";
  } else if (results.rssi_dbm > -80) {
    signalQuality = "Weak";
  } else {
    signalQuality = "Very Weak";
  }

  Serial.print("  - Signal Quality: ");
  Serial.println(signalQuality);
  Serial.print("  - Channel: ");
  Serial.println(WiFi.channel());

  if (results.rssi_dbm >= MIN_RSSI_DBM) {
    results.signal_strength_test_passed = true;
    Serial.println("✓ Signal Strength Test: PASS");
  } else {
    results.signal_strength_test_passed = false;
    Serial.println("✗ Signal Strength Test: FAIL (Signal too weak)");
  }
  Serial.println();
}

void testUDPCommunication() {
  Serial.println("=== Test 3: UDP Communication ===");

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("✗ UDP Communication Test: SKIP (Not Connected)");
    Serial.println();
    return;
  }

  // Start UDP
  if (!udp.begin(TEST_LOCAL_PORT)) {
    Serial.println("✗ UDP Communication Test: FAIL (Cannot start UDP)");
    results.udp_communication_test_passed = false;
    Serial.println();
    return;
  }

  Serial.print("  - UDP Port: ");
  Serial.println(TEST_LOCAL_PORT);

  // Send test packets
  const int totalPackets = 100;
  int sentPackets = 0;
  int receivedPackets = 0;

  for (int i = 0; i < totalPackets; i++) {
    char testData[32];
    sprintf(testData, "TEST_PACKET_%d", i);

    udp.beginPacket(TEST_SERVER_IP, TEST_SERVER_PORT);
    udp.write((uint8_t*)testData, strlen(testData));
    if (udp.endPacket()) {
      sentPackets++;
    }

    // Wait for response
    unsigned long timeout = millis() + 100;
    while (millis() < timeout) {
      int packetSize = udp.parsePacket();
      if (packetSize) {
        receivedPackets++;
        break;
      }
      delay(1);
    }

    if (i % 10 == 0) {
      Serial.print(".");
    }
  }
  Serial.println();

  results.udp_packet_loss_percent = ((totalPackets - receivedPackets) * 100) / totalPackets;

  Serial.print("  - Packets Sent: ");
  Serial.println(sentPackets);
  Serial.print("  - Packets Received: ");
  Serial.println(receivedPackets);
  Serial.print("  - Packet Loss: ");
  Serial.print(results.udp_packet_loss_percent);
  Serial.println("%");

  if (results.udp_packet_loss_percent < 5) {
    results.udp_communication_test_passed = true;
    Serial.println("✓ UDP Communication Test: PASS");
  } else {
    results.udp_communication_test_passed = false;
    Serial.println("✗ UDP Communication Test: FAIL (High packet loss)");
  }

  udp.stop();
  Serial.println();
}

void testConnectionStability() {
  Serial.println("=== Test 4: Connection Stability ===");

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("✗ Connection Stability Test: SKIP (Not Connected)");
    Serial.println();
    return;
  }

  Serial.print("  - Testing for ");
  Serial.print(STABILITY_TEST_DURATION_MS / 1000);
  Serial.println(" seconds...");

  unsigned long startTime = millis();
  int disconnections = 0;
  int rssi_min = 0;
  int rssi_max = -100;
  long rssi_sum = 0;
  int rssi_samples = 0;

  while (millis() - startTime < STABILITY_TEST_DURATION_MS) {
    if (WiFi.status() != WL_CONNECTED) {
      disconnections++;
      Serial.println("  ! Disconnection detected");

      // Try to reconnect
      WiFi.reconnect();
      unsigned long reconnectStart = millis();
      while (WiFi.status() != WL_CONNECTED && (millis() - reconnectStart) < 5000) {
        delay(100);
      }

      if (WiFi.status() == WL_CONNECTED) {
        Serial.println("  + Reconnected");
      }
    }

    int rssi = WiFi.RSSI();
    rssi_sum += rssi;
    rssi_samples++;
    if (rssi < rssi_min) rssi_min = rssi;
    if (rssi > rssi_max) rssi_max = rssi;

    if ((millis() - startTime) % 10000 < 100) {
      Serial.print("  - Current RSSI: ");
      Serial.print(rssi);
      Serial.println(" dBm");
    }

    delay(PING_INTERVAL_MS);
  }

  int rssi_avg = rssi_samples > 0 ? rssi_sum / rssi_samples : 0;

  Serial.print("  - Disconnections: ");
  Serial.println(disconnections);
  Serial.print("  - RSSI Average: ");
  Serial.print(rssi_avg);
  Serial.println(" dBm");
  Serial.print("  - RSSI Min: ");
  Serial.print(rssi_min);
  Serial.println(" dBm");
  Serial.print("  - RSSI Max: ");
  Serial.print(rssi_max);
  Serial.println(" dBm");

  if (disconnections == 0) {
    results.stability_test_passed = true;
    Serial.println("✓ Connection Stability Test: PASS");
  } else {
    results.stability_test_passed = false;
    Serial.println("✗ Connection Stability Test: FAIL (Disconnections occurred)");
  }
  Serial.println();
}

void testReconnection() {
  Serial.println("=== Test 5: Reconnection Test ===");

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("✗ Reconnection Test: SKIP (Not Connected)");
    Serial.println();
    return;
  }

  const int reconnectionAttempts = 3;
  int successfulReconnections = 0;

  for (int i = 0; i < reconnectionAttempts; i++) {
    Serial.print("  - Attempt ");
    Serial.print(i + 1);
    Serial.print("/");
    Serial.println(reconnectionAttempts);

    // Disconnect
    Serial.println("    Disconnecting...");
    WiFi.disconnect();
    delay(2000);

    // Reconnect
    Serial.println("    Reconnecting...");
    unsigned long startTime = millis();
    WiFi.reconnect();

    while (WiFi.status() != WL_CONNECTED && (millis() - startTime) < MAX_CONNECTION_TIME_MS) {
      delay(100);
    }

    if (WiFi.status() == WL_CONNECTED) {
      successfulReconnections++;
      Serial.print("    ✓ Reconnected in ");
      Serial.print(millis() - startTime);
      Serial.println(" ms");
    } else {
      Serial.println("    ✗ Reconnection failed");
    }

    delay(1000);
  }

  results.reconnection_count = successfulReconnections;

  Serial.print("  - Successful Reconnections: ");
  Serial.print(successfulReconnections);
  Serial.print("/");
  Serial.println(reconnectionAttempts);

  if (successfulReconnections == reconnectionAttempts) {
    results.reconnection_test_passed = true;
    Serial.println("✓ Reconnection Test: PASS");
  } else {
    results.reconnection_test_passed = false;
    Serial.println("✗ Reconnection Test: FAIL");
  }
  Serial.println();
}

void printFinalReport() {
  Serial.println("\n================================================");
  Serial.println("WiFi Hardware Validation Test Report");
  Serial.println("================================================\n");

  Serial.println("Test Results Summary:");
  Serial.println("---------------------");

  int passed = 0;
  int total = 5;

  printTestResult("Connection Test", results.connection_test_passed);
  if (results.connection_test_passed) passed++;

  printTestResult("Signal Strength Test", results.signal_strength_test_passed);
  if (results.signal_strength_test_passed) passed++;

  printTestResult("UDP Communication Test", results.udp_communication_test_passed);
  if (results.udp_communication_test_passed) passed++;

  printTestResult("Connection Stability Test", results.stability_test_passed);
  if (results.stability_test_passed) passed++;

  printTestResult("Reconnection Test", results.reconnection_test_passed);
  if (results.reconnection_test_passed) passed++;

  Serial.println("\nDetailed Metrics:");
  Serial.println("-----------------");
  Serial.print("Connection Time: ");
  Serial.print(results.connection_time_ms);
  Serial.println(" ms");
  Serial.print("Signal Strength: ");
  Serial.print(results.rssi_dbm);
  Serial.println(" dBm");
  Serial.print("UDP Packet Loss: ");
  Serial.print(results.udp_packet_loss_percent);
  Serial.println("%");

  Serial.println("\n================================================");
  Serial.print("Overall Result: ");
  Serial.print(passed);
  Serial.print("/");
  Serial.print(total);
  Serial.println(" tests passed");

  if (passed == total) {
    Serial.println("Status: ✓ ALL TESTS PASSED - WiFi Hardware OK");
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
