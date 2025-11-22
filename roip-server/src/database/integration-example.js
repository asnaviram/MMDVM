/**
 * Server Integration Example
 * Shows how to integrate the Database module into the Express server
 */

import express from 'express';
import DatabaseModule from './database.js';

/**
 * Create and configure database instance
 */
export async function initializeDatabase(app) {
  // Initialize database
  const db = new DatabaseModule({
    type: process.env.DB_TYPE || 'sqlite',
    sqlite: {
      filename: process.env.SQLITE_PATH || './roip-server.db',
      verbose: process.env.NODE_ENV === 'development' ? console.log : null,
    },
    postgresql: {
      host: process.env.PG_HOST || 'localhost',
      port: process.env.PG_PORT || 5432,
      database: process.env.PG_DATABASE || 'roip_server',
      user: process.env.PG_USER || 'roip_user',
      password: process.env.PG_PASSWORD || 'roip_password',
      max: parseInt(process.env.PG_POOL_SIZE || '20'),
      idleTimeoutMillis: parseInt(process.env.PG_IDLE_TIMEOUT || '30000'),
    },
  });

  try {
    await db.initialize();
    console.log('Database initialized successfully');

    // Health check on startup
    const health = await db.healthCheck();
    console.log(`Database health: ${health.status} (${health.database})`);

    // Store db instance in app for use in routes
    app.locals.db = db;

    return db;
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

/**
 * Middleware to attach database to requests
 */
export function databaseMiddleware(req, res, next) {
  req.db = req.app.locals.db;
  next();
}

/**
 * Example User Routes
 */
export function createUserRoutes(app) {
  const db = app.locals.db;

  // Create user
  app.post('/api/users', async (req, res) => {
    try {
      const { username, email, password_hash, display_name, role } = req.body;

      // Validate input
      if (!username || !email || !password_hash) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const user = await db.createUser({
        username,
        email,
        password_hash,
        display_name,
        role: role || 'user',
        is_active: true,
      });

      res.status(201).json(user);
    } catch (error) {
      console.error('Failed to create user:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get user
  app.get('/api/users/:id', async (req, res) => {
    try {
      const user = await db.getUserById(parseInt(req.params.id));

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Don't send password hash
      delete user.password_hash;
      res.json(user);
    } catch (error) {
      console.error('Failed to get user:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get all users
  app.get('/api/users', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;

      const users = await db.getAllUsers({ limit, offset });

      // Remove password hashes
      users.forEach((user) => delete user.password_hash);

      res.json(users);
    } catch (error) {
      console.error('Failed to get users:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update user
  app.patch('/api/users/:id', async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const updates = req.body;

      // Don't allow password updates via this endpoint
      delete updates.password_hash;
      delete updates.id;
      delete updates.created_at;

      const updated = await db.updateUser(userId, updates);

      if (updated.changes === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const user = await db.getUserById(userId);
      delete user.password_hash;
      res.json(user);
    } catch (error) {
      console.error('Failed to update user:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete user
  app.delete('/api/users/:id', async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const result = await db.deleteUser(userId);

      if (result.changes === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete user:', error);
      res.status(500).json({ error: error.message });
    }
  });
}

/**
 * Example Device Routes
 */
export function createDeviceRoutes(app) {
  const db = app.locals.db;

  // Create device
  app.post('/api/devices', async (req, res) => {
    try {
      const {
        user_id,
        device_name,
        device_type,
        hardware_id,
        ip_address,
        port,
        firmware_version,
      } = req.body;

      if (!user_id || !device_name || !device_type) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const device = await db.createDevice({
        user_id,
        device_name,
        device_type,
        hardware_id,
        ip_address,
        port,
        firmware_version,
        is_active: true,
      });

      res.status(201).json(device);
    } catch (error) {
      console.error('Failed to create device:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get user devices
  app.get('/api/users/:user_id/devices', async (req, res) => {
    try {
      const userId = parseInt(req.params.user_id);
      const devices = await db.getDevicesByUserId(userId);

      res.json(devices);
    } catch (error) {
      console.error('Failed to get user devices:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get device
  app.get('/api/devices/:id', async (req, res) => {
    try {
      const device = await db.getDeviceById(parseInt(req.params.id));

      if (!device) {
        return res.status(404).json({ error: 'Device not found' });
      }

      res.json(device);
    } catch (error) {
      console.error('Failed to get device:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update device
  app.patch('/api/devices/:id', async (req, res) => {
    try {
      const deviceId = parseInt(req.params.id);
      const updates = req.body;

      delete updates.id;
      delete updates.created_at;

      const result = await db.updateDevice(deviceId, updates);

      if (!result) {
        return res.status(404).json({ error: 'Device not found' });
      }

      const device = await db.getDeviceById(deviceId);
      res.json(device);
    } catch (error) {
      console.error('Failed to update device:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete device
  app.delete('/api/devices/:id', async (req, res) => {
    try {
      const deviceId = parseInt(req.params.id);
      const result = await db.deleteDevice(deviceId);

      if (result.changes === 0) {
        return res.status(404).json({ error: 'Device not found' });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete device:', error);
      res.status(500).json({ error: error.message });
    }
  });
}

/**
 * Example Call Log Routes
 */
export function createCallLogRoutes(app) {
  const db = app.locals.db;

  // Get call logs for user
  app.get('/api/users/:user_id/call-logs', async (req, res) => {
    try {
      const userId = parseInt(req.params.user_id);
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;

      const logs = await db.getCallLogsByUserId(userId, { limit, offset });

      res.json(logs);
    } catch (error) {
      console.error('Failed to get call logs:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get call statistics
  app.get('/api/statistics/calls', async (req, res) => {
    try {
      const stats = await db.getCallStatistics({
        route_id: req.query.route_id ? parseInt(req.query.route_id) : undefined,
        start_date: req.query.start_date,
        end_date: req.query.end_date,
      });

      res.json(stats);
    } catch (error) {
      console.error('Failed to get call statistics:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Search call logs
  app.get('/api/call-logs/search', async (req, res) => {
    try {
      const { q, status, limit, offset } = req.query;

      const results = await db.searchCallLogs(q || '', {
        call_status: status,
        limit: parseInt(limit) || 50,
        offset: parseInt(offset) || 0,
      });

      res.json(results);
    } catch (error) {
      console.error('Failed to search call logs:', error);
      res.status(500).json({ error: error.message });
    }
  });
}

/**
 * Health check route
 */
export function createHealthRoute(app) {
  const db = app.locals.db;

  app.get('/health/db', async (req, res) => {
    try {
      const health = await db.healthCheck();
      res.json(health);
    } catch (error) {
      console.error('Health check failed:', error);
      res.status(503).json({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  });
}

/**
 * Complete server setup example
 */
export async function setupServer(app) {
  // Initialize database
  const db = await initializeDatabase(app);

  // Use database middleware
  app.use(databaseMiddleware);

  // Create routes
  createUserRoutes(app);
  createDeviceRoutes(app);
  createCallLogRoutes(app);
  createHealthRoute(app);

  // Cleanup on shutdown
  process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    await db.closeConnection();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('Shutting down gracefully...');
    await db.closeConnection();
    process.exit(0);
  });

  return app;
}

/**
 * Example usage in main server file:
 *
 * import express from 'express';
 * import { setupServer } from './database/integration-example.js';
 *
 * const app = express();
 * app.use(express.json());
 *
 * await setupServer(app);
 *
 * const PORT = process.env.PORT || 8080;
 * app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
 */
