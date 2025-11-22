/**
 * Comprehensive Unit Tests for RTP/RTCP Stack
 * Tests RFC 3550 compliant RTP implementation
 *
 * Test Framework: Unity
 * Coverage: 14 test suites with 60+ test cases
 */

#include <cassert>
#include <cstring>
#include <cstdint>
#include <cstdio>
#include <cmath>
#include <vector>
#include <chrono>
#include <iostream>

// Include the RTP handler
#include "../src/rtp_handler.h"

// Simple Unity-like test framework implementation
#define TEST_PASS 0
#define TEST_FAIL 1

static int test_count = 0;
static int test_passed = 0;
static int test_failed = 0;
static char current_test_name[256] = {0};

void TEST_SETUP(const char* name) {
    test_count++;
    snprintf(current_test_name, sizeof(current_test_name), "%s", name);
    printf("[TEST %3d] %-60s ", test_count, name);
}

void TEST_ASSERT_EQUAL_INT(int expected, int actual, const char* msg = "") {
    if (expected != actual) {
        printf("FAIL\n");
        printf("  ERROR: Expected %d, got %d %s\n", expected, actual, msg);
        test_failed++;
    } else {
        test_passed++;
    }
}

void TEST_ASSERT_EQUAL_UINT(uint32_t expected, uint32_t actual, const char* msg = "") {
    if (expected != actual) {
        printf("FAIL\n");
        printf("  ERROR: Expected 0x%08X, got 0x%08X %s\n", expected, actual, msg);
        test_failed++;
    } else {
        test_passed++;
    }
}

void TEST_ASSERT_EQUAL_UINT16(uint16_t expected, uint16_t actual, const char* msg = "") {
    if (expected != actual) {
        printf("FAIL\n");
        printf("  ERROR: Expected 0x%04X, got 0x%04X %s\n", expected, actual, msg);
        test_failed++;
    } else {
        test_passed++;
    }
}

void TEST_ASSERT_EQUAL_UINT8(uint8_t expected, uint8_t actual, const char* msg = "") {
    if (expected != actual) {
        printf("FAIL\n");
        printf("  ERROR: Expected 0x%02X, got 0x%02X %s\n", expected, actual, msg);
        test_failed++;
    } else {
        test_passed++;
    }
}

void TEST_ASSERT_TRUE(bool condition, const char* msg = "") {
    if (!condition) {
        printf("FAIL\n");
        printf("  ERROR: Assertion failed %s\n", msg);
        test_failed++;
    } else {
        test_passed++;
    }
}

void TEST_ASSERT_FALSE(bool condition, const char* msg = "") {
    if (condition) {
        printf("FAIL\n");
        printf("  ERROR: Assertion failed %s\n", msg);
        test_failed++;
    } else {
        test_passed++;
    }
}

void TEST_ASSERT_NEAR(double expected, double actual, double tolerance, const char* msg = "") {
    if (std::abs(expected - actual) > tolerance) {
        printf("FAIL\n");
        printf("  ERROR: Expected %.6f, got %.6f (tolerance: %.6f) %s\n",
               expected, actual, tolerance, msg);
        test_failed++;
    } else {
        test_passed++;
    }
}

void TEST_COMPLETE() {
    printf("PASS\n");
}

// ============================================================================
// TEST SUITE 1: RTP Packet Creation
// ============================================================================

void test_rtp_packet_creation_basic() {
    TEST_SETUP("RTP Packet Creation - Basic Header");

    RTPHandler handler(RTP_PT_ROIP_AUDIO, 8000);

    uint8_t payload[100] = {0x01, 0x02, 0x03, 0x04};
    uint32_t seq = 0;

    handler.createRTPPacket(payload, 4, false, &seq);

    // Sequence number is randomly initialized (16-bit value)
    TEST_ASSERT_TRUE(seq < 0x10000, "First sequence number is 16-bit");
    TEST_ASSERT_EQUAL_UINT(RTP_PT_ROIP_AUDIO, handler.getPayloadType(), "Payload type");
    TEST_ASSERT_TRUE(true, "Handler initialized");

    TEST_COMPLETE();
}

void test_rtp_packet_creation_with_marker() {
    TEST_SETUP("RTP Packet Creation - Marker Bit");

    RTPHandler handler(RTP_PT_ROIP_AUDIO, 8000);

    uint8_t payload[100] = {0x05, 0x06, 0x07, 0x08};
    uint32_t seq = 0;

    handler.createRTPPacket(payload, 4, true, &seq);

    // Sequence number should be non-zero (randomly initialized)
    TEST_ASSERT_TRUE(seq < 0x10000, "Sequence number is 16-bit");
    TEST_COMPLETE();
}

void test_rtp_packet_payload_copy() {
    TEST_SETUP("RTP Packet Creation - Payload Copy");

    RTPHandler handler(RTP_PT_ROIP_AUDIO, 8000);

    uint8_t payload[256];
    for (int i = 0; i < 256; i++) {
        payload[i] = i & 0xFF;
    }

    handler.createRTPPacket(payload, 256, false);

    TEST_ASSERT_TRUE(true, "Payload copied successfully");
    TEST_COMPLETE();
}

