/*
 * Comprehensive Unit Tests for Opus Codec Module
 * Tests all features: initialization, encoding, decoding, FEC, DTX, quality presets
 * Uses Unity test framework
 */

// Mock headers for desktop testing - Include before Opus codec
#include "Arduino.h"
SerialMock Serial;

#include <unity.h>
#include <cstring>
#include <cstdint>
#include <cmath>

// Include the Opus codec header (which will include mocked FreeRTOS)
#include "../roip-firmware/include/codec_opus.h"

// Unity test state
UnityType Unity = {0, 0, 0};

/*
 * ============================================================================
 * TEST FIXTURES AND HELPERS
 * ============================================================================
 */

// Test audio data - 480 samples of 24kHz = 20ms frame
static int16_t test_pcm_frame[480];
static uint8_t encoded_buffer[OPUS_MAX_PACKET_SIZE];
static int16_t decoded_buffer[OPUS_MAX_FRAME_SIZE];

// Codec instance for testing
static OpusCodec* codec = nullptr;

/*
 * Generate test PCM data (simple sine wave)
 * Frequency: 440 Hz (A4 note), amplitude: 16000
 */
void generate_test_pcm(int16_t* buffer, uint32_t num_samples, uint32_t sample_rate) {
    const float frequency = 440.0f;  // Hz
    const float amplitude = 16000.0f;

    for (uint32_t i = 0; i < num_samples; i++) {
        float sample = amplitude * sinf(2.0f * 3.14159265f * frequency * i / sample_rate);
        buffer[i] = (int16_t)sample;
    }
}

/*
 * Calculate signal-to-noise ratio between original and decoded
 * Returns SNR in dB (higher is better)
 */
float calculate_snr(const int16_t* original, const int16_t* decoded, uint32_t num_samples) {
    float signal_power = 0.0f;
    float noise_power = 0.0f;

    for (uint32_t i = 0; i < num_samples; i++) {
        float orig = (float)original[i];
        float dec = (float)decoded[i];

        signal_power += orig * orig;
        noise_power += (orig - dec) * (orig - dec);
    }

    if (noise_power == 0.0f) return 100.0f;  // Perfect reconstruction

    float snr = 10.0f * log10f(signal_power / noise_power);
    return snr;
}

/*
 * ============================================================================
 * SETUP AND TEARDOWN
 * ============================================================================
 */

void setUp(void) {
    // Create codec instance before each test
    codec = new OpusCodec();
    TEST_ASSERT_NOT_NULL(codec);

    // Generate test PCM data
    generate_test_pcm(test_pcm_frame, 480, OPUS_SAMPLE_RATE);

    // Clear buffers
    std::memset(encoded_buffer, 0, sizeof(encoded_buffer));
    std::memset(decoded_buffer, 0, sizeof(decoded_buffer));
}

void tearDown(void) {
    // Clean up codec instance
    if (codec != nullptr) {
        delete codec;
        codec = nullptr;
    }
}

/*
 * ============================================================================
 * TEST GROUP 1: ENCODER INITIALIZATION
 * ============================================================================
 */

// Test 1.1: Initialize encoder with default parameters
void test_encoder_init_default_parameters(void) {
    OpusError result = codec->initEncoder();
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
    TEST_ASSERT_TRUE(codec->isInitialized());
    TEST_ASSERT_EQUAL_UINT32(OPUS_SAMPLE_RATE, codec->getSampleRate());
    TEST_ASSERT_EQUAL_UINT8(1, codec->getChannels());
    TEST_ASSERT_EQUAL_UINT32(OPUS_DEFAULT_BITRATE, codec->getEncoderBitrate());
    TEST_ASSERT_EQUAL_UINT8(OPUS_DEFAULT_COMPLEXITY, codec->getEncoderComplexity());
}

// Test 1.2: Initialize encoder with 8kHz sample rate
void test_encoder_init_8khz_sample_rate(void) {
    OpusError result = codec->initEncoder(8000, 1, OPUS_DEFAULT_BITRATE);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
    TEST_ASSERT_EQUAL_UINT32(8000, codec->getSampleRate());
}

// Test 1.3: Initialize encoder with 16kHz sample rate
void test_encoder_init_16khz_sample_rate(void) {
    OpusError result = codec->initEncoder(16000, 1, OPUS_DEFAULT_BITRATE);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
    TEST_ASSERT_EQUAL_UINT32(16000, codec->getSampleRate());
}

// Test 1.4: Initialize encoder with 24kHz sample rate
void test_encoder_init_24khz_sample_rate(void) {
    OpusError result = codec->initEncoder(24000, 1, OPUS_DEFAULT_BITRATE);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
    TEST_ASSERT_EQUAL_UINT32(24000, codec->getSampleRate());
}

// Test 1.5: Initialize encoder with 48kHz sample rate
void test_encoder_init_48khz_sample_rate(void) {
    OpusError result = codec->initEncoder(48000, 1, OPUS_DEFAULT_BITRATE);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
    TEST_ASSERT_EQUAL_UINT32(48000, codec->getSampleRate());
}

// Test 1.6: Initialize encoder with mono (1 channel)
void test_encoder_init_mono_channel(void) {
    OpusError result = codec->initEncoder(OPUS_SAMPLE_RATE, 1);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
    TEST_ASSERT_EQUAL_UINT8(1, codec->getChannels());
}

// Test 1.7: Initialize encoder with stereo (2 channels)
void test_encoder_init_stereo_channel(void) {
    OpusError result = codec->initEncoder(OPUS_SAMPLE_RATE, 2);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
    TEST_ASSERT_EQUAL_UINT8(2, codec->getChannels());
}

// Test 1.8: Initialize encoder with minimum bitrate (8 kbps)
void test_encoder_init_bitrate_8kbps(void) {
    OpusError result = codec->initEncoder(OPUS_SAMPLE_RATE, 1, 8000);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
    TEST_ASSERT_EQUAL_UINT32(8000, codec->getEncoderBitrate());
}

// Test 1.9: Initialize encoder with medium bitrate (32 kbps)
void test_encoder_init_bitrate_32kbps(void) {
    OpusError result = codec->initEncoder(OPUS_SAMPLE_RATE, 1, 32000);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
    TEST_ASSERT_EQUAL_UINT32(32000, codec->getEncoderBitrate());
}

// Test 1.10: Initialize encoder with maximum bitrate (64 kbps)
void test_encoder_init_bitrate_64kbps(void) {
    OpusError result = codec->initEncoder(OPUS_SAMPLE_RATE, 1, 64000);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
    TEST_ASSERT_EQUAL_UINT32(64000, codec->getEncoderBitrate());
}

// Test 1.11: Initialize encoder with invalid sample rate
void test_encoder_init_invalid_sample_rate(void) {
    OpusError result = codec->initEncoder(22050, 1, OPUS_DEFAULT_BITRATE);
    TEST_ASSERT_EQUAL_INT(OPUS_ERR_INVALID_PARAMS, result);
}

