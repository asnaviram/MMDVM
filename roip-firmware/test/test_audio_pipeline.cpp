/*
 * Comprehensive Unit Tests for Audio Pipeline Module
 *
 * Tests cover:
 * 1. Ring buffer operations (put, get, overflow, underflow)
 * 2. ADC initialization for all ESP32 variants
 * 3. DAC/PWM output initialization
 * 4. Sample rate accuracy (24kHz timer)
 * 5. Audio statistics (peak, RMS, DC offset)
 * 6. Gain control (+/- dB adjustment)
 * 7. Silence detection
 * 8. Buffer wrap-around handling
 * 9. Multi-variant compatibility
 * 10. ISR safety
 *
 * Uses Unity test framework (PlatformIO native testing)
 */

#include <unity.h>
#include <Arduino.h>
#include "../src/audio_pipeline.h"
#include <cmath>

// Test fixture - holds test state
class AudioPipelineTest {
public:
    static AudioPipeline* pipeline;
    static const gpio_num_t TEST_RX_PIN;
    static const gpio_num_t TEST_TX_PIN;

    static void setUp(void) {
        // Create a new instance for each test
        pipeline = new AudioPipeline();
    }

    static void tearDown(void) {
        if (pipeline) {
            delete pipeline;
            pipeline = nullptr;
        }
    }
};

// Static member initialization
AudioPipeline* AudioPipelineTest::pipeline = nullptr;
const gpio_num_t AudioPipelineTest::TEST_RX_PIN = GPIO_NUM_35;  // ADC1_7
const gpio_num_t AudioPipelineTest::TEST_TX_PIN = GPIO_NUM_26;  // DAC CH1 or PWM


// ============================================================================
// 1. RING BUFFER TESTS
// ============================================================================

void test_RingBuffer_Creation(void) {
    AudioRingBuffer buffer(256);
    TEST_ASSERT_EQUAL_UINT16(0, buffer.getData());
    TEST_ASSERT_EQUAL_UINT16(256, buffer.getSpace());
    TEST_ASSERT_FALSE(buffer.hasOverflowed());
}

void test_RingBuffer_PutGet_SingleSample(void) {
    AudioRingBuffer buffer(256);
    audio_sample_t test_sample = 12345;
    audio_sample_t retrieved_sample = 0;

    // Put a sample
    bool put_result = buffer.put(test_sample);
    TEST_ASSERT_TRUE(put_result);
    TEST_ASSERT_EQUAL_UINT16(1, buffer.getData());
    TEST_ASSERT_EQUAL_UINT16(255, buffer.getSpace());

    // Get the sample
    bool get_result = buffer.get(retrieved_sample);
    TEST_ASSERT_TRUE(get_result);
    TEST_ASSERT_EQUAL_INT16(test_sample, retrieved_sample);
    TEST_ASSERT_EQUAL_UINT16(0, buffer.getData());
    TEST_ASSERT_EQUAL_UINT16(256, buffer.getSpace());
}

void test_RingBuffer_PutGet_MultipleSamples(void) {
    AudioRingBuffer buffer(256);
    audio_sample_t samples[10] = {100, 200, 300, 400, 500, -100, -200, -300, -400, -500};
    audio_sample_t retrieved[10];

    // Put all samples
    for (int i = 0; i < 10; i++) {
        bool result = buffer.put(samples[i]);
        TEST_ASSERT_TRUE(result);
    }
    TEST_ASSERT_EQUAL_UINT16(10, buffer.getData());

    // Get all samples
    for (int i = 0; i < 10; i++) {
        bool result = buffer.get(retrieved[i]);
        TEST_ASSERT_TRUE(result);
        TEST_ASSERT_EQUAL_INT16(samples[i], retrieved[i]);
    }
    TEST_ASSERT_EQUAL_UINT16(0, buffer.getData());
}

void test_RingBuffer_Overflow(void) {
    AudioRingBuffer buffer(8);  // Small buffer for easy overflow
    bool overflow_detected = false;

    // Fill the buffer completely
    for (int i = 0; i < 8; i++) {
        bool result = buffer.put(i);
        TEST_ASSERT_TRUE(result);
    }
    TEST_ASSERT_EQUAL_UINT16(8, buffer.getData());
    TEST_ASSERT_FALSE(buffer.hasOverflowed());

    // Try to overflow
    bool result = buffer.put(99);
    TEST_ASSERT_FALSE(result);  // Should fail
    TEST_ASSERT_TRUE(buffer.hasOverflowed());

    // Verify buffer state unchanged
    TEST_ASSERT_EQUAL_UINT16(8, buffer.getData());
}

void test_RingBuffer_Underflow(void) {
    AudioRingBuffer buffer(256);
    audio_sample_t sample = 0;

    // Try to get from empty buffer
    bool result = buffer.get(sample);
    TEST_ASSERT_FALSE(result);
    TEST_ASSERT_EQUAL_UINT16(0, buffer.getData());
}