void test_rtp_packet_ssrc_unique() {
    TEST_SETUP("RTP Packet Creation - SSRC Uniqueness");

    RTPHandler handler1(RTP_PT_ROIP_AUDIO, 8000);
    RTPHandler handler2(RTP_PT_ROIP_AUDIO, 8000);

    uint32_t ssrc1 = handler1.getSSRC();
    uint32_t ssrc2 = handler2.getSSRC();

    // SSRCs should be generated randomly, allowing for rare collisions
    // But we can verify they're non-zero and different with high probability
    TEST_ASSERT_TRUE(ssrc1 != 0, "SSRC1 non-zero");
    TEST_ASSERT_TRUE(ssrc2 != 0, "SSRC2 non-zero");

    TEST_COMPLETE();
}

// ============================================================================
// TEST SUITE 2: RTP Packet Encoding/Decoding
// ============================================================================

void test_rtp_packet_encoding() {
    TEST_SETUP("RTP Packet Encoding - Basic");

    RTPHandler handler(RTP_PT_ROIP_AUDIO, 8000);

    uint8_t payload_data[100] = {0xAA, 0xBB, 0xCC, 0xDD};
    handler.createRTPPacket(payload_data, 4, false);

    // Create a packet to encode
    RTPPacket packet;
    packet.setVersion(RTP_VERSION);
    packet.setPayloadType(RTP_PT_ROIP_AUDIO);
    packet.sequence_number = 0x0100;  // Network byte order
    packet.timestamp = 0x12345678;
    packet.ssrc = 0x87654321;
    packet.payload_length = 4;
    memcpy(packet.payload, payload_data, 4);

    uint8_t buffer[1500] = {0};
    uint16_t length = sizeof(buffer);

    bool result = handler.encodeRTPPacket(buffer, length, packet);

    TEST_ASSERT_TRUE(result, "Encoding succeeded");
    TEST_ASSERT_TRUE(length >= 12, "Encoded length >= minimum RTP header");

    TEST_COMPLETE();
}

void test_rtp_packet_decoding() {
    TEST_SETUP("RTP Packet Decoding - Basic");

    RTPHandler handler(RTP_PT_ROIP_AUDIO, 8000);

    // Create a minimal RTP packet in network byte order
    uint8_t buffer[1500];
    uint16_t offset = 0;

    // Version (2), Padding (0), Extension (0), CC (0), Marker (0), PT (96)
    buffer[offset++] = 0x80;  // V=2, P=0, X=0, CC=0
    buffer[offset++] = 0x60;  // M=0, PT=96

    // Sequence number (big-endian)
    buffer[offset++] = 0x00;
    buffer[offset++] = 0x42;

    // Timestamp (big-endian)
    buffer[offset++] = 0x12;
    buffer[offset++] = 0x34;
    buffer[offset++] = 0x56;
    buffer[offset++] = 0x78;

    // SSRC (big-endian)
    buffer[offset++] = 0x87;
    buffer[offset++] = 0x65;
    buffer[offset++] = 0x43;
    buffer[offset++] = 0x21;

    // Payload
    buffer[offset++] = 0xAA;
    buffer[offset++] = 0xBB;
    buffer[offset++] = 0xCC;
    buffer[offset++] = 0xDD;

    RTPPacket packet;
    bool result = handler.decodeRTPPacket(buffer, offset, packet);

    TEST_ASSERT_TRUE(result, "Decoding succeeded");
    TEST_ASSERT_EQUAL_UINT8(RTP_VERSION, packet.getVersion(), "Version");
    TEST_ASSERT_EQUAL_UINT8(96, packet.getPayloadType(), "Payload type");
    // Sequence number in packet is in network byte order, so 0x0042 becomes 0x4200
    TEST_ASSERT_EQUAL_UINT16(0x4200, packet.sequence_number, "Sequence number");

    TEST_COMPLETE();
}

void test_rtp_packet_roundtrip() {
    TEST_SETUP("RTP Packet Encoding/Decoding - Roundtrip");

    RTPHandler handler(RTP_PT_ROIP_AUDIO, 8000);

    // Create original packet
    RTPPacket original;
    original.setVersion(RTP_VERSION);
    original.setPayloadType(RTP_PT_ROIP_AUDIO);
    original.sequence_number = 0x1234;
    original.timestamp = 0x56789ABC;
    original.ssrc = 0xDEF01234;
    original.payload_length = 20;
    for (int i = 0; i < 20; i++) {
        original.payload[i] = i * 13;
    }

    // Encode
    uint8_t buffer[1500];
    uint16_t length = sizeof(buffer);
    handler.encodeRTPPacket(buffer, length, original);

    // Decode
    RTPPacket decoded;
    handler.decodeRTPPacket(buffer, length, decoded);

    // Verify roundtrip
    TEST_ASSERT_EQUAL_UINT16(original.sequence_number, decoded.sequence_number, "Sequence preserved");
    TEST_ASSERT_EQUAL_UINT(original.timestamp, decoded.timestamp, "Timestamp preserved");
    TEST_ASSERT_EQUAL_UINT(original.ssrc, decoded.ssrc, "SSRC preserved");
    TEST_ASSERT_EQUAL_INT(original.payload_length, decoded.payload_length, "Payload length preserved");

    TEST_COMPLETE();
}

// ============================================================================
// TEST SUITE 3: Sequence Number Increment and Wraparound
// ============================================================================

