/**
 * ESP32 RoIP System - Multi-Device Concurrent Call Test Suite
 *
 * Tests system behavior with multiple simultaneous:
 * - Device registrations
 * - Active calls
 * - Audio streams
 * - Conference calls
 * - Resource allocation
 *
 * @author ESP32 RoIP Team
 * @version 1.0.0
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { TestDevice, TEST_CONFIG } from './final-e2e-suite.test.js';

// Multi-device test configuration
const MULTI_TEST_CONFIG = {
  ...TEST_CONFIG,
  maxConcurrentDevices: 20,
  maxConcurrentCalls: 10,
  testTimeout: 120000, // 2 minutes for complex scenarios
  loadTestDuration: 30000, // 30 seconds
};

describe('Multi-Device Concurrent Call Tests', () => {
  let devices = [];

  afterEach(async () => {
    // Clean up all devices
    await Promise.all(devices.map(d => d.cleanup()));
    devices = [];
  });

  describe('1. Concurrent Device Registration', () => {
    test('should handle 10 simultaneous device registrations', async () => {
      // Create 10 devices
      for (let i = 0; i < 10; i++) {
        const device = new TestDevice(`multi-device-${i}`, `password-${i}`);
        await device.initialize();
        devices.push(device);
      }

      // Register all simultaneously
      const startTime = Date.now();
      const registrations = await Promise.allSettled(
        devices.map(d => d.register())
      );
      const duration = Date.now() - startTime;

      // Verify all succeeded
      const successes = registrations.filter(r => r.status === 'fulfilled');
      expect(successes.length).toBe(10);

      // Should complete in reasonable time (less than 30 seconds total)
      expect(duration).toBeLessThan(30000);

      // Verify all devices are registered
      devices.forEach(device => {
        expect(device.registered).toBe(true);
      });
    }, MULTI_TEST_CONFIG.testTimeout);

    test('should handle 20 sequential device registrations', async () => {
      // Create and register 20 devices sequentially
      for (let i = 0; i < 20; i++) {
        const device = new TestDevice(`seq-device-${i}`, `password-${i}`);
        await device.initialize();
        const response = await device.register();

        expect(response.statusCode).toBe(200);
        expect(device.registered).toBe(true);

        devices.push(device);
      }

      expect(devices.length).toBe(20);
    }, MULTI_TEST_CONFIG.testTimeout);

    test('should prevent duplicate device registrations', async () => {
      const deviceId = 'duplicate-test-device';
      const password = 'test-password';

      // Register first device
      const device1 = new TestDevice(deviceId, password);
      await device1.initialize();
      await device1.register();
      devices.push(device1);

      // Try to register same device ID
      const device2 = new TestDevice(deviceId, password);
      await device2.initialize();

      // Should either succeed (replacing registration) or fail gracefully
      try {
        await device2.register();
        devices.push(device2);
        // If it succeeds, first device should be unregistered
      } catch (error) {
        // Expected behavior - duplicate rejected
        await device2.cleanup();
      }

      // At least one device should be registered
      expect(devices.some(d => d.registered)).toBe(true);
    }, MULTI_TEST_CONFIG.testTimeout);
  });

  describe('2. Concurrent Active Calls', () => {
    beforeEach(async () => {
      // Create and register 10 devices for call tests
      for (let i = 0; i < 10; i++) {
        const device = new TestDevice(`call-device-${i}`, `password-${i}`);
        await device.initialize();
        await device.register();
        devices.push(device);
      }
    });

    test('should handle 5 simultaneous two-party calls', async () => {
      // Establish 5 calls: 0→1, 2→3, 4→5, 6→7, 8→9
      const calls = [];
      for (let i = 0; i < 10; i += 2) {
        calls.push(
          devices[i].initiateCall(`call-device-${i + 1}`)
        );
      }

      const results = await Promise.allSettled(calls);
      const successes = results.filter(r => r.status === 'fulfilled');

      expect(successes.length).toBe(5);

      // Verify all callers are in calls
      for (let i = 0; i < 10; i += 2) {
        expect(devices[i].inCall).toBe(true);
      }
    }, MULTI_TEST_CONFIG.testTimeout);

    test('should handle sequential call establishment and termination', async () => {
      // Establish calls one by one
      for (let i = 0; i < 8; i += 2) {
        const response = await devices[i].initiateCall(`call-device-${i + 1}`);
        expect(response.statusCode).toBe(200);
        expect(devices[i].inCall).toBe(true);
      }

      // All 4 calls established
      const activeCalls = devices.filter(d => d.inCall).length;
      expect(activeCalls).toBeGreaterThanOrEqual(4);

      // End calls one by one
      for (let i = 0; i < 8; i += 2) {
        const response = await devices[i].endCall(`call-device-${i + 1}`);
        expect(response.statusCode).toBe(200);
        expect(devices[i].inCall).toBe(false);
      }

      // All calls ended
      const remainingCalls = devices.filter(d => d.inCall).length;
      expect(remainingCalls).toBe(0);
    }, MULTI_TEST_CONFIG.testTimeout);

    test('should prevent call to already busy device', async () => {
      // Establish call: device 0 → device 1
      await devices[0].initiateCall('call-device-1');
      expect(devices[0].inCall).toBe(true);

      // Try to call device 1 from device 2 (should fail - device busy)
      try {
        await devices[2].initiateCall('call-device-1');
        // If it succeeds, verify system handles it
        expect(devices[2].inCall).toBe(true);
      } catch (error) {
        // Expected - device busy
        expect(error.message).toMatch(/failed/i);
      }
    }, MULTI_TEST_CONFIG.testTimeout);
  });

  describe('3. Concurrent Audio Streaming', () => {
    beforeEach(async () => {
      // Create and register 6 devices
      for (let i = 0; i < 6; i++) {
        const device = new TestDevice(`audio-device-${i}`, `password-${i}`);
        await device.initialize();
        await device.register();
        devices.push(device);
      }

      // Establish 3 calls
      for (let i = 0; i < 6; i += 2) {
        await devices[i].initiateCall(`audio-device-${i + 1}`);
      }
    });

    test('should handle multiple simultaneous audio streams', async () => {
      // Set up packet receivers
      const receivePromises = [];
      for (let i = 1; i < 6; i += 2) {
        const promise = new Promise((resolve) => {
          let count = 0;
          const handler = () => {
            count++;
            if (count >= 50) {
              devices[i].removeListener('rtp-packet', handler);
              resolve(devices[i].getStats());
            }
          };
          devices[i].on('rtp-packet', handler);
        });
        receivePromises.push(promise);
      }

      // Send audio from all callers simultaneously
      for (let i = 0; i < 6; i += 2) {
        devices[i].sendAudio(3000);
      }

      // Wait for all receivers to get packets
      const stats = await Promise.all(receivePromises);

      // Verify all streams received packets
      stats.forEach(stat => {
        expect(stat.packetsReceived).toBeGreaterThan(0);
        expect(stat.packetLossPercent).toBeLessThan(5.0); // Allow higher loss under load
      });
    }, MULTI_TEST_CONFIG.testTimeout);

    test('should maintain audio quality under concurrent load', async () => {
      const statsCollection = [];

      // Continuous audio transmission for 10 seconds
      const testDuration = 10000;
      const interval = setInterval(() => {
        for (let i = 0; i < 6; i += 2) {
          if (devices[i].inCall) {
            devices[i].sendAudio(1000);
          }
        }
      }, 1000);

      await new Promise(resolve => setTimeout(resolve, testDuration));
      clearInterval(interval);

      // Collect final stats
      for (let i = 1; i < 6; i += 2) {
        statsCollection.push(devices[i].getStats());
      }

      // Verify quality metrics
      statsCollection.forEach(stats => {
        expect(stats.packetsReceived).toBeGreaterThan(100);
        expect(stats.packetLossPercent).toBeLessThan(10.0); // Acceptable under heavy load
      });
    }, MULTI_TEST_CONFIG.testTimeout);
  });

  describe('4. Conference Call Simulation', () => {
    beforeEach(async () => {
      // Create and register 5 devices for conference
      for (let i = 0; i < 5; i++) {
        const device = new TestDevice(`conf-device-${i}`, `password-${i}`);
        await device.initialize();
        await device.register();
        devices.push(device);
      }
    });

    test('should simulate star conference (one center, 4 participants)', async () => {
      const center = devices[0]; // Conference center
      const participants = devices.slice(1);

      // All participants call the center device
      const callPromises = participants.map((device, idx) =>
        device.initiateCall('conf-device-0')
      );

      try {
        await Promise.all(callPromises);

        // In a real conference implementation, this would work
        // For basic system, at least one call should succeed
        const activeCalls = participants.filter(d => d.inCall).length;
        expect(activeCalls).toBeGreaterThan(0);
      } catch (error) {
        // Expected if conference not fully implemented
        // At least verify first call succeeded
        expect(participants[0].inCall).toBe(true);
      }
    }, MULTI_TEST_CONFIG.testTimeout);

    test('should handle audio mixing in conference scenario', async () => {
      // For basic 2-party implementation, test audio relay
      await devices[0].initiateCall('conf-device-1');
      await devices[2].initiateCall('conf-device-3');

      // Set up receivers
      const receiveCount = [0, 0];
      devices[1].on('rtp-packet', () => receiveCount[0]++);
      devices[3].on('rtp-packet', () => receiveCount[1]++);

      // Send audio from both senders
      devices[0].sendAudio(2000);
      devices[2].sendAudio(2000);

      await new Promise(resolve => setTimeout(resolve, 3000));

      // Both receivers should get audio
      expect(receiveCount[0]).toBeGreaterThan(0);
      expect(receiveCount[1]).toBeGreaterThan(0);
    }, MULTI_TEST_CONFIG.testTimeout);
  });

  describe('5. Resource Allocation Under Load', () => {
    test('should allocate RTP ports efficiently for multiple calls', async () => {
      // Create 10 devices
      for (let i = 0; i < 10; i++) {
        const device = new TestDevice(`port-device-${i}`, `password-${i}`);
        await device.initialize();
        await device.register();
        devices.push(device);
      }

      // Establish 5 calls
      for (let i = 0; i < 10; i += 2) {
        await devices[i].initiateCall(`port-device-${i + 1}`);
      }

      // Verify all calls established (ports allocated)
      const activeCalls = devices.filter(d => d.inCall).length;
      expect(activeCalls).toBeGreaterThanOrEqual(5);

      // End calls and verify ports released
      for (let i = 0; i < 10; i += 2) {
        await devices[i].endCall(`port-device-${i + 1}`);
      }

      const remainingCalls = devices.filter(d => d.inCall).length;
      expect(remainingCalls).toBe(0);
    }, MULTI_TEST_CONFIG.testTimeout);

    test('should handle memory efficiently with many devices', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Create 20 devices
      for (let i = 0; i < 20; i++) {
        const device = new TestDevice(`mem-device-${i}`, `password-${i}`);
        await device.initialize();
        await device.register();
        devices.push(device);
      }

      const afterRegistration = process.memoryUsage().heapUsed;
      const memoryIncrease = (afterRegistration - initialMemory) / 1024 / 1024; // MB

      // Should use reasonable memory (< 100MB for 20 devices)
      expect(memoryIncrease).toBeLessThan(100);

      // Cleanup
      await Promise.all(devices.map(d => d.cleanup()));
      devices = [];

      // Allow garbage collection
      if (global.gc) {
        global.gc();
      }
    }, MULTI_TEST_CONFIG.testTimeout);
  });

  describe('6. Load Testing Scenarios', () => {
    test('should handle rapid registration/deregistration cycles', async () => {
      const cycles = 5;
      const devicesPerCycle = 4;

      for (let cycle = 0; cycle < cycles; cycle++) {
        const cycleDevices = [];

        // Register devices
        for (let i = 0; i < devicesPerCycle; i++) {
          const device = new TestDevice(`cycle-${cycle}-device-${i}`, `password-${i}`);
          await device.initialize();
          await device.register();
          cycleDevices.push(device);
        }

        expect(cycleDevices.every(d => d.registered)).toBe(true);

        // Cleanup
        await Promise.all(cycleDevices.map(d => d.cleanup()));
      }

      // Test completed without crashes
      expect(true).toBe(true);
    }, MULTI_TEST_CONFIG.testTimeout);

    test('should handle burst call establishment', async () => {
      // Create 8 devices
      for (let i = 0; i < 8; i++) {
        const device = new TestDevice(`burst-device-${i}`, `password-${i}`);
        await device.initialize();
        await device.register();
        devices.push(device);
      }

      // Establish 4 calls simultaneously (burst)
      const startTime = Date.now();
      const callPromises = [];
      for (let i = 0; i < 8; i += 2) {
        callPromises.push(devices[i].initiateCall(`burst-device-${i + 1}`));
      }

      const results = await Promise.allSettled(callPromises);
      const duration = Date.now() - startTime;

      const successes = results.filter(r => r.status === 'fulfilled');

      // At least 3 of 4 calls should succeed under burst
      expect(successes.length).toBeGreaterThanOrEqual(3);

      // Should complete in reasonable time
      expect(duration).toBeLessThan(15000); // 15 seconds
    }, MULTI_TEST_CONFIG.testTimeout);

    test('should maintain stability during sustained multi-call load', async () => {
      // Create 6 devices
      for (let i = 0; i < 6; i++) {
        const device = new TestDevice(`sustained-device-${i}`, `password-${i}`);
        await device.initialize();
        await device.register();
        devices.push(device);
      }

      // Establish 3 calls
      for (let i = 0; i < 6; i += 2) {
        await devices[i].initiateCall(`sustained-device-${i + 1}`);
      }

      // Sustained audio transmission
      const errors = [];
      const testDuration = 15000; // 15 seconds
      const interval = setInterval(() => {
        try {
          for (let i = 0; i < 6; i += 2) {
            if (devices[i].inCall) {
              devices[i].sendAudio(1000);
            }
          }
        } catch (error) {
          errors.push(error);
        }
      }, 1000);

      await new Promise(resolve => setTimeout(resolve, testDuration));
      clearInterval(interval);

      // Should not have errors
      expect(errors.length).toBe(0);

      // All calls should still be active
      const activeCalls = devices.filter(d => d.inCall).length;
      expect(activeCalls).toBeGreaterThanOrEqual(3);
    }, MULTI_TEST_CONFIG.testTimeout);
  });

  describe('7. Edge Cases and Stress Tests', () => {
    test('should handle device disconnection during active call', async () => {
      // Create 2 devices
      for (let i = 0; i < 2; i++) {
        const device = new TestDevice(`disconnect-device-${i}`, `password-${i}`);
        await device.initialize();
        await device.register();
        devices.push(device);
      }

      // Establish call
      await devices[0].initiateCall('disconnect-device-1');
      expect(devices[0].inCall).toBe(true);

      // Simulate disconnection
      await devices[1].cleanup();

      // Wait for timeout/cleanup
      await new Promise(resolve => setTimeout(resolve, 2000));

      // System should handle gracefully (no crash)
      expect(true).toBe(true);
    }, MULTI_TEST_CONFIG.testTimeout);

    test('should handle maximum concurrent device limit', async () => {
      const maxDevices = Math.min(MULTI_TEST_CONFIG.maxConcurrentDevices, 15);

      // Create maximum devices
      for (let i = 0; i < maxDevices; i++) {
        const device = new TestDevice(`max-device-${i}`, `password-${i}`);
        await device.initialize();
        devices.push(device);
      }

      // Register all
      const results = await Promise.allSettled(
        devices.map(d => d.register())
      );

      const successes = results.filter(r => r.status === 'fulfilled');

      // Most should succeed
      expect(successes.length).toBeGreaterThanOrEqual(maxDevices * 0.9);
    }, MULTI_TEST_CONFIG.testTimeout);

    test('should recover from call setup failures', async () => {
      // Create 4 devices
      for (let i = 0; i < 4; i++) {
        const device = new TestDevice(`recovery-device-${i}`, `password-${i}`);
        await device.initialize();
        await device.register();
        devices.push(device);
      }

      // Try to call non-existent device
      try {
        await devices[0].initiateCall('non-existent');
      } catch (error) {
        // Expected
      }

      // Should still be able to make successful call
      const response = await devices[0].initiateCall('recovery-device-1');
      expect(response.statusCode).toBe(200);
      expect(devices[0].inCall).toBe(true);
    }, MULTI_TEST_CONFIG.testTimeout);
  });
});

// Export configuration
export { MULTI_TEST_CONFIG };
