# MMDVM ESP32 Multi-Model Porting Guide

## Overview

This guide documents the process of porting MMDVM firmware to ESP32 family microcontrollers (ESP32, ESP32-S2, ESP32-S3, ESP32-C3, ESP32-C6, ESP32-H2) and provides a general framework for porting to new architectures.

## Supported ESP32 Variants

### Xtensa-based Variants (Original)

| Variant | CPU | RAM | ADC | DAC | Status |
|---------|-----|-----|-----|-----|--------|
| ESP32 | Dual-core LX6 240MHz | 520KB | 2x 12-bit SAR | 2x 8-bit | ✅ Fully supported |
| ESP32-S2 | Single-core LX7 240MHz | 320KB | 2x 13-bit SAR | 2x 8-bit | ✅ Fully supported |
| ESP32-S3 | Dual-core LX7 240MHz | 512KB | 2x 12-bit SAR | None* | ✅ Fully supported |

### RISC-V based Variants (New)

| Variant | CPU | RAM | ADC | DAC | WiFi | Status |
|---------|-----|-----|-----|-----|------|--------|
| ESP32-C3 | Single-core RV32 160MHz | 400KB | 12-bit SAR | None* | WiFi 4 + BLE | ✅ Fully supported |
| ESP32-C5 | Single-core RV32 240MHz | 400KB | 12-bit SAR | None* | WiFi 6 + BLE | 🔧 Hardware ready, awaiting Arduino-ESP32 3.0+ |
| ESP32-C6 | Single-core RV32 160MHz | 512KB | 12-bit SAR | None* | WiFi 6 + BLE | 🔧 Hardware ready, awaiting Arduino-ESP32 3.0+ |
| ESP32-H2 | Single-core RV32 96MHz | 320KB | 12-bit SAR | None* | None (BLE only) | 🔧 Hardware ready, awaiting Arduino-ESP32 3.0+ |

*Requires external DAC (PWM with RC filter or I2S DAC chip)

---

## Architecture Requirements

### Hardware Requirements

1. **Sampling Rate**: Fixed 24 kHz (41.67us period)
2. **ADC Resolution**: 12-bit minimum
3. **DAC Resolution**: 8-bit minimum (12-bit preferred)
4. **Timer Precision**: <1us jitter for 24kHz interrupt
5. **UART**: 460800 baud minimum, interrupt-driven
6. **GPIO**: PTT, COS, LED, mode LEDs (8+ pins)
7. **Memory**: ~20KB code, ~8KB RAM minimum

### Software Requirements

1. **CMSIS-DSP**: ARM math library for FIR filters
2. **Real-time ISR**: High-priority timer interrupt
3. **Ring buffers**: Non-blocking TX/RX sample queues

---

## File Structure for New Ports

```
MMDVM/
├── IO<PLATFORM>.cpp          # Hardware abstraction implementation
├── Serial<PLATFORM>.cpp      # UART driver implementation
├── pins/
│   └── pins_<board>.h        # Board-specific pin definitions
├── <Platform>_Lib/           # Platform SDK/HAL (optional)
└── platformio.ini            # Build configuration (for PlatformIO)
```

---

## Step-by-Step Porting Guide

### Step 1: Platform Detection (Globals.h)

Add platform detection macros:

```cpp
#if defined(ESP32)
#include <Arduino.h>
#define ARM_MATH_CM4  // ESP32 uses similar DSP capabilities
#endif
```

### Step 2: Pin Configuration (IOPins.h)

Add new board selector:

```cpp
#elif defined(ESP32_GENERIC)
    #include "pins/pins_esp32.h"
#elif defined(ESP32S2_GENERIC)
    #include "pins/pins_esp32s2.h"
#elif defined(ESP32S3_GENERIC)
    #include "pins/pins_esp32s3.h"
```

### Step 3: Pin Definition File (pins/pins_<board>.h)

Define all required pins:

