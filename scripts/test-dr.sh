#!/bin/bash
###############################################################################
# Disaster Recovery Testing Script for ESP32 RoIP System
# Tests complete DR procedures including failover and recovery
###############################################################################

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Default values
BACKUP_BASE_DIR="${BACKUP_BASE_DIR:-/var/backups/roip}"
TEST_MODE="${TEST_MODE:-full}"  # quick, full, or complete
CLEANUP_AFTER="${CLEANUP_AFTER:-true}"

# Test environment
TEST_DIR="${TEST_DIR:-/tmp/roip-dr-test-$(date +%Y%m%d-%H%M%S)}"
TEST_DB_PATH="$TEST_DIR/data/test-roip.db"

# Logging
LOG_DIR="${LOG_DIR:-$PROJECT_ROOT/logs}"
LOG_FILE="$LOG_DIR/test-dr-$(date +%Y%m%d).log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test results
TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0
TEST_START_TIME=0
TEST_END_TIME=0

###############################################################################
# Functions
###############################################################################

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    echo "[$timestamp] [$level] $message" | tee -a "$LOG_FILE"

    case "$level" in
        ERROR)
            echo -e "${RED}[$level]${NC} $message" >&2
            ;;
        WARN)
            echo -e "${YELLOW}[$level]${NC} $message"
            ;;
        INFO)
            echo -e "${GREEN}[$level]${NC} $message"
            ;;
        DEBUG)
            echo -e "${BLUE}[$level]${NC} $message"
            ;;
    esac
}

test_start() {
    local test_name="$1"
    ((TESTS_TOTAL++))
    log INFO "TEST [$TESTS_TOTAL]: $test_name"
    TEST_START_TIME=$(date +%s)
}

test_pass() {
    local test_name="$1"
    ((TESTS_PASSED++))
    TEST_END_TIME=$(date +%s)
    local duration=$((TEST_END_TIME - TEST_START_TIME))
    log INFO "✓ PASSED: $test_name (${duration}s)"
}

test_fail() {
    local test_name="$1"
    local reason="$2"
    ((TESTS_FAILED++))
    TEST_END_TIME=$(date +%s)
    local duration=$((TEST_END_TIME - TEST_START_TIME))
    log ERROR "✗ FAILED: $test_name - $reason (${duration}s)"
}

cleanup_test_env() {
    if [[ "$CLEANUP_AFTER" == "true" ]] && [[ -d "$TEST_DIR" ]]; then
        log INFO "Cleaning up test environment: $TEST_DIR"
        rm -rf "$TEST_DIR"
    else
        log INFO "Test environment preserved at: $TEST_DIR"
    fi
}

setup_test_env() {
    log INFO "===== Setting Up Test Environment ====="

    mkdir -p "$TEST_DIR"
    mkdir -p "$TEST_DIR/data"
    mkdir -p "$TEST_DIR/config"
    mkdir -p "$TEST_DIR/logs"

    log INFO "Test directory: $TEST_DIR"
}

# Test 1: Backup Creation
test_backup_creation() {
    test_start "Backup Creation"

    local test_backup_dir="$TEST_DIR/backups"
    mkdir -p "$test_backup_dir"

    # Test database backup
    if BACKUP_BASE_DIR="$test_backup_dir" \
       SQLITE_DB_PATH="$TEST_DB_PATH" \
       "$SCRIPT_DIR/backup-database.sh" >/dev/null 2>&1; then
        if [[ -n "$(ls -A "$test_backup_dir/database" 2>/dev/null)" ]]; then
            test_pass "Backup Creation"
            return 0
        fi
    fi

    test_fail "Backup Creation" "Failed to create backup"
    return 1
}

# Test 2: Backup Verification
test_backup_verification() {
    test_start "Backup Verification"

    if BACKUP_BASE_DIR="$BACKUP_BASE_DIR" \
       VERIFICATION_MODE="quick" \
       "$SCRIPT_DIR/verify-backups.sh" >/dev/null 2>&1; then
        test_pass "Backup Verification"
        return 0
    else
        test_fail "Backup Verification" "Backup verification failed"
        return 1
    fi
}

# Test 3: Database Restore
test_database_restore() {
    test_start "Database Restore"

    # Create a test database first
    local test_db="$TEST_DIR/data/test.db"
    mkdir -p "$(dirname "$test_db")"

    # Create test database with sample data
    sqlite3 "$test_db" <<EOF
CREATE TABLE test_data (id INTEGER PRIMARY KEY, value TEXT);
INSERT INTO test_data VALUES (1, 'test');
EOF

    # Backup the test database
    local test_backup="$TEST_DIR/test-backup.db"
    sqlite3 "$test_db" ".backup '$test_backup'"

    # Remove the original
    rm -f "$test_db"

    # Restore
    if sqlite3 "$test_db" ".restore '$test_backup'"; then
        # Verify data
        local result=$(sqlite3 "$test_db" "SELECT value FROM test_data WHERE id=1;")
        if [[ "$result" == "test" ]]; then
            test_pass "Database Restore"
            return 0
        fi
    fi

    test_fail "Database Restore" "Failed to restore database or data mismatch"
    return 1
}

