/*
 * DSP Processor Example Usage
 *
 * This file demonstrates how to integrate the DSPProcessor class
 * into your RoIP audio processing pipeline.
 */

#ifndef DSP_PROCESSOR_EXAMPLE_H
#define DSP_PROCESSOR_EXAMPLE_H

#include "dsp_processor.h"

// Example 1: Basic audio processing chain
class AudioProcessor {
public:
    AudioProcessor() {
        dsp.initialize(8000); // 8kHz sample rate
    }

    void processAudio(int16_t* inputAudio, int16_t* outputAudio, uint32_t numSamples) {
        // Process through the complete DSP chain
        dsp.process(inputAudio, outputAudio, numSamples);

        // Check if voice is active
        if (dsp.getVoiceActive()) {
            // Voice detected - safe to transmit
            logMetrics();
        }
    }

    void logMetrics() {
        float rmsDb = dsp.getRMSLevel();
        float peakDb = dsp.getPeakLevel();
        float gainDb = dsp.getGain();

        // Log metrics for debugging/monitoring
        // printf("RMS: %.1f dB, Peak: %.1f dB, Gain: %.1f dB\n",
        //        rmsDb, peakDb, gainDb);
    }

private:
    DSPProcessor dsp;
};

// Example 2: Custom DSP configuration
class CustomAudioProcessor {
public:
    CustomAudioProcessor() {
        dsp.initialize(8000);

        // Disable de-emphasis if using only transmission
        dsp.setDeEmphasisEnabled(false);

        // Enable optional parametric EQ for tone shaping
        dsp.setEQEnabled(false); // Set to true for 3-band EQ

        // Configure AGC parameters
        dsp.setAGCTargetLevel(0.75f); // Target -2.5dB

        // Configure compressor
        dsp.setCompressorThreshold(-20.0f);
        dsp.setCompressorRatio(4.0f);

        // Configure noise gate
        dsp.setGateThreshold(-45.0f);
    }

    void process(int16_t* input, int16_t* output, uint32_t samples) {
        dsp.processFloat(reinterpret_cast<float*>(input),
                        reinterpret_cast<float*>(output),
                        samples);
    }

private:
    DSPProcessor dsp;
};

// Example 3: VAD-based transmission control
class VADController {
public:
    VADController() : vadTimeout(0), isTransmitting(false) {
        dsp.initialize(8000);
        dsp.setVADThreshold(-35.0f); // Adjust sensitivity
    }

    bool shouldTransmit(int16_t* audio, uint32_t samples) {
        // Process audio through DSP chain
        int16_t temp[512];
        dsp.process(audio, temp, samples);

        // Check VAD state
        if (dsp.getVoiceActive()) {
            vadTimeout = 50; // 50-frame hangover
            isTransmitting = true;
        } else if (vadTimeout > 0) {
            vadTimeout--;
            // Still transmitting due to hangover
        } else {
            isTransmitting = false;
        }

        return isTransmitting;
    }

    bool getVoiceActivity() const { return dsp.getVoiceActive(); }

private:
    DSPProcessor dsp;
    uint32_t vadTimeout;
    bool isTransmitting;
};

// Example 4: Receiving audio with de-emphasis
class ReceiveAudioProcessor {
public:
    ReceiveAudioProcessor() {
        dsp.initialize(8000);

        // For receiving, disable pre-emphasis but keep de-emphasis
        dsp.setPreEmphasisEnabled(false);
        dsp.setDeEmphasisEnabled(true);

        // Disable transmission-specific processing
        dsp.setCompressorEnabled(false);
    }

    void processReceivedAudio(int16_t* input, int16_t* output, uint32_t samples) {
        dsp.process(input, output, samples);
    }

private:
    DSPProcessor dsp;
};

// Example 5: Audio diagnostics and monitoring
class AudioDiagnostics {
public:
    AudioDiagnostics() {
        dsp.initialize(8000);
        frameCount = 0;
    }

