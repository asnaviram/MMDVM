#!/bin/bash
#
# RoIP System Backup Script
# Backs up PostgreSQL database, configuration files, and recordings
#
# Usage:
#   ./backup.sh [full|incremental|config|database]
#   ./backup.sh full            # Full backup (default)
#   ./backup.sh database        # Database only
#   ./backup.sh config          # Config files only
#
# Configuration via environment variables or backup-config.yml
#

set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/var/backups/roip}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
S3_BUCKET="${S3_BUCKET:-}"
BACKUP_TYPE="${1:-full}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Database configuration
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-roip_production}"
DB_USER="${DB_USER:-roip_user}"

# Directories to backup
CONFIG_DIR="${CONFIG_DIR:-/opt/roip-server/config}"
DATA_DIR="${DATA_DIR:-/opt/roip-server/data}"
RECORDINGS_DIR="${RECORDINGS_DIR:-/opt/roip-server/recordings}"

# Logging
LOG_FILE="${BACKUP_DIR}/logs/backup_${TIMESTAMP}.log"
mkdir -p "${BACKUP_DIR}/logs"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "${LOG_FILE}"
}

error() {
    log "ERROR: $*"
    exit 1
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."

    # Check if running as appropriate user
    if [[ $EUID -ne 0 ]] && [[ "$(whoami)" != "postgres" ]]; then
        log "WARNING: Not running as root or postgres user"
    fi

    # Check required commands
    for cmd in pg_dump gzip tar; do
        if ! command -v "$cmd" &> /dev/null; then
            error "Required command not found: $cmd"
        fi
    done

    # Check S3 CLI if S3 bucket is configured
    if [[ -n "$S3_BUCKET" ]] && ! command -v aws &> /dev/null; then
        error "AWS CLI not found but S3_BUCKET is configured"
    fi

    # Create backup directories
    mkdir -p "${BACKUP_DIR}"/{database,config,data,recordings}

    log "Prerequisites check completed"
}

# Backup PostgreSQL database
backup_database() {
    local backup_file="${BACKUP_DIR}/database/roip_db_${TIMESTAMP}.dump"
    local backup_file_compressed="${backup_file}.gz"

    log "Starting database backup..."
    log "Database: ${DB_NAME}@${DB_HOST}:${DB_PORT}"

    # Perform backup
    if PGPASSWORD="${DB_PASSWORD}" pg_dump \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_USER}" \
        -d "${DB_NAME}" \
        -Fc \
        -f "${backup_file}"; then
        log "Database backup created: ${backup_file}"

        # Compress backup
        gzip "${backup_file}"
        log "Database backup compressed: ${backup_file_compressed}"

        # Calculate checksum
        sha256sum "${backup_file_compressed}" > "${backup_file_compressed}.sha256"
        log "Checksum created"

        # Upload to S3 if configured
        if [[ -n "$S3_BUCKET" ]]; then
            upload_to_s3 "${backup_file_compressed}" "database/"
            upload_to_s3 "${backup_file_compressed}.sha256" "database/"
        fi

        log "Database backup completed successfully"
        return 0
    else
        error "Database backup failed"
    fi
}

# Backup configuration files
backup_config() {
    local backup_file="${BACKUP_DIR}/config/roip_config_${TIMESTAMP}.tar.gz"

    log "Starting configuration backup..."

    if [[ ! -d "$CONFIG_DIR" ]]; then
        log "WARNING: Config directory not found: ${CONFIG_DIR}"
        return 1
    fi

    # Create tarball of config files
    if tar -czf "${backup_file}" \
        -C "$(dirname "${CONFIG_DIR}")" \
        "$(basename "${CONFIG_DIR}")" \
        --exclude='*.log' \
        --exclude='*.tmp' 2>> "${LOG_FILE}"; then

        log "Configuration backup created: ${backup_file}"

        # Calculate checksum
        sha256sum "${backup_file}" > "${backup_file}.sha256"

        # Upload to S3 if configured
        if [[ -n "$S3_BUCKET" ]]; then
            upload_to_s3 "${backup_file}" "config/"
            upload_to_s3 "${backup_file}.sha256" "config/"
        fi

        log "Configuration backup completed successfully"
        return 0
    else
        error "Configuration backup failed"
    fi
}

