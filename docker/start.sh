#!/bin/bash
# ESP32 RoIP System - Docker Stack Startup Script
# This script automates the setup and startup of the RoIP Docker environment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Functions
print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    print_header "Checking Prerequisites"

    # Check Docker
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        exit 1
    fi
    print_success "Docker is installed ($(docker --version))"

    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed"
        exit 1
    fi
    print_success "Docker Compose is installed ($(docker-compose --version))"

    # Check Docker daemon
    if ! docker ps &> /dev/null; then
        print_error "Docker daemon is not running or no permission"
        exit 1
    fi
    print_success "Docker daemon is running"

    echo ""
}

# Setup environment files
setup_environment() {
    print_header "Setting Up Environment"

    # Create .env file if it doesn't exist
    if [ ! -f "${SCRIPT_DIR}/.env" ]; then
        cp "${SCRIPT_DIR}/.env.example" "${SCRIPT_DIR}/.env"
        print_success "Created .env file from template"
        print_warning "Please review and edit .env with your configuration"
    else
        print_success ".env file already exists"
    fi

    # Create turnusers.txt if it doesn't exist
    if [ ! -f "${SCRIPT_DIR}/turnusers.txt" ]; then
        echo "roip:roip_turn_password" > "${SCRIPT_DIR}/turnusers.txt"
        chmod 600 "${SCRIPT_DIR}/turnusers.txt"
        print_success "Created turnusers.txt"
    else
        print_success "turnusers.txt already exists"
    fi

    # Create data directory
    if [ ! -d "${SCRIPT_DIR}/data" ]; then
        mkdir -p "${SCRIPT_DIR}/data"
        print_success "Created data directory"
    fi

    echo ""
}

# Build images
build_images() {
    print_header "Building Docker Images"

    cd "${SCRIPT_DIR}"
    docker-compose build --no-cache

    print_success "Docker images built successfully"
    echo ""
}

# Start services
start_services() {
    print_header "Starting Services"

    cd "${SCRIPT_DIR}"
    docker-compose up -d

    print_success "Services started"
    echo ""
}

# Wait for services
wait_for_services() {
    print_header "Waiting for Services to Be Ready"

    echo "Waiting for PostgreSQL..."
    for i in {1..30}; do
        if docker-compose exec -T postgres pg_isready -U roip -d roip &> /dev/null; then
            print_success "PostgreSQL is ready"
            break
        fi
        echo -n "."
        sleep 1
    done
    echo ""

    echo "Waiting for RoIP Server..."
    for i in {1..30}; do
        if curl -s http://localhost:8080/health &> /dev/null; then
            print_success "RoIP Server is ready"
            break
        fi
        echo -n "."
        sleep 1
    done
    echo ""

    echo "Waiting for WebSocket..."
    for i in {1..10}; do
        if nc -z localhost 8081 &> /dev/null; then
            print_success "WebSocket is ready"
            break
        fi
        echo -n "."
        sleep 1
    done
    echo ""

    echo ""
}

# Show status
show_status() {
    print_header "Service Status"

    cd "${SCRIPT_DIR}"
    docker-compose ps

    echo ""
}

# Show access information
show_access_info() {
    print_header "Access Information"

    echo -e "${GREEN}REST API${NC}:"
    echo "  URL: http://localhost:8080"
    echo "  Health: http://localhost:8080/health"
    echo ""

    echo -e "${GREEN}WebSocket${NC}:"
    echo "  URL: ws://localhost:8081"
    echo ""

    echo -e "${GREEN}SIP Server${NC}:"
    echo "  Host: localhost"
    echo "  Port: 5060 (UDP)"
    echo ""

    echo -e "${GREEN}RTP Media${NC}:"
    echo "  Port Range: 10000-10100 (UDP)"
    echo ""

    echo -e "${GREEN}TURN/STUN Server${NC}:"
    echo "  Host: localhost"
    echo "  Port: 3478 (UDP/TCP)"
    echo "  Username: roip"
    echo ""

    echo -e "${GREEN}PostgreSQL${NC}:"
    echo "  Host: localhost"
    echo "  Port: 5432"
    echo "  Database: roip"
    echo "  User: roip"
    echo ""
}

# Show logs
show_logs() {
    print_header "Recent Logs"

    cd "${SCRIPT_DIR}"
    echo -e "${BLUE}RoIP Server:${NC}"
    docker-compose logs --tail 10 roip-server
    echo ""

    echo -e "${BLUE}PostgreSQL:${NC}"
    docker-compose logs --tail 5 postgres
    echo ""

    echo -e "${BLUE}Coturn:${NC}"
    docker-compose logs --tail 5 coturn
    echo ""
}

# Main menu
show_menu() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}Setup Complete!${NC}"
    echo -e "${BLUE}================================${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Review the configuration: nano .env"
    echo "2. View logs: docker-compose logs -f"
    echo "3. Test API: curl http://localhost:8080/health"
    echo "4. Stop services: docker-compose down"
    echo ""
    echo "Useful commands:"
    echo "  docker-compose ps           - Show running containers"
    echo "  docker-compose logs -f      - Follow logs"
    echo "  docker-compose restart      - Restart services"
    echo "  docker-compose down         - Stop services"
    echo ""
    echo "For more info, see: ${SCRIPT_DIR}/README.md"
    echo ""
}

# Main execution
main() {
    print_header "ESP32 RoIP System - Docker Stack Setup"

    # Parse arguments
    if [ "$1" == "--logs" ]; then
        show_logs
        exit 0
    fi

    # Run setup steps
    check_prerequisites
    setup_environment

    # Ask to build
    read -p "Build Docker images? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        build_images
    fi

    # Ask to start
    read -p "Start services? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        start_services
        wait_for_services
        show_status
        show_access_info
        show_logs
        show_menu
    else
        echo ""
        echo "To start services manually, run:"
        echo "  cd ${SCRIPT_DIR}"
        echo "  docker-compose up -d"
        echo ""
    fi
}

# Run main function
main "$@"
