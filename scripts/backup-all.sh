#!/bin/bash
###############################################################################
# Full System Backup Script for ESP32 RoIP System
# Orchestrates complete backup of database, config, logs, firmware, and certs
###############################################################################

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Default values
BACKUP_BASE_DIR="${BACKUP_BASE_DIR:-/var/backups/roip}"
UPLOAD_OFFSITE="${UPLOAD_OFFSITE:-false}"
PARALLEL_BACKUPS="${PARALLEL_BACKUPS:-true}"
VERIFY_BACKUPS="${VERIFY_BACKUPS:-true}"

# Logging
LOG_DIR="${LOG_DIR:-$PROJECT_ROOT/logs}"
LOG_FILE="$LOG_DIR/backup-all-$(date +%Y%m%d).log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Backup components
BACKUP_DATABASE="${BACKUP_DATABASE:-true}"
BACKUP_CONFIG="${BACKUP_CONFIG:-true}"
BACKUP_LOGS="${BACKUP_LOGS:-true}"
BACKUP_FIRMWARE="${BACKUP_FIRMWARE:-true}"
BACKUP_CERTIFICATES="${BACKUP_CERTIFICATES:-true}"

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

error_exit() {
    log ERROR "$1"
    exit 1
}

# Check prerequisites
check_prerequisites() {
    log INFO "Checking prerequisites..."

    # Check if backup scripts exist
    local required_scripts=(
        "$SCRIPT_DIR/backup-database.sh"
        "$SCRIPT_DIR/backup-config.sh"
    )

    for script in "${required_scripts[@]}"; do
        if [[ ! -f "$script" ]]; then
            error_exit "Required script not found: $script"
        fi
        if [[ ! -x "$script" ]]; then
            chmod +x "$script"
            log WARN "Made script executable: $script"
        fi
    done

    # Check disk space
    local available_space=$(df -BG "$BACKUP_BASE_DIR" 2>/dev/null | awk 'NR==2 {print $4}' | sed 's/G//')
    if [[ -n "$available_space" ]] && [[ "$available_space" -lt 10 ]]; then
        log WARN "Low disk space: ${available_space}GB available"
    fi

    log INFO "Prerequisites check completed"
}

# Backup database
backup_database() {
    log INFO "===== Starting Database Backup ====="

    local opts=""
    [[ "$UPLOAD_OFFSITE" == "true" ]] && opts="$opts --upload"

    if "$SCRIPT_DIR/backup-database.sh" $opts; then
        log INFO "Database backup completed successfully"
        return 0
    else
        log ERROR "Database backup failed"
        return 1
    fi
}

# Backup configuration
backup_configuration() {
    log INFO "===== Starting Configuration Backup ====="

    local opts="--include-secrets"
    [[ "$UPLOAD_OFFSITE" == "true" ]] && opts="$opts --upload"

    if "$SCRIPT_DIR/backup-config.sh" $opts; then
        log INFO "Configuration backup completed successfully"
        return 0
    else
        log ERROR "Configuration backup failed"
        return 1
    fi
}

# Backup logs
backup_logs() {
    log INFO "===== Starting Logs Backup ====="

    local timestamp=$(date +%Y%m%d-%H%M%S)
    local backup_dir="$BACKUP_BASE_DIR/logs"
    local backup_file="$backup_dir/logs-$timestamp.tar.gz"

    mkdir -p "$backup_dir"

    # Backup application logs
    local log_paths=(
        "$PROJECT_ROOT/logs"
        "$PROJECT_ROOT/roip-server/logs"
        "/var/log/roip"
    )

    local temp_dir=$(mktemp -d)
    local has_logs=false

    for log_path in "${log_paths[@]}"; do
        if [[ -d "$log_path" ]]; then
            cp -r "$log_path" "$temp_dir/" 2>/dev/null || true
            has_logs=true
        fi
    done

    if [[ "$has_logs" == "true" ]]; then
        tar -czf "$backup_file" -C "$temp_dir" . || {
            log ERROR "Logs backup failed"
            rm -rf "$temp_dir"
            return 1
        }

        log INFO "Logs backed up to: $backup_file"
        log INFO "Backup size: $(du -h "$backup_file" | cut -f1)"
    else
        log WARN "No logs found to backup"
    fi

    rm -rf "$temp_dir"

    # Cleanup old log backups (keep 30 days)
    find "$backup_dir" -name "logs-*.tar.gz" -type f -mtime +30 -delete 2>/dev/null || true

    log INFO "Logs backup completed"
    return 0
}

