#include "rtp_handler.h"
#include <cstring>
#include <cstdlib>
#include <ctime>
#include <cmath>
#include <algorithm>
#include <iostream>

// ============================================================================
// NetworkUtils Implementation
// ============================================================================

uint32_t NetworkUtils::ntohl(uint32_t value) {
    return ((value & 0xFF000000) >> 24) |
           ((value & 0x00FF0000) >> 8) |
           ((value & 0x0000FF00) << 8) |
           ((value & 0x000000FF) << 24);
}

uint16_t NetworkUtils::ntohs(uint16_t value) {
    return ((value & 0xFF00) >> 8) | ((value & 0x00FF) << 8);
}

uint32_t NetworkUtils::htonl(uint32_t value) {
    return ntohl(value);  // Same operation for both directions
}

uint16_t NetworkUtils::htons(uint16_t value) {
    return ntohs(value);  // Same operation for both directions
}

uint64_t NetworkUtils::getCurrentNTPTimestamp() {
    // Get current time in seconds and microseconds
    auto now = std::chrono::system_clock::now();
    auto duration = now.time_since_epoch();
    auto seconds = std::chrono::duration_cast<std::chrono::seconds>(duration);
    auto micros = std::chrono::duration_cast<std::chrono::microseconds>(duration) - seconds;

    // NTP epoch is 1900-01-01, Unix epoch is 1970-01-01
    // Difference is 2208988800 seconds
    const uint32_t NTP_EPOCH_OFFSET = 2208988800UL;
    uint32_t ntp_seconds = seconds.count() + NTP_EPOCH_OFFSET;
    uint32_t ntp_fraction = (micros.count() << 32) / 1000000;

    return (((uint64_t)ntp_seconds) << 32) | ntp_fraction;
}

void NetworkUtils::getNTPTimestamp(uint32_t& msw, uint32_t& lsw) {
    uint64_t ntp = getCurrentNTPTimestamp();
    msw = (ntp >> 32) & 0xFFFFFFFF;
    lsw = ntp & 0xFFFFFFFF;
}

// ============================================================================
// JitterBuffer Implementation
// ============================================================================

JitterBuffer::JitterBuffer(uint32_t sample_rate)
    : sample_rate(sample_rate),
      current_buffer_depth_ms(JITTER_BUFFER_INITIAL_MS),
      target_buffer_depth_ms(JITTER_BUFFER_INITIAL_MS),
      last_adapt_time_ms(0),
      current_jitter(0.0),
      mean_inter_arrival_time(0.0),
      last_arrival_time_ms(0),
      packets_lost(0),
      packets_out_of_order(0),
      last_sequence_number(0),
      last_timestamp(0) {
}

void JitterBuffer::putPacket(const RTPPacket& packet) {
    uint32_t current_time = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();

    // Check for out-of-order packets
    if (last_sequence_number != 0 && packet.sequence_number < last_sequence_number) {
        // Out-of-order packet
        packets_out_of_order++;
    }
    last_sequence_number = packet.sequence_number;

    // Calculate inter-arrival time
    if (last_arrival_time_ms != 0) {
        uint32_t inter_arrival = current_time - last_arrival_time_ms;
        inter_arrival_times.push_back(inter_arrival);
        if (inter_arrival_times.size() > STATS_WINDOW_SIZE) {
            inter_arrival_times.pop_front();
        }
    }
    last_arrival_time_ms = current_time;

    // Calculate jitter
    calculateInterArrivalJitter(current_time, packet.timestamp);

    // Create buffered packet entry
    BufferedPacket bp;
    bp.packet = packet;
    bp.arrival_time_ms = current_time;
    bp.sequence_number = packet.sequence_number;

    // Insert packet in sequence order
    auto it = buffer.begin();
    while (it != buffer.end() && it->sequence_number < packet.sequence_number) {
        ++it;
    }

    // Check for duplicate
    if (it != buffer.end() && it->sequence_number == packet.sequence_number) {
        return;  // Duplicate packet, discard
    }

    buffer.insert(it, bp);

    // Update buffer depth
    if (!buffer.empty()) {
        uint32_t time_span = buffer.back().arrival_time_ms - buffer.front().arrival_time_ms;
        current_buffer_depth_ms = time_span;
    }
}

