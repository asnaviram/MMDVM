# ESP32 RoIP Hardware Troubleshooting Guide

## Quick Diagnosis Flowchart

```
Problem?
   │
   ├─→ No Power → Check power supply, USB cable, ESP32 LED
   ├─→ No WiFi → Check antenna, SSID/password, router
   ├─→ No RX Audio → Check coupling circuit, radio output, ground
   ├─→ No TX Audio → Check coupling circuit, DAC output, PTT
   ├─→ PTT Issues → Check isolation circuit, polarity, wiring
   ├─→ Poor Audio → Check levels, deviation, grounding, filtering
   └─→ Network Issues → Check server, firewall, packet loss
```

## Power Supply Issues

### Problem: ESP32 Won't Power On

**Symptoms:**
- No LED illumination
- No USB device detected
- No heat from voltage regulator

**Diagnosis:**
1. Check USB cable (try different cable)
2. Check USB port (try different port/computer)
3. Measure voltage at VIN pin (should be ~5V)
4. Check for shorts between VIN and GND

**Solutions:**
- Replace USB cable
- Use external 5V supply
- Check for damaged ESP32 board
- Verify polarity of external power

### Problem: ESP32 Resets Randomly

**Symptoms:**
- Device reboots unexpectedly
- Brown-out detector triggers
- Serial output shows reset messages

**Diagnosis:**
1. Monitor power supply voltage during operation
2. Check current draw (should be < 500mA)
3. Look for voltage drops when TX activates
4. Check for loose power connections

**Solutions:**
- Use higher capacity power supply (1A minimum)
- Add bulk capacitance (470µF-1000µF)
- Improve power supply wiring
- Reduce WiFi TX power

### Problem: Excessive Heat

**Symptoms:**
- ESP32 very hot to touch
- Voltage regulator extremely hot
- System unstable after warm-up

**Diagnosis:**
1. Measure current draw
2. Check for short circuits
3. Verify proper ventilation
4. Monitor temperature over time

**Solutions:**
- Add heatsink to voltage regulator
- Improve airflow/ventilation
- Check for shorted components
- Use external regulated 3.3V supply

## WiFi Issues

### Problem: Cannot Connect to WiFi

**Symptoms:**
- WiFi connection fails
- Long connection time
- Authentication errors

**Diagnosis:**
1. Verify SSID and password
2. Check WiFi signal strength
3. Verify 2.4GHz network (not 5GHz)
4. Try connecting to different network

**Solutions:**
- Correct SSID/password in firmware
- Move closer to access point
- Check router settings (WPA2 recommended)
- Verify ESP32 antenna connected

### Problem: Weak WiFi Signal

**Symptoms:**
- Low RSSI (< -80 dBm)
- Frequent disconnections
- Slow data transfer

**Diagnosis:**
1. Measure RSSI with wifi-test.ino
2. Check antenna connection
3. Check for RF interference
4. Verify antenna orientation

**Solutions:**
- Use external antenna
- Relocate ESP32 closer to AP
- Change WiFi channel
- Add WiFi repeater/extender

### Problem: WiFi Interferes with Audio

**Symptoms:**
- Noise in audio during WiFi transmission
- ADC readings fluctuate with network activity
- Audible buzzing or clicking

**Diagnosis:**
1. Disconnect WiFi antenna temporarily
2. Monitor ADC readings during network activity
3. Check grounding
4. Test with different WiFi power levels

**Solutions:**
- Reduce WiFi TX power (10-15 dBm)
- Improve ground connections
- Add ferrite beads to audio cables
- Use shielded cables
- Add RF filtering on audio inputs

## Audio Issues

### Problem: No RX Audio

**Symptoms:**
- ADC reads constant value (~2048)
- No audio from radio reaches ESP32
- Tests show no audio activity

**Diagnosis:**
1. Measure voltage at radio audio output (should be AC)
2. Check coupling capacitor with multimeter
3. Verify ground connection
4. Test with external audio source

**Solutions:**
- Check capacitor polarity (+ toward radio)
- Replace defective capacitor
- Verify radio squelch is open
- Check for broken wire
- Verify correct audio source (discriminator, not speaker)

### Problem: No TX Audio

**Symptoms:**
- DAC outputs signal but no modulation
- Radio transmits but no audio
- Zero deviation on service monitor

**Diagnosis:**
1. Measure voltage at GPIO25 DAC (should vary with audio)
2. Check voltage at radio mic input
3. Verify coupling capacitor
4. Check PTT is activating

**Solutions:**
- Check capacitor polarity (+ toward ESP32)
- Replace defective capacitor
- Increase TX audio level
- Reduce coupling resistor value
- Verify radio mic gain setting

### Problem: Distorted RX Audio

