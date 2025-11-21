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

#include "Config.h"

#if defined(ESP32) || defined(ESP32S2) || defined(ESP32S3)
#if defined(USE_WIFI_UDP)

#include "UDPControllerESP32.h"
#include <esp_wifi.h>
#include <esp_pm.h>

// Global instance
CUDPController udpController;

/*
 * WiFi/ADC Interference Mitigation Strategy:
 *
 * 1. WiFi runs on Core 0, MMDVM processing runs on Core 1
 * 2. ADC1 is used for analog input (ADC2 conflicts with WiFi)
 * 3. WiFi power management is disabled for consistent timing
 * 4. TX power can be reduced if interference is observed
 * 5. pauseWiFi()/resumeWiFi() can temporarily disable WiFi TX during
 *    critical ADC sampling if needed (not normally required)
 * 6. UDP packets are buffered and processed asynchronously
 *
 * The 24kHz timer ISR runs at highest priority and is not affected
 * by WiFi operations. However, heavy WiFi traffic can cause minor
 * jitter in non-ISR code.
 */

CUDPController::CUDPController() :
    m_hostPort(0),
    m_localPort(0),
    m_wifiState(WIFI_STATE_DISCONNECTED),
    m_started(false),
    m_paused(false),
    m_rxHead(0),
    m_rxTail(0),
    m_txHead(0),
    m_txTail(0),
    m_rxMutex(NULL),
    m_txMutex(NULL),
    m_wifiTaskHandle(NULL)
{
    memset(m_ssid, 0, sizeof(m_ssid));
    memset(m_password, 0, sizeof(m_password));
    memset(m_hostAddress, 0, sizeof(m_hostAddress));
    memset(m_rxBuffer, 0, sizeof(m_rxBuffer));
    memset(m_txBuffer, 0, sizeof(m_txBuffer));
}

CUDPController::~CUDPController()
{
    stop();
}

bool CUDPController::init(const char* ssid, const char* password,
                          const char* hostAddress, uint16_t hostPort,
                          uint16_t localPort)
{
    if (ssid == NULL || hostAddress == NULL)
        return false;

    strncpy(m_ssid, ssid, sizeof(m_ssid) - 1);
    if (password != NULL)
        strncpy(m_password, password, sizeof(m_password) - 1);
    strncpy(m_hostAddress, hostAddress, sizeof(m_hostAddress) - 1);
    m_hostPort = hostPort;
    m_localPort = localPort;

    // Create mutexes for thread-safe buffer access
    m_rxMutex = xSemaphoreCreateMutex();
    m_txMutex = xSemaphoreCreateMutex();

    if (m_rxMutex == NULL || m_txMutex == NULL)
        return false;

    return true;
}

void CUDPController::start()
{
    if (m_started)
        return;

    m_started = true;

    // Create WiFi task on Core 0 (MMDVM runs on Core 1)
    xTaskCreatePinnedToCore(
        wifiTaskWrapper,
        "WiFiTask",
        WIFI_TASK_STACK,
        this,
        WIFI_TASK_PRIORITY,
        &m_wifiTaskHandle,
        WIFI_TASK_CORE
    );
}

void CUDPController::stop()
{
    if (!m_started)
        return;

    m_started = false;

    // Stop the WiFi task
    if (m_wifiTaskHandle != NULL) {
        vTaskDelete(m_wifiTaskHandle);
        m_wifiTaskHandle = NULL;
    }

    // Close UDP
    m_udp.stop();

    // Disconnect WiFi
    WiFi.disconnect(true);
    m_wifiState = WIFI_STATE_DISCONNECTED;

    // Clean up mutexes
    if (m_rxMutex != NULL) {
        vSemaphoreDelete(m_rxMutex);
        m_rxMutex = NULL;
    }
    if (m_txMutex != NULL) {
        vSemaphoreDelete(m_txMutex);
        m_txMutex = NULL;
    }
}

void CUDPController::wifiTaskWrapper(void* parameter)
{
    CUDPController* controller = static_cast<CUDPController*>(parameter);
    controller->wifiTask();
}

void CUDPController::wifiTask()
{
    // Initial WiFi connection
    connectWiFi();

    while (m_started) {
        // Check WiFi connection
        if (WiFi.status() != WL_CONNECTED) {
            m_wifiState = WIFI_STATE_DISCONNECTED;
            connectWiFi();
        }

        if (!m_paused && m_wifiState == WIFI_STATE_CONNECTED) {
            // Process incoming UDP packets
            processRx();

            // Send pending TX data
            processTx();
        }

        // Yield to other tasks - small delay to prevent CPU hogging
        vTaskDelay(pdMS_TO_TICKS(1));
    }

    vTaskDelete(NULL);
}

void CUDPController::connectWiFi()
{
    m_wifiState = WIFI_STATE_CONNECTING;

    // Configure WiFi for station mode
    WiFi.mode(WIFI_STA);

    // Disable WiFi power saving for consistent timing
    // This is critical for ADC/DAC interference mitigation
    esp_wifi_set_ps(WIFI_PS_NONE);

    // Start connection
    WiFi.begin(m_ssid, m_password);

    // Wait for connection (with timeout)
    uint32_t startTime = millis();
    while (WiFi.status() != WL_CONNECTED && (millis() - startTime) < 30000) {
        vTaskDelay(pdMS_TO_TICKS(100));
    }

    if (WiFi.status() == WL_CONNECTED) {
        m_wifiState = WIFI_STATE_CONNECTED;

        // Start UDP listener
        m_udp.begin(m_localPort);

        // Log connection info (if debug enabled)
#if defined(DEBUG_WIFI)
        Serial.print("WiFi connected, IP: ");
        Serial.println(WiFi.localIP());
#endif
    } else {
        m_wifiState = WIFI_STATE_ERROR;
    }
}

