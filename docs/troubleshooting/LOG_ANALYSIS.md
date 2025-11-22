# Log Analysis Guide
## ESP32 RoIP Production System

**Version**: 1.0
**Last Updated**: 2025-11-22

---

## Log Locations

| Log Type | Location | Format | Rotation |
|----------|----------|--------|----------|
| Application | `/var/log/roip-server/roip-server.log` | JSON | Daily |
| System (journald) | `journalctl -u roip-server` | Text | 30 days |
| PostgreSQL | `/var/log/postgresql/postgresql-*-main.log` | CSV | Weekly |
| Nginx Access | `/var/log/nginx/access.log` | Common | Daily |
| Nginx Error | `/var/log/nginx/error.log` | Text | Daily |
| System | `/var/log/syslog` | Text | Weekly |
| Auth | `/var/log/auth.log` | Text | Weekly |

---

## Quick Log Queries

### Application Logs

```bash
# Recent errors (last 100 lines)
sudo journalctl -u roip-server -n 100 -p err

# Errors in last hour
sudo journalctl -u roip-server --since "1 hour ago" -p err

# Follow logs in real-time
sudo journalctl -u roip-server -f

# Specific time range
sudo journalctl -u roip-server --since "2025-11-22 14:00" --until "2025-11-22 15:00"

# JSON format logs (if using structured logging)
cat /var/log/roip-server/roip-server.log | jq 'select(.level=="error")'

# Count errors by type
sudo journalctl -u roip-server --since "24 hours ago" | \
  grep ERROR | awk '{print $NF}' | sort | uniq -c | sort -rn
```

### Database Logs

```bash
# Recent errors
sudo tail -100 /var/log/postgresql/postgresql-*-main.log | grep ERROR

# Slow queries (>1 second)
sudo grep "duration:" /var/log/postgresql/postgresql-*-main.log | \
  awk -F'duration: ' '{print $2}' | awk '{if($1>1000) print}' | sort -rn

# Connection errors
sudo grep "connection" /var/log/postgresql/postgresql-*-main.log | grep -i "error\|failed"

# Specific user activity
sudo grep "user=roip_user" /var/log/postgresql/postgresql-*-main.log | tail -50
```

### System Logs

```bash
# OOM killer events
sudo dmesg | grep -i "out of memory\|oom"

# Kernel errors
sudo dmesg | grep -i "error\|fail" | tail -50

# Security events (failed logins)
sudo grep "Failed password" /var/log/auth.log | tail -20

# Sudo usage
sudo grep "sudo:" /var/log/auth.log | tail -50
```

---

## Log Analysis Techniques

### 1. Error Pattern Recognition

```bash
#!/bin/bash
# Identify common error patterns

# Extract error messages
sudo journalctl -u roip-server --since "24 hours ago" | \
  grep -i "error" | \
  sed 's/.*ERROR/ERROR/' | \
  sort | uniq -c | sort -rn > /tmp/error-patterns.txt

# Analyze patterns
cat /tmp/error-patterns.txt

# Look for:
# - Recurring errors (same error many times)
# - Error spikes (many errors in short time)
# - New error types (not seen before)
```

### 2. Performance Analysis

```bash
# API response time analysis
cat /var/log/nginx/access.log | \
  awk '{print $NF}' | \
  sort -n | \
  awk '{
    sum+=$1;
    sumsq+=$1*$1;
    count++
  } END {
    print "Count:", count;
    print "Mean:", sum/count;
    print "StdDev:", sqrt(sumsq/count - (sum/count)^2);
    print "Min:", $1;
    print "Max:", $1
  }'

# Database query duration analysis
sudo grep "duration:" /var/log/postgresql/postgresql-*-main.log | \
  awk -F'duration: ' '{print $2}' | \
  awk '{print $1}' | \
  sort -n | \
  awk '{
    if(NR==1) min=$1;
    if($1>max) max=$1;
    sum+=$1;
    count++
  } END {
    print "Queries:", count;
    print "Min:", min, "ms";
    print "Max:", max, "ms";
    print "Avg:", sum/count, "ms"
  }'
```

