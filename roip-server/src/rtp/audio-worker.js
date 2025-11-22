/**
 * Audio Worker for CPU-Intensive Audio Processing
 *
 * Uses worker threads to offload audio processing from the main thread
 * for improved performance and responsiveness.
 *
 * @module audio-worker
 */

import { parentPort } from 'worker_threads';

/**
 * Process audio data in worker thread
 * @param {object} data - Audio processing task
 */
function processAudio(data) {
  const { type, audioData, options } = data;

  try {
    let result;

    switch (type) {
      case 'mix':
        result = mixAudio(audioData, options);
        break;

      case 'resample':
        result = resampleAudio(audioData, options);
        break;

      case 'filter':
        result = filterAudio(audioData, options);
        break;

      case 'normalize':
        result = normalizeAudio(audioData, options);
        break;

      case 'compress':
        result = compressAudio(audioData, options);
        break;

      case 'expand':
        result = expandAudio(audioData, options);
        break;

      case 'analyze':
        result = analyzeAudio(audioData, options);
        break;

      default:
        throw new Error(`Unknown processing type: ${type}`);
    }

    // Send result back to main thread
    parentPort.postMessage({
      success: true,
      type,
      result
    });
  } catch (error) {
    // Send error back to main thread
    parentPort.postMessage({
      success: false,
      type,
      error: error.message
    });
  }
}

/**
 * Mix multiple audio streams
 * @param {Array} audioStreams - Array of audio buffers
 * @param {object} options - Mix options
 * @returns {Buffer} Mixed audio
 */
function mixAudio(audioStreams, options = {}) {
  if (!audioStreams || audioStreams.length === 0) {
    return Buffer.alloc(0);
  }

  const frameSize = options.frameSize || 960;
  const normalization = options.normalization !== false;

  // Convert to Float32Arrays
  const streams = audioStreams.map(stream => {
    const samples = stream.length / 2;
    const float = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      float[i] = stream.readInt16LE(i * 2) / 32768.0;
    }
    return float;
  });

  // Mix
  const mixed = new Float32Array(frameSize);
  for (const stream of streams) {
    const length = Math.min(frameSize, stream.length);
    for (let i = 0; i < length; i++) {
      mixed[i] += stream[i];
    }
  }

  // Normalize
  if (normalization && streams.length > 1) {
    const scale = 1 / Math.sqrt(streams.length);
    for (let i = 0; i < frameSize; i++) {
      mixed[i] *= scale;
    }
  }

  // Convert to Buffer
  return float32ToBuffer(mixed);
}

/**
 * Resample audio
 * @param {Buffer} audioData - Input audio
 * @param {object} options - Resample options
 * @returns {Buffer} Resampled audio
 */
function resampleAudio(audioData, options = {}) {
  const inputRate = options.inputRate || 48000;
  const outputRate = options.outputRate || 48000;

  if (inputRate === outputRate) {
    return audioData;
  }

  const ratio = outputRate / inputRate;
  const inputSamples = audioData.length / 2;
  const outputSamples = Math.floor(inputSamples * ratio);

  const input = bufferToFloat32(audioData);
  const output = new Float32Array(outputSamples);

  // Simple linear interpolation
  for (let i = 0; i < outputSamples; i++) {
    const srcIndex = i / ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const srcIndexCeil = Math.min(srcIndexFloor + 1, inputSamples - 1);
    const frac = srcIndex - srcIndexFloor;

    output[i] = input[srcIndexFloor] * (1 - frac) + input[srcIndexCeil] * frac;
  }

  return float32ToBuffer(output);
}

/**
 * Apply audio filter
 * @param {Buffer} audioData - Input audio
 * @param {object} options - Filter options
 * @returns {Buffer} Filtered audio
 */
function filterAudio(audioData, options = {}) {
  const filterType = options.filterType || 'lowpass';
  const cutoff = options.cutoff || 0.5;

  const samples = bufferToFloat32(audioData);
  const filtered = new Float32Array(samples.length);

  // Simple IIR filter
  const alpha = cutoff;
  filtered[0] = samples[0];

  for (let i = 1; i < samples.length; i++) {
    filtered[i] = alpha * samples[i] + (1 - alpha) * filtered[i - 1];
  }

  return float32ToBuffer(filtered);
}

