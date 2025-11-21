# RTP/RTCP Implementation for MMDVM RoIP

## Overview

A complete, production-ready RFC 3550-compliant RTP (Real-time Transport Protocol) and RTCP (RTP Control Protocol) implementation for the MMDVM RoIP (Radio over IP) system.

**Implementation Size:** 1,392 lines of production code (387 in header, 1,005 in implementation)

## RFC Compliance

This implementation fully complies with RFC 3550 standards:
- **RTP Protocol:** Complete packet structure with version, padding, extension, CSRC, sequence, timestamp, SSRC
- **RTCP Reports:** Sender Reports (SR), Receiver Reports (RR), Source Description (SDES), Goodbye (BYE)
- **Network Byte Order:** Proper big-endian encoding for all network data
- **Payload Types:** Standard codecs (PCM, G.722, GSM, etc.) plus custom ROIP types
- **Timestamp Management:** RFC-compliant timestamp tracking and wraparound handling
- **Sequence Numbers:** Proper sequence number management with cycle tracking

## Core Features

### 1. RTP Packet Management
- **RFC 3550 Compliant Packet Structure**
  - Fixed header (12 bytes minimum)
  - Support for CSRC list (0-15 contributors)
  - Extension header support
  - Variable-length payload

- **Packet Creation:** `createRTPPacket()`
  - Auto-incrementing sequence numbers
  - Timestamp management
  - SSRC tracking
  - Marker bit support

- **Packet Encoding/Decoding:** `encodeRTPPacket()`, `decodeRTPPacket()`
  - Network byte order conversion
  - Full header parsing
  - Extension header handling
  - Error detection

### 2. RTCP Protocol Support

#### Sender Reports (SR)
```cpp
bool createSenderReport(uint8_t* buffer, uint16_t& length)
```
- NTP timestamp (64-bit)
- RTP timestamp
- Sender packet/octet counts
- Reception reports for tracked SSRCs

#### Receiver Reports (RR)
```cpp
bool createReceiverReport(uint8_t* buffer, uint16_t& length)
```
- Fraction lost
- Cumulative packets lost
- Highest sequence number
- Interarrival jitter
- Last SR timestamp
- Delay since SR

#### Source Description (SDES)
```cpp
bool createSourceDescription(uint8_t* buffer, uint16_t& length)
```
- CNAME (Canonical Name)
- NAME, EMAIL, PHONE, LOCATION
- TOOL, NOTE, PRIV items

#### Goodbye (BYE)
```cpp
bool createGoodbye(uint8_t* buffer, uint16_t& length)
```
- Clean session termination

### 3. Adaptive Jitter Buffer (20-200ms)

**Features:**
- Configurable depth range: 20-200ms
- Initial target: 50ms
- Adaptive algorithm based on jitter measurements
- Out-of-order packet handling
- Packet loss detection
- Statistics collection

**Configuration:**
```cpp
#define JITTER_BUFFER_MIN_MS 20
#define JITTER_BUFFER_MAX_MS 200
#define JITTER_BUFFER_INITIAL_MS 50
```

**Methods:**
```cpp
void putPacket(const RTPPacket& packet)      // Add packet to buffer
bool getPacket(RTPPacket& packet, bool& underrun)  // Extract packet
uint32_t getCurrentDepth() const              // Current buffer depth
uint32_t getTargetDepth() const               // Target adaptive depth
void updateAdaptiveBuffer(uint32_t time_ms)   // Update buffer size
```

### 4. Quality Monitoring & Statistics

**Real-time Statistics:**
```cpp
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
```

**Methods:**
```cpp
Statistics getStatistics() const
void resetStatistics()
void printStatistics()
```

### 5. Sequence Number & Timestamp Management

- **Auto-increment:** Sequence numbers increment per packet
- **Timestamp:** Based on sample rate (default 8kHz)
- **Wraparound:** Proper handling of 32-bit wraparound
- **Validation:** Checks for out-of-order and duplicate packets

### 6. SSRC (Synchronization Source) Management

- **Generation:** Random 32-bit SSRC with 32+ bits of entropy
- **Tracking:** Support for multiple remote SSRCs
- **Collision Detection:** Hash map-based tracking
- **Remote SSRC Statistics:** Per-source reception reports

### 7. Packet Loss Detection

- **Sequence Analysis:** Detects gaps in sequence numbers
- **Cycle Tracking:** Handles sequence number wraparound
- **Loss Fraction:** Calculates percentage of lost packets
- **Cumulative Loss:** Tracks total packets lost

