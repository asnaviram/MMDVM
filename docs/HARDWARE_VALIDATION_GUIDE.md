# ESP32 RoIP Hardware Validation Guide

## Overview

This guide provides comprehensive procedures for validating ESP32 RoIP hardware before deployment. Follow these steps systematically to ensure reliable operation.

## Pre-Validation Checklist

### Visual Inspection

- [ ] All solder joints clean and shiny (no cold joints)
- [ ] No solder bridges between pins
- [ ] All components installed with correct polarity
- [ ] No damaged components or traces
- [ ] Proper strain relief on cables
- [ ] Secure mounting of ESP32 in enclosure

### Continuity Testing

- [ ] Ground connections verified with multimeter
- [ ] No shorts between power and ground
- [ ] All signal paths continuous
- [ ] Isolated circuits properly isolated (PTT)

### Power Supply Validation

- [ ] Input voltage correct (5V ± 0.25V)
- [ ] ESP32 3.3V rail stable
- [ ] No excessive ripple on power rails
- [ ] Current draw within expected range (<300mA idle)

## Hardware Test Suite

### Test 1: WiFi Connectivity (wifi-test.ino)

**Location:** `/home/user/MMDVM/test/hardware/wifi-test.ino`

**Purpose:** Validate WiFi hardware and network connectivity

**Procedure:**
```bash
1. Upload wifi-test.ino to ESP32
2. Open Serial Monitor (115200 baud)
3. Wait for tests to complete
4. Review test results
```

**Pass Criteria:**
- WiFi connection established < 10 seconds
- RSSI > -75 dBm
- UDP communication functional
- No disconnections during stability test
- Successful reconnection after disconnect

### Test 2: Audio Hardware (audio-test.ino)

**Location:** `/home/user/MMDVM/test/hardware/audio-test.ino`

**Purpose:** Validate ADC, DAC, and I2S audio subsystems

**Procedure:**
```bash
1. Upload audio-test.ino to ESP32
2. Connect test audio source to RX input
3. Connect oscilloscope or audio analyzer to TX output
4. Run test suite
5. Review audio quality metrics
```

**Pass Criteria:**
- ADC readings in range (500-3500)
- DAC output functional
- I2S driver operational
- Noise floor < 50
- SNR > 40 dB
- THD < 3%
- Frequency response flat ±3dB (300-3000Hz)

### Test 3: GPIO Functionality (gpio-test.ino)

**Location:** `/home/user/MMDVM/test/hardware/gpio-test.ino`

**Purpose:** Validate digital I/O, PWM, and interrupts

**Procedure:**
```bash
1. Connect test jumpers as indicated in test
2. Upload gpio-test.ino
3. Run automated test suite
4. Verify all GPIO operations
```

**Pass Criteria:**
- Digital output toggles correctly
- Digital input reads correctly
- Pull-up/pull-down resistors functional
- PWM output stable
- Interrupts fire reliably
- PTT pin control working
- COS pin detection working

### Test 4: Radio Interface (radio-interface-test.ino)

**Location:** `/home/user/MMDVM/test/hardware/radio-interface-test.ino`

**Purpose:** Validate complete radio interface

**Requirements:**
- FM radio connected
- Service monitor or second radio for testing

**Procedure:**
```bash
1. Connect ESP32 to radio per wiring diagram
2. Upload radio-interface-test.ino
3. Run test suite with radio transmitting/receiving
4. Monitor deviation with service monitor
```

**Pass Criteria:**
- PTT activation < 100µs
- COS detection functional
- VOX threshold appropriate
- RX audio level 500-3500 ADC
- TX audio produces proper deviation
- Squelch operation correct

### Test 5: End-to-End Validation (e2e-validation.ino)

**Location:** `/home/user/MMDVM/test/hardware/e2e-validation.ino`

**Purpose:** Complete system validation

**Requirements:**
- RoIP server running
- Radio connected
- Network access

**Procedure:**
```bash
1. Start RoIP server
2. Upload e2e-validation.ino
3. Run complete end-to-end test
4. Monitor all test phases
```

**Pass Criteria:**
- WiFi and server connection successful
- Audio quality score > 80/100
- MOS score > 3.5
- Latency < 100ms
- Packet loss < 2%
- Jitter < 20ms
- Full TX→RX→TX path functional

