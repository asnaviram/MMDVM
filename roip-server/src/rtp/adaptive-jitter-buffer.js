/**
 * Adaptive Jitter Buffer for RTP
 *
 * Implements an adaptive jitter buffer with dynamic delay adjustment
 * based on network conditions and packet arrival patterns.
 *
 * @module adaptive-jitter-buffer
 */

/**
 * Priority queue for packet ordering by sequence number
 */
class PriorityQueue {
  constructor() {
    this.items = [];
  }

  /**
   * Add item to queue with priority
   * @param {*} item - Item to add
   * @param {number} priority - Priority value (lower = higher priority)
   */
  enqueue(item, priority) {
    const element = { item, priority };
    let added = false;

    for (let i = 0; i < this.items.length; i++) {
      if (element.priority < this.items[i].priority) {
        this.items.splice(i, 0, element);
        added = true;
        break;
      }
    }

    if (!added) {
      this.items.push(element);
    }
  }

  /**
   * Remove and return highest priority item
   * @returns {*} Item with highest priority
   */
  dequeue() {
    if (this.isEmpty()) return null;
    return this.items.shift().item;
  }

  /**
   * Get highest priority item without removing
   * @returns {*} Item with highest priority
   */
  peek() {
    if (this.isEmpty()) return null;
    return this.items[0].item;
  }

  /**
   * Check if queue is empty
   * @returns {boolean} True if empty
   */
  isEmpty() {
    return this.items.length === 0;
  }

  /**
   * Get queue size
   * @returns {number} Number of items
   */
  size() {
    return this.items.length;
  }

  /**
   * Clear the queue
   */
  clear() {
    this.items = [];
  }
}

/**
 * Adaptive Jitter Buffer
 * Dynamically adjusts delay based on network jitter
 */
export class AdaptiveJitterBuffer {
  constructor(options = {}) {
    // Configuration
    this.minDelay = options.minDelay || 20;        // ms
    this.maxDelay = options.maxDelay || 200;       // ms
    this.targetDelay = options.targetDelay || 60;  // ms
    this.currentDelay = this.targetDelay;

    // Buffer management
    this.buffer = new PriorityQueue();
    this.maxBufferSize = options.maxBufferSize || 200;

    // Sequence tracking
    this.expectedSequence = null;
    this.highestSequence = null;

    // Jitter calculation (RFC 3550)
    this.jitter = 0;
    this.lastTransit = 0;
    this.lastArrivalTime = 0;

    // Packet loss tracking
    this.packetsReceived = 0;
    this.packetsLost = 0;
    this.packetsDiscarded = 0;
    this.packetsRetrieved = 0;
    this.consecutiveLosses = 0;

    // Latency tracking
    this.arrivalTimes = [];
    this.maxLatencySamples = 100;

    // Adaptive algorithm parameters
    this.jitterWindow = [];
    this.jitterWindowSize = 20;
    this.adjustmentInterval = 1000; // ms
    this.lastAdjustmentTime = Date.now();

    // Statistics
    this.stats = {
      currentDelay: this.currentDelay,
      jitter: 0,
      lossRate: 0,
      bufferUtilization: 0,
      discardRate: 0
    };
  }

  /**
   * Add packet to jitter buffer
   * @param {object} packet - RTP packet object
   * @returns {boolean} True if added successfully
   */
  addPacket(packet) {
    const now = Date.now();

    // Initialize sequence tracking
    if (this.expectedSequence === null) {
      this.expectedSequence = packet.sequenceNumber;
      this.highestSequence = packet.sequenceNumber;
    }

    // Check for buffer overflow
    if (this.buffer.size() >= this.maxBufferSize) {
      this.packetsDiscarded++;
      return false;
    }

    // Update highest sequence
    const seqDiff = this.getSequenceDiff(packet.sequenceNumber, this.highestSequence);
    if (seqDiff > 0) {
      this.highestSequence = packet.sequenceNumber;
    }

    // Calculate jitter (RFC 3550 formula)
    this.updateJitter(packet, now);

    // Store arrival time
    this.arrivalTimes.push({
      sequence: packet.sequenceNumber,
      time: now,
      timestamp: packet.timestamp
    });

    if (this.arrivalTimes.length > this.maxLatencySamples) {
      this.arrivalTimes.shift();
    }

    // Add to buffer with sequence as priority
    this.buffer.enqueue({
      packet,
      arrivalTime: now
    }, packet.sequenceNumber);

    this.packetsReceived++;

    // Periodically adjust buffer delay
    if (now - this.lastAdjustmentTime > this.adjustmentInterval) {
      this.adjustDelay();
      this.lastAdjustmentTime = now;
    }

    return true;
  }