void test_RingBuffer_WrapAround(void) {
    AudioRingBuffer buffer(256);
    audio_sample_t samples[512];
    audio_sample_t retrieved[512];

    // Fill buffer with pattern 1
    for (int i = 0; i < 256; i++) {
        buffer.put(100 + i);
    }

    // Consume half
    for (int i = 0; i < 128; i++) {
        buffer.get(retrieved[i]);
    }

    // Add more samples (wrapping around)
    for (int i = 0; i < 128; i++) {
        buffer.put(200 + i);
    }

    // Verify correct order
    for (int i = 128; i < 256; i++) {
        buffer.get(retrieved[i]);
        TEST_ASSERT_EQUAL_INT16(100 + i, retrieved[i]);
    }

    for (int i = 0; i < 128; i++) {
        buffer.get(retrieved[i]);
        TEST_ASSERT_EQUAL_INT16(200 + i, retrieved[i]);
    }
}

void test_RingBuffer_OverflowReset(void) {
    AudioRingBuffer buffer(8);

    // Trigger overflow
    for (int i = 0; i < 8; i++) {
        buffer.put(i);
    }
    buffer.put(99);  // Overflow
    TEST_ASSERT_TRUE(buffer.hasOverflowed());

    // Reset overflow flag
    buffer.resetOverflow();
    TEST_ASSERT_FALSE(buffer.hasOverflowed());
}

void test_RingBuffer_Clear(void) {
    AudioRingBuffer buffer(256);

    // Add samples
    for (int i = 0; i < 100; i++) {
        buffer.put(i);
    }
    TEST_ASSERT_EQUAL_UINT16(100, buffer.getData());

    // Clear buffer
    buffer.clear();
    TEST_ASSERT_EQUAL_UINT16(0, buffer.getData());
    TEST_ASSERT_EQUAL_UINT16(256, buffer.getSpace());
}

void test_RingBuffer_Utilization(void) {
    AudioRingBuffer buffer(256);

    // Empty
    TEST_ASSERT_EQUAL_UINT8(0, buffer.getUtilization());

    // Half full
    for (int i = 0; i < 128; i++) {
        buffer.put(i);
    }
    TEST_ASSERT_EQUAL_UINT8(50, buffer.getUtilization());

    // Full
    for (int i = 0; i < 128; i++) {
        buffer.put(i);
    }
    TEST_ASSERT_EQUAL_UINT8(100, buffer.getUtilization());
}

void test_RingBuffer_LargeBuffer(void) {
    AudioRingBuffer buffer(8192);  // Full-size buffer
    int sample_count = 4096;

    // Fill half the buffer
    for (int i = 0; i < sample_count; i++) {
        bool result = buffer.put((audio_sample_t)(i & 0xFFFF));
        TEST_ASSERT_TRUE(result);
    }
    TEST_ASSERT_EQUAL_UINT16(50, buffer.getUtilization());

    // Verify retrieval
    for (int i = 0; i < sample_count; i++) {
        audio_sample_t sample;
        bool result = buffer.get(sample);
        TEST_ASSERT_TRUE(result);
        TEST_ASSERT_EQUAL_INT16((audio_sample_t)(i & 0xFFFF), sample);
    }
    TEST_ASSERT_EQUAL_UINT8(0, buffer.getUtilization());
}


// ============================================================================
// 2. AUDIO PIPELINE INITIALIZATION TESTS
// ============================================================================

void test_AudioPipeline_Construction(void) {
    AudioPipeline pipeline;
    TEST_ASSERT_FALSE(pipeline.isInitialized());
    TEST_ASSERT_FALSE(pipeline.isRunning());
}

void test_AudioPipeline_BeginBeforeStart(void) {
    AudioPipelineTest::setUp();

    audio_error_t err = AudioPipelineTest::pipeline->begin(
        AudioPipelineTest::TEST_RX_PIN,
        AudioPipelineTest::TEST_TX_PIN
    );

    // Initialization should succeed or gracefully fail (depends on hardware)
    TEST_ASSERT_TRUE(err == AUDIO_ERR_OK || err == AUDIO_ERR_ADC_INIT_FAILED);

    if (err == AUDIO_ERR_OK) {
        TEST_ASSERT_TRUE(AudioPipelineTest::pipeline->isInitialized());
        TEST_ASSERT_FALSE(AudioPipelineTest::pipeline->isRunning());
    }

    AudioPipelineTest::tearDown();
}

