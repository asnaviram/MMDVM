# RoIP Docker Deployment - Complete Setup Guide

## Overview

This document provides a complete guide to deploying the ESP32 Radio over IP (RoIP) system using Docker. The deployment includes a multi-service stack with production-grade configuration.

## Files Created

### Core Docker Files

1. **Dockerfile** (1.6 KB)
   - Multi-stage build optimizing final image size
   - Node.js 18-Alpine base with security hardening
   - Non-root user execution
   - Health checks included
   - TLS/Cert support ready

2. **docker-compose.yml** (3.7 KB)
   - Complete service orchestration
   - Three main services: RoIP Server, PostgreSQL, Coturn
   - Health checks for each service
   - Volume management for data persistence
   - Network isolation with bridge driver
   - Logging configuration with rotation

3. **init-db.sql** (9.1 KB)
   - Complete database schema initialization
   - 11 main tables for complete RoIP functionality
   - Pre-built views for common queries
   - Performance indexes on all key fields
   - Example initial data (admin user)

4. **.env.example** (4.0 KB)
   - All configurable environment variables
   - Detailed documentation for each setting
   - Security warnings for production
   - Performance tuning options
   - Monitoring and backup configuration

5. **coturn.conf** (5.0 KB)
   - Complete TURN/STUN server configuration
   - NAT detection and relay settings
   - Security and access controls
   - Performance optimization options
   - Logging configuration

### Utility Files

6. **README.md** (10 KB)
   - Quick start guide
   - Production deployment checklist
   - Troubleshooting guide
   - API endpoint documentation
   - Performance tuning recommendations

7. **Makefile** (4.5 KB)
   - 20+ useful make targets
   - Automated setup, build, and deployment
   - Backup and restore functionality
   - Health check commands
   - Service management shortcuts

8. **start.sh** (6.5 KB, executable)
   - Automated setup script
   - Interactive configuration
   - Prerequisites checking
   - Service waiting mechanism
   - Status reporting with colors

9. **.gitignore** (1.2 KB)
   - Prevents accidental commits of secrets
   - Excludes sensitive files and directories
   - Ignores logs, backups, and temporary files

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Network (roip-network)         │
├─────────────────────────────────────────────────────────┤
│                                                            │
│  ┌──────────────────┐  ┌──────────────────┐             │
│  │  RoIP Server     │  │   PostgreSQL     │             │
│  │  (Node.js 18)    │  │   (Port 5432)    │             │
│  │                  │  │                  │             │
│  │  Ports:          │  │  Data Volume:    │             │
│  │  - 5060/UDP SIP  │  │  postgres_data   │             │
│  │  - 10000-10100   │  │                  │             │
│  │    /UDP RTP      │  │  Health: pg_isready             │
│  │  - 8080 REST API │  │                  │             │
│  │  - 8081 WebSocket│  │  Logging:        │             │
│  │                  │  │  JSON + rotation │             │
│  │  Health: HTTP    │  │                  │             │
│  │  User: nodejs    │  │  User: roip      │             │
│  └──────────────────┘  └──────────────────┘             │
│           ▲                         ▲                     │
│           └─────────────────────────┘                     │
│                                                            │
│  ┌──────────────────────────────────────┐              │
│  │     Coturn (TURN/STUN Server)        │              │
│  │                                      │              │
│  │  Ports:                              │              │
│  │  - 3478/UDP+TCP: Standard TURN       │              │
│  │  - 3479/UDP+TCP: Alternate TURN      │              │
│  │  - 5349-5350/UDP+TCP: TLS            │              │
│  │  - 49152-49200/UDP: Relay            │              │
│  │                                      │              │
│  │  Data Volume: coturn_data            │              │
│  │  Logging: JSON + rotation            │              │
│  │                                      │              │
│  │  Features:                           │              │
│  │  - NAT detection                     │              │
│  │  - Long-term credentials             │              │
│  │  - Bandwidth limiting                │              │
│  │  - Secure STUN (fingerprint)         │              │
│  └──────────────────────────────────────┘              │
│                                                            │
└─────────────────────────────────────────────────────────┘

