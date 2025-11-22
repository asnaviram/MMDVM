# Backup and Recovery Guide
## ESP32 RoIP System

**Version:** 1.0
**Last Updated:** 2025-11-22
**Status:** Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Backup Strategy](#backup-strategy)
3. [Backup Components](#backup-components)
4. [Automated Backups](#automated-backups)
5. [Manual Backups](#manual-backups)
6. [Backup Verification](#backup-verification)
7. [Restore Procedures](#restore-procedures)
8. [Recovery Scenarios](#recovery-scenarios)
9. [Troubleshooting](#troubleshooting)
10. [Best Practices](#best-practices)

---

## Overview

The ESP32 RoIP System implements a comprehensive backup and disaster recovery strategy to ensure data protection and business continuity. This guide covers all aspects of backup creation, verification, restoration, and disaster recovery procedures.

### Key Features

- **Automated Backups**: Scheduled backups with customizable retention
- **Multi-Component**: Database, configuration, logs, firmware, and certificates
- **Encryption**: AES-256-CBC encryption for sensitive data
- **Compression**: Gzip compression to minimize storage
- **Off-site Storage**: S3-compatible cloud storage integration
- **Verification**: Automated integrity checks and test restores
- **Point-in-Time Recovery**: For PostgreSQL databases

### RTO and RPO Targets

- **Recovery Time Objective (RTO)**: 4 hours
- **Recovery Point Objective (RPO)**: 15 minutes

---

## Backup Strategy

### Backup Types

1. **Full Backup**
   - All system components
   - Recommended: Daily at 2:00 AM
   - Retention: 7 daily, 4 weekly, 12 monthly, 3 yearly

2. **Incremental Backup**
   - Database changes only
   - Recommended: Every 6 hours
   - Retention: 24 hourly, 7 daily

3. **Configuration Backup**
   - System and application config
   - Recommended: Daily at 3:00 AM
   - Retention: 30 daily, 12 weekly, 12 monthly

### Storage Locations

1. **Local Storage**: `/var/backups/roip`
2. **Off-site Primary**: S3 bucket (us-east-1)
3. **Off-site Secondary**: S3 bucket (us-west-2) - Glacier

---

## Backup Components

### 1. Database

**What's Backed Up:**
- SQLite database file (`roip.db`)
- PostgreSQL dump (if using PostgreSQL)
- Transaction logs (for point-in-time recovery)

**Backup Command:**
```bash
/home/user/MMDVM/scripts/backup-database.sh
```

**Options:**
```bash
# Full database backup
./backup-database.sh --type full

# Incremental backup (PostgreSQL only)
./backup-database.sh --type incremental --db-type postgresql

# With S3 upload
./backup-database.sh --upload

# Custom retention
./backup-database.sh --retention 30
```

### 2. Configuration

**What's Backed Up:**
- Server configuration files
- Environment variables (.env files)
- Deployment configurations
- Docker compose files
- PlatformIO configuration

**Backup Command:**
```bash
/home/user/MMDVM/scripts/backup-config.sh
```

**Options:**
```bash
# Basic config backup
./backup-config.sh

# Include secrets (use with caution)
./backup-config.sh --include-secrets

# With S3 upload
./backup-config.sh --upload
```

### 3. Certificates

**What's Backed Up:**
- TLS/SSL certificates
- Let's Encrypt certificates
- Private keys (encrypted)
- Certificate chains

**Location:** Included in full backup or config backup

### 4. Logs

**What's Backed Up:**
- Application logs
- System logs
- Audit logs

**Retention:** 30 days locally, 90 days off-site

### 5. Firmware

**What's Backed Up:**
- Compiled ESP32 binaries (.bin)
- Debug symbols (.elf)
- Build artifacts

**Backup Frequency:** Weekly or on release

---

## Automated Backups

### Cron Setup

Add to crontab:

```bash
# Edit crontab
crontab -e

# Add backup schedules
0 2 * * * /home/user/MMDVM/scripts/backup-all.sh --upload
0 */6 * * * /home/user/MMDVM/scripts/backup-database.sh
0 3 * * * /home/user/MMDVM/scripts/backup-config.sh
0 7 * * * /home/user/MMDVM/scripts/verify-backups.sh --mode quick
```

### Systemd Timer (Alternative)

Create `/etc/systemd/system/roip-backup.timer`:

```ini
[Unit]
Description=RoIP Daily Backup Timer

[Timer]
OnCalendar=daily
OnCalendar=02:00
Persistent=true

[Install]
WantedBy=timers.target
```

Create `/etc/systemd/system/roip-backup.service`:

```ini
[Unit]
Description=RoIP Full System Backup

[Service]
Type=oneshot
ExecStart=/home/user/MMDVM/scripts/backup-all.sh --upload
User=roip
```

Enable and start:
```bash
sudo systemctl enable roip-backup.timer
sudo systemctl start roip-backup.timer
```

### Using Node.js Backup Manager

```javascript
import BackupManager from './src/backup/backup-manager.js';

const backupManager = new BackupManager({
  backupBaseDir: '/var/backups/roip',
  uploadOffsite: true,
  retentionDays: 14
});

// Schedule daily full backup
backupManager.scheduleBackup('0 2 * * *', 'full', { parallel: true });

// Schedule hourly database backup
backupManager.scheduleBackup('0 * * * *', 'database');

// Listen for events
backupManager.on('backup:complete', (backup) => {
  console.log('Backup completed:', backup);
});

backupManager.on('backup:error', (error) => {
  console.error('Backup failed:', error);
});

// Perform manual backup
await backupManager.backupAll();
```

---

## Manual Backups

### Full System Backup

```bash
cd /home/user/MMDVM/scripts
./backup-all.sh
```

### Database Only

```bash
./backup-database.sh --type full
```

### Configuration Only

```bash
./backup-config.sh --include-secrets
```

### Pre-Upgrade Backup

Before major upgrades, create a tagged backup:

```bash
# Create backup
./backup-all.sh

# Tag it
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="/var/backups/roip"

# Move to special directory
mkdir -p "$BACKUP_DIR/pre-upgrade"
cp -r "$BACKUP_DIR/database/database-full-"* "$BACKUP_DIR/pre-upgrade/pre-upgrade-$TIMESTAMP.backup"
```

---

## Backup Verification

### Quick Verification

Checks checksums only:

```bash
./verify-backups.sh --mode quick
```

### Full Verification

Checks checksums, encryption, and compression:

```bash
./verify-backups.sh --mode full
```

### Deep Verification

Includes test restore:

```bash
./verify-backups.sh --mode deep --test-restore
```

### Automated Verification

Schedule daily verification:

```bash
# Add to crontab
0 7 * * * /home/user/MMDVM/scripts/verify-backups.sh --mode quick
```

### Using Node.js

```javascript
const result = await backupManager.verifyBackups('full');

if (result.status === 'passed') {
  console.log('All backups verified successfully');
} else {
  console.error('Backup verification failed:', result.error);
}
```

---

## Restore Procedures

### List Available Backups

```bash
# Database backups
./restore-database.sh --list

# Configuration backups
./restore-config.sh --list
```

### Database Restore

```bash
# Restore latest backup
./restore-database.sh --db-type sqlite

# Restore specific backup
./restore-database.sh --file /var/backups/roip/database/database-full-20251122-120000.backup

# Force restore (overwrite existing)
./restore-database.sh --force

# Dry run (test without actual restore)
./restore-database.sh --dry-run
```

### Configuration Restore

```bash
# Restore latest config
./restore-config.sh

# Restore with secrets
./restore-config.sh --restore-secrets

# Restore specific backup
./restore-config.sh --file /var/backups/roip/config/config-20251122-120000.backup
```

### Full System Restore

```bash
# Complete system restoration
./restore-full.sh

# With all components
./restore-full.sh --restore-secrets

# Skip certain components
./restore-full.sh --skip-firmware --skip-logs

# Dry run first
./restore-full.sh --dry-run
```

### Point-in-Time Recovery (PostgreSQL)

```bash
# Restore to specific time
./restore-database.sh \
  --db-type postgresql \
  --type point_in_time \
  --point-in-time "2025-11-22 12:00:00"
```

### Using Node.js

```javascript
import RestoreManager from './src/backup/restore-manager.js';

const restoreManager = new RestoreManager({
  backupBaseDir: '/var/backups/roip',
  dbType: 'sqlite'
});

// List available backups
const backups = await restoreManager.listAvailableBackups();

// Test restore (dry run)
const testResult = await restoreManager.testRestore('database');

if (testResult.success) {
  // Perform actual restore
  const result = await restoreManager.restoreDatabase({
    force: true
  });

  console.log('Database restored:', result);
}

// Full system restore
await restoreManager.restoreFull({
  dryRun: false,
  restoreSecrets: true
});
```

---

## Recovery Scenarios

### Scenario 1: Database Corruption

**Problem:** Database file is corrupted

**Solution:**
```bash
# 1. Stop services
systemctl stop roip-server

# 2. Move corrupted database
mv /home/user/MMDVM/roip-server/data/roip.db /tmp/roip.db.corrupted

# 3. Restore from latest backup
./restore-database.sh --force

# 4. Verify restore
sqlite3 /home/user/MMDVM/roip-server/data/roip.db "SELECT COUNT(*) FROM sqlite_master;"

# 5. Restart services
systemctl start roip-server
```

**Recovery Time:** ~5-10 minutes
**Data Loss:** Up to last backup (typically <1 hour)

### Scenario 2: Configuration Loss

**Problem:** Configuration files deleted or corrupted

**Solution:**
```bash
# 1. Restore configuration
./restore-config.sh --restore-secrets

# 2. Verify configuration
cat /home/user/MMDVM/roip-server/config/production.yaml

# 3. Restart services
systemctl restart roip-server
```

**Recovery Time:** ~2-5 minutes
**Data Loss:** None (config files)

### Scenario 3: Complete Server Failure

**Problem:** Server hardware failure, need to rebuild

**Solution:**
```bash
# On new server:

# 1. Install system dependencies
sudo apt update
sudo apt install -y nodejs npm sqlite3 postgresql-client

# 2. Clone repository
git clone https://github.com/your-org/MMDVM.git
cd MMDVM

# 3. Install Node.js dependencies
cd roip-server
npm install

# 4. Download backups from S3 (if local backups lost)
aws s3 sync s3://roip-backups/production/ /var/backups/roip/

# 5. Restore full system
cd ../scripts
./restore-full.sh --restore-secrets --force

# 6. Start services
systemctl start roip-server

# 7. Verify system
curl http://localhost:8080/health
```

**Recovery Time:** ~30-60 minutes (depending on data size)
**Data Loss:** Up to last off-site sync (typically <6 hours)

### Scenario 4: Accidental Data Deletion

**Problem:** Important data accidentally deleted

**Solution:**
```bash
# 1. Identify when data was lost
# 2. Find backup before deletion
./restore-database.sh --list

# 3. Restore specific backup
./restore-database.sh --file /var/backups/roip/database/database-full-20251122-080000.backup

# Or use point-in-time recovery (PostgreSQL)
./restore-database.sh \
  --type point_in_time \
  --point-in-time "2025-11-22 07:30:00"
```

**Recovery Time:** ~10-20 minutes
**Data Loss:** From deletion time to chosen restore point

### Scenario 5: Ransomware Attack

**Problem:** System encrypted by ransomware

**Solution:**
```bash
# DO NOT pay ransom!

# 1. Isolate affected systems
# Disconnect from network

# 2. Verify backups are clean (from before infection)
# Check backup dates against infection timeline

# 3. Rebuild system from clean OS install

# 4. Restore from clean backups (before infection)
# Use backup from at least 1 week before detected infection

# 5. Restore system with verified clean backup
./restore-full.sh --restore-secrets

# 6. Apply security patches
# Update all software

# 7. Restore operations gradually
# Monitor for any signs of reinfection
```

**Recovery Time:** 2-4 hours
**Data Loss:** Depends on backup age (aim for <24 hours)

---

## Troubleshooting

### Backup Failures

**Problem:** Backup script fails

**Check:**
1. Disk space: `df -h /var/backups`
2. Permissions: `ls -la /var/backups/roip`
3. Database connectivity (if PostgreSQL)
4. Log files: `tail -f /home/user/MMDVM/logs/backup-*.log`

**Solutions:**
```bash
# Free up space
./scripts/verify-backups.sh --cleanup

# Fix permissions
sudo chown -R roip:roip /var/backups/roip
sudo chmod -R 700 /var/backups/roip

# Check database
sqlite3 /home/user/MMDVM/roip-server/data/roip.db ".tables"
```

### Restore Failures

**Problem:** Restore fails with decryption error

**Solution:**
```bash
# Verify encryption key exists
ls -la /etc/roip/backup-encryption-key

# If missing, restore from secure storage
# Then retry restore
```

**Problem:** Checksumverification fails

**Solution:**
```bash
# Skip checksum verification (not recommended)
# Or restore from different backup

# List all available backups
./restore-database.sh --list

# Try previous backup
./restore-database.sh --file /var/backups/roip/database/database-full-20251121-*.backup
```

### Off-site Upload Failures

**Problem:** S3 upload fails

**Check:**
```bash
# Test AWS credentials
aws sts get-caller-identity

# Test S3 access
aws s3 ls s3://roip-backups/

# Check network connectivity
ping s3.amazonaws.com
```

**Solutions:**
```bash
# Retry upload manually
aws s3 cp /var/backups/roip/database/database-full-*.backup \
  s3://roip-backups/production/database/

# Verify upload
aws s3 ls s3://roip-backups/production/database/
```

---

## Best Practices

### 1. Regular Testing

- **Monthly**: Run DR test drill
- **Quarterly**: Full system restore test
- **Annually**: Multi-region failover test

```bash
# Monthly DR test
./test-dr.sh --mode full

# Quarterly full restore test
./test-dr.sh --mode complete
```

### 2. Encryption Key Management

- Store encryption key in secure location
- Use hardware security module (HSM) in production
- Never commit keys to version control
- Rotate keys annually

```bash
# Generate new encryption key
openssl rand -base64 32 > /etc/roip/backup-encryption-key
chmod 600 /etc/roip/backup-encryption-key

# Backup old key before rotating
cp /etc/roip/backup-encryption-key /etc/roip/backup-encryption-key.old
```

### 3. Off-site Storage

- Always enable off-site backups
- Use multiple regions for redundancy
- Test restore from off-site regularly
- Monitor S3 bucket for changes

### 4. Monitoring

- Set up alerts for backup failures
- Monitor backup age (alert if >24 hours)
- Track backup sizes (alert on anomalies)
- Dashboard for backup status

### 5. Documentation

- Document all restore procedures
- Keep runbooks updated
- Train team on DR procedures
- Record all DR tests

### 6. Retention Policy

- Follow 3-2-1 rule:
  - 3 copies of data
  - 2 different media types
  - 1 copy off-site

### 7. Security

- Encrypt all backups
- Secure backup storage locations
- Audit backup access logs
- Implement least-privilege access

---

## Support and Resources

### Scripts Location
- `/home/user/MMDVM/scripts/` - All backup/restore scripts

### Configuration
- `/home/user/MMDVM/backup/backup-config.yaml` - Backup configuration
- `/home/user/MMDVM/backup/retention-policy.yaml` - Retention policy

### Logs
- `/home/user/MMDVM/logs/backup-*.log` - Backup logs
- `/home/user/MMDVM/logs/restore-*.log` - Restore logs
- `/home/user/MMDVM/logs/verify-*.log` - Verification logs

### Documentation
- `BACKUP_RECOVERY_GUIDE.md` - This guide
- `DR_TESTING_PROCEDURES.md` - DR testing procedures

### Emergency Contacts

- **System Administrator**: admin@roip.local
- **DBA**: dba@roip.local
- **Security Team**: security@roip.local
- **On-Call**: oncall@roip.local

---

**Document Version:** 1.0
**Last Review:** 2025-11-22
**Next Review:** 2026-02-22
