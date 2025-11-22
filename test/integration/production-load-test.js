/**
 * ESP32 RoIP System - Production Load Test Suite
 *
 * Performance testing under production-like conditions:
 * - High concurrent connections
 * - Sustained load over time
 * - Resource usage monitoring
 * - Latency and throughput measurement
 * - System limits discovery
 *
 * @author ESP32 RoIP Team
 * @version 1.0.0
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { TestDevice, TEST_CONFIG } from './final-e2e-suite.test.js';
import os from 'os';

// Production load test configuration
const LOAD_TEST_CONFIG = {
  ...TEST_CONFIG,
  testTimeout: 300000, // 5 minutes

  // Load levels
  lightLoad: { devices: 5, calls: 2, duration: 30000 },
  mediumLoad: { devices: 10, calls: 5, duration: 60000 },
  heavyLoad: { devices: 20, calls: 10, duration: 120000 },

  // Performance targets
  targets: {
    registrationTime: 5000, // ms
    callSetupTime: 3000, // ms
    maxCpuUsage: 80, // percent
    maxMemoryMB: 500, // MB
    maxLatency: 200, // ms
    maxJitter: 30, // ms
    maxPacketLoss: 1.0, // percent
    minThroughput: 100, // kbps per call
  },

  // Monitoring intervals
  monitorInterval: 1000, // ms
  statsInterval: 5000, // ms
};

// Performance monitor
class PerformanceMonitor {
  constructor() {
    this.metrics = {
      cpu: [],
      memory: [],
      latency: [],
      throughput: [],
      errors: [],
    };
    this.startTime = null;
    this.intervalId = null;
  }

  start() {
    this.startTime = Date.now();
    this.intervalId = setInterval(() => this.collect(), LOAD_TEST_CONFIG.monitorInterval);
  }

  collect() {
    const now = Date.now();
    const elapsed = now - this.startTime;

    // CPU usage (basic estimation)
    const cpuUsage = process.cpuUsage();
    const totalUsage = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds
    const cpuPercent = (totalUsage / (elapsed / 1000)) * 100;

    // Memory usage
    const memUsage = process.memoryUsage();
    const memoryMB = memUsage.heapUsed / 1024 / 1024;

    this.metrics.cpu.push({ timestamp: now, value: cpuPercent });
    this.metrics.memory.push({ timestamp: now, value: memoryMB });
  }

  recordLatency(latencyMs) {
    this.metrics.latency.push({
      timestamp: Date.now(),
      value: latencyMs
    });
  }

  recordThroughput(kbps) {
    this.metrics.throughput.push({
      timestamp: Date.now(),
      value: kbps
    });
  }

  recordError(error) {
    this.metrics.errors.push({
      timestamp: Date.now(),
      error: error.message
    });
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  getStats() {
    const stats = {
      duration: Date.now() - this.startTime,
      cpu: this.calculateStats(this.metrics.cpu),
      memory: this.calculateStats(this.metrics.memory),
      latency: this.calculateStats(this.metrics.latency),
      throughput: this.calculateStats(this.metrics.throughput),
      errorCount: this.metrics.errors.length,
      errors: this.metrics.errors
    };

    return stats;
  }

  calculateStats(dataPoints) {
    if (dataPoints.length === 0) {
      return { min: 0, max: 0, avg: 0, p95: 0, p99: 0 };
    }

    const values = dataPoints.map(d => d.value).sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);

    return {
      min: values[0],
      max: values[values.length - 1],
      avg: sum / values.length,
      p95: values[Math.floor(values.length * 0.95)],
      p99: values[Math.floor(values.length * 0.99)],
      count: values.length
    };
  }

  meetsTargets() {
    const stats = this.getStats();
    const targets = LOAD_TEST_CONFIG.targets;

    return {
      cpu: stats.cpu.avg < targets.maxCpuUsage,
      memory: stats.memory.max < targets.maxMemoryMB,
      latency: stats.latency.avg < targets.maxLatency,
      throughput: stats.throughput.avg > targets.minThroughput,
      overall:
        stats.cpu.avg < targets.maxCpuUsage &&
        stats.memory.max < targets.maxMemoryMB &&
        (stats.latency.count === 0 || stats.latency.avg < targets.maxLatency) &&
        (stats.throughput.count === 0 || stats.throughput.avg > targets.minThroughput)
    };
  }
}

// Load test scenario runner
class LoadTestScenario {
  constructor(name, config) {
    this.name = name;
    this.config = config;
    this.devices = [];
    this.monitor = new PerformanceMonitor();
  }

  async setup() {
    this.monitor.start();

    // Create and initialize devices
    for (let i = 0; i < this.config.devices; i++) {
      const device = new TestDevice(`load-${this.name}-${i}`, `password-${i}`);
      await device.initialize();
      this.devices.push(device);
    }
  }

  async registerAllDevices() {
    const startTime = Date.now();

    const results = await Promise.allSettled(
      this.devices.map(d => d.register())
    );

    const duration = Date.now() - startTime;
    this.monitor.recordLatency(duration / this.devices.length);

    const successes = results.filter(r => r.status === 'fulfilled');
    return {
      total: results.length,
      successful: successes.length,
      failed: results.length - successes.length,
      avgTime: duration / results.length
    };
  }

  async establishCalls() {
    const callPairs = [];
    const numCalls = Math.min(this.config.calls, Math.floor(this.devices.length / 2));

    for (let i = 0; i < numCalls * 2; i += 2) {
      callPairs.push({ caller: i, callee: i + 1 });
    }

    const results = await Promise.allSettled(
      callPairs.map(pair =>
        this.devices[pair.caller].initiateCall(`load-${this.name}-${pair.callee}`)
      )
    );

    const successes = results.filter(r => r.status === 'fulfilled');
    return {
      total: results.length,
      successful: successes.length,
      failed: results.length - successes.length
    };
  }

  async runAudioLoad() {
    const duration = this.config.duration;
    const interval = 1000; // Send audio every second
    const iterations = Math.floor(duration / interval);

    for (let iter = 0; iter < iterations; iter++) {
      // Send audio from all active callers
      for (let i = 0; i < this.devices.length; i += 2) {
        if (this.devices[i].inCall) {
          try {
            this.devices[i].sendAudio(interval);
          } catch (error) {
            this.monitor.recordError(error);
          }
        }
      }

      // Collect stats from receivers
      for (let i = 1; i < this.devices.length; i += 2) {
        const stats = this.devices[i].getStats();
        if (stats.packetsReceived > 0) {
          // Calculate throughput
          const kbps = (stats.bytesReceived * 8) / (duration / 1000) / 1000;
          this.monitor.recordThroughput(kbps);
        }
      }

      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }

  async cleanup() {
    // End all calls
    for (let i = 0; i < this.devices.length; i += 2) {
      if (this.devices[i].inCall) {
        try {
          await this.devices[i].endCall(`load-${this.name}-${i + 1}`);
        } catch (error) {
          this.monitor.recordError(error);
        }
      }
    }

    // Cleanup devices
    await Promise.all(this.devices.map(d => d.cleanup()));
    this.devices = [];

    this.monitor.stop();
  }

  getResults() {
    return {
      scenario: this.name,
      config: this.config,
      stats: this.monitor.getStats(),
      meetsTargets: this.monitor.meetsTargets()
    };
  }
}

describe('Production Load Test Suite', () => {
  describe('1. Light Load Tests', () => {
    test('should handle light load (5 devices, 2 calls)', async () => {
      const scenario = new LoadTestScenario('light', LOAD_TEST_CONFIG.lightLoad);

      await scenario.setup();

      // Register devices
      const regResults = await scenario.registerAllDevices();
      expect(regResults.successful).toBe(LOAD_TEST_CONFIG.lightLoad.devices);
      expect(regResults.avgTime).toBeLessThan(LOAD_TEST_CONFIG.targets.registrationTime);

      // Establish calls
      const callResults = await scenario.establishCalls();
      expect(callResults.successful).toBeGreaterThanOrEqual(1);

      // Run audio load
      await scenario.runAudioLoad();

      // Cleanup and get results
      await scenario.cleanup();
      const results = scenario.getResults();

      // Verify targets met
      expect(results.meetsTargets.overall).toBe(true);
      expect(results.stats.errorCount).toBe(0);

      console.log('Light Load Results:', JSON.stringify(results, null, 2));
    }, LOAD_TEST_CONFIG.testTimeout);
  });

  describe('2. Medium Load Tests', () => {
    test('should handle medium load (10 devices, 5 calls)', async () => {
      const scenario = new LoadTestScenario('medium', LOAD_TEST_CONFIG.mediumLoad);

      await scenario.setup();

      const regResults = await scenario.registerAllDevices();
      expect(regResults.successful).toBeGreaterThanOrEqual(
        Math.floor(LOAD_TEST_CONFIG.mediumLoad.devices * 0.9) // 90% success rate
      );

      const callResults = await scenario.establishCalls();
      expect(callResults.successful).toBeGreaterThanOrEqual(
        Math.floor(LOAD_TEST_CONFIG.mediumLoad.calls * 0.8) // 80% success rate
      );

      await scenario.runAudioLoad();
      await scenario.cleanup();

      const results = scenario.getResults();

      // Allow slightly relaxed targets for medium load
      expect(results.stats.cpu.avg).toBeLessThan(LOAD_TEST_CONFIG.targets.maxCpuUsage);
      expect(results.stats.memory.max).toBeLessThan(LOAD_TEST_CONFIG.targets.maxMemoryMB);

      console.log('Medium Load Results:', JSON.stringify(results, null, 2));
    }, LOAD_TEST_CONFIG.testTimeout);
  });

  describe('3. Heavy Load Tests', () => {
    test('should handle heavy load (20 devices, 10 calls)', async () => {
      const scenario = new LoadTestScenario('heavy', LOAD_TEST_CONFIG.heavyLoad);

      await scenario.setup();

      const regResults = await scenario.registerAllDevices();
      expect(regResults.successful).toBeGreaterThanOrEqual(
        Math.floor(LOAD_TEST_CONFIG.heavyLoad.devices * 0.8) // 80% success rate
      );

      const callResults = await scenario.establishCalls();
      expect(callResults.successful).toBeGreaterThanOrEqual(
        Math.floor(LOAD_TEST_CONFIG.heavyLoad.calls * 0.7) // 70% success rate
      );

      await scenario.runAudioLoad();
      await scenario.cleanup();

      const results = scenario.getResults();

      // System should remain stable even if not meeting all targets
      expect(results.stats.errorCount).toBeLessThan(
        LOAD_TEST_CONFIG.heavyLoad.calls // Less than 1 error per call
      );

      console.log('Heavy Load Results:', JSON.stringify(results, null, 2));
    }, LOAD_TEST_CONFIG.testTimeout);
  });

  describe('4. Sustained Load Tests', () => {
    test('should maintain stability under sustained load', async () => {
      const monitor = new PerformanceMonitor();
      monitor.start();

      const devices = [];
      const numDevices = 8;
      const testDuration = 60000; // 1 minute

      // Setup
      for (let i = 0; i < numDevices; i++) {
        const device = new TestDevice(`sustained-${i}`, `password-${i}`);
        await device.initialize();
        await device.register();
        devices.push(device);
      }

      // Establish 4 calls
      for (let i = 0; i < numDevices; i += 2) {
        await devices[i].initiateCall(`sustained-${i + 1}`);
      }

      // Sustained audio transmission
      const startTime = Date.now();
      const errors = [];

      while (Date.now() - startTime < testDuration) {
        for (let i = 0; i < numDevices; i += 2) {
          if (devices[i].inCall) {
            try {
              devices[i].sendAudio(1000);
            } catch (error) {
              errors.push(error);
              monitor.recordError(error);
            }
          }
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Cleanup
      for (let i = 0; i < numDevices; i += 2) {
        if (devices[i].inCall) {
          await devices[i].endCall(`sustained-${i + 1}`);
        }
      }

      await Promise.all(devices.map(d => d.cleanup()));
      monitor.stop();

      const stats = monitor.getStats();

      // Verify stability
      expect(errors.length).toBeLessThan(10); // Less than 10 errors over 1 minute
      expect(stats.cpu.avg).toBeLessThan(LOAD_TEST_CONFIG.targets.maxCpuUsage);
      expect(stats.memory.max).toBeLessThan(LOAD_TEST_CONFIG.targets.maxMemoryMB);

      console.log('Sustained Load Stats:', JSON.stringify(stats, null, 2));
    }, LOAD_TEST_CONFIG.testTimeout);
  });

  describe('5. Spike Load Tests', () => {
    test('should handle sudden traffic spikes', async () => {
      const monitor = new PerformanceMonitor();
      monitor.start();

      // Normal load: 4 devices
      let devices = [];
      for (let i = 0; i < 4; i++) {
        const device = new TestDevice(`spike-normal-${i}`, `password-${i}`);
        await device.initialize();
        await device.register();
        devices.push(device);
      }

      // Establish 2 calls
      await devices[0].initiateCall('spike-normal-1');
      await devices[2].initiateCall('spike-normal-3');

      // Send normal audio
      for (let i = 0; i < 5; i++) {
        devices[0].sendAudio(1000);
        devices[2].sendAudio(1000);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // SPIKE: Add 12 more devices suddenly
      const spikeDevices = [];
      const startTime = Date.now();

      for (let i = 0; i < 12; i++) {
        const device = new TestDevice(`spike-sudden-${i}`, `password-${i}`);
        await device.initialize();
        spikeDevices.push(device);
      }

      const regResults = await Promise.allSettled(
        spikeDevices.map(d => d.register())
      );

      const spikeTime = Date.now() - startTime;
      monitor.recordLatency(spikeTime);

      devices.push(...spikeDevices);

      // Establish spike calls
      for (let i = 0; i < 12; i += 2) {
        try {
          await spikeDevices[i].initiateCall(`spike-sudden-${i + 1}`);
        } catch (error) {
          monitor.recordError(error);
        }
      }

      // Send audio from all
      for (let i = 0; i < 3; i++) {
        devices.forEach((device, idx) => {
          if (idx % 2 === 0 && device.inCall) {
            try {
              device.sendAudio(1000);
            } catch (error) {
              monitor.recordError(error);
            }
          }
        });
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Cleanup
      for (let i = 0; i < devices.length; i += 2) {
        if (devices[i].inCall) {
          try {
            const targetId = devices[i].deviceId.replace(/\d+$/, (parseInt(devices[i].deviceId.match(/\d+$/)[0]) + 1));
            await devices[i].endCall(targetId);
          } catch (error) {
            // Ignore cleanup errors
          }
        }
      }

      await Promise.all(devices.map(d => d.cleanup()));
      monitor.stop();

      const stats = monitor.getStats();

      // System should handle spike without crashing
      const successfulRegs = regResults.filter(r => r.status === 'fulfilled').length;
      expect(successfulRegs).toBeGreaterThanOrEqual(8); // At least 67% success during spike

      console.log('Spike Load Stats:', JSON.stringify(stats, null, 2));
    }, LOAD_TEST_CONFIG.testTimeout);
  });

  describe('6. Resource Usage Tests', () => {
    test('should not leak memory over time', async () => {
      if (global.gc) global.gc();

      const initialMemory = process.memoryUsage().heapUsed;
      const iterations = 10;
      const devices = [];

      for (let iter = 0; iter < iterations; iter++) {
        // Create 2 devices
        const device1 = new TestDevice(`memleak-${iter}-1`, `password-1`);
        const device2 = new TestDevice(`memleak-${iter}-2`, `password-2`);

        await device1.initialize();
        await device2.initialize();
        await device1.register();
        await device2.register();

        // Make a call
        await device1.initiateCall(`memleak-${iter}-2`);
        device1.sendAudio(1000);
        await new Promise(resolve => setTimeout(resolve, 1500));
        await device1.endCall(`memleak-${iter}-2`);

        // Cleanup
        await device1.cleanup();
        await device2.cleanup();

        if (global.gc && iter % 3 === 0) global.gc();
      }

      if (global.gc) global.gc();

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

      // Memory should not increase significantly (< 50MB for 10 iterations)
      expect(memoryIncrease).toBeLessThan(50);

      console.log(`Memory increase: ${memoryIncrease.toFixed(2)} MB`);
    }, LOAD_TEST_CONFIG.testTimeout);

    test('should use CPU efficiently', async () => {
      const monitor = new PerformanceMonitor();
      monitor.start();

      const devices = [];
      for (let i = 0; i < 4; i++) {
        const device = new TestDevice(`cpu-test-${i}`, `password-${i}`);
        await device.initialize();
        await device.register();
        devices.push(device);
      }

      // Establish 2 calls
      await devices[0].initiateCall('cpu-test-1');
      await devices[2].initiateCall('cpu-test-3');

      // Moderate load for 10 seconds
      for (let i = 0; i < 10; i++) {
        devices[0].sendAudio(1000);
        devices[2].sendAudio(1000);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      await devices[0].endCall('cpu-test-1');
      await devices[2].endCall('cpu-test-3');
      await Promise.all(devices.map(d => d.cleanup()));

      monitor.stop();
      const stats = monitor.getStats();

      // CPU should stay within reasonable limits
      expect(stats.cpu.avg).toBeLessThan(LOAD_TEST_CONFIG.targets.maxCpuUsage);
      expect(stats.cpu.max).toBeLessThan(95); // Peak shouldn't exceed 95%

      console.log('CPU Usage Stats:', JSON.stringify(stats.cpu, null, 2));
    }, LOAD_TEST_CONFIG.testTimeout);
  });

  describe('7. Throughput and Latency Tests', () => {
    test('should maintain target throughput per call', async () => {
      const devices = [];
      for (let i = 0; i < 4; i++) {
        const device = new TestDevice(`throughput-${i}`, `password-${i}`);
        await device.initialize();
        await device.register();
        devices.push(device);
      }

      await devices[0].initiateCall('throughput-1');
      await devices[2].initiateCall('throughput-3');

      // Send known amount of data
      const testDuration = 10000; // 10 seconds
      const startTime = Date.now();

      devices[0].sendAudio(testDuration);
      devices[2].sendAudio(testDuration);

      await new Promise(resolve => setTimeout(resolve, testDuration + 2000));

      const stats1 = devices[1].getStats();
      const stats3 = devices[3].getStats();

      const duration = (Date.now() - startTime) / 1000; // seconds
      const throughput1 = (stats1.bytesReceived * 8) / duration / 1000; // kbps
      const throughput3 = (stats3.bytesReceived * 8) / duration / 1000; // kbps

      expect(throughput1).toBeGreaterThan(LOAD_TEST_CONFIG.targets.minThroughput);
      expect(throughput3).toBeGreaterThan(LOAD_TEST_CONFIG.targets.minThroughput);

      await devices[0].endCall('throughput-1');
      await devices[2].endCall('throughput-3');
      await Promise.all(devices.map(d => d.cleanup()));

      console.log(`Throughput: Call 1 = ${throughput1.toFixed(2)} kbps, Call 2 = ${throughput3.toFixed(2)} kbps`);
    }, LOAD_TEST_CONFIG.testTimeout);

    test('should maintain low latency under load', async () => {
      const devices = [];
      const latencies = [];

      for (let i = 0; i < 6; i++) {
        const device = new TestDevice(`latency-${i}`, `password-${i}`);
        await device.initialize();
        await device.register();
        devices.push(device);
      }

      // Establish 3 calls and measure setup time
      for (let i = 0; i < 6; i += 2) {
        const startTime = Date.now();
        await devices[i].initiateCall(`latency-${i + 1}`);
        const latency = Date.now() - startTime;
        latencies.push(latency);
      }

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;

      expect(avgLatency).toBeLessThan(LOAD_TEST_CONFIG.targets.callSetupTime);

      for (let i = 0; i < 6; i += 2) {
        await devices[i].endCall(`latency-${i + 1}`);
      }

      await Promise.all(devices.map(d => d.cleanup()));

      console.log(`Average call setup latency: ${avgLatency.toFixed(2)} ms`);
    }, LOAD_TEST_CONFIG.testTimeout);
  });
});

// Export
export { LOAD_TEST_CONFIG, PerformanceMonitor, LoadTestScenario };
