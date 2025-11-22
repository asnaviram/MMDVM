# Database Module - Quick Start Guide

## Installation

```bash
# Dependencies already in package.json, just install
npm install
```

## Basic Usage

### SQLite (Recommended for Development)

```javascript
import DatabaseModule from './database.js';

const db = new DatabaseModule({
  type: 'sqlite',
  sqlite: { filename: './roip-server.db' }
});

await db.initialize();

// Create a user
const user = await db.createUser({
  username: 'john',
  email: 'john@example.com',
  password_hash: 'hashed_pw',
  display_name: 'John'
});

await db.closeConnection();
```

### PostgreSQL (Production)

```javascript
const db = new DatabaseModule({
  type: 'postgresql',
  postgresql: {
    host: 'localhost',
    port: 5432,
    database: 'roip_server',
    user: 'roip_user',
    password: 'secure_password'
  }
});

await db.initialize();
```

## Supported Tables & Operations

### Users
- `createUser()` - Create new user
- `getUserById(id)` - Get by ID
- `getUserByUsername(username)` - Get by username
- `getUserByEmail(email)` - Get by email
- `getAllUsers(filters)` - Get all with pagination
- `updateUser(id, updates)` - Update user
- `deleteUser(id)` - Delete user
- `updateUserLastLogin(id)` - Update login timestamp

### Devices
- `createDevice(data)` - Create device
- `getDeviceById(id)` - Get by ID
- `getDevicesByUserId(userId)` - Get user's devices
- `getDeviceByHardwareId(hwId)` - Find by hardware ID
- `updateDevice(id, updates)` - Update device
- `deleteDevice(id)` - Delete device
- `updateDeviceLastSeen(id)` - Update activity timestamp

### Routes
- `createRoute(data)` - Create route between devices
- `getRouteById(id)` - Get by ID
- `getRoutesByDeviceId(deviceId)` - Get routes for device
- `getActiveRoutes(filters)` - Get active routes
- `updateRoute(id, updates)` - Update route
- `deleteRoute(id)` - Delete route

### Call Logs
- `createCallLog(data)` - Create call log entry
- `getCallLogById(id)` - Get by ID
- `getCallLogsByRouteId(routeId, filters)` - Get route's calls
- `getCallLogsByUserId(userId, filters)` - Get user's calls
- `updateCallLog(id, updates)` - Update call log
- `deleteCallLog(id)` - Delete call log
- `completeCallLog(id, endTime, duration, status)` - Mark as complete
- `searchCallLogs(term, filters)` - Search call logs

### Recordings
- `createRecording(data)` - Create recording
- `getRecordingById(id)` - Get by ID
- `getRecordingsByCallLogId(callLogId)` - Get call's recordings
- `updateRecording(id, updates)` - Update recording
- `deleteRecording(id)` - Delete recording

### Helpers
- `getCallStatistics(filters)` - Get call statistics
- `getRecordingStatistics(filters)` - Get recording statistics
- `getUserDeviceCount(userId)` - Count user's devices
- `healthCheck()` - Check database health

## Integration with Express

```javascript
import express from 'express';
import { initializeDatabase } from './database/integration-example.js';

const app = express();
await initializeDatabase(app);

// Database is now available at req.app.locals.db or app.locals.db
```

## Database Schema

| Table | Purpose | Key Fields |
|-------|---------|-----------|
| users | Authentication & profiles | username, email, password_hash, role |
| devices | ESP32 radios | user_id, hardware_id, ip_address, port |
| routes | Voice routes | source_device_id, destination_device_id, priority |
| call_logs | Call history | route_id, start_time, duration_seconds, status |
| recordings | Audio files | call_log_id, file_path, duration_seconds |

## Error Handling

All methods throw descriptive errors:

```javascript
try {
  await db.createUser({ username: 'invalid' });
} catch (error) {
  console.error('Error:', error.message);
  // "Failed to create user: UNIQUE constraint failed: users.username"
}
```

## Configuration Environment Variables

```env
DB_TYPE=sqlite                    # sqlite or postgresql
SQLITE_PATH=./roip-server.db      # SQLite database file
PG_HOST=localhost                 # PostgreSQL host
PG_PORT=5432                      # PostgreSQL port
PG_DATABASE=roip_server           # Database name
PG_USER=roip_user                 # Database user
PG_PASSWORD=password              # Database password
PG_POOL_SIZE=20                   # Connection pool size
PG_IDLE_TIMEOUT=30000             # Idle timeout in ms
```

## File Organization

```
src/database/
├── database.js              # Main DatabaseModule class (1363 lines)
├── examples.js              # Usage examples (all operations)
├── integration-example.js   # Express server integration
├── migrations/              # Database migration scripts
│   └── 001_init_schema.js
├── README.md                # Full documentation
├── QUICK_START.md          # This file
└── QUICK_START.md
```

## Performance Tips

1. **Use pagination**: Always use `limit` and `offset` for large queries
2. **SQLite for dev**: Use SQLite for development (zero configuration)
3. **PostgreSQL for prod**: Use PostgreSQL for production (better scaling)
4. **Connection pooling**: PostgreSQL pool size defaults to 20 (adjust if needed)
5. **Indexes**: All foreign keys and frequently queried columns are indexed

## Graceful Shutdown

```javascript
// Clean up when exiting
process.on('SIGINT', async () => {
  await db.closeConnection();
  process.exit(0);
});
```

## Common Operations

### Create a complete call flow

```javascript
// 1. Create users
const user1 = await db.createUser({...});
const user2 = await db.createUser({...});

// 2. Create devices
const device1 = await db.createDevice({user_id: user1.id, ...});
const device2 = await db.createDevice({user_id: user2.id, ...});

// 3. Create route
const route = await db.createRoute({
  source_device_id: device1.id,
  destination_device_id: device2.id,
  ...
});

// 4. Log call
const callLog = await db.createCallLog({
  route_id: route.id,
  source_user_id: user1.id,
  destination_user_id: user2.id,
  ...
});

// 5. Complete call
await db.completeCallLog(callLog.id, endTime, duration, 'completed');

// 6. Save recording
const recording = await db.createRecording({
  call_log_id: callLog.id,
  file_path: '/recordings/call_001.wav',
  ...
});

// 7. Get statistics
const stats = await db.getCallStatistics();
```

## Troubleshooting

### "Cannot find module 'better-sqlite3'"
```bash
npm install better-sqlite3
```

### "SQLITE_CANTOPEN"
- Check database file path is writable
- Use absolute paths in production

### PostgreSQL connection refused
- Verify PostgreSQL is running
- Check credentials in environment variables
- Ensure database and user exist

### Foreign key constraint failed
- Ensure parent records exist before creating references
- Check CASCADE delete settings

## License

GPL-2.0
