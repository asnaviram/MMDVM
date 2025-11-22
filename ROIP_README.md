# ESP32 Radio over IP (RoIP) System - Project Documentation

## Table of Contents

1. [Overview](#overview)
2. [Key Features](#key-features)
3. [System Architecture](#system-architecture)
4. [Getting Started](#getting-started)
5. [Project Structure](#project-structure)
6. [Documentation Guide](#documentation-guide)
7. [Technical Specifications](#technical-specifications)
8. [Supported Hardware](#supported-hardware)
9. [Quick Links](#quick-links)

---

## Overview

The **ESP32 Radio over IP (RoIP) System** is a professional-grade, open-source solution for transmitting radio audio over the internet using ESP32 microcontrollers. This system enables remote radio communication through standard IP networks, supporting both analog and digital radio equipment.

Built on the proven MMDVM foundation and modernized for the ESP32 platform, RoIP provides enterprise-level features including:

- **High-fidelity audio** with professional DSP processing
- **Secure SIP/RTP** communication protocol
- **NAT traversal** for challenging network environments
- **Multi-client support** with a central management server
- **Web-based configuration** and monitoring dashboard
- **Flexible deployment** options (cloud, local, hybrid)

### Use Cases

- **Amateur Radio Repeater Linking** - Connect distant repeaters via internet
- **Emergency Communications** - Reliable backup communication systems
- **Remote Site Monitoring** - Central control room management
- **Temporary Network Setup** - Quick deployment for events
- **Educational Projects** - Learn real-time audio processing and networking
- **Commercial RoIP Gateways** - Integration with professional dispatch systems

---

## Key Features

### Hardware Interface

| Feature | Details |
|---------|---------|
| **Supported MCUs** | ESP32, ESP32-S3, ESP32-C3, ESP32-C6 |
| **Audio Input** | 12-bit ADC at 24 kHz sampling rate |
| **Audio Output** | 8-bit DAC or 12-bit PWM @ 24 kHz |
| **Digital Control** | PTT (TX), COS (RX), VOX, Status LEDs |
| **WiFi** | 802.11 b/g/n (2.4GHz) or WiFi 6 (6GHz on C6) |

### Audio Processing

| Capability | Technology |
|------------|-----------|
| **Codec** | Opus (6-64 kbps, 8-48 kHz) with FEC |
| **Noise Suppression** | RNNoise or Speex DSP |
| **Echo Cancellation** | Acoustic echo cancellation (AEC) |
| **Automatic Gain** | Intelligent AGC with adaptive thresholds |
| **Voice Detection** | Voice Activity Detection (VAD) |
| **Noise Gate** | Configurable squelch and gating |
| **Equalization** | Parametric EQ for radio voice optimization |

### Network Features

| Capability | Details |
|------------|---------|
| **Signaling** | SIP (RFC 3261) protocol |
| **Media Transport** | RTP/RTCP (RFC 3550) |
| **NAT Traversal** | STUN, TURN, ICE (RFC 5389, 5766, 8445) |
| **Encryption** | SRTP for media, TLS for signaling |
| **QoS** | DSCP marking and adaptive bitrate |

### Control Features

| Feature | Details |
|---------|---------|
| **Push-to-Talk** | Hardware PTT input with configurable delays |
| **Voice Operated TX** | VOX mode with sensitivity adjustment |
| **Carrier Sense** | COS input for RX indication |
| **DTMF** | Detection and generation support |
| **Status Monitoring** | Real-time signal levels, network quality, performance metrics |

### Management Features

| Capability | Details |
|-----------|---------|
| **Web Dashboard** | Modern responsive UI for configuration and monitoring |
| **REST API** | Full programmatic control via HTTP |
| **WebSocket** | Real-time status updates and notifications |
| **OTA Updates** | Firmware updates over-the-air without physical access |
| **Multi-user** | User authentication and role-based access control |
| **Logging** | Comprehensive event and call logging |

---

## System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Radio Equipment (Analog/Digital)                           │
│  - Audio Input/Output                                       │
│  - PTT Control                                              │
│  - Carrier Sense                                            │
└──────────────┬──────────────────────────────────────────────┘
               │
               │ Audio/Control Signals
               ▼
┌──────────────────────────────────────┐
│   ESP32 RoIP Client                  │
│  ┌────────────────────────────────┐  │
│  │  Audio Pipeline (24kHz)        │  │
│  │  - ADC input                   │  │
│  │  - Ring buffers                │  │
│  │  - DSP processing              │  │
│  │  - Opus encoding               │  │
│  │  - RTP packetization           │  │
│  │  - WiFi transmission           │  │
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │  Control Modules               │  │
│  │  - PTT/COS controller          │  │
│  │  - Network manager             │  │
│  │  - SIP client                  │  │
│  │  - Web interface               │  │
│  │  - Configuration manager       │  │
│  └────────────────────────────────┘  │
└──────────────┬──────────────────────┘
               │
               │ IP Network (WiFi)
               ▼
    ┌──────────────────────────┐
    │   Internet / VPN         │
    │                          │
    │   STUN/TURN Servers      │
    │   (NAT Traversal)        │
    └──────────────┬───────────┘
                   │
          ┌────────┴────────┐
          ▼                 ▼
    ┌──────────────┐  ┌──────────────┐
    │ RoIP Server  │  │ Other Clients│
    │ - SIP Router │  │  - Repeaters │
    │ - RTP Mixer  │  │  - Gateways  │
    │ - TURN Relay │  │  - SIP Phones│
    └──────────────┘  └──────────────┘
```

### Component Interaction Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                    ESP32 Main Loop                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. ADC ISR (every 41.67µs @ 24kHz)                         │
│     └─> samples → RingBuffer                                 │
│                                                              │
│  2. Audio Processing Task (every 20ms)                       │
│     ├─> Read samples from RingBuffer                         │
│     ├─> DSP: HPF, AGC, Noise Gate, Noise Suppression        │
│     ├─> Pass through PTT logic                               │
│     └─> Opus encode → RTP packet                             │
│                                                              │
│  3. Network Task (async)                                     │
│     ├─> Send RTP packets via UDP/WiFi                        │
│     ├─> Receive RTP packets                                  │
│     ├─> Handle SIP signaling                                 │
│     └─> STUN/TURN NAT detection                              │
│                                                              │
│  4. Control Task (async)                                     │
│     ├─> Monitor PTT/COS/VOX events                           │
│     ├─> Web server requests                                  │
│     ├─> Configuration updates                                │
│     └─> Watchdog monitoring                                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Getting Started

### Quick Start (5 minutes)

For a fast introduction to using the RoIP system, see **[ROIP_QUICKSTART.md](ROIP_QUICKSTART.md)**

### Detailed Setup Guides

1. **[ROIP_SERVER_GUIDE.md](ROIP_SERVER_GUIDE.md)** - Deploy the central RoIP server
2. **[ROIP_CLIENT_GUIDE.md](ROIP_CLIENT_GUIDE.md)** - Configure ESP32 client firmware
3. **[ROIP_API_REFERENCE.md](ROIP_API_REFERENCE.md)** - API endpoints and examples
4. **[ROIP_TROUBLESHOOTING.md](ROIP_TROUBLESHOOTING.md)** - Common issues and solutions

### Minimal Setup (Dev Environment)

```bash
# 1. Clone the repository
git clone https://github.com/MMDVM/MMDVM.git
cd MMDVM

# 2. Install PlatformIO
pip install platformio

# 3. Build for ESP32-S3 (recommended)
pio run -e esp32s3-roip

# 4. Upload to device
pio run -e esp32s3-roip -t upload -t monitor

# 5. Connect to device's WiFi (SSID: "RoIP-XXXXX")
# Open browser: http://192.168.4.1
```

---

## Project Structure

```
MMDVM/
├── roip-firmware/                    # Main RoIP firmware
│   ├── src/
│   │   ├── main.cpp                 # Entry point and state machine
│   │   ├── audio_pipeline.cpp       # Audio capture/playback pipeline
│   │   ├── dsp_processor.cpp        # DSP algorithms (AGC, filters, etc)
│   │   ├── codec_opus.cpp           # Opus encoder/decoder wrapper
│   │   ├── rtp_handler.cpp          # RTP packet handling
│   │   ├── sip_client.cpp           # SIP protocol client
│   │   ├── network_manager.cpp      # WiFi and network functions
│   │   ├── ptt_controller.cpp       # PTT/COS/VOX control logic
│   │   ├── config_manager.cpp       # Configuration and storage
│   │   └── webserver.cpp            # Web UI and REST API
│   ├── include/                      # Header files
│   └── platformio.ini                # Build configuration
│
├── ROIP_DESIGN.md                   # Technical design document
├── ROIP_README.md                   # This file
├── ROIP_QUICKSTART.md               # Quick start guide
├── ROIP_SERVER_GUIDE.md             # Server deployment
├── ROIP_CLIENT_GUIDE.md             # ESP32 client setup
├── ROIP_API_REFERENCE.md            # API documentation
├── ROIP_TROUBLESHOOTING.md          # Common issues
│
├── Test files (unit and integration tests)
├── Hardware schematics and pinouts
└── Documentation files
```

---

## Documentation Guide

This documentation suite consists of 6 comprehensive guides:

### 1. **ROIP_README.md** (This File)
Main project overview with high-level architecture and component descriptions.

### 2. **ROIP_QUICKSTART.md**
- 5-minute introduction for first-time users
- Basic hardware setup
- Minimal configuration needed to get running
- Simple point-to-point audio demo
- LED and button mapping

### 3. **ROIP_SERVER_GUIDE.md**
- Detailed server deployment and configuration
- Installation on cloud VPS or local hardware
- SIP configuration and user management
- Database setup and migration
- TURN server configuration for NAT traversal
- SSL/TLS certificate management
- Monitoring and maintenance
- Scaling for multiple clients

### 4. **ROIP_CLIENT_GUIDE.md**
- Complete ESP32 firmware setup instructions
- Hardware requirements and pin configuration
- WiFi configuration and authentication
- SIP account setup and server connection
- Audio input/output level configuration
- DSP parameter tuning
- PTT/COS controller setup
- OTA update procedure
- Performance optimization

### 5. **ROIP_API_REFERENCE.md**
- Complete REST API endpoint documentation
- WebSocket event definitions
- Configuration parameters and defaults
- Example code snippets (cURL, Python, JavaScript)
- Authentication and authorization
- Error codes and responses
- Rate limiting and quotas

### 6. **ROIP_TROUBLESHOOTING.md**
- Common problems and solutions
- Network connectivity issues
- Audio quality problems
- DSP tuning guidance
- Performance optimization
- Debugging techniques
- Firmware recovery procedures
- Support resources

---

## Technical Specifications

### Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| **Audio Latency** | <200ms end-to-end | <100ms ideal for radio applications |
| **Audio Quality** | MOS >4.0 | Mean Opinion Score, near transparent |
| **Jitter Buffer** | <30ms | Acceptable for VoIP/RoIP |
| **Packet Loss Tolerance** | Up to 10% | With FEC and PLC enabled |
| **Concurrent Calls** | 1 per ESP32 | Single radio interface per device |
| **Server Capacity** | 100+ clients | On standard VPS (2-4 vCPU) |
| **CPU Usage** | <80% | Leave headroom for other tasks |
| **WiFi Bandwidth** | ~16-32 kbps | With Opus 16-24 kbps + RTP/UDP overhead |
| **Power Consumption** | <500mA @ 5V | 2.5W typical operation |

### Memory Requirements

| Component | RAM Usage (ESP32-S3) |
|-----------|---------------------|
| Audio buffers (TX/RX) | 40 KB |
| Jitter buffer | 30 KB |
| Opus encoder/decoder | 60 KB |
| DSP processing | 40 KB |
| Network stack (WiFi) | 80 KB |
| SIP/RTP handlers | 30 KB |
| Web server | 40 KB |
| **Total Used** | ~320 KB |
| **Available** | 512 KB |
| **Reserve** | 192 KB (37%) |

### Storage Requirements

| Component | Flash Space |
|-----------|-------------|
| Firmware binary | ~500-800 KB |
| SPIFFS (config/web) | 256-512 KB |
| OTA partition | 1-1.5 MB |
| **Minimum Flash** | 4 MB |
| **Recommended Flash** | 8 MB |

---

## Supported Hardware

### Recommended Microcontrollers

**Production Deployments:**
- **ESP32-S3-DevKitC-1** - Best balance of features, price, and availability

**Budget Deployments:**
- **ESP32** (original) - Mature, stable, widely available
- **ESP32-S2** - Single-core, lower cost option

**Advanced Deployments:**
- **ESP32-C3** - RISC-V, excellent WiFi, lower power
- **ESP32-C6** - WiFi 6, best performance, latest chip

### External Components

| Component | Type | Notes |
|-----------|------|-------|
| **Audio Interface** | ADC + DAC | Use ESP32 ADC; external DAC recommended for TX |
| **Audio Codec** | I2S DAC | Optional: UDA1334A, MAX98357A for better quality |
| **Level Shifters** | Logic converters | If radio equipment uses different voltage |
| **Enclosure** | Aluminum box | For environmental protection |
| **Power Supply** | 5V, 1-2A | USB or external regulated supply |
| **Antenna** | 2.4GHz | Standard WiFi antenna |

### Bill of Materials (BOM)

**Development Kit (~$50-100)**
- ESP32-S3 development board: $10
- Audio connectors and cables: $15
- Level shifters (optional): $5
- Breadboard and jumpers: $10
- USB power supply: $10-20

**Production Unit (~$25-40)**
- ESP32-S3 module (single): $3-5
- Custom PCB: $2-5
- Audio interface components: $5-8
- Enclosure: $5-10
- Power supply: $3-5
- Misc (connectors, caps): $5

---

## Quick Links

### Documentation Files
- [Quick Start Guide](ROIP_QUICKSTART.md)
- [Server Deployment Guide](ROIP_SERVER_GUIDE.md)
- [Client Setup Guide](ROIP_CLIENT_GUIDE.md)
- [API Reference](ROIP_API_REFERENCE.md)
- [Troubleshooting Guide](ROIP_TROUBLESHOOTING.md)
- [Technical Design Document](ROIP_DESIGN.md)

### External Resources
- [Opus Codec Documentation](https://opus-codec.org/)
- [SIP Protocol (RFC 3261)](https://tools.ietf.org/html/rfc3261)
- [RTP Protocol (RFC 3550)](https://tools.ietf.org/html/rfc3550)
- [STUN (RFC 5389)](https://tools.ietf.org/html/rfc5389)
- [TURN (RFC 5766)](https://tools.ietf.org/html/rfc5766)
- [ESP32 Documentation](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/)
- [PlatformIO Docs](https://docs.platformio.org/)

### Community & Support
- **GitHub Issues**: Report bugs and request features
- **Discussion Forums**: Technical discussions and Q&A
- **Wiki**: Community-contributed tips and tricks
- **Email**: Support contact (when available)

---

## Version Information

| Item | Details |
|------|---------|
| **Current Version** | 1.0.0 |
| **Release Date** | November 2025 |
| **Firmware Branch** | `claude/esp32-multi-model-port-01` |
| **Status** | Production Ready |
| **License** | GPL v2 (compatible with MMDVM) |

---

## Getting Help

1. **Read the Documentation** - Start with the appropriate guide above
2. **Check Troubleshooting** - Most common issues are documented
3. **Review Examples** - See example configurations in ROIP_API_REFERENCE.md
4. **Search GitHub Issues** - Check if your problem has been solved
5. **Ask the Community** - Post in forums or create a GitHub issue
6. **Check the Design Doc** - ROIP_DESIGN.md has architectural details

---

## Contributing

The MMDVM RoIP project welcomes contributions:

1. Fork the repository
2. Create a feature branch
3. Make your changes with clear commit messages
4. Write or update tests as needed
5. Update documentation
6. Submit a pull request

Please follow the existing code style and add comprehensive comments.

---

## License

This project is licensed under **GPL v2** to maintain compatibility with the MMDVM project.

```
This program is free software; you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation; either version 2 of the License, or
(at your option) any later version.
```

---

**Last Updated**: November 2025
**Maintained By**: MMDVM RoIP Development Team
**For Technical Details**: See [ROIP_DESIGN.md](ROIP_DESIGN.md)
