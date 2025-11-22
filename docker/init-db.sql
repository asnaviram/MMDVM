-- ESP32 RoIP Database Initialization Script
-- Creates initial schema for the RoIP Server

-- ========================================
-- Users Table
-- ========================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    full_name VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- Devices Table (ESP32 Clients)
-- ========================================
CREATE TABLE IF NOT EXISTS devices (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    device_name VARCHAR(255) NOT NULL,
    device_id VARCHAR(255) UNIQUE NOT NULL,
    device_type VARCHAR(100),
    firmware_version VARCHAR(50),
    hardware_version VARCHAR(50),
    mac_address VARCHAR(17),
    ip_address INET,
    last_seen TIMESTAMP,
    is_online BOOLEAN DEFAULT false,
    signal_strength INTEGER,
    location VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- Calls Table (Call History)
-- ========================================
CREATE TABLE IF NOT EXISTS calls (
    id SERIAL PRIMARY KEY,
    caller_id INTEGER REFERENCES devices(id) ON DELETE SET NULL,
    callee_id INTEGER REFERENCES devices(id) ON DELETE SET NULL,
    caller_name VARCHAR(255),
    callee_name VARCHAR(255),
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP,
    duration_seconds INTEGER,
    call_status VARCHAR(50),
    call_quality VARCHAR(50),
    audio_codec VARCHAR(50),
    sample_rate INTEGER,
    packet_loss NUMERIC(5,2),
    latency_ms INTEGER,
    jitter_ms INTEGER,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- Call Events Table (Detailed Event Log)
-- ========================================
CREATE TABLE IF NOT EXISTS call_events (
    id SERIAL PRIMARY KEY,
    call_id INTEGER REFERENCES calls(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- SIP Registrations Table
-- ========================================
CREATE TABLE IF NOT EXISTS sip_registrations (
    id SERIAL PRIMARY KEY,
    device_id INTEGER REFERENCES devices(id) ON DELETE CASCADE,
    sip_uri VARCHAR(255) UNIQUE NOT NULL,
    contact_uri VARCHAR(255) NOT NULL,
    expires TIMESTAMP NOT NULL,
    via VARCHAR(255),
    user_agent VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- RTP Sessions Table
-- ========================================
CREATE TABLE IF NOT EXISTS rtp_sessions (
    id SERIAL PRIMARY KEY,
    call_id INTEGER REFERENCES calls(id) ON DELETE CASCADE,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    local_port INTEGER NOT NULL,
    remote_port INTEGER NOT NULL,
    remote_ip INET NOT NULL,
    codec_type VARCHAR(50),
    sample_rate INTEGER,
    bitrate INTEGER,
    packets_sent BIGINT DEFAULT 0,
    packets_received BIGINT DEFAULT 0,
    bytes_sent BIGINT DEFAULT 0,
    bytes_received BIGINT DEFAULT 0,
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- Audio Quality Metrics Table
-- ========================================
CREATE TABLE IF NOT EXISTS audio_metrics (
    id SERIAL PRIMARY KEY,
    rtp_session_id INTEGER REFERENCES rtp_sessions(id) ON DELETE CASCADE,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    packet_loss NUMERIC(5,2),
    latency_ms NUMERIC(10,2),
    jitter_ms NUMERIC(10,2),
    mos_score NUMERIC(3,2),
    signal_level INTEGER,
    noise_level INTEGER,
    echo_level INTEGER
);

-- ========================================
-- Network Configuration Table
-- ========================================
CREATE TABLE IF NOT EXISTS network_config (
    id SERIAL PRIMARY KEY,
    device_id INTEGER REFERENCES devices(id) ON DELETE CASCADE,
    stun_server VARCHAR(255),
    turn_server VARCHAR(255),
    turn_username VARCHAR(255),
    nat_type VARCHAR(50),
    upnp_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- System Logs Table
-- ========================================
CREATE TABLE IF NOT EXISTS system_logs (
    id SERIAL PRIMARY KEY,
    level VARCHAR(20),
    component VARCHAR(100),
    message TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- API Tokens Table
-- ========================================
CREATE TABLE IF NOT EXISTS api_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    token_name VARCHAR(255),
    last_used TIMESTAMP,
    expires_at TIMESTAMP,
    is_revoked BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- Indexes for Performance
-- ========================================

-- Users indexes
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_created_at ON users(created_at DESC);

-- Devices indexes
CREATE INDEX idx_devices_user_id ON devices(user_id);
CREATE INDEX idx_devices_device_id ON devices(device_id);
CREATE INDEX idx_devices_is_online ON devices(is_online);
CREATE INDEX idx_devices_last_seen ON devices(last_seen DESC);

-- Calls indexes
CREATE INDEX idx_calls_caller_id ON calls(caller_id);
CREATE INDEX idx_calls_callee_id ON calls(callee_id);
CREATE INDEX idx_calls_start_time ON calls(start_time DESC);
CREATE INDEX idx_calls_status ON calls(call_status);

-- Call events indexes
CREATE INDEX idx_call_events_call_id ON call_events(call_id);
CREATE INDEX idx_call_events_timestamp ON call_events(timestamp DESC);
CREATE INDEX idx_call_events_type ON call_events(event_type);

-- SIP registrations indexes
CREATE INDEX idx_sip_registrations_device_id ON sip_registrations(device_id);
CREATE INDEX idx_sip_registrations_expires ON sip_registrations(expires);

-- RTP sessions indexes
CREATE INDEX idx_rtp_sessions_call_id ON rtp_sessions(call_id);
CREATE INDEX idx_rtp_sessions_session_id ON rtp_sessions(session_id);

-- Audio metrics indexes
CREATE INDEX idx_audio_metrics_rtp_session ON audio_metrics(rtp_session_id);
CREATE INDEX idx_audio_metrics_timestamp ON audio_metrics(timestamp DESC);

-- Network config indexes
CREATE INDEX idx_network_config_device_id ON network_config(device_id);

-- System logs indexes
CREATE INDEX idx_system_logs_level ON system_logs(level);
CREATE INDEX idx_system_logs_component ON system_logs(component);
CREATE INDEX idx_system_logs_created_at ON system_logs(created_at DESC);

-- API tokens indexes
CREATE INDEX idx_api_tokens_user_id ON api_tokens(user_id);
CREATE INDEX idx_api_tokens_expires_at ON api_tokens(expires_at);

-- ========================================
-- Views for Common Queries
-- ========================================

-- Active devices view
CREATE OR REPLACE VIEW v_active_devices AS
SELECT
    d.id,
    d.device_name,
    d.device_id,
    u.username,
    d.is_online,
    d.last_seen,
    d.signal_strength,
    d.ip_address
FROM devices d
JOIN users u ON d.user_id = u.id
WHERE d.is_active = true
ORDER BY d.last_seen DESC;

-- Recent calls view
CREATE OR REPLACE VIEW v_recent_calls AS
SELECT
    c.id,
    c.caller_name,
    c.callee_name,
    c.start_time,
    c.end_time,
    c.duration_seconds,
    c.call_status,
    c.call_quality
FROM calls c
WHERE c.created_at > NOW() - INTERVAL '7 days'
ORDER BY c.start_time DESC;

-- Device statistics view
CREATE OR REPLACE VIEW v_device_stats AS
SELECT
    d.id,
    d.device_name,
    COUNT(c.id) as total_calls,
    SUM(c.duration_seconds) as total_call_duration,
    AVG(c.latency_ms) as avg_latency,
    AVG(c.packet_loss) as avg_packet_loss,
    MAX(c.created_at) as last_call_time
FROM devices d
LEFT JOIN calls c ON (d.id = c.caller_id OR d.id = c.callee_id)
GROUP BY d.id, d.device_name;

-- ========================================
-- Initial Data (Optional)
-- ========================================

-- Insert default admin user (password: admin123)
-- In production, change this immediately!
INSERT INTO users (username, password_hash, email, is_active)
VALUES (
    'admin',
    '$2b$10$DixjxQWaxgnnNQrvmWEVIuZ09djHVhjRYvxF3.8k8p.K7H9tFgxzK',
    'admin@roip.local',
    true
) ON CONFLICT (username) DO NOTHING;

-- Insert example TURN configuration
INSERT INTO network_config (device_id, stun_server, turn_server, turn_username, nat_type)
SELECT id, 'coturn:3478', 'coturn:3478', 'roip', 'cone' FROM devices
WHERE NOT EXISTS (SELECT 1 FROM network_config WHERE device_id = devices.id)
ON CONFLICT DO NOTHING;
