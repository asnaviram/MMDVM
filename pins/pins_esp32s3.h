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

#ifndef _PINS_ESP32S3_H
#define _PINS_ESP32S3_H

/*
Pin definitions for ESP32-S3 Generic Board:

IMPORTANT: ESP32-S3 does NOT have built-in DAC!
           Must use external DAC via I2S or SPI (e.g., MCP4725, PCM5102)

PTT      GPIO4    output
COSLED   GPIO5    output
LED      GPIO48   output (RGB LED on some DevKits, or GPIO2)
COS      GPIO6    input

DSTAR    GPIO7    output
DMR      GPIO15   output
YSF      GPIO16   output
P25      GPIO17   output
NXDN     GPIO18   output
POCSAG   GPIO8    output
M17      GPIO3    output
FM       GPIO46   output

RX       GPIO1    analog input (ADC1_CH0)
RSSI     GPIO2    analog input (ADC1_CH1)
TX       I2S      External DAC required (GPIO9=BCLK, GPIO10=LRCK, GPIO11=DATA)

Note: ESP32-S3 is dual-core (240MHz LX7) with 512KB RAM.
      Has 2x 12-bit SAR ADCs but NO DAC.
      Best performance but requires external DAC hardware.
*/

// COS input pin
#define PIN_COS           6
#define PORT_COS          0

// PTT output pin
#define PIN_PTT           4
#define PORT_PTT          0

// COSLED output pin
#define PIN_COSLED        5
#define PORT_COSLED       0

// LED output pin (RGB on some S3 DevKits, GPIO48)
#define PIN_LED           48
#define PORT_LED          0

// Mode LED pins
#define PIN_DSTAR         7
#define PORT_DSTAR        0

#define PIN_DMR           15
#define PORT_DMR          0

#define PIN_YSF           16
#define PORT_YSF          0

#define PIN_P25           17
#define PORT_P25          0

#define PIN_NXDN          18
#define PORT_NXDN         0

#define PIN_POCSAG        8
#define PORT_POCSAG       0

#define PIN_M17           3
#define PORT_M17          0

#define PIN_FM            46
#define PORT_FM           0

// ADC pins (ESP32-S3 has 12-bit ADC)
// RX signal input
#define PIN_RX            1    // ADC1_CH0
#define PIN_RX_CH         ADC1_CHANNEL_0
#define PORT_RX           0

// RSSI input
#define PIN_RSSI          2    // ADC1_CH1
#define PIN_RSSI_CH       ADC1_CHANNEL_1
#define PORT_RSSI         0

// I2S pins for external DAC (ESP32-S3 has no built-in DAC)
#define PIN_I2S_BCLK      9    // I2S bit clock
#define PIN_I2S_LRCK      10   // I2S word select (left/right clock)
#define PIN_I2S_DATA      11   // I2S data out

// For compatibility, define PIN_TX but note it's I2S-based
#define PIN_TX            PIN_I2S_DATA
#define PIN_TX_CH         0    // Not used for I2S

// Serial pins (USB native CDC)
#define PIN_SERIAL_TX     43
#define PIN_SERIAL_RX     44

// Auxiliary serial (UART1)
#define PIN_SERIAL2_TX    17
#define PIN_SERIAL2_RX    18

// ESP32-S3-specific definitions
#define ESP32_CPU_FREQ_MHZ    240
#define ESP32_ADC_WIDTH       ADC_WIDTH_BIT_12
#define ESP32_ADC_ATTEN       ADC_ATTEN_DB_11

// Timer configuration
#define ESP32_TIMER_GROUP     TIMER_GROUP_0
#define ESP32_TIMER_IDX       TIMER_0
#define ESP32_TIMER_DIVIDER   80
#define ESP32_TIMER_ALARM     (1000000 / 24000)

// ESP32-S3 uses I2S for DAC - 16-bit samples
#define ESP32S3_I2S_PORT      I2S_NUM_0
#define ESP32S3_I2S_SAMPLE_RATE  24000
#define ESP32S3_I2S_BITS      I2S_BITS_PER_SAMPLE_16BIT
#define ESP32_DC_OFFSET       2048    // 12-bit mid-scale (scaled to 16-bit for I2S)

// Flag to indicate external DAC requirement
#define ESP32S3_EXTERNAL_DAC  1

#endif // _PINS_ESP32S3_H
