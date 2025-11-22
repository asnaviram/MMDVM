/*
 * ESP32 RoIP - Opus Codec Wrapper Implementation
 * Professional Audio Codec with FEC, DTX, and Error Handling
 */

#include "../include/codec_opus.h"
#include <opus.h>
#include <cstring>
#include <algorithm>

// Forward declare Serial for logging
extern HardwareSerial Serial;

// Macros for lock/unlock with timeout
#define OPUS_LOCK_TIMEOUT_MS 5000

// Helper to convert from libopus error codes to our OpusError enum
// Note: libopus OPUS_OK is defined as 0 (int), we need OpusError type
#define OPUS_ERR_TO_ROIP(err) (static_cast<OpusError>(err))

/*
 * Constructor - Initialize codec wrapper
 */
OpusCodec::OpusCodec()
    : encoder(nullptr),
      decoder(nullptr),
      sample_rate(OPUS_SAMPLE_RATE),
      channels(1),
      bitrate(OPUS_DEFAULT_BITRATE),
      complexity(OPUS_DEFAULT_COMPLEXITY),
      frame_size_ms(OPUS_DEFAULT_FRAME_MS),
      frame_size_samples(0),
      application(OPUS_MODE_VOIP),
      fec_enabled(false),
      fec_redundancy(50),
      dtx_enabled(false),
      encoder_initialized(false),
      decoder_initialized(false),
      packet_loss_percentage(0),
      fec_buffer_size(0),
      last_encode_duration_us(0),
      last_decode_duration_us(0) {

    // Create mutexes for thread safety
    encode_mutex = xSemaphoreCreateMutex();
    decode_mutex = xSemaphoreCreateMutex();

    // Initialize statistics
    std::memset(&stats, 0, sizeof(OpusStats));

    // Calculate frame size in samples
    frame_size_samples = (sample_rate * frame_size_ms) / 1000;
}

/*
 * Destructor - Clean up codec resources
 */
OpusCodec::~OpusCodec() {
    // Destroy encoder if initialized
    if (encoder != nullptr) {
        opus_encoder_destroy(encoder);
        encoder = nullptr;
        encoder_initialized = false;
    }

    // Destroy decoder if initialized
    if (decoder != nullptr) {
        opus_decoder_destroy(decoder);
        decoder = nullptr;
        decoder_initialized = false;
    }

    // Delete mutexes
    if (encode_mutex != nullptr) {
        vSemaphoreDelete(encode_mutex);
        encode_mutex = nullptr;
    }

    if (decode_mutex != nullptr) {
        vSemaphoreDelete(decode_mutex);
        decode_mutex = nullptr;
    }
}

/*
 * Validate bitrate
 */
OpusError OpusCodec::validateBitrate(uint32_t bitrate) {
    if (bitrate < OPUS_MIN_BITRATE || bitrate > OPUS_MAX_BITRATE) {
        return OPUS_ERR_INVALID_PARAMS;
    }
    return OPUS_ERR_TO_ROIP(OPUS_OK);
}

/*
 * Validate complexity
 */
OpusError OpusCodec::validateComplexity(uint8_t complexity) {
    if (complexity > OPUS_MAX_COMPLEXITY) {
        return OPUS_ERR_INVALID_PARAMS;
    }
    return OPUS_ERR_TO_ROIP(OPUS_OK);
}

/*
 * Validate frame size
 */
OpusError OpusCodec::validateFrameSize(uint32_t frame_size) {
    if (frame_size < OPUS_MIN_FRAME_SIZE || frame_size > OPUS_MAX_FRAME_SIZE) {
        return OPUS_ERR_INVALID_PARAMS;
    }

    // Check if frame size is valid for Opus (2.5, 5, 10, 20, 40, 60ms)
    uint16_t ms = (frame_size * 1000) / sample_rate;
    if (ms != 3 && ms != 5 && ms != 10 && ms != 20 && ms != 40 && ms != 60) {
        return OPUS_ERR_INVALID_PARAMS;
    }

    return OPUS_ERR_TO_ROIP(OPUS_OK);
}

/*
 * Initialize encoder with configuration
 */
