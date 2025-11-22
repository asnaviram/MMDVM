#!/bin/bash
# ============================================================
# Rollback Script
# ============================================================
# Rollback to a previous deployment state
# Usage: ./rollback.sh [deployment-id|latest]
# ============================================================

set -euo pipefail

# Color codes
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# Configuration
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
readonly DEPLOYMENT_DIR="$PROJECT_ROOT/deployment"
readonly BACKUP_DIR="${BACKUP_DIR:-/var/backups/roip}"
readonly LOG_DIR="${LOG_DIR:-/var/log/roip}"

# Rollback configuration
ROLLBACK_TARGET="${1:-latest}"
DEPLOYMENT_METHOD="${DEPLOYMENT_METHOD:-docker}"
DRY_RUN="${DRY_RUN:-false}"
FORCE="${FORCE:-false}"

# ============================================================
# Logging Functions
# ============================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
}

log_header() {
    echo ""
    echo -e "${BLUE}============================================================${NC}"
    echo -e "${BLUE}$*${NC}"
    echo -e "${BLUE}============================================================${NC}"
}

# ============================================================
# Backup Discovery
# ============================================================

list_available_backups() {
    log_header "Available Backups"

    if [ ! -d "$BACKUP_DIR" ]; then
        log_error "Backup directory not found: $BACKUP_DIR"
        exit 1
    fi

    echo ""
    printf "%-20s %-20s %-15s %-10s\n" "DEPLOYMENT ID" "TIMESTAMP" "GIT COMMIT" "SIZE"
    echo "--------------------------------------------------------------------------------"

    local count=0
    for backup_dir in "$BACKUP_DIR"/roip_*/; do
        if [ -d "$backup_dir" ] && [ -f "$backup_dir/state.json" ]; then
            local deployment_id=$(basename "$backup_dir" | sed 's/roip_//')
            local timestamp=$(jq -r '.timestamp // "unknown"' "$backup_dir/state.json" 2>/dev/null)
            local git_commit=$(jq -r '.git_commit // "unknown"' "$backup_dir/state.json" 2>/dev/null | cut -c1-8)
            local size=$(du -sh "$backup_dir" 2>/dev/null | cut -f1)

            printf "%-20s %-20s %-15s %-10s\n" "$deployment_id" "$timestamp" "$git_commit" "$size"
            count=$((count + 1))
        fi
    done

    if [ $count -eq 0 ]; then
        echo "No backups found"
        exit 1
    fi

    echo ""
    log_info "Total backups: $count"
}

find_backup() {
    local target=$1

    if [ "$target" = "latest" ]; then
        # Find the most recent backup
        local latest_backup=$(ls -t "$BACKUP_DIR"/roip_*/ 2>/dev/null | head -1)
        if [ -z "$latest_backup" ]; then
            log_error "No backups found"
            exit 1
        fi
        echo "$latest_backup"
    elif [ "$target" = "list" ]; then
        list_available_backups
        exit 0
    else
        # Find specific deployment ID
        local backup_path="$BACKUP_DIR/roip_$target"
        if [ -d "$backup_path" ]; then
            echo "$backup_path/"
        else
            log_error "Backup not found: $target"
            list_available_backups
            exit 1
        fi
    fi
}

# ============================================================
# Rollback Validation
# ============================================================

validate_rollback() {
    local backup_path=$1

    log_header "Validating Rollback"

    # Check if backup directory exists
    if [ ! -d "$backup_path" ]; then
        log_error "Backup directory not found: $backup_path"
        exit 1
    fi
    log_success "Backup directory exists"

    # Check if state file exists
    if [ ! -f "$backup_path/state.json" ]; then
        log_error "Backup state file not found"
        exit 1
    fi
    log_success "Backup state file exists"

    # Display backup information
    log_info "Backup information:"
    cat "$backup_path/state.json" | jq '.'

    # Check required files
    local required_files=("config.tar.gz")
    for file in "${required_files[@]}"; do
        if [ ! -f "$backup_path/$file" ]; then
            log_warning "Missing backup file: $file"
        else
            log_success "Found: $file"
        fi
    done

    # Check optional files
    if [ -f "$backup_path/database.sql" ]; then
        local db_size=$(du -sh "$backup_path/database.sql" | cut -f1)
        log_info "Database backup: $db_size"
    else
        log_warning "No database backup found"
    fi

    if [ -f "$backup_path/data.tar.gz" ]; then
        local data_size=$(du -sh "$backup_path/data.tar.gz" | cut -f1)
        log_info "Application data backup: $data_size"
    else
        log_warning "No application data backup found"
    fi
}