### 3. Timeline Reconstruction

```bash
#!/bin/bash
# Reconstruct event timeline for incident

START_TIME="2025-11-22 14:00:00"
END_TIME="2025-11-22 15:00:00"

echo "=== Incident Timeline: $START_TIME to $END_TIME ==="

# Application events
echo -e "\n--- Application Events ---"
sudo journalctl -u roip-server --since "$START_TIME" --until "$END_TIME" | \
  grep -i "error\|warn\|critical" | head -50

# Database events
echo -e "\n--- Database Events ---"
sudo grep -A 2 -B 2 "$(date -d "$START_TIME" +%Y-%m-%d)" \
  /var/log/postgresql/postgresql-*-main.log | \
  grep -i "error\|fatal" | head -20

# System events
echo -e "\n--- System Events ---"
sudo journalctl --since "$START_TIME" --until "$END_TIME" -p err | head -20

# Network events
echo -e "\n--- Network Connections ---"
# Capture connection count over time (if monitoring data available)
```

### 4. Correlation Analysis

```bash
#!/bin/bash
# Correlate errors with system metrics

# Get error timestamps
error_times=$(sudo journalctl -u roip-server --since "1 hour ago" -p err --output=short-unix | awk '{print $1}')

# For each error time, check system state
for timestamp in $error_times; do
  datetime=$(date -d "@$timestamp" '+%Y-%m-%d %H:%M:%S')
  echo "=== Error at $datetime ==="

  # CPU load at that time (from sar if available)
  # sar -u -s $(date -d "@$timestamp" '+%H:%M:%S') | head -5

  # Memory usage
  # Check if we have historic memory data

  # Active connections
  # Check connection logs

  echo ""
done
```

---

## Common Log Patterns

### Normal Operations

```
[INFO] [2025-11-22 14:00:00] Server started on port 8080
[INFO] [2025-11-22 14:00:01] Database connection established
[INFO] [2025-11-22 14:00:05] Device esp32_001 registered
[INFO] [2025-11-22 14:00:10] Call initiated: esp32_001 -> esp32_002
[INFO] [2025-11-22 14:02:15] Call ended: duration=125s quality=4.2
```

### Warning Signs

```
[WARN] [2025-11-22 14:00:00] High memory usage: 85%
[WARN] [2025-11-22 14:00:10] Connection pool at 80% capacity
[WARN] [2025-11-22 14:00:20] Slow query detected: 2.5s
[WARN] [2025-11-22 14:00:30] Packet loss detected: 3.5%
```

### Critical Errors

```
[ERROR] [2025-11-22 14:00:00] Database connection failed: ECONNREFUSED
[ERROR] [2025-11-22 14:00:05] Uncaught exception: Cannot read property 'id' of undefined
[FATAL] [2025-11-22 14:00:10] Out of memory: Cannot allocate
[CRITICAL] [2025-11-22 14:00:15] Security: Unauthorized access attempt from 1.2.3.4
```

---

## Automated Log Analysis Scripts

### Daily Error Summary

```bash
#!/bin/bash
# /opt/roip/scripts/daily-error-summary.sh

DATE=$(date +%Y-%m-%d)

echo "=== Daily Error Summary - $DATE ==="

# Application errors by severity
echo -e "\nApplication Errors:"
sudo journalctl -u roip-server --since "24 hours ago" | \
  grep -E "ERROR|WARN|FATAL" | \
  awk '{print $5}' | sort | uniq -c | sort -rn

# Database errors
echo -e "\nDatabase Errors:"
sudo grep "ERROR" /var/log/postgresql/postgresql-*-main.log | \
  grep "$(date +%Y-%m-%d)" | wc -l

# Failed authentication
echo -e "\nFailed Login Attempts:"
sudo grep "Failed password" /var/log/auth.log | \
  grep "$(date +%b\ %d)" | wc -l

# Top error messages
echo -e "\nTop 5 Error Messages:"
sudo journalctl -u roip-server --since "24 hours ago" | \
  grep ERROR | \
  sed 's/.*ERROR //' | \
  sort | uniq -c | sort -rn | head -5

# Email report
mail -s "RoIP Daily Error Summary - $DATE" ops@example.com <<EOF
$(cat /tmp/error-summary.txt)
EOF
```

