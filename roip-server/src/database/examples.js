/**
 * Database Module Usage Examples
 * Demonstrates how to use the DatabaseModule for CRUD operations
 */

import DatabaseModule from './database.js';

/**
 * Example 1: Initialize with SQLite
 */
export async function exampleSQLiteInit() {
  const db = new DatabaseModule({
    type: 'sqlite',
    sqlite: {
      filename: './roip-server.db',
    },
  });

  await db.initialize();
  return db;
}

/**
 * Example 2: Initialize with PostgreSQL
 */
export async function examplePostgreSQLInit() {
  const db = new DatabaseModule({
    type: 'postgresql',
    postgresql: {
      host: 'localhost',
      port: 5432,
      database: 'roip_server',
      user: 'roip_user',
      password: 'roip_password',
      max: 20,
    },
  });

  await db.initialize();
  return db;
}

/**
 * Example 3: User Management
 */
export async function exampleUserManagement(db) {
  // Create a user
  const newUser = await db.createUser({
    username: 'john_doe',
    email: 'john@example.com',
    password_hash: '$2b$10$hashedpassword',
    display_name: 'John Doe',
    role: 'admin',
  });
  console.log('Created user:', newUser);

  // Get user by ID
  const user = await db.getUserById(newUser.id);
  console.log('Retrieved user:', user);

  // Get user by username
  const userByUsername = await db.getUserByUsername('john_doe');
  console.log('Found user:', userByUsername);

  // Get all users with filters
  const allUsers = await db.getAllUsers({
    is_active: true,
    role: 'admin',
    limit: 10,
    offset: 0,
  });
  console.log('All admin users:', allUsers);

  // Update user
  const updated = await db.updateUser(newUser.id, {
    display_name: 'John Smith',
    is_active: true,
  });
  console.log('Updated user:', updated);

  // Update last login
  await db.updateUserLastLogin(newUser.id);

  // Delete user
  const deleted = await db.deleteUser(newUser.id);
  console.log('Deleted user:', deleted);
}

/**
 * Example 4: Device Management
 */
export async function exampleDeviceManagement(db) {
  // Assuming user exists with id 1
  const userId = 1;

  // Create a device
  const newDevice = await db.createDevice({
    user_id: userId,
    device_name: 'ESP32-Radio-01',
    device_type: 'TRANSCEIVER',
    hardware_id: 'ESP32-12345678',
    ip_address: '192.168.1.100',
    port: 5060,
    firmware_version: '1.0.0',
    is_active: true,
  });
  console.log('Created device:', newDevice);

  // Get device by ID
  const device = await db.getDeviceById(newDevice.id);
  console.log('Retrieved device:', device);

  // Get devices by user ID
  const userDevices = await db.getDevicesByUserId(userId);
  console.log('User devices:', userDevices);

  // Get device by hardware ID
  const hwDevice = await db.getDeviceByHardwareId('ESP32-12345678');
  console.log('Device by hardware ID:', hwDevice);

  // Update device
  const updated = await db.updateDevice(newDevice.id, {
    ip_address: '192.168.1.101',
    firmware_version: '1.0.1',
  });
  console.log('Updated device:', updated);

  // Update device last seen
  await db.updateDeviceLastSeen(newDevice.id);

  // Get device count for user
  const count = await db.getUserDeviceCount(userId);
  console.log(`User has ${count} device(s)`);

  return newDevice;
}

/**
 * Example 5: Route Management
 */
export async function exampleRouteManagement(db) {
  // Create route between two devices
  const newRoute = await db.createRoute({
    route_name: 'Device1-to-Device2',
    description: 'Direct routing between device 1 and 2',
    source_device_id: 1,
    destination_device_id: 2,
    route_type: 'direct',
    is_active: true,
    priority: 10,
  });
  console.log('Created route:', newRoute);

  // Get route by ID
  const route = await db.getRouteById(newRoute.id);
  console.log('Retrieved route:', route);

  // Get routes for a device
  const deviceRoutes = await db.getRoutesByDeviceId(1);
  console.log('Device routes:', deviceRoutes);

  // Get active routes
  const activeRoutes = await db.getActiveRoutes({
    route_type: 'direct',
  });
  console.log('Active routes:', activeRoutes);

  // Update route
  const updated = await db.updateRoute(newRoute.id, {
    priority: 20,
    is_active: true,
  });
  console.log('Updated route:', updated);

  // Delete route
  const deleted = await db.deleteRoute(newRoute.id);
  console.log('Deleted route:', deleted);

  return newRoute;
}

/**
 * Example 6: Call Logging
 */
