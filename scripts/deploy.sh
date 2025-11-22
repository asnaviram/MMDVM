#!/bin/bash
# ============================================================
# Deployment Script
# ============================================================
# This script deploys the ESP32 RoIP system
# Usage: ./deploy.sh [environment] [options]
# Environments: development, staging, production
# Options:
#   --docker        Deploy using Docker Compose
#   --update-only   Only update existing deployment
#   --backup        Create backup before deployment
# ============================================================

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DOCKER_DIR="$PROJECT_ROOT/docker"
SERVER_DIR="$PROJECT_ROOT/roip-server"

# Default values
ENVIRONMENT="${1:-production}"
USE_DOCKER=false
UPDATE_ONLY=false
CREATE_BACKUP=false

# ============================================================
# Helper functions
# ============================================================

print_header() {
    echo -e "${BLUE}============================================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}============================================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}→ $1${NC}"
}

# ============================================================
# Parse command line arguments
# ============================================================

parse_args() {
    shift  # Skip environment argument

    while [ $# -gt 0 ]; do
        case "$1" in
            --docker)
                USE_DOCKER=true
                shift
                ;;
            --update-only)
                UPDATE_ONLY=true
                shift
                ;;
            --backup)
                CREATE_BACKUP=true
                shift
                ;;
            --help)
                echo "Usage: $0 [environment] [options]"
                echo ""
                echo "Environments:"
                echo "  development    Deploy to development environment"
                echo "  staging        Deploy to staging environment"
                echo "  production     Deploy to production environment (default)"
                echo ""
                echo "Options:"
                echo "  --docker       Deploy using Docker Compose"
                echo "  --update-only  Only update existing deployment"
                echo "  --backup       Create backup before deployment"
                echo "  --help         Show this help message"
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                echo "Use --help for usage information"
                exit 1
                ;;
        esac
    done
}

# ============================================================
# Validate environment
# ============================================================

validate_environment() {
    print_header "Validating Environment"

    case "$ENVIRONMENT" in
        development|staging|production)
            print_success "Environment: $ENVIRONMENT"
            ;;
        *)
            print_error "Invalid environment: $ENVIRONMENT"
            echo "Valid environments: development, staging, production"
            exit 1
            ;;
    esac

    # Check if .env file exists for Docker deployment
    if [ "$USE_DOCKER" = true ]; then
        if [ ! -f "$DOCKER_DIR/.env" ] && [ "$ENVIRONMENT" == "production" ]; then
            print_warning ".env file not found in $DOCKER_DIR"
            print_info "Creating .env from template..."
            create_env_file
        fi
    fi

    echo ""
}

# ============================================================
# Create environment file
# ============================================================

create_env_file() {
    cat > "$DOCKER_DIR/.env" << EOF
# ESP32 RoIP Environment Configuration
# Environment: $ENVIRONMENT
# Generated: $(date)

# Node environment
NODE_ENV=$ENVIRONMENT

# Database configuration
DB_NAME=roip
DB_USER=roip
DB_PASSWORD=$(openssl rand -base64 32)

# JWT configuration
JWT_SECRET=$(openssl rand -base64 64)
JWT_EXPIRY=1h

# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# TURN/STUN server
TURN_USERNAME=roip
TURN_PASSWORD=$(openssl rand -base64 32)

# Network configuration
ENABLE_STUN=true
ENABLE_TURN=true
NAT_DETECTION=true
EOF

    print_success "Created .env file"
    print_warning "Please review and update $DOCKER_DIR/.env before starting services"
}

# ============================================================
# Create backup
# ============================================================

create_backup() {
    if [ "$CREATE_BACKUP" = false ]; then
        return 0
    fi

    print_header "Creating Backup"

    local backup_dir="$PROJECT_ROOT/backups"
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_name="roip_backup_${ENVIRONMENT}_${timestamp}"

    mkdir -p "$backup_dir"

    print_info "Creating backup: $backup_name"

    # Backup database if using Docker
    if [ "$USE_DOCKER" = true ]; then
        if docker ps | grep -q roip-postgres; then
            print_info "Backing up PostgreSQL database..."
            docker exec roip-postgres pg_dump -U roip roip > "$backup_dir/${backup_name}.sql"
            print_success "Database backup created"
        fi
    fi

    # Backup configuration files
    print_info "Backing up configuration files..."
    tar -czf "$backup_dir/${backup_name}_config.tar.gz" \
        -C "$PROJECT_ROOT" \
        docker/.env \
        docker/config \
        2>/dev/null || true

    print_success "Backup created: $backup_dir/$backup_name"
    echo ""
}

# ============================================================
# Deploy using Docker Compose
# ============================================================