OpusError OpusCodec::initEncoder(
    uint32_t sampleRate,
    uint8_t channelCount,
    uint32_t bitrate,
    uint8_t complexityLevel,
    OpusMode appMode) {

    // Validate parameters
    if (sampleRate != 8000 && sampleRate != 12000 && sampleRate != 16000 &&
        sampleRate != 24000 && sampleRate != 48000) {
        return OPUS_ERR_INVALID_PARAMS;
    }

    if (channelCount != 1 && channelCount != 2) {
        return OPUS_ERR_INVALID_PARAMS;
    }

    if (validateBitrate(bitrate) != OPUS_OK) {
        return OPUS_ERR_INVALID_PARAMS;
    }

    if (validateComplexity(complexityLevel) != OPUS_OK) {
        return OPUS_ERR_INVALID_PARAMS;
    }

    if (appMode > OPUS_MODE_RESTRICTED_LQ) {
        return OPUS_ERR_INVALID_PARAMS;
    }

    // Acquire lock
    if (xSemaphoreTake(encode_mutex, pdMS_TO_TICKS(OPUS_LOCK_TIMEOUT_MS)) != pdTRUE) {
        return OPUS_ERR_INVALID_PARAMS;
    }

    // Destroy existing encoder if any
    if (encoder != nullptr) {
        opus_encoder_destroy(encoder);
        encoder = nullptr;
    }

    // Create new encoder
    int error = 0;
    encoder = opus_encoder_create(sampleRate, channelCount,
                                   (appMode == OPUS_MODE_VOIP) ? OPUS_APPLICATION_VOIP :
                                   (appMode == OPUS_MODE_AUDIO) ? OPUS_APPLICATION_AUDIO :
                                   OPUS_APPLICATION_RESTRICTED_LOWDELAY,
                                   &error);

    if (error != OPUS_OK || encoder == nullptr) {
        xSemaphoreGive(encode_mutex);
        return OPUS_ERR_INIT_FAILED;
    }

    // Set encoder parameters
    error = opus_encoder_ctl(encoder, OPUS_SET_BITRATE(bitrate));
    if (error != OPUS_OK) {
        opus_encoder_destroy(encoder);
        encoder = nullptr;
        xSemaphoreGive(encode_mutex);
        return OPUS_ERR_INIT_FAILED;
    }

    error = opus_encoder_ctl(encoder, OPUS_SET_COMPLEXITY(complexityLevel));
    if (error != OPUS_OK) {
        opus_encoder_destroy(encoder);
        encoder = nullptr;
        xSemaphoreGive(encode_mutex);
        return OPUS_ERR_INIT_FAILED;
    }

    // Set DTX if enabled
    if (dtx_enabled) {
        error = opus_encoder_ctl(encoder, OPUS_SET_DTX(1));
        if (error != OPUS_OK) {
            opus_encoder_destroy(encoder);
            encoder = nullptr;
            xSemaphoreGive(encode_mutex);
            return OPUS_ERR_INIT_FAILED;
        }
    }

    // Set FEC if enabled
    if (fec_enabled) {
        error = opus_encoder_ctl(encoder, OPUS_SET_INBAND_FEC(1));
        if (error != OPUS_OK) {
            opus_encoder_destroy(encoder);
            encoder = nullptr;
            xSemaphoreGive(encode_mutex);
            return OPUS_ERR_INIT_FAILED;
        }

        // Set FEC redundancy
        int fec_redundancy_pct = (fec_redundancy * 100) / 100; // Normalize
        error = opus_encoder_ctl(encoder, OPUS_SET_PACKET_LOSS_PERC(fec_redundancy_pct));
    }

    // Update configuration
    sample_rate = sampleRate;
    channels = channelCount;
    bitrate = bitrate;
    complexity = complexityLevel;
    application = appMode;
    frame_size_samples = (sample_rate * frame_size_ms) / 1000;
    encoder_initialized = true;

    xSemaphoreGive(encode_mutex);

    return OPUS_ERR_TO_ROIP(OPUS_OK);
}

/*
 * Initialize decoder with configuration
 */
