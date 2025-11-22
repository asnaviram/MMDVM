# ESP32 RoIP Radio Compatibility Guide

## Overview

This document provides compatibility information for interfacing ESP32 RoIP systems with various FM radio manufacturers and models.

## Compatibility Matrix

### Motorola Radios

| Model | Compatibility | Connector | Audio Quality | PTT | COS | Notes |
|-------|--------------|-----------|---------------|-----|-----|-------|
| GM300 | ✓ Excellent | 16-pin acc | Excellent | ✓ | ✓ | Very common, easy to interface |
| GM350 | ✓ Excellent | 16-pin acc | Excellent | ✓ | ✓ | Similar to GM300 |
| GM360 | ✓ Excellent | 16-pin acc | Excellent | ✓ | ✓ | Newer version |
| GM380 | ✓ Excellent | 16-pin acc | Excellent | ✓ | ✓ | UHF version |
| CDM750 | ✓ Excellent | 16-pin acc | Excellent | ✓ | ✓ | Commercial grade |
| CDM1250 | ✓ Excellent | 16-pin acc | Excellent | ✓ | ✓ | Popular commercial |
| CDM1550 | ✓ Excellent | 16-pin acc | Excellent | ✓ | ✓ | Narrowband capable |
| Maxtrac | ✓ Good | 16-pin acc | Good | ✓ | ✓ | Older model |
| Radius M1225 | ✓ Good | 16-pin acc | Good | ✓ | ✓ | Compact size |
| XPR4550 | ✓ Good | Different | Excellent | ✓ | ✓ | Digital capable, use analog mode |

**Common Specifications:**
- Discriminator Level: 600mV p-p
- Mic Input Level: 300mV p-p
- PTT: Active LOW (ground to transmit)
- COS: Active LOW
- Connector: 16-pin accessory (RJ-45 style)

**Recommended Coupling:**
- RX: 10µF cap + 10kΩ resistor
- TX: 10µF cap + 10kΩ resistor

### Kenwood Radios

| Model | Compatibility | Connector | Audio Quality | PTT | COS | Notes |
|-------|--------------|-----------|---------------|-----|-----|-------|
| TK-760 | ✓ Excellent | 6-pin mini-DIN | Excellent | ✓ | ✓ | VHF commercial |
| TK-780 | ✓ Excellent | 6-pin mini-DIN | Excellent | ✓ | ✓ | Popular model |
| TK-862 | ✓ Excellent | 6-pin mini-DIN | Excellent | ✓ | ✓ | UHF commercial |
| TK-868 | ✓ Excellent | 6-pin mini-DIN | Excellent | ✓ | ✓ | UHF version |
| TK-880 | ✓ Excellent | 6-pin mini-DIN | Excellent | ✓ | ✓ | High power |
| TK-890 | ✓ Excellent | 6-pin mini-DIN | Excellent | ✓ | ✓ | Newer model |
| TK-980 | ✓ Excellent | 6-pin mini-DIN | Excellent | ✓ | ✓ | Base station |
| TM-261 | ✓ Excellent | 6-pin mini-DIN | Excellent | ✓ | ✓ | Amateur 2m |
| TM-271 | ✓ Excellent | 6-pin mini-DIN | Excellent | ✓ | ✓ | Amateur 2m |
| TM-281 | ✓ Excellent | 6-pin mini-DIN | Excellent | ✓ | ✓ | Amateur 2m |
| TM-D710 | ✓ Good | Different | Excellent | ✓ | ✓ | Dual band, data port |

**Common Specifications:**
- Discriminator Level: 500mV p-p (9.6k audio)
- Mic Input Level: 250mV p-p
- PTT: Active LOW (ground to transmit)
- COS/SQL: Active LOW
- Connector: 6-pin mini-DIN

**Recommended Coupling:**
- RX: 10µF cap + 10kΩ resistor
- TX: 10µF cap + 10kΩ resistor

### Icom Radios

| Model | Compatibility | Connector | Audio Quality | PTT | COS | Notes |
|-------|--------------|-----------|---------------|-----|-----|-------|
| IC-F5021 | ✓ Excellent | 13-pin DIN | Excellent | ✓ | ✓ | VHF commercial |
| IC-F6021 | ✓ Excellent | 13-pin DIN | Excellent | ✓ | ✓ | UHF commercial |
| IC-F5061 | ✓ Excellent | 13-pin DIN | Excellent | ✓ | ✓ | Newer VHF |
| IC-F6061 | ✓ Excellent | 13-pin DIN | Excellent | ✓ | ✓ | Newer UHF |
| IC-V8000 | ✓ Good | 13-pin DIN | Good | ✓ | ✓ | VHF mobile |
| IC-U82 | ✓ Good | Varies | Good | ✓ | ⚠ | Portable, limited connector |
| IC-2720H | ✓ Excellent | Data port | Excellent | ✓ | ✓ | Dual band amateur |
| IC-2820H | ✓ Excellent | Data port | Excellent | ✓ | ✓ | Dual band D-STAR |