bool JitterBuffer::getPacket(RTPPacket& packet, bool& underrun) {
    underrun = false;

    if (buffer.empty()) {
        underrun = true;
        return false;
    }

    // Get the first packet
    packet = buffer.front().packet;
    buffer.pop_front();

    // Update buffer depth
    if (!buffer.empty()) {
        uint32_t current_time = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::system_clock::now().time_since_epoch()).count();
        uint32_t time_span = buffer.back().arrival_time_ms - buffer.front().arrival_time_ms;
        current_buffer_depth_ms = std::min(time_span, target_buffer_depth_ms);
    } else {
        current_buffer_depth_ms = 0;
    }

    return true;
}

void JitterBuffer::calculateInterArrivalJitter(uint32_t arrival_time_ms, uint32_t rtp_timestamp) {
    if (last_timestamp == 0) {
        last_timestamp = rtp_timestamp;
        return;
    }

    // Calculate timestamp difference
    uint32_t timestamp_diff = rtp_timestamp - last_timestamp;
    uint32_t expected_arrival_diff = msToSamples(arrival_time_ms - last_arrival_time_ms);

    if (inter_arrival_times.size() >= 2) {
        int32_t arrival_diff = (int32_t)timestamp_diff - (int32_t)expected_arrival_diff;
        arrival_delays.push_back(std::abs(arrival_diff));

        if (arrival_delays.size() > STATS_WINDOW_SIZE) {
            arrival_delays.pop_front();
        }

        // RFC 3550: Jitter is calculated as the mean deviation of the differences
        double sum = 0.0;
        double mean = 0.0;
        for (auto delay : arrival_delays) {
            mean += delay;
        }
        mean /= arrival_delays.size();

        for (auto delay : arrival_delays) {
            sum += std::pow(delay - mean, 2.0);
        }
        current_jitter = std::sqrt(sum / arrival_delays.size());
    }

    last_timestamp = rtp_timestamp;
}

void JitterBuffer::adaptBufferSize() {
    if (buffer.empty()) {
        return;
    }

    // Calculate current average jitter
    double jitter_percent = (current_jitter / (double)msToSamples(target_buffer_depth_ms)) * 100.0;

    // Adaptive algorithm based on jitter trends
    if (jitter_percent > 100.0) {
        // High jitter, increase buffer
        uint32_t new_depth = std::min(target_buffer_depth_ms + 10, (uint32_t)JITTER_BUFFER_MAX_MS);
        target_buffer_depth_ms = new_depth;
    } else if (jitter_percent < 50.0) {
        // Low jitter, decrease buffer
        uint32_t new_depth = std::max(target_buffer_depth_ms - 5, (uint32_t)JITTER_BUFFER_MIN_MS);
        target_buffer_depth_ms = new_depth;
    }
}

void JitterBuffer::updateAdaptiveBuffer(uint32_t current_time_ms) {
    if (current_time_ms - last_adapt_time_ms >= JITTER_BUFFER_ADAPT_INTERVAL_MS) {
        adaptBufferSize();
        last_adapt_time_ms = current_time_ms;
    }
}

void JitterBuffer::reset() {
    buffer.clear();
    current_buffer_depth_ms = JITTER_BUFFER_INITIAL_MS;
    target_buffer_depth_ms = JITTER_BUFFER_INITIAL_MS;
    current_jitter = 0.0;
    packets_lost = 0;
    packets_out_of_order = 0;
    last_sequence_number = 0;
    last_timestamp = 0;
    inter_arrival_times.clear();
    arrival_delays.clear();
}

// ============================================================================
// RTPHandler Implementation
// ============================================================================

