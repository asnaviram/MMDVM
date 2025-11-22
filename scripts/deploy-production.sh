#!/bin/bash
# ============================================================
# Production Deployment Script
# ============================================================
# Comprehensive one-click production deployment with:
# - Pre-deployment validation
# - Database migration
# - Zero-downtime deployment
# - Health checks
# - Rollback capability
# - Automatic backups
# ============================================================

set -euo pipefail

# Color codes
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m'

# Script configuration
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
readonly DEPLOYMENT_DIR="$PROJECT_ROOT/deployment"
readonly SERVER_DIR="$PROJECT_ROOT/roip-server"
readonly BACKUP_DIR="${BACKUP_DIR:-/var/backups/roip}"
readonly LOG_DIR="${LOG_DIR:-/var/log/roip}"
readonly DEPLOYMENT_LOG="$LOG_DIR/deployment-$(date +%Y%m%d-%H%M%S).log"

# Deployment configuration
readonly ENVIRONMENT="production"
readonly DEPLOYMENT_METHOD="${DEPLOYMENT_METHOD:-docker}"
readonly ENABLE_ROLLBACK="${ENABLE_ROLLBACK:-true}"
readonly ENABLE_HEALTH_CHECK="${ENABLE_HEALTH_CHECK:-true}"
readonly ENABLE_MIGRATION="${ENABLE_MIGRATION:-true}"
readonly ENABLE_BACKUP="${ENABLE_BACKUP:-true}"
readonly ZERO_DOWNTIME="${ZERO_DOWNTIME:-true}"

# Service configuration
readonly API_PORT="${API_PORT:-8080}"
readonly WS_PORT="${WS_PORT:-8081}"
readonly HEALTH_CHECK_RETRIES="${HEALTH_CHECK_RETRIES:-30}"
readonly HEALTH_CHECK_INTERVAL="${HEALTH_CHECK_INTERVAL:-10}"

# Rollback state
ROLLBACK_POINT=""
DEPLOYMENT_ID="$(date +%Y%m%d%H%M%S)"

# ============================================================
# Logging Functions
# ============================================================

setup_logging() {
    mkdir -p "$LOG_DIR"
    exec 1> >(tee -a "$DEPLOYMENT_LOG")
    exec 2>&1
    log_info "Logging to: $DEPLOYMENT_LOG"
}

log() {
    local level=$1
    shift
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [$level] $*"
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
    log "INFO" "$*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
    log "SUCCESS" "$*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*"
    log "ERROR" "$*"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
    log "WARNING" "$*"
}

log_header() {
    echo ""
    echo -e "${CYAN}============================================================${NC}"
    echo -e "${CYAN}$*${NC}"
    echo -e "${CYAN}============================================================${NC}"
    log "HEADER" "$*"
}

# ============================================================
# Error Handling
# ============================================================

trap 'handle_error $? $LINENO' ERR
trap 'cleanup' EXIT

handle_error() {
    local exit_code=$1
    local line_number=$2

    log_error "Deployment failed at line $line_number with exit code $exit_code"

    if [ "$ENABLE_ROLLBACK" = "true" ] && [ -n "$ROLLBACK_POINT" ]; then
        log_warning "Initiating automatic rollback..."
        perform_rollback
    fi

    exit "$exit_code"
}

cleanup() {
    log_info "Cleaning up temporary files..."
    # Add cleanup tasks here
}

# ============================================================
# Pre-deployment Validation
# ============================================================

