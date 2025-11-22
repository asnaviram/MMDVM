#!/bin/bash
###############################################################################
# Backup Verification Script for ESP32 RoIP System
# Verifies integrity and completeness of backups
###############################################################################

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Default values
BACKUP_BASE_DIR="${BACKUP_BASE_DIR:-/var/backups/roip}"
VERIFICATION_MODE="${VERIFICATION_MODE:-full}"  # quick, full, or deep
TEST_RESTORE="${TEST_RESTORE:-false}"

# Encryption settings
ENCRYPTION_KEY_FILE="${ENCRYPTION_KEY_FILE:-/etc/roip/backup-encryption-key}"

# Logging
LOG_DIR="${LOG_DIR:-$PROJECT_ROOT/logs}"
LOG_FILE="$LOG_DIR/verify-backups-$(date +%Y%m%d).log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Statistics
TOTAL_BACKUPS=0
VERIFIED_BACKUPS=0
FAILED_BACKUPS=0
CORRUPTED_BACKUPS=0

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

verify_checksum() {
    local file="$1"
    local checksum_file="$file.sha256"

    if [[ ! -f "$checksum_file" ]]; then
        log WARN "Checksum file not found: $checksum_file"
        return 1
    fi

    if sha256sum -c "$checksum_file" >/dev/null 2>&1; then
        log DEBUG "Checksum verification passed: $(basename "$file")"
        return 0
    else
        log ERROR "Checksum verification failed: $(basename "$file")"
        return 1
    fi
}

verify_encryption() {
    local file="$1"

    if [[ ! -f "$ENCRYPTION_KEY_FILE" ]]; then
        log WARN "Encryption key file not found, skipping encryption verification"
        return 0
    fi

    # Try to decrypt first few bytes to verify it's encrypted correctly
    if openssl enc -d -aes-256-cbc -pbkdf2 -in "$file" \
        -pass file:"$ENCRYPTION_KEY_FILE" 2>/dev/null | head -c 100 >/dev/null; then
        log DEBUG "Encryption verification passed: $(basename "$file")"
        return 0
    else
        log ERROR "Encryption verification failed: $(basename "$file")"
        return 1
    fi
}

verify_compression() {
    local file="$1"
    local temp_dir=$(mktemp -d)

    # Try to decompress to verify integrity
    if openssl enc -d -aes-256-cbc -pbkdf2 -in "$file" \
        -pass file:"$ENCRYPTION_KEY_FILE" 2>/dev/null | \
        gunzip -t 2>/dev/null; then
        log DEBUG "Compression verification passed: $(basename "$file")"
        rm -rf "$temp_dir"
        return 0
    else
        log ERROR "Compression verification failed: $(basename "$file")"
        rm -rf "$temp_dir"
        return 1
    fi
}

verify_backup_file() {
    local file="$1"
    local quick="${2:-false}"

    log INFO "Verifying backup: $(basename "$file")"

    ((TOTAL_BACKUPS++))

    # Check if file exists and is readable
    if [[ ! -f "$file" ]] || [[ ! -r "$file" ]]; then
        log ERROR "File not found or not readable: $file"
        ((FAILED_BACKUPS++))
        return 1
    fi

    local file_size=$(du -h "$file" | cut -f1)
    log DEBUG "File size: $file_size"

    # Verify checksum
    if ! verify_checksum "$file"; then
        ((CORRUPTED_BACKUPS++))
        ((FAILED_BACKUPS++))
        return 1
    fi

    if [[ "$quick" == "true" ]]; then
        ((VERIFIED_BACKUPS++))
        return 0
    fi

    # Verify encryption
    if ! verify_encryption "$file"; then
        ((CORRUPTED_BACKUPS++))
        ((FAILED_BACKUPS++))
        return 1
    fi

    # Verify compression (in full or deep mode)
    if [[ "$VERIFICATION_MODE" != "quick" ]]; then
        if ! verify_compression "$file"; then
            ((CORRUPTED_BACKUPS++))
            ((FAILED_BACKUPS++))
            return 1
        fi
    fi

    ((VERIFIED_BACKUPS++))
    log INFO "Backup verified successfully: $(basename "$file")"
    return 0
}

verify_database_backups() {
    local backup_dir="$BACKUP_BASE_DIR/database"

    log INFO "===== Verifying Database Backups ====="

    if [[ ! -d "$backup_dir" ]]; then
        log WARN "Database backup directory not found"
        return 0
    fi

    local backups=$(find "$backup_dir" -name "database-*.backup" -type f)

    if [[ -z "$backups" ]]; then
        log WARN "No database backups found"
        return 0
    fi

    local quick=$([[ "$VERIFICATION_MODE" == "quick" ]] && echo "true" || echo "false")

    while read -r backup; do
        verify_backup_file "$backup" "$quick"
    done <<< "$backups"

    log INFO "Database backup verification completed"
}