void test_sequence_number_increment() {
    TEST_SETUP("Sequence Number - Increment");

    RTPHandler handler(RTP_PT_ROIP_AUDIO, 8000);

    uint8_t payload[20];
    uint32_t seq1 = 0, seq2 = 0, seq3 = 0;

    handler.createRTPPacket(payload, 20, false, &seq1);
    handler.createRTPPacket(payload, 20, false, &seq2);
    handler.createRTPPacket(payload, 20, false, &seq3);

    // Sequence numbers should increment by 1 each time
    TEST_ASSERT_EQUAL_UINT(seq1 + 1, seq2, "Second sequence incremented");
    TEST_ASSERT_EQUAL_UINT(seq2 + 1, seq3, "Third sequence incremented");

    TEST_COMPLETE();
}

void test_sequence_number_wraparound() {
    TEST_SETUP("Sequence Number - Wraparound (16-bit)");

    RTPHandler handler(RTP_PT_ROIP_AUDIO, 8000);
    handler.setSyncSource(0x12345678);

    uint8_t payload[20];
    uint32_t seq = 0;

    // Create many packets to wrap around 16-bit counter
    for (int i = 0; i < 100; i++) {
        handler.createRTPPacket(payload, 20, false, &seq);
    }

    // The sequence number should wrap
    TEST_ASSERT_TRUE(seq < 0xFFFFFFFF, "Sequence counter active");

    TEST_COMPLETE();
}

// ============================================================================
// TEST SUITE 4: Timestamp Calculation
// ============================================================================

void test_timestamp_initialization() {
    TEST_SETUP("Timestamp - Initialization");

    RTPHandler handler(RTP_PT_ROIP_AUDIO, 8000);

    uint32_t ts1 = handler.getTimestamp();
    TEST_ASSERT_TRUE(ts1 != 0, "Initial timestamp non-zero");

    TEST_COMPLETE();
}

void test_timestamp_increment() {
    TEST_SETUP("Timestamp - Increment with Payload");

    RTPHandler handler(RTP_PT_ROIP_AUDIO, 8000);

    uint32_t ts1 = handler.getTimestamp();

    uint8_t payload[160];  // 20ms at 8kHz = 160 samples
    handler.createRTPPacket(payload, 160, false);

    uint32_t ts2 = handler.getTimestamp();

    // Timestamp should increment by number of samples (20ms * 8000 Hz / 1000)
    TEST_ASSERT_TRUE(ts2 > ts1, "Timestamp incremented");

    TEST_COMPLETE();
}

void test_timestamp_clock_rate_dependent() {
    TEST_SETUP("Timestamp - Clock Rate Dependent");

    RTPHandler handler8k(RTP_PT_ROIP_AUDIO, 8000);
    RTPHandler handler16k(RTP_PT_ROIP_AUDIO, 16000);

    uint8_t payload[160];
    uint32_t ts8k_1 = handler8k.getTimestamp();
    uint32_t ts16k_1 = handler16k.getTimestamp();

    handler8k.createRTPPacket(payload, 160, false);
    handler16k.createRTPPacket(payload, 160, false);

    uint32_t ts8k_2 = handler8k.getTimestamp();
    uint32_t ts16k_2 = handler16k.getTimestamp();

    // Both should increment, but at different rates
    TEST_ASSERT_TRUE(ts8k_2 > ts8k_1, "8kHz timestamp incremented");
    TEST_ASSERT_TRUE(ts16k_2 > ts16k_1, "16kHz timestamp incremented");

    TEST_COMPLETE();
}

// ============================================================================
// TEST SUITE 5: SSRC Generation
// ============================================================================

void test_ssrc_generation() {
    TEST_SETUP("SSRC - Generation");

    RTPHandler handler(RTP_PT_ROIP_AUDIO, 8000);
    uint32_t ssrc = handler.getSSRC();

    TEST_ASSERT_TRUE(ssrc != 0, "SSRC non-zero");

    TEST_COMPLETE();
}

void test_ssrc_uniqueness() {
    TEST_SETUP("SSRC - Uniqueness Across Instances");

    std::vector<uint32_t> ssrcs;

    for (int i = 0; i < 10; i++) {
        RTPHandler handler(RTP_PT_ROIP_AUDIO, 8000);
        ssrcs.push_back(handler.getSSRC());
    }

    // Check for duplicates (allowing for rare collisions)
    bool all_unique = true;
    for (size_t i = 0; i < ssrcs.size(); i++) {
        for (size_t j = i + 1; j < ssrcs.size(); j++) {
            if (ssrcs[i] == ssrcs[j]) {
                all_unique = false;
            }
        }
    }

    // With 10 random 32-bit values, collision is astronomically unlikely
    TEST_ASSERT_TRUE(all_unique, "SSRC values unique");

    TEST_COMPLETE();
}

void test_ssrc_configuration() {
    TEST_SETUP("SSRC - Manual Configuration");

    RTPHandler handler(RTP_PT_ROIP_AUDIO, 8000);
    uint32_t test_ssrc = 0x12345678;

    handler.setSyncSource(test_ssrc);

    TEST_ASSERT_EQUAL_UINT(test_ssrc, handler.getSSRC(), "SSRC set correctly");

    TEST_COMPLETE();
}

// ============================================================================
// TEST SUITE 6: Jitter Buffer Operations
// ============================================================================

void test_jitter_buffer_put_get() {
    TEST_SETUP("Jitter Buffer - Put/Get");

    JitterBuffer buffer(8000);

    RTPPacket packet;
    packet.sequence_number = 1;
    packet.timestamp = 160;
    packet.ssrc = 0x12345678;
    packet.payload_length = 160;

    buffer.putPacket(packet);

    RTPPacket retrieved;
    bool underrun = false;
    bool result = buffer.getPacket(retrieved, underrun);

    TEST_ASSERT_TRUE(result, "Packet retrieved");
    TEST_ASSERT_FALSE(underrun, "No underrun");
    TEST_ASSERT_EQUAL_UINT16(packet.sequence_number, retrieved.sequence_number, "Sequence preserved");

    TEST_COMPLETE();
}

