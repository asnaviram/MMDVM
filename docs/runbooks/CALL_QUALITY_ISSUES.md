# Call Quality Issues Runbook
## ESP32 RoIP Production System

**Version**: 1.0
**Last Updated**: 2025-11-22
**Severity**: P1 - High (if affecting multiple users)
**Estimated Time to Resolution**: 30-60 minutes

---

## Table of Contents

1. [Overview](#overview)
2. [Symptoms](#symptoms)
3. [Diagnostic Procedures](#diagnostic-procedures)
4. [Common Issues and Solutions](#common-issues-and-solutions)
5. [Performance Optimization](#performance-optimization)
6. [Prevention](#prevention)

---

## Overview

This runbook addresses audio quality issues in the RoIP system, including choppy audio, one-way audio, high latency, echo, and dropped calls.

### Call Quality Metrics

| Metric | Good | Acceptable | Poor |
|--------|------|------------|------|
| Latency | <100ms | 100-200ms | >200ms |
| Jitter | <20ms | 20-50ms | >50ms |
| Packet Loss | <1% | 1-2% | >2% |
| MOS Score | >4.0 | 3.5-4.0 | <3.5 |

---

## Symptoms

### Choppy/Broken Audio

**User reports**:
- Audio cuts in and out
- Robot-like voice
- Intermittent dropouts
- Clicks or pops in audio

**Metrics indicate**:
- Packet loss >2%
- Jitter >50ms
- Irregular RTP packet arrival

### One-Way Audio

**User reports**:
- Can hear but cannot speak
- Can speak but cannot hear
- Complete silence on one or both ends

**Metrics indicate**:
- RTP packets sent but not received (or vice versa)
- Firewall blocking RTP ports
- NAT traversal failure

### High Latency/Delay

**User reports**:
- Noticeable delay in conversation
- Walkie-talkie effect
- Difficult to have natural conversation

**Metrics indicate**:
- End-to-end latency >200ms
- High network RTT
- Jitter buffer too large

### Echo

**User reports**:
- Hearing own voice delayed
- Feedback loop
- Reverb effect

**Metrics indicate**:
- Acoustic echo (microphone picking up speaker)
- Electrical echo (impedance mismatch)

### Call Drops

**User reports**:
- Calls disconnecting unexpectedly
- Cannot complete calls
- Registration failures during call

**Metrics indicate**:
- Session timeout
- SIP keepalive failures
- Network instability

---

## Diagnostic Procedures

### Step 1: Identify Scope of Issue

```bash
# Check if issue is widespread or isolated

# Count affected devices
curl http://localhost:8080/api/v1/calls/active | jq '.[] | select(.quality<3.5) | .device_id'

# Check call quality metrics
curl http://localhost:8080/metrics | grep -E "roip_call_quality|roip_packet_loss|roip_jitter|roip_latency"

# Review recent call logs
curl http://localhost:8080/api/v1/calls/history?limit=20 | jq '.[] | {from, to, quality, packet_loss, duration}'
```

**Decision Point**:
- **Widespread** (>25% of calls): Network or server issue → Proceed to Network Diagnostics
- **Isolated** (single device/route): Device or configuration issue → Proceed to Device Diagnostics

### Step 2: Network Diagnostics

```bash
# Check server network performance
ping -c 100 8.8.8.8 | tail -5
# Look for packet loss %

# Check bandwidth usage
iftop -n -i eth0
# Look for saturation

# Check for network congestion
netstat -s | grep -E "segments retransmitted|packets pruned|packet receive errors"

# Check RTP port statistics
ss -tulpn | grep -E '10000|10100' | wc -l
# Should see active RTP sessions

# Monitor real-time packet flow
sudo tcpdump -i any -n udp port 10000-10100 -c 100

# Check NAT/firewall rules
sudo iptables -L -n -v | grep -E '5060|10000'
```

### Step 3: Server Performance

```bash
# CPU usage (should be <70% for calls)
top -b -n 1 | head -20

# Memory usage
free -h

# Check for resource exhaustion
uptime  # Load average should be < CPU count

# I/O performance
iostat -x 1 5

# Network interface errors
ip -s link show

# Check TURN server (if used)
curl http://localhost:8080/api/v1/turn/status
```

### Step 4: Device-Specific Diagnostics

```bash
# Get specific device call metrics
DEVICE_ID="esp32_001"
curl "http://localhost:8080/api/v1/devices/$DEVICE_ID/calls" | jq '.[-5:]'

# Check device network quality
curl "http://localhost:8080/api/v1/devices/$DEVICE_ID/network" | jq '.'

# Review device codec settings
curl "http://localhost:8080/api/v1/devices/$DEVICE_ID" | jq '.codec_settings'

# Check recent registration status
curl "http://localhost:8080/api/v1/devices/$DEVICE_ID" | jq '.last_registered, .registration_failures'
```

---

## Common Issues and Solutions

### Issue 1: High Packet Loss

**Symptoms**: Choppy audio, dropouts, packet loss >2%

**Diagnosis**:
```bash
# Check packet loss on specific call
CALL_ID="call_123"
curl "http://localhost:8080/api/v1/calls/$CALL_ID/metrics" | jq '.packet_loss'

# Check if network-wide
ping -c 100 8.8.8.8 | grep "packet loss"

# Check for WiFi issues (ESP32 devices)
curl "http://localhost:8080/api/v1/devices/$DEVICE_ID/wifi" | jq '.signal_strength, .retries'
```

**Solutions**:

**A. Enable Forward Error Correction (FEC)**
```bash
# Update server configuration
sudo nano /opt/roip-server/.env
# Add or modify:
OPUS_FEC_ENABLED=true
OPUS_PACKET_LOSS_PERC=10

# Restart server
sudo systemctl restart roip-server

# Configure on ESP32 device via API
curl -X PATCH "http://localhost:8080/api/v1/devices/$DEVICE_ID/settings" \
  -H "Content-Type: application/json" \
  -d '{"fec_enabled": true}'
```

**B. Adjust Jitter Buffer**
```bash
# Increase jitter buffer (trades latency for reliability)
curl -X PATCH "http://localhost:8080/api/v1/devices/$DEVICE_ID/settings" \
  -H "Content-Type: application/json" \
  -d '{"jitter_buffer_ms": 100}'  # Up from default 50ms
```

**C. Reduce Codec Bitrate**
```bash
# Lower bitrate reduces packet size
curl -X PATCH "http://localhost:8080/api/v1/devices/$DEVICE_ID/settings" \
  -H "Content-Type: application/json" \
  -d '{"opus_bitrate": 24000}'  # Down from 32000
```

**D. QoS/Traffic Prioritization**
```bash
# Mark RTP packets with DSCP EF (Expedited Forwarding)
sudo iptables -t mangle -A OUTPUT -p udp --dport 10000:10100 -j DSCP --set-dscp-class ef

# Or set TOS
sudo iptables -t mangle -A OUTPUT -p udp --dport 10000:10100 -j TOS --set-tos 0xb8
```

### Issue 2: One-Way Audio

**Symptoms**: Audio flows only in one direction

**Diagnosis**:
```bash
# Check RTP flow for specific call
CALL_ID="call_123"
curl "http://localhost:8080/api/v1/calls/$CALL_ID/rtp" | jq '.sent_packets, .received_packets'

# Check firewall rules
sudo iptables -L -n -v | grep 10000

# Test NAT traversal
curl "http://localhost:8080/api/v1/devices/$DEVICE_ID/nat" | jq '.nat_type'

# Check STUN/TURN usage
curl "http://localhost:8080/api/v1/calls/$CALL_ID" | jq '.ice_candidates'
```

**Solutions**:

**A. Verify Firewall Rules**
```bash
# Ensure RTP ports open
sudo ufw allow 10000:10100/udp comment 'RTP media'

# Or iptables
sudo iptables -A INPUT -p udp --dport 10000:10100 -j ACCEPT

# Reload firewall
sudo ufw reload
```

**B. Enable TURN Relay**
```bash
# Force TURN relay for problematic connections
curl -X PATCH "http://localhost:8080/api/v1/devices/$DEVICE_ID/settings" \
  -H "Content-Type: application/json" \
  -d '{"force_turn": true}'

# Verify TURN server is running
sudo systemctl status coturn

# Check TURN logs
sudo journalctl -u coturn -n 50
```

**C. Check Media Path**
```bash
# Verify SDP negotiation successful
curl "http://localhost:8080/api/v1/calls/$CALL_ID/sdp" | jq '.local_sdp, .remote_sdp'

# Check codec negotiation
curl "http://localhost:8080/api/v1/calls/$CALL_ID" | jq '.negotiated_codec'

# Ensure both ends using same codec
# Common issue: one side supports Opus, other doesn't
```

### Issue 3: High Latency

**Symptoms**: Noticeable delay >200ms

**Diagnosis**:
```bash
# Measure end-to-end latency
curl "http://localhost:8080/api/v1/calls/$CALL_ID/metrics" | jq '.latency_ms'

# Check network RTT
ping -c 10 <device-ip>

# Measure jitter buffer size
curl "http://localhost:8080/api/v1/devices/$DEVICE_ID" | jq '.jitter_buffer_ms'
```

**Solutions**:

**A. Reduce Jitter Buffer**
```bash
# Lower jitter buffer (if network is stable)
curl -X PATCH "http://localhost:8080/api/v1/devices/$DEVICE_ID/settings" \
  -H "Content-Type: application/json" \
  -d '{"jitter_buffer_ms": 20}'  # Down from 50ms

# WARNING: May cause choppy audio if network has jitter
```

**B. Reduce Frame Size**
```bash
# Smaller frames = lower latency
# Edit ESP32 firmware configuration
# In roip-firmware/include/config.h:
# #define AUDIO_FRAME_SIZE 240  // 10ms @ 24kHz (was 480 = 20ms)

# Rebuild and deploy firmware
cd roip-firmware
pio run -e esp32s3-roip -t upload
```

**C. Optimize Network Path**
```bash
# Use geographically closer server
# Or deploy regional endpoints

# Check current route
traceroute <server-ip>

# Enable TCP Fast Open (reduces handshake latency)
sudo sysctl -w net.ipv4.tcp_fastopen=3
```

**D. Reduce Codec Complexity**
```bash
# Lower Opus complexity (faster encoding)
curl -X PATCH "http://localhost:8080/api/v1/devices/$DEVICE_ID/settings" \
  -H "Content-Type: application/json" \
  -d '{"opus_complexity": 5}'  # Down from 10
```

### Issue 4: Echo

**Symptoms**: Hearing own voice delayed

**Diagnosis**:
```bash
# Check if acoustic echo (device issue) or network echo
# Acoustic: Only on one end
# Network: Both ends hear echo

# Check echo cancellation status
curl "http://localhost:8080/api/v1/devices/$DEVICE_ID" | jq '.dsp.echo_cancellation'

# Check audio levels (clipping can cause echo)
curl "http://localhost:8080/api/v1/devices/$DEVICE_ID/audio" | jq '.input_level, .output_level'
```

**Solutions**:

**A. Enable/Tune Echo Cancellation**
```bash
# Enable AEC on ESP32
curl -X PATCH "http://localhost:8080/api/v1/devices/$DEVICE_ID/settings" \
  -H "Content-Type: application/json" \
  -d '{"echo_cancellation": true, "aec_filter_length": 256}'

# Increase AEC filter length for stronger cancellation
# (trades CPU for better cancellation)
```

**B. Reduce Audio Levels**
```bash
# Lower output gain (reduces speaker-to-mic feedback)
curl -X PATCH "http://localhost:8080/api/v1/devices/$DEVICE_ID/settings" \
  -H "Content-Type: application/json" \
  -d '{"output_gain_db": 0}'  # Reduce from +6dB

# Or lower input gain
curl -X PATCH "http://localhost:8080/api/v1/devices/$DEVICE_ID/settings" \
  -H "Content-Type: application/json" \
  -d '{"input_gain_db": 10}'  # Reduce from +20dB
```

**C. Physical Isolation**
```bash
# Instruct user to:
# 1. Use headphones instead of speaker
# 2. Move microphone away from speaker
# 3. Reduce speaker volume
# 4. Check for acoustic reflections in room
```

### Issue 5: Dropped Calls

**Symptoms**: Calls disconnect unexpectedly

**Diagnosis**:
```bash
# Check call duration before drops
curl "http://localhost:8080/api/v1/calls/history?status=failed" | jq '.[] | {duration, reason}'

# Check session timer settings
curl "http://localhost:8080/api/v1/devices/$DEVICE_ID" | jq '.sip_session_expires'

# Check for network disconnections
curl "http://localhost:8080/api/v1/devices/$DEVICE_ID/events" | jq '.[] | select(.type=="disconnected")'

# Check WiFi stability (ESP32)
curl "http://localhost:8080/api/v1/devices/$DEVICE_ID/wifi" | jq '.disconnections_24h'
```

**Solutions**:

**A. Adjust Session Timers**
```bash
# Increase SIP session expiry
curl -X PATCH "http://localhost:8080/api/v1/devices/$DEVICE_ID/settings" \
  -H "Content-Type: application/json" \
  -d '{"sip_session_expires": 3600}'  # 1 hour

# Enable SIP keepalive
curl -X PATCH "http://localhost:8080/api/v1/devices/$DEVICE_ID/settings" \
  -H "Content-Type: application/json" \
  -d '{"sip_keepalive_interval": 60}'  # Send OPTIONS every 60s
```

**B. WiFi Optimization (ESP32)**
```bash
# Reduce WiFi power saving
# In ESP32 firmware:
# WiFi.setSleep(WIFI_PS_NONE);  // Disable power save

# Or tune power save:
# esp_wifi_set_ps(WIFI_PS_MIN_MODEM);  # Minimum power save
```

**C. Increase RTP Timeout**
```bash
# Increase timeout for RTP inactivity
sudo nano /opt/roip-server/config/media.conf
# rtp_timeout_seconds=60  # Up from 30

sudo systemctl restart roip-server
```

---

## Performance Optimization

### Server-Side Optimizations

```bash
# 1. Enable connection pooling
sudo nano /opt/roip-server/.env
DB_POOL_SIZE=50  # Increase if many concurrent calls

# 2. Optimize RTP handler
# Use UDP socket options for better performance
# In roip-server/src/rtp/handler.js:
socket.setRecvBufferSize(2 * 1024 * 1024);  // 2MB
socket.setSendBufferSize(2 * 1024 * 1024);

# 3. Tune system UDP buffers
sudo sysctl -w net.core.rmem_max=8388608
sudo sysctl -w net.core.wmem_max=8388608
sudo sysctl -w net.core.rmem_default=262144
sudo sysctl -w net.core.wmem_default=262144

# 4. Enable kernel UDP optimizations
sudo sysctl -w net.ipv4.udp_rmem_min=16384
sudo sysctl -w net.ipv4.udp_wmem_min=16384
```

### Device-Side Optimizations

```bash
# 1. Optimize audio buffer sizes (ESP32 firmware)
# In roip-firmware/include/config.h:
#define AUDIO_BUFFER_SIZE 1024  # Balance between latency and stability

# 2. Enable hardware acceleration
# Use ESP32's I2S DMA for audio
# Already implemented in roip-firmware

# 3. Optimize DSP pipeline
# Disable unused DSP features to reduce CPU load
curl -X PATCH "http://localhost:8080/api/v1/devices/$DEVICE_ID/settings" \
  -H "Content-Type: application/json" \
  -d '{"dsp": {"noise_suppression": false, "compressor": false}}'
# Only disable if audio quality permits

# 4. Tune Opus encoder
curl -X PATCH "http://localhost:8080/api/v1/devices/$DEVICE_ID/settings" \
  -H "Content-Type: application/json" \
  -d '{"opus_bitrate": 24000, "opus_complexity": 5, "opus_vbr": true}'
```

### Network Optimizations

```bash
# 1. Enable QoS on router
# Set DSCP markings for VoIP traffic
# Router config (example - Cisco):
# class-map match-any VOIP
#   match ip dscp ef
# policy-map QOS-POLICY
#   class VOIP
#     priority percent 40

# 2. Optimize MTU
# Test optimal MTU size
ping -M do -s 1472 -c 10 <server-ip>
# If fragmentation, reduce:
sudo ip link set dev eth0 mtu 1400

# 3. Reduce TCP interference with UDP
sudo sysctl -w net.ipv4.tcp_slow_start_after_idle=0

# 4. Enable BBR congestion control
sudo sysctl -w net.ipv4.tcp_congestion_control=bbr
```

---

## Prevention

### Proactive Monitoring

```bash
# Monitor call quality metrics
# Add to Prometheus/Grafana

# Alert on poor call quality
# metrics.rules:
- alert: PoorCallQuality
  expr: roip_call_quality_average < 3.5
  for: 5m
  annotations:
    summary: "Poor call quality detected"

- alert: HighPacketLoss
  expr: roip_packet_loss_percent > 2
  for: 2m
  annotations:
    summary: "High packet loss: {{ $value }}%"

- alert: HighLatency
  expr: roip_call_latency_ms > 200
  for: 5m
  annotations:
    summary: "High latency: {{ $value }}ms"
```

### Regular Testing

```bash
# Automated call quality testing
# /opt/roip/scripts/test-call-quality.sh

#!/bin/bash
# Test call between two devices
DEVICE_A="esp32_001"
DEVICE_B="esp32_002"

# Initiate test call
CALL_ID=$(curl -X POST "http://localhost:8080/api/v1/calls" \
  -H "Content-Type: application/json" \
  -d "{\"from\":\"$DEVICE_A\",\"to\":\"$DEVICE_B\"}" | jq -r '.call_id')

# Wait for call establishment
sleep 5

# Get quality metrics
QUALITY=$(curl -s "http://localhost:8080/api/v1/calls/$CALL_ID/metrics" | jq -r '.quality')
PACKET_LOSS=$(curl -s "http://localhost:8080/api/v1/calls/$CALL_ID/metrics" | jq -r '.packet_loss')
LATENCY=$(curl -s "http://localhost:8080/api/v1/calls/$CALL_ID/metrics" | jq -r '.latency_ms')

# End call
curl -X DELETE "http://localhost:8080/api/v1/calls/$CALL_ID"

# Alert if poor quality
if (( $(echo "$QUALITY < 3.5" | bc -l) )); then
  echo "WARNING: Poor call quality detected: $QUALITY" | \
    mail -s "Call Quality Alert" ops@example.com
fi
```

### Capacity Planning

```bash
# Monitor concurrent call capacity
# Alert when approaching limit

# Check current call count vs capacity
ACTIVE_CALLS=$(curl -s http://localhost:8080/api/v1/calls/active | jq 'length')
MAX_CALLS=100  # Your configured maximum

UTILIZATION=$((ACTIVE_CALLS * 100 / MAX_CALLS))

if [ $UTILIZATION -gt 80 ]; then
  echo "WARNING: Call capacity at ${UTILIZATION}%" | \
    mail -s "Capacity Alert" ops@example.com
fi
```

---

## Appendix: Call Quality Troubleshooting Matrix

| Symptom | Likely Cause | Quick Check | Solution |
|---------|--------------|-------------|----------|
| Choppy audio | Packet loss | Check packet_loss metric | Enable FEC, increase jitter buffer |
| One-way audio | Firewall/NAT | Check RTP ports open | Open firewall, enable TURN |
| High latency | Network/jitter buffer | Check latency metric | Reduce jitter buffer, optimize network |
| Echo | Acoustic feedback | Check echo_cancellation | Enable AEC, reduce levels |
| Dropped calls | Timeout/network | Check WiFi stability | Increase timeouts, optimize WiFi |
| Robotic voice | Codec issues | Check codec settings | Increase bitrate, check codec match |
| Crackling | Clipping | Check audio levels | Reduce gain, enable limiter |

---

## Related Documentation

- [Performance Debug Guide](../troubleshooting/PERFORMANCE_DEBUG.md)
- [Network Troubleshooting](../troubleshooting/COMMON_ISSUES.md)
- [ESP32 Audio Configuration](../../roip-firmware/AUDIO_CONFIG.md)

---

**Document Version**: 1.0
**Last Updated**: 2025-11-22
**Next Review**: 2026-02-22
