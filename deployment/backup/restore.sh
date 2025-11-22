#!/bin/bash
#
# RoIP System Restore Script
# Restores PostgreSQL database, configuration files, and data from backups
#
# Usage:
#   ./restore.sh [database|config|data|full] <backup_file_or_timestamp>
#   ./restore.sh database 20251122_143000
#   ./restore.sh full /var/backups/roip/database/roip_db_20251122_143000.dump.gz
#

set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/var/backups/roip}"
S3_BUCKET="${S3_BUCKET:-}"
RESTORE_TYPE="${1:-}"
BACKUP_IDENTIFIER="${2:-}"

# Database configuration
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-roip_production}"
DB_USER="${DB_USER:-roip_user}"

# Directories
CONFIG_DIR="${CONFIG_DIR:-/opt/roip-server/config}"
DATA_DIR="${DATA_DIR:-/opt/roip-server/data}"

# Logging
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="${BACKUP_DIR}/logs/restore_${TIMESTAMP}.log"
mkdir -p "${BACKUP_DIR}/logs"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "${LOG_FILE}"
}

error() {
    log "ERROR: $*"
    exit 1
}

# Show usage
usage() {
    cat << EOF
Usage: $0 <restore_type> <backup_identifier>

Restore Types:
  database    - Restore database only
  config      - Restore configuration files only
  data        - Restore data directory only
  full        - Restore everything

Backup Identifier:
  - Timestamp (e.g., 20251122_143000)
  - Full path to backup file
  - 's3://bucket/path' for S3 restore

Examples:
  $0 database 20251122_143000
  $0 config /var/backups/roip/config/roip_config_20251122_143000.tar.gz
  $0 full s3://roip-backups/database/roip_db_20251122_143000.dump.gz

EOF
    exit 1
}

# Find backup file by timestamp
find_backup_file() {
    local type="$1"
    local timestamp="$2"
    local pattern

    case "$type" in
        database)
            pattern="${BACKUP_DIR}/database/roip_db_${timestamp}.dump.gz"
            ;;
        config)
            pattern="${BACKUP_DIR}/config/roip_config_${timestamp}.tar.gz"
            ;;
        data)
            pattern="${BACKUP_DIR}/data/roip_data_${timestamp}.tar.gz"
            ;;
        *)
            error "Unknown type: $type"
            ;;
    esac

    if [[ -f "$pattern" ]]; then
        echo "$pattern"
    else
        error "Backup file not found: $pattern"
    fi
}

# Download from S3
download_from_s3() {
    local s3_path="$1"
    local local_path="${BACKUP_DIR}/temp/$(basename "${s3_path}")"

    mkdir -p "${BACKUP_DIR}/temp"
    log "Downloading from S3: ${s3_path}"

    if aws s3 cp "${s3_path}" "${local_path}"; then
        log "Download successful: ${local_path}"
        echo "${local_path}"
    else
        error "S3 download failed: ${s3_path}"
    fi
}

# Verify backup file
verify_backup_file() {
    local file="$1"

    log "Verifying backup file: ${file}"

    if [[ ! -f "$file" ]]; then
        error "Backup file not found: ${file}"
    fi

    # Verify checksum if available
    if [[ -f "${file}.sha256" ]]; then
        if sha256sum -c "${file}.sha256" &>> "${LOG_FILE}"; then
            log "Backup verification successful"
        else
            error "Backup verification failed - checksum mismatch"
        fi
    else
        log "WARNING: Checksum file not found, skipping verification"
    fi
}

# Stop RoIP services
stop_services() {
    log "Stopping RoIP services..."

    if systemctl is-active --quiet roip-server; then
        systemctl stop roip-server
        log "Stopped roip-server"
    fi

    # Wait for services to fully stop
    sleep 5
}

# Start RoIP services
start_services() {
    log "Starting RoIP services..."

    if systemctl enable roip-server; then
        systemctl start roip-server
        log "Started roip-server"
    fi

    # Wait for service to be ready
    sleep 10

    # Check health
    if curl -sf http://localhost:8080/health > /dev/null; then
        log "RoIP server is healthy"
    else
        log "WARNING: RoIP server health check failed"
    fi
}

