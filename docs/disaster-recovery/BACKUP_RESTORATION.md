# Backup and Restoration Procedures
## ESP32 RoIP Production System

**Version**: 1.0
**Last Updated**: 2025-11-22

---

## Table of Contents

1. [Backup Strategy](#backup-strategy)
2. [Backup Procedures](#backup-procedures)
3. [Restoration Procedures](#restoration-procedures)
4. [Backup Verification](#backup-verification)
5. [Recovery Scenarios](#recovery-scenarios)

---

## Backup Strategy

### Backup Types

| Backup Type | Frequency | Retention | Storage Location | Purpose |
|-------------|-----------|-----------|------------------|---------|
| **Full Database** | Daily 02:00 UTC | 90 days | Local + S3 | Complete recovery |
| **Incremental** | Every 6 hours | 30 days | Local + S3 | Point-in-time recovery |
| **WAL Archives** | Continuous | 90 days | S3 | PITR (Point-in-Time Recovery) |
| **Configuration** | On change | Forever (Git) | GitHub | Infrastructure as Code |
| **Application Files** | Daily | 30 days | S3 | Code recovery |
| **Call Recordings** | Daily | 365 days | S3 (archival) | Compliance/auditing |

### RPO/RTO Objectives

| Scenario | RPO (Max Data Loss) | RTO (Max Downtime) |
|----------|---------------------|-------------------|
| Database corruption | 15 minutes | 45 minutes |
| Complete site failure | 6 hours | 1 hour |
| Accidental deletion | 15 minutes | 30 minutes |
| Ransomware | 24 hours | 2 hours |

---

## Backup Procedures

### Automated Database Backup

**Script Location**: `/opt/roip/scripts/backup-database.sh`

```bash
#!/bin/bash
# Automated database backup script
# Run via cron: 0 2 * * * /opt/roip/scripts/backup-database.sh

set -e  # Exit on error

# Configuration
BACKUP_DIR=/var/backups/roip/database
S3_BUCKET=s3://roip-backups/database
DB_NAME=roip_production
DB_USER=roip_user
RETENTION_DAYS=90
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/roip_${TIMESTAMP}.dump"
LOG_FILE=/var/log/roip/backup.log

# Logging function
log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a $LOG_FILE
}

log "Starting database backup"

# Create backup directory
mkdir -p $BACKUP_DIR

# Pre-backup checks
log "Checking database connectivity"
if ! psql -U $DB_USER -d $DB_NAME -c "SELECT 1;" > /dev/null 2>&1; then
  log "ERROR: Cannot connect to database"
  echo "Database backup failed" | mail -s "BACKUP FAILED" ops@example.com
  exit 1
fi

# Get database size
DB_SIZE=$(psql -U $DB_USER -d $DB_NAME -t -c "SELECT pg_size_pretty(pg_database_size('$DB_NAME'));")
log "Database size: $DB_SIZE"

# Perform backup
log "Creating backup: $BACKUP_FILE"
if pg_dump -U $DB_USER -Fc $DB_NAME > $BACKUP_FILE; then
  log "Backup created successfully"
else
  log "ERROR: Backup failed"
  echo "Database backup failed" | mail -s "BACKUP FAILED" ops@example.com
  exit 1
fi

# Verify backup file exists and has size
if [ ! -s $BACKUP_FILE ]; then
  log "ERROR: Backup file is empty or does not exist"
  echo "Database backup failed - empty file" | mail -s "BACKUP FAILED" ops@example.com
  exit 1
fi

BACKUP_SIZE=$(du -h $BACKUP_FILE | cut -f1)
log "Backup file size: $BACKUP_SIZE"

# Compress backup
log "Compressing backup"
gzip $BACKUP_FILE
BACKUP_FILE="${BACKUP_FILE}.gz"

# Upload to S3
log "Uploading to S3: $S3_BUCKET"
if aws s3 cp $BACKUP_FILE $S3_BUCKET/ --storage-class STANDARD_IA; then
  log "Uploaded to S3 successfully"
else
  log "WARNING: S3 upload failed (local backup still available)"
  echo "S3 upload failed but local backup exists" | mail -s "BACKUP WARNING" ops@example.com
fi

# Create symlink to latest backup
ln -sf $BACKUP_FILE $BACKUP_DIR/roip_latest.dump.gz

# Verify backup integrity
log "Verifying backup integrity"
if pg_restore --list $BACKUP_FILE > /dev/null 2>&1; then
  log "Backup verification: PASSED"
else
  log "ERROR: Backup verification FAILED"
  echo "Backup verification failed" | mail -s "BACKUP FAILED" ops@example.com
  exit 1
fi

# Cleanup old backups
log "Cleaning up old backups (>$RETENTION_DAYS days)"
find $BACKUP_DIR -name "roip_*.dump.gz" -mtime +$RETENTION_DAYS -delete
DELETED=$(find $BACKUP_DIR -name "roip_*.dump.gz" -mtime +$RETENTION_DAYS 2>/dev/null | wc -l)
log "Deleted $DELETED old backups"

# S3 lifecycle policy handles S3 cleanup

# Report success
log "Backup completed successfully"
echo "Backup completed: $BACKUP_FILE ($BACKUP_SIZE)" | \
  mail -s "Daily Backup Success" ops@example.com

exit 0
```

**Cron Schedule**:
```bash
# Edit root crontab
sudo crontab -e

# Add daily backup at 2 AM
0 2 * * * /opt/roip/scripts/backup-database.sh

# Add incremental backup every 6 hours
0 */6 * * * /opt/roip/scripts/backup-database-incremental.sh
```

### Configuration Backup

```bash
#!/bin/bash
# Backup configuration files
# /opt/roip/scripts/backup-config.sh

CONFIG_BACKUP_DIR=/var/backups/roip/config
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create backup archive
tar -czf $CONFIG_BACKUP_DIR/config-$TIMESTAMP.tar.gz \
  /opt/roip-server/.env \
  /opt/roip-server/config/ \
  /etc/nginx/sites-available/roip \
  /etc/postgresql/15/main/postgresql.conf \
  /etc/systemd/system/roip*.service \
  /etc/letsencrypt/live/

# Upload to S3
aws s3 cp $CONFIG_BACKUP_DIR/config-$TIMESTAMP.tar.gz \
  s3://roip-backups/config/

# Keep last 10 config backups locally
ls -t $CONFIG_BACKUP_DIR/config-*.tar.gz | tail -n +11 | xargs rm -f
```

### WAL (Write-Ahead Log) Archiving

**Enable in PostgreSQL**:

```bash
# Edit postgresql.conf
sudo nano /etc/postgresql/15/main/postgresql.conf

# Add/modify these settings:
wal_level = replica
archive_mode = on
archive_command = 'test ! -f /var/lib/postgresql/wal_archive/%f && cp %p /var/lib/postgresql/wal_archive/%f && aws s3 cp /var/lib/postgresql/wal_archive/%f s3://roip-backups/wal/'
archive_timeout = 300  # Archive every 5 minutes
max_wal_senders = 3
wal_keep_size = 1GB

# Restart PostgreSQL
sudo systemctl restart postgresql

# Create WAL archive directory
sudo mkdir -p /var/lib/postgresql/wal_archive
sudo chown postgres:postgres /var/lib/postgresql/wal_archive
```

---

## Restoration Procedures

### Full Database Restoration

**Scenario**: Complete database restoration from backup

**Time Required**: 30-45 minutes

**Prerequisites**:
- Recent backup available
- Application can be stopped
- PostgreSQL installed and running

**Procedure**:

```bash
#!/bin/bash
# Database restoration script
# Usage: ./restore-database.sh <backup-file>

set -e

BACKUP_FILE=$1
DB_NAME=roip_production
DB_USER=roip_user

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup-file>"
  echo "Example: $0 /var/backups/roip/database/roip_20251122_020000.dump.gz"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "=== Database Restoration ==="
echo "Backup file: $BACKUP_FILE"
echo "Database: $DB_NAME"
echo ""
read -p "This will REPLACE the current database. Continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
  echo "Restoration cancelled"
  exit 0
fi

# Step 1: Stop application
echo "Step 1: Stopping application..."
sudo systemctl stop roip-server
sleep 5

# Step 2: Backup current database (safety)
echo "Step 2: Creating safety backup of current database..."
SAFETY_BACKUP="/tmp/roip-pre-restore-$(date +%Y%m%d_%H%M%S).dump"
sudo -u postgres pg_dump -Fc $DB_NAME > $SAFETY_BACKUP
echo "Safety backup created: $SAFETY_BACKUP"

# Step 3: Terminate existing connections
echo "Step 3: Terminating existing database connections..."
psql -U postgres -c "
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '$DB_NAME' AND pid != pg_backend_pid();"

# Step 4: Drop and recreate database
echo "Step 4: Recreating database..."
sudo -u postgres psql -c "DROP DATABASE IF EXISTS $DB_NAME;"
sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

# Step 5: Restore from backup
echo "Step 5: Restoring from backup..."

# Decompress if needed
if [[ $BACKUP_FILE == *.gz ]]; then
  echo "Decompressing backup..."
  gunzip -c $BACKUP_FILE > /tmp/restore.dump
  RESTORE_FILE=/tmp/restore.dump
else
  RESTORE_FILE=$BACKUP_FILE
fi

# Perform restoration
sudo -u postgres pg_restore -d $DB_NAME $RESTORE_FILE

if [ $? -eq 0 ]; then
  echo "Restoration successful"
else
  echo "ERROR: Restoration failed"
  echo "Restoring from safety backup..."
  sudo -u postgres pg_restore -d $DB_NAME $SAFETY_BACKUP
  exit 1
fi

# Cleanup temp file
if [ -f /tmp/restore.dump ]; then
  rm /tmp/restore.dump
fi

# Step 6: Verify restoration
echo "Step 6: Verifying restoration..."

# Check table counts
echo "Table counts:"
psql -U $DB_USER -d $DB_NAME -c "
SELECT 'devices' AS table, count(*) FROM devices
UNION ALL
SELECT 'call_logs', count(*) FROM call_logs
UNION ALL
SELECT 'routes', count(*) FROM routes;"

# Check latest timestamps
echo "Latest timestamps:"
psql -U $DB_USER -d $DB_NAME -c "
SELECT 'devices' AS table, MAX(created_at) AS latest FROM devices
UNION ALL
SELECT 'call_logs', MAX(start_time) FROM call_logs;"

# Step 7: Rebuild indexes and update statistics
echo "Step 7: Rebuilding indexes and updating statistics..."
psql -U $DB_USER -d $DB_NAME -c "REINDEX DATABASE $DB_NAME;"
psql -U $DB_USER -d $DB_NAME -c "VACUUM ANALYZE;"

# Step 8: Start application
echo "Step 8: Starting application..."
sudo systemctl start roip-server

# Wait for application to start
sleep 10

# Step 9: Verify application
echo "Step 9: Verifying application..."
curl -s http://localhost:8080/health | jq '.'

if [ $? -eq 0 ]; then
  echo ""
  echo "=== Restoration Complete ==="
  echo "Database restored from: $BACKUP_FILE"
  echo "Safety backup saved to: $SAFETY_BACKUP"
  echo "Application: RUNNING"
  echo ""
  echo "Next steps:"
  echo "1. Test device connections"
  echo "2. Verify recent data"
  echo "3. Monitor logs: sudo journalctl -u roip-server -f"
  echo "4. Delete safety backup when confident: rm $SAFETY_BACKUP"
else
  echo "ERROR: Application failed to start"
  echo "Check logs: sudo journalctl -u roip-server -n 50"
  exit 1
fi
```

### Point-in-Time Recovery (PITR)

**Scenario**: Recover database to specific point in time

**Requires**: Base backup + WAL archives

```bash
#!/bin/bash
# Point-in-Time Recovery
# Usage: ./pitr-restore.sh <base-backup> <target-time>

BASE_BACKUP=$1
TARGET_TIME=$2  # Format: '2025-11-22 14:30:00'

if [ -z "$TARGET_TIME" ]; then
  echo "Usage: $0 <base-backup> <target-time>"
  echo "Example: $0 /var/backups/roip/database/roip_20251122.dump '2025-11-22 14:30:00'"
  exit 1
fi

echo "=== Point-in-Time Recovery ==="
echo "Target time: $TARGET_TIME"

# Stop PostgreSQL
sudo systemctl stop postgresql

# Restore base backup
echo "Restoring base backup..."
sudo -u postgres pg_restore -d roip_production $BASE_BACKUP

# Create recovery.conf
cat > /var/lib/postgresql/15/main/recovery.conf <<EOF
restore_command = 'cp /var/lib/postgresql/wal_archive/%f %p'
recovery_target_time = '$TARGET_TIME'
recovery_target_action = 'promote'
EOF

sudo chown postgres:postgres /var/lib/postgresql/15/main/recovery.conf

# Start PostgreSQL (will replay WAL to target time)
sudo systemctl start postgresql

echo "PostgreSQL will replay WAL logs to target time"
echo "Monitor: sudo tail -f /var/log/postgresql/postgresql-*-main.log"
echo "When complete, database will be promoted to primary"
```

### Table-Level Restoration

**Scenario**: Restore a single table without full database restore

```bash
#!/bin/bash
# Restore single table
# Usage: ./restore-table.sh <backup-file> <table-name>

BACKUP_FILE=$1
TABLE_NAME=$2

# Extract specific table from backup
pg_restore -t $TABLE_NAME -d roip_production $BACKUP_FILE

# Or restore to temp table then copy
pg_restore -t $TABLE_NAME -d roip_production -c $BACKUP_FILE

# Verify
psql -U roip_user -d roip_production -c "SELECT count(*) FROM $TABLE_NAME;"
```

---

## Backup Verification

### Automated Verification

```bash
#!/bin/bash
# Verify backup integrity
# /opt/roip/scripts/verify-backup.sh

BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
  BACKUP_FILE=$(ls -t /var/backups/roip/database/roip_*.dump.gz | head -1)
fi

echo "Verifying backup: $BACKUP_FILE"

# Test 1: File exists and has size
if [ ! -s "$BACKUP_FILE" ]; then
  echo "FAIL: Backup file missing or empty"
  exit 1
fi

echo "PASS: Backup file exists ($(du -h $BACKUP_FILE | cut -f1))"

# Test 2: Can list backup contents
if pg_restore --list $BACKUP_FILE > /dev/null 2>&1; then
  echo "PASS: Backup file structure valid"
else
  echo "FAIL: Backup file corrupted"
  exit 1
fi

# Test 3: Restore to test database
echo "Test restore to temporary database..."

# Create test database
createdb -U roip_user roip_test_restore

# Restore
if [[ $BACKUP_FILE == *.gz ]]; then
  gunzip -c $BACKUP_FILE | pg_restore -U roip_user -d roip_test_restore
else
  pg_restore -U roip_user -d roip_test_restore $BACKUP_FILE
fi

if [ $? -eq 0 ]; then
  echo "PASS: Test restore successful"
else
  echo "FAIL: Test restore failed"
  dropdb -U roip_user roip_test_restore
  exit 1
fi

# Test 4: Verify data
DEVICE_COUNT=$(psql -U roip_user -d roip_test_restore -t -c "SELECT count(*) FROM devices;")
CALL_COUNT=$(psql -U roip_user -d roip_test_restore -t -c "SELECT count(*) FROM call_logs;")

echo "PASS: Data verification"
echo "  Devices: $DEVICE_COUNT"
echo "  Calls: $CALL_COUNT"

# Cleanup
dropdb -U roip_user roip_test_restore

echo ""
echo "=== Backup Verification: PASSED ==="
echo "Backup is valid and restorable"
```

### Weekly Verification Cron

```bash
# Run backup verification weekly
0 3 * * 0 /opt/roip/scripts/verify-backup.sh | mail -s "Weekly Backup Verification" ops@example.com
```

---

## Recovery Scenarios

### Scenario 1: Accidental Data Deletion

**Problem**: Important data accidentally deleted (e.g., device records)

**Solution**: Table-level or PITR restoration

```bash
# Option 1: PITR to just before deletion
./pitr-restore.sh /var/backups/roip/database/roip_latest.dump.gz '2025-11-22 14:25:00'

# Option 2: Restore specific table
./restore-table.sh /var/backups/roip/database/roip_latest.dump.gz devices

# Option 3: Export deleted data from backup and reimport
pg_restore -t devices -d temp_db /var/backups/roip/database/roip_20251122.dump
psql -d temp_db -c "COPY devices TO '/tmp/devices.csv' CSV HEADER;"
psql -d roip_production -c "COPY devices FROM '/tmp/devices.csv' CSV HEADER;"
```

### Scenario 2: Database Corruption

**Problem**: Database files corrupted, PostgreSQL won't start

**Solution**: Full restoration from latest backup

```bash
# Follow Full Database Restoration procedure above
./restore-database.sh /var/backups/roip/database/roip_latest.dump.gz
```

### Scenario 3: Ransomware Attack

**Problem**: Database encrypted by ransomware

**Solution**: Restore from clean backup, harden security

```bash
# 1. Isolate system
# Disconnect from network

# 2. Identify last known-good backup (before infection)
# Check backup timestamps vs infection time

# 3. Rebuild system from scratch
# Fresh OS install

# 4. Restore from pre-infection backup
./restore-database.sh /var/backups/roip/database/roip_20251120.dump.gz

# 5. Harden security
# Change all passwords, rotate keys, apply patches
```

### Scenario 4: Complete Site Failure

**Problem**: Primary datacenter destroyed

**Solution**: Failover to DR site

See [DR_PLAN.md](DR_PLAN.md) for complete procedure.

---

## S3 Backup Management

### S3 Lifecycle Policy

```json
{
  "Rules": [
    {
      "Id": "TransitionOldBackups",
      "Status": "Enabled",
      "Transitions": [
        {
          "Days": 30,
          "StorageClass": "STANDARD_IA"
        },
        {
          "Days": 90,
          "StorageClass": "GLACIER"
        }
      ],
      "Expiration": {
        "Days": 365
      }
    }
  ]
}
```

### Restore from S3

```bash
# List available backups
aws s3 ls s3://roip-backups/database/ --recursive | grep dump.gz

# Download specific backup
aws s3 cp s3://roip-backups/database/roip_20251122_020000.dump.gz /tmp/

# Restore from Glacier (requires 24-48 hour restoration)
aws s3api restore-object \
  --bucket roip-backups \
  --key database/roip_20250101_020000.dump.gz \
  --restore-request Days=7

# Check restoration status
aws s3api head-object \
  --bucket roip-backups \
  --key database/roip_20250101_020000.dump.gz

# Download once restored
aws s3 cp s3://roip-backups/database/roip_20250101_020000.dump.gz /tmp/
```

---

## Backup Monitoring and Alerting

### Prometheus Alerts

```yaml
- alert: BackupFailed
  expr: time() - roip_last_successful_backup_timestamp > 86400
  annotations:
    summary: "No successful backup in 24 hours"

- alert: BackupSizeTooSmall
  expr: roip_last_backup_size_bytes < 1000000
  annotations:
    summary: "Backup file suspiciously small"
```

### Daily Backup Report

```bash
#!/bin/bash
# Daily backup status report

cat > /tmp/backup-report.txt <<EOF
Daily Backup Report - $(date +%Y-%m-%d)
=====================================

Latest Backup:
$(ls -lh /var/backups/roip/database/roip_latest.dump.gz)

Backup Age:
$(find /var/backups/roip/database/roip_latest.dump.gz -mtime -1 && echo "✓ Within 24 hours" || echo "✗ OLDER THAN 24 HOURS")

S3 Status:
$(aws s3 ls s3://roip-backups/database/ --recursive | tail -5)

Disk Usage:
$(du -sh /var/backups/roip/)

WAL Archive Status:
$(ls -lh /var/lib/postgresql/wal_archive/ | wc -l) WAL files

Last Verification:
$(cat /var/log/roip/backup-verification-last.txt 2>/dev/null || echo "Never verified")
EOF

cat /tmp/backup-report.txt
mail -s "Daily Backup Report" ops@example.com < /tmp/backup-report.txt
```

---

## Related Documentation

- [DR_PLAN.md](DR_PLAN.md)
- [DATABASE_FAILURE.md](../runbooks/DATABASE_FAILURE.md)
- [MONTHLY_REVIEW.md](../operations/MONTHLY_REVIEW.md)

---

**Document Version**: 1.0
**Last Updated**: 2025-11-22
**Next Review**: 2026-02-22
