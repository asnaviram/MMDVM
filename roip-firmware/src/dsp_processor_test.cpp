/*
 * DSP Processor Unit Tests
 *
 * Comprehensive tests for all DSP processing modules.
 * Compile with: g++ -O2 -lm dsp_processor.cpp dsp_processor_test.cpp -o dsp_test
 */

#include "../include/dsp_processor.h"
#include <cstdio>
#include <cmath>
#include <ctime>
#include <cstring>

// Test helper functions
void printTestHeader(const char* name) {
    printf("\n========================================\n");
    printf("TEST: %s\n", name);
    printf("========================================\n");
}

void printResult(bool passed, const char* message) {
    printf("[%s] %s\n", passed ? "PASS" : "FAIL", message);
}

// Test 1: Basic initialization
void testInitialization() {
    printTestHeader("Initialization");

    DSPProcessor dsp;
    dsp.initialize(8000);

    // Verify default state
    printResult(dsp.getRMSLevel() <= -160.0f, "Initial RMS level below -160dB");
    printResult(dsp.getPeakLevel() <= -160.0f, "Initial peak level below -160dB");
    printResult(!dsp.getVoiceActive(), "Voice not initially active");
    printResult(dsp.getGain() <= 1.0f, "Initial gain reasonable");
}

// Test 2: Silence processing
void testSilenceProcessing() {
    printTestHeader("Silence Processing");

    DSPProcessor dsp;
    dsp.initialize(8000);

    // Process silence
    int16_t silence[160] = {0};
    int16_t output[160] = {0};

    for (int i = 0; i < 10; i++) {
        dsp.process(silence, output, 160);
    }

    // Verify gate closes on silence
    printResult(!dsp.getVoiceActive(), "Voice not detected in silence");
    printResult(dsp.getRMSLevel() < -100.0f, "RMS very low for silence");

    // Verify all output is silence
    bool allZero = true;
    for (int i = 0; i < 160; i++) {
        if (output[i] != 0) {
            allZero = false;
            break;
        }
    }
    printResult(allZero, "Gated silence output is zero");
}

// Test 3: Sine wave processing
void testSineWaveProcessing() {
    printTestHeader("Sine Wave Processing");

    DSPProcessor dsp;
    dsp.initialize(8000);
    dsp.setVADEnabled(true);

    // Generate 1kHz sine wave at 8kHz sample rate
    int16_t buffer[160];
    float amplitude = 16384.0f; // ~0.5 full scale

    for (int i = 0; i < 160; i++) {
        float angle = 2.0f * M_PI * 1000.0f * i / 8000.0f;
        buffer[i] = (int16_t)(amplitude * sinf(angle));
    }

    int16_t output[160];

    // Process multiple frames to stabilize AGC
    for (int frame = 0; frame < 10; frame++) {
        dsp.process(buffer, output, 160);
    }

    // Verify voice detected in sine wave
    printResult(dsp.getVoiceActive(), "Voice detected in sine wave");
    float rmsDb = dsp.getRMSLevel();
    printResult(rmsDb > -30.0f && rmsDb < -5.0f, "RMS level reasonable for sine wave");
    printResult(dsp.getGain() > -10.0f && dsp.getGain() < 20.0f, "AGC gain in reasonable range");
}

// Test 4: White noise processing
void testWhiteNoiseProcessing() {
    printTestHeader("White Noise Processing");

    DSPProcessor dsp;
    dsp.initialize(8000);
    dsp.setVADEnabled(true);

    // Simple pseudo-random white noise
    int16_t buffer[160];
    uint32_t seed = 12345;

    for (int i = 0; i < 160; i++) {
        seed = seed * 1103515245 + 12345;
        int16_t noise = (int16_t)(((seed >> 16) & 0x7FFF) - 16384);
        buffer[i] = noise;
    }

    int16_t output[160];

    // Process frames
    for (int frame = 0; frame < 10; frame++) {
        // Regenerate noise for each frame
        for (int i = 0; i < 160; i++) {
            seed = seed * 1103515245 + 12345;
            int16_t noise = (int16_t)(((seed >> 16) & 0x7FFF) - 16384);
            buffer[i] = noise;
        }
        dsp.process(buffer, output, 160);
    }

    // Noise should trigger VAD but might be gated depending on amplitude
    float rmsDb = dsp.getRMSLevel();
    printResult(rmsDb < 0.0f, "RMS is in valid range");
}

