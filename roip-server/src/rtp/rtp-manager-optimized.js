/**
 * Optimized RTP Manager for RoIP Server
 *
 * High-performance RTP stream management with:
 * - Packet and buffer pooling
 * - Adaptive jitter buffering
 * - Optimized audio mixing
 * - Batch UDP sending
 * - Real-time metrics
 * - Packet loss concealment
 *
 * @module rtp-manager-optimized
 */

import { EventEmitter } from 'events';
import { PacketPool, BufferPool, FastStreamMap } from './packet-pool.js';
import { AdaptiveJitterBuffer } from './adaptive-jitter-buffer.js';
import { OptimizedAudioMixer } from './audio-mixer.js';
import { createOptimizedSocket } from './udp-optimization.js';
import { RTPMetrics } from './rtp-metrics.js';
import { PacketLossConcealment } from './packet-loss-concealment.js';
import { AudioProcessor } from './audio-processor.js';
import { OpusConfig, OPUS_PAYLOAD_TYPE } from './opus-config.js';

/**
 * Optimized RTP Stream
 */
class OptimizedRTPStream {
  constructor(streamId, remoteAddress, remotePort, ssrc, localPort, options = {}) {
    this.streamId = streamId;
    this.remoteAddress = remoteAddress;
    this.remotePort = remotePort;
    this.ssrc = ssrc;
    this.localPort = localPort;
    this.sequenceNumber = Math.floor(Math.random() * 65536);
    this.timestamp = Math.floor(Math.random() * 0x100000000);

    // Optimized components
    this.jitterBuffer = new AdaptiveJitterBuffer({
      minDelay: options.minJitterDelay || 20,
      maxDelay: options.maxJitterDelay || 200,
      targetDelay: options.targetJitterDelay || 60
    });

    this.metrics = new RTPMetrics({
      ssrc: this.ssrc,
      sampleRate: options.sampleRate || 48000
    });

    this.plc = new PacketLossConcealment({
      frameSize: options.frameSize || 960,
      sampleRate: options.sampleRate || 48000
    });

    // State
    this.active = true;
    this.createdTime = Date.now();
    this.lastActivityTime = Date.now();
  }

  /**
   * Get next sequence number
   */
  getNextSequenceNumber() {
    const seq = this.sequenceNumber;
    this.sequenceNumber = (this.sequenceNumber + 1) & 0xFFFF;
    return seq;
  }

  /**
   * Update timestamp
   */
  updateTimestamp(sampleRate, sampleCount) {
    const increment = Math.round((sampleCount * 90000) / sampleRate);
    this.timestamp = (this.timestamp + increment) >>> 0;
  }

  /**
   * Process incoming packet
   */
  processPacket(packet) {
    // Update metrics
    this.metrics.update(packet);

    // Add to jitter buffer
    this.jitterBuffer.addPacket(packet);

    // Store for PLC
    if (packet.payload && packet.payload.length > 0) {
      this.plc.storeGoodPacket(packet, packet.payload);
    }

    this.lastActivityTime = Date.now();
  }

  /**
   * Get audio from jitter buffer
   */
  getAudio() {
    const packet = this.jitterBuffer.getPacket();

    if (packet) {
      return packet.payload;
    }

    // No packet available - use PLC
    const stats = this.jitterBuffer.getStats();
    return this.plc.conceal(stats.consecutiveLosses);
  }

  /**
   * Get comprehensive statistics
   */
  getStats() {
    return {
      streamId: this.streamId,
      localPort: this.localPort,
      remoteAddress: this.remoteAddress,
      remotePort: this.remotePort,
      ssrc: this.ssrc,
      active: this.active,
      uptime: Date.now() - this.createdTime,
      metrics: this.metrics.getStats(),
      jitterBuffer: this.jitterBuffer.getStats(),
      plc: this.plc.getStats()
    };
  }

  /**
   * Shutdown stream
   */
  shutdown() {
    this.active = false;
    this.jitterBuffer.clear();
    this.plc.reset();
  }
}

/**
 * Optimized RTP Manager
 */
