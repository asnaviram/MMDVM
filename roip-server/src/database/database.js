/**
 * Database Module for RoIP Server
 * Supports SQLite (primary) and PostgreSQL (optional)
 * Includes connection pooling, migrations, and CRUD operations
 */

import Database from 'better-sqlite3';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Database class handling all database operations
 */
export class DatabaseModule {
  constructor(config = {}) {
    this.config = {
      type: config.type || 'sqlite',
      sqlite: {
        filename: config.sqlite?.filename || './roip-server.db',
        options: config.sqlite?.options || {
          verbose: config.sqlite?.verbose || null,
          timeout: 5000,
          fileMustExist: false,
          ...config.sqlite?.options,
        },
      },
      postgresql: {
        host: config.postgresql?.host || 'localhost',
        port: config.postgresql?.port || 5432,
        database: config.postgresql?.database || 'roip_server',
        user: config.postgresql?.user || 'roip_user',
        password: config.postgresql?.password || 'roip_password',
        max: config.postgresql?.max || 20,
        idleTimeoutMillis: config.postgresql?.idleTimeoutMillis || 30000,
        connectionTimeoutMillis: config.postgresql?.connectionTimeoutMillis || 2000,
        ...config.postgresql,
      },
    };

    this.db = null;
    this.pgPool = null;
    this.isInitialized = false;
  }

  /**
   * Initialize database connection
   */
  async initialize() {
    if (this.isInitialized) {
      return this.db || this.pgPool;
    }

    try {
      if (this.config.type === 'sqlite') {
        this.initializeSQLite();
      } else if (this.config.type === 'postgresql') {
        await this.initializePostgreSQL();
      } else {
        throw new Error(`Unsupported database type: ${this.config.type}`);
      }

      await this.createSchema();
      await this.runMigrations();
      this.isInitialized = true;
      return this.db || this.pgPool;
    } catch (error) {
      throw new Error(`Database initialization failed: ${error.message}`);
    }
  }

  /**
   * Initialize SQLite database
   */
  initializeSQLite() {
    const dbPath = this.config.sqlite.filename;
    this.db = new Database(dbPath, this.config.sqlite.options);

    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');

    // Set journal mode to WAL for better concurrency
    this.db.pragma('journal_mode = WAL');

    console.log(`SQLite database initialized: ${dbPath}`);
  }