OpusError OpusCodec::initDecoder(
    uint32_t sampleRate,
    uint8_t channelCount) {

    // Validate parameters
    if (sampleRate != 8000 && sampleRate != 12000 && sampleRate != 16000 &&
        sampleRate != 24000 && sampleRate != 48000) {
        return OPUS_ERR_INVALID_PARAMS;
    }

    if (channelCount != 1 && channelCount != 2) {
        return OPUS_ERR_INVALID_PARAMS;
    }

    // Acquire lock
    if (xSemaphoreTake(decode_mutex, pdMS_TO_TICKS(OPUS_LOCK_TIMEOUT_MS)) != pdTRUE) {
        return OPUS_ERR_INVALID_PARAMS;
    }

    // Destroy existing decoder if any
    if (decoder != nullptr) {
        opus_decoder_destroy(decoder);
        decoder = nullptr;
    }

    // Create new decoder
    int error = 0;
    decoder = opus_decoder_create(sampleRate, channelCount, &error);

    if (error != OPUS_OK || decoder == nullptr) {
        xSemaphoreGive(decode_mutex);
        return OPUS_ERR_INIT_FAILED;
    }

    // Set packet loss percentage for error concealment
    if (packet_loss_percentage > 0) {
        error = opus_decoder_ctl(decoder, OPUS_SET_PACKET_LOSS_PERC(packet_loss_percentage));
    }

    sample_rate = sampleRate;
    channels = channelCount;
    decoder_initialized = true;

    xSemaphoreGive(decode_mutex);

    return OPUS_ERR_TO_ROIP(OPUS_OK);
}

/*
 * Set encoder bitrate
 */
OpusError OpusCodec::setEncoderBitrate(uint32_t newBitrate) {
    if (validateBitrate(newBitrate) != OPUS_OK) {
        return OPUS_ERR_INVALID_PARAMS;
    }

    if (!encoder_initialized || encoder == nullptr) {
        return OPUS_ERR_NOT_INITIALIZED;
    }

    // Acquire lock
    if (xSemaphoreTake(encode_mutex, pdMS_TO_TICKS(OPUS_LOCK_TIMEOUT_MS)) != pdTRUE) {
        return OPUS_ERR_INVALID_PARAMS;
    }

    int error = opus_encoder_ctl(encoder, OPUS_SET_BITRATE(newBitrate));

    xSemaphoreGive(encode_mutex);

    if (error != OPUS_OK) {
        return OPUS_ERR_INVALID_PARAMS;
    }

    bitrate = newBitrate;
    return OPUS_ERR_TO_ROIP(OPUS_OK);
}

/*
 * Get encoder bitrate
 */
uint32_t OpusCodec::getEncoderBitrate() const {
    if (!encoder_initialized || encoder == nullptr) {
        return 0;
    }
    return bitrate;
}

/*
 * Set encoder complexity
 */
OpusError OpusCodec::setEncoderComplexity(uint8_t newComplexity) {
    if (validateComplexity(newComplexity) != OPUS_OK) {
        return OPUS_ERR_INVALID_PARAMS;
    }

    if (!encoder_initialized || encoder == nullptr) {
        return OPUS_ERR_NOT_INITIALIZED;
    }

    // Acquire lock
    if (xSemaphoreTake(encode_mutex, pdMS_TO_TICKS(OPUS_LOCK_TIMEOUT_MS)) != pdTRUE) {
        return OPUS_ERR_INVALID_PARAMS;
    }

    int error = opus_encoder_ctl(encoder, OPUS_SET_COMPLEXITY(newComplexity));

    xSemaphoreGive(encode_mutex);

    if (error != OPUS_OK) {
        return OPUS_ERR_INVALID_PARAMS;
    }

    complexity = newComplexity;
    return OPUS_ERR_TO_ROIP(OPUS_OK);
}

/*
 * Get encoder complexity
 */
uint8_t OpusCodec::getEncoderComplexity() const {
    if (!encoder_initialized) {
        return 0;
    }
    return complexity;
}

/*
 * Enable/disable FEC
 */
OpusError OpusCodec::setFECEnabled(bool enabled, uint8_t redundancy_percentage) {
    if (redundancy_percentage > 100) {
        return OPUS_ERR_INVALID_PARAMS;
    }

    fec_enabled = enabled;
    fec_redundancy = redundancy_percentage;

    // If encoder is already initialized, update it
    if (encoder_initialized && encoder != nullptr) {
        // Acquire lock
        if (xSemaphoreTake(encode_mutex, pdMS_TO_TICKS(OPUS_LOCK_TIMEOUT_MS)) != pdTRUE) {
            return OPUS_ERR_INVALID_PARAMS;
        }

        int error = opus_encoder_ctl(encoder, OPUS_SET_INBAND_FEC(enabled ? 1 : 0));

        if (enabled && error == OPUS_OK) {
            error = opus_encoder_ctl(encoder, OPUS_SET_PACKET_LOSS_PERC(redundancy_percentage));
        }

        xSemaphoreGive(encode_mutex);

        if (error != OPUS_OK) {
            return OPUS_ERR_INVALID_PARAMS;
        }
    }

    return OPUS_ERR_TO_ROIP(OPUS_OK);
}

/*
 * Check if FEC is enabled
 */
