#!/bin/bash
###############################################################################
# Configuration Restoration Script for ESP32 RoIP System
# Restores configuration files, certificates, and system settings
###############################################################################

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Default values
BACKUP_BASE_DIR="${BACKUP_BASE_DIR:-/var/backups/roip}"
BACKUP_FILE="${BACKUP_FILE:-}"
DRY_RUN="${DRY_RUN:-false}"
FORCE="${FORCE:-false}"
RESTORE_SECRETS="${RESTORE_SECRETS:-false}"

# Encryption settings
ENCRYPTION_KEY_FILE="${ENCRYPTION_KEY_FILE:-/etc/roip/backup-encryption-key}"
ENCRYPTION_ALGORITHM="${ENCRYPTION_ALGORITHM:-aes-256-cbc}"

# Logging
LOG_DIR="${LOG_DIR:-$PROJECT_ROOT/logs}"
LOG_FILE="$LOG_DIR/restore-config-$(date +%Y%m%d).log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

find_latest_backup() {
    local backup_dir="$BACKUP_BASE_DIR/config"

    if [[ ! -d "$backup_dir" ]]; then
        error_exit "Backup directory not found: $backup_dir"
    fi

    local latest=$(ls -t "$backup_dir"/config-*.backup 2>/dev/null | head -n1)

    if [[ -z "$latest" ]]; then
        error_exit "No backup files found in $backup_dir"
    fi

    echo "$latest"
}

list_backups() {
    local backup_dir="$BACKUP_BASE_DIR/config"

    log INFO "Available configuration backups:"

    if [[ ! -d "$backup_dir" ]]; then
        log WARN "No backup directory found: $backup_dir"
        return 1
    fi

    local backups=$(ls -t "$backup_dir"/config-*.backup 2>/dev/null || true)

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

verify_backup() {
    local backup_file="$1"

    log INFO "Verifying backup integrity..."

    if [[ ! -f "$backup_file" ]]; then
        error_exit "Backup file not found: $backup_file"
    fi

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
}

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

decompress_backup() {
    local input_file="$1"
    local output_dir="$2"

    log INFO "Decompressing backup..."

    mkdir -p "$output_dir"
    tar -xzf "$input_file" -C "$output_dir" || error_exit "Decompression failed"

    log INFO "Decompression completed successfully"
}

restore_config_files() {
    local backup_dir="$1"

    log INFO "Restoring configuration files..."

    if [[ ! -d "$backup_dir/config" ]]; then
        log WARN "No config directory in backup"
        return 0
    fi

    # Restore server config
    if [[ -d "$backup_dir/config/server" ]]; then
        if [[ "$DRY_RUN" == "true" ]]; then
            log INFO "[DRY RUN] Would restore server config"
        else
            mkdir -p "$PROJECT_ROOT/roip-server/config"
            cp -r "$backup_dir/config/server/"* "$PROJECT_ROOT/roip-server/config/" || \
                log WARN "Failed to restore server config"
            log INFO "Server config restored"
        fi
    fi

    # Restore deployment config
    if [[ -d "$backup_dir/config/deployment" ]]; then
        if [[ "$DRY_RUN" == "true" ]]; then
            log INFO "[DRY RUN] Would restore deployment config"
        else
            mkdir -p "$PROJECT_ROOT/deployment"
            cp -r "$backup_dir/config/deployment/"* "$PROJECT_ROOT/deployment/" || \
                log WARN "Failed to restore deployment config"
            log INFO "Deployment config restored"
        fi
    fi

    # Restore backup config
    if [[ -d "$backup_dir/config/backup" ]]; then
        if [[ "$DRY_RUN" == "true" ]]; then
            log INFO "[DRY RUN] Would restore backup config"
        else
            mkdir -p "$PROJECT_ROOT/backup"
            cp -r "$backup_dir/config/backup/"* "$PROJECT_ROOT/backup/" || \
                log WARN "Failed to restore backup config"
            log INFO "Backup config restored"
        fi
    fi

    # Restore docker-compose.yml
    if [[ -f "$backup_dir/config/docker-compose.yml" ]]; then
        if [[ "$DRY_RUN" == "true" ]]; then
            log INFO "[DRY RUN] Would restore docker-compose.yml"
        else
            cp "$backup_dir/config/docker-compose.yml" "$PROJECT_ROOT/" || \
                log WARN "Failed to restore docker-compose.yml"
            log INFO "docker-compose.yml restored"
        fi
    fi

    # Restore PlatformIO config
    if [[ -f "$backup_dir/config/platformio.ini" ]]; then
        if [[ "$DRY_RUN" == "true" ]]; then
            log INFO "[DRY RUN] Would restore platformio.ini"
        else
            cp "$backup_dir/config/platformio.ini" "$PROJECT_ROOT/" || \
                log WARN "Failed to restore platformio.ini"
            log INFO "platformio.ini restored"
        fi
    fi

    log INFO "Configuration files restored"
}

restore_env_files() {
    local backup_dir="$1"

    log INFO "Restoring environment files..."

    if [[ ! -d "$backup_dir/env" ]]; then
        log WARN "No env directory in backup"
        return 0
    fi

    if [[ "$RESTORE_SECRETS" != "true" ]]; then
        log WARN "Secret restoration disabled, only restoring templates"
        return 0
    fi

    if [[ -f "$backup_dir/env/server.env" ]]; then
        if [[ "$DRY_RUN" == "true" ]]; then
            log INFO "[DRY RUN] Would restore server .env"
        else
            cp "$backup_dir/env/server.env" "$PROJECT_ROOT/roip-server/.env" || \
                log WARN "Failed to restore server .env"
            chmod 600 "$PROJECT_ROOT/roip-server/.env"
            log INFO "Server .env restored"
        fi
    fi

    log INFO "Environment files restored"
}

restore_certificates() {
    local backup_dir="$1"

    log INFO "Restoring certificates..."

    if [[ ! -d "$backup_dir/certificates" ]]; then
        log WARN "No certificates directory in backup"
        return 0
    fi

    # Restore server certificates
    if [[ -d "$backup_dir/certificates/server" ]]; then
        if [[ "$DRY_RUN" == "true" ]]; then
            log INFO "[DRY RUN] Would restore server certificates"
        else
            mkdir -p "$PROJECT_ROOT/roip-server/certs"
            cp -r "$backup_dir/certificates/server/"* "$PROJECT_ROOT/roip-server/certs/" || \
                log WARN "Failed to restore server certificates"
            chmod 600 "$PROJECT_ROOT/roip-server/certs/"*.key 2>/dev/null || true
            log INFO "Server certificates restored"
        fi
    fi

    # Restore Let's Encrypt certificates (requires root)
    if [[ -d "$backup_dir/certificates/letsencrypt" ]] && [[ "$RESTORE_SECRETS" == "true" ]]; then
        if [[ "$DRY_RUN" == "true" ]]; then
            log INFO "[DRY RUN] Would restore Let's Encrypt certificates"
        elif [[ $EUID -eq 0 ]]; then
            mkdir -p "/etc/letsencrypt/live"
            cp -r "$backup_dir/certificates/letsencrypt/"* "/etc/letsencrypt/live/" || \
                log WARN "Failed to restore Let's Encrypt certificates"
            log INFO "Let's Encrypt certificates restored"
        else
            log WARN "Root privileges required to restore Let's Encrypt certificates"
        fi
    fi

    log INFO "Certificates restored"
}

restore_system_config() {
    local backup_dir="$1"

    log INFO "Restoring system configuration..."

    if [[ ! -d "$backup_dir/system" ]]; then
        log WARN "No system directory in backup"
        return 0
    fi

    # Restore crontab
    if [[ -f "$backup_dir/system/crontab.txt" ]]; then
        if [[ "$DRY_RUN" == "true" ]]; then
            log INFO "[DRY RUN] Would restore crontab"
        else
            log INFO "Crontab backup found. To restore, run:"
            log INFO "  crontab $backup_dir/system/crontab.txt"
        fi
    fi

    # Note about nginx configs
    if [[ -d "$backup_dir/system/nginx" ]]; then
        log INFO "Nginx config backup found at: $backup_dir/system/nginx"
        log INFO "Restore manually if needed"
    fi

    log INFO "System configuration noted"
}

verify_manifest() {
    local backup_dir="$1"

    if [[ ! -f "$backup_dir/manifest.json" ]]; then
        log WARN "No manifest file found in backup"
        return 0
    fi

    log INFO "Backup manifest:"
    cat "$backup_dir/manifest.json" | tee -a "$LOG_FILE"
}

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
    local decrypted_file="$TEMP_DIR/backup.tar.gz"
    decrypt_backup "$encrypted_file" "$decrypted_file"

    # Decompress backup
    local extract_dir="$TEMP_DIR/extracted"
    decompress_backup "$decrypted_file" "$extract_dir"

    # Find the actual backup directory (it's nested)
    local backup_content_dir=$(find "$extract_dir" -type d -name "config-*" | head -n1)
    if [[ -z "$backup_content_dir" ]]; then
        backup_content_dir="$extract_dir"
    fi

    # Verify manifest
    verify_manifest "$backup_content_dir"

    # Perform restoration
    log INFO "Starting configuration restore"
    log INFO "Backup file: $BACKUP_FILE"

    restore_config_files "$backup_content_dir"
    restore_env_files "$backup_content_dir"
    restore_certificates "$backup_content_dir"
    restore_system_config "$backup_content_dir"

    # Cleanup temporary directory
    cleanup_temp

    log INFO "Configuration restoration completed successfully"
}

