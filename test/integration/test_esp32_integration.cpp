/*
 *   Integration Tests for ESP32 MMDVM Port
 *
 *   These tests verify the integration between different components
 *   of the ESP32 port. They require the actual ESP32 hardware or
 *   an ESP32 simulator to run.
 *
 *   Test categories:
 *   1. Hardware initialization
 *   2. ADC/DAC operations
 *   3. Timer interrupt timing
 *   4. Serial communication
 *   5. WiFi UDP communication (when enabled)
 */

#include <unity.h>

#if defined(ESP32) || defined(ESP32S2) || defined(ESP32S3)

#include "Config.h"
#include "Globals.h"
#include "IO.h"
#include "SerialPort.h"

// Test GPIO initialization
void test_gpio_pins_configured(void) {
    // After initInt(), GPIO pins should be in correct modes
    // This test verifies no crashes during initialization
    io.initInt();

    // PTT should be LOW initially
    TEST_ASSERT_EQUAL(LOW, digitalRead(PIN_PTT));

    // LED should be configured as output
    TEST_ASSERT_EQUAL(LOW, digitalRead(PIN_COSLED));
}

// Test LED control
void test_led_control(void) {
    io.setLEDInt(true);
    TEST_ASSERT_EQUAL(HIGH, digitalRead(PIN_LED));

    io.setLEDInt(false);
    TEST_ASSERT_EQUAL(LOW, digitalRead(PIN_LED));
}

// Test PTT control
void test_ptt_control(void) {
    io.setPTTInt(true);
    TEST_ASSERT_EQUAL(HIGH, digitalRead(PIN_PTT));

    io.setPTTInt(false);
    TEST_ASSERT_EQUAL(LOW, digitalRead(PIN_PTT));
}

// Test COS LED control
void test_cos_led_control(void) {
    io.setCOSInt(true);
    TEST_ASSERT_EQUAL(HIGH, digitalRead(PIN_COSLED));

    io.setCOSInt(false);
    TEST_ASSERT_EQUAL(LOW, digitalRead(PIN_COSLED));
}

#if defined(MODE_LEDS)
// Test mode LEDs
void test_mode_leds(void) {
    io.setDStarInt(true);
    delay(1);
    io.setDStarInt(false);

    io.setDMRInt(true);
    delay(1);
    io.setDMRInt(false);

    io.setYSFInt(true);
    delay(1);
    io.setYSFInt(false);

    io.setP25Int(true);
    delay(1);
    io.setP25Int(false);

    // All should complete without error
    TEST_PASS();
}
#endif

// Test CPU ID
void test_cpu_identification(void) {
    uint8_t cpuId = io.getCPU();

#if defined(ESP32S3)
    TEST_ASSERT_EQUAL_UINT8(5, cpuId);  // ESP32-S3
#elif defined(ESP32S2)
    TEST_ASSERT_EQUAL_UINT8(4, cpuId);  // ESP32-S2
#else
    TEST_ASSERT_EQUAL_UINT8(3, cpuId);  // ESP32
#endif
}

// Test UDID retrieval
void test_udid_retrieval(void) {
    uint8_t udid[12];
    io.getUDID(udid);

    // UDID should have marker bytes at end
    TEST_ASSERT_EQUAL_UINT8(0xE5, udid[10]);
    TEST_ASSERT_EQUAL_UINT8(0x32, udid[11]);

    // CPU cores should be valid
    TEST_ASSERT_TRUE(udid[7] >= 1 && udid[7] <= 2);

    // CPU frequency should be reasonable (MHz in lower bytes)
    uint16_t freqMHz = udid[8] | (udid[9] << 8);
    TEST_ASSERT_TRUE(freqMHz >= 80 && freqMHz <= 240);
}

// Test ADC configuration
void test_adc_configuration(void) {
    // Start IO to configure ADC
    io.startInt();

    // Read ADC value - should return valid range
    // Note: This requires startInt() which starts the timer
    // For this basic test, we just verify no crash
    delay(10);

    TEST_PASS();
}

// Test timer ISR rate (approximate)
void test_timer_isr_rate(void) {
    io.startInt();

    // Get initial watchdog count
    volatile uint32_t startCount = io.m_watchdog;

    // Wait 100ms
    delay(100);

    // Get final count
    volatile uint32_t endCount = io.m_watchdog;

    // Calculate interrupts per second
    uint32_t delta = endCount - startCount;
    uint32_t isr_per_sec = delta * 10;

    // Should be close to 24000 Hz (allow 10% tolerance)
    TEST_ASSERT_TRUE(isr_per_sec >= 21600);  // 24000 - 10%
    TEST_ASSERT_TRUE(isr_per_sec <= 26400);  // 24000 + 10%
}