bool OpusCodec::isFECEnabled() const {
    return fec_enabled;
}

/*
 * Enable/disable DTX
 */
OpusError OpusCodec::setDTXEnabled(bool enabled) {
    dtx_enabled = enabled;

    // If encoder is already initialized, update it
    if (encoder_initialized && encoder != nullptr) {
        // Acquire lock
        if (xSemaphoreTake(encode_mutex, pdMS_TO_TICKS(OPUS_LOCK_TIMEOUT_MS)) != pdTRUE) {
            return OPUS_ERR_INVALID_PARAMS;
        }

        int error = opus_encoder_ctl(encoder, OPUS_SET_DTX(enabled ? 1 : 0));

        xSemaphoreGive(encode_mutex);

        if (error != OPUS_OK) {
            return OPUS_ERR_INVALID_PARAMS;
        }
    }

    return OPUS_ERR_TO_ROIP(OPUS_OK);
}

/*
 * Check if DTX is enabled
 */
bool OpusCodec::isDTXEnabled() const {
    return dtx_enabled;
}

/*
 * Set packet loss percentage
 */
OpusError OpusCodec::setPacketLossPercentage(uint8_t loss_percentage) {
    if (loss_percentage > 100) {
        return OPUS_ERR_INVALID_PARAMS;
    }

    packet_loss_percentage = loss_percentage;

    // If decoder is already initialized, update it
    if (decoder_initialized && decoder != nullptr) {
        // Acquire lock
        if (xSemaphoreTake(decode_mutex, pdMS_TO_TICKS(OPUS_LOCK_TIMEOUT_MS)) != pdTRUE) {
            return OPUS_ERR_INVALID_PARAMS;
        }

        int error = opus_decoder_ctl(decoder, OPUS_SET_PACKET_LOSS_PERC(loss_percentage));

        xSemaphoreGive(decode_mutex);

        if (error != OPUS_OK) {
            return OPUS_ERR_INVALID_PARAMS;
        }
    }

    return OPUS_ERR_TO_ROIP(OPUS_OK);
}

/*
 * Encode PCM audio frame
 */
int OpusCodec::encodeFrame(
    const int16_t* pcm,
    uint32_t frameSize,
    uint8_t* output,
    size_t outputSize) {

    if (!encoder_initialized || encoder == nullptr) {
        return OPUS_ERR_NOT_INITIALIZED;
    }

    if (pcm == nullptr || output == nullptr) {
        return OPUS_ERR_INVALID_PARAMS;
    }

    if (outputSize < OPUS_MAX_PACKET_SIZE) {
        return OPUS_ERR_BUFFER_OVERFLOW;
    }

    if (validateFrameSize(frameSize) != OPUS_OK) {
        return OPUS_ERR_INVALID_PARAMS;
    }

    // Acquire lock
    if (xSemaphoreTake(encode_mutex, pdMS_TO_TICKS(OPUS_LOCK_TIMEOUT_MS)) != pdTRUE) {
        return OPUS_ERR_INVALID_PARAMS;
    }

    uint32_t start_us = micros();

    // Encode frame
    opus_int32 encoded_bytes = opus_encode(
        encoder,
        pcm,
        frameSize,
        output,
        (opus_int32)outputSize
    );

    uint32_t duration_us = micros() - start_us;

    xSemaphoreGive(encode_mutex);

    if (encoded_bytes < 0) {
        stats.encode_errors++;
        return OPUS_ERR_ENCODE_FAILED;
    }

    // Update statistics
    updateEncodeStats(encoded_bytes, duration_us);

    // Store frame for FEC if enabled
    if (fec_enabled && encoded_bytes > 0 && encoded_bytes < FEC_BUFFER_SIZE) {
        std::memcpy(fec_buffer, output, encoded_bytes);
        fec_buffer_size = encoded_bytes;
    }

    return encoded_bytes;
}

/*
 * Decode Opus frame to PCM
 */
