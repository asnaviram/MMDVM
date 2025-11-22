# GitHub Secrets Configuration Guide

Complete guide for configuring GitHub Actions secrets and environment variables for the ESP32 RoIP CI/CD pipeline.

## Table of Contents

- [Overview](#overview)
- [Secret Types](#secret-types)
- [Required Secrets](#required-secrets)
- [Optional Secrets](#optional-secrets)
- [Environment-Specific Secrets](#environment-specific-secrets)
- [Setup Instructions](#setup-instructions)
- [Security Best Practices](#security-best-practices)
- [Secret Rotation](#secret-rotation)
- [Troubleshooting](#troubleshooting)

## Overview

GitHub Actions secrets are encrypted environment variables that allow secure storage of sensitive information needed by CI/CD workflows. This guide covers all secrets required for the ESP32 RoIP project's automated pipelines.

### Secret Scope Levels

1. **Repository Secrets** - Available to all workflows in the repository
2. **Environment Secrets** - Specific to deployment environments (staging, production)
3. **Organization Secrets** - Shared across multiple repositories (if applicable)

## Secret Types

### 1. Deployment Secrets
Used for automated deployment to staging and production environments.

### 2. External Service Secrets
Integration tokens for third-party services (Codecov, Snyk, Slack, etc.).

### 3. Container Registry Secrets
Credentials for pushing/pulling Docker images.

### 4. Database Secrets
Connection strings and credentials for test/production databases.

### 5. API Keys and Tokens
Service-specific authentication tokens.

## Required Secrets

### Deployment Secrets

#### `STAGING_SSH_KEY`
**Purpose:** SSH private key for authenticating to staging servers

**How to Generate:**
```bash
# Generate SSH key pair
ssh-keygen -t ed25519 -C "github-actions-staging" -f staging_key -N ""

# Copy public key to staging server
ssh-copy-id -i staging_key.pub user@staging-server

# Add private key to GitHub
cat staging_key | base64 -w 0
```

**Format:** Base64-encoded private key or raw private key
**Used In:** `cd.yml` (Continuous Deployment)

#### `STAGING_HOST`
**Purpose:** Hostname or IP address of staging server

**Example:** `staging.roip.example.com` or `192.168.1.100`
**Format:** String
**Used In:** `cd.yml`

#### `STAGING_USER`
**Purpose:** SSH username for staging server

**Example:** `deploy` or `ubuntu`
**Format:** String
**Used In:** `cd.yml`

#### `PRODUCTION_SSH_KEY`
**Purpose:** SSH private key for authenticating to production servers

**How to Generate:**
```bash
# Generate production SSH key (higher security)
ssh-keygen -t ed25519 -C "github-actions-production" -f production_key -N "" -a 100

# Copy to production servers
for host in prod1 prod2; do
  ssh-copy-id -i production_key.pub user@$host
done

# Add private key to GitHub
cat production_key
```

**Format:** Private key (PEM format)
**Used In:** `cd.yml`
**Security:** Use strong passphrase and rotate regularly

#### `PRODUCTION_HOST_1`
**Purpose:** Primary production server hostname

**Example:** `prod1.roip.example.com`
**Format:** String
**Used In:** `cd.yml`

#### `PRODUCTION_HOST_2`
**Purpose:** Secondary production server hostname (for clustered deployments)

**Example:** `prod2.roip.example.com`
**Format:** String
**Used In:** `cd.yml`
**Optional:** If running single-server setup

#### `PRODUCTION_USER`
**Purpose:** SSH username for production servers

**Example:** `deploy`
**Format:** String
**Used In:** `cd.yml`

### External Service Secrets

#### `CODECOV_TOKEN`
**Purpose:** Upload token for Codecov code coverage reports

**How to Obtain:**
1. Sign up at https://codecov.io
2. Add your repository
3. Go to Settings → Repository Upload Token
4. Copy the token

**Example:** `a1b2c3d4-e5f6-7890-abcd-ef1234567890`
**Format:** UUID string
**Used In:** `ci.yml`, `server-test.yml`

#### `SNYK_TOKEN`
**Purpose:** API token for Snyk security scanning

**How to Obtain:**
1. Sign up at https://snyk.io
2. Go to Account Settings → API Token
3. Generate or copy existing token

**Example:** `a1b2c3d4-e5f6-7890-abcd-ef1234567890`
**Format:** UUID string
**Used In:** `security-scan.yml`
**Optional:** Can be skipped if not using Snyk

#### `SLACK_WEBHOOK`
**Purpose:** Webhook URL for Slack deployment notifications

**How to Obtain:**
1. Go to https://api.slack.com/apps
2. Create new app or use existing
3. Enable Incoming Webhooks
4. Add New Webhook to Workspace
5. Copy Webhook URL

**Example:** `https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX`
**Format:** URL string
**Used In:** `cd.yml`
**Optional:** Can be removed from workflows if not needed

#### `GITLEAKS_LICENSE`
**Purpose:** License key for Gitleaks secret scanning (optional)

**How to Obtain:**
- Gitleaks is free and open-source
- License only needed for commercial features
- Can be omitted for basic usage

**Format:** License string
**Used In:** `security-scan.yml`
**Optional:** Yes

### Container Registry Secrets

#### `GITHUB_TOKEN`
**Purpose:** Authentication for GitHub Container Registry

**How to Obtain:**
- Automatically provided by GitHub Actions
- No manual configuration needed

**Format:** JWT token (auto-generated)
**Used In:** `cd.yml`, `docker-build.yml`
**Note:** This is automatically available as `${{ secrets.GITHUB_TOKEN }}`

## Optional Secrets

### Kubernetes Deployment (if using K8s)

#### `KUBECONFIG_STAGING`
**Purpose:** Kubernetes configuration for staging cluster

**How to Generate:**
```bash
# Get kubeconfig from staging cluster
kubectl config view --minify --flatten > staging-kubeconfig.yaml

# Base64 encode for GitHub secret
cat staging-kubeconfig.yaml | base64 -w 0
```

**Format:** Base64-encoded kubeconfig YAML
**Used In:** `cd.yml` (when Kubernetes deployment is enabled)

#### `KUBECONFIG_PRODUCTION`
**Purpose:** Kubernetes configuration for production cluster

**How to Generate:**
```bash
# Get kubeconfig from production cluster
kubectl config view --minify --flatten > production-kubeconfig.yaml

# Encode for secret
cat production-kubeconfig.yaml | base64 -w 0
```

**Format:** Base64-encoded kubeconfig YAML
**Used In:** `cd.yml` (when Kubernetes deployment is enabled)

### Database Credentials (if needed)

#### `TEST_DATABASE_URL`
**Purpose:** Database connection string for integration tests

**Example:** `postgresql://user:password@localhost:5432/roip_test`
**Format:** Connection URL string
**Used In:** `ci.yml`, `server-test.yml`
**Note:** Usually uses PostgreSQL service in workflow, so this is optional

## Environment-Specific Secrets

Environment secrets are scoped to specific deployment environments (staging, production).

### Staging Environment Secrets

Navigate to: **Settings → Environments → staging → Add secret**

#### `STAGING_DATABASE_URL`
**Purpose:** Production database connection for staging

**Example:** `postgresql://roip_staging:password@staging-db.example.com:5432/roip_staging`
**Format:** Connection URL string
**Security:** Use read-write user with limited permissions

#### `STAGING_JWT_SECRET`
**Purpose:** JWT signing secret for staging authentication

**How to Generate:**
```bash
openssl rand -base64 32
```

**Example:** `xK8mQ9vR3pN7wB2yT5gH1jL4fD6sA8cE9uI0oP3mN7vB2xK5`
**Format:** Base64 string (minimum 32 characters)
**Security:** Different from production secret

#### `STAGING_API_KEY`
**Purpose:** API key for external service integrations in staging

**Format:** String
**Usage:** Application-specific

### Production Environment Secrets

Navigate to: **Settings → Environments → production → Add secret**

#### `PRODUCTION_DATABASE_URL`
**Purpose:** Production database connection string

**Example:** `postgresql://roip_prod:password@prod-db.example.com:5432/roip_production`
**Format:** Connection URL string
**Security:** Use strong password, SSL required, rotate regularly

#### `PRODUCTION_JWT_SECRET`
**Purpose:** JWT signing secret for production authentication

**How to Generate:**
```bash
# Generate cryptographically secure secret
openssl rand -base64 48
```

**Example:** `kL9mR8vQ2pN7wB4yT6gH3jL5fD7sA9cE1uI2oP5mN8vB3xK7rT4gH6`
**Format:** Base64 string (minimum 48 characters recommended)
**Security:** CRITICAL - Never expose, rotate quarterly

#### `PRODUCTION_API_KEY`
**Purpose:** Production API keys for external services

**Format:** String
**Security:** Environment-specific, rotate monthly

#### `PRODUCTION_ENCRYPTION_KEY`
**Purpose:** Data encryption key for sensitive data at rest

**How to Generate:**
```bash
# Generate AES-256 encryption key
openssl rand -base64 32
```

**Format:** Base64 string (32 bytes for AES-256)
**Security:** CRITICAL - Store backup in secure location

## Setup Instructions

### Step 1: Access Repository Settings

1. Navigate to your GitHub repository
2. Click **Settings** (top menu)
3. In left sidebar, click **Secrets and variables** → **Actions**

### Step 2: Add Repository Secrets

For each required secret:

1. Click **New repository secret**
2. Enter **Name** (exactly as shown in this guide)
3. Enter **Value** (the actual secret value)
4. Click **Add secret**

**Example:**
```
Name: STAGING_SSH_KEY
Value: [paste SSH private key content]
```

### Step 3: Configure Environment Secrets

1. Go to **Settings** → **Environments**
2. Click **New environment** (if not exists)
3. Enter environment name: `staging` or `production`
4. Click **Configure environment**
5. Under **Environment secrets**, click **Add secret**
6. Enter name and value
7. Click **Add secret**

### Step 4: Set Environment Protection Rules

**For Production:**
1. Enable **Required reviewers**
2. Add reviewer usernames (minimum 2 recommended)
3. Enable **Wait timer** (5 minutes recommended)
4. Under **Deployment branches**, select **Protected branches only**
5. Add **Custom deployment protection rules** if needed

**For Staging:**
1. Can be left without protection (auto-deploy from main)
2. Or add single reviewer for safety

### Step 5: Verify Secret Configuration

Create a test workflow to verify secrets are accessible:

```yaml
name: Test Secrets
on: workflow_dispatch

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Check secrets
        run: |
          echo "Checking secrets..."
          if [ -z "${{ secrets.STAGING_SSH_KEY }}" ]; then
            echo "❌ STAGING_SSH_KEY not set"
            exit 1
          fi
          echo "✅ STAGING_SSH_KEY is set"

          if [ -z "${{ secrets.CODECOV_TOKEN }}" ]; then
            echo "⚠️  CODECOV_TOKEN not set (optional)"
          else
            echo "✅ CODECOV_TOKEN is set"
          fi
```

### Step 6: Test Deployment Secrets

Test SSH connectivity:

```bash
# Test staging SSH key
ssh -i staging_key $STAGING_USER@$STAGING_HOST "echo 'Connection successful'"

# Test production SSH key
ssh -i production_key $PRODUCTION_USER@$PRODUCTION_HOST_1 "echo 'Connection successful'"
```

## Security Best Practices

### 1. Principle of Least Privilege

- Create dedicated deployment users with minimal permissions
- Use separate SSH keys for staging and production
- Limit database user permissions to only what's needed

### 2. Secret Rotation

**Recommended Rotation Schedule:**
- **SSH Keys:** Every 90 days
- **JWT Secrets:** Every 90 days
- **API Keys:** Every 180 days
- **Database Passwords:** Every 180 days

### 3. Secret Storage

- **Never** commit secrets to repository
- **Never** log secret values in workflows
- **Never** expose secrets in public artifacts
- Use GitHub's encrypted secret storage exclusively

### 4. Access Control

- Limit who can modify repository secrets
- Require reviews for workflow file changes
- Audit secret access logs regularly
- Use environment protection rules for production

### 5. Secret Masking

GitHub automatically masks secrets in logs. Verify masking works:

```yaml
- name: Test secret masking
  run: |
    echo "Secret value: ${{ secrets.JWT_SECRET }}"
    # Output will show: Secret value: ***
```

### 6. Secure Secret Generation

Always use cryptographically secure random generation:

```bash
# Good: Cryptographically secure
openssl rand -base64 32

# Bad: Not secure
echo "my-secret-key"
```

### 7. Multi-Factor Authentication

Enable 2FA for all accounts that can access secrets:
- GitHub account administrators
- Deployment server access
- External service accounts (Codecov, Snyk, etc.)

### 8. Secret Backup

Maintain secure offline backups of critical secrets:
- Use encrypted password manager (1Password, LastPass, etc.)
- Store in encrypted vault
- Document recovery procedures
- Test backup restoration process

## Secret Rotation

### Rotating SSH Keys

1. **Generate new key:**
   ```bash
   ssh-keygen -t ed25519 -C "github-actions-new" -f new_key -N ""
   ```

2. **Add new public key to servers:**
   ```bash
   ssh-copy-id -i new_key.pub user@server
   ```

3. **Update GitHub secret:**
   - Go to Settings → Secrets
   - Edit existing secret
   - Paste new private key
   - Click Update secret

4. **Test deployment:**
   - Trigger manual deployment
   - Verify success

5. **Remove old public key from servers:**
   ```bash
   ssh user@server
   # Edit ~/.ssh/authorized_keys
   # Remove old key line
   ```

### Rotating JWT Secrets

**⚠️ WARNING:** Rotating JWT secrets will invalidate all existing tokens!

1. **Generate new secret:**
   ```bash
   openssl rand -base64 48
   ```

2. **Schedule maintenance window:**
   - Notify users of downtime
   - Plan for ~15 minutes downtime

3. **Update environment secret:**
   - Settings → Environments → production
   - Update `PRODUCTION_JWT_SECRET`

4. **Deploy with new secret:**
   - Tag new release
   - Monitor deployment

5. **Verify:**
   - Test authentication
   - Check user sessions
   - Monitor error logs

### Rotating Database Passwords

1. **Create new database user:**
   ```sql
   CREATE USER roip_new WITH PASSWORD 'new_secure_password';
   GRANT ALL ON roip_production TO roip_new;
   ```

2. **Update connection string:**
   ```
   postgresql://roip_new:new_secure_password@host:5432/db
   ```

3. **Update GitHub environment secret:**
   - Update `PRODUCTION_DATABASE_URL`

4. **Deploy and verify:**
   - Deploy with new credentials
   - Monitor database connections
   - Check application logs

5. **Remove old user:**
   ```sql
   DROP USER roip_old;
   ```

## Troubleshooting

### Issue: Secret Not Found in Workflow

**Symptom:**
```
Error: Secret STAGING_SSH_KEY is not defined
```

**Solutions:**
1. Verify secret name exactly matches (case-sensitive)
2. Check secret is in correct scope (repository vs environment)
3. For environment secrets, verify environment name matches
4. Ensure workflow has permission to access environment

### Issue: SSH Key Authentication Failed

**Symptom:**
```
Permission denied (publickey)
```

**Solutions:**
```bash
# 1. Verify public key is on server
ssh user@server "cat ~/.ssh/authorized_keys"

# 2. Check private key format
cat key | head -1
# Should be: -----BEGIN OPENSSH PRIVATE KEY-----

# 3. Test key locally
ssh -i key user@server

# 4. Check key permissions (if testing locally)
chmod 600 key

# 5. Verify correct username
echo $STAGING_USER
```

### Issue: Database Connection Failed

**Symptom:**
```
Error: connect ECONNREFUSED
```

**Solutions:**
1. Verify connection string format
2. Check database host is accessible from GitHub Actions
3. Verify database port is open
4. Check database credentials are correct
5. Ensure SSL/TLS settings if required

### Issue: JWT Validation Failed

**Symptom:**
```
Error: invalid signature
```

**Solutions:**
1. Verify JWT_SECRET matches between deployment and application
2. Check secret wasn't truncated during copy
3. Ensure no extra whitespace in secret value
4. Verify secret encoding (base64, hex, etc.)

### Issue: Codecov Upload Failed

**Symptom:**
```
Error: Could not upload coverage data
```

**Solutions:**
1. Verify CODECOV_TOKEN is correct
2. Check repository is added to Codecov account
3. Verify coverage file format (lcov.info)
4. Check Codecov service status
5. Review Codecov upload logs for specific error

### Issue: Secret Value Contains Special Characters

**Problem:** Shell interpretation of special characters

**Solution:**
```yaml
# Use quotes and proper escaping
- run: echo '${{ secrets.PASSWORD }}'

# Or use environment variable
- env:
    PASSWORD: ${{ secrets.PASSWORD }}
  run: echo "$PASSWORD"
```

### Debug: Verify Secret is Set

```yaml
- name: Check if secret exists
  run: |
    if [ -z "${{ secrets.STAGING_SSH_KEY }}" ]; then
      echo "Secret is NOT set"
      exit 1
    else
      echo "Secret is set (length: ${#STAGING_SSH_KEY})"
    fi
  env:
    STAGING_SSH_KEY: ${{ secrets.STAGING_SSH_KEY }}
```

## Appendix

### Complete Secret Checklist

**Required for CI/CD:**
- [ ] `STAGING_SSH_KEY`
- [ ] `STAGING_HOST`
- [ ] `STAGING_USER`
- [ ] `PRODUCTION_SSH_KEY`
- [ ] `PRODUCTION_HOST_1`
- [ ] `PRODUCTION_USER`

**Recommended:**
- [ ] `CODECOV_TOKEN`
- [ ] `SLACK_WEBHOOK`
- [ ] `SNYK_TOKEN`

**Environment Secrets - Staging:**
- [ ] `STAGING_DATABASE_URL`
- [ ] `STAGING_JWT_SECRET`

**Environment Secrets - Production:**
- [ ] `PRODUCTION_DATABASE_URL`
- [ ] `PRODUCTION_JWT_SECRET`
- [ ] `PRODUCTION_API_KEY`

**Optional (if using):**
- [ ] `KUBECONFIG_STAGING`
- [ ] `KUBECONFIG_PRODUCTION`
- [ ] `GITLEAKS_LICENSE`

### Secret Value Templates

**SSH Key:**
```
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
[... key content ...]
-----END OPENSSH PRIVATE KEY-----
```

**JWT Secret:**
```
xK8mQ9vR3pN7wB2yT5gH1jL4fD6sA8cE9uI0oP3mN7vB2xK5rT4gH6jL9mR8vQ2pN
```

**Database URL:**
```
postgresql://username:password@hostname:5432/database?sslmode=require
```

**Kubeconfig:**
```yaml
apiVersion: v1
kind: Config
clusters:
- cluster:
    certificate-authority-data: <base64-cert>
    server: https://kubernetes.example.com:6443
  name: production
contexts:
- context:
    cluster: production
    user: github-actions
  name: production
current-context: production
users:
- name: github-actions
  user:
    token: <token>
```

### Related Documentation

- [CI/CD Setup Guide](./CI_CD_SETUP.md)
- [Production Deployment](./PRODUCTION_DEPLOYMENT.md)
- [Security Best Practices](./SECURITY.md)

### Support and Contact

For questions about secret configuration:
- Review this documentation
- Check GitHub Actions logs for specific errors
- Consult [GitHub Secrets Documentation](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- Contact: devops@roip.example.com

---

**Last Updated:** 2024-11-22
**Version:** 1.0
**Maintained By:** ESP32 RoIP DevOps Team
