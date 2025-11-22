# Monthly Review Procedures
## ESP32 RoIP Production System

**Version**: 1.0
**Schedule**: First Sunday of each month, 02:00-06:00 UTC
**Time Required**: 3-4 hours
**Risk Level**: Medium (may include service restarts)

---

## Monthly Review Objectives

1. Comprehensive system health assessment
2. Capacity planning and forecasting
3. Security posture review
4. Performance optimization
5. Documentation updates
6. Disaster recovery validation

---

## Part 1: System Health Assessment (60 minutes)

### 1.1 Service Availability Review

```bash
# Calculate monthly uptime
MONTH=$(date +%Y-%m)

# System uptime statistics
uptime

# Service restart count
sudo journalctl --since "$(date -d '1 month ago' +%Y-%m-%d)" | \
  grep "roip-server.*Started\|Started.*roip-server" | wc -l

# Calculate availability (target: 99.9%)
# Uptime = (Total Time - Downtime) / Total Time * 100
```

### 1.2 Incident Review

```bash
# Review all incidents from past month
grep "$(date -d '1 month ago' +%Y-%m)" /var/log/roip/incidents.log

# Categorize incidents
# - P0 (Critical): ____
# - P1 (High): ____
# - P2 (Medium): ____
# - P3 (Low): ____

# Calculate MTTR (Mean Time To Recovery)
# Average time from incident detection to resolution

# Calculate MTBF (Mean Time Between Failures)
# Average time between incidents
```

### 1.3 Performance Baseline

```bash
# Collect monthly performance metrics

# API Response Times (from Prometheus)
curl -s 'http://localhost:9090/api/v1/query?query=http_request_duration_seconds{quantile="0.95"}' | \
  jq '.data.result[0].value[1]'

# Database Query Performance
psql -U roip_user -d roip_production -c "
SELECT query,
       calls,
       ROUND(mean_time::numeric, 2) as avg_ms,
       ROUND((total_time / 1000)::numeric, 2) as total_sec
FROM pg_stat_statements
WHERE calls > 1000
ORDER BY total_time DESC
LIMIT 20;"

# System Resource Utilization (monthly average)
# CPU, Memory, Disk I/O, Network
```

---

## Part 2: Capacity Planning (45 minutes)

### 2.1 Growth Analysis

```bash
#!/bin/bash
# Analyze growth trends

# Device growth
echo "=== Device Registration Trend ==="
psql -U roip_user -d roip_production -c "
SELECT
  DATE_TRUNC('month', created_at) as month,
  COUNT(*) as new_devices
FROM devices
WHERE created_at >= NOW() - INTERVAL '12 months'
GROUP BY month
ORDER BY month;"

# Call volume growth
echo "=== Call Volume Trend ==="
psql -U roip_user -d roip_production -c "
SELECT
  DATE_TRUNC('month', start_time) as month,
  COUNT(*) as total_calls,
  ROUND(AVG(duration)::numeric, 2) as avg_duration_sec,
  MAX(concurrent_calls) as peak_concurrent
FROM call_logs
WHERE start_time >= NOW() - INTERVAL '12 months'
GROUP BY month
ORDER BY month;"

# Database size growth
echo "=== Database Growth ==="
psql -U roip_user -d roip_production -c "
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
  n_live_tup as row_count
FROM pg_tables
LEFT JOIN pg_stat_user_tables USING (schemaname, tablename)
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;"
```

### 2.2 Capacity Forecast

```bash
# Calculate current capacity usage
CURRENT_DEVICES=$(curl -s http://localhost:8080/api/v1/devices | jq 'length')
MAX_DEVICES=1000  # Configured maximum

DEVICE_UTILIZATION=$((CURRENT_DEVICES * 100 / MAX_DEVICES))
echo "Device Capacity: ${DEVICE_UTILIZATION}%"

# Forecast when capacity will be reached
# Based on monthly growth rate
# If >80% utilization: Plan for scaling

# Check resource limits
echo "=== Resource Capacity ==="
echo "CPU Cores: $(nproc)"
echo "Total Memory: $(free -h | awk 'NR==2{print $2}')"
echo "Total Disk: $(df -h / | awk 'NR==2{print $2}')"
echo "Used Disk: $(df -h / | awk 'NR==2{print $3" ("$5")"}')"

# Database connection capacity
psql -U roip_user -d roip_production -c "
SELECT
  (SELECT count(*) FROM pg_stat_activity) as current_connections,
  (SELECT setting::int FROM pg_settings WHERE name='max_connections') as max_connections,
  ROUND(100.0 * (SELECT count(*) FROM pg_stat_activity) /
        (SELECT setting::int FROM pg_settings WHERE name='max_connections'), 2) as utilization_pct;"
```

### 2.3 Scaling Recommendations

Based on capacity analysis, document recommendations:

```
SCALING RECOMMENDATIONS
=======================

Current Status:
- Device Capacity: ____%
- CPU Usage (avg): ____%
- Memory Usage (avg): ____%
- Disk Usage: ____%

Recommendations:
[ ] No action needed (capacity >30% available)
[ ] Monitor closely (capacity 20-30% available)
[ ] Plan scaling (capacity 10-20% available)
[ ] Scale immediately (capacity <10% available)

Proposed Actions:
1. [Vertical scaling: Increase RAM to X GB]
2. [Horizontal scaling: Add X application servers]
3. [Database optimization: Add indexes, partition tables]
4. [Storage expansion: Add X GB disk]

Timeline: [Date]
Owner: [Name]
```

---

## Part 3: Security Review (60 minutes)

### 3.1 Comprehensive Security Scan

```bash
# Update security tools
sudo apt update
sudo freshclam
sudo rkhunter --update

# Full system audit
sudo lynis audit system --quiet --report-file /tmp/lynis-report-$(date +%Y%m).txt

# Vulnerability scan
sudo nmap -sV -O localhost > /tmp/vuln-scan-$(date +%Y%m).txt

# Check for outdated packages
apt list --upgradable > /tmp/packages-outdated-$(date +%Y%m).txt

# Review security scan results
cat /tmp/lynis-report-$(date +%Y%m).txt | grep -i "warning\|suggestion"
```

### 3.2 Access Audit

```bash
# Review all user accounts
echo "=== User Account Audit ==="
cut -d: -f1,3,4,6,7 /etc/passwd | awk -F: '$2>=1000 || $2==0 {print $0}'

# Check for inactive accounts (no login in 90 days)
for user in $(cut -d: -f1 /etc/passwd); do
  last_login=$(last -1 $user | head -1 | awk '{print $4, $5, $6}')
  if [ ! -z "$last_login" ]; then
    echo "$user: $last_login"
  fi
done

# Review sudo access
sudo grep -E '^sudo|^admin' /etc/group

# Review SSH keys
for home in /home/*; do
  if [ -f $home/.ssh/authorized_keys ]; then
    echo "=== $home ==="
    cat $home/.ssh/authorized_keys
  fi
done

# Review API tokens
psql -U roip_user -d roip_production -c "
SELECT
  t.id,
  t.username,
  t.created_at,
  t.last_used,
  t.expires_at,
  CASE
    WHEN t.expires_at < NOW() THEN 'EXPIRED'
    WHEN t.last_used < NOW() - INTERVAL '90 days' THEN 'INACTIVE'
    ELSE 'ACTIVE'
  END as status
FROM api_tokens t
WHERE t.active = true
ORDER BY t.last_used DESC;"

# Revoke expired/inactive tokens
psql -U roip_user -d roip_production -c "
UPDATE api_tokens
SET active = false
WHERE expires_at < NOW()
   OR (last_used < NOW() - INTERVAL '180 days');"
```

### 3.3 Security Compliance Check

```bash
# Check firewall status
sudo ufw status verbose

# Check fail2ban
sudo fail2ban-client status
sudo fail2ban-client status sshd

# Check SSL/TLS configuration
sslscan roip.example.com

# Check certificate expiry
sudo certbot certificates

# Review security logs
sudo grep -i "failed\|failure\|error" /var/log/auth.log | tail -50

# Check for brute force attempts
sudo lastb | head -50
```

---

## Part 4: Performance Optimization (45 minutes)

### 4.1 Database Optimization

```bash
# Full VACUUM (requires maintenance window)
# WARNING: Locks tables, run during low-traffic period
psql -U roip_user -d roip_production -c "VACUUM FULL ANALYZE;"

# Rebuild all indexes
psql -U roip_user -d roip_production -c "REINDEX DATABASE roip_production;"

# Update query planner statistics
psql -U roip_user -d roip_production -c "ANALYZE;"

# Check for missing indexes
psql -U roip_user -d roip_production -c "
SELECT
  schemaname,
  tablename,
  attname,
  n_distinct,
  correlation
FROM pg_stats
WHERE schemaname = 'public'
  AND n_distinct > 1000
  AND abs(correlation) < 0.1
ORDER BY n_distinct DESC;"

# Review and add indexes if needed
# CREATE INDEX CONCURRENTLY idx_name ON table(column);
```

### 4.2 System Optimization

```bash
# Clear system caches
sync
echo 3 | sudo tee /proc/sys/vm/drop_caches

# Check for zombie processes
ps aux | grep defunct

# Review and kill long-running processes
ps -eo pid,user,lstart,etime,cmd | grep -v "0-00:00" | sort -k4 -r

# Check swap usage (should be minimal)
free -h
swapon --show

# Review system logs for errors
sudo dmesg | grep -i "error\|fail\|warn" | tail -50
```

