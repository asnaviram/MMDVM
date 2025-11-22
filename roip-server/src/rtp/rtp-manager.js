/**
 * RTP Manager Module for RoIP Server
 *
 * Handles RTP stream management, audio mixing, jitter buffering,
 * and packet forwarding for Radio over IP conferencing.
 *
 * @module rtp-manager
 * @requires dgram
 * @requires events
 */

import dgram from 'dgram';
import { EventEmitter } from 'events';

/**
 * Represents a single RTP packet
 */
class RTPPacket {
  constructor(buffer) {
    this.buffer = buffer;
    this.parse();
  }

  /**
   * Parse RTP packet header
   * RTP header format (RFC 3550):
   * 0                   1                   2                   3
   * 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
   * +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   * |V=2|P|X|  CC   |M|     PT      |       sequence number         |
   * +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   * |                           timestamp                           |
   * +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   * |           synchronization source (SSRC) identifier            |
   * +=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+
   * |            contributing source (CSRC) identifiers             |
   * |                             ....                              |
   * +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   */
  parse() {
    if (this.buffer.length < 12) {
      throw new Error('RTP packet too short');
    }

    // First byte: V(2), P(1), X(1), CC(4)
    const byte0 = this.buffer[0];
    this.version = (byte0 >> 6) & 0x3;
    this.padding = (byte0 >> 5) & 0x1;
    this.extension = (byte0 >> 4) & 0x1;
    this.csrcCount = byte0 & 0xF;

    // Second byte: M(1), PT(7)
    const byte1 = this.buffer[1];
    this.marker = (byte1 >> 7) & 0x1;
    this.payloadType = byte1 & 0x7F;

    // Sequence number
    this.sequenceNumber = this.buffer.readUInt16BE(2);

    // Timestamp
    this.timestamp = this.buffer.readUInt32BE(4);

    // SSRC (Synchronization Source)
    this.ssrc = this.buffer.readUInt32BE(8);

    // Calculate header length
    let headerLength = 12 + (this.csrcCount * 4);

    // Parse extension if present
    if (this.extension) {
      if (headerLength + 4 > this.buffer.length) {
        throw new Error('RTP extension header incomplete');
      }
      const extLength = this.buffer.readUInt16BE(headerLength + 2);
      headerLength += 4 + (extLength * 4);
    }

    // Payload
    this.payload = this.buffer.slice(headerLength);
    this.payloadLength = this.payload.length;
  }

  /**
   * Create RTP packet from components
   * @static
   * @param {number} sequenceNumber - Sequence number
   * @param {number} timestamp - RTP timestamp
   * @param {number} ssrc - Synchronization source identifier
   * @param {number} payloadType - Payload type (typically 8 for PCMU, 0 for PCMA)
   * @param {Buffer} payload - Audio payload
   * @param {number} marker - Marker bit (1 for end of frame/talkspurt)
   * @returns {Buffer} Complete RTP packet
   */
  static create(sequenceNumber, timestamp, ssrc, payloadType, payload, marker = 0) {
    const headerLength = 12;
    const packet = Buffer.alloc(headerLength + payload.length);

    // Version (2), Padding (0), Extension (0), CSRC count (0)
    packet[0] = (2 << 6); // V=2

    // Marker, Payload Type
    packet[1] = ((marker & 0x1) << 7) | (payloadType & 0x7F);

    // Sequence number
    packet.writeUInt16BE(sequenceNumber, 2);

    // Timestamp
    packet.writeUInt32BE(timestamp, 4);

    // SSRC
    packet.writeUInt32BE(ssrc, 8);

    // Copy payload
    payload.copy(packet, headerLength);

    return packet;
  }
}

/**
 * Represents an RTCP packet (RTCP SR/RR)
 */
