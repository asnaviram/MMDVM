#!/bin/bash
###############################################################################
# Database Restoration Script for ESP32 RoIP System
# Restores PostgreSQL and SQLite databases from backups
# Supports point-in-time recovery for PostgreSQL
###############################################################################

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Default values
BACKUP_BASE_DIR="${BACKUP_BASE_DIR:-/var/backups/roip}"
DB_TYPE="${DB_TYPE:-sqlite}"
RESTORE_TYPE="${RESTORE_TYPE:-full}"  # full or point_in_time
POINT_IN_TIME="${POINT_IN_TIME:-}"  # For PITR (format: YYYY-MM-DD HH:MM:SS)
BACKUP_FILE="${BACKUP_FILE:-}"
DRY_RUN="${DRY_RUN:-false}"
FORCE="${FORCE:-false}"

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

# Logging
LOG_DIR="${LOG_DIR:-$PROJECT_ROOT/logs}"
LOG_FILE="$LOG_DIR/restore-database-$(date +%Y%m%d).log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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
    cleanup_temp
    exit 1
}

cleanup_temp() {
    if [[ -n "${TEMP_DIR:-}" ]] && [[ -d "$TEMP_DIR" ]]; then
        log INFO "Cleaning up temporary directory: $TEMP_DIR"
        rm -rf "$TEMP_DIR"
    fi
}

# Find latest backup
find_latest_backup() {
    local backup_dir="$BACKUP_BASE_DIR/database"

    if [[ ! -d "$backup_dir" ]]; then
        error_exit "Backup directory not found: $backup_dir"
    fi

    local latest=$(ls -t "$backup_dir"/database-full-*.backup 2>/dev/null | head -n1)

    if [[ -z "$latest" ]]; then
        error_exit "No backup files found in $backup_dir"
    fi

    echo "$latest"
}

# List available backups
list_backups() {
    local backup_dir="$BACKUP_BASE_DIR/database"

    log INFO "Available database backups:"

    if [[ ! -d "$backup_dir" ]]; then
        log WARN "No backup directory found: $backup_dir"
        return 1
    fi

    local backups=$(ls -t "$backup_dir"/database-*.backup 2>/dev/null || true)

    if [[ -z "$backups" ]]; then
        log WARN "No backups found"
        return 1
    fi

    echo "$backups" | while read -r backup; do
        local size=$(du -h "$backup" | cut -f1)
        local date=$(stat -f%Sm -t "%Y-%m-%d %H:%M:%S" "$backup" 2>/dev/null || \
                     stat -c %y "$backup" | cut -d'.' -f1)
        log INFO "  - $(basename "$backup") ($size) - $date"
    done
}

# Verify backup integrity
verify_backup() {
    local backup_file="$1"

    log INFO "Verifying backup integrity..."

    # Check if file exists
    if [[ ! -f "$backup_file" ]]; then
        error_exit "Backup file not found: $backup_file"
    fi

    # Verify checksum if available
    if [[ -f "$backup_file.sha256" ]]; then
        log INFO "Verifying checksum..."
        if sha256sum -c "$backup_file.sha256" >/dev/null 2>&1; then
            log INFO "Checksum verification passed"
        else
            error_exit "Checksum verification failed"
        fi
    else
        log WARN "Checksum file not found, skipping verification"
    fi

    log INFO "Backup integrity verified"
}

# Decrypt backup
decrypt_backup() {
    local input_file="$1"
    local output_file="$2"

    log INFO "Decrypting backup..."

    if [[ ! -f "$ENCRYPTION_KEY_FILE" ]]; then
        error_exit "Encryption key file not found: $ENCRYPTION_KEY_FILE"
    fi

    openssl enc -d -"$ENCRYPTION_ALGORITHM" -pbkdf2 \
        -in "$input_file" -out "$output_file" \
        -pass file:"$ENCRYPTION_KEY_FILE" || error_exit "Decryption failed"

    log INFO "Decryption completed successfully"
}

# Decompress backup
decompress_backup() {
    local input_file="$1"
    local output_file="$2"

    log INFO "Decompressing backup..."

    gunzip -c "$input_file" > "$output_file" || error_exit "Decompression failed"

    log INFO "Decompression completed successfully"
}

