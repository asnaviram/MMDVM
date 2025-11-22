# Database Failure Recovery Runbook
## ESP32 RoIP Production System

**Version**: 1.0
**Last Updated**: 2025-11-22
**Severity**: P0 - Critical
**Estimated Time to Recovery**: 20-45 minutes

---

## Table of Contents

1. [Overview](#overview)
2. [Symptoms](#symptoms)
3. [Initial Assessment](#initial-assessment)
4. [Recovery Procedures](#recovery-procedures)
5. [Validation](#validation)
6. [Prevention](#prevention)

---

## Overview

This runbook covers recovery procedures for PostgreSQL database failures, including complete database downtime, corruption, and performance degradation.

### When to Use This Runbook

- Database service not responding
- Connection pool exhausted
- Database corruption detected
- Replication lag excessive
- Slow queries causing timeouts

---

## Symptoms

### Primary Indicators

```bash
# Database health check fails
curl http://localhost:8080/health/db
# Returns: {"status":"error","database":"unreachable"}

# PostgreSQL service down
sudo systemctl status postgresql
# Shows: inactive (dead) or failed

# Cannot connect to database
psql -U roip_user -d roip_production
# Returns: connection refused or timeout
```

### Secondary Indicators

- Application logs showing "ECONNREFUSED"
- "Too many connections" errors
- Slow query timeouts
- Replication stopped

---

## Initial Assessment

### Step 1: Check Database Service Status

```bash
# Service status
sudo systemctl status postgresql

# Check if process is running
ps aux | grep postgres

# Check database port
sudo netstat -tulpn | grep 5432

# Test connection
psql -U roip_user -h localhost -d roip_production -c "SELECT 1;"
```

### Step 2: Check Logs for Root Cause

```bash
# PostgreSQL logs
sudo tail -100 /var/log/postgresql/postgresql-*-main.log

# System logs
sudo journalctl -u postgresql -n 100

# Look for:
# - "FATAL: could not create lock file"
# - "PANIC: corrupted page"
# - "ERROR: out of memory"
# - "FATAL: too many connections"
```

### Step 3: Check Resources

```bash
# Disk space (critical for database)
df -h /var/lib/postgresql

# Memory
free -h

# Check for OOM events
sudo dmesg | grep -i "postgres.*killed"

# I/O performance
iostat -x 1 5
```

---

## Recovery Procedures

### Procedure A: Service Down - Simple Restart

**Time**: 2-5 minutes

```bash
# Attempt to start database
sudo systemctl start postgresql

# Wait for database to be ready
until pg_isready -h localhost -p 5432; do
  echo "Waiting for PostgreSQL..."
  sleep 2
done

# Verify connectivity
psql -U roip_user -h localhost -d roip_production -c "SELECT NOW();"

# Restart application to re-establish connections
sudo systemctl restart roip-server
```

### Procedure B: Port Conflict or Lock File Issues

**Time**: 5-10 minutes

```bash
# Check if another process using port 5432
sudo lsof -i :5432
sudo netstat -tulpn | grep 5432

# If another postgres instance, kill it
sudo kill -9 $(sudo lsof -t -i:5432)

# Remove stale lock files
sudo rm -f /var/run/postgresql/.s.PGSQL.5432.lock
sudo rm -f /var/lib/postgresql/15/main/postmaster.pid

# Fix ownership if needed
sudo chown -R postgres:postgres /var/run/postgresql
sudo chown -R postgres:postgres /var/lib/postgresql

# Start database
sudo systemctl start postgresql
```

### Procedure C: Connection Pool Exhausted

**Time**: 5 minutes

```bash
# Check active connections
psql -U roip_user -d roip_production -c "
SELECT count(*), state
FROM pg_stat_activity
GROUP BY state;"

# Check connection limit
psql -U roip_user -d roip_production -c "SHOW max_connections;"

# Kill idle connections
psql -U roip_user -d roip_production -c "
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle'
  AND state_change < current_timestamp - interval '10 minutes'
  AND pid != pg_backend_pid();"

# Kill long-running queries (if necessary)
psql -U roip_user -d roip_production -c "
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'active'
  AND query_start < current_timestamp - interval '5 minutes'
  AND pid != pg_backend_pid();"

# Restart application to reset connection pool
sudo systemctl restart roip-server
```

### Procedure D: Database Corruption

**Time**: 30-60 minutes

#### Step 1: Assess Corruption Severity

```bash
# Check for corruption errors in logs
sudo grep -i "corrupt\|invalid\|checksum" /var/log/postgresql/postgresql-*-main.log

# Attempt to connect
psql -U roip_user -d roip_production

# Try to query tables
psql -U roip_user -d roip_production -c "SELECT count(*) FROM devices;"
psql -U roip_user -d roip_production -c "SELECT count(*) FROM call_logs;"

# Check table integrity
psql -U roip_user -d roip_production -c "
SELECT schemaname, tablename
FROM pg_tables
WHERE schemaname = 'public';"
```

#### Step 2: Minor Corruption - REINDEX

```bash
# If single index corrupted, rebuild it
psql -U roip_user -d roip_production -c "REINDEX DATABASE roip_production;"

# Or specific table
psql -U roip_user -d roip_production -c "REINDEX TABLE devices;"

# Vacuum to clean up
psql -U roip_user -d roip_production -c "VACUUM FULL ANALYZE;"
```

#### Step 3: Major Corruption - Restore from Backup

```bash
# Stop application
sudo systemctl stop roip-server

# Stop database
sudo systemctl stop postgresql

# Backup corrupted database (for forensics)
sudo tar -czf /tmp/corrupted-db-$(date +%Y%m%d_%H%M%S).tar.gz \
  /var/lib/postgresql/15/main

# Find latest backup
ls -lh /var/backups/roip/database/ | head -5

# Restore from backup
cd /var/lib/postgresql
sudo rm -rf 15/main
sudo -u postgres pg_restore -C -d template1 \
  /var/backups/roip/database/roip_production_latest.dump

# Or from .sql.gz
sudo -u postgres gunzip < /var/backups/roip/database/roip_latest.sql.gz | \
  psql -d template1

# Start database
sudo systemctl start postgresql

# Verify restore
psql -U roip_user -d roip_production -c "SELECT count(*) FROM devices;"

# Start application
sudo systemctl start roip-server
```

### Procedure E: Performance Degradation - Slow Queries

**Time**: 10-20 minutes

#### Step 1: Identify Slow Queries

```bash
# Check for long-running queries
psql -U roip_user -d roip_production -c "
SELECT pid, now() - query_start AS duration, state, query
FROM pg_stat_activity
WHERE state = 'active'
  AND now() - query_start > interval '10 seconds'
ORDER BY duration DESC;"

# Check slow query log
sudo tail -100 /var/log/postgresql/postgresql-*-main.log | grep -i "duration"
```

#### Step 2: Optimize Queries

```bash
# Update statistics
psql -U roip_user -d roip_production -c "ANALYZE;"

# Check missing indexes
psql -U roip_user -d roip_production -c "
SELECT schemaname, tablename, attname, n_distinct, correlation
FROM pg_stats
WHERE schemaname = 'public'
ORDER BY abs(correlation) ASC
LIMIT 20;"

# Add missing indexes (example)
psql -U roip_user -d roip_production -c "
CREATE INDEX CONCURRENTLY idx_devices_status
ON devices(status)
WHERE status = 'online';"
```

#### Step 3: Kill Problematic Queries

```bash
# Kill specific query
psql -U roip_user -d roip_production -c "
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE query LIKE '%problematic_query%';"
```

### Procedure F: Replication Failure (High Availability Setup)

**Time**: 15-30 minutes

#### Step 1: Check Replication Status

```bash
# On primary server
psql -U roip_user -d roip_production -c "
SELECT client_addr, state, sync_state,
       pg_wal_lsn_diff(pg_current_wal_lsn(), sent_lsn) AS send_lag,
       pg_wal_lsn_diff(pg_current_wal_lsn(), write_lsn) AS write_lag
FROM pg_stat_replication;"

# On standby server
psql -U roip_user -d roip_production -c "
SELECT pg_is_in_recovery();"  -- Should return true
```

#### Step 2: Restart Replication

```bash
# On standby server
sudo systemctl restart postgresql

# Monitor replication lag
psql -U roip_user -d roip_production -c "
SELECT now() - pg_last_xact_replay_timestamp() AS replication_lag;"
```

#### Step 3: Promote Standby (if primary failed)

```bash
# Promote standby to primary
sudo -u postgres pg_ctl promote -D /var/lib/postgresql/15/standby

# Verify promotion
psql -U roip_user -d roip_production -c "SELECT pg_is_in_recovery();"
# Should return false

# Update application to use new primary
sudo nano /opt/roip-server/.env
# Update: DATABASE_HOST=new-primary-ip

sudo systemctl restart roip-server
```

---

## Validation

### Step 1: Database Health Checks

```bash
# Service running
sudo systemctl status postgresql

# Can connect
psql -U roip_user -h localhost -d roip_production -c "SELECT NOW();"

# Check database size (should match expected)
psql -U roip_user -d roip_production -c "
SELECT pg_size_pretty(pg_database_size('roip_production'));"

# Check table counts
psql -U roip_user -d roip_production -c "
SELECT 'devices' AS table, count(*) FROM devices
UNION ALL
SELECT 'call_logs', count(*) FROM call_logs
UNION ALL
SELECT 'routes', count(*) FROM routes;"
```

### Step 2: Performance Checks

```bash
# Check for slow queries
psql -U roip_user -d roip_production -c "
SELECT count(*)
FROM pg_stat_activity
WHERE state = 'active'
  AND now() - query_start > interval '1 second';"
# Should be 0 or very low

# Check connection count
psql -U roip_user -d roip_production -c "
SELECT count(*) FROM pg_stat_activity;"
# Should be reasonable (<50% of max_connections)

# Test query performance
time psql -U roip_user -d roip_production -c "SELECT count(*) FROM devices;"
# Should complete in <100ms
```

### Step 3: Application Integration

```bash
# Application health check
curl http://localhost:8080/health/db
# Should return: {"status":"ok"}

# Test CRUD operations
curl -X POST http://localhost:8080/api/v1/test/db -d '{"test":"data"}'

# Check for application errors
sudo journalctl -u roip-server -n 50 | grep -i "database\|sql"
```

---

## Prevention

### Regular Maintenance

```bash
# Daily vacuum (lightweight)
psql -U roip_user -d roip_production -c "VACUUM ANALYZE;"

# Weekly vacuum full (requires maintenance window)
psql -U roip_user -d roip_production -c "VACUUM FULL ANALYZE;"

# Reindex monthly
psql -U roip_user -d roip_production -c "REINDEX DATABASE roip_production;"

# Check for bloat
psql -U roip_user -d roip_production -c "
SELECT schemaname, tablename,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS index_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;"
```

### Automated Backups

See [BACKUP_RESTORATION.md](../disaster-recovery/BACKUP_RESTORATION.md) for comprehensive backup procedures.

```bash
# Automated daily backup script
#!/bin/bash
# /opt/roip/scripts/backup-db.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/var/backups/roip/database
S3_BUCKET=s3://roip-backups/database

# Full backup
sudo -u postgres pg_dump -Fc roip_production > $BACKUP_DIR/roip_$DATE.dump

# Compress
gzip $BACKUP_DIR/roip_$DATE.dump

# Upload to S3
aws s3 cp $BACKUP_DIR/roip_$DATE.dump.gz $S3_BUCKET/

# Rotate old backups (keep 30 days)
find $BACKUP_DIR -name "roip_*.dump.gz" -mtime +30 -delete

# Verify backup
pg_restore --list $BACKUP_DIR/roip_$DATE.dump.gz > /dev/null
if [ $? -eq 0 ]; then
  echo "Backup successful: roip_$DATE.dump.gz"
else
  echo "ERROR: Backup verification failed" | mail -s "Backup Failed" ops@example.com
fi
```

### Monitoring Alerts

```bash
# Add to Prometheus/Nagios

# 1. Database down alert
systemctl is-active postgresql || exit 1

# 2. Connection pool usage (alert at >70%)
psql -U roip_user -d roip_production -t -c "
SELECT count(*) * 100 / (SELECT setting::int FROM pg_settings WHERE name='max_connections')
FROM pg_stat_activity;"

# 3. Replication lag (alert if >10 seconds)
psql -U roip_user -d roip_production -t -c "
SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp()));"

# 4. Long-running queries (alert if any >60 seconds)
psql -U roip_user -d roip_production -t -c "
SELECT count(*)
FROM pg_stat_activity
WHERE state = 'active'
  AND now() - query_start > interval '60 seconds';"

# 5. Disk space (alert at >85%)
df -h /var/lib/postgresql | awk 'NR==2 {print $5}' | sed 's/%//'
```

### Capacity Planning

```bash
# Weekly capacity report

# Database growth rate
psql -U roip_user -d roip_production -c "
SELECT pg_size_pretty(pg_database_size('roip_production')) AS current_size;"

# Table growth trends
psql -U roip_user -d roip_production -c "
SELECT schemaname, tablename,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
       n_live_tup AS row_count
FROM pg_tables
JOIN pg_stat_user_tables USING (schemaname, tablename)
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;"

# Connection trends
psql -U roip_user -d roip_production -c "
SELECT count(*), state
FROM pg_stat_activity
GROUP BY state;"

# Query performance trends
psql -U roip_user -d roip_production -c "
SELECT query, calls, mean_time, max_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 20;"
```

---

## Appendix: Emergency Contacts

- **Database Administrator**: dba@example.com, +1-555-0100
- **On-Call Engineer**: Check PagerDuty
- **PostgreSQL Expert**: postgres-team@example.com

## Related Runbooks

- [Server Downtime Recovery](SERVER_DOWNTIME.md)
- [Backup Restoration](../disaster-recovery/BACKUP_RESTORATION.md)
- [Disaster Recovery Plan](../disaster-recovery/DR_PLAN.md)

---

**Document Version**: 1.0
**Last Updated**: 2025-11-22
**Next Review**: 2026-02-22