# Backup firmware
backup_firmware() {
    log INFO "===== Starting Firmware Backup ====="

    local timestamp=$(date +%Y%m%d-%H%M%S)
    local backup_dir="$BACKUP_BASE_DIR/firmware"
    local backup_file="$backup_dir/firmware-$timestamp.tar.gz"

    mkdir -p "$backup_dir"

    # Backup firmware binaries
    local firmware_paths=(
        "$PROJECT_ROOT/.pio/build"
        "$PROJECT_ROOT/roip-firmware/build"
    )

    local temp_dir=$(mktemp -d)
    local has_firmware=false

    for fw_path in "${firmware_paths[@]}"; do
        if [[ -d "$fw_path" ]]; then
            # Copy only .bin and .elf files
            find "$fw_path" \( -name "*.bin" -o -name "*.elf" \) -exec \
                cp --parents {} "$temp_dir/" \; 2>/dev/null || true
            has_firmware=true
        fi
    done

    if [[ "$has_firmware" == "true" ]]; then
        tar -czf "$backup_file" -C "$temp_dir" . || {
            log ERROR "Firmware backup failed"
            rm -rf "$temp_dir"
            return 1
        }

        log INFO "Firmware backed up to: $backup_file"
        log INFO "Backup size: $(du -h "$backup_file" | cut -f1)"
    else
        log WARN "No firmware binaries found to backup"
    fi

    rm -rf "$temp_dir"

    # Cleanup old firmware backups (keep last 10)
    local old_backups=$(ls -t "$backup_dir"/firmware-*.tar.gz 2>/dev/null | tail -n +11)
    if [[ -n "$old_backups" ]]; then
        echo "$old_backups" | xargs rm -f
        log INFO "Cleaned up old firmware backups"
    fi

    log INFO "Firmware backup completed"
    return 0
}

# Backup certificates
backup_certificates() {
    log INFO "===== Starting Certificates Backup ====="

    local timestamp=$(date +%Y%m%d-%H%M%S)
    local backup_dir="$BACKUP_BASE_DIR/certificates"
    local backup_file="$backup_dir/certs-$timestamp.tar.gz.enc"

    mkdir -p "$backup_dir"

    # Backup certificates
    local cert_paths=(
        "$PROJECT_ROOT/roip-server/certs"
        "$PROJECT_ROOT/security"
        "/etc/letsencrypt/live"
    )

    local temp_dir=$(mktemp -d)
    local has_certs=false

    for cert_path in "${cert_paths[@]}"; do
        if [[ -d "$cert_path" ]]; then
            cp -rL "$cert_path" "$temp_dir/" 2>/dev/null || true
            has_certs=true
        fi
    done

    if [[ "$has_certs" == "true" ]]; then
        # Compress
        local compressed="$temp_dir/certs.tar.gz"
        tar -czf "$compressed" -C "$temp_dir" . || {
            log ERROR "Certificate compression failed"
            rm -rf "$temp_dir"
            return 1
        }

        # Encrypt (certificates are sensitive)
        if [[ -f "/etc/roip/backup-encryption-key" ]]; then
            openssl enc -aes-256-cbc -salt -pbkdf2 \
                -in "$compressed" -out "$backup_file" \
                -pass file:/etc/roip/backup-encryption-key || {
                log ERROR "Certificate encryption failed"
                rm -rf "$temp_dir"
                return 1
            }
        else
            log WARN "Encryption key not found, storing unencrypted"
            mv "$compressed" "${backup_file%.enc}"
        fi

        log INFO "Certificates backed up to: $backup_file"
        log INFO "Backup size: $(du -h "$backup_file" | cut -f1)"
    else
        log WARN "No certificates found to backup"
    fi

    rm -rf "$temp_dir"

    # Cleanup old certificate backups (keep 30 days)
    find "$backup_dir" -name "certs-*.tar.gz*" -type f -mtime +30 -delete 2>/dev/null || true

    log INFO "Certificates backup completed"
    return 0
}

