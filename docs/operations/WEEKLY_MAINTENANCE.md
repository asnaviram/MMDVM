# Weekly Maintenance Procedures
## ESP32 RoIP Production System

**Version**: 1.0
**Schedule**: Every Sunday 02:00-04:00 UTC
**Time Required**: 1-2 hours
**Risk Level**: Low (non-disruptive operations)

---

## Pre-Maintenance Checklist

- [ ] Verify backup completed successfully
- [ ] Review current system status (all services healthy)
- [ ] Check no critical issues reported
- [ ] Notify team in #operations channel
- [ ] Verify low traffic period (check active calls)

---

## Week 1: System Updates and Database Maintenance

### 1. System Package Updates (20 minutes)

```bash
# Update package lists
sudo apt update

# List available updates
apt list --upgradable > /tmp/updates-available.txt

# Review updates (check for major version changes)
cat /tmp/updates-available.txt

# Apply security updates
sudo unattended-upgrade --dry-run
sudo unattended-upgrade

# Apply all updates (test environment first!)
sudo apt upgrade -y

# If kernel updated, schedule reboot
uname -r  # Note current kernel
sudo shutdown -r +60 "System reboot for kernel update in 60 minutes"
# Cancel if needed: sudo shutdown -c
```

### 2. Database Vacuum and Optimization (30 minutes)

```bash
# Lightweight VACUUM (can run during operation)
psql -U roip_user -d roip_production -c "VACUUM ANALYZE;"

# Check table bloat
psql -U roip_user -d roip_production -c "
SELECT schemaname, tablename,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
       pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS index_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;"

# Update statistics
psql -U roip_user -d roip_production -c "ANALYZE;"

# Check for missing indexes
psql -U roip_user -d roip_production -c "
SELECT schemaname, tablename, attname, n_distinct, correlation
FROM pg_stats
WHERE schemaname = 'public'
  AND abs(correlation) < 0.1
ORDER BY abs(correlation);
"
```

### 3. Log Rotation and Cleanup (10 minutes)

```bash
# Rotate logs
sudo logrotate -f /etc/logrotate.conf

# Clean old journal logs (keep 30 days)
sudo journalctl --vacuum-time=30d

# Clean old RoIP logs
find /var/log/roip -name "*.log.*" -mtime +30 -delete

# Clean old PostgreSQL logs
find /var/log/postgresql -name "*.log.*" -mtime +30 -delete

# Clean temp files
find /tmp -name "roip-*" -mtime +7 -delete
find /tmp -name "*.dump" -mtime +7 -delete
```

---

## Week 2: Security and Monitoring

### 1. Security Audit (30 minutes)

```bash
# Update security databases
sudo freshclam  # ClamAV virus definitions
sudo rkhunter --update
sudo apt update

# Run security scans
sudo lynis audit system --quiet --quick

# Check for rootkits
sudo rkhunter --check --skip-keypress

# Review fail2ban logs
sudo fail2ban-client status
sudo fail2ban-client status sshd

# Check SSL certificate expiry
sudo certbot certificates

# Review SSH access
sudo lastlog | grep -v "Never logged in"
sudo last | head -20
```

### 2. Monitor Alert Review (20 minutes)

```bash
# Review Prometheus alerts from past week
curl -s http://localhost:9090/api/v1/alerts | jq '.data.alerts[] | select(.state=="firing")'

# Check alert history in Grafana
# Manual review at: https://grafana.roip.example.com/alerting/list

# Document any recurring false positives
# Update alert thresholds if needed
```

### 3. Access Control Review (10 minutes)

```bash
# Review user accounts
cut -d: -f1,3 /etc/passwd | awk -F: '$2>=1000 {print $1}'

# Check for accounts with sudo access
grep -Po '^sudo.+:\K.*$' /etc/group

# Review SSH authorized_keys
for user in $(cut -d: -f1,3 /etc/passwd | awk -F: '$2>=1000 {print $1}'); do
  if [ -f /home/$user/.ssh/authorized_keys ]; then
    echo "=== $user ==="
    cat /home/$user/.ssh/authorized_keys
  fi
done

# Review API tokens (database)
psql -U roip_user -d roip_production -c "
SELECT username, created_at, last_used, expires_at
FROM api_tokens
WHERE active = true
ORDER BY last_used DESC;"
```

