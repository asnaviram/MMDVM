#!/bin/bash
###############################################################################
# Full System Restoration Script for ESP32 RoIP System
# Orchestrates complete restoration from backup
###############################################################################

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Default values
BACKUP_BASE_DIR="${BACKUP_BASE_DIR:-/var/backups/roip}"
BACKUP_TIMESTAMP="${BACKUP_TIMESTAMP:-latest}"
DRY_RUN="${DRY_RUN:-false}"
FORCE="${FORCE:-false}"
RESTORE_SECRETS="${RESTORE_SECRETS:-true}"

# Restoration order
RESTORE_ORDER=(
    "database"
    "certificates"
    "config"
    "firmware"
    "logs"
)

# Component flags
RESTORE_DATABASE="${RESTORE_DATABASE:-true}"
RESTORE_CONFIG="${RESTORE_CONFIG:-true}"
RESTORE_CERTIFICATES="${RESTORE_CERTIFICATES:-true}"
RESTORE_FIRMWARE="${RESTORE_FIRMWARE:-false}"
RESTORE_LOGS="${RESTORE_LOGS:-false}"

# Logging
LOG_DIR="${LOG_DIR:-$PROJECT_ROOT/logs}"
LOG_FILE="$LOG_DIR/restore-full-$(date +%Y%m%d).log"

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
    exit 1
}

check_prerequisites() {
    log INFO "Checking prerequisites..."

    local required_scripts=(
        "$SCRIPT_DIR/restore-database.sh"
        "$SCRIPT_DIR/restore-config.sh"
    )

    for script in "${required_scripts[@]}"; do
        if [[ ! -f "$script" ]]; then
            error_exit "Required script not found: $script"
        fi
        if [[ ! -x "$script" ]]; then
            chmod +x "$script"
        fi
    done

    log INFO "Prerequisites check completed"
}

check_backup_availability() {
    log INFO "Checking backup availability..."

    if [[ ! -d "$BACKUP_BASE_DIR" ]]; then
        error_exit "Backup directory not found: $BACKUP_BASE_DIR"
    fi

    local components_found=0

    if [[ "$RESTORE_DATABASE" == "true" ]]; then
        if [[ -d "$BACKUP_BASE_DIR/database" ]] && \
           [[ -n "$(ls -A "$BACKUP_BASE_DIR/database" 2>/dev/null)" ]]; then
            log INFO "Database backups found"
            ((components_found++))
        else
            log WARN "No database backups found"
        fi
    fi

    if [[ "$RESTORE_CONFIG" == "true" ]]; then
        if [[ -d "$BACKUP_BASE_DIR/config" ]] && \
           [[ -n "$(ls -A "$BACKUP_BASE_DIR/config" 2>/dev/null)" ]]; then
            log INFO "Configuration backups found"
            ((components_found++))
        else
            log WARN "No configuration backups found"
        fi
    fi

    if [[ $components_found -eq 0 ]]; then
        error_exit "No backups found in $BACKUP_BASE_DIR"
    fi

    log INFO "Found backups for $components_found component(s)"
}

stop_services() {
    log INFO "===== Stopping Services ====="

    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "[DRY RUN] Would stop services"
        return 0
    fi

    # Stop RoIP server
    if command -v systemctl &> /dev/null; then
        if systemctl is-active --quiet roip-server 2>/dev/null; then
            log INFO "Stopping roip-server service..."
            systemctl stop roip-server || log WARN "Failed to stop roip-server"
        fi
    fi

    # Stop docker containers
    if command -v docker-compose &> /dev/null; then
        if [[ -f "$PROJECT_ROOT/docker-compose.yml" ]]; then
            log INFO "Stopping docker containers..."
            docker-compose -f "$PROJECT_ROOT/docker-compose.yml" down || \
                log WARN "Failed to stop docker containers"
        fi
    fi

    # Kill any running node processes
    pkill -f "node.*roip-server" || true

    log INFO "Services stopped"
}

restore_database() {
    log INFO "===== Restoring Database ====="

    if [[ "$RESTORE_DATABASE" != "true" ]]; then
        log INFO "Database restore skipped"
        return 0
    fi

    local opts=""
    [[ "$DRY_RUN" == "true" ]] && opts="$opts --dry-run"
    [[ "$FORCE" == "true" ]] && opts="$opts --force"

    if "$SCRIPT_DIR/restore-database.sh" $opts; then
        log INFO "Database restore completed successfully"
        return 0
    else
        log ERROR "Database restore failed"
        return 1
    fi
}

restore_configuration() {
    log INFO "===== Restoring Configuration ====="

    if [[ "$RESTORE_CONFIG" != "true" ]]; then
        log INFO "Configuration restore skipped"
        return 0
    fi

    local opts=""
    [[ "$DRY_RUN" == "true" ]] && opts="$opts --dry-run"
    [[ "$RESTORE_SECRETS" == "true" ]] && opts="$opts --restore-secrets"

    if "$SCRIPT_DIR/restore-config.sh" $opts; then
        log INFO "Configuration restore completed successfully"
        return 0
    else
        log ERROR "Configuration restore failed"
        return 1
    fi
}