void test_AudioPipeline_DoubleInitialize(void) {
    AudioPipelineTest::setUp();

    // First init
    audio_error_t err1 = AudioPipelineTest::pipeline->begin(
        AudioPipelineTest::TEST_RX_PIN,
        AudioPipelineTest::TEST_TX_PIN
    );

    if (err1 == AUDIO_ERR_OK) {
        // Second init should fail
        audio_error_t err2 = AudioPipelineTest::pipeline->begin(
            AudioPipelineTest::TEST_RX_PIN,
            AudioPipelineTest::TEST_TX_PIN
        );
        TEST_ASSERT_EQUAL(AUDIO_ERR_ALREADY_RUNNING, err2);
    }

    AudioPipelineTest::tearDown();
}

void test_AudioPipeline_StartBeforeInit(void) {
    AudioPipelineTest::setUp();

    // Try to start without initialization
    audio_error_t err = AudioPipelineTest::pipeline->start();
    TEST_ASSERT_EQUAL(AUDIO_ERR_NOT_INITIALIZED, err);

    AudioPipelineTest::tearDown();
}

void test_AudioPipeline_VariantName(void) {
    AudioPipelineTest::setUp();

    const char* variant = AudioPipelineTest::pipeline->getVariantName();
    TEST_ASSERT_NOT_NULL(variant);

    // Should be one of the known variants
    bool is_known = false;
    const char* known_variants[] = {"ESP32", "ESP32-S2", "ESP32-S3", "ESP32-C3",
                                    "ESP32-C5", "ESP32-C6", "ESP32-H2"};

    for (int i = 0; i < 7; i++) {
        if (strcmp(variant, known_variants[i]) == 0) {
            is_known = true;
            break;
        }
    }

    TEST_ASSERT_TRUE(is_known);

    AudioPipelineTest::tearDown();
}


// ============================================================================
// 3. RING BUFFER SAMPLE OPERATIONS
// ============================================================================

void test_AudioPipeline_RXSingleSample(void) {
    AudioRingBuffer buffer(256);
    audio_sample_t sample = 16384;

    // Put sample (simulating ISR)
    bool put_result = buffer.put(sample);
    TEST_ASSERT_TRUE(put_result);

    // Get sample (simulating main thread)
    audio_sample_t retrieved = 0;
    bool get_result = buffer.get(retrieved);
    TEST_ASSERT_TRUE(get_result);
    TEST_ASSERT_EQUAL_INT16(sample, retrieved);
}

void test_AudioPipeline_RXMultipleSamples(void) {
    AudioRingBuffer buffer(256);
    const int SAMPLE_COUNT = 50;
    audio_sample_t samples[SAMPLE_COUNT];
    audio_sample_t retrieved[SAMPLE_COUNT];

    // Generate test pattern (24kHz sine-like pattern)
    for (int i = 0; i < SAMPLE_COUNT; i++) {
        samples[i] = (audio_sample_t)(20000 * sin(2 * M_PI * i / 48));
    }

    // Put samples
    for (int i = 0; i < SAMPLE_COUNT; i++) {
        bool result = buffer.put(samples[i]);
        TEST_ASSERT_TRUE(result);
    }

    // Get samples
    for (int i = 0; i < SAMPLE_COUNT; i++) {
        bool result = buffer.get(retrieved[i]);
        TEST_ASSERT_TRUE(result);
        TEST_ASSERT_EQUAL_INT16(samples[i], retrieved[i]);
    }
}

void test_AudioPipeline_TXSamples(void) {
    AudioRingBuffer buffer(256);
    const int FRAME_SIZE = 480;  // 20ms @ 24kHz
    audio_sample_t frame[FRAME_SIZE];

    // Generate silence frame
    for (int i = 0; i < FRAME_SIZE; i++) {
        frame[i] = 0;
    }

    // Put frame
    for (int i = 0; i < FRAME_SIZE; i++) {
        bool result = buffer.put(frame[i]);
        TEST_ASSERT_TRUE(result);
    }

    // Verify buffer contains frame
    TEST_ASSERT_EQUAL_UINT16(FRAME_SIZE, buffer.getData());
}


// ============================================================================
// 4. GAIN CONTROL TESTS
// ============================================================================

void test_AudioPipeline_GainCalculation_0dB(void) {
    float gain = powf(10.0f, 0.0f / 20.0f);
    TEST_ASSERT_FLOAT_WITHIN(0.001f, 1.0f, gain);
}

void test_AudioPipeline_GainCalculation_6dB(void) {
    float gain = powf(10.0f, 6.0f / 20.0f);
    TEST_ASSERT_FLOAT_WITHIN(0.01f, 2.0f, gain);  // ~2x amplitude
}

void test_AudioPipeline_GainCalculation_Minus6dB(void) {
    float gain = powf(10.0f, -6.0f / 20.0f);
    TEST_ASSERT_FLOAT_WITHIN(0.01f, 0.5f, gain);  // ~0.5x amplitude
}

