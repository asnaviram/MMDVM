#!/bin/bash
# ============================================================
# Staging Deployment Script
# ============================================================
# Deploys to staging environment for testing before production
# ============================================================

set -euo pipefail

# Color codes
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# Script configuration
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
readonly DEPLOYMENT_DIR="$PROJECT_ROOT/deployment"
readonly SERVER_DIR="$PROJECT_ROOT/roip-server"

# Staging configuration
readonly ENVIRONMENT="staging"
readonly DEPLOYMENT_METHOD="${DEPLOYMENT_METHOD:-docker}"
readonly API_PORT="${API_PORT:-8180}"
readonly WS_PORT="${WS_PORT:-8181}"

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
# Environment Setup
# ============================================================

create_staging_env() {
    log_header "Creating Staging Environment"

    cat > "$DEPLOYMENT_DIR/.env.staging" << EOF
# Staging Environment Configuration
# Generated: $(date)

NODE_ENV=staging

# Database
DB_NAME=roip_staging
DB_USER=roip_staging
DB_PASSWORD=$(openssl rand -base64 24)
DB_HOST=postgres-staging
DB_PORT=5432
DB_POOL_SIZE=10

# Security
JWT_SECRET=$(openssl rand -base64 48)
JWT_EXPIRY=24h

# TURN/STUN
TURN_USERNAME=staging_$(openssl rand -hex 6)
TURN_PASSWORD=$(openssl rand -base64 24)
TURN_SERVER=coturn-staging
TURN_PORT=3478

# Logging
LOG_LEVEL=debug
LOG_FORMAT=json

# Performance (reduced for staging)
CLUSTER_MODE=false
CLUSTER_WORKERS=2

# Monitoring
ENABLE_METRICS=true
METRICS_PORT=9190

# Grafana
GRAFANA_ADMIN_PASSWORD=$(openssl rand -base64 24)

# API Configuration
API_PORT=$API_PORT
WEBSOCKET_PORT=$WS_PORT
API_CORS_ORIGINS=*

# Debug features
ENABLE_DEBUG=true
ENABLE_TRACE=true
EOF

    chmod 600 "$DEPLOYMENT_DIR/.env.staging"
    log_success "Created staging environment file"
}

# ============================================================
# Docker Compose for Staging
# ============================================================

create_staging_compose() {
    log_info "Creating staging docker-compose configuration..."

    cat > "$DEPLOYMENT_DIR/docker-compose.staging.yml" << 'EOF'
version: '3.8'

services:
  postgres-staging:
    image: postgres:16-alpine
    container_name: roip-postgres-staging
    environment:
      POSTGRES_DB: ${DB_NAME:-roip_staging}
      POSTGRES_USER: ${DB_USER:-roip_staging}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    ports:
      - "5433:5432"
    volumes:
      - postgres_staging_data:/var/lib/postgresql/data
    networks:
      - roip-staging
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-roip_staging}"]
      interval: 10s
      timeout: 5s
      retries: 5

  roip-server-staging:
    build:
      context: ..
      dockerfile: docker/Dockerfile
      args:
        NODE_ENV: staging
    container_name: roip-server-staging
    depends_on:
      - postgres-staging
    environment:
      NODE_ENV: staging
      DB_HOST: postgres-staging
      DB_NAME: ${DB_NAME:-roip_staging}
      DB_USER: ${DB_USER:-roip_staging}
      DB_PASSWORD: ${DB_PASSWORD}
      JWT_SECRET: ${JWT_SECRET}
      API_PORT: ${API_PORT:-8180}
      WEBSOCKET_PORT: ${WS_PORT:-8181}
      LOG_LEVEL: debug
    ports:
      - "${API_PORT:-8180}:${API_PORT:-8180}"
      - "${WS_PORT:-8181}:${WS_PORT:-8181}"
      - "5160:5060/udp"
      - "11000-11100:10000-10100/udp"
    volumes:
      - ../roip-server/src:/app/src:ro
      - ../roip-server/config:/app/config:ro
      - staging_logs:/app/logs
    networks:
      - roip-staging
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:${API_PORT:-8180}/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  postgres_staging_data:
  staging_logs:

networks:
  roip-staging:
    driver: bridge
EOF

    log_success "Created staging docker-compose file"
}

# ============================================================
# Deployment Functions
# ============================================================