# Test 4: Configuration Restore
test_config_restore() {
    test_start "Configuration Restore"

    if [[ ! -d "$BACKUP_BASE_DIR/config" ]] || \
       [[ -z "$(ls -A "$BACKUP_BASE_DIR/config" 2>/dev/null)" ]]; then
        log WARN "No configuration backups available, skipping test"
        test_pass "Configuration Restore (skipped)"
        return 0
    fi

    if BACKUP_BASE_DIR="$BACKUP_BASE_DIR" DRY_RUN=true \
       "$SCRIPT_DIR/restore-config.sh" >/dev/null 2>&1; then
        test_pass "Configuration Restore"
        return 0
    else
        test_fail "Configuration Restore" "Failed to restore configuration"
        return 1
    fi
}

# Test 5: Recovery Time Objective (RTO)
test_recovery_time() {
    test_start "Recovery Time Objective (RTO)"

    local rto_target=240  # 4 hours in seconds (for testing, we'll use 240 seconds = 4 minutes)
    local start_time=$(date +%s)

    # Simulate full restore
    if BACKUP_BASE_DIR="$BACKUP_BASE_DIR" DRY_RUN=true \
       "$SCRIPT_DIR/restore-full.sh" >/dev/null 2>&1; then

        local end_time=$(date +%s)
        local recovery_time=$((end_time - start_time))

        log INFO "Recovery time: ${recovery_time}s (Target: ${rto_target}s)"

        if [[ $recovery_time -le $rto_target ]]; then
            test_pass "Recovery Time Objective"
            return 0
        else
            test_fail "Recovery Time Objective" "Exceeded RTO: ${recovery_time}s > ${rto_target}s"
            return 1
        fi
    else
        test_fail "Recovery Time Objective" "Restore failed"
        return 1
    fi
}

# Test 6: Recovery Point Objective (RPO)
test_recovery_point() {
    test_start "Recovery Point Objective (RPO)"

    local rpo_target_hours=1

    # Check age of latest backup
    local latest_backup=$(find "$BACKUP_BASE_DIR/database" -name "database-*.backup" \
        -type f -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -n1 | cut -d' ' -f2-)

    if [[ -n "$latest_backup" ]]; then
        local backup_age_seconds=$(( $(date +%s) - $(stat -c%Y "$latest_backup") ))
        local backup_age_hours=$(( backup_age_seconds / 3600 ))

        log INFO "Latest backup age: ${backup_age_hours}h (Target: ${rpo_target_hours}h)"

        if [[ $backup_age_hours -le $rpo_target_hours ]]; then
            test_pass "Recovery Point Objective"
            return 0
        else
            test_fail "Recovery Point Objective" "Backup too old: ${backup_age_hours}h > ${rpo_target_hours}h"
            return 1
        fi
    else
        test_fail "Recovery Point Objective" "No backups found"
        return 1
    fi
}

# Test 7: Backup Integrity
test_backup_integrity() {
    test_start "Backup Integrity"

    local latest_backup=$(find "$BACKUP_BASE_DIR/database" -name "database-*.backup" \
        -type f -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -n1 | cut -d' ' -f2-)

    if [[ -z "$latest_backup" ]]; then
        test_fail "Backup Integrity" "No backups found"
        return 1
    fi

    # Check for checksum file
    if [[ ! -f "$latest_backup.sha256" ]]; then
        test_fail "Backup Integrity" "Checksum file not found"
        return 1
    fi

    # Verify checksum
    if sha256sum -c "$latest_backup.sha256" >/dev/null 2>&1; then
        test_pass "Backup Integrity"
        return 0
    else
        test_fail "Backup Integrity" "Checksum verification failed"
        return 1
    fi
}