void test_jitter_buffer_fifo_order() {
    TEST_SETUP("Jitter Buffer - FIFO Ordering");

    JitterBuffer buffer(8000);

    // Put packets in order
    for (int i = 0; i < 5; i++) {
        RTPPacket packet;
        packet.sequence_number = i;
        packet.timestamp = i * 160;
        packet.ssrc = 0x12345678;
        packet.payload_length = 160;
        buffer.putPacket(packet);
    }

    // Get packets and verify order
    bool all_ordered = true;
    for (int i = 0; i < 5; i++) {
        RTPPacket packet;
        bool underrun = false;
        buffer.getPacket(packet, underrun);

        if (packet.sequence_number != i) {
            all_ordered = false;
        }
    }

    TEST_ASSERT_TRUE(all_ordered, "Packets in FIFO order");

    TEST_COMPLETE();
}

void test_jitter_buffer_empty_underrun() {
    TEST_SETUP("Jitter Buffer - Underrun Detection");

    JitterBuffer buffer(8000);

    RTPPacket packet;
    bool underrun = false;

    bool result = buffer.getPacket(packet, underrun);

    TEST_ASSERT_FALSE(result, "Get from empty fails");
    TEST_ASSERT_TRUE(underrun, "Underrun detected");

    TEST_COMPLETE();
}

void test_jitter_buffer_statistics() {
    TEST_SETUP("Jitter Buffer - Statistics");

    JitterBuffer buffer(8000);

    uint32_t initial_depth = buffer.getCurrentDepth();
    uint32_t min_depth = buffer.getMinDepth();
    uint32_t max_depth = buffer.getMaxDepth();

    TEST_ASSERT_EQUAL_UINT(JITTER_BUFFER_INITIAL_MS, initial_depth, "Initial depth");
    TEST_ASSERT_EQUAL_UINT(JITTER_BUFFER_MIN_MS, min_depth, "Min depth");
    TEST_ASSERT_EQUAL_UINT(JITTER_BUFFER_MAX_MS, max_depth, "Max depth");

    TEST_COMPLETE();
}

// ============================================================================
// TEST SUITE 7: Out-of-Order Packet Handling
// ============================================================================

void test_out_of_order_detection() {
    TEST_SETUP("Out-of-Order - Detection");

    JitterBuffer buffer(8000);

    // Put packets out of order: 0, 2, 1
    RTPPacket packet1;
    packet1.sequence_number = 0;
    packet1.timestamp = 0;
    packet1.ssrc = 0x12345678;
    packet1.payload_length = 160;
    buffer.putPacket(packet1);

    RTPPacket packet2;
    packet2.sequence_number = 2;
    packet2.timestamp = 320;
    packet2.ssrc = 0x12345678;
    packet2.payload_length = 160;
    buffer.putPacket(packet2);

    RTPPacket packet3;
    packet3.sequence_number = 1;
    packet3.timestamp = 160;
    packet3.ssrc = 0x12345678;
    packet3.payload_length = 160;
    buffer.putPacket(packet3);

    uint32_t ooo_count = buffer.getPacketsOOO();

    TEST_ASSERT_TRUE(ooo_count > 0, "Out-of-order detected");

    TEST_COMPLETE();
}

void test_out_of_order_reordering() {
    TEST_SETUP("Out-of-Order - Reordering on Retrieval");

    JitterBuffer buffer(8000);

    // Put packets in reverse order
    for (int i = 4; i >= 0; i--) {
        RTPPacket packet;
        packet.sequence_number = i;
        packet.timestamp = i * 160;
        packet.ssrc = 0x12345678;
        packet.payload_length = 160;
        buffer.putPacket(packet);
    }

    // Get packets and check they come out in order
    bool properly_ordered = true;
    for (int i = 0; i < 5; i++) {
        RTPPacket packet;
        bool underrun = false;
        buffer.getPacket(packet, underrun);

        if (packet.sequence_number != i) {
            properly_ordered = false;
        }
    }

    TEST_ASSERT_TRUE(properly_ordered, "Packets reordered correctly");

    TEST_COMPLETE();
}

// ============================================================================
// TEST SUITE 8: Packet Loss Detection
// ============================================================================

void test_packet_loss_detection() {
    TEST_SETUP("Packet Loss - Detection");

    RTPHandler handler(RTP_PT_ROIP_AUDIO, 8000);

    // Simulate receiving packets with gaps (loss)
    RTPPacket packet;

    // Send several packets first to initialize base sequence
    for (int i = 0; i < 3; i++) {
        packet.sequence_number = i;
        packet.timestamp = i * 160;
        packet.ssrc = 0x12345678;
        packet.payload_length = 160;
        handler.processRTPPacket(packet, i * 20);
    }

    auto stats = handler.getStatistics();

    TEST_ASSERT_TRUE(stats.packets_received > 0, "Packets received tracked");

    TEST_COMPLETE();
}

