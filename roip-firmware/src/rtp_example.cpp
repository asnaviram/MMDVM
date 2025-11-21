// Example Integration of RTP/RTCP Handler
// This demonstrates how to use the RTP handler in the MMDVM RoIP system

#include "rtp_handler.h"
#include <cstdio>
#include <cstring>
#include <cstdint>
#include <chrono>

// ============================================================================
// Example 1: Basic RTP Sender
// ============================================================================

class RoIPSender {
private:
    RTPHandler rtp;
    uint32_t sample_rate;
    uint32_t frame_time_ms;

public:
    RoIPSender(uint32_t sr = 8000)
        : rtp(RTP_PT_ROIP_AUDIO, sr), sample_rate(sr), frame_time_ms(20) {
        rtp.initialize("roip_transmitter");
    }

    // Simulate encoding audio and creating RTP packet
    uint16_t encodeAudioFrame(const uint8_t* audio_data, uint16_t audio_len,
                              uint8_t* rtp_packet_out, uint16_t max_size) {
        // Create RTP packet from audio data
        uint32_t seq;
        rtp.createRTPPacket(audio_data, audio_len, false, &seq);

        // Encode to network format
        uint16_t encoded_len = max_size;
        RTPPacket pkt;  // In real usage, would get from internal handler
        if (rtp.encodeRTPPacket(rtp_packet_out, encoded_len, pkt)) {
            printf("TX: Seq=%u, Len=%u, SSRC=0x%08x\n", seq, encoded_len, rtp.getSSRC());
            return encoded_len;
        }
        return 0;
    }

    // Get current statistics
    void printStats() {
        rtp.printStatistics();
    }
};

// ============================================================================
// Example 2: RTP Receiver with Jitter Buffer
// ============================================================================

class RoIPReceiver {
private:
    RTPHandler rtp;
    uint32_t last_rx_time;

public:
    RoIPReceiver(uint32_t sr = 8000)
        : rtp(RTP_PT_ROIP_AUDIO, sr), last_rx_time(0) {
        rtp.initialize("roip_receiver");
        rtp.enableAdaptiveBuffer(true);
    }

    // Process incoming RTP packet
    bool receiveRTPPacket(const uint8_t* rtp_packet, uint16_t length) {
        // Decode RTP packet
        RTPPacket packet;
        if (!rtp.decodeRTPPacket(rtp_packet, length, packet)) {
            printf("RX: Failed to decode RTP packet\n");
            return false;
        }

        // Log packet info
        uint16_t seq = rtp.ntohs(packet.sequence_number);
        uint32_t ts = rtp.ntohl(packet.timestamp);
        uint32_t ssrc = rtp.ntohl(packet.ssrc);
        printf("RX: Seq=%u, TS=%u, SSRC=0x%08x, PayloadLen=%u\n",
               seq, ts, ssrc, packet.payload_length);

        // Process packet (adds to jitter buffer)
        uint32_t now_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::system_clock::now().time_since_epoch()).count();
        rtp.processRTPPacket(packet, now_ms);

        last_rx_time = now_ms;
        return true;
    }

    // Extract audio frame from jitter buffer
    bool getAudioFrame(uint8_t* audio_out, uint16_t& audio_len, bool& underrun) {
        RTPPacket packet;
        if (rtp.getJitterBuffer().getPacket(packet, underrun)) {
            // Copy payload to output
            audio_len = std::min(audio_len, packet.payload_length);
            memcpy(audio_out, packet.payload, audio_len);
            return true;
        }
        audio_len = 0;
        return false;
    }

    // Process RTCP feedback from remote
    void processRTCPReport(const uint8_t* rtcp_packet, uint16_t length) {
        uint32_t now_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::system_clock::now().time_since_epoch()).count();

        if (rtp.processRTCPPacket(rtcp_packet, length, now_ms)) {
            printf("RTCP Report processed\n");
        }
    }

    // Get statistics
    void printStats() {
        rtp.printStatistics();
    }

    uint32_t getBufferDepthMs() const {
        return rtp.getJitterBuffer().getCurrentDepth();
    }
};

// ============================================================================
// Example 3: Bidirectional RoIP Session
// ============================================================================

