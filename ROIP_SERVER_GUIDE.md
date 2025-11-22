# ESP32 RoIP System - Server Deployment Guide

Complete guide for deploying and managing the central RoIP server.

---

## Table of Contents

1. [Server Architecture](#server-architecture)
2. [Deployment Options](#deployment-options)
3. [Installation](#installation)
4. [Configuration](#configuration)
5. [User Management](#user-management)
6. [Monitoring & Maintenance](#monitoring--maintenance)
7. [Advanced Deployment](#advanced-deployment)
8. [Troubleshooting](#troubleshooting)

---

## Server Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    RoIP Server System                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐    ┌──────────────────┐               │
│  │  SIP Server      │    │  RTP Media       │               │
│  │  (drachtio)      │    │  Handler         │               │
│  │                  │    │  (rtpengine)     │               │
│  │ - Registration   │    │                  │               │
│  │ - Call Routing   │    │ - Audio Mixing   │               │
│  │ - Auth           │    │ - Transcoding    │               │
│  │ - Signaling      │    │ - Recording      │               │
│  └──────┬───────────┘    └──────┬───────────┘               │
│         │                       │                            │
│  ┌──────▼─────────────────────▼──────┐                      │
│  │         Database (PostgreSQL)     │                      │
│  │  - Users & Devices                │                      │
│  │  - Call Logs                      │                      │
│  │  - Routes & Permissions           │                      │
│  │  - Configuration                  │                      │
│  └──────┬──────────────────────────┬─┘                      │
│         │                          │                         │
│  ┌──────▼────────┐      ┌─────────▼────────┐               │
│  │  TURN Server  │      │  REST API Server │               │
│  │  (coturn)     │      │  (Node.js/Go)    │               │
│  │               │      │                  │               │
│  │ - NAT         │      │ - Configuration  │               │
│  │   Traversal   │      │ - Control        │               │
│  │ - Relay       │      │ - Monitoring     │               │
│  │ - STUN/TURN   │      │ - OTA Updates    │               │
│  └───────────────┘      └─────────────────┘               │
│         ▲                          ▲                         │
│         │ Network                  │ HTTP/WebSocket         │
│         ▼                          ▼                         │
│  ┌──────────────────────────────────────────┐              │
│  │     Web Dashboard (React)                │              │
│  │  - Device Management                     │              │
│  │  - Call Monitoring                       │              │
│  │  - Call History & Recording              │              │
│  │  - User Administration                   │              │
│  │  - Performance Monitoring                │              │
│  └──────────────────────────────────────────┘              │
│         ▲                                                    │
│         │ HTTPS                                             │
│         ▼                                                    │
│  Browsers / Mobile Clients                                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow Diagram

```
ESP32 Client                RoIP Server                ESP32 Client
    │                            │                         │
    │─── REGISTER SIP ───────────>│                         │
    │<─── 200 OK (auth) ─────────│                         │
    │                            │                         │
    │─── INVITE (with SDP) ─────>│<─── REGISTER SIP ──────│
    │                            │─── 200 OK ───────────>│
    │                        [Database lookup]             │
    │<─── 100 TRYING ────────────│─── INVITE ────────────>│
    │<─── INVITE to peer ────────│                         │
    │─── 200 OK ────────────────>│<─── 200 OK ───────────│
    │<─── ACK ───────────────────│─── ACK ───────────────>│
    │                            │                         │
    │─────── RTP Audio ──────────────────── RTP Audio ────>│
    │<───── RTP Audio ──────────────────── RTP Audio ─────│
    │                            │                         │
    │  [Recording to disk]       │                         │
    │  [Audio mixing if multi]   │                         │
    │                            │                         │
    │─── BYE ───────────────────>│─── BYE ───────────────>│
    │<─── 200 OK ────────────────│<─── 200 OK ───────────│
    │                            │                         │
```

---

## Deployment Options

### Option 1: Cloud VPS (Recommended for Production)

**Best for:** Always-on service with public IP, scalability

**Providers:**
- DigitalOcean (cheapest: $5-10/month)
- Linode
- Vultr
- AWS (more expensive)
- Google Cloud
- Azure

**Advantages:**
- Public IP address
- 24/7 uptime
- Easy SSL certificates
- Scalable resources
- Professional support

**Disadvantages:**
- Monthly cost
- Limited to provider's infrastructure

**Minimum Requirements:**
- 1-2 vCPU
- 2GB RAM
- 20GB SSD
- Ubuntu 20.04 LTS
- Public IPv4 address
- Port forwarding (5060, 3478, 10000-20000)

### Option 2: Local/Home Server

**Best for:** Small networks, testing, privacy

**Hardware:**
- Old laptop/desktop
- Raspberry Pi 4 (4GB RAM minimum)
- NUC (Intel Mini PC)
- Any Linux-capable computer

**Advantages:**
- No monthly cost
- Full control
- Private/offline option
- Good for learning

**Disadvantages:**
- Behind CGNAT usually
- Requires TURN relay on public VPS
- Must stay on 24/7
- Limited uptime
- Power costs

**Setup:**
- Ubuntu 20.04 LTS
- TURN relay on public VPS
- Dynamic DNS for hostname updates

### Option 3: Hybrid Deployment

**Best for:** Maximum reliability and performance

**Architecture:**
```
┌─────────────────────────────────┐
│   Public Cloud VPS              │
│  - SIP Server (drachtio)         │
│  - TURN Relay                    │
│  - Database (PostgreSQL)         │
│  - Web Dashboard                 │
└──────────────┬──────────────────┘
               │ Secure Tunnel (WireGuard/OpenVPN)
               │
┌──────────────▼──────────────────┐
│  Local Home Server              │
│  - RTP Media Handler            │
│  - Recording                     │
│  - Local SIP Extensions         │
│  - Backup Database Replica      │
└──────────────────────────────────┘
```

---

## Installation

### Prerequisites

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install dependencies
sudo apt install -y \
    curl \
    wget \
    git \
    build-essential \
    libssl-dev \
    libffi-dev \
    python3-dev \
    python3-pip \
    postgresql \
    postgresql-contrib \
    redis-server \
    nginx \
    nodejs \
    npm
```

### Quick Start with Docker (Recommended)

**Install Docker:**

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

**Deploy with Docker Compose:**

```bash
# Create deployment directory
mkdir -p ~/roip-server && cd ~/roip-server

# Create docker-compose.yml (see below)
cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  # PostgreSQL Database
  postgres:
    image: postgres:15-alpine
    container_name: roip-postgres
    environment:
      POSTGRES_USER: roip
      POSTGRES_PASSWORD: secure_password_here
      POSTGRES_DB: roip_db
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init-db.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"
    restart: always
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U roip"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Redis Cache
  redis:
    image: redis:7-alpine
    container_name: roip-redis
    ports:
      - "6379:6379"
    restart: always
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data

  # TURN Server (coturn)
  coturn:
    image: coturn/coturn:latest
    container_name: roip-coturn
    ports:
      - "3478:3478/tcp"
      - "3478:3478/udp"
      - "5349:5349/tcp"
      - "5349:5349/udp"
      - "49152-49200:49152-49200/udp"
    volumes:
      - ./turnserver.conf:/etc/coturn/turnserver.conf:ro
    restart: always
    network_mode: host

  # RoIP API Server
  roip-api:
    build:
      context: ./server
      dockerfile: Dockerfile
    container_name: roip-api
    environment:
      DATABASE_URL: postgresql://roip:secure_password_here@postgres:5432/roip_db
      REDIS_URL: redis://redis:6379
      SIP_PORT: 5060
      RTP_PORT_START: 10000
      RTP_PORT_END: 20000
      JWT_SECRET: your_jwt_secret_here
      TURN_SERVER: your_public_ip:3478
      TURN_USERNAME: roip_user
      TURN_PASSWORD: turn_password_here
    ports:
      - "5060:5060/udp"
      - "8080:8080"
      - "10000-20000:10000-20000/udp"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    restart: always
    volumes:
      - ./recordings:/app/recordings

  # Web Dashboard
  dashboard:
    build:
      context: ./dashboard
      dockerfile: Dockerfile
    container_name: roip-dashboard
    ports:
      - "3000:3000"
    environment:
      REACT_APP_API_URL: http://your_public_ip:8080
      REACT_APP_WS_URL: ws://your_public_ip:8080
    depends_on:
      - roip-api
    restart: always

  # Nginx Reverse Proxy
  nginx:
    image: nginx:alpine
    container_name: roip-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
      - ./certbot/conf:/etc/letsencrypt:ro
    depends_on:
      - roip-api
      - dashboard
    restart: always

volumes:
  postgres_data:
  redis_data:
EOF

# Start all services
docker-compose up -d

# Check status
docker-compose ps
```

### Manual Installation (Linux)

**1. Install PostgreSQL:**

```bash
sudo apt install postgresql postgresql-contrib

# Create database and user
sudo -u postgres psql << SQL
CREATE USER roip WITH PASSWORD 'secure_password';
CREATE DATABASE roip_db OWNER roip;
ALTER USER roip CREATEDB;
\q
SQL

# Initialize schema
psql -U roip -d roip_db -f init-db.sql
```

**2. Install TURN Server (coturn):**

```bash
sudo apt install coturn

# Configure
sudo tee /etc/coturn/turnserver.conf > /dev/null << 'EOF'
listening-port=3478
listening-ip=0.0.0.0
listening-ip=::
external-ip=your.public.ip/internal.ip

user=roip:roippassword

realm=example.com
server-name=turn.example.com

# Enable logging
log-file=/var/log/coturn/turnserver.log
verbose

# Performance tuning
bps-capacity=1000000
allowed-peer-ip=0.0.0.0/0
allowed-peer-ip=::/0

# Security
cipher-list=HIGH:!aNULL:!eNULL:!EXPORT:!DES:!MD5:!PSK:!RC4

# Stun
stun-only
no-multicast-peers
EOF

# Start service
sudo systemctl enable coturn
sudo systemctl start coturn
sudo systemctl status coturn
```

**3. Build RoIP API Server:**

```bash
# Clone/prepare server code
cd ~/roip-server
git clone <server-repo> server
cd server

# Install dependencies (Node.js example)
npm install

# Configure environment
cat > .env << 'EOF'
DATABASE_URL=postgresql://roip:secure_password@localhost:5432/roip_db
REDIS_URL=redis://localhost:6379
JWT_SECRET=$(openssl rand -base64 32)
SIP_PORT=5060
TURN_HOST=your.public.ip
TURN_PORT=3478
NODE_ENV=production
EOF

# Start server
npm start
```

**4. Configure Nginx:**

```bash
sudo tee /etc/nginx/sites-available/roip > /dev/null << 'EOF'
upstream roip_api {
    server 127.0.0.1:8080;
}

upstream roip_dashboard {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name roip.example.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name roip.example.com;

    # SSL Configuration (Use Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/roip.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/roip.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # API Proxy
    location /api/ {
        proxy_pass http://roip_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Dashboard
    location / {
        proxy_pass http://roip_dashboard;
        proxy_set_header Host $host;
    }
}
EOF

# Enable site
sudo ln -s /etc/nginx/sites-available/roip /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

**5. Setup SSL Certificate (Let's Encrypt):**

```bash
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot certonly --nginx -d roip.example.com

# Auto-renew
sudo systemctl enable certbot.timer
```

---

## Configuration

### Database Schema

```sql
-- Users
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(64) UNIQUE NOT NULL,
    email VARCHAR(128) UNIQUE,
    password_hash VARCHAR(256) NOT NULL,
    full_name VARCHAR(128),
    role VARCHAR(32) DEFAULT 'user',
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Devices
CREATE TABLE devices (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    device_name VARCHAR(128) NOT NULL,
    sip_uri VARCHAR(256) UNIQUE,
    mac_address VARCHAR(17),
    ip_address INET,
    device_type VARCHAR(32),
    firmware_version VARCHAR(32),
    last_registered TIMESTAMP,
    status VARCHAR(32),
    config JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Routes (crosspatching)
CREATE TABLE routes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(128),
    source_device_id INTEGER REFERENCES devices(id),
    dest_device_id INTEGER REFERENCES devices(id),
    route_type VARCHAR(32),
    priority INTEGER DEFAULT 5,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Call Logs
CREATE TABLE call_logs (
    id SERIAL PRIMARY KEY,
    caller_id INTEGER REFERENCES devices(id),
    callee_id INTEGER REFERENCES devices(id),
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    duration_seconds INTEGER,
    audio_quality JSONB,
    recording_path VARCHAR(512),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_devices_user_id ON devices(user_id);
CREATE INDEX idx_devices_sip_uri ON devices(sip_uri);
CREATE INDEX idx_call_logs_start_time ON call_logs(start_time DESC);
```

### SIP Configuration

**Server Configuration (Example):**

```yaml
# config.yaml
sip:
  # SIP listening address and port
  listen_address: 0.0.0.0
  listen_port: 5060

  # Server identification
  server_name: roip.example.com
  domain: example.com

  # Authentication
  realm: example.com
  authentication:
    method: digest  # digest or basic
    password_hash_algo: sha256

  # Timers (RFC 3261)
  timer_t1: 500      # Initial transmission (ms)
  timer_b: 32000     # INVITE timeout (ms)
  timer_d: 32000     # Waiting for ACK (ms)
  timer_f: 32000     # Non-INVITE timeout (ms)

  # Registration
  registration:
    default_expiry: 3600
    min_expiry: 60
    max_expiry: 86400

# RTP Configuration
rtp:
  # Port range for media streams
  port_range_start: 10000
  port_range_end: 20000

  # Codec preferences (order matters)
  codecs:
    - opus      # Primary: Opus 24 kHz
    - g722      # Secondary: G.722 16 kHz
    - g711      # Fallback: G.711 8 kHz

  # RTCP
  rtcp_enabled: true
  rtcp_interval: 5000

# TURN/STUN Configuration
turn:
  enabled: true
  servers:
    - host: turn.example.com
      port: 3478
      protocol: udp
      username: roip_user
      password: roip_password
```

---

## User Management

### Create Administrator User

```bash
# Using CLI tool
./roip-server admin create-user \
  --username admin \
  --password "secure_password" \
  --role admin \
  --email admin@example.com

# Or via REST API
curl -X POST http://localhost:8080/api/v1/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "username": "newuser",
    "password": "password123",
    "email": "user@example.com",
    "role": "operator"
  }'
```

### User Roles

```
- admin: Full system access, user management
- operator: Create/manage routes and calls
- viewer: Read-only monitoring
- device: Limited to own device only
```

### Create SIP Account for Device

```bash
./roip-server device create-account \
  --username esp32_001 \
  --device-name "Field Repeater 1" \
  --password "device_password" \
  --mac-address aa:bb:cc:dd:ee:ff
```

---

## Monitoring & Maintenance

### System Health Checks

```bash
# Check all services
docker-compose ps

# View logs
docker-compose logs -f roip-api

# Database backup
docker-compose exec postgres pg_dump -U roip roip_db > backup.sql

# Database restore
docker-compose exec -T postgres psql -U roip roip_db < backup.sql
```

### Performance Monitoring

```sql
-- Active calls
SELECT
    caller_id,
    callee_id,
    start_time,
    EXTRACT(EPOCH FROM (NOW() - start_time)) as duration_seconds
FROM call_logs
WHERE end_time IS NULL;

-- Call quality statistics
SELECT
    DATE(start_time) as call_date,
    AVG((audio_quality->>'jitter_ms')::float) as avg_jitter_ms,
    AVG((audio_quality->>'packet_loss_pct')::float) as avg_packet_loss,
    COUNT(*) as total_calls
FROM call_logs
WHERE start_time > NOW() - INTERVAL '24 hours'
GROUP BY DATE(start_time);

-- Device statistics
SELECT
    d.device_name,
    COUNT(c.id) as calls_today,
    AVG((c.audio_quality->>'mos')::float) as avg_mos
FROM devices d
LEFT JOIN call_logs c ON (d.id = c.caller_id OR d.id = c.callee_id)
  AND c.start_time > NOW() - INTERVAL '24 hours'
GROUP BY d.id, d.device_name;
```

### Maintenance Tasks

```bash
# Daily: Rotate logs
sudo logrotate -f /etc/logrotate.d/roip

# Weekly: Backup database
0 2 * * 0 docker-compose exec -T postgres pg_dump -U roip roip_db > /backups/roip_$(date +%Y%m%d).sql

# Monthly: Update certificates
0 0 1 * * certbot renew

# Quarterly: Update Docker images
docker-compose pull && docker-compose up -d
```

---

## Advanced Deployment

### Load Balancing (Multiple Servers)

```nginx
# Nginx upstream configuration
upstream roip_servers {
    least_conn;  # Use least connections algorithm
    server roip1.example.com:8080;
    server roip2.example.com:8080;
    server roip3.example.com:8080;

    # Health check
    check interval=3000 rise=2 fall=5 timeout=1000;
}

server {
    location /api/ {
        proxy_pass http://roip_servers;
    }
}
```

### Failover Configuration

```yaml
# Primary/Secondary Setup
primary_server: roip1.example.com
secondary_server: roip2.example.com

# Database replication
postgresql:
  replication:
    enabled: true
    standby_mode: on
    primary_conninfo: 'host=roip1.example.com user=replication password=xxx'
```

### Recording Management

```bash
# Archive old recordings
find /recordings -name "*.wav" -mtime +30 -exec tar czf {}.tar.gz {} \;

# Archive to S3
aws s3 sync /recordings s3://roip-backups/recordings/ --delete

# Clean up
find /recordings -name "*.tar.gz" -mtime +90 -delete
```

---

## Troubleshooting

### Port Conflicts

```bash
# Check port usage
sudo ss -tlnp | grep LISTEN

# SIP port 5060
sudo lsof -i :5060

# RTP ports 10000-20000
sudo lsof -i :10000-10100
```

### Database Connection Issues

```bash
# Test PostgreSQL
psql -U roip -d roip_db -c "SELECT 1"

# Reset password
sudo -u postgres psql << SQL
ALTER USER roip WITH PASSWORD 'new_password';
SQL
```

### SIP Registration Failures

```bash
# Check logs
docker-compose logs roip-api | grep -i register

# Test SIP connectivity
nmap -sU -p 5060 localhost

# Manual SIP test
echo "REGISTER sip:example.com SIP/2.0" | nc -u localhost 5060
```

### Audio Quality Issues

```sql
-- Check packet loss trends
SELECT
    EXTRACT(HOUR FROM start_time) as hour,
    AVG((audio_quality->>'packet_loss_pct')::float) as avg_loss
FROM call_logs
WHERE start_time > NOW() - INTERVAL '24 hours'
GROUP BY EXTRACT(HOUR FROM start_time)
ORDER BY hour;

-- Check problematic routes
SELECT
    source_device_id,
    dest_device_id,
    AVG((audio_quality->>'jitter_ms')::float) as avg_jitter,
    COUNT(*) as call_count
FROM call_logs
WHERE start_time > NOW() - INTERVAL '7 days'
GROUP BY source_device_id, dest_device_id
HAVING AVG((audio_quality->>'jitter_ms')::float) > 50;
```

---

## Production Checklist

- [ ] Database backups automated
- [ ] SSL certificates auto-renewing
- [ ] Log rotation configured
- [ ] Monitoring/alerting setup
- [ ] Firewall rules in place
- [ ] Rate limiting enabled
- [ ] User authentication working
- [ ] TURN server accessible from outside
- [ ] Disaster recovery plan documented
- [ ] Load balancing (if multi-server)
- [ ] Call recording locations secured
- [ ] Bandwidth monitoring active

---

## Next Steps

- [Configure Clients](ROIP_CLIENT_GUIDE.md)
- [API Reference](ROIP_API_REFERENCE.md)
- [Troubleshooting](ROIP_TROUBLESHOOTING.md)
- [Technical Design](ROIP_DESIGN.md)

---

**Last Updated**: November 2025
**Version**: 1.0