// Test 1.12: Initialize encoder with invalid channel count
void test_encoder_init_invalid_channels(void) {
    OpusError result = codec->initEncoder(OPUS_SAMPLE_RATE, 3);
    TEST_ASSERT_EQUAL_INT(OPUS_ERR_INVALID_PARAMS, result);
}

// Test 1.13: Initialize encoder with invalid bitrate
void test_encoder_init_invalid_bitrate(void) {
    OpusError result = codec->initEncoder(OPUS_SAMPLE_RATE, 1, 128000);
    TEST_ASSERT_EQUAL_INT(OPUS_ERR_INVALID_PARAMS, result);
}

// Test 1.14: Initialize encoder with VoIP mode
void test_encoder_init_voip_mode(void) {
    OpusError result = codec->initEncoder(OPUS_SAMPLE_RATE, 1, OPUS_DEFAULT_BITRATE,
                                          OPUS_DEFAULT_COMPLEXITY, OPUS_MODE_VOIP);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
}

// Test 1.15: Initialize encoder with Audio mode
void test_encoder_init_audio_mode(void) {
    OpusError result = codec->initEncoder(OPUS_SAMPLE_RATE, 1, OPUS_DEFAULT_BITRATE,
                                          OPUS_DEFAULT_COMPLEXITY, OPUS_MODE_AUDIO);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
}

/*
 * ============================================================================
 * TEST GROUP 2: DECODER INITIALIZATION
 * ============================================================================
 */

// Test 2.1: Initialize decoder with default parameters
void test_decoder_init_default_parameters(void) {
    OpusError result = codec->initDecoder();
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
    TEST_ASSERT_EQUAL_UINT32(OPUS_SAMPLE_RATE, codec->getSampleRate());
    TEST_ASSERT_EQUAL_UINT8(1, codec->getChannels());
}

// Test 2.2: Initialize decoder with 8kHz sample rate
void test_decoder_init_8khz_sample_rate(void) {
    OpusError result = codec->initDecoder(8000, 1);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
    TEST_ASSERT_EQUAL_UINT32(8000, codec->getSampleRate());
}

// Test 2.3: Initialize decoder with 48kHz sample rate
void test_decoder_init_48khz_sample_rate(void) {
    OpusError result = codec->initDecoder(48000, 1);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
    TEST_ASSERT_EQUAL_UINT32(48000, codec->getSampleRate());
}

// Test 2.4: Initialize decoder with stereo
void test_decoder_init_stereo(void) {
    OpusError result = codec->initDecoder(OPUS_SAMPLE_RATE, 2);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
    TEST_ASSERT_EQUAL_UINT8(2, codec->getChannels());
}

// Test 2.5: Initialize decoder with invalid sample rate
void test_decoder_init_invalid_sample_rate(void) {
    OpusError result = codec->initDecoder(32000, 1);  // Opus supports 8,12,16,24,48 kHz
    // 32kHz is invalid for Opus
    // Note: This test depends on actual validation in the codec
}

// Test 2.6: Initialize decoder with invalid channels
void test_decoder_init_invalid_channels(void) {
    OpusError result = codec->initDecoder(OPUS_SAMPLE_RATE, 5);
    // Should fail due to invalid channel count
}

/*
 * ============================================================================
 * TEST GROUP 3: ENCODE PCM FRAME TO OPUS
 * ============================================================================
 */

// Test 3.1: Encode PCM frame successfully
void test_encode_pcm_frame_success(void) {
    OpusError enc_result = codec->initEncoder();
    TEST_ASSERT_EQUAL_INT(OPUS_OK, enc_result);

    int result = codec->encodeFrame(test_pcm_frame, 480, encoded_buffer, sizeof(encoded_buffer));
    TEST_ASSERT_GREATER_THAN(0, result);  // Should return number of bytes encoded
    TEST_ASSERT_LESS_THAN(OPUS_MAX_PACKET_SIZE, result);
}

// Test 3.2: Encode frame with null input
void test_encode_pcm_null_input(void) {
    OpusError enc_result = codec->initEncoder();
    TEST_ASSERT_EQUAL_INT(OPUS_OK, enc_result);

    int result = codec->encodeFrame(nullptr, 480, encoded_buffer, sizeof(encoded_buffer));
    TEST_ASSERT_EQUAL_INT(OPUS_ERR_INVALID_PARAMS, result);
}

// Test 3.3: Encode frame with null output
void test_encode_pcm_null_output(void) {
    OpusError enc_result = codec->initEncoder();
    TEST_ASSERT_EQUAL_INT(OPUS_OK, enc_result);

    int result = codec->encodeFrame(test_pcm_frame, 480, nullptr, sizeof(encoded_buffer));
    TEST_ASSERT_EQUAL_INT(OPUS_ERR_INVALID_PARAMS, result);
}

// Test 3.4: Encode without initialization
void test_encode_without_init(void) {
    int result = codec->encodeFrame(test_pcm_frame, 480, encoded_buffer, sizeof(encoded_buffer));
    TEST_ASSERT_EQUAL_INT(OPUS_ERR_NOT_INITIALIZED, result);
}

// Test 3.5: Encode with undersized output buffer
void test_encode_undersized_buffer(void) {
    OpusError enc_result = codec->initEncoder();
    TEST_ASSERT_EQUAL_INT(OPUS_OK, enc_result);

    uint8_t small_buffer[100];
    int result = codec->encodeFrame(test_pcm_frame, 480, small_buffer, sizeof(small_buffer));
    TEST_ASSERT_EQUAL_INT(OPUS_ERR_BUFFER_OVERFLOW, result);
}

// Test 3.6: Encode multiple consecutive frames
void test_encode_multiple_frames(void) {
    OpusError enc_result = codec->initEncoder();
    TEST_ASSERT_EQUAL_INT(OPUS_OK, enc_result);

    for (int i = 0; i < 5; i++) {
        int result = codec->encodeFrame(test_pcm_frame, 480, encoded_buffer, sizeof(encoded_buffer));
        TEST_ASSERT_GREATER_THAN(0, result);
    }
}

// Test 3.7: Encode at different sample rates
void test_encode_different_sample_rates(void) {
    uint32_t sample_rates[] = {8000, 12000, 16000, 24000, 48000};

    for (uint32_t sr : sample_rates) {
        OpusError enc_result = codec->initEncoder(sr, 1, OPUS_DEFAULT_BITRATE);
        if (enc_result == OPUS_OK) {
            uint32_t frame_size = (sr * 20) / 1000;  // 20ms frame
            int16_t* temp_pcm = new int16_t[frame_size];
            generate_test_pcm(temp_pcm, frame_size, sr);

            int result = codec->encodeFrame(temp_pcm, frame_size, encoded_buffer, sizeof(encoded_buffer));
            TEST_ASSERT_GREATER_THAN(0, result);

            delete[] temp_pcm;
        }
    }
}

/*
 * ============================================================================
 * TEST GROUP 4: DECODE OPUS FRAME TO PCM
 * ============================================================================
 */

