# ESP32 RoIP System - Quick Start Guide

## 5-Minute Setup

Get your ESP32 RoIP system running in under 5 minutes with this quick start guide.

---

## What You Need

### Hardware
- **1x ESP32-S3 DevKit** (or any ESP32 variant) - ~$10
- **1x USB Cable** (micro-USB for programming)
- **1x Computer** (Windows, Mac, or Linux)
- **WiFi Network** (for device connection)

### Software
- **Python 3.8+** (for PlatformIO)
- **Git** (to clone the repository)
- **Text Editor** (VS Code recommended)

**Total Setup Time**: ~5 minutes (excludes downloads)

---

## Step 1: Hardware Setup (1 minute)

### Basic Pin Connections

Connect your ESP32 to a simple test audio setup:

```
ESP32 Pin Configuration:
┌─────────────────────────────────────────────┐
│  ESP32 GPIO                    Connected To │
├─────────────────────────────────────────────┤
│  GPIO 19 (DAC/PWM)      → Speaker / Audio Out
│  GPIO 35 (ADC0)         ← Microphone / Audio In
│  GPIO 27 (PTT)          ← Pushbutton (to GND)
│  GPIO 34 (COS)          ← External signal (low=active)
│  GPIO 14 (LED_STATUS)   → Status LED (via 330Ω resistor)
│  GPIO 15 (LED_TX)       → TX LED (via 330Ω resistor)
│  GPIO 32 (LED_RX)       → RX LED (via 330Ω resistor)
│  GND                    → Ground reference
│  5V                     → Power supply
└─────────────────────────────────────────────┘
```

### Audio Interface (Minimum)

For testing without radio equipment:

```
┌─────────────────────────────────┐
│    ESP32-S3 Development Board   │
│                                 │
│  ADC Input (GPIO 35)  → [optional microphone]
│  DAC Output (GPIO 19) → [optional speaker]
│  USB Power             → USB Cable to Computer
└─────────────────────────────────┘
```

**Note**: The ESP32 has limited 8-bit DAC. For better audio quality, use:
- External I2S DAC (UDA1334A or MAX98357A)
- PWM to analog filter circuit
- Audio interface IC

---

## Step 2: Install PlatformIO (1.5 minutes)

### Option A: Via Command Line (Recommended)

```bash
# Install PlatformIO CLI
pip install platformio

# Verify installation
pio --version
```

### Option B: Via VS Code (IDE)

1. Install VS Code from https://code.visualstudio.com/
2. Open VS Code → Extensions (left sidebar)
3. Search for "PlatformIO"
4. Click "Install" on "PlatformIO IDE"
5. Reload VS Code

---

## Step 3: Clone & Build (1.5 minutes)

### Clone the Repository

```bash
git clone https://github.com/MMDVM/MMDVM.git
cd MMDVM
```

### Build for Your Board

Choose your board type:

```bash
# For ESP32-S3 (RECOMMENDED - best feature support)
pio run -e esp32s3-roip

# For ESP32 (original)
pio run -e esp32-roip

# For ESP32-C3 (RISC-V variant)
pio run -e esp32c3-roip

# Debug build (verbose logging)
pio run -e esp32s3-roip -t upload --build-type=debug
```

### Upload & Monitor

```bash
# Upload to device and show serial output
pio run -e esp32s3-roip -t upload -t monitor

# Press Ctrl+C to exit serial monitor
```

---

## Step 4: Initial Configuration (1 minute)

### Access the Web Interface

Once the firmware boots, it creates a WiFi access point:

```
WiFi SSID:     RoIP-<DEVICE_ID>
WiFi Password: roip12345
```

**From your computer:**

1. Connect to the WiFi network above
2. Open web browser: http://192.168.4.1
3. You'll see the RoIP configuration dashboard

### Web Interface Overview

```
┌────────────────────────────────────────┐
│         RoIP Configuration Dashboard   │
├────────────────────────────────────────┤
│  [Status]  [WiFi]  [Audio]  [Network] │
├────────────────────────────────────────┤
│                                        │
│  Current Status:      INITIALIZING    │
│  WiFi Signal:         -45 dBm         │
│  CPU Usage:           25%             │
│  Memory:              287 KB / 512 KB │
│                                        │
│  [Configure]  [Restart]  [Update]    │
└────────────────────────────────────────┘
```

### Basic Configuration Steps

**1. WiFi Setup**
- Click "WiFi" tab
- Enter your home/office WiFi SSID
- Enter WiFi password
- Click "Save & Connect"

**2. Network Settings**
- Enter SIP Server address (or skip for local testing)
- Enter Device Name (optional)
- Click "Save"

