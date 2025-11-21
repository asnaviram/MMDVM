/*
 *   Copyright (C) 2024,2025 by MMDVM ESP32 Port Contributors
 *   Based on IOSTM.cpp by Jim McLaughlin KI6ZUM, Andy Uribe CA6JAU,
 *   Jonathan Naylor G4KLX, and BG5HHP
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
#include "IO.h"

#if defined(ESP32) || defined(ESP32S2) || defined(ESP32S3)

#include "IOPins.h"
#include <driver/adc.h>
#include <driver/timer.h>
#include <esp_system.h>

// ESP32 has 8-bit DAC, ESP32-S3 requires I2S external DAC
#if !defined(ESP32S3)
#include <driver/dac.h>
#endif

#if defined(ESP32S3)
#include <driver/i2s.h>
#endif

// Sampling frequency - must be exactly 24kHz
#define SAMP_FREQ   24000

// DC offset for samples
#if defined(ESP32S3)
// 12-bit samples scaled for I2S output
const uint16_t DC_OFFSET = 2048U;
#else
// 8-bit DAC centered at 128
const uint16_t DC_OFFSET = 2048U;  // Internal processing still uses 12-bit
#endif

// Timer ISR handler - must be in IRAM for deterministic timing
static hw_timer_t* s_timer = NULL;
static volatile bool s_timerReady = false;

// Forward declaration for ISR
void IRAM_ATTR onTimerISR();

#if defined(ESP32S3)
// I2S DMA buffer for ESP32-S3 external DAC
static int16_t s_i2sTxBuffer[64];
static volatile uint8_t s_i2sBufIdx = 0;
#endif

// Timer ISR - called at 24kHz
void IRAM_ATTR onTimerISR()
{
    if (s_timerReady) {
        io.interrupt();
    }
}

void CIO::initInt()
{
    // Initialize GPIO pins

    // PTT output
    pinMode(PIN_PTT, OUTPUT);
    digitalWrite(PIN_PTT, LOW);

    // COSLED output
    pinMode(PIN_COSLED, OUTPUT);
    digitalWrite(PIN_COSLED, LOW);

    // LED output
    pinMode(PIN_LED, OUTPUT);
    digitalWrite(PIN_LED, LOW);

    // COS input
    pinMode(PIN_COS, INPUT);

#if defined(MODE_LEDS)
    // Mode LED pins
    pinMode(PIN_DSTAR, OUTPUT);
    digitalWrite(PIN_DSTAR, LOW);

    pinMode(PIN_DMR, OUTPUT);
    digitalWrite(PIN_DMR, LOW);

    pinMode(PIN_YSF, OUTPUT);
    digitalWrite(PIN_YSF, LOW);

    pinMode(PIN_P25, OUTPUT);
    digitalWrite(PIN_P25, LOW);

#if !defined(USE_ALTERNATE_NXDN_LEDS)
    pinMode(PIN_NXDN, OUTPUT);
    digitalWrite(PIN_NXDN, LOW);
#endif

#if !defined(USE_ALTERNATE_M17_LEDS)
    pinMode(PIN_M17, OUTPUT);
    digitalWrite(PIN_M17, LOW);
#endif

#if !defined(USE_ALTERNATE_POCSAG_LEDS)
    pinMode(PIN_POCSAG, OUTPUT);
    digitalWrite(PIN_POCSAG, LOW);
#endif

#if !defined(USE_ALTERNATE_FM_LEDS)
    pinMode(PIN_FM, OUTPUT);
    digitalWrite(PIN_FM, LOW);
#endif

#endif // MODE_LEDS
}

void CIO::startInt()
{
    // Configure ADC for RX input
#if defined(ESP32S2)
    // ESP32-S2 has 13-bit ADC
    adc1_config_width(ADC_WIDTH_BIT_13);
#else
    // ESP32 and ESP32-S3 have 12-bit ADC
    adc1_config_width(ADC_WIDTH_BIT_12);
#endif

    // Configure attenuation for full 0-3.3V range
    adc1_config_channel_atten(PIN_RX_CH, ADC_ATTEN_DB_11);

#if defined(SEND_RSSI_DATA)
    adc1_config_channel_atten(PIN_RSSI_CH, ADC_ATTEN_DB_11);
#endif

    // Configure DAC output
#if defined(ESP32S3)
    // ESP32-S3 has no built-in DAC - use I2S with external DAC
    i2s_config_t i2s_config = {
        .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX),
        .sample_rate = SAMP_FREQ,
        .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
        .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
        .communication_format = I2S_COMM_FORMAT_STAND_I2S,
        .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
        .dma_buf_count = 4,
        .dma_buf_len = 64,
        .use_apll = true,
        .tx_desc_auto_clear = true,
        .fixed_mclk = 0
    };

    i2s_pin_config_t pin_config = {
        .mck_io_num = I2S_PIN_NO_CHANGE,
        .bck_io_num = PIN_I2S_BCLK,
        .ws_io_num = PIN_I2S_LRCK,
        .data_out_num = PIN_I2S_DATA,
        .data_in_num = I2S_PIN_NO_CHANGE
    };

    i2s_driver_install(I2S_NUM_0, &i2s_config, 0, NULL);
    i2s_set_pin(I2S_NUM_0, &pin_config);
    i2s_zero_dma_buffer(I2S_NUM_0);
#else
    // ESP32 and ESP32-S2 have built-in 8-bit DAC
    dac_output_enable((dac_channel_t)PIN_TX_CH);
#endif

    // Configure hardware timer for 24kHz interrupt
    // Timer clock = 80MHz (APB clock)
    // Divider = 80 -> 1MHz timer clock
    // Alarm = 1000000/24000 = ~41.67 -> 42 for close to 24kHz

    s_timer = timerBegin(0, 80, true);  // Timer 0, divider 80, count up
    timerAttachInterrupt(s_timer, &onTimerISR, true);  // Edge triggered
    timerAlarmWrite(s_timer, 42, true);  // 42 ticks at 1MHz = 23.81kHz (closest to 24kHz)

    // Enable the timer
    s_timerReady = true;
    timerAlarmEnable(s_timer);

    // Set initial LED states
    digitalWrite(PIN_COSLED, LOW);
    digitalWrite(PIN_LED, HIGH);
}

void IRAM_ATTR CIO::interrupt()
{
    TSample sample = {DC_OFFSET, MARK_NONE};
    uint16_t rawRSSI = 0U;

    // Get sample from TX buffer
    m_txBuffer.get(sample);

    // Output to DAC
#if defined(ESP32S3)
    // ESP32-S3: Output via I2S to external DAC
    // Scale 12-bit sample to 16-bit for I2S
    int16_t i2sSample = (int16_t)((sample.sample - 2048) << 4);
    size_t bytes_written;
    i2s_write(I2S_NUM_0, &i2sSample, sizeof(i2sSample), &bytes_written, 0);
#else
    // ESP32/S2: Scale 12-bit sample to 8-bit for built-in DAC
    uint8_t dacValue = sample.sample >> 4;  // 12-bit to 8-bit
    dac_output_voltage((dac_channel_t)PIN_TX_CH, dacValue);
#endif

    // Read ADC input
#if defined(ESP32S2)
    // ESP32-S2: 13-bit ADC, scale to 12-bit
    sample.sample = adc1_get_raw(PIN_RX_CH) >> 1;
#else
    // ESP32/S3: 12-bit ADC
    sample.sample = adc1_get_raw(PIN_RX_CH);
#endif

#if defined(SEND_RSSI_DATA)
#if defined(ESP32S2)
    rawRSSI = adc1_get_raw(PIN_RSSI_CH) >> 1;
#else
    rawRSSI = adc1_get_raw(PIN_RSSI_CH);
#endif
#endif

    // Store samples in buffers
    m_rxBuffer.put(sample);
    m_rssiBuffer.put(rawRSSI);

    // Increment watchdog counter
    m_watchdog++;
}

bool CIO::getCOSInt()
{
    return digitalRead(PIN_COS) == HIGH;
}

void CIO::setLEDInt(bool on)
{
    digitalWrite(PIN_LED, on ? HIGH : LOW);
}

void CIO::setPTTInt(bool on)
{
    digitalWrite(PIN_PTT, on ? HIGH : LOW);
}

void CIO::setCOSInt(bool on)
{
    digitalWrite(PIN_COSLED, on ? HIGH : LOW);
}

void CIO::setDStarInt(bool on)
{
#if defined(MODE_LEDS)
    digitalWrite(PIN_DSTAR, on ? HIGH : LOW);
#endif
}

void CIO::setDMRInt(bool on)
{
#if defined(MODE_LEDS)
    digitalWrite(PIN_DMR, on ? HIGH : LOW);
#endif
}

void CIO::setYSFInt(bool on)
{
#if defined(MODE_LEDS)
    digitalWrite(PIN_YSF, on ? HIGH : LOW);
#endif
}

void CIO::setP25Int(bool on)
{
#if defined(MODE_LEDS)
    digitalWrite(PIN_P25, on ? HIGH : LOW);
#endif
}

void CIO::setNXDNInt(bool on)
{
#if defined(MODE_LEDS)
#if defined(USE_ALTERNATE_NXDN_LEDS)
    digitalWrite(PIN_YSF, on ? HIGH : LOW);
    digitalWrite(PIN_P25, on ? HIGH : LOW);
#else
    digitalWrite(PIN_NXDN, on ? HIGH : LOW);
#endif
#endif
}

void CIO::setM17Int(bool on)
{
#if defined(MODE_LEDS)
#if defined(USE_ALTERNATE_M17_LEDS)
    digitalWrite(PIN_DSTAR, on ? HIGH : LOW);
    digitalWrite(PIN_P25, on ? HIGH : LOW);
#else
    digitalWrite(PIN_M17, on ? HIGH : LOW);
#endif
#endif
}

void CIO::setPOCSAGInt(bool on)
{
#if defined(MODE_LEDS)
#if defined(USE_ALTERNATE_POCSAG_LEDS)
    digitalWrite(PIN_DSTAR, on ? HIGH : LOW);
    digitalWrite(PIN_DMR, on ? HIGH : LOW);
#else
    digitalWrite(PIN_POCSAG, on ? HIGH : LOW);
#endif
#endif
}

void CIO::setFMInt(bool on)
{
#if defined(MODE_LEDS)
#if defined(USE_ALTERNATE_FM_LEDS)
    digitalWrite(PIN_DSTAR, on ? HIGH : LOW);
    digitalWrite(PIN_YSF, on ? HIGH : LOW);
#else
    digitalWrite(PIN_FM, on ? HIGH : LOW);
#endif
#endif
}

void CIO::delayInt(unsigned int dly)
{
    // Use ESP32's delay function (milliseconds)
    delay(dly);
}

uint8_t CIO::getCPU() const
{
    // Return CPU type identifier for ESP32 family
#if defined(ESP32S3)
    return 5U;  // ESP32-S3
#elif defined(ESP32S2)
    return 4U;  // ESP32-S2
#else
    return 3U;  // ESP32 (original)
#endif
}

void CIO::getUDID(uint8_t* buffer)
{
    // Get ESP32's unique chip ID (MAC address)
    uint64_t chipId = ESP.getEfuseMac();

    // Copy to buffer (12 bytes for compatibility with STM32 UID)
    buffer[0] = (chipId >> 0) & 0xFF;
    buffer[1] = (chipId >> 8) & 0xFF;
    buffer[2] = (chipId >> 16) & 0xFF;
    buffer[3] = (chipId >> 24) & 0xFF;
    buffer[4] = (chipId >> 32) & 0xFF;
    buffer[5] = (chipId >> 40) & 0xFF;
    // Pad remaining bytes with chip info
    buffer[6] = ESP.getChipRevision();
    buffer[7] = ESP.getChipCores();
    buffer[8] = (ESP.getCpuFreqMHz() >> 0) & 0xFF;
    buffer[9] = (ESP.getCpuFreqMHz() >> 8) & 0xFF;
    buffer[10] = 0xE5;  // 'E' for ESP32
    buffer[11] = 0x32;  // '32'
}

#endif // ESP32 || ESP32S2 || ESP32S3