RTPHandler::RTPHandler(uint8_t payload_type, uint32_t sample_rate)
    : payload_type(payload_type),
      sample_rate(sample_rate),
      sequence_number(0),
      rtp_timestamp(0),
      jitter_buffer(sample_rate),
      adaptive_buffer_enabled(true),
      current_time_ms(0),
      next_rtcp_time_ms(0),
      rtcp_interval_ms(5000),  // 5 seconds
      last_rtcp_send_time(0),
      last_sr_ntp_timestamp(0),
      sender_packet_count(0),
      sender_octet_count(0),
      highest_sequence_received(0),
      base_sequence_received(0),
      bad_sequence_number_cycles(0),
      packets_expected(0),
      packets_received_cum(0),
      inter_arrival_jitter(0),
      last_arrival_time(0),
      last_rtp_timestamp(0) {

    // Initialize statistics
    memset(&stats, 0, sizeof(stats));

    // Generate SSRC
    local_ssrc = generateSSRC();

    // Initialize sequence number
    sequence_number = generateSSRC() & 0xFFFF;

    // Initialize timestamp
    rtp_timestamp = generateSSRC();

    // Initialize CNAME
    snprintf(cname, sizeof(cname), "roip_%08x", local_ssrc);
}

void RTPHandler::initialize(const char* cname_override) {
    if (cname_override && strlen(cname_override) > 0) {
        strncpy(cname, cname_override, sizeof(cname) - 1);
        cname[sizeof(cname) - 1] = '\0';
    }
}

uint32_t RTPHandler::generateSSRC() {
    // RFC 3550 recommends using a random value that has at least 32 bits of randomness
    // Use combination of random and time-based values
    uint32_t seed = std::time(nullptr) ^ std::rand();
    std::srand(seed);

    uint32_t ssrc = ((uint32_t)std::rand() << 16) | ((uint32_t)std::rand() & 0xFFFF);
    return ssrc;
}

void RTPHandler::generateNTPTimestamp(uint32_t& msw, uint32_t& lsw) {
    NetworkUtils::getNTPTimestamp(msw, lsw);
}

uint32_t RTPHandler::ntohl(uint32_t value) const {
    return NetworkUtils::ntohl(value);
}

uint16_t RTPHandler::ntohs(uint16_t value) const {
    return NetworkUtils::ntohs(value);
}

uint32_t RTPHandler::htonl(uint32_t value) const {
    return NetworkUtils::htonl(value);
}

uint16_t RTPHandler::htons(uint16_t value) const {
    return NetworkUtils::htons(value);
}

uint16_t RTPHandler::createRTPPacket(const uint8_t* payload, uint16_t length,
                                      bool marker, uint32_t* out_seq) {
    static RTPPacket packet;

    // Set fixed header
    packet.setVersion(RTP_VERSION);
    packet.setPadding(0);
    packet.setExtension(0);
    packet.setCC(0);
    packet.setMarker(marker ? 1 : 0);
    packet.setPayloadType(payload_type);

    // Increment and set sequence number
    packet.sequence_number = htons(sequence_number);
    if (out_seq) {
        *out_seq = sequence_number;
    }
    sequence_number++;

    // Set timestamp
    packet.timestamp = htonl(rtp_timestamp);
    rtp_timestamp += (sample_rate * length) / 8000;  // Increment based on 8kHz sample rate

    // Set SSRC
    packet.ssrc = htonl(local_ssrc);

    // Copy payload
    packet.payload_length = std::min(length, (uint16_t)(sizeof(packet.payload) - 1));
    memcpy(packet.payload, payload, packet.payload_length);

    // Get current time
    packet.arrival_timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();

    // Update sender statistics
    updateSenderStatistics(packet.payload_length);

    return packet.payload_length;
}

bool RTPHandler::encodeRTPPacket(uint8_t* buffer, uint16_t& length, const RTPPacket& packet) {
    if (!buffer || length < 12) {
        return false;
    }

    uint16_t offset = 0;
    const uint16_t MAX_LENGTH = length;

    // Encode fixed header (12 bytes)
    buffer[offset++] = packet.version_p_x_cc;
    buffer[offset++] = packet.m_pt;
    memcpy(&buffer[offset], &packet.sequence_number, 2);
    offset += 2;
    memcpy(&buffer[offset], &packet.timestamp, 4);
    offset += 4;
    memcpy(&buffer[offset], &packet.ssrc, 4);
    offset += 4;

    // Encode CSRC list (if CC > 0)
    uint8_t cc = packet.getCC();
    if (cc > 0 && offset + (cc * 4) <= MAX_LENGTH) {
        for (uint8_t i = 0; i < cc; i++) {
            memcpy(&buffer[offset], &packet.csrc[i], 4);
            offset += 4;
        }
    }

    // Encode extension (if X bit is set)
    if (packet.getExtension() && offset + 4 <= MAX_LENGTH) {
        memcpy(&buffer[offset], &packet.ext_header_id, 2);
        offset += 2;
        memcpy(&buffer[offset], &packet.ext_length, 2);
        offset += 2;

        uint16_t ext_bytes = packet.ext_length * 4;
        if (offset + ext_bytes <= MAX_LENGTH) {
            memcpy(&buffer[offset], packet.ext_data, ext_bytes);
            offset += ext_bytes;
        }
    }

    // Encode payload
    if (offset + packet.payload_length <= MAX_LENGTH) {
        memcpy(&buffer[offset], packet.payload, packet.payload_length);
        offset += packet.payload_length;
    }

    length = offset;
    return true;
}