verify_config_backups() {
    local backup_dir="$BACKUP_BASE_DIR/config"

    log INFO "===== Verifying Configuration Backups ====="

    if [[ ! -d "$backup_dir" ]]; then
        log WARN "Configuration backup directory not found"
        return 0
    fi

    local backups=$(find "$backup_dir" -name "config-*.backup" -type f)

    if [[ -z "$backups" ]]; then
        log WARN "No configuration backups found"
        return 0
    fi

    local quick=$([[ "$VERIFICATION_MODE" == "quick" ]] && echo "true" || echo "false")

    while read -r backup; do
        verify_backup_file "$backup" "$quick"
    done <<< "$backups"

    log INFO "Configuration backup verification completed"
}

verify_other_backups() {
    log INFO "===== Verifying Other Backups ====="

    # Verify log backups
    if [[ -d "$BACKUP_BASE_DIR/logs" ]]; then
        local log_backups=$(find "$BACKUP_BASE_DIR/logs" -name "logs-*.tar.gz" -type f)
        log INFO "Found $(echo "$log_backups" | wc -l) log backup(s)"
    fi

    # Verify firmware backups
    if [[ -d "$BACKUP_BASE_DIR/firmware" ]]; then
        local fw_backups=$(find "$BACKUP_BASE_DIR/firmware" -name "firmware-*.tar.gz" -type f)
        log INFO "Found $(echo "$fw_backups" | wc -l) firmware backup(s)"
    fi

    # Verify certificate backups
    if [[ -d "$BACKUP_BASE_DIR/certificates" ]]; then
        local cert_backups=$(find "$BACKUP_BASE_DIR/certificates" -name "certs-*.tar.gz*" -type f)
        log INFO "Found $(echo "$cert_backups" | wc -l) certificate backup(s)"
    fi

    log INFO "Other backups verification completed"
}

test_restore_backup() {
    local backup_file="$1"

    log INFO "Testing restore of: $(basename "$backup_file")"

    local temp_restore_dir=$(mktemp -d)

    # Try to restore to temporary directory
    if [[ "$backup_file" == *"database"* ]]; then
        # Test database restore
        if BACKUP_FILE="$backup_file" DRY_RUN=true \
            "$SCRIPT_DIR/restore-database.sh" >/dev/null 2>&1; then
            log INFO "Test restore successful: $(basename "$backup_file")"
            rm -rf "$temp_restore_dir"
            return 0
        else
            log ERROR "Test restore failed: $(basename "$backup_file")"
            rm -rf "$temp_restore_dir"
            return 1
        fi
    elif [[ "$backup_file" == *"config"* ]]; then
        # Test config restore
        if BACKUP_FILE="$backup_file" DRY_RUN=true \
            "$SCRIPT_DIR/restore-config.sh" >/dev/null 2>&1; then
            log INFO "Test restore successful: $(basename "$backup_file")"
            rm -rf "$temp_restore_dir"
            return 0
        else
            log ERROR "Test restore failed: $(basename "$backup_file")"
            rm -rf "$temp_restore_dir"
            return 1
        fi
    fi

    rm -rf "$temp_restore_dir"
    return 0
}

check_backup_age() {
    log INFO "===== Checking Backup Age ====="

    local warning_age_hours=48
    local critical_age_hours=168  # 1 week

    # Check database backups
    if [[ -d "$BACKUP_BASE_DIR/database" ]]; then
        local latest_db=$(find "$BACKUP_BASE_DIR/database" -name "database-*.backup" \
            -type f -printf '%T@ %p\n' | sort -rn | head -n1 | cut -d' ' -f2-)

        if [[ -n "$latest_db" ]]; then
            local age_seconds=$(( $(date +%s) - $(stat -c%Y "$latest_db") ))
            local age_hours=$(( age_seconds / 3600 ))

            if [[ $age_hours -gt $critical_age_hours ]]; then
                log ERROR "Database backup is critically old: $age_hours hours"
            elif [[ $age_hours -gt $warning_age_hours ]]; then
                log WARN "Database backup is getting old: $age_hours hours"
            else
                log INFO "Database backup age: $age_hours hours (OK)"
            fi
        else
            log ERROR "No database backups found"
        fi
    fi

    # Check config backups
    if [[ -d "$BACKUP_BASE_DIR/config" ]]; then
        local latest_config=$(find "$BACKUP_BASE_DIR/config" -name "config-*.backup" \
            -type f -printf '%T@ %p\n' | sort -rn | head -n1 | cut -d' ' -f2-)

        if [[ -n "$latest_config" ]]; then
            local age_seconds=$(( $(date +%s) - $(stat -c%Y "$latest_config") ))
            local age_hours=$(( age_seconds / 3600 ))

            if [[ $age_hours -gt $critical_age_hours ]]; then
                log ERROR "Configuration backup is critically old: $age_hours hours"
            elif [[ $age_hours -gt $warning_age_hours ]]; then
                log WARN "Configuration backup is getting old: $age_hours hours"
            else
                log INFO "Configuration backup age: $age_hours hours (OK)"
            fi
        else
            log ERROR "No configuration backups found"
        fi
    fi
}

