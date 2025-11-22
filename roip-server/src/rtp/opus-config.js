/**
 * Opus Codec Configuration for RTP
 *
 * Optimized settings for voice-over-IP applications
 * Based on RFC 6716 and RFC 7587
 *
 * @module opus-config
 */

/**
 * Opus codec presets
 */
export const OpusPresets = {
  /**
   * Low bitrate preset for bandwidth-constrained scenarios
   */
  LOW_BANDWIDTH: {
    sampleRate: 48000,
    channels: 1,
    bitrate: 16000,         // 16 kbps
    complexity: 3,          // Low complexity
    frameSize: 20,          // 20ms frames
    packetLossPerc: 5,      // 5% expected packet loss
    useFEC: true,           // Enable forward error correction
    useDTX: true,           // Enable discontinuous transmission
    application: 'voip',    // VOIP application
    maxBandwidth: 'narrowband',  // 8 kHz bandwidth
    signal: 'voice'
  },

  /**
   * Standard quality preset for typical VoIP
   */
  STANDARD: {
    sampleRate: 48000,
    channels: 1,
    bitrate: 32000,         // 32 kbps
    complexity: 5,          // Medium complexity
    frameSize: 20,          // 20ms frames
    packetLossPerc: 1,      // 1% expected packet loss
    useFEC: true,           // Enable forward error correction
    useDTX: false,          // Disable DTX for consistent quality
    application: 'voip',
    maxBandwidth: 'wideband',  // 16 kHz bandwidth
    signal: 'voice'
  },

  /**
   * High quality preset for good network conditions
   */
  HIGH_QUALITY: {
    sampleRate: 48000,
    channels: 1,
    bitrate: 64000,         // 64 kbps
    complexity: 8,          // High complexity
    frameSize: 20,          // 20ms frames
    packetLossPerc: 0,      // No expected packet loss
    useFEC: false,          // Disable FEC (not needed)
    useDTX: false,          // Disable DTX
    application: 'voip',
    maxBandwidth: 'fullband',  // 20 kHz bandwidth
    signal: 'voice'
  },

  /**
   * Music/audio preset
   */
  MUSIC: {
    sampleRate: 48000,
    channels: 2,            // Stereo
    bitrate: 128000,        // 128 kbps
    complexity: 10,         // Maximum complexity
    frameSize: 20,          // 20ms frames
    packetLossPerc: 0,
    useFEC: false,
    useDTX: false,
    application: 'audio',   // Audio application
    maxBandwidth: 'fullband',
    signal: 'music'
  },

  /**
   * Radio preset - optimized for RoIP applications
   */
  RADIO: {
    sampleRate: 48000,
    channels: 1,
    bitrate: 32000,         // 32 kbps - good quality for radio
    complexity: 5,          // Balance quality/CPU
    frameSize: 20,          // 20ms frames
    packetLossPerc: 2,      // 2% expected packet loss
    useFEC: true,           // Enable FEC for robustness
    useDTX: false,          // Keep continuous transmission
    application: 'voip',
    maxBandwidth: 'wideband',
    signal: 'voice'
  }
};

/**
 * RTP payload type for Opus (RFC 7587)
 */
export const OPUS_PAYLOAD_TYPE = 111;

/**
 * Opus configuration builder
 */
export class OpusConfig {
  constructor(preset = 'STANDARD') {
    // Apply preset
    const presetConfig = OpusPresets[preset] || OpusPresets.STANDARD;
    Object.assign(this, presetConfig);
  }

  /**
   * Set sample rate
   * @param {number} sampleRate - Sample rate (8000, 12000, 16000, 24000, 48000)
   * @returns {OpusConfig} this
   */
  setSampleRate(sampleRate) {
    const validRates = [8000, 12000, 16000, 24000, 48000];
    if (!validRates.includes(sampleRate)) {
      throw new Error(`Invalid sample rate. Must be one of: ${validRates.join(', ')}`);
    }
    this.sampleRate = sampleRate;
    return this;
  }

  /**
   * Set bitrate
   * @param {number} bitrate - Bitrate in bps (6000-510000)
   * @returns {OpusConfig} this
   */
  setBitrate(bitrate) {
    if (bitrate < 6000 || bitrate > 510000) {
      throw new Error('Bitrate must be between 6000 and 510000 bps');
    }
    this.bitrate = bitrate;
    return this;
  }

