/*
 * ESP32 RoIP - Opus Codec Wrapper
 * Professional Audio Codec Implementation
 * libopus integration with FEC, DTX, and advanced error handling
 */

#ifndef ROIP_CODEC_OPUS_H
#define ROIP_CODEC_OPUS_H

#include <Arduino.h>
#include <stdint.h>
#include <stddef.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>

// Opus library forward declarations
struct OpusEncoder;
struct OpusDecoder;

// Constants
#define OPUS_MAX_PACKET_SIZE    4000
#define OPUS_MAX_FRAME_SIZE     5760
#define OPUS_MIN_FRAME_SIZE     120
#define OPUS_DEFAULT_FRAME_MS   20
#define OPUS_SAMPLE_RATE        24000

// Bitrate limits in bits per second
#define OPUS_MIN_BITRATE        8000    // 8 kbps
#define OPUS_MAX_BITRATE        64000   // 64 kbps
#define OPUS_DEFAULT_BITRATE    32000   // 32 kbps

// Complexity range (0-10)
#define OPUS_MIN_COMPLEXITY     0
#define OPUS_MAX_COMPLEXITY     10
#define OPUS_DEFAULT_COMPLEXITY 10

// Codec mode
enum OpusMode {
    OPUS_MODE_VOIP = 0,      // VOIP mode
    OPUS_MODE_AUDIO = 1,     // Audio/Music mode
    OPUS_MODE_RESTRICTED_LQ = 2  // Restricted Low Quality
};

// Error codes
enum OpusError {
    OPUS_OK = 0,
    OPUS_ERR_INIT_FAILED = -1,
    OPUS_ERR_INVALID_PARAMS = -2,
    OPUS_ERR_ENCODE_FAILED = -3,
    OPUS_ERR_DECODE_FAILED = -4,
    OPUS_ERR_INVALID_PAYLOAD = -5,
    OPUS_ERR_BUFFER_OVERFLOW = -6,
    OPUS_ERR_DECODER_RESET = -7,
    OPUS_ERR_NOT_INITIALIZED = -8,
    OPUS_ERR_MEMORY_ALLOCATION = -9
};

// Statistics structure
struct OpusStats {
    // Encoder stats
    uint32_t packets_encoded;
    uint32_t bytes_encoded;
    uint32_t encode_errors;
    uint32_t avg_encode_time_us;

    // Decoder stats
    uint32_t packets_decoded;
    uint32_t bytes_decoded;
    uint32_t decode_errors;
    uint32_t avg_decode_time_us;
    uint32_t packet_losses;
    uint32_t fec_packets_used;

    // Quality metrics
    float avg_bitrate_kbps;
    uint8_t current_complexity;
    uint32_t total_samples_encoded;
    uint32_t total_samples_decoded;
};

/*
 * OpusCodec - Main Opus Codec Wrapper Class
 * Thread-safe implementation with comprehensive error handling
 */
class OpusCodec {
public:
    /*
     * Constructor - Initialize codec wrapper
     */
    OpusCodec();

    /*
     * Destructor - Clean up codec resources
     */
    ~OpusCodec();

    /*
     * Initialize encoder with configuration
     * @param sampleRate Sample rate in Hz (default: 24000)
     * @param channels Number of audio channels (1 or 2)
     * @param bitrate Bitrate in bps (8000-64000)
     * @param complexity Encoder complexity 0-10
     * @param application Opus application mode
     * @return OpusError - OPUS_OK on success
     */
    OpusError initEncoder(
        uint32_t sampleRate = OPUS_SAMPLE_RATE,
        uint8_t channels = 1,
        uint32_t bitrate = OPUS_DEFAULT_BITRATE,
        uint8_t complexity = OPUS_DEFAULT_COMPLEXITY,
        OpusMode application = OPUS_MODE_VOIP
    );

    /*
     * Initialize decoder with configuration
     * @param sampleRate Sample rate in Hz (default: 24000)
     * @param channels Number of audio channels (1 or 2)
     * @return OpusError - OPUS_OK on success
     */
    OpusError initDecoder(
        uint32_t sampleRate = OPUS_SAMPLE_RATE,
        uint8_t channels = 1
    );

    /*
     * Configure encoder parameters
     * @param bitrate Bitrate in bps (8000-64000)
     * @return OpusError - OPUS_OK on success
     */
    OpusError setEncoderBitrate(uint32_t bitrate);

    /*
     * Get current encoder bitrate
     * @return Bitrate in bps, or 0 if encoder not initialized
     */
    uint32_t getEncoderBitrate() const;

    /*
     * Set encoder complexity
     * @param complexity 0-10 (0=fastest, 10=highest quality)
     * @return OpusError - OPUS_OK on success
     */
    OpusError setEncoderComplexity(uint8_t complexity);

    /*
     * Get current encoder complexity
     * @return Complexity level 0-10
     */
    uint8_t getEncoderComplexity() const;

    /*
     * Enable/disable Forward Error Correction
     * @param enabled Enable FEC
     * @param redundancy_percentage Redundancy percentage (0-100)
     * @return OpusError - OPUS_OK on success
     */
    OpusError setFECEnabled(bool enabled, uint8_t redundancy_percentage = 50);

