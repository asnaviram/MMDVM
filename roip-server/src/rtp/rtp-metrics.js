/**
 * RTP Metrics Collection and Monitoring
 *
 * Implements comprehensive RTP stream metrics according to RFC 3550
 * for real-time monitoring and quality assessment.
 *
 * @module rtp-metrics
 */

/**
 * RTP Stream Metrics
 * Tracks quality metrics for an RTP stream
 */
export class RTPMetrics {
  constructor(options = {}) {
    this.ssrc = options.ssrc || 0;
    this.sampleRate = options.sampleRate || 48000;

    // Packet counters
    this.packetsReceived = 0;
    this.packetsExpected = 0;
    this.packetsLost = 0;
    this.packetsDiscarded = 0;
    this.packetsDuplicate = 0;
    this.packetsOutOfOrder = 0;

    // Byte counters
    this.bytesReceived = 0;

    // Sequence tracking
    this.highestSequence = 0;
    this.lastSequence = null;
    this.baseSequence = null;
    this.sequenceCycles = 0;

    // Timing
    this.lastPacketTime = 0;
    this.lastTransit = 0;
    this.startTime = Date.now();

    // Jitter (RFC 3550)
    this.jitter = 0;
    this.jitterSum = 0;
    this.jitterCount = 0;
    this.maxJitter = 0;
    this.minJitter = Infinity;

    // Round-trip time (if RTCP available)
    this.rtt = 0;
    this.rttSamples = [];
    this.maxRTTSamples = 100;

    // Bitrate calculation
    this.bitrateWindow = [];
    this.bitrateWindowSize = 10;  // 10 samples
    this.bitrateInterval = 1000;  // 1 second
    this.lastBitrateTime = Date.now();
    this.lastBitrateBytes = 0;

    // Quality metrics
    this.qualityScore = 100;  // MOS-like score (0-100)
  }

  /**
   * Update metrics with received packet
   * @param {object} packet - RTP packet
   */
  update(packet) {
    const now = Date.now();

    // Initialize sequence tracking
    if (this.baseSequence === null) {
      this.baseSequence = packet.sequenceNumber;
      this.lastSequence = packet.sequenceNumber - 1;
      this.highestSequence = packet.sequenceNumber;
    }

    // Update counters
    this.packetsReceived++;
    this.bytesReceived += packet.payloadLength || 0;
    this.lastPacketTime = now;

    // Sequence number analysis
    this.updateSequence(packet.sequenceNumber);

    // Jitter calculation (RFC 3550)
    this.updateJitter(packet, now);

    // Bitrate calculation
    this.updateBitrate(now);

    // Quality score
    this.updateQualityScore();
  }

  /**
   * Update sequence number tracking
   * @private
   * @param {number} sequence - RTP sequence number
   */
  updateSequence(sequence) {
    // Calculate sequence difference (handling wrap-around)
    const seqDiff = this.getSequenceDiff(sequence, this.lastSequence);

    if (seqDiff === 1) {
      // Expected packet
      this.highestSequence = sequence;
    } else if (seqDiff > 1) {
      // Packet loss detected
      const lossCount = seqDiff - 1;
      this.packetsLost += lossCount;
      this.highestSequence = sequence;
    } else if (seqDiff <= 0) {
      // Out of order or duplicate
      if (seqDiff === 0) {
        this.packetsDuplicate++;
      } else {
        this.packetsOutOfOrder++;
      }
      return;  // Don't update lastSequence
    }

    // Handle sequence number wrap-around
    if (sequence < this.lastSequence && this.lastSequence - sequence > 30000) {
      this.sequenceCycles++;
    }

    this.lastSequence = sequence;

    // Calculate expected packets
    this.packetsExpected = this.getExtendedSequence() - this.baseSequence + 1;
  }

  /**
   * Get extended sequence number (handling cycles)
   * @private
   * @returns {number} Extended sequence number
   */
  getExtendedSequence() {
    return this.sequenceCycles * 65536 + this.highestSequence;
  }

  /**
   * Update jitter calculation (RFC 3550)
   * @private
   * @param {object} packet - RTP packet
   * @param {number} arrivalTime - Packet arrival time
   */
  updateJitter(packet, arrivalTime) {
    if (!packet.timestamp) return;

    // Convert RTP timestamp to milliseconds
    const rtpTime = (packet.timestamp / this.sampleRate) * 1000;

    // Calculate transit time
    const transit = arrivalTime - rtpTime;

    if (this.lastTransit !== 0) {
      // Calculate jitter (RFC 3550 formula)
      const d = Math.abs(transit - this.lastTransit);
      this.jitter += (d - this.jitter) / 16.0;

      // Track statistics
      this.jitterSum += d;
      this.jitterCount++;
      this.maxJitter = Math.max(this.maxJitter, d);
      this.minJitter = Math.min(this.minJitter, d);
    }

    this.lastTransit = transit;
  }

  /**
   * Update bitrate calculation
   * @private
   * @param {number} now - Current time
   */
  updateBitrate(now) {
    const elapsed = now - this.lastBitrateTime;

    if (elapsed >= this.bitrateInterval) {
      const bytesInInterval = this.bytesReceived - this.lastBitrateBytes;
      const bitrate = (bytesInInterval * 8) / (elapsed / 1000);

      this.bitrateWindow.push(bitrate);
      if (this.bitrateWindow.length > this.bitrateWindowSize) {
        this.bitrateWindow.shift();
      }

      this.lastBitrateTime = now;
      this.lastBitrateBytes = this.bytesReceived;
    }
  }