  /**
   * Initialize PostgreSQL database
   */
  async initializePostgreSQL() {
    this.pgPool = new pg.Pool(this.config.postgresql);

    this.pgPool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });

    // Test connection
    const client = await this.pgPool.connect();
    client.release();
    console.log('PostgreSQL connection pool initialized');
  }

  /**
   * Create database schema
   */
  async createSchema() {
    if (this.config.type === 'sqlite') {
      this.createSQLiteSchema();
    } else {
      await this.createPostgreSQLSchema();
    }
  }

  /**
   * Create SQLite schema
   */
  createSQLiteSchema() {
    // Users table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        display_name TEXT,
        role TEXT DEFAULT 'user',
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME
      );
    `);

    // Devices table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
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
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // Routes table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS routes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        route_name TEXT NOT NULL UNIQUE,
        description TEXT,
        source_device_id INTEGER NOT NULL,
        destination_device_id INTEGER NOT NULL,
        route_type TEXT DEFAULT 'direct',
        is_active INTEGER DEFAULT 1,
        priority INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (source_device_id) REFERENCES devices(id) ON DELETE CASCADE,
        FOREIGN KEY (destination_device_id) REFERENCES devices(id) ON DELETE CASCADE
      );
    `);

    // Call logs table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS call_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
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
        FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE,
        FOREIGN KEY (source_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (destination_user_id) REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    // Recordings table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS recordings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
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
        FOREIGN KEY (call_log_id) REFERENCES call_logs(id) ON DELETE CASCADE
      );
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
      CREATE INDEX IF NOT EXISTS idx_devices_hardware_id ON devices(hardware_id);
      CREATE INDEX IF NOT EXISTS idx_routes_source ON routes(source_device_id);
      CREATE INDEX IF NOT EXISTS idx_routes_destination ON routes(destination_device_id);
      CREATE INDEX IF NOT EXISTS idx_call_logs_route_id ON call_logs(route_id);
      CREATE INDEX IF NOT EXISTS idx_call_logs_source_user ON call_logs(source_user_id);
      CREATE INDEX IF NOT EXISTS idx_call_logs_destination_user ON call_logs(destination_user_id);
      CREATE INDEX IF NOT EXISTS idx_call_logs_start_time ON call_logs(start_time);
      CREATE INDEX IF NOT EXISTS idx_recordings_call_log_id ON recordings(call_log_id);
    `);
  }

  /**
   * Create PostgreSQL schema
   */
  async createPostgreSQLSchema() {
    try {
      const client = await this.pgPool.connect();

      // Create extensions
      await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

      // Users table
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(255) NOT NULL UNIQUE,
          email VARCHAR(255) NOT NULL UNIQUE,
          password_hash VARCHAR(255) NOT NULL,
          display_name VARCHAR(255),
          role VARCHAR(50) DEFAULT 'user',
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_login TIMESTAMP
        );
      `);

      // Devices table
      await client.query(`
        CREATE TABLE IF NOT EXISTS devices (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL,
          device_name VARCHAR(255) NOT NULL,
          device_type VARCHAR(100) NOT NULL,
          hardware_id VARCHAR(255) UNIQUE,
          ip_address VARCHAR(45),
          port INTEGER,
          firmware_version VARCHAR(50),
          is_active BOOLEAN DEFAULT true,
          last_seen TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
      `);

      // Routes table
      await client.query(`
        CREATE TABLE IF NOT EXISTS routes (
          id SERIAL PRIMARY KEY,
          route_name VARCHAR(255) NOT NULL UNIQUE,
          description TEXT,
          source_device_id INTEGER NOT NULL,
          destination_device_id INTEGER NOT NULL,
          route_type VARCHAR(50) DEFAULT 'direct',
          is_active BOOLEAN DEFAULT true,
          priority INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (source_device_id) REFERENCES devices(id) ON DELETE CASCADE,
          FOREIGN KEY (destination_device_id) REFERENCES devices(id) ON DELETE CASCADE
        );
      `);

      // Call logs table
      await client.query(`
        CREATE TABLE IF NOT EXISTS call_logs (
          id SERIAL PRIMARY KEY,
          route_id INTEGER NOT NULL,
          source_user_id INTEGER,
          destination_user_id INTEGER,
          call_type VARCHAR(50),
          start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          end_time TIMESTAMP,
          duration_seconds INTEGER,
          call_status VARCHAR(50) DEFAULT 'initiated',
          codec VARCHAR(50),
          audio_quality INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE,
          FOREIGN KEY (source_user_id) REFERENCES users(id) ON DELETE SET NULL,
          FOREIGN KEY (destination_user_id) REFERENCES users(id) ON DELETE SET NULL
        );
      `);

      // Recordings table
      await client.query(`
        CREATE TABLE IF NOT EXISTS recordings (
          id SERIAL PRIMARY KEY,
          call_log_id INTEGER NOT NULL,
          file_path VARCHAR(500) NOT NULL,
          file_size_bytes BIGINT,
          duration_seconds INTEGER,
          format VARCHAR(50),
          sample_rate INTEGER,
          bitrate VARCHAR(50),
          is_encrypted BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (call_log_id) REFERENCES call_logs(id) ON DELETE CASCADE
        );
      `);

      // Create indexes
      await client.query('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);');
      await client.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);');
      await client.query('CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);');
      await client.query('CREATE INDEX IF NOT EXISTS idx_devices_hardware_id ON devices(hardware_id);');
      await client.query('CREATE INDEX IF NOT EXISTS idx_routes_source ON routes(source_device_id);');
      await client.query('CREATE INDEX IF NOT EXISTS idx_routes_destination ON routes(destination_device_id);');
      await client.query('CREATE INDEX IF NOT EXISTS idx_call_logs_route_id ON call_logs(route_id);');
      await client.query('CREATE INDEX IF NOT EXISTS idx_call_logs_source_user ON call_logs(source_user_id);');
      await client.query('CREATE INDEX IF NOT EXISTS idx_call_logs_destination_user ON call_logs(destination_user_id);');
      await client.query('CREATE INDEX IF NOT EXISTS idx_call_logs_start_time ON call_logs(start_time);');
      await client.query('CREATE INDEX IF NOT EXISTS idx_recordings_call_log_id ON recordings(call_log_id);');

      client.release();
    } catch (error) {
      console.error('PostgreSQL schema creation error:', error);
      throw error;
    }
  }

  /**
   * Run database migrations
   */
  async runMigrations() {
    const migrationsDir = path.join(__dirname, 'migrations');

    if (!fs.existsSync(migrationsDir)) {
      fs.mkdirSync(migrationsDir, { recursive: true });
      return;
    }

    const migrations = fs.readdirSync(migrationsDir).sort();

    for (const migration of migrations) {
      if (!migration.endsWith('.js')) continue;

      const migrationPath = path.join(migrationsDir, migration);
      const { default: migrationFn } = await import(`file://${migrationPath}`);

      try {
        if (this.config.type === 'sqlite') {
          await migrationFn(this.db);
        } else {
          await migrationFn(this.pgPool);
        }
        console.log(`Migration completed: ${migration}`);
      } catch (error) {
        console.error(`Migration failed: ${migration}`, error);
        throw error;
      }
    }
  }

  /**
   * USERS CRUD Operations
   */

  async createUser(userData) {
    try {
      if (this.config.type === 'sqlite') {
        const stmt = this.db.prepare(`
          INSERT INTO users (username, email, password_hash, display_name, role, is_active)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        const info = stmt.run(
          userData.username,
          userData.email,
          userData.password_hash,
          userData.display_name || null,
          userData.role || 'user',
          userData.is_active !== false ? 1 : 0
        );
        return { id: info.lastInsertRowid, ...userData };
      } else {
        const result = await this.pgPool.query(
          `INSERT INTO users (username, email, password_hash, display_name, role, is_active)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [
            userData.username,
            userData.email,
            userData.password_hash,
            userData.display_name || null,
            userData.role || 'user',
            userData.is_active !== false,
          ]
        );
        return result.rows[0];
      }
    } catch (error) {
      throw new Error(`Failed to create user: ${error.message}`);
    }
  }

  async getUserById(userId) {
    try {
      if (this.config.type === 'sqlite') {
        const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
        return stmt.get(userId);
      } else {
        const result = await this.pgPool.query('SELECT * FROM users WHERE id = $1', [userId]);
        return result.rows[0];
      }
    } catch (error) {
      throw new Error(`Failed to get user: ${error.message}`);
    }
  }

  async getUserByUsername(username) {
    try {
      if (this.config.type === 'sqlite') {
        const stmt = this.db.prepare('SELECT * FROM users WHERE username = ?');
        return stmt.get(username);
      } else {
        const result = await this.pgPool.query('SELECT * FROM users WHERE username = $1', [username]);
        return result.rows[0];
      }
    } catch (error) {
      throw new Error(`Failed to get user by username: ${error.message}`);
    }
  }

  async getUserByEmail(email) {
    try {
      if (this.config.type === 'sqlite') {
        const stmt = this.db.prepare('SELECT * FROM users WHERE email = ?');
        return stmt.get(email);
      } else {
        const result = await this.pgPool.query('SELECT * FROM users WHERE email = $1', [email]);
        return result.rows[0];
      }
    } catch (error) {
      throw new Error(`Failed to get user by email: ${error.message}`);
    }
  }

  async getAllUsers(filters = {}) {
    try {
      let query = 'SELECT * FROM users WHERE 1=1';
      const params = [];

      if (filters.is_active !== undefined) {
        const activeValue = this.config.type === 'sqlite' ? (filters.is_active ? 1 : 0) : filters.is_active;
        query += this.config.type === 'sqlite' ? ' AND is_active = ?' : ' AND is_active = $' + (params.length + 1);
        params.push(activeValue);
      }

      if (filters.role) {
        query += this.config.type === 'sqlite' ? ' AND role = ?' : ' AND role = $' + (params.length + 1);
        params.push(filters.role);
      }

      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      const limit = filters.limit || 100;
      const offset = filters.offset || 0;
      params.push(limit, offset);

      if (this.config.type === 'sqlite') {
        const stmt = this.db.prepare(query);
        return stmt.all(...params);
      } else {
        const result = await this.pgPool.query(query, params);
        return result.rows;
      }
    } catch (error) {
      throw new Error(`Failed to get users: ${error.message}`);
    }
  }

  async updateUser(userId, updates) {
    try {
      const fields = [];
      const values = [];
      let paramIndex = 1;

      for (const [key, value] of Object.entries(updates)) {
        if (['id', 'created_at'].includes(key)) continue;
        fields.push(this.config.type === 'sqlite' ? `${key} = ?` : `${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }

      fields.push(this.config.type === 'sqlite' ? 'updated_at = ?' : `updated_at = $${paramIndex}`);
      values.push(new Date().toISOString());
      values.push(userId);

      if (this.config.type === 'sqlite') {
        const stmt = this.db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`);
        stmt.run(...values);
        // Return the updated record
        return this.getUserById(userId);
      } else {
        const result = await this.pgPool.query(
          `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIndex + 1} RETURNING *`,
          values
        );
        return result.rows[0];
      }
    } catch (error) {
      throw new Error(`Failed to update user: ${error.message}`);
    }
  }

  async deleteUser(userId) {
    try {
      if (this.config.type === 'sqlite') {
        const stmt = this.db.prepare('DELETE FROM users WHERE id = ?');
        const info = stmt.run(userId);
        return { changes: info.changes };
      } else {
        const result = await this.pgPool.query('DELETE FROM users WHERE id = $1 RETURNING id', [userId]);
        return { changes: result.rowCount };
      }
    } catch (error) {
      throw new Error(`Failed to delete user: ${error.message}`);
    }
  }

  async updateUserLastLogin(userId) {
    try {
      if (this.config.type === 'sqlite') {
        const stmt = this.db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?');
        stmt.run(userId);
      } else {
        await this.pgPool.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [userId]);
      }
    } catch (error) {
      throw new Error(`Failed to update last login: ${error.message}`);
    }
  }

  /**
   * DEVICES CRUD Operations
   */

  async createDevice(deviceData) {
    try {
      if (this.config.type === 'sqlite') {
        const stmt = this.db.prepare(`
          INSERT INTO devices (user_id, device_name, device_type, hardware_id, ip_address, port, firmware_version, is_active)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const info = stmt.run(
          deviceData.user_id,
          deviceData.device_name,
          deviceData.device_type,
          deviceData.hardware_id || null,
          deviceData.ip_address || null,
          deviceData.port || null,
          deviceData.firmware_version || null,
          deviceData.is_active !== false ? 1 : 0
        );
        return { id: info.lastInsertRowid, ...deviceData };
      } else {
        const result = await this.pgPool.query(
          `INSERT INTO devices (user_id, device_name, device_type, hardware_id, ip_address, port, firmware_version, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [
            deviceData.user_id,
            deviceData.device_name,
            deviceData.device_type,
            deviceData.hardware_id || null,
            deviceData.ip_address || null,
            deviceData.port || null,
            deviceData.firmware_version || null,
            deviceData.is_active !== false,
          ]
        );
        return result.rows[0];
      }
    } catch (error) {
      throw new Error(`Failed to create device: ${error.message}`);
    }
  }

  async getDeviceById(deviceId) {
    try {
      if (this.config.type === 'sqlite') {
        const stmt = this.db.prepare('SELECT * FROM devices WHERE id = ?');
        return stmt.get(deviceId);
      } else {
        const result = await this.pgPool.query('SELECT * FROM devices WHERE id = $1', [deviceId]);
        return result.rows[0];
      }
    } catch (error) {
      throw new Error(`Failed to get device: ${error.message}`);
    }
  }

  async getDevicesByUserId(userId, filters = {}) {
    try {
      let query = 'SELECT * FROM devices WHERE user_id = ?';
      const params = [userId];

      if (filters.is_active !== undefined) {
        const activeValue = this.config.type === 'sqlite' ? (filters.is_active ? 1 : 0) : filters.is_active;
        query += this.config.type === 'sqlite' ? ' AND is_active = ?' : ' AND is_active = $2';
        params.push(activeValue);
      }

      query += ' ORDER BY created_at DESC';

      if (this.config.type === 'sqlite') {
        const stmt = this.db.prepare(query);
        return stmt.all(...params);
      } else {
        const result = await this.pgPool.query(query, params);
        return result.rows;
      }
    } catch (error) {
      throw new Error(`Failed to get user devices: ${error.message}`);
    }
  }

  async getDeviceByHardwareId(hardwareId) {
    try {
      if (this.config.type === 'sqlite') {
        const stmt = this.db.prepare('SELECT * FROM devices WHERE hardware_id = ?');
        return stmt.get(hardwareId);
      } else {
        const result = await this.pgPool.query('SELECT * FROM devices WHERE hardware_id = $1', [hardwareId]);
        return result.rows[0];
      }
    } catch (error) {
      throw new Error(`Failed to get device by hardware ID: ${error.message}`);
    }
  }

  async updateDevice(deviceId, updates) {
    try {
      const fields = [];
      const values = [];
      let paramIndex = 1;

      for (const [key, value] of Object.entries(updates)) {
        if (['id', 'created_at'].includes(key)) continue;
        fields.push(this.config.type === 'sqlite' ? `${key} = ?` : `${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }

      fields.push(this.config.type === 'sqlite' ? 'updated_at = ?' : `updated_at = $${paramIndex}`);
      values.push(new Date().toISOString());
      values.push(deviceId);

      if (this.config.type === 'sqlite') {
        const stmt = this.db.prepare(`UPDATE devices SET ${fields.join(', ')} WHERE id = ?`);
        stmt.run(...values);
        // Return the updated record
        return this.getDeviceById(deviceId);
      } else {
        const result = await this.pgPool.query(
          `UPDATE devices SET ${fields.join(', ')} WHERE id = $${paramIndex + 1} RETURNING *`,
          values
        );
        return result.rows[0];
      }
    } catch (error) {
      throw new Error(`Failed to update device: ${error.message}`);
    }
  }

  async deleteDevice(deviceId) {
    try {
      if (this.config.type === 'sqlite') {
        const stmt = this.db.prepare('DELETE FROM devices WHERE id = ?');
        const info = stmt.run(deviceId);
        return { changes: info.changes };
      } else {
        const result = await this.pgPool.query('DELETE FROM devices WHERE id = $1 RETURNING id', [deviceId]);
        return { changes: result.rowCount };
      }
    } catch (error) {
      throw new Error(`Failed to delete device: ${error.message}`);
    }
  }

  async updateDeviceLastSeen(deviceId) {
    try {
      if (this.config.type === 'sqlite') {
        const stmt = this.db.prepare('UPDATE devices SET last_seen = CURRENT_TIMESTAMP WHERE id = ?');
        stmt.run(deviceId);
      } else {
        await this.pgPool.query('UPDATE devices SET last_seen = CURRENT_TIMESTAMP WHERE id = $1', [deviceId]);
      }
    } catch (error) {
      throw new Error(`Failed to update device last seen: ${error.message}`);
    }
  }

  /**
   * ROUTES CRUD Operations
   */

  async createRoute(routeData) {
    try {
      if (this.config.type === 'sqlite') {
        const stmt = this.db.prepare(`
          INSERT INTO routes (route_name, description, source_device_id, destination_device_id, route_type, is_active, priority)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        const info = stmt.run(
          routeData.route_name,
          routeData.description || null,
          routeData.source_device_id,
          routeData.destination_device_id,
          routeData.route_type || 'direct',
          routeData.is_active !== false ? 1 : 0,
          routeData.priority || 0
        );
        return { id: info.lastInsertRowid, ...routeData };
      } else {
        const result = await this.pgPool.query(
          `INSERT INTO routes (route_name, description, source_device_id, destination_device_id, route_type, is_active, priority)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [
            routeData.route_name,
            routeData.description || null,
            routeData.source_device_id,
            routeData.destination_device_id,
            routeData.route_type || 'direct',
            routeData.is_active !== false,
            routeData.priority || 0,
          ]
        );
        return result.rows[0];
      }
    } catch (error) {
      throw new Error(`Failed to create route: ${error.message}`);
    }
  }

  async getRouteById(routeId) {
    try {
      if (this.config.type === 'sqlite') {
        const stmt = this.db.prepare('SELECT * FROM routes WHERE id = ?');
        return stmt.get(routeId);
      } else {
        const result = await this.pgPool.query('SELECT * FROM routes WHERE id = $1', [routeId]);
        return result.rows[0];
      }
    } catch (error) {
      throw new Error(`Failed to get route: ${error.message}`);
    }
  }

  async getRoutesByDeviceId(deviceId) {
    try {
      let query = `SELECT * FROM routes WHERE source_device_id = ? OR destination_device_id = ? ORDER BY priority DESC, created_at DESC`;

      if (this.config.type === 'sqlite') {
        const stmt = this.db.prepare(query);
        return stmt.all(deviceId, deviceId);
      } else {
        const result = await this.pgPool.query(query.replace(/\?/g, (match, offset) => `$${offset / 1 + 1}`), [deviceId, deviceId]);
        return result.rows;
      }
    } catch (error) {
      throw new Error(`Failed to get device routes: ${error.message}`);
    }
  }

  async getActiveRoutes(filters = {}) {
    try {
      let query = 'SELECT * FROM routes WHERE is_active = ?';
      const params = [this.config.type === 'sqlite' ? 1 : true];

      if (filters.route_type) {
        query += this.config.type === 'sqlite' ? ' AND route_type = ?' : ' AND route_type = $' + (params.length + 1);
        params.push(filters.route_type);
      }

      query += ' ORDER BY priority DESC, created_at DESC';

      if (this.config.type === 'sqlite') {
        const stmt = this.db.prepare(query);
        return stmt.all(...params);
      } else {
        const result = await this.pgPool.query(query, params);
        return result.rows;
      }
    } catch (error) {
      throw new Error(`Failed to get active routes: ${error.message}`);
    }
  }

  async updateRoute(routeId, updates) {
    try {
      const fields = [];
      const values = [];
      let paramIndex = 1;

      for (const [key, value] of Object.entries(updates)) {
        if (['id', 'created_at'].includes(key)) continue;
        fields.push(this.config.type === 'sqlite' ? `${key} = ?` : `${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }

      fields.push(this.config.type === 'sqlite' ? 'updated_at = ?' : `updated_at = $${paramIndex}`);
      values.push(new Date().toISOString());
      values.push(routeId);

      if (this.config.type === 'sqlite') {
        const stmt = this.db.prepare(`UPDATE routes SET ${fields.join(', ')} WHERE id = ?`);
        stmt.run(...values);
        // Return the updated record
        return this.getRouteById(routeId);
      } else {
        const result = await this.pgPool.query(
          `UPDATE routes SET ${fields.join(', ')} WHERE id = $${paramIndex + 1} RETURNING *`,
          values
        );
        return result.rows[0];
      }
    } catch (error) {
      throw new Error(`Failed to update route: ${error.message}`);
    }
  }

  async deleteRoute(routeId) {
    try {
      if (this.config.type === 'sqlite') {
        const stmt = this.db.prepare('DELETE FROM routes WHERE id = ?');
        const info = stmt.run(routeId);
        return { changes: info.changes };
      } else {
        const result = await this.pgPool.query('DELETE FROM routes WHERE id = $1 RETURNING id', [routeId]);
        return { changes: result.rowCount };
      }
    } catch (error) {
      throw new Error(`Failed to delete route: ${error.message}`);
    }
  }

  /**
   * CALL_LOGS CRUD Operations
   */

  async createCallLog(callLogData) {
    try {
      if (this.config.type === 'sqlite') {
        const stmt = this.db.prepare(`
          INSERT INTO call_logs (route_id, source_user_id, destination_user_id, call_type, call_status, codec, audio_quality)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        const info = stmt.run(
          callLogData.route_id,
          callLogData.source_user_id || null,
          callLogData.destination_user_id || null,
          callLogData.call_type || null,
          callLogData.call_status || 'initiated',
          callLogData.codec || null,
          callLogData.audio_quality || null
        );
        return { id: info.lastInsertRowid, ...callLogData };
      } else {
        const result = await this.pgPool.query(
          `INSERT INTO call_logs (route_id, source_user_id, destination_user_id, call_type, call_status, codec, audio_quality)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [
            callLogData.route_id,
            callLogData.source_user_id || null,
            callLogData.destination_user_id || null,
            callLogData.call_type || null,
            callLogData.call_status || 'initiated',
            callLogData.codec || null,
            callLogData.audio_quality || null,
          ]
        );
        return result.rows[0];
      }
    } catch (error) {
      throw new Error(`Failed to create call log: ${error.message}`);
    }
  }

  async getCallLogById(callLogId) {
    try {
      if (this.config.type === 'sqlite') {
        const stmt = this.db.prepare('SELECT * FROM call_logs WHERE id = ?');
        return stmt.get(callLogId);
      } else {
        const result = await this.pgPool.query('SELECT * FROM call_logs WHERE id = $1', [callLogId]);
        return result.rows[0];
      }
    } catch (error) {
      throw new Error(`Failed to get call log: ${error.message}`);
    }
  }

  async getCallLogsByRouteId(routeId, filters = {}) {
    try {
      let query = 'SELECT * FROM call_logs WHERE route_id = ?';
      const params = [routeId];

      if (filters.call_status) {
        query += this.config.type === 'sqlite' ? ' AND call_status = ?' : ' AND call_status = $' + (params.length + 1);
        params.push(filters.call_status);
      }

      if (filters.start_date) {
        query += this.config.type === 'sqlite' ? ' AND start_time >= ?' : ' AND start_time >= $' + (params.length + 1);
        params.push(filters.start_date);
      }

      if (filters.end_date) {
        query += this.config.type === 'sqlite' ? ' AND start_time <= ?' : ' AND start_time <= $' + (params.length + 1);
        params.push(filters.end_date);
      }

      query += ' ORDER BY start_time DESC LIMIT ? OFFSET ?';
      const limit = filters.limit || 100;
      const offset = filters.offset || 0;
      params.push(limit, offset);

      if (this.config.type === 'sqlite') {
        const stmt = this.db.prepare(query);
        return stmt.all(...params);
      } else {
        const result = await this.pgPool.query(query, params);
        return result.rows;
      }
    } catch (error) {
      throw new Error(`Failed to get route call logs: ${error.message}`);
    }
  }

  async getCallLogsByUserId(userId, filters = {}) {
    try {
      let query = 'SELECT * FROM call_logs WHERE source_user_id = ? OR destination_user_id = ?';
      const params = [userId, userId];

      if (filters.call_status) {
        query += this.config.type === 'sqlite' ? ' AND call_status = ?' : ' AND call_status = $' + (params.length + 1);
        params.push(filters.call_status);
      }

      if (filters.start_date) {
        query += this.config.type === 'sqlite' ? ' AND start_time >= ?' : ' AND start_time >= $' + (params.length + 1);
        params.push(filters.start_date);
      }

      if (filters.end_date) {
        query += this.config.type === 'sqlite' ? ' AND start_time <= ?' : ' AND start_time <= $' + (params.length + 1);
        params.push(filters.end_date);
      }

      query += ' ORDER BY start_time DESC LIMIT ? OFFSET ?';
      const limit = filters.limit || 100;
      const offset = filters.offset || 0;
      params.push(limit, offset);

      if (this.config.type === 'sqlite') {
        const stmt = this.db.prepare(query);
        return stmt.all(...params);
      } else {
        const result = await this.pgPool.query(query, params);
        return result.rows;
      }
    } catch (error) {
      throw new Error(`Failed to get user call logs: ${error.message}`);
    }
  }

  async updateCallLog(callLogId, updates) {
    try {
      const fields = [];
      const values = [];
      let paramIndex = 1;

      for (const [key, value] of Object.entries(updates)) {
        if (['id', 'created_at'].includes(key)) continue;
        fields.push(this.config.type === 'sqlite' ? `${key} = ?` : `${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }

      values.push(callLogId);

      if (this.config.type === 'sqlite') {
        const stmt = this.db.prepare(`UPDATE call_logs SET ${fields.join(', ')} WHERE id = ?`);
        stmt.run(...values);
        // Return the updated record
        return this.getCallLogById(callLogId);
      } else {
        const result = await this.pgPool.query(
          `UPDATE call_logs SET ${fields.join(', ')} WHERE id = $${paramIndex + 1} RETURNING *`,
          values
        );
        return result.rows[0];
      }
    } catch (error) {
      throw new Error(`Failed to update call log: ${error.message}`);
    }
  }

  async deleteCallLog(callLogId) {
    try {
      if (this.config.type === 'sqlite') {
        const stmt = this.db.prepare('DELETE FROM call_logs WHERE id = ?');
        const info = stmt.run(callLogId);
        return { changes: info.changes };
      } else {
        const result = await this.pgPool.query('DELETE FROM call_logs WHERE id = $1 RETURNING id', [callLogId]);
        return { changes: result.rowCount };
      }
    } catch (error) {
      throw new Error(`Failed to delete call log: ${error.message}`);
    }
  }

  async completeCallLog(callLogId, endTime, durationSeconds, finalStatus = 'completed') {
    try {
      if (this.config.type === 'sqlite') {
        const stmt = this.db.prepare(
          'UPDATE call_logs SET end_time = ?, duration_seconds = ?, call_status = ? WHERE id = ?'
        );
        stmt.run(endTime, durationSeconds, finalStatus, callLogId);
        // Return the updated record
        return this.getCallLogById(callLogId);
      } else {
        const result = await this.pgPool.query(
          'UPDATE call_logs SET end_time = $1, duration_seconds = $2, call_status = $3 WHERE id = $4 RETURNING *',
          [endTime, durationSeconds, finalStatus, callLogId]
        );
        return result.rows[0];
      }
    } catch (error) {
      throw new Error(`Failed to complete call log: ${error.message}`);
    }
  }

  /**
   * RECORDINGS CRUD Operations
   */

  async createRecording(recordingData) {
    try {
      if (this.config.type === 'sqlite') {
        const stmt = this.db.prepare(`
          INSERT INTO recordings (call_log_id, file_path, file_size_bytes, duration_seconds, format, sample_rate, bitrate, is_encrypted)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const info = stmt.run(
          recordingData.call_log_id,
          recordingData.file_path,
          recordingData.file_size_bytes || null,
          recordingData.duration_seconds || null,
          recordingData.format || null,
          recordingData.sample_rate || null,
          recordingData.bitrate || null,
          recordingData.is_encrypted ? 1 : 0
        );
        return { id: info.lastInsertRowid, ...recordingData };
      } else {
        const result = await this.pgPool.query(
          `INSERT INTO recordings (call_log_id, file_path, file_size_bytes, duration_seconds, format, sample_rate, bitrate, is_encrypted)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [
            recordingData.call_log_id,
            recordingData.file_path,
            recordingData.file_size_bytes || null,
            recordingData.duration_seconds || null,
            recordingData.format || null,
            recordingData.sample_rate || null,
            recordingData.bitrate || null,
            recordingData.is_encrypted || false,
          ]
        );
        return result.rows[0];
      }
    } catch (error) {
      throw new Error(`Failed to create recording: ${error.message}`);
    }
  }

  async getRecordingById(recordingId) {
    try {
      if (this.config.type === 'sqlite') {
        const stmt = this.db.prepare('SELECT * FROM recordings WHERE id = ?');
        return stmt.get(recordingId);
      } else {
        const result = await this.pgPool.query('SELECT * FROM recordings WHERE id = $1', [recordingId]);
        return result.rows[0];
      }
    } catch (error) {
      throw new Error(`Failed to get recording: ${error.message}`);
    }
  }

  async getRecordingsByCallLogId(callLogId) {
    try {
      if (this.config.type === 'sqlite') {
        const stmt = this.db.prepare('SELECT * FROM recordings WHERE call_log_id = ? ORDER BY created_at DESC');
        return stmt.all(callLogId);
      } else {
        const result = await this.pgPool.query('SELECT * FROM recordings WHERE call_log_id = $1 ORDER BY created_at DESC', [
          callLogId,
        ]);
        return result.rows;
      }
    } catch (error) {
      throw new Error(`Failed to get call recordings: ${error.message}`);
    }
  }

  async updateRecording(recordingId, updates) {
    try {
      const fields = [];
      const values = [];
      let paramIndex = 1;

      for (const [key, value] of Object.entries(updates)) {
        if (['id', 'created_at', 'call_log_id'].includes(key)) continue;
        fields.push(this.config.type === 'sqlite' ? `${key} = ?` : `${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }

      fields.push(this.config.type === 'sqlite' ? 'updated_at = ?' : `updated_at = $${paramIndex}`);
      values.push(new Date().toISOString());
      values.push(recordingId);

      if (this.config.type === 'sqlite') {
        const stmt = this.db.prepare(`UPDATE recordings SET ${fields.join(', ')} WHERE id = ?`);
        stmt.run(...values);
        // Return the updated record
        return this.getRecordingById(recordingId);
      } else {
        const result = await this.pgPool.query(
          `UPDATE recordings SET ${fields.join(', ')} WHERE id = $${paramIndex + 1} RETURNING *`,
          values
        );
        return result.rows[0];
      }
    } catch (error) {
      throw new Error(`Failed to update recording: ${error.message}`);
    }
  }

  async deleteRecording(recordingId) {
    try {
      if (this.config.type === 'sqlite') {
        const stmt = this.db.prepare('DELETE FROM recordings WHERE id = ?');
        const info = stmt.run(recordingId);
        return { changes: info.changes };
      } else {
        const result = await this.pgPool.query('DELETE FROM recordings WHERE id = $1 RETURNING id', [recordingId]);
        return { changes: result.rowCount };
      }
    } catch (error) {
      throw new Error(`Failed to delete recording: ${error.message}`);
    }
  }

  /**
   * Query Helpers
   */

  async getCallStatistics(filters = {}) {
    try {
      let query = `
        SELECT
          COUNT(*) as total_calls,
          SUM(CASE WHEN call_status = 'completed' THEN 1 ELSE 0 END) as completed_calls,
          SUM(CASE WHEN call_status = 'failed' THEN 1 ELSE 0 END) as failed_calls,
          AVG(CASE WHEN duration_seconds IS NOT NULL THEN duration_seconds ELSE 0 END) as avg_duration_seconds,
          SUM(CASE WHEN duration_seconds IS NOT NULL THEN duration_seconds ELSE 0 END) as total_duration_seconds
        FROM call_logs
        WHERE 1=1
      `;
      const params = [];

      if (filters.route_id) {
        query += this.config.type === 'sqlite' ? ' AND route_id = ?' : ' AND route_id = $' + (params.length + 1);
        params.push(filters.route_id);
      }

      if (filters.start_date) {
        query += this.config.type === 'sqlite' ? ' AND start_time >= ?' : ' AND start_time >= $' + (params.length + 1);
        params.push(filters.start_date);
      }

      if (filters.end_date) {
        query += this.config.type === 'sqlite' ? ' AND start_time <= ?' : ' AND start_time <= $' + (params.length + 1);
        params.push(filters.end_date);
      }

      if (this.config.type === 'sqlite') {
        const stmt = this.db.prepare(query);
        return stmt.get(...params);
      } else {
        const result = await this.pgPool.query(query, params);
        return result.rows[0];
      }
    } catch (error) {
      throw new Error(`Failed to get call statistics: ${error.message}`);
    }
  }

  async getRecordingStatistics(filters = {}) {
    try {
      let query = `
        SELECT
          COUNT(*) as total_recordings,
          SUM(file_size_bytes) as total_size_bytes,
          AVG(duration_seconds) as avg_duration_seconds,
          SUM(CASE WHEN is_encrypted = ? THEN 1 ELSE 0 END) as encrypted_recordings
        FROM recordings
        WHERE 1=1
      `;
      const encryptedValue = this.config.type === 'sqlite' ? 1 : true;
      const params = [encryptedValue];

      if (filters.call_log_id) {
        query += this.config.type === 'sqlite' ? ' AND call_log_id = ?' : ' AND call_log_id = $' + (params.length + 1);
        params.push(filters.call_log_id);
      }

      if (filters.start_date) {
        query += this.config.type === 'sqlite' ? ' AND created_at >= ?' : ' AND created_at >= $' + (params.length + 1);
        params.push(filters.start_date);
      }

      if (filters.end_date) {
        query += this.config.type === 'sqlite' ? ' AND created_at <= ?' : ' AND created_at <= $' + (params.length + 1);
        params.push(filters.end_date);
      }

      if (this.config.type === 'sqlite') {
        const stmt = this.db.prepare(query);
        return stmt.get(...params);
      } else {
        const result = await this.pgPool.query(query, params);
        return result.rows[0];
      }
    } catch (error) {
      throw new Error(`Failed to get recording statistics: ${error.message}`);
    }
  }

  async getUserDeviceCount(userId) {
    try {
      if (this.config.type === 'sqlite') {
        const stmt = this.db.prepare('SELECT COUNT(*) as count FROM devices WHERE user_id = ?');
        const result = stmt.get(userId);
        return result.count;
      } else {
        const result = await this.pgPool.query('SELECT COUNT(*) as count FROM devices WHERE user_id = $1', [userId]);
        return parseInt(result.rows[0].count);
      }
    } catch (error) {
      throw new Error(`Failed to get user device count: ${error.message}`);
    }
  }

  async searchCallLogs(searchTerm, filters = {}) {
    try {
      let query = `
        SELECT cl.*, u1.username as source_username, u2.username as destination_username
        FROM call_logs cl
        LEFT JOIN users u1 ON cl.source_user_id = u1.id
        LEFT JOIN users u2 ON cl.destination_user_id = u2.id
        WHERE 1=1
      `;
      const params = [];

      if (searchTerm) {
        query += this.config.type === 'sqlite'
          ? ' AND (u1.username LIKE ? OR u2.username LIKE ?)'
          : ' AND (u1.username ILIKE $' + (params.length + 1) + ' OR u2.username ILIKE $' + (params.length + 2) + ')';
        const term = `%${searchTerm}%`;
        params.push(term, term);
      }

      if (filters.call_status) {
        query += this.config.type === 'sqlite' ? ' AND cl.call_status = ?' : ' AND cl.call_status = $' + (params.length + 1);
        params.push(filters.call_status);
      }

      query += ' ORDER BY cl.start_time DESC LIMIT ? OFFSET ?';
      const limit = filters.limit || 50;
      const offset = filters.offset || 0;
      params.push(limit, offset);

      if (this.config.type === 'sqlite') {
        const stmt = this.db.prepare(query);
        return stmt.all(...params);
      } else {
        const result = await this.pgPool.query(query, params);
        return result.rows;
      }
    } catch (error) {
      throw new Error(`Failed to search call logs: ${error.message}`);
    }
  }

  /**
   * Cleanup and shutdown
   */

  async closeConnection() {
    try {
      if (this.config.type === 'sqlite' && this.db) {
        this.db.close();
        console.log('SQLite connection closed');
      } else if (this.config.type === 'postgresql' && this.pgPool) {
        await this.pgPool.end();
        console.log('PostgreSQL connection pool closed');
      }
      this.isInitialized = false;
    } catch (error) {
      console.error('Error closing database connection:', error);
    }
  }

  /**
   * Health check
   */

  async healthCheck() {
    try {
      if (this.config.type === 'sqlite') {
        const stmt = this.db.prepare('SELECT 1 as health');
        const result = stmt.get();
        return { status: 'healthy', database: 'sqlite', timestamp: new Date().toISOString() };
      } else {
        const result = await this.pgPool.query('SELECT NOW()');
        return { status: 'healthy', database: 'postgresql', timestamp: new Date().toISOString() };
      }
    } catch (error) {
      throw new Error(`Database health check failed: ${error.message}`);
    }
  }
}

// Export default instance factory
export default DatabaseModule;