**3. Audio Levels**
- Click "Audio" tab
- Speak into microphone
- Adjust "Input Gain" until signal is visible
- Click "Save"

**That's it!** Your device is now configured.

---

## Step 5: Test Point-to-Point Audio (Optional)

### Without Server (Local Testing)

The RoIP firmware supports direct P2P calls without a server:

```bash
# Device 1: Listen for incoming call
# (Device will wait for connection from Device 2)
# Status LED blinks slowly (ready to accept calls)

# Device 2: Initiate call
# Use web interface → Network → Call Settings
# Enter Device 1 IP address: 192.168.x.x
# Click "Start Call"

# Watch LED indicators:
# - Status LED: Breathing = Ready
# - RX LED: Blinks when receiving audio
# - TX LED: Blinks when sending audio
```

### LED Status Reference

```
LED Color Pattern          Meaning
─────────────────────────────────────────────
Status LED (Green):
  Solid                    WiFi disconnected
  Breathing                WiFi connected, ready
  Fast blink               Processing audio
  Slow blink               Idle

TX LED (Red):
  Off                      Not transmitting
  Solid                    Actively transmitting
  Blink                    PTT pending

RX LED (Blue):
  Off                      Not receiving
  Solid                    Actively receiving
  Blink                    RX activity
```

---

## Step 6: Connect to a Server (Optional)

### For Remote Connections

To connect to a RoIP server (requires server setup):

1. **Web Interface** → Network tab
2. **SIP Server Address**: `sip.example.com:5060`
3. **SIP Username**: Your assigned username
4. **SIP Password**: Your SIP account password
5. Click "Register"
6. Wait for "Registered" status

See [ROIP_SERVER_GUIDE.md](ROIP_SERVER_GUIDE.md) for server deployment.

---

## Troubleshooting Quick Fixes

### Problem: Can't find device WiFi

**Solution:**
1. Check USB cable is properly connected
2. Check device appears in Device Manager
3. Check if board already connected to a network
4. Restart device: unplug USB, wait 5 sec, replug

### Problem: Web interface very slow

**Solution:**
1. Move computer closer to device
2. Check WiFi signal strength (web interface shows -dBm)
3. Less than -70 dBm = too weak; move closer

### Problem: No audio output

**Solution:**
1. Check audio cable connections
2. Check volume level in web interface (Audio tab)
3. Check input level is not too low/high
4. Try 50% volume as starting point

### Problem: Can't upload firmware

**Solution:**
1. Check USB cable (try different cable/port)
2. Device should appear in Device Manager
3. Try: `pio run -e esp32s3-roip -t upload --verbose`
4. Check the port: `pio device list`

### Problem: Firmware crashes after upload

**Solution:**
1. This is normal on first boot - let it stabilize
2. Give device 2 minutes after upload
3. Watch serial output: `pio run -e esp32s3-roip -t monitor`
4. Should show "System Ready" or "Waiting for WiFi"

---

## What's Next?

### After Basic Setup

1. **Read Main Documentation**: [ROIP_README.md](ROIP_README.md)
2. **Setup Details**: [ROIP_CLIENT_GUIDE.md](ROIP_CLIENT_GUIDE.md)
3. **API Control**: [ROIP_API_REFERENCE.md](ROIP_API_REFERENCE.md)
4. **Troubleshooting**: [ROIP_TROUBLESHOOTING.md](ROIP_TROUBLESHOOTING.md)
5. **Server Setup**: [ROIP_SERVER_GUIDE.md](ROIP_SERVER_GUIDE.md)

### Common Next Steps

- **Configure PTT Hardware** → See ROIP_CLIENT_GUIDE.md
- **Deploy a RoIP Server** → See ROIP_SERVER_GUIDE.md
- **Integrate with Radio Equipment** → See Hardware Setup
- **Performance Tuning** → See ROIP_CLIENT_GUIDE.md "Optimization" section
- **Troubleshoot Issues** → See ROIP_TROUBLESHOOTING.md

---

## Development Tips

### Serial Monitor Output

The device logs detailed information on the serial port:

```bash
# Watch device logs in real-time
pio run -e esp32s3-roip -t monitor

# Expected startup sequence:
[I] [BOOT] System booting...
[I] [INIT] Initializing configuration manager
[I] [INIT] Initializing network manager
[I] [INIT] Initializing audio pipeline
[I] [INIT] Initializing DSP processor
[I] [INIT] Initializing Opus codec
[I] [INIT] Initializing RTP handler
[I] [INIT] Initializing SIP client
[I] [INIT] Initializing web server
[I] [MAIN] Starting WiFi access point: RoIP-XXXXX
[I] [MAIN] System ready. Web UI: http://192.168.4.1
```

