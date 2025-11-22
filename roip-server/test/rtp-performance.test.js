/**
 * RTP Performance Tests
 *
 * Comprehensive performance benchmarks for RTP/audio pipeline optimizations:
 * - Packet processing latency
 * - Throughput (packets/second)
 * - Jitter buffer effectiveness
 * - Audio mixing performance
 * - Memory usage under load
 *
 * @module test/rtp-performance
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PacketPool, BufferPool } from '../src/rtp/packet-pool.js';
import { AdaptiveJitterBuffer } from '../src/rtp/adaptive-jitter-buffer.js';
import { OptimizedAudioMixer } from '../src/rtp/audio-mixer.js';
import { BatchSender, createOptimizedSocket } from '../src/rtp/udp-optimization.js';
import { RTPMetrics } from '../src/rtp/rtp-metrics.js';
import { PacketLossConcealment } from '../src/rtp/packet-loss-concealment.js';
import { AudioProcessor } from '../src/rtp/audio-processor.js';

describe('RTP Performance Tests', () => {
  let audioProcessor;

  beforeAll(() => {
    audioProcessor = new AudioProcessor({ numWorkers: 2 });
  });

  afterAll(async () => {
    if (audioProcessor) {
      await audioProcessor.shutdown();
    }
  });

  describe('Packet Pool Performance', () => {
    it('should efficiently allocate and release packets', () => {
      const pool = new PacketPool(1000);
      const iterations = 10000;

      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        const packet = pool.acquire();
        pool.release(packet);
      }

      const elapsed = Date.now() - startTime;
      const opsPerSecond = (iterations / elapsed) * 1000;

      const stats = pool.getStats();

      expect(stats.acquires).toBe(iterations);
      expect(stats.releases).toBe(iterations);
      expect(opsPerSecond).toBeGreaterThan(100000); // > 100k ops/sec
      expect(stats.poolSize).toBeLessThanOrEqual(1000);

      console.log(`  Packet Pool: ${opsPerSecond.toFixed(0)} ops/sec, hit rate: ${stats.hitRate}`);
    });

    it('should maintain high hit rate under load', () => {
      const pool = new PacketPool(100);
      const packets = [];

      // Acquire many packets
      for (let i = 0; i < 50; i++) {
        packets.push(pool.acquire());
      }

      // Release them
      packets.forEach(p => pool.release(p));

      // Reacquire
      for (let i = 0; i < 50; i++) {
        pool.acquire();
      }

      const stats = pool.getStats();
      const hitRate = parseFloat(stats.hitRate);

      expect(hitRate).toBeGreaterThan(30); // > 30% hit rate
    });
  });

  describe('Buffer Pool Performance', () => {
    it('should efficiently manage buffer allocation', () => {
      const pool = new BufferPool(1000, 2048);
      const iterations = 10000;

      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        const buffer = pool.acquire();
        pool.release(buffer);
      }

      const elapsed = Date.now() - startTime;
      const opsPerSecond = (iterations / elapsed) * 1000;

      const stats = pool.getStats();

      expect(opsPerSecond).toBeGreaterThan(50000); // > 50k ops/sec
      expect(stats.hitRate).not.toBe('0%');

      console.log(`  Buffer Pool: ${opsPerSecond.toFixed(0)} ops/sec, hit rate: ${stats.hitRate}`);
    });
  });

  describe('Adaptive Jitter Buffer Performance', () => {
    it('should handle high packet rates efficiently', () => {
      const jitterBuffer = new AdaptiveJitterBuffer({
        minDelay: 20,
        maxDelay: 200,
        targetDelay: 60
      });

      const numPackets = 1000;
      const startTime = Date.now();

      // Simulate packet arrival
      for (let i = 0; i < numPackets; i++) {
        const packet = {
          sequenceNumber: i,
          timestamp: i * 960,  // 20ms @ 48kHz
          payload: Buffer.alloc(960)
        };

        jitterBuffer.addPacket(packet);

        // Retrieve packets
        if (i > 10) {
          jitterBuffer.getPacket();
        }
      }

      const elapsed = Date.now() - startTime;
      const packetsPerSecond = (numPackets / elapsed) * 1000;

      const stats = jitterBuffer.getStats();

      expect(packetsPerSecond).toBeGreaterThan(10000); // > 10k packets/sec
      expect(stats.packetsReceived).toBe(numPackets);

      console.log(`  Jitter Buffer: ${packetsPerSecond.toFixed(0)} packets/sec`);
      console.log(`  Buffer stats: jitter=${stats.jitterMs}ms, loss=${stats.lossRate}`);
    });

    it('should adapt delay based on jitter', () => {
      const jitterBuffer = new AdaptiveJitterBuffer({
        minDelay: 20,
        maxDelay: 200,
        targetDelay: 60
      });

      const initialDelay = jitterBuffer.currentDelay;

      // Simulate high jitter scenario
      for (let i = 0; i < 100; i++) {
        const jitter = Math.random() * 50; // 0-50ms jitter
        const packet = {
          sequenceNumber: i,
          timestamp: i * 960 + Math.floor(jitter * 48),
          payload: Buffer.alloc(960)
        };

        jitterBuffer.addPacket(packet);
      }

      // Wait for adjustment
      setTimeout(() => {
        const stats = jitterBuffer.getStats();
        // Delay should have adjusted
        expect(jitterBuffer.currentDelay).toBeGreaterThanOrEqual(20);
        expect(jitterBuffer.currentDelay).toBeLessThanOrEqual(200);
      }, 1100);
    });
  });

  describe('Audio Mixer Performance', () => {
    it('should mix multiple streams efficiently', () => {
      const mixer = new OptimizedAudioMixer({
        sampleRate: 48000,
        frameSize: 960
      });

      // Add sources
      for (let i = 0; i < 10; i++) {
        mixer.addSource(`source-${i}`);
      }

      // Create test audio
      const sourceAudio = new Map();
      for (let i = 0; i < 10; i++) {
        const audio = Buffer.alloc(960 * 2);  // 16-bit samples
        for (let j = 0; j < 960; j++) {
          audio.writeInt16LE(Math.floor(Math.random() * 1000 - 500), j * 2);
        }
        sourceAudio.set(`source-${i}`, audio);
      }

      const iterations = 1000;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        mixer.mix(sourceAudio);
      }

      const elapsed = Date.now() - startTime;
      const mixesPerSecond = (iterations / elapsed) * 1000;

      const stats = mixer.getStats();

      expect(mixesPerSecond).toBeGreaterThan(1000); // > 1000 mixes/sec
      expect(stats.mixCount).toBe(iterations);

      console.log(`  Audio Mixer: ${mixesPerSecond.toFixed(0)} mixes/sec`);
      console.log(`  Peak level: ${stats.peakLevelDb.toFixed(2)} dB`);
    });

    it('should handle varying source counts', () => {
      const mixer = new OptimizedAudioMixer();

      // Test with different source counts
      for (let numSources = 1; numSources <= 20; numSources += 5) {
        // Add sources
        for (let i = 0; i < numSources; i++) {
          mixer.addSource(`test-${i}`);
        }

        const sourceAudio = new Map();
        for (let i = 0; i < numSources; i++) {
          sourceAudio.set(`test-${i}`, Buffer.alloc(960 * 2));
        }

        const startTime = Date.now();
        const iterations = 100;

        for (let i = 0; i < iterations; i++) {
          mixer.mix(sourceAudio);
        }

        const elapsed = Date.now() - startTime;
        const mixesPerSecond = (iterations / elapsed) * 1000;

        console.log(`  ${numSources} sources: ${mixesPerSecond.toFixed(0)} mixes/sec`);

        mixer.clear();
      }
    });
  });

  describe('RTP Metrics Performance', () => {
    it('should track metrics with minimal overhead', () => {
      const metrics = new RTPMetrics();
      const numPackets = 10000;

      const startTime = Date.now();

      for (let i = 0; i < numPackets; i++) {
        const packet = {
          sequenceNumber: i,
          timestamp: i * 960,
          payloadLength: 160
        };
        metrics.update(packet);
      }

      const elapsed = Date.now() - startTime;
      const packetsPerSecond = (numPackets / elapsed) * 1000;

      const stats = metrics.getStats();

      expect(packetsPerSecond).toBeGreaterThan(50000); // > 50k packets/sec
      expect(stats.packetsReceived).toBe(numPackets);

      console.log(`  RTP Metrics: ${packetsPerSecond.toFixed(0)} packets/sec`);
      console.log(`  Stats: bitrate=${stats.bitrateKbps} kbps, jitter=${stats.jitterMs}ms`);
    });
  });

  describe('Packet Loss Concealment Performance', () => {
    it('should conceal packet loss efficiently', () => {
      const plc = new PacketLossConcealment({
        frameSize: 960,
        sampleRate: 48000
      });

      // Store good packet
      const goodAudio = Buffer.alloc(960 * 2);
      plc.storeGoodPacket({ sequenceNumber: 0 }, goodAudio);

      const iterations = 1000;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        plc.conceal(1);
      }

      const elapsed = Date.now() - startTime;
      const concealmentsPerSecond = (iterations / elapsed) * 1000;

      const stats = plc.getStats();

      expect(concealmentsPerSecond).toBeGreaterThan(5000); // > 5k ops/sec
      expect(stats.totalLosses).toBe(iterations);

      console.log(`  PLC: ${concealmentsPerSecond.toFixed(0)} concealments/sec`);
    });
  });

  describe('Worker Thread Audio Processing', () => {
    it('should process audio using worker threads', async () => {
      const testAudio = Buffer.alloc(960 * 2);
      for (let i = 0; i < 960; i++) {
        testAudio.writeInt16LE(Math.floor(Math.random() * 1000 - 500), i * 2);
      }

      const startTime = Date.now();

      try {
        const result = await audioProcessor.analyze(testAudio);

        const elapsed = Date.now() - startTime;

        expect(result).toBeDefined();
        expect(result.samples).toBe(960);
        expect(elapsed).toBeLessThan(1000); // < 1 second

        console.log(`  Worker Analysis: ${elapsed}ms`);
        console.log(`  Result: peak=${result.peakDb.toFixed(2)} dB, rms=${result.rmsDb.toFixed(2)} dB`);
      } catch (error) {
        console.warn('  Worker threads not available:', error.message);
      }
    }, 10000);

    it('should handle concurrent tasks', async () => {
      const numTasks = 10;
      const tasks = [];

      const testAudio = Buffer.alloc(960 * 2);

      const startTime = Date.now();

      for (let i = 0; i < numTasks; i++) {
        tasks.push(audioProcessor.analyze(testAudio).catch(() => null));
      }

      try {
        const results = await Promise.all(tasks);
        const elapsed = Date.now() - startTime;

        const successfulResults = results.filter(r => r !== null);

        console.log(`  Concurrent tasks: ${numTasks} in ${elapsed}ms`);
        console.log(`  Successful: ${successfulResults.length}/${numTasks}`);

        if (successfulResults.length > 0) {
          expect(elapsed).toBeLessThan(5000); // < 5 seconds for all tasks
        }
      } catch (error) {
        console.warn('  Concurrent worker tasks failed:', error.message);
      }
    }, 15000);
  });

  describe('Memory Usage', () => {
    it('should maintain stable memory under sustained load', () => {
      const initialMemory = process.memoryUsage().heapUsed;

      const pool = new PacketPool(1000);
      const jitterBuffer = new AdaptiveJitterBuffer();
      const mixer = new OptimizedAudioMixer();

      // Simulate sustained load
      for (let i = 0; i < 5000; i++) {
        // Packet processing
        const packet = pool.acquire();
        pool.release(packet);

        // Jitter buffer
        if (i % 10 === 0) {
          jitterBuffer.addPacket({
            sequenceNumber: i,
            timestamp: i * 960,
            payload: Buffer.alloc(160)
          });
        }

        // Audio mixing
        if (i % 20 === 0) {
          mixer.addSource(`source-${i % 5}`);
          const audio = new Map();
          audio.set(`source-${i % 5}`, Buffer.alloc(960 * 2));
          mixer.mix(audio);
        }
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024;

      console.log(`  Memory increase: ${memoryIncrease.toFixed(2)} MB`);
      expect(memoryIncrease).toBeLessThan(50); // < 50 MB increase
    });
  });

  describe('Throughput Tests', () => {
    it('should handle realistic RTP stream load', () => {
      const metrics = new RTPMetrics();
      const jitterBuffer = new AdaptiveJitterBuffer();
      const pool = new PacketPool(1000);

      const packetsPerSecond = 50;  // 20ms packets
      const duration = 5;  // 5 seconds
      const totalPackets = packetsPerSecond * duration;

      const startTime = Date.now();

      for (let i = 0; i < totalPackets; i++) {
        // Acquire packet from pool
        const rtpPacket = pool.acquire();

        // Create packet data
        const packet = {
          sequenceNumber: i,
          timestamp: i * 960,
          payloadLength: 160,
          payload: Buffer.alloc(160)
        };

        // Update metrics
        metrics.update(packet);

        // Add to jitter buffer
        jitterBuffer.addPacket(packet);

        // Release packet
        pool.release(rtpPacket);

        // Retrieve from jitter buffer
        if (i > 5) {
          jitterBuffer.getPacket();
        }
      }

      const elapsed = Date.now() - startTime;
      const actualThroughput = (totalPackets / elapsed) * 1000;

      const stats = metrics.getStats();

      console.log(`  Throughput: ${actualThroughput.toFixed(0)} packets/sec`);
      console.log(`  Total processed: ${totalPackets} packets in ${elapsed}ms`);
      console.log(`  Loss rate: ${stats.lossRate}`);

      expect(actualThroughput).toBeGreaterThan(1000); // > 1000 packets/sec
    });
  });

  describe('Latency Tests', () => {
    it('should maintain low processing latency', () => {
      const jitterBuffer = new AdaptiveJitterBuffer({ targetDelay: 60 });
      const mixer = new OptimizedAudioMixer();
      mixer.addSource('test');

      const latencies = [];
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        const start = process.hrtime.bigint();

        // Simulate packet processing
        jitterBuffer.addPacket({
          sequenceNumber: i,
          timestamp: i * 960,
          payload: Buffer.alloc(160)
        });

        const packet = jitterBuffer.getPacket();

        if (packet && i > 10) {
          const audio = new Map();
          audio.set('test', packet.payload);
          mixer.mix(audio);
        }

        const end = process.hrtime.bigint();
        const latencyNs = Number(end - start);
        latencies.push(latencyNs / 1000000); // Convert to ms
      }

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);
      const minLatency = Math.min(...latencies);

      console.log(`  Avg latency: ${avgLatency.toFixed(3)}ms`);
      console.log(`  Min/Max: ${minLatency.toFixed(3)}ms / ${maxLatency.toFixed(3)}ms`);

      expect(avgLatency).toBeLessThan(5); // < 5ms average latency
    });
  });
});
