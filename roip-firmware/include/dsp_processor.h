#ifndef DSP_PROCESSOR_H
#define DSP_PROCESSOR_H

#include <cstdint>
#include <cstring>
#include <cmath>
#include <algorithm>

#ifndef M_PI
#define M_PI 3.14159265358979323846f
#endif

// Audio processing configuration
#define DSP_SAMPLE_RATE 8000      // 8kHz audio (common for VoIP)
#define DSP_FRAME_SIZE 160        // 20ms frames at 8kHz
#define DSP_BUFFER_SIZE 512       // Ring buffer size

// Filter cutoff frequencies (Hz)
#define DSP_HP_CUTOFF 300         // High-pass cutoff (DC removal)
#define DSP_LP_CUTOFF 3000        // Low-pass cutoff (anti-aliasing)
#define DSP_EMPHASIS_CUTOFF 800   // Pre/de-emphasis cutoff

// AGC parameters
#define DSP_AGC_TARGET_LEVEL 0.7f // Target output level
#define DSP_AGC_MAX_GAIN 40.0f    // Max gain in dB
#define DSP_AGC_MIN_GAIN -20.0f   // Min gain in dB
#define DSP_AGC_ATTACK_TIME 5.0f  // Attack time in ms
#define DSP_AGC_RELEASE_TIME 50.0f // Release time in ms

// Compressor parameters
#define DSP_COMP_THRESHOLD -20.0f // Threshold in dB
#define DSP_COMP_RATIO 4.0f       // Compression ratio
#define DSP_COMP_ATTACK_TIME 10.0f // Attack time in ms
#define DSP_COMP_RELEASE_TIME 100.0f // Release time in ms

// VAD parameters
#define DSP_VAD_SILENCE_THRESHOLD -40.0f // dB
#define DSP_VAD_ENERGY_THRESHOLD 0.001f
#define DSP_VAD_FRAME_BUFFER 3    // Frames to buffer for VAD

// Gate/Squelch parameters
#define DSP_GATE_THRESHOLD -50.0f // Gate threshold in dB
#define DSP_GATE_HOLD_TIME 100.0f // Hold time in ms

// Structure for biquad filter coefficients
typedef struct {
    float b0, b1, b2;            // Numerator coefficients
    float a1, a2;                // Denominator coefficients (normalized by a0)
    float z1, z2;                // State variables
} BiquadFilter;

// Structure for AGC state machine
typedef struct {
    float gain;                  // Current gain (linear)
    float gainDb;                // Current gain in dB
    float targetLevel;           // Target RMS level
    float attackCoeff;           // Attack coefficient
    float releaseCoeff;          // Release coefficient
    float peakHold;              // Peak hold value
    uint32_t peakHoldTime;       // Peak hold timer
    bool isActive;               // AGC active flag
} AGCState;

// Structure for compressor
typedef struct {
    float threshold;             // Threshold in dB
    float ratio;                 // Compression ratio
    float kneeWidth;             // Soft knee width in dB
    float attackCoeff;           // Attack coefficient
    float releaseCoeff;          // Release coefficient
    float makeup;                // Makeup gain in dB
    float gain;                  // Current gain (linear)
    bool isActive;               // Compressor active flag
} CompressorState;

// Structure for VAD (Voice Activity Detection)
typedef struct {
    float threshold;             // Energy threshold
    uint32_t hangoverFrames;     // Frames to keep active after voice detected
    uint32_t hangoverCounter;    // Hangover counter
    bool voiceDetected;          // Current voice detection state
    float smoothedEnergy;        // Smoothed energy estimate
} VADState;

// Structure for gate/squelch
typedef struct {
    float threshold;             // Gate threshold in dB
    float holdTime;              // Hold time in ms
    uint32_t holdCounter;        // Hold counter in samples
    bool gateOpen;               // Current gate state
    float alpha;                 // Smoothing coefficient
    float smoothedLevel;         // Smoothed level
} GateState;

// Structure for audio level metering
typedef struct {
    float rmsLevel;              // RMS level (linear)
    float rmsDb;                 // RMS level in dB
    float peakLevel;             // Peak level (linear)
    float peakDb;                // Peak level in dB
    float average;               // Average level meter
    float decayCoeff;            // Decay coefficient
} MeterState;

// Main DSP processor structure
class DSPProcessor {
public:
    DSPProcessor();
    ~DSPProcessor();

    // Initialization
    void initialize(uint32_t sampleRate = DSP_SAMPLE_RATE);
    void reset();

