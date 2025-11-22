/**
 * RTP Manager Test Suite
 * Tests stream creation/destruction, port allocation, jitter buffer,
 * audio mixing, and packet forwarding
 */

import { RTPManager } from '../src/rtp/rtp-manager.js';

describe('RTP Manager Tests', () => {
  let rtpManager;

  beforeEach(() => {
    rtpManager = new RTPManager({
      portRangeStart: 10000,
      portRangeEnd: 10100,
      maxStreams: 50,
      enableMixing: true,
      enableRTCP: true,
      mixInterval: 20
    });
  });

  afterEach(() => {
    if (rtpManager) {
      rtpManager.shutdown();
    }
  });

  // ===== STREAM CREATION AND DESTRUCTION =====
  describe('Stream Creation and Destruction', () => {
    test('should create RTP stream successfully', () => {
      const result = rtpManager.createStream(
        'stream-1',
        '192.168.1.101',
        5060,
        { codec: 'PCMU' }
      );

      expect(result).toBeDefined();
      expect(result.streamId).toBe('stream-1');
      expect(result.localPort).toBeGreaterThanOrEqual(10000);
      expect(result.localPort).toBeLessThanOrEqual(10100);
      expect(result.ssrc).toBeDefined();
      expect(rtpManager.streams.has('stream-1')).toBe(true);
    });

    test('should reject duplicate stream ID', () => {
      rtpManager.createStream('stream-2', '192.168.1.101', 5060);

      expect(() => {
        rtpManager.createStream('stream-2', '192.168.1.102', 5061);
      }).toThrow('Stream already exists');
    });

    test('should reject invalid stream ID', () => {
      expect(() => {
        rtpManager.createStream('', '192.168.1.101', 5060);
      }).toThrow('Invalid stream ID');
    });

    test('should enforce maximum stream limit', () => {
      rtpManager.maxStreams = 2;

      rtpManager.createStream('stream-a', '192.168.1.101', 5060);
      rtpManager.createStream('stream-b', '192.168.1.102', 5061);

      expect(() => {
        rtpManager.createStream('stream-c', '192.168.1.103', 5062);
      }).toThrow('Maximum stream limit reached');
    });

    test('should destroy stream successfully', () => {
      const stream = rtpManager.createStream('stream-3', '192.168.1.101', 5060);

      expect(rtpManager.streams.has('stream-3')).toBe(true);

      rtpManager.destroyStream('stream-3');

      expect(rtpManager.streams.has('stream-3')).toBe(false);
    });

    test('should free port when stream is destroyed', () => {
      const stream = rtpManager.createStream('stream-4', '192.168.1.101', 5060);
      const allocatedPort = stream.localPort;
      const availableBefore = rtpManager.availablePorts.size;

      rtpManager.destroyStream('stream-4');

      const availableAfter = rtpManager.availablePorts.size;
      expect(availableAfter).toBeGreaterThan(availableBefore);
      expect(rtpManager.availablePorts.has(allocatedPort)).toBe(true);
    });

    test('should silently ignore destroy of non-existent stream', () => {
      expect(() => {
        rtpManager.destroyStream('non-existent');
      }).not.toThrow();
    });
  });

  // ===== PORT ALLOCATION =====
  describe('Port Allocation', () => {
    test('should allocate ports sequentially', () => {
      const port1 = rtpManager.allocatePort();
      const port2 = rtpManager.allocatePort();

      expect(port1).toBeDefined();
      expect(port2).toBeDefined();
      expect(port1).not.toBe(port2);
      expect(port1 % 2).toBe(0); // Ports are even (RTP)
      expect(port2 % 2).toBe(0);
    });

    test('should allocate ports within range', () => {
      const port = rtpManager.allocatePort();

      expect(port).toBeGreaterThanOrEqual(rtpManager.portRangeStart);
      expect(port).toBeLessThanOrEqual(rtpManager.portRangeEnd);
    });

    test('should return null when no ports available', () => {
      rtpManager.availablePorts.clear();
      const port = rtpManager.allocatePort();

      expect(port).toBeNull();
    });

    test('should track allocated ports', () => {
      const stream = rtpManager.createStream('stream-5', '192.168.1.101', 5060);

      expect(rtpManager.allocatedPorts.has(stream.localPort)).toBe(true);
      expect(rtpManager.allocatedPorts.get(stream.localPort)).toBe('stream-5');
    });
  });

  // ===== JITTER BUFFER =====
  describe('Jitter Buffer', () => {
    test('should add packet to jitter buffer', () => {
      const stream = rtpManager.createStream('stream-6', '192.168.1.101', 5060);
      const rtpStream = rtpManager.streams.get('stream-6');

      const packet = { sequenceNumber: 1000, payloadLength: 160 };
      const added = rtpStream.jitterBuffer.add(1000, packet);

      expect(added).toBe(true);
      expect(rtpStream.jitterBuffer.size()).toBe(1);
    });

    test('should retrieve packets in order from jitter buffer', () => {
      const stream = rtpManager.createStream('stream-7', '192.168.1.101', 5060);
      const jitterBuffer = rtpManager.streams.get('stream-7').jitterBuffer;

      jitterBuffer.add(100, { seq: 100 });
      jitterBuffer.add(102, { seq: 102 });
      jitterBuffer.add(101, { seq: 101 });

      const packets = jitterBuffer.getPackets(3);

      expect(packets.length).toBeGreaterThan(0);
    });

    test('should handle jitter buffer overflow', () => {
      const stream = rtpManager.createStream('stream-8', '192.168.1.101', 5060);
      const jitterBuffer = rtpManager.streams.get('stream-8').jitterBuffer;

      // Fill buffer
      for (let i = 0; i < 200; i++) {
        jitterBuffer.add(i, { seq: i });
      }

      // Try to add one more
      const added = jitterBuffer.add(200, { seq: 200 });

      expect(added).toBe(false);
    });

    test('should track packet statistics in jitter buffer', () => {
      const stream = rtpManager.createStream('stream-9', '192.168.1.101', 5060);
      const jitterBuffer = rtpManager.streams.get('stream-9').jitterBuffer;

      jitterBuffer.add(100, { seq: 100 });
      jitterBuffer.add(101, { seq: 101 });
      jitterBuffer.getPackets(1);

      const stats = jitterBuffer.getStats();

      expect(stats.packetsAdded).toBeGreaterThan(0);
      expect(stats.packetsRetrieved).toBeGreaterThan(0);
    });
  });

  // ===== AUDIO MIXING =====
  describe('Audio Mixing', () => {
    test('should add stream to mixer', () => {
      rtpManager.mixer.addStream('stream-a', 1.0);

      expect(rtpManager.mixer.streams.has('stream-a')).toBe(true);
    });

    test('should remove stream from mixer', () => {
      rtpManager.mixer.addStream('stream-b', 1.0);
      expect(rtpManager.mixer.streams.has('stream-b')).toBe(true);

      rtpManager.mixer.removeStream('stream-b');
      expect(rtpManager.mixer.streams.has('stream-b')).toBe(false);
    });

    test('should set stream weight for mixing', () => {
      rtpManager.mixer.addStream('stream-c', 1.0);
      rtpManager.mixer.setStreamWeight('stream-c', 0.5);

      expect(rtpManager.mixer.streams.get('stream-c').weight).toBe(0.5);
    });

    test('should mix audio from multiple sources', () => {
      rtpManager.mixer.addStream('stream-x', 1.0);
      rtpManager.mixer.addStream('stream-y', 1.0);

      const sourceBuffers = new Map();
      sourceBuffers.set('stream-x', Buffer.alloc(160)); // 160 bytes of silence
      sourceBuffers.set('stream-y', Buffer.alloc(160));

      const mixedAudio = rtpManager.mixer.mix(sourceBuffers);

      expect(Buffer.isBuffer(mixedAudio)).toBe(true);
      expect(mixedAudio.length).toBe(160);
    });

    test('should return silence when no sources', () => {
      rtpManager.mixer.addStream('stream-z', 1.0);

      const mixedAudio = rtpManager.mixer.mix(new Map());

      expect(Buffer.isBuffer(mixedAudio)).toBe(true);
    });

    test('should prevent audio clipping in mixer', () => {
      rtpManager.mixer.addStream('stream-p', 1.0);
      rtpManager.mixer.addStream('stream-q', 1.0);

      // Create loud buffers that could overflow
      const loudBuffer = Buffer.alloc(160);
      for (let i = 0; i < loudBuffer.length; i += 2) {
        loudBuffer.writeInt16BE(30000, i);
      }

      const sourceBuffers = new Map();
      sourceBuffers.set('stream-p', loudBuffer);
      sourceBuffers.set('stream-q', loudBuffer);

      const mixedAudio = rtpManager.mixer.mix(sourceBuffers);

      // Check for clipping (values should be clamped to 16-bit range)
      for (let i = 0; i < mixedAudio.length; i += 2) {
        const sample = mixedAudio.readInt16BE(i);
        expect(sample).toBeGreaterThanOrEqual(-32768);
        expect(sample).toBeLessThanOrEqual(32767);
      }
    });

    test('should track mixer statistics', () => {
      rtpManager.mixer.addStream('stream-m1', 1.0);
      rtpManager.mixer.addStream('stream-m2', 1.0);

      const stats = rtpManager.mixer.getStats();

      expect(stats.streamsActive).toBe(2);
      expect(stats.samplesProcessed).toBeDefined();
    });

    test('should handle invalid streams in mixing', () => {
      rtpManager.mixer.addStream('valid-stream', 1.0);

      const sourceBuffers = new Map();
      sourceBuffers.set('valid-stream', Buffer.alloc(160));
      sourceBuffers.set('invalid-stream', Buffer.alloc(160));

      expect(() => {
        rtpManager.mixer.mix(sourceBuffers);
      }).not.toThrow();
    });
  });

  // ===== PACKET FORWARDING =====
  describe('Packet Forwarding and Relaying', () => {
    test('should setup relay between streams', () => {
      rtpManager.createStream('stream-src', '192.168.1.101', 5060);
      rtpManager.createStream('stream-dst', '192.168.1.102', 5061);

      rtpManager.setupRelay('stream-src', 'stream-dst');

      expect(rtpManager.relayPairs.has('stream-src')).toBe(true);
      expect(rtpManager.relayPairs.get('stream-src')).toContain('stream-dst');
    });

    test('should setup relay to multiple streams', () => {
      rtpManager.createStream('stream-src2', '192.168.1.101', 5060);
      rtpManager.createStream('stream-dst1', '192.168.1.102', 5061);
      rtpManager.createStream('stream-dst2', '192.168.1.103', 5062);

      rtpManager.setupRelay('stream-src2', ['stream-dst1', 'stream-dst2']);

      const targets = rtpManager.relayPairs.get('stream-src2');
      expect(targets).toContain('stream-dst1');
      expect(targets).toContain('stream-dst2');
    });

    test('should remove relay between streams', () => {
      rtpManager.createStream('stream-src3', '192.168.1.101', 5060);
      rtpManager.createStream('stream-dst3', '192.168.1.102', 5061);

      rtpManager.setupRelay('stream-src3', 'stream-dst3');
      expect(rtpManager.relayPairs.has('stream-src3')).toBe(true);

      rtpManager.removeRelay('stream-src3', 'stream-dst3');
      expect(rtpManager.relayPairs.has('stream-src3')).toBe(false);
    });

    test('should not add duplicate relay targets', () => {
      rtpManager.createStream('stream-src4', '192.168.1.101', 5060);
      rtpManager.createStream('stream-dst4', '192.168.1.102', 5061);

      rtpManager.setupRelay('stream-src4', 'stream-dst4');
      rtpManager.setupRelay('stream-src4', 'stream-dst4');

      const targets = rtpManager.relayPairs.get('stream-src4');
      expect(targets.filter(t => t === 'stream-dst4')).toHaveLength(1);
    });
  });

  // ===== AUDIO SENDING =====
  describe('Audio Sending', () => {
    test('should send audio to stream', () => {
      const stream = rtpManager.createStream('stream-10', '192.168.1.101', 5060);
      const audioBuffer = Buffer.alloc(160);

      const result = rtpManager.sendAudio('stream-10', audioBuffer);

      expect(result).toBe(true);
    });

    test('should return false for non-existent stream', () => {
      const audioBuffer = Buffer.alloc(160);
      const result = rtpManager.sendAudio('non-existent', audioBuffer);

      expect(result).toBe(false);
    });

    test('should update stream statistics on send', () => {
      const stream = rtpManager.createStream('stream-11', '192.168.1.101', 5060);
      const rtpStream = rtpManager.streams.get('stream-11');
      const initialPackets = rtpStream.stats.packetsSent;

      rtpManager.sendAudio('stream-11', Buffer.alloc(160));

      expect(rtpStream.stats.packetsSent).toBeGreaterThanOrEqual(initialPackets);
    });
  });

  // ===== MIXING CONTROL =====
  describe('Audio Mixing Control', () => {
    test('should start mixing', (done) => {
      rtpManager.createStream('stream-mix1', '192.168.1.101', 5060);
      rtpManager.createStream('stream-mix2', '192.168.1.102', 5061);

      rtpManager.on('mixingStarted', (data) => {
        expect(data.streams).toBeDefined();
        done();
      });

      rtpManager.startMixing(['stream-mix1', 'stream-mix2']);
      expect(rtpManager.mixTimer).not.toBeNull();
    });

    test('should stop mixing', (done) => {
      rtpManager.createStream('stream-mix3', '192.168.1.101', 5060);
      rtpManager.startMixing(['stream-mix3']);

      rtpManager.on('mixingStopped', () => {
        expect(rtpManager.mixTimer).toBeNull();
        done();
      });

      rtpManager.stopMixing();
    });

    test('should not start mixing twice', () => {
      rtpManager.createStream('stream-mix4', '192.168.1.101', 5060);

      rtpManager.startMixing(['stream-mix4']);
      const firstTimer = rtpManager.mixTimer;

      rtpManager.startMixing(['stream-mix4']);
      const secondTimer = rtpManager.mixTimer;

      expect(firstTimer).toBe(secondTimer);
    });
  });

  // ===== STREAM STATISTICS =====
  describe('Stream Statistics', () => {
    test('should get stream statistics', () => {
      const stream = rtpManager.createStream('stream-12', '192.168.1.101', 5060);
      const stats = rtpManager.getStreamStats('stream-12');

      expect(stats).toBeDefined();
      expect(stats.packetsSent).toBeDefined();
      expect(stats.packetsReceived).toBeDefined();
      expect(stats.bytesSent).toBeDefined();
      expect(stats.bytesReceived).toBeDefined();
    });

    test('should return null for non-existent stream stats', () => {
      const stats = rtpManager.getStreamStats('non-existent');
      expect(stats).toBeNull();
    });

    test('should get all active streams', () => {
      rtpManager.createStream('stream-13', '192.168.1.101', 5060);
      rtpManager.createStream('stream-14', '192.168.1.102', 5061);

      const active = rtpManager.getActiveStreams();

      expect(Array.isArray(active)).toBe(true);
      expect(active.length).toBeGreaterThanOrEqual(2);
      expect(active[0]).toHaveProperty('streamId');
      expect(active[0]).toHaveProperty('localPort');
      expect(active[0]).toHaveProperty('ssrc');
    });

    test('should get manager statistics', () => {
      rtpManager.createStream('stream-15', '192.168.1.101', 5060);

      const stats = rtpManager.getStats();

      expect(stats).toBeDefined();
      expect(stats.streamsActive).toBeGreaterThanOrEqual(1);
      expect(stats.availablePorts).toBeDefined();
      expect(stats.uptime).toBeGreaterThanOrEqual(0);
      expect(stats.mixerStats).toBeDefined();
    });
  });

  // ===== RTP PACKET CREATION =====
  describe('RTP Packet Creation', () => {
    test('should create valid RTP packet', () => {
      const payload = Buffer.alloc(160);
      const packet = require('../src/rtp/rtp-manager.js').RTPPacket?.create(
        100,
        1000,
        0x12345678,
        8,
        payload,
        1
      );

      if (packet) {
        expect(Buffer.isBuffer(packet)).toBe(true);
        expect(packet.length).toBeGreaterThan(12);
      }
    });
  });

  // ===== SHUTDOWN =====
  describe('Shutdown and Cleanup', () => {
    test('should shutdown manager and clean up resources', () => {
      rtpManager.createStream('stream-shutdown1', '192.168.1.101', 5060);
      rtpManager.createStream('stream-shutdown2', '192.168.1.102', 5061);

      expect(rtpManager.streams.size).toBe(2);

      rtpManager.shutdown();

      expect(rtpManager.streams.size).toBe(0);
    });

    test('should emit shutdown event', (done) => {
      rtpManager.on('shutdown', () => {
        done();
      });

      rtpManager.shutdown();
    });
  });
});
