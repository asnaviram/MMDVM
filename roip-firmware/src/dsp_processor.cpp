#include "../include/dsp_processor.h"

// Constructor
DSPProcessor::DSPProcessor()
    : m_agcEnabled(true),
      m_compressorEnabled(true),
      m_gateEnabled(true),
      m_hpEnabled(true),
      m_lpEnabled(true),
      m_vadEnabled(true),
      m_preEmphasisEnabled(true),
      m_deEmphasisEnabled(true),
      m_eqEnabled(false),
      m_sampleRate(DSP_SAMPLE_RATE),
      m_samplePeriod(1.0f / DSP_SAMPLE_RATE)
{
    // Initialize all structures to zero
    memset(&m_hpFilter, 0, sizeof(BiquadFilter));
    memset(&m_lpFilter, 0, sizeof(BiquadFilter));
    memset(&m_preEmphasis, 0, sizeof(BiquadFilter));
    memset(&m_deEmphasis, 0, sizeof(BiquadFilter));
    memset(&m_eqLow, 0, sizeof(BiquadFilter));
    memset(&m_eqMid, 0, sizeof(BiquadFilter));
    memset(&m_eqHigh, 0, sizeof(BiquadFilter));
    memset(&m_agc, 0, sizeof(AGCState));
    memset(&m_compressor, 0, sizeof(CompressorState));
    memset(&m_gate, 0, sizeof(GateState));
    memset(&m_vad, 0, sizeof(VADState));
    memset(&m_meter, 0, sizeof(MeterState));
    memset(m_processingBuffer, 0, sizeof(m_processingBuffer));

    // Initialize defaults
    initialize();
}

// Destructor
DSPProcessor::~DSPProcessor()
{
    // Nothing to clean up currently
}

// Initialize DSP processor
void DSPProcessor::initialize(uint32_t sampleRate)
{
    m_sampleRate = sampleRate;
    m_samplePeriod = 1.0f / (float)sampleRate;

    // Initialize all filters
    initializeHighPassFilter();
    initializeLowPassFilter();
    initializePreEmphasisFilter();
    initializeDeEmphasisFilter();
    initializeParametricEQFilters();

    // Initialize AGC
    resetAGC();
    m_agc.targetLevel = DSP_AGC_TARGET_LEVEL;
    m_agc.gainDb = 0.0f;
    m_agc.isActive = true;

    // Calculate time constants
    float attackSamples = (DSP_AGC_ATTACK_TIME / 1000.0f) * m_sampleRate;
    float releaseSamples = (DSP_AGC_RELEASE_TIME / 1000.0f) * m_sampleRate;
    m_agc.attackCoeff = 2.0f / (attackSamples + 1.0f);
    m_agc.releaseCoeff = 2.0f / (releaseSamples + 1.0f);

    // Initialize Compressor
    resetCompressor();
    m_compressor.threshold = DSP_COMP_THRESHOLD;
    m_compressor.ratio = DSP_COMP_RATIO;
    m_compressor.kneeWidth = 6.0f; // 6dB soft knee

    // Calculate compressor time constants
    float compAttackSamples = (DSP_COMP_ATTACK_TIME / 1000.0f) * m_sampleRate;
    float compReleaseSamples = (DSP_COMP_RELEASE_TIME / 1000.0f) * m_sampleRate;
    m_compressor.attackCoeff = 2.0f / (compAttackSamples + 1.0f);
    m_compressor.releaseCoeff = 2.0f / (compReleaseSamples + 1.0f);
    m_compressor.makeup = 0.0f; // Will be calculated automatically
    m_compressor.isActive = true;

    // Initialize Gate/Squelch
    m_gate.threshold = DSP_GATE_THRESHOLD;
    m_gate.holdTime = DSP_GATE_HOLD_TIME;
    m_gate.holdCounter = 0;
    m_gate.gateOpen = false;
    m_gate.alpha = 0.1f; // Smoothing coefficient
    m_gate.smoothedLevel = -80.0f; // Start low

    // Initialize VAD
    m_vad.threshold = DSP_VAD_SILENCE_THRESHOLD;
    m_vad.hangoverFrames = DSP_VAD_FRAME_BUFFER;
    m_vad.hangoverCounter = 0;
    m_vad.voiceDetected = false;
    m_vad.smoothedEnergy = 0.0f;

    // Initialize Meter
    m_meter.rmsLevel = 0.0f;
    m_meter.rmsDb = -80.0f;
    m_meter.peakLevel = 0.0f;
    m_meter.peakDb = -80.0f;
    m_meter.decayCoeff = 0.05f; // Slow decay for peak hold
}