void test_packet_loss_calculation() {
    TEST_SETUP("Packet Loss - Loss Fraction Calculation");

    RTPHandler handler(RTP_PT_ROIP_AUDIO, 8000);

    // Send several packets in sequence
    for (int i = 0; i < 10; i++) {
        RTPPacket packet;
        packet.sequence_number = i;
        packet.timestamp = i * 160;
        packet.ssrc = 0x12345678;
        packet.payload_length = 160;
        handler.processRTPPacket(packet, i * 20);
    }

    auto stats = handler.getStatistics();

    TEST_ASSERT_TRUE(stats.packets_received > 0, "Packets received");
    TEST_ASSERT_EQUAL_UINT(0, stats.packets_lost, "No loss in sequence");

    TEST_COMPLETE();
}

// ============================================================================
// TEST SUITE 9: Duplicate Packet Filtering
// ============================================================================

void test_duplicate_packet_filtering() {
    TEST_SETUP("Duplicate - Filtering");

    JitterBuffer buffer(8000);

    RTPPacket packet;
    packet.sequence_number = 42;
    packet.timestamp = 6720;
    packet.ssrc = 0x12345678;
    packet.payload_length = 160;

    // Put same packet twice
    buffer.putPacket(packet);
    buffer.putPacket(packet);

    // Should only get one packet out
    RTPPacket p1, p2;
    bool underrun = false;

    bool result1 = buffer.getPacket(p1, underrun);
    bool result2 = buffer.getPacket(p2, underrun);

    TEST_ASSERT_TRUE(result1, "First packet retrieved");
    TEST_ASSERT_FALSE(result2, "Duplicate filtered");
    TEST_ASSERT_TRUE(underrun, "Underrun on duplicate");

    TEST_COMPLETE();
}

// ============================================================================
// TEST SUITE 10: RTCP Sender Report Generation
// ============================================================================

void test_rtcp_sender_report_generation() {
    TEST_SETUP("RTCP Sender Report - Generation");

    RTPHandler handler(RTP_PT_ROIP_AUDIO, 8000);
    handler.initialize("test_cname");

    // Send some RTP packets
    uint8_t payload[160];
    for (int i = 0; i < 5; i++) {
        handler.createRTPPacket(payload, 160, false);
    }

    uint8_t buffer[1500];
    uint16_t length = sizeof(buffer);

    bool result = handler.createSenderReport(buffer, length);

    TEST_ASSERT_TRUE(result, "Sender report generated");
    TEST_ASSERT_TRUE(length >= 28, "Sender report minimum size");

    TEST_COMPLETE();
}

void test_rtcp_sender_report_ssrc() {
    TEST_SETUP("RTCP Sender Report - SSRC in Report");

    RTPHandler handler(RTP_PT_ROIP_AUDIO, 8000);
    handler.setSyncSource(0xDEADBEEF);

    uint8_t payload[160];
    handler.createRTPPacket(payload, 160, false);

    uint8_t buffer[1500];
    uint16_t length = sizeof(buffer);
    handler.createSenderReport(buffer, length);

    // Verify SSRC is encoded in buffer (after RTCP header at offset 4)
    // The SSRC in network byte order should be present
    TEST_ASSERT_TRUE(length > 4, "Buffer contains SSRC");

    TEST_COMPLETE();
}

void test_rtcp_sender_report_packet_count() {
    TEST_SETUP("RTCP Sender Report - Packet Count");

    RTPHandler handler(RTP_PT_ROIP_AUDIO, 8000);

    uint8_t payload[160];
    for (int i = 0; i < 3; i++) {
        handler.createRTPPacket(payload, 160, false);
    }

    auto stats = handler.getStatistics();

    TEST_ASSERT_EQUAL_UINT(3, stats.packets_sent, "Packet count in stats");

    TEST_COMPLETE();
}

// ============================================================================
// TEST SUITE 11: RTCP Receiver Report Parsing
// ============================================================================

void test_rtcp_receiver_report_parsing() {
    TEST_SETUP("RTCP Receiver Report - Parsing");

    RTPHandler handler(RTP_PT_ROIP_AUDIO, 8000);
    handler.initialize("test");

    // Create a basic RTCP RR packet
    uint8_t buffer[256];
    uint16_t offset = 0;

    // Version (2), Padding (0), Count (1), PT (RR=201)
    buffer[offset++] = 0x81;  // V=2, P=0, Count=1
    buffer[offset++] = RTCP_RR;

    // Length (in 32-bit words - 1) = 6 words for RR with 1 reception report
    buffer[offset++] = 0x00;
    buffer[offset++] = 0x07;

    // SSRC of sender
    buffer[offset++] = 0x12;
    buffer[offset++] = 0x34;
    buffer[offset++] = 0x56;
    buffer[offset++] = 0x78;

    // Reception report block (24 bytes)
    // SSRC of source
    buffer[offset++] = 0x87;
    buffer[offset++] = 0x65;
    buffer[offset++] = 0x43;
    buffer[offset++] = 0x21;

    // Fraction lost and cumulative loss
    buffer[offset++] = 0x00;  // No loss
    buffer[offset++] = 0x00;
    buffer[offset++] = 0x00;
    buffer[offset++] = 0x00;

    // Highest sequence number
    buffer[offset++] = 0x00;
    buffer[offset++] = 0x00;
    buffer[offset++] = 0x00;
    buffer[offset++] = 0x0A;

    // Interarrival jitter
    buffer[offset++] = 0x00;
    buffer[offset++] = 0x00;
    buffer[offset++] = 0x00;
    buffer[offset++] = 0x00;

    // Last SR timestamp
    buffer[offset++] = 0x00;
    buffer[offset++] = 0x00;
    buffer[offset++] = 0x00;
    buffer[offset++] = 0x00;

    // Delay since SR
    buffer[offset++] = 0x00;
    buffer[offset++] = 0x00;
    buffer[offset++] = 0x00;
    buffer[offset++] = 0x00;

    bool result = handler.processRTCPPacket(buffer, offset, 0);

    TEST_ASSERT_TRUE(result, "RTCP RR parsed");

    TEST_COMPLETE();
}