bool RTPHandler::decodeRTPPacket(const uint8_t* buffer, uint16_t length, RTPPacket& packet) {
    if (!buffer || length < 12) {
        return false;
    }

    memset(&packet, 0, sizeof(packet));

    uint16_t offset = 0;

    // Decode fixed header
    packet.version_p_x_cc = buffer[offset++];
    packet.m_pt = buffer[offset++];

    if (packet.getVersion() != RTP_VERSION) {
        return false;  // Invalid RTP version
    }

    memcpy(&packet.sequence_number, &buffer[offset], 2);
    offset += 2;
    memcpy(&packet.timestamp, &buffer[offset], 4);
    offset += 4;
    memcpy(&packet.ssrc, &buffer[offset], 4);
    offset += 4;

    // Decode CSRC list
    uint8_t cc = packet.getCC();
    if (offset + (cc * 4) > length) {
        return false;  // Not enough data for CSRC list
    }

    for (uint8_t i = 0; i < cc; i++) {
        memcpy(&packet.csrc[i], &buffer[offset], 4);
        offset += 4;
    }

    // Decode extension if present
    if (packet.getExtension()) {
        if (offset + 4 > length) {
            return false;
        }
        memcpy(&packet.ext_header_id, &buffer[offset], 2);
        offset += 2;
        memcpy(&packet.ext_length, &buffer[offset], 2);
        offset += 2;

        uint16_t ext_bytes = packet.ext_length * 4;
        if (offset + ext_bytes > length) {
            return false;
        }
        memcpy(packet.ext_data, &buffer[offset], std::min((uint16_t)sizeof(packet.ext_data), ext_bytes));
        offset += ext_bytes;
    }

    // Remaining data is payload
    uint16_t payload_length = length - offset;
    if (payload_length > 0 && payload_length <= sizeof(packet.payload)) {
        memcpy(packet.payload, &buffer[offset], payload_length);
        packet.payload_length = payload_length;
        offset += payload_length;
    }

    packet.arrival_timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();

    return true;
}

bool RTPHandler::processRTPPacket(const RTPPacket& packet, uint32_t current_time_ms) {
    // Track remote SSRC
    uint32_t remote_ssrc = ntohl(packet.ssrc);

    if (remote_ssrcs.find(remote_ssrc) == remote_ssrcs.end()) {
        // New source
        RTCPReceptionReport report;
        memset(&report, 0, sizeof(report));
        report.ssrc = remote_ssrc;
        remote_ssrcs[remote_ssrc] = report;
    }

    // Update receiver statistics
    updateReceiverStatistics(packet);

    // Add to jitter buffer
    jitter_buffer.putPacket(packet);

    // Update adaptive buffer if enabled
    if (adaptive_buffer_enabled) {
        jitter_buffer.updateAdaptiveBuffer(current_time_ms);
    }

    return true;
}

