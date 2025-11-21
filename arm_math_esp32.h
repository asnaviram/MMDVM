/*
 *   Copyright (C) 2024,2025 by MMDVM ESP32 Port Contributors
 *
 *   ARM CMSIS-DSP Compatibility Layer for ESP32
 *
 *   This header provides compatibility definitions and implementations
 *   of ARM CMSIS-DSP functions for ESP32 (Xtensa) processors.
 *
 *   This program is free software; you can redistribute it and/or modify
 *   it under the terms of the GNU General Public License as published by
 *   the Free Software Foundation; either version 2 of the License, or
 *   (at your option) any later version.
 */

#ifndef _ARM_MATH_ESP32_H
#define _ARM_MATH_ESP32_H

#include <stdint.h>
#include <string.h>
#include <math.h>

// ARM CMSIS-DSP compatible types
typedef int16_t q15_t;
typedef int32_t q31_t;
typedef int64_t q63_t;
typedef float   float32_t;

// Saturation macro (equivalent to ARM's __SSAT)
#ifndef __SSAT
#define __SSAT(x, bits) \
    ((x) > ((1 << ((bits) - 1)) - 1) ? ((1 << ((bits) - 1)) - 1) : \
     ((x) < (-(1 << ((bits) - 1))) ? (-(1 << ((bits) - 1))) : (x)))
#endif

// FIR filter instance structure
typedef struct {
    uint16_t numTaps;     // Number of filter coefficients
    q15_t*   pState;      // Points to the state variable array
    q15_t*   pCoeffs;     // Points to the coefficient array
} arm_fir_instance_q15;

// FIR interpolate instance structure (Q15)
typedef struct {
    uint8_t  L;           // Interpolation factor
    uint16_t phaseLength; // Length of each polyphase filter component
    q15_t*   pCoeffs;     // Points to coefficient array
    q15_t*   pState;      // Points to state variable array
} arm_fir_interpolate_instance_q15;

// FIR filter instance structure (float32)
typedef struct {
    uint16_t   numTaps;   // Number of filter coefficients
    float32_t* pState;    // Points to the state variable array
    float32_t* pCoeffs;   // Points to the coefficient array
} arm_fir_instance_f32;

// Biquad cascade filter instance structure (DF1, 32-bit)
typedef struct {
    uint8_t  numStages;   // Number of 2nd order stages
    q31_t*   pState;      // Points to the state variable array
    q31_t*   pCoeffs;     // Points to the coefficient array
    uint8_t  postShift;   // Additional shift (unused in our implementation)
} arm_biquad_casd_df1_inst_q31;

/**
 * @brief Fast Q15 FIR filter
 * @param[in]  S          points to an instance of the Q15 FIR filter structure
 * @param[in]  pSrc       points to the block of input data
 * @param[out] pDst       points to the block of output data
 * @param[in]  blockSize  number of samples to process
 */
static inline void arm_fir_fast_q15(
    const arm_fir_instance_q15* S,
    const q15_t* pSrc,
    q15_t* pDst,
    uint32_t blockSize)
{
    q15_t* pState = S->pState;
    const q15_t* pCoeffs = S->pCoeffs;
    uint16_t numTaps = S->numTaps;

    // Process each sample
    for (uint32_t sample = 0; sample < blockSize; sample++) {
        // Copy new input into state buffer
        pState[numTaps - 1] = pSrc[sample];

        // Apply FIR filter
        q31_t acc = 0;
        for (uint16_t i = 0; i < numTaps; i++) {
            acc += (q31_t)pState[numTaps - 1 - i] * (q31_t)pCoeffs[i];
        }

        // Store output (Q15 format: divide by 2^15)
        pDst[sample] = (q15_t)__SSAT(acc >> 15, 16);

        // Shift state buffer
        for (uint16_t i = 0; i < numTaps - 1; i++) {
            pState[i] = pState[i + 1];
        }
    }
}

/**
 * @brief Q31 Biquad cascade filter (Direct Form I)
 * @param[in]  S          points to an instance of the Q31 Biquad cascade structure
 * @param[in]  pSrc       points to the block of input data
 * @param[out] pDst       points to the block of output data
 * @param[in]  blockSize  number of samples to process
 */
