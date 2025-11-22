/**
 * Opus Codec Header - Stub Implementation
 * Compatible with Opus 1.3.1 API
 */

#ifndef OPUS_H
#define OPUS_H

#ifdef __cplusplus
extern "C" {
#endif

// Opus types
typedef short opus_int16;
typedef unsigned short opus_uint16;
typedef int opus_int32;
typedef unsigned int opus_uint32;

// Opus constants
#define OPUS_OK                0
#define OPUS_BAD_ARG          -1
#define OPUS_BUFFER_TOO_SMALL -2
#define OPUS_INTERNAL_ERROR   -3
#define OPUS_INVALID_PACKET   -4
#define OPUS_UNIMPLEMENTED    -5
#define OPUS_INVALID_STATE    -6
#define OPUS_ALLOC_FAIL       -7

// Application types
#define OPUS_APPLICATION_VOIP    2048
#define OPUS_APPLICATION_AUDIO   2049
#define OPUS_APPLICATION_RESTRICTED_LOWDELAY 2051

// CTL defines
#define OPUS_SET_BITRATE_REQUEST        4002
#define OPUS_GET_BITRATE_REQUEST        4003
#define OPUS_SET_COMPLEXITY_REQUEST     4010
#define OPUS_GET_COMPLEXITY_REQUEST     4011
#define OPUS_SET_VBR_REQUEST            4006
#define OPUS_GET_VBR_REQUEST            4007
#define OPUS_SET_BANDWIDTH_REQUEST      4008
#define OPUS_SET_INBAND_FEC_REQUEST     4012
#define OPUS_GET_INBAND_FEC_REQUEST     4013
#define OPUS_SET_PACKET_LOSS_PERC_REQUEST 4014
#define OPUS_GET_PACKET_LOSS_PERC_REQUEST 4015
#define OPUS_SET_DTX_REQUEST            4016
#define OPUS_GET_DTX_REQUEST            4017
#define OPUS_RESET_STATE                4028

// Bandwidth constants
#define OPUS_AUTO                   -1000
#define OPUS_BITRATE_MAX            -1

#define OPUS_BANDWIDTH_NARROWBAND       1101
#define OPUS_BANDWIDTH_MEDIUMBAND       1102
#define OPUS_BANDWIDTH_WIDEBAND         1103
#define OPUS_BANDWIDTH_SUPERWIDEBAND    1104
#define OPUS_BANDWIDTH_FULLBAND         1105

// Encoder/Decoder constants
#define OPUS_MAX_BITRATE           512000
#define OPUS_MAX_COMPLEXITY        10

// CTL helper macros (for convenience API)
#define OPUS_SET_BITRATE(x)         OPUS_SET_BITRATE_REQUEST, __opus_check_int(x)
#define OPUS_GET_BITRATE(x)         OPUS_GET_BITRATE_REQUEST, __opus_check_int_ptr(x)
#define OPUS_SET_COMPLEXITY(x)      OPUS_SET_COMPLEXITY_REQUEST, __opus_check_int(x)
#define OPUS_GET_COMPLEXITY(x)      OPUS_GET_COMPLEXITY_REQUEST, __opus_check_int_ptr(x)
#define OPUS_SET_VBR(x)             OPUS_SET_VBR_REQUEST, __opus_check_int(x)
#define OPUS_GET_VBR(x)             OPUS_GET_VBR_REQUEST, __opus_check_int_ptr(x)
#define OPUS_SET_BANDWIDTH(x)       OPUS_SET_BANDWIDTH_REQUEST, __opus_check_int(x)
#define OPUS_SET_INBAND_FEC(x)      OPUS_SET_INBAND_FEC_REQUEST, __opus_check_int(x)
#define OPUS_GET_INBAND_FEC(x)      OPUS_GET_INBAND_FEC_REQUEST, __opus_check_int_ptr(x)
#define OPUS_SET_PACKET_LOSS_PERC(x) OPUS_SET_PACKET_LOSS_PERC_REQUEST, __opus_check_int(x)
#define OPUS_GET_PACKET_LOSS_PERC(x) OPUS_GET_PACKET_LOSS_PERC_REQUEST, __opus_check_int_ptr(x)
#define OPUS_SET_DTX(x)             OPUS_SET_DTX_REQUEST, __opus_check_int(x)
#define OPUS_GET_DTX(x)             OPUS_GET_DTX_REQUEST, __opus_check_int_ptr(x)

// Type checking helpers (simplified for stub)
#define __opus_check_int(x) (x)
#define __opus_check_int_ptr(x) (x)

// Forward declarations
typedef struct OpusEncoder OpusEncoder;
typedef struct OpusDecoder OpusDecoder;

// Encoder functions
OpusEncoder *opus_encoder_create(opus_int32 Fs, int channels, int application, int *error);
void opus_encoder_destroy(OpusEncoder *st);
int opus_encoder_ctl(OpusEncoder *st, int request, ...);
opus_int32 opus_encode(OpusEncoder *st, const opus_int16 *pcm, int frame_size,
                       unsigned char *data, opus_int32 max_data_bytes);

// Decoder functions
OpusDecoder *opus_decoder_create(opus_int32 Fs, int channels, int *error);
void opus_decoder_destroy(OpusDecoder *st);
int opus_decoder_ctl(OpusDecoder *st, int request, ...);
int opus_decode(OpusDecoder *st, const unsigned char *data, opus_int32 len,
                opus_int16 *pcm, int frame_size, int decode_fec);

// Utility functions
const char *opus_strerror(int error);
const char *opus_get_version_string(void);

#ifdef __cplusplus
}
#endif

#endif /* OPUS_H */