int OpusCodec::decodeFrame(
    const uint8_t* input,
    uint32_t inputSize,
    int16_t* output,
    size_t outputSize,
    bool useFEC) {

    if (!decoder_initialized || decoder == nullptr) {
        return OPUS_ERR_NOT_INITIALIZED;
    }

    if (output == nullptr) {
        return OPUS_ERR_INVALID_PARAMS;
    }

    if (outputSize < frame_size_samples) {
        return OPUS_ERR_BUFFER_OVERFLOW;
    }

    // Acquire lock
    if (xSemaphoreTake(decode_mutex, pdMS_TO_TICKS(OPUS_LOCK_TIMEOUT_MS)) != pdTRUE) {
        return OPUS_ERR_INVALID_PARAMS;
    }

    uint32_t start_us = micros();

    // Decode frame
    // Use FEC data if available and requested
    const uint8_t* decode_input = input;
    int decode_input_size = (int)inputSize;

    // If input is null and FEC is enabled, use FEC buffer
    if ((input == nullptr || inputSize == 0) && useFEC && fec_enabled && fec_buffer_size > 0) {
        decode_input = fec_buffer;
        decode_input_size = (int)fec_buffer_size;
        stats.fec_packets_used++;
    }

    opus_int32 decoded_samples = opus_decode(
        decoder,
        decode_input,
        decode_input_size,
        output,
        (opus_int32)outputSize,
        0  // decode_fec = 0 (use normal decoding, not FEC mode)
    );

    uint32_t duration_us = micros() - start_us;

    xSemaphoreGive(decode_mutex);

    if (decoded_samples < 0) {
        stats.decode_errors++;
        stats.packet_losses++;
        return OPUS_ERR_DECODE_FAILED;
    }

    // Update statistics
    updateDecodeStats(decoded_samples, duration_us);

    return decoded_samples;
}

/*
 * Decode missing frame (packet loss concealment)
 */
int OpusCodec::decodeMissingFrame(
    int16_t* output,
    size_t outputSize) {

    if (!decoder_initialized || decoder == nullptr) {
        return OPUS_ERR_NOT_INITIALIZED;
    }

    if (output == nullptr) {
        return OPUS_ERR_INVALID_PARAMS;
    }

    if (outputSize < frame_size_samples) {
        return OPUS_ERR_BUFFER_OVERFLOW;
    }

    // Acquire lock
    if (xSemaphoreTake(decode_mutex, pdMS_TO_TICKS(OPUS_LOCK_TIMEOUT_MS)) != pdTRUE) {
        return OPUS_ERR_INVALID_PARAMS;
    }

    uint32_t start_us = micros();

    // Decode with null input for packet loss concealment
    opus_int32 decoded_samples = opus_decode(
        decoder,
        nullptr,
        0,
        output,
        (opus_int32)outputSize,
        0  // decode_fec
    );

    uint32_t duration_us = micros() - start_us;

    xSemaphoreGive(decode_mutex);

    if (decoded_samples < 0) {
        stats.decode_errors++;
        return OPUS_ERR_DECODE_FAILED;
    }

    // Update statistics
    stats.packet_losses++;
    updateDecodeStats(decoded_samples, duration_us);

    return decoded_samples;
}

/*
 * Reset decoder
 */
OpusError OpusCodec::resetDecoder() {
    if (!decoder_initialized || decoder == nullptr) {
        return OPUS_ERR_NOT_INITIALIZED;
    }

    // Acquire lock
    if (xSemaphoreTake(decode_mutex, pdMS_TO_TICKS(OPUS_LOCK_TIMEOUT_MS)) != pdTRUE) {
        return OPUS_ERR_INVALID_PARAMS;
    }

    int error = opus_decoder_ctl(decoder, OPUS_RESET_STATE);

    xSemaphoreGive(decode_mutex);

    if (error != OPUS_OK) {
        return OPUS_ERR_DECODER_RESET;
    }

    return OPUS_ERR_TO_ROIP(OPUS_OK);
}

/*
 * Reset encoder
 */
OpusError OpusCodec::resetEncoder() {
    if (!encoder_initialized || encoder == nullptr) {
        return OPUS_ERR_NOT_INITIALIZED;
    }

    // Acquire lock
    if (xSemaphoreTake(encode_mutex, pdMS_TO_TICKS(OPUS_LOCK_TIMEOUT_MS)) != pdTRUE) {
        return OPUS_ERR_INVALID_PARAMS;
    }

    int error = opus_encoder_ctl(encoder, OPUS_RESET_STATE);

    xSemaphoreGive(encode_mutex);

    if (error != OPUS_OK) {
        return OPUS_ERR_INVALID_PARAMS;
    }

    return OPUS_ERR_TO_ROIP(OPUS_OK);
}

/*
 * Update encode statistics
 */
