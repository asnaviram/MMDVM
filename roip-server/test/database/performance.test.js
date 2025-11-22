/**
 * Database Performance Tests
 */
import { DatabaseModule } from '../../src/database/database.js';
import fs from 'fs';

const TEST_DB = '/tmp/test_roip_perf.db';

describe('Database Performance', () => {
  let db;
  const results = [];

  beforeAll(async () => {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    db = new DatabaseModule({ type: 'sqlite', sqlite: { filename: TEST_DB } });
    await db.initialize();
  });

  afterAll(async () => {
    await db?.closeConnection();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  test('bulk insert 100 users', async () => {
    const start = Date.now();
    for (let i = 0; i < 100; i++) {
      await db.createUser({
        username: 'perf' + i,
        email: 'perf' + i + '@test.com',
        password_hash: 'hash'
      });
    }
    const duration = Date.now() - start;
    results.push({ op: 'Insert 100 users', time: duration });
    expect(duration).toBeLessThan(15000);
  });

  test('bulk insert 200 devices', async () => {
    const users = await db.getAllUsers({ limit: 20 });
    const start = Date.now();
    let count = 0;
    for (const user of users) {
      for (let i = 0; i < 10; i++) {
        await db.createDevice({
          user_id: user.id,
          device_name: 'Dev' + count,
          device_type: 'ESP32',
          hardware_id: 'HW' + count
        });
        count++;
      }
    }
    const duration = Date.now() - start;
    results.push({ op: 'Insert 200 devices', time: duration });
    expect(duration).toBeLessThan(30000);
  });

  test('index lookup performance', async () => {
    const start = Date.now();
    for (let i = 0; i < 50; i++) {
      await db.getUserByUsername('perf' + (i % 10));
    }
    const duration = Date.now() - start;
    results.push({ op: 'Index lookups x50', time: duration });
    expect(duration).toBeLessThan(1000);
  });

  test('query performance', async () => {
    const start = Date.now();
    for (let i = 0; i < 10; i++) {
      await db.getAllUsers({ limit: 50 });
    }
    const duration = Date.now() - start;
    results.push({ op: 'Queries x10', time: duration });
    expect(duration).toBeLessThan(5000);
  });

  test('database size check', () => {
    const stats = fs.statSync(TEST_DB);
    const mb = (stats.size / 1024 / 1024).toFixed(2);
    console.log('Database size: ' + mb + 'MB');
    expect(stats.size).toBeGreaterThan(0);
  });

  test('performance summary', () => {
    console.log('\nPERFORMANCE RESULTS:');
    results.forEach(r => {
      console.log('  ' + r.op + ': ' + r.time + 'ms');
    });
  });
});
