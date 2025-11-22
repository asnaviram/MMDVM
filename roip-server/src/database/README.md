# Database Module for RoIP Server

A comprehensive database module supporting both SQLite and PostgreSQL with complete CRUD operations, connection pooling, automatic migrations, and query helpers.

## Features

- **Dual Database Support**
  - SQLite (primary, zero-config)
  - PostgreSQL (optional, for production)

- **Complete Schema**
  - Users
  - Devices
  - Routes
  - Call Logs
  - Recordings

- **Advanced Features**
  - Connection pooling (PostgreSQL)
  - Automatic schema creation
  - Migration support
  - Full CRUD operations
  - Query helpers and statistics
  - Health checks
  - Foreign key constraints
  - Optimized indexes

## Installation

```bash
npm install better-sqlite3 pg
```

## Quick Start

### SQLite (Default)

```javascript
import DatabaseModule from './database.js';

const db = new DatabaseModule({
  type: 'sqlite',
  sqlite: {
    filename: './roip-server.db',
  },
});

await db.initialize();

// Use database
const user = await db.createUser({
  username: 'john_doe',
  email: 'john@example.com',
  password_hash: '$2b$10$hash',
  display_name: 'John Doe',
});

await db.closeConnection();
```

### PostgreSQL

```javascript
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
```

## Database Schema