---

## Week 3: Performance Tuning

### 1. Performance Metrics Analysis (20 minutes)

```bash
# Database performance
psql -U roip_user -d roip_production -c "
SELECT query, calls, mean_time, max_time, stddev_time
FROM pg_stat_statements
WHERE calls > 100
ORDER BY mean_time * calls DESC
LIMIT 20;"

# Check slow queries
psql -U roip_user -d roip_production -c "
SELECT pid, now() - query_start AS duration, state, query
FROM pg_stat_activity
WHERE state = 'active'
ORDER BY duration DESC;"

# API response time analysis
curl http://localhost:8080/metrics | grep http_request_duration

# System performance
sar -u 1 10  # CPU
sar -r 1 10  # Memory
sar -d 1 10  # Disk I/O
```

### 2. Resource Optimization (15 minutes)

```bash
# Check for memory leaks
ps aux --sort=-%mem | head -10

# Check process count
ps aux | wc -l

# Check open files
lsof | wc -l
cat /proc/sys/fs/file-nr

# Tune PostgreSQL if needed
# Review postgresql.conf settings based on usage

# Optimize Node.js memory if needed
# Update systemd service file if heap size adjustment needed
```

### 3. Disk Usage Analysis (10 minutes)

```bash
# Overall disk usage
df -h

# Find largest directories
du -sh /* | sort -hr | head -10

# Find large log files
find /var/log -type f -size +100M -exec ls -lh {} \;

# Database disk usage
psql -U roip_user -d roip_production -c "
SELECT pg_size_pretty(pg_database_size('roip_production')) AS db_size;"
```

---

## Week 4: Backup and Disaster Recovery

### 1. Backup Verification (30 minutes)

```bash
# List recent backups
ls -lh /var/backups/roip/database/ | head -10

# Verify backup integrity
pg_restore --list /var/backups/roip/database/roip_latest.dump > /dev/null
echo "Backup integrity: $?"

# Test restore to temporary database
createdb -U roip_user roip_test
pg_restore -U roip_user -d roip_test /var/backups/roip/database/roip_latest.dump

# Verify restored data
psql -U roip_user -d roip_test -c "SELECT count(*) FROM devices;"
psql -U roip_user -d roip_test -c "SELECT count(*) FROM call_logs;"

# Clean up test database
dropdb -U roip_user roip_test

# Check S3 backup sync
aws s3 ls s3://roip-backups/database/ --recursive | tail -10
```

### 2. Disaster Recovery Test (30 minutes)

```bash
# Verify DR documentation is current
cat /home/user/MMDVM/docs/disaster-recovery/DR_PLAN.md

# Test DR site access
ssh dr-server.example.com uptime

# Verify DR database replication lag (if HA setup)
psql -U roip_user -h dr-server.example.com -d roip_production -c "
SELECT now() - pg_last_xact_replay_timestamp() AS replication_lag;"

# Document DR test results
echo "$(date): DR test - PASS/FAIL" >> /var/log/roip/dr-tests.log
```

### 3. Backup Rotation (10 minutes)

```bash
# Rotate old backups (keep 90 days)
find /var/backups/roip/database -name "*.dump" -mtime +90 -delete

# Verify backup rotation in S3
aws s3 ls s3://roip-backups/database/ --recursive | wc -l

# Update backup documentation if retention changed
```

---

## All Weeks: Common Tasks

### 1. Certificate Management (5 minutes every week)

```bash
# Check certificate expiry
sudo certbot certificates

# Auto-renew if within 30 days
sudo certbot renew

# Test renewal (dry-run)
sudo certbot renew --dry-run

# Verify certificate is valid
openssl x509 -in /etc/letsencrypt/live/roip.example.com/cert.pem -noout -dates
```

### 2. Service Restart (if needed) (10 minutes)

```bash
# Check uptime
uptime

# Restart services if >30 days uptime (memory leaks)
UPTIME_DAYS=$(awk '{print int($1/86400)}' /proc/uptime)
if [ $UPTIME_DAYS -gt 30 ]; then
  echo "System uptime >30 days, consider restart"
  # Schedule restart during maintenance window
  sudo shutdown -r +60
fi

# Or just restart application
sudo systemctl restart roip-server
```