```cpp
// GPIO pins
#define PIN_PTT     GPIO_NUM_XX
#define PIN_COS     GPIO_NUM_XX
#define PIN_LED     GPIO_NUM_XX
#define PIN_COSLED  GPIO_NUM_XX

// ADC pins
#define PIN_RX      GPIO_NUM_XX
#define PIN_RX_CH   ADC_CHANNEL_X
#define PIN_RSSI    GPIO_NUM_XX
#define PIN_RSSI_CH ADC_CHANNEL_X

// DAC pins
#define PIN_TX      GPIO_NUM_XX
#define PIN_TX_CH   DAC_CHANNEL_X

// Mode LED pins
#define PIN_DSTAR   GPIO_NUM_XX
#define PIN_DMR     GPIO_NUM_XX
#define PIN_YSF     GPIO_NUM_XX
#define PIN_P25     GPIO_NUM_XX
#define PIN_NXDN    GPIO_NUM_XX
#define PIN_M17     GPIO_NUM_XX
#define PIN_POCSAG  GPIO_NUM_XX
#define PIN_FM      GPIO_NUM_XX
```

### Step 4: Hardware Abstraction Layer (IO<PLATFORM>.cpp)

Implement these critical functions:

```cpp
void CIO::initInt()     // Initialize GPIO pins
void CIO::startInt()    // Start ADC, DAC, and timer
void CIO::interrupt()   // 24kHz sampling ISR

// GPIO control
bool CIO::getCOSInt()
void CIO::setLEDInt(bool on)
void CIO::setPTTInt(bool on)
void CIO::setCOSInt(bool on)
void CIO::setDStarInt(bool on)
void CIO::setDMRInt(bool on)
void CIO::setYSFInt(bool on)
void CIO::setP25Int(bool on)
void CIO::setNXDNInt(bool on)
void CIO::setM17Int(bool on)
void CIO::setPOCSAGInt(bool on)
void CIO::setFMInt(bool on)

// Utilities
void CIO::delayInt(unsigned int dly)
uint8_t CIO::getCPU() const
void CIO::getUDID(uint8_t* buffer)
```

### Step 5: Serial Driver (Serial<PLATFORM>.cpp)

Implement these serial functions:

```cpp
void CSerialPort::beginInt(uint8_t n, int speed)
int CSerialPort::availableForReadInt(uint8_t n)
int CSerialPort::availableForWriteInt(uint8_t n)
uint8_t CSerialPort::readInt(uint8_t n)
void CSerialPort::writeInt(uint8_t n, const uint8_t* data, uint16_t length, bool flush)
```

### Step 6: Build Configuration

For PlatformIO (recommended for ESP32):

```ini
[env:esp32]
platform = espressif32
board = esp32dev
framework = arduino
build_flags =
    -DESP32
    -DESP32_GENERIC
    -DARM_MATH_CM4
    -DEXTERNAL_OSC=0
```

---

## ESP32-Specific Implementation Details

### Timer Configuration (24kHz Interrupt)

```cpp
#include <driver/timer.h>

// Timer configuration for 24kHz
#define TIMER_DIVIDER   80          // 80MHz / 80 = 1MHz timer clock
#define TIMER_SCALE     (80000000 / TIMER_DIVIDER)
#define ALARM_VALUE     (TIMER_SCALE / 24000)  // ~41 ticks for 24kHz

void IRAM_ATTR onTimer() {
    io.interrupt();
}
```

### ADC Configuration

```cpp
#include <driver/adc.h>

// ADC1 for RX signal
adc1_config_width(ADC_WIDTH_BIT_12);
adc1_config_channel_atten(ADC1_CHANNEL_X, ADC_ATTEN_DB_11);

// Read ADC
uint16_t sample = adc1_get_raw(ADC1_CHANNEL_X);
```

### DAC Configuration

```cpp
#include <driver/dac.h>

// Enable DAC
dac_output_enable(DAC_CHANNEL_1);

// Write to DAC (8-bit only on ESP32)
dac_output_voltage(DAC_CHANNEL_1, sample >> 4);  // Scale 12-bit to 8-bit
```

### ESP32-S3 External DAC (I2S)

Since ESP32-S3 lacks built-in DAC, use I2S with external DAC:

```cpp
#include <driver/i2s.h>

i2s_config_t i2s_config = {
    .mode = I2S_MODE_MASTER | I2S_MODE_TX,
    .sample_rate = 24000,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 2,
    .dma_buf_len = 64,
    .use_apll = true,
};
```

