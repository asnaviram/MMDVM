# Performance Debugging Guide
## ESP32 RoIP Production System

**Version**: 1.0
**Last Updated**: 2025-11-22

---

## Quick Performance Check

```bash
#!/bin/bash
# Quick performance snapshot

echo "=== Performance Snapshot - $(date) ==="

# CPU
echo -e "\nCPU Load:"
uptime | awk -F'load average:' '{print $2}'
top -b -n 1 | head -5

# Memory
echo -e "\nMemory:"
free -h | awk 'NR<3{print}'

# Disk I/O
echo -e "\nDisk I/O:"
iostat -x 1 2 | tail -n +4

# Network
echo -e "\nNetwork:"
ss -s

# Active calls
echo -e "\nActive Calls:"
curl -s http://localhost:8080/api/v1/calls/active | jq 'length'

# Database connections
echo -e "\nDatabase Connections:"
psql -U roip_user -d roip_production -t -c "SELECT count(*) FROM pg_stat_activity;"

# API response time (sample)
echo -e "\nAPI Response Time:"
time curl -s http://localhost:8080/health > /dev/null
```

---

## CPU Performance

### Diagnosis

```bash
# Real-time CPU usage
top -b -n 1 | head -20

# Per-process CPU
ps aux --sort=-%cpu | head -20

# CPU by thread (for multi-threaded apps)
top -H -p $(pgrep -f roip-server)

# Historical CPU (if sysstat installed)
sar -u 1 10

# CPU wait time (I/O bottleneck indicator)
iostat -c 1 10
```

### Analysis

```bash
# Identify CPU hogs
#!/bin/bash
echo "=== Top CPU Consumers ==="

# Application processes
echo -e "\nRoIP Server:"
ps -o pid,pcpu,pmem,cmd -C node | grep roip

# Database
echo -e "\nDatabase:"
ps -o pid,pcpu,pmem,cmd -C postgres | head -10

# System processes
echo -e "\nTop System Processes:"
ps aux --sort=-%cpu | head -10 | awk '{print $11, $3"%"}'

# Check for CPU steal (virtualization overhead)
top -b -n 1 | grep "st" | awk '{print "CPU Steal:", $8}'
```

### Common Issues

**High CPU from Database**:
```bash
# Find expensive queries
psql -U roip_user -d roip_production -c "
SELECT pid, state, query_start, query
FROM pg_stat_activity
WHERE state = 'active'
ORDER BY query_start
LIMIT 10;"

# Check for missing indexes
psql -U roip_user -d roip_production -c "
SELECT schemaname, tablename, attname, n_distinct
FROM pg_stats
WHERE schemaname = 'public'
  AND n_distinct > 10000;"
```

**High CPU from Node.js**:
```bash
# Check for tight loops in code
# Enable CPU profiling
node --prof /opt/roip-server/src/server.js

# After running for a while, stop and analyze
node --prof-process isolate-*.log > cpu-profile.txt
head -100 cpu-profile.txt

# Look for hot functions (high ticks%)
```

---

## Memory Performance

### Diagnosis

```bash
# Memory overview
free -h

# Per-process memory
ps aux --sort=-%mem | head -20

# Detailed memory info
cat /proc/meminfo | grep -E "MemTotal|MemFree|MemAvailable|Cached|SwapTotal|SwapFree"

# Check for memory leaks (over time)
watch -n 5 'ps -o pid,vsz,rss,cmd -p $(pgrep -f roip-server)'

# Check OOM killer activity
sudo dmesg | grep -i "oom\|killed process"
```

### Analysis

```bash
#!/bin/bash
# Memory leak detection

echo "=== Memory Analysis ==="

# Current usage
PID=$(pgrep -f roip-server)
ps -o pid,vsz,rss,cmd -p $PID

# Track over time (run this periodically)
echo "$(date +%s),$(ps -o rss= -p $PID)" >> /tmp/memory-usage.csv

# Analyze trend
if [ -f /tmp/memory-usage.csv ]; then
  echo -e "\nMemory Trend (last 10 samples):"
  tail -10 /tmp/memory-usage.csv | awk -F',' '{print "Time:", $1, "RSS:", $2/1024 "MB"}'
fi

# Check heap usage (Node.js)
curl -s http://localhost:8080/metrics | grep "nodejs_heap_size_total_bytes\|nodejs_heap_size_used_bytes"
```

