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

// ARM CMSIS-DSP compatible types
typedef int16_t q15_t;
typedef int32_t q31_t;
typedef int64_t q63_t;

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

#endif // _ARM_MATH_ESP32_H