External Clients
    ▲
    │ SIP (5060), RTP (10000-10100), API (8080)
    │ WebSocket (8081), TURN (3478)
    │
    └────────────────────────────────
```

## Port Mappings

| Service | Protocol | Port(s) | Purpose | Internal |
|---------|----------|---------|---------|----------|
| SIP | UDP | 5060 | Signaling | 5060 |
| RTP | UDP | 10000-10100 | Media streams | 10000-10100 |
| REST API | TCP | 8080 | HTTP API | 8080 |
| WebSocket | TCP | 8081 | Real-time updates | 8081 |
| PostgreSQL | TCP | 5432 | Database | 5432 |
| TURN/STUN | UDP/TCP | 3478 | NAT traversal | 3478 |
| TURN ALT | UDP/TCP | 3479 | Alternative TURN | 3479 |
| TURN TLS | UDP/TCP | 5349-5350 | TLS TURN | 5349-5350 |
| TURN Relay | UDP | 49152-49200 | Relay allocation | 49152-49200 |

## Volume Structure

```
roip-system/
├── roip-server/
│   ├── src/
│   ├── config/
│   ├── package.json
│   └── package-lock.json
│
└── docker/
    ├── Dockerfile
    ├── docker-compose.yml
    ├── init-db.sql
    ├── coturn.conf
    ├── start.sh
    ├── Makefile
    ├── README.md
    ├── DEPLOYMENT.md
    ├── .env.example
    ├── .env (created at runtime)
    ├── turnusers.txt (created at runtime)
    │
    ├── data/ (created at runtime)
    │   └── [application data]
    │
    └── [docker named volumes managed by Docker]
        ├── postgres_data/
        └── coturn_data/
```

## Quick Start

### Method 1: Using start.sh (Recommended)

```bash
cd /home/user/MMDVM/docker
./start.sh
```

The script will:
1. Check prerequisites
2. Create .env and turnusers.txt
3. Build Docker images
4. Start all services
5. Wait for services to be ready
6. Show access information

### Method 2: Using make

```bash
cd /home/user/MMDVM/docker
make setup
make all
make health
```

### Method 3: Manual docker-compose

```bash
cd /home/user/MMDVM/docker
cp .env.example .env
docker-compose up -d
```

## Configuration

### Essential Configuration

Edit `/home/user/MMDVM/docker/.env`:

```bash
# Security - CHANGE IN PRODUCTION
JWT_SECRET=$(openssl rand -base64 32)
DB_PASSWORD=$(openssl rand -base64 24)
TURN_PASSWORD=$(openssl rand -base64 24)

# Network
API_CORS_ORIGINS=https://yourdomain.com
EXTERNAL_IP=your.public.ip
```

### Database Configuration

The `init-db.sql` provides:
- **11 tables** for complete RoIP functionality
- **15+ indexes** for performance optimization
- **3 views** for common queries
- Default admin user (change in production)

Tables:
- `users` - User accounts
- `devices` - ESP32 clients
- `calls` - Call history
- `call_events` - Detailed call logging
- `sip_registrations` - Active SIP registrations
- `rtp_sessions` - RTP stream details
- `audio_metrics` - Quality measurements
- `network_config` - Device network settings
- `system_logs` - Application logs
- `api_tokens` - API authentication tokens
- `(views)` - Pre-built query views

### Coturn Configuration

Key settings in `coturn.conf`:
```bash
realm=roip.local
user=roip:roip_turn_password
bps-capacity=0           # Unlimited bandwidth
max-bps=0                # Unlimited per-session
keep-alive-timeout=300   # 5 minutes
connection-timeout=120   # 2 minutes
```

## Health Checks

### Container Health

Each container has automatic health checks:

```bash
# View health status
docker-compose ps

