# ESP32 RoIP Audio Calibration Guide

## Table of Contents
- [Overview](#overview)
- [Required Equipment](#required-equipment)
- [Pre-Calibration Checklist](#pre-calibration-checklist)
- [RX Audio Calibration](#rx-audio-calibration)
- [TX Audio Calibration](#tx-audio-calibration)
- [Deviation Adjustment](#deviation-adjustment)
- [Audio Quality Verification](#audio-quality-verification)
- [Troubleshooting](#troubleshooting)

---

## Overview

Proper audio calibration is critical for optimal performance of the ESP32 RoIP system. This guide will walk you through the process of calibrating both receive (RX) and transmit (TX) audio levels to ensure:

- **Optimal audio quality** - Clear, intelligible communications
- **Proper deviation** - Within regulatory limits and channel bandwidth
- **Minimal distortion** - Low THD (Total Harmonic Distortion)
- **Good SNR** - High signal-to-noise ratio
- **Consistent levels** - Predictable audio across all connections

### Why Calibration Matters

- **Under-deviation**: Weak signal, poor range, difficult to hear
- **Over-deviation**: Splatter into adjacent channels, regulatory violations, distortion
- **Improper levels**: Clipping, noise, poor audio quality

---

## Required Equipment

### Essential Equipment

1. **Service Monitor** or **Spectrum Analyzer**
   - For accurate deviation measurement
   - Examples: IFR 1200, HP 8920, Aeroflex 3550

2. **Multimeter** (Digital)
   - For voltage measurements
   - DC and AC voltage capability

3. **Oscilloscope** (Optional but recommended)
   - For waveform analysis
   - Minimum 20 MHz bandwidth

4. **Audio Signal Generator**
   - 1 kHz test tone capability
   - Can use smartphone app or PC software
   - Examples: Audacity, Signal Generator apps

### Alternative Equipment (Budget Option)

If you don't have a service monitor:

1. **Second radio with deviation meter** (if available)
2. **RTL-SDR + software** for rough deviation measurement
3. **Smartphone audio analyzer app** for audio quality checks

### Test Equipment Setup

```
ESP32 ←→ Radio ←→ Service Monitor
         ↓
    Audio Source
    (Test Tone)
```

---

## Pre-Calibration Checklist

### Hardware Verification

- [ ] All connections properly wired according to your radio's configuration
- [ ] Audio coupling capacitors installed with correct polarity
- [ ] PTT isolation circuit installed and tested
- [ ] Ground connections secure (common ground ESP32 ↔ Radio)
- [ ] Power supply stable and adequate

### Software Verification

- [ ] ESP32 firmware loaded and running
- [ ] WiFi connection established
- [ ] Server connection verified
- [ ] Test scripts available (audio-test.ino, etc.)

### Radio Configuration

- [ ] Radio programmed to test frequency
- [ ] Squelch disabled or set to minimum
- [ ] Volume at mid-level
- [ ] All audio processing disabled (compander, noise reduction, etc.)
- [ ] Pre-emphasis/de-emphasis enabled (standard for FM)

---

## RX Audio Calibration

### Step 1: Identify RX Audio Source

**Best to Worst:**

1. **Discriminator Output** ✓ BEST
   - Flat frequency response
   - No filtering
   - Clean audio

2. **Line-level Output** ✓ GOOD
   - Some filtering
   - May have de-emphasis

3. **External Speaker Output** ✗ AVOID
   - Heavy filtering
   - Level too high
   - Poor quality for data

### Step 2: Measure RX Audio Level

#### Using Oscilloscope

1. Connect oscilloscope probe to RX audio point (before coupling cap)
2. Key another radio and transmit 1 kHz tone
3. Measure peak-to-peak voltage

**Target levels by radio brand:**

| Radio Brand | Discriminator Level | Line Level |
|-------------|-------------------|------------|
| Motorola    | 600 mV p-p        | 500 mV p-p |
| Kenwood     | 500 mV p-p        | 400 mV p-p |
| Icom        | 400 mV p-p        | 300 mV p-p |
| Generic     | 300-600 mV p-p    | varies     |

#### Using Multimeter (AC Mode)

1. Set multimeter to AC voltage
2. Measure at RX audio point
3. Multiply RMS reading by 2.828 to get peak-to-peak
   - Example: 150 mV RMS × 2.828 = 424 mV p-p

### Step 3: Adjust RX Input Level

#### Check ADC Reading

Run the audio test:

```bash
# Upload and run audio-test.ino
# Monitor serial output for ADC readings
```

Expected ADC values (ESP32 12-bit ADC, 0-4095):

| Audio Level | ADC Min | ADC Max | Status |
|-------------|---------|---------|--------|
| Too Low     | < 500   | < 1500  | ✗ Increase gain |
| Optimal     | 500     | 3500    | ✓ Good |
| Too High    | > 3500  | 4095    | ✗ Clipping! Reduce |

#### Adjust RX Gain

If ADC levels are not optimal:

**Option 1: Software Gain Adjustment**

```cpp
// In your RoIP firmware
#define RX_AUDIO_GAIN 1.0  // Start here
// Adjust: 0.5 = -6dB, 1.0 = 0dB, 2.0 = +6dB
```

**Option 2: Hardware Adjustment**

Change the input resistor value:

| Target     | Resistor Value | Effect |
|------------|---------------|--------|
| Reduce     | Increase (15kΩ, 22kΩ) | Attenuates signal |
| Increase   | Decrease (4.7kΩ, 6.8kΩ) | Amplifies signal |

### Step 4: Verify RX Audio Quality

Run comprehensive audio test:

```bash
# Run audio-test.ino
# Check for:
# - Noise floor < 50
# - SNR > 40 dB
# - THD < 3%
```

---

## TX Audio Calibration

### Step 1: Set Initial TX Level

**Start conservatively to avoid over-deviation!**

Initial settings by radio brand:

| Radio Brand | DAC Value | Coupling Resistor | Notes |
|-------------|-----------|------------------|-------|
| Motorola    | 128 (50%) | 10kΩ             | Standard |
| Kenwood     | 128 (50%) | 10kΩ             | Standard |
| Icom        | 100 (40%) | 22kΩ             | Very sensitive! |
| Generic     | 100 (40%) | 15kΩ             | Start low |

### Step 2: Generate Test Tone

#### Using ESP32 DAC

The audio-test.ino generates 1 kHz test tone automatically.

#### Using External Source

If using external audio source:

1. Connect audio source to ESP32 audio input
2. Generate 1 kHz sine wave at -20 dBFS
3. Monitor through ESP32 to radio

### Step 3: Measure Deviation

#### Using Service Monitor

1. Connect radio to service monitor RF input
2. Set service monitor to radio frequency
3. Activate PTT on ESP32
4. Generate 1 kHz test tone
5. Read deviation on service monitor

**Target deviation by channel spacing:**

| Channel Spacing | Target Deviation | Maximum | Notes |
|----------------|-----------------|---------|-------|
| 12.5 kHz       | ±2.5 kHz       | ±2.5 kHz | Narrowband |
| 25 kHz         | ±5.0 kHz       | ±5.0 kHz | Wideband |

#### Using RTL-SDR (Approximate Method)

1. Tune RTL-SDR to radio frequency
2. Use SDR# or GQRX with FM demodulator
3. Observe spectrum display
4. Bandwidth of FM signal ≈ 2 × (deviation + modulating frequency)
5. For 1 kHz tone at ±5 kHz deviation: BW ≈ 12 kHz

### Step 4: Adjust TX Level

#### If Under-Deviation (weak signal)

**Option 1: Increase software gain**

```cpp
#define TX_AUDIO_GAIN 1.5  // Increase from 1.0
```

**Option 2: Reduce coupling resistor**

- Change from 22kΩ → 15kΩ → 10kΩ

#### If Over-Deviation (excessive bandwidth)

**CRITICAL: Fix immediately to avoid regulatory violations!**

**Option 1: Decrease software gain**

```cpp
#define TX_AUDIO_GAIN 0.7  // Decrease from 1.0
```

**Option 2: Increase coupling resistor**

- Change from 10kΩ → 15kΩ → 22kΩ → 33kΩ → 47kΩ

**For Icom radios:** May need 47kΩ or even 100kΩ!

### Step 5: Fine-Tune Deviation

Iterate until deviation is within ±10% of target:

| Target  | Acceptable Range | Action if Outside |
|---------|-----------------|-------------------|
| ±2.5kHz | 2.25-2.75 kHz   | Adjust gain       |
| ±5.0kHz | 4.5-5.5 kHz     | Adjust gain       |

### Step 6: Verify Frequency Response

Test at multiple frequencies:

1. **300 Hz** - Low frequency response
2. **1000 Hz** - Reference (should be at target deviation)
3. **3000 Hz** - High frequency response

All should be within ±3 dB of reference level.

---

## Deviation Adjustment

### Understanding FM Deviation

**Deviation** = Maximum frequency shift of carrier

```
For 1 kHz tone at ±5 kHz deviation:
Carrier frequency: fc
When tone is at peak: fc + 5 kHz
When tone is at trough: fc - 5 kHz
```

### Carson's Rule (Bandwidth Calculation)

```
BW ≈ 2 × (Δf + fm)

Where:
  Δf = peak deviation
  fm = modulating frequency
```

Examples:

| Deviation | Mod. Freq | Bandwidth | Channel Spacing |
|-----------|-----------|-----------|----------------|
| ±2.5 kHz  | 3 kHz     | 11 kHz    | 12.5 kHz       |
| ±5 kHz    | 3 kHz     | 16 kHz    | 25 kHz         |

### Modulation Index

```
β = Δf / fm

For good quality:
- β = 0.5 to 1.0 for narrowband
- β = 1.0 to 2.0 for wideband
```

---

## Audio Quality Verification

### Signal-to-Noise Ratio (SNR)

**Target: > 40 dB**

#### Measurement Procedure

1. With no audio input, measure noise floor
2. With 1 kHz tone, measure signal level
3. Calculate: SNR = 20 × log₁₀(Signal/Noise)

### Total Harmonic Distortion (THD)

**Target: < 3%**

#### Using Service Monitor

1. Generate pure 1 kHz sine wave
2. Measure fundamental (1 kHz) and harmonics (2 kHz, 3 kHz, etc.)
3. Service monitor calculates THD automatically

#### Typical THD Values

| Component    | Typical THD | Notes |
|--------------|------------|-------|
| ESP32 DAC    | 2-3%       | Acceptable |
| ESP32 ADC    | 2-4%       | Acceptable |
| Radio TX     | 1-2%       | Good quality radio |
| Radio RX     | 1-2%       | Good quality radio |
| **System**   | **3-5%**   | **Combined** |

### Frequency Response

**Target: ±3 dB from 300-3000 Hz**

#### Test Frequencies

| Frequency | Purpose            | Acceptable Level |
|-----------|--------------------|-----------------|
| 300 Hz    | Low end response   | -3 to +1 dB     |
| 1000 Hz   | Reference (0 dB)   | 0 dB            |
| 3000 Hz   | High end response  | -3 to +1 dB     |

### Audio Spectrum Analysis

Use spectrum analyzer or FFT software:

1. Generate white noise or swept sine
2. Capture RX audio
3. Verify flat response in 300-3000 Hz range

---

## Troubleshooting

### Problem: No RX Audio

**Symptoms:** ESP32 ADC reads constant value (usually ~2048)

**Solutions:**

1. Check audio coupling capacitor polarity
2. Verify radio squelch is open
3. Measure voltage at radio audio output
4. Check for broken wire or poor connection
5. Try different audio source on radio

### Problem: Distorted RX Audio

**Symptoms:** Audio sounds garbled or clipped

**Solutions:**

1. Reduce RX gain (software or hardware)
2. Check ADC for clipping (values at 0 or 4095)
3. Verify coupling capacitor value (should be 10µF)
4. Check for ground loops

### Problem: No TX Audio

**Symptoms:** Radio transmits but no modulation

**Solutions:**

1. Check audio coupling capacitor polarity
2. Verify PTT is activating (LED or meter)
3. Measure voltage at ESP32 DAC output
4. Check for broken wire or poor connection
5. Verify radio mic gain setting

### Problem: Over-Deviation

**Symptoms:** Wide signal on spectrum, splatter, distortion

**Solutions:**

1. **IMMEDIATE:** Reduce TX audio level to 50%
2. Increase TX coupling resistor (try 22kΩ, 33kΩ, 47kΩ)
3. Check deviation with service monitor
4. Verify no audio processing enabled in radio
5. For Icom radios, use higher resistor values (47-100kΩ)

### Problem: Under-Deviation

**Symptoms:** Weak signal, short range, hard to hear

**Solutions:**

1. Increase TX audio level gradually
2. Decrease TX coupling resistor (try 6.8kΩ, 4.7kΩ)
3. Check radio mic gain setting
4. Verify audio source is generating signal
5. Check for attenuating components in audio path

### Problem: Hum or Noise

**Symptoms:** 60 Hz hum or white noise in audio

**Solutions:**

1. Check ground connections (common ground essential)
2. Separate power supplies for ESP32 and radio
3. Add ferrite beads to audio cables
4. Use shielded audio cables
5. Check for ground loops
6. Verify AC coupling capacitors are working

### Problem: Audio Rolloff

**Symptoms:** Muffled audio, low frequencies or high frequencies missing

**Solutions:**

1. Check coupling capacitor value (10µF recommended)
2. Verify pre-emphasis/de-emphasis settings
3. Check for series resistance too high
4. Test frequency response with swept tone
5. Adjust radio audio processing settings

---

## Calibration Record Sheet

Keep a record of your calibration settings:

```
Radio Make/Model: _________________________________
Serial Number: ___________________________________
Date: ____________________________________________

RX AUDIO:
  Source: ________________________________________
  Level at source: _____________ mV p-p
  Coupling resistor: _____________ kΩ
  ADC reading (no signal): ______________________
  ADC reading (with signal): ____________________
  Software gain: ________________________________

TX AUDIO:
  Destination: ___________________________________
  Coupling resistor: _____________ kΩ
  DAC output level: _____________________________
  Measured deviation (1 kHz): ________ kHz
  Target deviation: _____________________________ kHz
  Software gain: ________________________________

AUDIO QUALITY:
  SNR: ______________ dB
  THD: ______________ %
  Frequency response:
    300 Hz: _________ dB
    1000 Hz: ________ dB (reference)
    3000 Hz: ________ dB

NOTES:
_____________________________________________________
_____________________________________________________
_____________________________________________________

Calibrated by: _____________________________________
Signature: ________________________________________
```

---

## References

- ESP32 Technical Reference Manual
- Radio service manual (model-specific)
- FCC Part 90 regulations (if applicable)
- ITU-R SM.328 - Spectra and bandwidth of emissions
- Audio engineering fundamentals

---

**Last Updated:** 2025-01-22
**Version:** 1.0