export class OptimizedRTPManager extends EventEmitter {
  constructor(options = {}) {
    super();

    // Configuration
    this.portRangeStart = options.portRangeStart || 10000;
    this.portRangeEnd = options.portRangeEnd || 10100;
    this.maxStreams = options.maxStreams || 50;
    this.enableMixing = options.enableMixing !== false;
    this.sampleRate = options.sampleRate || 48000;
    this.frameSize = options.frameSize || 960;

    // Port allocation
    this.availablePorts = new Set();
    for (let i = this.portRangeStart; i <= this.portRangeEnd; i += 2) {
      this.availablePorts.add(i);
    }

    // Optimized data structures
    this.streams = new FastStreamMap();
    this.sockets = new Map();  // port -> socket

    // Object pools
    this.packetPool = new PacketPool(options.packetPoolSize || 1000);
    this.bufferPool = new BufferPool(options.bufferPoolSize || 2000, 2048);

    // Audio mixer
    this.mixer = new OptimizedAudioMixer({
      sampleRate: this.sampleRate,
      frameSize: this.frameSize,
      normalizationEnabled: options.normalizationEnabled !== false,
      agcEnabled: options.agcEnabled !== false
    });

    // Audio processor (worker threads)
    this.audioProcessor = options.useWorkerThreads !== false
      ? new AudioProcessor({ numWorkers: options.numWorkers })
      : null;

    // Opus configuration
    this.opusConfig = new OpusConfig(options.opusPreset || 'RADIO');

    // Mixing
    this.mixingEnabled = this.enableMixing;
    this.mixInterval = options.mixInterval || 20;  // ms
    this.mixTimer = null;
    this.selectedStreamsForMixing = null;

    // Statistics
    this.stats = {
      createdTime: Date.now(),
      streamsCreated: 0,
      packetsProcessed: 0,
      totalBytesProcessed: 0,
      mixOperations: 0
    };
  }