**Common Specifications:**
- Discriminator Level: 400mV p-p
- Mic Input Level: 200mV p-p (VERY SENSITIVE!)
- PTT: Active LOW (ground to transmit)
- COS/SQL: Active LOW
- Connector: 13-pin DIN or 6-pin data connector

**Recommended Coupling:**
- RX: 10µF cap + 10kΩ resistor
- TX: 10µF cap + **22kΩ resistor** (start high!)

**WARNING:** Icom radios have very sensitive mic inputs. Always start with 22kΩ or higher coupling resistor. Over-deviation is common with Icom radios.

### Yaesu Radios

| Model | Compatibility | Connector | Audio Quality | PTT | COS | Notes |
|-------|--------------|-----------|---------------|-----|-----|-------|
| FT-1500M | ✓ Good | 6-pin mini-DIN | Good | ✓ | ✓ | VHF mobile |
| FT-2600M | ✓ Good | 6-pin mini-DIN | Good | ✓ | ✓ | Dual band |
| FT-7800R | ✓ Good | Data port | Good | ✓ | ✓ | Dual band |
| FT-8800R | ✓ Good | Data port | Good | ✓ | ✓ | Dual band |
| FT-8900R | ✓ Good | Data port | Good | ✓ | ⚠ | Quad band |
| VX-2200 | ✓ Good | Varies | Good | ✓ | ✓ | Commercial VHF |

**Common Specifications:**
- Discriminator Level: 300-500mV p-p
- Mic Input Level: 300mV p-p
- PTT: Active LOW (ground to transmit)
- COS: May require data port

**Recommended Coupling:**
- RX: 10µF cap + 10kΩ resistor
- TX: 10µF cap + 10-15kΩ resistor

### Hytera (HYT) Radios

| Model | Compatibility | Connector | Audio Quality | PTT | COS | Notes |
|-------|--------------|-----------|---------------|-----|-----|-------|
| TM-610 | ✓ Good | Proprietary | Good | ✓ | ✓ | VHF mobile |
| TM-628 | ✓ Good | Proprietary | Good | ✓ | ✓ | UHF mobile |
| MD782 | ⚠ Limited | Different | Fair | ✓ | ⚠ | Digital, use analog mode |

**Recommended Coupling:**
- RX: 10µF cap + 10kΩ resistor
- TX: 10µF cap + 15kΩ resistor

### Vertex Standard Radios

| Model | Compatibility | Connector | Audio Quality | PTT | COS | Notes |
|-------|--------------|-----------|---------------|-----|-----|-------|
| VX-2100 | ✓ Good | 6-pin mini-DIN | Good | ✓ | ✓ | VHF mobile |
| VX-2200 | ✓ Good | 6-pin mini-DIN | Good | ✓ | ✓ | VHF commercial |
| VX-4100 | ✓ Good | 6-pin mini-DIN | Good | ✓ | ✓ | UHF mobile |

**Recommended Coupling:**
- RX: 10µF cap + 10kΩ resistor
- TX: 10µF cap + 10kΩ resistor

## Connector Pinouts by Manufacturer

### Motorola 16-Pin Accessory

```
Pin 1:  PTT (Ground to transmit)
Pin 2:  Ground
Pin 3:  Discriminator Audio Output (RX)
Pin 5:  Microphone Input (TX)
Pin 7:  Squelch Output (Active LOW)
Pin 9:  +5V Output (max 50mA)
```

### Kenwood 6-Pin Mini-DIN

```
     ___
  6 /   \ 1
   |  5  |
 4 |     | 2
    \___/
      3

Pin 1:  SQL Output (Active LOW)
Pin 2:  Ground
Pin 3:  Mic Input (TX)
Pin 4:  9.6k Audio Output (RX)
Pin 5:  PTT (Ground to transmit)
Pin 6:  Not used / +5V on some models
```

### Icom 13-Pin DIN

```
Pin 1:  Ground
Pin 2:  AF Output (Discriminator)
Pin 4:  PTT (Ground to transmit)
Pin 5:  SQL Output (Active LOW)
Pin 6:  Modulation Input (TX)
Pin 8:  +8V Output (regulated, max 100mA)
```

## Audio Level Reference

### Typical Audio Levels by Manufacturer

| Manufacturer | RX Level | TX Level | Coupling Resistor | Notes |
|-------------|----------|----------|------------------|-------|
| Motorola | 600mV p-p | 300mV | 10kΩ | Standard level |
| Kenwood | 500mV p-p | 250mV | 10kΩ | Clean audio |
| Icom | 400mV p-p | 200mV | 22kΩ | Very sensitive TX |
| Yaesu | 400mV p-p | 300mV | 10-15kΩ | Variable |
| Hytera | 500mV p-p | 300mV | 15kΩ | Similar to Motorola |
| Generic | 300-600mV | 200-400mV | 10-22kΩ | Varies widely |

