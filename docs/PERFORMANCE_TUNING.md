# Performance Tuning Guide

This document provides comprehensive performance tuning guidelines for the ESP32 RoIP system, covering OS-level optimizations, Node.js tuning, and application-specific improvements.

## Table of Contents

1. [Operating System Tuning](#operating-system-tuning)
2. [Node.js Configuration](#nodejs-configuration)
3. [Network Stack Optimization](#network-stack-optimization)
4. [Database Tuning](#database-tuning)
5. [Application-Level Optimization](#application-level-optimization)
6. [Monitoring and Verification](#monitoring-and-verification)

---

## Operating System Tuning

### Linux Kernel Parameters

Apply these system-level tuning parameters for optimal networking performance:

```bash
# Create tuning configuration file
sudo tee /etc/sysctl.d/99-roip-tuning.conf <<EOF

# === Network Buffer Sizes ===
# Increase UDP buffer sizes for RTP streaming
net.core.rmem_max = 26214400          # 25MB receive buffer
net.core.wmem_max = 26214400          # 25MB send buffer
net.core.rmem_default = 26214400
net.core.wmem_default = 26214400

# TCP buffer sizes (auto-tuning)
net.ipv4.tcp_rmem = 4096 87380 26214400
net.ipv4.tcp_wmem = 4096 65536 26214400

# === Network Performance ===
# Increase netdev budget for packet processing
net.core.netdev_budget = 600
net.core.netdev_max_backlog = 5000

# Enable TCP Fast Open
net.ipv4.tcp_fastopen = 3

# TCP congestion control algorithm
net.ipv4.tcp_congestion_control = bbr

# Reduce TCP time-wait sockets
net.ipv4.tcp_fin_timeout = 30
net.ipv4.tcp_tw_reuse = 1

# === Connection Tracking ===
net.netfilter.nf_conntrack_max = 1000000
net.netfilter.nf_conntrack_tcp_timeout_established = 7200

# === File Descriptors ===
fs.file-max = 2097152
fs.nr_open = 2097152

# === Memory Management ===
vm.swappiness = 10                    # Reduce swap usage
vm.dirty_ratio = 15                   # Start background writeback
vm.dirty_background_ratio = 5

# === Shared Memory (for IPC) ===
kernel.shmmax = 68719476736           # 64GB
kernel.shmall = 4294967296

EOF

# Apply settings
sudo sysctl -p /etc/sysctl.d/99-roip-tuning.conf
```

### System Limits

Increase process limits for the RoIP server:

```bash
# Edit /etc/security/limits.conf
sudo tee -a /etc/security/limits.conf <<EOF

# RoIP Server Limits
roip soft nofile 65535
roip hard nofile 65535
roip soft nproc 32768
roip hard nproc 32768

EOF

# For systemd services, also set in service file:
# LimitNOFILE=65535
# LimitNPROC=32768
```

---

## Node.js Configuration

### Environment Variables

Configure Node.js runtime for optimal performance:

```bash
# Create environment file: /etc/default/roip-server
cat > /etc/default/roip-server <<EOF

# === Memory Configuration ===
# Increase heap size (adjust based on available RAM)
NODE_OPTIONS="--max-old-space-size=4096"

# Enable heap optimization
NODE_OPTIONS="\$NODE_OPTIONS --optimize-for-size"

# Expose garbage collection stats
NODE_OPTIONS="\$NODE_OPTIONS --expose-gc"

# === UV Thread Pool ===
# Increase thread pool size for async I/O
UV_THREADPOOL_SIZE=16

# === Performance ===
# Enable turbo fan optimization
NODE_OPTIONS="\$NODE_OPTIONS --turbo-fan"

# === Debugging (production: disable) ===
# NODE_OPTIONS="\$NODE_OPTIONS --trace-warnings"
# NODE_OPTIONS="\$NODE_OPTIONS --trace-deprecation"

EOF

# Load in your service:
# source /etc/default/roip-server
```

### V8 Optimization

For CPU-intensive operations:

```javascript
// In your application initialization
if (process.env.NODE_ENV === 'production') {
  // Let V8 optimize hot functions
  require('v8').setFlagsFromString('--expose-gc');

  // Periodic GC hint for long-running processes
  setInterval(() => {
    if (global.gc) {
      global.gc();
    }
  }, 300000); // Every 5 minutes
}
```

---

## Network Stack Optimization

### Network Interface Configuration

Optimize network interface for low-latency RTP streaming:

```bash
# Increase ring buffer sizes
sudo ethtool -G eth0 rx 4096 tx 4096

# Enable hardware offloading (if supported)
sudo ethtool -K eth0 rx on tx on
sudo ethtool -K eth0 gso on gro on

# Disable interrupt coalescing for lower latency
sudo ethtool -C eth0 rx-usecs 0 tx-usecs 0

# Set CPU affinity for network interrupts
# (distribute across cores)
```

### UDP Socket Optimization

Configure UDP sockets for RTP:

```javascript
import dgram from 'dgram';

const socket = dgram.createSocket({
  type: 'udp4',
  reuseAddr: true,
  // Increase receive buffer
  recvBufferSize: 25 * 1024 * 1024,  // 25MB
  sendBufferSize: 25 * 1024 * 1024   // 25MB
});

// Set socket options
socket.setRecvBufferSize(25 * 1024 * 1024);
socket.setSendBufferSize(25 * 1024 * 1024);

// Enable broadcast if needed
socket.setBroadcast(true);
```

### WebSocket Tuning

Optimize WebSocket connections:

```javascript
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({
  server: httpServer,
  perMessageDeflate: {
    zlibDeflateOptions: {
      chunkSize: 1024,
      memLevel: 7,
      level: 3  // Lower compression for speed
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024
    },
    threshold: 1024  // Only compress messages > 1KB
  },
  maxPayload: 1024 * 1024,  // 1MB max message
  clientTracking: true
});
```

---

## Database Tuning

### PostgreSQL Configuration

Optimize PostgreSQL for the RoIP workload:

```sql
-- /etc/postgresql/14/main/postgresql.conf

-- === Memory ===
shared_buffers = 4GB                  -- 25% of RAM
effective_cache_size = 12GB           -- 75% of RAM
work_mem = 64MB                       -- Per operation
maintenance_work_mem = 1GB

-- === Connections ===
max_connections = 200
max_prepared_transactions = 200

-- === Query Planner ===
random_page_cost = 1.1                -- SSD optimization
effective_io_concurrency = 200        -- Concurrent I/O

-- === Write Performance ===
wal_buffers = 16MB
checkpoint_timeout = 10min
max_wal_size = 4GB
min_wal_size = 1GB
checkpoint_completion_target = 0.9

-- === Async Operations ===
synchronous_commit = off              -- Trade durability for speed
wal_writer_delay = 200ms

-- === Logging ===
logging_collector = on
log_min_duration_statement = 1000     -- Log slow queries (>1s)
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d '

-- === Performance Extensions ===
shared_preload_libraries = 'pg_stat_statements'
pg_stat_statements.max = 10000
pg_stat_statements.track = all
```

### Index Optimization

Create appropriate indexes:

```sql
-- Devices table
CREATE INDEX CONCURRENTLY idx_devices_status ON devices(status) WHERE status = 'online';
CREATE INDEX CONCURRENTLY idx_devices_type ON devices(device_type);

-- Routes table
CREATE INDEX CONCURRENTLY idx_routes_active ON routes(source_id, destination_id) WHERE active = true;
CREATE INDEX CONCURRENTLY idx_routes_timestamp ON routes(created_at DESC);

-- Call logs
CREATE INDEX CONCURRENTLY idx_call_logs_timestamp ON call_logs(started_at DESC);
CREATE INDEX CONCURRENTLY idx_call_logs_device ON call_logs(device_id, started_at DESC);
CREATE INDEX CONCURRENTLY idx_call_logs_duration ON call_logs((ended_at - started_at));

-- Analyze tables
ANALYZE devices;
ANALYZE routes;
ANALYZE call_logs;
```

### Connection Pooling

Optimize database connection pool:

```javascript
import pg from 'pg';

const pool = new pg.Pool({
  host: 'localhost',
  port: 5432,
  database: 'roip',
  user: 'roip_user',
  password: process.env.DB_PASSWORD,

  // Connection pool settings
  max: 20,                    // Max connections
  min: 5,                     // Min idle connections
  idleTimeoutMillis: 30000,   // Close idle after 30s
  connectionTimeoutMillis: 5000,

  // Performance
  statement_timeout: 10000,    // 10s query timeout
  query_timeout: 10000,

  // Connection tuning
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000
});

// Monitor pool
pool.on('error', (err) => {
  console.error('Database pool error:', err);
});

pool.on('connect', () => {
  console.log('New database connection established');
});
```

---

## Application-Level Optimization

### Caching Strategy

Implement multi-level caching:

```javascript
import { createCacheManager } from './cache/cache-manager.js';

const cache = createCacheManager({
  l1TTL: 60,              // 1 minute L1 cache
  l1MaxKeys: 1000,
  l2Enabled: true,
  redisHost: 'localhost',
  redisPort: 6379
});

// Cache frequently accessed data
async function getDeviceStatus(deviceId) {
  return cache.getOrSet(
    `device:${deviceId}:status`,
    async () => {
      // Fetch from database
      return await db.query('SELECT * FROM devices WHERE id = $1', [deviceId]);
    },
    60  // TTL: 60 seconds
  );
}
```

### Request Rate Limiting

Protect against abuse:

```javascript
import rateLimit from 'express-rate-limit';

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 1000,                 // Limit each IP to 1000 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: req.rateLimit.resetTime
    });
  }
});

app.use('/api/', apiLimiter);
```

### Response Compression

Enable compression for HTTP responses:

```javascript
import compression from 'compression';

app.use(compression({
  level: 6,              // Compression level (1-9)
  threshold: 1024,       // Only compress if >1KB
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));
```

### Static Asset Optimization

Serve static files efficiently:

```javascript
import express from 'express';
import path from 'path';

app.use('/static', express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',           // Cache for 1 day
  etag: true,
  lastModified: true,
  immutable: true
}));
```

---

## Monitoring and Verification

### Performance Metrics

Monitor these key metrics:

```javascript
import prometheus from 'prom-client';

// Create metrics
const httpRequestDuration = new prometheus.Histogram({
  name: 'http_request_duration_ms',
  help: 'HTTP request duration in milliseconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000]
});

const activeConnections = new prometheus.Gauge({
  name: 'websocket_active_connections',
  help: 'Number of active WebSocket connections'
});

const rtpPacketRate = new prometheus.Counter({
  name: 'rtp_packets_total',
  help: 'Total RTP packets processed',
  labelNames: ['direction']  // 'rx' or 'tx'
});

// Export metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', prometheus.register.contentType);
  res.end(await prometheus.register.metrics());
});
```

### Health Checks

Implement comprehensive health checks:

```javascript
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {}
  };

  // Database check
  try {
    await db.query('SELECT 1');
    health.checks.database = 'ok';
  } catch (error) {
    health.checks.database = 'error';
    health.status = 'unhealthy';
  }

  // Redis check
  try {
    await cache.l2.ping();
    health.checks.redis = 'ok';
  } catch (error) {
    health.checks.redis = 'degraded';
  }

  // Memory check
  const memUsage = process.memoryUsage();
  health.checks.memory = {
    heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
    heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`
  };

  res.status(health.status === 'healthy' ? 200 : 503).json(health);
});
```

### Verification Commands

Verify tuning effectiveness:

```bash
# Check kernel parameters
sysctl -a | grep -E 'net.core|net.ipv4|fs.file-max'

# Monitor network statistics
watch -n 1 'netstat -s | grep -E "packet|error"'

# Check file descriptor usage
lsof -p $(pgrep -f roip-server) | wc -l

# Monitor PostgreSQL performance
psql -U roip_user -d roip -c "SELECT * FROM pg_stat_database WHERE datname = 'roip';"

# Check Redis performance
redis-cli INFO stats

# Monitor Node.js process
node --expose-gc --max-old-space-size=4096 server.js &
watch -n 5 'ps aux | grep "node.*server.js"'
```

---

## Performance Benchmarks

Expected performance after tuning:

| Metric | Target | Notes |
|--------|--------|-------|
| API Response Time (p95) | < 100ms | REST endpoints |
| WebSocket Latency (p95) | < 50ms | Message delivery |
| RTP Latency (p95) | < 150ms | End-to-end audio |
| Concurrent Calls | > 100 | Per server instance |
| Database Queries | < 50ms | Average query time |
| Cache Hit Rate | > 95% | L1 + L2 combined |
| Memory per Call | < 5MB | Active call memory |
| CPU per Call | < 2% | Per core utilization |

---

## Troubleshooting

### High Latency

If experiencing high latency:

1. Check network statistics: `netstat -s`
2. Verify buffer sizes: `sysctl net.core.rmem_max`
3. Monitor event loop lag
4. Profile with Clinic.js Doctor

### Memory Leaks

If memory grows continuously:

1. Enable heap profiling
2. Take periodic heap snapshots
3. Analyze with Chrome DevTools
4. Check for unclosed connections

### Database Slowness

If database queries are slow:

1. Run query analysis: `node scripts/analyze-queries.js`
2. Check pg_stat_statements
3. Verify index usage
4. Run VACUUM ANALYZE

---

## Additional Resources

- [Node.js Performance Best Practices](https://nodejs.org/en/docs/guides/simple-profiling/)
- [Linux Network Tuning Guide](https://www.kernel.org/doc/Documentation/networking/ip-sysctl.txt)
- [PostgreSQL Performance Tuning](https://wiki.postgresql.org/wiki/Performance_Optimization)
- [RTP Performance](https://tools.ietf.org/html/rfc3550)

---

**Last Updated:** 2025-11-22
**Version:** 1.0.0