deploy_docker() {
    print_header "Deploying with Docker Compose"

    cd "$DOCKER_DIR"

    # Check if Docker is running
    if ! docker info &> /dev/null; then
        print_error "Docker is not running"
        exit 1
    fi
    print_success "Docker is running"

    # Pull latest images
    print_info "Pulling latest images..."
    docker-compose pull

    if [ "$UPDATE_ONLY" = true ]; then
        # Update existing deployment
        print_info "Updating existing deployment..."
        docker-compose up -d --no-deps roip-server
        print_success "Service updated"
    else
        # Full deployment
        print_info "Starting services..."
        docker-compose up -d

        # Wait for services to be ready
        print_info "Waiting for services to be ready..."
        sleep 15

        # Check service health
        if docker-compose ps | grep -q "Up"; then
            print_success "Services are running"
        else
            print_error "Some services failed to start"
            docker-compose logs
            exit 1
        fi
    fi

    # Show service status
    echo ""
    print_info "Service Status:"
    docker-compose ps

    # Show logs
    echo ""
    print_info "Recent logs:"
    docker-compose logs --tail=20

    echo ""
}

# ============================================================
# Deploy manually (without Docker)
# ============================================================

deploy_manual() {
    print_header "Manual Deployment"

    # Install dependencies
    print_info "Installing dependencies..."
    cd "$SERVER_DIR"
    npm ci --production
    print_success "Dependencies installed"

    # Set up environment variables
    print_info "Setting up environment..."
    export NODE_ENV=$ENVIRONMENT

    # Run database migrations
    print_info "Running database migrations..."
    # Add migration commands here if needed

    # Start server with PM2 (if available)
    if command -v pm2 &> /dev/null; then
        print_info "Starting server with PM2..."
        pm2 start src/server.js --name roip-server --env $ENVIRONMENT
        pm2 save
        print_success "Server started with PM2"
    else
        print_warning "PM2 not found. Install with: npm install -g pm2"
        print_info "Starting server in background..."
        nohup node src/server.js > server.log 2>&1 &
        echo $! > server.pid
        print_success "Server started (PID: $(cat server.pid))"
    fi

    echo ""
}

# ============================================================
# Post-deployment checks
# ============================================================

post_deployment_checks() {
    print_header "Post-Deployment Checks"

    # Wait a bit for services to initialize
    sleep 5

    # Check API health endpoint
    print_info "Checking API health..."
    if curl -f http://localhost:8080/health &> /dev/null; then
        print_success "API is healthy"
    else
        print_error "API health check failed"
        return 1
    fi

    # Check WebSocket endpoint
    print_info "Checking WebSocket..."
    if curl -f http://localhost:8081/ &> /dev/null; then
        print_success "WebSocket is available"
    else
        print_warning "WebSocket check failed"
    fi

    # Check database connection
    if [ "$USE_DOCKER" = true ]; then
        print_info "Checking database..."
        if docker exec roip-postgres pg_isready -U roip &> /dev/null; then
            print_success "Database is ready"
        else
            print_error "Database check failed"
            return 1
        fi
    fi

    echo ""
    print_success "All post-deployment checks passed"
}

# ============================================================
# Display deployment information
# ============================================================

show_deployment_info() {
    print_header "Deployment Information"

    echo ""
    echo "Environment: $ENVIRONMENT"
    echo "Deployment method: $([ "$USE_DOCKER" = true ] && echo "Docker Compose" || echo "Manual")"
    echo ""
    echo "Service Endpoints:"
    echo "  - API:       http://localhost:8080"
    echo "  - WebSocket: ws://localhost:8081"
    echo "  - SIP:       udp://localhost:5060"
    echo "  - RTP:       udp://localhost:10000-10100"
    echo ""

    if [ "$USE_DOCKER" = true ]; then
        echo "Docker Commands:"
        echo "  - View logs:     docker-compose -f $DOCKER_DIR/docker-compose.yml logs -f"
        echo "  - Stop services: docker-compose -f $DOCKER_DIR/docker-compose.yml down"
        echo "  - Restart:       docker-compose -f $DOCKER_DIR/docker-compose.yml restart"
    else
        echo "Server Management:"
        if command -v pm2 &> /dev/null; then
            echo "  - View logs:  pm2 logs roip-server"
            echo "  - Stop:       pm2 stop roip-server"
            echo "  - Restart:    pm2 restart roip-server"
            echo "  - Status:     pm2 status"
        else
            echo "  - View logs:  tail -f $SERVER_DIR/server.log"
            echo "  - Stop:       kill \$(cat $SERVER_DIR/server.pid)"
        fi
    fi

    echo ""
}

# ============================================================
# Main script
# ============================================================

main() {
    print_header "ESP32 RoIP Deployment Script"
    echo ""

    # Parse arguments
    parse_args "$@"

    # Validate environment
    validate_environment

    # Create backup if requested
    create_backup

    # Deploy based on method
    if [ "$USE_DOCKER" = true ]; then
        deploy_docker
    else
        deploy_manual
    fi

    # Run post-deployment checks
    if post_deployment_checks; then
        show_deployment_info
        print_success "Deployment completed successfully!"
        exit 0
    else
        print_error "Deployment completed with errors"
        exit 1
    fi
}

# Run main function
main "$@"