### 8. Out-of-Order Packet Handling

- **Buffering:** Packets reordered in buffer before delivery
- **Detection:** Identifies and counts out-of-order arrivals
- **Window Management:** Prevents excessive memory usage
- **Statistics:** Tracks OOO packet count

### 9. Network Utilities

**Byte Order Conversion:**
```cpp
uint32_t ntohl(uint32_t value)   // Network to host (32-bit)
uint16_t ntohs(uint16_t value)   // Network to host (16-bit)
uint32_t htonl(uint32_t value)   // Host to network (32-bit)
uint16_t htons(uint16_t value)   // Host to network (16-bit)
```

**NTP Timestamp Generation:**
```cpp
uint64_t getCurrentNTPTimestamp()
void getNTPTimestamp(uint32_t& msw, uint32_t& lsw)
```

## Usage Example

### Initialization

```cpp
// Create RTP handler (payload type 96 = custom, sample rate 8000 Hz)
RTPHandler rtp(RTP_PT_ROIP_AUDIO, 8000);

// Initialize with CNAME
rtp.initialize("roip_station_001");

// Enable adaptive jitter buffer
rtp.enableAdaptiveBuffer(true);
```

### Sending RTP Packets

```cpp
// Prepare audio payload
uint8_t audio_payload[160];  // 20ms @ 8kHz = 160 samples
size_t payload_len = 160;

// Create and send RTP packet
uint32_t seq_num;
uint16_t packet_len = rtp.createRTPPacket(
    audio_payload,
    payload_len,
    false,  // marker bit
    &seq_num
);

// Encode to wire format
uint8_t rtp_buffer[1500];
uint16_t encoded_len = sizeof(rtp_buffer);
if (rtp.encodeRTPPacket(rtp_buffer, encoded_len, ...)) {
    // Send rtp_buffer[0..encoded_len-1] over UDP
    sendto(socket, rtp_buffer, encoded_len, 0, ...);
}
```

### Receiving RTP Packets

```cpp
// Receive RTP packet from network
uint8_t rx_buffer[1500];
int rx_len = recvfrom(socket, rx_buffer, sizeof(rx_buffer), 0, ...);

// Decode RTP packet
RTPPacket packet;
if (rtp.decodeRTPPacket(rx_buffer, rx_len, packet)) {
    // Process packet with timestamp tracking
    uint32_t now_ms = getCurrentTimeMs();
    rtp.processRTPPacket(packet, now_ms);

    // Get packet from jitter buffer
    RTPPacket output;
    bool underrun;
    if (rtp.getJitterBuffer().getPacket(output, underrun)) {
        // Play audio from output.payload
        playAudio(output.payload, output.payload_length);
    } else if (underrun) {
        // Jitter buffer is empty - may need silence/recovery
        handleJitterBufferUnderrun();
    }
}
```

### Sending RTCP Reports

```cpp
// Sender Report (call periodically, e.g., every 5 seconds)
uint8_t rtcp_buffer[1500];
uint16_t rtcp_len = sizeof(rtcp_buffer);
if (rtp.createSenderReport(rtcp_buffer, rtcp_len)) {
    sendto(socket, rtcp_buffer, rtcp_len, 0, ...);
}

// Or Receiver Report
if (rtp.createReceiverReport(rtcp_buffer, rtcp_len)) {
    sendto(socket, rtcp_buffer, rtcp_len, 0, ...);
}

// Source Description (include with RTCP)
if (rtp.createSourceDescription(rtcp_buffer, rtcp_len)) {
    // Append to compound RTCP packet
}
```

### Receiving RTCP Reports

```cpp
// Receive RTCP packet
uint8_t rtcp_rx[1500];
int rtcp_len = recvfrom(socket, rtcp_rx, sizeof(rtcp_rx), 0, ...);

// Process RTCP
uint32_t now_ms = getCurrentTimeMs();
if (rtp.processRTCPPacket(rtcp_rx, rtcp_len, now_ms)) {
    // Remote peer feedback received
}
```

### Monitoring Quality

```cpp
// Get statistics
RTPHandler::Statistics stats = rtp.getStatistics();

// Log quality metrics
printf("Packets: sent=%u, rcv=%u, lost=%u\n",
    stats.packets_sent, stats.packets_received, stats.packets_lost);
printf("Jitter: %.2f ms, RTT: %.2f ms, Loss: %u%%\n",
    stats.jitter, stats.rtt_ms, stats.loss_fraction);

// Print detailed statistics
rtp.printStatistics();

// Reset for new measurement period
rtp.resetStatistics();
```