**Symptoms:**
- Audio sounds garbled
- Clipping or breakup
- ADC readings at extremes (0 or 4095)

**Diagnosis:**
1. Check ADC readings with audio-test.ino
2. Monitor audio with oscilloscope
3. Check for over-driven input
4. Verify coupling circuit values

**Solutions:**
- Reduce RX audio gain
- Increase coupling resistor (15kΩ, 22kΩ)
- Check radio audio level setting
- Add attenuation if needed

### Problem: Distorted TX Audio

**Symptoms:**
- Audio sounds distorted on receive
- Over-deviation
- Splatter into adjacent channels

**Diagnosis:**
1. Measure deviation with service monitor
2. Check DAC output waveform
3. Verify TX audio level
4. Check for clipping

**Solutions:**
- Reduce TX audio level immediately
- Increase coupling resistor (22kΩ, 33kΩ, 47kΩ)
- Verify proper deviation (±2.5kHz or ±5kHz)
- Check for audio processing in radio

### Problem: Hum or Buzz in Audio

**Symptoms:**
- 60 Hz hum
- Constant noise
- Buzzing during transmission

**Diagnosis:**
1. Check ground connections
2. Measure voltage on audio lines with multimeter (DC mode)
3. Disconnect power and test with battery
4. Check for ground loops

**Solutions:**
- Ensure common ground between ESP32 and radio
- Use separate power supplies
- Add ferrite beads to audio and power cables
- Check capacitor values (use 10µF or larger)
- Verify AC coupling is working

### Problem: Muffled or Tinny Audio

**Symptoms:**
- Poor frequency response
- Missing highs or lows
- Audio doesn't sound natural

**Diagnosis:**
1. Test frequency response with swept tone
2. Check coupling capacitor value
3. Verify pre-emphasis/de-emphasis settings
4. Check for series resistance too high

**Solutions:**
- Use 10µF coupling capacitors (not smaller)
- Check radio audio processing settings
- Verify pre-emphasis enabled
- Test with different audio source

## PTT Issues

### Problem: PTT Won't Activate

**Symptoms:**
- GPIO32 toggles but radio doesn't transmit
- No PTT indication on radio
- Ground-to-transmit doesn't work

**Diagnosis:**
1. Measure voltage at GPIO32 (should toggle 0-3.3V)
2. Check voltage at radio PTT pin
3. Verify MOSFET/optocoupler operation
4. Test PTT manually with jumper wire

**Solutions:**
- Check MOSFET orientation (Source, Drain, Gate)
- Verify optocoupler wiring
- Replace failed MOSFET/optocoupler
- Check radio PTT polarity (most are active-LOW)
- Verify radio PTT is not disabled in programming

### Problem: PTT Stuck On

**Symptoms:**
- Radio transmits continuously
- Cannot return to receive mode
- PTT LED always on

**Diagnosis:**
1. Check GPIO32 software (should be HIGH for RX)
2. Measure voltage at GPIO32
3. Check for short circuit in PTT circuit
4. Verify MOSFET is not always on

**Solutions:**
- Fix software (ensure PTT released)
- Replace shorted MOSFET
- Check for solder bridges
- Verify gate resistor present

### Problem: Slow PTT Response

**Symptoms:**
- Delay before radio transmits
- First syllable cut off
- PTT takes > 100ms to activate

**Diagnosis:**
1. Measure PTT activation time
2. Check MOSFET gate resistor value
3. Verify pull-up resistor present
4. Check radio turn-around time

**Solutions:**
- Reduce gate resistor value (try 4.7kΩ)
- Add smaller pull-up resistor
- Increase software PTT pre-delay
- Check radio programming for PTT delay

## COS/Squelch Issues

### Problem: COS Not Detecting

**Symptoms:**
- GPIO33 doesn't change state
- Squelch events not detected
- COS shows no activity

**Diagnosis:**
1. Measure voltage at radio SQL output
2. Check voltage at GPIO33
3. Verify COS polarity
4. Test with multimeter during squelch changes

**Solutions:**
- Verify COS polarity (check if active-HIGH or active-LOW)
- Check current-limiting resistor present
- Add pull-up resistor if needed (4.7kΩ)
- Enable COS output in radio programming
- Use VOX mode as alternative

### Problem: False COS Triggers

**Symptoms:**
- COS activates with no signal
- Random COS events
- Unstable squelch

**Diagnosis:**
1. Monitor COS pin voltage over time
2. Check for RF interference
3. Verify debounce delay in software
4. Check for loose connections

**Solutions:**
- Increase debounce delay in software
- Add additional filtering (0.1µF cap)
- Check ground connections
- Shield COS cable
- Adjust radio squelch threshold

## Network Issues

### Problem: High Latency

**Symptoms:**
- Latency > 100ms
- Delayed audio
- Poor responsiveness