class RTCPPacket {
  /**
   * Create RTCP Sender Report packet
   * @static
   * @param {number} ssrc - Synchronization source identifier
   * @param {number} timestamp - RTP timestamp
   * @param {number} packetCount - Cumulative number of packets sent
   * @param {number} octetCount - Cumulative number of octets sent
   * @returns {Buffer} RTCP SR packet
   */
  static createSenderReport(ssrc, timestamp, packetCount, octetCount) {
    const packet = Buffer.alloc(28);
    let offset = 0;

    // V(2)=2, P(1)=0, RC(5)=0
    packet[offset] = 0x80;
    offset++;

    // PT=200 (SR)
    packet[offset] = 200;
    offset++;

    // Length in 32-bit words (minus 1) = 7
    packet.writeUInt16BE(7, offset);
    offset += 2;

    // SSRC
    packet.writeUInt32BE(ssrc, offset);
    offset += 4;

    // NTP Timestamp (current time as NTP)
    const now = Date.now();
    const ntpSeconds = Math.floor(now / 1000) + 2208988800; // Unix to NTP epoch
    const ntpFraction = ((now % 1000) / 1000) * 0x100000000;
    packet.writeUInt32BE(ntpSeconds, offset);
    offset += 4;
    packet.writeUInt32BE(ntpFraction >>> 0, offset);
    offset += 4;

    // RTP Timestamp
    packet.writeUInt32BE(timestamp, offset);
    offset += 4;

    // Sender's packet count
    packet.writeUInt32BE(packetCount, offset);
    offset += 4;

    // Sender's octet count
    packet.writeUInt32BE(octetCount, offset);

    return packet;
  }
}

/**
 * Jitter Buffer for RTP packets
 * Handles out-of-order and delayed packets
 */
class JitterBuffer {
  constructor(maxSize = 200) {
    this.buffer = new Map();
    this.maxSize = maxSize;
    this.expectedSequence = null;
    this.stats = {
      packetsAdded: 0,
      packetsRetrieved: 0,
      packetsLost: 0,
      latency: 0
    };
  }

  /**
   * Add packet to jitter buffer
   * @param {number} sequenceNumber - RTP sequence number
   * @param {object} packet - RTP packet object
   * @returns {boolean} True if added successfully
   */
  add(sequenceNumber, packet) {
    // Initialize expected sequence on first packet
    if (this.expectedSequence === null) {
      this.expectedSequence = sequenceNumber;
    }

    // Check if buffer is full
    if (this.buffer.size >= this.maxSize) {
      return false;
    }

    this.buffer.set(sequenceNumber, {
      packet,
      timestamp: Date.now()
    });

    this.stats.packetsAdded++;
    return true;
  }

  /**
   * Get packets from buffer in order
   * @param {number} maxPackets - Maximum packets to return
   * @returns {Array<object>} Array of packets in sequence order
   */
  getPackets(maxPackets = 10) {
    const packets = [];

    for (let i = 0; i < maxPackets && this.buffer.size > 0; i++) {
      if (this.buffer.has(this.expectedSequence)) {
        const item = this.buffer.get(this.expectedSequence);
        packets.push(item.packet);
        this.buffer.delete(this.expectedSequence);
        this.stats.packetsRetrieved++;
      } else {
        // Packet loss detected
        this.stats.packetsLost++;
        this.expectedSequence = this.getNextAvailableSequence();
        if (this.expectedSequence === null) break;
      }

      // Increment expected sequence (handle wrap-around)
      this.expectedSequence = (this.expectedSequence + 1) & 0xFFFF;
    }

    return packets;
  }

  /**
   * Get next available sequence number in buffer
   * @returns {number|null} Next sequence number or null if buffer empty
   */
  getNextAvailableSequence() {
    if (this.buffer.size === 0) return null;

    // Find the smallest sequence number >= expected
    let minSeq = null;
    for (const seq of this.buffer.keys()) {
      if (minSeq === null || seq < minSeq) {
        minSeq = seq;
      }
    }
    return minSeq;
  }

  /**
   * Get buffer statistics
   * @returns {object} Statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Clear buffer and reset
   */
  clear() {
    this.buffer.clear();
    this.expectedSequence = null;
  }

