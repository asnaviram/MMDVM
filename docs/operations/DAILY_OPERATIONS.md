# Daily Operations Checklist
## ESP32 RoIP Production System

**Version**: 1.0
**Last Updated**: 2025-11-22
**Time Required**: 15-30 minutes per day

---

## Morning Checks (Start of Business Day)

### Time: 09:00 UTC

### 1. Service Health Check (5 minutes)

```bash
#!/bin/bash
# Quick health check script

echo "=== Daily Health Check - $(date) ==="

# Check all services status
echo -e "\n1. Service Status:"
for service in roip-server postgresql coturn nginx; do
  status=$(systemctl is-active $service)
  if [ "$status" = "active" ]; then
    echo "  ✓ $service: Running"
  else
    echo "  ✗ $service: $status (ACTION REQUIRED!)"
  fi
done

# Check HTTP endpoints
echo -e "\n2. HTTP Health:"
health=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/health)
if [ "$health" = "200" ]; then
  echo "  ✓ API Health: OK"
else
  echo "  ✗ API Health: HTTP $health (ACTION REQUIRED!)"
fi

# Check database connectivity
echo -e "\n3. Database:"
db_check=$(psql -U roip_user -d roip_production -c "SELECT 1;" 2>&1)
if echo "$db_check" | grep -q "1 row"; then
  echo "  ✓ Database: Connected"
else
  echo "  ✗ Database: Connection failed (ACTION REQUIRED!)"
fi

# Check disk space
echo -e "\n4. Disk Space:"
df -h | awk 'NR==1 || /\/$|\/var\/|\/opt\// {print "  ", $0}'
df -h / | awk 'NR==2 {if(substr($5,1,length($5)-1)+0 > 85) print "  ⚠ WARNING: Disk usage high!"}'

# Check memory
echo -e "\n5. Memory:"
free -h | head -2 | awk '{print "  ", $0}'
free | awk 'NR==2 {if($3/$2 > 0.85) print "  ⚠ WARNING: Memory usage high!"}'

# Active devices and calls
echo -e "\n6. Active Sessions:"
device_count=$(curl -s http://localhost:8080/api/v1/devices | jq 'length' 2>/dev/null || echo "N/A")
call_count=$(curl -s http://localhost:8080/api/v1/calls/active | jq 'length' 2>/dev/null || echo "N/A")
echo "  Devices Online: $device_count"
echo "  Active Calls: $call_count"

echo -e "\n=== Health Check Complete ==="
```

**Action Items**:
- ✅ All services running
- ✅ HTTP health check passes
- ✅ Database accessible
- ✅ Disk space <80%
- ✅ Memory usage <85%
- ✅ Record device/call counts

**If any checks fail**: Investigate immediately and refer to appropriate runbook.

### 2. Review Overnight Logs (5 minutes)

```bash
# Check for errors in last 24 hours
sudo journalctl -u roip-server --since "24 hours ago" -p err | tail -20

# Count errors by type
sudo journalctl -u roip-server --since "24 hours ago" | \
  grep -i error | awk '{print $NF}' | sort | uniq -c | sort -rn

# PostgreSQL errors
sudo tail -100 /var/log/postgresql/postgresql-*-main.log | grep ERROR

# Check for service restarts (may indicate crashes)
sudo journalctl --since "24 hours ago" | grep -i "started\|stopped" | grep roip-server
```

**Action Items**:
- ✅ Review error count (should be <10 per day)
- ✅ Investigate any unusual errors
- ✅ Check for service restarts
- ✅ Verify no security alerts

### 3. Review Monitoring Dashboards (5 minutes)

Access Grafana dashboard: `https://grafana.roip.example.com`

**Check the following panels**:
- [ ] System Resources (CPU, Memory, Disk)
- [ ] Active Calls (trend over 24h)
- [ ] Call Quality Metrics (MOS score, packet loss)
- [ ] API Response Times
- [ ] Database Performance
- [ ] Error Rate

**Record Daily Metrics**:
```
Date: ___________
Peak Concurrent Calls: _____
Avg Call Quality (MOS): _____
API P95 Response Time: _____ ms
Database Connections: _____
Error Count: _____
```

### 4. Backup Verification (3 minutes)

```bash
# Check latest database backup
ls -lh /var/backups/roip/database/ | head -5

# Verify backup from last night exists
YESTERDAY=$(date -d "yesterday" +%Y%m%d)
if ls /var/backups/roip/database/*$YESTERDAY* 1>/dev/null 2>&1; then
  echo "✓ Yesterday's backup exists"
  # Check backup size (should be reasonable, not 0 bytes)
  du -h /var/backups/roip/database/*$YESTERDAY* | tail -1
else
  echo "✗ WARNING: No backup from yesterday found!"
fi

# Check S3 backup sync (if configured)
aws s3 ls s3://roip-backups/database/ --recursive | tail -5

# Test restore (weekly, not daily)
# See BACKUP_RESTORATION.md
```

