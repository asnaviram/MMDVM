# ESP32 RoIP Hardware Certification Checklist

## Purpose

This checklist ensures that ESP32 RoIP hardware has been properly tested, validated, and documented before deployment in production environments.

## Certification Process Overview

1. **Hardware Assembly** - Build and inspect hardware
2. **Component Testing** - Test individual subsystems
3. **Integration Testing** - Test complete system
4. **Performance Validation** - Verify meets specifications
5. **Documentation** - Record all results
6. **Final Certification** - Approve or reject for deployment

---

## Pre-Certification Requirements

### Documentation

- [ ] Schematic diagram available
- [ ] Wiring diagram completed
- [ ] BOM (Bill of Materials) verified
- [ ] Radio compatibility confirmed
- [ ] Configuration file created

### Equipment Ready

- [ ] Service monitor or spectrum analyzer available
- [ ] Multimeter available
- [ ] Oscilloscope available (recommended)
- [ ] Test radio configured
- [ ] RoIP server running
- [ ] Network access configured

### Software Prepared

- [ ] Latest firmware compiled
- [ ] Test suite uploaded (wifi-test, audio-test, etc.)
- [ ] Configuration parameters set
- [ ] Calibration values documented

---

## Section 1: Hardware Assembly Inspection

### Visual Inspection

- [ ] All solder joints are shiny and smooth (no cold joints)
- [ ] No solder bridges between adjacent pins
- [ ] No damaged traces on PCB
- [ ] All components properly seated
- [ ] Correct component values installed
- [ ] Polarity correct on all capacitors
- [ ] Polarity correct on all diodes
- [ ] MOSFET/transistor orientation correct
- [ ] No missing components

### Mechanical Inspection

- [ ] ESP32 securely mounted
- [ ] All connectors properly attached
- [ ] Cable strain relief adequate
- [ ] Enclosure fits properly (if applicable)
- [ ] No loose wires or components
- [ ] Mounting holes aligned correctly
- [ ] Proper spacing between components
- [ ] Heat sinks installed if needed

### Continuity Testing

- [ ] Power (+5V) to VIN continuous
- [ ] Ground continuous between all ground points
- [ ] ESP32 GND to Radio GND continuous
- [ ] No shorts between power rails
- [ ] RX audio path continuous
- [ ] TX audio path continuous
- [ ] PTT path continuous
- [ ] COS path continuous
- [ ] All connector pins mapped correctly

**Inspector:** _________________ **Date:** _________

---

## Section 2: Power Supply Testing

### Voltage Measurements

| Test Point | Expected | Measured | Pass/Fail |
|------------|----------|----------|-----------|
| VIN (no load) | 5.0V ± 0.25V | ______V | [ ] |
| VIN (loaded) | 5.0V ± 0.25V | ______V | [ ] |
| 3.3V rail (no load) | 3.3V ± 0.1V | ______V | [ ] |
| 3.3V rail (loaded) | 3.3V ± 0.1V | ______V | [ ] |

### Current Measurements

| Condition | Expected | Measured | Pass/Fail |
|-----------|----------|----------|-----------|
| Idle (WiFi off) | < 100mA | ______mA | [ ] |
| WiFi connected | < 200mA | ______mA | [ ] |
| WiFi transmitting | < 300mA | ______mA | [ ] |
| Peak current | < 500mA | ______mA | [ ] |

### Power Supply Tests

- [ ] Voltage stable under load
- [ ] No voltage droop when WiFi transmits
- [ ] No resets during operation
- [ ] Ripple voltage < 100mV p-p
- [ ] Power LED illuminates
- [ ] No excessive heat from regulator
- [ ] ESP32 boots reliably
- [ ] Power supply can sustain maximum load

**Tester:** _________________ **Date:** _________

---

## Section 3: WiFi Connectivity Testing

**Test Script:** `wifi-test.ino`

### WiFi Connection Tests

- [ ] Connects to WiFi successfully
- [ ] Connection time < 10 seconds
- [ ] RSSI > -75 dBm
- [ ] IP address assigned correctly
- [ ] Gateway reachable
- [ ] DNS resolution works

### WiFi Stability Tests

- [ ] No disconnections during 60-second test
- [ ] Reconnection successful after disconnect
- [ ] Signal strength stable
- [ ] Can reconnect multiple times

### UDP Communication Tests

- [ ] UDP port opens successfully
- [ ] Can send UDP packets
- [ ] Can receive UDP packets
- [ ] Packet loss < 5%

### Test Results

| Metric | Target | Achieved | Pass/Fail |
|--------|--------|----------|-----------|
| Connection Time | < 10s | ______s | [ ] |
| RSSI | > -75 dBm | ______dBm | [ ] |
| Packet Loss | < 5% | ______% | [ ] |
| Reconnections | 3/3 | ______/3 | [ ] |

