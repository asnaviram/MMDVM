/*
 *   Unit Tests for UDP Controller Circular Buffer Operations
 *
 *   Tests the circular buffer logic used in WiFi UDP communication
 */

#include <unity.h>
#include <string.h>
#include <stdint.h>

// Mock the circular buffer implementation for testing
// (Extracted from UDPControllerESP32.cpp pattern)

#define TEST_BUFFER_SIZE 256

class TestCircularBuffer {
public:
    uint8_t m_buffer[TEST_BUFFER_SIZE];
    volatile uint16_t m_head;
    volatile uint16_t m_tail;

    TestCircularBuffer() : m_head(0), m_tail(0) {
        memset(m_buffer, 0, sizeof(m_buffer));
    }

    void reset() {
        m_head = 0;
        m_tail = 0;
        memset(m_buffer, 0, sizeof(m_buffer));
    }

    uint16_t available() const {
        if (m_head >= m_tail) {
            return m_head - m_tail;
        }
        return TEST_BUFFER_SIZE - m_tail + m_head;
    }

    uint16_t freeSpace() const {
        return TEST_BUFFER_SIZE - available() - 1;
    }

    bool put(uint8_t byte) {
        uint16_t nextHead = (m_head + 1) % TEST_BUFFER_SIZE;
        if (nextHead != m_tail) {
            m_buffer[m_head] = byte;
            m_head = nextHead;
            return true;
        }
        return false;  // Buffer full
    }

    uint8_t get() {
        if (m_tail == m_head)
            return 0;
        uint8_t byte = m_buffer[m_tail];
        m_tail = (m_tail + 1) % TEST_BUFFER_SIZE;
        return byte;
    }

    bool isEmpty() const {
        return m_head == m_tail;
    }

    bool isFull() const {
        return ((m_head + 1) % TEST_BUFFER_SIZE) == m_tail;
    }
};

static TestCircularBuffer buffer;

void setUp(void) {
    buffer.reset();
}

void tearDown(void) {
}

// Basic operations
void test_buffer_empty_initially(void) {
    TEST_ASSERT_TRUE(buffer.isEmpty());
    TEST_ASSERT_FALSE(buffer.isFull());
    TEST_ASSERT_EQUAL_UINT16(0, buffer.available());
}

void test_buffer_put_single(void) {
    TEST_ASSERT_TRUE(buffer.put(0x42));
    TEST_ASSERT_FALSE(buffer.isEmpty());
    TEST_ASSERT_EQUAL_UINT16(1, buffer.available());
}

void test_buffer_get_single(void) {
    buffer.put(0x42);
    uint8_t result = buffer.get();
    TEST_ASSERT_EQUAL_UINT8(0x42, result);
    TEST_ASSERT_TRUE(buffer.isEmpty());
}

void test_buffer_fifo_order(void) {
    buffer.put(0x01);
    buffer.put(0x02);
    buffer.put(0x03);

    TEST_ASSERT_EQUAL_UINT8(0x01, buffer.get());
    TEST_ASSERT_EQUAL_UINT8(0x02, buffer.get());
    TEST_ASSERT_EQUAL_UINT8(0x03, buffer.get());
}

void test_buffer_available_count(void) {
    for (int i = 0; i < 10; i++) {
        buffer.put(i);
    }
    TEST_ASSERT_EQUAL_UINT16(10, buffer.available());

    buffer.get();
    buffer.get();
    TEST_ASSERT_EQUAL_UINT16(8, buffer.available());
}

// Wrap-around tests
void test_buffer_wrap_around(void) {
    // Fill most of buffer
    for (int i = 0; i < 200; i++) {
        buffer.put(i & 0xFF);
    }

    // Read some
    for (int i = 0; i < 150; i++) {
        buffer.get();
    }

    // Add more (will wrap)
    for (int i = 0; i < 100; i++) {
        TEST_ASSERT_TRUE(buffer.put((i + 200) & 0xFF));
    }

    // Should have 50 + 100 = 150 items
    TEST_ASSERT_EQUAL_UINT16(150, buffer.available());
}

