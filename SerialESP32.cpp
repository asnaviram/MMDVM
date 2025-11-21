/*
 *   Copyright (C) 2024,2025 by MMDVM ESP32 Port Contributors
 *   Based on SerialSTM.cpp by Jim McLaughlin KI6ZUM, Andy Uribe CA6JAU,
 *   and Jonathan Naylor G4KLX
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

#include "Config.h"
#include "Globals.h"
#include "SerialPort.h"

#if defined(ESP32) || defined(ESP32S2) || defined(ESP32S3)

#include "IOPins.h"
#include <HardwareSerial.h>

/*
ESP32 Serial Port Configuration:

Serial Port 1 (n=1): Host communication
  - ESP32: UART0 (USB-Serial, GPIO1 TX, GPIO3 RX)
  - ESP32-S2/S3: USB CDC native or UART0
  - Default baud: 460800

Serial Port 3 (n=3): Serial repeater (Nextion, etc.)
  - ESP32: UART2 (GPIO17 TX, GPIO16 RX) or UART1
  - Configurable pins
  - Default baud: 9600 (SERIAL_REPEATER_BAUD_RATE)

Note: ESP32 has 3 hardware UARTs:
  - UART0: Default for USB-Serial bridge (GPIO1/3)
  - UART1: Available, but default pins may conflict with flash
  - UART2: Fully available for custom use (ESP32 only, not on S2/S3)

ESP32-S2/S3 have USB CDC for native USB communication.
*/

// Use Arduino Serial objects
// Serial (UART0) - Host communication (USB)
// Serial1 (UART1) - Available
// Serial2 (UART2) - Serial repeater (ESP32 only)

#if defined(ESP32S2) || defined(ESP32S3)
// ESP32-S2/S3 only have UART0 and UART1
// UART0 is typically used for USB CDC
// Use UART1 for serial repeater
static HardwareSerial SerialRepeater(1);  // UART1
#else
// ESP32 has UART0, UART1, UART2
// UART0 for host, UART2 for repeater
static HardwareSerial SerialRepeater(2);  // UART2
#endif

// Buffer sizes for serial ports
#define SERIAL_RX_BUFFER_SIZE  512
#define SERIAL_TX_BUFFER_SIZE  512

void CSerialPort::beginInt(uint8_t n, int speed)
{
    switch (n) {
        case 1U:
            // Host serial port - use built-in Serial (UART0/USB)
            Serial.begin(speed);
            Serial.setRxBufferSize(SERIAL_RX_BUFFER_SIZE);
            // Wait for serial port to be ready
            while (!Serial && millis() < 3000) {
                ; // Wait up to 3 seconds for USB CDC
            }
            break;

        case 3U:
            // Serial repeater port
#if defined(SERIAL_REPEATER)
#if defined(ESP32S2) || defined(ESP32S3)
            // ESP32-S2/S3: Use UART1 with custom pins
            SerialRepeater.begin(speed, SERIAL_8N1, PIN_SERIAL2_RX, PIN_SERIAL2_TX);
#else
            // ESP32: Use UART2 with custom pins
            SerialRepeater.begin(speed, SERIAL_8N1, PIN_SERIAL2_RX, PIN_SERIAL2_TX);
#endif
            SerialRepeater.setRxBufferSize(SERIAL_RX_BUFFER_SIZE);
#endif
            break;

        default:
            break;
    }
}

int CSerialPort::availableForReadInt(uint8_t n)
{
    switch (n) {
        case 1U:
            return Serial.available();

        case 3U:
#if defined(SERIAL_REPEATER)
            return SerialRepeater.available();
#else
            return 0;
#endif

        default:
            return 0;
    }
}

int CSerialPort::availableForWriteInt(uint8_t n)
{
    switch (n) {
        case 1U:
            return Serial.availableForWrite();

        case 3U:
#if defined(SERIAL_REPEATER)
            return SerialRepeater.availableForWrite();
#else
            return 0;
#endif

        default:
            return 0;
    }
}

uint8_t CSerialPort::readInt(uint8_t n)
{
    switch (n) {
        case 1U:
            return Serial.read();

        case 3U:
#if defined(SERIAL_REPEATER)
            return SerialRepeater.read();
#else
            return 0U;
#endif

        default:
            return 0U;
    }
}

void CSerialPort::writeInt(uint8_t n, const uint8_t* data, uint16_t length, bool flush)
{
    switch (n) {
        case 1U:
            Serial.write(data, length);
            if (flush)
                Serial.flush();
            break;

        case 3U:
#if defined(SERIAL_REPEATER)
            SerialRepeater.write(data, length);
            if (flush)
                SerialRepeater.flush();
#endif
            break;

        default:
            break;
    }
}

#endif // ESP32 || ESP32S2 || ESP32S3