  /**
   * Update quality score based on packet loss and jitter
   * @private
   */
  updateQualityScore() {
    // Calculate packet loss rate
    const lossRate = this.getPacketLossRate();

    // Quality degradation factors
    let score = 100;

    // Packet loss impact (exponential)
    score -= lossRate * 200;  // 1% loss = -2 points

    // Jitter impact
    const jitterMs = this.jitter;
    if (jitterMs > 30) {
      score -= (jitterMs - 30) * 0.5;  // Penalize jitter > 30ms
    }

    // Out of order packets impact
    const oooRate = this.packetsReceived > 0
      ? this.packetsOutOfOrder / this.packetsReceived
      : 0;
    score -= oooRate * 50;

    this.qualityScore = Math.max(0, Math.min(100, score));
  }

  /**
   * Record packet discard
   */
  recordDiscard() {
    this.packetsDiscarded++;
  }

  /**
   * Update RTT from RTCP
   * @param {number} rtt - Round-trip time in milliseconds
   */
  updateRTT(rtt) {
    this.rtt = rtt;
    this.rttSamples.push(rtt);

    if (this.rttSamples.length > this.maxRTTSamples) {
      this.rttSamples.shift();
    }
  }

  /**
   * Get packet loss rate
   * @returns {number} Loss rate (0.0 - 1.0)
   */
  getPacketLossRate() {
    if (this.packetsExpected === 0) return 0;
    return this.packetsLost / this.packetsExpected;
  }

  /**
   * Get current bitrate
   * @returns {number} Bitrate in bps
   */
  getBitrate() {
    if (this.bitrateWindow.length === 0) {
      const duration = (Date.now() - this.startTime) / 1000;
      return duration > 0 ? (this.bytesReceived * 8) / duration : 0;
    }

    // Return average of window
    const sum = this.bitrateWindow.reduce((a, b) => a + b, 0);
    return sum / this.bitrateWindow.length;
  }

  /**
   * Get average jitter
   * @returns {number} Average jitter in ms
   */
  getAverageJitter() {
    return this.jitterCount > 0 ? this.jitterSum / this.jitterCount : 0;
  }

  /**
   * Get average RTT
   * @returns {number} Average RTT in ms
   */
  getAverageRTT() {
    if (this.rttSamples.length === 0) return 0;
    const sum = this.rttSamples.reduce((a, b) => a + b, 0);
    return sum / this.rttSamples.length;
  }

  /**
   * Get sequence difference handling wrap-around
   * @private
   * @param {number} seq1 - First sequence number
   * @param {number} seq2 - Second sequence number
   * @returns {number} Difference (seq1 - seq2)
   */
  getSequenceDiff(seq1, seq2) {
    const diff = seq1 - seq2;
    if (diff > 32768) {
      return diff - 65536;
    } else if (diff < -32768) {
      return diff + 65536;
    }
    return diff;
  }

  /**
   * Get comprehensive statistics
   * @returns {object} Statistics object
   */
  getStats() {
    const duration = (Date.now() - this.startTime) / 1000;
    const lossRate = this.getPacketLossRate();

    return {
      // Packet statistics
      packetsReceived: this.packetsReceived,
      packetsExpected: this.packetsExpected,
      packetsLost: this.packetsLost,
      packetsDiscarded: this.packetsDiscarded,
      packetsDuplicate: this.packetsDuplicate,
      packetsOutOfOrder: this.packetsOutOfOrder,

      // Loss metrics
      lossRate: (lossRate * 100).toFixed(2) + '%',
      lossRateDecimal: lossRate,

      // Jitter metrics
      jitterMs: this.jitter.toFixed(2),
      jitterAvg: this.getAverageJitter().toFixed(2),
      jitterMin: this.minJitter === Infinity ? 0 : this.minJitter.toFixed(2),
      jitterMax: this.maxJitter.toFixed(2),

      // Bitrate metrics
      bitrateKbps: (this.getBitrate() / 1000).toFixed(2),
      bytesReceived: this.bytesReceived,

      // RTT metrics
      rttMs: this.rtt.toFixed(2),
      rttAvg: this.getAverageRTT().toFixed(2),

      // Quality metrics
      qualityScore: this.qualityScore.toFixed(1),

      // Timing
      duration: duration.toFixed(2),
      lastPacketTime: this.lastPacketTime,

      // Sequence
      highestSequence: this.highestSequence,
      sequenceCycles: this.sequenceCycles
    };
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.packetsReceived = 0;
    this.packetsExpected = 0;
    this.packetsLost = 0;
    this.packetsDiscarded = 0;
    this.packetsDuplicate = 0;
    this.packetsOutOfOrder = 0;
    this.bytesReceived = 0;
    this.highestSequence = 0;
    this.lastSequence = null;
    this.baseSequence = null;
    this.sequenceCycles = 0;
    this.lastPacketTime = 0;
    this.lastTransit = 0;
    this.startTime = Date.now();
    this.jitter = 0;
    this.jitterSum = 0;
    this.jitterCount = 0;
    this.maxJitter = 0;
    this.minJitter = Infinity;
    this.rtt = 0;
    this.rttSamples = [];
    this.bitrateWindow = [];
    this.lastBitrateTime = Date.now();
    this.lastBitrateBytes = 0;
    this.qualityScore = 100;
  }
}

export default RTPMetrics;
