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

#ifndef _PINS_ESP32S2_H
#define _PINS_ESP32S2_H

/*
Pin definitions for ESP32-S2 Generic Board:

PTT      GPIO16   output
COSLED   GPIO4    output
LED      GPIO15   output (may vary by board)
COS      GPIO17   input

DSTAR    GPIO5    output
DMR      GPIO6    output
YSF      GPIO7    output
P25      GPIO8    output
NXDN     GPIO9    output
POCSAG   GPIO10   output
M17      GPIO11   output
FM       GPIO12   output

RX       GPIO1    analog input (ADC1_CH0)
RSSI     GPIO2    analog input (ADC1_CH1)
TX       GPIO17   analog output (DAC_CH1)

Note: ESP32-S2 is single-core (240MHz LX7) with less RAM (320KB).
      Has 2x 13-bit SAR ADCs and 2x 8-bit DACs.
      Best suited for reduced mode configurations.
*/

// COS input pin
#define PIN_COS           18
#define PORT_COS          0

// PTT output pin
#define PIN_PTT           16
#define PORT_PTT          0

// COSLED output pin
#define PIN_COSLED        4
#define PORT_COSLED       0

// LED output pin
#define PIN_LED           15
#define PORT_LED          0

// Mode LED pins
#define PIN_DSTAR         5
#define PORT_DSTAR        0

#define PIN_DMR           6
#define PORT_DMR          0

#define PIN_YSF           7
#define PORT_YSF          0

#define PIN_P25           8
#define PORT_P25          0

#define PIN_NXDN          9
#define PORT_NXDN         0

#define PIN_POCSAG        10
#define PORT_POCSAG       0

#define PIN_M17           11
#define PORT_M17          0

#define PIN_FM            12
#define PORT_FM           0

// ADC pins (ESP32-S2 has 13-bit ADC)
// RX signal input
#define PIN_RX            1    // ADC1_CH0
#define PIN_RX_CH         ADC1_CHANNEL_0
#define PORT_RX           0

// RSSI input
#define PIN_RSSI          2    // ADC1_CH1
#define PIN_RSSI_CH       ADC1_CHANNEL_1
#define PORT_RSSI         0

// DAC output pin
// ESP32-S2 has 2 DAC channels: GPIO17 (DAC_CH1) and GPIO18 (DAC_CH2)
#define PIN_TX            17
#define PIN_TX_CH         DAC_CHANNEL_1

// Serial pins
#define PIN_SERIAL_TX     43   // USB CDC TX (native USB)
#define PIN_SERIAL_RX     44   // USB CDC RX (native USB)

// Auxiliary serial (UART1)
#define PIN_SERIAL2_TX    17
#define PIN_SERIAL2_RX    18

// ESP32-S2-specific definitions
#define ESP32_CPU_FREQ_MHZ    240
#define ESP32_ADC_WIDTH       ADC_WIDTH_BIT_13   // S2 has 13-bit ADC
#define ESP32_ADC_ATTEN       ADC_ATTEN_DB_11

// Timer configuration
#define ESP32_TIMER_GROUP     TIMER_GROUP_0
#define ESP32_TIMER_IDX       TIMER_0
#define ESP32_TIMER_DIVIDER   80
#define ESP32_TIMER_ALARM     (1000000 / 24000)

// DAC reference
#define ESP32_DAC_MAX         255
#define ESP32_DC_OFFSET       128

// Reduced buffer sizes for ESP32-S2 (less RAM)
#define ESP32S2_TX_RINGBUFFER_SIZE  250U
#define ESP32S2_RX_RINGBUFFER_SIZE  300U
#define ESP32S2_TX_BUFFER_LEN       2000U

#endif // _PINS_ESP32S2_H