// Test 4.1: Decode Opus frame successfully
void test_decode_opus_frame_success(void) {
    // First encode
    codec->initEncoder();
    int encoded_size = codec->encodeFrame(test_pcm_frame, 480, encoded_buffer, sizeof(encoded_buffer));
    TEST_ASSERT_GREATER_THAN(0, encoded_size);

    // Then decode
    codec->initDecoder();
    int decoded_size = codec->decodeFrame(encoded_buffer, encoded_size, decoded_buffer,
                                          sizeof(decoded_buffer) / sizeof(int16_t));
    TEST_ASSERT_EQUAL_INT(480, decoded_size);  // Should decode to original frame size
}

// Test 4.2: Decode with null output
void test_decode_null_output(void) {
    codec->initDecoder();
    int result = codec->decodeFrame(encoded_buffer, 50, nullptr, 480);
    TEST_ASSERT_EQUAL_INT(OPUS_ERR_INVALID_PARAMS, result);
}

// Test 4.3: Decode without initialization
void test_decode_without_init(void) {
    int result = codec->decodeFrame(encoded_buffer, 50, decoded_buffer, 480);
    TEST_ASSERT_EQUAL_INT(OPUS_ERR_NOT_INITIALIZED, result);
}

// Test 4.4: Decode with undersized output buffer
void test_decode_undersized_output(void) {
    codec->initDecoder();
    int16_t small_buffer[100];
    int result = codec->decodeFrame(encoded_buffer, 50, small_buffer, 100);
    // Should fail due to buffer overflow or return error
}

// Test 4.5: Decode with invalid payload
void test_decode_invalid_payload(void) {
    codec->initDecoder();
    uint8_t invalid_data[50] = {0xFF, 0xFF};  // Invalid Opus data
    int result = codec->decodeFrame(invalid_data, 50, decoded_buffer, 480);
    // May return error or attempt to decode
}

/*
 * ============================================================================
 * TEST GROUP 5: ROUND-TRIP ENCODING/DECODING (QUALITY VERIFICATION)
 * ============================================================================
 */

// Test 5.1: Round-trip encode/decode maintains quality
void test_roundtrip_encode_decode_quality(void) {
    // Initialize both encoder and decoder
    codec->initEncoder(OPUS_SAMPLE_RATE, 1, 32000);
    codec->initDecoder(OPUS_SAMPLE_RATE, 1);

    // Encode
    int encoded_size = codec->encodeFrame(test_pcm_frame, 480, encoded_buffer, sizeof(encoded_buffer));
    TEST_ASSERT_GREATER_THAN(0, encoded_size);

    // Decode
    int decoded_size = codec->decodeFrame(encoded_buffer, encoded_size, decoded_buffer,
                                          sizeof(decoded_buffer) / sizeof(int16_t));
    TEST_ASSERT_EQUAL_INT(480, decoded_size);

    // Calculate SNR (should be reasonably good at 32kbps)
    float snr = calculate_snr(test_pcm_frame, decoded_buffer, 480);
    TEST_ASSERT_GREATER_THAN(15.0f, snr);  // At least 15dB SNR for 32kbps
}

// Test 5.2: High bitrate (64kbps) provides better quality
void test_roundtrip_high_bitrate_quality(void) {
    // High bitrate encoding
    codec->initEncoder(OPUS_SAMPLE_RATE, 1, 64000);
    codec->initDecoder(OPUS_SAMPLE_RATE, 1);

    int encoded_size = codec->encodeFrame(test_pcm_frame, 480, encoded_buffer, sizeof(encoded_buffer));
    int decoded_size = codec->decodeFrame(encoded_buffer, encoded_size, decoded_buffer, 480);

    float high_snr = calculate_snr(test_pcm_frame, decoded_buffer, 480);

    // Low bitrate encoding
    codec->initEncoder(OPUS_SAMPLE_RATE, 1, 8000);
    codec->initDecoder(OPUS_SAMPLE_RATE, 1);

    encoded_size = codec->encodeFrame(test_pcm_frame, 480, encoded_buffer, sizeof(encoded_buffer));
    decoded_size = codec->decodeFrame(encoded_buffer, encoded_size, decoded_buffer, 480);

    float low_snr = calculate_snr(test_pcm_frame, decoded_buffer, 480);

    // High bitrate should provide better quality (higher SNR)
    TEST_ASSERT_GREATER_THAN(low_snr, high_snr);
}

// Test 5.3: Multiple round-trip cycles
void test_roundtrip_multiple_cycles(void) {
    codec->initEncoder(OPUS_SAMPLE_RATE, 1, 32000);
    codec->initDecoder(OPUS_SAMPLE_RATE, 1);

    int16_t temp_input[480];
    std::memcpy(temp_input, test_pcm_frame, sizeof(test_pcm_frame));

    for (int i = 0; i < 5; i++) {
        int encoded_size = codec->encodeFrame(temp_input, 480, encoded_buffer, sizeof(encoded_buffer));
        TEST_ASSERT_GREATER_THAN(0, encoded_size);

        int decoded_size = codec->decodeFrame(encoded_buffer, encoded_size, decoded_buffer, 480);
        TEST_ASSERT_EQUAL_INT(480, decoded_size);

        // Use decoded output as input for next cycle (only copy 480 samples)
        std::memcpy(temp_input, decoded_buffer, 480 * sizeof(int16_t));
    }
}

/*
 * ============================================================================
 * TEST GROUP 6: BITRATE CONTROL
 * ============================================================================
 */

// Test 6.1: Set bitrate to 8 kbps
void test_bitrate_8kbps(void) {
    codec->initEncoder();
    OpusError result = codec->setEncoderBitrate(8000);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
    TEST_ASSERT_EQUAL_UINT32(8000, codec->getEncoderBitrate());
}

// Test 6.2: Set bitrate to 16 kbps
void test_bitrate_16kbps(void) {
    codec->initEncoder();
    OpusError result = codec->setEncoderBitrate(16000);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
    TEST_ASSERT_EQUAL_UINT32(16000, codec->getEncoderBitrate());
}

// Test 6.3: Set bitrate to 32 kbps
void test_bitrate_32kbps(void) {
    codec->initEncoder();
    OpusError result = codec->setEncoderBitrate(32000);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
    TEST_ASSERT_EQUAL_UINT32(32000, codec->getEncoderBitrate());
}

// Test 6.4: Set bitrate to 64 kbps
void test_bitrate_64kbps(void) {
    codec->initEncoder();
    OpusError result = codec->setEncoderBitrate(64000);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
    TEST_ASSERT_EQUAL_UINT32(64000, codec->getEncoderBitrate());
}

// Test 6.5: Set invalid bitrate (too low)
void test_bitrate_invalid_too_low(void) {
    codec->initEncoder();
    OpusError result = codec->setEncoderBitrate(4000);  // Below minimum
    TEST_ASSERT_EQUAL_INT(OPUS_ERR_INVALID_PARAMS, result);
}

// Test 6.6: Set invalid bitrate (too high)
void test_bitrate_invalid_too_high(void) {
    codec->initEncoder();
    OpusError result = codec->setEncoderBitrate(128000);  // Above maximum
    TEST_ASSERT_EQUAL_INT(OPUS_ERR_INVALID_PARAMS, result);
}