  /**
   * Get next packet from buffer if ready
   * @returns {object|null} Packet object or null if not ready
   */
  getPacket() {
    const now = Date.now();
    const item = this.buffer.peek();

    if (!item) {
      return null;
    }

    // Check if packet has waited long enough
    const waitTime = now - item.arrivalTime;
    if (waitTime >= this.currentDelay) {
      this.buffer.dequeue();
      this.packetsRetrieved++;

      // Check for packet loss
      if (item.packet.sequenceNumber !== this.expectedSequence) {
        const lossCount = this.getSequenceDiff(item.packet.sequenceNumber, this.expectedSequence);
        this.packetsLost += lossCount;
        this.consecutiveLosses += lossCount;
      } else {
        this.consecutiveLosses = 0;
      }

      // Update expected sequence
      this.expectedSequence = (item.packet.sequenceNumber + 1) & 0xFFFF;

      return item.packet;
    }

    return null;
  }

  /**
   * Update jitter calculation
   * @private
   * @param {object} packet - RTP packet
   * @param {number} arrivalTime - Packet arrival time
   */
  updateJitter(packet, arrivalTime) {
    if (this.lastArrivalTime === 0) {
      this.lastArrivalTime = arrivalTime;
      this.lastTransit = arrivalTime - packet.timestamp;
      return;
    }

    // Calculate interarrival jitter (RFC 3550)
    const transit = arrivalTime - packet.timestamp;
    const d = Math.abs(transit - this.lastTransit);
    this.jitter += (d - this.jitter) / 16.0;
    this.lastTransit = transit;
    this.lastArrivalTime = arrivalTime;

    // Add to jitter window for adaptive algorithm
    this.jitterWindow.push(d);
    if (this.jitterWindow.length > this.jitterWindowSize) {
      this.jitterWindow.shift();
    }
  }

  /**
   * Adjust buffer delay based on network conditions
   * @private
   */
  adjustDelay() {
    if (this.jitterWindow.length < this.jitterWindowSize / 2) {
      return; // Not enough data
    }

    // Calculate statistics from jitter window
    const avgJitter = this.jitterWindow.reduce((a, b) => a + b, 0) / this.jitterWindow.length;
    const maxJitter = Math.max(...this.jitterWindow);

    // Calculate packet loss rate
    const totalPackets = this.packetsReceived + this.packetsLost;
    const lossRate = totalPackets > 0 ? this.packetsLost / totalPackets : 0;

    // Calculate buffer utilization
    const bufferUtilization = this.buffer.size() / this.maxBufferSize;

    // Adaptive delay adjustment
    const jitterThreshold = this.currentDelay * 0.8;
    const lowJitterThreshold = this.currentDelay * 0.3;

    if (maxJitter > jitterThreshold || lossRate > 0.05) {
      // High jitter or packet loss - increase delay
      this.currentDelay = Math.min(this.currentDelay + 10, this.maxDelay);
    } else if (maxJitter < lowJitterThreshold && lossRate < 0.01 && bufferUtilization < 0.3) {
      // Low jitter and low loss - decrease delay
      this.currentDelay = Math.max(this.currentDelay - 5, this.minDelay);
    } else if (bufferUtilization > 0.8) {
      // Buffer filling up - decrease delay to drain faster
      this.currentDelay = Math.max(this.currentDelay - 5, this.minDelay);
    }

    // Update statistics
    this.stats.currentDelay = this.currentDelay;
    this.stats.jitter = this.jitter;
    this.stats.lossRate = lossRate;
    this.stats.bufferUtilization = bufferUtilization;
    this.stats.discardRate = totalPackets > 0 ? this.packetsDiscarded / totalPackets : 0;
  }

  /**
   * Get sequence number difference handling wrap-around
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
   * Get buffer statistics
   * @returns {object} Statistics
   */
  getStats() {
    const totalPackets = this.packetsReceived + this.packetsLost;
    return {
      ...this.stats,
      packetsReceived: this.packetsReceived,
      packetsLost: this.packetsLost,
      packetsDiscarded: this.packetsDiscarded,
      packetsRetrieved: this.packetsRetrieved,
      consecutiveLosses: this.consecutiveLosses,
      bufferSize: this.buffer.size(),
      lossRate: totalPackets > 0 ? (this.packetsLost / totalPackets * 100).toFixed(2) + '%' : '0%',
      jitterMs: this.jitter.toFixed(2)
    };
  }

  /**
   * Reset buffer
   */
  reset() {
    this.buffer.clear();
    this.expectedSequence = null;
    this.highestSequence = null;
    this.jitter = 0;
    this.lastTransit = 0;
    this.lastArrivalTime = 0;
    this.packetsReceived = 0;
    this.packetsLost = 0;
    this.packetsDiscarded = 0;
    this.packetsRetrieved = 0;
    this.consecutiveLosses = 0;
    this.arrivalTimes = [];
    this.jitterWindow = [];
    this.currentDelay = this.targetDelay;
  }

  /**
   * Clear buffer
   */
  clear() {
    this.buffer.clear();
  }

  /**
   * Get current buffer size
   * @returns {number} Number of packets in buffer
   */
  size() {
    return this.buffer.size();
  }
}

export default AdaptiveJitterBuffer;
