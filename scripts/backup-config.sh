#!/bin/bash
###############################################################################
# Configuration Backup Script for ESP32 RoIP System
# Backs up all configuration files, environment variables, and settings
###############################################################################

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Default values
BACKUP_BASE_DIR="${BACKUP_BASE_DIR:-/var/backups/roip}"
ENCRYPTION_ENABLED="${ENCRYPTION_ENABLED:-true}"
COMPRESSION_ENABLED="${COMPRESSION_ENABLED:-true}"
UPLOAD_OFFSITE="${UPLOAD_OFFSITE:-false}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
INCLUDE_SECRETS="${INCLUDE_SECRETS:-false}"

# Encryption settings
ENCRYPTION_KEY_FILE="${ENCRYPTION_KEY_FILE:-/etc/roip/backup-encryption-key}"
ENCRYPTION_ALGORITHM="${ENCRYPTION_ALGORITHM:-aes-256-cbc}"

# S3 settings
S3_BUCKET="${S3_BUCKET:-roip-backups}"
S3_REGION="${S3_REGION:-us-east-1}"
S3_PREFIX="${S3_PREFIX:-production/config/}"

# Logging
LOG_DIR="${LOG_DIR:-$PROJECT_ROOT/logs}"
LOG_FILE="$LOG_DIR/backup-config-$(date +%Y%m%d).log"

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

create_backup_dirs() {
    local backup_dir="$1"
    log INFO "Creating backup directory: $backup_dir"
    mkdir -p "$backup_dir" || error_exit "Failed to create backup directory"
    chmod 700 "$backup_dir"
}

# Backup configuration files
backup_config_files() {
    local output_dir="$1"

    log INFO "Backing up configuration files..."

    local config_dir="$output_dir/config"
    mkdir -p "$config_dir"

    # RoIP server configuration
    if [[ -d "$PROJECT_ROOT/roip-server/config" ]]; then
        cp -r "$PROJECT_ROOT/roip-server/config" "$config_dir/server/" || \
            log WARN "Failed to copy server config"
    fi

    # Deployment configurations
    if [[ -d "$PROJECT_ROOT/deployment" ]]; then
        cp -r "$PROJECT_ROOT/deployment" "$config_dir/deployment/" || \
            log WARN "Failed to copy deployment config"
    fi

    # Backup configuration
    if [[ -d "$PROJECT_ROOT/backup" ]]; then
        cp -r "$PROJECT_ROOT/backup" "$config_dir/backup/" || \
            log WARN "Failed to copy backup config"
    fi

    # Docker configurations
    if [[ -f "$PROJECT_ROOT/docker-compose.yml" ]]; then
        cp "$PROJECT_ROOT/docker-compose.yml" "$config_dir/" || \
            log WARN "Failed to copy docker-compose.yml"
    fi

    if [[ -d "$PROJECT_ROOT/docker" ]]; then
        cp -r "$PROJECT_ROOT/docker" "$config_dir/docker/" || \
            log WARN "Failed to copy docker config"
    fi

    # PlatformIO configuration
    if [[ -f "$PROJECT_ROOT/platformio.ini" ]]; then
        cp "$PROJECT_ROOT/platformio.ini" "$config_dir/" || \
            log WARN "Failed to copy platformio.ini"
    fi

    # Security configurations
    if [[ -d "$PROJECT_ROOT/security" ]]; then
        # Copy security configs but exclude private keys unless explicitly requested
        mkdir -p "$config_dir/security"
        find "$PROJECT_ROOT/security" -type f ! -name "*.key" ! -name "*.pem" -exec \
            cp --parents {} "$config_dir/security/" \; 2>/dev/null || true
    fi

    log INFO "Configuration files backed up successfully"
}

# Backup environment files
backup_env_files() {
    local output_dir="$1"

    log INFO "Backing up environment files..."

    local env_dir="$output_dir/env"
    mkdir -p "$env_dir"

    # Server .env file
    if [[ -f "$PROJECT_ROOT/roip-server/.env" ]]; then
        if [[ "$INCLUDE_SECRETS" == "true" ]]; then
            cp "$PROJECT_ROOT/roip-server/.env" "$env_dir/server.env" || \
                log WARN "Failed to copy server .env"
        else
            # Copy .env but mask sensitive values
            grep -v -E "PASSWORD|SECRET|KEY|TOKEN" "$PROJECT_ROOT/roip-server/.env" > \
                "$env_dir/server.env.template" 2>/dev/null || true
        fi
    fi

    # .env.example files
    find "$PROJECT_ROOT" -name ".env.example" -exec cp {} "$env_dir/" \; 2>/dev/null || true

    log INFO "Environment files backed up"
}

