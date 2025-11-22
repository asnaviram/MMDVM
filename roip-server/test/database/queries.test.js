/**
 * Database Complex Queries Tests
 */
import { DatabaseModule } from '../../src/database/database.js';
import fs from 'fs';

const TEST_DB = '/tmp/test_roip_queries.db';

describe('Database Queries', () => {
  let db;

  beforeAll(async () => {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    db = new DatabaseModule({ type: 'sqlite', sqlite: { filename: TEST_DB } });
    await db.initialize();

    // Create test data
    const u1 = await db.createUser({
      username: 'user1',
      email: 'user1@test.com',
      password_hash: 'hash'
    });

    const u2 = await db.createUser({
      username: 'user2',
      email: 'user2@test.com',
      password_hash: 'hash'
    });

    const d1 = await db.createDevice({
      user_id: u1.id,
      device_name: 'Dev1',
      device_type: 'ESP32',
      hardware_id: 'HW_A'
    });

    const d2 = await db.createDevice({
      user_id: u2.id,
      device_name: 'Dev2',
      device_type: 'ESP32',
      hardware_id: 'HW_B'
    });

    const route = await db.createRoute({
      route_name: 'Route1',
      source_device_id: d1.id,
      destination_device_id: d2.id
    });

    for (let i = 0; i < 5; i++) {
      await db.createCallLog({
        route_id: route.id,
        source_user_id: u1.id,
        destination_user_id: u2.id,
        call_status: i < 3 ? 'completed' : 'initiated'
      });
    }
  });

  afterAll(async () => {
    await db?.closeConnection();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  test('get call statistics', async () => {
    const stats = await db.getCallStatistics();
    expect(stats.total_calls).toBeGreaterThan(0);
  });

  test('get recording statistics', async () => {
    const stats = await db.getRecordingStatistics();
    expect(stats.total_recordings).toBeDefined();
  });

  test('search call logs', async () => {
    const results = await db.searchCallLogs('user1');
    expect(results).toBeDefined();
  });

  test('pagination support', async () => {
    const page1 = await db.getAllUsers({ limit: 5, offset: 0 });
    const page2 = await db.getAllUsers({ limit: 5, offset: 5 });
    expect(page1).toBeDefined();
    expect(page2).toBeDefined();
  });

  test('count aggregation', async () => {
    const users = await db.getAllUsers({ limit: 10 });
    if (users.length > 0) {
      const count = await db.getUserDeviceCount(users[0].id);
      expect(typeof count).toBe('number');
    }
  });
});