# ============================================================
# Pre-Rollback Backup
# ============================================================

create_pre_rollback_backup() {
    log_header "Creating Pre-Rollback Backup"

    local backup_id="pre_rollback_$(date +%Y%m%d%H%M%S)"
    local backup_path="$BACKUP_DIR/roip_$backup_id"

    mkdir -p "$backup_path"
    log_info "Creating backup: $backup_path"

    # Backup current database
    if [ "$DEPLOYMENT_METHOD" = "docker" ]; then
        if docker ps --format '{{.Names}}' | grep -q "roip-postgres-prod"; then
            log_info "Backing up current database..."
            docker exec roip-postgres-prod pg_dump -U roip_user roip_production \
                > "$backup_path/database.sql" 2>/dev/null || log_warning "Database backup failed"
        fi
    fi

    # Backup current configuration
    log_info "Backing up current configuration..."
    if [ -f "$DEPLOYMENT_DIR/.env" ]; then
        tar -czf "$backup_path/config.tar.gz" -C "$DEPLOYMENT_DIR" .env 2>/dev/null || true
    fi

    # Save current state
    cat > "$backup_path/state.json" << EOF
{
  "deployment_id": "$backup_id",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "environment": "production",
  "method": "$DEPLOYMENT_METHOD",
  "type": "pre_rollback",
  "git_commit": "$(cd "$PROJECT_ROOT" && git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "git_branch": "$(cd "$PROJECT_ROOT" && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
}
EOF

    log_success "Pre-rollback backup created: $backup_path"
    echo "$backup_path"
}

# ============================================================
# Rollback Execution
# ============================================================

perform_rollback() {
    local backup_path=$1

    log_header "Performing Rollback"

    if [ "$DRY_RUN" = "true" ]; then
        log_warning "DRY RUN - No changes will be made"
        return 0
    fi

    # Stop current services
    log_info "Stopping current services..."
    if [ "$DEPLOYMENT_METHOD" = "docker" ]; then
        docker-compose -f "$DEPLOYMENT_DIR/docker-compose.prod.yml" stop roip-server || true
        log_success "Services stopped"
    else
        pm2 stop roip-server || true
        log_success "PM2 process stopped"
    fi

    # Restore configuration
    if [ -f "$backup_path/config.tar.gz" ]; then
        log_info "Restoring configuration..."
        tar -xzf "$backup_path/config.tar.gz" -C "$DEPLOYMENT_DIR"
        log_success "Configuration restored"
    else
        log_warning "No configuration backup found, skipping"
    fi

    # Restore database
    if [ -f "$backup_path/database.sql" ]; then
        log_info "Restoring database..."

        if [ "$FORCE" != "true" ]; then
            log_warning "Database restore requires --force flag"
            log_warning "Skipping database restore"
        else
            if [ "$DEPLOYMENT_METHOD" = "docker" ]; then
                # Start database if not running
                docker-compose -f "$DEPLOYMENT_DIR/docker-compose.prod.yml" up -d postgres

                # Wait for database
                log_info "Waiting for database..."
                sleep 10

                # Restore database
                log_info "Restoring database (this may take a while)..."
                docker exec -i roip-postgres-prod psql -U roip_user roip_production \
                    < "$backup_path/database.sql" || log_error "Database restore failed"

                log_success "Database restored"
            fi
        fi
    else
        log_warning "No database backup found, skipping"
    fi

    # Restore application data
    if [ -f "$backup_path/data.tar.gz" ]; then
        log_info "Restoring application data..."
        if [ "$DEPLOYMENT_METHOD" = "docker" ]; then
            docker run --rm \
                -v roip_data:/data \
                -v "$backup_path":/backup \
                alpine \
                tar -xzf /backup/data.tar.gz -C /data
            log_success "Application data restored"
        fi
    fi

    # Restart services
    log_info "Restarting services..."
    if [ "$DEPLOYMENT_METHOD" = "docker" ]; then
        docker-compose -f "$DEPLOYMENT_DIR/docker-compose.prod.yml" up -d
        log_success "Services restarted"
    else
        pm2 restart roip-server
        log_success "PM2 process restarted"
    fi

    # Wait for services to be ready
    log_info "Waiting for services to be ready..."
    sleep 15
}

# ============================================================
# Post-Rollback Validation
# ============================================================

validate_rollback_success() {
    log_header "Validating Rollback"

    local max_attempts=10
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        log_info "Health check attempt $attempt/$max_attempts..."

        if curl -sf "http://localhost:8080/health" | jq -e '.status == "healthy"' &>/dev/null; then
            log_success "API is healthy"

            # Additional checks
            if curl -sf "http://localhost:8080/health/ready" &>/dev/null; then
                log_success "Service is ready"
            fi

            if curl -sf "http://localhost:8080/health/live" &>/dev/null; then
                log_success "Service is live"
            fi

            return 0
        fi

        sleep 5
        attempt=$((attempt + 1))
    done

    log_error "Health check failed after $max_attempts attempts"
    return 1
}

# ============================================================
# Rollback Summary
# ============================================================

show_rollback_summary() {
    local backup_path=$1

    log_header "Rollback Summary"

    cat << EOF

Rollback Information:
  - Target: $ROLLBACK_TARGET
  - Backup Path: $backup_path
  - Method: $DEPLOYMENT_METHOD
  - Timestamp: $(date)

Backup Details:
EOF

    if [ -f "$backup_path/state.json" ]; then
        cat "$backup_path/state.json" | jq '.'
    fi

    cat << EOF

Service Status:
EOF

    if [ "$DEPLOYMENT_METHOD" = "docker" ]; then
        docker-compose -f "$DEPLOYMENT_DIR/docker-compose.prod.yml" ps
    else
        pm2 status roip-server
    fi

    echo ""
    log_success "Rollback completed successfully!"
}

# ============================================================
# Main Function
# ============================================================

main() {
    log_header "RoIP System Rollback"

    # Find backup
    local backup_path=$(find_backup "$ROLLBACK_TARGET")
    log_info "Using backup: $backup_path"

    # Validate rollback
    validate_rollback "$backup_path"

    # Confirm rollback
    if [ "$FORCE" != "true" ] && [ "$DRY_RUN" != "true" ]; then
        echo ""
        read -p "Proceed with rollback? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            log_warning "Rollback cancelled"
            exit 0
        fi
    fi

    # Create pre-rollback backup
    if [ "$DRY_RUN" != "true" ]; then
        local pre_rollback_backup=$(create_pre_rollback_backup)
        log_info "Pre-rollback backup: $pre_rollback_backup"
    fi

    # Perform rollback
    perform_rollback "$backup_path"

    # Validate rollback success
    if validate_rollback_success; then
        show_rollback_summary "$backup_path"
        exit 0
    else
        log_error "Rollback validation failed!"
        log_error "You may need to investigate manually"
        exit 1
    fi
}

# ============================================================
# Parse Arguments
# ============================================================

while [[ $# -gt 0 ]]; do
    case $1 in
        --method)
            DEPLOYMENT_METHOD="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN="true"
            shift
            ;;
        --force)
            FORCE="true"
            shift
            ;;
        --list)
            ROLLBACK_TARGET="list"
            shift
            ;;
        --help)
            cat << EOF
Rollback Script

Usage: $0 [DEPLOYMENT_ID] [OPTIONS]

Arguments:
  DEPLOYMENT_ID           Deployment ID to rollback to (or 'latest')
                         Use --list to see available backups

Options:
  --method <docker|pm2>   Deployment method (default: docker)
  --dry-run              Show what would be done without making changes
  --force                Force rollback including database restore
  --list                 List available backups
  --help                 Show this help message

Environment Variables:
  BACKUP_DIR             Backup directory (default: /var/backups/roip)
  LOG_DIR                Log directory (default: /var/log/roip)

Examples:
  $0 --list                          # List available backups
  $0 latest                          # Rollback to latest backup
  $0 20231122120000                  # Rollback to specific deployment
  $0 latest --dry-run                # Preview rollback
  $0 latest --force                  # Rollback with database restore

Warning:
  Database restore is only performed with --force flag
  A pre-rollback backup is automatically created

EOF
            exit 0
            ;;
        *)
            if [ -z "$ROLLBACK_TARGET" ] || [ "$ROLLBACK_TARGET" = "latest" ]; then
                ROLLBACK_TARGET="$1"
            fi
            shift
            ;;
    esac
done

main