### Common Issues

**Memory Leak**:
```bash
# Enable Node.js heap snapshot
kill -USR2 $(pgrep -f roip-server)
# This creates heap snapshot in /tmp

# Analyze with Chrome DevTools
# Load snapshot and look for detached DOM trees or growing arrays

# Quick fix: Restart service
sudo systemctl restart roip-server
```

**Database Memory**:
```bash
# Check PostgreSQL memory settings
psql -U roip_user -d roip_production -c "
SELECT name, setting, unit
FROM pg_settings
WHERE name IN ('shared_buffers', 'work_mem', 'maintenance_work_mem');"

# Tune if needed
sudo nano /etc/postgresql/15/main/postgresql.conf
# shared_buffers = 25% of RAM
# work_mem = RAM / max_connections / 4
```

---

## Disk I/O Performance

### Diagnosis

```bash
# I/O statistics
iostat -x 1 5

# Per-process I/O
sudo iotop -o

# Disk usage
df -h
du -sh /* | sort -hr | head -10

# Check for I/O wait
top -b -n 1 | grep "Cpu" | awk '{print "I/O Wait:", $10}'

# Identify slow disk
sudo hdparm -t /dev/sda
```

### Analysis

```bash
#!/bin/bash
# I/O bottleneck analysis

echo "=== Disk I/O Analysis ==="

# Check I/O wait percentage
echo -e "\nI/O Wait:"
iostat -c 1 5 | awk 'NR>3{print $4}' | awk '{sum+=$1; n++} END {print "Average:", sum/n "%"}'

# Find processes doing heavy I/O
echo -e "\nTop I/O Processes:"
sudo iotop -b -n 1 -o | head -10

# Check for slow queries causing I/O
echo -e "\nDatabase I/O:"
psql -U roip_user -d roip_production -c "
SELECT schemaname, tablename,
       heap_blks_read, heap_blks_hit,
       CASE WHEN heap_blks_hit + heap_blks_read > 0
            THEN round(100.0 * heap_blks_hit / (heap_blks_hit + heap_blks_read), 2)
            ELSE 0
       END AS cache_hit_ratio
FROM pg_statio_user_tables
WHERE heap_blks_read > 1000
ORDER BY heap_blks_read DESC
LIMIT 10;"
```

### Common Issues

**High I/O Wait**:
```bash
# Check if database vacuum needed
psql -U roip_user -d roip_production -c "
SELECT schemaname, tablename, n_dead_tup, n_live_tup
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY n_dead_tup DESC;"

# Vacuum if needed
psql -U roip_user -d roip_production -c "VACUUM ANALYZE;"
```

**Slow Disk**:
```bash
# Test disk speed
sudo dd if=/dev/zero of=/tmp/test bs=1M count=1024 oflag=direct
sudo dd if=/tmp/test of=/dev/null bs=1M iflag=direct

# If SSD, check TRIM
sudo fstrim -v /

# Consider moving to faster storage (SSD/NVMe)
```

---

## Network Performance

### Diagnosis

```bash
# Network statistics
ss -s

# Connection count
ss -ant | wc -l

# Bandwidth usage
iftop -n -i eth0

# Packet loss
ping -c 100 8.8.8.8 | grep "packet loss"

# Check for dropped packets
ip -s link show eth0 | grep -E "RX:|TX:"
netstat -i

# Network errors
netstat -s | grep -E "retransmit|error"
```

### Analysis

