# ESP32 Radio over IP (RoIP) System - Technical Design Document

## Executive Summary

This document outlines the design and implementation plan for a professional-grade Radio over IP (RoIP) system for ESP32 platforms. The system will provide high-fidelity audio transmission between radio devices and remote VoIP endpoints, featuring commercial-grade capabilities including advanced DSP, multiple codec support, NAT traversal, and comprehensive management features.

## 1. System Overview

### 1.1 Architecture

The system consists of three main components:

1. **ESP32 RoIP Client** - Hardware interface to radio equipment
2. **RoIP Server** - Central routing and management server
3. **Management Dashboard** - Web-based configuration and monitoring

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Radio #1      │◄────────┤  ESP32 Client    │         │   Radio #2      │
│   (Analog/      │  Audio  │  - ADC/DAC       │         │   (Analog/      │
│    Digital)     │  PTT    │  - DSP Pipeline  ├────┐    │    Digital)     │
└─────────────────┘  COS    │  - Opus Codec    │    │    └─────────────────┘
                            │  - RTP/SIP       │    │             ▲
                            │  - WiFi Client   │    │             │
                            └──────────────────┘    │    ┌────────┴────────┐
                                     │              │    │  ESP32 Client   │
                                     │ Internet/    │    │  (Remote Site)  │
                                     │ VPN          │    └─────────────────┘
                                     ▼              │             ▲
                            ┌──────────────────┐   │             │
                            │   RoIP Server    │   │    ┌────────┴────────┐
                            │  - SIP Registrar │◄──┴────┤  STUN/TURN      │
                            │  - RTP Mixer     │        │  Server         │
                            │  - Router Logic  │        │  (NAT Traversal)│
                            │  - Recording     │        └─────────────────┘
                            │  - TURN Relay    │                 │
                            └────────┬─────────┘                 │
                                     │                           │
                            ┌────────▼─────────┐        ┌────────▼────────┐
                            │  Web Dashboard   │        │  Mobile App     │
                            │  - Config        │        │  (SIP Client)   │
                            │  - Monitoring    │        └─────────────────┘
                            │  - Recording     │
                            └──────────────────┘
```

### 1.2 Key Features

#### Commercial RoIP Features
- ✅ Multiple codec support (Opus, G.711, G.722, Speex)
- ✅ VOX (Voice Operated Switch) and COS (Carrier Operated Squelch)
- ✅ PTT (Push-to-Talk) control with configurable delays
- ✅ Multi-channel audio mixing
- ✅ Priority-based routing
- ✅ DTMF detection and generation
- ✅ Crosspatching between channels
- ✅ Recording and playback
- ✅ Encryption (SRTP for media, TLS for signaling)
- ✅ Authentication and authorization
- ✅ Remote configuration and monitoring
- ✅ Status reporting and logging
- ✅ Multiple simultaneous connections
- ✅ Failover and redundancy

#### Advanced DSP Features
- ✅ Opus codec (6-510 kbps, 8-48 kHz sampling)
- ✅ Acoustic Echo Cancellation (AEC)
- ✅ Noise Suppression (NS)
- ✅ Automatic Gain Control (AGC)
- ✅ Voice Activity Detection (VAD)
- ✅ Comfort Noise Generation (CNG)
- ✅ Packet Loss Concealment (PLC)
- ✅ Jitter buffering
- ✅ Dynamic range compression
- ✅ Parametric EQ
- ✅ De-emphasis/Pre-emphasis filtering

#### Network Features
- ✅ SIP protocol for signaling
- ✅ RTP/RTCP for media transport
- ✅ STUN/TURN/ICE for NAT traversal
- ✅ CGNAT support via TURN relay
- ✅ IPv4 and IPv6 support
- ✅ QoS (Quality of Service) marking
- ✅ Adaptive bitrate control
- ✅ Network resilience (packet recovery)

## 2. ESP32 Client Firmware

### 2.1 Hardware Requirements

| Component | Specification | Notes |
|-----------|---------------|-------|
| MCU | ESP32, ESP32-S3, ESP32-C3 | S3 preferred (USB, more RAM) |
| RAM | 512KB minimum | For audio buffers and DSP |
| Flash | 4MB minimum | For firmware and config |
| WiFi | 802.11 b/g/n (2.4GHz) | ESP32-C6/S3 support 802.11ax |
| ADC | 12-bit, 24 kHz sampling | Radio RX audio input |
| DAC | 8-bit or PWM 12-bit | Radio TX audio output |
| GPIO | 8+ pins | PTT, COS, LEDs, Serial |

### 2.2 Pin Configuration

Reuses MMDVM pin definitions:
- `PIN_RX` (ADC) - Radio receive audio input
- `PIN_TX` (DAC/PWM) - Radio transmit audio output
- `PIN_PTT` - Push-to-talk control output
- `PIN_COS` - Carrier sense input
- `PIN_LED` - Status LED
- Additional pins for DTMF, squelch, etc.

### 2.3 Audio Pipeline Architecture

```
Radio RX Audio → ADC (24kHz) → High-pass Filter → AGC → Noise Suppression
                                                           ↓
                                                    Opus Encoder
                                                           ↓
                                                    RTP Packetizer
                                                           ↓
                                                       WiFi TX

