# ESP32 RoIP Client - Complete Setup Guide

Comprehensive guide for configuring the ESP32 RoIP client firmware and hardware.

---

## Table of Contents

1. [Hardware Setup](#hardware-setup)
2. [Firmware Installation](#firmware-installation)
3. [Initial Configuration](#initial-configuration)
4. [WiFi Configuration](#wifi-configuration)
5. [Audio Configuration](#audio-configuration)
6. [Network & SIP Setup](#network--sip-setup)
7. [PTT/COS Controller Setup](#pttcos-controller-setup)
8. [Performance Tuning](#performance-tuning)
9. [OTA Updates](#ota-updates)
10. [Backup & Recovery](#backup--recovery)

---

## Hardware Setup

### Recommended ESP32 Variants

| Board | Type | RAM | Flash | WiFi | ADC | DAC | Cost | Notes |
|-------|------|-----|-------|------|-----|-----|------|-------|
| **ESP32-S3-DevKitC-1** | Xtensa | 512 KB | 8 MB | 802.11n | 2x 12-bit | None | $12-15 | **BEST** - USB, plenty of RAM |
| ESP32-DevKitC | Xtensa | 520 KB | 4 MB | 802.11n | 2x 12-bit | 2x 8-bit | $8-10 | Original, mature |
| ESP32-C3-DevKitC | RISC-V | 400 KB | 4 MB | 802.11 | 2x 12-bit | None | $8-10 | Modern, RISC-V |
| ESP32-C6-DevKitC | RISC-V | 512 KB | 8 MB | WiFi 6 | 2x 12-bit | None | $15-18 | Latest, WiFi 6 |

**Recommendation**: Use **ESP32-S3** for best results.

### Audio Interface Hardware

#### Minimum Setup (No External Components)

```
Radio Equipment          ESP32
┌────────────┐          ┌──────────────┐
│ Audio Out  │─────────→│ GPIO 35 (ADC)│
│ Audio In   │←─────────│ GPIO 19 (DAC)│
│ PTT Ground │─────────→│ GPIO 27 + GND│
│ COS Signal │←─────────│ GPIO 34      │
└────────────┘          └──────────────┘
```

**Issues**: Limited audio quality, 8-bit DAC noise

#### Recommended Setup (External DAC)

```
Radio Equipment          I2S DAC              ESP32
┌────────────┐    ┌──────────────┐    ┌──────────────┐
│ Audio Out  │───→│ DAC Input    │    │              │
│ Audio In   │←───│ DAC Output   │←───│ GPIO 23 (SCK)│
│ PTT        │    │              │    │ GPIO 22 (WS) │
│ COS Signal │    │              │    │ GPIO 21 (SD) │
└────────────┘    └──────────────┘    └──────────────┘
```

**Chips**:
- **UDA1334A** (TI) - ~$10, simple, good quality
- **MAX98357A** (Maxim) - ~$8, high power
- **WM8960** (Wolfson) - More complex, excellent quality

#### Advanced Setup (Preamp & EQ)

```
┌─────────────────────────────────────────────┐
│  Radio Equipment                            │
├─────────────────────────────────────────────┤
│  Speaker Out  │  Mic In  │  PTT  │  COS    │
│      │        │    │     │       │         │
│      ▼        ▼    │     │       │         │
│  ┌─────────────┐   │     │       │         │
│  │  Preamp     │   │     │       │         │
│  │  + EQ       │   │     │       │         │
│  │  + AGC      │   │     │       │         │
│  └─────────────┘   │     │       │         │
│        │           │     │       │         │
│        ▼           ▼     │       │         │
│  ┌──────────────────────┐│       │         │
│  │   I2S Audio Codec    ││       │         │
│  │  (UDA1334A, etc)     ││       │         │
│  └──────────────────────┘│       │         │
│        │                 │       │         │
│        ▼                 ▼       ▼         ▼
│  ┌──────────────────────────────────────┐
│  │         ESP32 (All GPIO)             │
│  └──────────────────────────────────────┘
```

### Pin Configuration

#### Default Pin Mapping

```c
// Core Audio Pins
#define PIN_ADC_RX      35  // GPIO35 - Audio input (ADC1)
#define PIN_DAC_TX      19  // GPIO19 - Audio output (8-bit DAC)
#define PIN_I2S_SCK     23  // GPIO23 - I2S Serial Clock (if using I2S)
#define PIN_I2S_WS      22  // GPIO22 - I2S Word Select
#define PIN_I2S_SD      21  // GPIO21 - I2S Serial Data

// Control Pins
#define PIN_PTT         27  // GPIO27 - Push-to-Talk output
#define PIN_COS         34  // GPIO34 - Carrier Operated Squelch input
#define PIN_VOX_IN      39  // GPIO39 - Voice detection signal

// Status Indicators
#define PIN_LED_STATUS  14  // GPIO14 - Status LED (breathing pattern)
#define PIN_LED_TX      15  // GPIO15 - TX indicator (solid when transmitting)
#define PIN_LED_RX      32  // GPIO32 - RX indicator (blink on receive)

// Serial Debug
#define PIN_UART_TX      1  // UART0 TX
#define PIN_UART_RX      3  // UART0 RX (Note: GPIO3 = USB D-)
```

#### Custom Pin Configuration

Edit `roip-firmware/include/config.h`:

```cpp
// Custom pin mapping for your board
#define PIN_ADC_RX      35    // Change to your GPIO
#define PIN_DAC_TX      19
#define PIN_PTT         27
#define PIN_COS         34
#define PIN_LED_STATUS  14

// Then rebuild:
// pio run -e esp32s3-roip -t clean
// pio run -e esp32s3-roip
```

### Physical Connections

#### Breadboard Setup (Testing)

```
┌─────────────────────────────────────────┐
│   ESP32-S3 DevKit                       │
│  ┌──────────────────────────────────┐  │
│  │GND  •  •  •  •  •  •  •  •  •  5V│  │
│  │GPIO0                              │  │
│  │GPIO1(TX)                          │  │
│  │GPIO2                              │  │
│  │GPIO3(RX)                          │  │
│  │GPIO4                              │  │
│  │GPIO5                              │  │
│  │GPIO6-GPIO8 (Strapping)            │  │
│  │GPIO9-GPIO10 (SPI PSRAM)           │  │
│  │GPIO11-GPIO13 (SPI Flash)          │  │
│  │GPIO14 ──→ [R 330Ω] ──→ LED_GND   │  │
│  │GPIO15 ──→ [R 330Ω] ──→ LED_GND   │  │
│  │GPIO19 ──→ to DAC/Audio Out       │  │
│  │GPIO21 ──→ I2S SD                  │  │
│  │GPIO22 ──→ I2S WS                  │  │
│  │GPIO23 ──→ I2S SCK                 │  │
│  │GPIO27 ──→ PTT Control             │  │
│  │GPIO32 ──→ [R 330Ω] ──→ LED_GND   │  │
│  │GPIO34 ──→ COS Input (via divider) │  │
│  │GPIO35 ──→ ADC Input (via divider) │  │
│  │GPIO39 ──→ (Strapping - careful)   │  │
│  │GND                                │  │
│  └──────────────────────────────────┘  │
│                                         │
│  Separate breadboards:                  │
│  - Audio interface (DAC or I2S codec)  │
│  - Power distribution                   │
│  - Level shifting (if needed)           │
└─────────────────────────────────────────┘
```

#### Level Shifting (if Required)

Radio equipment usually operates at different voltage levels:

```
Radio (3.3V logic)       Level Shifter        ESP32 (3.3V)
┌──────────────┐      ┌────────────────┐    ┌──────────────┐
│ Audio Out    │─────→│ HV ↔ LV        │───→│ GPIO 35 ADC  │
│ Audio In     │←─────│ Bidirectional  │←───│ GPIO 19 DAC  │
│ PTT Out      │─────→│                │───→│ GPIO 27 PTT  │
│ COS In       │←─────│ (e.g., TXS0108)│←───│ GPIO 34 COS  │
└──────────────┘      └────────────────┘    └──────────────┘
```

**Note**: If both are 3.3V, no level shifter needed.

---

## Firmware Installation

### Build Prerequisites

```bash
# Install Python (if not already)
python3 --version  # Should be 3.8+

# Install PlatformIO
pip install platformio --upgrade

# Verify installation
pio --version
```

### Clone Repository

```bash
git clone https://github.com/MMDVM/MMDVM.git
cd MMDVM
```

### Build Firmware

```bash
# Choose your board
pio run -e esp32s3-roip        # ESP32-S3 (RECOMMENDED)
pio run -e esp32-roip          # Original ESP32
pio run -e esp32c3-roip        # ESP32-C3

# Verbose build (see compiler output)
pio run -e esp32s3-roip -v

# Clean rebuild (if issues)
pio run -e esp32s3-roip -t clean
pio run -e esp32s3-roip
```

### Upload Firmware

```bash
# Simple upload (autodetects port)
pio run -e esp32s3-roip -t upload

# Specify port explicitly
pio run -e esp32s3-roip -t upload --upload-port /dev/ttyUSB0

# Upload and show serial output
pio run -e esp32s3-roip -t upload -t monitor

# Set baud rate for monitor (if needed)
pio run -e esp32s3-roip -t monitor --monitor-baud 115200
```

### Monitor Serial Output

```bash
# Watch the device startup
pio device monitor

# Filter output (example: only show errors)
pio device monitor | grep -E "ERROR|WARN"

# Record to file
pio device monitor > device_log.txt &
```

### Troubleshooting Upload Issues

```bash
# List detected devices
pio device list

# Check USB permissions (Linux)
ls -la /dev/ttyUSB*
sudo usermod -aG dialout $USER

# Erase flash and restart
esptool.py --port /dev/ttyUSB0 erase_flash

# Check USB cable
# - Try different USB cable
# - Try different USB port
# - Try different computer if possible
```

---

## Initial Configuration

### First Boot Sequence

```
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
[I] [MAIN] AP IP: 192.168.4.1
[I] [MAIN] System ready. Web UI: http://192.168.4.1
[I] [MAIN] Default credentials: admin / roip12345
```

### Default WiFi Access Point

```
SSID:         RoIP-<DEVICE_ID>
Password:     roip12345
IP Address:   192.168.4.1
DHCP:         Enabled (clients get 192.168.4.2+)
```

### Web Interface Access

1. Connect to the WiFi AP above
2. Open browser: `http://192.168.4.1`
3. Login with default credentials: `admin / roip12345`
4. You should see the dashboard

---

## WiFi Configuration

### Connect to Home Network

**Via Web Interface:**

1. Open http://192.168.4.1
2. Click "Network" or "WiFi" tab
3. Enter:
   - SSID: Your WiFi network name
   - Password: Your WiFi password
   - Security: WPA2/WPA3
4. Click "Save & Connect"
5. Device will reboot and connect to your network
6. Find new IP on your router: Open router admin (192.168.1.1)

**Via Serial Command:**

```
# Connect to device's AP first, then via serial:
wifi_connect SSID password WPA2
```

### Static IP Configuration

**Via Web Interface:**
1. Network tab → IPv4 Settings
2. Toggle "DHCP" to OFF
3. Set:
   - IP Address: 192.168.1.100
   - Subnet Mask: 255.255.255.0
   - Gateway: 192.168.1.1
   - DNS 1: 8.8.8.8
   - DNS 2: 8.8.4.4
4. Click "Save & Reboot"

### Signal Strength Optimization

```
WiFi Signal Strength Guide:
  -30 dBm  Excellent (5 meters, line of sight)
  -50 dBm  Very Good (normal home use)
  -70 dBm  Good (weak but functional)
  -80 dBm  Fair (may have disconnects)
  -90 dBm  Poor (frequent drops)
  <-100 dBm Too weak to use

Better signal:
  1. Move closer to router
  2. Reduce obstacles (walls, metal)
  3. Use 5GHz band if supported (less interference)
  4. Change WiFi channel (use WiFi analyzer app)
  5. Upgrade antenna (optional)
```

---

## Audio Configuration

### Input Level Setup

```
Optimal Input Levels:
  Too Low:      Signal barely moves, can't hear faint transmissions
  Optimal:      Signal moves 50-80%, peaks don't hit 100%
  Too High:     Signal peaks hit 100%, causes distortion/clipping

Adjustment:
  - Use Input Gain slider (typically 0-40 dB)
  - Speak at normal volume into microphone
  - Adjust until signal is in green zone on meter
  - Check "Clip Indicator" for signs of distortion
```

**Via Web Interface:**

1. Audio tab
2. Speak into microphone
3. Watch the "Input Level" meter
4. Adjust "Input Gain" slider
5. Target: -12 to -3 dB on meter (not clipping)
6. Click "Save"

### Output Level Setup

```
Output Configuration:
  Output Gain:  0-40 dB (controls speaker/TX audio volume)
  De-emphasis:  Apply radio-standard 6dB/octave roll-off
  Limiter:      Prevent clipping at output stage

Initial Settings:
  Output Gain:  0 dB (start here, adjust as needed)
  De-emphasis:  Enabled (for radio compatibility)
  Limiter:      Enabled (safety feature)
```

**Via Web Interface:**

1. Audio tab → Output Settings
2. Set Output Gain: 0 dB initially
3. Enable De-emphasis (usually required)
4. Enable Limiter (protects equipment)
5. Make a test call or use test audio
6. Adjust Output Gain until audio is at desired level
7. Click "Save"

### DSP Processing

**Noise Suppression:**

```
Option                Detail
─────────────────────────────────────────────
Off                   No processing (baseline)
Light                 -5 dB noise reduction
Medium                -10 dB noise reduction (DEFAULT)
Heavy                 -15 dB noise reduction
RNNoise               AI-based (best quality, ~5% CPU)
```

**Via Web Interface:**
1. Audio tab → DSP Settings
2. Noise Suppression: Select "Medium" or "RNNoise"
3. Click "Save & Apply"

**AGC (Automatic Gain Control):**

```
AGC Settings:
  - Target Level: -18 dBFS (comfortable listening level)
  - Max Gain: 40 dB (maximum boost)
  - Attack Time: 20 ms (how fast to react)
  - Release Time: 200 ms (how fast to back off)
```

**EQ (Parametric Equalizer):**

```
Typical Radio Voice EQ (Smile Curve):
  100 Hz:   +3 dB   (low end warmth)
  500 Hz:   -2 dB   (mud reduction)
  1 kHz:    -3 dB   (presence valley)
  3 kHz:    +5 dB   (presence peak)
  6 kHz:    +2 dB   (clarity)
  10 kHz:   0 dB    (top end)
```

---

## Network & SIP Setup

### Local Network Testing (No Server)

```
Device 1 (Receiver):           Device 2 (Caller):
1. Get its IP: 192.168.1.100   1. Get its IP: 192.168.1.101
2. Start "Listen"              2. In Network tab
3. LED goes to ready           3. Enter IP: 192.168.1.100
4. Wait for call               4. Click "Call"
5. Audio flows automatically   5. LED indicates TX
```

### SIP Server Registration

**Configuration Required:**
1. SIP Server Address (hostname or IP)
2. SIP Port (usually 5060)
3. Username (your SIP username)
4. Password (your SIP password)
5. Display Name (optional, for caller ID)

**Via Web Interface:**

1. Network tab → SIP Settings
2. Enable: Toggle "Enable SIP"
3. Server Address: sip.example.com
4. Server Port: 5060
5. Username: your_username
6. Password: your_password
7. Display Name: "My RoIP Device" (optional)
8. SIP Port: 5060 (local port, usually leave default)
9. Click "Save & Register"
10. Check Status: Should show "Registered" or "Registering"

### Proxy Configuration (if behind CGNAT)

```
CGNAT / Firewall setup:
  1. Get public IP from server operator
  2. Server provides TURN credentials
  3. Configure in RoIP device:
     - TURN Server: turn.example.com:3478
     - TURN Username: your_user
     - TURN Password: your_password
  4. Device will route all audio through TURN relay
```

**Via Web Interface:**

1. Network tab → NAT/TURN Settings
2. Enable: Toggle "Use TURN Relay"
3. TURN Server: turn.example.com:3478
4. TURN Username: (from server)
5. TURN Password: (from server)
6. Click "Save"

### Authentication Types

```
Digest Authentication (Default):
  - Username & password in SIP REGISTER
  - Server sends challenge
  - Device computes response
  - Works through firewalls
  - Standard for SIP

Basic Authentication (Legacy):
  - Username & password sent in clear
  - Not recommended for security
  - Rarely used in modern systems
```

---

## PTT/COS Controller Setup

### PTT (Push-to-Talk) Configuration

```
PTT Operation:
  1. User presses physical button
  2. GPIO 27 pulls to GND (active low)
  3. Device signals SIP INVITE to destination
  4. Audio TX starts after "PTT Delay"
  5. User releases button
  6. Audio TX stops + "TX Tail Delay"
  7. Call ends after "Hang Time"

Timing Parameters:
  - PTT Delay: 0-500 ms (delay before TX starts)
  - TX Tail Delay: 100-1000 ms (delay after release)
  - Hang Time: 0-5000 ms (keep call active)
```

**Configuration:**

1. Web Interface → Control tab
2. PTT Settings:
   - PTT Delay: 50 ms (typical)
   - TX Tail Delay: 200 ms (standard)
   - Hang Time: 2000 ms (2 seconds)
3. Click "Save"

### COS (Carrier Operated Squelch) Setup

```
COS Purpose:
  - Detect incoming signal from radio RX
  - Active = carrier present (RX audio coming in)
  - Inactive = no carrier (squelch)
  - GPIO 34 input (active low, pulled low when carrier present)

Operating Modes:
  - COS Only: Use physical COS signal
  - VOX Only: Voice-activated (no COS needed)
  - COS + VOX: Use COS if available, fall back to VOX
  - VOX + COS: Use both, either can trigger TX

Typical Sequence:
  1. RX detects signal (COS goes low)
  2. Device detects COS change
  3. Starts recording RX audio
  4. Continues while COS is active
  5. When COS goes high, sends audio to network
```

**Configuration:**

1. Web Interface → Control tab
2. RX Settings:
   - COS Mode: COS Input / VOX / COS+VOX
   - COS Polarity: Active Low (default)
   - COS Debounce: 50 ms
3. Click "Save"

### VOX (Voice Operated Transmission) Setup

```
VOX Parameters:
  - VOX Sensitivity: 1-10 (lower = more sensitive)
  - VOX Holdover: 0-5000 ms (how long to keep TX after silence)
  - VOX Threshold: -40 to -10 dBFS

Typical Configuration:
  Sensitivity: 5 (medium)
  Holdover: 1000 ms (1 second)
  Threshold: -20 dBFS
```

**Testing VOX:**

1. Enable VOX in Control tab
2. Speak into microphone
3. Watch TX LED - should light when you speak
4. Wait after speaking - should turn off after holdover time
5. Adjust Sensitivity if needed

### PTT Button Hardware

**Momentary Switch Wiring:**

```
Push Button (normally open):
  One terminal → GPIO 27
  Other terminal → GND
  Press button → GPIO 27 shorts to GND → PTT active

Optional: Add debouncing capacitor:
  GPIO 27 ──[100K]──┐
                    ├─ to GND (via switch)
                    │
              ┌─[0.1µF]
              │
             GND
```

**Testing PTT:**

1. Press button
2. Listen to TX LED
3. Should light up when button pressed
4. Web interface should show "PTT: Active"
5. Release button to stop TX

---

## Performance Tuning

### Latency Optimization

```
Latency Sources (typical):
  - WiFi packet transmission: 5-20 ms
  - Audio buffering: 20-40 ms
  - Jitter buffer: 20-100 ms
  - Processing: 5-10 ms
  - Network propagation: 50-200+ ms
  ─────────────────────────
  Total: 100-300 ms (acceptable)

Optimization Steps:
  1. Reduce buffer sizes (faster = lower latency)
  2. Use 20ms frame size (vs 40/60ms)
  3. Reduce Opus complexity (trades quality for speed)
  4. Move WiFi router closer
  5. Use 5GHz band if possible
  6. Check for WiFi interference (WiFi analyzer)
```

**Configuration Changes:**

Edit `roip-firmware/include/config.h`:

```cpp
// Audio latency tuning
#define AUDIO_FRAME_SIZE    480     // 20ms @ 24kHz (smaller = lower latency)
#define RTP_JITTER_BUF_SIZE 2000    // in ms (smaller = lower latency)
#define AUDIO_BUFFER_SIZE   1024    // Ring buffer samples

// Rebuild:
pio run -e esp32s3-roip -t clean
pio run -e esp32s3-roip
```

### Bandwidth Optimization

```
Opus Bitrate Selection:
  - 8 kbps:  Narrowband, intelligible but low quality
  - 16 kbps: Wideband, good for radio (Default)
  - 24 kbps: Wideband, high quality
  - 32 kbps: Full bandwidth, transparent
  - 48 kbps: CD quality

Bandwidth Calculation:
  Audio: 16 kbps
  + RTP/UDP/IP overhead: 12 kbps
  + WiFi MAC overhead: 4 kbps
  ───────────────
  Total: ~32 kbps per direction

For multiple channels: multiply by channels
```

**Change Bitrate:**

1. Web Interface → Audio tab → Advanced
2. Opus Bitrate: Select 16, 24, or 32 kbps
3. Codec Complexity: 5-7 (quality vs CPU tradeoff)
4. Click "Save"

### CPU Usage Monitoring

```
Monitor CPU in Web Interface:
  - Real-time CPU %
  - Task breakdown
  - Memory usage
  - Temperature

Target: <80% usage leaves headroom for WiFi, etc.

If CPU >90%:
  - Reduce Opus complexity
  - Disable RNNoise (use Speex instead)
  - Disable advanced DSP filters
  - Reduce sampling rate if possible
  - Use smaller frame sizes
```

### Memory Optimization

```
Memory Layout (ESP32-S3):
  Total: 512 KB
  Used: ~320 KB (63%)
  Free: ~192 KB (37%)

If low memory:
  - Reduce audio buffer sizes
  - Disable features (DTMF, recording, etc)
  - Use lite Opus preset
  - Reduce SIP history size
```

---

## OTA Updates

### Prepare Binary

```bash
# Build release binary
pio run -e esp32s3-roip --build-type=release

# Binary location
# .pio/build/esp32s3-roip/firmware.bin

# Get file size
ls -lh .pio/build/esp32s3-roip/firmware.bin
```

### Upload via Web Interface

1. Web Interface → Settings tab
2. Firmware Update section
3. Choose file: firmware.bin
4. Click "Upload & Flash"
5. Progress bar shows upload status
6. Device reboots automatically
7. Wait ~30 seconds for reboot

### Upload via REST API

```bash
# Get authentication token first
TOKEN=$(curl -X POST http://device-ip:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password"}' \
  | jq -r '.token')

# Upload firmware
curl -X POST http://device-ip:8080/api/ota/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@firmware.bin"
```

### Upload via Command Line

```bash
# OTA upload (device must be on network)
pio run -e esp32s3-roip -t upload --upload-port 192.168.1.100

# Monitor after upload
pio device monitor --port 192.168.1.100
```

### Rollback Previous Firmware

```bash
# Device keeps previous firmware in partition
# Access via web interface: Settings → Recovery
# Or via serial console: recovery boot
# Useful if new firmware has issues
```

---

## Backup & Recovery

### Configuration Backup

```bash
# Via Web Interface
Settings → Backup/Restore → Download Config

# Via REST API
curl http://device-ip/api/v1/config/backup \
  -H "Authorization: Bearer $TOKEN" \
  > config_backup.json
```

### Configuration Restore

```bash
# Via Web Interface
Settings → Backup/Restore → Upload Config
Select config_backup.json file

# Via REST API
curl -X POST http://device-ip/api/v1/config/restore \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@config_backup.json"
```

### Factory Reset

**Via Web Interface:**
1. Settings → Advanced → Factory Reset
2. Confirm warning
3. Device erases all settings and reboots
4. Returns to default AP mode

**Via Serial Command:**
```
factory_reset
# Device will reboot and reset
```

**Via Hardware Reset:**
```
If device is unresponsive:
1. Disconnect power
2. Hold BOOT button
3. Connect power (keep holding BOOT)
4. Hold for 5 seconds
5. Release BOOT button
6. Device boots into download mode (for flashing)
```

---

## Troubleshooting

### Common Issues

**Problem: Can't connect to web interface**

```
Diagnostic steps:
1. Check LED indicators:
   - Status LED should be breathing (ready)
   - If solid red = not connected

2. Check WiFi:
   - On Windows: ipconfig /all
   - On Mac: ifconfig | grep inet
   - On Linux: ip addr
   - Look for "192.168.1.x" address

3. Test connectivity:
   - ping 192.168.1.x
   - tracert 192.168.1.x (Windows)
   - traceroute 192.168.1.x (Mac/Linux)

4. Check web interface:
   - Try http://192.168.1.x (no https)
   - Try 192.168.4.1 (device AP)
   - Try device hostname: http://roip-xxxxx.local
```

**Problem: Audio is cutting out**

```
Likely causes:
1. WiFi signal too weak
   - Check dBm (should be > -70)
   - Move closer to router

2. Network congestion
   - Stop other downloads/streaming
   - Check router for other devices

3. Buffer underflow
   - Increase jitter buffer size
   - Increase Opus bitrate

4. DSP overload
   - Reduce codec complexity
   - Disable advanced filters
```

**Problem: High latency / delayed audio**

```
Optimization steps:
1. Reduce audio frame size (20ms)
2. Reduce jitter buffer (min 20ms)
3. Lower Opus complexity
4. Reduce DSP processing
5. Check WiFi channel (use analyzer)
6. Move router closer
7. Use wired connection if possible (via bridge)
```

### Diagnostic Logs

```bash
# Enable verbose logging
# Settings → Debug → Enable Verbose Logging

# View logs in web interface
Settings → Logs → Live Log

# Or via serial console
pio device monitor --port /dev/ttyUSB0
```

---

## Advanced Topics

### Custom Build Configuration

Edit `roip-firmware/platformio.ini`:

```ini
[env:esp32s3-roip-custom]
extends = esp32s3-roip

build_flags =
    -DAUDIO_BUFFER_SIZE=2048
    -DOPUS_BITRATE=24000
    -DOPUS_COMPLEXITY=7
    -DDSP_ENABLED=1
    -DNOISE_SUPPRESSION=1
    -DENABLE_DTMF=1
    -DENABLE_VOX=1
    -DDEBUG_ENABLED=0
```

### Performance Profiling

```bash
# Build with profiling enabled
pio run -e esp32s3-roip -s SCons:profile

# View profiling data
pio run -e esp32s3-roip -t profile_report
```

### Hardware SPI Configuration

For advanced users connecting external SPI devices:

```cpp
// In config.h
#define SPI_CLOCK_SPEED 10000000  // 10 MHz
#define SPI_MODE        SPI_MODE0
#define CS_PIN          5
```

---

## Next Steps

- [Quick Start Guide](ROIP_QUICKSTART.md)
- [API Reference](ROIP_API_REFERENCE.md)
- [Server Deployment](ROIP_SERVER_GUIDE.md)
- [Troubleshooting](ROIP_TROUBLESHOOTING.md)
- [Technical Design](ROIP_DESIGN.md)

---

**Last Updated**: November 2025
**Version**: 1.0
