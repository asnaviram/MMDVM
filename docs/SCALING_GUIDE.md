# Horizontal Scaling Guide

This guide covers horizontal scaling strategies for the ESP32 RoIP system, including load balancing, database replication, session management, and high availability configuration.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Load Balancer Setup](#load-balancer-setup)
3. [Session Management](#session-management)
4. [Database Scaling](#database-scaling)
5. [Redis Clustering](#redis-clustering)
6. [Shared Storage](#shared-storage)
7. [Auto-Scaling](#auto-scaling)
8. [Monitoring & Health Checks](#monitoring--health-checks)

---

## Architecture Overview

### Scaled Architecture Diagram

```
                    ┌─────────────┐
                    │   DNS/CDN   │
                    └──────┬──────┘
                           │
                    ┌──────▼──────────┐
                    │ Load Balancer   │
                    │  (HAProxy/Nginx)│
                    └──────┬──────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
    ┌────▼────┐       ┌────▼────┐      ┌────▼────┐
    │ RoIP #1 │       │ RoIP #2 │      │ RoIP #3 │
    │ Server  │       │ Server  │      │ Server  │
    └────┬────┘       └────┬────┘      └────┬────┘
         │                 │                 │
         └─────────────────┼─────────────────┘
                           │
         ┌─────────────────┴─────────────────┐
         │                                   │
    ┌────▼──────┐                      ┌─────▼─────┐
    │ PostgreSQL │                     │   Redis   │
    │  Cluster   │                     │  Cluster  │
    │ (Primary + │                     │ (Sentinel)│
    │  Replicas) │                     └───────────┘
    └───────────┘
         │
    ┌────▼──────┐
    │   Shared  │
    │  Storage  │
    │    (NFS)  │
    └───────────┘
```

### Scaling Considerations

- **Stateless Application Servers**: Each RoIP server should be stateless
- **Sticky Sessions**: Use for WebSocket connections
- **Shared State**: Store in Redis/PostgreSQL
- **Media Routing**: Direct RTP between ESP32 devices when possible

---

## Load Balancer Setup

### Option 1: HAProxy

**Installation:**

```bash
sudo apt-get install haproxy
```

**Configuration: `/etc/haproxy/haproxy.cfg`**

```haproxy
global
    log /dev/log local0
    log /dev/log local1 notice
    chroot /var/lib/haproxy
    stats socket /run/haproxy/admin.sock mode 660 level admin
    stats timeout 30s
    user haproxy
    group haproxy
    daemon

    # SSL/TLS settings
    ssl-default-bind-ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384
    ssl-default-bind-options ssl-min-ver TLSv1.2
    tune.ssl.default-dh-param 2048

defaults
    log     global
    mode    http
    option  httplog
    option  dontlognull
    timeout connect 5000
    timeout client  300000    # 5 minutes for WebSocket
    timeout server  300000
    errorfile 400 /etc/haproxy/errors/400.http
    errorfile 403 /etc/haproxy/errors/403.http
    errorfile 408 /etc/haproxy/errors/408.http
    errorfile 500 /etc/haproxy/errors/500.http
    errorfile 502 /etc/haproxy/errors/502.http
    errorfile 503 /etc/haproxy/errors/503.http
    errorfile 504 /etc/haproxy/errors/504.http

# Statistics page
listen stats
    bind *:8404
    stats enable
    stats uri /stats
    stats refresh 30s
    stats auth admin:your-secure-password

# Frontend for HTTP/HTTPS traffic
frontend http_front
    bind *:80
    bind *:443 ssl crt /etc/ssl/certs/roip-combined.pem

    # Redirect HTTP to HTTPS
    redirect scheme https code 301 if !{ ssl_fc }

    # ACLs
    acl is_websocket hdr(Upgrade) -i WebSocket
    acl is_api path_beg /api

    # Use backends
    use_backend websocket_back if is_websocket
    use_backend api_back if is_api
    default_backend roip_servers

# Backend for WebSocket (sticky sessions)
backend websocket_back
    balance roundrobin
    option http-server-close
    option forwardfor

    # Sticky sessions for WebSocket
    stick-table type ip size 1m expire 30m
    stick on src

    # Health check
    option httpchk GET /health HTTP/1.1\r\nHost:\ localhost

    # Servers
    server roip1 10.0.1.11:8080 check inter 5s fall 3 rise 2
    server roip2 10.0.1.12:8080 check inter 5s fall 3 rise 2
    server roip3 10.0.1.13:8080 check inter 5s fall 3 rise 2

# Backend for API (no sticky sessions)
backend api_back
    balance leastconn
    option httpchk GET /health HTTP/1.1\r\nHost:\ localhost

    server roip1 10.0.1.11:8080 check inter 5s fall 3 rise 2
    server roip2 10.0.1.12:8080 check inter 5s fall 3 rise 2
    server roip3 10.0.1.13:8080 check inter 5s fall 3 rise 2

# Default backend
backend roip_servers
    balance roundrobin
    option httpchk GET /health HTTP/1.1\r\nHost:\ localhost

    server roip1 10.0.1.11:8080 check inter 5s fall 3 rise 2
    server roip2 10.0.1.12:8080 check inter 5s fall 3 rise 2
    server roip3 10.0.1.13:8080 check inter 5s fall 3 rise 2

# Frontend for RTP (UDP)
frontend rtp_front
    bind *:5004-5104 transparent
    mode udp
    default_backend rtp_back

# Backend for RTP
backend rtp_back
    mode udp
    balance roundrobin

    server roip1 10.0.1.11:5004-5104 check
    server roip2 10.0.1.12:5004-5104 check
    server roip3 10.0.1.13:5004-5104 check
```

**Start HAProxy:**

```bash
sudo systemctl enable haproxy
sudo systemctl restart haproxy
```

### Option 2: Nginx

**Installation:**

```bash
sudo apt-get install nginx
```

**Configuration: `/etc/nginx/nginx.conf`**

```nginx
user www-data;
worker_processes auto;
pid /run/nginx.pid;

events {
    worker_connections 4096;
    use epoll;
    multi_accept on;
}

http {
    upstream roip_backend {
        least_conn;

        server 10.0.1.11:8080 max_fails=3 fail_timeout=30s;
        server 10.0.1.12:8080 max_fails=3 fail_timeout=30s;
        server 10.0.1.13:8080 max_fails=3 fail_timeout=30s;

        keepalive 32;
    }

    upstream websocket_backend {
        ip_hash;  # Sticky sessions

        server 10.0.1.11:8080 max_fails=3 fail_timeout=30s;
        server 10.0.1.12:8080 max_fails=3 fail_timeout=30s;
        server 10.0.1.13:8080 max_fails=3 fail_timeout=30s;

        keepalive 32;
    }

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/s;

    # Cache
    proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=api_cache:10m max_size=1g inactive=60m;

    server {
        listen 80;
        listen [::]:80;
        server_name roip.example.com;

        # Redirect to HTTPS
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl http2;
        listen [::]:443 ssl http2;
        server_name roip.example.com;

        # SSL configuration
        ssl_certificate /etc/ssl/certs/roip.crt;
        ssl_certificate_key /etc/ssl/private/roip.key;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;
        ssl_prefer_server_ciphers on;

        # Security headers
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;

        # WebSocket location
        location /ws {
            proxy_pass http://websocket_backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # Timeouts for WebSocket
            proxy_connect_timeout 7d;
            proxy_send_timeout 7d;
            proxy_read_timeout 7d;
        }

        # API location
        location /api {
            limit_req zone=api_limit burst=50 nodelay;

            proxy_pass http://roip_backend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header Connection "";

            # Caching
            proxy_cache api_cache;
            proxy_cache_valid 200 1m;
            proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
            proxy_cache_background_update on;
            proxy_cache_lock on;
        }

        # Health check endpoint
        location /health {
            proxy_pass http://roip_backend;
            access_log off;
        }

        # Default location
        location / {
            proxy_pass http://roip_backend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header Connection "";
        }
    }
}

# UDP load balancing for RTP (Nginx Plus or custom module required)
stream {
    upstream rtp_backend {
        server 10.0.1.11:5004;
        server 10.0.1.12:5004;
        server 10.0.1.13:5004;
    }

    server {
        listen 5004 udp;
        proxy_pass rtp_backend;
        proxy_timeout 10s;
    }
}
```

---

## Session Management

### Sticky Sessions with Redis

Store WebSocket session state in Redis:

```javascript
import { createClient } from 'redis';
import { v4 as uuidv4 } from 'uuid';

class SessionManager {
  constructor() {
    this.redis = createClient({
      url: 'redis://localhost:6379',
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 50, 1000)
      }
    });

    this.redis.connect();
  }

  async createSession(deviceId, socketId) {
    const sessionId = uuidv4();
    const sessionData = {
      deviceId,
      socketId,
      serverId: process.env.SERVER_ID || 'unknown',
      createdAt: Date.now()
    };

    await this.redis.setEx(
      `session:${sessionId}`,
      3600,  // 1 hour TTL
      JSON.stringify(sessionData)
    );

    // Map device to session
    await this.redis.setEx(
      `device:${deviceId}:session`,
      3600,
      sessionId
    );

    return sessionId;
  }

  async getSession(sessionId) {
    const data = await this.redis.get(`session:${sessionId}`);
    return data ? JSON.parse(data) : null;
  }

  async findSessionByDevice(deviceId) {
    const sessionId = await this.redis.get(`device:${deviceId}:session`);
    return sessionId ? this.getSession(sessionId) : null;
  }

  async deleteSession(sessionId) {
    const session = await this.getSession(sessionId);
    if (session) {
      await this.redis.del(`device:${session.deviceId}:session`);
      await this.redis.del(`session:${sessionId}`);
    }
  }

  async renewSession(sessionId) {
    const session = await this.getSession(sessionId);
    if (session) {
      await this.redis.expire(`session:${sessionId}`, 3600);
      await this.redis.expire(`device:${session.deviceId}:session`, 3600);
    }
  }
}

export default new SessionManager();
```

---

## Database Scaling

### PostgreSQL Replication

**Primary Configuration (`postgresql.conf`):**

```conf
# Replication settings
wal_level = replica
max_wal_senders = 10
max_replication_slots = 10
hot_standby = on
archive_mode = on
archive_command = 'cp %p /var/lib/postgresql/archive/%f'
```

**Create Replication User:**

```sql
CREATE ROLE replicator WITH REPLICATION PASSWORD 'secure-password' LOGIN;
```

**Configure pg_hba.conf:**

```conf
# Replication connections
host    replication     replicator      10.0.1.0/24       md5
```

**Setup Replica:**

```bash
# On replica server
pg_basebackup -h 10.0.1.11 -D /var/lib/postgresql/14/main -U replicator -P -v -R

# Start replica
sudo systemctl start postgresql
```

### Read Replica Connection Pooling

```javascript
import pg from 'pg';

// Primary (write) pool
const primaryPool = new pg.Pool({
  host: '10.0.1.11',
  port: 5432,
  database: 'roip',
  user: 'roip_user',
  password: process.env.DB_PASSWORD,
  max: 20
});

// Replica (read) pools
const replicaPools = [
  new pg.Pool({
    host: '10.0.1.21',
    port: 5432,
    database: 'roip',
    user: 'roip_user',
    password: process.env.DB_PASSWORD,
    max: 30
  }),
  new pg.Pool({
    host: '10.0.1.22',
    port: 5432,
    database: 'roip',
    user: 'roip_user',
    password: process.env.DB_PASSWORD,
    max: 30
  })
];

let replicaIndex = 0;

export function getWriteConnection() {
  return primaryPool;
}

export function getReadConnection() {
  // Round-robin across replicas
  const pool = replicaPools[replicaIndex];
  replicaIndex = (replicaIndex + 1) % replicaPools.length;
  return pool;
}
```

---

## Redis Clustering

### Redis Sentinel Setup

**Sentinel Configuration (`/etc/redis/sentinel.conf`):**

```conf
port 26379
sentinel monitor roip-master 10.0.1.31 6379 2
sentinel down-after-milliseconds roip-master 5000
sentinel failover-timeout roip-master 60000
sentinel parallel-syncs roip-master 1
sentinel auth-pass roip-master your-redis-password
```

**Application Configuration:**

```javascript
import Redis from 'ioredis';

const redis = new Redis({
  sentinels: [
    { host: '10.0.1.41', port: 26379 },
    { host: '10.0.1.42', port: 26379 },
    { host: '10.0.1.43', port: 26379 }
  ],
  name: 'roip-master',
  password: 'your-redis-password',
  db: 0
});

redis.on('error', (error) => {
  console.error('Redis error:', error);
});

redis.on('+switch-master', () => {
  console.log('Redis failover detected');
});
```

---

## Shared Storage

### NFS Setup (for shared files)

**Server Setup:**

```bash
# Install NFS server
sudo apt-get install nfs-kernel-server

# Create shared directory
sudo mkdir -p /srv/roip/shared
sudo chown nobody:nogroup /srv/roip/shared

# Configure exports
echo "/srv/roip/shared 10.0.1.0/24(rw,sync,no_subtree_check,no_root_squash)" | sudo tee -a /etc/exports

# Apply configuration
sudo exportfs -a
sudo systemctl restart nfs-kernel-server
```

**Client Setup:**

```bash
# Install NFS client
sudo apt-get install nfs-common

# Mount shared directory
sudo mkdir -p /mnt/roip-shared
sudo mount 10.0.1.100:/srv/roip/shared /mnt/roip-shared

# Add to /etc/fstab for persistent mount
echo "10.0.1.100:/srv/roip/shared /mnt/roip-shared nfs defaults 0 0" | sudo tee -a /etc/fstab
```

---

## Auto-Scaling

### Kubernetes Horizontal Pod Autoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: roip-server-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: roip-server
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  - type: Pods
    pods:
      metric:
        name: websocket_connections
      target:
        type: AverageValue
        averageValue: "100"
```

---

## Monitoring & Health Checks

### Health Check Endpoint

```javascript
app.get('/health', async (req, res) => {
  const checks = {
    database: await checkDatabase(),
    redis: await checkRedis(),
    memory: checkMemory(),
    disk: await checkDisk()
  };

  const healthy = Object.values(checks).every(c => c.status === 'ok');

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    checks
  });
});
```

---

**Last Updated:** 2025-11-22
**Version:** 1.0.0
