#ifndef RTP_HANDLER_H
#define RTP_HANDLER_H

#include <cstdint>
#include <cstring>
#include <queue>
#include <deque>
#include <map>
#include <algorithm>
#include <chrono>
#include <cmath>

// RFC 3550 - RTP: A Transport Protocol for Real-Time Applications

// ============================================================================
// RTP Header Structures and Constants
// ============================================================================

// RTP Version
#define RTP_VERSION 2

// RTP Payload Types
enum RTPPayloadType {
    RTP_PT_PCM_ULAW = 0,
    RTP_PT_PCM_ALAW = 8,
    RTP_PT_GSM = 3,
    RTP_PT_G723 = 4,
    RTP_PT_DVI4_8K = 5,
    RTP_PT_DVI4_16K = 6,
    RTP_PT_LPC = 7,
    RTP_PT_PCMA = 8,
    RTP_PT_G722 = 9,
    RTP_PT_L16_STEREO = 10,
    RTP_PT_L16_MONO = 11,
    RTP_PT_QCELP = 12,
    RTP_PT_CN = 13,
    RTP_PT_MPA = 14,
    RTP_PT_G728 = 15,
    RTP_PT_DVI4_11K = 16,
    RTP_PT_DVI4_22K = 17,
    RTP_PT_G729 = 18,
    RTP_PT_UNASSIGNED_19 = 19,
    RTP_PT_UNASSIGNED_20 = 20,
    RTP_PT_UNASSIGNED_21 = 21,
    RTP_PT_UNASSIGNED_22 = 22,
    RTP_PT_UNASSIGNED_23 = 23,
    RTP_PT_UNASSIGNED_24 = 24,
    RTP_PT_CELLB = 25,
    RTP_PT_JPEG = 26,
    RTP_PT_NVSRC = 28,
    RTP_PT_H261 = 31,
    RTP_PT_MPV = 32,
    RTP_PT_TS1 = 33,
    RTP_PT_MP2T = 33,
    RTP_PT_H263 = 34,
    RTP_PT_ROIP_AUDIO = 96,  // Dynamic payload type for ROIP
    RTP_PT_ROIP_CONTROL = 97  // Dynamic payload type for ROIP control
};

// RTCP Packet Types
enum RTCPPacketType {
    RTCP_SR = 200,   // Sender Report
    RTCP_RR = 201,   // Receiver Report
    RTCP_SDES = 202, // Source Description
    RTCP_BYE = 203,  // Goodbye
    RTCP_APP = 204,  // Application-defined
    RTCP_RTPFB = 205,// Transport layer feedback
    RTCP_PSFB = 206  // Payload-specific feedback
};

// RTCP SDES Item Types
enum RTCPSDESItemType {
    RTCP_SDES_END = 0,
    RTCP_SDES_CNAME = 1,
    RTCP_SDES_NAME = 2,
    RTCP_SDES_EMAIL = 3,
    RTCP_SDES_PHONE = 4,
    RTCP_SDES_LOC = 5,
    RTCP_SDES_TOOL = 6,
    RTCP_SDES_NOTE = 7,
    RTCP_SDES_PRIV = 8
};

// Jitter Buffer Configuration
#define JITTER_BUFFER_MIN_MS 20
#define JITTER_BUFFER_MAX_MS 200
#define JITTER_BUFFER_INITIAL_MS 50
#define JITTER_BUFFER_ADAPT_THRESHOLD 10 // % change to trigger adaptation
#define JITTER_BUFFER_ADAPT_INTERVAL_MS 1000

// Statistics configuration
#define STATS_WINDOW_SIZE 100
#define STATS_UPDATE_INTERVAL_MS 1000

// ============================================================================
// RTP Packet Structure (RFC 3550)
// ============================================================================

struct RTPPacket {
    // Fixed header (12 bytes minimum)
    uint8_t  version_p_x_cc;    // V(2), P(1), X(1), CC(4)
    uint8_t  m_pt;              // M(1), PT(7)
    uint16_t sequence_number;   // Network byte order (big-endian)
    uint32_t timestamp;         // Network byte order
    uint32_t ssrc;              // Network byte order
    uint32_t csrc[15];          // Contributing sources (0-15 entries)

    // Extension header (if X bit is set)
    uint16_t ext_header_id;     // Network byte order
    uint16_t ext_length;        // Network byte order (in 32-bit words)
    uint8_t  ext_data[256];     // Extension data

    // Payload
    uint8_t  payload[1472];     // Max payload size (1500 - 20 IP - 8 UDP - 12 RTP min)
    uint16_t payload_length;

    // Reception info (not part of wire format)
    uint32_t arrival_timestamp; // Local timing reference

    // Helper methods
    uint8_t  getVersion() const { return (version_p_x_cc >> 6) & 0x03; }
    uint8_t  getPadding() const { return (version_p_x_cc >> 5) & 0x01; }
    uint8_t  getExtension() const { return (version_p_x_cc >> 4) & 0x01; }
    uint8_t  getCC() const { return version_p_x_cc & 0x0F; }
    uint8_t  getMarker() const { return (m_pt >> 7) & 0x01; }
    uint8_t  getPayloadType() const { return m_pt & 0x7F; }