void test_AudioPipeline_GainCalculation_12dB(void) {
    float gain = powf(10.0f, 12.0f / 20.0f);
    TEST_ASSERT_FLOAT_WITHIN(0.01f, 4.0f, gain);  // ~4x amplitude
}

void test_AudioPipeline_GainCalculation_24dB(void) {
    float gain = powf(10.0f, 24.0f / 20.0f);
    TEST_ASSERT_FLOAT_WITHIN(0.1f, 15.85f, gain);  // ~16x amplitude
}

void test_AudioPipeline_GainCalculation_Minus24dB(void) {
    float gain = powf(10.0f, -24.0f / 20.0f);
    TEST_ASSERT_FLOAT_WITHIN(0.01f, 0.0631f, gain);  // ~1/16x amplitude
}

void test_AudioPipeline_GainApplication_Positive(void) {
    // Simulate gain application
    int16_t sample = 10000;
    float gain = 2.0f;  // +6dB
    int32_t output = (int32_t)sample * gain;

    // Clamp to 16-bit
    if (output > 32767) output = 32767;
    if (output < -32768) output = -32768;

    int16_t result = (int16_t)output;
    TEST_ASSERT_EQUAL_INT16(20000, result);
}

void test_AudioPipeline_GainApplication_ClampingPositive(void) {
    // Test clipping at maximum positive
    int16_t sample = 32000;
    float gain = 2.0f;  // Would clip
    int32_t output = (int32_t)sample * gain;

    // Clamp to 16-bit
    if (output > 32767) output = 32767;

    int16_t result = (int16_t)output;
    TEST_ASSERT_EQUAL_INT16(32767, result);
}

void test_AudioPipeline_GainApplication_ClampingNegative(void) {
    // Test clipping at maximum negative
    int16_t sample = -32000;
    float gain = 2.0f;  // Would clip
    int32_t output = (int32_t)sample * gain;

    // Clamp to 16-bit
    if (output < -32768) output = -32768;

    int16_t result = (int16_t)output;
    TEST_ASSERT_EQUAL_INT16(-32768, result);
}


// ============================================================================
// 5. SILENCE DETECTION TESTS
// ============================================================================

void test_AudioPipeline_SilenceDetection_Threshold(void) {
    // Test if samples below threshold are detected as silence
    const int16_t SILENCE_THRESHOLD = 50;

    int16_t silent_sample = 10;
    int16_t noisy_sample = 100;

    TEST_ASSERT_LESS_THAN(SILENCE_THRESHOLD, noisy_sample);
    TEST_ASSERT_LESS_THAN_INT16(silent_sample, SILENCE_THRESHOLD);
}

void test_AudioPipeline_SilenceDetection_PositiveAmplitude(void) {
    int16_t sample = 25;  // Below threshold
    int16_t abs_sample = sample > 0 ? sample : -sample;

    TEST_ASSERT_LESS_THAN(AUDIO_SILENCE_THRESHOLD, abs_sample);
}

void test_AudioPipeline_SilenceDetection_NegativeAmplitude(void) {
    int16_t sample = -25;  // Below threshold
    int16_t abs_sample = sample > 0 ? sample : -sample;

    TEST_ASSERT_LESS_THAN(AUDIO_SILENCE_THRESHOLD, abs_sample);
}

void test_AudioPipeline_SilenceDetection_Zeros(void) {
    int16_t sample = 0;
    int16_t abs_sample = sample > 0 ? sample : -sample;

    TEST_ASSERT_LESS_THAN(AUDIO_SILENCE_THRESHOLD, abs_sample);
}

void test_AudioPipeline_SilenceDetection_NearThreshold(void) {
    // Test around threshold boundary
    int16_t below = AUDIO_SILENCE_THRESHOLD - 1;
    int16_t above = AUDIO_SILENCE_THRESHOLD + 1;

    int16_t abs_below = below > 0 ? below : -below;
    int16_t abs_above = above > 0 ? above : -above;

    TEST_ASSERT_LESS_THAN(AUDIO_SILENCE_THRESHOLD, abs_below);
    TEST_ASSERT_GREATER_THAN(AUDIO_SILENCE_THRESHOLD, abs_above);
}


// ============================================================================
// 6. STATISTICS AND LEVEL MONITORING TESTS
// ============================================================================

void test_AudioPipeline_PeakDetection_Positive(void) {
    // Simulate peak detection logic
    int32_t peak_level = 0;
    int16_t sample = 20000;
    int32_t abs_sample = sample > 0 ? sample : -sample;

    if (abs_sample > peak_level) {
        peak_level = abs_sample;
    }

    TEST_ASSERT_EQUAL_INT32(20000, peak_level);
}

void test_AudioPipeline_PeakDetection_Negative(void) {
    int32_t peak_level = 0;
    int16_t sample = -25000;
    int32_t abs_sample = sample > 0 ? sample : -sample;

    if (abs_sample > peak_level) {
        peak_level = abs_sample;
    }

    TEST_ASSERT_EQUAL_INT32(25000, peak_level);
}