---

## Memory Optimization for ESP32

### Reduced Buffer Sizes

For memory-constrained variants:

```cpp
#if defined(ESP32S2)
const uint16_t TX_RINGBUFFER_SIZE = 250U;  // Reduced from 500
const uint16_t RX_RINGBUFFER_SIZE = 300U;  // Reduced from 600
const uint16_t TX_BUFFER_LEN = 2000U;      // Reduced from 4000
#endif
```

### IRAM Placement

Place critical functions in IRAM for deterministic timing:

```cpp
void IRAM_ATTR CIO::interrupt() {
    // Critical sampling code
}
```

---

## Common Porting Pitfalls

1. **Timer Jitter**: Ensure timer ISR has highest priority
2. **ADC Latency**: ESP32 ADC can have variable latency; use continuous mode
3. **DAC Resolution**: ESP32 DAC is only 8-bit vs 12-bit on STM32
4. **WiFi Interference**: Disable WiFi/BLE during RX/TX or use careful scheduling
5. **RTOS Task Priority**: Main loop should have high priority
6. **Flash Access**: ISR code must be in IRAM (use IRAM_ATTR)

---

## Testing Checklist

- [ ] 24kHz timer interrupt verified with oscilloscope
- [ ] ADC reading full 12-bit range (0-4095)
- [ ] DAC output verified with oscilloscope
- [ ] Serial communication at 460800 baud stable
- [ ] PTT output toggles correctly
- [ ] COS input reads correctly
- [ ] All mode LEDs functional
- [ ] D-Star mode operational
- [ ] DMR mode operational
- [ ] YSF mode operational
- [ ] P25 mode operational
- [ ] NXDN mode operational
- [ ] M17 mode operational
- [ ] POCSAG mode operational
- [ ] FM mode operational
- [ ] No buffer overflows under full duplex

---

## Pin Mapping Reference

### ESP32 DevKit V1 (30-pin)

| Function | GPIO | Notes |
|----------|------|-------|
| RX (ADC) | GPIO36 (VP) | ADC1_CH0, input only |
| RSSI (ADC) | GPIO39 (VN) | ADC1_CH3, input only |
| TX (DAC) | GPIO25 | DAC_CH1 |
| PTT | GPIO16 | Output |
| COS | GPIO17 | Input |
| LED | GPIO2 | Built-in LED |
| COSLED | GPIO4 | Output |
| DSTAR | GPIO5 | Output |
| DMR | GPIO18 | Output |
| YSF | GPIO19 | Output |
| P25 | GPIO21 | Output |
| NXDN | GPIO22 | Output |
| M17 | GPIO23 | Output |
| UART TX | GPIO1 | Host serial |
| UART RX | GPIO3 | Host serial |

### ESP32-S3 DevKit

| Function | GPIO | Notes |
|----------|------|-------|
| RX (ADC) | GPIO1 | ADC1_CH0 |
| RSSI (ADC) | GPIO2 | ADC1_CH1 |
| TX (I2S) | GPIO15/16 | External DAC via I2S |
| PTT | GPIO4 | Output |
| COS | GPIO5 | Input |
| LED | GPIO48 | RGB LED (optional) |

---

## WiFi UDP Communication

The ESP32 port supports WiFi UDP communication with MMDVMHost, allowing wireless operation.

### Enabling WiFi UDP

In `Config.h` or platformio.ini:

```cpp
#define USE_WIFI_UDP
#define WIFI_SSID "your_ssid"
#define WIFI_PASSWORD "your_password"
#define MMDVM_HOST_ADDRESS "192.168.1.100"
#define MMDVM_HOST_PORT 3200
#define MMDVM_LOCAL_PORT 3201
```

### WiFi/ADC Interference Mitigation

The ESP32 port implements several strategies to minimize WiFi interference:

1. **Dual-Core Isolation**: WiFi runs on Core 0, MMDVM processing on Core 1
2. **ADC1 Only**: Uses ADC1 channels (ADC2 conflicts with WiFi)
3. **Power Save Disabled**: WiFi power save is disabled for consistent timing
4. **Adjustable TX Power**: Can reduce WiFi TX power (2-20 dBm) to reduce interference
5. **Pause/Resume**: `pauseWiFi()` and `resumeWiFi()` for calibration modes