// Reset DSP processor
void DSPProcessor::reset()
{
    // Reset filter states
    m_hpFilter.z1 = m_hpFilter.z2 = 0.0f;
    m_lpFilter.z1 = m_lpFilter.z2 = 0.0f;
    m_preEmphasis.z1 = m_preEmphasis.z2 = 0.0f;
    m_deEmphasis.z1 = m_deEmphasis.z2 = 0.0f;
    m_eqLow.z1 = m_eqLow.z2 = 0.0f;
    m_eqMid.z1 = m_eqMid.z2 = 0.0f;
    m_eqHigh.z1 = m_eqHigh.z2 = 0.0f;

    // Reset state machines
    resetAGC();
    resetCompressor();

    m_gate.holdCounter = 0;
    m_gate.gateOpen = false;
    m_gate.smoothedLevel = -80.0f;

    m_vad.hangoverCounter = 0;
    m_vad.voiceDetected = false;
    m_vad.smoothedEnergy = 0.0f;

    m_meter.rmsLevel = 0.0f;
    m_meter.peakLevel = 0.0f;
}

// Main processing chain - handles int16_t input/output
void DSPProcessor::process(int16_t* input, int16_t* output, uint32_t samples)
{
    // Ensure we don't process more than our buffer
    uint32_t processSize = (samples > DSP_FRAME_SIZE) ? DSP_FRAME_SIZE : samples;

    // Convert int16_t to float with normalization (range -1 to +1)
    float tempBuffer[DSP_FRAME_SIZE];
    for (uint32_t i = 0; i < processSize; i++) {
        tempBuffer[i] = (float)input[i] / 32768.0f;
    }

    // Process through DSP chain
    processFloat(tempBuffer, tempBuffer, processSize);

    // Convert float back to int16_t with clipping
    for (uint32_t i = 0; i < processSize; i++) {
        float sample = tempBuffer[i] * 32768.0f;
        // Clip to prevent overflow
        if (sample > 32767.0f) sample = 32767.0f;
        if (sample < -32768.0f) sample = -32768.0f;
        output[i] = (int16_t)sample;
    }
}

// Main processing chain - handles float input/output
void DSPProcessor::processFloat(float* input, float* output, uint32_t samples)
{
    // Ensure we don't process more than our buffer
    uint32_t processSize = (samples > DSP_FRAME_SIZE) ? DSP_FRAME_SIZE : samples;

    // Copy input to working buffer
    memcpy(m_processingBuffer, input, processSize * sizeof(float));

    // Apply processing chain in order:
    // 1. High-pass filter (removes DC and very low frequencies)
    if (m_hpEnabled) {
        applyHighPassFilter(m_processingBuffer, processSize);
    }

    // 2. Low-pass filter (anti-aliasing)
    if (m_lpEnabled) {
        applyLowPassFilter(m_processingBuffer, processSize);
    }

    // 3. Pre-emphasis (boost high frequencies for transmission clarity)
    if (m_preEmphasisEnabled) {
        applyPreEmphasis(m_processingBuffer, processSize);
    }

    // 4. Noise gate/squelch (mute signal below threshold)
    if (m_gateEnabled) {
        applyNoiseGate(m_processingBuffer, processSize);
    }

    // 5. AGC (automatic gain control - normalize level)
    if (m_agcEnabled) {
        applyAGC(m_processingBuffer, processSize);
    }

    // 6. Dynamic range compressor (reduce dynamic range)
    if (m_compressorEnabled) {
        applyCompressor(m_processingBuffer, processSize);
    }

    // 7. Parametric EQ (optional tone shaping)
    if (m_eqEnabled) {
        applyParametricEQ(m_processingBuffer, processSize);
    }

    // 8. Voice Activity Detection (speech detection)
    if (m_vadEnabled) {
        detectVoiceActivity(m_processingBuffer, processSize);
    }

    // 9. De-emphasis (complement to pre-emphasis)
    if (m_deEmphasisEnabled) {
        applyDeEmphasis(m_processingBuffer, processSize);
    }

    // 10. Update audio meters (peak and RMS measurement)
    updateMeters(m_processingBuffer, processSize);

    // Copy output
    memcpy(output, m_processingBuffer, processSize * sizeof(float));
}