### Firmware Environment Variables

Edit `roip-firmware/platformio.ini` for build options:

```ini
[env:esp32s3-roip]
board = esp32-s3-devkitc-1
framework = arduino

# Increase buffer sizes for higher quality
build_flags =
    -DAUDIO_BUFFER_SIZE=2048
    -DOPUS_BITRATE=32000
    -DDSP_ENABLED=1
    -DNOISE_SUPPRESSION=1

# Enable verbose logging
build_flags =
    -DDEBUG_ENABLED=1
    -DVERBOSE_LOGGING=1
```

### Common Build Configurations

```bash
# Minimal build (lower memory usage)
pio run -e esp32-roip -s SCons:minimal

# Full-featured build with all DSP
pio run -e esp32s3-roip -s SCons:full

# Debug build with extensive logging
pio run -e esp32s3-roip --build-type=debug

# Release build (optimized, no debug output)
pio run -e esp32s3-roip --build-type=release
```

---

## Useful Commands Reference

```bash
# Device management
pio device list                           # List connected devices
pio device monitor --port /dev/ttyUSB0    # Monitor specific device

# Build operations
pio run -e esp32s3-roip                   # Build firmware
pio run -e esp32s3-roip -t clean          # Clean build artifacts
pio run -e esp32s3-roip -t uploadfs       # Upload SPIFFS filesystem

# Debugging
pio run -e esp32s3-roip -t upload -vvv    # Very verbose upload
pio debug                                 # GDB debugging (with gdb)

# OTA Updates (over-the-air)
pio run -e esp32s3-roip -t upload --upload-port 192.168.1.100
```

---

## Next Steps Summary

| Goal | Guide |
|------|-------|
| Basic operation | ← You are here |
| Detailed client setup | [ROIP_CLIENT_GUIDE.md](ROIP_CLIENT_GUIDE.md) |
| Deploy a server | [ROIP_SERVER_GUIDE.md](ROIP_SERVER_GUIDE.md) |
| Control via API | [ROIP_API_REFERENCE.md](ROIP_API_REFERENCE.md) |
| Fix problems | [ROIP_TROUBLESHOOTING.md](ROIP_TROUBLESHOOTING.md) |
| Architecture details | [ROIP_DESIGN.md](ROIP_DESIGN.md) |

---

## Tips for Success

1. **Start Simple** - Get basic audio working before adding features
2. **Check Logs** - Always look at the serial monitor output
3. **Document Your Setup** - Write down your WiFi SSID, IP address, SIP server
4. **Use Stable WiFi** - 5GHz better than 2.4GHz if available
5. **Keep Cables Short** - Long cables pick up noise; use shielded audio cables
6. **Monitor Heat** - ESP32 should be warm but not hot during operation
7. **Check Power** - Use good quality USB power supply (≥1A)

---

## Frequently Asked Questions

**Q: What's the difference between ESP32, ESP32-S3, and ESP32-C3?**
- **ESP32**: Original, mature, mature driver support
- **ESP32-S3**: Recommended - better RAM, USB support, more GPIO
- **ESP32-C3**: RISC-V based, excellent WiFi, but fewer libraries

**Q: How do I update the firmware later?**
- Use OTA (Over-the-Air) update via web interface
- Or: Upload via USB as described above

**Q: Can I use this with my radio equipment?**
- Yes! Connect audio input/output to your radio
- Configure PTT output to control radio transmitter
- See ROIP_CLIENT_GUIDE.md for detailed hardware setup

**Q: What's the audio quality like?**
- Opus codec at 24-32 kbps provides near-transparent quality
- Comparable to professional RoIP systems
- Depends on WiFi network quality

**Q: Can I run two devices at once?**
- Yes! Each device can independently connect to servers or each other
- No limit to number of devices (other than server capacity)

---

## Support & Resources

- **Stuck?** Check [ROIP_TROUBLESHOOTING.md](ROIP_TROUBLESHOOTING.md)
- **Want details?** Read [ROIP_CLIENT_GUIDE.md](ROIP_CLIENT_GUIDE.md)
- **More info?** See [ROIP_README.md](ROIP_README.md)
- **Need API docs?** Check [ROIP_API_REFERENCE.md](ROIP_API_REFERENCE.md)

---

**Congratulations!** Your ESP32 RoIP system is now running!

Next: Read [ROIP_CLIENT_GUIDE.md](ROIP_CLIENT_GUIDE.md) for detailed configuration options.

---

**Last Updated**: November 2025
**For Technical Details**: See [ROIP_DESIGN.md](ROIP_DESIGN.md)
