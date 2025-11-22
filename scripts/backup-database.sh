#!/bin/bash
###############################################################################
# Database Backup Script for ESP32 RoIP System
# Supports PostgreSQL and SQLite databases
# Includes encryption, compression, and off-site upload
###############################################################################

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Source configuration
BACKUP_CONFIG="${BACKUP_CONFIG:-$PROJECT_ROOT/backup/backup-config.yaml}"

# Default values (can be overridden by environment or config)
BACKUP_BASE_DIR="${BACKUP_BASE_DIR:-/var/backups/roip}"
BACKUP_TYPE="${BACKUP_TYPE:-full}"  # full, incremental, or transaction_log
DB_TYPE="${DB_TYPE:-sqlite}"  # postgresql or sqlite
ENCRYPTION_ENABLED="${ENCRYPTION_ENABLED:-true}"
COMPRESSION_ENABLED="${COMPRESSION_ENABLED:-true}"
UPLOAD_OFFSITE="${UPLOAD_OFFSITE:-false}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

# PostgreSQL settings
PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-5432}"
PG_USER="${PG_USER:-roip}"
PG_DATABASE="${PG_DATABASE:-roip_db}"
PG_PASSWORD="${PG_PASSWORD:-}"

# SQLite settings
SQLITE_DB_PATH="${SQLITE_DB_PATH:-$PROJECT_ROOT/roip-server/data/roip.db}"

# Encryption settings
ENCRYPTION_KEY_FILE="${ENCRYPTION_KEY_FILE:-/etc/roip/backup-encryption-key}"
ENCRYPTION_ALGORITHM="${ENCRYPTION_ALGORITHM:-aes-256-cbc}"

# S3 settings
S3_BUCKET="${S3_BUCKET:-roip-backups}"
S3_REGION="${S3_REGION:-us-east-1}"
S3_PREFIX="${S3_PREFIX:-production/database/}"

# Logging
LOG_DIR="${LOG_DIR:-$PROJECT_ROOT/logs}"
LOG_FILE="$LOG_DIR/backup-database-$(date +%Y%m%d).log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

###############################################################################
# Functions
###############################################################################

# Logging function
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

# Error handler
error_exit() {
    log ERROR "$1"
    cleanup_temp
    exit 1
}

# Cleanup temporary files
cleanup_temp() {
    if [[ -n "${TEMP_DIR:-}" ]] && [[ -d "$TEMP_DIR" ]]; then
        log INFO "Cleaning up temporary directory: $TEMP_DIR"
        rm -rf "$TEMP_DIR"
    fi
}

# Create backup directory structure
create_backup_dirs() {
    local backup_dir="$1"

    log INFO "Creating backup directory: $backup_dir"
    mkdir -p "$backup_dir" || error_exit "Failed to create backup directory"

    # Set secure permissions
    chmod 700 "$backup_dir"
}