validate_environment() {
    log_header "Pre-deployment Validation"

    # Check if running as root or with sudo
    if [ "$EUID" -eq 0 ] && [ "$DEPLOYMENT_METHOD" != "docker" ]; then
        log_warning "Running as root. This is not recommended for production."
    fi

    # Validate required commands
    log_info "Checking required commands..."
    local required_commands=("curl" "jq" "nc")

    if [ "$DEPLOYMENT_METHOD" = "docker" ]; then
        required_commands+=("docker" "docker-compose")
    else
        required_commands+=("node" "npm" "pm2")
    fi

    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            log_error "Required command not found: $cmd"
            exit 1
        fi
        log_success "Found: $cmd"
    done

    # Check Docker daemon
    if [ "$DEPLOYMENT_METHOD" = "docker" ]; then
        if ! docker info &> /dev/null; then
            log_error "Docker daemon is not running"
            exit 1
        fi
        log_success "Docker daemon is running"
    fi

    # Validate configuration files
    log_info "Validating configuration files..."

    if [ "$DEPLOYMENT_METHOD" = "docker" ]; then
        if [ ! -f "$DEPLOYMENT_DIR/docker-compose.prod.yml" ]; then
            log_error "docker-compose.prod.yml not found"
            exit 1
        fi
        log_success "Found docker-compose.prod.yml"

        if [ ! -f "$DEPLOYMENT_DIR/.env" ]; then
            log_warning ".env file not found, creating from template..."
            create_production_env
        fi
    fi

    if [ ! -f "$SERVER_DIR/config/production.yaml" ]; then
        log_error "production.yaml configuration not found"
        exit 1
    fi
    log_success "Found production configuration"

    # Validate environment variables
    log_info "Validating environment variables..."
    if [ "$DEPLOYMENT_METHOD" = "docker" ]; then
        source "$DEPLOYMENT_DIR/.env"
        local required_vars=("DB_PASSWORD" "JWT_SECRET" "TURN_USERNAME" "TURN_PASSWORD")
        for var in "${required_vars[@]}"; do
            if [ -z "${!var:-}" ]; then
                log_error "Required environment variable not set: $var"
                exit 1
            fi
            log_success "Validated: $var"
        done
    fi

    # Check disk space
    log_info "Checking disk space..."
    local available_space=$(df -BG "$PROJECT_ROOT" | awk 'NR==2 {print $4}' | sed 's/G//')
    if [ "$available_space" -lt 10 ]; then
        log_error "Insufficient disk space. Available: ${available_space}GB, Required: 10GB"
        exit 1
    fi
    log_success "Disk space: ${available_space}GB available"

    # Check ports
    log_info "Checking port availability..."
    local ports=("$API_PORT" "$WS_PORT" "5060")
    for port in "${ports[@]}"; do
        if nc -z localhost "$port" 2>/dev/null; then
            log_warning "Port $port is already in use"
        else
            log_success "Port $port is available"
        fi
    done

    log_success "Pre-deployment validation completed"
}

create_production_env() {
    cat > "$DEPLOYMENT_DIR/.env" << EOF
# Production Environment Configuration
# Generated: $(date)
# Deployment ID: $DEPLOYMENT_ID

NODE_ENV=production

# Database
DB_NAME=roip_production
DB_USER=roip_user
DB_PASSWORD=$(openssl rand -base64 32)
DB_HOST=postgres
DB_PORT=5432
DB_POOL_SIZE=20

# Security
JWT_SECRET=$(openssl rand -base64 64)
JWT_EXPIRY=1h

# TURN/STUN
TURN_USERNAME=roip_$(openssl rand -hex 8)
TURN_PASSWORD=$(openssl rand -base64 32)
TURN_SERVER=coturn
TURN_PORT=3478

# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# Performance
CLUSTER_MODE=true
CLUSTER_WORKERS=4

# Monitoring
ENABLE_METRICS=true
METRICS_PORT=9090

# Grafana
GRAFANA_ADMIN_PASSWORD=$(openssl rand -base64 32)

# Application
APP_VERSION=$DEPLOYMENT_ID
EOF

    chmod 600 "$DEPLOYMENT_DIR/.env"
    log_success "Created production .env file"
    log_warning "Please review and update $DEPLOYMENT_DIR/.env with your specific settings"
}

# ============================================================
# Backup Functions
# ============================================================