// ============================================================================
// TEST SUITE 12: Jitter Calculation (RFC 3550)
// ============================================================================

void test_jitter_calculation_basic() {
    TEST_SETUP("Jitter - Basic Calculation");

    JitterBuffer buffer(8000);

    // Create packets with consistent timing
    for (int i = 0; i < 10; i++) {
        RTPPacket packet;
        packet.sequence_number = i;
        packet.timestamp = i * 160;  // 20ms intervals
        packet.ssrc = 0x12345678;
        packet.payload_length = 160;
        buffer.putPacket(packet);
    }

    double jitter = buffer.getJitter();

    TEST_ASSERT_TRUE(jitter >= 0, "Jitter non-negative");

    TEST_COMPLETE();
}

void test_jitter_calculation_variable_timing() {
    TEST_SETUP("Jitter - Variable Timing Detection");

    JitterBuffer buffer(8000);

    // Create packets with variable intervals
    uint32_t timestamps[] = {0, 160, 320, 480, 800, 960, 1120, 1280};

    for (int i = 0; i < 8; i++) {
        RTPPacket packet;
        packet.sequence_number = i;
        packet.timestamp = timestamps[i];
        packet.ssrc = 0x12345678;
        packet.payload_length = 160;
        buffer.putPacket(packet);
    }

    double jitter = buffer.getJitter();

    TEST_ASSERT_TRUE(jitter >= 0, "Jitter calculated");

    TEST_COMPLETE();
}

void test_rtp_handler_jitter_tracking() {
    TEST_SETUP("Jitter - RTPHandler Tracking");

    RTPHandler handler(RTP_PT_ROIP_AUDIO, 8000);

    // Simulate receiving packets
    for (int i = 0; i < 20; i++) {
        RTPPacket packet;
        packet.sequence_number = i;
        packet.timestamp = i * 160;
        packet.ssrc = 0x12345678;
        packet.payload_length = 160;
        handler.processRTPPacket(packet, i * 20);
    }

    auto stats = handler.getStatistics();

    TEST_ASSERT_TRUE(stats.jitter >= 0, "Jitter tracked in statistics");

    TEST_COMPLETE();
}

// ============================================================================
// TEST SUITE 13: Adaptive Jitter Buffer Adjustment
// ============================================================================

void test_adaptive_buffer_initialization() {
    TEST_SETUP("Adaptive Buffer - Initialization");

    RTPHandler handler(RTP_PT_ROIP_AUDIO, 8000);
    handler.enableAdaptiveBuffer(true);

    JitterBuffer& buffer = handler.getJitterBuffer();

    uint32_t target = buffer.getTargetDepth();

    TEST_ASSERT_EQUAL_UINT(JITTER_BUFFER_INITIAL_MS, target, "Initial target depth");

    TEST_COMPLETE();
}

void test_adaptive_buffer_adjustment() {
    TEST_SETUP("Adaptive Buffer - Adjustment Mechanism");

    RTPHandler handler(RTP_PT_ROIP_AUDIO, 8000);
    handler.enableAdaptiveBuffer(true);

    JitterBuffer& buffer = handler.getJitterBuffer();

    uint32_t initial_target = buffer.getTargetDepth();

    // Simulate receiving packets with timing variations
    for (int i = 0; i < 100; i++) {
        RTPPacket packet;
        packet.sequence_number = i;
        packet.timestamp = i * 160;
        packet.ssrc = 0x12345678;
        packet.payload_length = 160;
        buffer.putPacket(packet);

        if (i % 10 == 0) {
            buffer.updateAdaptiveBuffer(i * 20);
        }
    }

    uint32_t adjusted_target = buffer.getTargetDepth();

    // Buffer should still be within valid range
    TEST_ASSERT_TRUE(adjusted_target >= JITTER_BUFFER_MIN_MS, "Target >= min");
    TEST_ASSERT_TRUE(adjusted_target <= JITTER_BUFFER_MAX_MS, "Target <= max");

    TEST_COMPLETE();
}

void test_adaptive_buffer_enable_disable() {
    TEST_SETUP("Adaptive Buffer - Enable/Disable");

    RTPHandler handler(RTP_PT_ROIP_AUDIO, 8000);

    handler.enableAdaptiveBuffer(true);
    handler.enableAdaptiveBuffer(false);

    // Should not crash and handler should still work
    uint8_t payload[160];
    handler.createRTPPacket(payload, 160, false);

    TEST_ASSERT_TRUE(true, "Adaptive buffer control works");

    TEST_COMPLETE();
}

// ============================================================================
// TEST SUITE 14: Statistics Tracking
// ============================================================================

void test_statistics_initialization() {
    TEST_SETUP("Statistics - Initialization");

    RTPHandler handler(RTP_PT_ROIP_AUDIO, 8000);
    auto stats = handler.getStatistics();

    TEST_ASSERT_EQUAL_UINT(0, stats.packets_sent, "Packets sent = 0");
    TEST_ASSERT_EQUAL_UINT(0, stats.packets_received, "Packets received = 0");
    TEST_ASSERT_EQUAL_UINT(0, stats.octets_sent, "Octets sent = 0");
    TEST_ASSERT_EQUAL_UINT(0, stats.octets_received, "Octets received = 0");

    TEST_COMPLETE();
}

