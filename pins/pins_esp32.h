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

#ifndef _PINS_ESP32_H
#define _PINS_ESP32_H

/*
Pin definitions for ESP32 Generic Board (ESP32-WROOM-32/WROVER):

PTT      GPIO16   output
COSLED   GPIO4    output
LED      GPIO2    output (built-in LED on most DevKits)
COS      GPIO17   input

DSTAR    GPIO5    output
DMR      GPIO18   output
YSF      GPIO19   output
P25      GPIO21   output
NXDN     GPIO22   output
POCSAG   GPIO23   output
M17      GPIO13   output
FM       GPIO12   output

RX       GPIO36   analog input (ADC1_CH0, VP - input only)
RSSI     GPIO39   analog input (ADC1_CH3, VN - input only)
TX       GPIO25   analog output (DAC_CH1)

Host Serial: UART0 (GPIO1 TX, GPIO3 RX) - USB Serial
Aux Serial:  UART2 (GPIO17 TX, GPIO16 RX) - Optional

Note: ESP32 has limited ADC pins that work during WiFi operation.
      Use ADC1 channels only (ADC2 conflicts with WiFi).
*/

// COS input pin
#define PIN_COS           17
#define PORT_COS          0    // Not used on ESP32 (direct GPIO number)

// PTT output pin
#define PIN_PTT           16
#define PORT_PTT          0

// COSLED output pin
#define PIN_COSLED        4
#define PORT_COSLED       0

// LED output pin (built-in on most ESP32 DevKits)
#define PIN_LED           2
#define PORT_LED          0

// Mode LED pins
#define PIN_DSTAR         5
#define PORT_DSTAR        0

#define PIN_DMR           18
#define PORT_DMR          0

#define PIN_YSF           19
#define PORT_YSF          0

#define PIN_P25           21
#define PORT_P25          0

#define PIN_NXDN          22
#define PORT_NXDN         0

#define PIN_POCSAG        23
#define PORT_POCSAG       0

#define PIN_M17           13
#define PORT_M17          0

#define PIN_FM            12
#define PORT_FM           0

// ADC pins (must use ADC1 for WiFi compatibility)
// RX signal input
#define PIN_RX            36   // VP (ADC1_CH0)
#define PIN_RX_CH         ADC1_CHANNEL_0
#define PORT_RX           0

// RSSI input
#define PIN_RSSI          39   // VN (ADC1_CH3)
#define PIN_RSSI_CH       ADC1_CHANNEL_3
#define PORT_RSSI         0

// DAC output pin
// ESP32 has 2 DAC channels: GPIO25 (DAC_CH1) and GPIO26 (DAC_CH2)
#define PIN_TX            25
#define PIN_TX_CH         DAC_CHANNEL_1

// Serial pins (optional - ESP32 uses UART peripherals)
#define PIN_SERIAL_TX     1    // UART0 TX (USB)
#define PIN_SERIAL_RX     3    // UART0 RX (USB)

// Auxiliary serial (for serial repeater/Nextion)
#define PIN_SERIAL2_TX    17   // UART2 TX
#define PIN_SERIAL2_RX    16   // UART2 RX

// External clock input (optional)
#define PIN_EXT_CLK       0    // Not typically used on ESP32

// ESP32-specific definitions
#define ESP32_CPU_FREQ_MHZ    240
#define ESP32_ADC_WIDTH       ADC_WIDTH_BIT_12
#define ESP32_ADC_ATTEN       ADC_ATTEN_DB_11   // Full scale ~3.3V

// Timer configuration
#define ESP32_TIMER_GROUP     TIMER_GROUP_0
#define ESP32_TIMER_IDX       TIMER_0
#define ESP32_TIMER_DIVIDER   80                 // 80MHz/80 = 1MHz
#define ESP32_TIMER_ALARM     (1000000 / 24000)  // ~41.67 for 24kHz

// DAC reference voltage (8-bit DAC, 0-255 for 0-3.3V)
#define ESP32_DAC_MAX         255
#define ESP32_DC_OFFSET       128    // Mid-scale for 8-bit DAC

#endif // _PINS_ESP32_H