### 4.3 Application Performance Tuning

```bash
# Review Node.js heap usage
# Add to monitoring if not already tracked

# Check for memory leaks
ps aux --sort=-%mem | head -10

# Review connection pool usage
psql -U roip_user -d roip_production -c "
SELECT
  count(*) as active_connections,
  state,
  wait_event_type
FROM pg_stat_activity
GROUP BY state, wait_event_type;"

# Tune if needed:
# - Increase/decrease connection pool size
# - Adjust timeout values
# - Enable/disable query caching
```

---

## Part 5: Disaster Recovery Validation (60 minutes)

### 5.1 Backup Verification

```bash
# Verify all backup types exist
ls -lh /var/backups/roip/database/ | head -20
aws s3 ls s3://roip-backups/ --recursive | tail -20

# Test database restore (full procedure)
# Create test database
createdb -U roip_user roip_test_restore

# Restore latest backup
LATEST_BACKUP=$(ls -t /var/backups/roip/database/*.dump | head -1)
pg_restore -U roip_user -d roip_test_restore $LATEST_BACKUP

# Verify data integrity
psql -U roip_user -d roip_test_restore -c "SELECT count(*) FROM devices;"
psql -U roip_user -d roip_test_restore -c "SELECT count(*) FROM call_logs;"
psql -U roip_user -d roip_test_restore -c "SELECT MAX(created_at) FROM devices;"

# Cleanup
dropdb -U roip_user roip_test_restore

# Document restore test
echo "$(date): Full backup restore test - SUCCESS" >> /var/log/roip/dr-tests.log
```

### 5.2 DR Site Readiness

```bash
# Verify DR site is accessible
ssh dr-server.example.com uptime

# Check DR database replication (if HA)
psql -U roip_user -h dr-server.example.com -d roip_production -c "
SELECT pg_is_in_recovery();"

# Check replication lag
psql -U roip_user -h dr-server.example.com -d roip_production -c "
SELECT now() - pg_last_xact_replay_timestamp() AS replication_lag;"

# Verify DR site configuration
ssh dr-server.example.com "cd /opt/roip && git status"

# Test DR site services
ssh dr-server.example.com "systemctl status roip-server postgresql"
```

### 5.3 Failover Test (Quarterly, not monthly)

**Only perform full failover test quarterly**

See [DR_PLAN.md](../disaster-recovery/DR_PLAN.md) for complete procedure.

---

## Part 6: Documentation Review (30 minutes)

### 6.1 Update Runbooks

Review and update all runbooks:

- [ ] [INCIDENT_RESPONSE.md](../runbooks/INCIDENT_RESPONSE.md)
- [ ] [SERVER_DOWNTIME.md](../runbooks/SERVER_DOWNTIME.md)
- [ ] [DATABASE_FAILURE.md](../runbooks/DATABASE_FAILURE.md)
- [ ] [CALL_QUALITY_ISSUES.md](../runbooks/CALL_QUALITY_ISSUES.md)
- [ ] [SECURITY_INCIDENT.md](../runbooks/SECURITY_INCIDENT.md)
- [ ] [DR_PLAN.md](../disaster-recovery/DR_PLAN.md)

Update based on:
- Incidents encountered this month
- New procedures discovered
- Changed configurations
- Lessons learned

### 6.2 Update Contact Information

```bash
# Verify on-call rotation is current
# Update contact lists in all runbooks
# Verify escalation paths are correct
# Update PagerDuty schedules
```

### 6.3 Configuration Backup

```bash
# Backup all configuration files
sudo tar -czf /var/backups/roip/config/config-backup-$(date +%Y%m%d).tar.gz \
  /opt/roip-server/.env \
  /opt/roip-server/config/ \
  /etc/nginx/ \
  /etc/postgresql/ \
  /etc/systemd/system/roip*.service

# Upload to S3
aws s3 cp /var/backups/roip/config/config-backup-$(date +%Y%m%d).tar.gz \
  s3://roip-backups/config/
```

---

## Part 7: Monthly Report Generation (30 minutes)