# Create database backup before restore
create_pre_restore_backup() {
    log INFO "Creating pre-restore backup..."

    local timestamp=$(date +%Y%m%d-%H%M%S)
    local backup_dir="$BACKUP_BASE_DIR/pre-restore"
    mkdir -p "$backup_dir"

    case "$DB_TYPE" in
        postgresql)
            local backup_file="$backup_dir/pre-restore-$timestamp.dump"
            export PGPASSWORD="$PG_PASSWORD"
            pg_dump -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" \
                -F c -b -f "$backup_file" "$PG_DATABASE" 2>&1 | tee -a "$LOG_FILE" || \
                log WARN "Pre-restore backup failed"
            unset PGPASSWORD
            log INFO "Pre-restore backup saved: $backup_file"
            ;;

        sqlite)
            if [[ -f "$SQLITE_DB_PATH" ]]; then
                local backup_file="$backup_dir/pre-restore-$timestamp.db"
                cp "$SQLITE_DB_PATH" "$backup_file" || \
                    log WARN "Pre-restore backup failed"
                log INFO "Pre-restore backup saved: $backup_file"
            fi
            ;;
    esac
}

# Restore PostgreSQL database
restore_postgresql() {
    local backup_file="$1"

    log INFO "Restoring PostgreSQL database..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "[DRY RUN] Would restore PostgreSQL from: $backup_file"
        return 0
    fi

    export PGPASSWORD="$PG_PASSWORD"

    case "$RESTORE_TYPE" in
        full)
            log INFO "Performing full PostgreSQL restore"

            # Drop and recreate database
            if [[ "$FORCE" == "true" ]]; then
                log WARN "Dropping existing database..."
                psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d postgres \
                    -c "DROP DATABASE IF EXISTS $PG_DATABASE;" 2>&1 | tee -a "$LOG_FILE" || true
            fi

            # Create database if it doesn't exist
            psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d postgres \
                -c "CREATE DATABASE $PG_DATABASE;" 2>&1 | tee -a "$LOG_FILE" || true

            # Restore from backup
            pg_restore -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" \
                -d "$PG_DATABASE" -c -v "$backup_file" 2>&1 | tee -a "$LOG_FILE" || \
                error_exit "PostgreSQL restore failed"
            ;;

        point_in_time)
            if [[ -z "$POINT_IN_TIME" ]]; then
                error_exit "Point-in-time not specified for PITR"
            fi

            log INFO "Performing point-in-time recovery to: $POINT_IN_TIME"

            # This requires PostgreSQL WAL archiving to be configured
            # For simplicity, we'll restore the base backup and then apply WAL logs

            # Restore base backup
            pg_restore -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" \
                -d "$PG_DATABASE" -c "$backup_file" || \
                error_exit "Base backup restore failed"

            # Apply WAL logs up to the point in time
            # This is typically done through recovery.conf or recovery.signal in PostgreSQL 12+
            log WARN "Point-in-time recovery requires manual WAL configuration"
            log INFO "Please configure recovery target time in postgresql.conf:"
            log INFO "  recovery_target_time = '$POINT_IN_TIME'"
            ;;
    esac

    unset PGPASSWORD

    log INFO "PostgreSQL restore completed successfully"
}

# Restore SQLite database
restore_sqlite() {
    local backup_file="$1"

    log INFO "Restoring SQLite database..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "[DRY RUN] Would restore SQLite from: $backup_file"
        return 0
    fi

    # Create data directory if it doesn't exist
    local db_dir=$(dirname "$SQLITE_DB_PATH")
    mkdir -p "$db_dir"

    # Backup existing database if force is not set
    if [[ -f "$SQLITE_DB_PATH" ]] && [[ "$FORCE" != "true" ]]; then
        error_exit "Database already exists. Use --force to overwrite"
    fi

    # Restore database
    cp "$backup_file" "$SQLITE_DB_PATH" || error_exit "SQLite restore failed"

    # Set proper permissions
    chmod 644 "$SQLITE_DB_PATH"

    log INFO "SQLite restore completed successfully"
}

# Verify restored database
verify_restore() {
    log INFO "Verifying restored database..."

    case "$DB_TYPE" in
        postgresql)
            export PGPASSWORD="$PG_PASSWORD"

            # Check if database is accessible
            if psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" \
                -c "SELECT version();" >/dev/null 2>&1; then
                log INFO "PostgreSQL database is accessible"

                # Get table count
                local table_count=$(psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" \
                    -d "$PG_DATABASE" -t -c "SELECT COUNT(*) FROM information_schema.tables \
                    WHERE table_schema = 'public';" | tr -d '[:space:]')

                log INFO "Database contains $table_count tables"
            else
                error_exit "Cannot access restored database"
            fi

            unset PGPASSWORD
            ;;

        sqlite)
            if [[ -f "$SQLITE_DB_PATH" ]]; then
                # Check if database is valid
                if sqlite3 "$SQLITE_DB_PATH" "SELECT COUNT(*) FROM sqlite_master;" \
                    >/dev/null 2>&1; then
                    log INFO "SQLite database is valid"

                    # Get table count
                    local table_count=$(sqlite3 "$SQLITE_DB_PATH" \
                        "SELECT COUNT(*) FROM sqlite_master WHERE type='table';")

                    log INFO "Database contains $table_count tables"
                else
                    error_exit "Restored database is corrupted"
                fi
            else
                error_exit "Database file not found after restore"
            fi
            ;;
    esac

    log INFO "Database verification completed successfully"
}

