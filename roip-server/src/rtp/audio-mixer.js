/**
 * Optimized Audio Mixer for RTP Streams
 *
 * High-performance audio mixing with:
 * - Pre-allocated buffers
 * - Vectorized operations
 * - Configurable mixing algorithms
 * - AGC (Automatic Gain Control)
 *
 * @module audio-mixer
 */

/**
 * Optimized Audio Mixer
 * Uses Float32Array for efficient mixing operations
 */
export class OptimizedAudioMixer {
  constructor(options = {}) {
    // Configuration
    this.sampleRate = options.sampleRate || 48000;
    this.frameSize = options.frameSize || 960;  // 20ms @ 48kHz
    this.channels = options.channels || 1;

    // Pre-allocated buffers
    this.mixBuffer = new Float32Array(this.frameSize);
    this.tempBuffer = new Float32Array(this.frameSize);
    this.outputBuffer = new Int16Array(this.frameSize);

    // Stream management
    this.sources = new Map();  // sourceId -> { gain, active, lastAudio }

    // Mixing parameters
    this.normalizationEnabled = options.normalizationEnabled !== false;
    this.agcEnabled = options.agcEnabled !== false;
    this.maxGain = options.maxGain || 2.0;
    this.targetLevel = options.targetLevel || 0.7;

    // AGC state
    this.currentGain = 1.0;
    this.peakLevel = 0.0;
    this.agcAttack = 0.01;
    this.agcRelease = 0.001;

    // Statistics
    this.stats = {
      mixCount: 0,
      activeSources: 0,
      peakLevel: 0,
      currentGain: 1.0,
      clippingEvents: 0,
      lastMixTime: 0
    };
  }

  /**
   * Add audio source to mixer
   * @param {string} sourceId - Unique source identifier
   * @param {object} options - Source options
   */
  addSource(sourceId, options = {}) {
    this.sources.set(sourceId, {
      gain: options.gain || 1.0,
      active: true,
      lastAudio: null,
      muted: false
    });
  }

  /**
   * Remove audio source from mixer
   * @param {string} sourceId - Source identifier
   */
  removeSource(sourceId) {
    this.sources.delete(sourceId);
  }

  /**
   * Set source gain
   * @param {string} sourceId - Source identifier
   * @param {number} gain - Gain value (0.0 - 2.0)
   */
  setSourceGain(sourceId, gain) {
    const source = this.sources.get(sourceId);
    if (source) {
      source.gain = Math.max(0, Math.min(gain, 2.0));
    }
  }

  /**
   * Mute/unmute source
   * @param {string} sourceId - Source identifier
   * @param {boolean} muted - Mute state
   */
  setSourceMuted(sourceId, muted) {
    const source = this.sources.get(sourceId);
    if (source) {
      source.muted = muted;
    }
  }