# Create backup manifest
create_manifest() {
    local timestamp=$(date +%Y%m%d-%H%M%S)
    local manifest_file="$BACKUP_BASE_DIR/manifest-$timestamp.json"

    log INFO "Creating backup manifest..."

    cat > "$manifest_file" <<EOF
{
  "backup_type": "full_system",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "hostname": "$(hostname)",
  "backup_version": "1.0",
  "components": {
    "database": $BACKUP_DATABASE,
    "configuration": $BACKUP_CONFIG,
    "logs": $BACKUP_LOGS,
    "firmware": $BACKUP_FIRMWARE,
    "certificates": $BACKUP_CERTIFICATES
  },
  "backup_location": "$BACKUP_BASE_DIR",
  "offsite_upload": $UPLOAD_OFFSITE,
  "backup_sizes": {
EOF

    # Get sizes of each backup component
    local db_size=$(du -sh "$BACKUP_BASE_DIR/database" 2>/dev/null | cut -f1 || echo "0")
    local config_size=$(du -sh "$BACKUP_BASE_DIR/config" 2>/dev/null | cut -f1 || echo "0")
    local logs_size=$(du -sh "$BACKUP_BASE_DIR/logs" 2>/dev/null | cut -f1 || echo "0")
    local fw_size=$(du -sh "$BACKUP_BASE_DIR/firmware" 2>/dev/null | cut -f1 || echo "0")
    local cert_size=$(du -sh "$BACKUP_BASE_DIR/certificates" 2>/dev/null | cut -f1 || echo "0")
    local total_size=$(du -sh "$BACKUP_BASE_DIR" 2>/dev/null | cut -f1 || echo "0")

    cat >> "$manifest_file" <<EOF
    "database": "$db_size",
    "configuration": "$config_size",
    "logs": "$logs_size",
    "firmware": "$fw_size",
    "certificates": "$cert_size",
    "total": "$total_size"
  }
}
EOF

    log INFO "Manifest created: $manifest_file"
}

# Run backups in parallel
run_parallel_backups() {
    log INFO "Running backups in parallel..."

    local pids=()
    local results=()

    # Start backup processes
    [[ "$BACKUP_DATABASE" == "true" ]] && backup_database &
    pids+=($!)
    results+=("database")

    [[ "$BACKUP_CONFIG" == "true" ]] && backup_configuration &
    pids+=($!)
    results+=("config")

    [[ "$BACKUP_LOGS" == "true" ]] && backup_logs &
    pids+=($!)
    results+=("logs")

    [[ "$BACKUP_FIRMWARE" == "true" ]] && backup_firmware &
    pids+=($!)
    results+=("firmware")

    [[ "$BACKUP_CERTIFICATES" == "true" ]] && backup_certificates &
    pids+=($!)
    results+=("certificates")

    # Wait for all processes and check results
    local failed=false
    for i in "${!pids[@]}"; do
        if wait "${pids[$i]}"; then
            log INFO "${results[$i]} backup completed"
        else
            log ERROR "${results[$i]} backup failed"
            failed=true
        fi
    done

    if [[ "$failed" == "true" ]]; then
        return 1
    fi

    return 0
}