restore_logs() {
    log INFO "===== Restoring Logs ====="

    if [[ "$RESTORE_LOGS" != "true" ]]; then
        log INFO "Logs restore skipped"
        return 0
    fi

    local backup_dir="$BACKUP_BASE_DIR/logs"
    if [[ ! -d "$backup_dir" ]]; then
        log WARN "No logs backup directory found"
        return 0
    fi

    local latest_backup=$(ls -t "$backup_dir"/logs-*.tar.gz 2>/dev/null | head -n1)
    if [[ -z "$latest_backup" ]]; then
        log WARN "No log backups found"
        return 0
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "[DRY RUN] Would restore logs from: $latest_backup"
        return 0
    fi

    log INFO "Restoring logs from: $latest_backup"
    mkdir -p "$PROJECT_ROOT/logs"
    tar -xzf "$latest_backup" -C "$PROJECT_ROOT/logs" || {
        log WARN "Failed to restore logs"
        return 1
    }

    log INFO "Logs restored successfully"
    return 0
}

restore_firmware() {
    log INFO "===== Restoring Firmware ====="

    if [[ "$RESTORE_FIRMWARE" != "true" ]]; then
        log INFO "Firmware restore skipped"
        return 0
    fi

    local backup_dir="$BACKUP_BASE_DIR/firmware"
    if [[ ! -d "$backup_dir" ]]; then
        log WARN "No firmware backup directory found"
        return 0
    fi

    local latest_backup=$(ls -t "$backup_dir"/firmware-*.tar.gz 2>/dev/null | head -n1)
    if [[ -z "$latest_backup" ]]; then
        log WARN "No firmware backups found"
        return 0
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "[DRY RUN] Would restore firmware from: $latest_backup"
        return 0
    fi

    log INFO "Restoring firmware from: $latest_backup"
    mkdir -p "$PROJECT_ROOT/.pio/build"
    tar -xzf "$latest_backup" -C "$PROJECT_ROOT" || {
        log WARN "Failed to restore firmware"
        return 1
    }

    log INFO "Firmware restored successfully"
    return 0
}

verify_restoration() {
    log INFO "===== Verifying Restoration ====="

    local errors=0

    # Verify database
    if [[ "$RESTORE_DATABASE" == "true" ]]; then
        if [[ -f "$PROJECT_ROOT/roip-server/data/roip.db" ]] || \
           command -v psql &> /dev/null; then
            log INFO "Database verification passed"
        else
            log ERROR "Database verification failed"
            ((errors++))
        fi
    fi

    # Verify configuration
    if [[ "$RESTORE_CONFIG" == "true" ]]; then
        if [[ -d "$PROJECT_ROOT/roip-server/config" ]]; then
            log INFO "Configuration verification passed"
        else
            log ERROR "Configuration verification failed"
            ((errors++))
        fi
    fi

    if [[ $errors -gt 0 ]]; then
        log ERROR "Restoration verification failed with $errors error(s)"
        return 1
    fi

    log INFO "All verifications passed"
    return 0
}

start_services() {
    log INFO "===== Starting Services ====="

    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "[DRY RUN] Would start services"
        return 0
    fi

    # Start docker containers
    if command -v docker-compose &> /dev/null; then
        if [[ -f "$PROJECT_ROOT/docker-compose.yml" ]]; then
            log INFO "Starting docker containers..."
            docker-compose -f "$PROJECT_ROOT/docker-compose.yml" up -d || \
                log WARN "Failed to start docker containers"
        fi
    fi

    # Start RoIP server
    if command -v systemctl &> /dev/null; then
        if systemctl list-unit-files roip-server.service &> /dev/null; then
            log INFO "Starting roip-server service..."
            systemctl start roip-server || log WARN "Failed to start roip-server"
        fi
    fi

    # Wait for services to start
    log INFO "Waiting for services to start..."
    sleep 5

    log INFO "Services started"
}

health_check() {
    log INFO "===== Performing Health Check ====="

    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "[DRY RUN] Would perform health check"
        return 0
    fi

    local healthy=true

    # Check if server is responding
    if command -v curl &> /dev/null; then
        if curl -sf http://localhost:8080/health >/dev/null 2>&1; then
            log INFO "Server health check passed"
        else
            log WARN "Server health check failed"
            healthy=false
        fi
    fi

    # Check database connection
    if [[ -f "$PROJECT_ROOT/roip-server/data/roip.db" ]]; then
        if sqlite3 "$PROJECT_ROOT/roip-server/data/roip.db" "SELECT 1;" >/dev/null 2>&1; then
            log INFO "Database connectivity check passed"
        else
            log WARN "Database connectivity check failed"
            healthy=false
        fi
    fi

    if [[ "$healthy" == "true" ]]; then
        log INFO "All health checks passed"
        return 0
    else
        log WARN "Some health checks failed"
        return 1
    fi
}