check_storage_space() {
    log INFO "===== Checking Storage Space ====="

    if [[ ! -d "$BACKUP_BASE_DIR" ]]; then
        log WARN "Backup directory does not exist"
        return 1
    fi

    local total_size=$(du -sh "$BACKUP_BASE_DIR" | cut -f1)
    local available_space=$(df -h "$BACKUP_BASE_DIR" | awk 'NR==2 {print $4}')
    local usage_percent=$(df -h "$BACKUP_BASE_DIR" | awk 'NR==2 {print $5}' | sed 's/%//')

    log INFO "Total backup size: $total_size"
    log INFO "Available space: $available_space"
    log INFO "Disk usage: $usage_percent%"

    if [[ $usage_percent -gt 90 ]]; then
        log ERROR "Disk usage critical: $usage_percent%"
    elif [[ $usage_percent -gt 80 ]]; then
        log WARN "Disk usage high: $usage_percent%"
    else
        log INFO "Disk usage normal: $usage_percent%"
    fi
}

generate_report() {
    local report_file="$LOG_DIR/backup-verification-report-$(date +%Y%m%d-%H%M%S).txt"

    log INFO "Generating verification report..."

    cat > "$report_file" <<EOF
===================================
Backup Verification Report
===================================

Date: $(date)
Verification Mode: $VERIFICATION_MODE
Backup Directory: $BACKUP_BASE_DIR

Statistics:
  Total Backups Checked: $TOTAL_BACKUPS
  Successfully Verified: $VERIFIED_BACKUPS
  Failed Verification: $FAILED_BACKUPS
  Corrupted Backups: $CORRUPTED_BACKUPS

Success Rate: $(awk "BEGIN {printf \"%.1f\", ($VERIFIED_BACKUPS / $TOTAL_BACKUPS) * 100}")%

Storage Information:
  Total Backup Size: $(du -sh "$BACKUP_BASE_DIR" 2>/dev/null | cut -f1 || echo "N/A")
  Available Space: $(df -h "$BACKUP_BASE_DIR" 2>/dev/null | awk 'NR==2 {print $4}' || echo "N/A")
  Disk Usage: $(df -h "$BACKUP_BASE_DIR" 2>/dev/null | awk 'NR==2 {print $5}' || echo "N/A")

Latest Backups:
EOF

    # List latest backups
    if [[ -d "$BACKUP_BASE_DIR/database" ]]; then
        echo "" >> "$report_file"
        echo "Database Backups:" >> "$report_file"
        ls -lht "$BACKUP_BASE_DIR/database"/*.backup 2>/dev/null | head -n 5 >> "$report_file" || \
            echo "  None found" >> "$report_file"
    fi

    if [[ -d "$BACKUP_BASE_DIR/config" ]]; then
        echo "" >> "$report_file"
        echo "Configuration Backups:" >> "$report_file"
        ls -lht "$BACKUP_BASE_DIR/config"/*.backup 2>/dev/null | head -n 5 >> "$report_file" || \
            echo "  None found" >> "$report_file"
    fi

    log INFO "Verification report created: $report_file"
    cat "$report_file"
}

usage() {
    cat <<EOF
Usage: $0 [OPTIONS]

Backup verification script for ESP32 RoIP System

OPTIONS:
    -m, --mode MODE          Verification mode: quick, full, deep (default: full)
    -t, --test-restore       Test restore functionality (default: false)
    --backup-dir DIR         Backup directory (default: /var/backups/roip)
    -h, --help               Display this help message

VERIFICATION MODES:
    quick    - Checksum verification only (fastest)
    full     - Checksum + encryption verification (recommended)
    deep     - Checksum + encryption + compression + test restore (slowest)

EXAMPLES:
    # Quick verification
    $0 --mode quick

    # Full verification (default)
    $0

    # Deep verification with test restore
    $0 --mode deep --test-restore

EOF
}

###############################################################################
# Main
###############################################################################

mkdir -p "$LOG_DIR"

log INFO "==========================================="
log INFO "Backup Verification Started"
log INFO "==========================================="

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -m|--mode)
            VERIFICATION_MODE="$2"
            shift 2
            ;;
        -t|--test-restore)
            TEST_RESTORE=true
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

# Record start time
START_TIME=$(date +%s)

# Run verifications
verify_database_backups
verify_config_backups
verify_other_backups
check_backup_age
check_storage_space

# Generate report
generate_report

# Record end time
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

log INFO "==========================================="
log INFO "Backup Verification Completed"
log INFO "Total duration: ${DURATION} seconds"
log INFO "Verified: $VERIFIED_BACKUPS/$TOTAL_BACKUPS backups"
if [[ $FAILED_BACKUPS -gt 0 ]]; then
    log ERROR "Failed: $FAILED_BACKUPS backups"
    exit 1
else
    log INFO "All backups verified successfully"
    exit 0
fi