```bash
#!/bin/bash
# Network performance analysis

echo "=== Network Performance ==="

# Connection states
echo -e "\nConnection States:"
ss -ant | awk '{print $1}' | sort | uniq -c

# Top connections by IP
echo -e "\nTop Remote IPs:"
ss -ant | awk '{print $5}' | cut -d: -f1 | sort | uniq -c | sort -rn | head -10

# Bandwidth by port
echo -e "\nConnections by Port:"
ss -ant | awk '{print $4}' | cut -d: -f2 | sort | uniq -c | sort -rn

# Check for syn flood
echo -e "\nSYN Backlog:"
ss -ant | grep SYN | wc -l

# Network throughput (if iftop available)
# sudo iftop -t -s 10 > /tmp/network-throughput.txt
```

### Common Issues

**High Connection Count**:
```bash
# Check connection pool settings
grep DB_POOL_SIZE /opt/roip-server/.env

# Check PostgreSQL connections
psql -U roip_user -d roip_production -c "
SELECT count(*), state
FROM pg_stat_activity
GROUP BY state;"

# Close idle connections
psql -U roip_user -d roip_production -c "
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle'
  AND state_change < NOW() - INTERVAL '10 minutes';"
```

**Packet Loss**:
```bash
# Check network interface errors
ip -s link show eth0

# Check RTP port traffic
sudo tcpdump -i any -n udp port 10000-10100 -c 100

# Test path to specific device
mtr --report --report-cycles 100 <device-ip>
```

---

## Application Performance

### API Response Time

```bash
# Measure endpoint performance
echo "=== API Performance ==="

# Health endpoint
time curl -s http://localhost:8080/health > /dev/null

# Devices endpoint
time curl -s http://localhost:8080/api/v1/devices > /dev/null

# Calls endpoint
time curl -s http://localhost:8080/api/v1/calls/active > /dev/null

# Multiple requests (average)
for i in {1..10}; do
  time curl -s http://localhost:8080/api/v1/devices > /dev/null
done 2>&1 | grep real | awk '{sum+=$2; n++} END {print "Average:", sum/n "s"}'

# Load test (if apache bench installed)
ab -n 1000 -c 10 http://localhost:8080/health
```

### Database Query Performance

```bash
# Slow query analysis
psql -U roip_user -d roip_production -c "
SELECT query,
       calls,
       ROUND(total_time::numeric / 1000, 2) AS total_sec,
       ROUND(mean_time::numeric, 2) AS avg_ms,
       ROUND(max_time::numeric, 2) AS max_ms
FROM pg_stat_statements
ORDER BY total_time DESC
LIMIT 20;"

# Query plan analysis
psql -U roip_user -d roip_production -c "
EXPLAIN ANALYZE
SELECT * FROM devices WHERE status = 'online';"

# Index usage
psql -U roip_user -d roip_production -c "
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;"
```

---

## Call Quality Performance

```bash
#!/bin/bash
# Call quality metrics

echo "=== Call Quality Performance ==="

# Active call quality
echo -e "\nActive Calls:"
curl -s http://localhost:8080/api/v1/calls/active | \
  jq '.[] | {from, to, quality, packet_loss, jitter, latency}'

# Historical call quality (last 100 calls)
echo -e "\nRecent Call Quality Stats:"
psql -U roip_user -d roip_production -c "
SELECT
  COUNT(*) as total_calls,
  ROUND(AVG(quality_score)::numeric, 2) as avg_quality,
  ROUND(AVG(packet_loss_percent)::numeric, 2) as avg_packet_loss,
  ROUND(AVG(jitter_ms)::numeric, 2) as avg_jitter,
  ROUND(AVG(latency_ms)::numeric, 2) as avg_latency
FROM call_logs
WHERE start_time > NOW() - INTERVAL '1 hour';"

# Poor quality calls
echo -e "\nPoor Quality Calls (MOS < 3.5):"
psql -U roip_user -d roip_production -c "
SELECT caller_id, callee_id, quality_score, packet_loss_percent, duration
FROM call_logs
WHERE start_time > NOW() - INTERVAL '1 hour'
  AND quality_score < 3.5
ORDER BY quality_score;
"
```

---

## Performance Monitoring Commands

### System Monitoring