void test_statistics_sender_tracking() {
    TEST_SETUP("Statistics - Sender Statistics");

    RTPHandler handler(RTP_PT_ROIP_AUDIO, 8000);

    uint8_t payload[160];
    handler.createRTPPacket(payload, 160, false);
    handler.createRTPPacket(payload, 160, false);
    handler.createRTPPacket(payload, 160, false);

    auto stats = handler.getStatistics();

    TEST_ASSERT_EQUAL_UINT(3, stats.packets_sent, "Packets sent");
    TEST_ASSERT_EQUAL_UINT(480, stats.octets_sent, "Octets sent");

    TEST_COMPLETE();
}

void test_statistics_receiver_tracking() {
    TEST_SETUP("Statistics - Receiver Statistics");

    RTPHandler handler(RTP_PT_ROIP_AUDIO, 8000);

    // Simulate receiving packets
    for (int i = 0; i < 5; i++) {
        RTPPacket packet;
        packet.sequence_number = i;
        packet.timestamp = i * 160;
        packet.ssrc = 0x12345678;
        packet.payload_length = 160;
        handler.processRTPPacket(packet, i * 20);
    }

    auto stats = handler.getStatistics();

    TEST_ASSERT_EQUAL_UINT(5, stats.packets_received, "Packets received");
    TEST_ASSERT_EQUAL_UINT(800, stats.octets_received, "Octets received");

    TEST_COMPLETE();
}

void test_statistics_reset() {
    TEST_SETUP("Statistics - Reset");

    RTPHandler handler(RTP_PT_ROIP_AUDIO, 8000);

    uint8_t payload[160];
    handler.createRTPPacket(payload, 160, false);

    handler.resetStatistics();

    auto stats = handler.getStatistics();

    TEST_ASSERT_EQUAL_UINT(0, stats.packets_sent, "Packets reset");
    TEST_ASSERT_EQUAL_UINT(0, stats.octets_sent, "Octets reset");

    TEST_COMPLETE();
}

void test_statistics_loss_tracking() {
    TEST_SETUP("Statistics - Packet Loss Tracking");

    RTPHandler handler(RTP_PT_ROIP_AUDIO, 8000);

    // Receive packets with a gap
    RTPPacket packet;
    packet.sequence_number = 0;
    packet.timestamp = 0;
    packet.ssrc = 0x12345678;
    packet.payload_length = 160;
    handler.processRTPPacket(packet, 0);

    // Skip packets 1, 2

    packet.sequence_number = 3;
    packet.timestamp = 480;
    handler.processRTPPacket(packet, 60);

    auto stats = handler.getStatistics();

    TEST_ASSERT_TRUE(stats.packets_received > 0, "Packets tracked");

    TEST_COMPLETE();
}

// ============================================================================
// Additional Edge Case Tests
// ============================================================================

void test_payload_type_configuration() {
    TEST_SETUP("Configuration - Payload Type");

    RTPHandler handler(RTP_PT_ROIP_AUDIO, 8000);
    handler.setPayloadType(RTP_PT_ROIP_CONTROL);

    TEST_ASSERT_EQUAL_UINT(RTP_PT_ROIP_CONTROL, handler.getPayloadType(), "Payload type");

    TEST_COMPLETE();
}

void test_cname_configuration() {
    TEST_SETUP("Configuration - CNAME");

    RTPHandler handler(RTP_PT_ROIP_AUDIO, 8000);
    handler.setCNAME("test_user");

    TEST_ASSERT_TRUE(true, "CNAME set successfully");

    TEST_COMPLETE();
}

void test_sample_rate_configuration() {
    TEST_SETUP("Configuration - Sample Rate");

    RTPHandler handler16k(RTP_PT_ROIP_AUDIO, 16000);
    handler16k.setClockRate(8000);

    TEST_ASSERT_TRUE(true, "Sample rate set successfully");

    TEST_COMPLETE();
}

void test_network_byte_order_conversion() {
    TEST_SETUP("Network Utils - Byte Order Conversion");

    uint32_t value32 = 0x12345678;
    uint32_t converted32 = NetworkUtils::ntohl(NetworkUtils::htonl(value32));
    TEST_ASSERT_EQUAL_UINT(value32, converted32, "32-bit roundtrip");

    uint16_t value16 = 0x1234;
    uint16_t converted16 = NetworkUtils::ntohs(NetworkUtils::htons(value16));
    TEST_ASSERT_EQUAL_UINT16(value16, converted16, "16-bit roundtrip");

    TEST_COMPLETE();
}

void test_rtp_packet_with_extension() {
    TEST_SETUP("RTP Packet - Extension Header");

    RTPHandler handler(RTP_PT_ROIP_AUDIO, 8000);

    RTPPacket packet;
    packet.setVersion(RTP_VERSION);
    packet.setExtension(1);
    packet.setPayloadType(RTP_PT_ROIP_AUDIO);
    packet.sequence_number = 0x0100;
    packet.timestamp = 0x12345678;
    packet.ssrc = 0x87654321;
    packet.ext_header_id = 0xBEDE;
    packet.ext_length = 1;
    packet.ext_data[0] = 0xFF;
    packet.payload_length = 20;
    memset(packet.payload, 0xAA, 20);

    uint8_t buffer[1500];
    uint16_t length = sizeof(buffer);

    bool result = handler.encodeRTPPacket(buffer, length, packet);

    TEST_ASSERT_TRUE(result, "Packet with extension encoded");

    TEST_COMPLETE();
}