    // Main processing chain
    void process(int16_t* input, int16_t* output, uint32_t samples);
    void processFloat(float* input, float* output, uint32_t samples);

    // Individual processing stages (called by process())
    void applyHighPassFilter(float* samples, uint32_t len);
    void applyLowPassFilter(float* samples, uint32_t len);
    void applyPreEmphasis(float* samples, uint32_t len);
    void applyDeEmphasis(float* samples, uint32_t len);
    void applyNoiseGate(float* samples, uint32_t len);
    void applyAGC(float* samples, uint32_t len);
    void applyCompressor(float* samples, uint32_t len);
    void applyParametricEQ(float* samples, uint32_t len);

    // VAD processing
    bool detectVoiceActivity(const float* samples, uint32_t len);

    // Level metering
    void updateMeters(const float* samples, uint32_t len);

    // Configuration setters
    void setAGCEnabled(bool enabled) { m_agcEnabled = enabled; }
    void setCompressorEnabled(bool enabled) { m_compressorEnabled = enabled; }
    void setNoiseGateEnabled(bool enabled) { m_gateEnabled = enabled; }
    void setHighPassEnabled(bool enabled) { m_hpEnabled = enabled; }
    void setLowPassEnabled(bool enabled) { m_lpEnabled = enabled; }
    void setVADEnabled(bool enabled) { m_vadEnabled = enabled; }
    void setPreEmphasisEnabled(bool enabled) { m_preEmphasisEnabled = enabled; }
    void setDeEmphasisEnabled(bool enabled) { m_deEmphasisEnabled = enabled; }
    void setEQEnabled(bool enabled) { m_eqEnabled = enabled; }

    // Parameter setters
    void setAGCTargetLevel(float level);
    void setCompressorThreshold(float threshold);
    void setCompressorRatio(float ratio);
    void setGateThreshold(float threshold);
    void setVADThreshold(float threshold);

    // Meter getters
    float getRMSLevel() const { return m_meter.rmsDb; }
    float getPeakLevel() const { return m_meter.peakDb; }
    float getRMSLinear() const { return m_meter.rmsLevel; }
    float getPeakLinear() const { return m_meter.peakLevel; }
    bool getVoiceActive() const { return m_vad.voiceDetected; }
    float getGain() const { return m_agc.gainDb; }

private:
    // Filter helper functions
    void updateBiquadCoefficients(BiquadFilter* filter,
                                   float b0, float b1, float b2,
                                   float a1, float a2);
    void initializeHighPassFilter();
    void initializeLowPassFilter();
    void initializePreEmphasisFilter();
    void initializeDeEmphasisFilter();
    void initializeParametricEQFilters();

    // Filter application
    float applyBiquadFilter(BiquadFilter* filter, float sample);

    // Utility functions
    float linearToDb(float linear);
    float dbToLinear(float db);
    float calculateRMS(const float* samples, uint32_t len);
    float calculatePeak(const float* samples, uint32_t len);

    // AGC helper functions
    void updateAGC(float inputRms);
    void resetAGC();

    // Compressor helper functions
    void updateCompressor(float inputDb);
    void resetCompressor();

    // Squelch/Gate helper
    void updateGate(float levelDb);

    // Configuration flags
    bool m_agcEnabled;
    bool m_compressorEnabled;
    bool m_gateEnabled;
    bool m_hpEnabled;
    bool m_lpEnabled;
    bool m_vadEnabled;
    bool m_preEmphasisEnabled;
    bool m_deEmphasisEnabled;
    bool m_eqEnabled;

    // Sample rate and timing
    uint32_t m_sampleRate;
    float m_samplePeriod;

    // Filter instances (biquad IIR filters)
    BiquadFilter m_hpFilter;      // High-pass (300Hz)
    BiquadFilter m_lpFilter;      // Low-pass (3kHz)
    BiquadFilter m_preEmphasis;   // Pre-emphasis filter
    BiquadFilter m_deEmphasis;    // De-emphasis filter

    // Parametric EQ filters (3-band)
    BiquadFilter m_eqLow;         // Low-shelf (100Hz)
    BiquadFilter m_eqMid;         // Peaking (1kHz)
    BiquadFilter m_eqHigh;        // High-shelf (8kHz)

    // Processing state
    AGCState m_agc;
    CompressorState m_compressor;
    GateState m_gate;
    VADState m_vad;
    MeterState m_meter;

    // Working buffer for processing
    float m_processingBuffer[DSP_FRAME_SIZE];
};

#endif // DSP_PROCESSOR_H