  /**
   * Get current buffer size
   * @returns {number} Number of packets in buffer
   */
  size() {
    return this.buffer.size;
  }
}

/**
 * Audio Mixer for conference streams
 * Mixes multiple audio streams using simple sum algorithm
 */
class AudioMixer {
  constructor() {
    this.streams = new Map();
    this.stats = {
      streamsActive: 0,
      samplesProcessed: 0,
      lastMixTime: 0
    };
  }

  /**
   * Add stream to mixer
   * @param {string} streamId - Unique stream identifier
   * @param {number} weight - Mix weight (default 1.0)
   */
  addStream(streamId, weight = 1.0) {
    this.streams.set(streamId, {
      weight,
      lastSamples: null,
      active: true
    });
    this.updateStats();
  }

  /**
   * Remove stream from mixer
   * @param {string} streamId - Stream identifier
   */
  removeStream(streamId) {
    this.streams.delete(streamId);
    this.updateStats();
  }

  /**
   * Mix audio from multiple sources
   * @param {Map<string, Buffer>} sourceBuffers - Map of streamId to audio buffers (16-bit PCM)
   * @returns {Buffer} Mixed audio buffer (16-bit PCM)
   */
  mix(sourceBuffers) {
    let maxLength = 0;
    const buffers = [];

    // Validate and prepare buffers
    for (const [streamId, buffer] of sourceBuffers) {
      if (!this.streams.has(streamId)) continue;
      if (!Buffer.isBuffer(buffer) || buffer.length < 2) continue;

      buffers.push({
        streamId,
        buffer,
        weight: this.streams.get(streamId).weight
      });

      maxLength = Math.max(maxLength, buffer.length);
    }

    if (buffers.length === 0) {
      // Return silence
      return Buffer.alloc(maxLength > 0 ? maxLength : 160);
    }

    // Create output buffer (16-bit PCM)
    const output = Buffer.alloc(maxLength);
    const sampleCount = maxLength / 2;
    const mixedSamples = new Int16Array(sampleCount);

    // Mix samples
    for (const { buffer, weight } of buffers) {
      const inputSamples = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2);

      for (let i = 0; i < Math.min(sampleCount, inputSamples.length); i++) {
        // Simple sum with weight and saturation
        let sample = mixedSamples[i] + (inputSamples[i] * weight);

        // Prevent overflow using soft clipping
        if (sample > 32767) {
          sample = 32767;
        } else if (sample < -32768) {
          sample = -32768;
        }

        mixedSamples[i] = sample;
      }
    }

    // Copy to output buffer
    const outputView = new Uint8Array(output.buffer, output.byteOffset, output.length);
    new Uint8Array(mixedSamples.buffer).forEach((byte, idx) => {
      outputView[idx] = byte;
    });

    this.stats.samplesProcessed += sampleCount;
    this.stats.lastMixTime = Date.now();

    return output;
  }

  /**
   * Update stream weight
   * @param {string} streamId - Stream identifier
   * @param {number} weight - New weight value
   */
  setStreamWeight(streamId, weight) {
    if (this.streams.has(streamId)) {
      this.streams.get(streamId).weight = weight;
    }
  }

  /**
   * Get mixer statistics
   * @returns {object} Statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Update active stream count
   */
  updateStats() {
    this.stats.streamsActive = this.streams.size;
  }
}

/**
 * RTP Stream representation
 */
class RTPStream {
  constructor(streamId, remoteAddress, remotePort, ssrc, localPort) {
    this.streamId = streamId;
    this.remoteAddress = remoteAddress;
    this.remotePort = remotePort;
    this.ssrc = ssrc;
    this.localPort = localPort;
    this.sequenceNumber = Math.floor(Math.random() * 65536);
    this.timestamp = Math.floor(Math.random() * 0x100000000);
    this.jitterBuffer = new JitterBuffer();
    this.stats = {
      packetsSent: 0,
      packetsReceived: 0,
      bytesSent: 0,
      bytesReceived: 0,
      lastPacketTime: 0,
      createdTime: Date.now(),
      lastActivityTime: Date.now()
    };
  }