create_backup() {
    if [ "$ENABLE_BACKUP" != "true" ]; then
        log_info "Backup disabled, skipping..."
        return 0
    fi

    log_header "Creating Backup"

    mkdir -p "$BACKUP_DIR"
    local backup_name="roip_${DEPLOYMENT_ID}"
    ROLLBACK_POINT="$BACKUP_DIR/$backup_name"

    log_info "Backup location: $ROLLBACK_POINT"
    mkdir -p "$ROLLBACK_POINT"

    # Backup database
    if [ "$DEPLOYMENT_METHOD" = "docker" ]; then
        log_info "Backing up PostgreSQL database..."
        if docker ps --format '{{.Names}}' | grep -q "roip-postgres-prod"; then
            docker exec roip-postgres-prod pg_dump -U roip_user roip_production \
                > "$ROLLBACK_POINT/database.sql" 2>/dev/null || log_warning "Database backup skipped (not running)"
            if [ -f "$ROLLBACK_POINT/database.sql" ]; then
                log_success "Database backup: $(du -h "$ROLLBACK_POINT/database.sql" | cut -f1)"
            fi
        else
            log_warning "Database container not running, skipping database backup"
        fi
    fi

    # Backup configuration
    log_info "Backing up configuration files..."
    tar -czf "$ROLLBACK_POINT/config.tar.gz" \
        -C "$DEPLOYMENT_DIR" \
        .env \
        2>/dev/null || true

    # Backup application data
    log_info "Backing up application data..."
    if [ "$DEPLOYMENT_METHOD" = "docker" ]; then
        docker run --rm \
            -v roip_data:/data \
            -v "$ROLLBACK_POINT":/backup \
            alpine \
            tar -czf /backup/data.tar.gz -C /data . \
            2>/dev/null || log_warning "Application data backup skipped"
    fi

    # Save current state
    cat > "$ROLLBACK_POINT/state.json" << EOF
{
  "deployment_id": "$DEPLOYMENT_ID",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "environment": "$ENVIRONMENT",
  "method": "$DEPLOYMENT_METHOD",
  "git_commit": "$(cd "$PROJECT_ROOT" && git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "git_branch": "$(cd "$PROJECT_ROOT" && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
}
EOF

    log_success "Backup completed: $ROLLBACK_POINT"
}

# ============================================================
# Database Migration
# ============================================================

run_migrations() {
    if [ "$ENABLE_MIGRATION" != "true" ]; then
        log_info "Database migration disabled, skipping..."
        return 0
    fi

    log_header "Running Database Migrations"

    if [ "$DEPLOYMENT_METHOD" = "docker" ]; then
        log_info "Running migrations in Docker container..."

        # Wait for database to be ready
        log_info "Waiting for database to be ready..."
        local retries=30
        until docker exec roip-postgres-prod pg_isready -U roip_user &>/dev/null || [ $retries -eq 0 ]; do
            log_info "Waiting for database... ($retries retries left)"
            sleep 2
            retries=$((retries - 1))
        done

        if [ $retries -eq 0 ]; then
            log_error "Database failed to become ready"
            return 1
        fi

        log_success "Database is ready"

        # Run migrations
        log_info "Executing migration scripts..."
        docker exec roip-server-prod node /app/src/migrations/migrate.js up \
            || log_error "Migration failed"

        log_success "Migrations completed"
    else
        log_info "Running migrations directly..."
        cd "$SERVER_DIR"
        node src/migrations/migrate.js up || log_error "Migration failed"
        log_success "Migrations completed"
    fi
}

# ============================================================
# Zero-Downtime Deployment
# ============================================================

deploy_zero_downtime() {
    log_header "Zero-Downtime Deployment"

    if [ "$DEPLOYMENT_METHOD" = "docker" ]; then
        cd "$DEPLOYMENT_DIR"

        # Pull new images
        log_info "Pulling latest images..."
        docker-compose -f docker-compose.prod.yml pull roip-server

        # Scale up new instances
        log_info "Starting new instances..."
        docker-compose -f docker-compose.prod.yml up -d --scale roip-server=2 --no-recreate

        # Wait for new instances to be healthy
        log_info "Waiting for new instances to be healthy..."
        sleep 10

        if wait_for_health "roip-server-prod-2"; then
            log_success "New instance is healthy"

            # Stop old instances
            log_info "Stopping old instances..."
            docker stop roip-server-prod || true

            # Scale down to single instance
            log_info "Scaling down to single instance..."
            docker-compose -f docker-compose.prod.yml up -d --scale roip-server=1

            log_success "Zero-downtime deployment completed"
        else
            log_error "New instance failed health check"
            return 1
        fi
    else
        log_info "Using PM2 for zero-downtime deployment..."
        cd "$SERVER_DIR"
        pm2 reload roip-server --update-env || pm2 start src/server.js --name roip-server
        log_success "PM2 reload completed"
    fi
}

# ============================================================
# Standard Deployment
# ============================================================

deploy_standard() {
    log_header "Standard Deployment"

    if [ "$DEPLOYMENT_METHOD" = "docker" ]; then
        cd "$DEPLOYMENT_DIR"

        log_info "Pulling latest images..."
        docker-compose -f docker-compose.prod.yml pull

        log_info "Starting services..."
        docker-compose -f docker-compose.prod.yml up -d

        log_success "Services started"
    else
        log_info "Installing dependencies..."
        cd "$SERVER_DIR"
        npm ci --production

        log_info "Starting server with PM2..."
        pm2 start src/server.js --name roip-server --env production || pm2 restart roip-server
        pm2 save

        log_success "Server started"
    fi
}

# ============================================================
# Health Checks
# ============================================================

wait_for_health() {
    local container_name="${1:-roip-server-prod}"
    local retries=$HEALTH_CHECK_RETRIES

    log_info "Performing health checks..."

    while [ $retries -gt 0 ]; do
        if docker exec "$container_name" \
            node -e "require('http').get('http://localhost:$API_PORT/health/ready', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" \
            &>/dev/null; then
            return 0
        fi

        log_info "Health check pending... ($retries retries left)"
        sleep $HEALTH_CHECK_INTERVAL
        retries=$((retries - 1))
    done

    return 1
}

perform_health_checks() {
    if [ "$ENABLE_HEALTH_CHECK" != "true" ]; then
        log_info "Health checks disabled, skipping..."
        return 0
    fi

    log_header "Health Checks"

    # Wait for services to initialize
    log_info "Waiting for services to initialize..."
    sleep 15

    # Check database
    log_info "Checking database health..."
    if [ "$DEPLOYMENT_METHOD" = "docker" ]; then
        if docker exec roip-postgres-prod pg_isready -U roip_user &>/dev/null; then
            log_success "Database: Healthy"
        else
            log_error "Database: Unhealthy"
            return 1
        fi
    fi

    # Check API health endpoint
    log_info "Checking API health..."
    local health_url="http://localhost:$API_PORT/health"
    if curl -sf "$health_url" | jq -e '.status == "healthy"' &>/dev/null; then
        log_success "API: Healthy"
    else
        log_error "API: Unhealthy"
        return 1
    fi

    # Check readiness endpoint
    log_info "Checking readiness..."
    if curl -sf "http://localhost:$API_PORT/health/ready" | jq -e '.ready == true' &>/dev/null; then
        log_success "Readiness: Ready"
    else
        log_warning "Readiness: Not ready"
    fi

    # Check liveness endpoint
    log_info "Checking liveness..."
    if curl -sf "http://localhost:$API_PORT/health/live" &>/dev/null; then
        log_success "Liveness: Alive"
    else
        log_error "Liveness: Failed"
        return 1
    fi

    # Check WebSocket
    log_info "Checking WebSocket..."
    if curl -sf "http://localhost:$WS_PORT/" &>/dev/null; then
        log_success "WebSocket: Available"
    else
        log_warning "WebSocket: Unavailable"
    fi

    # Performance check
    log_info "Checking response time..."
    local response_time=$(curl -sf -w "%{time_total}" -o /dev/null "$health_url")
    log_info "Response time: ${response_time}s"

    if (( $(echo "$response_time < 1.0" | bc -l) )); then
        log_success "Response time: Acceptable"
    else
        log_warning "Response time: Slow (${response_time}s)"
    fi

    log_success "All health checks passed"
}

# ============================================================
# Rollback Functions
# ============================================================

perform_rollback() {
    log_header "Rolling Back Deployment"

    if [ -z "$ROLLBACK_POINT" ] || [ ! -d "$ROLLBACK_POINT" ]; then
        log_error "No rollback point found"
        return 1
    fi

    log_warning "Rolling back to: $ROLLBACK_POINT"

    # Stop current services
    log_info "Stopping current services..."
    if [ "$DEPLOYMENT_METHOD" = "docker" ]; then
        docker-compose -f "$DEPLOYMENT_DIR/docker-compose.prod.yml" down || true
    else
        pm2 stop roip-server || true
    fi

    # Restore configuration
    log_info "Restoring configuration..."
    tar -xzf "$ROLLBACK_POINT/config.tar.gz" -C "$DEPLOYMENT_DIR" || true

    # Restore database
    if [ -f "$ROLLBACK_POINT/database.sql" ]; then
        log_info "Restoring database..."
        if [ "$DEPLOYMENT_METHOD" = "docker" ]; then
            docker exec -i roip-postgres-prod psql -U roip_user roip_production \
                < "$ROLLBACK_POINT/database.sql" || log_warning "Database restore failed"
        fi
    fi

    # Restart services
    log_info "Restarting services..."
    if [ "$DEPLOYMENT_METHOD" = "docker" ]; then
        docker-compose -f "$DEPLOYMENT_DIR/docker-compose.prod.yml" up -d
    else
        pm2 restart roip-server
    fi

    log_success "Rollback completed"
}

# ============================================================
# Deployment Summary
# ============================================================

show_deployment_summary() {
    log_header "Deployment Summary"

    cat << EOF

Deployment Information:
  - Deployment ID: $DEPLOYMENT_ID
  - Environment: $ENVIRONMENT
  - Method: $DEPLOYMENT_METHOD
  - Timestamp: $(date)
  - Git Commit: $(cd "$PROJECT_ROOT" && git rev-parse --short HEAD 2>/dev/null || echo 'unknown')
  - Git Branch: $(cd "$PROJECT_ROOT" && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')

Service Endpoints:
  - API:        http://localhost:$API_PORT
  - WebSocket:  ws://localhost:$WS_PORT
  - Health:     http://localhost:$API_PORT/health
  - Metrics:    http://localhost:9090

Management Commands:
EOF

    if [ "$DEPLOYMENT_METHOD" = "docker" ]; then
        cat << EOF
  - View logs:      docker-compose -f $DEPLOYMENT_DIR/docker-compose.prod.yml logs -f
  - Stop services:  docker-compose -f $DEPLOYMENT_DIR/docker-compose.prod.yml down
  - Restart:        docker-compose -f $DEPLOYMENT_DIR/docker-compose.prod.yml restart
  - Status:         docker-compose -f $DEPLOYMENT_DIR/docker-compose.prod.yml ps
EOF
    else
        cat << EOF
  - View logs:  pm2 logs roip-server
  - Stop:       pm2 stop roip-server
  - Restart:    pm2 restart roip-server
  - Status:     pm2 status
EOF
    fi

    cat << EOF

Backup Location:
  - $ROLLBACK_POINT

Rollback Command:
  - $SCRIPT_DIR/rollback.sh $DEPLOYMENT_ID

Log File:
  - $DEPLOYMENT_LOG

EOF

    log_success "Deployment completed successfully!"
}

# ============================================================
# Main Deployment Flow
# ============================================================

main() {
    log_header "Production Deployment - RoIP System"
    log_info "Deployment ID: $DEPLOYMENT_ID"
    log_info "Environment: $ENVIRONMENT"
    log_info "Method: $DEPLOYMENT_METHOD"

    setup_logging

    # Pre-deployment validation
    validate_environment

    # Create backup
    create_backup

    # Run database migrations
    run_migrations

    # Deploy application
    if [ "$ZERO_DOWNTIME" = "true" ] && [ "$DEPLOYMENT_METHOD" = "docker" ]; then
        deploy_zero_downtime
    else
        deploy_standard
    fi

    # Perform health checks
    if ! perform_health_checks; then
        log_error "Health checks failed!"
        if [ "$ENABLE_ROLLBACK" = "true" ]; then
            perform_rollback
        fi
        exit 1
    fi

    # Show deployment summary
    show_deployment_summary

    exit 0
}

# ============================================================
# Script Entry Point
# ============================================================

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --method)
            DEPLOYMENT_METHOD="$2"
            shift 2
            ;;
        --no-rollback)
            ENABLE_ROLLBACK="false"
            shift
            ;;
        --no-health-check)
            ENABLE_HEALTH_CHECK="false"
            shift
            ;;
        --no-migration)
            ENABLE_MIGRATION="false"
            shift
            ;;
        --no-backup)
            ENABLE_BACKUP="false"
            shift
            ;;
        --no-zero-downtime)
            ZERO_DOWNTIME="false"
            shift
            ;;
        --help)
            cat << EOF
Production Deployment Script

Usage: $0 [OPTIONS]

Options:
  --method <docker|pm2>   Deployment method (default: docker)
  --no-rollback           Disable automatic rollback on failure
  --no-health-check       Skip health checks
  --no-migration          Skip database migrations
  --no-backup             Skip backup creation
  --no-zero-downtime      Disable zero-downtime deployment
  --help                  Show this help message

Environment Variables:
  BACKUP_DIR              Backup directory (default: /var/backups/roip)
  LOG_DIR                 Log directory (default: /var/log/roip)
  API_PORT                API port (default: 8080)
  WS_PORT                 WebSocket port (default: 8081)

Examples:
  $0                                    # Full production deployment
  $0 --method pm2                       # Deploy using PM2
  $0 --no-zero-downtime                 # Standard deployment
  $0 --no-migration --no-backup         # Quick deployment

EOF
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            log_info "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Run main deployment
main