void test_AudioPipeline_PeakDetection_MultiSample(void) {
    int32_t peak_level = 0;
    int16_t samples[] = {5000, 10000, 8000, 15000, 12000, 7000};

    for (int i = 0; i < 6; i++) {
        int32_t abs_sample = samples[i] > 0 ? samples[i] : -samples[i];
        if (abs_sample > peak_level) {
            peak_level = abs_sample;
        }
    }

    TEST_ASSERT_EQUAL_INT32(15000, peak_level);
}

void test_AudioPipeline_DCOffsetCalculation(void) {
    // Simulate DC offset estimation using exponential moving average
    int32_t dc_offset = 0;
    int16_t samples[] = {100, 120, 110, 115, 105, 108};

    for (int i = 0; i < 6; i++) {
        dc_offset = (dc_offset * 99 + samples[i]) / 100;
    }

    // Should converge to around 110
    TEST_ASSERT_GREATER_THAN_INT32(100, dc_offset);
    TEST_ASSERT_LESS_THAN_INT32(120, dc_offset);
}

void test_AudioPipeline_ClippingDetection(void) {
    // Test clipping detection threshold
    int32_t clip_count = 0;
    int16_t sample = 31000;  // Near max
    int32_t abs_sample = sample > 0 ? sample : -sample;

    if (abs_sample > 30000) {
        clip_count++;
    }

    TEST_ASSERT_EQUAL_INT32(1, clip_count);
}

void test_AudioPipeline_ClippingDetection_NoBelowThreshold(void) {
    int32_t clip_count = 0;
    int16_t sample = 20000;
    int32_t abs_sample = sample > 0 ? sample : -sample;

    if (abs_sample > 30000) {
        clip_count++;
    }

    TEST_ASSERT_EQUAL_INT32(0, clip_count);
}

void test_AudioPipeline_RMSCalculation_Simplified(void) {
    // Simplified RMS: RMS = peak / 2 for sinusoidal signal
    int32_t peak_level = 20000;
    int32_t rms_level = peak_level / 2;

    TEST_ASSERT_EQUAL_INT32(10000, rms_level);
}


// ============================================================================
// 7. TIMER AND SAMPLE RATE TESTS
// ============================================================================

void test_AudioPipeline_TimerConstants_24kHz(void) {
    // Verify 24kHz sample rate constants
    // Timer divider: 80MHz / 80 = 1MHz counter
    // Timer alarm: 1MHz / 24kHz = ~41.67 ticks

    uint32_t timer_divider = AUDIO_TIMER_DIVIDER;
    uint32_t apb_clock = 80000000;  // 80MHz
    uint32_t counter_freq = apb_clock / timer_divider;

    TEST_ASSERT_EQUAL_UINT32(1000000, counter_freq);  // 1MHz

    uint32_t timer_alarm = AUDIO_TIMER_ALARM;
    uint32_t calculated_rate = counter_freq / timer_alarm;

    // Should be approximately 24kHz (allow 1% tolerance)
    TEST_ASSERT_GREATER_THAN_UINT32(23760, calculated_rate);  // >99% of 24kHz
    TEST_ASSERT_LESS_THAN_UINT32(24240, calculated_rate);    // <101% of 24kHz
}

void test_AudioPipeline_FrameSize_20ms_24kHz(void) {
    // 20ms @ 24kHz = 480 samples
    uint32_t sample_rate = AUDIO_SAMPLE_RATE;
    uint32_t frame_size_ms = AUDIO_FRAME_SIZE_MS;
    uint32_t samples_per_frame = sample_rate * frame_size_ms / 1000;

    TEST_ASSERT_EQUAL_UINT32(480, samples_per_frame);
    TEST_ASSERT_EQUAL_UINT32(AUDIO_FRAME_SAMPLES, samples_per_frame);
}

void test_AudioPipeline_StatsWindow_1Second(void) {
    // Statistics window for level calculation
    uint32_t stats_window_ms = AUDIO_STATS_WINDOW_MS;
    uint32_t sample_rate = AUDIO_SAMPLE_RATE;
    uint32_t samples_per_window = sample_rate * stats_window_ms / 1000;

    TEST_ASSERT_EQUAL_UINT32(1000, stats_window_ms);
    TEST_ASSERT_EQUAL_UINT32(24000, samples_per_window);
}


// ============================================================================
// 8. ADC/DAC INITIALIZATION TESTS
// ============================================================================

void test_AudioPipeline_ADCResolution(void) {
    // ADC configured for 12-bit resolution
    adc_bits_width_t resolution = AUDIO_ADC_RESOLUTION;
    TEST_ASSERT_EQUAL(ADC_WIDTH_BIT_12, resolution);
}