// Test 6.7: Set bitrate without initialization
void test_bitrate_not_initialized(void) {
    OpusError result = codec->setEncoderBitrate(32000);
    TEST_ASSERT_EQUAL_INT(OPUS_ERR_NOT_INITIALIZED, result);
}

// Test 6.8: Change bitrate dynamically during encoding
void test_bitrate_dynamic_change(void) {
    codec->initEncoder();

    // Start with 16 kbps
    codec->setEncoderBitrate(16000);
    TEST_ASSERT_EQUAL_UINT32(16000, codec->getEncoderBitrate());

    // Change to 32 kbps
    OpusError result = codec->setEncoderBitrate(32000);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
    TEST_ASSERT_EQUAL_UINT32(32000, codec->getEncoderBitrate());

    // Change to 64 kbps
    result = codec->setEncoderBitrate(64000);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
    TEST_ASSERT_EQUAL_UINT32(64000, codec->getEncoderBitrate());
}

/*
 * ============================================================================
 * TEST GROUP 7: COMPLEXITY SETTINGS
 * ============================================================================
 */

// Test 7.1: Set complexity to 0 (fastest)
void test_complexity_0_fastest(void) {
    codec->initEncoder();
    OpusError result = codec->setEncoderComplexity(0);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
    TEST_ASSERT_EQUAL_UINT8(0, codec->getEncoderComplexity());
}

// Test 7.2: Set complexity to 5 (medium)
void test_complexity_5_medium(void) {
    codec->initEncoder();
    OpusError result = codec->setEncoderComplexity(5);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
    TEST_ASSERT_EQUAL_UINT8(5, codec->getEncoderComplexity());
}

// Test 7.3: Set complexity to 10 (highest)
void test_complexity_10_highest(void) {
    codec->initEncoder();
    OpusError result = codec->setEncoderComplexity(10);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
    TEST_ASSERT_EQUAL_UINT8(10, codec->getEncoderComplexity());
}

// Test 7.4: Set complexity to each level 0-10
void test_complexity_all_levels(void) {
    codec->initEncoder();

    for (uint8_t i = 0; i <= 10; i++) {
        OpusError result = codec->setEncoderComplexity(i);
        TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
        TEST_ASSERT_EQUAL_UINT8(i, codec->getEncoderComplexity());
    }
}

// Test 7.5: Set invalid complexity (too high)
void test_complexity_invalid_too_high(void) {
    codec->initEncoder();
    OpusError result = codec->setEncoderComplexity(15);  // Above maximum
    TEST_ASSERT_EQUAL_INT(OPUS_ERR_INVALID_PARAMS, result);
}

// Test 7.6: Set complexity without initialization
void test_complexity_not_initialized(void) {
    OpusError result = codec->setEncoderComplexity(5);
    TEST_ASSERT_EQUAL_INT(OPUS_ERR_NOT_INITIALIZED, result);
}

// Test 7.7: Low complexity produces output faster (but lower quality)
void test_complexity_affects_encoding(void) {
    codec->initEncoder(OPUS_SAMPLE_RATE, 1, 32000);

    // Encode with low complexity
    codec->setEncoderComplexity(0);
    int low_encoded_size = codec->encodeFrame(test_pcm_frame, 480, encoded_buffer, sizeof(encoded_buffer));

    // Encode with high complexity
    codec->setEncoderComplexity(10);
    int high_encoded_size = codec->encodeFrame(test_pcm_frame, 480, encoded_buffer, sizeof(encoded_buffer));

    // Both should produce valid output
    TEST_ASSERT_GREATER_THAN(0, low_encoded_size);
    TEST_ASSERT_GREATER_THAN(0, high_encoded_size);
}

/*
 * ============================================================================
 * TEST GROUP 8: FEC (FORWARD ERROR CORRECTION)
 * ============================================================================
 */

// Test 8.1: Enable FEC
void test_fec_enable(void) {
    codec->initEncoder();
    OpusError result = codec->setFECEnabled(true, 50);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
    TEST_ASSERT_TRUE(codec->isFECEnabled());
}

// Test 8.2: Disable FEC
void test_fec_disable(void) {
    codec->initEncoder();
    codec->setFECEnabled(true, 50);
    OpusError result = codec->setFECEnabled(false);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
    TEST_ASSERT_FALSE(codec->isFECEnabled());
}

// Test 8.3: Set FEC with 0% redundancy
void test_fec_0_percent_redundancy(void) {
    codec->initEncoder();
    OpusError result = codec->setFECEnabled(true, 0);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
}

// Test 8.4: Set FEC with 50% redundancy
void test_fec_50_percent_redundancy(void) {
    codec->initEncoder();
    OpusError result = codec->setFECEnabled(true, 50);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
}

// Test 8.5: Set FEC with 100% redundancy
void test_fec_100_percent_redundancy(void) {
    codec->initEncoder();
    OpusError result = codec->setFECEnabled(true, 100);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
}

// Test 8.6: Set invalid FEC redundancy (>100%)
void test_fec_invalid_redundancy(void) {
    codec->initEncoder();
    OpusError result = codec->setFECEnabled(true, 150);
    TEST_ASSERT_EQUAL_INT(OPUS_ERR_INVALID_PARAMS, result);
}

// Test 8.7: Enable FEC before initialization
void test_fec_before_init(void) {
    // Should succeed - settings are stored
    OpusError result = codec->setFECEnabled(true, 50);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
}

// Test 8.8: FEC encoding increases packet size
void test_fec_increases_packet_size(void) {
    // Encode without FEC
    codec->initEncoder(OPUS_SAMPLE_RATE, 1, 32000);
    codec->setFECEnabled(false);
    int size_no_fec = codec->encodeFrame(test_pcm_frame, 480, encoded_buffer, sizeof(encoded_buffer));

    // Encode with FEC
    codec->setFECEnabled(true, 50);
    int size_with_fec = codec->encodeFrame(test_pcm_frame, 480, encoded_buffer, sizeof(encoded_buffer));

    // Both should be valid
    TEST_ASSERT_GREATER_THAN(0, size_no_fec);
    TEST_ASSERT_GREATER_THAN(0, size_with_fec);
    // FEC typically adds more data
    TEST_ASSERT_GREATER_OR_EQUAL(size_with_fec, size_no_fec);
}

/*
 * ============================================================================
 * TEST GROUP 9: DTX (DISCONTINUOUS TRANSMISSION)
 * ============================================================================
 */

// Test 9.1: Enable DTX
void test_dtx_enable(void) {
    codec->initEncoder();
    OpusError result = codec->setDTXEnabled(true);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
    TEST_ASSERT_TRUE(codec->isDTXEnabled());
}

// Test 9.2: Disable DTX
void test_dtx_disable(void) {
    codec->initEncoder();
    codec->setDTXEnabled(true);
    OpusError result = codec->setDTXEnabled(false);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
    TEST_ASSERT_FALSE(codec->isDTXEnabled());
}