# Backup PostgreSQL database
backup_postgresql() {
    local output_file="$1"

    log INFO "Starting PostgreSQL backup..."

    # Set password for pg_dump
    export PGPASSWORD="$PG_PASSWORD"

    case "$BACKUP_TYPE" in
        full)
            log INFO "Performing full PostgreSQL backup"
            pg_dump -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" \
                -F c -b -v -f "$output_file" "$PG_DATABASE" 2>&1 | tee -a "$LOG_FILE" || \
                error_exit "PostgreSQL backup failed"
            ;;

        incremental)
            log INFO "Performing PostgreSQL WAL archive backup"
            # Archive WAL files
            if [[ -d "/var/lib/postgresql/*/main/pg_wal" ]]; then
                tar -czf "$output_file" /var/lib/postgresql/*/main/pg_wal/ || \
                    error_exit "WAL archive backup failed"
            else
                log WARN "WAL directory not found, performing full backup instead"
                pg_dump -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" \
                    -F c -b -v -f "$output_file" "$PG_DATABASE" || \
                    error_exit "PostgreSQL backup failed"
            fi
            ;;

        transaction_log)
            log INFO "Archiving PostgreSQL transaction logs"
            # This should be configured in PostgreSQL archive_command
            # For manual backup, we'll archive current WAL files
            if command -v pg_receivewal &> /dev/null; then
                pg_receivewal -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" \
                    -D "$output_file.wal" || error_exit "WAL archiving failed"
            else
                log WARN "pg_receivewal not available"
            fi
            ;;
    esac

    unset PGPASSWORD

    log INFO "PostgreSQL backup completed successfully"
}

# Backup SQLite database
backup_sqlite() {
    local output_file="$1"

    log INFO "Starting SQLite backup..."

    if [[ ! -f "$SQLITE_DB_PATH" ]]; then
        error_exit "SQLite database not found: $SQLITE_DB_PATH"
    fi

    case "$BACKUP_TYPE" in
        full)
            log INFO "Performing full SQLite backup"

            # Use SQLite backup command for online backup
            if command -v sqlite3 &> /dev/null; then
                sqlite3 "$SQLITE_DB_PATH" ".backup '$output_file'" || \
                    error_exit "SQLite backup failed"
            else
                # Fallback to copy
                log WARN "sqlite3 command not found, using cp"
                cp "$SQLITE_DB_PATH" "$output_file" || \
                    error_exit "SQLite copy failed"
            fi
            ;;

        incremental)
            log WARN "SQLite doesn't support incremental backups, performing full backup"
            sqlite3 "$SQLITE_DB_PATH" ".backup '$output_file'" || \
                error_exit "SQLite backup failed"
            ;;
    esac

    log INFO "SQLite backup completed successfully"
}

# Compress backup
compress_backup() {
    local input_file="$1"
    local output_file="$2"

    if [[ "$COMPRESSION_ENABLED" != "true" ]]; then
        log INFO "Compression disabled, skipping"
        mv "$input_file" "$output_file"
        return 0
    fi

    log INFO "Compressing backup..."

    gzip -c "$input_file" > "$output_file" || error_exit "Compression failed"

    # Calculate compression ratio
    local original_size=$(stat -f%z "$input_file" 2>/dev/null || stat -c%s "$input_file")
    local compressed_size=$(stat -f%z "$output_file" 2>/dev/null || stat -c%s "$output_file")
    local ratio=$(awk "BEGIN {printf \"%.1f\", ($original_size - $compressed_size) / $original_size * 100}")

    log INFO "Compression completed: $ratio% reduction"

    # Remove uncompressed file
    rm -f "$input_file"
}

# Encrypt backup
encrypt_backup() {
    local input_file="$1"
    local output_file="$2"

    if [[ "$ENCRYPTION_ENABLED" != "true" ]]; then
        log INFO "Encryption disabled, skipping"
        mv "$input_file" "$output_file"
        return 0
    fi

    log INFO "Encrypting backup..."

    if [[ ! -f "$ENCRYPTION_KEY_FILE" ]]; then
        error_exit "Encryption key file not found: $ENCRYPTION_KEY_FILE"
    fi

    openssl enc -"$ENCRYPTION_ALGORITHM" -salt -pbkdf2 \
        -in "$input_file" -out "$output_file" \
        -pass file:"$ENCRYPTION_KEY_FILE" || error_exit "Encryption failed"

    log INFO "Encryption completed successfully"

    # Remove unencrypted file
    rm -f "$input_file"
}

# Generate checksum
generate_checksum() {
    local file="$1"
    local checksum_file="$file.sha256"

    log INFO "Generating checksum..."

    sha256sum "$file" > "$checksum_file" || error_exit "Checksum generation failed"

    log INFO "Checksum saved to: $checksum_file"
}

# Upload to S3
upload_to_s3() {
    local file="$1"
    local s3_path="$2"

    if [[ "$UPLOAD_OFFSITE" != "true" ]]; then
        log INFO "Off-site upload disabled, skipping"
        return 0
    fi

    log INFO "Uploading to S3: s3://$S3_BUCKET/$s3_path"

    if ! command -v aws &> /dev/null; then
        log WARN "AWS CLI not installed, skipping upload"
        return 1
    fi

    # Upload backup file
    aws s3 cp "$file" "s3://$S3_BUCKET/$s3_path" \
        --region "$S3_REGION" \
        --storage-class STANDARD_IA \
        --server-side-encryption AES256 || \
        error_exit "S3 upload failed"

    # Upload checksum file
    if [[ -f "$file.sha256" ]]; then
        aws s3 cp "$file.sha256" "s3://$S3_BUCKET/$s3_path.sha256" \
            --region "$S3_REGION" || \
            log WARN "Failed to upload checksum file"
    fi

    log INFO "Upload completed successfully"
}

# Clean old backups
cleanup_old_backups() {
    local backup_dir="$1"

    log INFO "Cleaning up backups older than $RETENTION_DAYS days..."

    find "$backup_dir" -name "*.backup*" -type f -mtime +"$RETENTION_DAYS" -delete || \
        log WARN "Failed to clean some old backups"

    log INFO "Cleanup completed"
}

# Main backup function
perform_backup() {
    local timestamp=$(date +%Y%m%d-%H%M%S)
    local backup_dir="$BACKUP_BASE_DIR/database"
    local backup_name="database-$BACKUP_TYPE-$timestamp"

    # Create temporary directory
    TEMP_DIR=$(mktemp -d) || error_exit "Failed to create temporary directory"
    trap cleanup_temp EXIT

    # Create backup directories
    create_backup_dirs "$backup_dir"

    local temp_backup="$TEMP_DIR/$backup_name.db"
    local compressed_backup="$TEMP_DIR/$backup_name.db.gz"
    local encrypted_backup="$backup_dir/$backup_name.backup"

    # Perform database backup
    log INFO "Starting database backup: $backup_name"
    log INFO "Backup type: $BACKUP_TYPE"
    log INFO "Database type: $DB_TYPE"

    case "$DB_TYPE" in
        postgresql)
            backup_postgresql "$temp_backup"
            ;;
        sqlite)
            backup_sqlite "$temp_backup"
            ;;
        *)
            error_exit "Unknown database type: $DB_TYPE"
            ;;
    esac

    # Compress backup
    compress_backup "$temp_backup" "$compressed_backup"

    # Encrypt backup
    encrypt_backup "$compressed_backup" "$encrypted_backup"

    # Generate checksum
    generate_checksum "$encrypted_backup"

    # Get backup size
    local backup_size=$(du -h "$encrypted_backup" | cut -f1)
    log INFO "Backup size: $backup_size"

    # Upload to S3
    upload_to_s3 "$encrypted_backup" "$S3_PREFIX$backup_name.backup"

    # Cleanup old backups
    cleanup_old_backups "$backup_dir"

    # Cleanup temporary directory
    cleanup_temp

    log INFO "Database backup completed successfully: $encrypted_backup"
    echo "$encrypted_backup"
}

# Display usage
usage() {
    cat <<EOF
Usage: $0 [OPTIONS]

Database backup script for ESP32 RoIP System

OPTIONS:
    -t, --type TYPE          Backup type: full, incremental, transaction_log (default: full)
    -d, --db-type TYPE       Database type: postgresql, sqlite (default: sqlite)
    -o, --output-dir DIR     Output directory (default: /var/backups/roip)
    -e, --encrypt            Enable encryption (default: true)
    -c, --compress           Enable compression (default: true)
    -u, --upload             Upload to S3 (default: false)
    -r, --retention DAYS     Retention period in days (default: 14)
    -h, --help               Display this help message

EXAMPLES:
    # Full SQLite backup
    $0 --type full --db-type sqlite

    # Full PostgreSQL backup with S3 upload
    $0 --type full --db-type postgresql --upload

    # Incremental PostgreSQL backup
    $0 --type incremental --db-type postgresql

ENVIRONMENT VARIABLES:
    DB_TYPE                  Database type (postgresql or sqlite)
    PG_HOST                  PostgreSQL host
    PG_PORT                  PostgreSQL port
    PG_USER                  PostgreSQL user
    PG_PASSWORD              PostgreSQL password
    PG_DATABASE              PostgreSQL database name
    SQLITE_DB_PATH           Path to SQLite database file
    BACKUP_BASE_DIR          Base backup directory
    ENCRYPTION_KEY_FILE      Path to encryption key file
    S3_BUCKET                S3 bucket name
    S3_REGION                S3 region

EOF
}

###############################################################################
# Main
###############################################################################

# Create log directory
mkdir -p "$LOG_DIR"

log INFO "========================================="
log INFO "Database Backup Script Started"
log INFO "========================================="

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -t|--type)
            BACKUP_TYPE="$2"
            shift 2
            ;;
        -d|--db-type)
            DB_TYPE="$2"
            shift 2
            ;;
        -o|--output-dir)
            BACKUP_BASE_DIR="$2"
            shift 2
            ;;
        -e|--encrypt)
            ENCRYPTION_ENABLED=true
            shift
            ;;
        -c|--compress)
            COMPRESSION_ENABLED=true
            shift
            ;;
        -u|--upload)
            UPLOAD_OFFSITE=true
            shift
            ;;
        -r|--retention)
            RETENTION_DAYS="$2"
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

# Perform backup
BACKUP_FILE=$(perform_backup)

log INFO "========================================="
log INFO "Database Backup Completed Successfully"
log INFO "Backup file: $BACKUP_FILE"
log INFO "========================================="

exit 0