  /**
   * Mix audio from multiple sources
   * @param {Map<string, Buffer|Float32Array>} sourceAudio - Map of sourceId to audio data
   * @returns {Buffer} Mixed audio as 16-bit PCM
   */
  mix(sourceAudio) {
    const startTime = Date.now();

    // Reset mix buffer
    this.mixBuffer.fill(0);

    let activeSources = 0;
    let maxSample = 0;

    // Mix all sources
    for (const [sourceId, audio] of sourceAudio) {
      const source = this.sources.get(sourceId);
      if (!source || !source.active || source.muted) {
        continue;
      }

      // Convert to Float32Array if needed
      const audioFloat = this.toFloat32(audio);
      if (!audioFloat || audioFloat.length === 0) {
        continue;
      }

      activeSources++;

      // Mix with source gain
      const gain = source.gain;
      const length = Math.min(this.frameSize, audioFloat.length);

      for (let i = 0; i < length; i++) {
        this.mixBuffer[i] += audioFloat[i] * gain;
      }

      // Store for statistics
      source.lastAudio = audioFloat;
    }

    // Apply normalization if enabled
    if (this.normalizationEnabled && activeSources > 1) {
      // Soft normalization: -3dB per doubling of sources
      const scale = 1 / Math.sqrt(activeSources);
      for (let i = 0; i < this.frameSize; i++) {
        this.mixBuffer[i] *= scale;
      }
    }

    // Apply AGC if enabled
    if (this.agcEnabled) {
      this.applyAGC();
    }

    // Find peak level and convert to int16
    for (let i = 0; i < this.frameSize; i++) {
      let sample = this.mixBuffer[i];

      // Track peak
      const absSample = Math.abs(sample);
      if (absSample > maxSample) {
        maxSample = absSample;
      }

      // Soft clipping
      if (sample > 1.0) {
        sample = this.softClip(sample);
        this.stats.clippingEvents++;
      } else if (sample < -1.0) {
        sample = this.softClip(sample);
        this.stats.clippingEvents++;
      }

      // Convert to int16
      this.outputBuffer[i] = Math.round(sample * 32767);
    }

    // Update statistics
    this.stats.mixCount++;
    this.stats.activeSources = activeSources;
    this.stats.peakLevel = maxSample;
    this.stats.currentGain = this.currentGain;
    this.stats.lastMixTime = Date.now() - startTime;

    // Convert Int16Array to Buffer
    return Buffer.from(this.outputBuffer.buffer, this.outputBuffer.byteOffset, this.outputBuffer.byteLength);
  }

  /**
   * Apply Automatic Gain Control
   * @private
   */
  applyAGC() {
    // Calculate peak level
    let peak = 0;
    for (let i = 0; i < this.frameSize; i++) {
      const abs = Math.abs(this.mixBuffer[i]);
      if (abs > peak) peak = abs;
    }

    // Update peak level with envelope follower
    if (peak > this.peakLevel) {
      this.peakLevel += (peak - this.peakLevel) * this.agcAttack;
    } else {
      this.peakLevel += (peak - this.peakLevel) * this.agcRelease;
    }

    // Calculate target gain
    let targetGain = 1.0;
    if (this.peakLevel > 0.001) {
      targetGain = this.targetLevel / this.peakLevel;
      targetGain = Math.min(targetGain, this.maxGain);
    }

    // Smooth gain changes
    if (targetGain < this.currentGain) {
      this.currentGain += (targetGain - this.currentGain) * this.agcAttack;
    } else {
      this.currentGain += (targetGain - this.currentGain) * this.agcRelease;
    }

    // Apply gain
    for (let i = 0; i < this.frameSize; i++) {
      this.mixBuffer[i] *= this.currentGain;
    }
  }

  /**
   * Soft clipping function
   * @private
   * @param {number} sample - Input sample
   * @returns {number} Clipped sample
   */
  softClip(sample) {
    // Tanh-based soft clipping
    const x = sample / 2;
    return Math.tanh(x) * 1.5;
  }

  /**
   * Convert audio to Float32Array
   * @private
   * @param {Buffer|Float32Array|Int16Array} audio - Input audio
   * @returns {Float32Array} Converted audio
   */
  toFloat32(audio) {
    if (audio instanceof Float32Array) {
      return audio;
    }

    if (audio instanceof Int16Array) {
      const output = new Float32Array(audio.length);
      for (let i = 0; i < audio.length; i++) {
        output[i] = audio[i] / 32768.0;
      }
      return output;
    }

    if (Buffer.isBuffer(audio)) {
      const samples = audio.length / 2;
      const output = new Float32Array(samples);
      for (let i = 0; i < samples; i++) {
        output[i] = audio.readInt16LE(i * 2) / 32768.0;
      }
      return output;
    }

    return null;
  }

  /**
   * Get mixer statistics
   * @returns {object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      totalSources: this.sources.size,
      activeSources: this.stats.activeSources,
      peakLevelDb: 20 * Math.log10(Math.max(this.stats.peakLevel, 0.00001)),
      currentGainDb: 20 * Math.log10(this.currentGain)
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats.mixCount = 0;
    this.stats.clippingEvents = 0;
  }

  /**
   * Clear all sources
   */
  clear() {
    this.sources.clear();
  }
}

export default OptimizedAudioMixer;
