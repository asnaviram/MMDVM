/**
 * Performance Tests for RoIP Server
 * Tests API endpoint response times, concurrent connections, and resource usage
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import http from 'http';
import v8 from 'v8';

const API_URL = process.env.API_URL || 'http://localhost:8080';
const TEST_DURATION = 5000; // 5 seconds per test

describe('Performance Tests', () => {
  let authToken = null;
  const performanceResults = {
    apiResponseTimes: {},
    concurrentConnections: {},
    memoryUsage: {},
    cpuUsage: {}
  };

  beforeAll(async () => {
    // Login to get auth token
    const response = await fetch(`${API_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin',
        password: 'admin'
      })
    });

    if (response.ok) {
      const data = await response.json();
      authToken = data.data.token;
    }
  });

  describe('API Response Times', () => {
    it('should respond to /health endpoint within acceptable time', async () => {
      const times = [];
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        const response = await fetch(`${API_URL}/health`);
        const duration = Date.now() - start;

        expect(response.status).toBe(200);
        times.push(duration);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const p95 = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];
      const p99 = times.sort((a, b) => a - b)[Math.floor(times.length * 0.99)];

      performanceResults.apiResponseTimes.health = {
        average: avgTime.toFixed(2),
        p95,
        p99,
        min: Math.min(...times),
        max: Math.max(...times)
      };

      console.log('Health endpoint performance:', performanceResults.apiResponseTimes.health);

      expect(avgTime).toBeLessThan(50); // Average should be under 50ms
      expect(p95).toBeLessThan(100); // 95th percentile under 100ms
    });

    it('should respond to /api/v1/status endpoint within acceptable time', async () => {
      if (!authToken) {
        console.warn('Skipping status test - no auth token');
        return;
      }

      const times = [];
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        const response = await fetch(`${API_URL}/api/v1/status`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const duration = Date.now() - start;

        if (response.ok) {
          times.push(duration);
        }
      }

      if (times.length > 0) {
        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        const p95 = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];
        const p99 = times.sort((a, b) => a - b)[Math.floor(times.length * 0.99)];

        performanceResults.apiResponseTimes.status = {
          average: avgTime.toFixed(2),
          p95,
          p99,
          min: Math.min(...times),
          max: Math.max(...times)
        };

        console.log('Status endpoint performance:', performanceResults.apiResponseTimes.status);

        expect(avgTime).toBeLessThan(100); // Average should be under 100ms
      }
    });

    it('should handle cached responses faster', async () => {
      if (!authToken) {
        console.warn('Skipping cache test - no auth token');
        return;
      }

      // First request (cache miss)
      const start1 = Date.now();
      const response1 = await fetch(`${API_URL}/api/v1/devices`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      const time1 = Date.now() - start1;

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      // Second request (cache hit)
      const start2 = Date.now();
      const response2 = await fetch(`${API_URL}/api/v1/devices`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      const time2 = Date.now() - start2;

      if (response1.ok && response2.ok) {
        performanceResults.apiResponseTimes.caching = {
          firstRequest: time1,
          cachedRequest: time2,
          improvement: ((time1 - time2) / time1 * 100).toFixed(2) + '%'
        };

        console.log('Caching performance:', performanceResults.apiResponseTimes.caching);

        // Cached request should be faster
        expect(time2).toBeLessThanOrEqual(time1);
      }
    });
  });

  describe('Concurrent Connections', () => {
    it('should handle 50 concurrent requests', async () => {
      const concurrency = 50;
      const promises = [];

      const start = Date.now();

      for (let i = 0; i < concurrency; i++) {
        promises.push(fetch(`${API_URL}/health`));
      }

      const results = await Promise.all(promises);
      const duration = Date.now() - start;

      const successCount = results.filter(r => r.ok).length;

      performanceResults.concurrentConnections.concurrent50 = {
        totalTime: duration,
        successRate: `${(successCount / concurrency * 100).toFixed(2)}%`,
        avgTimePerRequest: (duration / concurrency).toFixed(2)
      };

      console.log('50 concurrent requests:', performanceResults.concurrentConnections.concurrent50);

      expect(successCount).toBe(concurrency);
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
    });

    it('should handle 100 concurrent requests', async () => {
      const concurrency = 100;
      const promises = [];

      const start = Date.now();

      for (let i = 0; i < concurrency; i++) {
        promises.push(fetch(`${API_URL}/health`));
      }

      const results = await Promise.all(promises);
      const duration = Date.now() - start;

      const successCount = results.filter(r => r.ok).length;

      performanceResults.concurrentConnections.concurrent100 = {
        totalTime: duration,
        successRate: `${(successCount / concurrency * 100).toFixed(2)}%`,
        avgTimePerRequest: (duration / concurrency).toFixed(2)
      };

      console.log('100 concurrent requests:', performanceResults.concurrentConnections.concurrent100);

      expect(successCount).toBe(concurrency);
      expect(duration).toBeLessThan(3000); // Should complete within 3 seconds
    });
  });

  describe('Memory Usage', () => {
    it('should maintain stable memory usage under load', async () => {
      const iterations = 1000;
      const memorySnapshots = [];

      // Take initial memory snapshot
      const initialMemory = process.memoryUsage();
      memorySnapshots.push(initialMemory.heapUsed);

      // Generate load
      for (let i = 0; i < iterations; i++) {
        await fetch(`${API_URL}/health`);

        if (i % 100 === 0) {
          memorySnapshots.push(process.memoryUsage().heapUsed);
        }
      }

      // Take final memory snapshot
      const finalMemory = process.memoryUsage();
      memorySnapshots.push(finalMemory.heapUsed);

      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreasePercent = (memoryIncrease / initialMemory.heapUsed * 100).toFixed(2);

      performanceResults.memoryUsage.loadTest = {
        initialHeap: `${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`,
        finalHeap: `${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`,
        increase: `${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`,
        increasePercent: `${memoryIncreasePercent}%`
      };

      console.log('Memory usage under load:', performanceResults.memoryUsage.loadTest);

      // Memory increase should be reasonable (less than 50% increase)
      expect(parseFloat(memoryIncreasePercent)).toBeLessThan(50);
    });

    it('should report heap statistics', () => {
      const heapStats = v8.getHeapStatistics();

      performanceResults.memoryUsage.heapStats = {
        totalHeapSize: `${(heapStats.total_heap_size / 1024 / 1024).toFixed(2)}MB`,
        usedHeapSize: `${(heapStats.used_heap_size / 1024 / 1024).toFixed(2)}MB`,
        heapSizeLimit: `${(heapStats.heap_size_limit / 1024 / 1024).toFixed(2)}MB`,
        percentUsed: `${(heapStats.used_heap_size / heapStats.heap_size_limit * 100).toFixed(2)}%`
      };

      console.log('Heap statistics:', performanceResults.memoryUsage.heapStats);

      // Heap usage should be under 80%
      const percentUsed = heapStats.used_heap_size / heapStats.heap_size_limit;
      expect(percentUsed).toBeLessThan(0.8);
    });
  });

  describe('CPU Usage', () => {
    it('should report CPU usage statistics', async () => {
      const iterations = 1000;
      const cpuStart = process.cpuUsage();

      // Generate load
      for (let i = 0; i < iterations; i++) {
        await fetch(`${API_URL}/health`);
      }

      const cpuEnd = process.cpuUsage(cpuStart);

      performanceResults.cpuUsage.loadTest = {
        userCPU: `${(cpuEnd.user / 1000).toFixed(2)}ms`,
        systemCPU: `${(cpuEnd.system / 1000).toFixed(2)}ms`,
        totalCPU: `${((cpuEnd.user + cpuEnd.system) / 1000).toFixed(2)}ms`
      };

      console.log('CPU usage under load:', performanceResults.cpuUsage.loadTest);
    });
  });

  afterAll(() => {
    console.log('\n=== Performance Test Results ===');
    console.log(JSON.stringify(performanceResults, null, 2));
  });
});
