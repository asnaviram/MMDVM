/**
 * Packet Pool and Buffer Pool for RTP Performance Optimization
 *
 * Implements object pooling to reduce garbage collection pressure
 * and improve memory allocation performance.
 *
 * @module packet-pool
 */

/**
 * RTP Packet object for pooling
 */
export class PooledRTPPacket {
  constructor() {
    this.buffer = null;
    this.version = 0;
    this.padding = 0;
    this.extension = 0;
    this.csrcCount = 0;
    this.marker = 0;
    this.payloadType = 0;
    this.sequenceNumber = 0;
    this.timestamp = 0;
    this.ssrc = 0;
    this.payload = null;
    this.payloadLength = 0;
    this.arrivalTime = 0;
  }

  /**
   * Parse RTP packet from buffer (in-place)
   * @param {Buffer} buffer - Raw RTP packet data
   */
  parse(buffer) {
    if (buffer.length < 12) {
      throw new Error('RTP packet too short');
    }

    this.buffer = buffer;
    this.arrivalTime = Date.now();

    // First byte: V(2), P(1), X(1), CC(4)
    const byte0 = buffer[0];
    this.version = (byte0 >> 6) & 0x3;
    this.padding = (byte0 >> 5) & 0x1;
    this.extension = (byte0 >> 4) & 0x1;
    this.csrcCount = byte0 & 0xF;

    // Second byte: M(1), PT(7)
    const byte1 = buffer[1];
    this.marker = (byte1 >> 7) & 0x1;
    this.payloadType = byte1 & 0x7F;

    // Sequence number
    this.sequenceNumber = buffer.readUInt16BE(2);

    // Timestamp
    this.timestamp = buffer.readUInt32BE(4);

    // SSRC
    this.ssrc = buffer.readUInt32BE(8);

    // Calculate header length
    let headerLength = 12 + (this.csrcCount * 4);

    // Parse extension if present
    if (this.extension) {
      if (headerLength + 4 > buffer.length) {
        throw new Error('RTP extension header incomplete');
      }
      const extLength = buffer.readUInt16BE(headerLength + 2);
      headerLength += 4 + (extLength * 4);
    }

    // Payload
    this.payload = buffer.slice(headerLength);
    this.payloadLength = this.payload.length;
  }

  /**
   * Reset packet for reuse
   */
  reset() {
    this.buffer = null;
    this.version = 0;
    this.padding = 0;
    this.extension = 0;
    this.csrcCount = 0;
    this.marker = 0;
    this.payloadType = 0;
    this.sequenceNumber = 0;
    this.timestamp = 0;
    this.ssrc = 0;
    this.payload = null;
    this.payloadLength = 0;
    this.arrivalTime = 0;
  }
}

/**
 * Packet Pool for object reuse
 * Reduces GC pressure by reusing packet objects
 */
export class PacketPool {
  constructor(maxSize = 1000) {
    this.pool = [];
    this.maxSize = maxSize;
    this.stats = {
      acquires: 0,
      releases: 0,
      allocations: 0,
      poolHits: 0
    };
  }

  /**
   * Acquire a packet from the pool
   * @returns {PooledRTPPacket} Packet object
   */
  acquire() {
    this.stats.acquires++;

    if (this.pool.length > 0) {
      this.stats.poolHits++;
      return this.pool.pop();
    }

    this.stats.allocations++;
    return new PooledRTPPacket();
  }

  /**
   * Release a packet back to the pool
   * @param {PooledRTPPacket} packet - Packet to release
   */
  release(packet) {
    if (!packet) return;

    packet.reset();
    this.stats.releases++;

    if (this.pool.length < this.maxSize) {
      this.pool.push(packet);
    }
  }

  /**
   * Get pool statistics
   * @returns {object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      poolSize: this.pool.length,
      hitRate: this.stats.acquires > 0
        ? (this.stats.poolHits / this.stats.acquires * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Clear the pool
   */
  clear() {
    this.pool = [];
  }
}

