#!/bin/bash
# ============================================================
# Run All Tests Script
# ============================================================
# This script runs all tests for the ESP32 RoIP system
# Usage: ./run-all-tests.sh [options]
# Options:
#   --unit          Run only unit tests
#   --integration   Run only integration tests
#   --e2e           Run only E2E tests
#   --coverage      Generate coverage reports
#   --verbose       Verbose output
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
SERVER_DIR="$PROJECT_ROOT/roip-server"
E2E_DIR="$PROJECT_ROOT/test/e2e"
FIRMWARE_DIR="$PROJECT_ROOT/roip-firmware"

# Test flags
RUN_UNIT=false
RUN_INTEGRATION=false
RUN_E2E=false
RUN_FIRMWARE=false
GENERATE_COVERAGE=false
VERBOSE=false

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
    if [ $# -eq 0 ]; then
        # No arguments, run all tests
        RUN_UNIT=true
        RUN_INTEGRATION=true
        RUN_E2E=true
        RUN_FIRMWARE=true
    fi

    while [ $# -gt 0 ]; do
        case "$1" in
            --unit)
                RUN_UNIT=true
                shift
                ;;
            --integration)
                RUN_INTEGRATION=true
                shift
                ;;
            --e2e)
                RUN_E2E=true
                shift
                ;;
            --firmware)
                RUN_FIRMWARE=true
                shift
                ;;
            --coverage)
                GENERATE_COVERAGE=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --help)
                echo "Usage: $0 [options]"
                echo "Options:"
                echo "  --unit          Run only unit tests"
                echo "  --integration   Run only integration tests"
                echo "  --e2e           Run only E2E tests"
                echo "  --firmware      Run only firmware tests"
                echo "  --coverage      Generate coverage reports"
                echo "  --verbose       Verbose output"
                echo "  --help          Show this help message"
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
# Check prerequisites
# ============================================================

check_prerequisites() {
    print_header "Checking Prerequisites"

    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        exit 1
    fi
    print_success "Node.js is installed ($(node --version))"

    # Check npm
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed"
        exit 1
    fi
    print_success "npm is installed ($(npm --version))"

    # Check PlatformIO for firmware tests
    if [ "$RUN_FIRMWARE" = true ]; then
        if ! command -v pio &> /dev/null; then
            print_error "PlatformIO is not installed (required for firmware tests)"
            exit 1
        fi
        print_success "PlatformIO is installed"
    fi

    echo ""
}

# ============================================================
# Install dependencies
# ============================================================

install_dependencies() {
    print_header "Installing Dependencies"

    # Server dependencies
    if [ "$RUN_UNIT" = true ] || [ "$RUN_INTEGRATION" = true ]; then
        if [ -d "$SERVER_DIR" ]; then
            print_info "Installing server dependencies..."
            cd "$SERVER_DIR"
            npm ci
            print_success "Server dependencies installed"
        fi
    fi

    # E2E test dependencies
    if [ "$RUN_E2E" = true ]; then
        if [ -d "$E2E_DIR" ]; then
            print_info "Installing E2E test dependencies..."
            cd "$E2E_DIR"
            npm ci
            print_success "E2E test dependencies installed"
        fi
    fi

    echo ""
}

# ============================================================
# Run unit tests
# ============================================================

run_unit_tests() {
    print_header "Running Unit Tests"

    cd "$SERVER_DIR"

    local coverage_flag=""
    if [ "$GENERATE_COVERAGE" = true ]; then
        coverage_flag="--coverage"
    fi

    local verbose_flag=""
    if [ "$VERBOSE" = true ]; then
        verbose_flag="--verbose"
    fi

    print_info "Executing unit tests..."

    if npm test -- $coverage_flag $verbose_flag; then
        print_success "Unit tests passed"
        return 0
    else
        print_error "Unit tests failed"
        return 1
    fi
}

# ============================================================
# Run integration tests
# ============================================================

run_integration_tests() {
    print_header "Running Integration Tests"

    cd "$SERVER_DIR"

    # Check if PostgreSQL is running
    if ! command -v pg_isready &> /dev/null; then
        print_warning "pg_isready not found, cannot check PostgreSQL status"
    else
        if pg_isready -h localhost -p 5432 &> /dev/null; then
            print_success "PostgreSQL is running"
        else
            print_warning "PostgreSQL is not running. Starting with Docker..."
            docker run -d --name roip-test-postgres \
                -e POSTGRES_DB=roip_test \
                -e POSTGRES_USER=roip_test \
                -e POSTGRES_PASSWORD=test_password \
                -p 5432:5432 \
                postgres:16-alpine
            sleep 5
        fi
    fi

    print_info "Executing integration tests..."

    export DB_TYPE=postgresql
    export DB_HOST=localhost
    export DB_PORT=5432
    export DB_NAME=roip_test
    export DB_USER=roip_test
    export DB_PASSWORD=test_password
    export JWT_SECRET=test-secret-key

    local coverage_flag=""
    if [ "$GENERATE_COVERAGE" = true ]; then
        coverage_flag="--coverage"
    fi

    if npm test -- --testPathPattern=integration $coverage_flag; then
        print_success "Integration tests passed"
        return 0
    else
        print_error "Integration tests failed"
        return 1
    fi
}