**Action Items**:
- ✅ Backup from last 24h exists
- ✅ Backup size is reasonable (>10MB)
- ✅ S3 sync successful (if applicable)
- ❌ If backup missing: Run manual backup immediately

### 5. Security Check (3 minutes)

```bash
# Check failed login attempts
sudo lastb | head -20

# Check for suspicious sudo commands
sudo grep sudo /var/log/auth.log | grep -v "$(whoami)" | tail -20

# Check active SSH sessions
who

# Review fail2ban bans
sudo fail2ban-client status sshd

# Check for unusual network connections
sudo netstat -tulpn | grep ESTABLISHED | grep -v "10.0\|127.0.0.1"
```

**Action Items**:
- ✅ No unusual failed logins
- ✅ No unauthorized sudo usage
- ✅ All active sessions are legitimate
- ✅ fail2ban working (some bans expected)
- ⚠️ If suspicious activity: Refer to [SECURITY_INCIDENT.md](../runbooks/SECURITY_INCIDENT.md)

---

## Midday Checks (Optional, if issues observed)

### Time: 14:00 UTC

### Quick Status Check (2 minutes)

```bash
# Quick one-liner health check
curl -s http://localhost:8080/health | jq '.'

# Check active calls
curl -s http://localhost:8080/api/v1/calls/active | jq 'length'

# Check recent errors
sudo journalctl -u roip-server --since "4 hours ago" -p err | wc -l
```

---

## End of Day Checks

### Time: 17:00 UTC

### 1. Daily Metrics Report (5 minutes)

```bash
#!/bin/bash
# Generate daily report

DATE=$(date +%Y-%m-%d)
REPORT_FILE="/var/log/roip/daily-report-$DATE.txt"

cat > $REPORT_FILE <<EOF
=================================================
RoIP System - Daily Report
Date: $DATE
=================================================

SYSTEM HEALTH
-------------
$(systemctl is-active roip-server postgresql coturn nginx | \
  awk '{s=s"  "$0"\n"} END {print s}')

RESOURCE USAGE
--------------
CPU Load: $(uptime | awk -F'load average:' '{print $2}')
Memory: $(free -h | awk 'NR==2{print $3" / "$2" ("$3/$2*100"%)")'}')
Disk: $(df -h / | awk 'NR==2{print $3" / "$2" ("$5")"}')

CALL STATISTICS (24h)
---------------------
Total Calls: $(psql -U roip_user -d roip_production -t -c \
  "SELECT count(*) FROM call_logs WHERE start_time > NOW() - INTERVAL '24 hours';")
Avg Call Duration: $(psql -U roip_user -d roip_production -t -c \
  "SELECT AVG(duration) FROM call_logs WHERE start_time > NOW() - INTERVAL '24 hours';") seconds
Avg Call Quality: $(psql -U roip_user -d roip_production -t -c \
  "SELECT AVG(quality_score) FROM call_logs WHERE start_time > NOW() - INTERVAL '24 hours';")

DEVICE STATUS
-------------
Online Devices: $(curl -s http://localhost:8080/api/v1/devices | jq '[.[] | select(.status=="online")] | length')
Total Registered: $(curl -s http://localhost:8080/api/v1/devices | jq 'length')

ERRORS (24h)
------------
Application Errors: $(sudo journalctl -u roip-server --since "24 hours ago" -p err | wc -l)
Database Errors: $(sudo grep -c ERROR /var/log/postgresql/postgresql-*-main.log | tail -1)

BACKUP STATUS
-------------
Latest Backup: $(ls -t /var/backups/roip/database/ | head -1)
Backup Size: $(du -h $(ls -t /var/backups/roip/database/* | head -1) | cut -f1)

=================================================
End of Report
=================================================
EOF

cat $REPORT_FILE

# Email report to ops team
mail -s "RoIP Daily Report - $DATE" ops@example.com < $REPORT_FILE
```

### 2. Cleanup Tasks (3 minutes)

```bash
# Clean old logs (keep 30 days)
find /var/log/roip -name "*.log" -mtime +30 -delete

# Clean temporary files
find /tmp -name "roip-*" -mtime +7 -delete

# Vacuum systemd journal (keep 7 days)
sudo journalctl --vacuum-time=7d

# Clean old call recordings (if enabled, keep 90 days)
find /var/roip/recordings -name "*.wav" -mtime +90 -delete
```

### 3. Capacity Planning Check (5 minutes)