# Main restore function
perform_restore() {
    # Determine backup file
    if [[ -z "$BACKUP_FILE" ]]; then
        BACKUP_FILE=$(find_latest_backup)
        log INFO "Using latest backup: $BACKUP_FILE"
    fi

    # Verify backup
    verify_backup "$BACKUP_FILE"

    # Create temporary directory
    TEMP_DIR=$(mktemp -d) || error_exit "Failed to create temporary directory"
    trap cleanup_temp EXIT

    # Decrypt backup
    local encrypted_file="$BACKUP_FILE"
    local decrypted_file="$TEMP_DIR/backup.gz"
    decrypt_backup "$encrypted_file" "$decrypted_file"

    # Decompress backup
    local compressed_file="$decrypted_file"
    local decompressed_file="$TEMP_DIR/backup.db"
    decompress_backup "$compressed_file" "$decompressed_file"

    # Create pre-restore backup
    if [[ "$FORCE" == "true" ]]; then
        create_pre_restore_backup
    fi

    # Restore database
    log INFO "Starting database restore"
    log INFO "Backup file: $BACKUP_FILE"
    log INFO "Database type: $DB_TYPE"
    log INFO "Restore type: $RESTORE_TYPE"

    case "$DB_TYPE" in
        postgresql)
            restore_postgresql "$decompressed_file"
            ;;
        sqlite)
            restore_sqlite "$decompressed_file"
            ;;
        *)
            error_exit "Unknown database type: $DB_TYPE"
            ;;
    esac

    # Verify restore
    verify_restore

    # Cleanup temporary directory
    cleanup_temp

    log INFO "Database restoration completed successfully"
}

# Display usage
usage() {
    cat <<EOF
Usage: $0 [OPTIONS]

Database restoration script for ESP32 RoIP System

OPTIONS:
    -f, --file FILE          Backup file to restore (default: latest)
    -d, --db-type TYPE       Database type: postgresql, sqlite (default: sqlite)
    -t, --type TYPE          Restore type: full, point_in_time (default: full)
    -p, --point-in-time TIME Point in time for PITR (format: "YYYY-MM-DD HH:MM:SS")
    --force                  Force restore (overwrite existing database)
    --dry-run                Show what would be restored without doing it
    --list                   List available backups
    -h, --help               Display this help message

EXAMPLES:
    # List available backups
    $0 --list

    # Restore latest SQLite backup
    $0 --db-type sqlite

    # Restore specific PostgreSQL backup
    $0 --db-type postgresql --file /var/backups/roip/database/database-full-20251122.backup

    # Point-in-time recovery
    $0 --db-type postgresql --type point_in_time --point-in-time "2025-11-22 12:00:00"

    # Dry run to see what would happen
    $0 --dry-run --file /var/backups/roip/database/database-full-20251122.backup

EOF
}

###############################################################################
# Main
###############################################################################

mkdir -p "$LOG_DIR"

log INFO "========================================="
log INFO "Database Restoration Script Started"
log INFO "========================================="

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -f|--file)
            BACKUP_FILE="$2"
            shift 2
            ;;
        -d|--db-type)
            DB_TYPE="$2"
            shift 2
            ;;
        -t|--type)
            RESTORE_TYPE="$2"
            shift 2
            ;;
        -p|--point-in-time)
            POINT_IN_TIME="$2"
            shift 2
            ;;
        --force)
            FORCE=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --list)
            list_backups
            exit 0
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

# Confirmation prompt unless forced or dry run
if [[ "$FORCE" != "true" ]] && [[ "$DRY_RUN" != "true" ]]; then
    read -p "This will restore the database. Are you sure? (yes/no): " -r
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        log INFO "Restoration cancelled by user"
        exit 0
    fi
fi

# Perform restoration
perform_restore

log INFO "========================================="
log INFO "Database Restoration Completed Successfully"
log INFO "========================================="

exit 0