# Run backups sequentially
run_sequential_backups() {
    log INFO "Running backups sequentially..."

    local failed=false

    [[ "$BACKUP_DATABASE" == "true" ]] && { backup_database || failed=true; }
    [[ "$BACKUP_CONFIG" == "true" ]] && { backup_configuration || failed=true; }
    [[ "$BACKUP_LOGS" == "true" ]] && { backup_logs || failed=true; }
    [[ "$BACKUP_FIRMWARE" == "true" ]] && { backup_firmware || failed=true; }
    [[ "$BACKUP_CERTIFICATES" == "true" ]] && { backup_certificates || failed=true; }

    if [[ "$failed" == "true" ]]; then
        return 1
    fi

    return 0
}

# Verify backups
verify_backups() {
    if [[ "$VERIFY_BACKUPS" != "true" ]]; then
        log INFO "Backup verification disabled, skipping"
        return 0
    fi

    log INFO "===== Verifying Backups ====="

    if [[ -f "$SCRIPT_DIR/verify-backups.sh" ]]; then
        "$SCRIPT_DIR/verify-backups.sh" --quick || {
            log WARN "Backup verification found issues"
            return 1
        }
    else
        log WARN "Verification script not found, skipping"
    fi

    log INFO "Backup verification completed"
    return 0
}

# Display usage
usage() {
    cat <<EOF
Usage: $0 [OPTIONS]

Full system backup script for ESP32 RoIP System

OPTIONS:
    -o, --output-dir DIR     Output directory (default: /var/backups/roip)
    -u, --upload             Upload to S3 (default: false)
    -p, --parallel           Run backups in parallel (default: true)
    -s, --sequential         Run backups sequentially
    -v, --verify             Verify backups after completion (default: true)
    --skip-database          Skip database backup
    --skip-config            Skip configuration backup
    --skip-logs              Skip logs backup
    --skip-firmware          Skip firmware backup
    --skip-certificates      Skip certificates backup
    -h, --help               Display this help message

EXAMPLES:
    # Full backup with all components
    $0

    # Full backup with S3 upload
    $0 --upload

    # Sequential backup (slower but safer)
    $0 --sequential

    # Backup only database and config
    $0 --skip-logs --skip-firmware --skip-certificates

EOF
}

###############################################################################
# Main
###############################################################################

mkdir -p "$LOG_DIR"
mkdir -p "$BACKUP_BASE_DIR"

log INFO "==========================================="
log INFO "Full System Backup Started"
log INFO "==========================================="

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -o|--output-dir)
            BACKUP_BASE_DIR="$2"
            shift 2
            ;;
        -u|--upload)
            UPLOAD_OFFSITE=true
            shift
            ;;
        -p|--parallel)
            PARALLEL_BACKUPS=true
            shift
            ;;
        -s|--sequential)
            PARALLEL_BACKUPS=false
            shift
            ;;
        -v|--verify)
            VERIFY_BACKUPS=true
            shift
            ;;
        --skip-database)
            BACKUP_DATABASE=false
            shift
            ;;
        --skip-config)
            BACKUP_CONFIG=false
            shift
            ;;
        --skip-logs)
            BACKUP_LOGS=false
            shift
            ;;
        --skip-firmware)
            BACKUP_FIRMWARE=false
            shift
            ;;
        --skip-certificates)
            BACKUP_CERTIFICATES=false
            shift
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

# Check prerequisites
check_prerequisites

# Record start time
START_TIME=$(date +%s)

# Run backups
if [[ "$PARALLEL_BACKUPS" == "true" ]]; then
    run_parallel_backups || log ERROR "Some parallel backups failed"
else
    run_sequential_backups || log ERROR "Some sequential backups failed"
fi

# Create manifest
create_manifest

# Verify backups
verify_backups || log WARN "Backup verification completed with warnings"

# Record end time
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

log INFO "==========================================="
log INFO "Full System Backup Completed"
log INFO "Total duration: ${DURATION} seconds"
log INFO "Backup location: $BACKUP_BASE_DIR"
log INFO "==========================================="

exit 0
