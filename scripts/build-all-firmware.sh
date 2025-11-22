#!/bin/bash
# ============================================================
# Build All Firmware Variants Script
# ============================================================
# This script builds firmware for all ESP32 variants
# Usage: ./build-all-firmware.sh [clean]
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
FIRMWARE_DIR="$PROJECT_ROOT/roip-firmware"

# Firmware environments to build
ENVIRONMENTS=(
    "esp32-roip"
    "esp32s2-roip"
    "esp32s3-roip"
    "esp32c3-roip"
    "esp32c5-roip"
    "esp32c6-roip"
    "esp32h2-roip"
)

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
# Check prerequisites
# ============================================================

check_prerequisites() {
    print_header "Checking Prerequisites"

    # Check if PlatformIO is installed
    if ! command -v pio &> /dev/null; then
        print_error "PlatformIO is not installed"
        print_info "Install with: pip install platformio"
        exit 1
    fi
    print_success "PlatformIO is installed"

    # Check if firmware directory exists
    if [ ! -d "$FIRMWARE_DIR" ]; then
        print_error "Firmware directory not found: $FIRMWARE_DIR"
        exit 1
    fi
    print_success "Firmware directory found"

    echo ""
}

# ============================================================
# Clean build artifacts
# ============================================================

clean_builds() {
    print_header "Cleaning Build Artifacts"

    cd "$FIRMWARE_DIR"

    if [ -d ".pio" ]; then
        print_info "Removing .pio directory..."
        rm -rf .pio
        print_success "Build artifacts cleaned"
    else
        print_info "No build artifacts to clean"
    fi

    echo ""
}

# ============================================================
# Build firmware for a specific environment
# ============================================================

build_environment() {
    local env=$1
    print_info "Building $env..."

    cd "$FIRMWARE_DIR"

    if pio run -e "$env"; then
        print_success "$env build completed"

        # Get firmware size
        if [ -f ".pio/build/$env/firmware.bin" ]; then
            local size=$(ls -lh ".pio/build/$env/firmware.bin" | awk '{print $5}')
            print_info "Firmware size: $size"
        fi

        return 0
    else
        print_error "$env build failed"
        return 1
    fi
}

# ============================================================
# Build all firmware variants
# ============================================================

build_all() {
    print_header "Building All Firmware Variants"

    local failed_builds=()
    local successful_builds=()
    local total=${#ENVIRONMENTS[@]}
    local current=0

    for env in "${ENVIRONMENTS[@]}"; do
        current=$((current + 1))
        echo ""
        print_info "Building $current of $total: $env"
        echo ""

        if build_environment "$env"; then
            successful_builds+=("$env")
        else
            failed_builds+=("$env")
        fi
    done

    echo ""
    print_header "Build Summary"

    echo ""
    echo "Total builds: $total"
    echo -e "${GREEN}Successful: ${#successful_builds[@]}${NC}"
    echo -e "${RED}Failed: ${#failed_builds[@]}${NC}"
    echo ""

    if [ ${#successful_builds[@]} -gt 0 ]; then
        echo "Successful builds:"
        for env in "${successful_builds[@]}"; do
            print_success "$env"
        done
        echo ""
    fi

    if [ ${#failed_builds[@]} -gt 0 ]; then
        echo "Failed builds:"
        for env in "${failed_builds[@]}"; do
            print_error "$env"
        done
        echo ""
        return 1
    fi

    print_success "All firmware builds completed successfully!"
    return 0
}

# ============================================================
# Display build artifacts
# ============================================================

show_artifacts() {
    print_header "Build Artifacts"

    cd "$FIRMWARE_DIR"

    if [ ! -d ".pio/build" ]; then
        print_warning "No build directory found"
        return
    fi

    echo ""
    printf "%-20s %-15s %-20s\n" "Environment" "Size" "Location"
    echo "------------------------------------------------------------"

    for env in "${ENVIRONMENTS[@]}"; do
        if [ -f ".pio/build/$env/firmware.bin" ]; then
            local size=$(ls -lh ".pio/build/$env/firmware.bin" | awk '{print $5}')
            local path=".pio/build/$env/firmware.bin"
            printf "%-20s %-15s %-20s\n" "$env" "$size" "$path"
        fi
    done

    echo ""
}

# ============================================================
# Main script
# ============================================================

main() {
    print_header "ESP32 RoIP Firmware Build Script"
    echo ""

    # Check if clean flag is provided
    if [ "$1" == "clean" ]; then
        clean_builds
    fi

    # Check prerequisites
    check_prerequisites

    # Build all firmware
    if build_all; then
        show_artifacts
        exit 0
    else
        print_error "Some builds failed"
        exit 1
    fi
}

# Run main function
main "$@"