# Backup certificates
backup_certificates() {
    local output_dir="$1"

    log INFO "Backing up certificates..."

    local cert_dir="$output_dir/certificates"
    mkdir -p "$cert_dir"

    # Server certificates
    if [[ -d "$PROJECT_ROOT/roip-server/certs" ]]; then
        cp -r "$PROJECT_ROOT/roip-server/certs" "$cert_dir/server/" || \
            log WARN "Failed to copy server certificates"
    fi

    # Let's Encrypt certificates (if exists)
    if [[ -d "/etc/letsencrypt/live" ]]; then
        if [[ "$INCLUDE_SECRETS" == "true" ]]; then
            cp -rL "/etc/letsencrypt/live" "$cert_dir/letsencrypt/" 2>/dev/null || \
                log WARN "Failed to copy Let's Encrypt certificates"
        fi
    fi

    # Security directory certificates
    if [[ -d "$PROJECT_ROOT/security" ]]; then
        find "$PROJECT_ROOT/security" -name "*.crt" -o -name "*.pem" | while read -r cert; do
            cp "$cert" "$cert_dir/" 2>/dev/null || true
        done
    fi

    log INFO "Certificates backed up"
}

# Backup system configuration
backup_system_config() {
    local output_dir="$1"

    log INFO "Backing up system configuration..."

    local sys_dir="$output_dir/system"
    mkdir -p "$sys_dir"

    # Cron jobs
    crontab -l > "$sys_dir/crontab.txt" 2>/dev/null || \
        echo "No crontab" > "$sys_dir/crontab.txt"

    # System services
    if command -v systemctl &> /dev/null; then
        systemctl list-unit-files --type=service --state=enabled > \
            "$sys_dir/systemd-services.txt" 2>/dev/null || true
    fi

    # Network configuration
    if [[ -f "/etc/network/interfaces" ]]; then
        cp "/etc/network/interfaces" "$sys_dir/" 2>/dev/null || true
    fi

    # Nginx/Apache configs (if exists)
    if [[ -d "/etc/nginx/sites-enabled" ]]; then
        mkdir -p "$sys_dir/nginx"
        cp -r /etc/nginx/sites-enabled "$sys_dir/nginx/" 2>/dev/null || true
    fi

    log INFO "System configuration backed up"
}

# Create backup manifest
create_manifest() {
    local output_dir="$1"
    local manifest_file="$output_dir/manifest.json"

    log INFO "Creating backup manifest..."

    cat > "$manifest_file" <<EOF
{
  "backup_type": "configuration",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "hostname": "$(hostname)",
  "backup_version": "1.0",
  "includes_secrets": $INCLUDE_SECRETS,
  "project_root": "$PROJECT_ROOT",
  "files": {
EOF

    # Count files in each directory
    local config_count=$(find "$output_dir/config" -type f 2>/dev/null | wc -l)
    local env_count=$(find "$output_dir/env" -type f 2>/dev/null | wc -l)
    local cert_count=$(find "$output_dir/certificates" -type f 2>/dev/null | wc -l)
    local sys_count=$(find "$output_dir/system" -type f 2>/dev/null | wc -l)

    cat >> "$manifest_file" <<EOF
    "config_files": $config_count,
    "env_files": $env_count,
    "certificates": $cert_count,
    "system_files": $sys_count
  },
  "backup_size": "$(du -sh "$output_dir" | cut -f1)",
  "backup_hash": "$(find "$output_dir" -type f -exec sha256sum {} \; | sort | sha256sum | cut -d' ' -f1)"
}
EOF

    log INFO "Manifest created: $manifest_file"
}

# Compress backup
compress_backup() {
    local input_dir="$1"
    local output_file="$2"

    if [[ "$COMPRESSION_ENABLED" != "true" ]]; then
        log INFO "Compression disabled, skipping"
        return 0
    fi

    log INFO "Compressing configuration backup..."

    tar -czf "$output_file" -C "$(dirname "$input_dir")" "$(basename "$input_dir")" || \
        error_exit "Compression failed"

    local original_size=$(du -sb "$input_dir" | cut -f1)
    local compressed_size=$(stat -f%z "$output_file" 2>/dev/null || stat -c%s "$output_file")
    local ratio=$(awk "BEGIN {printf \"%.1f\", ($original_size - $compressed_size) / $original_size * 100}")

    log INFO "Compression completed: $ratio% reduction"
}