deploy_staging() {
    log_header "Deploying to Staging Environment"

    if [ "$DEPLOYMENT_METHOD" = "docker" ]; then
        cd "$DEPLOYMENT_DIR"

        # Create environment file if it doesn't exist
        if [ ! -f ".env.staging" ]; then
            create_staging_env
        fi

        # Create staging compose file
        create_staging_compose

        # Load staging environment
        export $(cat .env.staging | grep -v '^#' | xargs)

        # Stop existing staging deployment
        log_info "Stopping existing staging deployment..."
        docker-compose -f docker-compose.staging.yml down 2>/dev/null || true

        # Build and start services
        log_info "Building and starting staging services..."
        docker-compose -f docker-compose.staging.yml up -d --build

        # Wait for services
        log_info "Waiting for services to be ready..."
        sleep 15

        # Run health checks
        if perform_health_checks; then
            log_success "Staging deployment successful!"
        else
            log_error "Health checks failed"
            return 1
        fi
    else
        log_info "Deploying with PM2..."
        cd "$SERVER_DIR"

        export NODE_ENV=staging
        export API_PORT=$API_PORT
        export WEBSOCKET_PORT=$WS_PORT

        npm ci
        pm2 delete roip-server-staging 2>/dev/null || true
        pm2 start src/server.js --name roip-server-staging --env staging
        pm2 save

        log_success "Staging server started with PM2"
    fi
}

# ============================================================
# Health Checks
# ============================================================

perform_health_checks() {
    log_header "Health Checks"

    local max_attempts=10
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        log_info "Health check attempt $attempt/$max_attempts..."

        if curl -sf "http://localhost:$API_PORT/health" &>/dev/null; then
            log_success "API is healthy"
            return 0
        fi

        sleep 3
        attempt=$((attempt + 1))
    done

    log_error "Health check failed after $max_attempts attempts"
    return 1
}

# ============================================================
# Testing Functions
# ============================================================

run_smoke_tests() {
    log_header "Running Smoke Tests"

    log_info "Testing API endpoints..."

    # Test health endpoint
    if curl -sf "http://localhost:$API_PORT/health" | jq -e '.status == "healthy"' &>/dev/null; then
        log_success "Health endpoint: OK"
    else
        log_error "Health endpoint: FAILED"
        return 1
    fi

    # Test readiness
    if curl -sf "http://localhost:$API_PORT/health/ready" &>/dev/null; then
        log_success "Readiness endpoint: OK"
    else
        log_warning "Readiness endpoint: Not ready"
    fi

    # Test liveness
    if curl -sf "http://localhost:$API_PORT/health/live" &>/dev/null; then
        log_success "Liveness endpoint: OK"
    else
        log_error "Liveness endpoint: FAILED"
        return 1
    fi

    log_success "All smoke tests passed"
}

# ============================================================
# Show Information
# ============================================================

show_staging_info() {
    log_header "Staging Environment Information"

    cat << EOF

Environment: Staging
Method: $DEPLOYMENT_METHOD

Service Endpoints:
  - API:        http://localhost:$API_PORT
  - WebSocket:  ws://localhost:$WS_PORT
  - Health:     http://localhost:$API_PORT/health

Database:
  - Port: 5433 (PostgreSQL)
  - Database: roip_staging

Management Commands:
EOF

    if [ "$DEPLOYMENT_METHOD" = "docker" ]; then
        cat << EOF
  - View logs:      docker-compose -f $DEPLOYMENT_DIR/docker-compose.staging.yml logs -f
  - Stop:           docker-compose -f $DEPLOYMENT_DIR/docker-compose.staging.yml down
  - Restart:        docker-compose -f $DEPLOYMENT_DIR/docker-compose.staging.yml restart
  - Shell:          docker exec -it roip-server-staging sh

Testing:
  - API Health:     curl http://localhost:$API_PORT/health
  - Run tests:      docker exec -it roip-server-staging npm test
EOF
    else
        cat << EOF
  - View logs:  pm2 logs roip-server-staging
  - Stop:       pm2 stop roip-server-staging
  - Restart:    pm2 restart roip-server-staging
EOF
    fi

    echo ""
}

# ============================================================
# Main Function
# ============================================================

main() {
    log_header "Staging Deployment"

    # Deploy to staging
    deploy_staging

    # Run smoke tests
    run_smoke_tests

    # Show information
    show_staging_info

    log_success "Staging deployment completed!"
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
        --help)
            cat << EOF
Staging Deployment Script

Usage: $0 [OPTIONS]

Options:
  --method <docker|pm2>   Deployment method (default: docker)
  --help                  Show this help message

Environment Variables:
  API_PORT                API port (default: 8180)
  WS_PORT                 WebSocket port (default: 8181)

Examples:
  $0                      # Deploy to staging with Docker
  $0 --method pm2         # Deploy to staging with PM2

EOF
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

main