void test_buffer_wrap_data_integrity(void) {
    // Fill to cause wrap
    for (int i = 0; i < 200; i++) {
        buffer.put(i);
    }
    for (int i = 0; i < 180; i++) {
        buffer.get();
    }

    // Add data that wraps
    for (int i = 0; i < 100; i++) {
        buffer.put(100 + i);
    }

    // Read remaining original + new data
    for (int i = 0; i < 20; i++) {
        TEST_ASSERT_EQUAL_UINT8(180 + i, buffer.get());
    }
    for (int i = 0; i < 100; i++) {
        TEST_ASSERT_EQUAL_UINT8(100 + i, buffer.get());
    }
}

// Full buffer tests
void test_buffer_full(void) {
    // Fill buffer completely (255 items max due to head/tail gap)
    for (int i = 0; i < TEST_BUFFER_SIZE - 1; i++) {
        TEST_ASSERT_TRUE(buffer.put(i));
    }

    TEST_ASSERT_TRUE(buffer.isFull());
    TEST_ASSERT_FALSE(buffer.put(0xFF));  // Should fail
}

void test_buffer_full_then_read(void) {
    // Fill buffer
    for (int i = 0; i < TEST_BUFFER_SIZE - 1; i++) {
        buffer.put(i);
    }

    // Read one item
    buffer.get();

    // Should be able to add one more
    TEST_ASSERT_TRUE(buffer.put(0xAB));
}

// Empty buffer tests
void test_buffer_get_empty_returns_zero(void) {
    TEST_ASSERT_EQUAL_UINT8(0, buffer.get());
}

void test_buffer_empty_after_draining(void) {
    buffer.put(1);
    buffer.put(2);
    buffer.put(3);

    buffer.get();
    buffer.get();
    buffer.get();

    TEST_ASSERT_TRUE(buffer.isEmpty());
    TEST_ASSERT_EQUAL_UINT16(0, buffer.available());
}

// Free space tests
void test_buffer_free_space_empty(void) {
    TEST_ASSERT_EQUAL_UINT16(TEST_BUFFER_SIZE - 1, buffer.freeSpace());
}

void test_buffer_free_space_partial(void) {
    for (int i = 0; i < 100; i++) {
        buffer.put(i);
    }
    TEST_ASSERT_EQUAL_UINT16(TEST_BUFFER_SIZE - 1 - 100, buffer.freeSpace());
}

void test_buffer_free_space_full(void) {
    for (int i = 0; i < TEST_BUFFER_SIZE - 1; i++) {
        buffer.put(i);
    }
    TEST_ASSERT_EQUAL_UINT16(0, buffer.freeSpace());
}

// Stress test
void test_buffer_stress_many_operations(void) {
    for (int cycle = 0; cycle < 100; cycle++) {
        // Add 50 items
        for (int i = 0; i < 50; i++) {
            buffer.put((cycle * 50 + i) & 0xFF);
        }

        // Remove 50 items
        for (int i = 0; i < 50; i++) {
            uint8_t expected = (cycle * 50 + i) & 0xFF;
            TEST_ASSERT_EQUAL_UINT8(expected, buffer.get());
        }
    }

    TEST_ASSERT_TRUE(buffer.isEmpty());
}

#ifdef UNITY_TEST
int main(int argc, char **argv) {
    UNITY_BEGIN();

    // Basic operations
    RUN_TEST(test_buffer_empty_initially);
    RUN_TEST(test_buffer_put_single);
    RUN_TEST(test_buffer_get_single);
    RUN_TEST(test_buffer_fifo_order);
    RUN_TEST(test_buffer_available_count);

    // Wrap-around
    RUN_TEST(test_buffer_wrap_around);
    RUN_TEST(test_buffer_wrap_data_integrity);

    // Full buffer
    RUN_TEST(test_buffer_full);
    RUN_TEST(test_buffer_full_then_read);

    // Empty buffer
    RUN_TEST(test_buffer_get_empty_returns_zero);
    RUN_TEST(test_buffer_empty_after_draining);

    // Free space
    RUN_TEST(test_buffer_free_space_empty);
    RUN_TEST(test_buffer_free_space_partial);
    RUN_TEST(test_buffer_free_space_full);

    // Stress
    RUN_TEST(test_buffer_stress_many_operations);

    return UNITY_END();
}
#endif
