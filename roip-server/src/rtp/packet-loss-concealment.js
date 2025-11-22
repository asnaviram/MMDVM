/**
 * Packet Loss Concealment (PLC) for RTP Audio
 *
 * Implements various techniques to conceal packet loss:
 * - Silence insertion
 * - Packet repetition
 * - Interpolation
 * - Fade to silence
 *
 * @module packet-loss-concealment
 */

/**
 * Packet Loss Concealment Engine
 */
export class PacketLossConcealment {
  constructor(options = {}) {
    this.frameSize = options.frameSize || 960;  // 20ms @ 48kHz
    this.sampleRate = options.sampleRate || 48000;
    this.maxRepetitions = options.maxRepetitions || 3;
    this.fadeLength = options.fadeLength || 480;  // 10ms fade

    // State
    this.lastGoodPacket = null;
    this.lastGoodAudio = null;
    this.consecutiveLosses = 0;

    // Statistics
    this.stats = {
      totalLosses: 0,
      concealedBySilence: 0,
      concealedByRepetition: 0,
      concealedByInterpolation: 0,
      concealedByFade: 0
    };
  }

  /**
   * Store good packet for future concealment
   * @param {object} packet - RTP packet
   * @param {Buffer|Float32Array} audio - Audio data
   */
  storeGoodPacket(packet, audio) {
    this.lastGoodPacket = {
      sequenceNumber: packet.sequenceNumber,
      timestamp: packet.timestamp,
      ssrc: packet.ssrc
    };

    // Convert to Float32Array for easier processing
    this.lastGoodAudio = this.toFloat32(audio);
    this.consecutiveLosses = 0;
  }

  /**
   * Generate concealment audio for lost packet
   * @param {number} lossCount - Number of consecutive losses
   * @returns {Buffer} Concealed audio data
   */
  conceal(lossCount = 1) {
    this.consecutiveLosses = lossCount;
    this.stats.totalLosses += lossCount;

    // Strategy selection based on loss count
    if (!this.lastGoodAudio) {
      // No previous packet - use silence
      this.stats.concealedBySilence++;
      return this.generateSilence();
    } else if (lossCount === 1) {
      // Single packet loss - repeat previous
      this.stats.concealedByRepetition++;
      return this.repeatPacket();
    } else if (lossCount <= this.maxRepetitions) {
      // Multiple losses - fade to silence
      this.stats.concealedByFade++;
      return this.fadeToSilence();
    } else {
      // Too many losses - silence
      this.stats.concealedBySilence++;
      return this.generateSilence();
    }
  }

  /**
   * Generate silence
   * @private
   * @returns {Buffer} Silent audio buffer
   */
  generateSilence() {
    const buffer = Buffer.alloc(this.frameSize * 2);  // 16-bit samples
    return buffer;
  }

  /**
   * Repeat last good packet
   * @private
   * @returns {Buffer} Repeated audio buffer
   */
  repeatPacket() {
    if (!this.lastGoodAudio) {
      return this.generateSilence();
    }

    // Simple repetition with slight attenuation
    const repeated = new Float32Array(this.lastGoodAudio);
    const attenuation = 0.9;  // -1dB

    for (let i = 0; i < repeated.length; i++) {
      repeated[i] *= attenuation;
    }

    return this.toInt16Buffer(repeated);
  }

  /**
   * Fade to silence over time
   * @private
   * @returns {Buffer} Faded audio buffer
   */
  fadeToSilence() {
    if (!this.lastGoodAudio) {
      return this.generateSilence();
    }

    const faded = new Float32Array(this.frameSize);
    const sourceLength = Math.min(this.lastGoodAudio.length, this.frameSize);

    // Copy and apply fade
    for (let i = 0; i < sourceLength; i++) {
      // Exponential fade
      const fadeAmount = Math.pow(1 - (i / sourceLength), 2);
      faded[i] = this.lastGoodAudio[i] * fadeAmount;
    }

    return this.toInt16Buffer(faded);
  }

  /**
   * Interpolate between packets
   * @private
   * @param {Float32Array} prevAudio - Previous audio
   * @param {Float32Array} nextAudio - Next audio
   * @returns {Buffer} Interpolated audio
   */
  interpolate(prevAudio, nextAudio) {
    const interpolated = new Float32Array(this.frameSize);
    const length = Math.min(prevAudio.length, nextAudio.length, this.frameSize);

    for (let i = 0; i < length; i++) {
      const t = i / length;
      // Linear interpolation
      interpolated[i] = prevAudio[i] * (1 - t) + nextAudio[i] * t;
    }

    this.stats.concealedByInterpolation++;
    return this.toInt16Buffer(interpolated);
  }

