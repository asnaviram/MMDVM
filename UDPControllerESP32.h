/*
 *   Copyright (C) 2024,2025 by MMDVM ESP32 Port Contributors
 *
 *   UDP Controller for ESP32 WiFi Communication with MMDVMHost
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

#ifndef _UDP_CONTROLLER_ESP32_H
#define _UDP_CONTROLLER_ESP32_H

#if defined(ESP32) || defined(ESP32S2) || defined(ESP32S3)
#if defined(USE_WIFI_UDP)

#include <WiFi.h>
#include <WiFiUdp.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <freertos/queue.h>
#include <freertos/semphr.h>

// UDP buffer sizes
#define UDP_RX_BUFFER_SIZE  2048
#define UDP_TX_BUFFER_SIZE  2048
#define UDP_PACKET_SIZE     512

// WiFi task configuration
// Run WiFi on Core 0 to isolate from MMDVM processing on Core 1
#define WIFI_TASK_CORE      0
#define WIFI_TASK_PRIORITY  1
#define WIFI_TASK_STACK     4096

// WiFi connection states
enum WiFiState {
    WIFI_STATE_DISCONNECTED = 0,
    WIFI_STATE_CONNECTING,
    WIFI_STATE_CONNECTED,
    WIFI_STATE_ERROR
};

class CUDPController {
public:
    CUDPController();
    ~CUDPController();

    // Initialize WiFi and UDP
    bool init(const char* ssid, const char* password,
              const char* hostAddress, uint16_t hostPort,
              uint16_t localPort);

    // Start/stop the UDP controller
    void start();
    void stop();

    // Data interface (thread-safe)
    int available();
    uint8_t read();
    void write(const uint8_t* data, uint16_t length);
    void flush();

    // Status
    WiFiState getWiFiState() const { return m_wifiState; }
    bool isConnected() const { return m_wifiState == WIFI_STATE_CONNECTED; }
    int getRSSI() const;
    IPAddress getLocalIP() const;

    // WiFi control
    void setWiFiPowerSave(bool enable);
    void setTxPower(int8_t power);  // dBm, 2-20

    // ADC interference mitigation
    void pauseWiFi();   // Pause WiFi during critical ADC operations
    void resumeWiFi();  // Resume WiFi after critical operations

private:
    // WiFi configuration
    char m_ssid[33];
    char m_password[65];
    char m_hostAddress[64];
    uint16_t m_hostPort;
    uint16_t m_localPort;

    // WiFi/UDP objects
    WiFiUDP m_udp;
    WiFiState m_wifiState;
    bool m_started;
    bool m_paused;

    // Thread-safe circular buffers
    uint8_t m_rxBuffer[UDP_RX_BUFFER_SIZE];
    volatile uint16_t m_rxHead;
    volatile uint16_t m_rxTail;

    uint8_t m_txBuffer[UDP_TX_BUFFER_SIZE];
    volatile uint16_t m_txHead;
    volatile uint16_t m_txTail;

    // FreeRTOS synchronization
    SemaphoreHandle_t m_rxMutex;
    SemaphoreHandle_t m_txMutex;
    TaskHandle_t m_wifiTaskHandle;

    // Internal methods
    void connectWiFi();
    void processRx();
    void processTx();

    // Static task wrapper
    static void wifiTaskWrapper(void* parameter);
    void wifiTask();

    // Buffer helpers
    uint16_t rxAvailable() const;
    uint16_t txAvailable() const;
    void rxPut(uint8_t byte);
    uint8_t rxGet();
    void txPut(uint8_t byte);
    uint8_t txGet();
};

// Global instance
extern CUDPController udpController;

#endif // USE_WIFI_UDP
#endif // ESP32

#endif // _UDP_CONTROLLER_ESP32_H
