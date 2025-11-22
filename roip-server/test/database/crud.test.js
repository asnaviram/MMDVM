/**
 * Database CRUD Operations Tests
 */
import { DatabaseModule } from '../../src/database/database.js';
import fs from 'fs';

const TEST_DB = '/tmp/test_roip_crud.db';

describe('Database CRUD Operations', () => {
  let db;

  beforeAll(async () => {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    db = new DatabaseModule({ type: 'sqlite', sqlite: { filename: TEST_DB } });
    await db.initialize();
  });

  afterAll(async () => {
    await db?.closeConnection();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  describe('Users', () => {
    let userId;

    test('create user', async () => {
      const user = await db.createUser({
        username: 'test1',
        email: 'test1@test.com',
        password_hash: 'hash'
      });
      expect(user.id).toBeDefined();
      userId = user.id;
    });

    test('read user', async () => {
      const user = await db.getUserById(userId);
      expect(user.username).toBe('test1');
    });

    test('update user', async () => {
      await db.updateUser(userId, { display_name: 'Test User' });
      const user = await db.getUserById(userId);
      expect(user.display_name).toBe('Test User');
    });

    test('delete user', async () => {
      const user = await db.createUser({
        username: 'del',
        email: 'del@test.com',
        password_hash: 'hash'
      });
      const result = await db.deleteUser(user.id);
      expect(result.changes).toBeGreaterThan(0);
    });
  });

  describe('Devices', () => {
    let userId, deviceId;

    beforeAll(async () => {
      const user = await db.createUser({
        username: 'devuser',
        email: 'dev@test.com',
        password_hash: 'hash'
      });
      userId = user.id;
    });

    test('create device', async () => {
      const device = await db.createDevice({
        user_id: userId,
        device_name: 'ESP32',
        device_type: 'ESP32-S3',
        hardware_id: 'HW001'
      });
      expect(device.id).toBeDefined();
      deviceId = device.id;
    });

    test('read device', async () => {
      const device = await db.getDeviceById(deviceId);
      expect(device.device_name).toBe('ESP32');
    });

    test('update device', async () => {
      await db.updateDevice(deviceId, { firmware_version: '2.0' });
      const device = await db.getDeviceById(deviceId);
      expect(device.firmware_version).toBe('2.0');
    });
  });

  describe('Batch Operations', () => {
    test('bulk create users', async () => {
      const users = [];
      for (let i = 0; i < 10; i++) {
        const user = await db.createUser({
          username: 'bulk' + i,
          email: 'bulk' + i + '@test.com',
          password_hash: 'hash'
        });
        users.push(user);
      }
      expect(users.length).toBe(10);
    });
  });
});