usage() {
    cat <<EOF
Usage: $0 [OPTIONS]

Configuration restoration script for ESP32 RoIP System

OPTIONS:
    -f, --file FILE          Backup file to restore (default: latest)
    --restore-secrets        Restore secrets and passwords (default: false)
    --force                  Force restore (overwrite existing files)
    --dry-run                Show what would be restored without doing it
    --list                   List available backups
    -h, --help               Display this help message

EXAMPLES:
    # List available backups
    $0 --list

    # Restore latest configuration backup
    $0

    # Restore specific backup including secrets
    $0 --file /var/backups/roip/config/config-20251122.backup --restore-secrets

    # Dry run to see what would happen
    $0 --dry-run

EOF
}

###############################################################################
# Main
###############################################################################

mkdir -p "$LOG_DIR"

log INFO "========================================="
log INFO "Configuration Restoration Script Started"
log INFO "========================================="

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -f|--file)
            BACKUP_FILE="$2"
            shift 2
            ;;
        --restore-secrets)
            RESTORE_SECRETS=true
            shift
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

# Confirmation prompt unless dry run
if [[ "$DRY_RUN" != "true" ]]; then
    read -p "This will restore configuration files. Are you sure? (yes/no): " -r
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        log INFO "Restoration cancelled by user"
        exit 0
    fi
fi

# Perform restoration
perform_restore

log INFO "========================================="
log INFO "Configuration Restoration Completed Successfully"
log INFO "========================================="

exit 0