/**
 * Buffer Pool for pre-allocated buffers
 * Reduces memory allocation overhead
 */
export class BufferPool {
  constructor(poolSize = 2000, bufferSize = 2048) {
    this.poolSize = poolSize;
    this.bufferSize = bufferSize;
    this.pool = [];
    this.stats = {
      acquires: 0,
      releases: 0,
      allocations: 0,
      poolHits: 0
    };

    // Pre-allocate buffers
    for (let i = 0; i < poolSize; i++) {
      this.pool.push(Buffer.allocUnsafe(bufferSize));
    }
  }

  /**
   * Acquire a buffer from the pool
   * @param {number} size - Required buffer size (optional)
   * @returns {Buffer} Buffer object
   */
  acquire(size = this.bufferSize) {
    this.stats.acquires++;

    if (size <= this.bufferSize && this.pool.length > 0) {
      this.stats.poolHits++;
      return this.pool.pop();
    }

    // Allocate new buffer if pool is empty or size exceeds pool buffer size
    this.stats.allocations++;
    return Buffer.allocUnsafe(size);
  }

  /**
   * Release a buffer back to the pool
   * @param {Buffer} buffer - Buffer to release
   */
  release(buffer) {
    if (!buffer) return;

    this.stats.releases++;

    // Only accept buffers of the correct size
    if (buffer.length === this.bufferSize && this.pool.length < this.poolSize) {
      this.pool.push(buffer);
    }
  }

  /**
   * Get pool statistics
   * @returns {object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      poolSize: this.pool.length,
      maxPoolSize: this.poolSize,
      bufferSize: this.bufferSize,
      hitRate: this.stats.acquires > 0
        ? (this.stats.poolHits / this.stats.acquires * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Clear the pool
   */
  clear() {
    this.pool = [];
  }
}

/**
 * Fast lookup map optimized for RTP streams
 */
export class FastStreamMap {
  constructor() {
    this.streamMap = new Map();  // sessionId -> stream
    this.portMap = new Map();    // port -> stream
    this.ssrcMap = new Map();    // ssrc -> stream
  }

  /**
   * Add stream to all indexes
   * @param {string} streamId - Stream identifier
   * @param {object} stream - Stream object
   */
  add(streamId, stream) {
    this.streamMap.set(streamId, stream);
    if (stream.localPort) {
      this.portMap.set(stream.localPort, stream);
    }
    if (stream.ssrc) {
      this.ssrcMap.set(stream.ssrc, stream);
    }
  }

  /**
   * Remove stream from all indexes
   * @param {string} streamId - Stream identifier
   */
  remove(streamId) {
    const stream = this.streamMap.get(streamId);
    if (!stream) return;

    this.streamMap.delete(streamId);
    if (stream.localPort) {
      this.portMap.delete(stream.localPort);
    }
    if (stream.ssrc) {
      this.ssrcMap.delete(stream.ssrc);
    }
  }

  /**
   * Get stream by ID
   * @param {string} streamId - Stream identifier
   * @returns {object|null} Stream object
   */
  getById(streamId) {
    return this.streamMap.get(streamId) || null;
  }

  /**
   * Get stream by port
   * @param {number} port - Port number
   * @returns {object|null} Stream object
   */
  getByPort(port) {
    return this.portMap.get(port) || null;
  }

  /**
   * Get stream by SSRC
   * @param {number} ssrc - SSRC identifier
   * @returns {object|null} Stream object
   */
  getBySSRC(ssrc) {
    return this.ssrcMap.get(ssrc) || null;
  }

  /**
   * Get all streams
   * @returns {Array} Array of streams
   */
  getAll() {
    return Array.from(this.streamMap.values());
  }

  /**
   * Get stream count
   * @returns {number} Number of streams
   */
  size() {
    return this.streamMap.size;
  }

  /**
   * Clear all maps
   */
  clear() {
    this.streamMap.clear();
    this.portMap.clear();
    this.ssrcMap.clear();
  }
}

export default { PacketPool, BufferPool, FastStreamMap, PooledRTPPacket };