  /**
   * Get next sequence number
   * @returns {number} Next sequence number
   */
  getNextSequenceNumber() {
    const seq = this.sequenceNumber;
    this.sequenceNumber = (this.sequenceNumber + 1) & 0xFFFF;
    return seq;
  }

  /**
   * Update timestamp for audio frame
   * @param {number} sampleRate - Audio sample rate (e.g., 8000, 16000)
   * @param {number} sampleCount - Number of audio samples in frame
   */
  updateTimestamp(sampleRate, sampleCount) {
    const increment = Math.round((sampleCount * 90000) / sampleRate); // RTP uses 90kHz clock for audio
    this.timestamp = (this.timestamp + increment) >>> 0;
  }

  /**
   * Record packet reception
   * @param {number} bytes - Number of bytes received
   */
  recordPacketReceived(bytes) {
    this.stats.packetsReceived++;
    this.stats.bytesReceived += bytes;
    this.stats.lastPacketTime = Date.now();
    this.stats.lastActivityTime = Date.now();
  }

  /**
   * Record packet transmission
   * @param {number} bytes - Number of bytes sent
   */
  recordPacketSent(bytes) {
    this.stats.packetsSent++;
    this.stats.bytesSent += bytes;
    this.stats.lastActivityTime = Date.now();
  }

  /**
   * Get stream statistics
   * @returns {object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      jitterBufferStats: this.jitterBuffer.getStats(),
      uptime: Date.now() - this.stats.createdTime
    };
  }
}

/**
 * RTP Manager - Main class for managing RTP streams and audio mixing
 *
 * Features:
 * - Dynamic port allocation (10000-10100)
 * - RTP/RTCP packet handling
 * - Audio mixing for conferences
 * - Jitter buffer management
 * - Packet forwarding and relaying
 * - SRTP encryption/decryption support
 * - Comprehensive statistics
 */
export class RTPManager extends EventEmitter {
  constructor(options = {}, srtpConfig = null) {
    super();

    // Configuration
    this.portRangeStart = options.portRangeStart || 10000;
    this.portRangeEnd = options.portRangeEnd || 10100;
    this.maxStreams = options.maxStreams || 50;
    this.enableMixing = options.enableMixing !== false;
    this.enableRTCP = options.enableRTCP !== false;

    // SRTP Configuration
    this.srtpEnabled = srtpConfig?.enabled || false;
    this.srtpConfig = srtpConfig || {
      enabled: false,
      crypto_suites: ['AES_CM_128_HMAC_SHA1_80'],
      key_derivation_rate: 0
    };
    this.srtpContexts = new Map(); // streamId -> SRTP context

    // Port allocation
    this.availablePorts = new Set();
    for (let i = this.portRangeStart; i <= this.portRangeEnd; i += 2) {
      this.availablePorts.add(i);
    }
    this.allocatedPorts = new Map(); // portNumber -> streamId

    // Stream management
    this.streams = new Map(); // streamId -> RTPStream
    this.sockets = new Map(); // portNumber -> UDP socket

    // Audio mixing
    this.mixer = new AudioMixer();
    this.mixingEnabled = this.enableMixing;
    this.mixInterval = options.mixInterval || 20; // ms
    this.mixTimer = null;

    // Relaying
    this.relayPairs = new Map(); // streamId -> [targetStreamIds]

    // Statistics
    this.stats = {
      createdTime: Date.now(),
      streamsCreated: 0,
      streamsActive: 0,
      totalPacketsForwarded: 0,
      totalPacketsMixed: 0
    };
  }

