# ESP32 RoIP Audio Interface Schematics

## Table of Contents
- [Overview](#overview)
- [Complete Interface Schematic](#complete-interface-schematic)
- [Audio Input Stage](#audio-input-stage)
- [Audio Output Stage](#audio-output-stage)
- [PTT Control Circuit](#ptt-control-circuit)
- [COS Detection Circuit](#cos-detection-circuit)
- [Power Supply](#power-supply)
- [PCB Layout Considerations](#pcb-layout-considerations)
- [Bill of Materials](#bill-of-materials)

---

## Overview

This document provides detailed schematics for the ESP32 RoIP audio interface, including all necessary circuits for connecting to FM radios.

### Design Goals

- **High audio quality** (>40dB SNR, <3% THD)
- **Proper isolation** (protect ESP32 and radio)
- **Low noise** (minimize interference)
- **Reliable operation** (robust against voltage transients)
- **Easy to build** (common components)

---

## Complete Interface Schematic

```
┌────────────────────────────────────────────────────────────────────────┐
│                  ESP32 RoIP Complete Interface Schematic                │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                        POWER SUPPLY                               │  │
│  │                                                                    │  │
│  │   +5V IN ───┬───┬─── 100µF ───┬─── 0.1µF ───┬──→ ESP32 VIN       │  │
│  │             │   │              │             │                    │  │
│  │             │   └── 10µF ──────┴─────────────┴──→ ESP32 3.3V      │  │
│  │             │                                                      │  │
│  │             └───────────────────────────────────→ Radio +V (opt)  │  │
│  │                                                                    │  │
│  │   GND ──────────────────────────────────────────→ Common GND      │  │
│  │                                                                    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    RX AUDIO INPUT STAGE                           │  │
│  │                                                                    │  │
│  │   Radio                10µF                                       │  │
│  │   Disc ────────────────┤├───┬───── 10kΩ ──────→ GPIO36 (ADC)      │  │
│  │   Audio               (C1) │        (R1)                          │  │
│  │                             │                                      │  │
│  │                             └─ 100pF ─→ GND  (optional RF filter) │  │
│  │                                (C5)                               │  │
│  │   Radio                                                           │  │
│  │   GND ──────────────────────────────────────→ ESP32 GND           │  │
│  │                                                                    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    TX AUDIO OUTPUT STAGE                          │  │
│  │                                                                    │  │
│  │   GPIO25 ───── 10µF ──────── 10-22kΩ ──────→ Radio Mic Input     │  │
│  │   (DAC)       (C2)            (R2)                                │  │
│  │                                                                    │  │
│  │   ESP32                                                           │  │
│  │   GND ──────────────────────────────────────→ Radio GND           │  │
│  │                                                                    │  │
│  │   Note: R2 value depends on radio:                                │  │
│  │         Motorola/Kenwood: 10kΩ                                    │  │
│  │         Icom: 22kΩ or higher                                      │  │
│  │                                                                    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    PTT CONTROL CIRCUIT                            │  │
│  │                                                                    │  │
│  │                        10kΩ                                        │  │
│  │   GPIO32 ─────────────┬┬┬──────┐                                  │  │
│  │                              Gate                                 │  │
│  │                             ┌──┴───┐                              │  │
│  │   Radio PTT ────100kΩ───────┤Drain │  2N7000 MOSFET              │  │
│  │                        (R4) │      │                              │  │
│  │   (to Ground)               └──┬───┘                              │  │
│  │                                │Source                            │  │
│  │   ESP32 GND ────────────────────┴────→ Radio GND                  │  │
│  │                                                                    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    COS/SQUELCH INPUT                              │  │
│  │                                                                    │  │
│  │   Radio SQL ────── 10kΩ ──────┬──────→ GPIO33                     │  │
│  │   Output          (R8)        │                                   │  │
│  │                               │                                   │  │
│  │   Optional:                   │                                   │  │
│  │   +3.3V ────── 4.7kΩ ─────────┘                                   │  │
│  │                (R9)         (if weak pull-up needed)              │  │
│  │                                                                    │  │
│  │   Radio GND ──────────────────────────→ ESP32 GND                 │  │
│  │                                                                    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    STATUS LED (Optional)                          │  │
│  │                                                                    │  │
│  │   GPIO2 ────── 330Ω ────── LED ────→ GND                          │  │
│  │               (R10)       (D2)                                    │  │
│  │                                                                    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Audio Input Stage

### Circuit Diagram

```
┌─────────────── RX AUDIO INPUT DETAILED ───────────────┐
│                                                        │
│   Radio Discriminator Output                          │
│   (400-600mV p-p typical)                             │
│          │                                             │
│          │                                             │
│          ├───────┤├────────┐                           │
│          │       C1        │                           │
│          │      10µF       │                           │
│          │    ┌───┐        │                           │
│          │    │ + │        │                           │
│          │    └───┘        │                           │
│          │   (Polarized)   │                           │
│          │                 │                           │
│          │                ┌┴┐                          │
│          │                │ │ R1                       │
│          │                │ │ 10kΩ                     │
│          │                └┬┘                          │
│          │                 │                           │
│          │                 ├───────→ GPIO36 (ADC)      │
│          │                 │         VP Pin            │
│          │                 │         12-bit ADC        │
│          │                 │         0-4095 range      │
│          │                 │                           │
│          │                ┌┴┐                          │
│          │                │ │ Optional                 │
│          │                │ │ C5: 100pF                │
│          │                │ │ RF filter                │
│          │                └┬┘                          │
│          │                 │                           │
│   Radio GND ───────────────┴───────→ ESP32 GND         │
│          │                                             │
│                                                        │
└────────────────────────────────────────────────────────┘

Component Values:
- C1: 10µF electrolytic, 16V min, low ESR
- R1: 10kΩ, 1/4W, 1% tolerance
- C5: 100pF ceramic (optional, for RF filtering)

Function:
- C1: AC coupling, blocks DC component
- R1: High impedance input, current limiting
- C5: Filters out RF interference above ~160kHz

Expected Voltages:
- DC at GPIO36: ~1.65V (ADC midpoint)
- AC component: 0.1-1.0V p-p (depending on signal)
```

### Design Notes

**AC Coupling (C1)**
- Blocks DC voltage from radio
- Passes AC audio signal (300-3000 Hz)
- Cutoff frequency: fc = 1/(2π × R × C)
- With 10µF and 10kΩ: fc ≈ 1.6 Hz (well below audio range)

**Input Impedance**
- 10kΩ presents high impedance to radio
- Doesn't load down radio output
- Suitable for discriminator (high-Z) or line-level

**Protection**
- GPIO36 is input-only, no internal clamping diodes
- Signal should stay within 0-3.3V range
- R1 limits current if voltage exceeds 3.3V

### Transfer Function

```
Vin(radio) → AC coupling → Resistor divider → Vout(GPIO36)

DC component: Removed by C1
AC component: Vin × (Zin / (Zsource + Zin))

Where:
  Zin ≈ R1 = 10kΩ
  Zsource ≈ 600Ω (typical radio output impedance)

Voltage gain: 10k / (600 + 10k) ≈ 0.94 (-0.5dB)
```

---

## Audio Output Stage

### Circuit Diagram

```
┌─────────────── TX AUDIO OUTPUT DETAILED ──────────────┐
│                                                        │
│   GPIO25 (DAC)                                         │
│   8-bit DAC, 0-255                                     │
│   Output range: 0-3.3V                                 │
│          │                                             │
│          │                                             │
│          ├───────┤├────────┐                           │
│          │       C2        │                           │
│          │      10µF       │                           │
│          │    ┌───┐        │                           │
│          │    │ + │        │                           │
│          │    └───┘        │                           │
│          │   (Polarized)   │                           │
│          │                 │                           │
│          │                ┌┴┐                          │
│          │                │ │ R2                       │
│          │                │ │ 10-22kΩ                  │
│          │                │ │ (depends on radio)       │
│          │                └┬┘                          │
│          │                 │                           │
│          │                 ├───────→ Radio Mic Input   │
│          │                 │         (200-400mV typ)   │
│          │                 │                           │
│   ESP32 GND ───────────────┴───────→ Radio GND         │
│          │                                             │
│                                                        │
└────────────────────────────────────────────────────────┘

Component Values:
- C2: 10µF electrolytic, 16V min, low ESR
- R2: Variable depending on radio
  * Motorola: 10kΩ
  * Kenwood: 10kΩ
  * Icom: 22kΩ (or 33kΩ, 47kΩ if over-deviation)
  * Generic: 15kΩ (start here)
- Tolerance: 1% or 5%

Function:
- C2: AC coupling, blocks DC from DAC
- R2: Adjusts audio level, prevents over-deviation

Expected Voltages:
- DC at Radio Mic: 0V (blocked by C2)
- AC component: 100-400mV p-p (depending on R2)
```

### Design Notes

**AC Coupling (C2)**
- Blocks DC bias from ESP32 DAC (typically 1.65V)
- Passes AC audio to radio
- Cutoff frequency with 10µF and 10kΩ: ~1.6 Hz

**Output Impedance Matching**
- R2 creates voltage divider with radio mic input impedance
- Radio mic input: typically 600Ω - 2kΩ
- Output level depends on R2 value

**Level Adjustment**
- Higher R2 = lower audio level = less deviation
- Lower R2 = higher audio level = more deviation
- Start conservative, increase audio level gradually

### Deviation Relationship

```
Deviation ∝ Audio Level ∝ (1 / R2)

For same DAC output:
- R2 = 10kΩ → Higher audio level → More deviation
- R2 = 22kΩ → Lower audio level → Less deviation

Example:
If 10kΩ gives ±6kHz deviation (too much for 25kHz channel)
Then 12kΩ gives ±5kHz deviation (correct)
Ratio: 10/12 = 0.83, so 6kHz × 0.83 = 5kHz
```

---

## PTT Control Circuit

### MOSFET Version (Recommended)

```
┌─────────────── PTT CONTROL DETAILED ──────────────────┐
│                                                        │
│                            10kΩ                        │
│   GPIO32 ───────────────────┬┬┬──────┐                │
│   (Output)             Gate resistor │                │
│                                      │                │
│                                     Gate              │
│                                    ┌──┴───┐           │
│                       Radio PTT    │      │           │
│   Ground-to-Transmit ──┬──────────┤Drain │           │
│                        │          │ Q1   │           │
│                       ┌┴┐         │2N7000│           │
│                  R4   │ │ 100kΩ   │      │           │
│               Pull-up │ │         └──┬───┘           │
│                       └┬┘            │Source          │
│                        │             │                │
│   Radio +V (optional) ─┘             │                │
│   or leave floating                  │                │
│                                      │                │
│   ESP32 GND ─────────────────────────┴───→ Radio GND  │
│                                                        │
└────────────────────────────────────────────────────────┘

Component Specifications:
- Q1: 2N7000 N-channel MOSFET
  * Vds(max): 60V
  * Id(max): 200mA
  * Rds(on): 5Ω @ Vgs=10V
  * Vgs(th): 0.8-3V
- R3: 10kΩ, 1/4W (gate resistor)
- R4: 100kΩ, 1/4W (pull-up, optional)

Alternative MOSFETs:
- BSS138 (smaller, surface mount)
- 2N7002 (similar to 2N7000)
- IRLZ44N (higher current, overkill)

Operation:
GPIO32 HIGH (3.3V) → MOSFET ON → Drain pulled LOW → PTT inactive (RX)
GPIO32 LOW (0V) → MOSFET OFF → Drain floating/pulled HIGH → PTT active (TX)

Wait... this is backwards! Let me correct:

GPIO32 HIGH (3.3V) → Vgs > threshold → MOSFET ON → Drain LOW → PTT grounded → TX
GPIO32 LOW (0V) → Vgs = 0 → MOSFET OFF → Drain HIGH (pulled up) → PTT open → RX

Actually, most radios use active-LOW PTT (ground to transmit).
So we want: GPIO32 LOW → MOSFET OFF → PTT floating (RX)
            GPIO32 HIGH → MOSFET ON → PTT grounded (TX)

But the firmware typically uses: HIGH for RX, LOW for TX

So we need an inverting circuit or just change software logic.

Let's use: GPIO32 LOW → Transmit (so MOSFET must be ON when LOW)
           GPIO32 HIGH → Receive (so MOSFET must be OFF when HIGH)

This requires NPN transistor driver + MOSFET, or PNP for inversion.

For simplicity, most people just configure software as:
digitalWrite(PTT_PIN, LOW) = Transmit
digitalWrite(PTT_PIN, HIGH) = Receive

And wire: GPIO32 LOW → MOSFET ON → PTT grounded → TX
```

### Optocoupler Version (Maximum Isolation)

```
┌─────────── PTT CONTROL (OPTOCOUPLER) ─────────────────┐
│                                                        │
│                        1kΩ                             │
│   GPIO32 ─────────────┬┬┬──────┐                      │
│   (Output)        LED current   │                     │
│                                 │ Anode (1)           │
│                            ┌────┴──────┐              │
│                            │   4N35    │              │
│                          1 │LED     C│5               │
│                            │   ___   O│                │
│   ESP32 GND ───────────────┤  └─┘    L│                │
│                          2 │LED     E│4               │
│                            └─────┬────┘               │
│                                  │Emitter             │
│                                  │                    │
│   Radio GND ─────────────────────┴────────────────────┤
│                                                        │
│                            10kΩ                        │
│   Radio +V (optional) ──────┬┬┬──────┐                │
│                         Pull-up       │                │
│                                       │Collector (5)   │
│                                       │                │
│   Radio PTT ───────────────────────────┘               │
│   (Ground to transmit)                                 │
│                                                        │
└────────────────────────────────────────────────────────┘

Component Specifications:
- U1: 4N35 optocoupler (or 4N25, PC817, EL817)
  * If: 10mA (LED current)
  * Vf: 1.2V (LED forward voltage)
  * Vce(sat): 0.3V
  * CTR: 100% minimum
- R5: 1kΩ (LED current limiting)
- R6: 10kΩ (collector pull-up)

LED Current Calculation:
I = (Vgpio - Vf) / R5
I = (3.3V - 1.2V) / 1kΩ = 2.1mA
(Sufficient for 4N35, can use 470Ω for 4.5mA if needed)

Operation:
GPIO32 HIGH → LED ON → Transistor ON → Collector LOW → PTT grounded → TX
GPIO32 LOW → LED OFF → Transistor OFF → Collector HIGH → PTT open → RX

Advantages:
- Complete galvanic isolation
- No common ground needed (safer for expensive radios)
- Protection from voltage spikes
```

---

## COS Detection Circuit

### Basic Version

```
┌─────────────── COS/SQUELCH INPUT ─────────────────────┐
│                                                        │
│   Radio SQL Output                                     │
│   (Active LOW typical)                                 │
│          │                                             │
│          │                                             │
│          ├──────── 10kΩ ──────┬────→ GPIO33           │
│          │         (R8)       │     (Input)           │
│          │    Current limit   │                       │
│          │                    │                       │
│          │                   ┌┴┐ Optional             │
│          │              R9   │ │ 4.7kΩ                │
│          │           Pull-up │ │ if radio has         │
│          │                   │ │ weak output          │
│          │                   └┬┘                      │
│          │                    │                       │
│          │     +3.3V ─────────┘                       │
│          │                                            │
│   Radio GND ──────────────────────────→ ESP32 GND     │
│                                                        │
└────────────────────────────────────────────────────────┘

Component Values:
- R8: 10kΩ, 1/4W (required for current limiting)
- R9: 4.7kΩ, 1/4W (optional pull-up)

Input Protection:
GPIO33 has internal ESD protection diodes:
- Signal should stay within -0.3V to 3.6V
- R8 limits current to safe levels

Operation:
Radio SQL LOW (0V, carrier detected) → GPIO33 reads LOW
Radio SQL HIGH (3.3V, no carrier) → GPIO33 reads HIGH

Some radios may use opposite polarity - check service manual!
```

### With Additional Protection

```
┌──────── COS INPUT WITH PROTECTION ────────────────────┐
│                                                        │
│   Radio SQL ──┬── 10kΩ ──┬── 4.7kΩ ──┬──→ GPIO33      │
│              │   (R8)   │   (R9)    │                │
│              │          │           │                │
│             ┌┴┐        ┌┴┐         ┌┴┐               │
│        Clamp│ │ 10kΩ   │ │ 4.7kΩ   │ │ 1kΩ           │
│          to │ │     Pull│ │      Add│ │ extra         │
│         GND │ │      up │ │      imp│ │               │
│             └┬┘        └┬┘         └┬┘               │
│              │          │           │                │
│   Radio GND ─┴──────────┘           └──→ +3.3V       │
│                                                        │
│   Provides additional protection against:             │
│   - Negative voltages                                  │
│   - Overvoltage                                        │
│   - ESD                                                │
│                                                        │
└────────────────────────────────────────────────────────┘
```

---

## Power Supply

### Simple USB Power

```
┌──────────────── USB POWER CIRCUIT ────────────────────┐
│                                                        │
│   USB +5V ───┬──── 100µF ───┬──── 0.1µF ───┬──→ VIN   │
│              │    (C3)      │    (C4)     │          │
│              │  Bulk        │  Bypass     │          │
│              │  filtering   │  decoupling │          │
│              │              │             │          │
│              └──────────────┴─────────────┴──→ 3.3V   │
│                             │             │   (ESP32  │
│                             │             │   internal│
│                             │             │   LDO)    │
│   USB GND ──────────────────┴─────────────┴──→ GND    │
│                                                        │
└────────────────────────────────────────────────────────┘

Component Values:
- C3: 100µF electrolytic, 10V min, low ESR
- C4: 0.1µF ceramic, 50V

Purpose:
- C3: Bulk capacitance, filters low-frequency noise
- C4: Decoupling, filters high-frequency noise
```

### External Regulated 5V Supply

```
┌────────── EXTERNAL 5V POWER WITH PROTECTION ──────────┐
│                                                        │
│   External                                             │
│   5V PSU ──┬───┬── 100µF ──┬── 10µF ──┬── 0.1µF ──→ VIN │
│           │   │   (C3)    │  (C6)   │  (C4)         │
│          ┌┴┐  │           │         │               │
│     Fuse │F1  │           │         │               │
│    500mA └┬┘  │           │         │               │
│           │   │           │         │               │
│   External    │           │         │               │
│   GND ────┴───┴───────────┴─────────┴───────────→ GND │
│                                                        │
│   Optional: Add reverse polarity protection           │
│   (1N4001 diode in series, cathode to VIN)           │
│                                                        │
└────────────────────────────────────────────────────────┘
```

---

## PCB Layout Considerations

### Layer Stack (2-layer board)

```
Top Layer:
- Signal traces
- Components
- Ground pour (where possible)

Bottom Layer:
- Ground plane
- Power traces
- Return paths
```

### Critical Layout Rules

1. **Ground Plane**
   - Continuous ground plane on bottom layer
   - Connect all GND points to ground plane
   - Minimize ground loops

2. **Audio Traces**
   - Keep RX and TX audio traces separated
   - Use ground guard traces between sensitive signals
   - Keep traces short and direct

3. **Power Decoupling**
   - Place 0.1µF caps close to ESP32 power pins
   - Place 100µF cap close to power input
   - Use wide power traces (minimum 20 mils)

4. **Digital/Analog Separation**
   - Separate digital and analog ground regions
   - Connect at single point (star ground)

5. **Component Placement**
   - Group related components together
   - Place coupling caps close to ESP32 pins
   - Keep PTT circuit away from audio circuits

### Example PCB Layout

```
┌────────────────────────────────────────────────────┐
│  TOP LAYER                                         │
│                                                    │
│  ┌──────────┐         ┌────────────┐              │
│  │  Power   │         │   ESP32    │              │
│  │ Connector│         │  DevKit    │              │
│  │          │         │            │              │
│  └────┬─────┘         └──┬──┬──┬───┘              │
│       │                  │  │  │                  │
│   ┌───┴───┐         ┌────┴──┴──┴────┐             │
│   │ C3 C4 │         │ Audio Circuits │            │
│   │100µF  │         │ C1 R1  C2 R2   │            │
│   └───────┘         └────────────────┘            │
│                                                    │
│   ┌──────────────┐       ┌──────────────┐         │
│   │ PTT Circuit  │       │ COS Circuit  │         │
│   │ Q1 R3 R4     │       │ R8 R9        │         │
│   └──────────────┘       └──────────────┘         │
│                                                    │
│  ┌────────────────────────────────────────┐       │
│  │  Radio Connector (6-pin or more)       │       │
│  └────────────────────────────────────────┘       │
│                                                    │
│  [Ground Pour in empty spaces]                    │
│                                                    │
└────────────────────────────────────────────────────┘
```

---

## Bill of Materials

### Complete BOM

| Ref | Component | Value | Package | Qty | Notes |
|-----|-----------|-------|---------|-----|-------|
| C1 | Capacitor | 10µF 16V | Electrolytic | 1 | RX audio coupling |
| C2 | Capacitor | 10µF 16V | Electrolytic | 1 | TX audio coupling |
| C3 | Capacitor | 100µF 10V | Electrolytic | 1 | Bulk power filtering |
| C4 | Capacitor | 0.1µF | Ceramic | 2-3 | Decoupling |
| C5 | Capacitor | 100pF | Ceramic | 1 | RF filter (optional) |
| C6 | Capacitor | 10µF 16V | Electrolytic | 1 | Additional filtering |
| R1 | Resistor | 10kΩ | 1/4W, 1% | 1 | RX input |
| R2 | Resistor | 10-22kΩ | 1/4W, 1% | 1 | TX output (radio dependent) |
| R3 | Resistor | 10kΩ | 1/4W | 1 | MOSFET gate |
| R4 | Resistor | 100kΩ | 1/4W | 1 | PTT pull-up |
| R5 | Resistor | 1kΩ | 1/4W | 1 | Optocoupler LED (if used) |
| R6 | Resistor | 10kΩ | 1/4W | 1 | Optocoupler pull-up (if used) |
| R8 | Resistor | 10kΩ | 1/4W | 1 | COS current limit |
| R9 | Resistor | 4.7kΩ | 1/4W | 1 | COS pull-up (optional) |
| R10 | Resistor | 330Ω | 1/4W | 1 | LED current limit (optional) |
| Q1 | MOSFET | 2N7000 | TO-92 | 1 | PTT control |
| U1 | Optocoupler | 4N35 | DIP-6 | 1 | PTT isolation (alternative) |
| D2 | LED | Red 5mm | Through-hole | 1 | Status LED (optional) |
| F1 | Fuse | 500mA | Radial | 1 | Power protection (optional) |
| J1 | Connector | USB Micro/Type-C | - | 1 | Power input |
| J2 | Connector | 6-pin Mini-DIN | - | 1 | Radio connector (or appropriate) |
| - | ESP32 DevKit | - | - | 1 | ESP32-WROOM-32 or similar |

### Recommended Brands/Parts

**Capacitors:**
- Nichicon, Rubycon, Panasonic (electrolytic)
- Murata, TDK, Samsung (ceramic)

**Resistors:**
- Yageo, Vishay, Bourns (metal film, 1%)

**MOSFETs:**
- Fairchild 2N7000, ON Semi 2N7000, NXP BSS138

**Optocouplers:**
- Vishay 4N35, Lite-On LTV-817, Sharp PC817

### Cost Estimate

| Category | Cost (USD) |
|----------|-----------|
| ESP32 DevKit | $8-15 |
| Passive components (R, C) | $5-10 |
| Active components (Q, U, D) | $3-5 |
| Connectors | $5-10 |
| PCB (if custom) | $10-20 |
| Enclosure | $5-15 |
| **Total** | **$36-75** |

---

**Last Updated:** 2025-01-22
**Version:** 1.0
