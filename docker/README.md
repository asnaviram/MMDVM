# ESP32 RoIP System - Docker Deployment Guide

Complete Docker deployment stack for the ESP32 Radio over IP (RoIP) Server with PostgreSQL database and Coturn TURN/STUN server.

## Overview

This Docker stack provides a production-ready deployment of the RoIP system with the following components:

- **RoIP Server**: Node.js application handling SIP signaling and RTP media
- **PostgreSQL**: High-performance SQL database for persistence
- **Coturn**: TURN/STUN server for NAT traversal
- **Docker Compose**: Orchestrates all services with proper networking and health checks

## Components

### RoIP Server Container
- **Image**: Built from `Dockerfile` with multi-stage optimization
- **Base**: Node.js 18-Alpine
- **Ports**:
  - `5060/UDP`: SIP signaling
  - `10000-10100/UDP`: RTP media streams
  - `8080/TCP`: REST API
  - `8081/TCP`: WebSocket server
- **Features**:
  - Non-root user execution (nodejs:1001)
  - Health checks every 30 seconds
  - Graceful shutdown with tini PID 1 handler
  - Automatic restart on failure

### PostgreSQL Database Container
- **Image**: postgres:16-alpine
- **Port**: `5432/TCP` (internal only, exposed for development)
- **Volumes**: `postgres_data` for persistent storage
- **Features**:
  - Automatic initialization with init-db.sql
  - Health checks with pg_isready
  - JSON logging with 10 file rotation

### Coturn TURN/STUN Server Container
- **Image**: coturn/coturn:4.6-alpine
- **Ports**:
  - `3478/UDP+TCP`: Standard TURN/STUN
  - `3479/UDP+TCP`: Alternative TURN/STUN
  - `5349-5350/UDP+TCP`: TLS-protected ports
  - `49152-49200/UDP`: Relay ports
- **Features**:
  - Automatic external IP detection
  - NAT behavior discovery
  - Keep-alive timeout configuration
  - User authentication support

## Prerequisites

- Docker Engine 20.10+
- Docker Compose 1.29+
- 2GB RAM minimum
- Network access (UDP and TCP ports)

## Quick Start

### 1. Clone Repository

```bash
cd /home/user/MMDVM
```

### 2. Prepare Environment

```bash
cd docker
cp .env.example .env
```

### 3. Edit Configuration

```bash
nano .env
```

**Important**: Change these values in production:
- `DB_PASSWORD`: PostgreSQL password
- `JWT_SECRET`: API authentication secret
- `TURN_PASSWORD`: TURN server password

### 4. Create Database Initialization Script

```bash
cat > init-db.sql << 'EOF'
-- Initial database schema
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS devices (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    device_name VARCHAR(255) NOT NULL,
    device_id VARCHAR(255) UNIQUE NOT NULL,
    last_seen TIMESTAMP,
    is_online BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS calls (
    id SERIAL PRIMARY KEY,
    caller_id INTEGER REFERENCES devices(id),
    callee_id INTEGER REFERENCES devices(id),
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP,
    duration_seconds INTEGER,
    call_status VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_devices_user_id ON devices(user_id);
CREATE INDEX idx_devices_device_id ON devices(device_id);
CREATE INDEX idx_calls_caller ON calls(caller_id);
CREATE INDEX idx_calls_callee ON calls(callee_id);
EOF
```

### 5. Create TURN Users File

```bash
cat > turnusers.txt << 'EOF'
roip:roip_turn_password
EOF
```

### 6. Start Services

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f roip-server
docker-compose logs -f postgres
docker-compose logs -f coturn
```

### 7. Verify Health

```bash
# Check all services
docker-compose ps

# Test RoIP API
curl http://localhost:8080/health

# Test WebSocket
wscat -c ws://localhost:8081

# Test STUN server
docker-compose exec coturn turnutils_stunclient localhost 3478
```

## Configuration

### Environment Variables (.env)

See `.env.example` for all available options.

**Key Variables**:

```bash
# Server
NODE_ENV=production
LOG_LEVEL=info

# Database
DB_NAME=roip
DB_USER=roip
DB_PASSWORD=roip_secure_password
DB_POOL_SIZE=20

# Authentication
JWT_SECRET=your-secure-random-string
JWT_EXPIRY=1h

# TURN/STUN
TURN_SERVER=coturn
TURN_PORT=3478
TURN_USERNAME=roip
TURN_PASSWORD=roip_turn_password

# API
API_CORS_ORIGINS=https://yourdomain.com
```

### Coturn Configuration

Edit `coturn.conf` for advanced TURN settings:

```bash
# Enable debugging
# verbose

# Change authentication realm
realm=your-domain.com

# Add more users
user=username1:password1
user=username2:password2

# Set bandwidth limits (bytes per second)
bps-capacity=1000000  # 1 Mbps
max-bps=500000        # 500 Kbps per session
```

### Database Schema

Customize `init-db.sql` before first run to add your schema.

## Production Deployment

### 1. Security Hardening

```bash
# Generate strong JWT secret
openssl rand -base64 32

# Generate strong TURN password
openssl rand -base64 24

