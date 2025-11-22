/**
 * UDP Socket Optimization for RTP
 *
 * Implements:
 * - Batch packet sending
 * - Optimized socket configuration
 * - Send queue management
 *
 * @module udp-optimization
 */

import dgram from 'dgram';

/**
 * Batch Sender for UDP packets
 * Reduces syscall overhead by batching sends
 */
export class BatchSender {
  constructor(socket, options = {}) {
    this.socket = socket;
    this.queue = [];
    this.timer = null;
    this.batchSize = options.batchSize || 10;
    this.maxLatency = options.maxLatency || 1; // ms
    this.stats = {
      packetsSent: 0,
      batchesSent: 0,
      errors: 0,
      avgBatchSize: 0
    };
  }

  /**
   * Queue packet for sending
   * @param {Buffer} packet - Packet data
   * @param {number} port - Destination port
   * @param {string} address - Destination address
   * @param {Function} callback - Optional callback
   */
  send(packet, port, address, callback) {
    this.queue.push({ packet, port, address, callback });

    // Flush immediately if batch size reached
    if (this.queue.length >= this.batchSize) {
      this.flush();
    } else if (!this.timer) {
      // Schedule flush with minimal latency
      this.timer = setImmediate(() => {
        this.flush();
      });
    }
  }

  /**
   * Flush queued packets
   */
  flush() {
    if (this.timer) {
      clearImmediate(this.timer);
      this.timer = null;
    }

    if (this.queue.length === 0) {
      return;
    }

    const batch = this.queue;
    this.queue = [];
    const batchSize = batch.length;

    // Send all queued packets
    for (const { packet, port, address, callback } of batch) {
      this.socket.send(packet, port, address, (err) => {
        if (err) {
          this.stats.errors++;
        } else {
          this.stats.packetsSent++;
        }
        if (callback) {
          callback(err);
        }
      });
    }

    // Update statistics
    this.stats.batchesSent++;
    this.stats.avgBatchSize =
      (this.stats.avgBatchSize * (this.stats.batchesSent - 1) + batchSize) /
      this.stats.batchesSent;
  }

  /**
   * Get sender statistics
   * @returns {object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      queueSize: this.queue.length,
      avgBatchSize: this.stats.avgBatchSize.toFixed(2)
    };
  }

  /**
   * Destroy sender and clear queue
   */
  destroy() {
    if (this.timer) {
      clearImmediate(this.timer);
      this.timer = null;
    }
    this.queue = [];
  }
}

/**
 * Create optimized UDP socket
 * @param {object} options - Socket options
 * @returns {object} Socket and sender
 */
export function createOptimizedSocket(options = {}) {
  const socket = dgram.createSocket({
    type: options.type || 'udp4',
    reuseAddr: options.reuseAddr !== false,
    recvBufferSize: options.recvBufferSize || 2 * 1024 * 1024,  // 2MB
    sendBufferSize: options.sendBufferSize || 2 * 1024 * 1024   // 2MB
  });

  // Create batch sender
  const sender = new BatchSender(socket, {
    batchSize: options.batchSize,
    maxLatency: options.maxLatency
  });

  // Wrap send method
  const originalSend = socket.send.bind(socket);
  socket.send = function(packet, port, address, callback) {
    if (options.enableBatching !== false) {
      sender.send(packet, port, address, callback);
    } else {
      originalSend(packet, port, address, callback);
    }
  };

  // Add sender reference
  socket.batchSender = sender;

  return { socket, sender };
}

/**
 * Optimized socket configuration helper
 * @param {dgram.Socket} socket - UDP socket
 * @param {object} options - Configuration options
 */
export function optimizeSocket(socket, options = {}) {
  // Set buffer sizes if socket supports it
  try {
    const recvBufferSize = options.recvBufferSize || 2 * 1024 * 1024;
    const sendBufferSize = options.sendBufferSize || 2 * 1024 * 1024;

    if (typeof socket.setRecvBufferSize === 'function') {
      socket.setRecvBufferSize(recvBufferSize);
    }

    if (typeof socket.setSendBufferSize === 'function') {
      socket.setSendBufferSize(sendBufferSize);
    }
  } catch (err) {
    // Buffer size configuration may not be supported
    console.warn('Could not set socket buffer sizes:', err.message);
  }

  // Set socket options
  if (options.broadcast) {
    socket.setBroadcast(true);
  }

  if (options.ttl) {
    socket.setTTL(options.ttl);
  }

  if (options.multicastTTL) {
    socket.setMulticastTTL(options.multicastTTL);
  }

  if (options.multicastInterface) {
    socket.setMulticastInterface(options.multicastInterface);
  }
}

export default { BatchSender, createOptimizedSocket, optimizeSocket };
