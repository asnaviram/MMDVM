# CI/CD Pipeline Setup Guide

Complete guide for setting up and managing the Continuous Integration and Continuous Deployment pipelines for the ESP32 RoIP project.

## Table of Contents

- [Overview](#overview)
- [Pipeline Architecture](#pipeline-architecture)
- [Workflows](#workflows)
- [Setup Instructions](#setup-instructions)
- [Configuration](#configuration)
- [Monitoring and Maintenance](#monitoring-and-maintenance)
- [Troubleshooting](#troubleshooting)

## Overview

The ESP32 RoIP project uses GitHub Actions for comprehensive CI/CD automation, including:

- **Continuous Integration (CI)**: Automated testing, security scanning, and quality checks
- **Continuous Deployment (CD)**: Automated deployment to staging and production environments
- **Security Scanning**: Daily security audits and vulnerability assessments
- **Performance Testing**: Weekly performance regression tests and load testing

### Pipeline Benefits

- **Quality Assurance**: Every commit is tested across multiple Node.js versions and platforms
- **Early Detection**: Security issues and performance regressions caught before production
- **Automated Deployment**: Zero-downtime deployments with automatic rollback on failure
- **Compliance**: Comprehensive audit trails and security scanning
- **Developer Productivity**: Automated build and test feedback in minutes

## Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      GitHub Repository                       │
└───────────────────┬─────────────────────────────────────────┘
                    │
        ┌───────────┴──────────┬────────────┬─────────────┐
        │                      │            │             │
        ▼                      ▼            ▼             ▼
┌───────────────┐    ┌──────────────┐  ┌──────────┐  ┌─────────────┐
│  CI Pipeline  │    │   Security   │  │  Deploy  │  │ Performance │
│   (ci.yml)    │    │  (security-  │  │ (cd.yml) │  │ (perf-*.yml)│
│               │    │   scan.yml)  │  │          │  │             │
└───────┬───────┘    └──────┬───────┘  └────┬─────┘  └──────┬──────┘
        │                   │               │               │
        ├─ Lint             ├─ SAST        ├─ Staging      ├─ Load Test
        ├─ Unit Tests       ├─ DAST        ├─ Production   ├─ Stress Test
        ├─ Integration      ├─ Dependencies└─ Rollback     └─ Regression
        ├─ E2E Tests        ├─ Containers
        ├─ Coverage         ├─ IaC Scan
        └─ Build Firmware   └─ Secrets
```

## Workflows

### 1. Continuous Integration (`ci.yml`)

**Triggers:**
- Push to: `main`, `develop`, `feature/**`, `bugfix/**`
- Pull requests to: `main`, `develop`
- Manual dispatch

**Jobs:**

#### Lint & Code Quality
- ESLint checks
- Code formatting validation
- Generates lint reports

#### Security Audit
- NPM vulnerability scanning
- Critical/high severity vulnerability checks
- Security report generation

#### Unit Tests (Matrix)
- **Node.js Versions**: 18.x, 20.x, 22.x
- Full test suite execution
- Code coverage collection (Codecov integration)
- Coverage thresholds: 70% project, 80% patch

#### Integration Tests (Matrix)
- **Node.js Versions**: 18.x, 20.x, 22.x
- **Databases**: SQLite, PostgreSQL
- Database integration tests
- Service interaction tests

#### E2E Tests (Matrix)
- **Node.js Versions**: 18.x, 20.x, 22.x
- Full application workflow tests
- API endpoint validation
- SIP/RTP protocol tests

#### Firmware Build (Matrix)
- **ESP32 Variants**: esp32, esp32s2, esp32s3, esp32-wrover, esp32c3
- PlatformIO compilation
- Binary artifact generation
- Firmware size reporting

#### CI Summary
- Aggregate test results
- Generate comprehensive summary
- Artifact collection and reporting

**Artifacts Generated:**
- Code coverage reports (retained 7 days)
- Lint analysis results (retained 7 days)
- Firmware binaries (retained 30 days)
- Test reports (retained 7 days)

**Success Criteria:**
- All lint checks pass
- Security audit finds no critical/high vulnerabilities
- All tests pass on all Node.js versions
- Code coverage meets thresholds
- All firmware variants build successfully

### 2. Continuous Deployment (`cd.yml`)

**Triggers:**
- Push to `main` → Deploy to **Staging**
- Tag `v*.*.*` → Deploy to **Production**
- Manual dispatch (choose environment)

**Jobs:**

#### Determine Environment
- Analyzes trigger event
- Sets deployment target
- Configures deployment parameters

#### Build Docker Image
- Multi-stage Docker build
- Container registry push (GitHub Container Registry)
- SBOM (Software Bill of Materials) generation
- Image metadata tagging

#### Deploy to Staging
- Pre-deployment backup creation
- Ansible playbook execution
- Health check validation
- Smoke test execution
- Automatic rollback on failure

**Deployment Strategies Available:**
- **Standard**: Direct deployment with rollback
- **Blue-Green**: Zero-downtime switching (commented out, enable as needed)
- **Canary**: Gradual traffic shift (can be added)

#### Deploy to Production
- Multi-host deployment support
- Pre-deployment backup
- Cluster deployment via Ansible
- Comprehensive smoke tests
- SIP/WebSocket validation
- Automatic rollback capability
- Slack notifications

#### Post-Deployment Tests
- E2E smoke tests
- API integration validation
- Health endpoint checks
- Metrics endpoint verification

#### Deployment Summary
- Status reporting
- Artifact linking
- Next steps guidance

**Rollback Procedure:**
1. Detect deployment failure
2. Stop failed deployment
3. Restore from latest backup
4. Restart with previous version
5. Verify health checks
6. Send notifications

**Success Criteria:**
- Docker image builds successfully
- Deployment completes without errors
- All smoke tests pass
- Services respond to health checks
- No rollback triggered

### 3. Security Scanning (`security-scan.yml`)

**Triggers:**
- Push to `main`, `develop`
- Pull requests
- **Daily schedule**: 2:00 AM UTC
- Manual dispatch

**Jobs:**

#### NPM Security Audit
- Dependency vulnerability scanning
- CVSS severity assessment
- Fails on critical/high vulnerabilities

#### Dependency Review (PR only)
- License compliance checks
- Denies GPL-3.0, AGPL-3.0 licenses
- Severity threshold: moderate

#### CodeQL Analysis (SAST)
- **Languages**: JavaScript, C++
- Security-extended queries
- Security-and-quality analysis
- Automatic PR comments

#### Secret Scanning
- Gitleaks integration
- Detects hardcoded secrets
- Historical commit scanning
- Fails pipeline if secrets found

#### OWASP Dependency Check
- Comprehensive CVE database
- Project-wide dependency analysis
- HTML report generation

#### Snyk Scanning
- Comprehensive vulnerability database
- Container image scanning
- Dockerfile analysis
- Severity thresholds

#### DAST (Dynamic Testing)
- OWASP ZAP baseline scan
- Runtime vulnerability detection
- Active security testing
- API endpoint scanning

#### Container Security Scan
- Trivy vulnerability scanner
- CRITICAL, HIGH, MEDIUM severity levels
- SARIF format results
- GitHub Security integration

#### IaC Security Scan
- Checkov for IaC analysis
- Supports: Dockerfile, Kubernetes, Terraform
- tfsec for Terraform
- Best practice validation

#### License Compliance
- License compatibility checks
- License inventory generation
- Summary reporting

**Artifacts Generated:**
- Security audit reports (retained 30 days)
- SARIF security findings
- Container scan results
- IaC scan reports
- License compliance reports

**Success Criteria:**
- No secrets detected
- No critical/high NPM vulnerabilities
- CodeQL analysis passes
- DAST scan acceptable
- Container security acceptable

### 4. Performance Testing (`performance-test.yml`)

**Triggers:**
- **Weekly schedule**: Sunday 3:00 AM UTC
- Manual dispatch (custom parameters)

**Test Types:**
- **Load Testing**: Sustained load validation
- **Stress Testing**: Breaking point identification
- **Spike Testing**: Sudden load handling
- **Soak Testing**: Long-duration stability

**Jobs:**

#### Autocannon Benchmark
- HTTP load testing
- Request/second measurement
- Latency percentiles (P50, P95, P99)
- Throughput analysis

**Metrics Collected:**
- Requests per second
- Average latency
- P95, P99 latency
- Error rates
- Throughput

#### K6 Load Testing
- Gradual ramp-up scenarios
- Multi-stage load profiles
- Custom metrics collection
- Threshold validation

**Load Profile:**
```javascript
stages: [
  { duration: '2m', target: 50 },   // Ramp up
  { duration: '5m', target: 100 },  // Sustain
  { duration: '2m', target: 200 },  // Spike
  { duration: '3m', target: 100 },  // Recover
  { duration: '2m', target: 0 },    // Ramp down
]
```

**Thresholds:**
- P95 latency < 500ms
- Error rate < 10%
- Application error rate < 5%

#### K6 Stress Testing
- Aggressive load increase
- System limit identification
- Recovery validation

**Stress Profile:**
```javascript
stages: [
  { duration: '1m', target: 100 },   // Warm up
  { duration: '3m', target: 200 },   // Increase
  { duration: '3m', target: 400 },   // Heavy
  { duration: '3m', target: 600 },   // Stress
  { duration: '2m', target: 0 },     // Recovery
]
```

#### Performance Regression Analysis
- Baseline comparison
- Metric delta calculation
- Regression detection

**Regression Thresholds:**
- RPS decrease > 10%: FAIL
- Latency increase > 20%: FAIL
- Below absolute thresholds: FAIL

**Absolute Thresholds:**
- P95 Latency: < 200ms
- Requests/sec: > 500
- Error Rate: < 1%

**Artifacts Generated:**
- Autocannon benchmark results (retained 90 days)
- K6 test results (JSON + HTML) (retained 90 days)
- Performance regression reports (retained 90 days)

## Setup Instructions

### Prerequisites

1. **GitHub Repository Access**
   - Admin access to repository settings
   - Ability to create/manage secrets
   - Actions enabled for repository

2. **External Services** (Optional but Recommended)
   - Codecov account for coverage reports
   - Snyk account for enhanced security scanning
   - Slack workspace for notifications

3. **Deployment Infrastructure**
   - Staging environment server(s)
   - Production environment server(s)
   - Container registry access
   - Database servers

### Step 1: Configure GitHub Secrets

See [GITHUB_SECRETS.md](./GITHUB_SECRETS.md) for detailed secret configuration.

**Required Secrets:**

```bash
# Deployment
STAGING_SSH_KEY           # SSH private key for staging
STAGING_HOST              # Staging server hostname
STAGING_USER              # Staging server username
PRODUCTION_SSH_KEY        # SSH private key for production
PRODUCTION_HOST_1         # Production server 1 hostname
PRODUCTION_HOST_2         # Production server 2 hostname (if clustered)
PRODUCTION_USER           # Production server username

# External Services
CODECOV_TOKEN             # Codecov upload token
SNYK_TOKEN                # Snyk API token
SLACK_WEBHOOK             # Slack webhook URL

# Container Registry
GITHUB_TOKEN              # Automatically provided by GitHub Actions

# Kubernetes (if using K8s deployment)
KUBECONFIG_STAGING        # Staging cluster kubeconfig
KUBECONFIG_PRODUCTION     # Production cluster kubeconfig
```

### Step 2: Enable GitHub Actions

1. Go to repository **Settings** → **Actions** → **General**
2. Set **Actions permissions** to "Allow all actions and reusable workflows"
3. Set **Workflow permissions** to "Read and write permissions"
4. Enable **Allow GitHub Actions to create and approve pull requests**

### Step 3: Configure Branch Protection

**Main Branch Protection:**

```yaml
Branch: main
Protections:
  - Require pull request reviews (1 reviewer minimum)
  - Require status checks to pass:
    - CI Summary (ci.yml)
    - Security Summary (security-scan.yml)
    - Lint & Code Quality
    - Unit Tests (all Node versions)
    - Integration Tests
    - E2E Tests
  - Require branches to be up to date
  - Require conversation resolution
  - Do not allow bypassing settings
```

**Develop Branch Protection:**

```yaml
Branch: develop
Protections:
  - Require pull request reviews (1 reviewer)
  - Require status checks to pass:
    - CI Summary (ci.yml)
    - Lint & Code Quality
  - Require branches to be up to date
```

### Step 4: Configure Deployment Environments

1. Go to **Settings** → **Environments**

**Staging Environment:**
```yaml
Name: staging
Protection rules:
  - No required reviewers (auto-deploy from main)
Environment secrets:
  - STAGING_DATABASE_URL
  - STAGING_JWT_SECRET
```

**Production Environment:**
```yaml
Name: production
Protection rules:
  - Required reviewers: 2
  - Wait timer: 5 minutes
  - Deployment branches: tags matching v*.*.*
Environment secrets:
  - PRODUCTION_DATABASE_URL
  - PRODUCTION_JWT_SECRET
  - PRODUCTION_API_KEY
```

### Step 5: Configure Codecov Integration

1. Sign up at [codecov.io](https://codecov.io)
2. Add your repository
3. Copy the upload token
4. Add as `CODECOV_TOKEN` secret
5. Configure `.github/codecov.yml` (already included)

### Step 6: Configure Code Scanning

1. Go to **Security** → **Code scanning** → **Set up**
2. Enable **CodeQL Analysis** (done via workflow)
3. Configure security advisories
4. Enable Dependabot alerts
5. Enable secret scanning

### Step 7: Test the Pipelines

**Test CI Pipeline:**
```bash
# Create a test branch
git checkout -b test/ci-pipeline

# Make a small change
echo "# Testing CI" >> README.md

# Commit and push
git add README.md
git commit -m "test: CI pipeline verification"
git push origin test/ci-pipeline

# Create pull request and observe CI workflow
```

**Test CD Pipeline (Manual):**
```bash
# From GitHub UI:
# 1. Go to Actions → Continuous Deployment
# 2. Click "Run workflow"
# 3. Select environment: staging
# 4. Observe deployment workflow
```

**Test Security Scan:**
```bash
# Security scans run automatically daily
# To trigger manually:
# 1. Go to Actions → Security Scan
# 2. Click "Run workflow"
```

**Test Performance Testing:**
```bash
# Performance tests run automatically weekly
# To trigger manually:
# 1. Go to Actions → Performance Testing
# 2. Click "Run workflow"
# 3. Select test type: all
```

## Configuration

### Workflow Customization

#### Modify Test Matrix

Edit `.github/workflows/ci.yml`:

```yaml
# Add/remove Node.js versions
matrix:
  node-version: ['18.x', '20.x', '22.x', '23.x']  # Add new version

# Add/remove databases
matrix:
  database: ['sqlite', 'postgresql', 'mysql']  # Add MySQL
```

#### Adjust Performance Thresholds

Edit `.github/workflows/performance-test.yml`:

```yaml
env:
  PERFORMANCE_THRESHOLD_P95: 200   # Adjust P95 latency threshold
  PERFORMANCE_THRESHOLD_RPS: 1000  # Adjust RPS threshold
```

#### Modify Deployment Strategy

Edit `.github/workflows/cd.yml`:

```yaml
# Enable blue-green deployment
- name: Alternative - Blue-Green Deployment
  if: true  # Change from false to true
```

### Notification Configuration

#### Slack Notifications

Add Slack webhook URL to secrets, then customize notifications in `cd.yml`:

```yaml
- name: Notify deployment success
  run: |
    curl -X POST ${{ secrets.SLACK_WEBHOOK }} \
      -H 'Content-Type: application/json' \
      -d '{
        "text": "✅ Deployment successful",
        "channel": "#deployments",
        "username": "GitHub Actions"
      }'
```

#### Email Notifications

Configure email notifications in GitHub:
1. **Settings** → **Notifications**
2. Enable **GitHub Actions**
3. Configure email preferences

### Caching Strategy

Workflows use GitHub Actions cache for:
- NPM dependencies (`node_modules`)
- PlatformIO builds
- Docker layers

**Cache Optimization:**

```yaml
# Adjust cache keys for better hit rates
- uses: actions/cache@v4
  with:
    path: ~/.npm
    key: ${{ runner.os }}-npm-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-npm-
```

## Monitoring and Maintenance

### Monitoring Workflow Health

**GitHub Actions Dashboard:**
1. Navigate to **Actions** tab
2. View workflow runs
3. Check for failures
4. Review execution times

**Metrics to Monitor:**
- Workflow success rate
- Average execution time
- Queue time
- Concurrent job limits

### Workflow Analytics

View detailed analytics:
1. **Insights** → **Actions**
2. Review:
   - Workflow runs per day
   - Success/failure rates
   - Execution time trends
   - Most run workflows

### Artifact Management

**Retention Policies:**
- Test results: 7 days
- Security reports: 30 days
- Firmware binaries: 30 days
- Performance results: 90 days

**Storage Optimization:**
```bash
# Periodically review and clean old artifacts
# Settings → Actions → Artifact and log retention
# Adjust retention period as needed
```

### Security Best Practices

1. **Rotate Secrets Regularly**
   - Rotate deployment keys quarterly
   - Update API tokens annually
   - Review secret usage monthly

2. **Review Permissions**
   - Audit workflow permissions
   - Use least privilege principle
   - Limit GITHUB_TOKEN scope

3. **Monitor Security Alerts**
   - Check Security tab daily
   - Address Dependabot alerts promptly
   - Review CodeQL findings

4. **Audit Workflow Changes**
   - Require review for workflow file changes
   - Test workflow changes in separate branch
   - Document significant changes

### Performance Optimization

**Reduce Workflow Duration:**

1. **Parallelize Jobs**
   ```yaml
   jobs:
     test-unit:
       strategy:
         max-parallel: 10  # Increase parallelism
   ```

2. **Optimize Dependencies**
   ```yaml
   - run: npm ci --prefer-offline --no-audit
   ```

3. **Use Larger Runners**
   ```yaml
   runs-on: ubuntu-latest-8-cores  # If available
   ```

4. **Skip Redundant Steps**
   ```yaml
   if: github.event_name != 'schedule'  # Skip on scheduled runs
   ```

## Troubleshooting

### Common Issues

#### 1. CI Failures on Specific Node Version

**Symptom:** Tests pass on Node 20.x but fail on 18.x

**Solution:**
```bash
# Check for version-specific issues
nvm use 18
npm test

# Update package.json engines
"engines": {
  "node": ">=18.0.0"
}
```

#### 2. Security Scan False Positives

**Symptom:** Security scan fails due to known safe issues

**Solution:**
```yaml
# Add exception to npm audit
- run: npm audit --audit-level=high --production

# Or use audit-ci for more control
- run: npx audit-ci --moderate
```

#### 3. Deployment Failures

**Symptom:** Deployment fails with SSH connection errors

**Solutions:**
```bash
# Verify SSH key format
cat ~/.ssh/id_rsa | base64 -w 0

# Test SSH connection
ssh -i key.pem user@host

# Check SSH key permissions
chmod 600 ~/.ssh/id_rsa

# Verify known_hosts
ssh-keyscan -H hostname >> ~/.ssh/known_hosts
```

#### 4. Performance Test Regressions

**Symptom:** Performance tests suddenly fail with regressions

**Investigation:**
```bash
# Compare with previous successful run
# Download both result artifacts
# Check for infrastructure changes
# Review recent code changes
# Check resource usage during test
```

**Solutions:**
```yaml
# Adjust thresholds if legitimate change
env:
  PERFORMANCE_THRESHOLD_P95: 250  # Increase if warranted

# Or investigate code optimization
```

#### 5. Artifact Upload Failures

**Symptom:** "Unable to upload artifact" errors

**Solutions:**
```yaml
# Check artifact size limits (500 MB per file, 2 GB per run)
# Compress large artifacts
- run: tar -czf results.tar.gz results/

# Split large artifacts
- uses: actions/upload-artifact@v4
  with:
    name: results-part-1
    path: results/part1/
```

### Debug Mode

Enable debug logging for workflows:

**Via GitHub UI:**
1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Add repository secret:
   - Name: `ACTIONS_STEP_DEBUG`
   - Value: `true`

**In Workflow:**
```yaml
- name: Debug information
  run: |
    echo "Event: ${{ github.event_name }}"
    echo "Ref: ${{ github.ref }}"
    echo "SHA: ${{ github.sha }}"
    env | sort
```

### Getting Help

1. **Check Workflow Logs**
   - View detailed step output
   - Check error messages
   - Review timing information

2. **GitHub Actions Documentation**
   - [GitHub Actions Docs](https://docs.github.com/actions)
   - [Workflow Syntax](https://docs.github.com/actions/reference/workflow-syntax-for-github-actions)
   - [Security Hardening](https://docs.github.com/actions/security-guides/security-hardening-for-github-actions)

3. **Community Support**
   - [GitHub Community Forum](https://github.community)
   - Stack Overflow (tag: github-actions)
   - Project-specific issues

4. **Professional Support**
   - GitHub Support (if Enterprise)
   - Consulting services for CI/CD optimization

## Appendix

### Workflow File Locations

```
.github/
├── workflows/
│   ├── ci.yml                    # Continuous Integration
│   ├── cd.yml                    # Continuous Deployment
│   ├── security-scan.yml         # Security Scanning
│   ├── performance-test.yml      # Performance Testing
│   ├── firmware-build.yml        # Firmware Build (legacy)
│   ├── server-test.yml           # Server Testing (legacy)
│   ├── docker-build.yml          # Docker Build
│   └── release.yml               # Release Automation
├── codecov.yml                   # Codecov configuration
└── dependabot.yml                # Dependabot configuration
```

### Related Documentation

- [GitHub Secrets Configuration](./GITHUB_SECRETS.md)
- [Production Deployment Guide](./PRODUCTION_DEPLOYMENT.md)
- [Performance Tuning Guide](./PERFORMANCE_TUNING.md)
- [Security Best Practices](./SECURITY.md)
- [Runbook](./RUNBOOK.md)

### Changelog

- **2024-11**: Initial comprehensive CI/CD pipeline setup
  - Multi-version testing matrix
  - Enhanced security scanning (SAST/DAST)
  - Automated deployment with rollback
  - Performance regression testing
  - Comprehensive documentation

---

**Last Updated:** 2024-11-22
**Maintained By:** ESP32 RoIP Team
**Contact:** devops@roip.example.com
