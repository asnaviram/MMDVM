/*
 * Minimal Unity Test Framework Implementation
 * Provides basic unit testing functionality
 */

#ifndef UNITY_H
#define UNITY_H

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>

// Test counter structures
typedef struct {
    unsigned int tests_run;
    unsigned int tests_passed;
    unsigned int tests_failed;
} UnityType;

// Global test state
extern UnityType Unity;

// Test result tracking
#define UNITY_BEGIN() \
    do { \
        Unity.tests_run = 0; \
        Unity.tests_passed = 0; \
        Unity.tests_failed = 0; \
        printf("\n========================================\n"); \
        printf("UNITY TEST FRAMEWORK v1.0\n"); \
        printf("========================================\n\n"); \
    } while(0)

#define UNITY_END() \
    do { \
        printf("\n========================================\n"); \
        printf("Test Results:\n"); \
        printf("  Tests run:    %u\n", Unity.tests_run); \
        printf("  Tests passed: %u\n", Unity.tests_passed); \
        printf("  Tests failed: %u\n", Unity.tests_failed); \
        printf("========================================\n\n"); \
        if (Unity.tests_failed == 0) { \
            printf("All tests PASSED!\n\n"); \
            return 0; \
        } else { \
            printf("Some tests FAILED!\n\n"); \
            return 1; \
        } \
    } while(0)