  /**
   * Set complexity
   * @param {number} complexity - Computational complexity (0-10)
   * @returns {OpusConfig} this
   */
  setComplexity(complexity) {
    if (complexity < 0 || complexity > 10) {
      throw new Error('Complexity must be between 0 and 10');
    }
    this.complexity = complexity;
    return this;
  }

  /**
   * Set frame size
   * @param {number} frameSize - Frame size in ms (2.5, 5, 10, 20, 40, 60)
   * @returns {OpusConfig} this
   */
  setFrameSize(frameSize) {
    const validSizes = [2.5, 5, 10, 20, 40, 60];
    if (!validSizes.includes(frameSize)) {
      throw new Error(`Invalid frame size. Must be one of: ${validSizes.join(', ')}`);
    }
    this.frameSize = frameSize;
    return this;
  }

  /**
   * Enable/disable FEC
   * @param {boolean} enabled - Enable FEC
   * @returns {OpusConfig} this
   */
  setFEC(enabled) {
    this.useFEC = enabled;
    return this;
  }

  /**
   * Enable/disable DTX
   * @param {boolean} enabled - Enable DTX
   * @returns {OpusConfig} this
   */
  setDTX(enabled) {
    this.useDTX = enabled;
    return this;
  }

  /**
   * Set expected packet loss percentage
   * @param {number} percentage - Packet loss percentage (0-100)
   * @returns {OpusConfig} this
   */
  setPacketLoss(percentage) {
    if (percentage < 0 || percentage > 100) {
      throw new Error('Packet loss percentage must be between 0 and 100');
    }
    this.packetLossPerc = percentage;
    return this;
  }

  /**
   * Set bandwidth
   * @param {string} bandwidth - Bandwidth ('narrowband', 'mediumband', 'wideband', 'superwideband', 'fullband')
   * @returns {OpusConfig} this
   */
  setBandwidth(bandwidth) {
    const validBandwidths = ['narrowband', 'mediumband', 'wideband', 'superwideband', 'fullband'];
    if (!validBandwidths.includes(bandwidth)) {
      throw new Error(`Invalid bandwidth. Must be one of: ${validBandwidths.join(', ')}`);
    }
    this.maxBandwidth = bandwidth;
    return this;
  }

  /**
   * Get frame size in samples
   * @returns {number} Number of samples per frame
   */
  getFrameSizeInSamples() {
    return Math.floor((this.sampleRate * this.frameSize) / 1000);
  }

  /**
   * Get packet duration in milliseconds
   * @returns {number} Packet duration in ms
   */
  getPacketDuration() {
    return this.frameSize;
  }

  /**
   * Get recommended jitter buffer size
   * @returns {number} Jitter buffer size in ms
   */
  getRecommendedJitterBuffer() {
    // Recommended: 2-4 packets worth of buffering
    return this.frameSize * 3;
  }

  /**
   * Export configuration object
   * @returns {object} Configuration object
   */
  toObject() {
    return {
      sampleRate: this.sampleRate,
      channels: this.channels,
      bitrate: this.bitrate,
      complexity: this.complexity,
      frameSize: this.frameSize,
      packetLossPerc: this.packetLossPerc,
      useFEC: this.useFEC,
      useDTX: this.useDTX,
      application: this.application,
      maxBandwidth: this.maxBandwidth,
      signal: this.signal
    };
  }

  /**
   * Get RTP clock rate for Opus
   * @returns {number} Clock rate (always 48000 for Opus)
   */
  static getClockRate() {
    return 48000;
  }

  /**
   * Get RTP payload type
   * @returns {number} Payload type
   */
  static getPayloadType() {
    return OPUS_PAYLOAD_TYPE;
  }
}

/**
 * Create Opus configuration from preset
 * @param {string} preset - Preset name
 * @returns {object} Configuration object
 */
export function createOpusConfig(preset = 'STANDARD') {
  const config = new OpusConfig(preset);
  return config.toObject();
}

export default { OpusConfig, OpusPresets, createOpusConfig, OPUS_PAYLOAD_TYPE };