### WiFi Configuration in platformio.ini

```ini
[env:esp32-wifi]
build_flags =
    -DUSE_WIFI_UDP
    -DWIFI_SSID=\"your_ssid\"
    -DWIFI_PASSWORD=\"your_password\"
    -DMMDVM_HOST_ADDRESS=\"192.168.1.100\"
    -DMMDVM_HOST_PORT=3200
    -DWIFI_TX_POWER=15
```

---

## PWM DAC Option

As an alternative to the 8-bit built-in DAC or external I2S DAC, the ESP32 port supports high-quality PWM-based DAC output.

### Benefits of PWM DAC

- **12-bit resolution** (vs 8-bit built-in DAC)
- **Works on all ESP32 variants** including ESP32-S3
- **Simple hardware**: Only requires RC low-pass filter
- **78kHz carrier frequency**: Easy to filter

### PWM DAC Hardware

Required external circuit:
```
GPIO_TX_PIN ----[10kΩ]----+---- Analog Output
                          |
                        [100nF]
                          |
                         GND
```

Filter cutoff: ~160Hz (adjustable with R/C values)

For better quality, use a 2nd order active filter:
```
GPIO ----[10k]----+----[10k]----+---- Output
                  |              |
                [100nF]    [Op-Amp Buffer]
                  |              |
                 GND           GND
```

### Enabling PWM DAC

```cpp
#define USE_PWM_DAC
```

### PWM DAC Configuration

The LEDC peripheral is configured for:
- **Resolution**: 12-bit (0-4095)
- **Frequency**: 78.125kHz carrier
- **High-speed mode**: ESP32 only (low-speed on S2/S3)

---

## Build Configurations

Available PlatformIO environments:

### Xtensa Variants

| Environment | Description |
|-------------|-------------|
| `esp32` | Basic ESP32 with built-in 8-bit DAC |
| `esp32s2` | ESP32-S2 with built-in DAC |
| `esp32s3` | ESP32-S3 with I2S external DAC |
| `esp32-pwm` | ESP32 with PWM DAC (12-bit) |
| `esp32s3-pwm` | ESP32-S3 with PWM DAC |
| `esp32-wifi` | ESP32 with WiFi UDP |
| `esp32-wifi-pwm` | ESP32 with WiFi + PWM DAC |
| `esp32s3-wifi-pwm` | ESP32-S3 with WiFi + PWM DAC |

### RISC-V Variants

| Environment | Description |
|-------------|-------------|
| `esp32c3` | ESP32-C3 with PWM DAC (12-bit) |
| `esp32c3-wifi-pwm` | ESP32-C3 with WiFi + PWM DAC |
| `esp32c5` | ESP32-C5 with PWM DAC (WiFi 6, 240MHz) - Requires Arduino-ESP32 3.0+ |
| `esp32c5-wifi-pwm` | ESP32-C5 with WiFi 6 + PWM DAC - Requires Arduino-ESP32 3.0+ |
| `esp32c6` | ESP32-C6 with PWM DAC (WiFi 6) - Requires Arduino-ESP32 3.0+ |
| `esp32c6-wifi-pwm` | ESP32-C6 with WiFi 6 + PWM DAC - Requires Arduino-ESP32 3.0+ |
| `esp32h2` | ESP32-H2 with PWM DAC (No WiFi) - Requires Arduino-ESP32 3.0+ |

Build command:
```bash
pio run -e esp32c3-wifi-pwm
```

**Note**: ESP32-C5, C6 and H2 support is ready but requires Arduino-ESP32 version 3.0 or later. The environments are currently commented out in platformio.ini until framework support is available.

---

## Version History

- v1.1 (2025-11-21): Added WiFi UDP and PWM DAC support
- v1.0 (2025-11-21): Initial ESP32 port supporting ESP32, ESP32-S2, ESP32-S3

## License

This port follows the same GPL v2 license as the original MMDVM project.

## Contributors

- Original MMDVM: Jonathan Naylor G4KLX and contributors
- ESP32 Port: Community contribution