```bash
# Comprehensive system monitor
#!/bin/bash
# Run this in screen/tmux for continuous monitoring

while true; do
  clear
  echo "=== System Performance - $(date) ==="

  # CPU
  echo -e "\nCPU:"
  top -b -n 1 | head -5 | tail -2

  # Memory
  echo -e "\nMemory:"
  free -h | grep -E "Mem:|Swap:"

  # Disk
  echo -e "\nDisk I/O:"
  iostat -x 1 1 | tail -n +4 | head -5

  # Network
  echo -e "\nNetwork Connections:"
  ss -s | head -5

  # RoIP Stats
  echo -e "\nRoIP:"
  echo -n "  Active Calls: "
  curl -s http://localhost:8080/api/v1/calls/active 2>/dev/null | jq 'length'
  echo -n "  Online Devices: "
  curl -s http://localhost:8080/api/v1/devices 2>/dev/null | jq '[.[] | select(.status=="online")] | length'

  sleep 5
done
```

### Performance Baselines

```bash
# Establish performance baselines
#!/bin/bash
# Run during normal operation to establish baseline

BASELINE_FILE=/var/log/roip/performance-baseline.txt

{
  echo "Performance Baseline - $(date)"
  echo "================================"

  echo -e "\nCPU Load:"
  uptime

  echo -e "\nMemory Usage:"
  free -h

  echo -e "\nDisk I/O:"
  iostat -x 1 2 | tail -n +4

  echo -e "\nAPI Response Times:"
  for endpoint in /health /api/v1/devices /api/v1/calls/active; do
    RESPONSE_TIME=$(curl -o /dev/null -s -w '%{time_total}' http://localhost:8080$endpoint)
    echo "  $endpoint: ${RESPONSE_TIME}s"
  done

  echo -e "\nDatabase Query Performance:"
  psql -U roip_user -d roip_production -c "
  SELECT
    ROUND(mean_time::numeric, 2) AS avg_ms
  FROM pg_stat_statements
  WHERE calls > 100
  ORDER BY mean_time DESC
  LIMIT 1;" -t

} > $BASELINE_FILE

echo "Baseline saved to $BASELINE_FILE"
```

---

## Performance Optimization

### Quick Wins

```bash
# 1. Clear system caches
sync; echo 3 | sudo tee /proc/sys/vm/drop_caches

# 2. Vacuum database
psql -U roip_user -d roip_production -c "VACUUM ANALYZE;"

# 3. Restart application (clears memory leaks)
sudo systemctl restart roip-server

# 4. Check and kill zombie processes
ps aux | grep defunct
# Kill parent process if found

# 5. Optimize swap usage
sudo sysctl vm.swappiness=10
```

### Long-term Optimization

See [../docs/PERFORMANCE_TUNING.md](/home/user/MMDVM/docs/PERFORMANCE_TUNING.md) for comprehensive tuning guide.

---

## Performance Testing Tools

### Load Testing

```bash
# Apache Bench
ab -n 10000 -c 100 http://localhost:8080/api/v1/devices

# wrk (HTTP benchmarking)
wrk -t4 -c100 -d30s http://localhost:8080/api/v1/devices

# Custom load test
#!/bin/bash
# Simulate device registrations
for i in {1..1000}; do
  curl -X POST http://localhost:8080/api/v1/devices \
    -H "Content-Type: application/json" \
    -d "{\"device_id\":\"test_$i\"}" &
done
wait
```

### Profiling

```bash
# Node.js CPU profiling
node --prof /opt/roip-server/src/server.js

# After collecting data
node --prof-process isolate-*.log > cpu-profile.txt

# Memory profiling (heap snapshot)
kill -USR2 $(pgrep -f roip-server)
# Analyze snapshot in Chrome DevTools
```

---

## Related Documentation

- [COMMON_ISSUES.md](COMMON_ISSUES.md)
- [LOG_ANALYSIS.md](LOG_ANALYSIS.md)
- [CALL_QUALITY_ISSUES.md](../runbooks/CALL_QUALITY_ISSUES.md)
- [PERFORMANCE_TUNING.md](../PERFORMANCE_TUNING.md)

---

**Document Version**: 1.0
**Last Updated**: 2025-11-22
**Next Review**: 2026-02-22
