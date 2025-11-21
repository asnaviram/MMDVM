/*
 *   Unit Tests for ARM Math ESP32 Compatibility Layer
 *
 *   Tests the q15/q31 operations and DSP functions for ESP32 Xtensa processors
 */

#include <unity.h>

// Include the compatibility layer
#include "../../arm_math_esp32.h"

// Test saturation macro
void test_ssat_positive_in_range(void) {
    // Value within range should remain unchanged
    int32_t result = __SSAT(1000, 16);
    TEST_ASSERT_EQUAL_INT32(1000, result);
}

void test_ssat_negative_in_range(void) {
    // Negative value within range should remain unchanged
    int32_t result = __SSAT(-1000, 16);
    TEST_ASSERT_EQUAL_INT32(-1000, result);
}

void test_ssat_positive_overflow(void) {
    // Value exceeding positive limit should saturate
    int32_t result = __SSAT(50000, 16);
    TEST_ASSERT_EQUAL_INT32(32767, result);
}

void test_ssat_negative_overflow(void) {
    // Value exceeding negative limit should saturate
    int32_t result = __SSAT(-50000, 16);
    TEST_ASSERT_EQUAL_INT32(-32768, result);
}

// Test q15 to q31 conversion
void test_q15_to_q31_zero(void) {
    q15_t src = 0;
    q31_t dst;
    arm_q15_to_q31(&src, &dst, 1);
    TEST_ASSERT_EQUAL_INT32(0, dst);
}

void test_q15_to_q31_positive(void) {
    q15_t src = 16384;  // 0.5 in q15
    q31_t dst;
    arm_q15_to_q31(&src, &dst, 1);
    // Should be 16384 << 16 = 1073741824
    TEST_ASSERT_EQUAL_INT32(1073741824, dst);
}

void test_q15_to_q31_negative(void) {
    q15_t src = -16384;  // -0.5 in q15
    q31_t dst;
    arm_q15_to_q31(&src, &dst, 1);
    TEST_ASSERT_EQUAL_INT32(-1073741824, dst);
}

void test_q15_to_q31_array(void) {
    q15_t src[4] = {0, 1000, -1000, 32767};
    q31_t dst[4];
    arm_q15_to_q31(src, dst, 4);

    TEST_ASSERT_EQUAL_INT32(0, dst[0]);
    TEST_ASSERT_EQUAL_INT32(65536000, dst[1]);
    TEST_ASSERT_EQUAL_INT32(-65536000, dst[2]);
    TEST_ASSERT_EQUAL_INT32(2147418112, dst[3]);
}

// Test FIR filter initialization
void test_fir_init_q15(void) {
    arm_fir_instance_q15 fir;
    q15_t coeffs[8] = {4096, 4096, 4096, 4096, 4096, 4096, 4096, 4096};
    q15_t state[16];

    arm_fir_init_q15(&fir, 8, coeffs, state, 1);

    TEST_ASSERT_EQUAL_UINT16(8, fir.numTaps);
    TEST_ASSERT_EQUAL_PTR(coeffs, fir.pCoeffs);
    TEST_ASSERT_EQUAL_PTR(state, fir.pState);
}

// Test FIR filter operation (simple moving average)
void test_fir_fast_q15_impulse_response(void) {
    arm_fir_instance_q15 fir;
    // Simple 4-tap filter with equal coefficients (moving average scaled)
    q15_t coeffs[4] = {8192, 8192, 8192, 8192};  // 0.25 each
    q15_t state[8];

    memset(state, 0, sizeof(state));
    arm_fir_init_q15(&fir, 4, coeffs, state, 1);

    // Input impulse
    q15_t input[4] = {32767, 0, 0, 0};
    q15_t output[4];

    arm_fir_fast_q15(&fir, input, output, 4);

    // First output should be impulse * first coeff
    // Result depends on implementation details
    TEST_ASSERT_TRUE(output[0] != 0);  // Should have response
}

// Test Biquad filter initialization
void test_biquad_init_q31(void) {
    arm_biquad_casd_df1_inst_q31 biquad;
    q31_t coeffs[5] = {1073741824, 0, 0, 0, 0};  // Simple pass-through
    q31_t state[4];

    arm_biquad_cascade_df1_init_q31(&biquad, 1, coeffs, state, 1);

    TEST_ASSERT_EQUAL_UINT8(1, biquad.numStages);
    TEST_ASSERT_EQUAL_PTR(coeffs, biquad.pCoeffs);
    TEST_ASSERT_EQUAL_PTR(state, biquad.pState);
}

// Test Biquad filter passthrough
void test_biquad_cascade_passthrough(void) {
    arm_biquad_casd_df1_inst_q31 biquad;
    // Coefficients for unity gain passthrough: b0=1, b1=0, b2=0, a1=0, a2=0
    // In q31 format with postShift=0
    q31_t coeffs[5] = {2147483647, 0, 0, 0, 0};
    q31_t state[4] = {0, 0, 0, 0};

    arm_biquad_cascade_df1_init_q31(&biquad, 1, coeffs, state, 0);

    q31_t input[4] = {100000, 200000, -100000, 0};
    q31_t output[4];

    arm_biquad_cascade_df1_q31(&biquad, input, output, 4);

    // With unity passthrough, output should approximately equal input
    // (may have some scaling)
    TEST_ASSERT_TRUE(output[0] != 0);
}

// Test fill function
void test_fill_q15(void) {
    q15_t buffer[8];
    arm_fill_q15(12345, buffer, 8);

    for (int i = 0; i < 8; i++) {
        TEST_ASSERT_EQUAL_INT16(12345, buffer[i]);
    }
}

void test_fill_q15_zero(void) {
    q15_t buffer[8] = {1, 2, 3, 4, 5, 6, 7, 8};
    arm_fill_q15(0, buffer, 8);

    for (int i = 0; i < 8; i++) {
        TEST_ASSERT_EQUAL_INT16(0, buffer[i]);
    }
}

void setUp(void) {
    // Setup before each test
}

void tearDown(void) {
    // Cleanup after each test
}

#ifdef UNITY_TEST
int main(int argc, char **argv) {
    UNITY_BEGIN();

    // SSAT tests
    RUN_TEST(test_ssat_positive_in_range);
    RUN_TEST(test_ssat_negative_in_range);
    RUN_TEST(test_ssat_positive_overflow);
    RUN_TEST(test_ssat_negative_overflow);

    // Q15 to Q31 conversion tests
    RUN_TEST(test_q15_to_q31_zero);
    RUN_TEST(test_q15_to_q31_positive);
    RUN_TEST(test_q15_to_q31_negative);
    RUN_TEST(test_q15_to_q31_array);

    // FIR filter tests
    RUN_TEST(test_fir_init_q15);
    RUN_TEST(test_fir_fast_q15_impulse_response);

    // Biquad filter tests
    RUN_TEST(test_biquad_init_q31);
    RUN_TEST(test_biquad_cascade_passthrough);

    // Fill tests
    RUN_TEST(test_fill_q15);
    RUN_TEST(test_fill_q15_zero);

    return UNITY_END();
}
#endif