**Tester:** _________________ **Date:** _________

---

## Section 4: Audio Hardware Testing

**Test Script:** `audio-test.ino`

### ADC Testing (RX Audio)

- [ ] ADC initialized correctly
- [ ] ADC reads within range (0-4095)
- [ ] ADC responds to audio input
- [ ] ADC not stuck at 0 or 4095
- [ ] ADC midpoint ~2048 with no signal
- [ ] ADC shows variation with audio signal

### DAC Testing (TX Audio)

- [ ] DAC initialized correctly
- [ ] DAC can output varying levels
- [ ] DAC generates 1kHz test tone
- [ ] DAC output verified on oscilloscope
- [ ] DAC average output ~128 for 50% duty

### I2S Testing (if applicable)

- [ ] I2S driver installs successfully
- [ ] I2S can write data
- [ ] I2S can read data
- [ ] I2S buffer management working

### Audio Quality Measurements

| Metric | Target | Measured | Pass/Fail |
|--------|--------|----------|-----------|
| Noise Floor | < 50 | ______ | [ ] |
| SNR | > 40 dB | ______dB | [ ] |
| THD | < 3% | ______% | [ ] |
| Freq Response 300Hz | ±3dB | ______dB | [ ] |
| Freq Response 1000Hz | 0dB (ref) | ______dB | [ ] |
| Freq Response 3000Hz | ±3dB | ______dB | [ ] |

**Tester:** _________________ **Date:** _________

---

## Section 5: GPIO Functionality Testing

**Test Script:** `gpio-test.ino`

### Digital I/O Tests

- [ ] GPIO outputs can drive HIGH
- [ ] GPIO outputs can drive LOW
- [ ] GPIO inputs can read HIGH
- [ ] GPIO inputs can read LOW
- [ ] Internal pull-up works
- [ ] Internal pull-down works
- [ ] GPIO toggles reliably (100 cycles)

### PWM Testing

- [ ] PWM channel initializes
- [ ] PWM can output various duty cycles
- [ ] PWM frequency adjustable
- [ ] PWM output verified on oscilloscope

### Interrupt Testing

- [ ] Interrupts attach successfully
- [ ] RISING edge interrupts work
- [ ] FALLING edge interrupts work
- [ ] CHANGE interrupts work
- [ ] Interrupt count accurate (±2)

### Pin Stability Testing

- [ ] Pins maintain state over 30 seconds
- [ ] No false transitions
- [ ] No glitches or noise

**Tester:** _________________ **Date:** _________

---

## Section 6: Radio Interface Testing

**Test Script:** `radio-interface-test.ino`

### PTT Control Tests

- [ ] PTT activates radio transmission
- [ ] PTT deactivates returns to receive
- [ ] PTT activation time < 100µs
- [ ] PTT isolation circuit works
- [ ] No damage to ESP32 or radio
- [ ] PTT can cycle rapidly (10 times)
- [ ] PTT timing consistent

### COS/Squelch Tests

- [ ] COS detects carrier presence
- [ ] COS inactive with no carrier
- [ ] COS active with carrier present
- [ ] COS debounce working
- [ ] COS transitions clean

### VOX Tests (if using VOX instead of COS)

- [ ] VOX triggers on audio
- [ ] VOX threshold appropriate
- [ ] VOX hang time correct
- [ ] VOX doesn't false-trigger

### Audio Level Tests

**RX Audio:**

- [ ] RX audio reaches ESP32
- [ ] RX audio level appropriate
- [ ] RX audio not clipping
- [ ] RX audio not distorted

| Measurement | Target | Actual | Pass/Fail |
|-------------|--------|--------|-----------|
| RX ADC (min) | > 500 | ______ | [ ] |
| RX ADC (max) | < 3500 | ______ | [ ] |
| RX Peak-to-Peak | 500-3000 | ______ | [ ] |

**TX Audio:**

- [ ] TX audio reaches radio
- [ ] TX audio produces modulation
- [ ] TX deviation within limits
- [ ] TX audio not distorted

| Measurement | Target | Actual | Pass/Fail |
|-------------|--------|--------|-----------|
| TX Deviation (12.5kHz) | ±2.5kHz | ______kHz | [ ] |
| TX Deviation (25kHz) | ±5.0kHz | ______kHz | [ ] |

**Service Monitor Tests:**

- [ ] Deviation measured with service monitor
- [ ] Frequency accuracy verified
- [ ] Modulation quality acceptable
- [ ] No splatter into adjacent channels

**Tester:** _________________ **Date:** _________

---

## Section 7: End-to-End System Testing

**Test Script:** `e2e-validation.ino`

### Connection Tests

- [ ] WiFi connection established
- [ ] Server connection successful
- [ ] Network latency acceptable
- [ ] UDP communication bidirectional