```bash
#!/bin/bash
# Generate comprehensive monthly report

MONTH=$(date -d "last month" +%Y-%m)
MONTH_NAME=$(date -d "last month" +"%B %Y")

cat > /tmp/monthly-report-$MONTH.md <<EOF
# RoIP System - Monthly Operations Report
## $MONTH_NAME

---

## Executive Summary

**System Uptime**: [Calculate]%
**Total Incidents**: [Count]
**Average Call Quality**: [MOS Score]
**Total Calls**: [Count]
**New Devices**: [Count]

---

## Service Availability

### Uptime Statistics
- Target: 99.9%
- Actual: [X]%
- Downtime: [X] minutes
- Incidents causing downtime: [X]

### Incident Summary
| Severity | Count | MTTR (avg) |
|----------|-------|------------|
| P0       | [X]   | [X] min    |
| P1       | [X]   | [X] min    |
| P2       | [X]   | [X] min    |
| P3       | [X]   | [X] min    |

---

## Performance Metrics

### Call Statistics
- Total Calls: $(psql -U roip_user -d roip_production -t -c "
  SELECT count(*) FROM call_logs
  WHERE start_time >= '$MONTH-01'::date
    AND start_time < date_trunc('month', '$MONTH-01'::date) + interval '1 month';")

- Average Call Duration: $(psql -U roip_user -d roip_production -t -c "
  SELECT ROUND(AVG(duration)::numeric, 2)
  FROM call_logs
  WHERE start_time >= '$MONTH-01'::date
    AND start_time < date_trunc('month', '$MONTH-01'::date) + interval '1 month';") seconds

- Average Call Quality (MOS): $(psql -U roip_user -d roip_production -t -c "
  SELECT ROUND(AVG(quality_score)::numeric, 2)
  FROM call_logs
  WHERE start_time >= '$MONTH-01'::date
    AND start_time < date_trunc('month', '$MONTH-01'::date) + interval '1 month';")

### System Performance
- Average CPU Usage: [From monitoring]
- Average Memory Usage: [From monitoring]
- Average API Response Time (P95): [From Prometheus] ms
- Database Query Performance: [From pg_stat_statements]

---

## Capacity and Growth

### Current Capacity
- Registered Devices: [X] / [MAX] ([X]% utilization)
- Peak Concurrent Calls: [X]
- Database Size: $(psql -U roip_user -d roip_production -t -c "SELECT pg_size_pretty(pg_database_size('roip_production'));")
- Disk Usage: $(df -h / | awk 'NR==2 {print $5}')

### Growth Trends
- Device Growth Rate: [X]% MoM
- Call Volume Growth: [X]% MoM
- Database Growth: [X]MB/month

### Capacity Forecast
- Estimated time to capacity: [X] months
- Recommended scaling actions: [List]

---

## Security Posture

### Security Events
- Failed Login Attempts: [Count]
- Blocked IPs (fail2ban): [Count]
- Security Scans Performed: [Count]
- Vulnerabilities Found: [Count]
- Vulnerabilities Remediated: [Count]

### Compliance
- All systems patched: [Yes/No]
- SSL certificates valid: [Yes/No]
- Backup tests passed: [Yes/No]
- DR test passed: [Yes/No]

---

## Maintenance Completed

### Regular Maintenance
- Weekly maintenance sessions: 4/4 completed
- Database optimization: Completed
- Log rotation: Completed
- Security scans: Completed

### Updates Applied
- System packages updated: [List major updates]
- Application version: [Version]
- Database version: [Version]

---

## Issues and Resolutions

### Top Issues This Month
1. [Issue description] - Resolved: [How]
2. [Issue description] - Resolved: [How]
3. [Issue description] - Resolved: [How]

### Open Issues
1. [Issue description] - Status: [In Progress/Planned]
2. [Issue description] - Status: [In Progress/Planned]

---

## Improvements Implemented

1. [Improvement 1]
2. [Improvement 2]
3. [Improvement 3]

---

## Action Items for Next Month

### High Priority
- [ ] [Action item 1]
- [ ] [Action item 2]

### Medium Priority
- [ ] [Action item 1]
- [ ] [Action item 2]

### Planning
- [ ] [Future improvement 1]
- [ ] [Future improvement 2]

---

## Recommendations

[Any strategic recommendations for management]

---

**Report Generated**: $(date)
**Prepared By**: Operations Team
**Next Report**: $(date -d "+1 month" +%Y-%m-01)
EOF

cat /tmp/monthly-report-$MONTH.md

# Convert to PDF if needed
# pandoc /tmp/monthly-report-$MONTH.md -o /tmp/monthly-report-$MONTH.pdf

# Email to stakeholders
mail -s "RoIP Monthly Operations Report - $MONTH_NAME" \
  -a /tmp/monthly-report-$MONTH.md \
  management@example.com ops@example.com
```

---

## Post-Review Checklist

- [ ] All health checks passing
- [ ] Performance improvements documented
- [ ] Capacity forecast updated
- [ ] Security posture improved
- [ ] Documentation updated
- [ ] Monthly report distributed
- [ ] Action items assigned and tracked

---

## Related Documentation

- [DAILY_OPERATIONS.md](DAILY_OPERATIONS.md)
- [WEEKLY_MAINTENANCE.md](WEEKLY_MAINTENANCE.md)
- [DR_PLAN.md](../disaster-recovery/DR_PLAN.md)

---

**Document Version**: 1.0
**Last Updated**: 2025-11-22
**Next Review**: 2026-02-22
