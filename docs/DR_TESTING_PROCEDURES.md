# Disaster Recovery Testing Procedures
## ESP32 RoIP System

**Version:** 1.0
**Last Updated:** 2025-11-22
**Status:** Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Test Objectives](#test-objectives)
3. [Test Schedule](#test-schedule)
4. [Test Modes](#test-modes)
5. [Pre-Test Checklist](#pre-test-checklist)
6. [Test Procedures](#test-procedures)
7. [Post-Test Activities](#post-test-activities)
8. [Test Metrics](#test-metrics)
9. [Reporting](#reporting)
10. [Continuous Improvement](#continuous-improvement)

---

## Overview

Disaster Recovery (DR) testing is critical to ensure that backup and recovery procedures work as expected when needed. This document outlines comprehensive testing procedures for the ESP32 RoIP System.

### Purpose

- Validate backup and restore procedures
- Verify RTO (Recovery Time Objective) and RPO (Recovery Point Objective)
- Identify gaps in DR procedures
- Train team on recovery processes
- Build confidence in DR capabilities

### Test Philosophy

> **"Hope is not a strategy. Test your backups!"**

Regular DR testing ensures that when disaster strikes, your team knows exactly what to do and has confidence that procedures will work.

---

## Test Objectives

### Primary Objectives

1. **Validate Backup Integrity**
   - Verify all backups are complete and not corrupted
   - Ensure encryption and compression work correctly
   - Confirm checksums match

2. **Verify Restore Functionality**
   - Test restoration of each component
   - Validate data integrity after restore
   - Ensure all dependencies are restored

3. **Measure Recovery Times**
   - Track actual RTO against target (4 hours)
   - Measure RPO against target (15 minutes)
   - Identify bottlenecks

4. **Test Failover Procedures**
   - Multi-region failover
   - Database replication
   - Service continuity

5. **Validate Documentation**
   - Verify procedures are accurate
   - Identify missing steps
   - Update runbooks

### Success Criteria

- ✅ All backups verified successfully
- ✅ Restore completes without errors
- ✅ Data integrity verified
- ✅ RTO met: Recovery < 4 hours
- ✅ RPO met: Data loss < 15 minutes
- ✅ All services operational after restore
- ✅ Team can execute procedures without assistance

---

## Test Schedule

### Monthly Tests

**When:** First Sunday of each month
**Duration:** 30-60 minutes
**Mode:** Quick

**Tests:**
- Backup verification
- Backup integrity checks
- Recovery point checks

```bash
# Monthly quick test
./test-dr.sh --mode quick
```

### Quarterly Tests

**When:** First Sunday of quarter
**Duration:** 1-2 hours
**Mode:** Full

**Tests:**
- Complete backup verification
- Database restore test
- Configuration restore test
- Service restart verification
- RTO/RPO measurements

```bash
# Quarterly full test
./test-dr.sh --mode full
```

### Annual Tests

**When:** Annually (recommended: January)
**Duration:** 3-4 hours
**Mode:** Complete

**Tests:**
- Full disaster recovery simulation
- Multi-region failover
- Complete system rebuild
- Team training exercise
- Runbook validation

```bash
# Annual complete test
./test-dr.sh --mode complete
```

### Ad-Hoc Tests

Perform after:
- Major system upgrades
- Infrastructure changes
- New team members onboarding
- After any production incidents

---

## Test Modes

### Quick Mode (5-10 minutes)

**Purpose:** Rapid validation of backup health

**Tests Performed:**
- Checksum verification
- Backup age check
- Storage space check
- Recent backup availability

**Command:**
```bash
./test-dr.sh --mode quick
```

**Expected Output:**
```
[INFO] TEST [1]: Backup Verification
[INFO] ✓ PASSED: Backup Verification (3s)
[INFO] TEST [2]: Backup Integrity
[INFO] ✓ PASSED: Backup Integrity (2s)
[INFO] TEST [3]: Recovery Point Objective (RPO)
[INFO] Latest backup age: 0h (Target: 1h)
[INFO] ✓ PASSED: Recovery Point Objective (1s)
```

### Full Mode (10-30 minutes)

**Purpose:** Comprehensive DR capability validation

**Tests Performed:**
- All quick mode tests
- Backup creation test
- Database restore test
- Configuration restore test
- Encryption verification
- Backup rotation check
- RTO measurement

**Command:**
```bash
./test-dr.sh --mode full
```

**Expected Output:**
```
[INFO] TEST [1]: Backup Creation
[INFO] ✓ PASSED: Backup Creation (45s)
[INFO] TEST [2]: Backup Verification
[INFO] ✓ PASSED: Backup Verification (5s)
[INFO] TEST [3]: Database Restore
[INFO] ✓ PASSED: Database Restore (30s)
...
[INFO] Tests Passed: 9/9
```

### Complete Mode (30-60 minutes)

**Purpose:** Full disaster recovery simulation

**Tests Performed:**
- All full mode tests
- Complete system restore
- Service restart verification
- Off-site backup access
- Multi-component restore
- Health checks
- Performance validation

**Command:**
```bash
./test-dr.sh --mode complete
```

**Expected Output:**
```
[INFO] Full Disaster Recovery Simulation
[INFO] Simulating complete system failure...
[INFO] ✓ PASSED: Full DR Simulation (120s)
[INFO] Recovery time: 180s (Target: 240s)
```

---

## Pre-Test Checklist

### Preparation (1 week before)

- [ ] Schedule test time with team
- [ ] Notify stakeholders of upcoming test
- [ ] Review current DR procedures
- [ ] Verify backup status
- [ ] Check storage capacity
- [ ] Confirm team availability
- [ ] Prepare test environment
- [ ] Review previous test results

### Environment Setup (1 day before)

- [ ] Verify all backups are up to date
- [ ] Check off-site backup accessibility
- [ ] Ensure test environment is available
- [ ] Prepare monitoring dashboards
- [ ] Set up logging
- [ ] Create test checklist
- [ ] Assign team roles

### Pre-Test Validation (1 hour before)

- [ ] Latest backup exists and is valid
- [ ] All scripts are executable
- [ ] Encryption keys are accessible
- [ ] Test environment is clean
- [ ] Network connectivity verified
- [ ] All team members ready
- [ ] Communication channels open

```bash
# Pre-test validation script
./scripts/verify-backups.sh --mode quick

# Check backup age
find /var/backups/roip -name "*.backup" -mtime -1

# Verify scripts
ls -lh /home/user/MMDVM/scripts/*.sh

# Test environment check
./test-dr.sh --dry-run
```

---

## Test Procedures

### Procedure 1: Backup Integrity Test

**Objective:** Verify all backups are valid and restorable

**Duration:** 5-10 minutes

**Steps:**

1. **Run verification script**
   ```bash
   cd /home/user/MMDVM/scripts
   ./verify-backups.sh --mode full
   ```

2. **Review output**
   - Check for any failed verifications
   - Verify checksum matches
   - Confirm no corrupted files

3. **Document results**
   - Number of backups checked
   - Any failures
   - Total backup size

**Pass Criteria:**
- All backups pass checksum verification
- No corrupted files detected
- Backup coverage is complete

**Expected Time:** ~5 minutes

---

### Procedure 2: Database Restore Test

**Objective:** Verify database can be restored successfully

**Duration:** 10-15 minutes

**Steps:**

1. **Create test database**
   ```bash
   # Create test data
   sqlite3 /tmp/test-restore.db <<EOF
   CREATE TABLE test (id INTEGER PRIMARY KEY, data TEXT);
   INSERT INTO test VALUES (1, 'test data');
   INSERT INTO test VALUES (2, 'more data');
   EOF
   ```

2. **Backup test database**
   ```bash
   SQLITE_DB_PATH=/tmp/test-restore.db \
   BACKUP_BASE_DIR=/tmp/test-backup \
   ./backup-database.sh
   ```

3. **Remove original database**
   ```bash
   rm -f /tmp/test-restore.db
   ```

4. **Restore from backup**
   ```bash
   BACKUP_BASE_DIR=/tmp/test-backup \
   SQLITE_DB_PATH=/tmp/test-restore.db \
   ./restore-database.sh --force
   ```

5. **Verify data integrity**
   ```bash
   sqlite3 /tmp/test-restore.db "SELECT * FROM test;"
   ```

6. **Cleanup**
   ```bash
   rm -rf /tmp/test-restore.db /tmp/test-backup
   ```

**Pass Criteria:**
- Database restores without errors
- All data is intact
- Table structure preserved
- Indexes and constraints restored

**Expected Time:** ~10 minutes

---

### Procedure 3: Configuration Restore Test

**Objective:** Verify configuration files can be restored

**Duration:** 5-10 minutes

**Steps:**

1. **List current backups**
   ```bash
   ./restore-config.sh --list
   ```

2. **Dry run restore**
   ```bash
   ./restore-config.sh --dry-run
   ```

3. **Review dry run output**
   - Check what would be restored
   - Verify file paths
   - Confirm no conflicts

4. **Test restore to temporary location**
   ```bash
   # Restore to test directory
   RESTORE_DIR=/tmp/config-restore-test
   ./restore-config.sh --dry-run > /tmp/restore-test.log
   ```

5. **Verify results**
   ```bash
   cat /tmp/restore-test.log
   ```

**Pass Criteria:**
- Config restore completes successfully
- All config files present
- No permission errors
- Secrets handled correctly (if included)

**Expected Time:** ~5 minutes

---

### Procedure 4: RTO Measurement Test

**Objective:** Measure actual recovery time and compare to target

**Duration:** 15-30 minutes

**Steps:**

1. **Record start time**
   ```bash
   START_TIME=$(date +%s)
   ```

2. **Simulate system failure**
   ```bash
   # Stop services
   systemctl stop roip-server
   ```

3. **Perform full restore**
   ```bash
   ./restore-full.sh --dry-run
   ```

4. **Record end time**
   ```bash
   END_TIME=$(date +%s)
   DURATION=$((END_TIME - START_TIME))
   echo "Recovery time: ${DURATION}s"
   ```

5. **Calculate RTO**
   ```bash
   RTO_HOURS=$(echo "scale=2; $DURATION / 3600" | bc)
   echo "RTO: ${RTO_HOURS} hours"
   ```

6. **Compare to target**
   - Target: 4 hours
   - Actual: Calculated above

**Pass Criteria:**
- Recovery time < 4 hours (14,400 seconds)
- All critical services restored
- System functional after restore

**Expected Time:** ~15 minutes (dry run)
**Actual Recovery:** ~30-60 minutes (real restore)

---

### Procedure 5: RPO Verification Test

**Objective:** Verify recovery point objective is met

**Duration:** 2-5 minutes

**Steps:**

1. **Check latest backup age**
   ```bash
   LATEST_BACKUP=$(find /var/backups/roip/database -name "database-*.backup" \
     -type f -printf '%T@ %p\n' | sort -rn | head -n1 | cut -d' ' -f2-)

   BACKUP_AGE=$(( $(date +%s) - $(stat -c%Y "$LATEST_BACKUP") ))
   BACKUP_AGE_MINUTES=$(( BACKUP_AGE / 60 ))

   echo "Latest backup age: ${BACKUP_AGE_MINUTES} minutes"
   ```

2. **Compare to RPO target**
   - Target: 15 minutes
   - Actual: Calculated above

3. **Verify backup frequency**
   ```bash
   # List recent backups
   find /var/backups/roip/database -name "database-*.backup" -mtime -1 -ls
   ```

**Pass Criteria:**
- Latest backup < 15 minutes old
- Regular backup schedule maintained
- No gaps in backup coverage

**Expected Time:** ~2 minutes

---

### Procedure 6: Full DR Simulation

**Objective:** Simulate complete disaster and recovery

**Duration:** 1-2 hours

**Steps:**

1. **Pre-simulation snapshot**
   ```bash
   # Document current state
   systemctl status roip-server > /tmp/pre-dr-state.txt
   sqlite3 /home/user/MMDVM/roip-server/data/roip.db \
     "SELECT COUNT(*) FROM sqlite_master;" >> /tmp/pre-dr-state.txt
   ```

2. **Simulate disaster**
   ```bash
   # Stop all services
   systemctl stop roip-server
   docker-compose down

   # Move current data to backup (don't delete!)
   mv /home/user/MMDVM/roip-server/data \
      /home/user/MMDVM/roip-server/data.pre-dr
   ```

3. **Begin recovery**
   ```bash
   START_TIME=$(date +%s)

   # Full system restore
   ./restore-full.sh --restore-secrets

   END_TIME=$(date +%s)
   ```

4. **Verify recovery**
   ```bash
   # Check services
   systemctl status roip-server

   # Verify database
   sqlite3 /home/user/MMDVM/roip-server/data/roip.db \
     "SELECT COUNT(*) FROM sqlite_master;"

   # Test API
   curl http://localhost:8080/health
   ```

5. **Measure recovery time**
   ```bash
   DURATION=$((END_TIME - START_TIME))
   echo "Total recovery time: ${DURATION}s ($(($DURATION / 60)) minutes)"
   ```

6. **Cleanup**
   ```bash
   # Remove pre-DR backup if recovery successful
   rm -rf /home/user/MMDVM/roip-server/data.pre-dr
   ```

**Pass Criteria:**
- All services start successfully
- Database fully restored
- Configuration intact
- No data loss
- Recovery time < 4 hours
- System fully operational

**Expected Time:** ~1-2 hours

---

## Post-Test Activities

### Immediate (Within 1 hour)

1. **Restore production state**
   - Ensure all services running
   - Verify system operational
   - Check monitoring dashboards

2. **Initial assessment**
   - Review test results
   - Identify any failures
   - Document unexpected issues

3. **Quick debrief**
   - Team discussion
   - Initial lessons learned
   - Urgent action items

### Short-term (Within 1 day)

1. **Generate test report**
   ```bash
   # DR test report is auto-generated
   cat /home/user/MMDVM/logs/dr-test-report-*.txt
   ```

2. **Document findings**
   - Test metrics
   - Issues encountered
   - Recommendations

3. **Update procedures**
   - Fix documentation errors
   - Add missing steps
   - Update runbooks

### Long-term (Within 1 week)

1. **Formal report**
   - Executive summary
   - Detailed findings
   - Action items with owners

2. **Training updates**
   - Update training materials
   - Schedule team training
   - Share lessons learned

3. **Process improvements**
   - Implement recommendations
   - Update automation
   - Enhance monitoring

---

## Test Metrics

### Key Performance Indicators (KPIs)

1. **Recovery Time Objective (RTO)**
   - Target: < 4 hours
   - Measure: Actual recovery time
   - Status: Green < 4h, Yellow 4-6h, Red > 6h

2. **Recovery Point Objective (RPO)**
   - Target: < 15 minutes
   - Measure: Age of latest backup
   - Status: Green < 15m, Yellow 15-60m, Red > 60m

3. **Backup Success Rate**
   - Target: > 99%
   - Measure: Successful backups / Total attempts
   - Status: Green > 99%, Yellow 95-99%, Red < 95%

4. **Backup Verification Rate**
   - Target: 100%
   - Measure: Verified backups / Total backups
   - Status: Green 100%, Yellow > 95%, Red < 95%

5. **Restore Success Rate**
   - Target: 100%
   - Measure: Successful restores / Total attempts
   - Status: Green 100%, Yellow > 90%, Red < 90%

### Tracking Metrics

```javascript
// Example metrics collection
const metrics = {
  testDate: new Date(),
  testMode: 'full',
  testDuration: 3600, // seconds

  backups: {
    total: 42,
    verified: 42,
    failed: 0,
    averageAge: 360 // seconds
  },

  restore: {
    attempted: 3,
    successful: 3,
    failed: 0,
    averageDuration: 180 // seconds
  },

  rto: {
    target: 14400, // 4 hours in seconds
    actual: 3600,
    status: 'green'
  },

  rpo: {
    target: 900, // 15 minutes in seconds
    actual: 360,
    status: 'green'
  }
};
```

---

## Reporting

### Test Report Template

```markdown
# DR Test Report

## Test Information
- **Date**: 2025-11-22
- **Test Mode**: Full
- **Duration**: 45 minutes
- **Conducted By**: Operations Team

## Results Summary
- **Overall Status**: ✅ PASSED
- **Tests Executed**: 9
- **Tests Passed**: 9
- **Tests Failed**: 0

## Metrics
- **RTO**: 30 minutes (Target: 4 hours) ✅
- **RPO**: 5 minutes (Target: 15 minutes) ✅
- **Backup Success Rate**: 100% ✅
- **Restore Success Rate**: 100% ✅

## Issues Found
None

## Recommendations
1. Continue monthly testing schedule
2. Document successful procedures
3. Consider reducing RPO target to 5 minutes

## Next Test
- **Scheduled**: 2025-12-22
- **Type**: Quick

## Sign-off
- **Tested By**: John Doe
- **Reviewed By**: Jane Smith
- **Approved By**: Bob Johnson
```

### Automated Reporting

```bash
# Generate automated report
./test-dr.sh --mode full > /tmp/dr-test-results.txt

# Email report
mail -s "DR Test Results - $(date +%Y-%m-%d)" \
  admin@roip.local < /tmp/dr-test-results.txt
```

---

## Continuous Improvement

### After Each Test

1. **Review and Update**
   - Update procedures based on findings
   - Fix documentation issues
   - Improve automation

2. **Team Feedback**
   - Collect team input
   - Identify pain points
   - Suggest improvements

3. **Metrics Analysis**
   - Track trends over time
   - Identify degradation
   - Celebrate improvements

### Quarterly Review

- Review all test results
- Analyze trends
- Update DR strategy
- Adjust RTO/RPO targets
- Plan improvements

### Annual Assessment

- Comprehensive DR review
- External audit
- Benchmark against industry
- Major process updates
- Budget planning

---

## Test Execution Checklist

Use this checklist during DR tests:

```
Pre-Test:
□ Team briefed
□ Stakeholders notified
□ Environment prepared
□ Backups verified
□ Scripts tested
□ Roles assigned

During Test:
□ Start time recorded
□ Each step documented
□ Issues logged
□ Metrics collected
□ Screenshots captured
□ Communication maintained

Post-Test:
□ End time recorded
□ System restored
□ Results documented
□ Report generated
□ Team debriefed
□ Action items assigned

Follow-up:
□ Report distributed
□ Procedures updated
□ Training scheduled
□ Next test planned
```

---

## Emergency Contacts

### During DR Tests

- **Test Lead**: operations@roip.local
- **Database Admin**: dba@roip.local
- **System Admin**: sysadmin@roip.local
- **Security**: security@roip.local

### Escalation

- **Level 1**: Operations Team
- **Level 2**: Engineering Lead
- **Level 3**: CTO
- **External**: Cloud Provider Support

---

**Document Version:** 1.0
**Last Review:** 2025-11-22
**Next Review:** 2026-02-22
**Owner:** Operations Team