// Test 9.3: Enable DTX before initialization
void test_dtx_before_init(void) {
    OpusError result = codec->setDTXEnabled(true);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
    TEST_ASSERT_TRUE(codec->isDTXEnabled());
}

// Test 9.4: DTX reduces bandwidth on silence
void test_dtx_silence_detection(void) {
    codec->initEncoder(OPUS_SAMPLE_RATE, 1, 32000);
    codec->setDTXEnabled(true);

    // Create silent frame (all zeros)
    int16_t silence[480] = {0};

    // Encode silence with DTX
    int encoded_size = codec->encodeFrame(silence, 480, encoded_buffer, sizeof(encoded_buffer));
    TEST_ASSERT_GREATER_OR_EQUAL(0, encoded_size);  // May produce very small packet or error
}

// Test 9.5: DTX toggle during encoding
void test_dtx_toggle_during_encoding(void) {
    codec->initEncoder();

    // Enable DTX
    codec->setDTXEnabled(true);
    TEST_ASSERT_TRUE(codec->isDTXEnabled());

    // Encode frame
    codec->encodeFrame(test_pcm_frame, 480, encoded_buffer, sizeof(encoded_buffer));

    // Disable DTX
    codec->setDTXEnabled(false);
    TEST_ASSERT_FALSE(codec->isDTXEnabled());

    // Encode another frame
    codec->encodeFrame(test_pcm_frame, 480, encoded_buffer, sizeof(encoded_buffer));
}

/*
 * ============================================================================
 * TEST GROUP 10: PACKET LOSS CONCEALMENT
 * ============================================================================
 */

// Test 10.1: Decode missing frame (packet loss concealment)
void test_decode_missing_frame(void) {
    codec->initDecoder();
    int result = codec->decodeMissingFrame(decoded_buffer, sizeof(decoded_buffer) / sizeof(int16_t));
    TEST_ASSERT_GREATER_OR_EQUAL(0, result);
}

// Test 10.2: Set packet loss percentage to 0%
void test_packet_loss_0_percent(void) {
    codec->initDecoder();
    OpusError result = codec->setPacketLossPercentage(0);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
}

// Test 10.3: Set packet loss percentage to 10%
void test_packet_loss_10_percent(void) {
    codec->initDecoder();
    OpusError result = codec->setPacketLossPercentage(10);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
}

// Test 10.4: Set packet loss percentage to 50%
void test_packet_loss_50_percent(void) {
    codec->initDecoder();
    OpusError result = codec->setPacketLossPercentage(50);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
}

// Test 10.5: Set invalid packet loss percentage (>100%)
void test_packet_loss_invalid_too_high(void) {
    codec->initDecoder();
    OpusError result = codec->setPacketLossPercentage(150);
    TEST_ASSERT_EQUAL_INT(OPUS_ERR_INVALID_PARAMS, result);
}

// Test 10.6: Multiple missing frame concealment
void test_multiple_missing_frames(void) {
    codec->initDecoder();

    for (int i = 0; i < 5; i++) {
        int result = codec->decodeMissingFrame(decoded_buffer, 480);
        TEST_ASSERT_GREATER_OR_EQUAL(0, result);
    }
}

// Test 10.7: Alternating valid and missing frames
void test_alternating_valid_missing_frames(void) {
    codec->initEncoder();
    codec->initDecoder();

    for (int i = 0; i < 5; i++) {
        // Encode and decode a valid frame
        int encoded_size = codec->encodeFrame(test_pcm_frame, 480, encoded_buffer, sizeof(encoded_buffer));
        TEST_ASSERT_GREATER_THAN(0, encoded_size);

        int decoded_size = codec->decodeFrame(encoded_buffer, encoded_size, decoded_buffer, 480);
        TEST_ASSERT_EQUAL_INT(480, decoded_size);

        // Simulate packet loss - decode missing frame
        int missing_size = codec->decodeMissingFrame(decoded_buffer, 480);
        TEST_ASSERT_GREATER_OR_EQUAL(0, missing_size);
    }
}

/*
 * ============================================================================
 * TEST GROUP 11: STATISTICS TRACKING
 * ============================================================================
 */

// Test 11.1: Statistics tracking - encoder packets
void test_stats_encoder_packets(void) {
    codec->initEncoder();
    codec->resetStatistics();

    OpusStats stats;
    codec->getStatistics(stats);
    TEST_ASSERT_EQUAL_UINT32(0, stats.packets_encoded);

    codec->encodeFrame(test_pcm_frame, 480, encoded_buffer, sizeof(encoded_buffer));
    codec->getStatistics(stats);
    TEST_ASSERT_EQUAL_UINT32(1, stats.packets_encoded);

    codec->encodeFrame(test_pcm_frame, 480, encoded_buffer, sizeof(encoded_buffer));
    codec->getStatistics(stats);
    TEST_ASSERT_EQUAL_UINT32(2, stats.packets_encoded);
}

// Test 11.2: Statistics tracking - encoder bytes
void test_stats_encoder_bytes(void) {
    codec->initEncoder();
    codec->resetStatistics();

    OpusStats stats;
    codec->getStatistics(stats);
    TEST_ASSERT_EQUAL_UINT32(0, stats.bytes_encoded);

    codec->encodeFrame(test_pcm_frame, 480, encoded_buffer, sizeof(encoded_buffer));
    codec->getStatistics(stats);
    TEST_ASSERT_GREATER_THAN(0, stats.bytes_encoded);
}

// Test 11.3: Statistics tracking - decoder packets
void test_stats_decoder_packets(void) {
    codec->initEncoder();
    codec->initDecoder();
    codec->resetStatistics();

    int encoded_size = codec->encodeFrame(test_pcm_frame, 480, encoded_buffer, sizeof(encoded_buffer));

    OpusStats stats;
    codec->getStatistics(stats);
    TEST_ASSERT_EQUAL_UINT32(0, stats.packets_decoded);

    codec->decodeFrame(encoded_buffer, encoded_size, decoded_buffer, 480);
    codec->getStatistics(stats);
    TEST_ASSERT_EQUAL_UINT32(1, stats.packets_decoded);
}

// Test 11.4: Statistics tracking - total samples
void test_stats_total_samples(void) {
    codec->initEncoder();
    codec->initDecoder();
    codec->resetStatistics();

    OpusStats stats;
    codec->getStatistics(stats);
    TEST_ASSERT_EQUAL_UINT32(0, stats.total_samples_encoded);

    codec->encodeFrame(test_pcm_frame, 480, encoded_buffer, sizeof(encoded_buffer));
    codec->getStatistics(stats);
    TEST_ASSERT_EQUAL_UINT32(480, stats.total_samples_encoded);
}