bool RTPHandler::createSenderReport(uint8_t* buffer, uint16_t& length) {
    if (!buffer || length < 28) {
        return false;
    }

    uint16_t offset = 0;

    // RTCP Header
    uint8_t report_count = 0;  // Will update later
    if (!encodeRTCPHeader(buffer, offset, RTP_VERSION, 0, report_count, RTCP_SR, 6)) {
        return false;
    }

    // SR data (20 bytes)
    uint32_t ssrc = htonl(local_ssrc);
    memcpy(&buffer[offset], &ssrc, 4);
    offset += 4;

    uint32_t ntp_msw, ntp_lsw;
    generateNTPTimestamp(ntp_msw, ntp_lsw);
    last_sr_ntp_timestamp = ntp_msw;

    memcpy(&buffer[offset], &ntp_msw, 4);
    offset += 4;
    memcpy(&buffer[offset], &ntp_lsw, 4);
    offset += 4;

    uint32_t ts = htonl(rtp_timestamp);
    memcpy(&buffer[offset], &ts, 4);
    offset += 4;

    uint32_t pc = htonl(sender_packet_count);
    memcpy(&buffer[offset], &pc, 4);
    offset += 4;

    uint32_t oc = htonl(sender_octet_count);
    memcpy(&buffer[offset], &oc, 4);
    offset += 4;

    // Add reception reports if any
    for (auto& pair : remote_ssrcs) {
        if (offset + 24 > length) {
            break;  // Not enough space for more reports
        }

        RTCPReceptionReport& rr = pair.second;
        uint32_t remote_ssrc = htonl(rr.ssrc);
        memcpy(&buffer[offset], &remote_ssrc, 4);
        offset += 4;

        // Fraction lost and cumulative loss
        uint32_t loss_data = (((uint32_t)rr.fraction_lost) << 24) |
                            (rr.packets_lost & 0xFFFFFF);
        uint32_t loss_net = htonl(loss_data);
        memcpy(&buffer[offset], &loss_net, 4);
        offset += 4;

        uint32_t highest_seq = htonl(rr.highest_sequence);
        memcpy(&buffer[offset], &highest_seq, 4);
        offset += 4;

        uint32_t jitter = htonl(rr.interarrival_jitter);
        memcpy(&buffer[offset], &jitter, 4);
        offset += 4;

        uint32_t lsr = htonl(rr.last_sr_timestamp);
        memcpy(&buffer[offset], &lsr, 4);
        offset += 4;

        uint32_t dlsr = htonl(rr.delay_since_sr);
        memcpy(&buffer[offset], &dlsr, 4);
        offset += 4;

        report_count++;
    }

    length = offset;
    last_rtcp_send_time = current_time_ms;
    return true;
}

bool RTPHandler::createReceiverReport(uint8_t* buffer, uint16_t& length) {
    if (!buffer || length < 8) {
        return false;
    }

    uint16_t offset = 0;

    // RTCP Header (8 bytes + 24 per report)
    uint8_t report_count = std::min((uint8_t)31, (uint8_t)remote_ssrcs.size());
    if (!encodeRTCPHeader(buffer, offset, RTP_VERSION, 0, report_count, RTCP_RR, 1 + (report_count * 6))) {
        return false;
    }

    // SSRC of packet sender
    uint32_t ssrc = htonl(local_ssrc);
    memcpy(&buffer[offset], &ssrc, 4);
    offset += 4;

    // Reception reports
    uint8_t count = 0;
    for (auto& pair : remote_ssrcs) {
        if (offset + 24 > length || count >= report_count) {
            break;
        }

        RTCPReceptionReport& rr = pair.second;

        uint32_t remote_ssrc = htonl(rr.ssrc);
        memcpy(&buffer[offset], &remote_ssrc, 4);
        offset += 4;

        uint32_t loss_data = (((uint32_t)rr.fraction_lost) << 24) |
                            (rr.packets_lost & 0xFFFFFF);
        uint32_t loss_net = htonl(loss_data);
        memcpy(&buffer[offset], &loss_net, 4);
        offset += 4;

        uint32_t highest_seq = htonl(rr.highest_sequence);
        memcpy(&buffer[offset], &highest_seq, 4);
        offset += 4;

        uint32_t jitter = htonl(rr.interarrival_jitter);
        memcpy(&buffer[offset], &jitter, 4);
        offset += 4;

        uint32_t lsr = htonl(rr.last_sr_timestamp);
        memcpy(&buffer[offset], &lsr, 4);
        offset += 4;

        uint32_t dlsr = htonl(rr.delay_since_sr);
        memcpy(&buffer[offset], &dlsr, 4);
        offset += 4;

        count++;
    }

    length = offset;
    last_rtcp_send_time = current_time_ms;
    return true;
}