  /**
   * Perform waveform substitution
   * @private
   * @returns {Buffer} Substituted audio
   */
  waveformSubstitution() {
    if (!this.lastGoodAudio || this.lastGoodAudio.length < this.frameSize) {
      return this.generateSilence();
    }

    // Find pitch period (simplified autocorrelation)
    const pitchPeriod = this.estimatePitch(this.lastGoodAudio);

    if (pitchPeriod === 0) {
      return this.fadeToSilence();
    }

    // Generate new frame by repeating pitch periods
    const output = new Float32Array(this.frameSize);
    const sourceLength = this.lastGoodAudio.length;

    for (let i = 0; i < this.frameSize; i++) {
      const sourceIndex = (sourceLength - pitchPeriod + (i % pitchPeriod)) % sourceLength;
      output[i] = this.lastGoodAudio[sourceIndex] * 0.8;  // Attenuate
    }

    return this.toInt16Buffer(output);
  }

  /**
   * Estimate pitch period using autocorrelation
   * @private
   * @param {Float32Array} audio - Audio samples
   * @returns {number} Pitch period in samples
   */
  estimatePitch(audio) {
    const minPeriod = Math.floor(this.sampleRate / 400);  // 400 Hz max
    const maxPeriod = Math.floor(this.sampleRate / 80);   // 80 Hz min
    let maxCorrelation = 0;
    let bestPeriod = 0;

    for (let period = minPeriod; period <= maxPeriod && period < audio.length / 2; period++) {
      let correlation = 0;
      const compareLength = Math.min(audio.length - period, 200);

      for (let i = 0; i < compareLength; i++) {
        correlation += audio[i] * audio[i + period];
      }

      if (correlation > maxCorrelation) {
        maxCorrelation = correlation;
        bestPeriod = period;
      }
    }

    return bestPeriod;
  }

  /**
   * Convert audio to Float32Array
   * @private
   * @param {Buffer|Float32Array} audio - Input audio
   * @returns {Float32Array} Converted audio
   */
  toFloat32(audio) {
    if (audio instanceof Float32Array) {
      return new Float32Array(audio);  // Copy
    }

    if (Buffer.isBuffer(audio)) {
      const samples = audio.length / 2;
      const output = new Float32Array(samples);
      for (let i = 0; i < samples; i++) {
        output[i] = audio.readInt16LE(i * 2) / 32768.0;
      }
      return output;
    }

    return new Float32Array(this.frameSize);
  }

  /**
   * Convert Float32Array to Int16 Buffer
   * @private
   * @param {Float32Array} audio - Input audio
   * @returns {Buffer} Output buffer
   */
  toInt16Buffer(audio) {
    const buffer = Buffer.allocUnsafe(audio.length * 2);

    for (let i = 0; i < audio.length; i++) {
      // Clamp and convert to int16
      let sample = Math.max(-1, Math.min(1, audio[i]));
      const int16 = Math.round(sample * 32767);
      buffer.writeInt16LE(int16, i * 2);
    }

    return buffer;
  }

  /**
   * Reset concealment state
   */
  reset() {
    this.lastGoodPacket = null;
    this.lastGoodAudio = null;
    this.consecutiveLosses = 0;
  }

  /**
   * Get statistics
   * @returns {object} Statistics
   */
  getStats() {
    const total = this.stats.totalLosses;
    return {
      ...this.stats,
      consecutiveLosses: this.consecutiveLosses,
      hasHistory: this.lastGoodAudio !== null,
      silenceRate: total > 0 ? (this.stats.concealedBySilence / total * 100).toFixed(1) + '%' : '0%',
      repetitionRate: total > 0 ? (this.stats.concealedByRepetition / total * 100).toFixed(1) + '%' : '0%',
      fadeRate: total > 0 ? (this.stats.concealedByFade / total * 100).toFixed(1) + '%' : '0%'
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalLosses: 0,
      concealedBySilence: 0,
      concealedByRepetition: 0,
      concealedByInterpolation: 0,
      concealedByFade: 0
    };
  }
}

export default PacketLossConcealment;
