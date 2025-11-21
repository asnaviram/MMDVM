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
 * Pin definitions for ESP32-C6 (RISC-V)
 *
 * ESP32-C6 specifications:
 * - Single-core RISC-V 32-bit @ 160MHz
 * - 512KB SRAM
 * - 12-bit SAR ADC (ADC1: 7 channels)
 * - No built-in DAC (use PWM or I2S)
 * - WiFi 6 (802.11ax) + BLE 5.3 + Zigbee/Thread
 * - 30 GPIO pins
 */

#if !defined(PINS_ESP32C6_H)
#define PINS_ESP32C6_H

// ADC input (RX) - Use ADC1 to avoid WiFi conflicts
#define PIN_RX          GPIO_NUM_0     // ADC1_CH0
#define PIN_RX_CH       ADC1_CHANNEL_0

// RSSI input (optional)
#define PIN_RSSI        GPIO_NUM_1     // ADC1_CH1
#define PIN_RSSI_CH     ADC1_CHANNEL_1

// DAC output (TX) - ESP32-C6 has no built-in DAC, use PWM or I2S
#define PIN_TX          GPIO_NUM_4     // GPIO4 for PWM DAC
#define PIN_TX_CH       4              // DAC channel (PWM)

// Serial repeater pins (optional)
#define PIN_SERIAL2_RX  GPIO_NUM_22
#define PIN_SERIAL2_TX  GPIO_NUM_23

// PTT (Push-to-Talk) output
#define PIN_PTT         GPIO_NUM_5

// COS (Carrier Operated Squelch) input
#define PIN_COS         GPIO_NUM_6

// Status LEDs
#define PIN_LED         GPIO_NUM_8     // General status LED
#define PIN_COSLED      GPIO_NUM_9     // COS indicator LED

// Mode LEDs (optional)
#if defined(MODE_LEDS)
#define PIN_DSTAR       GPIO_NUM_10    // D-Star mode LED
#define PIN_DMR         GPIO_NUM_11    // DMR mode LED
#define PIN_YSF         GPIO_NUM_12    // YSF mode LED
#define PIN_P25         GPIO_NUM_13    // P25 mode LED
#define PIN_NXDN        GPIO_NUM_14    // NXDN mode LED
#define PIN_POCSAG      GPIO_NUM_15    // POCSAG mode LED
#define PIN_M17         GPIO_NUM_18    // M17 mode LED
#define PIN_FM          GPIO_NUM_19    // FM mode LED
#endif

// ESP32-C6 specific settings
#define ESP32C6_ADC_BITS    12         // 12-bit ADC resolution
#define ESP32C6_ADC_SAMPLES 1          // No hardware averaging

// Buffer sizes
#define ESP32C6_RX_BUFFER_SIZE  512
#define ESP32C6_TX_BUFFER_SIZE  512

// Timer settings
#define SAMPLE_RATE         24000      // 24kHz sample rate
#define TIMER_DIVIDER       80         // 80MHz APB / 80 = 1MHz timer clock
#define TIMER_ALARM_VALUE   (1000000 / SAMPLE_RATE)  // ~41.67 for 24kHz

// PWM DAC settings (when USE_PWM_DAC is defined)
// ESP32-C6 only has LOW_SPEED_MODE (no HIGH_SPEED_MODE)
#define PWM_FREQUENCY       78125      // 78.125kHz PWM carrier
#define PWM_RESOLUTION      12         // 12-bit resolution (0-4095)
#define PWM_CHANNEL         LEDC_CHANNEL_0
#define PWM_SPEED_MODE      LEDC_LOW_SPEED_MODE  // Only LOW_SPEED on C6
#define PWM_TIMER           LEDC_TIMER_0

// I2S DAC settings (when USE_I2S_DAC is defined)
#define I2S_SAMPLE_RATE     24000
#define I2S_BITS_PER_SAMPLE 16
#define I2S_BCK_PIN         GPIO_NUM_20
#define I2S_WS_PIN          GPIO_NUM_21
#define I2S_DATA_PIN        GPIO_NUM_4

#endif