bool RTPHandler::createSourceDescription(uint8_t* buffer, uint16_t& length) {
    if (!buffer || length < 100) {
        return false;
    }

    uint16_t offset = 0;
    uint16_t temp_offset = 0;

    // RTCP Header (we'll update the length later)
    uint8_t version_pt = (RTP_VERSION << 6) | RTCP_SDES;
    buffer[offset++] = version_pt;
    buffer[offset++] = 1;  // SC (Source Count)
    temp_offset = offset;
    offset += 2;  // Leave space for length

    // SSRC
    uint32_t ssrc = htonl(local_ssrc);
    memcpy(&buffer[offset], &ssrc, 4);
    offset += 4;

    // CNAME SDES item
    buffer[offset++] = RTCP_SDES_CNAME;
    uint8_t cname_len = std::min((uint8_t)(strlen(cname)), (uint8_t)255);
    buffer[offset++] = cname_len;
    memcpy(&buffer[offset], cname, cname_len);
    offset += cname_len;

    // End marker
    buffer[offset++] = RTCP_SDES_END;

    // Padding to 32-bit boundary
    while ((offset % 4) != 0) {
        buffer[offset++] = 0;
    }

    // Update length field (in 32-bit words, minus 1)
    uint16_t length_in_words = (offset / 4) - 1;
    uint16_t length_net = htons(length_in_words);
    memcpy(&buffer[temp_offset], &length_net, 2);

    length = offset;
    return true;
}

bool RTPHandler::createGoodbye(uint8_t* buffer, uint16_t& length) {
    if (!buffer || length < 8) {
        return false;
    }

    uint16_t offset = 0;

    // RTCP Header (1 source count)
    if (!encodeRTCPHeader(buffer, offset, RTP_VERSION, 0, 1, RTCP_BYE, 1)) {
        return false;
    }

    // SSRC
    uint32_t ssrc = htonl(local_ssrc);
    memcpy(&buffer[offset], &ssrc, 4);
    offset += 4;

    length = offset;
    return true;
}

bool RTPHandler::decodeRTCPPacket(const uint8_t* buffer, uint16_t length,
                                   uint8_t& type, std::map<uint32_t, RTCPReceptionReport>& reports) {
    if (!buffer || length < 8) {
        return false;
    }

    uint16_t offset = 0;
    uint8_t version, padding, count, pt;
    uint16_t pkt_length;

    if (!decodeRTCPHeader(buffer, offset, version, padding, count, pt, pkt_length)) {
        return false;
    }

    if (version != RTP_VERSION) {
        return false;
    }

    type = pt;

    switch (pt) {
        case RTCP_SR:
            // Sender Report - parse sender info and reception reports
            if (offset + 20 > length) {
                return false;
            }
            offset += 20;  // Skip sender info

            for (uint8_t i = 0; i < count; i++) {
                if (offset + 24 > length) {
                    break;
                }
                RTCPReceptionReport rr;
                memcpy(&rr.ssrc, &buffer[offset], 4);
                rr.ssrc = ntohl(rr.ssrc);
                offset += 4;

                uint32_t loss = ntohl(*(uint32_t*)&buffer[offset]);
                rr.fraction_lost = (loss >> 24) & 0xFF;
                rr.packets_lost = loss & 0xFFFFFF;
                offset += 4;

                memcpy(&rr.highest_sequence, &buffer[offset], 4);
                rr.highest_sequence = ntohl(rr.highest_sequence);
                offset += 4;

                memcpy(&rr.interarrival_jitter, &buffer[offset], 4);
                rr.interarrival_jitter = ntohl(rr.interarrival_jitter);
                offset += 4;

                memcpy(&rr.last_sr_timestamp, &buffer[offset], 4);
                rr.last_sr_timestamp = ntohl(rr.last_sr_timestamp);
                offset += 4;

                memcpy(&rr.delay_since_sr, &buffer[offset], 4);
                rr.delay_since_sr = ntohl(rr.delay_since_sr);
                offset += 4;

                reports[rr.ssrc] = rr;
            }
            break;

        case RTCP_RR:
            // Receiver Report
            if (offset + 4 > length) {
                return false;
            }
            offset += 4;  // Skip SSRC

            for (uint8_t i = 0; i < count; i++) {
                if (offset + 24 > length) {
                    break;
                }
                RTCPReceptionReport rr;
                memcpy(&rr.ssrc, &buffer[offset], 4);
                rr.ssrc = ntohl(rr.ssrc);
                offset += 4;

                uint32_t loss = ntohl(*(uint32_t*)&buffer[offset]);
                rr.fraction_lost = (loss >> 24) & 0xFF;
                rr.packets_lost = loss & 0xFFFFFF;
                offset += 4;

                memcpy(&rr.highest_sequence, &buffer[offset], 4);
                rr.highest_sequence = ntohl(rr.highest_sequence);
                offset += 4;

                memcpy(&rr.interarrival_jitter, &buffer[offset], 4);
                rr.interarrival_jitter = ntohl(rr.interarrival_jitter);
                offset += 4;

                memcpy(&rr.last_sr_timestamp, &buffer[offset], 4);
                rr.last_sr_timestamp = ntohl(rr.last_sr_timestamp);
                offset += 4;

                memcpy(&rr.delay_since_sr, &buffer[offset], 4);
                rr.delay_since_sr = ntohl(rr.delay_since_sr);
                offset += 4;

                reports[rr.ssrc] = rr;
            }
            break;

        case RTCP_SDES:
            // Source Description - skip for now
            break;

        case RTCP_BYE:
            // Goodbye
            break;

        default:
            break;
    }

    return true;
}