    void setVersion(uint8_t v) {
        version_p_x_cc = (version_p_x_cc & 0x3F) | ((v & 0x03) << 6);
    }
    void setPadding(uint8_t p) {
        version_p_x_cc = (version_p_x_cc & 0xDF) | ((p & 0x01) << 5);
    }
    void setExtension(uint8_t x) {
        version_p_x_cc = (version_p_x_cc & 0xEF) | ((x & 0x01) << 4);
    }
    void setCC(uint8_t cc) {
        version_p_x_cc = (version_p_x_cc & 0xF0) | (cc & 0x0F);
    }
    void setMarker(uint8_t m) {
        m_pt = (m_pt & 0x7F) | ((m & 0x01) << 7);
    }
    void setPayloadType(uint8_t pt) {
        m_pt = (m_pt & 0x80) | (pt & 0x7F);
    }
};

// ============================================================================
// RTCP Packet Structures (RFC 3550)
// ============================================================================

struct RTCPSenderReport {
    uint32_t ssrc;
    uint32_t ntp_msw;           // NTP timestamp most significant word
    uint32_t ntp_lsw;           // NTP timestamp least significant word
    uint32_t rtp_timestamp;
    uint32_t sender_packet_count;
    uint32_t sender_octet_count;
};

struct RTCPReceptionReport {
    uint32_t ssrc;              // SSRC of packet sender
    uint8_t  fraction_lost;
    uint32_t packets_lost;      // Cumulative
    uint32_t highest_sequence;
    uint32_t interarrival_jitter;
    uint32_t last_sr_timestamp;
    uint32_t delay_since_sr;
};

struct RTCPSourceDescription {
    uint32_t ssrc;
    struct {
        uint8_t type;
        uint8_t length;
        uint8_t data[255];
    } items[RTCP_SDES_PRIV + 1];
};

// ============================================================================
// Jitter Buffer - Adaptive implementation for RTP
// ============================================================================

class JitterBuffer {
public:
    JitterBuffer(uint32_t sample_rate = 8000);
    ~JitterBuffer() = default;

    // Buffer management
    void putPacket(const RTPPacket& packet);
    bool getPacket(RTPPacket& packet, bool& underrun);

    // Statistics
    uint32_t getCurrentDepth() const { return current_buffer_depth_ms; }
    uint32_t getTargetDepth() const { return target_buffer_depth_ms; }
    uint32_t getMaxDepth() const { return JITTER_BUFFER_MAX_MS; }
    uint32_t getMinDepth() const { return JITTER_BUFFER_MIN_MS; }
    uint32_t getPacketsLost() const { return packets_lost; }
    uint32_t getPacketsOOO() const { return packets_out_of_order; }
    double   getJitter() const { return current_jitter; }

    // Adaptive adjustment
    void updateAdaptiveBuffer(uint32_t current_time_ms);
    void reset();

private:
    struct BufferedPacket {
        RTPPacket packet;
        uint32_t arrival_time_ms;
        uint32_t sequence_number;
    };

    std::deque<BufferedPacket> buffer;
    uint32_t sample_rate;
    uint32_t current_buffer_depth_ms;
    uint32_t target_buffer_depth_ms;
    uint32_t last_adapt_time_ms;
    double   current_jitter;
    double   mean_inter_arrival_time;
    uint32_t last_arrival_time_ms;
    uint32_t packets_lost;
    uint32_t packets_out_of_order;
    uint32_t last_sequence_number;
    uint32_t last_timestamp;

    // Statistics for adaptive algorithm
    std::deque<uint32_t> inter_arrival_times;
    std::deque<uint32_t> arrival_delays;

    void calculateInterArrivalJitter(uint32_t arrival_time_ms, uint32_t rtp_timestamp);
    void adaptBufferSize();
    uint32_t msToSamples(uint32_t ms) const { return (sample_rate * ms) / 1000; }
    uint32_t samplesToMs(uint32_t samples) const { return (samples * 1000) / sample_rate; }
};

// ============================================================================
// RTP Handler - Main RTP protocol implementation
// ============================================================================

class RTPHandler {
public:
    RTPHandler(uint8_t payload_type = RTP_PT_ROIP_AUDIO, uint32_t sample_rate = 8000);
    ~RTPHandler() = default;

    // Initialize with local settings
    void initialize(const char* cname = nullptr);

    // Packet transmission
    uint16_t createRTPPacket(const uint8_t* payload, uint16_t length,
                            bool marker = false, uint32_t* out_seq = nullptr);
    bool encodeRTPPacket(uint8_t* buffer, uint16_t& length, const RTPPacket& packet);

    // Packet reception
    bool decodeRTPPacket(const uint8_t* buffer, uint16_t length, RTPPacket& packet);
    bool processRTPPacket(const RTPPacket& packet, uint32_t current_time_ms);

