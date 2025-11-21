/*
 *   Copyright (C) 2024,2025 by MMDVM ESP32 Port Contributors
 *
 *   This program is free software; you can redistribute it and/or modify
 *   it under the terms of the GNU General Public License as published by
 *   the Free Software Foundation; either version 2 of the License, or
 *   (at your option) any later version.
 *
 *   This program is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU General Public License for more details.
 *
 *   You should have received a copy of the GNU General Public License
 *   along with this program; if not, write to the Free Software
 *   Foundation, Inc., 675 Mass Ave, Cambridge, MA 02139, USA.
 */

/*
 * Pin definitions for ESP32-C5 (RISC-V)
 *
 * ESP32-C5 specifications:
 * - Single-core RISC-V 32-bit @ 240MHz
 * - 400KB SRAM
 * - 12-bit SAR ADC (ADC1: 5 channels)
 * - No built-in DAC (use PWM or I2S)
 * - WiFi 6 (802.11ax) + BLE 5.3
 * - Similar to C3 but with WiFi 6 support
 */

#if !defined(PINS_ESP32C5_H)
#define PINS_ESP32C5_H

// ADC input (RX) - Use ADC1 only to avoid WiFi conflicts
#define PIN_RX          GPIO_NUM_0     // ADC1_CH0
#define PIN_RX_CH       ADC1_CHANNEL_0

// RSSI input (optional)
#define PIN_RSSI        GPIO_NUM_1     // ADC1_CH1
#define PIN_RSSI_CH     ADC1_CHANNEL_1

// DAC output (TX) - ESP32-C5 has no built-in DAC, use PWM or I2S
#define PIN_TX          GPIO_NUM_3     // GPIO3 for PWM DAC
#define PIN_TX_CH       3              // DAC channel (PWM)

// Serial repeater pins (optional)
#define PIN_SERIAL2_RX  GPIO_NUM_18
#define PIN_SERIAL2_TX  GPIO_NUM_19

// PTT (Push-to-Talk) output
#define PIN_PTT         GPIO_NUM_4

// COS (Carrier Operated Squelch) input
#define PIN_COS         GPIO_NUM_5

// Status LEDs
#define PIN_LED         GPIO_NUM_8     // General status LED
#define PIN_COSLED      GPIO_NUM_9     // COS indicator LED

// Mode LEDs (optional)
#if defined(MODE_LEDS)
#define PIN_DSTAR       GPIO_NUM_6     // D-Star mode LED
#define PIN_DMR         GPIO_NUM_7     // DMR mode LED
#define PIN_YSF         GPIO_NUM_10    // YSF mode LED
#define PIN_P25         GPIO_NUM_20    // P25 mode LED
#define PIN_NXDN        GPIO_NUM_21    // NXDN mode LED
#define PIN_POCSAG      GPIO_NUM_22    // POCSAG mode LED
#define PIN_M17         GPIO_NUM_2     // M17 mode LED
#define PIN_FM          GPIO_NUM_23    // FM mode LED
#endif

// ESP32-C5 specific settings
#define ESP32C5_ADC_BITS    12         // 12-bit ADC resolution
#define ESP32C5_ADC_SAMPLES 1          // No hardware averaging

// Buffer sizes (similar to C3)
#define ESP32C5_RX_BUFFER_SIZE  256
#define ESP32C5_TX_BUFFER_SIZE  256

// Timer settings
#define SAMPLE_RATE         24000      // 24kHz sample rate
#define TIMER_DIVIDER       80         // Assuming 80MHz APB clock
#define TIMER_ALARM_VALUE   (1000000 / SAMPLE_RATE)  // ~41.67 for 24kHz

// PWM DAC settings (when USE_PWM_DAC is defined)
// ESP32-C5 only has LOW_SPEED_MODE (no HIGH_SPEED_MODE)
#define PWM_FREQUENCY       78125      // 78.125kHz PWM carrier
#define PWM_RESOLUTION      12         // 12-bit resolution (0-4095)
#define PWM_CHANNEL         LEDC_CHANNEL_0
#define PWM_SPEED_MODE      LEDC_LOW_SPEED_MODE  // Only LOW_SPEED on C5
#define PWM_TIMER           LEDC_TIMER_0

// I2S DAC settings (when USE_I2S_DAC is defined)
#define I2S_SAMPLE_RATE     24000
#define I2S_BITS_PER_SAMPLE 16
#define I2S_BCK_PIN         GPIO_NUM_6
#define I2S_WS_PIN          GPIO_NUM_7
#define I2S_DATA_PIN        GPIO_NUM_3

#endif