class RoIPSession {
private:
    RoIPSender tx;
    RoIPReceiver rx;
    uint32_t session_start_time;
    uint32_t rtcp_send_interval;
    uint32_t last_rtcp_send_time;
    uint32_t stats_log_interval;
    uint32_t last_stats_log_time;

public:
    RoIPSession(uint32_t sr = 8000)
        : tx(sr), rx(sr),
          session_start_time(0),
          rtcp_send_interval(5000),    // 5 seconds
          last_rtcp_send_time(0),
          stats_log_interval(10000),   // 10 seconds
          last_stats_log_time(0) {
        session_start_time = getCurrentTimeMs();
    }

    // Main processing loop (call periodically)
    void process() {
        uint32_t now_ms = getCurrentTimeMs();

        // Send RTCP reports periodically
        if (now_ms - last_rtcp_send_time >= rtcp_send_interval) {
            sendRTCPReport();
            last_rtcp_send_time = now_ms;
        }

        // Log statistics periodically
        if (now_ms - last_stats_log_time >= stats_log_interval) {
            logStatistics();
            last_stats_log_time = now_ms;
        }
    }

    // Transmit audio frame
    void transmitAudio(const uint8_t* audio_data, uint16_t audio_len) {
        // Example buffer for RTP packet
        uint8_t rtp_buffer[1500];
        uint16_t rtp_len = tx.encodeAudioFrame(audio_data, audio_len,
                                               rtp_buffer, sizeof(rtp_buffer));
        if (rtp_len > 0) {
            // In real code: sendto(socket, rtp_buffer, rtp_len, ...)
            // simulateNetworkSend(rtp_buffer, rtp_len);
        }
    }

    // Receive and process audio
    bool receiveAudio(const uint8_t* rtp_packet, uint16_t length,
                      uint8_t* audio_out, uint16_t& audio_len) {
        if (!rx.receiveRTPPacket(rtp_packet, length)) {
            return false;
        }

        bool underrun;
        return rx.getAudioFrame(audio_out, audio_len, underrun);
    }

    // Handle incoming RTCP
    void receiveRTCP(const uint8_t* rtcp_packet, uint16_t length) {
        rx.processRTCPReport(rtcp_packet, length);
    }

    // Send RTCP report to remote
    void sendRTCPReport() {
        uint8_t rtcp_buffer[1500];
        uint16_t rtcp_len = sizeof(rtcp_buffer);

        // Create compound RTCP packet
        // In real code, would create proper compound packet with multiple reports

        printf("RTCP Report sent\n");
    }

    // Log session statistics
    void logStatistics() {
        uint32_t elapsed_ms = getCurrentTimeMs() - session_start_time;
        printf("\n=== RoIP Session Stats (elapsed: %u ms) ===\n", elapsed_ms);
        tx.printStats();
        rx.printStats();
        printf("Buffer depth: %u ms\n", rx.getBufferDepthMs());
    }

    // Get session duration
    uint32_t getSessionDuration() const {
        return getCurrentTimeMs() - session_start_time;
    }

private:
    uint32_t getCurrentTimeMs() const {
        return std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::system_clock::now().time_since_epoch()).count();
    }
};

// ============================================================================
// Example 4: Advanced Quality Monitoring
// ============================================================================

class QualityMonitor {
private:
    RTPHandler& rtp;
    const uint32_t sample_window_ms;
    uint32_t last_sample_time;

public:
    QualityMonitor(RTPHandler& rtp_handler)
        : rtp(rtp_handler), sample_window_ms(5000), last_sample_time(0) {
    }

    // Analyze current quality metrics
    void analyze() {
        uint32_t now_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::system_clock::now().time_since_epoch()).count();

        if (now_ms - last_sample_time < sample_window_ms) {
            return;  // Not time to sample yet
        }

        RTPHandler::Statistics stats = rtp.getStatistics();
        last_sample_time = now_ms;

        // Analyze packet loss
        if (stats.packets_received > 0) {
            double loss_percent = (double)stats.packets_lost /
                                 (stats.packets_lost + stats.packets_received) * 100.0;

            printf("Quality Analysis:\n");
            printf("  Packet Loss: %.2f%% (%u/%u)\n",
                   loss_percent, stats.packets_lost,
                   stats.packets_lost + stats.packets_received);

            if (loss_percent > 5.0) {
                printf("  WARNING: High packet loss\n");
            }
        }

        // Analyze jitter
        printf("  Jitter: %.2f ms\n", stats.jitter);
        if (stats.jitter > 50.0) {
            printf("  WARNING: High jitter\n");
        }