WiFi RX → RTP Depacketizer → Jitter Buffer → Opus Decoder → PLC
                                                              ↓
                                                        De-emphasis
                                                              ↓
                                                    DAC/PWM (24kHz) → Radio TX
```

### 2.4 Software Modules

#### Core Audio Module (audio_pipeline.cpp)
- ADC sampling at 24 kHz (reusing MMDVM timer)
- Ring buffers for real-time audio (20ms frames)
- Sample rate conversion if needed
- Audio level monitoring

#### DSP Module (dsp_processor.cpp)
- **AGC**: Automatic gain control with attack/release
- **HPF/LPF**: High-pass filter (300Hz) and low-pass filter (3kHz)
- **Noise Gate**: Squelch/noise gating
- **Compressor**: Dynamic range compression
- **EQ**: Parametric equalizer (optional)
- Uses ESP-DSP library where possible

#### Codec Module (codec_opus.cpp)
- Opus encoder/decoder integration
- Configurable bitrate (8-64 kbps recommended)
- Configurable complexity (0-10)
- Frame size: 20ms (default), 10/40/60ms options
- DTX (Discontinuous Transmission) support
- FEC (Forward Error Correction) support

#### RTP Module (rtp_handler.cpp)
- RTP packet creation/parsing (RFC 3550)
- RTCP sender/receiver reports (RFC 3551)
- Sequence number tracking
- Timestamp management
- SSRC handling
- Jitter buffer (adaptive, 20-200ms)
- Packet loss detection and concealment

#### SIP Module (sip_client.cpp)
- SIP REGISTER, INVITE, BYE, ACK
- SDP (Session Description Protocol) negotiation
- Authentication (Digest)
- Keep-alive (OPTIONS/REGISTER refresh)
- Re-INVITE for codec changes
- Simplified SIP stack (not full RFC 3261)

#### Network Module (network_manager.cpp)
- WiFi connection management
- mDNS for local discovery
- STUN client for NAT detection
- TURN client for relay
- ICE candidate gathering
- Quality monitoring (RTT, jitter, loss)

#### PTT/COS Control (ptt_controller.cpp)
- PTT delay (tail delay configurable)
- COS detection with debouncing
- VOX mode (voice-activated TX)
- PTT priority handling
- Timeout timer
- TX/RX state machine

#### Configuration Module (config_manager.cpp)
- WiFi credentials
- SIP server settings
- Codec parameters
- DSP settings
- GPIO mappings
- NVS (Non-Volatile Storage) for persistence

#### Web UI Module (webserver.cpp)
- HTTP server for configuration
- WebSocket for real-time status
- REST API for control
- OTA (Over-The-Air) firmware updates
- Captive portal for initial setup

### 2.5 Memory Management

| Component | RAM Usage (Est.) |
|-----------|------------------|
| Audio buffers (TX/RX) | 40 KB |
| Jitter buffer | 30 KB |
| Opus encoder/decoder | 60 KB |
| DSP processing | 40 KB |
| Network stack | 80 KB |
| SIP/RTP | 30 KB |
| Web server | 40 KB |
| **Total** | **~320 KB** |
| Available on ESP32-S3 | 512 KB |

### 2.6 Firmware Build Configurations

PlatformIO environments:
- `esp32-roip` - ESP32 basic build
- `esp32s3-roip` - ESP32-S3 with USB support
- `esp32c3-roip` - ESP32-C3 RISC-V variant
- `esp32-roip-debug` - Debug build with verbose logging

## 3. RoIP Server

### 3.1 Server Options

#### Option A: FreeSWITCH (Recommended)
- ✅ Full-featured PBX/SIP server
- ✅ Built-in media handling
- ✅ Extensive codec support
- ✅ Conference bridging
- ✅ Recording capabilities
- ✅ Dialplan for routing
- ✅ Mature and stable
- ❌ Complex configuration
- ❌ Resource intensive

#### Option B: Asterisk
- ✅ Popular open-source PBX
- ✅ Excellent documentation
- ✅ ARI (Asterisk REST Interface)
- ✅ Flexible dialplan
- ❌ Older codebase
- ❌ Resource intensive

#### Option C: Custom Node.js/Go Server (Lightweight)
- ✅ Minimal resource usage
- ✅ Tailored for RoIP only
- ✅ Easy to deploy
- ✅ Can run behind CGNAT with relay
- ❌ More development effort
- ❌ Less mature

**Recommendation**: Start with Custom Server, migrate to FreeSWITCH if advanced features needed.

### 3.2 Custom Server Architecture (Node.js/TypeScript)

```
┌─────────────────────────────────────────────────────────────┐
│                     RoIP Server (Node.js)                   │
├─────────────────────────────────────────────────────────────┤
│  SIP Stack (drachtio)          RTP Handler (rtpengine)     │
│  - Registration               - Media relay                 │
│  - Call routing               - Transcoding                 │
│  - Authentication             - Mixing                      │
├─────────────────────────────────────────────────────────────┤
│  STUN/TURN Server (coturn)    Database (PostgreSQL)        │
│  - NAT traversal              - Users/Devices               │
│  - Relay for CGNAT            - Call logs                   │
│                               - Recordings                  │
├─────────────────────────────────────────────────────────────┤
│  WebSocket API                 REST API                     │
│  - Real-time status           - Configuration               │
│  - Live monitoring            - Control                     │
├─────────────────────────────────────────────────────────────┤
│  Web Dashboard (React)         Mobile App (React Native)   │
│  - Device management          - SIP client                  │
│  - Call monitoring            - PTT control                 │
│  - Recording playback         - Remote monitoring           │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 Server Components