# Encrypt backup
encrypt_backup() {
    local input_file="$1"
    local output_file="$2"

    if [[ "$ENCRYPTION_ENABLED" != "true" ]]; then
        log INFO "Encryption disabled, skipping"
        cp "$input_file" "$output_file"
        return 0
    fi

    log INFO "Encrypting configuration backup..."

    if [[ ! -f "$ENCRYPTION_KEY_FILE" ]]; then
        error_exit "Encryption key file not found: $ENCRYPTION_KEY_FILE"
    fi

    openssl enc -"$ENCRYPTION_ALGORITHM" -salt -pbkdf2 \
        -in "$input_file" -out "$output_file" \
        -pass file:"$ENCRYPTION_KEY_FILE" || error_exit "Encryption failed"

    log INFO "Encryption completed successfully"
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

    aws s3 cp "$file" "s3://$S3_BUCKET/$s3_path" \
        --region "$S3_REGION" \
        --storage-class STANDARD_IA \
        --server-side-encryption AES256 || \
        error_exit "S3 upload failed"

    if [[ -f "$file.sha256" ]]; then
        aws s3 cp "$file.sha256" "s3://$S3_BUCKET/$s3_path.sha256" \
            --region "$S3_REGION" || log WARN "Failed to upload checksum"
    fi

    log INFO "Upload completed successfully"
}

# Clean old backups
cleanup_old_backups() {
    local backup_dir="$1"

    log INFO "Cleaning up backups older than $RETENTION_DAYS days..."

    find "$backup_dir" -name "config-*.backup" -type f -mtime +"$RETENTION_DAYS" -delete || \
        log WARN "Failed to clean some old backups"

    log INFO "Cleanup completed"
}

# Main backup function
perform_backup() {
    local timestamp=$(date +%Y%m%d-%H%M%S)
    local backup_dir="$BACKUP_BASE_DIR/config"
    local backup_name="config-$timestamp"

    # Create temporary directory
    TEMP_DIR=$(mktemp -d) || error_exit "Failed to create temporary directory"
    trap cleanup_temp EXIT

    # Create backup directories
    create_backup_dirs "$backup_dir"

    local temp_backup_dir="$TEMP_DIR/$backup_name"
    mkdir -p "$temp_backup_dir"

    # Perform backups
    log INFO "Starting configuration backup: $backup_name"

    backup_config_files "$temp_backup_dir"
    backup_env_files "$temp_backup_dir"
    backup_certificates "$temp_backup_dir"
    backup_system_config "$temp_backup_dir"

    # Create manifest
    create_manifest "$temp_backup_dir"

    # Compress
    local compressed_file="$TEMP_DIR/$backup_name.tar.gz"
    compress_backup "$temp_backup_dir" "$compressed_file"

    # Encrypt
    local encrypted_file="$backup_dir/$backup_name.backup"
    encrypt_backup "$compressed_file" "$encrypted_file"

    # Generate checksum
    generate_checksum "$encrypted_file"

    # Get backup size
    local backup_size=$(du -h "$encrypted_file" | cut -f1)
    log INFO "Backup size: $backup_size"

    # Upload to S3
    upload_to_s3 "$encrypted_file" "$S3_PREFIX$backup_name.backup"

    # Cleanup old backups
    cleanup_old_backups "$backup_dir"

    # Cleanup temporary directory
    cleanup_temp

    log INFO "Configuration backup completed successfully: $encrypted_file"
    echo "$encrypted_file"
}

# Display usage
usage() {
    cat <<EOF
Usage: $0 [OPTIONS]

Configuration backup script for ESP32 RoIP System

OPTIONS:
    -o, --output-dir DIR     Output directory (default: /var/backups/roip)
    -s, --include-secrets    Include secrets/passwords (default: false)
    -e, --encrypt            Enable encryption (default: true)
    -c, --compress           Enable compression (default: true)
    -u, --upload             Upload to S3 (default: false)
    -r, --retention DAYS     Retention period in days (default: 30)
    -h, --help               Display this help message

EXAMPLES:
    # Basic configuration backup
    $0

    # Full backup including secrets with S3 upload
    $0 --include-secrets --upload

    # Custom retention period
    $0 --retention 90

EOF
}

###############################################################################
# Main
###############################################################################

mkdir -p "$LOG_DIR"

log INFO "========================================="
log INFO "Configuration Backup Script Started"
log INFO "========================================="

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -o|--output-dir)
            BACKUP_BASE_DIR="$2"
            shift 2
            ;;
        -s|--include-secrets)
            INCLUDE_SECRETS=true
            shift
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
log INFO "Configuration Backup Completed Successfully"
log INFO "Backup file: $BACKUP_FILE"
log INFO "========================================="

exit 0