bool RTPHandler::processRTCPPacket(const uint8_t* buffer, uint16_t length, uint32_t current_time_ms) {
    uint8_t type;
    std::map<uint32_t, RTCPReceptionReport> reports;

    if (!decodeRTCPPacket(buffer, length, type, reports)) {
        return false;
    }

    // Process reports and update remote SSRC information
    for (auto& pair : reports) {
        uint32_t remote_ssrc = pair.first;
        RTCPReceptionReport& rr = pair.second;

        if (remote_ssrcs.find(remote_ssrc) != remote_ssrcs.end()) {
            remote_ssrcs[remote_ssrc] = rr;

            // Calculate RTT if we have the LSR timestamp
            if (rr.last_sr_timestamp != 0) {
                // RTT = current_time - delay_since_sr - LSR
                // This is a simplified calculation
                double rtt = current_time_ms - rr.delay_since_sr;
                rtt_history.push_back(rtt);
                if (rtt_history.size() > STATS_WINDOW_SIZE) {
                    rtt_history.pop_front();
                }
                stats.rtt_ms = rtt;
            }

            stats.packets_lost = rr.packets_lost;
            stats.loss_fraction = rr.fraction_lost;
        }
    }

    return true;
}

bool RTPHandler::encodeRTCPHeader(uint8_t* buffer, uint16_t& offset, uint8_t version,
                                   uint8_t padding, uint8_t count, uint8_t pt, uint16_t length) {
    if (!buffer || offset + 4 > 4096) {
        return false;
    }

    uint8_t version_p_count = (version << 6) | ((padding & 0x01) << 5) | (count & 0x1F);
    buffer[offset++] = version_p_count;
    buffer[offset++] = pt;

    uint16_t length_net = htons(length - 1);
    memcpy(&buffer[offset], &length_net, 2);
    offset += 2;

    return true;
}

bool RTPHandler::decodeRTCPHeader(const uint8_t* buffer, uint16_t& offset, uint8_t& version,
                                   uint8_t& padding, uint8_t& count, uint8_t& pt, uint16_t& length) {
    if (!buffer || offset + 4 > 4096) {
        return false;
    }

    uint8_t vp = buffer[offset++];
    version = (vp >> 6) & 0x03;
    padding = (vp >> 5) & 0x01;
    count = vp & 0x1F;

    pt = buffer[offset++];

    uint16_t length_net;
    memcpy(&length_net, &buffer[offset], 2);
    offset += 2;
    length = ntohs(length_net) + 1;

    return true;
}

void RTPHandler::updateSenderStatistics(uint16_t payload_length) {
    sender_packet_count++;
    sender_octet_count += payload_length;

    stats.packets_sent++;
    stats.octets_sent += payload_length;
}