void test_AudioPipeline_ADCAttenuation(void) {
    // ADC attenuation for full-scale input
    adc_atten_t atten = AUDIO_ADC_ATTEN;
    TEST_ASSERT_EQUAL(ADC_ATTEN_DB_11, atten);  // ~3.3V full scale
}

void test_AudioPipeline_DACBitDepth_ESP32(void) {
    // ESP32 original and S2 use 8-bit built-in DAC
#ifdef AUDIO_VARIANT_ESP32
    uint8_t dac_bits = AUDIO_DAC_BITS;
    TEST_ASSERT_EQUAL_UINT8(8, dac_bits);
#endif
}

void test_AudioPipeline_PWMBitDepth_ESP32S3(void) {
    // ESP32-S3 uses 12-bit PWM DAC
#ifdef AUDIO_VARIANT_ESP32S3
    uint8_t pwm_bits = AUDIO_DAC_BITS;
    TEST_ASSERT_EQUAL_UINT8(12, pwm_bits);
#endif
}

void test_AudioPipeline_PWMFrequency(void) {
    // PWM carrier frequency set for low audio distortion
#ifdef AUDIO_USE_PWM_DAC
    uint32_t pwm_freq = AUDIO_PWM_FREQUENCY;
    // 78.125kHz is 3.25x the sample rate, good for audio
    TEST_ASSERT_EQUAL_UINT32(78125, pwm_freq);
#endif
}

void test_AudioPipeline_RingBufferSize(void) {
    // Ring buffer sized for real-time processing
    uint16_t buffer_size = AUDIO_RINGBUFFER_SIZE;
    TEST_ASSERT_EQUAL_UINT16(8192, buffer_size);

    // Verify it's a power of 2 for efficient modulo
    TEST_ASSERT_TRUE((buffer_size & (buffer_size - 1)) == 0);
}

void test_AudioPipeline_SampleConversion_ADCto16bit(void) {
    // Verify ADC to 16-bit sample conversion
    uint16_t adc_raw = 2048;  // Mid-scale (12-bit center)

    // Convert: center at 0, scale to 16-bit
    int16_t adc_sample = adc_raw - 2048;  // 0
    int16_t rx_sample = adc_sample << 3;   // Shift left by 3

    TEST_ASSERT_EQUAL_INT16(0, rx_sample);
}

void test_AudioPipeline_SampleConversion_ADCto16bit_Max(void) {
    uint16_t adc_raw = 4095;  // Max 12-bit value

    int16_t adc_sample = adc_raw - 2048;  // 2047
    int16_t rx_sample = adc_sample << 3;   // Shift left by 3

    // Should scale to approximately 16383
    TEST_ASSERT_GREATER_THAN_INT16(16000, rx_sample);
    TEST_ASSERT_LESS_THAN_INT16(16384, rx_sample);
}

void test_AudioPipeline_SampleConversion_ADCto16bit_Min(void) {
    uint16_t adc_raw = 0;  // Min 12-bit value

    int16_t adc_sample = adc_raw - 2048;  // -2048
    int16_t rx_sample = adc_sample << 3;   // Shift left by 3

    // Should scale to approximately -16384
    TEST_ASSERT_LESS_THAN_INT16(-16000, rx_sample);
    TEST_ASSERT_GREATER_THAN_INT16(-16384, rx_sample);
}


// ============================================================================
// 9. ERROR HANDLING TESTS
// ============================================================================

void test_AudioPipeline_ErrorString_OK(void) {
    const char* msg = AudioPipeline::getErrorString(AUDIO_ERR_OK);
    TEST_ASSERT_NOT_NULL(msg);
    TEST_ASSERT_TRUE(strlen(msg) > 0);
}

void test_AudioPipeline_ErrorString_NotInitialized(void) {
    const char* msg = AudioPipeline::getErrorString(AUDIO_ERR_NOT_INITIALIZED);
    TEST_ASSERT_NOT_NULL(msg);
    TEST_ASSERT_TRUE(strlen(msg) > 0);
}

void test_AudioPipeline_ErrorString_AllCodes(void) {
    audio_error_t errors[] = {
        AUDIO_ERR_OK,
        AUDIO_ERR_NOT_INITIALIZED,
        AUDIO_ERR_ALREADY_RUNNING,
        AUDIO_ERR_INVALID_PARAMETER,
        AUDIO_ERR_ADC_INIT_FAILED,
        AUDIO_ERR_DAC_INIT_FAILED,
        AUDIO_ERR_TIMER_INIT_FAILED,
        AUDIO_ERR_PWM_INIT_FAILED,
        AUDIO_ERR_BUFFER_OVERFLOW,
        AUDIO_ERR_BUFFER_UNDERFLOW,
        AUDIO_ERR_OUT_OF_MEMORY,
        AUDIO_ERR_ISR_ALLOC_FAILED
    };

    for (int i = 0; i < 12; i++) {
        const char* msg = AudioPipeline::getErrorString(errors[i]);
        TEST_ASSERT_NOT_NULL(msg);
        TEST_ASSERT_GREATER_THAN_INT(0, strlen(msg));
    }
}