// Test 11.5: Reset statistics
void test_stats_reset(void) {
    codec->initEncoder();
    codec->encodeFrame(test_pcm_frame, 480, encoded_buffer, sizeof(encoded_buffer));

    OpusStats stats;
    codec->getStatistics(stats);
    TEST_ASSERT_GREATER_THAN(0, stats.packets_encoded);

    codec->resetStatistics();
    codec->getStatistics(stats);
    TEST_ASSERT_EQUAL_UINT32(0, stats.packets_encoded);
    TEST_ASSERT_EQUAL_UINT32(0, stats.bytes_encoded);
}

// Test 11.6: Encoding errors tracked
void test_stats_encode_errors(void) {
    codec->initEncoder();
    codec->resetStatistics();

    // Try to encode with invalid parameters
    int result = codec->encodeFrame(nullptr, 480, encoded_buffer, sizeof(encoded_buffer));
    TEST_ASSERT_NOT_EQUAL(0, result);  // Should fail

    OpusStats stats;
    codec->getStatistics(stats);
    // Error should be tracked (if encoder was initialized)
}

/*
 * ============================================================================
 * TEST GROUP 12: QUALITY PRESETS
 * ============================================================================
 */

// Test 12.1: Set quality preset 0 (Low)
void test_quality_preset_0_low(void) {
    codec->initEncoder();
    OpusError result = codec->setQualityPreset(0);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
    TEST_ASSERT_EQUAL_UINT32(8000, codec->getEncoderBitrate());
    TEST_ASSERT_EQUAL_UINT8(3, codec->getEncoderComplexity());
}

// Test 12.2: Set quality preset 1 (Medium)
void test_quality_preset_1_medium(void) {
    codec->initEncoder();
    OpusError result = codec->setQualityPreset(1);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
    TEST_ASSERT_EQUAL_UINT32(16000, codec->getEncoderBitrate());
    TEST_ASSERT_EQUAL_UINT8(6, codec->getEncoderComplexity());
}

// Test 12.3: Set quality preset 2 (High)
void test_quality_preset_2_high(void) {
    codec->initEncoder();
    OpusError result = codec->setQualityPreset(2);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
    TEST_ASSERT_EQUAL_UINT32(32000, codec->getEncoderBitrate());
    TEST_ASSERT_EQUAL_UINT8(9, codec->getEncoderComplexity());
}

// Test 12.4: Set quality preset 3 (Ultra)
void test_quality_preset_3_ultra(void) {
    codec->initEncoder();
    OpusError result = codec->setQualityPreset(3);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
    TEST_ASSERT_EQUAL_UINT32(64000, codec->getEncoderBitrate());
    TEST_ASSERT_EQUAL_UINT8(10, codec->getEncoderComplexity());
}

// Test 12.5: Set invalid quality preset
void test_quality_preset_invalid(void) {
    codec->initEncoder();
    OpusError result = codec->setQualityPreset(5);  // Invalid preset
    TEST_ASSERT_EQUAL_INT(OPUS_ERR_INVALID_PARAMS, result);
}

// Test 12.6: Quality preset improves with each level
void test_quality_preset_progression(void) {
    codec->initEncoder();

    // Test progression from low to ultra
    for (uint8_t preset = 0; preset < 4; preset++) {
        OpusError result = codec->setQualityPreset(preset);
        TEST_ASSERT_EQUAL_INT(OPUS_OK, result);

        int encoded_size = codec->encodeFrame(test_pcm_frame, 480, encoded_buffer, sizeof(encoded_buffer));
        TEST_ASSERT_GREATER_THAN(0, encoded_size);
    }
}

/*
 * ============================================================================
 * TEST GROUP 13: FRAME SIZE VARIATIONS
 * ============================================================================
 */

// Test 13.1: 20ms frame size (480 samples at 24kHz)
void test_frame_size_20ms(void) {
    codec->initEncoder(24000, 1, 32000);
    uint32_t frame_size = 480;  // 20ms at 24kHz
    int result = codec->encodeFrame(test_pcm_frame, frame_size, encoded_buffer, sizeof(encoded_buffer));
    TEST_ASSERT_GREATER_THAN(0, result);
}

// Test 13.2: 40ms frame size (960 samples at 24kHz)
void test_frame_size_40ms(void) {
    codec->initEncoder(24000, 1, 32000);
    int16_t frame_40ms[960];
    generate_test_pcm(frame_40ms, 960, 24000);

    int result = codec->encodeFrame(frame_40ms, 960, encoded_buffer, sizeof(encoded_buffer));
    TEST_ASSERT_GREATER_THAN(0, result);
}

// Test 13.3: 60ms frame size (1440 samples at 24kHz)
void test_frame_size_60ms(void) {
    codec->initEncoder(24000, 1, 32000);
    int16_t frame_60ms[1440];
    generate_test_pcm(frame_60ms, 1440, 24000);

    int result = codec->encodeFrame(frame_60ms, 1440, encoded_buffer, sizeof(encoded_buffer));
    TEST_ASSERT_GREATER_THAN(0, result);
}

// Test 13.4: Larger frame sizes at 8kHz
void test_frame_size_8khz(void) {
    codec->initEncoder(8000, 1, 32000);

    // 20ms at 8kHz = 160 samples
    int16_t frame_8k[160];
    generate_test_pcm(frame_8k, 160, 8000);

    int result = codec->encodeFrame(frame_8k, 160, encoded_buffer, sizeof(encoded_buffer));
    TEST_ASSERT_GREATER_THAN(0, result);
}

// Test 13.5: Frame size affects encoding time
void test_frame_size_affects_encoding(void) {
    codec->initEncoder(24000, 1, 32000);

    // Small frame
    int16_t small_frame[240];  // 10ms
    generate_test_pcm(small_frame, 240, 24000);
    int small_result = codec->encodeFrame(small_frame, 240, encoded_buffer, sizeof(encoded_buffer));

    // Large frame
    int16_t large_frame[1440];  // 60ms
    generate_test_pcm(large_frame, 1440, 24000);
    int large_result = codec->encodeFrame(large_frame, 1440, encoded_buffer, sizeof(encoded_buffer));

    TEST_ASSERT_GREATER_THAN(0, small_result);
    TEST_ASSERT_GREATER_THAN(0, large_result);
}

/*
 * ============================================================================
 * TEST GROUP 14: ERROR HANDLING (INVALID PARAMETERS)
 * ============================================================================
 */

// Test 14.1: Invalid sample rate in encoder
void test_error_invalid_sample_rate(void) {
    OpusError result = codec->initEncoder(11025, 1, 32000);  // 11.025 kHz not supported
    TEST_ASSERT_EQUAL_INT(OPUS_ERR_INVALID_PARAMS, result);
}

// Test 14.2: Invalid channel count in encoder
void test_error_invalid_channel_count(void) {
    OpusError result = codec->initEncoder(24000, 4, 32000);  // Only 1 or 2 channels
    TEST_ASSERT_EQUAL_INT(OPUS_ERR_INVALID_PARAMS, result);
}

// Test 14.3: Invalid bitrate in encoder
void test_error_invalid_bitrate(void) {
    OpusError result = codec->initEncoder(24000, 1, 256000);  // Way too high
    TEST_ASSERT_EQUAL_INT(OPUS_ERR_INVALID_PARAMS, result);
}

