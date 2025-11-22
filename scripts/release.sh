#!/bin/bash
# ============================================================
# Release Script
# ============================================================
# This script creates a new release of the ESP32 RoIP system
# Usage: ./release.sh <version> [options]
# Options:
#   --skip-tests     Skip running tests before release
#   --skip-build     Skip building artifacts
#   --dry-run        Show what would be done without doing it
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
SERVER_DIR="$PROJECT_ROOT/roip-server"
RELEASE_DIR="$PROJECT_ROOT/release"

# Release options
VERSION="${1}"
SKIP_TESTS=false
SKIP_BUILD=false
DRY_RUN=false

# Firmware environments
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
# Parse command line arguments
# ============================================================

parse_args() {
    if [ -z "$VERSION" ]; then
        print_error "Version number is required"
        echo "Usage: $0 <version> [options]"
        echo "Example: $0 v1.0.0"
        exit 1
    fi

    # Ensure version starts with 'v'
    if [[ ! "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+.*$ ]]; then
        print_error "Invalid version format: $VERSION"
        echo "Version must be in format: v1.0.0 or v1.0.0-beta.1"
        exit 1
    fi

    shift  # Skip version argument

    while [ $# -gt 0 ]; do
        case "$1" in
            --skip-tests)
                SKIP_TESTS=true
                shift
                ;;
            --skip-build)
                SKIP_BUILD=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --help)
                echo "Usage: $0 <version> [options]"
                echo ""
                echo "Arguments:"
                echo "  version        Version number (e.g., v1.0.0)"
                echo ""
                echo "Options:"
                echo "  --skip-tests   Skip running tests before release"
                echo "  --skip-build   Skip building artifacts"
                echo "  --dry-run      Show what would be done without doing it"
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
# Check prerequisites
# ============================================================

check_prerequisites() {
    print_header "Checking Prerequisites"

    # Check Git
    if ! command -v git &> /dev/null; then
        print_error "Git is not installed"
        exit 1
    fi
    print_success "Git is installed"

    # Check if we're in a git repository
    if ! git rev-parse --git-dir &> /dev/null; then
        print_error "Not in a git repository"
        exit 1
    fi
    print_success "In git repository"

    # Check for uncommitted changes
    if [ -n "$(git status --porcelain)" ]; then
        print_warning "You have uncommitted changes"
        if [ "$DRY_RUN" = false ]; then
            read -p "Continue anyway? (y/N) " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                exit 1
            fi
        fi
    fi

    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        exit 1
    fi
    print_success "Node.js is installed"

    # Check PlatformIO
    if ! command -v pio &> /dev/null; then
        print_error "PlatformIO is not installed"
        exit 1
    fi
    print_success "PlatformIO is installed"

    # Check if tag already exists
    if git tag | grep -q "^${VERSION}$"; then
        print_error "Tag $VERSION already exists"
        exit 1
    fi
    print_success "Tag $VERSION is available"

    echo ""
}

# ============================================================
# Run tests
# ============================================================

run_tests() {
    if [ "$SKIP_TESTS" = true ]; then
        print_warning "Skipping tests"
        return 0
    fi

    print_header "Running Tests"

    if [ "$DRY_RUN" = true ]; then
        print_info "Would run: $SCRIPT_DIR/run-all-tests.sh"
        return 0
    fi

    if bash "$SCRIPT_DIR/run-all-tests.sh"; then
        print_success "All tests passed"
    else
        print_error "Tests failed"
        exit 1
    fi

    echo ""
}

# ============================================================
# Update version in files
# ============================================================

update_version() {
    print_header "Updating Version Numbers"

    local version_num="${VERSION#v}"  # Remove 'v' prefix

    if [ "$DRY_RUN" = true ]; then
        print_info "Would update version to $version_num in:"
        print_info "  - $SERVER_DIR/package.json"
        print_info "  - $FIRMWARE_DIR/platformio.ini"
        return 0
    fi

    # Update package.json
    print_info "Updating package.json..."
    cd "$SERVER_DIR"
    npm version "$version_num" --no-git-tag-version
    print_success "Updated package.json"

    # Update platformio.ini
    print_info "Updating platformio.ini..."
    sed -i "s/-DROIP_VERSION=.*/-DROIP_VERSION=\\\"$version_num\\\"/" "$FIRMWARE_DIR/platformio.ini"
    print_success "Updated platformio.ini"

    echo ""
}

# ============================================================
# Build firmware binaries
# ============================================================

build_firmware() {
    if [ "$SKIP_BUILD" = true ]; then
        print_warning "Skipping firmware build"
        return 0
    fi

    print_header "Building Firmware Binaries"

    if [ "$DRY_RUN" = true ]; then
        print_info "Would build firmware for all variants"
        return 0
    fi

    if bash "$SCRIPT_DIR/build-all-firmware.sh"; then
        print_success "Firmware build completed"
    else
        print_error "Firmware build failed"
        exit 1
    fi

    echo ""
}

# ============================================================
# Create release directory structure
# ============================================================

create_release_structure() {
    print_header "Creating Release Structure"

    if [ "$DRY_RUN" = true ]; then
        print_info "Would create release directory: $RELEASE_DIR"
        return 0
    fi

    # Clean and create release directory
    rm -rf "$RELEASE_DIR"
    mkdir -p "$RELEASE_DIR"/{firmware,docs,checksums}

    print_success "Release directory created"
    echo ""
}

# ============================================================
# Copy firmware binaries
# ============================================================

copy_firmware() {
    if [ "$SKIP_BUILD" = true ]; then
        return 0
    fi

    print_header "Copying Firmware Binaries"

    if [ "$DRY_RUN" = true ]; then
        print_info "Would copy firmware binaries to release directory"
        return 0
    fi

    for env in "${ENVIRONMENTS[@]}"; do
        if [ -f "$FIRMWARE_DIR/.pio/build/$env/firmware.bin" ]; then
            local filename="esp32-roip-${env}-${VERSION}.bin"
            cp "$FIRMWARE_DIR/.pio/build/$env/firmware.bin" "$RELEASE_DIR/firmware/$filename"
            print_success "Copied $env firmware"
        else
            print_warning "Firmware not found for $env"
        fi
    done

    echo ""
}

# ============================================================
# Copy documentation
# ============================================================

copy_documentation() {
    print_header "Copying Documentation"

    if [ "$DRY_RUN" = true ]; then
        print_info "Would copy documentation to release directory"
        return 0
    fi

    # Copy all RoIP documentation
    cp "$PROJECT_ROOT"/ROIP_*.md "$RELEASE_DIR/docs/" 2>/dev/null || true

    # Create installation guide
    cat > "$RELEASE_DIR/INSTALLATION.md" << EOF
# ESP32 RoIP $VERSION - Installation Guide

## Firmware Installation

### Using esptool.py
\`\`\`bash
esptool.py --chip esp32 --port /dev/ttyUSB0 write_flash 0x10000 firmware.bin
\`\`\`

### Using PlatformIO
\`\`\`bash
pio run -e <environment> --target upload
\`\`\`

## Server Installation

### Using Docker
\`\`\`bash
docker pull your-dockerhub-username/esp-roip-server:$VERSION
cd docker
docker-compose up -d
\`\`\`

### Manual Installation
See docs/ROIP_SERVER_GUIDE.md for detailed instructions.

## Documentation

- ROIP_QUICKSTART.md - Quick start guide
- ROIP_SERVER_GUIDE.md - Server setup and configuration
- ROIP_CLIENT_GUIDE.md - ESP32 client setup
- ROIP_API_REFERENCE.md - API documentation
- ROIP_TROUBLESHOOTING.md - Troubleshooting guide

## Checksums

Verify file integrity using the checksums in the checksums directory.
EOF

    print_success "Documentation copied"
    echo ""
}

# ============================================================
# Generate checksums
# ============================================================

generate_checksums() {
    if [ "$SKIP_BUILD" = true ]; then
        return 0
    fi

    print_header "Generating Checksums"

    if [ "$DRY_RUN" = true ]; then
        print_info "Would generate SHA256 and MD5 checksums"
        return 0
    fi

    cd "$RELEASE_DIR/firmware"

    # Generate SHA256 checksums
    sha256sum *.bin > ../checksums/sha256sums.txt 2>/dev/null || true

    # Generate MD5 checksums
    md5sum *.bin > ../checksums/md5sums.txt 2>/dev/null || true

    print_success "Checksums generated"
    echo ""
}

# ============================================================
# Create release archives
# ============================================================

create_archives() {
    print_header "Creating Release Archives"

    if [ "$DRY_RUN" = true ]; then
        print_info "Would create release archives"
        return 0
    fi

    cd "$PROJECT_ROOT"

    # Create tar.gz archive
    tar -czf "esp32-roip-${VERSION}.tar.gz" \
        -C release \
        .

    # Create zip archive
    zip -r "esp32-roip-${VERSION}.zip" release/

    print_success "Release archives created"
    echo ""
}

# ============================================================
# Generate changelog
# ============================================================

generate_changelog() {
    print_header "Generating Changelog"

    if [ "$DRY_RUN" = true ]; then
        print_info "Would generate changelog"
        return 0
    fi

    # Get previous tag
    local prev_tag=$(git describe --tags --abbrev=0 2>/dev/null || echo "")

    if [ -z "$prev_tag" ]; then
        print_info "First release, no previous tag found"
        cat > "$RELEASE_DIR/CHANGELOG.md" << EOF
# $VERSION - $(date +%Y-%m-%d)

Initial release of ESP32 RoIP system.

## Features
- Radio over IP (RoIP) support
- SIP/RTP protocol implementation
- Multiple ESP32 variant support
- Web-based management interface
- Real-time audio streaming
EOF
    else
        print_info "Generating changelog from $prev_tag to $VERSION"

        cat > "$RELEASE_DIR/CHANGELOG.md" << EOF
# $VERSION - $(date +%Y-%m-%d)

## Changes since $prev_tag

$(git log $prev_tag..HEAD --pretty=format:"- %s (%h)" --no-merges)

EOF
    fi

    print_success "Changelog generated"
    echo ""
}

# ============================================================
# Commit and tag
# ============================================================

commit_and_tag() {
    print_header "Creating Git Tag"

    if [ "$DRY_RUN" = true ]; then
        print_info "Would commit version changes and create tag $VERSION"
        return 0
    fi

    # Stage version changes
    git add "$SERVER_DIR/package.json" "$FIRMWARE_DIR/platformio.ini"

    # Commit version changes
    git commit -m "Release $VERSION" || {
        print_warning "No changes to commit"
    }

    # Create annotated tag
    git tag -a "$VERSION" -m "Release $VERSION"

    print_success "Created tag $VERSION"
    echo ""
}

# ============================================================
# Display release summary
# ============================================================

show_summary() {
    print_header "Release Summary"

    echo ""
    echo "Version: $VERSION"
    echo "Date: $(date)"
    echo ""

    if [ "$DRY_RUN" = false ]; then
        echo "Release Artifacts:"
        echo "  - Release directory: $RELEASE_DIR"
        echo "  - Firmware binaries: $RELEASE_DIR/firmware/"
        echo "  - Documentation: $RELEASE_DIR/docs/"
        echo "  - Checksums: $RELEASE_DIR/checksums/"
        echo "  - Archives:"
        echo "    - esp32-roip-${VERSION}.tar.gz"
        echo "    - esp32-roip-${VERSION}.zip"
        echo ""
        echo "Git:"
        echo "  - Commit: $(git rev-parse HEAD)"
        echo "  - Tag: $VERSION"
        echo ""
        echo "Next Steps:"
        echo "  1. Review the release artifacts in $RELEASE_DIR"
        echo "  2. Push the changes: git push origin main"
        echo "  3. Push the tag: git push origin $VERSION"
        echo "  4. Create GitHub release with the artifacts"
        echo "  5. Build and push Docker image"
    else
        echo "DRY RUN - No changes were made"
    fi

    echo ""
}

# ============================================================
# Main script
# ============================================================

main() {
    print_header "ESP32 RoIP Release Script"
    echo ""

    # Parse arguments
    parse_args "$@"

    print_info "Creating release: $VERSION"
    if [ "$DRY_RUN" = true ]; then
        print_warning "DRY RUN MODE - No changes will be made"
    fi
    echo ""

    # Check prerequisites
    check_prerequisites

    # Run tests
    run_tests

    # Update version numbers
    update_version

    # Build firmware
    build_firmware

    # Create release structure
    create_release_structure

    # Copy firmware binaries
    copy_firmware

    # Copy documentation
    copy_documentation

    # Generate checksums
    generate_checksums

    # Create archives
    create_archives

    # Generate changelog
    generate_changelog

    # Commit and tag
    commit_and_tag

    # Show summary
    show_summary

    print_success "Release $VERSION created successfully!"
}

# Run main function
main "$@"
