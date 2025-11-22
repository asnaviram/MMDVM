# CI/CD Pipeline Documentation

## Overview

This document describes the Continuous Integration and Continuous Deployment (CI/CD) pipeline for the ESP32 Radio over IP (RoIP) system. The pipeline is implemented using GitHub Actions and includes automated building, testing, security scanning, and release management.

## Table of Contents

- [Pipeline Architecture](#pipeline-architecture)
- [Workflows](#workflows)
- [Configuration Files](#configuration-files)
- [Build Scripts](#build-scripts)
- [Setup Instructions](#setup-instructions)
- [Usage Guide](#usage-guide)
- [Local Testing](#local-testing)
- [Release Process](#release-process)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

---

## Pipeline Architecture

### Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    GitHub Actions CI/CD                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │  Firmware  │  │   Server   │  │   Docker   │            │
│  │   Build    │  │    Test    │  │   Build    │            │
│  └────────────┘  └────────────┘  └────────────┘            │
│                                                               │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │  Security  │  │   Release  │  │ Dependabot │            │
│  │    Scan    │  │ Management │  │   Updates  │            │
│  └────────────┘  └────────────┘  └────────────┘            │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Components

1. **Firmware Build**: Compiles ESP32 firmware for all variants
2. **Server Test**: Tests Node.js server with full coverage
3. **Docker Build**: Builds and tests Docker images
4. **Security Scan**: Performs security analysis and vulnerability scanning
5. **Release Management**: Automates version releases
6. **Dependency Updates**: Automated dependency management with Dependabot

---

## Workflows

### 1. Firmware Build Workflow

**File**: `.github/workflows/firmware-build.yml`

**Triggers**:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`
- Manual dispatch

**Features**:
- Builds firmware for all ESP32 variants (ESP32, S2, S3, C3, C5, C6, H2)
- Runs firmware unit tests
- Caches PlatformIO dependencies for faster builds
- Uploads firmware binaries as artifacts
- Generates build summaries with firmware sizes

**Environments**:
- `esp32-roip` - ESP32 Original
- `esp32s2-roip` - ESP32-S2
- `esp32s3-roip` - ESP32-S3 (Recommended)
- `esp32c3-roip` - ESP32-C3
- `esp32c5-roip` - ESP32-C5
- `esp32c6-roip` - ESP32-C6
- `esp32h2-roip` - ESP32-H2

**Artifacts**:
- Firmware binaries (`.bin` files)
- ELF files for debugging
- Memory maps and size information
- Build logs and test results

### 2. Server Test Workflow

**File**: `.github/workflows/server-test.yml`

**Triggers**:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`
- Manual dispatch

**Features**:
- **Linting**: ESLint code quality checks
- **Unit Tests**: Jest unit tests with coverage
- **Integration Tests**: Database and API integration tests
- **E2E Tests**: End-to-end testing with real server
- **Coverage Reporting**: Uploads to Codecov

**Test Suites**:

1. **Lint**
   - Runs ESLint on server code
   - Generates lint report
   - Fails on errors

2. **Unit Tests**
   - Tests individual modules
   - Generates code coverage
   - Uploads to Codecov

3. **Integration Tests**
   - Requires PostgreSQL database
   - Tests database operations
   - Tests API endpoints

4. **E2E Tests**
   - Starts full server stack
   - Tests real-world scenarios
   - Validates API and WebSocket functionality

### 3. Docker Build Workflow

**File**: `.github/workflows/docker-build.yml`

**Triggers**:
- Push to `main` or `develop` branches
- Push of version tags (`v*.*.*`)
- Pull requests
- Manual dispatch

**Features**:
- Multi-platform builds (amd64, arm64)
- Security scanning with Trivy
- Docker Compose deployment testing
- Automatic pushing to Docker Hub on tags
- Build caching for faster builds

**Build Stages**:

1. **Build Image**
   - Builds Docker image for multiple platforms
   - Tags with version and commit SHA
   - Caches layers for efficiency

2. **Security Scan**
   - Scans for vulnerabilities with Trivy
   - Uploads SARIF results to GitHub Security
   - Fails on critical vulnerabilities

3. **Deployment Test**
   - Tests docker-compose deployment
   - Validates service health checks
   - Ensures all services start correctly

### 4. Security Scan Workflow

**File**: `.github/workflows/security-scan.yml`

**Triggers**:
- Push to `main` or `develop` branches
- Pull requests
- Daily schedule (2:00 AM UTC)
- Manual dispatch

**Security Checks**:

1. **NPM Audit**
   - Scans Node.js dependencies
   - Reports vulnerabilities
   - Fails on high/critical issues

2. **Dependency Review**
   - Reviews new dependencies in PRs
   - Checks license compatibility
   - Blocks problematic licenses

3. **CodeQL Analysis**
   - Static code analysis
   - Detects security vulnerabilities
   - Scans JavaScript and C++ code

4. **Secret Scanning**
   - Detects exposed secrets with Gitleaks
   - Prevents credential leaks
   - Scans full git history

5. **OWASP Dependency Check**
   - Comprehensive dependency analysis
   - CVE vulnerability detection
   - Generates detailed reports

6. **License Compliance**
   - Validates dependency licenses
   - Generates license report
   - Ensures compliance

### 5. Release Workflow

**File**: `.github/workflows/release.yml`

**Triggers**:
- Push of version tags (`v*.*.*`)
- Manual dispatch with version input

**Features**:
- Builds all firmware variants
- Builds and pushes Docker images
- Generates changelog automatically
- Creates GitHub release with artifacts
- Includes checksums for verification

**Release Artifacts**:
- Firmware binaries for all ESP32 variants
- Installation guide
- Complete documentation
- SHA256 and MD5 checksums
- Release archives (tar.gz and zip)

**Release Process**:

1. Build all firmware variants
2. Build Docker images with version tags
3. Generate changelog from git commits
4. Create release package with documentation
5. Generate checksums for verification
6. Create GitHub release
7. Publish Docker images to Docker Hub

---

## Configuration Files

### 1. Dependabot Configuration

**File**: `.github/dependabot.yml`

**Purpose**: Automated dependency updates

**Configured Package Ecosystems**:
- **NPM** (Server): Weekly updates for server dependencies
- **NPM** (Tests): Weekly updates for test dependencies
- **Docker**: Weekly base image updates
- **GitHub Actions**: Weekly action updates
- **PIP** (Firmware): Monthly PlatformIO updates

**Update Schedule**:
- NPM Server: Monday 3:00 AM
- NPM Tests: Monday 3:00 AM
- Docker: Tuesday 3:00 AM
- GitHub Actions: Wednesday 3:00 AM
- PIP: First Monday of month at 3:00 AM

**Settings**:
- Max open PRs: 5-10 depending on ecosystem
- Auto-merge: Disabled (requires manual review)
- Labels: Automatically applied for categorization
- Semantic versioning strategy

### 2. Codecov Configuration

**File**: `.github/codecov.yml`

**Purpose**: Code coverage reporting and thresholds

**Coverage Targets**:
- Project: 70% minimum
- Patch: 80% minimum
- Threshold: 2% variance allowed

**Flags**:
- `server-unit`: Unit test coverage
- `server-integration`: Integration test coverage

**Components**:
- Server Core
- SIP Module
- RTP Module
- API Module
- Database Layer
- Utilities

**Ignored Paths**:
- Test files
- Node modules
- Build artifacts
- Documentation

---

## Build Scripts

All scripts are located in the `scripts/` directory and are executable.

### 1. build-all-firmware.sh

**Purpose**: Build firmware for all ESP32 variants

**Usage**:
```bash
./scripts/build-all-firmware.sh [clean]
```

**Options**:
- `clean`: Clean build artifacts before building

**Features**:
- Checks PlatformIO installation
- Builds all firmware variants sequentially
- Reports firmware sizes
- Provides build summary
- Color-coded output for readability

**Exit Codes**:
- `0`: All builds successful
- `1`: One or more builds failed

### 2. run-all-tests.sh

**Purpose**: Run all test suites

**Usage**:
```bash
./scripts/run-all-tests.sh [options]
```

**Options**:
- `--unit`: Run only unit tests
- `--integration`: Run only integration tests
- `--e2e`: Run only E2E tests
- `--firmware`: Run only firmware tests
- `--coverage`: Generate coverage reports
- `--verbose`: Verbose output

**Features**:
- Automatically starts required services (PostgreSQL)
- Manages test dependencies
- Generates coverage reports
- Provides detailed test summary
- Color-coded output

**Exit Codes**:
- `0`: All tests passed
- `1`: One or more tests failed

### 3. deploy.sh

**Purpose**: Deploy the RoIP system

**Usage**:
```bash
./scripts/deploy.sh [environment] [options]
```

**Environments**:
- `development`: Development environment
- `staging`: Staging environment
- `production`: Production environment (default)

**Options**:
- `--docker`: Deploy using Docker Compose
- `--update-only`: Update existing deployment
- `--backup`: Create backup before deployment

**Features**:
- Environment validation
- Automatic .env file generation
- Database backup support
- Health checks after deployment
- Service status monitoring
- PM2 integration (if available)

**Exit Codes**:
- `0`: Deployment successful
- `1`: Deployment failed

### 4. release.sh

**Purpose**: Create a new release

**Usage**:
```bash
./scripts/release.sh <version> [options]
```

**Version Format**: `v1.0.0` or `v1.0.0-beta.1`

**Options**:
- `--skip-tests`: Skip running tests
- `--skip-build`: Skip building artifacts
- `--dry-run`: Show what would be done

**Features**:
- Version validation and formatting
- Runs full test suite
- Updates version numbers
- Builds all firmware variants
- Generates checksums
- Creates release archives
- Generates changelog
- Creates git tag
- Provides release summary

**Exit Codes**:
- `0`: Release successful
- `1`: Release failed

---

## Setup Instructions

### Prerequisites

1. **GitHub Repository Setup**
   - Repository with admin access
   - GitHub Actions enabled
   - Branch protection rules configured

2. **Required Software** (for local testing)
   - Node.js 18+
   - npm 9+
   - PlatformIO
   - Docker and Docker Compose
   - Git

### GitHub Secrets Configuration

Configure the following secrets in your repository settings:

**Required Secrets**:

```
DOCKERHUB_USERNAME        # Docker Hub username
DOCKERHUB_TOKEN          # Docker Hub access token
CODECOV_TOKEN           # Codecov upload token
```

**Optional Secrets**:

```
SNYK_TOKEN              # Snyk security scanning
GITLEAKS_LICENSE        # Gitleaks license key
```

### Setting Up Secrets

1. Go to repository Settings > Secrets and variables > Actions
2. Click "New repository secret"
3. Add each secret with its value

### Docker Hub Setup

1. Create Docker Hub account
2. Create access token:
   - Account Settings > Security > New Access Token
   - Copy token and add to GitHub secrets
3. Create repository: `esp-roip-server`

### Codecov Setup

1. Go to [codecov.io](https://codecov.io)
2. Sign in with GitHub
3. Add your repository
4. Copy upload token
5. Add token to GitHub secrets

### Enabling Workflows

1. Go to repository Actions tab
2. Enable Actions if disabled
3. Workflows will run automatically on triggers

---

## Usage Guide

### Running Workflows Manually

#### Firmware Build

```bash
# Via GitHub UI
Actions > Firmware Build > Run workflow
# Select environment or 'all'
```

#### Server Tests

```bash
# Via GitHub UI
Actions > Server Test > Run workflow
```

#### Security Scan

```bash
# Via GitHub UI
Actions > Security Scan > Run workflow
```

### Viewing Workflow Results

1. Go to repository Actions tab
2. Click on workflow run
3. View logs and artifacts
4. Download artifacts if needed

### Downloading Artifacts

1. Navigate to workflow run
2. Scroll to "Artifacts" section
3. Click artifact to download
4. Extract and use files

### Monitoring Build Status

#### Status Badges

Add to README.md:

```markdown
![Firmware Build](https://github.com/username/repo/workflows/Firmware%20Build/badge.svg)
![Server Test](https://github.com/username/repo/workflows/Server%20Test/badge.svg)
![Security Scan](https://github.com/username/repo/workflows/Security%20Scan/badge.svg)
```

#### GitHub Checks

- PRs show check status automatically
- Click "Details" to view logs
- Must pass before merging (if required)

---

## Local Testing

### Testing Workflows Locally

Use [act](https://github.com/nektos/act) to run workflows locally:

```bash
# Install act
brew install act  # macOS
# or
curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash

# Run specific workflow
act -j build-firmware
act -j test-unit

# Run with secrets
act -s GITHUB_TOKEN=xxx
```

### Running Build Scripts Locally

#### Build Firmware

```bash
# Build all variants
./scripts/build-all-firmware.sh

# Clean build
./scripts/build-all-firmware.sh clean
```

#### Run Tests

```bash
# Run all tests
./scripts/run-all-tests.sh

# Run specific test suite
./scripts/run-all-tests.sh --unit
./scripts/run-all-tests.sh --integration --coverage
```

#### Deploy Locally

```bash
# Deploy with Docker
./scripts/deploy.sh development --docker

# Update existing deployment
./scripts/deploy.sh production --docker --update-only
```

### Debugging Failed Builds

1. **Check Logs**
   - View workflow logs in GitHub Actions
   - Download artifacts for detailed information

2. **Run Locally**
   ```bash
   # Reproduce firmware build
   cd roip-firmware
   pio run -e esp32s3-roip

   # Reproduce server tests
   cd roip-server
   npm test
   ```

3. **Check Dependencies**
   ```bash
   # Verify PlatformIO
   pio --version

   # Verify Node.js
   node --version
   npm --version
   ```

---

## Release Process

### Creating a Release

#### 1. Prepare Release

```bash
# Ensure clean working directory
git status

# Pull latest changes
git pull origin main

# Run tests locally
./scripts/run-all-tests.sh
```

#### 2. Create Release

```bash
# Using release script
./scripts/release.sh v1.0.0

# Dry run first (recommended)
./scripts/release.sh v1.0.0 --dry-run

# Skip tests (not recommended)
./scripts/release.sh v1.0.0 --skip-tests
```

#### 3. Push Release

```bash
# Push changes
git push origin main

# Push tag
git push origin v1.0.0
```

#### 4. Monitor Release Workflow

1. Go to Actions > Release
2. Watch workflow progress
3. Verify all jobs complete successfully

#### 5. Verify Release

1. Check GitHub Releases page
2. Verify artifacts are uploaded
3. Test Docker image:
   ```bash
   docker pull username/esp-roip-server:v1.0.0
   docker run -it username/esp-roip-server:v1.0.0
   ```

### Release Versioning

Follow [Semantic Versioning](https://semver.org/):

- **Major** (v2.0.0): Breaking changes
- **Minor** (v1.1.0): New features, backward compatible
- **Patch** (v1.0.1): Bug fixes

#### Pre-release Tags

- Alpha: `v1.0.0-alpha.1`
- Beta: `v1.0.0-beta.1`
- RC: `v1.0.0-rc.1`

### Hotfix Releases

```bash
# Create hotfix branch
git checkout -b hotfix/1.0.1 v1.0.0

# Make fixes
# ... commit changes ...

# Create hotfix release
./scripts/release.sh v1.0.1

# Merge back to main
git checkout main
git merge hotfix/1.0.1
git push origin main
git push origin v1.0.1
```

---

## Troubleshooting

### Common Issues

#### 1. Firmware Build Fails

**Problem**: PlatformIO build errors

**Solutions**:
```bash
# Clean PlatformIO cache
pio run --target clean

# Update PlatformIO
pip install -U platformio

# Rebuild from scratch
rm -rf .pio
pio run
```

#### 2. Server Tests Fail

**Problem**: Database connection errors

**Solutions**:
```bash
# Check PostgreSQL
docker ps | grep postgres

# Restart PostgreSQL
docker restart roip-postgres

# Check environment variables
echo $DB_HOST
echo $DB_PORT
```

#### 3. Docker Build Fails

**Problem**: Image build errors

**Solutions**:
```bash
# Clean Docker cache
docker system prune -af

# Build without cache
docker build --no-cache -t esp-roip-server .

# Check Dockerfile syntax
docker build --check .
```

#### 4. Security Scan Failures

**Problem**: Vulnerabilities detected

**Solutions**:
```bash
# Update dependencies
npm audit fix

# Review vulnerabilities
npm audit

# Update specific package
npm update <package-name>
```

#### 5. Release Workflow Fails

**Problem**: Tag already exists

**Solutions**:
```bash
# Delete local tag
git tag -d v1.0.0

# Delete remote tag
git push origin :refs/tags/v1.0.0

# Recreate tag
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

### GitHub Actions Debugging

#### Enable Debug Logging

Add repository secrets:
```
ACTIONS_RUNNER_DEBUG=true
ACTIONS_STEP_DEBUG=true
```

#### View Detailed Logs

1. Re-run workflow with debug enabled
2. Download logs for offline analysis
3. Check specific step outputs

#### Workflow Dispatch Testing

```yaml
# Test workflow manually
on:
  workflow_dispatch:
    inputs:
      debug:
        description: 'Enable debug mode'
        required: false
        default: 'false'
```

---

## Best Practices

### Development Workflow

1. **Create Feature Branch**
   ```bash
   git checkout -b feature/new-feature
   ```

2. **Make Changes and Test Locally**
   ```bash
   ./scripts/run-all-tests.sh
   ```

3. **Commit with Conventional Commits**
   ```bash
   git commit -m "feat: add new SIP feature"
   git commit -m "fix: resolve audio sync issue"
   git commit -m "docs: update API documentation"
   ```

4. **Push and Create PR**
   ```bash
   git push origin feature/new-feature
   # Create PR via GitHub UI
   ```

5. **Review CI/CD Results**
   - Check all workflows pass
   - Review coverage reports
   - Fix any issues

6. **Merge After Approval**
   - Squash commits if needed
   - Delete feature branch

### Code Quality

1. **Write Tests**
   - Unit tests for all functions
   - Integration tests for APIs
   - E2E tests for critical paths

2. **Maintain Coverage**
   - Target 80% coverage
   - Review coverage reports
   - Add tests for uncovered code

3. **Security First**
   - Regular dependency updates
   - Review security scan results
   - Never commit secrets

4. **Documentation**
   - Update docs with code changes
   - Comment complex code
   - Maintain README files

### CI/CD Optimization

1. **Use Caching**
   - Cache dependencies
   - Cache build artifacts
   - Reduce build time

2. **Parallel Jobs**
   - Run independent jobs in parallel
   - Use matrix builds
   - Optimize workflow structure

3. **Artifact Management**
   - Set appropriate retention periods
   - Clean up old artifacts
   - Optimize artifact size

4. **Monitoring**
   - Monitor workflow performance
   - Track failure rates
   - Optimize slow steps

### Release Management

1. **Version Planning**
   - Plan releases in advance
   - Communicate breaking changes
   - Maintain changelog

2. **Testing**
   - Full test suite before release
   - Test on multiple platforms
   - Beta releases for major versions

3. **Documentation**
   - Update documentation before release
   - Include migration guides
   - Provide upgrade instructions

4. **Communication**
   - Announce releases
   - Provide release notes
   - Support users during upgrades

---

## Additional Resources

### Documentation

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [PlatformIO Documentation](https://docs.platformio.org/)
- [Docker Documentation](https://docs.docker.com/)
- [Codecov Documentation](https://docs.codecov.com/)

### Tools

- [act](https://github.com/nektos/act) - Run GitHub Actions locally
- [Dependabot](https://github.com/dependabot) - Automated dependency updates
- [Trivy](https://github.com/aquasecurity/trivy) - Security scanner
- [CodeQL](https://codeql.github.com/) - Code analysis

### Community

- GitHub Discussions
- Issue Tracker
- Contributing Guidelines
- Code of Conduct

---

## Support

For questions or issues with the CI/CD pipeline:

1. Check this documentation
2. Review workflow logs
3. Search existing issues
4. Create a new issue with:
   - Workflow name
   - Error messages
   - Steps to reproduce
   - Environment details

---

**Last Updated**: 2024-11-22
**Version**: 1.0.0