// High-pass filter (300Hz cutoff)
void DSPProcessor::applyHighPassFilter(float* samples, uint32_t len)
{
    for (uint32_t i = 0; i < len; i++) {
        samples[i] = applyBiquadFilter(&m_hpFilter, samples[i]);
    }
}

// Low-pass filter (3kHz cutoff)
void DSPProcessor::applyLowPassFilter(float* samples, uint32_t len)
{
    for (uint32_t i = 0; i < len; i++) {
        samples[i] = applyBiquadFilter(&m_lpFilter, samples[i]);
    }
}

// Pre-emphasis filter (boost high frequencies)
void DSPProcessor::applyPreEmphasis(float* samples, uint32_t len)
{
    for (uint32_t i = 0; i < len; i++) {
        samples[i] = applyBiquadFilter(&m_preEmphasis, samples[i]);
    }
}

// De-emphasis filter (reduce high frequencies)
void DSPProcessor::applyDeEmphasis(float* samples, uint32_t len)
{
    for (uint32_t i = 0; i < len; i++) {
        samples[i] = applyBiquadFilter(&m_deEmphasis, samples[i]);
    }
}

// Noise gate / Squelch
void DSPProcessor::applyNoiseGate(float* samples, uint32_t len)
{
    for (uint32_t i = 0; i < len; i++) {
        float levelDb = linearToDb(fabsf(samples[i]));
        updateGate(levelDb);

        if (!m_gate.gateOpen) {
            samples[i] = 0.0f; // Mute when gate closed
        }
    }
}

// Automatic Gain Control
void DSPProcessor::applyAGC(float* samples, uint32_t len)
{
    // Calculate RMS of input
    float rms = calculateRMS(samples, len);

    if (rms < 1e-6f) {
        rms = 1e-6f; // Prevent division by zero
    }

    // Update AGC gain
    updateAGC(rms);

    // Apply gain to all samples
    float gainLinear = dbToLinear(m_agc.gainDb);
    for (uint32_t i = 0; i < len; i++) {
        samples[i] *= gainLinear;
    }
}

// Dynamic Range Compressor
void DSPProcessor::applyCompressor(float* samples, uint32_t len)
{
    for (uint32_t i = 0; i < len; i++) {
        float sampleDb = linearToDb(fabsf(samples[i]));
        updateCompressor(sampleDb);

        float gainLinear = dbToLinear(m_compressor.gain);
        samples[i] *= gainLinear;
    }
}

// Parametric EQ (optional 3-band equalizer)
void DSPProcessor::applyParametricEQ(float* samples, uint32_t len)
{
    for (uint32_t i = 0; i < len; i++) {
        samples[i] = applyBiquadFilter(&m_eqLow, samples[i]);
        samples[i] = applyBiquadFilter(&m_eqMid, samples[i]);
        samples[i] = applyBiquadFilter(&m_eqHigh, samples[i]);
    }
}