```bash
#!/bin/bash
# Check trends and capacity

echo "=== Capacity Planning Check ==="

# Database size growth
echo -e "\nDatabase Size:"
psql -U roip_user -d roip_production -c "
SELECT pg_size_pretty(pg_database_size('roip_production'));"

# Table growth (top 5)
echo -e "\nLargest Tables:"
psql -U roip_user -d roip_production -c "
SELECT schemaname, tablename,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 5;"

# Disk usage trend (compare to yesterday)
echo -e "\nDisk Usage Trend:"
USAGE_TODAY=$(df / | awk 'NR==2 {print $5}' | tr -d '%')
if [ -f /var/log/roip/disk-usage-yesterday.txt ]; then
  USAGE_YESTERDAY=$(cat /var/log/roip/disk-usage-yesterday.txt)
  CHANGE=$((USAGE_TODAY - USAGE_YESTERDAY))
  echo "  Yesterday: ${USAGE_YESTERDAY}%"
  echo "  Today: ${USAGE_TODAY}%"
  echo "  Change: ${CHANGE}%"
  if [ $CHANGE -gt 5 ]; then
    echo "  ⚠ WARNING: Disk usage increased by more than 5%!"
  fi
fi
echo $USAGE_TODAY > /var/log/roip/disk-usage-yesterday.txt

# Connection pool usage trend
echo -e "\nDatabase Connections:"
psql -U roip_user -d roip_production -c "
SELECT count(*), state
FROM pg_stat_activity
GROUP BY state;"

# Estimate time to full disk (if usage is growing)
# Alert if < 30 days
```

---

## Weekly Tasks (Friday EOD)

See [WEEKLY_MAINTENANCE.md](WEEKLY_MAINTENANCE.md) for detailed procedures.

**Quick Checklist**:
- [ ] Review week's metrics trends
- [ ] Update software packages
- [ ] Database optimization (VACUUM)
- [ ] Certificate expiry check
- [ ] Backup restore test
- [ ] Security scan
- [ ] Review and close tickets

---

## On-Call Handoff

If you are on-call, complete handoff at end of shift:

### Handoff Checklist

```bash
# Create handoff note
cat > /tmp/oncall-handoff.txt <<EOF
On-Call Handoff - $(date)
========================

CURRENT STATUS
--------------
Services: $(systemctl is-active roip-server postgresql coturn nginx)
Active Calls: $(curl -s http://localhost:8080/api/v1/calls/active | jq 'length')
Online Devices: $(curl -s http://localhost:8080/api/v1/devices | jq '[.[] | select(.status=="online")] | length')

ONGOING ISSUES
--------------
[List any ongoing issues or investigations]

PENDING TASKS
-------------
[List any tasks to be completed by next shift]

RECENT INCIDENTS (24h)
----------------------
[Summarize any incidents]

NOTES FOR NEXT SHIFT
--------------------
[Any important information]

Handed off by: [Your Name]
Next on-call: [Check PagerDuty rotation]
EOF

cat /tmp/oncall-handoff.txt
# Post to #operations Slack channel
```

---

## Troubleshooting Quick Reference

| Issue | Quick Check | Runbook |
|-------|-------------|---------|
| Service down | `systemctl status roip-server` | [SERVER_DOWNTIME.md](../runbooks/SERVER_DOWNTIME.md) |
| High errors | `journalctl -u roip-server -p err -n 20` | [COMMON_ISSUES.md](../troubleshooting/COMMON_ISSUES.md) |
| Slow performance | `top`, `free`, `df -h` | [PERFORMANCE_DEBUG.md](../troubleshooting/PERFORMANCE_DEBUG.md) |
| Call quality issues | Check Grafana call quality panel | [CALL_QUALITY_ISSUES.md](../runbooks/CALL_QUALITY_ISSUES.md) |
| Database issues | `psql -U roip_user -d roip_production -c "SELECT 1;"` | [DATABASE_FAILURE.md](../runbooks/DATABASE_FAILURE.md) |

---

## Automation

### Automated Daily Checks

Add to crontab:

```bash
# Edit crontab
crontab -e

# Add daily health check at 9 AM
0 9 * * * /opt/roip/scripts/daily-health-check.sh | mail -s "Daily Health Check" ops@example.com

# Add end-of-day report at 5 PM
0 17 * * * /opt/roip/scripts/daily-report.sh

# Clean old logs daily at 2 AM
0 2 * * * find /var/log/roip -name "*.log" -mtime +30 -delete
```

---

## Metrics to Track

### Daily KPIs

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| System Uptime | >99.9% | <99.5% |
| Active Devices | Trend stable | >20% drop |
| Total Calls (24h) | Trend stable | >30% drop |
| Avg Call Quality (MOS) | >4.0 | <3.5 |
| Error Rate | <0.1% | >1% |
| API Response Time (P95) | <200ms | >500ms |
| Database Response Time | <50ms | >200ms |

### Trending Metrics (Weekly Review)

- Device registration rate (growing/stable/declining)
- Call duration trends
- Peak concurrent calls
- Disk usage growth rate
- Bandwidth usage
- Error types and frequency

---

## Emergency Contacts

- **On-Call Engineer**: Check PagerDuty rotation
- **Database Admin**: dba@example.com
- **Network Operations**: netops@example.com
- **Security Team**: security@example.com
- **Manager**: manager@example.com

---

**Document Version**: 1.0
**Last Updated**: 2025-11-22
**Next Review**: 2026-02-22
