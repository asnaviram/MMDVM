/**
 * Migration: Initial Schema
 * Created: 2025-01-01T00:00:01.000Z
 */

/**
 * Run the migration
 */
async function up(database) {
    console.log('Creating initial schema...');

    // Users table
    await database.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(255) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            email VARCHAR(255),
            display_name VARCHAR(255),
            role VARCHAR(50) DEFAULT 'user',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP,
            is_active BOOLEAN DEFAULT true
        )
    `);

    // Devices table
    await database.query(`
        CREATE TABLE IF NOT EXISTS devices (
            id SERIAL PRIMARY KEY,
            device_id VARCHAR(255) NOT NULL UNIQUE,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            name VARCHAR(255) NOT NULL,
            type VARCHAR(50) DEFAULT 'esp32',
            sip_uri VARCHAR(255),
            ip_address INET,
            last_seen TIMESTAMP,
            firmware_version VARCHAR(50),
            hardware_version VARCHAR(50),
            status VARCHAR(50) DEFAULT 'offline',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Sessions table
    await database.query(`
        CREATE TABLE IF NOT EXISTS sessions (
            id SERIAL PRIMARY KEY,
            session_id VARCHAR(255) NOT NULL UNIQUE,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            device_id INTEGER REFERENCES devices(id) ON DELETE CASCADE,
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            ended_at TIMESTAMP,
            duration INTEGER,
            ip_address INET,
            user_agent TEXT
        )
    `);

    // Call logs table
    await database.query(`
        CREATE TABLE IF NOT EXISTS call_logs (
            id SERIAL PRIMARY KEY,
            call_id VARCHAR(255) NOT NULL,
            caller_device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL,
            callee_device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL,
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            ended_at TIMESTAMP,
            duration INTEGER,
            status VARCHAR(50),
            direction VARCHAR(20),
            codec VARCHAR(50),
            quality_score DECIMAL(3,2),
            recording_path TEXT
        )
    `);

    // Audio statistics table
    await database.query(`
        CREATE TABLE IF NOT EXISTS audio_statistics (
            id SERIAL PRIMARY KEY,
            call_id VARCHAR(255) NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            packets_sent INTEGER DEFAULT 0,
            packets_received INTEGER DEFAULT 0,
            packets_lost INTEGER DEFAULT 0,
            jitter DECIMAL(10,2),
            latency INTEGER,
            codec VARCHAR(50),
            bitrate INTEGER
        )
    `);

    // Events table
    await database.query(`
        CREATE TABLE IF NOT EXISTS events (
            id SERIAL PRIMARY KEY,
            event_type VARCHAR(100) NOT NULL,
            severity VARCHAR(20) DEFAULT 'info',
            source VARCHAR(100),
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL,
            message TEXT,
            metadata JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Create indexes
    await database.query(`
        CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
        CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
        CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_device_id ON sessions(device_id);
        CREATE INDEX IF NOT EXISTS idx_call_logs_caller ON call_logs(caller_device_id);
        CREATE INDEX IF NOT EXISTS idx_call_logs_callee ON call_logs(callee_device_id);
        CREATE INDEX IF NOT EXISTS idx_call_logs_started_at ON call_logs(started_at);
        CREATE INDEX IF NOT EXISTS idx_audio_stats_call_id ON audio_statistics(call_id);
        CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
        CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
        CREATE INDEX IF NOT EXISTS idx_events_severity ON events(severity);
    `);

    console.log('Initial schema created successfully');
}

/**
 * Reverse the migration
 */
async function down(database) {
    console.log('Dropping initial schema...');

    // Drop tables in reverse order (respecting foreign keys)
    await database.query(`DROP TABLE IF EXISTS events CASCADE`);
    await database.query(`DROP TABLE IF EXISTS audio_statistics CASCADE`);
    await database.query(`DROP TABLE IF EXISTS call_logs CASCADE`);
    await database.query(`DROP TABLE IF EXISTS sessions CASCADE`);
    await database.query(`DROP TABLE IF EXISTS devices CASCADE`);
    await database.query(`DROP TABLE IF EXISTS users CASCADE`);

    console.log('Initial schema dropped successfully');
}

module.exports = { up, down };