### Audio Path Tests

- [ ] ESP32 → Radio → Server path works
- [ ] Server → Radio → ESP32 path works
- [ ] Two-way conversation possible
- [ ] Audio quality acceptable end-to-end

### Performance Measurements

| Metric | Target | Measured | Pass/Fail |
|--------|--------|----------|-----------|
| Latency | < 100ms | ______ms | [ ] |
| Packet Loss | < 2% | ______% | [ ] |
| Jitter | < 20ms | ______ms | [ ] |
| Audio Quality Score | > 80 | ______/100 | [ ] |
| MOS Score | > 3.5 | ______/5.0 | [ ] |

### Stress Tests

- [ ] System stable for 1 hour continuous operation
- [ ] Can handle rapid PTT cycling
- [ ] No memory leaks over time
- [ ] Temperature remains acceptable
- [ ] No WiFi disconnections under load

**Tester:** _________________ **Date:** _________

---

## Section 8: Safety and Compliance

### Electrical Safety

- [ ] No exposed high voltage
- [ ] Proper isolation implemented
- [ ] Fuses/protection in place (if required)
- [ ] Enclosure grounded if metal
- [ ] No sharp edges
- [ ] Proper wire strain relief

### RF Safety

- [ ] RF exposure within limits
- [ ] Proper antenna installation
- [ ] No RF feedback into audio
- [ ] Adequate shielding

### Regulatory Compliance

- [ ] Operates on licensed frequencies only
- [ ] Deviation within regulatory limits
- [ ] Spurious emissions acceptable
- [ ] Station ID requirements met (if applicable)
- [ ] FCC Part 90/97 compliance (if US)

**Safety Inspector:** _________________ **Date:** _________

---

## Section 9: Documentation Completeness

### Technical Documentation

- [ ] Complete schematic available
- [ ] Wiring diagram documented
- [ ] Component values recorded
- [ ] Configuration file saved
- [ ] Calibration values documented
- [ ] Test results recorded
- [ ] Photos of assembly taken

### User Documentation

- [ ] Operating instructions prepared
- [ ] Troubleshooting guide available
- [ ] Maintenance procedures documented
- [ ] Contact information provided

### Change Control

- [ ] Version number assigned
- [ ] Changes from previous version documented
- [ ] Configuration stored in version control
- [ ] Build date recorded

**Documentation Reviewer:** _________________ **Date:** _________

---

## Section 10: Final Certification

### Overall Assessment

**Total Tests:** _______
**Tests Passed:** _______
**Tests Failed:** _______
**Pass Rate:** _______%

### Critical Issues (if any)

List any critical issues that must be resolved:

1. _________________________________________________
2. _________________________________________________
3. _________________________________________________

### Recommendations

- [ ] Approved for production deployment
- [ ] Approved for field trial
- [ ] Requires minor fixes before deployment
- [ ] Requires major rework
- [ ] Rejected - do not deploy

### Certification Decision

**Status:** [ ] CERTIFIED    [ ] NOT CERTIFIED    [ ] CONDITIONAL

**Conditions (if conditional certification):**

_________________________________________________
_________________________________________________
_________________________________________________

### Sign-Off

**Hardware Technician:**
Name: _____________________
Signature: _________________
Date: _____________________

**Test Engineer:**
Name: _____________________
Signature: _________________
Date: _____________________

**Project Manager:**
Name: _____________________
Signature: _________________
Date: _____________________

### Certification Label

```
┌─────────────────────────────────┐
│  ESP32 RoIP CERTIFIED HARDWARE  │
├─────────────────────────────────┤
│ Serial #: _____________________ │
│ Date: _________________________ │
│ Certified by: _________________ │
│ Valid Until: __________________ │
└─────────────────────────────────┘
```

### Maintenance Schedule

- [ ] Periodic revalidation scheduled (recommended: every 6 months)
- [ ] Next validation date: _________________
- [ ] Maintenance log initiated

---

## Appendix: Common Failure Modes

### Failed Certification - Common Causes

1. **Power Supply Issues**
   - Voltage out of range
   - Insufficient current capacity
   - Excessive ripple

2. **Audio Problems**
   - Wrong coupling components
   - Incorrect polarity
   - Over/under deviation

3. **PTT Failures**
   - No isolation circuit
   - Wrong polarity
   - Defective MOSFET

4. **Network Issues**
   - Poor WiFi signal
   - Incorrect credentials
   - Network congestion

5. **Assembly Errors**
   - Cold solder joints
   - Wrong component values
   - Solder bridges

### Remediation Process

For failed certification:

1. Document all failures
2. Identify root cause
3. Implement corrective actions
4. Retest affected areas
5. Repeat certification process

---

**Document Version:** 1.0
**Last Updated:** 2025-01-22
**Next Review Date:** 2025-07-22