    void analyzeFrame(int16_t* audio, uint32_t samples) {
        int16_t temp[512];
        dsp.process(audio, temp, samples);

        frameCount++;

        // Print metrics every 50 frames (1 second @ 8kHz)
        if (frameCount % 50 == 0) {
            printDiagnostics();
        }
    }

    void printDiagnostics() {
        // printf("\n--- Audio Diagnostics ---\n");
        // printf("RMS Level:  %.1f dB\n", dsp.getRMSLevel());
        // printf("Peak Level: %.1f dB\n", dsp.getPeakLevel());
        // printf("AGC Gain:   %.1f dB\n", dsp.getGain());
        // printf("Voice:      %s\n", dsp.getVoiceActive() ? "YES" : "NO");
        // printf("\n");
    }

private:
    DSPProcessor dsp;
    uint32_t frameCount;
};

#endif // DSP_PROCESSOR_EXAMPLE_H

/*
 * INTEGRATION GUIDE
 *
 * 1. AUDIO CAPTURE CHAIN
 *    ADC/I2S -> DSPProcessor -> Network Buffer -> Transmission
 *
 * 2. PROCESS FLOW
 *    Input (16-bit signed)
 *        |
 *        v
 *    [High-Pass Filter]     - Remove DC and sub-300Hz noise
 *        |
 *        v
 *    [Low-Pass Filter]      - Anti-aliasing at 3kHz
 *        |
 *        v
 *    [Pre-Emphasis]         - Boost speech clarity
 *        |
 *        v
 *    [Noise Gate]           - Mute noise below threshold
 *        |
 *        v
 *    [AGC]                  - Normalize audio level
 *        |
 *        v
 *    [Compressor]           - Reduce dynamic range
 *        |
 *        v
 *    [Parametric EQ]        - Optional tone shaping
 *        |
 *        v
 *    [VAD]                  - Detect voice activity
 *        |
 *        v
 *    [De-Emphasis]          - Compensate pre-emphasis
 *        |
 *        v
 *    [Level Metering]       - Measure RMS/Peak
 *        |
 *        v
 *    Output (16-bit signed)
 *
 * 3. PERFORMANCE METRICS (ESP32 at 240MHz)
 *    - Per-frame processing: ~1-2ms for 20ms frame (160 samples)
 *    - Memory footprint: ~1KB state + buffers
 *    - DSP operations: ~100K MACs per frame
 *
 * 4. TUNING RECOMMENDATIONS
 *
 *    For TX (Transmission):
 *    - AGC target: 0.7 (-2.5dB)
 *    - Compressor threshold: -20dB, ratio: 4:1
 *    - Gate threshold: -50dB
 *    - Pre-emphasis: Enabled
 *    - De-emphasis: Disabled (or very subtle)
 *
 *    For RX (Reception):
 *    - AGC target: 0.8
 *    - Compressor: Disabled (network already normalized)
 *    - Gate threshold: -60dB
 *    - Pre-emphasis: Disabled
 *    - De-emphasis: Enabled
 *
 *    For Network Optimization:
 *    - Use VAD to avoid transmitting silence
 *    - Gate threshold: -40dB to -50dB
 *    - Hangover: 50-100ms for comfort
 *
 * 5. RECOMMENDED INIT CODE
 *
 *    DSPProcessor dsp;
 *    dsp.initialize(8000); // 8kHz sample rate
 *
 *    // Enable all processing by default
 *    dsp.setAGCEnabled(true);
 *    dsp.setCompressorEnabled(true);
 *    dsp.setNoiseGateEnabled(true);
 *    dsp.setHighPassEnabled(true);
 *    dsp.setLowPassEnabled(true);
 *    dsp.setVADEnabled(true);
 *    dsp.setPreEmphasisEnabled(true);
 *    dsp.setDeEmphasisEnabled(true);
 *
 *    // In audio loop:
 *    int16_t inputBuffer[160];
 *    int16_t outputBuffer[160];
 *    dsp.process(inputBuffer, outputBuffer, 160);
 */