// Voice Activity Detection
bool DSPProcessor::detectVoiceActivity(const float* samples, uint32_t len)
{
    // Calculate energy of signal
    float energy = 0.0f;
    for (uint32_t i = 0; i < len; i++) {
        energy += samples[i] * samples[i];
    }
    energy /= (float)len;

    // Smooth energy with exponential moving average
    m_vad.smoothedEnergy = 0.9f * m_vad.smoothedEnergy + 0.1f * energy;

    // Compare with threshold
    bool currentVoice = (m_vad.smoothedEnergy > DSP_VAD_ENERGY_THRESHOLD);

    if (currentVoice) {
        // Voice detected - keep hangover counter at max
        m_vad.hangoverCounter = m_vad.hangoverFrames;
        m_vad.voiceDetected = true;
    } else {
        // No voice - decrement hangover counter
        if (m_vad.hangoverCounter > 0) {
            m_vad.hangoverCounter--;
        } else {
            m_vad.voiceDetected = false;
        }
    }

    return m_vad.voiceDetected;
}

// Update audio meters
void DSPProcessor::updateMeters(const float* samples, uint32_t len)
{
    // Calculate RMS level
    float rmsLevel = calculateRMS(samples, len);
    m_meter.rmsLevel = rmsLevel;
    m_meter.rmsDb = linearToDb(rmsLevel);

    // Calculate peak level with decay
    float peakLevel = calculatePeak(samples, len);

    if (peakLevel > m_meter.peakLevel) {
        m_meter.peakLevel = peakLevel; // Instant attack
    } else {
        // Decay peak level
        m_meter.peakLevel = peakLevel + m_meter.decayCoeff * (m_meter.peakLevel - peakLevel);
    }

    m_meter.peakDb = linearToDb(m_meter.peakLevel);
}

// Set AGC target level
void DSPProcessor::setAGCTargetLevel(float level)
{
    // Clamp to reasonable range
    m_agc.targetLevel = std::max(0.1f, std::min(1.0f, level));
}

// Set compressor threshold
void DSPProcessor::setCompressorThreshold(float threshold)
{
    m_compressor.threshold = threshold;
}

// Set compressor ratio
void DSPProcessor::setCompressorRatio(float ratio)
{
    m_compressor.ratio = std::max(1.0f, ratio);
}

// Set gate threshold
void DSPProcessor::setGateThreshold(float threshold)
{
    m_gate.threshold = threshold;
}

// Set VAD threshold
void DSPProcessor::setVADThreshold(float threshold)
{
    m_vad.threshold = threshold;
}

// ============================================================================
// BIQUAD FILTER IMPLEMENTATION
// ============================================================================

// Apply biquad filter to a single sample
float DSPProcessor::applyBiquadFilter(BiquadFilter* filter, float sample)
{
    // Direct Form II implementation (efficient)
    float w = sample - filter->a1 * filter->z1 - filter->a2 * filter->z2;
    float output = filter->b0 * w + filter->b1 * filter->z1 + filter->b2 * filter->z2;

    // Update state variables
    filter->z2 = filter->z1;
    filter->z1 = w;

    return output;
}

// Update biquad coefficients
void DSPProcessor::updateBiquadCoefficients(BiquadFilter* filter,
                                             float b0, float b1, float b2,
                                             float a1, float a2)
{
    filter->b0 = b0;
    filter->b1 = b1;
    filter->b2 = b2;
    filter->a1 = a1;
    filter->a2 = a2;
}

// Initialize high-pass filter (300Hz, Butterworth, 2nd order)
void DSPProcessor::initializeHighPassFilter()
{
    // Butterworth high-pass filter @ 300Hz, Fs=8000Hz
    // Normalized frequency w = 2*pi*f/Fs = 2*pi*300/8000 = 0.2356
    float w = 2.0f * M_PI * 300.0f / (float)m_sampleRate;
    float c = cosf(w);
    float s = sinf(w);
    float alpha = s / (2.0f * 0.7071f); // Q = 1/sqrt(2) for Butterworth

    float a0 = 1.0f + alpha;
    float b0 = (1.0f + c) / 2.0f;
    float b1 = -(1.0f + c);
    float b2 = (1.0f + c) / 2.0f;
    float a1 = -2.0f * c / a0;
    float a2 = (1.0f - alpha) / a0;

    updateBiquadCoefficients(&m_hpFilter, b0/a0, b1/a0, b2/a0, a1, a2);
}

