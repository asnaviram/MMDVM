/**
 * Database Test Suite
 * Tests CRUD operations, user management, device registration,
 * call logs, and query helpers
 */

import { DatabaseModule } from '../src/database/database.js';
import fs from 'fs';
import path from 'path';

describe('Database Tests', () => {
  let database;
  const testDbPath = './test-roip.db';

  beforeEach(async () => {
    // Clean up test database if it exists
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    database = new DatabaseModule({
      type: 'sqlite',
      sqlite: { filename: testDbPath }
    });

    await database.initialize();
  });

  afterEach(async () => {
    await database.closeConnection();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  // ===== USER CRUD OPERATIONS =====
  describe('User CRUD Operations', () => {
    test('should create a user', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password_hash: 'hashed_password_123',
        display_name: 'Test User',
        role: 'user',
        is_active: 1
      };

      const user = await database.createUser(userData);

      expect(user).toBeDefined();
      expect(user.username).toBe('testuser');
      expect(user.email).toBe('test@example.com');
      expect(user.id).toBeDefined();
    });

    test('should get user by ID', async () => {
      const userData = {
        username: 'user123',
        email: 'user123@example.com',
        password_hash: 'hash123',
        role: 'user'
      };

      const created = await database.createUser(userData);
      const retrieved = await database.getUserById(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved.username).toBe('user123');
      expect(retrieved.email).toBe('user123@example.com');
    });

    test('should get user by username', async () => {
      const userData = {
        username: 'johndoe',
        email: 'john@example.com',
        password_hash: 'hash456'
      };

      await database.createUser(userData);
      const retrieved = await database.getUserByUsername('johndoe');

      expect(retrieved).toBeDefined();
      expect(retrieved.username).toBe('johndoe');
    });

    test('should get user by email', async () => {
      const userData = {
        username: 'jane',
        email: 'jane@example.com',
        password_hash: 'hash789'
      };

      await database.createUser(userData);
      const retrieved = await database.getUserByEmail('jane@example.com');

      expect(retrieved).toBeDefined();
      expect(retrieved.email).toBe('jane@example.com');
    });

    test('should get all users', async () => {
      await database.createUser({
        username: 'user1',
        email: 'user1@example.com',
        password_hash: 'hash1'
      });

      await database.createUser({
        username: 'user2',
        email: 'user2@example.com',
        password_hash: 'hash2'
      });

      const users = await database.getAllUsers();

      expect(Array.isArray(users)).toBe(true);
      expect(users.length).toBeGreaterThanOrEqual(2);
    });

    test('should update user', async () => {
      const userData = {
        username: 'updateme',
        email: 'update@example.com',
        password_hash: 'original_hash'
      };

      const created = await database.createUser(userData);
      const updated = await database.updateUser(created.id, {
        display_name: 'Updated Name',
        role: 'admin'
      });

      expect(updated.display_name).toBe('Updated Name');
      expect(updated.role).toBe('admin');
    });

    test('should delete user', async () => {
      const userData = {
        username: 'deleteme',
        email: 'delete@example.com',
        password_hash: 'to_delete'
      };

      const created = await database.createUser(userData);
      const result = await database.deleteUser(created.id);

      expect(result.changes).toBeGreaterThan(0);

      const retrieved = await database.getUserById(created.id);
      expect(retrieved).toBeUndefined();
    });

    test('should filter users by role', async () => {
      await database.createUser({
        username: 'admin1',
        email: 'admin1@example.com',
        password_hash: 'hash',
        role: 'admin'
      });

      await database.createUser({
        username: 'user3',
        email: 'user3@example.com',
        password_hash: 'hash',
        role: 'user'
      });

      const admins = await database.getAllUsers({ role: 'admin' });

      expect(Array.isArray(admins)).toBe(true);
      expect(admins.every(u => u.role === 'admin')).toBe(true);
    });

    test('should update user last login', async () => {
      const userData = {
        username: 'logintest',
        email: 'login@example.com',
        password_hash: 'hash'
      };

      const created = await database.createUser(userData);
      await database.updateUserLastLogin(created.id);

      const updated = await database.getUserById(created.id);
      expect(updated.last_login).not.toBeNull();
    });
  });

  // ===== DEVICE REGISTRATION =====
  describe('Device Registration', () => {
    let userId;

    beforeEach(async () => {
      const user = await database.createUser({
        username: 'deviceowner',
        email: 'owner@example.com',
        password_hash: 'hash'
      });
      userId = user.id;
    });

    test('should create device', async () => {
      const deviceData = {
        user_id: userId,
        device_name: 'ESP32-Radio-1',
        device_type: 'radio_modem',
        hardware_id: 'HW-123456',
        ip_address: '192.168.1.50',
        port: 5060,
        firmware_version: '1.2.3'
      };

      const device = await database.createDevice(deviceData);

      expect(device).toBeDefined();
      expect(device.device_name).toBe('ESP32-Radio-1');
      expect(device.hardware_id).toBe('HW-123456');
      expect(device.id).toBeDefined();
    });

    test('should get device by ID', async () => {
      const deviceData = {
        user_id: userId,
        device_name: 'Device1',
        device_type: 'radio',
        hardware_id: 'HW-001'
      };

      const created = await database.createDevice(deviceData);
      const retrieved = await database.getDeviceById(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved.device_name).toBe('Device1');
    });

    test('should get devices by user ID', async () => {
      await database.createDevice({
        user_id: userId,
        device_name: 'UserDevice1',
        device_type: 'radio',
        hardware_id: 'HW-A001'
      });

      await database.createDevice({
        user_id: userId,
        device_name: 'UserDevice2',
        device_type: 'radio',
        hardware_id: 'HW-A002'
      });

      const devices = await database.getDevicesByUserId(userId);

      expect(Array.isArray(devices)).toBe(true);
      expect(devices.length).toBe(2);
      expect(devices.every(d => d.user_id === userId)).toBe(true);
    });

    test('should get device by hardware ID', async () => {
      const deviceData = {
        user_id: userId,
        device_name: 'HWIDDevice',
        device_type: 'radio',
        hardware_id: 'HW-UNIQUE-123'
      };

      await database.createDevice(deviceData);
      const retrieved = await database.getDeviceByHardwareId('HW-UNIQUE-123');

      expect(retrieved).toBeDefined();
      expect(retrieved.hardware_id).toBe('HW-UNIQUE-123');
    });

    test('should update device', async () => {
      const device = await database.createDevice({
        user_id: userId,
        device_name: 'UpdateDevice',
        device_type: 'radio',
        hardware_id: 'HW-UPD-001'
      });

      const updated = await database.updateDevice(device.id, {
        ip_address: '192.168.1.100',
        firmware_version: '2.0.0'
      });

      expect(updated.ip_address).toBe('192.168.1.100');
      expect(updated.firmware_version).toBe('2.0.0');
    });

    test('should delete device', async () => {
      const device = await database.createDevice({
        user_id: userId,
        device_name: 'DeleteDevice',
        device_type: 'radio',
        hardware_id: 'HW-DEL-001'
      });

      const result = await database.deleteDevice(device.id);
      expect(result.changes).toBeGreaterThan(0);

      const retrieved = await database.getDeviceById(device.id);
      expect(retrieved).toBeUndefined();
    });

    test('should update device last seen', async () => {
      const device = await database.createDevice({
        user_id: userId,
        device_name: 'LastSeenDevice',
        device_type: 'radio',
        hardware_id: 'HW-LS-001'
      });

      await database.updateDeviceLastSeen(device.id);

      const updated = await database.getDeviceById(device.id);
      expect(updated.last_seen).not.toBeNull();
    });
  });

  // ===== CALL LOGS =====
  describe('Call Logs', () => {
    let routeId;
    let sourceUserId;
    let destUserId;

    beforeEach(async () => {
      const sourceUser = await database.createUser({
        username: 'caller',
        email: 'caller@example.com',
        password_hash: 'hash'
      });
      sourceUserId = sourceUser.id;

      const destUser = await database.createUser({
        username: 'callee',
        email: 'callee@example.com',
        password_hash: 'hash'
      });
      destUserId = destUser.id;

      const sourceDevice = await database.createDevice({
        user_id: sourceUserId,
        device_name: 'CallDevice1',
        device_type: 'radio',
        hardware_id: 'HW-CALL-01'
      });

      const destDevice = await database.createDevice({
        user_id: destUserId,
        device_name: 'CallDevice2',
        device_type: 'radio',
        hardware_id: 'HW-CALL-02'
      });

      const route = await database.createRoute({
        route_name: 'call-route-1',
        source_device_id: sourceDevice.id,
        destination_device_id: destDevice.id,
        route_type: 'direct'
      });
      routeId = route.id;
    });

    test('should create call log', async () => {
      const callLog = await database.createCallLog({
        route_id: routeId,
        source_user_id: sourceUserId,
        destination_user_id: destUserId,
        call_type: 'direct',
        call_status: 'initiated',
        codec: 'PCMU'
      });

      expect(callLog).toBeDefined();
      expect(callLog.route_id).toBe(routeId);
      expect(callLog.call_status).toBe('initiated');
    });

    test('should get call log by ID', async () => {
      const created = await database.createCallLog({
        route_id: routeId,
        source_user_id: sourceUserId,
        destination_user_id: destUserId,
        call_type: 'conference'
      });

      const retrieved = await database.getCallLogById(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved.route_id).toBe(routeId);
    });

    test('should get call logs by route ID', async () => {
      await database.createCallLog({
        route_id: routeId,
        source_user_id: sourceUserId,
        destination_user_id: destUserId
      });

      await database.createCallLog({
        route_id: routeId,
        source_user_id: destUserId,
        destination_user_id: sourceUserId
      });

      const logs = await database.getCallLogsByRouteId(routeId);

      expect(Array.isArray(logs)).toBe(true);
      expect(logs.length).toBe(2);
    });

    test('should update call log', async () => {
      const callLog = await database.createCallLog({
        route_id: routeId,
        source_user_id: sourceUserId,
        destination_user_id: destUserId,
        call_status: 'initiated'
      });

      const updated = await database.updateCallLog(callLog.id, {
        call_status: 'connected',
        audio_quality: 95
      });

      expect(updated.call_status).toBe('connected');
      expect(updated.audio_quality).toBe(95);
    });

    test('should complete call log', async () => {
      const callLog = await database.createCallLog({
        route_id: routeId,
        source_user_id: sourceUserId,
        destination_user_id: destUserId
      });

      const endTime = new Date().toISOString();
      const updated = await database.completeCallLog(
        callLog.id,
        endTime,
        45,
        'completed'
      );

      expect(updated.call_status).toBe('completed');
      expect(updated.duration_seconds).toBe(45);
    });

    test('should delete call log', async () => {
      const callLog = await database.createCallLog({
        route_id: routeId,
        source_user_id: sourceUserId,
        destination_user_id: destUserId
      });

      const result = await database.deleteCallLog(callLog.id);
      expect(result.changes).toBeGreaterThan(0);
    });

    test('should get call logs by user ID', async () => {
      await database.createCallLog({
        route_id: routeId,
        source_user_id: sourceUserId,
        destination_user_id: destUserId
      });

      const logs = await database.getCallLogsByUserId(sourceUserId);

      expect(Array.isArray(logs)).toBe(true);
      expect(logs.length).toBeGreaterThan(0);
    });
  });

  // ===== RECORDINGS =====
  describe('Recordings', () => {
    let callLogId;

    beforeEach(async () => {
      const user = await database.createUser({
        username: 'recuser',
        email: 'rec@example.com',
        password_hash: 'hash'
      });

      const device = await database.createDevice({
        user_id: user.id,
        device_name: 'RecDevice',
        device_type: 'radio',
        hardware_id: 'HW-REC-01'
      });

      const route = await database.createRoute({
        route_name: 'rec-route',
        source_device_id: device.id,
        destination_device_id: device.id
      });

      const callLog = await database.createCallLog({
        route_id: route.id,
        source_user_id: user.id
      });

      callLogId = callLog.id;
    });

    test('should create recording', async () => {
      const recording = await database.createRecording({
        call_log_id: callLogId,
        file_path: '/recordings/call_123.wav',
        file_size_bytes: 1024000,
        duration_seconds: 60,
        format: 'wav',
        sample_rate: 8000,
        bitrate: '64k'
      });

      expect(recording).toBeDefined();
      expect(recording.file_path).toBe('/recordings/call_123.wav');
      expect(recording.duration_seconds).toBe(60);
    });

    test('should get recording by ID', async () => {
      const created = await database.createRecording({
        call_log_id: callLogId,
        file_path: '/recordings/test.wav',
        duration_seconds: 120
      });

      const retrieved = await database.getRecordingById(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved.file_path).toBe('/recordings/test.wav');
    });

    test('should get recordings by call log ID', async () => {
      await database.createRecording({
        call_log_id: callLogId,
        file_path: '/recordings/call1.wav'
      });

      await database.createRecording({
        call_log_id: callLogId,
        file_path: '/recordings/call2.wav'
      });

      const recordings = await database.getRecordingsByCallLogId(callLogId);

      expect(Array.isArray(recordings)).toBe(true);
      expect(recordings.length).toBe(2);
    });

    test('should update recording', async () => {
      const recording = await database.createRecording({
        call_log_id: callLogId,
        file_path: '/recordings/update.wav',
        is_encrypted: 0
      });

      const updated = await database.updateRecording(recording.id, {
        is_encrypted: 1
      });

      expect(updated.is_encrypted).toBe(1);
    });

    test('should delete recording', async () => {
      const recording = await database.createRecording({
        call_log_id: callLogId,
        file_path: '/recordings/delete.wav'
      });

      const result = await database.deleteRecording(recording.id);
      expect(result.changes).toBeGreaterThan(0);
    });
  });

  // ===== ROUTES =====
  describe('Routes', () => {
    let sourceDeviceId;
    let destDeviceId;

    beforeEach(async () => {
      const user = await database.createUser({
        username: 'routeuser',
        email: 'route@example.com',
        password_hash: 'hash'
      });

      const sourceDevice = await database.createDevice({
        user_id: user.id,
        device_name: 'SourceDevice',
        device_type: 'radio',
        hardware_id: 'HW-SRC'
      });
      sourceDeviceId = sourceDevice.id;

      const destDevice = await database.createDevice({
        user_id: user.id,
        device_name: 'DestDevice',
        device_type: 'radio',
        hardware_id: 'HW-DST'
      });
      destDeviceId = destDevice.id;
    });

    test('should create route', async () => {
      const route = await database.createRoute({
        route_name: 'test-route',
        source_device_id: sourceDeviceId,
        destination_device_id: destDeviceId,
        route_type: 'direct'
      });

      expect(route).toBeDefined();
      expect(route.route_name).toBe('test-route');
      expect(route.route_type).toBe('direct');
    });

    test('should get route by ID', async () => {
      const created = await database.createRoute({
        route_name: 'get-route',
        source_device_id: sourceDeviceId,
        destination_device_id: destDeviceId
      });

      const retrieved = await database.getRouteById(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved.route_name).toBe('get-route');
    });

    test('should get routes by device ID', async () => {
      await database.createRoute({
        route_name: 'route1',
        source_device_id: sourceDeviceId,
        destination_device_id: destDeviceId
      });

      const routes = await database.getRoutesByDeviceId(sourceDeviceId);

      expect(Array.isArray(routes)).toBe(true);
      expect(routes.length).toBeGreaterThan(0);
    });

    test('should update route', async () => {
      const route = await database.createRoute({
        route_name: 'update-route',
        source_device_id: sourceDeviceId,
        destination_device_id: destDeviceId
      });

      const updated = await database.updateRoute(route.id, {
        priority: 10
      });

      expect(updated.priority).toBe(10);
    });

    test('should delete route', async () => {
      const route = await database.createRoute({
        route_name: 'delete-route',
        source_device_id: sourceDeviceId,
        destination_device_id: destDeviceId
      });

      const result = await database.deleteRoute(route.id);
      expect(result.changes).toBeGreaterThan(0);
    });
  });

  // ===== QUERY HELPERS =====
  describe('Query Helpers', () => {
    test('should get user device count', async () => {
      const user = await database.createUser({
        username: 'countuser',
        email: 'count@example.com',
        password_hash: 'hash'
      });

      await database.createDevice({
        user_id: user.id,
        device_name: 'Device1',
        device_type: 'radio',
        hardware_id: 'HW-COUNT-01'
      });

      await database.createDevice({
        user_id: user.id,
        device_name: 'Device2',
        device_type: 'radio',
        hardware_id: 'HW-COUNT-02'
      });

      const count = await database.getUserDeviceCount(user.id);
      expect(count).toBe(2);
    });

    test('should get call statistics', async () => {
      const stats = await database.getCallStatistics();

      expect(stats).toBeDefined();
      expect(stats.total_calls).toBeDefined();
      expect(stats.completed_calls).toBeDefined();
    });

    test('should get recording statistics', async () => {
      const stats = await database.getRecordingStatistics();

      expect(stats).toBeDefined();
      expect(stats.total_recordings).toBeDefined();
      expect(stats.total_size_bytes).toBeDefined();
    });

    test('should search call logs', async () => {
      const user = await database.createUser({
        username: 'searchuser',
        email: 'search@example.com',
        password_hash: 'hash'
      });

      const device = await database.createDevice({
        user_id: user.id,
        device_name: 'SearchDevice',
        device_type: 'radio',
        hardware_id: 'HW-SEARCH'
      });

      const route = await database.createRoute({
        route_name: 'search-route',
        source_device_id: device.id,
        destination_device_id: device.id
      });

      await database.createCallLog({
        route_id: route.id,
        source_user_id: user.id
      });

      const results = await database.searchCallLogs('searchuser');

      expect(Array.isArray(results)).toBe(true);
    });
  });

  // ===== HEALTH CHECK =====
  describe('Health Check', () => {
    test('should perform health check', async () => {
      const health = await database.healthCheck();

      expect(health).toBeDefined();
      expect(health.status).toBe('healthy');
      expect(health.database).toBe('sqlite');
      expect(health.timestamp).toBeDefined();
    });
  });
});
