# ESP32 RoIP Wiring Diagrams

## Table of Contents
- [Overview](#overview)
- [Pin Assignments](#pin-assignments)
- [Complete Wiring Diagram](#complete-wiring-diagram)
- [Audio Interface Wiring](#audio-interface-wiring)
- [PTT Control Wiring](#ptt-control-wiring)
- [COS/Squelch Wiring](#cossquelch-wiring)
- [Power Supply Wiring](#power-supply-wiring)
- [Radio-Specific Wiring](#radio-specific-wiring)
- [Testing Points](#testing-points)

---

## Overview

This document provides complete wiring diagrams for connecting an ESP32 to various FM radios for RoIP (Radio over IP) operation.

### Design Principles

- **Isolation**: PTT and COS signals must be isolated
- **AC Coupling**: All audio signals must be AC coupled
- **Common Ground**: ESP32 and radio must share common ground
- **Protection**: Input protection on all GPIO pins
- **Shielding**: Use shielded cables for audio

---

## Pin Assignments

### ESP32 Pin Usage

| GPIO | Function | Direction | Type | Notes |
|------|----------|-----------|------|-------|
| GPIO36 (VP) | RX Audio | Input | ADC1_CH0 | 12-bit ADC, input only |
| GPIO25 | TX Audio | Output | DAC1 | 8-bit DAC |
| GPIO32 | PTT Control | Output | Digital | Active LOW |
| GPIO33 | COS/SQL | Input | Digital | Active LOW, pull-up |
| GPIO2 | Status LED | Output | Digital | Built-in LED |
| GND | Ground | - | Power | Common ground |
| 3.3V | Power | - | Power | ESP32 power |
| 5V/VIN | Power Input | - | Power | USB or external 5V |

### Reserved Pins (Do Not Use for RoIP)

| GPIO | Function | Reason |
|------|----------|--------|
| GPIO0 | Boot Mode | Used for firmware upload |
| GPIO1 | UART TX | Serial communication |
| GPIO3 | UART RX | Serial communication |
| GPIO6-11 | Flash | Connected to SPI flash |
| GPIO34-39 | Input Only | Cannot be used as outputs |

---

## Complete Wiring Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          ESP32 RoIP Interface                        │
└─────────────────────────────────────────────────────────────────────┘

                    ESP32 DevKit                              FM Radio

    ┌───────────────────┐                          ┌──────────────────┐
    │                   │                          │                  │
    │  GPIO36 (ADC) ────┼──────[ RX AUDIO ]───────┤  Discriminator   │
    │                   │      Coupling Circuit    │  Audio Out       │
    │                   │                          │                  │
    │  GPIO25 (DAC) ────┼──────[ TX AUDIO ]───────┤  Microphone      │
    │                   │      Coupling Circuit    │  Input           │
    │                   │                          │                  │
    │  GPIO32 ──────────┼──────[ PTT CTRL ]───────┤  PTT             │
    │                   │      Isolation Circuit   │  (Ground = TX)   │
    │                   │                          │                  │
    │  GPIO33 ──────────┼──────[ COS/SQL ]────────┤  Squelch         │
    │                   │      Protection Circuit  │  Output          │
    │                   │                          │                  │
    │  GND ─────────────┼──────[ GROUND ]─────────┤  Ground          │
    │                   │      Common Ground       │                  │
    │                   │                          │                  │
    │  VIN (+5V) ───────┼──────[ POWER ]           │                  │
    │                   │      USB or ext. PSU     │                  │
    └───────────────────┘                          └──────────────────┘
```

---

## Audio Interface Wiring

### RX Audio (Radio → ESP32)

**Purpose:** Capture audio from radio discriminator/line-out

```
Radio RX Audio Output
  │
  ├──────┤├──────┐           C1: 10µF electrolytic capacitor (16V)
  │      C1      │           R1: 10kΩ resistor (1/4W)
  │              │           Purpose: AC coupling, impedance matching
  │             ┌┴┐
  │             │ │ R1
  │             │ │ 10kΩ
  │             └┬┘
  │              │
  ├──────────────┴──────→ GPIO36 (ESP32 ADC)
  │
Radio Ground ────────────→ ESP32 GND

Component Notes:
- C1 polarity: Positive (+) toward radio
- R1 limits current and provides high input impedance
- Optional: Add 100pF cap across R1 for RF filtering
```

### TX Audio (ESP32 → Radio)

**Purpose:** Send audio from ESP32 to radio microphone input

```
GPIO25 (ESP32 DAC)
  │
  ├──────┤├──────┐           C2: 10µF electrolytic capacitor (16V)
  │      C2      │           R2: 10-22kΩ resistor (1/4W)
  │              │           Note: Higher value for Icom (22kΩ)
  │             ┌┴┐
  │             │ │ R2
  │             │ │ 10-22kΩ
  │             └┬┘
  │              │
  └──────────────┴──────→ Radio Mic Input
  │
ESP32 GND ───────────────→ Radio Ground

Component Notes:
- C2 polarity: Positive (+) toward ESP32
- R2 value depends on radio:
  * Motorola: 10kΩ
  * Kenwood: 10kΩ
  * Icom: 22kΩ (very sensitive input!)
  * Generic: Start with 15kΩ
- Adjust R2 to control deviation
```

### Audio Coupling Circuit (Complete)

```
┌──────────────── RX AUDIO CIRCUIT ────────────────┐
│                                                   │
│  Radio            C1         R1                   │
│  Audio    ───────┤├─────────┬┬┬───→ GPIO36       │
│  Out        10µF │          10kΩ                  │
│                  │                                │
│                  ↓ +                              │
│              (Polarized)                          │
│                                                   │
│  Optional RF Filter:                              │
│  Add 100pF capacitor from GPIO36 to GND          │
│                                                   │
└───────────────────────────────────────────────────┘

┌──────────────── TX AUDIO CIRCUIT ────────────────┐
│                                                   │
│  GPIO25   C2         R2          Radio            │
│   DAC ────┤├─────────┬┬┬────→    Mic              │
│        10µF │     10-22kΩ         Input            │
│             │                                     │
│             ↓ +                                   │
│         (Polarized)                               │
│                                                   │
│  For Icom radios: Use 22kΩ or higher             │
│  For Motorola/Kenwood: Use 10kΩ                  │
│                                                   │
└───────────────────────────────────────────────────┘
```

---

## PTT Control Wiring

### MOSFET-Based PTT Control (Recommended)

**Advantages:** Simple, reliable, low cost

```
┌──────────── PTT CONTROL CIRCUIT (MOSFET) ────────────┐
│                                                        │
│  GPIO32 ────────┬┬┬─────┐                             │
│            10kΩ           │                            │
│                          │ Gate                        │
│                         ┌┴───┐                         │
│                         │2N7000│  Q1: 2N7000 N-FET     │
│  Radio PTT ────┬┬┬──────┤Drain │  R3: 10kΩ gate       │
│          100kΩ │        │      │  R4: 100kΩ pull-up   │
│                │        └┬───┘                        │
│         R4     │         │Source                       │
│                │         │                             │
│  Radio GND ────┴─────────┴──────→ ESP32 GND           │
│                                                        │
│  Operation:                                            │
│  - GPIO32 HIGH → MOSFET OFF → PTT inactive (RX)       │
│  - GPIO32 LOW → MOSFET ON → PTT active (TX)           │
│                                                        │
└────────────────────────────────────────────────────────┘

Parts List:
- Q1: 2N7000 N-channel MOSFET (or BSS138, 2N7002)
- R3: 10kΩ resistor
- R4: 100kΩ resistor
```

### Optocoupler-Based PTT Control (Maximum Isolation)

**Advantages:** Complete galvanic isolation, safer for expensive radios

```
┌────────── PTT CONTROL CIRCUIT (OPTOCOUPLER) ──────────┐
│                                                        │
│  GPIO32 ────────┬┬┬─────┐                             │
│            1kΩ           │                            │
│                         │ Anode                       │
│                    ┌────┴────┐                        │
│                    │  4N35   │  U1: 4N35 optocoupler │
│                  1 │LED   C│5                        │
│                    │      O│                         │
│  ESP32 GND ────────┤      L│────┬┬┬──── Radio PTT    │
│                  2 │LED   E│4   │ 10kΩ               │
│                    └─────────┘   │                    │
│                                  │                    │
│                      Radio GND ──┴─────────────────   │
│                                                        │
│  Operation:                                            │
│  - GPIO32 HIGH → LED OFF → Transistor OFF → PTT open  │
│  - GPIO32 LOW → LED ON → Transistor ON → PTT grounded │
│                                                        │
└────────────────────────────────────────────────────────┘

Parts List:
- U1: 4N35 optocoupler (or 4N25, PC817)
- R5: 1kΩ current-limiting resistor (LED side)
- R6: 10kΩ pull-up resistor (transistor side)
```

### Relay-Based PTT Control (For High Current)

**Use when:** Radio requires more current than MOSFET can handle

```
┌──────────── PTT CONTROL CIRCUIT (RELAY) ──────────────┐
│                                                        │
│  GPIO32 ────┬┬┬──────┐                                │
│        1kΩ           │                                │
│                     │ Base                            │
│                    ┌┴───┐                             │
│  +5V ──────────┬───┤C   │  Q2: 2N2222 NPN transistor │
│                │   │2N2222 K1: 5V relay (SPST)       │
│               ┌┴┐  │    │  D1: 1N4148 flyback diode  │
│               │K1  └┬───┘                            │
│       Relay   └┬┘   │Emitter                         │
│  Coil          │    │                                │
│               ─┴┐   │                                │
│          D1   ──    │                                │
│          ↑         │                                │
│               ─────┴──────→ ESP32 GND                │
│                                                       │
│  Relay Contacts:                                      │
│  Common ────────────→ Radio PTT                      │
│  NC (Not Used)                                        │
│  NO ────────────────→ Radio Ground                   │
│                                                       │
└───────────────────────────────────────────────────────┘

Parts List:
- Q2: 2N2222 NPN transistor
- K1: 5V SPST relay (Omron G5V-2 or similar)
- D1: 1N4148 flyback diode
- R7: 1kΩ base resistor
```

---

## COS/Squelch Wiring

### Basic COS Input

```
┌──────────── COS/SQUELCH INPUT CIRCUIT ────────────────┐
│                                                        │
│  Radio SQL ────────┬┬┬──────────────→ GPIO33          │
│  Output       10kΩ                                    │
│                                                        │
│  Optional pull-up:                                     │
│                                                        │
│  +3.3V ────────┬┬┬──────┐                             │
│           4.7kΩ         │                             │
│                         │                             │
│  Radio SQL ────────┬┬┬──┴──────────→ GPIO33          │
│              10kΩ                                     │
│                                                        │
│  Radio GND ─────────────────────────→ ESP32 GND       │
│                                                        │
│  Operation (typical):                                  │
│  - SQL HIGH (open, 3.3V) → No carrier                 │
│  - SQL LOW (grounded) → Carrier detected              │
│                                                        │
│  Note: Some radios use opposite polarity!             │
│  Check your radio's service manual.                   │
│                                                        │
└────────────────────────────────────────────────────────┘

Parts List:
- R8: 10kΩ current-limiting resistor (required)
- R9: 4.7kΩ pull-up resistor (optional, if needed)
```

---

## Power Supply Wiring

### USB-Powered (Development)

```
┌──────────── USB POWER ────────────────┐
│                                        │
│  USB Connector                         │
│  (Micro-USB or USB-C)                  │
│      │                                 │
│      ├─── +5V ──────→ VIN (ESP32)      │
│      │                                 │
│      ├─── D+/D- (Data, not used)       │
│      │                                 │
│      └─── GND ──────→ GND (ESP32)      │
│                                        │
│  Simple and safe for development       │
│  Max current: ~500mA                   │
│                                        │
└────────────────────────────────────────┘
```

### External 5V Power Supply (Production)

```
┌──────────── EXTERNAL POWER ──────────────┐
│                                           │
│  External 5V PSU                          │
│  (Regulated, 1A or more)                  │
│      │                                    │
│      ├─── +5V ──┬─── 100µF ───┬──→ VIN   │
│      │          │    elec.    │          │
│      │          └── 0.1µF ────┘          │
│      │              ceramic              │
│      │                                    │
│      └─── GND ─────────────────→ GND     │
│                                           │
│  Capacitors for power filtering          │
│  Use short, thick wires                  │
│                                           │
└───────────────────────────────────────────┘

Parts List:
- C3: 100µF electrolytic capacitor (16V)
- C4: 0.1µF ceramic capacitor (50V)
```

### Shared Power with Radio (Advanced)

```
┌──────────── SHARED POWER FROM RADIO ──────────┐
│                                                │
│  Radio +13.8V ─────┬──→ Buck Converter         │
│                    │    (13.8V → 5V)           │
│                   ┌┴───────────┐               │
│                   │ LM2596     │               │
│                   │ Buck       │               │
│                   │ Module     │               │
│                   └┬───────────┘               │
│                    │                           │
│                    ├─── +5V ───→ ESP32 VIN     │
│                    │                           │
│  Radio GND ────────┴─── GND ───→ ESP32 GND     │
│                                                │
│  WARNING: Ensure proper voltage regulation!    │
│  Radio supply can be noisy - add filtering.   │
│                                                │
└────────────────────────────────────────────────┘
```

---

## Radio-Specific Wiring

### Motorola GM300/CDM Series

```
16-Pin Accessory Connector (rear of radio)

Pin 1  (PTT) ────────→ PTT Control Circuit → GPIO32
Pin 2  (GND) ────────→ Common Ground → ESP32 GND
Pin 3  (Disc) ───────→ RX Audio Circuit → GPIO36
Pin 5  (Mic) ────────→ TX Audio Circuit ← GPIO25
Pin 7  (SQL) ────────→ COS Circuit → GPIO33
Pin 9  (+5V) ────────→ (Optional power, max 50mA)

Connector Type: Motorola 16-pin accessory (RJ-45 style)
Cable: Use genuine Motorola cable or build custom
```

### Kenwood TK-780/TM-271

```
6-Pin Mini-DIN Connector (rear of radio)

Pin 1  (SQL) ────────→ COS Circuit → GPIO33
Pin 2  (GND) ────────→ Common Ground → ESP32 GND
Pin 3  (Mic) ────────→ TX Audio Circuit ← GPIO25
Pin 4  (9.6k) ───────→ RX Audio Circuit → GPIO36
Pin 5  (PTT) ────────→ PTT Control Circuit → GPIO32

Connector Type: 6-pin Mini-DIN
Cable: Use genuine Kenwood cable or build custom

Pin Layout (front view):
     ___
  6 /   \ 1
   |  5  |
 4 |     | 2
    \___/
      3
```

### Icom IC-F5021/IC-2720H

```
13-Pin DIN Connector (rear of radio)

Pin 1  (GND) ────────→ Common Ground → ESP32 GND
Pin 2  (AF Out) ─────→ RX Audio Circuit → GPIO36
Pin 4  (PTT) ────────→ PTT Control Circuit → GPIO32
Pin 5  (SQL) ────────→ COS Circuit → GPIO33
Pin 6  (Mod In) ─────→ TX Audio Circuit ← GPIO25 (use 22kΩ!)
Pin 8  (+8V) ────────→ (Optional power, regulated, max 100mA)

Connector Type: 13-pin DIN
Cable: Use genuine Icom cable or build custom

IMPORTANT: Icom has very sensitive mic input!
Use 22kΩ coupling resistor instead of 10kΩ
```

---

## Testing Points

### Voltage Measurements

| Test Point | Expected Voltage | Notes |
|------------|-----------------|-------|
| ESP32 VIN | 5.0V ± 0.25V | Power input |
| ESP32 3.3V | 3.3V ± 0.1V | Regulated output |
| GPIO36 (idle) | ~1.65V | ADC midpoint |
| GPIO25 (idle) | 0V | DAC off |
| GPIO32 (RX) | 3.3V | PTT inactive |
| GPIO32 (TX) | 0V | PTT active |
| GPIO33 (no carrier) | 3.3V | COS inactive |
| GPIO33 (carrier) | 0V | COS active |

### Audio Level Measurements

| Test Point | Tool | Expected |
|------------|------|----------|
| Radio Disc Out | Scope | 400-600mV p-p |
| GPIO36 | Serial | 500-3500 ADC |
| GPIO25 | Scope | Variable (DAC) |
| Radio Mic In | Scope | 200-400mV p-p |

---

## Common Wiring Mistakes

❌ **AVOID THESE ERRORS:**

1. **No PTT Isolation** - Direct GPIO to PTT (can damage ESP32)
2. **Wrong Capacitor Polarity** - Can cause audio distortion
3. **No Common Ground** - Causes hum and noise
4. **Using Speaker Output for RX** - Too much filtering
5. **Under-rated Components** - Use proper voltage ratings
6. **Long Unshielded Cables** - Causes RF interference
7. **No Current Limiting on COS** - Can damage GPIO
8. **Swapped TX/RX Audio** - No audio in one direction

---

## Best Practices

✓ **RECOMMENDATIONS:**

1. Use shielded cable for all audio connections
2. Keep cables as short as practical
3. Use proper connectors (don't solder directly to radio)
4. Label all wires clearly
5. Use heat shrink on all solder joints
6. Test each circuit individually before connecting to radio
7. Document your specific wiring for future reference
8. Use strain relief on all cables
9. Secure ESP32 in enclosure to prevent shorts
10. Add indicator LEDs for PTT and power status

---

**Last Updated:** 2025-01-22
**Version:** 1.0
