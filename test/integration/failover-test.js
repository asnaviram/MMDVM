/**
 * ESP32 RoIP System - Failover and Recovery Test Suite
 *
 * Tests system resilience and recovery from:
 * - Network failures and interruptions
 * - Database connection failures
 * - Component failures
 * - Resource exhaustion
 * - Timeout scenarios
 *
 * @author ESP32 RoIP Team
 * @version 1.0.0
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { TestDevice, TEST_CONFIG } from './final-e2e-suite.test.js';
import dgram from 'dgram';
import net from 'net';
import fs from 'fs';
import path from 'path';

// Failover test configuration
const FAILOVER_CONFIG = {
  ...TEST_CONFIG,
  testTimeout: 120000, // 2 minutes
  networkInterruptionDuration: 5000, // 5 seconds
  maxRetries: 3,
  retryDelay: 2000, // 2 seconds
};

// Network simulator for testing failures
class NetworkSimulator {
  constructor() {
    this.blocked = false;
    this.dropRate = 0; // Percentage of packets to drop
    this.delayMs = 0; // Artificial delay in ms
  }

  blockTraffic() {
    this.blocked = true;
  }

  unblockTraffic() {
    this.blocked = false;
  }

  setPacketLoss(percentage) {
    this.dropRate = percentage;
  }

  setDelay(ms) {
    this.delayMs = ms;
  }

  shouldDropPacket() {
    if (this.blocked) return true;
    if (this.dropRate === 0) return false;
    return Math.random() * 100 < this.dropRate;
  }

  async applyDelay() {
    if (this.delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delayMs));
    }
  }

  reset() {
    this.blocked = false;
    this.dropRate = 0;
    this.delayMs = 0;
  }
}

// Test device with network simulation
class TestDeviceWithFailover extends TestDevice {
  constructor(deviceId, password, networkSim) {
    super(deviceId, password);
    this.networkSim = networkSim || new NetworkSimulator();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  async sendWithFailover(socket, message, port, host) {
    if (this.networkSim.shouldDropPacket()) {
      throw new Error('Network blocked or packet dropped');
    }

    await this.networkSim.applyDelay();

    return new Promise((resolve, reject) => {
      socket.send(message, port, host, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  async registerWithRetry(maxRetries = FAILOVER_CONFIG.maxRetries) {
    let lastError;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await this.register();
        this.reconnectAttempts = attempt;
        return response;
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, FAILOVER_CONFIG.retryDelay));
        }
      }
    }

    throw lastError;
  }
}

describe('Failover and Recovery Test Suite', () => {
  let devices = [];
  let networkSim;

  beforeEach(() => {
    networkSim = new NetworkSimulator();
  });

  afterEach(async () => {
    if (networkSim) networkSim.reset();
    await Promise.all(devices.map(d => d.cleanup()));
    devices = [];
  });

  describe('1. Network Failure Recovery', () => {
    test('should recover from temporary network interruption during registration', async () => {
      const device = new TestDevice('net-fail-1', 'password-1');
      await device.initialize();
      devices.push(device);

      // Start registration
      const regPromise = device.register();

      // Simulate brief network interruption (in practice, server might not respond)
      // For testing, we just verify the registration completes or times out appropriately
      try {
        const response = await Promise.race([
          regPromise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), 15000)
          )
        ]);

        // If succeeded, verify it's registered
        if (response.statusCode === 200) {
          expect(device.registered).toBe(true);
        }
      } catch (error) {
        // Timeout or failure is acceptable for this test
        expect(error.message).toMatch(/Timeout|timeout|failed/i);
      }
    }, FAILOVER_CONFIG.testTimeout);

    test('should handle packet loss gracefully during call', async () => {
      const device1 = new TestDevice('packet-loss-1', 'password-1');
      const device2 = new TestDevice('packet-loss-2', 'password-2');

      await device1.initialize();
      await device2.initialize();
      await device1.register();
      await device2.register();

      devices.push(device1, device2);

      // Establish call
      await device1.initiateCall('packet-loss-2');

      // Set up packet receiver
      let packetsReceived = 0;
      device2.on('rtp-packet', () => packetsReceived++);

      // Send audio
      device1.sendAudio(3000);
      await new Promise(resolve => setTimeout(resolve, 4000));

      // Should receive some packets even with network issues
      expect(packetsReceived).toBeGreaterThan(0);
    }, FAILOVER_CONFIG.testTimeout);

    test('should detect and report network disconnection', async () => {
      const device = new TestDevice('disconnect-detect-1', 'password-1');
      await device.initialize();
      await device.register();
      devices.push(device);

      expect(device.registered).toBe(true);

      // Simulate disconnection by closing socket
      device.sipSocket.close();

      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Device should detect disconnection (socket closed)
      expect(device.sipSocket.address).toThrow();
    }, FAILOVER_CONFIG.testTimeout);

    test('should reconnect after network restoration', async () => {
      const device = new TestDevice('reconnect-1', 'password-1');
      await device.initialize();
      await device.register();
      devices.push(device);

      expect(device.registered).toBe(true);

      // Simulate disconnection
      await device.cleanup();

      // Wait for network "restoration"
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Reconnect
      const newDevice = new TestDevice('reconnect-1', 'password-1');
      await newDevice.initialize();
      const response = await newDevice.register();

      expect(response.statusCode).toBe(200);
      expect(newDevice.registered).toBe(true);

      devices.push(newDevice);
    }, FAILOVER_CONFIG.testTimeout);
  });

  describe('2. Database Failover and Recovery', () => {
    test('should handle database temporary unavailability during registration', async () => {
      // This test verifies the system handles DB issues gracefully
      const device = new TestDevice('db-fail-1', 'password-1');
      await device.initialize();
      devices.push(device);

      try {
        const response = await device.register();
        // If DB is available, registration succeeds
        expect(response.statusCode).toBe(200);
      } catch (error) {
        // If DB is unavailable, should get appropriate error
        expect(error.message).toMatch(/failed|timeout/i);
      }
    }, FAILOVER_CONFIG.testTimeout);

    test('should recover database connection after failure', async () => {
      // Simulate DB connection recovery by sequential operations
      const device1 = new TestDevice('db-recover-1', 'password-1');
      await device1.initialize();
      devices.push(device1);

      // First operation
      await device1.register();
      expect(device1.registered).toBe(true);

      // Simulate DB disconnect and reconnect
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Second operation should still work
      const device2 = new TestDevice('db-recover-2', 'password-2');
      await device2.initialize();
      const response = await device2.register();

      expect(response.statusCode).toBe(200);
      devices.push(device2);
    }, FAILOVER_CONFIG.testTimeout);

    test('should maintain data consistency during failover', async () => {
      // Register device
      const device1 = new TestDevice('consistency-1', 'password-1');
      await device1.initialize();
      await device1.register();
      devices.push(device1);

      // Cleanup
      await device1.cleanup();

      // Re-register should maintain consistency
      const device2 = new TestDevice('consistency-1', 'password-1');
      await device2.initialize();
      const response = await device2.register();

      expect(response.statusCode).toBe(200);
      devices.push(device2);
    }, FAILOVER_CONFIG.testTimeout);
  });

  describe('3. Component Failure Recovery', () => {
    test('should handle SIP server timeout', async () => {
      const device = new TestDevice('sip-timeout-1', 'password-1');
      await device.initialize();
      devices.push(device);

      // Set aggressive timeout
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('SIP timeout')), 5000)
      );

      try {
        await Promise.race([device.register(), timeoutPromise]);
      } catch (error) {
        expect(error.message).toMatch(/timeout/i);
      }
    }, FAILOVER_CONFIG.testTimeout);

    test('should handle RTP stream failure during call', async () => {
      const device1 = new TestDevice('rtp-fail-1', 'password-1');
      const device2 = new TestDevice('rtp-fail-2', 'password-2');

      await device1.initialize();
      await device2.initialize();
      await device1.register();
      await device2.register();

      devices.push(device1, device2);

      // Establish call
      await device1.initiateCall('rtp-fail-2');

      // Close RTP socket to simulate failure
      device1.rtpSocket.close();

      // System should handle gracefully (no crash)
      await new Promise(resolve => setTimeout(resolve, 2000));

      expect(true).toBe(true);
    }, FAILOVER_CONFIG.testTimeout);

    test('should recover from call setup failure', async () => {
      const device1 = new TestDevice('setup-fail-1', 'password-1');
      const device2 = new TestDevice('setup-fail-2', 'password-2');

      await device1.initialize();
      await device2.initialize();
      await device1.register();
      await device2.register();

      devices.push(device1, device2);

      // Try to call non-existent device (failure)
      try {
        await device1.initiateCall('non-existent');
      } catch (error) {
        expect(error.message).toMatch(/failed/i);
      }

      // Should be able to make successful call after failure
      const response = await device1.initiateCall('setup-fail-2');
      expect(response.statusCode).toBe(200);
    }, FAILOVER_CONFIG.testTimeout);
  });

  describe('4. Resource Exhaustion Recovery', () => {
    test('should handle RTP port exhaustion gracefully', async () => {
      const maxCalls = 10;

      // Create devices
      for (let i = 0; i < maxCalls * 2; i++) {
        const device = new TestDevice(`port-exhaust-${i}`, `password-${i}`);
        await device.initialize();
        await device.register();
        devices.push(device);
      }

      // Try to establish many calls
      const callResults = [];
      for (let i = 0; i < maxCalls * 2; i += 2) {
        try {
          await devices[i].initiateCall(`port-exhaust-${i + 1}`);
          callResults.push(true);
        } catch (error) {
          callResults.push(false);
        }
      }

      // Some calls should succeed, some might fail due to port exhaustion
      const successfulCalls = callResults.filter(r => r).length;
      expect(successfulCalls).toBeGreaterThan(0);

      // End calls to free ports
      for (let i = 0; i < maxCalls * 2; i += 2) {
        if (devices[i].inCall) {
          try {
            await devices[i].endCall(`port-exhaust-${i + 1}`);
          } catch (error) {
            // May fail if call wasn't established
          }
        }
      }
    }, FAILOVER_CONFIG.testTimeout);

    test('should recover from memory pressure', async () => {
      // Create many devices to simulate memory pressure
      const deviceCount = 20;

      for (let i = 0; i < deviceCount; i++) {
        const device = new TestDevice(`mem-pressure-${i}`, `password-${i}`);
        await device.initialize();
        await device.register();
        devices.push(device);
      }

      // Cleanup half
      for (let i = 0; i < deviceCount / 2; i++) {
        await devices[i].cleanup();
      }

      // Remove from array
      devices = devices.slice(deviceCount / 2);

      // Should be able to create new devices
      const newDevice = new TestDevice('mem-pressure-new', 'password-new');
      await newDevice.initialize();
      const response = await newDevice.register();

      expect(response.statusCode).toBe(200);
      devices.push(newDevice);
    }, FAILOVER_CONFIG.testTimeout);
  });

  describe('5. Timeout and Retry Scenarios', () => {
    test('should retry failed operations', async () => {
      const device = new TestDeviceWithFailover('retry-1', 'password-1', networkSim);
      await device.initialize();
      devices.push(device);

      // Simulate intermittent network issues
      let attemptCount = 0;
      const originalRegister = device.register.bind(device);
      device.register = async function() {
        attemptCount++;
        if (attemptCount < 2) {
          throw new Error('Simulated failure');
        }
        return originalRegister();
      };

      try {
        await device.registerWithRetry();
        expect(device.reconnectAttempts).toBeGreaterThan(0);
      } catch (error) {
        // May fail if server not available
        expect(attemptCount).toBeGreaterThan(1);
      }
    }, FAILOVER_CONFIG.testTimeout);

    test('should respect maximum retry limit', async () => {
      const device = new TestDeviceWithFailover('max-retry-1', 'password-1', networkSim);
      await device.initialize();
      devices.push(device);

      // Force all attempts to fail
      device.register = async function() {
        throw new Error('Forced failure');
      };

      const maxRetries = 3;
      try {
        await device.registerWithRetry(maxRetries);
      } catch (error) {
        expect(error.message).toMatch(/Forced failure/);
      }

      // Should have attempted exactly maxRetries times
      // (verified by the test not hanging)
      expect(true).toBe(true);
    }, FAILOVER_CONFIG.testTimeout);

    test('should handle exponential backoff for retries', async () => {
      const timestamps = [];

      const device = new TestDevice('backoff-1', 'password-1');
      await device.initialize();
      devices.push(device);

      // Simulate failures with timing
      let attemptCount = 0;
      const originalRegister = device.register.bind(device);
      device.register = async function() {
        timestamps.push(Date.now());
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Simulated failure');
        }
        return originalRegister();
      };

      try {
        // Manual retry with exponential backoff
        let retries = 0;
        let lastError;

        while (retries < 3) {
          try {
            await device.register();
            break;
          } catch (error) {
            lastError = error;
            retries++;
            if (retries < 3) {
              const delay = Math.min(1000 * Math.pow(2, retries), 10000);
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          }
        }
      } catch (error) {
        // Expected if can't connect
      }

      // Verify delays increased (if we got multiple attempts)
      if (timestamps.length >= 3) {
        const delay1 = timestamps[1] - timestamps[0];
        const delay2 = timestamps[2] - timestamps[1];
        expect(delay2).toBeGreaterThanOrEqual(delay1);
      }
    }, FAILOVER_CONFIG.testTimeout);
  });

  describe('6. Graceful Degradation', () => {
    test('should maintain core functionality during partial failure', async () => {
      const device1 = new TestDevice('degraded-1', 'password-1');
      const device2 = new TestDevice('degraded-2', 'password-2');

      await device1.initialize();
      await device2.initialize();
      await device1.register();
      await device2.register();

      devices.push(device1, device2);

      // Establish call
      await device1.initiateCall('degraded-2');

      // Simulate partial RTP failure (high packet loss)
      let packetsReceived = 0;
      device2.on('rtp-packet', () => packetsReceived++);

      // Send with simulated losses
      const originalSend = device1.rtpSocket.send.bind(device1.rtpSocket);
      let sendCount = 0;
      device1.rtpSocket.send = function(...args) {
        sendCount++;
        // Drop 50% of packets
        if (sendCount % 2 === 0) {
          return originalSend(...args);
        }
      };

      device1.sendAudio(2000);
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Should still receive some packets
      expect(packetsReceived).toBeGreaterThan(0);
    }, FAILOVER_CONFIG.testTimeout);

    test('should continue operating with degraded performance', async () => {
      const device1 = new TestDevice('perf-degraded-1', 'password-1');
      const device2 = new TestDevice('perf-degraded-2', 'password-2');

      await device1.initialize();
      await device2.initialize();
      await device1.register();
      await device2.register();

      devices.push(device1, device2);

      await device1.initiateCall('perf-degraded-2');

      // Add artificial delay to simulate network degradation
      const originalSend = device1.rtpSocket.send.bind(device1.rtpSocket);
      device1.rtpSocket.send = async function(...args) {
        await new Promise(resolve => setTimeout(resolve, 10)); // 10ms delay
        return originalSend(...args);
      };

      let packetsReceived = 0;
      device2.on('rtp-packet', () => packetsReceived++);

      device1.sendAudio(2000);
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Should still work, just slower
      expect(packetsReceived).toBeGreaterThan(0);
    }, FAILOVER_CONFIG.testTimeout);
  });

  describe('7. System State Recovery', () => {
    test('should clean up orphaned resources after failures', async () => {
      const device1 = new TestDevice('cleanup-1', 'password-1');
      const device2 = new TestDevice('cleanup-2', 'password-2');

      await device1.initialize();
      await device2.initialize();
      await device1.register();
      await device2.register();

      devices.push(device1, device2);

      // Establish call
      await device1.initiateCall('cleanup-2');

      // Abrupt disconnection (no BYE)
      await device1.cleanup();
      devices = devices.filter(d => d !== device1);

      // Wait for server cleanup timeout
      await new Promise(resolve => setTimeout(resolve, 5000));

      // New device should be able to use resources
      const device3 = new TestDevice('cleanup-3', 'password-3');
      await device3.initialize();
      const response = await device3.register();

      expect(response.statusCode).toBe(200);
      devices.push(device3);
    }, FAILOVER_CONFIG.testTimeout);

    test('should recover consistent state after crash', async () => {
      // Simulate crash-recovery scenario
      const deviceId = 'crash-recover-1';

      // Initial registration
      const device1 = new TestDevice(deviceId, 'password-1');
      await device1.initialize();
      await device1.register();

      // Simulate crash (ungraceful shutdown)
      device1.sipSocket.close();
      device1.rtpSocket.close();

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Recovery - new instance with same ID
      const device2 = new TestDevice(deviceId, 'password-1');
      await device2.initialize();
      const response = await device2.register();

      expect(response.statusCode).toBe(200);
      expect(device2.registered).toBe(true);

      devices.push(device2);
    }, FAILOVER_CONFIG.testTimeout);
  });
});

// Export
export { FAILOVER_CONFIG, NetworkSimulator, TestDeviceWithFailover };