// Initialize low-pass filter (3kHz, Butterworth, 2nd order)
void DSPProcessor::initializeLowPassFilter()
{
    // Butterworth low-pass filter @ 3000Hz, Fs=8000Hz
    // Normalized frequency w = 2*pi*f/Fs = 2*pi*3000/8000 = 2.356
    float w = 2.0f * M_PI * 3000.0f / (float)m_sampleRate;
    float c = cosf(w);
    float s = sinf(w);
    float alpha = s / (2.0f * 0.7071f); // Q = 1/sqrt(2) for Butterworth

    float a0 = 1.0f + alpha;
    float b0 = (1.0f - c) / 2.0f;
    float b1 = 1.0f - c;
    float b2 = (1.0f - c) / 2.0f;
    float a1 = -2.0f * c / a0;
    float a2 = (1.0f - alpha) / a0;

    updateBiquadCoefficients(&m_lpFilter, b0/a0, b1/a0, b2/a0, a1, a2);
}

// Initialize pre-emphasis filter (high-shelf @ 800Hz)
void DSPProcessor::initializePreEmphasisFilter()
{
    // High-pass emphasis filter to boost speech clarity
    float freq = 800.0f;
    float gain = 6.0f; // 6dB boost
    float w = 2.0f * M_PI * freq / (float)m_sampleRate;
    float c = cosf(w);
    float s = sinf(w);
    float A = powf(10.0f, gain / 40.0f);
    float alpha = s / (2.0f * 0.7071f); // Q = 1/sqrt(2)

    float a0 = (A + 1.0f) + (A - 1.0f) * c + 2.0f * sqrtf(A) * alpha;
    float b0 = A * ((A + 1.0f) - (A - 1.0f) * c + 2.0f * sqrtf(A) * alpha);
    float b1 = 2.0f * A * ((A - 1.0f) - (A + 1.0f) * c);
    float b2 = A * ((A + 1.0f) - (A - 1.0f) * c - 2.0f * sqrtf(A) * alpha);
    float a1 = -2.0f * ((A - 1.0f) + (A + 1.0f) * c) / a0;
    float a2 = ((A + 1.0f) + (A - 1.0f) * c - 2.0f * sqrtf(A) * alpha) / a0;

    updateBiquadCoefficients(&m_preEmphasis, b0/a0, b1/a0, b2/a0, a1, a2);
}

// Initialize de-emphasis filter (complement to pre-emphasis)
void DSPProcessor::initializeDeEmphasisFilter()
{
    // Low-pass de-emphasis to complement pre-emphasis
    float freq = 800.0f;
    float gain = -6.0f; // -6dB reduction (inverse of pre-emphasis)
    float w = 2.0f * M_PI * freq / (float)m_sampleRate;
    float c = cosf(w);
    float s = sinf(w);
    float A = powf(10.0f, gain / 40.0f);
    float alpha = s / (2.0f * 0.7071f);

    float a0 = (A + 1.0f) + (A - 1.0f) * c + 2.0f * sqrtf(A) * alpha;
    float b0 = A * ((A + 1.0f) - (A - 1.0f) * c + 2.0f * sqrtf(A) * alpha);
    float b1 = 2.0f * A * ((A - 1.0f) - (A + 1.0f) * c);
    float b2 = A * ((A + 1.0f) - (A - 1.0f) * c - 2.0f * sqrtf(A) * alpha);
    float a1 = -2.0f * ((A - 1.0f) + (A + 1.0f) * c) / a0;
    float a2 = ((A + 1.0f) + (A - 1.0f) * c - 2.0f * sqrtf(A) * alpha) / a0;

    updateBiquadCoefficients(&m_deEmphasis, b0/a0, b1/a0, b2/a0, a1, a2);
}