    /*
     * Check if FEC is enabled
     * @return true if FEC is enabled
     */
    bool isFECEnabled() const;

    /*
     * Enable/disable Discontinuous Transmission
     * @param enabled Enable DTX
     * @return OpusError - OPUS_OK on success
     */
    OpusError setDTXEnabled(bool enabled);

    /*
     * Check if DTX is enabled
     * @return true if DTX is enabled
     */
    bool isDTXEnabled() const;

    /*
     * Set packet loss percentage for decoder
     * @param loss_percentage Loss percentage (0-100)
     * @return OpusError - OPUS_OK on success
     */
    OpusError setPacketLossPercentage(uint8_t loss_percentage);

    /*
     * Encode PCM audio to Opus frame
     * @param pcm Input PCM samples (int16_t)
     * @param frame_size Number of samples per channel
     * @param output Output buffer for encoded data
     * @param output_size Maximum output buffer size
     * @return Number of bytes encoded, or negative OpusError on failure
     */
    int encodeFrame(
        const int16_t* pcm,
        uint32_t frame_size,
        uint8_t* output,
        size_t output_size
    );

    /*
     * Decode Opus frame to PCM audio
     * @param input Encoded opus data
     * @param input_size Size of encoded data
     * @param output Output buffer for PCM samples
     * @param output_size Maximum output buffer size (in samples)
     * @param fec_data Optional FEC data for packet loss recovery
     * @return Number of samples decoded, or negative OpusError on failure
     */
    int decodeFrame(
        const uint8_t* input,
        uint32_t input_size,
        int16_t* output,
        size_t output_size,
        bool use_fec = false
    );

    /*
     * Decode missing frame (for packet loss concealment)
     * @param output Output buffer for concealed samples
     * @param output_size Maximum output buffer size (in samples)
     * @return Number of samples generated, or negative OpusError on failure
     */
    int decodeMissingFrame(
        int16_t* output,
        size_t output_size
    );

    /*
     * Reset decoder state
     * @return OpusError - OPUS_OK on success
     */
    OpusError resetDecoder();

    /*
     * Reset encoder state
     * @return OpusError - OPUS_OK on success
     */
    OpusError resetEncoder();

    /*
     * Get codec statistics
     * @param stats Reference to stats structure to fill
     */
    void getStatistics(OpusStats& stats) const;

    /*
     * Reset statistics counters
     */
    void resetStatistics();

    /*
     * Print statistics to serial output (for debugging)
     */
    void printStatistics() const;

    /*
     * Check if codec is fully initialized (both encoder and decoder)
     * @return true if both encoder and decoder are initialized
     */
    bool isInitialized() const;

    /*
     * Get frame size in samples
     * @return Number of samples per frame
     */
    uint32_t getFrameSize() const { return frame_size_samples; }

    /*
     * Get frame size in milliseconds
     * @return Frame duration in ms
     */
    uint16_t getFrameSizeMs() const { return frame_size_ms; }

    /*
     * Get sample rate
     * @return Sample rate in Hz
     */
    uint32_t getSampleRate() const { return sample_rate; }

    /*
     * Get number of channels
     * @return Number of audio channels
     */
    uint8_t getChannels() const { return channels; }

    /*
     * Set encoder bitrate based on quality preset
     * @param preset 0=low(8k), 1=medium(16k), 2=high(32k), 3=ultra(64k)
     * @return OpusError - OPUS_OK on success
     */
    OpusError setQualityPreset(uint8_t preset);

private:
    // Encoder/Decoder pointers (opaque)
    OpusEncoder* encoder;
    OpusDecoder* decoder;

    // Configuration
    uint32_t sample_rate;
    uint8_t channels;
    uint32_t bitrate;
    uint8_t complexity;
    uint16_t frame_size_ms;
    uint32_t frame_size_samples;
    OpusMode application;

    // Feature flags
    bool fec_enabled;
    uint8_t fec_redundancy;
    bool dtx_enabled;

    // State tracking
    bool encoder_initialized;
    bool decoder_initialized;
    uint8_t packet_loss_percentage;

    // FEC buffer for packet loss recovery
    static constexpr size_t FEC_BUFFER_SIZE = OPUS_MAX_PACKET_SIZE;
    uint8_t fec_buffer[FEC_BUFFER_SIZE];
    size_t fec_buffer_size;

    // Statistics
    mutable OpusStats stats;
    uint32_t last_encode_duration_us;
    uint32_t last_decode_duration_us;

    // Thread safety
    SemaphoreHandle_t encode_mutex;
    SemaphoreHandle_t decode_mutex;

    // Helper methods
    OpusError validateBitrate(uint32_t bitrate);
    OpusError validateComplexity(uint8_t complexity);
    OpusError validateFrameSize(uint32_t frame_size);
    void updateEncodeStats(uint32_t bytes_encoded, uint32_t duration_us);
    void updateDecodeStats(uint32_t samples_decoded, uint32_t duration_us);
};

#endif // ROIP_CODEC_OPUS_H