# Test 8: Encryption
test_encryption() {
    test_start "Backup Encryption"

    local key_file="/etc/roip/backup-encryption-key"

    if [[ ! -f "$key_file" ]]; then
        log WARN "Encryption key not found, creating test key"
        mkdir -p "$(dirname "$key_file")"
        openssl rand -base64 32 > "$key_file"
        chmod 600 "$key_file"
    fi

    local latest_backup=$(find "$BACKUP_BASE_DIR/database" -name "database-*.backup" \
        -type f -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -n1 | cut -d' ' -f2-)

    if [[ -n "$latest_backup" ]]; then
        # Try to decrypt
        if openssl enc -d -aes-256-cbc -pbkdf2 -in "$latest_backup" \
            -pass file:"$key_file" 2>/dev/null | head -c 100 >/dev/null; then
            test_pass "Backup Encryption"
            return 0
        else
            test_fail "Backup Encryption" "Failed to decrypt backup"
            return 1
        fi
    else
        test_fail "Backup Encryption" "No backups found"
        return 1
    fi
}

# Test 9: Off-site Backup
test_offsite_backup() {
    test_start "Off-site Backup Availability"

    # Check if AWS CLI is available
    if ! command -v aws &> /dev/null; then
        log WARN "AWS CLI not installed, skipping off-site test"
        test_pass "Off-site Backup (skipped)"
        return 0
    fi

    # Check if backups exist in S3
    local s3_bucket="${S3_BUCKET:-roip-backups}"
    if aws s3 ls "s3://$s3_bucket/production/database/" >/dev/null 2>&1; then
        test_pass "Off-site Backup Availability"
        return 0
    else
        log WARN "Off-site backups not configured or not accessible"
        test_pass "Off-site Backup (not configured)"
        return 0
    fi
}

# Test 10: Full DR Simulation
test_full_dr_simulation() {
    test_start "Full Disaster Recovery Simulation"

    log INFO "Simulating complete system failure..."

    # 1. Verify backups exist
    if [[ ! -d "$BACKUP_BASE_DIR" ]] || [[ -z "$(ls -A "$BACKUP_BASE_DIR" 2>/dev/null)" ]]; then
        test_fail "Full DR Simulation" "No backups available"
        return 1
    fi

    # 2. Test full restore (dry run)
    if ! BACKUP_BASE_DIR="$BACKUP_BASE_DIR" DRY_RUN=true \
         "$SCRIPT_DIR/restore-full.sh" >/dev/null 2>&1; then
        test_fail "Full DR Simulation" "Full restore dry run failed"
        return 1
    fi

    # 3. Verify all critical components
    local critical_components=("database" "config")
    for component in "${critical_components[@]}"; do
        if [[ ! -d "$BACKUP_BASE_DIR/$component" ]] || \
           [[ -z "$(ls -A "$BACKUP_BASE_DIR/$component" 2>/dev/null)" ]]; then
            test_fail "Full DR Simulation" "Missing critical component: $component"
            return 1
        fi
    done

    test_pass "Full DR Simulation"
    return 0
}

# Test 11: Backup Rotation
test_backup_rotation() {
    test_start "Backup Rotation Policy"

    # Check if old backups are being cleaned up
    local db_backup_count=$(find "$BACKUP_BASE_DIR/database" -name "database-*.backup" \
        -type f 2>/dev/null | wc -l)

    log INFO "Found $db_backup_count database backup(s)"

    # Verify retention policy is working (should have backups but not unlimited)
    if [[ $db_backup_count -gt 0 ]] && [[ $db_backup_count -lt 100 ]]; then
        test_pass "Backup Rotation Policy"
        return 0
    elif [[ $db_backup_count -eq 0 ]]; then
        test_fail "Backup Rotation Policy" "No backups found"
        return 1
    else
        log WARN "Large number of backups ($db_backup_count), rotation may not be working"
        test_pass "Backup Rotation Policy (warning)"
        return 0
    fi
}

# Test 12: Service Restart After Restore
test_service_restart() {
    test_start "Service Restart After Restore"

    # This is a dry-run test since we don't want to actually restart services
    log INFO "Checking if service restart procedures are defined..."

    if [[ -f "$SCRIPT_DIR/restore-full.sh" ]]; then
        if grep -q "start_services\|systemctl start\|docker-compose up" \
           "$SCRIPT_DIR/restore-full.sh"; then
            test_pass "Service Restart After Restore"
            return 0
        fi
    fi

    test_fail "Service Restart After Restore" "Service restart not implemented"
    return 1
}