static inline void arm_biquad_cascade_df1_q31(
    const arm_biquad_casd_df1_inst_q31* S,
    const q31_t* pSrc,
    q31_t* pDst,
    uint32_t blockSize)
{
    q31_t* pState = S->pState;
    const q31_t* pCoeffs = S->pCoeffs;
    uint8_t numStages = S->numStages;

    const q31_t* pIn = pSrc;
    q31_t* pOut = pDst;

    // Process each stage
    for (uint8_t stage = 0; stage < numStages; stage++) {
        // Coefficients for this stage: b0, b1, b2, a1, a2
        // Note: a1 and a2 are stored negated in ARM format
        q31_t b0 = pCoeffs[stage * 6 + 0];
        q31_t b1 = pCoeffs[stage * 6 + 2];  // b1 at index 2
        q31_t b2 = pCoeffs[stage * 6 + 3];  // b2 at index 3 (skip 0 padding)
        q31_t a1 = pCoeffs[stage * 6 + 4];  // -a1
        q31_t a2 = pCoeffs[stage * 6 + 5];  // -a2

        // State: x[n-1], x[n-2], y[n-1], y[n-2]
        q31_t Xn1 = pState[stage * 4 + 0];
        q31_t Xn2 = pState[stage * 4 + 1];
        q31_t Yn1 = pState[stage * 4 + 2];
        q31_t Yn2 = pState[stage * 4 + 3];

        // Process each sample
        for (uint32_t sample = 0; sample < blockSize; sample++) {
            q31_t Xn = (stage == 0) ? pIn[sample] : pOut[sample];

            // Direct Form I: y[n] = b0*x[n] + b1*x[n-1] + b2*x[n-2] - a1*y[n-1] - a2*y[n-2]
            // Note: a1 and a2 stored as negatives, so we add
            q63_t acc = (q63_t)b0 * Xn;
            acc += (q63_t)b1 * Xn1;
            acc += (q63_t)b2 * Xn2;
            acc += (q63_t)a1 * Yn1;
            acc += (q63_t)a2 * Yn2;

            // Scale and saturate (Q31 format)
            q31_t Yn = (q31_t)(acc >> 31);

            // Update state
            Xn2 = Xn1;
            Xn1 = Xn;
            Yn2 = Yn1;
            Yn1 = Yn;

            pOut[sample] = Yn;
        }

        // Save state
        pState[stage * 4 + 0] = Xn1;
        pState[stage * 4 + 1] = Xn2;
        pState[stage * 4 + 2] = Yn1;
        pState[stage * 4 + 3] = Yn2;

        // Use output as input for next stage
        pIn = pOut;
    }
}

/**
 * @brief Convert Q15 to Q31 format
 * @param[in]  pSrc       points to the Q15 input vector
 * @param[out] pDst       points to the Q31 output vector
 * @param[in]  blockSize  number of samples to process
 */
static inline void arm_q15_to_q31(
    const q15_t* pSrc,
    q31_t* pDst,
    uint32_t blockSize)
{
    for (uint32_t i = 0; i < blockSize; i++) {
        // Q15 to Q31: shift left by 16 bits
        pDst[i] = ((q31_t)pSrc[i]) << 16;
    }
}

/**
 * @brief Convert Q31 to Q15 format
 * @param[in]  pSrc       points to the Q31 input vector
 * @param[out] pDst       points to the Q15 output vector
 * @param[in]  blockSize  number of samples to process
 */
static inline void arm_q31_to_q15(
    const q31_t* pSrc,
    q15_t* pDst,
    uint32_t blockSize)
{
    for (uint32_t i = 0; i < blockSize; i++) {
        // Q31 to Q15: shift right by 16 bits with saturation
        pDst[i] = (q15_t)__SSAT(pSrc[i] >> 16, 16);
    }
}

/**
 * @brief Multiply two Q15 vectors
 * @param[in]  pSrcA      points to first input vector
 * @param[in]  pSrcB      points to second input vector
 * @param[out] pDst       points to output vector
 * @param[in]  blockSize  number of samples to process
 */
static inline void arm_mult_q15(
    const q15_t* pSrcA,
    const q15_t* pSrcB,
    q15_t* pDst,
    uint32_t blockSize)
{
    for (uint32_t i = 0; i < blockSize; i++) {
        q31_t product = (q31_t)pSrcA[i] * (q31_t)pSrcB[i];
        pDst[i] = (q15_t)__SSAT(product >> 15, 16);
    }
}

/**
 * @brief Add two Q15 vectors
 * @param[in]  pSrcA      points to first input vector
 * @param[in]  pSrcB      points to second input vector
 * @param[out] pDst       points to output vector
 * @param[in]  blockSize  number of samples to process
 */
static inline void arm_add_q15(
    const q15_t* pSrcA,
    const q15_t* pSrcB,
    q15_t* pDst,
    uint32_t blockSize)
{
    for (uint32_t i = 0; i < blockSize; i++) {
        q31_t sum = (q31_t)pSrcA[i] + (q31_t)pSrcB[i];
        pDst[i] = (q15_t)__SSAT(sum, 16);
    }
}