**Diagnosis:**
1. Run e2e-validation.ino latency test
2. Ping RoIP server
3. Check network congestion
4. Verify WiFi signal strength

**Solutions:**
- Improve WiFi signal
- Reduce network traffic
- Use wired network if possible
- Check server performance
- Reduce audio buffer size

### Problem: Packet Loss

**Symptoms:**
- Audio dropouts
- Choppy audio
- Packet loss > 2%

**Diagnosis:**
1. Run packet loss test
2. Check WiFi signal quality
3. Monitor network traffic
4. Verify router configuration

**Solutions:**
- Improve WiFi signal
- Reduce interference
- Use QoS on router
- Increase UDP buffer size
- Check for network congestion

### Problem: Cannot Connect to Server

**Symptoms:**
- Server connection fails
- Timeout errors
- No response from server

**Diagnosis:**
1. Verify server IP address
2. Check server is running
3. Verify firewall settings
4. Test with different port

**Solutions:**
- Correct server IP in firmware
- Start RoIP server
- Configure firewall to allow UDP ports
- Check router port forwarding

## Interference and Noise

### Problem: RF Interference

**Symptoms:**
- Noise when radio transmits
- ESP32 resets during TX
- Audio degradation during TX

**Diagnosis:**
1. Test with radio in RX only
2. Monitor during TX cycles
3. Check grounding
4. Verify shielding

**Solutions:**
- Improve ground connections
- Add ferrite beads to all cables
- Use shielded cables
- Increase distance between ESP32 and radio
- Add RF chokes on power lines

### Problem: Power Supply Noise

**Symptoms:**
- Noise synchronized with switching frequency
- Visible on oscilloscope at ~50kHz-1MHz
- Audio has high-frequency buzz

**Diagnosis:**
1. Check power supply with oscilloscope
2. Measure voltage ripple
3. Test with battery power
4. Check capacitor values

**Solutions:**
- Add larger filter capacitors
- Use linear power supply
- Add LC filter on power input
- Use separate power supplies for ESP32 and radio

## Mechanical Issues

### Problem: Intermittent Connection

**Symptoms:**
- Connection works sometimes
- Audio cuts in and out
- Problem worsens with movement

**Diagnosis:**
1. Wiggle cables while monitoring
2. Check solder joints
3. Verify connector integrity
4. Check for broken wires

**Solutions:**
- Resolder cold joints
- Replace damaged connectors
- Add strain relief
- Secure all connections
- Use locking connectors

### Problem: Connector Pin Damage

**Symptoms:**
- Bent or broken pins
- Difficult to insert connector
- Intermittent connection

**Diagnosis:**
1. Visual inspection
2. Continuity testing
3. Check for missing pins

**Solutions:**
- Straighten bent pins carefully
- Replace damaged connector
- Use proper connector type
- Add keying to prevent wrong insertion

## Environmental Issues

### Problem: Performance Degrades in Heat

**Symptoms:**
- Works fine when cool
- Fails after running for hours
- Unstable in warm environment

**Diagnosis:**
1. Monitor temperature
2. Test with cooling fan
3. Check component ratings
4. Verify thermal management

**Solutions:**
- Add heatsinks
- Improve ventilation
- Use temperature-rated components
- Add cooling fan
- Reduce power dissipation

### Problem: Moisture Damage

**Symptoms:**
- Corrosion on components
- Erratic behavior
- Short circuits

**Diagnosis:**
1. Visual inspection for corrosion
2. Check for water damage
3. Test in dry environment
4. Verify enclosure sealing

**Solutions:**
- Clean with isopropyl alcohol
- Dry completely before power-on
- Use conformal coating
- Use waterproof enclosure
- Add desiccant packs

## Diagnostic Tools

### Essential Tools

1. **Multimeter** - Voltage, continuity, resistance
2. **Oscilloscope** - Waveform analysis, timing
3. **Service Monitor** - Deviation, modulation
4. **Serial Monitor** - Debug output, test results

### Test Points Summary

| Location | Expected | Tool |
|----------|----------|------|
| VIN | 5.0V ± 0.25V | Multimeter |
| 3.3V | 3.3V ± 0.1V | Multimeter |
| GPIO36 (idle) | ~1.65V DC | Multimeter |
| GPIO36 (signal) | 0.1-1V AC | Oscilloscope |
| GPIO25 (idle) | 0V | Multimeter |
| GPIO25 (signal) | Variable | Oscilloscope |
| GPIO32 (RX) | 3.3V | Multimeter |
| GPIO32 (TX) | 0V | Multimeter |
| Radio PTT (RX) | Open/High | Multimeter |
| Radio PTT (TX) | Ground/Low | Multimeter |
| Deviation | ±2.5 or ±5kHz | Service Monitor |

---

**Last Updated:** 2025-01-22