/**
 * Normalize audio level
 * @param {Buffer} audioData - Input audio
 * @param {object} options - Normalization options
 * @returns {Buffer} Normalized audio
 */
function normalizeAudio(audioData, options = {}) {
  const targetLevel = options.targetLevel || 0.9;

  const samples = bufferToFloat32(audioData);

  // Find peak
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > peak) peak = abs;
  }

  if (peak === 0) return audioData;

  // Calculate gain
  const gain = targetLevel / peak;

  // Apply gain
  const normalized = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    normalized[i] = samples[i] * gain;
  }

  return float32ToBuffer(normalized);
}

/**
 * Apply compression
 * @param {Buffer} audioData - Input audio
 * @param {object} options - Compression options
 * @returns {Buffer} Compressed audio
 */
function compressAudio(audioData, options = {}) {
  const threshold = options.threshold || 0.7;
  const ratio = options.ratio || 4;

  const samples = bufferToFloat32(audioData);
  const compressed = new Float32Array(samples.length);

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const abs = Math.abs(sample);

    if (abs > threshold) {
      // Apply compression
      const excess = abs - threshold;
      const compressed_excess = excess / ratio;
      const sign = sample >= 0 ? 1 : -1;
      compressed[i] = sign * (threshold + compressed_excess);
    } else {
      compressed[i] = sample;
    }
  }

  return float32ToBuffer(compressed);
}

/**
 * Apply expansion
 * @param {Buffer} audioData - Input audio
 * @param {object} options - Expansion options
 * @returns {Buffer} Expanded audio
 */
function expandAudio(audioData, options = {}) {
  const threshold = options.threshold || 0.1;
  const ratio = options.ratio || 2;

  const samples = bufferToFloat32(audioData);
  const expanded = new Float32Array(samples.length);

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const abs = Math.abs(sample);

    if (abs < threshold) {
      // Apply expansion
      const sign = sample >= 0 ? 1 : -1;
      expanded[i] = sign * (abs / ratio);
    } else {
      expanded[i] = sample;
    }
  }

  return float32ToBuffer(expanded);
}

/**
 * Analyze audio
 * @param {Buffer} audioData - Input audio
 * @param {object} options - Analysis options
 * @returns {object} Analysis results
 */
function analyzeAudio(audioData, options = {}) {
  const samples = bufferToFloat32(audioData);

  // Calculate statistics
  let peak = 0;
  let sum = 0;
  let sumSquares = 0;

  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > peak) peak = abs;
    sum += samples[i];
    sumSquares += samples[i] * samples[i];
  }

  const mean = sum / samples.length;
  const rms = Math.sqrt(sumSquares / samples.length);
  const variance = sumSquares / samples.length - mean * mean;
  const stdDev = Math.sqrt(variance);

  // Calculate zero crossings
  let zeroCrossings = 0;
  for (let i = 1; i < samples.length; i++) {
    if ((samples[i] >= 0 && samples[i - 1] < 0) ||
        (samples[i] < 0 && samples[i - 1] >= 0)) {
      zeroCrossings++;
    }
  }

  return {
    peak,
    rms,
    mean,
    stdDev,
    zeroCrossings,
    peakDb: 20 * Math.log10(Math.max(peak, 0.00001)),
    rmsDb: 20 * Math.log10(Math.max(rms, 0.00001)),
    samples: samples.length
  };
}

/**
 * Convert Buffer to Float32Array
 * @param {Buffer} buffer - Input buffer
 * @returns {Float32Array} Float32 samples
 */
function bufferToFloat32(buffer) {
  const samples = buffer.length / 2;
  const float = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    float[i] = buffer.readInt16LE(i * 2) / 32768.0;
  }
  return float;
}

/**
 * Convert Float32Array to Buffer
 * @param {Float32Array} samples - Float32 samples
 * @returns {Buffer} Output buffer
 */
function float32ToBuffer(samples) {
  const buffer = Buffer.allocUnsafe(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const int16 = Math.round(clamped * 32767);
    buffer.writeInt16LE(int16, i * 2);
  }
  return buffer;
}

// Listen for messages from main thread
if (parentPort) {
  parentPort.on('message', processAudio);
}

export { processAudio, mixAudio, resampleAudio, filterAudio, normalizeAudio };