#define RUN_TEST(test_func) \
    do { \
        Unity.tests_run++; \
        printf("Running test %u: %s ... ", Unity.tests_run, #test_func); \
        fflush(stdout); \
        setUp(); \
        __try_test_##test_func(); \
        tearDown(); \
    } while(0)

// Test assertion macros
#define TEST_ASSERT(condition) \
    do { \
        if (condition) { \
            Unity.tests_passed++; \
            printf("PASS\n"); \
        } else { \
            Unity.tests_failed++; \
            printf("FAIL\n"); \
            printf("  at %s:%d\n", __FILE__, __LINE__); \
            printf("  condition: %s\n", #condition); \
        } \
    } while(0)

#define TEST_ASSERT_TRUE(condition) TEST_ASSERT(condition)
#define TEST_ASSERT_FALSE(condition) TEST_ASSERT(!(condition))
#define TEST_ASSERT_NULL(ptr) TEST_ASSERT((ptr) == NULL)
#define TEST_ASSERT_NOT_NULL(ptr) TEST_ASSERT((ptr) != NULL)

#define TEST_ASSERT_EQUAL_INT(expected, actual) \
    do { \
        int exp = (expected); \
        int act = (actual); \
        if (exp == act) { \
            Unity.tests_passed++; \
            printf("PASS\n"); \
        } else { \
            Unity.tests_failed++; \
            printf("FAIL\n"); \
            printf("  at %s:%d\n", __FILE__, __LINE__); \
            printf("  expected: %d, actual: %d\n", exp, act); \
        } \
    } while(0)

#define TEST_ASSERT_EQUAL_INT32(expected, actual) \
    do { \
        int32_t exp = (expected); \
        int32_t act = (actual); \
        if (exp == act) { \
            Unity.tests_passed++; \
            printf("PASS\n"); \
        } else { \
            Unity.tests_failed++; \
            printf("FAIL\n"); \
            printf("  at %s:%d\n", __FILE__, __LINE__); \
            printf("  expected: %ld, actual: %ld\n", (long)exp, (long)act); \
        } \
    } while(0)

#define TEST_ASSERT_EQUAL_UINT8(expected, actual) \
    do { \
        uint8_t exp = (expected); \
        uint8_t act = (actual); \
        if (exp == act) { \
            Unity.tests_passed++; \
            printf("PASS\n"); \
        } else { \
            Unity.tests_failed++; \
            printf("FAIL\n"); \
            printf("  at %s:%d\n", __FILE__, __LINE__); \
            printf("  expected: %u, actual: %u\n", (unsigned)exp, (unsigned)act); \
        } \
    } while(0)

#define TEST_ASSERT_EQUAL_UINT16(expected, actual) \
    do { \
        uint16_t exp = (expected); \
        uint16_t act = (actual); \
        if (exp == act) { \
            Unity.tests_passed++; \
            printf("PASS\n"); \
        } else { \
            Unity.tests_failed++; \
            printf("FAIL\n"); \
            printf("  at %s:%d\n", __FILE__, __LINE__); \
            printf("  expected: %u, actual: %u\n", (unsigned)exp, (unsigned)act); \
        } \
    } while(0)

#define TEST_ASSERT_EQUAL_UINT32(expected, actual) \
    do { \
        uint32_t exp = (expected); \
        uint32_t act = (actual); \
        if (exp == act) { \
            Unity.tests_passed++; \
            printf("PASS\n"); \
        } else { \
            Unity.tests_failed++; \
            printf("FAIL\n"); \
            printf("  at %s:%d\n", __FILE__, __LINE__); \
            printf("  expected: %lu, actual: %lu\n", (unsigned long)exp, (unsigned long)act); \
        } \
    } while(0)

#define TEST_ASSERT_EQUAL_FLOAT(expected, actual, tolerance) \
    do { \
        float exp = (expected); \
        float act = (actual); \
        float diff = (exp > act) ? (exp - act) : (act - exp); \
        if (diff <= tolerance) { \
            Unity.tests_passed++; \
            printf("PASS\n"); \
        } else { \
            Unity.tests_failed++; \
            printf("FAIL\n"); \
            printf("  at %s:%d\n", __FILE__, __LINE__); \
            printf("  expected: %f, actual: %f, tolerance: %f\n", exp, act, tolerance); \
        } \
    } while(0)

#define TEST_ASSERT_EQUAL_PTR(expected, actual) TEST_ASSERT((expected) == (actual))

#define TEST_ASSERT_GREATER_THAN(threshold, actual) \
    do { \
        if ((actual) > (threshold)) { \
            Unity.tests_passed++; \
            printf("PASS\n"); \
        } else { \
            Unity.tests_failed++; \
            printf("FAIL\n"); \
            printf("  at %s:%d\n", __FILE__, __LINE__); \
            printf("  expected > %ld, actual: %ld\n", (long)(threshold), (long)(actual)); \
        } \
    } while(0)

#define TEST_ASSERT_GREATER_OR_EQUAL(threshold, actual) \
    do { \
        if ((actual) >= (threshold)) { \
            Unity.tests_passed++; \
            printf("PASS\n"); \
        } else { \
            Unity.tests_failed++; \
            printf("FAIL\n"); \
            printf("  at %s:%d\n", __FILE__, __LINE__); \
            printf("  expected >= %ld, actual: %ld\n", (long)(threshold), (long)(actual)); \
        } \
    } while(0)

#define TEST_ASSERT_LESS_THAN(threshold, actual) \
    do { \
        if ((actual) < (threshold)) { \
            Unity.tests_passed++; \
            printf("PASS\n"); \
        } else { \
            Unity.tests_failed++; \
            printf("FAIL\n"); \
            printf("  at %s:%d\n", __FILE__, __LINE__); \
            printf("  expected < %ld, actual: %ld\n", (long)(threshold), (long)(actual)); \
        } \
    } while(0)

#define TEST_ASSERT_NOT_EQUAL(expected, actual) \
    do { \
        if ((expected) != (actual)) { \
            Unity.tests_passed++; \
            printf("PASS\n"); \
        } else { \
            Unity.tests_failed++; \
            printf("FAIL\n"); \
            printf("  at %s:%d\n", __FILE__, __LINE__); \
            printf("  values should not be equal: %ld\n", (long)(actual)); \
        } \
    } while(0)

// Helper macro to wrap test functions
#define __try_test(name) \
    static void __try_test_##name(); \
    static void __try_test_##name()

#endif // UNITY_H
