# ESP32 RoIP - Troubleshooting Guide

Comprehensive troubleshooting guide for common issues and solutions.

---

## Table of Contents

1. [Startup Issues](#startup-issues)
2. [WiFi Connectivity](#wifi-connectivity)
3. [SIP Registration](#sip-registration)
4. [Audio Issues](#audio-issues)
5. [Call Quality](#call-quality)
6. [Network Problems](#network-problems)
7. [Hardware Issues](#hardware-issues)
8. [Performance Issues](#performance-issues)
9. [Server Issues](#server-issues)
10. [Diagnostic Tools](#diagnostic-tools)

---

## Startup Issues

### Device Won't Boot

**Symptoms**: No LED activity, no serial output, device doesn't respond

**Checklist**:
1. Check power supply
   ```bash
   # Verify voltage with multimeter
   # Should be 5V ± 0.5V between GND and 5V pin
   ```
2. Check USB cable (try different cable/port)
3. Check LED connection (backwards polarity?)
4. Check for burns/damage on board

**Solutions**:

```bash
# 1. Try erasing flash completely
esptool.py --port /dev/ttyUSB0 erase_flash

# 2. Try minimal firmware upload
pio run -e esp32s3-roip -t erase
pio run -e esp32s3-roip -t upload

# 3. Try different USB port
pio device list

# 4. Force bootloader mode (manual reset)
# Hold BOOT button, click RST, then release BOOT
# Should appear in device list

# 5. Check board selection
# Verify platformio.ini has correct board defined
```

### Device Boots But Crashes Immediately

**Symptoms**: Serial shows boot messages, then watchdog reset loop

**Watchdog Reset Pattern**:
```
[I] [BOOT] System booting...
[I] [INIT] Initializing components...
[E] [WATCHDOG] Timeout! Resetting...
[I] [BOOT] System booting...  <- REPEATING
```

**Solutions**:

```cpp
// Edit roip-firmware/src/main.cpp
// Temporarily disable watchdog during development:
#define ENABLE_WATCHDOG false  // Change to true in production

// Rebuild:
pio run -e esp32s3-roip -t clean
pio run -e esp32s3-roip

// This gives you time to debug startup issues
```

**Common Causes**:
- Out of memory (check serial output for "out of memory")
- Corrupt configuration stored in flash
- Missing dependencies or libraries

**Try factory reset**:
```bash
# Via web interface: Settings → Factory Reset
# Or via serial: factory_reset command
# Or erase NVS partition:
esptool.py --port /dev/ttyUSB0 erase_region 0x9000 0x6000
```

### Serial Output Shows Garbled Text

**Symptoms**: `▶▶▶ EE88 11▼▼` instead of readable text

**Causes**:
- Wrong baud rate
- USB cable issues
- Corrupted UART configuration

**Solutions**:

```bash
# Try different baud rates
pio device monitor --monitor-baud 115200
pio device monitor --monitor-baud 230400
pio device monitor --monitor-baud 460800

# Or manually:
screen /dev/ttyUSB0 115200

# Try different USB cable (some cables are power-only)

# Reset UART config in firmware:
# Check include/config.h for correct UART pins
# Rebuild with verbose output:
pio run -e esp32s3-roip -v
```

---

## WiFi Connectivity

### Can't Find WiFi AP

**Symptoms**: AP "RoIP-XXXXX" doesn't appear in WiFi list

**Checklist**:
1. Device powered on (check LED)
2. Give device 30 seconds after boot
3. Check if AP is on 5GHz (some devices don't support)
4. Check range (move closer to device)
5. Check for MAC filtering on router

**Solutions**:

```bash
# Check device is actually booting:
pio device monitor

# Expected output should show:
# [I] [MAIN] Starting WiFi access point: RoIP-XXXXX

# If AP not starting, check NVS is clean:
esptool.py --port /dev/ttyUSB0 erase_region 0x9000 0x6000

# Rebuild and upload
pio run -e esp32s3-roip -t upload

# Check WiFi is enabled in config:
# Settings tab in web interface → WiFi Settings
```

### Connected to WiFi AP, but No Internet

**Symptoms**: Can see AP in WiFi list, password works, but can't ping router

**Checklist**:
1. Is AP really the router's network, or device's own AP?
2. Check IP address assigned
3. Check gateway address
4. Check if other devices can connect to this WiFi

**Solutions**:

```bash
# From connected device (laptop/phone):
# Windows
ipconfig /all          # Look for "RoIP" and check IP, Gateway

# Mac/Linux
ifconfig | grep -A 10 "RoIP"
# Or
ip addr show | grep -A 5 "wlan0"

# Try to ping device
ping 192.168.4.1      # Should work if connected to AP

# Try to ping router (if device connected to home WiFi)
# From device: Settings → Advanced → Network Diagnostics
# Or via API: curl http://device-ip/api/v1/network/quality
```

### Can't Connect to Home WiFi

**Symptoms**: Device tries to connect, gets "Authentication Failed" or times out

**Checklist**:
1. Correct SSID? (case-sensitive)
2. Correct password? (try without special characters first)
3. WiFi security type: WPA2 or WPA3?
4. Is MAC filtering enabled on router?
5. Is WiFi band 2.4GHz or 5GHz? (Some ESP32 variants only support 2.4GHz)

**Solutions**:

```bash
# Try connecting via CLI
# (Device must be in AP mode first)
wifi_connect "SSID_NAME" "PASSWORD" WPA2

# If special characters in password, try without first
wifi_connect "MyNetwork" "simplepassword" WPA2

# For WPA3:
wifi_connect "MyNetwork" "password" WPA3

# Try 2.4GHz band explicitly
wifi_connect "Network_2.4G" "password" WPA2

# Reset WiFi and try again
Settings → WiFi → Forget Network
Then reconnect

# Check router logs for rejected connections
# Look for device MAC: aa:bb:cc:dd:ee:ff (from About page)
```

### Device Keeps Disconnecting from WiFi

**Symptoms**: Connects momentarily, then drops. Repeating connection attempts

**Common Causes**:
- WiFi signal too weak (-70 dBm or less)
- Interference (microwave, cordless phone, router on bad channel)
- Router stability issues
- Power supply issues
- Too many devices on network

**Solutions**:

```bash
# 1. Move device closer to router
# Check signal strength: Settings → Network → WiFi Signal
# Target: -50 dBm or better

# 2. Check WiFi channel
# Use WiFi analyzer app on phone:
# Android: WiFi Analyzer (farproc.com)
# iPhone: WiFi Sweet Spots
# Look for less congested channel

# 3. Change router WiFi channel
# Router admin: 192.168.1.1 → WiFi Settings
# 2.4GHz: Try channels 1, 6, or 11
# 5GHz: Try auto or specific channel

# 4. Check power supply quality
# Multimeter: Should be steady 5.0V
# Try different USB power supply
# Avoid USB hubs (connect directly)

# 5. Update device firmware
# Settings → Firmware Update

# 6. Factory reset (last resort)
# Settings → Advanced → Factory Reset
```

---

## SIP Registration

### SIP Registration Fails

**Symptoms**: Shows "Not Registered" in Status, or times out

**Checklist**:
1. Is server address reachable?
2. Is SIP port correct (usually 5060)?
3. Are credentials correct?
4. Is server actually running?
5. Are firewall rules allowing SIP?

**Solutions**:

```bash
# 1. Test server connectivity
ping sip.example.com           # Should respond

# 2. Test SIP port
nc -zu sip.example.com 5060    # Should show response
nmap -sU sip.example.com -p 5060

# 3. Check credentials in device
Settings → Network → SIP Settings
Verify: Server, Username, Password

# 4. Check server logs
# Docker: docker-compose logs roip-api | grep -i register
# Manually: tail -f /var/log/roip/sip.log

# 5. Enable debug logging on device
Settings → Debug → Verbose Logging

# 6. Watch serial output
pio device monitor
# Look for lines like:
# [SIP] Sending REGISTER to sip.example.com:5060
# [SIP] Received: 401 Unauthorized (auth required)
# [SIP] Registered successfully

# 7. If auth fails:
# Check username/password match server database
# Server command: roip-server list-users
```

**Typical Registration Flow**:

```
[SIP] Sending REGISTER to sip.example.com:5060
  ↓
[SIP] Received: 407 Proxy Authentication Required (or 401)
  ↓
[SIP] Sending REGISTER with Digest auth
  ↓
[SIP] Received: 200 OK - Registered
  ↓
[MAIN] SIP Status: Registered
```

If stuck at "407 Proxy Authentication Required", check:
```
- Server is configured for Digest auth
- Password in device matches server
- Server database has this user created
```

### Registration Keeps Timing Out

**Symptoms**: "Registering..." state for >30 seconds, then fails

**Causes**:
- Server unreachable/down
- Firewall blocking SIP port
- NAT/CGNAT issues
- Network latency too high

**Solutions**:

```bash
# 1. Check if server is accessible from client's network
ping sip.example.com
tracert sip.example.com (Windows)
traceroute sip.example.com (Mac/Linux)

# 2. If behind CGNAT, enable TURN relay
Settings → Network → NAT/TURN Settings
  Enable TURN Relay: ON
  TURN Server: turn.example.com:3478
  TURN Username: (from server)
  TURN Password: (from server)

# 3. Check server status
# Server: docker-compose ps
# Should show all services running
docker-compose logs roip-api | tail -20

# 4. Increase timeout values in device
# Edit roip-firmware/include/config.h
#define SIP_TIMEOUT_MS 5000  // Increase from default
pio run -e esp32s3-roip

# 5. Try server IP directly instead of hostname
# If sip.example.com times out, try IP address
# Settings → SIP Server: 203.0.113.1 (example IP)
```

---

## Audio Issues

### No Audio Input (Mic Level Shows 0)

**Symptoms**: Microphone input level at -∞ dB, no signal on meter

**Checklist**:
1. Is audio cable connected?
2. Is audio cable connected to correct GPIO pin?
3. Is input gain set above 0 dB?
4. Is device in RX mode (not TX)?
5. Is noise gate closing input?

**Solutions**:

```bash
# 1. Verify pin configuration
Settings → Debug → Pin Configuration
Check PIN_ADC_RX is correct (default: GPIO 35)

# 2. Check input gain
Settings → Audio → Input Gain
Should be 10-20 dB for typical microphone input
(0 dB = no amplification, too quiet)

# 3. Test with multimeter
Multimeter between GPIO 35 and GND
Should show 0-3.3V varying with audio

# 4. Check audio cable
Swap with known-good cable
Or use headphones (switch input/output with adapter)

# 5. Verify in code (if custom pins)
roip-firmware/include/config.h
#define PIN_ADC_RX 35  // Check your GPIO number

# 6. Try test tone
Settings → Audio → Test Tone
Should hear audio output at normal level

# 7. Check noise gate isn't blocking
Settings → Audio → DSP → Noise Gate
Try setting to -60 dB (minimum filtering)
```

### No Audio Output (Speakers Quiet/Silent)

**Symptoms**: LED shows RX activity, but no sound from speaker

**Checklist**:
1. Is audio cable connected to correct output?
2. Is output volume turned up?
3. Is output gain set above 0 dB?
4. Is audio actually being received?
5. Is speaker powered?

**Solutions**:

```bash
# 1. Verify pin configuration
Settings → Debug → Pin Configuration
Check PIN_DAC_TX is correct (default: GPIO 19)

# 2. Check output gain
Settings → Audio → Output Gain
Set to 5-10 dB
(0 dB = normal level, may be quiet)

# 3. Check speaker power
If external DAC/amp, ensure it's powered
Check LED on amp (should be on)

# 4. Test with audio loopback
Settings → Audio → Test Tone
Should hear tone from output speaker
If works: input problem
If not works: output problem

# 5. Measure output voltage
Multimeter on GPIO 19
Should show 0-3.3V for audio signal
(Not steady voltage)

# 6. Check cables/connectors
Try swapping cables
Or connect headphones directly to GPIO 19 (via resistor)

# 7. Check limiter isn't clipping
Settings → Audio → Limiter
Temporarily disable to see if helps
```

### Audio is Distorted/Clipping

**Symptoms**: Scratchy, harsh audio, like it's being cut off

**Causes**:
- Input level too high (clipping at source)
- Output level too high (clipping at speaker)
- Codec bitrate too low
- DSP settings too aggressive

**Solutions**:

```bash
# 1. Reduce input gain
Settings → Audio → Input Gain
Target: signal peaks at -3 to -6 dBFS (not hitting -∞)
Watch the input meter while speaking

# 2. Check for input clipping indicator
Settings → Audio → Levels
Red "Clipping" indicator should be OFF

# 3. Reduce output gain
Settings → Audio → Output Gain
Start at 0 dB
Increase only if too quiet

# 4. Increase codec bitrate
Settings → Audio → Advanced → Opus Bitrate
Try 32 kbps (more quality, more bandwidth)

# 5. Reduce DSP aggressiveness
Settings → Audio → DSP:
  - Disable Noise Suppression (temporarily)
  - Disable Compressor (temporarily)
  - Reduce AGC target level

# 6. Check microphone preamp
If using external preamp, check it's not clipping
Look for clipping LED on preamp
Reduce preamp output level

# 7. Enable soft limiter
Settings → Audio → Limiter
Should prevent clipping at output stage
```

---

## Call Quality

### Audio Delay/Latency

**Symptoms**: Delayed response, like walkie-talkie delay

**Acceptable Delay**:
- <100ms: Excellent (transparent)
- 100-200ms: Good (acceptable for radio)
- >200ms: Noticeable lag

**Latency Breakdown**:
```
WiFi latency to router:        5-20 ms
Jitter buffer:               20-100 ms
Processing/codec:             5-10 ms
Network to server:           50-200 ms
Server processing:            5-10 ms
-------------------------------------------
Total:                     100-350+ ms
```

**Solutions** (in order of impact):

```bash
# 1. Reduce jitter buffer (biggest impact)
Settings → Audio → Advanced → Jitter Buffer
Reduce from 100ms to 50ms (or even 20ms)
May cause audio dropouts if network is unstable

# 2. Improve WiFi signal
Move closer to router (target: -50 dBm or better)
WiFi signal: Settings → Network → WiFi Signal

# 3. Reduce audio frame size
Edit roip-firmware/include/config.h
#define AUDIO_FRAME_SIZE 240  // 10ms instead of 20ms
pio run -e esp32s3-roip

# 4. Use 5GHz WiFi band (if available)
5GHz has lower latency than 2.4GHz
Router settings: 2.4GHz vs 5GHz band

# 5. Reduce codec complexity
Settings → Audio → Codec Complexity
Lower complexity = faster processing
Trade-off: slightly lower audio quality

# 6. Use server closer to your location
Geographic distance = network latency
If server in another country, expect more delay

# 7. Check for network congestion
Download speed test while calling
If <5 Mbps download, network is congested
```

### Choppy/Broken Audio

**Symptoms**: Audio drops out, clicks, "robot" sound

**Causes**:
- Packet loss >2%
- Jitter buffer too small
- Network congestion
- WiFi interference

**Solutions**:

```bash
# 1. Check packet loss
Settings → Status → Network Quality
Look at "Packet Loss %"
>1% = network problem

# 2. Increase jitter buffer
Settings → Audio → Advanced → Jitter Buffer
Increase from 20ms to 50-100ms
More delay but smoother

# 3. Enable Forward Error Correction (FEC)
Settings → Audio → Advanced → Enable FEC
Adds redundancy to handle packet loss

# 4. Check WiFi channel
Use WiFi analyzer app
Switch to less congested channel
Router admin: Change WiFi channel

# 5. Move router closer
Signal should be -50 dBm or better

# 6. Check for interference
Sources: microwave, cordless phone, baby monitor, neighbors' WiFi
Move device away or change channel

# 7. Increase codec bitrate
Settings → Audio → Opus Bitrate
24 or 32 kbps instead of 16 kbps
Requires more bandwidth but handles loss better

# 8. Monitor network
Watch "Network Quality" section
RTP packets lost: Should be <1% for good quality
Jitter: Should be <30ms for VoIP
```

### One-Way Audio (Only Hears You, or You Only Hear Them)

**Symptoms**: Audio flows only in one direction

**Checklist**:
1. Is call connected (not just ringing)?
2. Is media actually flowing (check RTP stats)?
3. Is one side in mute mode?
4. Is codec negotiation failed?

**Solutions**:

```bash
# 1. Check call state
Settings → Status → Active Calls
Should show: "Connected" not "Ringing"

# 2. Check RTP flow
API: curl -H "Auth: Bearer $TOKEN" http://device/api/status
Look for: "rtp_packets_sent" and "rtp_packets_received"
Should both be >0

# 3. Check if device is muted
Settings → Audio → Mute
Should be OFF (disabled)

# 4. Check codec negotiation
Serial monitor: pio device monitor
Look for: [RTP] Codec negotiated: opus
If not present: codec mismatch with other end

# 5. Restart SIP registration
Settings → Network → Re-Register

# 6. Try direct call (P2P without server)
Instead of calling through server
Try calling other device directly by IP
Settings → Network → Call Mode: Direct P2P
This bypasses server routing issues

# 7. Check firewall rules (if server)
Server: sudo iptables -L -n | grep 5060
RTP ports (10000-20000) must be open
```

---

## Network Problems

### Device Can't Reach Server (Network Unreachable)

**Symptoms**: Error message: "Cannot reach SIP server" or "Network unreachable"

**Causes**:
- WiFi not connected
- Wrong network configuration
- Server IP/hostname wrong
- Firewall blocking
- DNS issues

**Solutions**:

```bash
# 1. Check WiFi connection
Settings → Network → WiFi Status
Should show: Connected, with IP address

# 2. Check connectivity
Settings → Network → Diagnostics
Run connectivity test

# 3. Verify server address
Settings → Network → SIP Settings
Check: Server address is correct
Try both hostname and IP address

# 4. Test DNS
nslookup sip.example.com
Should return IP address
If fails: DNS problem, use IP address instead

# 5. Test network path
From other device: ping sip.example.com
tracert sip.example.com

# 6. Check firewall
Server must have ports open:
  5060/udp (SIP)
  10000-20000/udp (RTP)
  3478/udp (STUN/TURN)

# 7. Try static IP configuration
Instead of DHCP
Settings → Network → IPv4 Settings
Toggle DHCP off, set static IP

# 8. Check default gateway
Settings → Network → Diagnostics → Gateway
Should be reachable
ping <gateway_ip>
```

### High Packet Loss During Calls

**Symptoms**: Audio cuts out, "Quality" shows >2% packet loss

**Targets**:
- Acceptable: <1%
- Tolerable: 1-2%
- Problem: >2%

**Solutions**:

```bash
# 1. Check WiFi signal strength
Settings → Network → WiFi Signal
Target: -50 dBm or better
If <-70: too weak, move closer

# 2. Monitor during call
API call: curl http://device/api/network/quality
Check: packet_loss_percent, jitter_ms

# 3. Reduce data rate
Settings → Audio → Opus Bitrate
Lower bitrate = fewer packets
Try 16 kbps instead of 32 kbps

# 4. Enable FEC (Forward Error Correction)
Settings → Audio → Advanced → FEC
Adds redundancy for lost packets

# 5. Switch WiFi channel
Change to less congested channel
2.4GHz channels: 1, 6, 11 (non-overlapping)

# 6. Reduce other network traffic
Stop downloads, streaming, other devices
WiFi is shared medium

# 7. Check for interference
Microwave, cordless phone, baby monitor
Move device away or change channel

# 8. Try wired connection
If possible: connect to router via Ethernet bridge
Much more stable than WiFi
```

### Timeouts and Dropped Calls

**Symptoms**: Calls suddenly disconnect, timeout errors

**Causes**:
- Network instability
- WiFi disconnection
- SIP keep-alive not working
- Server overload

**Solutions**:

```bash
# 1. Check WiFi stability
Monitor WiFi for disconnections
Serial monitor: pio device monitor
Look for [WiFi] Lost connection messages

# 2. Enable SIP keep-alive
Settings → Network → Advanced
SIP Keep-Alive: Enabled
Interval: 60 seconds (default)

# 3. Check session timers
Settings → Network → Advanced → Session Timer
Some servers require SIP Session Timers

# 4. Monitor server health
If self-hosted:
docker-compose logs roip-api | tail -50
Check for errors or crashes

# 5. Check server capacity
If many users:
docker-compose top roip-api
curl http://server/api/admin/status
Check CPU, memory, connections

# 6. Increase timeout values
Edit roip-firmware/include/config.h
#define SIP_TIMEOUT_MS 10000  // Increase from default
pio run -e esp32s3-roip
```

---

## Hardware Issues

### Device Gets Hot

**Symptoms**: Device warm/hot to touch, temperature >60°C

**Normal**: Warm (35-45°C) during operation
**Warning**: Hot (45-55°C) - investigate
**Critical**: Very hot (>55°C) - shut down

**Causes**:
- Sustained high CPU load
- Poor ventilation
- Ambient temperature high

**Solutions**:

```bash
# 1. Check CPU usage
Settings → Status → CPU Usage
If >80% sustained: normal for busy calls
If >90% idle: something is wrong

# 2. Reduce DSP processing
Settings → Audio → DSP:
  - Disable RNNoise (switch to Speex)
  - Reduce Opus complexity
  - Disable unused filters

# 3. Improve ventilation
Move device away from enclosed spaces
Add small fan nearby (not directly on device)

# 4. Reduce ambient temperature
Turn down room temperature if possible
Move away from heat sources

# 5. Reduce concurrent connections
If server: limit simultaneous calls
Only one call per ESP32 client (by design)

# 6. Monitor temperature
Settings → Status → Temperature
Keep eye on trends

# 7. Reduce WiFi transmit power
Edit roip-firmware/include/config.h
#define WIFI_TX_POWER 17  // Maximum, lower for less heat
pio run -e esp32s3-roip
```

### Device Reboots Unexpectedly

**Symptoms**: Device restarts randomly, LEDs flash reset sequence

**Causes**:
- Watchdog timeout
- Out of memory
- Stack overflow
- Brown-out (low power)

**Solutions**:

```bash
# 1. Check power supply
Multimeter: Should be steady 5.0V
Voltage sag during WiFi TX? = weak power supply
Try quality USB power supply (≥1A)

# 2. Check memory usage
Settings → Status → Memory Usage
Free memory should be >20%
If <10%: memory pressure, may cause reset

# 3. Check watchdog resets
Serial monitor: pio device monitor
Look for: [WATCHDOG] Timeout
If frequent: something is hanging

# 4. Reduce active features
Disable: RNNoise, Recording, Web Server
Settings → Debug → Enable/Disable Features

# 5. Increase watchdog timeout
Edit roip-firmware/src/main.cpp
#define WATCHDOG_TIMEOUT_SECONDS 60  // From 30
pio run -e esp32s3-roip

# 6. Check temperature (might trigger resets)
Thermal protection: >70°C
Temperature: Settings → Status → Temperature
```

### Serial Port Not Recognized

**Symptoms**: Device doesn't appear in Device Manager or /dev/, or appears then disappears

**Causes**:
- USB cable issue
- USB driver missing
- Board not in download mode
- Mac/Linux permissions

**Solutions**:

```bash
# Windows
# Check Device Manager:
# Should appear as "USB Serial (COM#)" or "USB JTAG serial debug unit"
# If not: device not detected
# Try: different USB port, different cable

# Mac/Linux
ls -la /dev/ttyUSB*
ls -la /dev/tty.usbserial*

# If not found: device not recognized
# Try: different USB cable, different port

# Force bootloader mode
# 1. Hold BOOT button
# 2. Click RST button
# 3. Release BOOT button
# Device should appear in bootloader mode

# Install drivers (Windows/Mac)
# Download from: https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers
# Or: https://github.com/espressif/usb_serial_jtag_driver

# Linux permissions
sudo usermod -aG dialout $USER
newgrp dialout
# Then log out/in or use: sudo pio run ...
```

---

## Performance Issues

### High CPU Usage (>80% idle)

**Symptoms**: CPU meter stuck high, even with no active calls

**Causes**:
- Runaway task
- Infinite loop in DSP
- Memory leak
- WiFi scanning

**Solutions**:

```bash
# 1. Check which task is using CPU
Settings → Debug → Task Monitor
See breakdown of CPU by component

# 2. Disable features one by one
Settings → Audio → DSP
- Disable Noise Suppression
- Disable Compressor
- Disable EQ
Check if CPU drops

# 3. Check WiFi scanning
WiFi scanning can use CPU
Settings → Network → WiFi Scanning
Reduce frequency if too frequent

# 4. Reboot device
Fresh start often helps
Settings → Restart

# 5. Factory reset (last resort)
Settings → Advanced → Factory Reset
All settings back to default
```

### High Memory Usage (>90%)

**Symptoms**: "Low memory" warnings, sluggish performance

**Causes**:
- Memory leak in code
- Buffer not freed
- Too many audio frames buffered
- Web interface using memory

**Solutions**:

```bash
# 1. Reduce buffer sizes
Edit roip-firmware/include/config.h
#define AUDIO_BUFFER_SIZE 512   // Smaller = less memory
pio run -e esp32s3-roip

# 2. Disable features
Settings → Audio → DSP
Disable RNNoise (uses ~60KB)

# 3. Disable recording
Settings → Recording → Enabled
Turn OFF (saves memory)

# 4. Clear event logs
Settings → Debug → Clear Logs
Old logs take up memory

# 5. Reduce SIP message history
Edit config:
Settings → Network → Advanced
History Size: 10 (from 100)

# 6. Restart regularly
Settings → Advanced → Schedule Restart
Restart at 3 AM daily to clear memory leaks
```

---

## Server Issues

### Server Crashes on Startup

**Symptoms**: "docker-compose up" fails, logs show errors

**Solutions**:

```bash
# Check logs
docker-compose logs roip-api | head -50
docker-compose logs postgres

# Common issues:

# 1. Port already in use
# Change in docker-compose.yml:
ports:
  - "8081:8080"  # Use 8081 instead of 8080

# 2. Database connection failed
# Check postgres is running:
docker-compose ps postgres

# 3. Insufficient permissions
sudo docker-compose up -d

# 4. Disk full
df -h
# Clean up: docker system prune

# 5. Corrupted database
docker-compose down
docker volume rm roip_postgres_data
docker-compose up -d
# Recreate schema with init script
```

### Server Can't Register Devices

**Symptoms**: Device registration fails, database errors

**Solutions**:

```bash
# Check database
docker-compose exec postgres psql -U roip -d roip_db -c "SELECT * FROM devices;"

# Create device manually
docker-compose exec roip-api ./roip-server device create \
  --username esp32_001 \
  --password password123

# Check database schema
docker-compose exec postgres psql -U roip -d roip_db -c "\dt"

# Reset database
docker-compose down
docker volume rm roip_postgres_data
docker-compose up -d

# Verify schema created
docker-compose exec postgres psql -U roip -d roip_db -c "\dt"
# Should show: users, devices, routes, call_logs, etc.
```

---

## Diagnostic Tools

### Serial Monitor Output

```bash
# Full output with timestamps
pio device monitor | ts

# Filter for errors only
pio device monitor | grep ERROR

# Save to file
pio device monitor > debug_log.txt &

# Monitor with colors
pio device monitor | cat  # Plain text
pio device monitor       # With colors
```

### Network Diagnostics

```bash
# From device via web interface
Settings → Network → Diagnostics
- WiFi signal strength
- Ping to gateway
- DNS resolution
- SIP server reachability

# From command line
# Check device IP
nmap 192.168.1.0/24 | grep esp32

# Ping device
ping 192.168.1.100

# Trace route to server
tracert sip.example.com (Windows)
traceroute sip.example.com (Mac/Linux)

# Monitor WiFi channel
iwconfig (Linux)
networksetup -getairportnetwork en0 (Mac)
```

### API Diagnostics

```bash
# Get full system status
curl -H "Auth: Bearer $TOKEN" \
  http://device-ip:8080/api/v1/status | jq

# Monitor metrics in real-time
watch -n 1 'curl -s -H "Auth: Bearer $TOKEN" \
  http://device-ip:8080/api/v1/metrics | jq ".data.metrics[-1]"'

# Check health
curl http://device-ip:8080/api/v1/health | jq
```

### Hardware Testing

```bash
# Test inputs/outputs
Settings → Debug → Hardware Test
- Test audio input
- Test audio output
- Test LEDs
- Test buttons/switches

# Or via serial
adc_test
dac_test
gpio_test
```

---

## Getting Help

### Collect Diagnostic Information

Before reporting issues, gather:

```bash
# 1. Device information
Settings → About
- Device Name
- Device ID
- MAC Address
- Firmware Version
- Board Type

# 2. Configuration
Settings → Debug → Export Configuration
Export and share (remove passwords)

# 3. Recent logs
Settings → Logs → Export
Last 100 lines of logs

# 4. System status
API: curl http://device/api/v1/status > status.json

# 5. Call quality metrics
Last successful call history
API: curl http://device/api/v1/calls/history?limit=5 > calls.json
```

### Common Error Messages

| Error | Meaning | Fix |
|-------|---------|-----|
| "Authentication failed" | Wrong WiFi password | Check SSID and password |
| "DHCP timeout" | No DHCP on network | Use static IP |
| "No route to host" | Network unreachable | Check connectivity |
| "Connection refused" | Server not running | Check server status |
| "Out of memory" | RAM exhausted | Reduce buffer sizes |
| "SSL handshake failed" | Certificate issue | Check date/time sync |
| "DNS resolution failed" | Hostname not found | Use IP address directly |

---

## When All Else Fails

### Complete Reset Procedure

```bash
# 1. Erase all flash
esptool.py --port /dev/ttyUSB0 erase_flash

# 2. Rebuild from scratch
pio run -e esp32s3-roip -t clean
pio run -e esp32s3-roip

# 3. Upload to clean device
pio run -e esp32s3-roip -t upload

# 4. Monitor startup
pio device monitor

# 5. Reconfigure from scratch
Use web interface to configure
```

### Request Support

If issues persist:
1. Collect diagnostic info (see above)
2. Check GitHub issues (search your problem)
3. Post GitHub issue with:
   - Device type & firmware version
   - Detailed symptoms & steps to reproduce
   - Diagnostic logs and configuration
   - What you've already tried

---

## Useful Commands Reference

```bash
# Build & upload
pio run -e esp32s3-roip -t upload

# Monitor
pio device monitor
pio device monitor --monitor-baud 230400

# List devices
pio device list

# Full firmware erase
esptool.py --port /dev/ttyUSB0 erase_flash

# Specific partition erase
esptool.py --port /dev/ttyUSB0 erase_region 0x9000 0x6000

# Force bootloader
# Hold BOOT, press RST, release BOOT

# Windows device list
mode (COM ports)
devmgmt.msc (Device Manager)

# Linux device list
ls -la /dev/tty*
dmesg | tail -20

# Server management
docker-compose up -d
docker-compose logs -f
docker-compose ps
docker-compose restart roip-api

# Database access
docker-compose exec postgres psql -U roip -d roip_db
```

---

## Next Steps

- Still stuck? Check [ROIP_CLIENT_GUIDE.md](ROIP_CLIENT_GUIDE.md) for detailed setup
- [API Reference](ROIP_API_REFERENCE.md) for programmatic control
- [Server Guide](ROIP_SERVER_GUIDE.md) for server deployment
- [Quick Start](ROIP_QUICKSTART.md) for basic setup

---

**Last Updated**: November 2025
**Version**: 1.0