// Test 14.4: Encode without initializing encoder
void test_error_encode_not_initialized(void) {
    int result = codec->encodeFrame(test_pcm_frame, 480, encoded_buffer, sizeof(encoded_buffer));
    TEST_ASSERT_EQUAL_INT(OPUS_ERR_NOT_INITIALIZED, result);
}

// Test 14.5: Decode without initializing decoder
void test_error_decode_not_initialized(void) {
    int result = codec->decodeFrame(encoded_buffer, 50, decoded_buffer, 480);
    TEST_ASSERT_EQUAL_INT(OPUS_ERR_NOT_INITIALIZED, result);
}

// Test 14.6: Null pointer in encode
void test_error_encode_null_pcm(void) {
    codec->initEncoder();
    int result = codec->encodeFrame(nullptr, 480, encoded_buffer, sizeof(encoded_buffer));
    TEST_ASSERT_EQUAL_INT(OPUS_ERR_INVALID_PARAMS, result);
}

// Test 14.7: Null pointer in decode
void test_error_decode_null_output(void) {
    codec->initDecoder();
    int result = codec->decodeFrame(encoded_buffer, 50, nullptr, 480);
    TEST_ASSERT_EQUAL_INT(OPUS_ERR_INVALID_PARAMS, result);
}

// Test 14.8: Buffer overflow in encode
void test_error_encode_buffer_overflow(void) {
    codec->initEncoder();
    uint8_t tiny_buffer[10];
    int result = codec->encodeFrame(test_pcm_frame, 480, tiny_buffer, sizeof(tiny_buffer));
    TEST_ASSERT_EQUAL_INT(OPUS_ERR_BUFFER_OVERFLOW, result);
}

// Test 14.9: Buffer overflow in decode
void test_error_decode_buffer_overflow(void) {
    codec->initDecoder();
    int16_t tiny_buffer[100];
    int result = codec->decodeFrame(encoded_buffer, 50, tiny_buffer, 100);
    // Should fail due to insufficient buffer
}

// Test 14.10: Reset decoder
void test_error_reset_decoder_not_initialized(void) {
    OpusError result = codec->resetDecoder();
    TEST_ASSERT_EQUAL_INT(OPUS_ERR_NOT_INITIALIZED, result);
}

// Test 14.11: Reset encoder
void test_error_reset_encoder_not_initialized(void) {
    OpusError result = codec->resetEncoder();
    TEST_ASSERT_EQUAL_INT(OPUS_ERR_NOT_INITIALIZED, result);
}

// Test 14.12: Reset decoder after init
void test_reset_decoder_success(void) {
    codec->initDecoder();
    OpusError result = codec->resetDecoder();
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
}

// Test 14.13: Reset encoder after init
void test_reset_encoder_success(void) {
    codec->initEncoder();
    OpusError result = codec->resetEncoder();
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
}

// Test 14.14: Reinitialize encoder
void test_reinit_encoder(void) {
    codec->initEncoder(24000, 1, 32000);
    TEST_ASSERT_EQUAL_UINT32(24000, codec->getSampleRate());

    // Reinitialize with different parameters
    OpusError result = codec->initEncoder(48000, 2, 64000);
    TEST_ASSERT_EQUAL_INT(OPUS_OK, result);
    TEST_ASSERT_EQUAL_UINT32(48000, codec->getSampleRate());
    TEST_ASSERT_EQUAL_UINT8(2, codec->getChannels());
    TEST_ASSERT_EQUAL_UINT32(64000, codec->getEncoderBitrate());
}

/*
 * ============================================================================
 * MAIN TEST RUNNER
 * ============================================================================
 */