## Special Considerations

### Digital Radios (DMR, D-STAR, Fusion, P25)

**Compatibility:** ⚠ Limited - Analog mode only

- Must be programmed for analog FM mode
- Digital modes are not compatible with RoIP
- Use separate channel for analog
- Some models may not support analog mode

**Tested Digital Radios (Analog Mode):**
- Motorola XPR series (analog mode) ✓
- Hytera MD series (analog mode) ✓
- Icom IC-F series with D-STAR (analog mode) ✓

### Portable Radios

**Compatibility:** ⚠ Limited - Usually not recommended

**Challenges:**
- Often lack accessory connector
- Speaker mic port has limited functionality
- PTT may require special adapter
- Battery drain concerns
- Not designed for continuous operation

**If you must use a portable:**
- Use programming cable port if available
- May need custom adapter
- Use external power supply
- Consider mobile radio instead

### Base Stations and Repeaters

**Compatibility:** ✓ Excellent

- Usually have better audio specs
- Multiple accessory connections
- Designed for continuous operation
- May have dedicated link ports

**Examples:**
- Motorola GR1225 repeater ✓
- Kenwood TKR series ✓
- Icom FR series ✓

## Frequency Band Compatibility

### VHF (136-174 MHz)

- Most common for RoIP applications
- Good propagation characteristics
- Wide radio availability
- **Recommended for most deployments**

### UHF (400-520 MHz)

- Also well-supported
- Better in buildings
- Shorter range than VHF
- **Good alternative to VHF**

### Other Bands

- 220 MHz: Limited radio availability
- 900 MHz: Specialized radios only
- HF: Not recommended (different modulation)

## Channel Spacing

### Narrowband (12.5 kHz)

- Deviation: ±2.5 kHz
- Required in many areas
- Better spectrum efficiency
- Slightly lower audio quality

**Configuration:**
```
TX_DEVIATION_TARGET = 2500 // Hz
```

### Wideband (25 kHz)

- Deviation: ±5 kHz
- Traditional spacing
- Better audio quality
- More spectrum usage

**Configuration:**
```
TX_DEVIATION_TARGET = 5000 // Hz
```

## Programming Requirements

### Motorola

- Software: CPS (Customer Programming Software)
- Cable: RIB box or USB programming cable
- Settings:
  - Enable accessory connector
  - Set deviation (±2.5kHz or ±5kHz)
  - Enable COS output
  - Disable compander (recommended)

### Kenwood

- Software: KPG (Kenwood Programming Software)
- Cable: USB programming cable (KPG-22U or similar)
- Settings:
  - Enable accessory connector (if required)
  - Set deviation
  - Enable SQL output
  - Mic gain: 50-70%

### Icom

- Software: CS cloning software
- Cable: OPC series programming cable
- Settings:
  - Enable accessory connector
  - Set deviation
  - Mic gain: 30-50% (start low!)
  - Enable SQL output

## Tested Configurations

### Configuration 1: Motorola GM300 + ESP32

```yaml
Radio: Motorola GM300
ESP32: Generic DevKit V1
RX Resistor: 10kΩ
TX Resistor: 10kΩ
RX Capacitor: 10µF
TX Capacitor: 10µF
PTT: 2N7000 MOSFET
Deviation: ±5kHz (25kHz channel)
Result: ✓ Excellent - Production Ready
```

### Configuration 2: Kenwood TK-780 + ESP32

```yaml
Radio: Kenwood TK-780
ESP32: Generic DevKit V1
RX Resistor: 10kΩ
TX Resistor: 10kΩ
RX Capacitor: 10µF
TX Capacitor: 10µF
PTT: 2N7000 MOSFET
Deviation: ±5kHz (25kHz channel)
Result: ✓ Excellent - Production Ready
```

### Configuration 3: Icom IC-F5021 + ESP32

```yaml
Radio: Icom IC-F5021
ESP32: Generic DevKit V1
RX Resistor: 10kΩ
TX Resistor: 22kΩ (initially 10kΩ, over-deviated)
RX Capacitor: 10µF
TX Capacitor: 10µF
PTT: 4N35 Optocoupler (recommended for Icom)
Deviation: ±5kHz (25kHz channel)
Result: ✓ Good - Required resistor adjustment
```

## Incompatible Radios

### Known Incompatibilities

- **Trunked radios** - Not suitable for RoIP
- **Digital-only radios** - No analog mode
- **Some CB radios** - Different modulation (AM/SSB)
- **FRS/GMRS bubble pack radios** - No accessory connector
- **HF radios** - Different modulation (SSB/CW)

## Future Radio Support

To request support for additional radio models:

1. Provide radio make/model
2. Service manual (especially connector pinout)
3. Audio level specifications
4. PTT/COS polarity information
5. Test results if available

Submit requests via GitHub issues.

---

**Last Updated:** 2025-01-22
**Version:** 1.0
