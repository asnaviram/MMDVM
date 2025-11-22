# ESP32 RoIP System - Production Deployment Guide

## Table of Contents
1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Infrastructure Requirements](#infrastructure-requirements)
3. [Server Sizing and Scaling](#server-sizing-and-scaling)
4. [Database Setup](#database-setup)
5. [Network Configuration](#network-configuration)
6. [SSL/TLS Certificate Setup](#ssltls-certificate-setup)
7. [Deployment Methods](#deployment-methods)
8. [Backup and Disaster Recovery](#backup-and-disaster-recovery)
9. [Monitoring and Alerting](#monitoring-and-alerting)
10. [Rollback Procedures](#rollback-procedures)
11. [Security Hardening](#security-hardening)
12. [Performance Tuning](#performance-tuning)

---

## Pre-Deployment Checklist

### Infrastructure Prerequisites
- [ ] Server/VPS provisioned with supported OS (Ubuntu 22.04 LTS, Debian 12, or RHEL 9)
- [ ] Domain name registered and DNS configured
- [ ] SSL certificate obtained (Let's Encrypt recommended)
- [ ] Firewall rules configured
- [ ] Backup storage configured (S3, NFS, or local)
- [ ] Monitoring infrastructure ready (Prometheus, Grafana)
- [ ] Log aggregation service configured (optional: ELK, Loki)

### Network Prerequisites
- [ ] Public IP address available
- [ ] Required ports opened (see [Network Configuration](#network-configuration))
- [ ] STUN/TURN server accessible (can be co-located or external)
- [ ] NAT traversal tested
- [ ] IPv4 and IPv6 configured (IPv6 optional)
- [ ] QoS policies configured on network equipment

### Security Prerequisites
- [ ] SSH key-based authentication configured
- [ ] Root login disabled
- [ ] fail2ban or similar intrusion prevention installed
- [ ] Security updates configured for automatic installation
- [ ] Secrets management solution in place (HashiCorp Vault, AWS Secrets Manager, or encrypted files)
- [ ] Security scanning completed (Nessus, OpenVAS, etc.)

### Database Prerequisites
- [ ] PostgreSQL 15+ installed and configured
- [ ] Database credentials securely stored
- [ ] Database backup strategy defined
- [ ] Point-in-time recovery configured
- [ ] Replication configured (for HA deployments)
- [ ] Connection pooling configured

### Application Prerequisites
- [ ] Node.js 18+ LTS installed
- [ ] npm/yarn package manager installed
- [ ] Application repository cloned
- [ ] Environment variables configured
- [ ] Log directories created with proper permissions
- [ ] Data directories created with proper permissions

---

## Infrastructure Requirements

### Minimum Requirements (Small Deployment: 1-10 Devices)
| Component | Specification |
|-----------|---------------|
| CPU | 2 vCPU (2.0+ GHz) |
| RAM | 4 GB |
| Storage | 20 GB SSD |
| Network | 100 Mbps, 1 TB/month |
| OS | Ubuntu 22.04 LTS |

**Estimated Cost**: $5-10/month (DigitalOcean, Linode, Vultr)

### Recommended Requirements (Medium Deployment: 10-50 Devices)
| Component | Specification |
|-----------|---------------|
| CPU | 4 vCPU (2.5+ GHz) |
| RAM | 8 GB |
| Storage | 50 GB SSD |
| Network | 1 Gbps, 3 TB/month |
| OS | Ubuntu 22.04 LTS |

**Estimated Cost**: $20-40/month

### High Availability Requirements (Large Deployment: 50-200 Devices)
| Component | Specification |
|-----------|---------------|
| Load Balancer | HAProxy or cloud LB |
| App Servers | 2x 4 vCPU, 8 GB RAM |
| Database | PostgreSQL cluster (Primary + Replica) |
| TURN Server | Dedicated 4 vCPU, 8 GB RAM |
| Storage | 100 GB SSD per server |
| Network | 1 Gbps, 10 TB/month |

**Estimated Cost**: $150-300/month

### Enterprise Requirements (200+ Devices)
- Multi-region deployment
- Database sharding/partitioning
- CDN for static assets
- Dedicated monitoring infrastructure
- 24/7 operations team
- Custom SLA agreements

---

## Server Sizing and Scaling

### Capacity Planning

#### Concurrent Calls Calculation
```
Bandwidth per call (Opus 32kbps):
- Audio: 32 kbps
- RTP overhead: 12.8 kbps (40%)
- IP/UDP overhead: 3.2 kbps (10%)
- Total: ~48 kbps per call

Example calculations:
- 10 concurrent calls: 480 kbps = 0.48 Mbps
- 50 concurrent calls: 2.4 Mbps
- 100 concurrent calls: 4.8 Mbps
```

#### CPU Sizing
```
CPU usage estimates:
- SIP signaling: 0.1% per registered device
- RTP relay: 5% per concurrent call
- Media transcoding: 20% per concurrent call (if enabled)
- Database queries: 10-20% baseline

Example:
50 devices, 10 concurrent calls, no transcoding:
(50 * 0.1%) + (10 * 5%) + 15% = 70% CPU
Recommendation: 4 vCPU minimum
```

#### Memory Sizing
```
Memory usage estimates:
- Node.js base: 512 MB
- Per registered device: 10 MB (session state)
- Per concurrent call: 5 MB (audio buffers)
- Database connection pool: 200 MB
- OS overhead: 1 GB

Example:
50 devices, 10 concurrent calls:
512 + (50*10) + (10*5) + 200 + 1024 = 2.3 GB
Recommendation: 4 GB minimum, 8 GB recommended
```

### Horizontal Scaling Strategy

#### SIP Load Balancing
```
┌─────────────────┐
│   DNS/Route53   │  Round-robin or geo-based
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
┌───▼───┐ ┌──▼────┐
│ SIP 1 │ │ SIP 2 │  Stateless SIP proxies
└───┬───┘ └──┬────┘
    │         │
    └────┬────┘
         │
┌────────▼────────┐
│ Shared Database │  Session state
└─────────────────┘
```

#### RTP Media Scaling
```
- Use RTP proxy/relay per region
- Minimize media path length
- Keep media local to endpoints
- Use TURN only when necessary
```

### Vertical Scaling Triggers
- CPU sustained >70% for 5 minutes
- Memory >80% for 5 minutes
- Disk I/O wait >20%
- Network bandwidth >70% sustained

### Horizontal Scaling Triggers
- Active calls >80% of capacity
- New registrations failing
- Response time >500ms for API calls
- Database connection pool exhausted

---

## Database Setup

### PostgreSQL Installation (Ubuntu 22.04)

```bash
# Install PostgreSQL 15
sudo apt update
sudo apt install -y postgresql-15 postgresql-contrib-15

# Enable and start service
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

### Database Initialization

```bash
# Switch to postgres user
sudo -u postgres psql

# Create database and user
CREATE DATABASE roip_production;
CREATE USER roip_user WITH ENCRYPTED PASSWORD 'CHANGE_THIS_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE roip_production TO roip_user;

# Exit psql
\q
```

### Production Configuration

Edit `/etc/postgresql/15/main/postgresql.conf`:

```ini
# Connection Settings
listen_addresses = 'localhost'  # Change to '0.0.0.0' for remote access
max_connections = 100
superuser_reserved_connections = 3

# Memory Settings
shared_buffers = 2GB              # 25% of total RAM
effective_cache_size = 6GB        # 75% of total RAM
maintenance_work_mem = 512MB
work_mem = 16MB
wal_buffers = 16MB

# WAL Settings (for PITR)
wal_level = replica
archive_mode = on
archive_command = 'test ! -f /var/lib/postgresql/archive/%f && cp %p /var/lib/postgresql/archive/%f'
max_wal_senders = 3
wal_keep_size = 1GB

# Performance
random_page_cost = 1.1            # SSD
effective_io_concurrency = 200    # SSD
checkpoint_completion_target = 0.9
default_statistics_target = 100

# Logging
log_destination = 'csvlog'
logging_collector = on
log_directory = 'log'
log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log'
log_rotation_age = 1d
log_rotation_size = 100MB
log_min_duration_statement = 1000  # Log slow queries >1s
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '
log_checkpoints = on
log_connections = on
log_disconnections = on
log_lock_waits = on
```

Edit `/etc/postgresql/15/main/pg_hba.conf`:

```
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all            postgres                                peer
local   all            all                                     peer
host    roip_production roip_user      127.0.0.1/32            scram-sha-256
host    roip_production roip_user      ::1/128                 scram-sha-256
```

Restart PostgreSQL:
```bash
sudo systemctl restart postgresql
```

### Schema Migration

```bash
# Navigate to server directory
cd /opt/roip-server

# Run migrations
npm run migrate

# Or manually:
psql -U roip_user -d roip_production -f /opt/roip-server/migrations/001_initial_schema.sql
```

### Database Performance Tuning

```sql
-- Create indexes for common queries
CREATE INDEX idx_devices_user_id ON devices(user_id);
CREATE INDEX idx_devices_status ON devices(status) WHERE status = 'active';
CREATE INDEX idx_devices_last_registered ON devices(last_registered);
CREATE INDEX idx_call_logs_start_time ON call_logs(start_time DESC);
CREATE INDEX idx_call_logs_caller_id ON call_logs(caller_id);
CREATE INDEX idx_routes_source_dest ON routes(source_device_id, dest_device_id);

-- Add partial indexes for active records
CREATE INDEX idx_active_routes ON routes(source_device_id, dest_device_id) WHERE enabled = true;

-- Enable query planner statistics
ANALYZE;

-- Monitor query performance
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

### Database Monitoring

```sql
-- Check active connections
SELECT count(*) FROM pg_stat_activity WHERE state = 'active';

-- Identify slow queries
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active' AND now() - pg_stat_activity.query_start > interval '5 seconds'
ORDER BY duration DESC;

-- Check table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan ASC;
```

---

## Network Configuration

### Required Ports

| Port(s) | Protocol | Service | Direction | Notes |
|---------|----------|---------|-----------|-------|
| 22 | TCP | SSH | Inbound | Restrict to management IPs |
| 80 | TCP | HTTP | Inbound | Redirect to HTTPS |
| 443 | TCP | HTTPS | Inbound | Web dashboard, API |
| 5060 | UDP | SIP | Inbound | SIP signaling |
| 5061 | TCP | SIP-TLS | Inbound | Encrypted SIP (optional) |
| 8080 | TCP | API | Inbound | REST API (behind nginx) |
| 8081 | TCP | WebSocket | Inbound | Real-time events |
| 3478 | UDP/TCP | STUN | Inbound | NAT traversal |
| 5349 | TCP | TURNS | Inbound | Encrypted TURN |
| 10000-10100 | UDP | RTP | Inbound/Outbound | Media streams |
| 49152-65535 | UDP | TURN relay | Inbound/Outbound | Dynamic TURN ports |
| 5432 | TCP | PostgreSQL | Internal | Database (localhost only) |
| 9090 | TCP | Prometheus | Internal | Metrics (localhost/VPN) |
| 3000 | TCP | Grafana | Internal | Monitoring (behind nginx) |

### Firewall Configuration (UFW)

```bash
# Reset firewall
sudo ufw --force reset

# Default policies
sudo ufw default deny incoming
sudo ufw default allow outgoing

# SSH (restrict to management network)
sudo ufw allow from 10.0.0.0/8 to any port 22 proto tcp comment 'SSH from internal'

# HTTP/HTTPS
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'

# SIP
sudo ufw allow 5060/udp comment 'SIP'
sudo ufw allow 5061/tcp comment 'SIP-TLS'

# STUN/TURN
sudo ufw allow 3478/udp comment 'STUN'
sudo ufw allow 3478/tcp comment 'STUN'
sudo ufw allow 5349/tcp comment 'TURNS'

# RTP media
sudo ufw allow 10000:10100/udp comment 'RTP'

# TURN relay ports
sudo ufw allow 49152:65535/udp comment 'TURN relay'

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status verbose
```

### Firewall Configuration (firewalld - RHEL/CentOS)

```bash
# Install firewalld
sudo dnf install firewalld
sudo systemctl enable --now firewalld

# Create custom service definitions
sudo firewall-cmd --permanent --new-service=roip-sip
sudo firewall-cmd --permanent --service=roip-sip --add-port=5060/udp
sudo firewall-cmd --permanent --service=roip-sip --add-port=5061/tcp
sudo firewall-cmd --permanent --service=roip-sip --set-short="RoIP SIP"

sudo firewall-cmd --permanent --new-service=roip-media
sudo firewall-cmd --permanent --service=roip-media --add-port=10000-10100/udp
sudo firewall-cmd --permanent --service=roip-media --set-short="RoIP Media"

# Add services to public zone
sudo firewall-cmd --permanent --zone=public --add-service=http
sudo firewall-cmd --permanent --zone=public --add-service=https
sudo firewall-cmd --permanent --zone=public --add-service=roip-sip
sudo firewall-cmd --permanent --zone=public --add-service=roip-media
sudo firewall-cmd --permanent --zone=public --add-port=3478/udp
sudo firewall-cmd --permanent --zone=public --add-port=3478/tcp
sudo firewall-cmd --permanent --zone=public --add-port=5349/tcp
sudo firewall-cmd --permanent --zone=public --add-port=49152-65535/udp

# Reload firewall
sudo firewall-cmd --reload

# Verify
sudo firewall-cmd --list-all
```

### iptables Configuration (Advanced)

```bash
#!/bin/bash
# /etc/iptables/roip-rules.sh

# Flush existing rules
iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X

# Default policies
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT ACCEPT

# Allow loopback
iptables -A INPUT -i lo -j ACCEPT

# Allow established connections
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# SSH (rate limited)
iptables -A INPUT -p tcp --dport 22 -m state --state NEW -m recent --set
iptables -A INPUT -p tcp --dport 22 -m state --state NEW -m recent --update --seconds 60 --hitcount 4 -j DROP
iptables -A INPUT -p tcp --dport 22 -j ACCEPT

# HTTP/HTTPS
iptables -A INPUT -p tcp --dport 80 -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -j ACCEPT

# SIP with rate limiting
iptables -A INPUT -p udp --dport 5060 -m hashlimit --hashlimit-mode srcip --hashlimit-name sip --hashlimit-above 100/sec -j DROP
iptables -A INPUT -p udp --dport 5060 -j ACCEPT
iptables -A INPUT -p tcp --dport 5061 -j ACCEPT

# STUN/TURN
iptables -A INPUT -p udp --dport 3478 -j ACCEPT
iptables -A INPUT -p tcp --dport 3478 -j ACCEPT
iptables -A INPUT -p tcp --dport 5349 -j ACCEPT

# RTP
iptables -A INPUT -p udp --dport 10000:10100 -j ACCEPT

# TURN relay
iptables -A INPUT -p udp --dport 49152:65535 -j ACCEPT

# ICMP (ping) rate limited
iptables -A INPUT -p icmp --icmp-type echo-request -m limit --limit 1/s -j ACCEPT
iptables -A INPUT -p icmp -j DROP

# Log dropped packets (optional)
iptables -A INPUT -m limit --limit 5/min -j LOG --log-prefix "iptables-dropped: " --log-level 7

# Save rules
iptables-save > /etc/iptables/rules.v4
```

### Network Performance Tuning

Edit `/etc/sysctl.conf`:

```ini
# Network performance tuning for RoIP

# Increase network buffer sizes
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.core.rmem_default = 262144
net.core.wmem_default = 262144

# TCP tuning
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216
net.ipv4.tcp_congestion_control = bbr
net.ipv4.tcp_slow_start_after_idle = 0

# UDP tuning
net.ipv4.udp_rmem_min = 8192
net.ipv4.udp_wmem_min = 8192

# Connection tracking
net.netfilter.nf_conntrack_max = 262144
net.netfilter.nf_conntrack_tcp_timeout_established = 1200

# Increase max number of connections
net.core.somaxconn = 4096
net.ipv4.tcp_max_syn_backlog = 4096

# Enable TCP Fast Open
net.ipv4.tcp_fastopen = 3

# Reduce TIME_WAIT sockets
net.ipv4.tcp_fin_timeout = 30
net.ipv4.tcp_tw_reuse = 1

# Enable IP forwarding (if acting as relay)
net.ipv4.ip_forward = 1
net.ipv6.conf.all.forwarding = 1

# Protect against SYN flood
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_max_syn_backlog = 8192
net.ipv4.tcp_synack_retries = 2

# Increase ephemeral port range
net.ipv4.ip_local_port_range = 1024 65535
```

Apply settings:
```bash
sudo sysctl -p
```

### QoS Configuration (DSCP Marking)

```javascript
// In roip-server/src/rtp/rtp_handler.js
// Set DSCP for RTP packets (EF - Expedited Forwarding)
socket.setTOS(0xb8);  // DSCP 46 (EF)

// Or use IP_TOS
socket.setOption(socket.IPPROTO_IP, socket.IP_TOS, 0xb8);
```

Router QoS configuration (example):
```
# Cisco IOS
class-map match-any VOIP-RTP
  match ip dscp ef
  match protocol rtp
policy-map WAN-OUT
  class VOIP-RTP
    priority percent 40
  class class-default
    fair-queue
interface GigabitEthernet0/0
  service-policy output WAN-OUT
```

---

## SSL/TLS Certificate Setup

### Let's Encrypt with Certbot

```bash
# Install Certbot
sudo apt update
sudo apt install -y certbot python3-certbot-nginx

# Obtain certificate (for nginx)
sudo certbot --nginx -d roip.example.com -d api.roip.example.com

# Or standalone (if nginx not running)
sudo certbot certonly --standalone -d roip.example.com

# Auto-renewal test
sudo certbot renew --dry-run

# Enable auto-renewal
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

### Manual Certificate Configuration

```bash
# Create certificate directory
sudo mkdir -p /etc/roip/ssl

# Generate private key
sudo openssl genrsa -out /etc/roip/ssl/server.key 4096

# Generate CSR
sudo openssl req -new -key /etc/roip/ssl/server.key -out /etc/roip/ssl/server.csr

# Submit CSR to CA or generate self-signed (dev only)
sudo openssl x509 -req -days 365 -in /etc/roip/ssl/server.csr -signkey /etc/roip/ssl/server.key -out /etc/roip/ssl/server.crt

# Set permissions
sudo chmod 600 /etc/roip/ssl/server.key
sudo chmod 644 /etc/roip/ssl/server.crt
```

### Certificate Deployment

Update nginx configuration:
```nginx
server {
    listen 443 ssl http2;
    server_name roip.example.com;

    ssl_certificate /etc/letsencrypt/live/roip.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/roip.example.com/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers off;

    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    ssl_stapling on;
    ssl_stapling_verify on;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
}
```

---

## Deployment Methods

### Method 1: Docker Compose (Recommended)

See `/home/user/MMDVM/deployment/docker-compose.prod.yml`

```bash
# Deploy
cd /opt/roip
docker-compose -f deployment/docker-compose.prod.yml up -d

# Check status
docker-compose -f deployment/docker-compose.prod.yml ps

# View logs
docker-compose -f deployment/docker-compose.prod.yml logs -f roip-server

# Update
docker-compose -f deployment/docker-compose.prod.yml pull
docker-compose -f deployment/docker-compose.prod.yml up -d
```

### Method 2: Ansible Deployment

See `/home/user/MMDVM/deployment/ansible/`

```bash
# Install Ansible
sudo apt install ansible

# Deploy
cd /home/user/MMDVM/deployment/ansible
ansible-playbook -i inventory/production playbook.yml

# Deploy specific roles
ansible-playbook -i inventory/production playbook.yml --tags roip-server

# Check mode (dry-run)
ansible-playbook -i inventory/production playbook.yml --check
```

### Method 3: Kubernetes Deployment

See `/home/user/MMDVM/deployment/k8s/`

```bash
# Create namespace
kubectl apply -f deployment/k8s/namespace.yaml

# Deploy secrets
kubectl create secret generic roip-secrets \
  --from-literal=db-password=CHANGE_ME \
  --from-literal=jwt-secret=CHANGE_ME \
  -n roip-production

# Deploy application
kubectl apply -f deployment/k8s/

# Check status
kubectl get pods -n roip-production
kubectl logs -f deployment/roip-server -n roip-production
```

### Method 4: Terraform (Cloud Infrastructure)

See `/home/user/MMDVM/deployment/terraform/`

```bash
# Initialize Terraform
cd /home/user/MMDVM/deployment/terraform
terraform init

# Plan deployment
terraform plan -out=tfplan

# Apply
terraform apply tfplan

# Outputs
terraform output
```

### Method 5: Manual Deployment

```bash
# 1. Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 2. Create application user
sudo useradd -r -s /bin/false roip
sudo mkdir -p /opt/roip-server
sudo chown roip:roip /opt/roip-server

# 3. Deploy application
cd /opt
sudo git clone https://github.com/yourorg/roip-server.git
cd roip-server
sudo npm ci --production

# 4. Create environment file
sudo cp .env.example .env
sudo nano .env  # Edit configuration

# 5. Create systemd service
sudo cp deployment/systemd/roip-server.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable roip-server
sudo systemctl start roip-server

# 6. Check status
sudo systemctl status roip-server
sudo journalctl -u roip-server -f
```

---

## Backup and Disaster Recovery

### Backup Strategy

```
┌─────────────────────────────────────────────────────────┐
│                    Backup Schedule                      │
├─────────────────────────────────────────────────────────┤
│ Database:                                                │
│   - Full backup: Daily at 02:00 UTC                     │
│   - Incremental: Every 6 hours                          │
│   - WAL archiving: Continuous                           │
│   - Retention: 30 days full, 90 days WAL                │
│                                                          │
│ Application:                                             │
│   - Config files: Daily                                  │
│   - Recordings: Daily (if enabled)                      │
│   - Logs: Weekly archive                                │
│   - Retention: 90 days                                   │
│                                                          │
│ System:                                                  │
│   - OS snapshot: Weekly                                  │
│   - Retention: 4 weeks                                   │
└─────────────────────────────────────────────────────────┘
```

See `/home/user/MMDVM/deployment/backup/backup.sh` for automated backup script.

### Database Backup

```bash
# Manual full backup
sudo -u postgres pg_dump roip_production | gzip > roip_backup_$(date +%Y%m%d_%H%M%S).sql.gz

# Automated backup with rotation
sudo -u postgres pg_dump -Fc roip_production > /backup/roip_$(date +%Y%m%d).dump

# Backup to S3
sudo -u postgres pg_dump -Fc roip_production | aws s3 cp - s3://roip-backups/db/roip_$(date +%Y%m%d_%H%M%S).dump

# Point-in-time recovery setup
# WAL archiving in postgresql.conf:
# archive_mode = on
# archive_command = 'aws s3 cp %p s3://roip-backups/wal/%f'
```

### Restore Procedures

```bash
# Restore from dump
sudo systemctl stop roip-server
sudo -u postgres dropdb roip_production
sudo -u postgres createdb roip_production
sudo -u postgres pg_restore -d roip_production /backup/roip_20251122.dump
sudo systemctl start roip-server

# Point-in-time recovery
# 1. Stop PostgreSQL
sudo systemctl stop postgresql

# 2. Replace data directory
sudo rm -rf /var/lib/postgresql/15/main
sudo cp -r /backup/base_backup /var/lib/postgresql/15/main

# 3. Create recovery.conf
cat > /var/lib/postgresql/15/main/recovery.conf <<EOF
restore_command = 'aws s3 cp s3://roip-backups/wal/%f %p'
recovery_target_time = '2025-11-22 12:00:00'
EOF

# 4. Start PostgreSQL
sudo systemctl start postgresql
```

### Disaster Recovery Plan

1. **RTO (Recovery Time Objective)**: 1 hour
2. **RPO (Recovery Point Objective)**: 15 minutes

**Recovery Steps**:
1. Provision new server (15 min)
2. Restore database from latest backup (15 min)
3. Deploy application (15 min)
4. Update DNS (5 min, TTL propagation: 5-60 min)
5. Verify and test (10 min)

**Automated DR**:
- Database: Streaming replication to standby
- Application: Blue-green deployment
- DNS: Automated failover with health checks

---

## Monitoring and Alerting

### Prometheus Configuration

See `/home/user/MMDVM/deployment/monitoring/prometheus.yml`

### Grafana Dashboards

See `/home/user/MMDVM/deployment/monitoring/grafana-dashboards/`

### Alert Rules

See `/home/user/MMDVM/deployment/monitoring/alert-rules.yml`

### Key Metrics to Monitor

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| CPU Usage | >70% | >90% | Scale up or optimize |
| Memory Usage | >80% | >95% | Restart or scale |
| Disk Usage | >80% | >90% | Clean logs or expand |
| Active Calls | >80% capacity | >95% capacity | Scale out |
| Response Time | >500ms | >1000ms | Investigate bottleneck |
| Error Rate | >1% | >5% | Check logs |
| Database Connections | >70% pool | >90% pool | Increase pool or find leaks |

### Health Check Endpoints

```bash
# Application health
curl http://localhost:8080/health

# Database health
curl http://localhost:8080/health/db

# Full system check
curl http://localhost:8080/health/detailed
```

---

## Rollback Procedures

### Application Rollback

```bash
# Docker Compose
docker-compose -f deployment/docker-compose.prod.yml down
docker tag roip-server:latest roip-server:broken
docker tag roip-server:previous roip-server:latest
docker-compose -f deployment/docker-compose.prod.yml up -d

# Kubernetes
kubectl rollout undo deployment/roip-server -n roip-production
kubectl rollout status deployment/roip-server -n roip-production

# Manual
cd /opt/roip-server
git log  # Find previous working commit
git checkout <commit-hash>
npm ci --production
sudo systemctl restart roip-server
```

### Database Rollback

```bash
# Restore from backup
sudo systemctl stop roip-server
sudo -u postgres pg_restore -d roip_production /backup/roip_before_migration.dump
sudo systemctl start roip-server

# Or use migrations
cd /opt/roip-server
npm run migrate:rollback
```

---

## Security Hardening

### OS Hardening

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install security tools
sudo apt install -y fail2ban unattended-upgrades ufw aide

# Configure automatic security updates
sudo dpkg-reconfigure -plow unattended-upgrades

# Harden SSH
sudo nano /etc/ssh/sshd_config
# Set: PermitRootLogin no, PasswordAuthentication no, PubkeyAuthentication yes

# Install intrusion detection
sudo apt install -y aide
sudo aideinit
sudo mv /var/lib/aide/aide.db.new /var/lib/aide/aide.db

# Configure fail2ban
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
sudo nano /etc/fail2ban/jail.local
# Enable [sshd] jail
sudo systemctl enable fail2ban
sudo systemctl restart fail2ban
```

### Application Security

```bash
# Run as non-root user
sudo useradd -r -s /bin/false roip

# Set file permissions
sudo chown -R roip:roip /opt/roip-server
sudo chmod 750 /opt/roip-server
sudo chmod 600 /opt/roip-server/.env

# Enable SELinux/AppArmor
sudo aa-enforce /etc/apparmor.d/roip-server

# Rotate secrets regularly
# Update JWT_SECRET, database passwords every 90 days
```

### Network Security

```bash
# Enable rate limiting in nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_conn_zone $binary_remote_addr zone=addr:10m;

server {
    limit_req zone=api burst=20 nodelay;
    limit_conn addr 10;
}

# Configure fail2ban for application
sudo nano /etc/fail2ban/filter.d/roip-auth.conf
# Add patterns for failed authentication

sudo nano /etc/fail2ban/jail.local
# Add [roip-auth] jail
```

---

## Performance Tuning

### Node.js Tuning

```bash
# Increase V8 heap size
NODE_OPTIONS="--max-old-space-size=4096"

# Enable production mode
NODE_ENV=production

# Use clustering
PM2_INSTANCES=4  # Or use PM2 cluster mode
```

### PostgreSQL Tuning

See [Database Setup](#database-setup) section.

### System Tuning

See [Network Performance Tuning](#network-performance-tuning) section.

### Application Optimization

```javascript
// Enable compression
app.use(compression());

// Use connection pooling
const pool = new Pool({
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Cache static assets
app.use(express.static('public', {
  maxAge: '1d',
  etag: true
}));

// Use CDN for static content
// Configure nginx to cache API responses where appropriate
```

---

## Post-Deployment Verification

```bash
# Check all services running
sudo systemctl status roip-server postgresql coturn nginx

# Verify network connectivity
nc -zv localhost 5060
nc -zuv localhost 10000

# Test API
curl -I https://roip.example.com/api/health

# Check logs for errors
sudo journalctl -u roip-server -n 100 --no-pager

# Monitor resource usage
htop
iotop
iftop

# Test SIP registration from ESP32
# Test call flow
# Verify audio quality
# Check monitoring dashboards
```

---

## Troubleshooting

See [RUNBOOK.md](/home/user/MMDVM/docs/RUNBOOK.md) for detailed troubleshooting procedures.

---

## Support and Maintenance

### Regular Maintenance Tasks
- Weekly: Review logs, check disk space, verify backups
- Monthly: Security updates, certificate renewal checks, performance review
- Quarterly: Capacity planning, disaster recovery testing
- Annually: Security audit, infrastructure review

### Update Schedule
- Security patches: Within 24 hours
- Minor updates: Monthly maintenance window
- Major updates: Quarterly after testing

---

**Document Version**: 1.0
**Last Updated**: 2025-11-22
**Maintained By**: RoIP Operations Team