// Test delay function
void test_delay_accuracy(void) {
    uint32_t start = millis();
    io.delayInt(100);
    uint32_t elapsed = millis() - start;

    // Allow 20% tolerance
    TEST_ASSERT_TRUE(elapsed >= 80);
    TEST_ASSERT_TRUE(elapsed <= 120);
}

// Serial communication tests
void test_serial_initialization(void) {
    serial.beginInt(1U, SERIAL_SPEED);
    delay(100);

    // Should be able to check available
    int avail = serial.availableForReadInt(1U);
    TEST_ASSERT_TRUE(avail >= 0);
}

void test_serial_write_available(void) {
    serial.beginInt(1U, SERIAL_SPEED);

    // Should have space for writing
    int space = serial.availableForWriteInt(1U);
    TEST_ASSERT_TRUE(space > 0);
}

#if defined(SERIAL_REPEATER)
void test_serial_repeater_initialization(void) {
    serial.beginInt(3U, SERIAL_REPEATER_BAUD_RATE);
    delay(100);

    int avail = serial.availableForReadInt(3U);
    TEST_ASSERT_TRUE(avail >= 0);
}
#endif

#if defined(USE_WIFI_UDP)
// WiFi UDP tests (only when WiFi is enabled)
#include "UDPControllerESP32.h"

void test_wifi_udp_initialization(void) {
    // UDPController should initialize without crash
    bool result = udpController.init(
        WIFI_SSID,
#if defined(WIFI_PASSWORD)
        WIFI_PASSWORD,
#else
        NULL,
#endif
        MMDVM_HOST_ADDRESS,
        MMDVM_HOST_PORT,
        MMDVM_LOCAL_PORT
    );

    TEST_ASSERT_TRUE(result);
}

void test_wifi_udp_start(void) {
    udpController.start();
    delay(100);

    // Should be started
    TEST_ASSERT_TRUE(udpController.isStarted());
}

void test_wifi_connection(void) {
    udpController.start();

    // Wait for connection (up to 30 seconds)
    uint32_t start = millis();
    while (!udpController.isConnected() && (millis() - start) < 30000) {
        delay(100);
    }

    // Should connect eventually
    TEST_ASSERT_TRUE(udpController.isConnected());
}

void test_wifi_rssi(void) {
    if (udpController.isConnected()) {
        int rssi = udpController.getRSSI();
        // RSSI should be negative and reasonable
        TEST_ASSERT_TRUE(rssi < 0);
        TEST_ASSERT_TRUE(rssi > -100);
    }
}

void test_wifi_pause_resume(void) {
    udpController.pauseWiFi();
    TEST_ASSERT_TRUE(udpController.isPaused());

    udpController.resumeWiFi();
    TEST_ASSERT_FALSE(udpController.isPaused());
}
#endif // USE_WIFI_UDP

#if defined(USE_PWM_DAC)
// PWM DAC tests
void test_pwm_dac_output_range(void) {
    // Test that PWM duty cycle can be set to various values
    // This tests the LEDC configuration

    io.startInt();
    delay(10);

    // Verify no crashes with different DAC values
    // (actual output verification requires oscilloscope)
    TEST_PASS();
}
#endif

void setUp(void) {
    // Setup before each test
}

void tearDown(void) {
    // Cleanup after each test
}

void runAllTests(void) {
    UNITY_BEGIN();

    // GPIO tests
    RUN_TEST(test_gpio_pins_configured);
    RUN_TEST(test_led_control);
    RUN_TEST(test_ptt_control);
    RUN_TEST(test_cos_led_control);

#if defined(MODE_LEDS)
    RUN_TEST(test_mode_leds);
#endif

    // CPU identification
    RUN_TEST(test_cpu_identification);
    RUN_TEST(test_udid_retrieval);

    // Timing tests
    RUN_TEST(test_delay_accuracy);
    RUN_TEST(test_adc_configuration);
    RUN_TEST(test_timer_isr_rate);

    // Serial tests
    RUN_TEST(test_serial_initialization);
    RUN_TEST(test_serial_write_available);

#if defined(SERIAL_REPEATER)
    RUN_TEST(test_serial_repeater_initialization);
#endif

#if defined(USE_WIFI_UDP)
    RUN_TEST(test_wifi_udp_initialization);
    RUN_TEST(test_wifi_udp_start);
    RUN_TEST(test_wifi_connection);
    RUN_TEST(test_wifi_rssi);
    RUN_TEST(test_wifi_pause_resume);
#endif

#if defined(USE_PWM_DAC)
    RUN_TEST(test_pwm_dac_output_range);
#endif

    UNITY_END();
}

#endif // ESP32

// Entry point for PlatformIO test runner
#ifdef UNITY_TEST
void setup() {
#if defined(ESP32) || defined(ESP32S2) || defined(ESP32S3)
    delay(2000);  // Wait for serial connection
    runAllTests();
#endif
}

void loop() {
    // Nothing to do
}
#endif