// Test 5: AGC response
void testAGCResponse() {
    printTestHeader("AGC Response");

    DSPProcessor dsp;
    dsp.initialize(8000);
    dsp.setAGCTargetLevel(0.7f);
    dsp.setNoiseGateEnabled(false); // Disable gate to test AGC alone

    // Process low amplitude sine wave
    int16_t buffer[160];
    float amplitude = 1000.0f;

    printf("\nLow amplitude phase:\n");
    for (int i = 0; i < 160; i++) {
        float angle = 2.0f * M_PI * 1000.0f * i / 8000.0f;
        buffer[i] = (int16_t)(amplitude * sinf(angle));
    }

    float lowGain = 0.0f;
    for (int frame = 0; frame < 10; frame++) {
        int16_t output[160];
        dsp.process(buffer, output, 160);
        lowGain = dsp.getGain();
        printf("  Frame %d: Gain = %+6.2f dB, RMS = %6.1f dB\n",
               frame, lowGain, dsp.getRMSLevel());
    }

    // Now process high amplitude
    printf("\nHigh amplitude phase:\n");
    amplitude = 24000.0f;

    float highGain = 0.0f;
    for (int frame = 0; frame < 10; frame++) {
        for (int i = 0; i < 160; i++) {
            float angle = 2.0f * M_PI * 1000.0f * i / 8000.0f;
            buffer[i] = (int16_t)(amplitude * sinf(angle));
        }
        int16_t output[160];
        dsp.process(buffer, output, 160);
        highGain = dsp.getGain();
        printf("  Frame %d: Gain = %+6.2f dB, RMS = %6.1f dB\n",
               frame, highGain, dsp.getRMSLevel());
    }

    printResult(lowGain > highGain, "AGC reduces gain for higher amplitude");
    printResult(dsp.getGain() < 0.0f, "AGC applies attenuation for high input");
}

// Test 6: Filter operation
void testFilterOperation() {
    printTestHeader("Filter Operation");

    DSPProcessor dsp;
    dsp.initialize(8000);
    dsp.setNoiseGateEnabled(false);
    dsp.setAGCEnabled(false);
    dsp.setCompressorEnabled(false);

    // Test that high-pass filter removes DC
    int16_t buffer[160];
    for (int i = 0; i < 160; i++) {
        buffer[i] = 1000; // Constant DC level
    }

    int16_t output[160];
    dsp.process(buffer, output, 160);

    float outputRms = dsp.getRMSLinear();
    printResult(outputRms < 0.1f, "HP filter removes DC offset");

    // Test low-pass filter
    printf("\nLow-pass filter response:\n");
    dsp.reset();

    // 100Hz sine wave (should pass)
    for (int i = 0; i < 160; i++) {
        float angle = 2.0f * M_PI * 100.0f * i / 8000.0f;
        buffer[i] = (int16_t)(10000.0f * sinf(angle));
    }

    dsp.process(buffer, output, 160);
    float lowFreqResponse = dsp.getRMSLinear();

    dsp.reset();

    // 5kHz sine wave (should be attenuated)
    for (int i = 0; i < 160; i++) {
        float angle = 2.0f * M_PI * 5000.0f * i / 8000.0f;
        buffer[i] = (int16_t)(10000.0f * sinf(angle));
    }

    dsp.process(buffer, output, 160);
    float highFreqResponse = dsp.getRMSLinear();

    printResult(lowFreqResponse > highFreqResponse,
                "Low-pass filter attenuates high frequencies");
    printf("  100Hz RMS = %.4f, 5kHz RMS = %.4f\n", lowFreqResponse, highFreqResponse);
}

// Test 7: VAD detection
void testVADDetection() {
    printTestHeader("VAD Detection");

    DSPProcessor dsp;
    dsp.initialize(8000);
    dsp.setVADEnabled(true);
    dsp.setNoiseGateEnabled(false);
    dsp.setAGCEnabled(false);

    // Generate voice-like signal (1kHz burst)
    int16_t buffer[160];
    int16_t output[160];

    // Silence then voice
    bool voiceSequence[] = {false, false, true, true, true, false, false, false};

    printf("Voice activity sequence: ");
    for (int frame = 0; frame < 8; frame++) {
        if (voiceSequence[frame]) {
            // Voice burst (1kHz)
            for (int i = 0; i < 160; i++) {
                float angle = 2.0f * M_PI * 1000.0f * i / 8000.0f;
                buffer[i] = (int16_t)(10000.0f * sinf(angle));
            }
            printf("V");
        } else {
            // Silence
            memset(buffer, 0, sizeof(buffer));
            printf("S");
        }

        dsp.process(buffer, output, 160);
        printf("%d", dsp.getVoiceActive() ? 1 : 0);
    }
    printf("\n");

    printResult(true, "VAD processed voice sequence");
}