### Real-time Error Monitor

```bash
#!/bin/bash
# Monitor for critical errors in real-time

sudo journalctl -u roip-server -f | while read line; do
  # Check for critical keywords
  if echo "$line" | grep -qi "fatal\|critical\|out of memory"; then
    # Alert
    echo "CRITICAL ERROR DETECTED: $line" | \
      mail -s "ALERT: Critical Error" oncall@example.com

    # Log to separate critical log
    echo "$(date): $line" >> /var/log/roip/critical-errors.log
  fi

  # Check for high error rate
  error_count=$(sudo journalctl -u roip-server --since "5 minutes ago" | grep -c ERROR)
  if [ $error_count -gt 50 ]; then
    echo "HIGH ERROR RATE: $error_count errors in last 5 minutes" | \
      mail -s "ALERT: High Error Rate" oncall@example.com
  fi
done
```

### Log Anomaly Detection

```bash
#!/bin/bash
# Detect anomalies in log patterns

# Baseline: Get average error count per hour
BASELINE=$(sudo journalctl -u roip-server --since "7 days ago" | \
  grep ERROR | wc -l | awk '{print $1/168}')  # 168 hours in 7 days

# Current: Get error count in last hour
CURRENT=$(sudo journalctl -u roip-server --since "1 hour ago" | grep ERROR | wc -l)

# Alert if current > 3x baseline
THRESHOLD=$(echo "$BASELINE * 3" | bc)

if (( $(echo "$CURRENT > $THRESHOLD" | bc -l) )); then
  echo "ANOMALY DETECTED: $CURRENT errors in last hour (baseline: $BASELINE/hour)" | \
    mail -s "ALERT: Log Anomaly Detected" ops@example.com
fi
```

---

## Log Aggregation (ELK/Loki)

### Elasticsearch Queries

```bash
# If using ELK stack

# Errors in last hour
curl -X GET "localhost:9200/roip-logs-*/_search?pretty" -H 'Content-Type: application/json' -d'
{
  "query": {
    "bool": {
      "must": [
        { "match": { "level": "error" }},
        { "range": { "@timestamp": { "gte": "now-1h" }}}
      ]
    }
  }
}'

# Aggregate errors by type
curl -X GET "localhost:9200/roip-logs-*/_search?pretty" -H 'Content-Type: application/json' -d'
{
  "size": 0,
  "aggs": {
    "error_types": {
      "terms": { "field": "message.keyword", "size": 10 }
    }
  },
  "query": {
    "match": { "level": "error" }
  }
}'
```

### Grafana Loki Queries

```logql
# Errors in last hour
{job="roip-server"} |= "ERROR" | json | line_format "{{.message}}"

# Error rate
rate({job="roip-server"} |= "ERROR" [5m])

# Specific error pattern
{job="roip-server"} |= "database" |= "connection" |= "failed"

# Top errors
topk(10, sum by (error) (count_over_time({job="roip-server"} |= "ERROR" [1h])))
```

---

## Log Retention Policy

| Log Type | Retention | Archive Location | Cleanup Script |
|----------|-----------|------------------|----------------|
| Application (journald) | 30 days | N/A (pruned) | `journalctl --vacuum-time=30d` |
| Application (files) | 90 days | S3 | `/opt/roip/scripts/archive-logs.sh` |
| Database | 90 days | S3 | `find ... -mtime +90 -delete` |
| Nginx | 30 days | S3 | Logrotate |
| System | 30 days | N/A | Logrotate |
| Security | 365 days | S3 (encrypted) | Manual |