#### SIP Server (drachtio-srf)
- User registration
- Call routing and bridging
- Authentication (Digest)
- Presence notifications
- MESSAGE support for control

#### RTP Engine
- Media relay/proxy
- Audio mixing for conferences
- Transcoding between codecs
- Recording to disk
- RTCP processing

#### TURN Server (coturn)
- STUN binding requests
- TURN relay for CGNAT clients
- ICE support
- Bandwidth limiting
- User authentication

#### Database (PostgreSQL)
```sql
-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(64) UNIQUE NOT NULL,
    password_hash VARCHAR(256) NOT NULL,
    sip_uri VARCHAR(256) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Devices table
CREATE TABLE devices (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    device_name VARCHAR(128),
    mac_address VARCHAR(17),
    ip_address INET,
    last_registered TIMESTAMP,
    status VARCHAR(32),
    config JSONB
);

-- Routes table
CREATE TABLE routes (
    id SERIAL PRIMARY KEY,
    source_device_id INTEGER REFERENCES devices(id),
    dest_device_id INTEGER REFERENCES devices(id),
    priority INTEGER DEFAULT 5,
    enabled BOOLEAN DEFAULT TRUE
);

-- Call logs table
CREATE TABLE call_logs (
    id SERIAL PRIMARY KEY,
    caller_id INTEGER REFERENCES devices(id),
    callee_id INTEGER REFERENCES devices(id),
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    duration INTEGER,
    recording_path VARCHAR(512)
);
```

#### API Server (Express)
```typescript
// REST API endpoints
POST   /api/v1/auth/login
POST   /api/v1/auth/register
GET    /api/v1/devices
POST   /api/v1/devices
PUT    /api/v1/devices/:id
DELETE /api/v1/devices/:id
GET    /api/v1/routes
POST   /api/v1/routes
GET    /api/v1/calls/active
GET    /api/v1/calls/history
GET    /api/v1/recordings/:id
POST   /api/v1/ptt/:device_id/trigger

// WebSocket events
ws://server/status
  - device.registered
  - device.unregistered
  - call.started
  - call.ended
  - audio.level
  - network.quality
```

### 3.4 Deployment Options