void CUDPController::processRx()
{
    int packetSize = m_udp.parsePacket();
    if (packetSize > 0) {
        uint8_t buffer[UDP_PACKET_SIZE];
        int bytesRead = m_udp.read(buffer, min(packetSize, (int)UDP_PACKET_SIZE));

        if (bytesRead > 0 && xSemaphoreTake(m_rxMutex, pdMS_TO_TICKS(10)) == pdTRUE) {
            // Copy to circular buffer
            for (int i = 0; i < bytesRead; i++) {
                rxPut(buffer[i]);
            }
            xSemaphoreGive(m_rxMutex);
        }
    }
}

void CUDPController::processTx()
{
    if (xSemaphoreTake(m_txMutex, pdMS_TO_TICKS(10)) == pdTRUE) {
        uint16_t available = txAvailable();

        if (available > 0) {
            uint8_t buffer[UDP_PACKET_SIZE];
            uint16_t toSend = min(available, (uint16_t)UDP_PACKET_SIZE);

            for (uint16_t i = 0; i < toSend; i++) {
                buffer[i] = txGet();
            }

            xSemaphoreGive(m_txMutex);

            // Send UDP packet
            m_udp.beginPacket(m_hostAddress, m_hostPort);
            m_udp.write(buffer, toSend);
            m_udp.endPacket();
        } else {
            xSemaphoreGive(m_txMutex);
        }
    }
}

int CUDPController::available()
{
    int count = 0;
    if (xSemaphoreTake(m_rxMutex, pdMS_TO_TICKS(10)) == pdTRUE) {
        count = rxAvailable();
        xSemaphoreGive(m_rxMutex);
    }
    return count;
}

uint8_t CUDPController::read()
{
    uint8_t byte = 0;
    if (xSemaphoreTake(m_rxMutex, pdMS_TO_TICKS(10)) == pdTRUE) {
        if (rxAvailable() > 0) {
            byte = rxGet();
        }
        xSemaphoreGive(m_rxMutex);
    }
    return byte;
}

void CUDPController::write(const uint8_t* data, uint16_t length)
{
    if (data == NULL || length == 0)
        return;

    if (xSemaphoreTake(m_txMutex, pdMS_TO_TICKS(10)) == pdTRUE) {
        for (uint16_t i = 0; i < length; i++) {
            txPut(data[i]);
        }
        xSemaphoreGive(m_txMutex);
    }
}

void CUDPController::flush()
{
    // Force immediate TX processing is handled by the task
    // This is a no-op for the async model
}

int CUDPController::getRSSI() const
{
    if (m_wifiState == WIFI_STATE_CONNECTED) {
        return WiFi.RSSI();
    }
    return 0;
}

IPAddress CUDPController::getLocalIP() const
{
    return WiFi.localIP();
}

void CUDPController::setWiFiPowerSave(bool enable)
{
    if (enable) {
        esp_wifi_set_ps(WIFI_PS_MIN_MODEM);
    } else {
        esp_wifi_set_ps(WIFI_PS_NONE);
    }
}

void CUDPController::setTxPower(int8_t power)
{
    // ESP32 TX power range: 2-20 dBm
    // Lower power = less ADC interference but shorter range
    power = constrain(power, 2, 20);
    esp_wifi_set_max_tx_power(power * 4);  // API uses 0.25dBm units
}

void CUDPController::pauseWiFi()
{
    // Temporarily pause WiFi TX/RX for critical ADC operations
    // This can be called during calibration or high-precision sampling
    m_paused = true;

    // Give WiFi task time to finish current operations
    vTaskDelay(pdMS_TO_TICKS(5));
}

void CUDPController::resumeWiFi()
{
    m_paused = false;
}

// Circular buffer helpers

uint16_t CUDPController::rxAvailable() const
{
    if (m_rxHead >= m_rxTail) {
        return m_rxHead - m_rxTail;
    }
    return UDP_RX_BUFFER_SIZE - m_rxTail + m_rxHead;
}

uint16_t CUDPController::txAvailable() const
{
    if (m_txHead >= m_txTail) {
        return m_txHead - m_txTail;
    }
    return UDP_TX_BUFFER_SIZE - m_txTail + m_txHead;
}

void CUDPController::rxPut(uint8_t byte)
{
    uint16_t nextHead = (m_rxHead + 1) % UDP_RX_BUFFER_SIZE;
    if (nextHead != m_rxTail) {
        m_rxBuffer[m_rxHead] = byte;
        m_rxHead = nextHead;
    }
    // Overflow: oldest data is lost (tail remains)
}

uint8_t CUDPController::rxGet()
{
    if (m_rxTail == m_rxHead)
        return 0;
    uint8_t byte = m_rxBuffer[m_rxTail];
    m_rxTail = (m_rxTail + 1) % UDP_RX_BUFFER_SIZE;
    return byte;
}

void CUDPController::txPut(uint8_t byte)
{
    uint16_t nextHead = (m_txHead + 1) % UDP_TX_BUFFER_SIZE;
    if (nextHead != m_txTail) {
        m_txBuffer[m_txHead] = byte;
        m_txHead = nextHead;
    }
}

uint8_t CUDPController::txGet()
{
    if (m_txTail == m_txHead)
        return 0;
    uint8_t byte = m_txBuffer[m_txTail];
    m_txTail = (m_txTail + 1) % UDP_TX_BUFFER_SIZE;
    return byte;
}

#endif // USE_WIFI_UDP
#endif // ESP32