# RoIP Server: HTTP GET /health every 30 seconds
# PostgreSQL: pg_isready every 10 seconds
# Coturn: Container status monitoring
```

### Manual Health Verification

```bash
# API health
curl http://localhost:8080/health

# Database connectivity
docker-compose exec postgres psql -U roip -d roip -c "SELECT version();"

# TURN server (requires turnutils)
docker-compose exec coturn turnutils_stunclient localhost 3478

# WebSocket connectivity
wscat -c ws://localhost:8081
```

## Database Schema Details

### users Table
Stores user account information with authentication credentials.

```sql
- id (SERIAL PRIMARY KEY)
- username (VARCHAR UNIQUE)
- password_hash (VARCHAR)
- email (VARCHAR UNIQUE)
- full_name (VARCHAR)
- is_active (BOOLEAN)
- last_login (TIMESTAMP)
- created_at, updated_at (TIMESTAMP)
```

### devices Table
Registers ESP32 clients and their connection status.

```sql
- id (SERIAL PRIMARY KEY)
- user_id (FK → users)
- device_name (VARCHAR)
- device_id (VARCHAR UNIQUE)
- device_type, firmware_version, hardware_version (VARCHAR)
- mac_address (VARCHAR)
- ip_address (INET)
- last_seen, is_online (TIMESTAMP, BOOLEAN)
- signal_strength (INTEGER)
- location (VARCHAR)
```

### calls Table
Records all call attempts and completions.

```sql
- id (SERIAL PRIMARY KEY)
- caller_id, callee_id (FK → devices)
- start_time, end_time (TIMESTAMP)
- duration_seconds (INTEGER)
- call_status (VARCHAR)
- call_quality (VARCHAR)
- audio_codec, sample_rate (VARCHAR, INTEGER)
- packet_loss, latency_ms, jitter_ms (NUMERIC, INTEGER)
```

### sip_registrations Table
Manages active SIP registrations for real-time status.

```sql
- id (SERIAL PRIMARY KEY)
- device_id (FK → devices)
- sip_uri (VARCHAR UNIQUE)
- contact_uri (VARCHAR)
- expires (TIMESTAMP)
- via, user_agent (VARCHAR)
```

### rtp_sessions Table
Tracks RTP stream sessions and statistics.

```sql
- id (SERIAL PRIMARY KEY)
- call_id (FK → calls)
- session_id (VARCHAR UNIQUE)
- local_port, remote_port (INTEGER)
- remote_ip (INET)
- codec_type, sample_rate, bitrate
- packets_sent/received, bytes_sent/received
```

### Views

**v_active_devices**: Lists currently online devices with user information.

**v_recent_calls**: Shows calls from the last 7 days with quality metrics.

**v_device_stats**: Aggregated statistics per device (call count, duration, quality).

## Backup and Recovery

### Automated Backups

```bash
# Using make
make backup

# Backup location: ./backups/roip_YYYYMMDD_HHMMSS.sql.gz
```

### Manual Backup

```bash
docker-compose exec postgres pg_dump -U roip roip | gzip > roip_backup.sql.gz
```

### Restore from Backup

```bash
# Using make
make restore

# Or manually
gunzip < roip_backup.sql.gz | docker-compose exec -T postgres psql -U roip roip
```

## Monitoring and Logging

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f roip-server
docker-compose logs -f postgres
docker-compose logs -f coturn

# Last N lines
docker-compose logs --tail 100 roip-server

# Time range
docker-compose logs --since 2024-01-01 roip-server
```

### Log Drivers

All services use JSON logging with automatic rotation:
- Max file size: 100MB
- Max files: 10 (PostgreSQL uses 5)
- Format: JSON for easy parsing

### Container Metrics

```bash
# Resource usage
docker stats

# Container processes
docker-compose top roip-server
docker-compose top postgres

# Network usage
docker network inspect roip-network
```