# Restore database
restore_database() {
    local backup_file="$1"

    log "Starting database restore..."
    log "Backup file: ${backup_file}"

    # Verify backup
    verify_backup_file "${backup_file}"

    # Stop services
    stop_services

    # Decompress if needed
    local restore_file="$backup_file"
    if [[ "$backup_file" == *.gz ]]; then
        restore_file="${BACKUP_DIR}/temp/$(basename "${backup_file}" .gz)"
        gunzip -c "${backup_file}" > "${restore_file}"
        log "Decompressed backup file"
    fi

    # Create backup of current database
    log "Creating backup of current database..."
    PGPASSWORD="${DB_PASSWORD}" pg_dump \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_USER}" \
        -d "${DB_NAME}" \
        -Fc \
        -f "${BACKUP_DIR}/database/pre_restore_${TIMESTAMP}.dump" || log "WARNING: Pre-restore backup failed"

    # Drop and recreate database
    log "Dropping existing database..."
    PGPASSWORD="${DB_PASSWORD}" psql \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U postgres \
        -c "DROP DATABASE IF EXISTS ${DB_NAME};"

    log "Creating new database..."
    PGPASSWORD="${DB_PASSWORD}" psql \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U postgres \
        -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"

    # Restore database
    log "Restoring database..."
    if PGPASSWORD="${DB_PASSWORD}" pg_restore \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_USER}" \
        -d "${DB_NAME}" \
        -v \
        "${restore_file}" 2>> "${LOG_FILE}"; then
        log "Database restore completed successfully"
    else
        error "Database restore failed"
    fi

    # Cleanup temp files
    [[ "$restore_file" != "$backup_file" ]] && rm -f "${restore_file}"

    # Restart services
    start_services

    log "Database restore completed"
}

# Restore configuration
restore_config() {
    local backup_file="$1"

    log "Starting configuration restore..."
    log "Backup file: ${backup_file}"

    verify_backup_file "${backup_file}"

    # Create backup of current config
    if [[ -d "$CONFIG_DIR" ]]; then
        local config_backup="${CONFIG_DIR}.backup_${TIMESTAMP}"
        cp -r "${CONFIG_DIR}" "${config_backup}"
        log "Current config backed up to: ${config_backup}"
    fi

    # Extract config
    log "Extracting configuration files..."
    tar -xzf "${backup_file}" -C "$(dirname "${CONFIG_DIR}")" 2>> "${LOG_FILE}"

    # Set proper permissions
    chown -R roip:roip "${CONFIG_DIR}" || log "WARNING: Failed to set ownership"
    chmod 750 "${CONFIG_DIR}"

    log "Configuration restore completed"
}

# Restore data
restore_data() {
    local backup_file="$1"

    log "Starting data restore..."
    log "Backup file: ${backup_file}"

    verify_backup_file "${backup_file}"
    stop_services

    # Create backup of current data
    if [[ -d "$DATA_DIR" ]]; then
        local data_backup="${DATA_DIR}.backup_${TIMESTAMP}"
        cp -r "${DATA_DIR}" "${data_backup}"
        log "Current data backed up to: ${data_backup}"
    fi

    # Extract data
    log "Extracting data files..."
    tar -xzf "${backup_file}" -C "$(dirname "${DATA_DIR}")" 2>> "${LOG_FILE}"

    # Set proper permissions
    chown -R roip:roip "${DATA_DIR}" || log "WARNING: Failed to set ownership"

    start_services
    log "Data restore completed"
}

# Main restore logic
main() {
    log "=========================================="
    log "RoIP System Restore Started"
    log "Restore type: ${RESTORE_TYPE}"
    log "Backup identifier: ${BACKUP_IDENTIFIER}"
    log "=========================================="

    # Validate inputs
    [[ -z "$RESTORE_TYPE" ]] && usage
    [[ -z "$BACKUP_IDENTIFIER" ]] && usage

    # Determine backup file
    local backup_file
    if [[ "$BACKUP_IDENTIFIER" == s3://* ]]; then
        backup_file=$(download_from_s3 "$BACKUP_IDENTIFIER")
    elif [[ -f "$BACKUP_IDENTIFIER" ]]; then
        backup_file="$BACKUP_IDENTIFIER"
    else
        # Assume it's a timestamp
        case "$RESTORE_TYPE" in
            database)
                backup_file=$(find_backup_file "database" "$BACKUP_IDENTIFIER")
                ;;
            config)
                backup_file=$(find_backup_file "config" "$BACKUP_IDENTIFIER")
                ;;
            data)
                backup_file=$(find_backup_file "data" "$BACKUP_IDENTIFIER")
                ;;
            full)
                error "For full restore, specify individual backup files"
                ;;
            *)
                error "Invalid restore type: ${RESTORE_TYPE}"
                ;;
        esac
    fi

    # Confirm restore
    log "WARNING: This will overwrite existing data!"
    log "Backup file: ${backup_file}"
    read -p "Continue with restore? (yes/no): " -r
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        log "Restore cancelled by user"
        exit 0
    fi

    # Perform restore
    case "$RESTORE_TYPE" in
        database)
            restore_database "$backup_file"
            ;;
        config)
            restore_config "$backup_file"
            ;;
        data)
            restore_data "$backup_file"
            ;;
        full)
            # Full restore requires multiple files
            error "Full restore not yet implemented. Restore database, config, and data separately."
            ;;
        *)
            error "Invalid restore type: ${RESTORE_TYPE}"
            ;;
    esac

    log "=========================================="
    log "RoIP System Restore Completed"
    log "=========================================="

    # Send notification
    if command -v mail &> /dev/null; then
        echo "Restore completed successfully at $(date)" | \
            mail -s "RoIP Restore Success" ops@example.com
    fi
}

# Run main function
main "$@"