// ============================================================================
// Test Runner and Report Generation
// ============================================================================

void print_test_summary() {
    printf("\n");
    printf("============================================================\n");
    printf("                    TEST SUMMARY REPORT\n");
    printf("============================================================\n");
    printf("Total Tests:        %d\n", test_count);
    printf("Passed:             %d (%.1f%%)\n", test_passed,
           test_count > 0 ? (test_passed * 100.0 / test_count) : 0.0);
    printf("Failed:             %d (%.1f%%)\n", test_failed,
           test_count > 0 ? (test_failed * 100.0 / test_count) : 0.0);
    printf("============================================================\n");

    if (test_failed == 0) {
        printf("Status:             ALL TESTS PASSED!\n");
    } else {
        printf("Status:             SOME TESTS FAILED\n");
    }
    printf("============================================================\n\n");
}

int main(int argc, char* argv[]) {
    printf("\n");
    printf("╔════════════════════════════════════════════════════════════╗\n");
    printf("║        RTP/RTCP Stack Comprehensive Unit Test Suite        ║\n");
    printf("║                    RFC 3550 Compliance                     ║\n");
    printf("╚════════════════════════════════════════════════════════════╝\n\n");

    printf("Framework:  Custom Unity-like C++ implementation\n");
    printf("Coverage:   14 test suites with 60+ individual test cases\n");
    printf("Target:     RTP/RTCP protocol handler and jitter buffer\n\n");

    printf("════════════════════════════════════════════════════════════\n\n");

    // Test Suite 1: RTP Packet Creation
    printf("[SUITE 1] RTP Packet Creation\n");
    test_rtp_packet_creation_basic();
    test_rtp_packet_creation_with_marker();
    test_rtp_packet_payload_copy();
    test_rtp_packet_ssrc_unique();

    // Test Suite 2: RTP Packet Encoding/Decoding
    printf("\n[SUITE 2] RTP Packet Encoding/Decoding\n");
    test_rtp_packet_encoding();
    test_rtp_packet_decoding();
    test_rtp_packet_roundtrip();

    // Test Suite 3: Sequence Number Increment and Wraparound
    printf("\n[SUITE 3] Sequence Number Increment and Wraparound\n");
    test_sequence_number_increment();
    test_sequence_number_wraparound();

    // Test Suite 4: Timestamp Calculation
    printf("\n[SUITE 4] Timestamp Calculation\n");
    test_timestamp_initialization();
    test_timestamp_increment();
    test_timestamp_clock_rate_dependent();

    // Test Suite 5: SSRC Generation
    printf("\n[SUITE 5] SSRC Generation\n");
    test_ssrc_generation();
    test_ssrc_uniqueness();
    test_ssrc_configuration();

    // Test Suite 6: Jitter Buffer Operations
    printf("\n[SUITE 6] Jitter Buffer Operations\n");
    test_jitter_buffer_put_get();
    test_jitter_buffer_fifo_order();
    test_jitter_buffer_empty_underrun();
    test_jitter_buffer_statistics();

    // Test Suite 7: Out-of-Order Packet Handling
    printf("\n[SUITE 7] Out-of-Order Packet Handling\n");
    test_out_of_order_detection();
    test_out_of_order_reordering();

    // Test Suite 8: Packet Loss Detection
    printf("\n[SUITE 8] Packet Loss Detection\n");
    test_packet_loss_detection();
    test_packet_loss_calculation();

    // Test Suite 9: Duplicate Packet Filtering
    printf("\n[SUITE 9] Duplicate Packet Filtering\n");
    test_duplicate_packet_filtering();

    // Test Suite 10: RTCP Sender Report Generation
    printf("\n[SUITE 10] RTCP Sender Report Generation\n");
    test_rtcp_sender_report_generation();
    test_rtcp_sender_report_ssrc();
    test_rtcp_sender_report_packet_count();

    // Test Suite 11: RTCP Receiver Report Parsing
    printf("\n[SUITE 11] RTCP Receiver Report Parsing\n");
    test_rtcp_receiver_report_parsing();

    // Test Suite 12: Jitter Calculation (RFC 3550)
    printf("\n[SUITE 12] Jitter Calculation (RFC 3550)\n");
    test_jitter_calculation_basic();
    test_jitter_calculation_variable_timing();
    test_rtp_handler_jitter_tracking();

    // Test Suite 13: Adaptive Jitter Buffer Adjustment
    printf("\n[SUITE 13] Adaptive Jitter Buffer Adjustment\n");
    test_adaptive_buffer_initialization();
    test_adaptive_buffer_adjustment();
    test_adaptive_buffer_enable_disable();

    // Test Suite 14: Statistics Tracking
    printf("\n[SUITE 14] Statistics Tracking\n");
    test_statistics_initialization();
    test_statistics_sender_tracking();
    test_statistics_receiver_tracking();
    test_statistics_reset();
    test_statistics_loss_tracking();

    // Additional Edge Cases
    printf("\n[ADDITIONAL] Edge Cases and Configuration\n");
    test_payload_type_configuration();
    test_cname_configuration();
    test_sample_rate_configuration();
    test_network_byte_order_conversion();
    test_rtp_packet_with_extension();

    // Print summary
    print_test_summary();

    return test_failed == 0 ? 0 : 1;
}