// Initialize parametric EQ filters
void DSPProcessor::initializeParametricEQFilters()
{
    // Low shelf @ 100Hz with +6dB gain
    float freq = 100.0f;
    float gain = 6.0f;
    float w = 2.0f * M_PI * freq / (float)m_sampleRate;
    float c = cosf(w);
    float s = sinf(w);
    float A = powf(10.0f, gain / 40.0f);
    float alpha = s / (2.0f * 0.7071f);

    float a0 = (A + 1.0f) + (A - 1.0f) * c + 2.0f * sqrtf(A) * alpha;
    float b0 = A * ((A + 1.0f) - (A - 1.0f) * c + 2.0f * sqrtf(A) * alpha);
    float b1 = 2.0f * A * ((A - 1.0f) - (A + 1.0f) * c);
    float b2 = A * ((A + 1.0f) - (A - 1.0f) * c - 2.0f * sqrtf(A) * alpha);
    float a1 = -2.0f * ((A - 1.0f) + (A + 1.0f) * c) / a0;
    float a2 = ((A + 1.0f) + (A - 1.0f) * c - 2.0f * sqrtf(A) * alpha) / a0;

    updateBiquadCoefficients(&m_eqLow, b0/a0, b1/a0, b2/a0, a1, a2);

    // Peaking filter @ 1kHz with +3dB gain, Q=1
    freq = 1000.0f;
    gain = 3.0f;
    w = 2.0f * M_PI * freq / (float)m_sampleRate;
    c = cosf(w);
    s = sinf(w);
    A = powf(10.0f, gain / 40.0f);
    alpha = s / (2.0f * 1.0f); // Q = 1

    a0 = 1.0f + alpha / A;
    b0 = 1.0f + alpha * A;
    b1 = -2.0f * c;
    b2 = 1.0f - alpha * A;
    a1 = -2.0f * c / a0;
    a2 = (1.0f - alpha / A) / a0;

    updateBiquadCoefficients(&m_eqMid, b0/a0, b1/a0, b2/a0, a1, a2);

    // High shelf @ 8kHz with -3dB gain
    freq = 8000.0f;
    gain = -3.0f;
    w = 2.0f * M_PI * freq / (float)m_sampleRate;
    c = cosf(w);
    s = sinf(w);
    A = powf(10.0f, gain / 40.0f);
    alpha = s / (2.0f * 0.7071f);

    a0 = (A + 1.0f) + (A - 1.0f) * c + 2.0f * sqrtf(A) * alpha;
    b0 = A * ((A + 1.0f) - (A - 1.0f) * c + 2.0f * sqrtf(A) * alpha);
    b1 = 2.0f * A * ((A - 1.0f) - (A + 1.0f) * c);
    b2 = A * ((A + 1.0f) - (A - 1.0f) * c - 2.0f * sqrtf(A) * alpha);
    a1 = -2.0f * ((A - 1.0f) + (A + 1.0f) * c) / a0;
    a2 = ((A + 1.0f) + (A - 1.0f) * c - 2.0f * sqrtf(A) * alpha) / a0;

    updateBiquadCoefficients(&m_eqHigh, b0/a0, b1/a0, b2/a0, a1, a2);
}

// ============================================================================
// AGC (AUTOMATIC GAIN CONTROL) IMPLEMENTATION
// ============================================================================

void DSPProcessor::resetAGC()
{
    m_agc.gain = 1.0f;
    m_agc.gainDb = 0.0f;
    m_agc.peakHold = 0.0f;
    m_agc.peakHoldTime = 0;
}

void DSPProcessor::updateAGC(float inputRms)
{
    // Calculate desired gain in dB to reach target level
    float targetRms = m_agc.targetLevel;
    float desiredGainDb = linearToDb(targetRms / inputRms);

    // Clamp gain to limits
    desiredGainDb = std::max(DSP_AGC_MIN_GAIN, std::min(DSP_AGC_MAX_GAIN, desiredGainDb));

    // Apply attack/release smoothing
    if (desiredGainDb > m_agc.gainDb) {
        // Attack (gain increase)
        m_agc.gainDb = m_agc.gainDb + m_agc.attackCoeff * (desiredGainDb - m_agc.gainDb);
    } else {
        // Release (gain decrease)
        m_agc.gainDb = m_agc.gainDb + m_agc.releaseCoeff * (desiredGainDb - m_agc.gainDb);
    }

    // Convert to linear gain
    m_agc.gain = dbToLinear(m_agc.gainDb);
}