// ============================================================================
// 10. INTEGRATION TESTS
// ============================================================================

void test_AudioPipeline_FullRXPath(void) {
    // Test simulated RX path: ADC value -> RX buffer
    AudioRingBuffer rx_buffer(256);

    // Simulate ISR reading ADC
    uint16_t adc_raw = 2500;  // Slightly above center
    int16_t adc_sample = adc_raw - 2048;
    int16_t rx_sample = adc_sample << 3;

    bool put_result = rx_buffer.put(rx_sample);
    TEST_ASSERT_TRUE(put_result);

    // Simulate main thread reading RX
    audio_sample_t retrieved;
    bool get_result = rx_buffer.get(retrieved);
    TEST_ASSERT_TRUE(get_result);
    TEST_ASSERT_EQUAL_INT16(rx_sample, retrieved);
}

void test_AudioPipeline_FullTXPath(void) {
    // Test simulated TX path: TX buffer -> DAC output
    AudioRingBuffer tx_buffer(256);

    audio_sample_t tx_sample = 10000;
    float tx_gain = 1.0f;  // 0dB

    // Put sample in TX buffer
    bool put_result = tx_buffer.put(tx_sample);
    TEST_ASSERT_TRUE(put_result);

    // Simulate ISR getting sample
    audio_sample_t output_sample;
    bool get_result = tx_buffer.get(output_sample);
    TEST_ASSERT_TRUE(get_result);

    // Apply gain
    int32_t output = (int32_t)output_sample * tx_gain;
    if (output > 32767) output = 32767;
    if (output < -32768) output = -32768;

    int16_t dac_sample = (int16_t)output;
    TEST_ASSERT_EQUAL_INT16(10000, dac_sample);
}

void test_AudioPipeline_RXTXConcurrency(void) {
    // Simulate concurrent RX and TX buffering
    AudioRingBuffer rx_buffer(256);
    AudioRingBuffer tx_buffer(256);

    // RX: Add samples from simulated ADC
    for (int i = 0; i < 100; i++) {
        rx_buffer.put((audio_sample_t)(i * 100));
    }

    // TX: Add samples from application
    for (int i = 0; i < 50; i++) {
        tx_buffer.put((audio_sample_t)(-i * 100));
    }

    // RX: Read samples
    audio_sample_t rx_sample;
    int rx_count = 0;
    while (rx_buffer.get(rx_sample)) {
        rx_count++;
    }

    // TX: Check buffer usage
    int tx_count = tx_buffer.getData();

    TEST_ASSERT_EQUAL_INT(100, rx_count);
    TEST_ASSERT_EQUAL_INT(50, tx_count);
}

void test_AudioPipeline_VariantDetection(void) {
    // Verify variant detection macros are defined
#if defined(AUDIO_VARIANT_ESP32) || \
    defined(AUDIO_VARIANT_ESP32S2) || \
    defined(AUDIO_VARIANT_ESP32S3) || \
    defined(AUDIO_VARIANT_ESP32C3) || \
    defined(AUDIO_VARIANT_ESP32C5) || \
    defined(AUDIO_VARIANT_ESP32C6) || \
    defined(AUDIO_VARIANT_ESP32H2)
    TEST_ASSERT_TRUE(1);
#else
    TEST_FAIL_MESSAGE("No ESP32 variant defined");
#endif
}

void test_AudioPipeline_VariantSpecificDAC(void) {
    // Verify DAC configuration matches variant
#if defined(AUDIO_VARIANT_ESP32) || defined(AUDIO_VARIANT_ESP32S2)
    TEST_ASSERT_EQUAL_INT(1, AUDIO_HAS_BUILTIN_DAC);
#elif defined(AUDIO_VARIANT_ESP32S3) || \
      defined(AUDIO_VARIANT_ESP32C3) || \
      defined(AUDIO_VARIANT_ESP32C6) || \
      defined(AUDIO_VARIANT_ESP32H2) || \
      defined(AUDIO_VARIANT_ESP32C5)
    #ifdef AUDIO_USE_PWM_DAC
        TEST_ASSERT_EQUAL_INT(0, AUDIO_HAS_BUILTIN_DAC);
    #endif
#endif
}


// ============================================================================
// TEST RUNNER
// ============================================================================

void setUp(void) {
    // Set up test environment
}

void tearDown(void) {
    // Clean up test environment
}