#### Cloud VPS (Recommended)
- Digital Ocean, Linode, Vultr ($5-10/month)
- Public IP address
- Ports: 5060 (SIP), 10000-20000 (RTP), 3478 (STUN), 5349 (TURNS)
- SSL certificate (Let's Encrypt)

#### Behind CGNAT (Home/Mobile)
- Server runs on local network
- Uses TURN relay on public VPS
- All traffic relayed through TURN
- Higher latency, but works everywhere

#### Docker Compose
```yaml
version: '3.8'
services:
  roip-server:
    build: ./server
    ports:
      - "5060:5060/udp"
      - "10000-20000:10000-20000/udp"
      - "8080:8080"
    environment:
      - DB_HOST=postgres
      - TURN_HOST=coturn
    depends_on:
      - postgres
      - coturn

  postgres:
    image: postgres:15
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      - POSTGRES_PASSWORD=changeme

  coturn:
    image: coturn/coturn
    ports:
      - "3478:3478/udp"
      - "3478:3478/tcp"
    volumes:
      - ./coturn.conf:/etc/coturn/turnserver.conf

  web-dashboard:
    build: ./dashboard
    ports:
      - "3000:3000"
    depends_on:
      - roip-server

volumes:
  pgdata:
```

## 4. Audio Quality Optimization

### 4.1 Codec Configuration

**Opus Settings for High-Fidelity Voice:**
```c
// Initialize Opus encoder
opus_encoder_create(
    24000,              // Sample rate: 24 kHz (wide-band)
    1,                  // Channels: mono
    OPUS_APPLICATION_VOIP,  // Application: VoIP optimization
    &error
);

// Configure for quality
opus_encoder_ctl(encoder, OPUS_SET_BITRATE(32000));      // 32 kbps
opus_encoder_ctl(encoder, OPUS_SET_COMPLEXITY(10));      // Max quality
opus_encoder_ctl(encoder, OPUS_SET_SIGNAL(OPUS_SIGNAL_VOICE));
opus_encoder_ctl(encoder, OPUS_SET_DTX(1));              // Discontinuous TX
opus_encoder_ctl(encoder, OPUS_SET_INBAND_FEC(1));       // Forward error correction
opus_encoder_ctl(encoder, OPUS_SET_PACKET_LOSS_PERC(5)); // Expected loss
opus_encoder_ctl(encoder, OPUS_SET_VBR(1));              // Variable bitrate
```

**Bitrate vs Quality:**
- 8 kbps: Narrowband, intelligible
- 16 kbps: Wideband, good quality
- 24 kbps: Wideband, very good quality
- 32 kbps: Wideband, excellent quality (recommended)
- 48 kbps: Fullband, transparent quality
- 64 kbps: Fullband, broadcast quality

### 4.2 DSP Chain

```c
// Audio processing pipeline
void process_rx_audio(int16_t* samples, size_t count) {
    // 1. High-pass filter (remove DC offset and sub-audio)
    biquad_filter(samples, count, &hpf_300hz);

    // 2. Noise gate (squelch)
    noise_gate(samples, count, threshold_db);

    // 3. AGC (normalize levels)
    agc_process(samples, count, target_level);

    // 4. Noise suppression (WebRTC NS or RNNoise)
    rnnoise_process_frame(denoiser, samples);

    // 5. Compressor (reduce dynamic range)
    compressor(samples, count, ratio, threshold, attack, release);

    // 6. Pre-emphasis (boost high frequencies)
    pre_emphasis_filter(samples, count, 0.95);

    // 7. Encode to Opus
    opus_encode(encoder, samples, FRAME_SIZE, encoded_packet, MAX_PACKET);
}

void process_tx_audio(int16_t* samples, size_t count) {
    // 1. De-emphasis (compensate for radio pre-emphasis)
    de_emphasis_filter(samples, count, 0.95);

    // 2. Parametric EQ (tailor for radio characteristics)
    parametric_eq(samples, count, eq_bands);

    // 3. Limiter (prevent clipping)
    limiter(samples, count, threshold);

    // 4. Output to DAC
    dac_write(samples, count);
}
```

### 4.3 Advanced DSP Algorithms

#### RNNoise (Deep Learning Noise Suppression)
```c
// https://github.com/xiph/rnnoise
// State-of-the-art ML-based noise reduction
DenoiseState* denoiser = rnnoise_create(NULL);
float vad_prob = rnnoise_process_frame(denoiser, output_frame, input_frame);
```

#### WebRTC Audio Processing
```c
// Google's excellent audio processing library
// Includes AEC, AGC, NS, VAD
#include <webrtc/modules/audio_processing/include/audio_processing.h>

webrtc::AudioProcessing* apm = webrtc::AudioProcessing::Create();
apm->echo_cancellation()->Enable(true);
apm->noise_suppression()->Enable(true);
apm->noise_suppression()->set_level(webrtc::NoiseSuppression::kHigh);
apm->gain_control()->Enable(true);
apm->gain_control()->set_mode(webrtc::GainControl::kAdaptiveDigital);
apm->voice_detection()->Enable(true);
```

#### Speex DSP (Lightweight Alternative)
```c
// If WebRTC is too heavy for ESP32
#include <speex/speex_preprocess.h>

SpeexPreprocessState* preprocess = speex_preprocess_state_init(FRAME_SIZE, SAMPLE_RATE);
int denoise = 1;
speex_preprocess_ctl(preprocess, SPEEX_PREPROCESS_SET_DENOISE, &denoise);
int agc = 1;
speex_preprocess_ctl(preprocess, SPEEX_PREPROCESS_SET_AGC, &agc);
```

### 4.4 Jitter Buffer Management

```c
// Adaptive jitter buffer
typedef struct {
    uint8_t* packets[MAX_PACKETS];
    uint16_t seq_nums[MAX_PACKETS];
    uint32_t timestamps[MAX_PACKETS];
    size_t count;
    uint16_t expected_seq;
    uint32_t target_delay_ms;  // Adaptive: 20-200ms
    uint32_t max_delay_ms;
} jitter_buffer_t;

// Auto-adjust based on network conditions
void adjust_jitter_buffer(jitter_buffer_t* jb, uint32_t measured_jitter) {
    if (measured_jitter > jb->target_delay_ms * 0.8) {
        jb->target_delay_ms = MIN(jb->target_delay_ms + 10, jb->max_delay_ms);
    } else if (measured_jitter < jb->target_delay_ms * 0.3) {
        jb->target_delay_ms = MAX(jb->target_delay_ms - 10, 20);
    }
}
```

## 5. Implementation Roadmap

### Phase 1: MVP (Weeks 1-4)
1. ✅ Set up development branch
2. ✅ Port audio pipeline from MMDVM
3. ✅ Integrate Opus codec
4. ✅ Implement basic RTP send/receive
5. ✅ Add simple SIP client
6. ✅ WiFi configuration
7. ✅ Basic PTT/COS control
8. ✅ Point-to-point calling (no server)

### Phase 2: Server & NAT Traversal (Weeks 5-8)
1. ✅ Deploy custom SIP server
2. ✅ Implement STUN client
3. ✅ Implement TURN client
4. ✅ ICE negotiation
5. ✅ Multi-client support
6. ✅ Registration and authentication
7. ✅ Basic web dashboard

### Phase 3: DSP & Quality (Weeks 9-12)
1. ✅ Implement AGC
2. ✅ Add noise suppression (RNNoise or Speex)
3. ✅ Jitter buffer optimization
4. ✅ Packet loss concealment
5. ✅ Audio quality testing
6. ✅ Latency optimization
7. ✅ Network resilience

### Phase 4: Advanced Features (Weeks 13-16)
1. ✅ DTMF detection/generation
2. ✅ VOX mode
3. ✅ Multi-channel mixing
4. ✅ Recording functionality
5. ✅ Priority routing
6. ✅ Crosspatching
7. ✅ SRTP encryption
8. ✅ Web configuration UI
9. ✅ OTA updates
10. ✅ Mobile app (optional)

### Phase 5: Testing & Documentation (Weeks 17-20)
1. ✅ Field testing
2. ✅ Performance optimization
3. ✅ User documentation
4. ✅ API documentation
5. ✅ Deployment guide
6. ✅ Troubleshooting guide

## 6. Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Audio latency (end-to-end) | <200ms | <100ms ideal |
| Jitter | <30ms | Acceptable for VoIP |
| Packet loss tolerance | Up to 10% | With FEC/PLC |
| Audio quality (MOS) | >4.0 | Mean Opinion Score |
| Concurrent calls per ESP32 | 1 | Single radio interface |
| Server capacity | 100+ clients | On basic VPS |
| CPU usage (ESP32) | <80% | Leave headroom |
| Power consumption | <500mA @ 5V | 2.5W typical |

## 7. Security Considerations

### 7.1 ESP32 Client Security
- ✅ SRTP for media encryption (AES-128)
- ✅ TLS for SIP signaling
- ✅ Digest authentication
- ✅ Certificate pinning
- ✅ Secure boot (optional)
- ✅ Flash encryption (optional)

### 7.2 Server Security
- ✅ HTTPS for web dashboard
- ✅ Database encryption at rest
- ✅ Rate limiting (DDoS protection)
- ✅ Firewall rules
- ✅ Regular security updates
- ✅ Audit logging

## 8. Testing Strategy

### 8.1 Unit Tests
- Audio processing functions
- Codec encode/decode
- RTP packetization
- Jitter buffer logic
- SIP message parsing

### 8.2 Integration Tests
- End-to-end audio path
- NAT traversal scenarios
- Failover behavior
- Multi-client scenarios

### 8.3 Performance Tests
- Latency measurement
- Packet loss simulation
- Network congestion
- CPU/memory profiling

### 8.4 Field Tests
- Real radio integration
- Various network conditions
- CGNAT environments
- Long-duration stability

## 9. Bill of Materials (BOM)

### Development Hardware
- ESP32-S3-DevKitC-1 ($10)
- 2x Two-way radios with audio jacks ($50-200)
- Audio cables and adapters ($20)
- Breadboard and jumper wires ($10)
- Level shifters (if needed) ($5)
- **Total**: ~$100-250

### Production Hardware (per unit)
- ESP32-S3 module ($3-5)
- PCB ($2-5)
- Audio connectors ($2)
- Enclosure ($5-10)
- Power supply ($3)
- **Total**: ~$15-30 per unit

## 10. Open Source Libraries

### ESP32 Client
- **Opus**: https://opus-codec.org/
- **ESP-DSP**: https://github.com/espressif/esp-dsp
- **RNNoise**: https://github.com/xiph/rnnoise
- **Speex DSP**: https://www.speex.org/
- **WebRTC APM**: https://webrtc.googlesource.com/src/+/refs/heads/main/modules/audio_processing
- **MicroSIP**: Lightweight SIP stack
- **AsyncTCP**: https://github.com/me-no-dev/AsyncTCP
- **ESPAsyncWebServer**: https://github.com/me-no-dev/ESPAsyncWebServer

### Server
- **drachtio-srf**: https://github.com/davehorton/drachtio-srf (SIP)
- **rtpengine**: https://github.com/sipwise/rtpengine (RTP)
- **coturn**: https://github.com/coturn/coturn (STUN/TURN)
- **node-opus**: https://github.com/Rantanen/node-opus
- **simple-peer**: https://github.com/feross/simple-peer (WebRTC)

## 11. Success Criteria

The project will be considered successful when:
1. ✅ Two ESP32 devices can communicate via radio over the internet
2. ✅ Audio quality is comparable to commercial RoIP systems (MOS >4.0)
3. ✅ System works reliably behind CGNAT
4. ✅ End-to-end latency <200ms under normal conditions
5. ✅ Web interface allows easy configuration
6. ✅ System is stable for 24+ hour operation
7. ✅ Documentation enables others to replicate

## 12. Future Enhancements

- P25/DMR digital radio support
- Multiple simultaneous channels per ESP32
- Trunked radio system integration
- APCO P25 console integration
- Analog CTCSS/DCS encoding/decoding
- Simulcast/voting receiver
- Recording with motion-triggered archival
- AI-powered noise reduction
- Automatic language translation
- Integration with dispatch software
- LoRa backup link for remote sites

## 13. License

This project will be released under GPL v2 to maintain compatibility with MMDVM.

## 14. References

1. RFC 3550 - RTP: A Transport Protocol for Real-Time Applications
2. RFC 3551 - RTP Profile for Audio and Video Conferences
3. RFC 3261 - SIP: Session Initiation Protocol
4. RFC 6716 - Opus Codec
5. RFC 5389 - STUN
6. RFC 5766 - TURN
7. RFC 8445 - ICE
8. JPS RoIP Gateway Documentation
9. WebRTC Audio Processing Documentation
10. Opus Codec Best Practices

---

**Document Version**: 1.0
**Date**: 2025-11-21
**Author**: ESP32 RoIP Development Team
**Status**: Design Phase