### Log Archival Script

```bash
#!/bin/bash
# /opt/roip/scripts/archive-logs.sh

DATE=$(date -d "90 days ago" +%Y%m%d)
ARCHIVE_DIR=/var/log/roip/archive
S3_BUCKET=s3://roip-logs/archive

# Create archive
mkdir -p $ARCHIVE_DIR
tar -czf $ARCHIVE_DIR/logs-before-$DATE.tar.gz \
  --exclude='*.gz' \
  --exclude='archive' \
  $(find /var/log/roip -type f -mtime +90)

# Upload to S3
aws s3 cp $ARCHIVE_DIR/logs-before-$DATE.tar.gz $S3_BUCKET/

# Remove old logs
find /var/log/roip -type f -mtime +90 ! -name "*.gz" -delete

# Keep archives for 30 days locally
find $ARCHIVE_DIR -name "*.tar.gz" -mtime +30 -delete
```

---

## Troubleshooting with Logs

### Scenario: Service Crash

```bash
# 1. Find crash time
sudo journalctl -u roip-server | grep -i "stopped\|failed" | tail -5

# 2. Get logs before crash
CRASH_TIME="2025-11-22 14:35:00"
sudo journalctl -u roip-server --since "$CRASH_TIME - 5 minutes" --until "$CRASH_TIME"

# 3. Look for errors/warnings
sudo journalctl -u roip-server --since "$CRASH_TIME - 5 minutes" --until "$CRASH_TIME" | \
  grep -i "error\|warn\|exception"

# 4. Check system resources at crash time
sudo journalctl --since "$CRASH_TIME - 5 minutes" --until "$CRASH_TIME" | \
  grep -i "oom\|memory\|cpu"
```

### Scenario: Slow Performance

```bash
# 1. Check slow query log
sudo grep "duration:" /var/log/postgresql/postgresql-*-main.log | \
  awk -F'duration: ' '{if($2+0>1000) print}' | tail -20

# 2. Check high response times in nginx
awk '{if($NF>1000) print}' /var/log/nginx/access.log | tail -20

# 3. Correlate with application logs
# Look for processing delays
sudo journalctl -u roip-server | grep -i "processing.*[0-9]*ms" | \
  awk '{if($NF>500) print}' | tail -20
```

### Scenario: Security Incident

```bash
# 1. Check failed login attempts
sudo grep "Failed password" /var/log/auth.log | \
  awk '{print $11}' | sort | uniq -c | sort -rn

# 2. Check unauthorized API access
cat /var/log/roip-server/roip-server.log | jq 'select(.status==401 or .status==403)'

# 3. Check unusual database queries
sudo grep "SELECT\|DROP\|DELETE" /var/log/postgresql/postgresql-*-main.log | \
  grep -v "roip_user" | tail -50

# 4. Check sudo usage
sudo grep "sudo:" /var/log/auth.log | grep -v "$(whoami)" | tail -20
```

---

## Best Practices

1. **Always timestamp your searches** - Use `--since` and `--until`
2. **Use grep wisely** - Chain greps for better filtering
3. **Save important logs** - Copy logs before they rotate
4. **Use structured logging** - JSON logs are easier to parse
5. **Monitor in real-time** - Use `-f` flag for tailing
6. **Aggregate and centralize** - Use ELK or Loki for production
7. **Set up alerts** - Don't rely on manual log checking
8. **Regular cleanup** - Implement log rotation and archival

---

## Related Documentation

- [COMMON_ISSUES.md](COMMON_ISSUES.md)
- [PERFORMANCE_DEBUG.md](PERFORMANCE_DEBUG.md)
- [SECURITY_INCIDENT.md](../runbooks/SECURITY_INCIDENT.md)

---

**Document Version**: 1.0
**Last Updated**: 2025-11-22
**Next Review**: 2026-02-22