### 3. Weekly Report Generation (15 minutes)

```bash
#!/bin/bash
# Weekly operations report

WEEK_START=$(date -d "last Sunday" +%Y-%m-%d)
WEEK_END=$(date +%Y-%m-%d)

cat > /tmp/weekly-report.txt <<EOF
=================================================
RoIP System - Weekly Report
Week: $WEEK_START to $WEEK_END
=================================================

SUMMARY
-------
System Uptime: $(uptime -p)
Services Status: All operational
Incidents: [Count from incident tracker]

CALL STATISTICS
---------------
Total Calls (7 days): $(psql -U roip_user -d roip_production -t -c "
  SELECT count(*) FROM call_logs
  WHERE start_time >= '$WEEK_START'::date;")

Average Call Duration: $(psql -U roip_user -d roip_production -t -c "
  SELECT ROUND(AVG(duration)::numeric, 2)
  FROM call_logs
  WHERE start_time >= '$WEEK_START'::date;") seconds

Average Call Quality: $(psql -U roip_user -d roip_production -t -c "
  SELECT ROUND(AVG(quality_score)::numeric, 2)
  FROM call_logs
  WHERE start_time >= '$WEEK_START'::date;")

DEVICE STATISTICS
-----------------
Total Registered Devices: $(curl -s http://localhost:8080/api/v1/devices | jq 'length')
Average Online Devices: $(psql -U roip_user -d roip_production -t -c "
  SELECT ROUND(AVG(online_count)::numeric, 0)
  FROM device_stats
  WHERE date >= '$WEEK_START'::date;")

PERFORMANCE METRICS
-------------------
Average CPU Usage: [From monitoring]
Average Memory Usage: [From monitoring]
Average API Response Time: [From Prometheus]
Peak Concurrent Calls: [From monitoring]

MAINTENANCE COMPLETED
---------------------
$(grep "$(date +%Y-%m)" /var/log/roip/maintenance.log | tail -10)

ISSUES & RESOLUTIONS
--------------------
[Summary of issues and how they were resolved]

CAPACITY PLANNING
-----------------
Database Size: $(psql -U roip_user -d roip_production -t -c "
  SELECT pg_size_pretty(pg_database_size('roip_production'));")

Disk Usage: $(df -h / | awk 'NR==2 {print $5}')

Projected Growth: [Calculate based on trend]

ACTION ITEMS FOR NEXT WEEK
---------------------------
1. [Action item 1]
2. [Action item 2]

=================================================
End of Report
=================================================
EOF

cat /tmp/weekly-report.txt
mail -s "RoIP Weekly Report - $WEEK_END" ops@example.com < /tmp/weekly-report.txt
```

---

## Post-Maintenance Checklist

- [ ] All services running normally
- [ ] Health checks passing
- [ ] No errors in logs
- [ ] Active calls resumed (if paused)
- [ ] Monitoring dashboards show normal metrics
- [ ] Document maintenance completion
- [ ] Update maintenance log

```bash
# Document maintenance completion
echo "$(date): Weekly maintenance completed" >> /var/log/roip/maintenance.log

# Quick health check
curl -s http://localhost:8080/health | jq '.'

# Verify services
systemctl status roip-server postgresql coturn nginx

# Check for errors
sudo journalctl -u roip-server --since "2 hours ago" -p err
```

---

## Troubleshooting

**If services won't start after update**:
```bash
# Check logs
sudo journalctl -u roip-server -n 50

# Rollback if needed
sudo apt install <package>=<previous-version>

# Or restore from snapshot
```

**If database performance degrades**:
```bash
# Analyze slow queries
psql -U roip_user -d roip_production -c "
SELECT query, mean_time, calls
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;"

# Rebuild indexes if needed
REINDEX DATABASE roip_production;
```

---

## Related Documentation

- [DAILY_OPERATIONS.md](DAILY_OPERATIONS.md)
- [MONTHLY_REVIEW.md](MONTHLY_REVIEW.md)
- [DATABASE_FAILURE.md](../runbooks/DATABASE_FAILURE.md)

---

**Document Version**: 1.0
**Last Updated**: 2025-11-22
**Next Review**: 2026-02-22