## Validation Documentation

### Test Results Record

```
HARDWARE VALIDATION RECORD
=========================

Device Information:
-------------------
ESP32 Model: ____________________
Serial Number: __________________
Radio Make/Model: _______________
Date: ___________________________
Technician: _____________________

Test Results:
-------------
WiFi Test:                    [ ] PASS  [ ] FAIL
Audio Hardware Test:          [ ] PASS  [ ] FAIL
GPIO Functionality Test:      [ ] PASS  [ ] FAIL
Radio Interface Test:         [ ] PASS  [ ] FAIL
End-to-End Validation:        [ ] PASS  [ ] FAIL

Measurements:
-------------
WiFi RSSI: _________ dBm
Audio SNR: _________ dB
Audio THD: _________ %
TX Deviation: _______ kHz
Latency: ___________ ms
Packet Loss: _______ %

Notes:
------
____________________________________
____________________________________
____________________________________

Validation Status:
------------------
[ ] APPROVED FOR DEPLOYMENT
[ ] REQUIRES REWORK
[ ] FAILED - DO NOT USE

Signature: _______________________
```

## Common Issues and Solutions

### WiFi Connection Fails

**Symptoms:** Cannot connect to WiFi network

**Checks:**
1. Verify SSID and password correct
2. Check antenna connection
3. Verify 2.4GHz network (ESP32 doesn't support 5GHz)
4. Check router compatibility

**Solutions:**
- Reduce WiFi TX power if ADC interference
- Move closer to access point
- Check for channel congestion

### No Audio Input

**Symptoms:** ADC reads constant value

**Checks:**
1. Verify coupling capacitor polarity
2. Check radio audio output with scope
3. Verify ground connection
4. Test with external audio source

**Solutions:**
- Replace capacitor if defective
- Check radio squelch is open
- Verify correct audio source (discriminator vs speaker)

### No Audio Output

**Symptoms:** No modulation when transmitting

**Checks:**
1. Verify coupling capacitor polarity
2. Check DAC output with scope
3. Verify PTT is activating
4. Check radio mic gain

**Solutions:**
- Increase TX audio level
- Reduce coupling resistor value
- Verify radio programming

### Over-Deviation

**Symptoms:** Signal too wide, splatter

**Checks:**
1. Measure deviation with service monitor
2. Check TX audio level
3. Verify coupling resistor value

**Solutions:**
- Reduce TX audio gain in software
- Increase coupling resistor (22kΩ, 33kΩ, 47kΩ)
- Check for audio processing in radio

### PTT Not Working

**Symptoms:** PTT doesn't key radio

**Checks:**
1. Verify MOSFET/optocoupler circuit
2. Check GPIO32 voltage (should toggle)
3. Verify ground connection
4. Test PTT manually with jumper wire

**Solutions:**
- Check MOSFET orientation
- Verify radio PTT polarity
- Replace failed MOSFET
- Check radio programming

## Performance Benchmarks

### Expected Performance

| Metric | Target | Acceptable | Unacceptable |
|--------|--------|------------|--------------|
| WiFi RSSI | > -50 dBm | > -75 dBm | < -75 dBm |
| Audio SNR | > 50 dB | > 40 dB | < 40 dB |
| Audio THD | < 2% | < 3% | > 3% |
| Latency | < 50 ms | < 100 ms | > 100 ms |
| Packet Loss | < 0.5% | < 2% | > 2% |
| Jitter | < 10 ms | < 20 ms | > 20 ms |
| Deviation (12.5kHz) | ±2.5 kHz | ±2.25-2.75 kHz | Out of range |
| Deviation (25kHz) | ±5.0 kHz | ±4.5-5.5 kHz | Out of range |

## Certification Process

After successful validation:

1. **Document Results** - Complete validation record
2. **Label Device** - Mark with validation date and technician
3. **Archive Data** - Save test results and configuration
4. **Update Inventory** - Record device as validated
5. **Prepare for Deployment** - Package with documentation

## Validation Frequency

- **Initial:** Before first deployment
- **Periodic:** Every 6 months for production systems
- **After Repair:** Any time hardware is modified
- **After Firmware Update:** Major firmware changes
- **On Failure:** After any reported issues

---

**Last Updated:** 2025-01-22