/**
 * @brief Subtract two Q15 vectors
 * @param[in]  pSrcA      points to first input vector
 * @param[in]  pSrcB      points to second input vector
 * @param[out] pDst       points to output vector
 * @param[in]  blockSize  number of samples to process
 */
static inline void arm_sub_q15(
    const q15_t* pSrcA,
    const q15_t* pSrcB,
    q15_t* pDst,
    uint32_t blockSize)
{
    for (uint32_t i = 0; i < blockSize; i++) {
        q31_t diff = (q31_t)pSrcA[i] - (q31_t)pSrcB[i];
        pDst[i] = (q15_t)__SSAT(diff, 16);
    }
}

/**
 * @brief Scale a Q15 vector by a scalar
 * @param[in]  pSrc       points to input vector
 * @param[in]  scaleFract fractional portion of the scale factor
 * @param[in]  shift      number of bits to shift the result
 * @param[out] pDst       points to output vector
 * @param[in]  blockSize  number of samples to process
 */
static inline void arm_scale_q15(
    const q15_t* pSrc,
    q15_t scaleFract,
    int8_t shift,
    q15_t* pDst,
    uint32_t blockSize)
{
    for (uint32_t i = 0; i < blockSize; i++) {
        q31_t product = ((q31_t)pSrc[i] * scaleFract) >> 15;
        if (shift > 0) {
            product <<= shift;
        } else {
            product >>= (-shift);
        }
        pDst[i] = (q15_t)__SSAT(product, 16);
    }
}

/**
 * @brief Negate a Q15 vector
 * @param[in]  pSrc       points to input vector
 * @param[out] pDst       points to output vector
 * @param[in]  blockSize  number of samples to process
 */
static inline void arm_negate_q15(
    const q15_t* pSrc,
    q15_t* pDst,
    uint32_t blockSize)
{
    for (uint32_t i = 0; i < blockSize; i++) {
        pDst[i] = (pSrc[i] == INT16_MIN) ? INT16_MAX : -pSrc[i];
    }
}

/**
 * @brief Copy Q15 vector
 * @param[in]  pSrc       points to input vector
 * @param[out] pDst       points to output vector
 * @param[in]  blockSize  number of samples to process
 */
static inline void arm_copy_q15(
    const q15_t* pSrc,
    q15_t* pDst,
    uint32_t blockSize)
{
    memcpy(pDst, pSrc, blockSize * sizeof(q15_t));
}

/**
 * @brief Fill Q15 vector with a constant
 * @param[in]  value      constant to fill
 * @param[out] pDst       points to output vector
 * @param[in]  blockSize  number of samples to process
 */
static inline void arm_fill_q15(
    q15_t value,
    q15_t* pDst,
    uint32_t blockSize)
{
    for (uint32_t i = 0; i < blockSize; i++) {
        pDst[i] = value;
    }
}

/**
 * @brief Initialize FIR Q15 filter
 */
static inline void arm_fir_init_q15(
    arm_fir_instance_q15* S,
    uint16_t numTaps,
    q15_t* pCoeffs,
    q15_t* pState,
    uint32_t blockSize)
{
    (void)blockSize;
    S->numTaps = numTaps;
    S->pCoeffs = pCoeffs;
    S->pState = pState;
    memset(pState, 0, (numTaps + blockSize - 1) * sizeof(q15_t));
}

/**
 * @brief Initialize FIR interpolate Q15 filter
 */
static inline void arm_fir_interpolate_init_q15(
    arm_fir_interpolate_instance_q15* S,
    uint8_t L,
    uint16_t numTaps,
    q15_t* pCoeffs,
    q15_t* pState,
    uint32_t blockSize)
{
    (void)blockSize;
    S->L = L;
    S->phaseLength = numTaps / L;
    S->pCoeffs = pCoeffs;
    S->pState = pState;
    memset(pState, 0, (S->phaseLength + blockSize - 1) * sizeof(q15_t));
}

/**
 * @brief Q15 FIR interpolation filter
 * @param[in]  S          points to an instance of the Q15 FIR interpolator structure
 * @param[in]  pSrc       points to the block of input data
 * @param[out] pDst       points to the block of output data
 * @param[in]  blockSize  number of input samples to process
 */