# Update .env with new secrets
```

### 2. SSL/TLS Certificate

```bash
# Using Let's Encrypt with Certbot
docker run -it --rm -v $(pwd)/certs:/etc/letsencrypt certbot/certbot \
  certonly --standalone -d your-domain.com

# Update docker-compose.yml with certificate paths
TLS_CERT_PATH=/app/certs/live/your-domain.com/fullchain.pem
TLS_KEY_PATH=/app/certs/live/your-domain.com/privkey.pem
```

### 3. Firewall Configuration

```bash
# Allow required ports (UFW example)
sudo ufw allow 5060/udp     # SIP
sudo ufw allow 10000:10100/udp  # RTP
sudo ufw allow 8080/tcp     # API
sudo ufw allow 8081/tcp     # WebSocket
sudo ufw allow 3478/tcp     # TURN
sudo ufw allow 3478/udp     # TURN
```

### 4. Resource Limits

Edit `docker-compose.yml` to add resource limits:

```yaml
services:
  roip-server:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
```

### 5. Backup Strategy

```bash
# Backup database
docker-compose exec postgres pg_dump -U roip roip > backup.sql

# Backup volumes
docker run --rm -v roip_postgres_data:/data -v $(pwd):/backup \
  alpine tar czf /backup/postgres_data.tar.gz -C /data .

# Restore from backup
docker-compose exec postgres psql -U roip roip < backup.sql
```

### 6. Monitoring Setup

Monitor container health and logs:

```bash
# Container stats
docker stats

# Log aggregation
docker-compose logs --follow --tail 100

# Export logs
docker-compose logs > combined.log
```

## Troubleshooting

### RoIP Server Won't Start

```bash
# Check logs
docker-compose logs roip-server

# Verify database connectivity
docker-compose exec roip-server curl http://localhost:8080/health

# Check port conflicts
docker-compose ps
```

### Database Connection Error

```bash
# Verify PostgreSQL is running
docker-compose ps postgres

# Check database logs
docker-compose logs postgres

# Test connection
docker-compose exec postgres psql -U roip -d roip -c "SELECT version();"

# Reinitialize database
docker-compose down -v
docker-compose up -d postgres
```

### TURN Server Not Responding

```bash
# Check Coturn logs
docker-compose logs coturn

# Test STUN locally
docker-compose exec coturn turnutils_stunclient localhost 3478

# Verify credentials
docker-compose exec coturn cat /etc/coturn/turnusers.txt

# Check port binding
docker-compose exec coturn netstat -tlnup | grep 3478
```

### Network Issues

```bash
# Check Docker network
docker network ls
docker network inspect roip-network

# DNS resolution
docker-compose exec roip-server nslookup postgres

# Test connectivity between containers
docker-compose exec roip-server curl http://postgres:5432
```

## Advanced Usage

### Custom Configuration File

```bash
# Mount custom YAML config
volumes:
  - ./custom-config.yaml:/app/config/custom.yaml:ro

# Set environment variable
environment:
  CONFIG_FILE: /app/config/custom.yaml
```

### Multi-Node Deployment (Swarm)

```bash
# Initialize Docker Swarm
docker swarm init

# Deploy stack
docker stack deploy -c docker-compose.yml roip

# Scale service
docker service scale roip_roip-server=3
```

### Kubernetes Deployment

Convert docker-compose to Kubernetes manifests:

```bash
# Using Kompose
kompose convert -f docker-compose.yml -o k8s-manifests/
```

## Performance Tuning

### Optimize for High-Load Scenarios

```yaml
# docker-compose.yml
services:
  roip-server:
    environment:
      DB_POOL_SIZE: 50
      MAX_CONCURRENT_CALLS: 1000
      RTP_BUFFER_SIZE: 131072
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 4G
```

### Database Optimization

```bash
# Connect to PostgreSQL
docker-compose exec postgres psql -U roip -d roip

# Analyze query performance
EXPLAIN ANALYZE SELECT * FROM calls;

# Create indexes
CREATE INDEX idx_calls_start_time ON calls(start_time DESC);
```

## Maintenance

### Regular Updates

```bash
# Check for updates
docker-compose pull

# Rebuild images
docker-compose build --no-cache

# Update services
docker-compose up -d
```

### Cleanup

```bash
# Remove dangling images
docker image prune -a

# Remove unused volumes
docker volume prune

# Remove unused networks
docker network prune
```

### Log Rotation

Configured in docker-compose.yml with JSON logging driver:
- Max size: 100MB per file
- Max files: 10 per container

## API Endpoints

Once running, access the API at `http://localhost:8080`:

- `GET /health` - Health check
- `GET /api/devices` - List registered devices
- `POST /api/calls` - Initiate call
- `GET /api/calls/:id` - Call status
- `POST /api/auth/login` - Authenticate user
- `WebSocket ws://localhost:8081` - Real-time updates

## Support and Documentation

- RoIP Server: `/home/user/MMDVM/roip-server`
- Config: `/home/user/MMDVM/roip-server/config/default.yaml`
- Coturn Docs: https://github.com/coturn/coturn
- Docker Docs: https://docs.docker.com

## License

GPL-2.0 - Same as MMDVM Project