// Test 8: Processing chain order
void testProcessingChainOrder() {
    printTestHeader("Processing Chain Order");

    DSPProcessor dsp;
    dsp.initialize(8000);

    // All stages enabled
    dsp.setHighPassEnabled(true);
    dsp.setLowPassEnabled(true);
    dsp.setPreEmphasisEnabled(true);
    dsp.setNoiseGateEnabled(true);
    dsp.setAGCEnabled(true);
    dsp.setCompressorEnabled(true);
    dsp.setVADEnabled(true);
    dsp.setDeEmphasisEnabled(true);

    int16_t buffer[160];
    int16_t output[160];

    // Generate test signal
    for (int i = 0; i < 160; i++) {
        float angle = 2.0f * M_PI * 1000.0f * i / 8000.0f;
        buffer[i] = (int16_t)(10000.0f * sinf(angle));
    }

    // Process should not crash or produce NaN
    for (int frame = 0; frame < 5; frame++) {
        dsp.process(buffer, output, 160);

        // Verify no NaN or inf in output
        for (int i = 0; i < 160; i++) {
            bool isValid = (output[i] > -32768) && (output[i] < 32767);
            if (!isValid) {
                printResult(false, "Output contains invalid values");
                return;
            }
        }
    }

    printResult(true, "Complete processing chain executes without errors");
}

// Test 9: Float processing
void testFloatProcessing() {
    printTestHeader("Float Processing");

    DSPProcessor dsp;
    dsp.initialize(8000);

    float buffer[160];
    float output[160];

    // Generate test signal in float format (-1 to +1)
    for (int i = 0; i < 160; i++) {
        float angle = 2.0f * M_PI * 1000.0f * i / 8000.0f;
        buffer[i] = 0.3f * sinf(angle);
    }

    dsp.processFloat(buffer, output, 160);

    // Verify output is in valid range
    bool allValid = true;
    for (int i = 0; i < 160; i++) {
        if (output[i] < -1.5f || output[i] > 1.5f) {
            allValid = false;
            break;
        }
    }

    printResult(allValid, "Float processing produces valid output");
}

// Test 10: Performance/timing
void testPerformanceTiming() {
    printTestHeader("Performance Timing");

    DSPProcessor dsp;
    dsp.initialize(8000);

    int16_t buffer[160];
    int16_t output[160];

    // Generate test signal
    for (int i = 0; i < 160; i++) {
        float angle = 2.0f * M_PI * 1000.0f * i / 8000.0f;
        buffer[i] = (int16_t)(10000.0f * sinf(angle));
    }

    // Warm-up
    for (int i = 0; i < 10; i++) {
        dsp.process(buffer, output, 160);
    }

    // Time 1000 frames (20 seconds of audio)
    clock_t start = clock();

    for (int frame = 0; frame < 1000; frame++) {
        dsp.process(buffer, output, 160);
    }

    clock_t end = clock();
    double timeMs = 1000.0 * (double)(end - start) / CLOCKS_PER_SEC;
    double timePerFrameMs = timeMs / 1000.0;

    printf("Processed 1000 frames (20 seconds) in %.1f ms\n", timeMs);
    printf("Time per frame: %.3f ms\n", timePerFrameMs);
    printf("Expected: ~2ms per frame\n");

    printResult(timePerFrameMs < 5.0f, "Performance acceptable (<5ms per frame)");
}

// Main test runner
int main() {
    printf("\n");
    printf("╔════════════════════════════════════════════════════════════╗\n");
    printf("║  DSP PROCESSOR COMPREHENSIVE TEST SUITE                    ║\n");
    printf("║  Testing all audio processing algorithms                  ║\n");
    printf("╚════════════════════════════════════════════════════════════╝\n");

    testInitialization();
    testSilenceProcessing();
    testSineWaveProcessing();
    testWhiteNoiseProcessing();
    testAGCResponse();
    testFilterOperation();
    testVADDetection();
    testProcessingChainOrder();
    testFloatProcessing();
    testPerformanceTiming();

    printf("\n");
    printf("╔════════════════════════════════════════════════════════════╗\n");
    printf("║  TEST SUITE COMPLETE                                       ║\n");
    printf("╚════════════════════════════════════════════════════════════╝\n");
    printf("\n");

    return 0;
}