### Configuration

```cpp
// Set payload type (default: RTP_PT_ROIP_AUDIO)
rtp.setPayloadType(96);

// Set sample rate (default: 8000 Hz)
rtp.setSampleRate(16000);

// Set CNAME
rtp.setCNAME("call_sign_AB1XYZ");

// Set SSRC manually
rtp.setSyncSource(0x12345678);

// Get current values
uint32_t ssrc = rtp.getSSRC();
uint16_t seq = rtp.getSequenceNumber();
uint32_t ts = rtp.getTimestamp();
```

## Payload Types

Standard types defined:
- **0**: PCM μ-law
- **3**: GSM
- **8**: PCM A-law
- **9**: G.722
- **10-11**: L16 (Linear 16-bit)
- **14**: MPEG audio
- **18**: G.729
- **96**: ROIP Audio (custom)
- **97**: ROIP Control (custom)

## Jitter Buffer Algorithm

### Adaptive Adjustment
1. **Measurement Phase:** Track inter-arrival times and delays
2. **Jitter Calculation:** RFC 3550 method using transitional delay variance
3. **Threshold Check:** Compare current jitter against buffer capacity
4. **Adaptation:** Increase/decrease buffer depth
   - High jitter: Increase by 10ms
   - Low jitter: Decrease by 5ms
   - Limits: 20ms minimum, 200ms maximum

### Underrun Handling
- Empty buffer detection via `bool& underrun` parameter
- Allows application to handle gaps gracefully
- Can insert comfort noise or request retransmission

## RTCP Timing (RFC 3550)

Default interval: **5 seconds** (configurable)
- Sender Reports: Full statistics plus reception reports
- Receiver Reports: Reception statistics only
- Source Description: CNAME and optional metadata

## Memory Usage

**Static Structures:**
- RTPPacket: ~2.1 KB
- Statistics: ~60 bytes
- Jitter buffer: Configurable (default ~20-40 packets)

**Estimated Footprint:**
- Code: ~40-50 KB (depending on compiler)
- Data: ~5-10 KB (including jitter buffer)

## Error Handling

All methods return `bool` for error indication:
- `false`: Invalid input, insufficient buffer space, or malformed packet
- `true`: Operation successful

Validation includes:
- RTP version checking (must be 2)
- Sufficient buffer space for operations
- Sequence number wraparound detection
- Payload length bounds checking

## Thread Safety

**Not thread-safe by design:** Call from single network thread
- All state is single-threaded
- Use synchronization wrappers if needed for multi-threaded access
- Recommended: Dedicated RTP task with message queue

## Performance Characteristics

- **Packet Processing:** O(n) where n = CSRC count (typically 0-4)
- **Jitter Calculation:** O(log W) where W = statistics window (100 packets)
- **Adaptive Buffer:** O(1) amortized per packet
- **RTCP Generation:** O(m) where m = remote SSRCs (typically 1-5)

## Testing Recommendations

1. **Unit Tests:**
   - Packet encode/decode round-trip
   - Network byte order conversions
   - Sequence number wraparound
   - Statistics accumulation

2. **Integration Tests:**
   - RTP packet reception and jitter buffering
   - RTCP report generation and parsing
   - Out-of-order packet handling
   - Packet loss scenarios

3. **Load Tests:**
   - Sustained packet rate (50+ pps)
   - Jitter patterns (slow/fast variations)
   - RTCP interval timing

4. **Edge Cases:**
   - Empty jitter buffer (underrun)
   - Full jitter buffer (overflow)
   - SSRC changes
   - Network gaps (silence detection)

## Future Enhancements

- SRTP (Secure RTP) support
- RTP header extensions
- Redundancy (RFC 2198)
- FEC (Forward Error Correction)
- RTCP Extended Reports (RFC 3611)
- Bandwidth estimation algorithms
- Call statistics persistence

## Files

- **rtp_handler.h**: 387 lines - Complete interface and structures
- **rtp_handler.cpp**: 1,005 lines - Full implementation

## Dependencies

- Standard C++ library: `<cstdint>`, `<cstring>`, `<deque>`, `<map>`, `<chrono>`, `<cmath>`
- No external libraries required
- Compatible with C++11 and later

## License

Part of MMDVM RoIP project (see main LICENSE)