export async function exampleCallLogging(db) {
  // Create a call log
  const callLog = await db.createCallLog({
    route_id: 1,
    source_user_id: 1,
    destination_user_id: 2,
    call_type: 'voice',
    call_status: 'initiated',
    codec: 'G.711',
    audio_quality: 85,
  });
  console.log('Created call log:', callLog);

  // Get call log by ID
  const log = await db.getCallLogById(callLog.id);
  console.log('Retrieved call log:', log);

  // Get call logs for route
  const routeLogs = await db.getCallLogsByRouteId(1, {
    call_status: 'initiated',
    limit: 10,
  });
  console.log('Route call logs:', routeLogs);

  // Get call logs for user
  const userLogs = await db.getCallLogsByUserId(1, {
    start_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
    limit: 50,
  });
  console.log('User call logs:', userLogs);

  // Update call log
  const updated = await db.updateCallLog(callLog.id, {
    call_status: 'ringing',
    audio_quality: 90,
  });
  console.log('Updated call log:', updated);

  // Complete call
  const completed = await db.completeCallLog(
    callLog.id,
    new Date().toISOString(),
    125, // 2 minutes 5 seconds
    'completed'
  );
  console.log('Completed call:', completed);

  // Search call logs
  const searchResults = await db.searchCallLogs('john', {
    call_status: 'completed',
    limit: 20,
  });
  console.log('Search results:', searchResults);

  return callLog;
}

/**
 * Example 7: Recording Management
 */
export async function exampleRecordingManagement(db) {
  // Create a recording
  const recording = await db.createRecording({
    call_log_id: 1,
    file_path: '/recordings/call_001.wav',
    file_size_bytes: 1024000,
    duration_seconds: 125,
    format: 'WAV',
    sample_rate: 8000,
    bitrate: '128kbps',
    is_encrypted: false,
  });
  console.log('Created recording:', recording);

  // Get recording by ID
  const rec = await db.getRecordingById(recording.id);
  console.log('Retrieved recording:', rec);

  // Get recordings for call
  const callRecordings = await db.getRecordingsByCallLogId(1);
  console.log('Call recordings:', callRecordings);

  // Update recording
  const updated = await db.updateRecording(recording.id, {
    is_encrypted: true,
    bitrate: '64kbps',
  });
  console.log('Updated recording:', updated);

  // Delete recording
  const deleted = await db.deleteRecording(recording.id);
  console.log('Deleted recording:', deleted);

  return recording;
}

/**
 * Example 8: Statistics and Reporting
 */
export async function exampleStatistics(db) {
  // Call statistics
  const callStats = await db.getCallStatistics({
    start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
  });
  console.log('Call statistics:', callStats);

  // Recording statistics
  const recordingStats = await db.getRecordingStatistics({
    start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  });
  console.log('Recording statistics:', recordingStats);

  return { callStats, recordingStats };
}

/**
 * Example 9: Health Check
 */
export async function exampleHealthCheck(db) {
  const health = await db.healthCheck();
  console.log('Database health:', health);
  return health;
}

/**
 * Example 10: Complete Workflow
 */
export async function exampleCompleteWorkflow() {
  // Initialize database
  const db = new DatabaseModule({
    type: 'sqlite',
    sqlite: { filename: './roip-server.db' },
  });

  try {
    await db.initialize();
    console.log('Database initialized');

    // Create user
    const user = await db.createUser({
      username: 'alice',
      email: 'alice@example.com',
      password_hash: '$2b$10$hash',
      display_name: 'Alice',
      role: 'user',
    });
    console.log('User created:', user.id);

    // Create devices
    const device1 = await db.createDevice({
      user_id: user.id,
      device_name: 'Device-A',
      device_type: 'TRANSCEIVER',
      hardware_id: 'HW-001',
      ip_address: '192.168.1.10',
      port: 5060,
    });

    const device2 = await db.createDevice({
      user_id: user.id,
      device_name: 'Device-B',
      device_type: 'TRANSCEIVER',
      hardware_id: 'HW-002',
      ip_address: '192.168.1.11',
      port: 5060,
    });

    // Create route
    const route = await db.createRoute({
      route_name: 'Route-A-B',
      source_device_id: device1.id,
      destination_device_id: device2.id,
      is_active: true,
    });

    // Create call log
    const callLog = await db.createCallLog({
      route_id: route.id,
      source_user_id: user.id,
      call_status: 'initiated',
      codec: 'G.711',
    });

    // Complete the call
    await db.completeCallLog(callLog.id, new Date().toISOString(), 60, 'completed');

    // Create recording
    await db.createRecording({
      call_log_id: callLog.id,
      file_path: '/recordings/call_001.wav',
      duration_seconds: 60,
      format: 'WAV',
    });

    // Get statistics
    const stats = await db.getCallStatistics();
    console.log('Final statistics:', stats);

    // Health check
    const health = await db.healthCheck();
    console.log('Health check:', health);

    await db.closeConnection();
  } catch (error) {
    console.error('Workflow error:', error);
    await db.closeConnection();
  }
}

// Run examples if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Database Module Examples');
  console.log('Uncomment the example you want to run in this file');
  // await exampleCompleteWorkflow();
}