# Backup data directory
backup_data() {
    local backup_file="${BACKUP_DIR}/data/roip_data_${TIMESTAMP}.tar.gz"

    log "Starting data backup..."

    if [[ ! -d "$DATA_DIR" ]]; then
        log "WARNING: Data directory not found: ${DATA_DIR}"
        return 1
    fi

    if tar -czf "${backup_file}" \
        -C "$(dirname "${DATA_DIR}")" \
        "$(basename "${DATA_DIR}")" 2>> "${LOG_FILE}"; then

        log "Data backup created: ${backup_file}"
        sha256sum "${backup_file}" > "${backup_file}.sha256"

        if [[ -n "$S3_BUCKET" ]]; then
            upload_to_s3 "${backup_file}" "data/"
            upload_to_s3 "${backup_file}.sha256" "data/"
        fi

        log "Data backup completed successfully"
        return 0
    else
        error "Data backup failed"
    fi
}

# Backup recordings (optional, can be large)
backup_recordings() {
    local backup_file="${BACKUP_DIR}/recordings/roip_recordings_${TIMESTAMP}.tar.gz"

    log "Starting recordings backup..."

    if [[ ! -d "$RECORDINGS_DIR" ]]; then
        log "WARNING: Recordings directory not found: ${RECORDINGS_DIR}"
        return 1
    fi

    # Check if directory is empty
    if [[ -z "$(ls -A "${RECORDINGS_DIR}")" ]]; then
        log "Recordings directory is empty, skipping"
        return 0
    fi

    # Only backup files from last 7 days to save space
    if find "${RECORDINGS_DIR}" -type f -mtime -7 -print0 | \
        tar -czf "${backup_file}" --null -T - 2>> "${LOG_FILE}"; then

        log "Recordings backup created: ${backup_file}"
        sha256sum "${backup_file}" > "${backup_file}.sha256"

        if [[ -n "$S3_BUCKET" ]]; then
            upload_to_s3 "${backup_file}" "recordings/"
            upload_to_s3 "${backup_file}.sha256" "recordings/"
        fi

        log "Recordings backup completed successfully"
        return 0
    else
        log "WARNING: Recordings backup failed (non-critical)"
        return 1
    fi
}

# Upload file to S3
upload_to_s3() {
    local file="$1"
    local s3_prefix="$2"
    local s3_path="s3://${S3_BUCKET}/${s3_prefix}$(basename "${file}")"

    log "Uploading to S3: ${s3_path}"

    if aws s3 cp "${file}" "${s3_path}" \
        --storage-class STANDARD_IA \
        --server-side-encryption AES256; then
        log "Upload successful: ${s3_path}"
    else
        log "WARNING: S3 upload failed for ${file}"
    fi
}

# Clean old backups
cleanup_old_backups() {
    log "Cleaning up backups older than ${BACKUP_RETENTION_DAYS} days..."

    for dir in database config data recordings; do
        local backup_path="${BACKUP_DIR}/${dir}"
        if [[ -d "$backup_path" ]]; then
            find "$backup_path" -name "roip_*" -type f -mtime +${BACKUP_RETENTION_DAYS} -delete
            log "Cleaned up old backups in ${dir}"
        fi
    done

    # Clean old logs
    find "${BACKUP_DIR}/logs" -name "backup_*.log" -type f -mtime +${BACKUP_RETENTION_DAYS} -delete

    log "Cleanup completed"
}

# Verify backup integrity
verify_backup() {
    local file="$1"

    if [[ ! -f "$file" ]]; then
        log "WARNING: Backup file not found for verification: ${file}"
        return 1
    fi

    if [[ -f "${file}.sha256" ]]; then
        if sha256sum -c "${file}.sha256" &>> "${LOG_FILE}"; then
            log "Backup verification successful: ${file}"
            return 0
        else
            log "ERROR: Backup verification failed: ${file}"
            return 1
        fi
    else
        log "WARNING: Checksum file not found: ${file}.sha256"
        return 1
    fi
}

# Main backup logic
main() {
    log "=========================================="
    log "RoIP System Backup Started"
    log "Backup type: ${BACKUP_TYPE}"
    log "Timestamp: ${TIMESTAMP}"
    log "=========================================="

    check_prerequisites

    case "${BACKUP_TYPE}" in
        full)
            backup_database
            backup_config
            backup_data
            backup_recordings
            ;;
        database)
            backup_database
            ;;
        config)
            backup_config
            ;;
        incremental)
            # For incremental, only backup changed files
            backup_config
            backup_data
            ;;
        *)
            error "Invalid backup type: ${BACKUP_TYPE}"
            ;;
    esac

    cleanup_old_backups

    log "=========================================="
    log "RoIP System Backup Completed"
    log "=========================================="

    # Send notification (optional)
    if command -v mail &> /dev/null; then
        echo "Backup completed successfully at $(date)" | \
            mail -s "RoIP Backup Success" ops@example.com
    fi
}

# Run main function
main "$@"