## Production Deployment Checklist

- [ ] Review and update all values in `.env`
- [ ] Generate strong JWT secret: `openssl rand -base64 32`
- [ ] Generate strong DB password: `openssl rand -base64 24`
- [ ] Generate strong TURN password: `openssl rand -base64 24`
- [ ] Set `NODE_ENV=production`
- [ ] Configure `API_CORS_ORIGINS` with actual domain
- [ ] Enable TLS certificates (set `TLS_CERT_PATH`, `TLS_KEY_PATH`)
- [ ] Change default TURN realm from `roip.local`
- [ ] Set up firewall rules for required ports
- [ ] Configure automatic backups
- [ ] Set up monitoring/alerting
- [ ] Test failover and recovery procedures
- [ ] Review and adjust resource limits
- [ ] Set up log aggregation (optional)
- [ ] Enable authentication on PostgreSQL
- [ ] Disable demo/test users

## Troubleshooting

### Service Not Starting

```bash
# Check logs
docker-compose logs roip-server

# Check port conflicts
docker-compose ps
netstat -tulpn | grep LISTEN

# Verify networking
docker network inspect roip-network
```

### Database Connection Refused

```bash
# Verify PostgreSQL is running and healthy
docker-compose ps postgres

# Check database logs
docker-compose logs postgres

# Test connection manually
docker-compose exec postgres psql -U roip -d roip -c "SELECT 1;"

# Check connection string in logs
docker-compose logs roip-server | grep -i database
```

### High Memory Usage

```bash
# Check container metrics
docker stats

# If roip-server: Check for memory leaks in logs
docker-compose logs --tail 500 roip-server | grep -i memory

# If postgres: May need to increase DB_POOL_SIZE limit
```

### Network Issues

```bash
# Check container network connectivity
docker-compose exec roip-server curl -I http://postgres:5432

# Check DNS resolution
docker-compose exec roip-server nslookup postgres

# Ping between containers
docker-compose exec roip-server ping -c 3 postgres
```

## Advanced Topics

### SSL/TLS Termination

Add to `docker-compose.yml`:

```yaml
environment:
  TLS_CERT_PATH: /app/certs/cert.pem
  TLS_KEY_PATH: /app/certs/key.pem

volumes:
  - ./certs:/app/certs:ro
```

### Load Balancing

Use docker-compose with multiple RoIP replicas + HAProxy/Nginx.

### Distributed Deployment

Use Docker Swarm or Kubernetes for multi-node deployments.

### Redis Caching

Add Redis service for session caching and real-time features.

### Prometheus Monitoring

Enable metrics endpoint and attach Prometheus for monitoring.

## Performance Characteristics

### Estimated Capacity (Single Node)

- **Concurrent Users**: 100-500 (depends on hardware)
- **Concurrent Calls**: 50-200
- **RTP Streams**: 100-400
- **Throughput**: 50-500 Mbps RTP capacity
- **Database Ops**: 1000+ queries/sec

### Scalability Improvements

1. **Vertical Scaling**: Increase container resources
2. **Horizontal Scaling**: Use Docker Swarm/Kubernetes
3. **Database**: Use PostgreSQL replication for read scaling
4. **TURN**: Multiple Coturn instances with load balancing

### Performance Tuning

```bash
# In .env
DB_POOL_SIZE=50              # Increase for high concurrency
MAX_CONCURRENT_CALLS=1000    # Adjust based on capacity
RTP_BUFFER_SIZE=131072       # Increase for better quality

# In docker-compose.yml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

## Support and Documentation

- Repository: `/home/user/MMDVM/`
- RoIP Server: `/home/user/MMDVM/roip-server/`
- Config Guide: `/home/user/MMDVM/docker/README.md`
- Docker Docs: https://docs.docker.com
- Coturn Docs: https://github.com/coturn/coturn

## License

GPL-2.0 - Same as MMDVM Project
