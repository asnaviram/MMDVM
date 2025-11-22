/**
 * Opus Codec Stub Implementation for ESP32
 *
 * TEMPORARY SOLUTION: This provides stub implementations of Opus functions
 * to allow firmware compilation. Replace with actual Opus library for production.
 *
 * TODO: Integrate proper Opus library (v1.3.1+) for ESP32/Xtensa architecture
 */

#include "opus.h"
#include <stdlib.h>
#include <string.h>

// Stub encoder structure
struct OpusEncoder {
    int sample_rate;
    int channels;
    int application;
    int bitrate;
    int complexity;
};

// Stub decoder structure
struct OpusDecoder {
    int sample_rate;
    int channels;
};

OpusEncoder* opus_encoder_create(opus_int32 Fs, int channels, int application, int *error) {
    OpusEncoder *enc = (OpusEncoder*)malloc(sizeof(OpusEncoder));
    if (enc) {
        enc->sample_rate = Fs;
        enc->channels = channels;
        enc->application = application;
        enc->bitrate = 32000;  // default
        enc->complexity = 10;  // default
        if (error) *error = OPUS_OK;
    } else {
        if (error) *error = OPUS_ALLOC_FAIL;
    }
    return enc;
}

void opus_encoder_destroy(OpusEncoder *st) {
    if (st) {
        free(st);
    }
}

int opus_encoder_ctl(OpusEncoder *st, int request, ...) {
    if (!st) return OPUS_BAD_ARG;

    // Stub implementation - accepts all CTL commands
    // TODO: Implement actual control logic
    return OPUS_OK;
}

opus_int32 opus_encode(OpusEncoder *st, const opus_int16 *pcm, int frame_size,
                       unsigned char *data, opus_int32 max_data_bytes) {
    if (!st || !pcm || !data) return OPUS_BAD_ARG;

    // Stub: just copy PCM data (no actual compression)
    // TODO: Implement actual Opus encoding
    int bytes_to_copy = frame_size * st->channels * sizeof(opus_int16);
    if (bytes_to_copy > max_data_bytes) bytes_to_copy = max_data_bytes;

    memcpy(data, pcm, bytes_to_copy);
    return bytes_to_copy;
}

OpusDecoder* opus_decoder_create(opus_int32 Fs, int channels, int *error) {
    OpusDecoder *dec = (OpusDecoder*)malloc(sizeof(OpusDecoder));
    if (dec) {
        dec->sample_rate = Fs;
        dec->channels = channels;
        if (error) *error = OPUS_OK;
    } else {
        if (error) *error = OPUS_ALLOC_FAIL;
    }
    return dec;
}

void opus_decoder_destroy(OpusDecoder *st) {
    if (st) {
        free(st);
    }
}

int opus_decoder_ctl(OpusDecoder *st, int request, ...) {
    if (!st) return OPUS_BAD_ARG;

    // Stub implementation - accepts all CTL commands
    // TODO: Implement actual control logic
    return OPUS_OK;
}

int opus_decode(OpusDecoder *st, const unsigned char *data, opus_int32 len,
                opus_int16 *pcm, int frame_size, int decode_fec) {
    if (!st || !data || !pcm) return OPUS_BAD_ARG;

    // Stub: just copy data back (no actual decompression)
    // TODO: Implement actual Opus decoding
    int bytes_to_copy = len;
    int samples = bytes_to_copy / (st->channels * sizeof(opus_int16));

    if (samples > frame_size) samples = frame_size;
    bytes_to_copy = samples * st->channels * sizeof(opus_int16);

    memcpy(pcm, data, bytes_to_copy);
    return samples;
}

const char *opus_strerror(int error) {
    switch (error) {
        case OPUS_OK: return "success";
        case OPUS_BAD_ARG: return "bad argument";
        case OPUS_BUFFER_TOO_SMALL: return "buffer too small";
        case OPUS_INTERNAL_ERROR: return "internal error";
        case OPUS_INVALID_PACKET: return "invalid packet";
        case OPUS_UNIMPLEMENTED: return "unimplemented";
        case OPUS_INVALID_STATE: return "invalid state";
        case OPUS_ALLOC_FAIL: return "allocation failed";
        default: return "unknown error";
    }
}

const char *opus_get_version_string(void) {
    return "libopus stub 1.0.0 (ESP32)";
}