        // Analyze RTT
        printf("  RTT: %.2f ms\n", stats.rtt_ms);
        if (stats.rtt_ms > 150.0) {
            printf("  WARNING: High latency\n");
        }
    }

    // Get quality rating (0-100)
    uint8_t getQualityRating() const {
        RTPHandler::Statistics stats = rtp.getStatistics();

        uint8_t rating = 100;

        // Penalize for packet loss
        if (stats.loss_fraction > 0) {
            rating -= stats.loss_fraction / 2;
        }

        // Penalize for jitter
        if (stats.jitter > 20.0) {
            rating -= (uint8_t)(stats.jitter / 5.0);
        }

        // Penalize for latency
        if (stats.rtt_ms > 100.0) {
            rating -= (uint8_t)(stats.rtt_ms / 50.0);
        }

        return std::max((uint8_t)0, std::min((uint8_t)100, rating));
    }

    // Adaptive algorithm adjustment
    void adjustForQuality() {
        uint8_t quality = getQualityRating();

        if (quality < 50) {
            printf("Poor quality (rating: %u), increasing buffer...\n", quality);
            // Increase jitter buffer target
        } else if (quality > 85) {
            printf("Good quality (rating: %u), optimizing buffer...\n", quality);
            // Can reduce jitter buffer if stable
        }
    }
};

// ============================================================================
// Example 5: Integration with Modem Loop
// ============================================================================

class RoIPStack {
private:
    RoIPSession session;
    QualityMonitor monitor;

public:
    RoIPStack() : session(8000), monitor(session.rtp) {
    }

    // Simulate modem interrupt (audio received)
    void onModemAudioReceived(const uint8_t* audio_data, uint16_t audio_len) {
        // Encode as RTP and would send to network
        session.transmitAudio(audio_data, audio_len);
    }

    // Simulate network RX callback
    void onNetworkPacket(const uint8_t* packet, uint16_t length, bool is_rtcp) {
        if (is_rtcp) {
            session.receiveRTCP(packet, length);
        } else {
            // Audio packet
            uint8_t audio_out[320];
            uint16_t audio_len = sizeof(audio_out);

            if (session.receiveAudio(packet, length, audio_out, audio_len)) {
                // Feed audio_out to modem/speaker
                onAudioReady(audio_out, audio_len);
            }
        }
    }

    // Main processing loop (call from firmware main loop)
    void process() {
        session.process();
        monitor.analyze();
        monitor.adjustForQuality();
    }

    // Get quality indicator
    uint8_t getQuality() {
        return monitor.getQualityRating();
    }

private:
    void onAudioReady(const uint8_t* audio, uint16_t len) {
        // Feed to speaker/modem output
        // printf("Audio ready: %u bytes\n", len);
    }
};

// ============================================================================
// Main Test/Demo
// ============================================================================

#ifdef RTP_EXAMPLE_MAIN
int main() {
    printf("RTP/RTCP Handler Example\n");
    printf("========================\n\n");

    // Example 1: Sender
    printf("Example 1: RoIP Sender\n");
    {
        RoIPSender sender(8000);
        uint8_t audio[160];
        memset(audio, 0xAA, sizeof(audio));

        uint8_t rtp_pkt[1500];
        uint16_t rtp_len = sender.encodeAudioFrame(audio, sizeof(audio),
                                                    rtp_pkt, sizeof(rtp_pkt));
        printf("  Encoded RTP packet: %u bytes\n\n", rtp_len);
    }

    // Example 2: Session
    printf("Example 2: RoIP Session\n");
    {
        RoIPSession session(8000);

        // Simulate sending some audio frames
        for (int i = 0; i < 5; i++) {
            uint8_t audio[160];
            memset(audio, 0x55, sizeof(audio));
            session.transmitAudio(audio, sizeof(audio));
        }

        // Simulate processing
        session.process();
        printf("\n");
    }

    // Example 3: Quality Monitor
    printf("Example 3: Quality Monitor\n");
    {
        RTPHandler rtp(RTP_PT_ROIP_AUDIO, 8000);
        QualityMonitor monitor(rtp);

        monitor.analyze();
        printf("  Quality Rating: %u/100\n\n", monitor.getQualityRating());
    }

    // Example 4: Full Stack
    printf("Example 4: Full RoIP Stack\n");
    {
        RoIPStack stack;

        // Simulate modem audio
        uint8_t audio[160] = {0};
        for (int i = 0; i < 10; i++) {
            stack.onModemAudioReceived(audio, sizeof(audio));
            stack.process();
        }

        printf("  Quality: %u/100\n\n", stack.getQuality());
    }

    printf("Examples completed successfully.\n");
    return 0;
}
#endif