    // RTCP generation
    bool createSenderReport(uint8_t* buffer, uint16_t& length);
    bool createReceiverReport(uint8_t* buffer, uint16_t& length);
    bool createSourceDescription(uint8_t* buffer, uint16_t& length);
    bool createGoodbye(uint8_t* buffer, uint16_t& length);

    // RTCP reception
    bool decodeRTCPPacket(const uint8_t* buffer, uint16_t length,
                         uint8_t& type, std::map<uint32_t, RTCPReceptionReport>& reports);
    bool processRTCPPacket(const uint8_t* buffer, uint16_t length, uint32_t current_time_ms);

    // Jitter buffer management
    JitterBuffer& getJitterBuffer() { return jitter_buffer; }
    void enableAdaptiveBuffer(bool enable) { adaptive_buffer_enabled = enable; }

    // Statistics and monitoring
    struct Statistics {
        uint32_t packets_sent;
        uint32_t packets_received;
        uint32_t packets_lost;
        uint32_t octets_sent;
        uint32_t octets_received;
        double   jitter;
        double   rtt_ms;
        uint8_t  loss_fraction;
        uint32_t max_jitter;
        uint32_t min_jitter;
        uint32_t mean_jitter;
    };

    Statistics getStatistics() const { return stats; }
    void resetStatistics();
    void printStatistics() const;

    // Configuration
    void setPayloadType(uint8_t pt) { payload_type = pt; }
    void setSampleRate(uint32_t sr) { sample_rate = sr; }
    void setCNAME(const char* cname);
    void setSyncSource(uint32_t ssrc) { local_ssrc = ssrc; }
    void setClockRate(uint32_t rate) { sample_rate = rate; }

    // Getters
    uint32_t getSSRC() const { return local_ssrc; }
    uint16_t getSequenceNumber() const { return sequence_number; }
    uint32_t getTimestamp() const { return rtp_timestamp; }
    uint8_t  getPayloadType() const { return payload_type; }

    // Timing
    void updateTime(uint32_t current_time_ms);
    uint32_t getCurrentTime() const { return current_time_ms; }

private:
    // RTP configuration
    uint32_t local_ssrc;
    uint8_t  payload_type;
    uint32_t sample_rate;
    uint16_t sequence_number;
    uint32_t rtp_timestamp;
    char     cname[256];

    // Remote SSRC tracking
    std::map<uint32_t, RTCPReceptionReport> remote_ssrcs;

    // RTCP timing (RFC 3550 Section 6)
    uint32_t rtcp_interval_ms;
    uint32_t last_rtcp_send_time;
    uint32_t last_sr_ntp_timestamp;

    // Sender statistics
    uint32_t sender_packet_count;
    uint32_t sender_octet_count;

    // Reception statistics
    uint32_t highest_sequence_received;
    uint32_t base_sequence_received;
    uint32_t bad_sequence_number_cycles;
    uint32_t packets_expected;
    uint32_t packets_received_cum;
    uint32_t inter_arrival_jitter;
    uint32_t last_arrival_time;
    uint32_t last_rtp_timestamp;

    // Statistics window
    Statistics stats;
    std::deque<uint32_t> loss_fraction_history;
    std::deque<double>   jitter_history;
    std::deque<double>   rtt_history;

    // Jitter buffer
    JitterBuffer jitter_buffer;
    bool adaptive_buffer_enabled;

    // Timing
    uint32_t current_time_ms;
    uint32_t next_rtcp_time_ms;

    // Helper methods
    uint32_t generateSSRC();
    void generateNTPTimestamp(uint32_t& msw, uint32_t& lsw);
    // Note: Using lwip's ntohl, ntohs, htonl, htons instead of custom implementations
    // uint32_t ntohl(uint32_t value) const;
    // uint16_t ntohs(uint16_t value) const;
    // uint32_t htonl(uint32_t value) const;
    // uint16_t htons(uint16_t value) const;

    void updateSenderStatistics(uint16_t payload_length);
    void updateReceiverStatistics(const RTPPacket& packet);
    void calculateJitter(uint32_t rtp_timestamp, uint32_t arrival_time);

    // RTCP helpers
    bool encodeRTCPHeader(uint8_t* buffer, uint16_t& offset, uint8_t version,
                         uint8_t padding, uint8_t count, uint8_t pt, uint16_t length);
    bool decodeRTCPHeader(const uint8_t* buffer, uint16_t& offset, uint8_t& version,
                         uint8_t& padding, uint8_t& count, uint8_t& pt, uint16_t& length);
};

// ============================================================================
// Network utilities
// ============================================================================

class NetworkUtils {
public:
    // Note: Using lwip's ntohl, ntohs, htonl, htons instead of custom implementations
    // static uint32_t ntohl(uint32_t value);
    // static uint16_t ntohs(uint16_t value);
    // static uint32_t htonl(uint32_t value);
    // static uint16_t htons(uint16_t value);

    static uint64_t getCurrentNTPTimestamp();
    static void getNTPTimestamp(uint32_t& msw, uint32_t& lsw);
};

#endif // RTP_HANDLER_H