  /**
   * Create a new RTP stream
   * @param {string} streamId - Unique stream identifier
   * @param {string} remoteAddress - Remote peer IP address
   * @param {number} remotePort - Remote peer UDP port
   * @param {object} options - Additional options
   * @returns {object} Stream information with allocated port
   * @throws {Error} If stream creation fails
   */
  createStream(streamId, remoteAddress, remotePort, options = {}) {
    try {
      // Validate inputs
      if (typeof streamId !== 'string' || streamId.length === 0) {
        throw new Error('Invalid stream ID');
      }

      if (this.streams.has(streamId)) {
        throw new Error('Stream already exists');
      }

      if (this.streams.size >= this.maxStreams) {
        throw new Error('Maximum stream limit reached');
      }

      // Allocate port
      const port = this.allocatePort();
      if (port === null) {
        throw new Error('No available ports');
      }

      // Create stream
      const ssrc = Math.floor(Math.random() * 0x100000000);
      const stream = new RTPStream(streamId, remoteAddress, remotePort, ssrc, port);

      // Create UDP socket
      const socket = dgram.createSocket('udp4');

      socket.on('message', (msg, rinfo) => {
        this.handleIncomingPacket(streamId, msg, rinfo);
      });

      socket.on('error', (err) => {
        this.emit('error', new Error(`Socket error on port ${port}: ${err.message}`));
      });

      socket.bind(port, () => {
        socket.setRecvBufferSize?.(256 * 1024);
      });

      // Store stream and socket
      this.streams.set(streamId, stream);
      this.sockets.set(port, socket);
      this.allocatedPorts.set(port, streamId);

      // Add to mixer if enabled
      if (this.mixingEnabled) {
        this.mixer.addStream(streamId);
      }

      this.stats.streamsCreated++;
      this.stats.streamsActive = this.streams.size;

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
        remotePort
      };
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Destroy an RTP stream
   * @param {string} streamId - Stream identifier
   */
  destroyStream(streamId) {
    try {
      const stream = this.streams.get(streamId);
      if (!stream) {
        return;
      }

      // Close socket
      const socket = this.sockets.get(stream.localPort);
      if (socket) {
        socket.close();
        this.sockets.delete(stream.localPort);
      }

      // Free port
      this.availablePorts.add(stream.localPort);
      this.allocatedPorts.delete(stream.localPort);

      // Remove from mixer
      if (this.mixingEnabled) {
        this.mixer.removeStream(streamId);
      }

      // Remove relay pairs
      this.relayPairs.delete(streamId);
      for (const targets of this.relayPairs.values()) {
        const idx = targets.indexOf(streamId);
        if (idx !== -1) {
          targets.splice(idx, 1);
        }
      }

      // Remove stream
      this.streams.delete(streamId);
      this.stats.streamsActive = this.streams.size;

      this.emit('streamDestroyed', { streamId });
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Send audio data to a stream
   * @param {string} streamId - Target stream identifier
   * @param {Buffer} audioBuffer - Audio data (16-bit PCM)
   * @param {number} sampleRate - Audio sample rate (default 8000)
   * @param {number} payloadType - RTP payload type (default 8 for PCMU)
   * @returns {boolean} Success status
   */
  sendAudio(streamId, audioBuffer, sampleRate = 8000, payloadType = 8) {
    try {
      const stream = this.streams.get(streamId);
      if (!stream) {
        return false;
      }

      const socket = this.sockets.get(stream.localPort);
      if (!socket) {
        return false;
      }

      // Create RTP packet
      const seq = stream.getNextSequenceNumber();
      const rtpPacket = RTPPacket.create(
        seq,
        stream.timestamp,
        stream.ssrc,
        payloadType,
        audioBuffer,
        1 // marker bit for talkspurt end
      );

      // Send packet
      socket.send(rtpPacket, 0, rtpPacket.length, stream.remotePort, stream.remoteAddress, (err) => {
        if (err) {
          this.emit('error', new Error(`Send error to ${streamId}: ${err.message}`));
        } else {
          stream.recordPacketSent(rtpPacket.length);
        }
      });

      // Update timestamp
      stream.updateTimestamp(sampleRate, audioBuffer.length / 2);

      return true;
    } catch (error) {
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Handle incoming RTP packet
   * @private
   * @param {string} streamId - Source stream identifier
   * @param {Buffer} data - Packet data
   * @param {object} rinfo - Remote info
   */
  handleIncomingPacket(streamId, data, rinfo) {
    try {
      const stream = this.streams.get(streamId);
      if (!stream) {
        return;
      }

      // Parse RTP packet
      let rtpPacket;
      try {
        rtpPacket = new RTPPacket(data);
      } catch (error) {
        this.emit('error', new Error(`Invalid RTP packet from ${streamId}: ${error.message}`));
        return;
      }

      // Record reception
      stream.recordPacketReceived(data.length);

      // Check if it's RTCP (PT >= 200)
      if (rtpPacket.payloadType >= 200) {
        this.emit('rtcpPacket', { streamId, packet: rtpPacket });
        return;
      }

      // Add to jitter buffer
      stream.jitterBuffer.add(rtpPacket.sequenceNumber, rtpPacket);

      // Handle relaying if configured
      if (this.relayPairs.has(streamId)) {
        this.relayPacket(streamId, rtpPacket);
      }

      this.stats.totalPacketsForwarded++;

      this.emit('audioPacket', {
        streamId,
        packet: rtpPacket,
        data: rinfo
      });
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Relay RTP packet to target streams
   * @private
   * @param {string} sourceStreamId - Source stream identifier
   * @param {object} rtpPacket - RTP packet to relay
   */
  relayPacket(sourceStreamId, rtpPacket) {
    const targets = this.relayPairs.get(sourceStreamId) || [];

    for (const targetStreamId of targets) {
      const targetStream = this.streams.get(targetStreamId);
      if (!targetStream) continue;

      const socket = this.sockets.get(targetStream.localPort);
      if (!socket) continue;

      // Forward packet with modified SSRC
      const modifiedPacket = RTPPacket.create(
        rtpPacket.sequenceNumber,
        rtpPacket.timestamp,
        targetStream.ssrc, // Use target stream's SSRC
        rtpPacket.payloadType,
        rtpPacket.payload,
        rtpPacket.marker
      );

      socket.send(
        modifiedPacket,
        0,
        modifiedPacket.length,
        targetStream.remotePort,
        targetStream.remoteAddress,
        (err) => {
          if (err) {
            this.emit('error', new Error(`Relay error: ${err.message}`));
          }
        }
      );
    }
  }

  /**
   * Set up relay between streams
   * @param {string} sourceStreamId - Source stream identifier
   * @param {string|Array<string>} targetStreamIds - Target stream identifier(s)
   */
  setupRelay(sourceStreamId, targetStreamIds) {
    if (!Array.isArray(targetStreamIds)) {
      targetStreamIds = [targetStreamIds];
    }

    if (!this.relayPairs.has(sourceStreamId)) {
      this.relayPairs.set(sourceStreamId, []);
    }

    const targets = this.relayPairs.get(sourceStreamId);
    for (const targetId of targetStreamIds) {
      if (!targets.includes(targetId) && this.streams.has(targetId)) {
        targets.push(targetId);
      }
    }
  }

  /**
   * Remove relay between streams
   * @param {string} sourceStreamId - Source stream identifier
   * @param {string|Array<string>} targetStreamIds - Target stream identifier(s)
   */
  removeRelay(sourceStreamId, targetStreamIds) {
    if (!Array.isArray(targetStreamIds)) {
      targetStreamIds = [targetStreamIds];
    }

    const targets = this.relayPairs.get(sourceStreamId);
    if (!targets) return;

    for (const targetId of targetStreamIds) {
      const idx = targets.indexOf(targetId);
      if (idx !== -1) {
        targets.splice(idx, 1);
      }
    }

    if (targets.length === 0) {
      this.relayPairs.delete(sourceStreamId);
    }
  }

  /**
   * Start audio mixing for conference
   * @param {Array<string>} streamIds - Stream identifiers to include in mix
   */
  startMixing(streamIds = null) {
    if (!this.mixingEnabled) {
      return;
    }

    if (this.mixTimer) {
      return; // Already mixing
    }

    this.selectedStreamsForMixing = streamIds || Array.from(this.streams.keys());

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
   * @private
   */
  performMix() {
    try {
      const sourceBuffers = new Map();

      // Collect packets from selected streams
      for (const streamId of (this.selectedStreamsForMixing || [])) {
        const stream = this.streams.get(streamId);
        if (!stream) continue;

        const packets = stream.jitterBuffer.getPackets(1);
        if (packets.length > 0) {
          sourceBuffers.set(streamId, packets[0].payload);
        }
      }

      if (sourceBuffers.size === 0) {
        return;
      }

      // Mix audio
      const mixedAudio = this.mixer.mix(sourceBuffers);

      // Forward mixed audio to other streams
      const allStreamIds = this.selectedStreamsForMixing || Array.from(this.streams.keys());
      for (const streamId of allStreamIds) {
        if (sourceBuffers.has(streamId)) {
          // Don't send stream back to itself
          continue;
        }

        this.sendAudio(streamId, mixedAudio, 8000, 8);
      }

      this.stats.totalPacketsMixed++;
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Allocate a port from the available pool
   * @private
   * @returns {number|null} Allocated port number or null if none available
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
   * @param {string} streamId - Stream identifier
   * @returns {object} Stream statistics
   */
  getStreamStats(streamId) {
    const stream = this.streams.get(streamId);
    if (!stream) {
      return null;
    }

    return stream.getStats();
  }

  /**
   * Get all active streams
   * @returns {Array<object>} Array of stream information
   */
  getActiveStreams() {
    return Array.from(this.streams.values()).map(stream => ({
      streamId: stream.streamId,
      localPort: stream.localPort,
      remoteAddress: stream.remoteAddress,
      remotePort: stream.remotePort,
      ssrc: stream.ssrc,
      stats: stream.getStats()
    }));
  }

  /**
   * Get manager statistics
   * @returns {object} Manager statistics
   */
  getStats() {
    return {
      ...this.stats,
      streamsActive: this.streams.size,
      availablePorts: this.availablePorts.size,
      mixerStats: this.mixer.getStats(),
      mixingEnabled: this.mixingEnabled && this.mixTimer !== null,
      srtpEnabled: this.srtpEnabled,
      srtpStreams: this.srtpContexts.size,
      uptime: Date.now() - this.stats.createdTime
    };
  }

  /**
   * Initialize SRTP context for a stream
   * @param {string} streamId - Stream identifier
   * @param {Buffer} masterKey - SRTP master key
   * @param {Buffer} masterSalt - SRTP master salt
   * @param {string} cryptoSuite - Crypto suite (e.g., 'AES_CM_128_HMAC_SHA1_80')
   * @returns {boolean} Success status
   *
   * NOTE: This is a placeholder implementation. For production use, integrate
   * a proper SRTP library like 'srtp2' or 'wrtc' with libsrtp bindings.
   */
  initializeSRTP(streamId, masterKey, masterSalt, cryptoSuite = 'AES_CM_128_HMAC_SHA1_80') {
    if (!this.srtpEnabled) {
      this.emit('error', new Error('SRTP is not enabled in configuration'));
      return false;
    }

    if (!this.streams.has(streamId)) {
      this.emit('error', new Error(`Stream ${streamId} does not exist`));
      return false;
    }

    try {
      // TODO: Implement actual SRTP context initialization
      // This requires integrating with a native SRTP library
      // Example with hypothetical SRTP library:
      // const srtp = require('srtp2');
      // const context = srtp.createContext({
      //   masterKey,
      //   masterSalt,
      //   cryptoSuite,
      //   keyDerivationRate: this.srtpConfig.key_derivation_rate
      // });

      // For now, store configuration for future implementation
      this.srtpContexts.set(streamId, {
        masterKey: masterKey.toString('base64'),
        masterSalt: masterSalt.toString('base64'),
        cryptoSuite,
        initialized: true,
        packetsEncrypted: 0,
        packetsDecrypted: 0
      });

      this.emit('srtpInitialized', { streamId, cryptoSuite });
      return true;
    } catch (error) {
      this.emit('error', new Error(`Failed to initialize SRTP for ${streamId}: ${error.message}`));
      return false;
    }
  }

  /**
   * Encrypt RTP packet using SRTP
   * @param {string} streamId - Stream identifier
   * @param {Buffer} rtpPacket - RTP packet to encrypt
   * @returns {Buffer|null} Encrypted SRTP packet or null on failure
   *
   * NOTE: This is a placeholder. Implement with proper SRTP library.
   */
  encryptSRTP(streamId, rtpPacket) {
    const context = this.srtpContexts.get(streamId);
    if (!context) {
      return rtpPacket; // Pass through if SRTP not initialized
    }

    try {
      // TODO: Implement actual SRTP encryption
      // Example with hypothetical SRTP library:
      // const encrypted = context.encrypt(rtpPacket);
      // context.packetsEncrypted++;
      // return encrypted;

      // Placeholder: return unencrypted packet with warning
      if (context.packetsEncrypted === 0) {
        this.emit('warning', 'SRTP encryption not yet implemented - packets sent unencrypted');
      }
      context.packetsEncrypted++;
      return rtpPacket;
    } catch (error) {
      this.emit('error', new Error(`SRTP encryption failed for ${streamId}: ${error.message}`));
      return null;
    }
  }

  /**
   * Decrypt SRTP packet to RTP
   * @param {string} streamId - Stream identifier
   * @param {Buffer} srtpPacket - SRTP packet to decrypt
   * @returns {Buffer|null} Decrypted RTP packet or null on failure
   *
   * NOTE: This is a placeholder. Implement with proper SRTP library.
   */
  decryptSRTP(streamId, srtpPacket) {
    const context = this.srtpContexts.get(streamId);
    if (!context) {
      return srtpPacket; // Pass through if SRTP not initialized
    }

    try {
      // TODO: Implement actual SRTP decryption
      // Example with hypothetical SRTP library:
      // const decrypted = context.decrypt(srtpPacket);
      // context.packetsDecrypted++;
      // return decrypted;

      // Placeholder: return packet as-is with warning
      if (context.packetsDecrypted === 0) {
        this.emit('warning', 'SRTP decryption not yet implemented - processing unencrypted packets');
      }
      context.packetsDecrypted++;
      return srtpPacket;
    } catch (error) {
      this.emit('error', new Error(`SRTP decryption failed for ${streamId}: ${error.message}`));
      return null;
    }
  }

  /**
   * Generate SRTP key material
   * @param {number} keyLength - Key length in bytes (default 16 for AES-128)
   * @param {number} saltLength - Salt length in bytes (default 14)
   * @returns {object} Object with masterKey and masterSalt buffers
   */
  generateSRTPKeyMaterial(keyLength = 16, saltLength = 14) {
    const crypto = require('crypto');
    return {
      masterKey: crypto.randomBytes(keyLength),
      masterSalt: crypto.randomBytes(saltLength)
    };
  }

  /**
   * Get SRTP statistics for a stream
   * @param {string} streamId - Stream identifier
   * @returns {object|null} SRTP statistics or null if not enabled
   */
  getSRTPStats(streamId) {
    return this.srtpContexts.get(streamId) || null;
  }

  /**
   * Shutdown RTP manager and clean up resources
   */
  shutdown() {
    try {
      // Stop mixing
      this.stopMixing();

      // Destroy all streams
      const streamIds = Array.from(this.streams.keys());
      for (const streamId of streamIds) {
        this.destroyStream(streamId);
      }

      // Close all sockets
      for (const socket of this.sockets.values()) {
        socket.close();
      }

      this.sockets.clear();
      this.emit('shutdown');
    } catch (error) {
      this.emit('error', error);
    }
  }
}

export default RTPManager;