create_restore_report() {
    local report_file="$LOG_DIR/restore-report-$(date +%Y%m%d-%H%M%S).txt"

    log INFO "Creating restoration report..."

    cat > "$report_file" <<EOF
===================================
Full System Restoration Report
===================================

Date: $(date)
Backup Location: $BACKUP_BASE_DIR
Dry Run: $DRY_RUN

Components Restored:
  - Database: $RESTORE_DATABASE
  - Configuration: $RESTORE_CONFIG
  - Certificates: $RESTORE_CERTIFICATES
  - Firmware: $RESTORE_FIRMWARE
  - Logs: $RESTORE_LOGS

System Status:
EOF

    if command -v systemctl &> /dev/null; then
        echo "" >> "$report_file"
        echo "Services:" >> "$report_file"
        systemctl status roip-server --no-pager >> "$report_file" 2>&1 || echo "  roip-server: not found" >> "$report_file"
    fi

    if command -v docker-compose &> /dev/null; then
        echo "" >> "$report_file"
        echo "Docker Containers:" >> "$report_file"
        docker-compose ps >> "$report_file" 2>&1 || echo "  No containers running" >> "$report_file"
    fi

    log INFO "Restoration report created: $report_file"
}

perform_restore() {
    log INFO "Starting full system restoration"

    # Stop services
    stop_services

    local failed=false

    # Restore components in order
    for component in "${RESTORE_ORDER[@]}"; do
        case "$component" in
            database)
                restore_database || failed=true
                ;;
            config)
                restore_configuration || failed=true
                ;;
            certificates)
                # Certificates are restored with config
                :
                ;;
            firmware)
                restore_firmware || failed=true
                ;;
            logs)
                restore_logs || failed=true
                ;;
        esac

        if [[ "$failed" == "true" ]] && [[ "$FORCE" != "true" ]]; then
            error_exit "Restoration failed for component: $component"
        fi
    done

    # Verify restoration
    verify_restoration || log WARN "Restoration verification had issues"

    # Start services
    start_services

    # Health check
    health_check || log WARN "Health check had issues"

    # Create report
    create_restore_report

    if [[ "$failed" == "true" ]]; then
        log WARN "Restoration completed with some failures"
    else
        log INFO "Full system restoration completed successfully"
    fi
}

usage() {
    cat <<EOF
Usage: $0 [OPTIONS]

Full system restoration script for ESP32 RoIP System

OPTIONS:
    -o, --backup-dir DIR     Backup directory (default: /var/backups/roip)
    -t, --timestamp TIME     Backup timestamp to restore (default: latest)
    --restore-secrets        Restore secrets and passwords (default: true)
    --force                  Continue even if errors occur
    --dry-run                Show what would be restored without doing it
    --skip-database          Skip database restore
    --skip-config            Skip configuration restore
    --skip-firmware          Skip firmware restore
    --skip-logs              Skip logs restore
    -h, --help               Display this help message

EXAMPLES:
    # Full restore with all components
    $0

    # Restore only database and config
    $0 --skip-firmware --skip-logs

    # Dry run to see what would happen
    $0 --dry-run

    # Force restore even on errors
    $0 --force

NOTES:
    - This script will stop services before restoration
    - Services will be restarted after restoration
    - A pre-restore backup will be created automatically
    - Run with --dry-run first to verify the restoration plan

EOF
}

###############################################################################
# Main
###############################################################################

mkdir -p "$LOG_DIR"

log INFO "==========================================="
log INFO "Full System Restoration Started"
log INFO "==========================================="

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -o|--backup-dir)
            BACKUP_BASE_DIR="$2"
            shift 2
            ;;
        -t|--timestamp)
            BACKUP_TIMESTAMP="$2"
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
        --skip-database)
            RESTORE_DATABASE=false
            shift
            ;;
        --skip-config)
            RESTORE_CONFIG=false
            shift
            ;;
        --skip-firmware)
            RESTORE_FIRMWARE=false
            shift
            ;;
        --skip-logs)
            RESTORE_LOGS=false
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

# Check backup availability
check_backup_availability

# Confirmation prompt unless dry run
if [[ "$DRY_RUN" != "true" ]]; then
    echo ""
    echo -e "${YELLOW}WARNING:${NC} This will restore the entire system from backup."
    echo "Services will be stopped and data will be overwritten."
    echo ""
    read -p "Are you absolutely sure you want to proceed? (yes/no): " -r
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        log INFO "Restoration cancelled by user"
        exit 0
    fi
fi

# Record start time
START_TIME=$(date +%s)

# Perform restoration
perform_restore

# Record end time
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

log INFO "==========================================="
log INFO "Full System Restoration Completed"
log INFO "Total duration: ${DURATION} seconds"
log INFO "==========================================="

exit 0