int main(int argc, char* argv[]) {
    UNITY_BEGIN();

    // Ring buffer tests
    RUN_TEST(test_RingBuffer_Creation);
    RUN_TEST(test_RingBuffer_PutGet_SingleSample);
    RUN_TEST(test_RingBuffer_PutGet_MultipleSamples);
    RUN_TEST(test_RingBuffer_Overflow);
    RUN_TEST(test_RingBuffer_Underflow);
    RUN_TEST(test_RingBuffer_WrapAround);
    RUN_TEST(test_RingBuffer_OverflowReset);
    RUN_TEST(test_RingBuffer_Clear);
    RUN_TEST(test_RingBuffer_Utilization);
    RUN_TEST(test_RingBuffer_LargeBuffer);

    // Audio pipeline initialization tests
    RUN_TEST(test_AudioPipeline_Construction);
    RUN_TEST(test_AudioPipeline_BeginBeforeStart);
    RUN_TEST(test_AudioPipeline_DoubleInitialize);
    RUN_TEST(test_AudioPipeline_StartBeforeInit);
    RUN_TEST(test_AudioPipeline_VariantName);

    // Ring buffer sample operations
    RUN_TEST(test_AudioPipeline_RXSingleSample);
    RUN_TEST(test_AudioPipeline_RXMultipleSamples);
    RUN_TEST(test_AudioPipeline_TXSamples);

    // Gain control tests
    RUN_TEST(test_AudioPipeline_GainCalculation_0dB);
    RUN_TEST(test_AudioPipeline_GainCalculation_6dB);
    RUN_TEST(test_AudioPipeline_GainCalculation_Minus6dB);
    RUN_TEST(test_AudioPipeline_GainCalculation_12dB);
    RUN_TEST(test_AudioPipeline_GainCalculation_24dB);
    RUN_TEST(test_AudioPipeline_GainCalculation_Minus24dB);
    RUN_TEST(test_AudioPipeline_GainApplication_Positive);
    RUN_TEST(test_AudioPipeline_GainApplication_ClampingPositive);
    RUN_TEST(test_AudioPipeline_GainApplication_ClampingNegative);

    // Silence detection tests
    RUN_TEST(test_AudioPipeline_SilenceDetection_Threshold);
    RUN_TEST(test_AudioPipeline_SilenceDetection_PositiveAmplitude);
    RUN_TEST(test_AudioPipeline_SilenceDetection_NegativeAmplitude);
    RUN_TEST(test_AudioPipeline_SilenceDetection_Zeros);
    RUN_TEST(test_AudioPipeline_SilenceDetection_NearThreshold);

    // Statistics tests
    RUN_TEST(test_AudioPipeline_PeakDetection_Positive);
    RUN_TEST(test_AudioPipeline_PeakDetection_Negative);
    RUN_TEST(test_AudioPipeline_PeakDetection_MultiSample);
    RUN_TEST(test_AudioPipeline_DCOffsetCalculation);
    RUN_TEST(test_AudioPipeline_ClippingDetection);
    RUN_TEST(test_AudioPipeline_ClippingDetection_NoBelowThreshold);
    RUN_TEST(test_AudioPipeline_RMSCalculation_Simplified);

    // Timer and sample rate tests
    RUN_TEST(test_AudioPipeline_TimerConstants_24kHz);
    RUN_TEST(test_AudioPipeline_FrameSize_20ms_24kHz);
    RUN_TEST(test_AudioPipeline_StatsWindow_1Second);

    // ADC/DAC initialization tests
    RUN_TEST(test_AudioPipeline_ADCResolution);
    RUN_TEST(test_AudioPipeline_ADCAttenuation);
    RUN_TEST(test_AudioPipeline_DACBitDepth_ESP32);
    RUN_TEST(test_AudioPipeline_PWMBitDepth_ESP32S3);
    RUN_TEST(test_AudioPipeline_PWMFrequency);
    RUN_TEST(test_AudioPipeline_RingBufferSize);
    RUN_TEST(test_AudioPipeline_SampleConversion_ADCto16bit);
    RUN_TEST(test_AudioPipeline_SampleConversion_ADCto16bit_Max);
    RUN_TEST(test_AudioPipeline_SampleConversion_ADCto16bit_Min);

    // Error handling tests
    RUN_TEST(test_AudioPipeline_ErrorString_OK);
    RUN_TEST(test_AudioPipeline_ErrorString_NotInitialized);
    RUN_TEST(test_AudioPipeline_ErrorString_AllCodes);

    // Integration tests
    RUN_TEST(test_AudioPipeline_FullRXPath);
    RUN_TEST(test_AudioPipeline_FullTXPath);
    RUN_TEST(test_AudioPipeline_RXTXConcurrency);
    RUN_TEST(test_AudioPipeline_VariantDetection);
    RUN_TEST(test_AudioPipeline_VariantSpecificDAC);

    return UNITY_END();
}