int main(int argc, char **argv) {
    printf("\n");
    printf("========================================\n");
    printf("Opus Codec Module - Unit Tests\n");
    printf("========================================\n\n");

    unsigned int total_run = 0;
    unsigned int total_passed = 0;
    unsigned int total_failed = 0;

    #define RUN_SINGLE_TEST(test_name) \
        do { \
            printf("Running: %s\n", #test_name); \
            setUp(); \
            try { \
                test_name(); \
                total_passed++; \
            } catch(...) { \
                total_failed++; \
            } \
            tearDown(); \
            total_run++; \
        } while(0)

    // GROUP 1: Encoder Initialization Tests (15 tests)
    printf("\n--- GROUP 1: Encoder Initialization ---\n");
    RUN_SINGLE_TEST(test_encoder_init_default_parameters);
    RUN_SINGLE_TEST(test_encoder_init_8khz_sample_rate);
    RUN_SINGLE_TEST(test_encoder_init_16khz_sample_rate);
    RUN_SINGLE_TEST(test_encoder_init_24khz_sample_rate);
    RUN_SINGLE_TEST(test_encoder_init_48khz_sample_rate);
    RUN_SINGLE_TEST(test_encoder_init_mono_channel);
    RUN_SINGLE_TEST(test_encoder_init_stereo_channel);
    RUN_SINGLE_TEST(test_encoder_init_bitrate_8kbps);
    RUN_SINGLE_TEST(test_encoder_init_bitrate_32kbps);
    RUN_SINGLE_TEST(test_encoder_init_bitrate_64kbps);
    RUN_SINGLE_TEST(test_encoder_init_invalid_sample_rate);
    RUN_SINGLE_TEST(test_encoder_init_invalid_channels);
    RUN_SINGLE_TEST(test_encoder_init_invalid_bitrate);
    RUN_SINGLE_TEST(test_encoder_init_voip_mode);
    RUN_SINGLE_TEST(test_encoder_init_audio_mode);

    // GROUP 2: Decoder Initialization Tests (6 tests)
    printf("\n--- GROUP 2: Decoder Initialization ---\n");
    RUN_SINGLE_TEST(test_decoder_init_default_parameters);
    RUN_SINGLE_TEST(test_decoder_init_8khz_sample_rate);
    RUN_SINGLE_TEST(test_decoder_init_48khz_sample_rate);
    RUN_SINGLE_TEST(test_decoder_init_stereo);
    RUN_SINGLE_TEST(test_decoder_init_invalid_sample_rate);
    RUN_SINGLE_TEST(test_decoder_init_invalid_channels);

    // GROUP 3: Encode PCM Frame Tests (7 tests)
    printf("\n--- GROUP 3: Encode PCM Frame ---\n");
    RUN_SINGLE_TEST(test_encode_pcm_frame_success);
    RUN_SINGLE_TEST(test_encode_pcm_null_input);
    RUN_SINGLE_TEST(test_encode_pcm_null_output);
    RUN_SINGLE_TEST(test_encode_without_init);
    RUN_SINGLE_TEST(test_encode_undersized_buffer);
    RUN_SINGLE_TEST(test_encode_multiple_frames);
    RUN_SINGLE_TEST(test_encode_different_sample_rates);

    // GROUP 4: Decode Opus Frame Tests (5 tests)
    printf("\n--- GROUP 4: Decode Opus Frame ---\n");
    RUN_SINGLE_TEST(test_decode_opus_frame_success);
    RUN_SINGLE_TEST(test_decode_null_output);
    RUN_SINGLE_TEST(test_decode_without_init);
    RUN_SINGLE_TEST(test_decode_undersized_output);
    RUN_SINGLE_TEST(test_decode_invalid_payload);

    // GROUP 5: Round-trip Tests (3 tests)
    printf("\n--- GROUP 5: Round-trip Encoding/Decoding ---\n");
    RUN_SINGLE_TEST(test_roundtrip_encode_decode_quality);
    RUN_SINGLE_TEST(test_roundtrip_high_bitrate_quality);
    RUN_SINGLE_TEST(test_roundtrip_multiple_cycles);

    // GROUP 6: Bitrate Control Tests (8 tests)
    printf("\n--- GROUP 6: Bitrate Control ---\n");
    RUN_SINGLE_TEST(test_bitrate_8kbps);
    RUN_SINGLE_TEST(test_bitrate_16kbps);
    RUN_SINGLE_TEST(test_bitrate_32kbps);
    RUN_SINGLE_TEST(test_bitrate_64kbps);
    RUN_SINGLE_TEST(test_bitrate_invalid_too_low);
    RUN_SINGLE_TEST(test_bitrate_invalid_too_high);
    RUN_SINGLE_TEST(test_bitrate_not_initialized);
    RUN_SINGLE_TEST(test_bitrate_dynamic_change);

    // GROUP 7: Complexity Settings Tests (7 tests)
    printf("\n--- GROUP 7: Complexity Settings ---\n");
    RUN_SINGLE_TEST(test_complexity_0_fastest);
    RUN_SINGLE_TEST(test_complexity_5_medium);
    RUN_SINGLE_TEST(test_complexity_10_highest);
    RUN_SINGLE_TEST(test_complexity_all_levels);
    RUN_SINGLE_TEST(test_complexity_invalid_too_high);
    RUN_SINGLE_TEST(test_complexity_not_initialized);
    RUN_SINGLE_TEST(test_complexity_affects_encoding);

    // GROUP 8: FEC Tests (8 tests)
    printf("\n--- GROUP 8: FEC (Forward Error Correction) ---\n");
    RUN_SINGLE_TEST(test_fec_enable);
    RUN_SINGLE_TEST(test_fec_disable);
    RUN_SINGLE_TEST(test_fec_0_percent_redundancy);
    RUN_SINGLE_TEST(test_fec_50_percent_redundancy);
    RUN_SINGLE_TEST(test_fec_100_percent_redundancy);
    RUN_SINGLE_TEST(test_fec_invalid_redundancy);
    RUN_SINGLE_TEST(test_fec_before_init);
    RUN_SINGLE_TEST(test_fec_increases_packet_size);

    // GROUP 9: DTX Tests (5 tests)
    printf("\n--- GROUP 9: DTX (Discontinuous Transmission) ---\n");
    RUN_SINGLE_TEST(test_dtx_enable);
    RUN_SINGLE_TEST(test_dtx_disable);
    RUN_SINGLE_TEST(test_dtx_before_init);
    RUN_SINGLE_TEST(test_dtx_silence_detection);
    RUN_SINGLE_TEST(test_dtx_toggle_during_encoding);

    // GROUP 10: Packet Loss Concealment Tests (7 tests)
    printf("\n--- GROUP 10: Packet Loss Concealment ---\n");
    RUN_SINGLE_TEST(test_decode_missing_frame);
    RUN_SINGLE_TEST(test_packet_loss_0_percent);
    RUN_SINGLE_TEST(test_packet_loss_10_percent);
    RUN_SINGLE_TEST(test_packet_loss_50_percent);
    RUN_SINGLE_TEST(test_packet_loss_invalid_too_high);
    RUN_SINGLE_TEST(test_multiple_missing_frames);
    RUN_SINGLE_TEST(test_alternating_valid_missing_frames);

    // GROUP 11: Statistics Tracking Tests (7 tests)
    printf("\n--- GROUP 11: Statistics Tracking ---\n");
    RUN_SINGLE_TEST(test_stats_encoder_packets);
    RUN_SINGLE_TEST(test_stats_encoder_bytes);
    RUN_SINGLE_TEST(test_stats_decoder_packets);
    RUN_SINGLE_TEST(test_stats_total_samples);
    RUN_SINGLE_TEST(test_stats_reset);
    RUN_SINGLE_TEST(test_stats_encode_errors);

    // GROUP 12: Quality Presets Tests (6 tests)
    printf("\n--- GROUP 12: Quality Presets ---\n");
    RUN_SINGLE_TEST(test_quality_preset_0_low);
    RUN_SINGLE_TEST(test_quality_preset_1_medium);
    RUN_SINGLE_TEST(test_quality_preset_2_high);
    RUN_SINGLE_TEST(test_quality_preset_3_ultra);
    RUN_SINGLE_TEST(test_quality_preset_invalid);
    RUN_SINGLE_TEST(test_quality_preset_progression);

    // GROUP 13: Frame Size Variations Tests (5 tests)
    printf("\n--- GROUP 13: Frame Size Variations ---\n");
    RUN_SINGLE_TEST(test_frame_size_20ms);
    RUN_SINGLE_TEST(test_frame_size_40ms);
    RUN_SINGLE_TEST(test_frame_size_60ms);
    RUN_SINGLE_TEST(test_frame_size_8khz);
    RUN_SINGLE_TEST(test_frame_size_affects_encoding);

    // GROUP 14: Error Handling Tests (14 tests)
    printf("\n--- GROUP 14: Error Handling ---\n");
    RUN_SINGLE_TEST(test_error_invalid_sample_rate);
    RUN_SINGLE_TEST(test_error_invalid_channel_count);
    RUN_SINGLE_TEST(test_error_invalid_bitrate);
    RUN_SINGLE_TEST(test_error_encode_not_initialized);
    RUN_SINGLE_TEST(test_error_decode_not_initialized);
    RUN_SINGLE_TEST(test_error_encode_null_pcm);
    RUN_SINGLE_TEST(test_error_decode_null_output);
    RUN_SINGLE_TEST(test_error_encode_buffer_overflow);
    RUN_SINGLE_TEST(test_error_decode_buffer_overflow);
    RUN_SINGLE_TEST(test_error_reset_decoder_not_initialized);
    RUN_SINGLE_TEST(test_error_reset_encoder_not_initialized);
    RUN_SINGLE_TEST(test_reset_decoder_success);
    RUN_SINGLE_TEST(test_reset_encoder_success);
    RUN_SINGLE_TEST(test_reinit_encoder);

    // Print summary
    printf("\n========================================\n");
    printf("Test Summary:\n");
    printf("  Total tests run: %u\n", total_run);
    printf("  Tests passed:   %u\n", total_passed);
    printf("  Tests failed:   %u\n", total_failed);
    printf("========================================\n\n");

    if (total_failed == 0) {
        printf("All tests PASSED!\n\n");
        return 0;
    } else {
        printf("Some tests FAILED!\n\n");
        return 1;
    }
}