void RTPHandler::updateReceiverStatistics(const RTPPacket& packet) {
    uint16_t seq = ntohs(packet.sequence_number);
    uint32_t ts = ntohl(packet.timestamp);

    if (base_sequence_received == 0) {
        base_sequence_received = seq;
        highest_sequence_received = seq;
        packets_received_cum = 1;
    } else {
        // Check for sequence number wraparound
        if (seq < base_sequence_received) {
            bad_sequence_number_cycles++;
        }
        if (seq > highest_sequence_received) {
            // Calculate expected sequence numbers
            uint32_t expected = (bad_sequence_number_cycles << 16) + highest_sequence_received + 1;
            uint32_t current = (bad_sequence_number_cycles << 16) + seq;
            packets_expected = current - ((bad_sequence_number_cycles << 16) + base_sequence_received);

            highest_sequence_received = seq;
        }
        packets_received_cum++;
    }

    // Calculate packet loss
    uint32_t packets_received_interval = packets_received_cum;
    uint32_t lost_interval = packets_expected - packets_received_interval;
    uint8_t fraction_lost = (lost_interval << 8) / packets_expected;

    // Update statistics
    stats.packets_received++;
    stats.octets_received += packet.payload_length;

    // Calculate jitter
    calculateJitter(ts, packet.arrival_timestamp);
}

void RTPHandler::calculateJitter(uint32_t rtp_timestamp, uint32_t arrival_time) {
    if (last_rtp_timestamp == 0) {
        last_rtp_timestamp = rtp_timestamp;
        last_arrival_time = arrival_time;
        return;
    }

    // RFC 3550 jitter calculation
    int32_t transit = arrival_time - ((rtp_timestamp - last_rtp_timestamp) * 1000) / sample_rate;
    static int32_t d = 0;

    if (d == 0) {
        d = 0;
    } else {
        d = transit - d;
    }

    inter_arrival_jitter += std::abs(d - inter_arrival_jitter) / 16;

    jitter_history.push_back(inter_arrival_jitter);
    if (jitter_history.size() > STATS_WINDOW_SIZE) {
        jitter_history.pop_front();
    }

    stats.jitter = inter_arrival_jitter;
}

void RTPHandler::updateTime(uint32_t current_time_ms) {
    current_time_ms = current_time_ms;

    // Check if it's time to send RTCP reports
    if (current_time_ms - last_rtcp_send_time >= rtcp_interval_ms) {
        next_rtcp_time_ms = current_time_ms;
    }

    // Update adaptive jitter buffer
    if (adaptive_buffer_enabled) {
        jitter_buffer.updateAdaptiveBuffer(current_time_ms);
    }
}

void RTPHandler::setCNAME(const char* cname_str) {
    if (cname_str && strlen(cname_str) > 0) {
        strncpy(cname, cname_str, sizeof(cname) - 1);
        cname[sizeof(cname) - 1] = '\0';
    }
}

void RTPHandler::resetStatistics() {
    memset(&stats, 0, sizeof(stats));
    loss_fraction_history.clear();
    jitter_history.clear();
    rtt_history.clear();
    sender_packet_count = 0;
    sender_octet_count = 0;
    highest_sequence_received = 0;
    base_sequence_received = 0;
    packets_expected = 0;
    packets_received_cum = 0;
    inter_arrival_jitter = 0;
}

void RTPHandler::printStatistics() const {
    std::cout << "\n=== RTP Statistics ===" << std::endl;
    std::cout << "SSRC: " << std::hex << stats.packets_sent << std::dec << std::endl;
    std::cout << "Packets Sent: " << stats.packets_sent << std::endl;
    std::cout << "Packets Received: " << stats.packets_received << std::endl;
    std::cout << "Packets Lost: " << stats.packets_lost << std::endl;
    std::cout << "Loss Fraction: " << (int)stats.loss_fraction << "%" << std::endl;
    std::cout << "Jitter (ms): " << stats.jitter << std::endl;
    std::cout << "RTT (ms): " << stats.rtt_ms << std::endl;
    std::cout << "Octets Sent: " << stats.octets_sent << std::endl;
    std::cout << "Octets Received: " << stats.octets_received << std::endl;
    std::cout << "Buffer Depth (ms): " << jitter_buffer.getCurrentDepth() << std::endl;
    std::cout << "======================\n" << std::endl;
}