# ============================================================
# Run E2E tests
# ============================================================

run_e2e_tests() {
    print_header "Running E2E Tests"

    # Start server in background
    print_info "Starting server..."
    cd "$SERVER_DIR"

    export NODE_ENV=test
    export DB_TYPE=sqlite
    export JWT_SECRET=test-secret-key
    export API_PORT=8080
    export SIP_PORT=5060

    npm start &
    SERVER_PID=$!
    sleep 10

    # Wait for server to be ready
    print_info "Waiting for server to be ready..."
    timeout 60 bash -c 'until curl -f http://localhost:8080/health &>/dev/null; do sleep 2; done' || {
        print_error "Server failed to start"
        kill $SERVER_PID 2>/dev/null || true
        return 1
    }
    print_success "Server is ready"

    # Run E2E tests
    print_info "Executing E2E tests..."
    cd "$E2E_DIR"

    export SERVER_URL=http://localhost:8080
    export SIP_SERVER=localhost:5060

    local test_result=0
    if npm test; then
        print_success "E2E tests passed"
    else
        print_error "E2E tests failed"
        test_result=1
    fi

    # Stop server
    print_info "Stopping server..."
    kill $SERVER_PID 2>/dev/null || true
    wait $SERVER_PID 2>/dev/null || true

    return $test_result
}

# ============================================================
# Run firmware tests
# ============================================================

run_firmware_tests() {
    print_header "Running Firmware Tests"

    cd "$FIRMWARE_DIR"

    print_info "Building and running firmware tests for ESP32-S3..."

    if pio test -e esp32s3-roip-test --without-uploading; then
        print_success "Firmware tests passed"
        return 0
    else
        print_error "Firmware tests failed"
        return 1
    fi
}

# ============================================================
# Generate test report
# ============================================================

generate_report() {
    print_header "Test Results Summary"

    echo ""
    printf "%-25s %-10s\n" "Test Suite" "Status"
    echo "--------------------------------------------"

    if [ "$RUN_UNIT" = true ]; then
        if [ ${UNIT_RESULT:-1} -eq 0 ]; then
            printf "%-25s ${GREEN}%-10s${NC}\n" "Unit Tests" "PASSED"
        else
            printf "%-25s ${RED}%-10s${NC}\n" "Unit Tests" "FAILED"
        fi
    fi

    if [ "$RUN_INTEGRATION" = true ]; then
        if [ ${INTEGRATION_RESULT:-1} -eq 0 ]; then
            printf "%-25s ${GREEN}%-10s${NC}\n" "Integration Tests" "PASSED"
        else
            printf "%-25s ${RED}%-10s${NC}\n" "Integration Tests" "FAILED"
        fi
    fi

    if [ "$RUN_E2E" = true ]; then
        if [ ${E2E_RESULT:-1} -eq 0 ]; then
            printf "%-25s ${GREEN}%-10s${NC}\n" "E2E Tests" "PASSED"
        else
            printf "%-25s ${RED}%-10s${NC}\n" "E2E Tests" "FAILED"
        fi
    fi

    if [ "$RUN_FIRMWARE" = true ]; then
        if [ ${FIRMWARE_RESULT:-1} -eq 0 ]; then
            printf "%-25s ${GREEN}%-10s${NC}\n" "Firmware Tests" "PASSED"
        else
            printf "%-25s ${RED}%-10s${NC}\n" "Firmware Tests" "FAILED"
        fi
    fi

    echo ""

    if [ "$GENERATE_COVERAGE" = true ]; then
        print_info "Coverage reports generated in:"
        if [ -d "$SERVER_DIR/coverage" ]; then
            echo "  - $SERVER_DIR/coverage/"
        fi
    fi

    echo ""
}

# ============================================================
# Main script
# ============================================================

main() {
    print_header "ESP32 RoIP Test Suite"
    echo ""

    # Parse arguments
    parse_args "$@"

    # Check prerequisites
    check_prerequisites

    # Install dependencies
    install_dependencies

    # Run tests
    local exit_code=0

    if [ "$RUN_UNIT" = true ]; then
        run_unit_tests
        UNIT_RESULT=$?
        [ $UNIT_RESULT -ne 0 ] && exit_code=1
        echo ""
    fi

    if [ "$RUN_INTEGRATION" = true ]; then
        run_integration_tests
        INTEGRATION_RESULT=$?
        [ $INTEGRATION_RESULT -ne 0 ] && exit_code=1
        echo ""
    fi

    if [ "$RUN_E2E" = true ]; then
        run_e2e_tests
        E2E_RESULT=$?
        [ $E2E_RESULT -ne 0 ] && exit_code=1
        echo ""
    fi

    if [ "$RUN_FIRMWARE" = true ]; then
        run_firmware_tests
        FIRMWARE_RESULT=$?
        [ $FIRMWARE_RESULT -ne 0 ] && exit_code=1
        echo ""
    fi

    # Generate report
    generate_report

    # Exit with appropriate code
    if [ $exit_code -eq 0 ]; then
        print_success "All tests passed!"
    else
        print_error "Some tests failed"
    fi

    exit $exit_code
}

# Run main function
main "$@"