// ============================================================================
// COMPRESSOR IMPLEMENTATION
// ============================================================================

void DSPProcessor::resetCompressor()
{
    m_compressor.gain = 0.0f;
    m_compressor.makeup = 0.0f;
}

void DSPProcessor::updateCompressor(float inputDb)
{
    float gainDb = 0.0f;

    // Calculate gain reduction with soft knee
    if (inputDb > m_compressor.threshold) {
        // Above threshold - apply compression
        float kneeMin = m_compressor.threshold - m_compressor.kneeWidth / 2.0f;
        float kneeMax = m_compressor.threshold + m_compressor.kneeWidth / 2.0f;

        if (inputDb < kneeMin) {
            // Before soft knee - no compression
            gainDb = 0.0f;
        } else if (inputDb < kneeMax) {
            // In soft knee region - gradual compression
            float kneeDepth = (inputDb - kneeMin) / (kneeMax - kneeMin);
            float compressedDb = kneeMin + (kneeMax - kneeMin) / (2.0f * (m_compressor.ratio - 1.0f))
                                 * (kneeDepth * kneeDepth);
            gainDb = compressedDb - inputDb;
        } else {
            // Hard compression above knee
            gainDb = (m_compressor.threshold + (inputDb - m_compressor.threshold) / m_compressor.ratio) - inputDb;
        }
    }

    // Apply attack/release smoothing
    if (gainDb < m_compressor.gain) {
        // Attack (gain reduction increase)
        m_compressor.gain = m_compressor.gain + m_compressor.attackCoeff * (gainDb - m_compressor.gain);
    } else {
        // Release (gain reduction decrease)
        m_compressor.gain = m_compressor.gain + m_compressor.releaseCoeff * (gainDb - m_compressor.gain);
    }

    // Add makeup gain to compensate for compression
    m_compressor.makeup = -m_compressor.gain * 0.5f;
    m_compressor.gain += m_compressor.makeup;
}

// ============================================================================
// GATE/SQUELCH IMPLEMENTATION
// ============================================================================

void DSPProcessor::updateGate(float levelDb)
{
    // Smooth the level measurement
    m_gate.smoothedLevel = m_gate.alpha * levelDb + (1.0f - m_gate.alpha) * m_gate.smoothedLevel;

    if (m_gate.smoothedLevel > m_gate.threshold) {
        // Above threshold - open gate
        m_gate.gateOpen = true;
        m_gate.holdCounter = (uint32_t)((m_gate.holdTime / 1000.0f) * m_sampleRate);
    } else if (m_gate.gateOpen) {
        // Below threshold - start hold timer
        if (m_gate.holdCounter > 0) {
            m_gate.holdCounter--;
        } else {
            m_gate.gateOpen = false;
        }
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Convert linear amplitude to dB
float DSPProcessor::linearToDb(float linear)
{
    if (linear < 1e-8f) {
        return -160.0f; // Floor at -160dB
    }
    return 20.0f * log10f(linear);
}

// Convert dB to linear amplitude
float DSPProcessor::dbToLinear(float db)
{
    return powf(10.0f, db / 20.0f);
}

// Calculate RMS level of a buffer
float DSPProcessor::calculateRMS(const float* samples, uint32_t len)
{
    if (len == 0) return 0.0f;

    float sum = 0.0f;
    for (uint32_t i = 0; i < len; i++) {
        sum += samples[i] * samples[i];
    }
    return sqrtf(sum / (float)len);
}

// Calculate peak level of a buffer
float DSPProcessor::calculatePeak(const float* samples, uint32_t len)
{
    float peak = 0.0f;
    for (uint32_t i = 0; i < len; i++) {
        float absVal = fabsf(samples[i]);
        if (absVal > peak) {
            peak = absVal;
        }
    }
    return peak;
}