  /**
   * Create optimized RTP stream
   */
  createStream(streamId, remoteAddress, remotePort, options = {}) {
    try {
      // Validate
      if (typeof streamId !== 'string' || streamId.length === 0) {
        throw new Error('Invalid stream ID');
      }

      if (this.streams.getById(streamId)) {
        throw new Error('Stream already exists');
      }

      if (this.streams.size() >= this.maxStreams) {
        throw new Error('Maximum stream limit reached');
      }

      // Allocate port
      const port = this.allocatePort();
      if (port === null) {
        throw new Error('No available ports');
      }

      // Create stream
      const ssrc = Math.floor(Math.random() * 0x100000000);
      const stream = new OptimizedRTPStream(
        streamId,
        remoteAddress,
        remotePort,
        ssrc,
        port,
        {
          sampleRate: this.sampleRate,
          frameSize: this.frameSize,
          ...options
        }
      );

      // Create optimized socket
      const { socket, sender } = createOptimizedSocket({
        type: 'udp4',
        reuseAddr: true,
        recvBufferSize: options.recvBufferSize || 2 * 1024 * 1024,
        sendBufferSize: options.sendBufferSize || 2 * 1024 * 1024,
        enableBatching: options.enableBatching !== false,
        batchSize: options.batchSize || 10
      });

      // Set up packet handler
      socket.on('message', (msg, rinfo) => {
        this.handleIncomingPacket(streamId, msg, rinfo);
      });

      socket.on('error', (err) => {
        this.emit('error', new Error(`Socket error on port ${port}: ${err.message}`));
      });

      // Bind socket
      socket.bind(port);

      // Store
      this.streams.add(streamId, stream);
      this.sockets.set(port, { socket, sender });

      // Add to mixer
      if (this.mixingEnabled) {
        this.mixer.addSource(streamId);
      }

      this.stats.streamsCreated++;

      this.emit('streamCreated', {
        streamId,
        port,
        ssrc,
        remoteAddress,
        remotePort
      });

      return {
        streamId,
        localPort: port,
        ssrc,
        remoteAddress,
        remotePort,
        opusConfig: this.opusConfig.toObject()
      };
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Destroy stream
   */
  destroyStream(streamId) {
    try {
      const stream = this.streams.getById(streamId);
      if (!stream) return;

      // Close socket
      const socketInfo = this.sockets.get(stream.localPort);
      if (socketInfo) {
        socketInfo.sender.destroy();
        socketInfo.socket.close();
        this.sockets.delete(stream.localPort);
      }

      // Free port
      this.availablePorts.add(stream.localPort);

      // Remove from mixer
      if (this.mixingEnabled) {
        this.mixer.removeSource(streamId);
      }

      // Shutdown stream
      stream.shutdown();

      // Remove stream
      this.streams.remove(streamId);

      this.emit('streamDestroyed', { streamId });
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Handle incoming RTP packet
   */
  handleIncomingPacket(streamId, data, rinfo) {
    try {
      const stream = this.streams.getById(streamId);
      if (!stream) return;

      // Get packet from pool
      const rtpPacket = this.packetPool.acquire();

      try {
        // Parse packet
        rtpPacket.parse(data);

        // Update statistics
        this.stats.packetsProcessed++;
        this.stats.totalBytesProcessed += data.length;

        // Check if RTCP
        if (rtpPacket.payloadType >= 200) {
          this.emit('rtcpPacket', { streamId, packet: rtpPacket });
          return;
        }

        // Process packet
        stream.processPacket(rtpPacket);

        this.emit('audioPacket', {
          streamId,
          packet: rtpPacket,
          rinfo
        });
      } finally {
        // Return packet to pool
        this.packetPool.release(rtpPacket);
      }
    } catch (error) {
      this.emit('error', new Error(`Packet processing error: ${error.message}`));
    }
  }

  /**
   * Send audio to stream
   */
  sendAudio(streamId, audioBuffer, sampleRate = 48000, payloadType = OPUS_PAYLOAD_TYPE) {
    try {
      const stream = this.streams.getById(streamId);
      if (!stream) return false;

      const socketInfo = this.sockets.get(stream.localPort);
      if (!socketInfo) return false;

      // Create RTP packet
      const seq = stream.getNextSequenceNumber();
      const headerLength = 12;
      const packetLength = headerLength + audioBuffer.length;

      // Get buffer from pool
      const buffer = this.bufferPool.acquire(packetLength);

      try {
        // Build RTP header
        buffer[0] = 0x80;  // V=2, P=0, X=0, CC=0
        buffer[1] = payloadType & 0x7F;  // M=0, PT
        buffer.writeUInt16BE(seq, 2);
        buffer.writeUInt32BE(stream.timestamp, 4);
        buffer.writeUInt32BE(stream.ssrc, 8);

        // Copy payload
        audioBuffer.copy(buffer, headerLength);

        // Send packet (using batch sender)
        const packet = buffer.slice(0, packetLength);
        socketInfo.socket.send(packet, stream.remotePort, stream.remoteAddress);

        // Update timestamp
        stream.updateTimestamp(sampleRate, audioBuffer.length / 2);

        return true;
      } finally {
        // Return buffer to pool
        this.bufferPool.release(buffer);
      }
    } catch (error) {
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Start audio mixing
   */
  startMixing(streamIds = null) {
    if (!this.mixingEnabled || this.mixTimer) return;

    this.selectedStreamsForMixing = streamIds || Array.from(this.streams.streamMap.keys());

    this.mixTimer = setInterval(() => {
      this.performMix();
    }, this.mixInterval);

    this.emit('mixingStarted', { streams: this.selectedStreamsForMixing });
  }

  /**
   * Stop audio mixing
   */
  stopMixing() {
    if (this.mixTimer) {
      clearInterval(this.mixTimer);
      this.mixTimer = null;
      this.emit('mixingStopped');
    }
  }

  /**
   * Perform audio mixing operation
   */
  performMix() {
    try {
      const sourceAudio = new Map();

      // Collect audio from streams
      for (const streamId of (this.selectedStreamsForMixing || [])) {
        const stream = this.streams.getById(streamId);
        if (!stream || !stream.active) continue;

        const audio = stream.getAudio();
        if (audio && audio.length > 0) {
          sourceAudio.set(streamId, audio);
        }
      }

      if (sourceAudio.size === 0) return;

      // Mix audio
      const mixedAudio = this.mixer.mix(sourceAudio);

      // Send mixed audio to all streams
      const allStreamIds = this.selectedStreamsForMixing || Array.from(this.streams.streamMap.keys());
      for (const streamId of allStreamIds) {
        if (sourceAudio.has(streamId)) {
          // Don't send back to source
          continue;
        }

        this.sendAudio(streamId, mixedAudio, this.sampleRate, OPUS_PAYLOAD_TYPE);
      }

      this.stats.mixOperations++;
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Allocate port
   */
  allocatePort() {
    for (const port of this.availablePorts) {
      this.availablePorts.delete(port);
      return port;
    }
    return null;
  }

  /**
   * Get stream statistics
   */
  getStreamStats(streamId) {
    const stream = this.streams.getById(streamId);
    return stream ? stream.getStats() : null;
  }

  /**
   * Get all active streams
   */
  getActiveStreams() {
    return this.streams.getAll().map(stream => ({
      streamId: stream.streamId,
      localPort: stream.localPort,
      remoteAddress: stream.remoteAddress,
      remotePort: stream.remotePort,
      ssrc: stream.ssrc,
      active: stream.active
    }));
  }

  /**
   * Get manager statistics
   */
  getStats() {
    return {
      ...this.stats,
      streamsActive: this.streams.size(),
      availablePorts: this.availablePorts.size,
      mixingEnabled: this.mixingEnabled && this.mixTimer !== null,
      mixerStats: this.mixer.getStats(),
      packetPoolStats: this.packetPool.getStats(),
      bufferPoolStats: this.bufferPool.getStats(),
      audioProcessorStats: this.audioProcessor ? this.audioProcessor.getStats() : null,
      uptime: Date.now() - this.stats.createdTime
    };
  }

  /**
   * Shutdown manager
   */
  async shutdown() {
    try {
      // Stop mixing
      this.stopMixing();

      // Destroy all streams
      const streamIds = this.streams.getAll().map(s => s.streamId);
      for (const streamId of streamIds) {
        this.destroyStream(streamId);
      }

      // Close all sockets
      for (const { socket, sender } of this.sockets.values()) {
        sender.destroy();
        socket.close();
      }

      this.sockets.clear();

      // Shutdown audio processor
      if (this.audioProcessor) {
        await this.audioProcessor.shutdown();
      }

      // Clear pools
      this.packetPool.clear();
      this.bufferPool.clear();

      this.emit('shutdown');
    } catch (error) {
      this.emit('error', error);
    }
  }
}

export default OptimizedRTPManager;