### Users Table
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  role TEXT DEFAULT 'user',
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME
);
```

### Devices Table
```sql
CREATE TABLE devices (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  device_name TEXT NOT NULL,
  device_type TEXT NOT NULL,
  hardware_id TEXT UNIQUE,
  ip_address TEXT,
  port INTEGER,
  firmware_version TEXT,
  is_active INTEGER DEFAULT 1,
  last_seen DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### Routes Table
```sql
CREATE TABLE routes (
  id INTEGER PRIMARY KEY,
  route_name TEXT UNIQUE NOT NULL,
  description TEXT,
  source_device_id INTEGER NOT NULL,
  destination_device_id INTEGER NOT NULL,
  route_type TEXT DEFAULT 'direct',
  is_active INTEGER DEFAULT 1,
  priority INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (source_device_id) REFERENCES devices(id),
  FOREIGN KEY (destination_device_id) REFERENCES devices(id)
);
```

### Call Logs Table
```sql
CREATE TABLE call_logs (
  id INTEGER PRIMARY KEY,
  route_id INTEGER NOT NULL,
  source_user_id INTEGER,
  destination_user_id INTEGER,
  call_type TEXT,
  start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  end_time DATETIME,
  duration_seconds INTEGER,
  call_status TEXT DEFAULT 'initiated',
  codec TEXT,
  audio_quality INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (route_id) REFERENCES routes(id),
  FOREIGN KEY (source_user_id) REFERENCES users(id),
  FOREIGN KEY (destination_user_id) REFERENCES users(id)
);
```

### Recordings Table
```sql
CREATE TABLE recordings (
  id INTEGER PRIMARY KEY,
  call_log_id INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  file_size_bytes INTEGER,
  duration_seconds INTEGER,
  format TEXT,
  sample_rate INTEGER,
  bitrate TEXT,
  is_encrypted INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (call_log_id) REFERENCES call_logs(id)
);
```

## API Documentation

### User Operations

```javascript
// Create user
const user = await db.createUser({
  username: 'john',
  email: 'john@example.com',
  password_hash: 'hashed_password',
  display_name: 'John Doe',
  role: 'user',
  is_active: true,
});

// Get user by ID
const user = await db.getUserById(1);

// Get user by username
const user = await db.getUserByUsername('john');

// Get user by email
const user = await db.getUserByEmail('john@example.com');

// Get all users with filters
const users = await db.getAllUsers({
  is_active: true,
  role: 'admin',
  limit: 50,
  offset: 0,
});

// Update user
const updated = await db.updateUser(1, {
  display_name: 'John Smith',
  role: 'admin',
});

// Delete user
await db.deleteUser(1);

// Update last login timestamp
await db.updateUserLastLogin(1);
```

### Device Operations

```javascript
// Create device
const device = await db.createDevice({
  user_id: 1,
  device_name: 'ESP32-01',
  device_type: 'TRANSCEIVER',
  hardware_id: 'ESP32-12345678',
  ip_address: '192.168.1.100',
  port: 5060,
  firmware_version: '1.0.0',
  is_active: true,
});

// Get device by ID
const device = await db.getDeviceById(1);

// Get devices by user
const devices = await db.getDevicesByUserId(1, {
  is_active: true,
});

// Get device by hardware ID
const device = await db.getDeviceByHardwareId('ESP32-12345678');

// Update device
const updated = await db.updateDevice(1, {
  firmware_version: '1.0.1',
  ip_address: '192.168.1.101',
});

// Delete device
await db.deleteDevice(1);

// Update last seen timestamp
await db.updateDeviceLastSeen(1);

// Get device count for user
const count = await db.getUserDeviceCount(1);
```

### Route Operations

```javascript
// Create route
const route = await db.createRoute({
  route_name: 'Device1-to-Device2',
  description: 'Direct route',
  source_device_id: 1,
  destination_device_id: 2,
  route_type: 'direct',
  is_active: true,
  priority: 10,
});

// Get route by ID
const route = await db.getRouteById(1);

// Get routes for device
const routes = await db.getRoutesByDeviceId(1);

// Get active routes
const routes = await db.getActiveRoutes({
  route_type: 'direct',
});

// Update route
const updated = await db.updateRoute(1, {
  priority: 20,
  is_active: false,
});

// Delete route
await db.deleteRoute(1);
```

### Call Log Operations

```javascript
// Create call log
const callLog = await db.createCallLog({
  route_id: 1,
  source_user_id: 1,
  destination_user_id: 2,
  call_type: 'voice',
  call_status: 'initiated',
  codec: 'G.711',
  audio_quality: 85,
});

// Get call log by ID
const log = await db.getCallLogById(1);

// Get call logs for route
const logs = await db.getCallLogsByRouteId(1, {
  call_status: 'completed',
  start_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  limit: 50,
});

// Get call logs for user
const logs = await db.getCallLogsByUserId(1, {
  start_date: '2025-01-01',
  end_date: '2025-01-31',
});

// Update call log
const updated = await db.updateCallLog(1, {
  call_status: 'ringing',
  audio_quality: 90,
});

// Delete call log
await db.deleteCallLog(1);

// Complete call
await db.completeCallLog(1, new Date().toISOString(), 125, 'completed');

// Search call logs
const results = await db.searchCallLogs('john', {
  call_status: 'completed',
  limit: 20,
});
```

### Recording Operations

```javascript
// Create recording
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

// Get recording by ID
const recording = await db.getRecordingById(1);

// Get recordings for call
const recordings = await db.getRecordingsByCallLogId(1);

// Update recording
const updated = await db.updateRecording(1, {
  is_encrypted: true,
});

// Delete recording
await db.deleteRecording(1);
```

### Statistics & Helpers

```javascript
// Get call statistics
const stats = await db.getCallStatistics({
  route_id: 1,
  start_date: '2025-01-01',
  end_date: '2025-01-31',
});
// Returns: total_calls, completed_calls, failed_calls, avg_duration_seconds, total_duration_seconds

// Get recording statistics
const stats = await db.getRecordingStatistics({
  start_date: '2025-01-01',
});
// Returns: total_recordings, total_size_bytes, avg_duration_seconds, encrypted_recordings

// Health check
const health = await db.healthCheck();
// Returns: { status: 'healthy', database: 'sqlite', timestamp: '...' }

// Close connection
await db.closeConnection();
```

## Migrations

Place migration files in the `migrations/` directory with the naming pattern `NNN_description.js`:

```javascript
// migrations/002_add_new_column.js
export default async function migration(db) {
  if (db.config.type === 'sqlite') {
    db.exec('ALTER TABLE users ADD COLUMN new_column TEXT');
  } else {
    await db.query('ALTER TABLE users ADD COLUMN new_column VARCHAR(255)');
  }
}
```

## Error Handling

All operations throw errors with descriptive messages:

```javascript
try {
  await db.createUser({ /* invalid data */ });
} catch (error) {
  console.error(error.message);
}
```

## Performance Notes

- SQLite uses WAL (Write-Ahead Logging) for better concurrency
- PostgreSQL uses connection pooling with configurable pool size
- Proper indexes are created for foreign keys and frequently queried columns
- Use pagination (limit/offset) for large result sets
- Consider adding database-specific query optimization for high-traffic scenarios

## Connection Pooling

PostgreSQL uses the `pg` library's connection pool:

```javascript
const db = new DatabaseModule({
  type: 'postgresql',
  postgresql: {
    max: 20,                          // Maximum pool size
    idleTimeoutMillis: 30000,         // 30 seconds
    connectionTimeoutMillis: 2000,    // 2 seconds
  },
});
```

## File Structure

```
/src/database/
├── database.js        # Main DatabaseModule class
├── migrations/        # Database migration scripts
│   └── 001_init_schema.js
├── examples.js        # Usage examples
└── README.md         # This file
```

## License

GPL-2.0