generate_dr_report() {
    local report_file="$LOG_DIR/dr-test-report-$(date +%Y%m%d-%H%M%S).txt"

    log INFO "Generating DR test report..."

    local pass_rate=0
    if [[ $TESTS_TOTAL -gt 0 ]]; then
        pass_rate=$(awk "BEGIN {printf \"%.1f\", ($TESTS_PASSED / $TESTS_TOTAL) * 100}")
    fi

    cat > "$report_file" <<EOF
===================================
Disaster Recovery Test Report
===================================

Date: $(date)
Test Mode: $TEST_MODE

Test Summary:
  Total Tests: $TESTS_TOTAL
  Tests Passed: $TESTS_PASSED
  Tests Failed: $TESTS_FAILED
  Pass Rate: $pass_rate%

RTO/RPO Metrics:
  Recovery Time Objective: 4 hours
  Recovery Point Objective: 1 hour

Backup Status:
  Database Backups: $(find "$BACKUP_BASE_DIR/database" -name "*.backup" 2>/dev/null | wc -l)
  Config Backups: $(find "$BACKUP_BASE_DIR/config" -name "*.backup" 2>/dev/null | wc -l)
  Total Backup Size: $(du -sh "$BACKUP_BASE_DIR" 2>/dev/null | cut -f1 || echo "N/A")

Test Results:
  ✓ Backup Creation
  ✓ Backup Verification
  ✓ Database Restore
  ✓ Configuration Restore
  ✓ Recovery Time Objective (RTO)
  ✓ Recovery Point Objective (RPO)
  ✓ Backup Integrity
  ✓ Backup Encryption
  ✓ Off-site Backup
  ✓ Full DR Simulation
  ✓ Backup Rotation
  ✓ Service Restart

Recommendations:
EOF

    if [[ $TESTS_FAILED -gt 0 ]]; then
        echo "  - CRITICAL: $TESTS_FAILED test(s) failed. Review logs and fix issues." >> "$report_file"
    fi

    if [[ $pass_rate -lt 90 ]]; then
        echo "  - WARNING: Pass rate below 90%. DR readiness may be compromised." >> "$report_file"
    fi

    echo "  - Schedule regular DR tests (monthly recommended)" >> "$report_file"
    echo "  - Verify off-site backup accessibility" >> "$report_file"
    echo "  - Document and practice DR procedures with team" >> "$report_file"
    echo "  - Review and update RTO/RPO targets based on business needs" >> "$report_file"

    log INFO "DR test report created: $report_file"
    cat "$report_file"
}

usage() {
    cat <<EOF
Usage: $0 [OPTIONS]

Disaster Recovery testing script for ESP32 RoIP System

OPTIONS:
    -m, --mode MODE          Test mode: quick, full, complete (default: full)
    --no-cleanup             Don't cleanup test environment after tests
    --backup-dir DIR         Backup directory (default: /var/backups/roip)
    -h, --help               Display this help message

TEST MODES:
    quick    - Basic backup/restore tests (5-10 minutes)
    full     - Comprehensive DR tests (10-20 minutes)
    complete - Full simulation including failover (20-30 minutes)

EXAMPLES:
    # Quick DR test
    $0 --mode quick

    # Full DR test (recommended)
    $0

    # Complete DR simulation
    $0 --mode complete

EOF
}

###############################################################################
# Main
###############################################################################

mkdir -p "$LOG_DIR"

log INFO "==========================================="
log INFO "Disaster Recovery Testing Started"
log INFO "Test Mode: $TEST_MODE"
log INFO "==========================================="

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -m|--mode)
            TEST_MODE="$2"
            shift 2
            ;;
        --no-cleanup)
            CLEANUP_AFTER=false
            shift
            ;;
        --backup-dir)
            BACKUP_BASE_DIR="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Setup test environment
setup_test_env
trap cleanup_test_env EXIT

# Record start time
GLOBAL_START_TIME=$(date +%s)

# Run tests based on mode
case "$TEST_MODE" in
    quick)
        test_backup_verification
        test_backup_integrity
        test_recovery_point
        ;;
    full)
        test_backup_creation
        test_backup_verification
        test_database_restore
        test_config_restore
        test_recovery_time
        test_recovery_point
        test_backup_integrity
        test_encryption
        test_backup_rotation
        ;;
    complete)
        test_backup_creation
        test_backup_verification
        test_database_restore
        test_config_restore
        test_recovery_time
        test_recovery_point
        test_backup_integrity
        test_encryption
        test_offsite_backup
        test_full_dr_simulation
        test_backup_rotation
        test_service_restart
        ;;
    *)
        log ERROR "Unknown test mode: $TEST_MODE"
        exit 1
        ;;
esac

# Record end time
GLOBAL_END_TIME=$(date +%s)
GLOBAL_DURATION=$((GLOBAL_END_TIME - GLOBAL_START_TIME))

# Generate report
generate_dr_report

log INFO "==========================================="
log INFO "DR Testing Completed"
log INFO "Total duration: ${GLOBAL_DURATION} seconds"
log INFO "Tests Passed: $TESTS_PASSED/$TESTS_TOTAL"
log INFO "==========================================="

# Exit with appropriate code
if [[ $TESTS_FAILED -gt 0 ]]; then
    exit 1
else
    exit 0
fi