static inline void arm_fir_interpolate_q15(
    const arm_fir_interpolate_instance_q15* S,
    const q15_t* pSrc,
    q15_t* pDst,
    uint32_t blockSize)
{
    q15_t* pState = S->pState;
    const q15_t* pCoeffs = S->pCoeffs;
    uint8_t L = S->L;
    uint16_t phaseLen = S->phaseLength;

    for (uint32_t i = 0; i < blockSize; i++) {
        // Shift state and add new input
        for (uint16_t j = 0; j < phaseLen - 1; j++) {
            pState[j] = pState[j + 1];
        }
        pState[phaseLen - 1] = pSrc[i];

        // Generate L output samples for each input
        for (uint8_t phase = 0; phase < L; phase++) {
            q31_t acc = 0;
            const q15_t* pC = pCoeffs + phase;

            // Apply polyphase filter
            for (uint16_t k = 0; k < phaseLen; k++) {
                acc += (q31_t)pState[phaseLen - 1 - k] * (q31_t)pC[k * L];
            }

            pDst[i * L + phase] = (q15_t)__SSAT(acc >> 15, 16);
        }
    }
}

/**
 * @brief Initialize FIR float32 filter
 */
static inline void arm_fir_init_f32(
    arm_fir_instance_f32* S,
    uint16_t numTaps,
    float32_t* pCoeffs,
    float32_t* pState,
    uint32_t blockSize)
{
    (void)blockSize;
    S->numTaps = numTaps;
    S->pCoeffs = pCoeffs;
    S->pState = pState;
    memset(pState, 0, (numTaps + blockSize - 1) * sizeof(float32_t));
}

/**
 * @brief Float32 FIR filter
 * @param[in]  S          points to an instance of the float32 FIR filter structure
 * @param[in]  pSrc       points to the block of input data
 * @param[out] pDst       points to the block of output data
 * @param[in]  blockSize  number of samples to process
 */
static inline void arm_fir_f32(
    const arm_fir_instance_f32* S,
    const float32_t* pSrc,
    float32_t* pDst,
    uint32_t blockSize)
{
    float32_t* pState = S->pState;
    const float32_t* pCoeffs = S->pCoeffs;
    uint16_t numTaps = S->numTaps;

    for (uint32_t sample = 0; sample < blockSize; sample++) {
        // Copy new input into state buffer
        pState[numTaps - 1] = pSrc[sample];

        // Apply FIR filter
        float32_t acc = 0.0f;
        for (uint16_t i = 0; i < numTaps; i++) {
            acc += pState[numTaps - 1 - i] * pCoeffs[i];
        }
        pDst[sample] = acc;

        // Shift state buffer
        for (uint16_t i = 0; i < numTaps - 1; i++) {
            pState[i] = pState[i + 1];
        }
    }
}

/**
 * @brief Initialize Biquad cascade Q31 filter
 */
static inline void arm_biquad_cascade_df1_init_q31(
    arm_biquad_casd_df1_inst_q31* S,
    uint8_t numStages,
    q31_t* pCoeffs,
    q31_t* pState,
    int8_t postShift)
{
    S->numStages = numStages;
    S->pCoeffs = pCoeffs;
    S->pState = pState;
    S->postShift = postShift;
    memset(pState, 0, 4 * numStages * sizeof(q31_t));
}

/**
 * @brief Q31 sine function
 * @param[in]  x  Scaled input value in radians
 * @return sin(x) in Q31 format
 *
 * Input is in Q31 format where full scale represents the range -pi to +pi
 * This means 0x7FFFFFFF = pi and 0x80000000 = -pi
 */
static inline q31_t arm_sin_q31(q31_t x)
{
    // Convert Q31 to radians: Q31 full scale is +/- pi
    // So x / 2^31 * pi gives radians
    double radians = ((double)x / 2147483648.0) * M_PI;
    double result = sin(radians);
    // Convert back to Q31 (result is -1 to +1, scale to Q31)
    return (q31_t)(result * 2147483647.0);
}

/**
 * @brief Q31 cosine function
 * @param[in]  x  Scaled input value in radians
 * @return cos(x) in Q31 format
 */
static inline q31_t arm_cos_q31(q31_t x)
{
    double radians = ((double)x / 2147483648.0) * M_PI;
    double result = cos(radians);
    return (q31_t)(result * 2147483647.0);
}

/**
 * @brief Q15 sine function
 * @param[in]  x  Scaled input value in radians
 * @return sin(x) in Q15 format
 */
static inline q15_t arm_sin_q15(q15_t x)
{
    double radians = ((double)x / 32768.0) * M_PI;
    double result = sin(radians);
    return (q15_t)(result * 32767.0);
}

/**
 * @brief Q15 cosine function
 * @param[in]  x  Scaled input value in radians
 * @return cos(x) in Q15 format
 */
static inline q15_t arm_cos_q15(q15_t x)
{
    double radians = ((double)x / 32768.0) * M_PI;
    double result = cos(radians);
    return (q15_t)(result * 32767.0);
}

#endif // _ARM_MATH_ESP32_H
