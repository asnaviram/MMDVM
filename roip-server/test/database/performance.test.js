/**
 * Database Performance Tests
 * Tests all performance optimizations including:
 * - Connection pooling
 * - Prepared statements
 * - Query caching
 * - Bulk operations
 * - Index effectiveness
 * - Monitoring metrics
 */
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { DatabaseModule } from '../../src/database/database.js';
import fs from 'fs';

const TEST_DB = '/tmp/test_roip_perf.db';

describe('Database Performance', () => {
  let db;
  const results = [];
  let baselineMetrics = null;

  beforeAll(async () => {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    db = new DatabaseModule({
      type: 'sqlite',
      sqlite: { filename: TEST_DB },
      cacheSize: 1000,
      cacheTTL: 1000 * 60 * 10, // 10 minutes
      slowQueryThreshold: 500,
    });
    await db.initialize();
    baselineMetrics = db.getMetrics();
  });

  afterAll(async () => {
    await db?.closeConnection();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  test('1. Sequential insert 100 users', async () => {
    const start = Date.now();
    for (let i = 0; i < 100; i++) {
      await db.createUser({
        username: 'perf' + i,
        email: 'perf' + i + '@test.com',
        password_hash: 'hash',
        display_name: 'Test User ' + i,
      });
    }
    const duration = Date.now() - start;
    results.push({ op: 'Sequential insert 100 users', time: duration, perOp: (duration / 100).toFixed(2) });
    expect(duration).toBeLessThan(15000);
  });

  test('2. Bulk insert 200 devices using bulkInsertDevices', async () => {
    const users = await db.getAllUsers({ limit: 20 });
    const devices = [];
    let count = 0;

    for (const user of users) {
      for (let i = 0; i < 10; i++) {
        devices.push({
          user_id: user.id,
          device_name: 'Dev' + count,
          device_type: 'ESP32',
          hardware_id: 'HW' + count,
          ip_address: '192.168.1.' + (count % 255),
          port: 5060 + count,
        });
        count++;
      }
    }

    const start = Date.now();
    await db.bulkInsertDevices(devices);
    const duration = Date.now() - start;
    results.push({ op: 'Bulk insert 200 devices', time: duration, perOp: (duration / 200).toFixed(2) });
    expect(duration).toBeLessThan(5000); // Should be much faster than sequential
  });

  test('3. Create routes and call logs for testing', async () => {
    const devices = await db.getDevicesByUserId(1);

    // Create 10 routes
    for (let i = 0; i < Math.min(10, devices.length - 1); i++) {
      await db.createRoute({
        route_name: 'Route' + i,
        source_device_id: devices[i].id,
        destination_device_id: devices[i + 1].id,
        route_type: 'direct',
        priority: i,
      });
    }

    // Create call logs data
    const routes = await db.getActiveRoutes();
    const callLogs = [];
    for (let i = 0; i < 100; i++) {
      callLogs.push({
        route_id: routes[i % routes.length].id,
        source_user_id: 1,
        destination_user_id: 2,
        call_type: 'audio',
        call_status: i % 3 === 0 ? 'completed' : 'initiated',
        codec: 'OPUS',
        audio_quality: 90 + (i % 10),
      });
    }

    const start = Date.now();
    await db.bulkInsertCallLogs(callLogs);
    const duration = Date.now() - start;
    results.push({ op: 'Bulk insert 100 call logs', time: duration, perOp: (duration / 100).toFixed(2) });
    expect(duration).toBeLessThan(3000);
  });

  test('4. Index lookup performance - username', async () => {
    const start = Date.now();
    for (let i = 0; i < 100; i++) {
      await db.getUserByUsername('perf' + (i % 50));
    }
    const duration = Date.now() - start;
    results.push({ op: 'Index lookups x100 (username)', time: duration, perOp: (duration / 100).toFixed(2) });
    expect(duration).toBeLessThan(500); // Should be very fast with index
  });

  test('5. Index lookup performance - hardware_id', async () => {
    const start = Date.now();
    for (let i = 0; i < 100; i++) {
      await db.getDeviceByHardwareId('HW' + (i % 100));
    }
    const duration = Date.now() - start;
    results.push({ op: 'Index lookups x100 (hardware_id)', time: duration, perOp: (duration / 100).toFixed(2) });
    expect(duration).toBeLessThan(500);
  });

  test('6. Composite index performance - call logs by route and time', async () => {
    const routes = await db.getActiveRoutes();
    const start = Date.now();
    for (let i = 0; i < 50; i++) {
      await db.getCallLogsByRouteId(routes[i % routes.length].id, { limit: 10 });
    }
    const duration = Date.now() - start;
    results.push({ op: 'Composite index lookups x50 (route+time)', time: duration, perOp: (duration / 50).toFixed(2) });
    expect(duration).toBeLessThan(1000);
  });

  test('7. Query caching performance', async () => {
    const userId = 1;

    // First call - cache miss
    const start1 = Date.now();
    const result1 = await db.getCached(
      `devices_user_${userId}`,
      async () => db.getDevicesByUserId(userId)
    );
    const duration1 = Date.now() - start1;

    // Second call - cache hit
    const start2 = Date.now();
    const result2 = await db.getCached(
      `devices_user_${userId}`,
      async () => db.getDevicesByUserId(userId)
    );
    const duration2 = Date.now() - start2;

    const improvement = duration1 > 0 ? ((1 - duration2 / duration1) * 100).toFixed(1) : 'N/A';
    results.push({
      op: 'Query caching (miss vs hit)',
      time: `${duration1}ms vs ${duration2}ms`,
      improvement: improvement === 'N/A' ? 'Too fast to measure' : improvement + '%',
    });

    expect(duration2).toBeLessThanOrEqual(duration1); // Cache should be faster or equal
    expect(result1).toEqual(result2); // Results should be identical
  });

  test('8. Complex join query performance', async () => {
    const start = Date.now();
    for (let i = 0; i < 20; i++) {
      await db.searchCallLogs('perf', { limit: 20 });
    }
    const duration = Date.now() - start;
    results.push({ op: 'Complex joins x20', time: duration, perOp: (duration / 20).toFixed(2) });
    expect(duration).toBeLessThan(3000);
  });

  test('9. Aggregation query performance', async () => {
    const start = Date.now();
    for (let i = 0; i < 50; i++) {
      await db.getCallStatistics();
    }
    const duration = Date.now() - start;
    results.push({ op: 'Aggregation queries x50', time: duration, perOp: (duration / 50).toFixed(2) });
    expect(duration).toBeLessThan(2000);
  });

  test('10. Monitored query tracking', async () => {
    const metricsBefore = db.getMetrics();

    // Execute some monitored queries
    await db.monitoredQuery('SELECT * FROM users LIMIT 10');
    await db.monitoredQuery('SELECT * FROM devices LIMIT 10');
    await db.monitoredQuery('SELECT * FROM call_logs LIMIT 10');

    const metricsAfter = db.getMetrics();

    expect(metricsAfter.queryCount).toBeGreaterThan(metricsBefore.queryCount);
    expect(metricsAfter.totalQueryTime).toBeGreaterThanOrEqual(0);
    results.push({
      op: 'Query monitoring',
      queries: metricsAfter.queryCount - metricsBefore.queryCount,
      avgTime: metricsAfter.avgQueryTime + 'ms',
    });
  });

  test('11. Database maintenance', async () => {
    const start = Date.now();
    await db.maintenance();
    const duration = Date.now() - start;
    results.push({ op: 'VACUUM and ANALYZE', time: duration });
    expect(duration).toBeLessThan(5000);
  });

  test('12. Database size and efficiency', () => {
    const stats = fs.statSync(TEST_DB);
    const sizeKB = (stats.size / 1024).toFixed(2);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    results.push({ op: 'Database size', size: `${sizeKB} KB (${sizeMB} MB)` });
    expect(stats.size).toBeGreaterThan(0);
  });

  test('13. Performance metrics summary', () => {
    const metrics = db.getMetrics();

    console.log('\n=== PERFORMANCE METRICS ===');
    console.log('Total queries executed:', metrics.queryCount);
    console.log('Average query time:', metrics.avgQueryTime + 'ms');
    console.log('Total query time:', metrics.totalQueryTime + 'ms');
    console.log('Slow queries (>' + metrics.slowQueryThreshold + 'ms):', metrics.slowQueryCount);
    console.log('Cache hit rate:', metrics.cacheHitRate);
    console.log('Cache size:', metrics.cacheSize, 'entries');
    console.log('Cache hits:', metrics.cacheHits);
    console.log('Cache misses:', metrics.cacheMisses);

    results.push({
      op: 'Overall Statistics',
      totalQueries: metrics.queryCount,
      avgQueryTime: metrics.avgQueryTime + 'ms',
      cacheHitRate: metrics.cacheHitRate,
    });

    expect(metrics.queryCount).toBeGreaterThanOrEqual(0);
    expect(metrics.avgQueryTime).toBeGreaterThanOrEqual(0);
  });

  test('14. Performance summary report', () => {
    console.log('\n=== DETAILED PERFORMANCE RESULTS ===');
    results.forEach((r, i) => {
      if (r.time && r.perOp) {
        console.log(`${i + 1}. ${r.op}: ${r.time}ms (${r.perOp}ms per operation)`);
      } else if (r.improvement) {
        console.log(`${i + 1}. ${r.op}: ${r.time} (${r.improvement} faster)`);
      } else if (r.size) {
        console.log(`${i + 1}. ${r.op}: ${r.size}`);
      } else if (r.queries) {
        console.log(`${i + 1}. ${r.op}: ${r.queries} queries, avg ${r.avgTime}`);
      } else if (r.totalQueries) {
        console.log(`${i + 1}. ${r.op}:`);
        console.log(`    Total queries: ${r.totalQueries}`);
        console.log(`    Avg query time: ${r.avgQueryTime}`);
        console.log(`    Cache hit rate: ${r.cacheHitRate}`);
      } else {
        console.log(`${i + 1}. ${r.op}: ${r.time}ms`);
      }
    });

    console.log('\n=== OPTIMIZATION HIGHLIGHTS ===');
    const bulkInsert = results.find(r => r.op.includes('Bulk insert 200 devices'));
    if (bulkInsert) {
      console.log('Bulk insert efficiency:', bulkInsert.perOp + 'ms per device');
    }

    const caching = results.find(r => r.op.includes('Query caching'));
    if (caching) {
      console.log('Cache performance improvement:', caching.improvement);
    }

    const indexLookup = results.find(r => r.op.includes('Index lookups x100'));
    if (indexLookup) {
      console.log('Index lookup speed:', indexLookup.perOp + 'ms per lookup');
    }
  });
});