void OpusCodec::updateEncodeStats(uint32_t bytesEncoded, uint32_t duration_us) {
    stats.packets_encoded++;
    stats.bytes_encoded += bytesEncoded;
    last_encode_duration_us = duration_us;
    stats.avg_encode_time_us = (stats.avg_encode_time_us + duration_us) / 2;

    // Calculate bitrate
    if (frame_size_ms > 0) {
        stats.total_samples_encoded += frame_size_samples;
        stats.avg_bitrate_kbps = (float)(bytesEncoded * 8 * 1000) / frame_size_ms / 1000.0f;
    }

    stats.current_complexity = complexity;
}

/*
 * Update decode statistics
 */
void OpusCodec::updateDecodeStats(uint32_t sampleDecoded, uint32_t duration_us) {
    stats.packets_decoded++;
    stats.total_samples_decoded += sampleDecoded;
    last_decode_duration_us = duration_us;
    stats.avg_decode_time_us = (stats.avg_decode_time_us + duration_us) / 2;
}

/*
 * Get statistics
 */
void OpusCodec::getStatistics(OpusStats& outStats) const {
    // Copy stats structure
    outStats = stats;
}

/*
 * Reset statistics
 */
void OpusCodec::resetStatistics() {
    std::memset(&stats, 0, sizeof(OpusStats));
    last_encode_duration_us = 0;
    last_decode_duration_us = 0;
}

/*
 * Print statistics
 */
void OpusCodec::printStatistics() const {
    Serial.println("\n=== Opus Codec Statistics ===");
    Serial.printf("Sample Rate: %u Hz\n", sample_rate);
    Serial.printf("Channels: %u\n", channels);
    Serial.printf("Bitrate: %u bps (%.1f kbps)\n", bitrate, bitrate / 1000.0f);
    Serial.printf("Complexity: %u/10\n", complexity);
    Serial.printf("Frame Size: %u ms (%u samples)\n", frame_size_ms, frame_size_samples);
    Serial.printf("FEC Enabled: %s\n", fec_enabled ? "Yes" : "No");
    Serial.printf("DTX Enabled: %s\n", dtx_enabled ? "Yes" : "No");

    Serial.println("\n--- Encoder Stats ---");
    Serial.printf("Packets Encoded: %u\n", stats.packets_encoded);
    Serial.printf("Bytes Encoded: %u\n", stats.bytes_encoded);
    Serial.printf("Encode Errors: %u\n", stats.encode_errors);
    Serial.printf("Avg Encode Time: %u us\n", stats.avg_encode_time_us);
    Serial.printf("Total Samples Encoded: %u\n", stats.total_samples_encoded);

    Serial.println("\n--- Decoder Stats ---");
    Serial.printf("Packets Decoded: %u\n", stats.packets_decoded);
    Serial.printf("Bytes Decoded: %u\n", stats.bytes_decoded);
    Serial.printf("Decode Errors: %u\n", stats.decode_errors);
    Serial.printf("Avg Decode Time: %u us\n", stats.avg_decode_time_us);
    Serial.printf("Total Samples Decoded: %u\n", stats.total_samples_decoded);
    Serial.printf("Packet Losses: %u\n", stats.packet_losses);
    Serial.printf("FEC Packets Used: %u\n", stats.fec_packets_used);

    Serial.println("\n--- Quality Metrics ---");
    Serial.printf("Avg Bitrate: %.1f kbps\n", stats.avg_bitrate_kbps);
    Serial.printf("Packet Loss Percentage: %u%%\n", packet_loss_percentage);

    Serial.println("============================\n");
}

/*
 * Check if codec is initialized
 */
bool OpusCodec::isInitialized() const {
    return encoder_initialized && decoder_initialized;
}

/*
 * Set quality preset
 */
OpusError OpusCodec::setQualityPreset(uint8_t preset) {
    uint32_t preset_bitrate;
    uint8_t preset_complexity;

    switch (preset) {
        case 0:  // Low quality
            preset_bitrate = 8000;
            preset_complexity = 3;
            break;
        case 1:  // Medium quality
            preset_bitrate = 16000;
            preset_complexity = 6;
            break;
        case 2:  // High quality
            preset_bitrate = 32000;
            preset_complexity = 9;
            break;
        case 3:  // Ultra quality
            preset_bitrate = 64000;
            preset_complexity = 10;
            break;
        default:
            return OPUS_ERR_INVALID_PARAMS;
    }

    // Apply settings
    OpusError err = setEncoderBitrate(preset_bitrate);
    if (err != OPUS_OK) {
        return err;
    }

    err = setEncoderComplexity(preset_complexity);
    if (err != OPUS_OK) {
        return err;
    }

    return OPUS_ERR_TO_ROIP(OPUS_OK);
}
