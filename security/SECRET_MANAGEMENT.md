# Secret Management Guide

## Table of Contents
1. [Overview](#overview)
2. [What Are Secrets?](#what-are-secrets)
3. [Secret Storage Best Practices](#secret-storage-best-practices)
4. [Environment Variables](#environment-variables)
5. [Vault Integration](#vault-integration)
6. [Secret Rotation](#secret-rotation)
7. [Secret Detection & Prevention](#secret-detection--prevention)
8. [Production Deployment](#production-deployment)
9. [Emergency Procedures](#emergency-procedures)

---

## Overview

This guide provides comprehensive instructions for managing secrets in the ESP32 RoIP system. Proper secret management is critical for maintaining system security.

### Security Principles

1. **Never commit secrets to version control**
2. **Use environment-specific secrets**
3. **Rotate secrets regularly**
4. **Audit secret access**
5. **Encrypt secrets at rest and in transit**

---

## What Are Secrets?

Secrets are sensitive data that must be protected from unauthorized access:

### Application Secrets
- **JWT Secret:** Used for signing authentication tokens
- **API Keys:** Third-party service credentials
- **Encryption Keys:** For data encryption
- **Session Secrets:** For session management

### Database Credentials
- **Database Passwords:** PostgreSQL/SQLite access credentials
- **Connection Strings:** Complete database URIs
- **Admin Credentials:** Database superuser passwords

### Service Credentials
- **SIP Passwords:** User authentication credentials
- **STUN/TURN Credentials:** NAT traversal service credentials
- **SMTP Credentials:** Email service passwords
- **Cloud Storage Keys:** AWS S3, Azure Blob credentials

### TLS/SSL Certificates
- **Private Keys:** Certificate private keys
- **Certificate Bundles:** CA certificates
- **Keystores:** Java keystores with passwords

### ESP32 Firmware Secrets
- **WiFi Credentials:** SSID and password
- **OTA Update Keys:** Firmware signing keys
- **Device Certificates:** Per-device TLS certificates

---

## Secret Storage Best Practices

### ❌ DON'T

```javascript
// NEVER hardcode secrets in source code
const JWT_SECRET = 'my-secret-key-12345';  // ❌ BAD

// NEVER commit .env files
// .env in git repository  // ❌ BAD

// NEVER log secrets
console.log('Password:', password);  // ❌ BAD

// NEVER put secrets in comments
// Database password: mypassword123  // ❌ BAD

// NEVER use default/weak secrets
const secret = 'password';  // ❌ BAD
const secret = '123456';    // ❌ BAD
const secret = 'change-me-in-production';  // ❌ BAD
```

### ✅ DO

```javascript
// Use environment variables
const JWT_SECRET = process.env.JWT_SECRET;  // ✅ GOOD

// Use secrets management systems
const secret = await vault.getSecret('jwt-secret');  // ✅ GOOD

// Generate strong, random secrets
const secret = crypto.randomBytes(32).toString('hex');  // ✅ GOOD

// Validate secrets exist before using
if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required');
}
```

---

## Environment Variables

### Local Development

#### 1. Create .env File

```bash
# Create .env file (NEVER commit this)
cat > .env <<EOF
# Server Configuration
NODE_ENV=development
PORT=8080

# Security
JWT_SECRET=$(openssl rand -base64 32)
JWT_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Database
DB_TYPE=sqlite
DB_FILE=./data/roip-dev.db

# PostgreSQL (for production)
# DB_TYPE=postgresql
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=roip_server
# DB_USER=roip_user
# DB_PASSWORD=$(openssl rand -base64 24)

# SIP Configuration
SIP_REALM=roip.local
SIP_PORT=5060

# RTP Configuration
RTP_PORT_MIN=10000
RTP_PORT_MAX=10100

# STUN Server
STUN_ENABLED=true
STUN_PORT=3478

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Logging
LOG_LEVEL=debug
EOF
```

#### 2. Add to .gitignore

```bash
# Ensure .env is ignored
echo ".env" >> .gitignore
echo ".env.*" >> .gitignore
echo "*.pem" >> .gitignore
echo "*.key" >> .gitignore
```

#### 3. Create .env.example

```bash
# Create template for other developers
cat > .env.example <<EOF
# Server Configuration
NODE_ENV=development
PORT=8080

# Security (Generate these values - DO NOT use these examples!)
JWT_SECRET=<generate-with-openssl-rand-base64-32>
JWT_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Database
DB_TYPE=sqlite
DB_FILE=./data/roip-dev.db

# PostgreSQL (for production)
# DB_TYPE=postgresql
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=roip_server
# DB_USER=roip_user
# DB_PASSWORD=<generate-strong-password>

# Add all other required variables...
EOF
```

### Loading Environment Variables

```javascript
// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

// Validate required secrets
const requiredEnvVars = [
    'JWT_SECRET',
    'DB_HOST',
    'DB_PASSWORD',
];

for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
    }
}

// Use environment variables
const config = {
    jwt: {
        secret: process.env.JWT_SECRET,
        expiry: process.env.JWT_EXPIRY || '15m',
    },
    database: {
        host: process.env.DB_HOST,
        password: process.env.DB_PASSWORD,
    },
};
```

### Environment Variable Validation

```javascript
// config/validator.js
import Joi from 'joi';

const envSchema = Joi.object({
    NODE_ENV: Joi.string().valid('development', 'production', 'test').required(),
    PORT: Joi.number().port().default(8080),

    // Security
    JWT_SECRET: Joi.string().min(32).required(),
    JWT_EXPIRY: Joi.string().default('15m'),

    // Database
    DB_TYPE: Joi.string().valid('sqlite', 'postgresql').required(),
    DB_PASSWORD: Joi.string().when('DB_TYPE', {
        is: 'postgresql',
        then: Joi.required(),
    }),

    // Add all other required variables
}).unknown();

const { error, value: validatedEnv } = envSchema.validate(process.env);

if (error) {
    throw new Error(`Environment validation error: ${error.message}`);
}

export default validatedEnv;
```

---

## Vault Integration

### HashiCorp Vault

#### 1. Install Vault Client

```bash
npm install node-vault
```

#### 2. Configure Vault Client

```javascript
// config/vault.js
import vault from 'node-vault';

const vaultClient = vault({
    apiVersion: 'v1',
    endpoint: process.env.VAULT_ADDR || 'http://127.0.0.1:8200',
    token: process.env.VAULT_TOKEN,
});

/**
 * Get secret from Vault
 */
export async function getSecret(path) {
    try {
        const result = await vaultClient.read(path);
        return result.data.data;
    } catch (error) {
        console.error(`Failed to read secret from Vault: ${error.message}`);
        throw error;
    }
}

/**
 * Write secret to Vault
 */
export async function setSecret(path, data) {
    try {
        await vaultClient.write(path, { data });
        console.log(`Secret written to Vault: ${path}`);
    } catch (error) {
        console.error(`Failed to write secret to Vault: ${error.message}`);
        throw error;
    }
}

/**
 * Get database credentials from Vault
 */
export async function getDatabaseCredentials() {
    const secrets = await getSecret('secret/data/roip/database');
    return {
        host: secrets.host,
        port: secrets.port,
        database: secrets.database,
        username: secrets.username,
        password: secrets.password,
    };
}
```

#### 3. Use Vault in Application

```javascript
// server.js
import { getSecret } from './config/vault.js';

async function initializeServer() {
    // Get secrets from Vault
    const jwtSecret = await getSecret('secret/data/roip/jwt');
    const dbCreds = await getSecret('secret/data/roip/database');

    const config = {
        jwt: {
            secret: jwtSecret.secret,
        },
        database: {
            host: dbCreds.host,
            password: dbCreds.password,
        },
    };

    // Start server with config
    startServer(config);
}
```

#### 4. Vault Setup

```bash
# Start Vault dev server (development only)
vault server -dev

# Set environment variables
export VAULT_ADDR='http://127.0.0.1:8200'
export VAULT_TOKEN='your-vault-token'

# Write secrets to Vault
vault kv put secret/roip/jwt secret=$(openssl rand -base64 32)
vault kv put secret/roip/database \
    host=localhost \
    port=5432 \
    database=roip_server \
    username=roip_user \
    password=$(openssl rand -base64 24)

# Read secrets from Vault
vault kv get secret/roip/jwt
```

### AWS Secrets Manager

```javascript
// config/aws-secrets.js
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({
    region: process.env.AWS_REGION || 'us-east-1',
});

export async function getSecret(secretName) {
    try {
        const response = await client.send(
            new GetSecretValueCommand({
                SecretId: secretName,
            })
        );

        if (response.SecretString) {
            return JSON.parse(response.SecretString);
        } else {
            return Buffer.from(response.SecretBinary, 'base64').toString('ascii');
        }
    } catch (error) {
        console.error(`Failed to retrieve secret ${secretName}:`, error);
        throw error;
    }
}

// Usage
const dbCredentials = await getSecret('roip/database/credentials');
```

### Azure Key Vault

```javascript
// config/azure-secrets.js
import { SecretClient } from '@azure/keyvault-secrets';
import { DefaultAzureCredential } from '@azure/identity';

const credential = new DefaultAzureCredential();
const vaultUrl = process.env.AZURE_KEY_VAULT_URL;
const client = new SecretClient(vaultUrl, credential);

export async function getSecret(secretName) {
    try {
        const secret = await client.getSecret(secretName);
        return secret.value;
    } catch (error) {
        console.error(`Failed to retrieve secret ${secretName}:`, error);
        throw error;
    }
}

// Usage
const jwtSecret = await getSecret('jwt-secret');
```

---

## Secret Rotation

### Why Rotate Secrets?

- Limit exposure window if compromised
- Comply with security policies
- Reduce impact of insider threats
- Meet compliance requirements

### Rotation Schedule

| Secret Type | Rotation Frequency |
|-------------|-------------------|
| JWT Secret | 90 days |
| Database Password | 90 days |
| API Keys | 90-180 days |
| TLS Certificates | Before expiry (typically 90 days for Let's Encrypt) |
| SIP Passwords | 180 days or on employee departure |

### JWT Secret Rotation

```javascript
// utils/jwt-rotation.js
import jwt from 'jsonwebtoken';

class JWTRotation {
    constructor() {
        this.currentSecret = process.env.JWT_SECRET;
        this.previousSecret = process.env.JWT_SECRET_PREVIOUS;
    }

    /**
     * Verify token with current and previous secret
     */
    verify(token) {
        try {
            // Try current secret first
            return jwt.verify(token, this.currentSecret);
        } catch (error) {
            // Fall back to previous secret during rotation period
            if (this.previousSecret) {
                try {
                    return jwt.verify(token, this.previousSecret);
                } catch (previousError) {
                    throw error; // Throw original error
                }
            }
            throw error;
        }
    }

    /**
     * Sign token with current secret
     */
    sign(payload, options) {
        return jwt.sign(payload, this.currentSecret, options);
    }
}

export default new JWTRotation();
```

### Database Password Rotation

```bash
#!/bin/bash
# scripts/rotate-db-password.sh

set -e

echo "Rotating database password..."

# Generate new password
NEW_PASSWORD=$(openssl rand -base64 24)

# Update database
psql -U postgres -c "ALTER USER roip_user WITH PASSWORD '$NEW_PASSWORD';"

# Update Vault or secrets manager
vault kv put secret/roip/database password="$NEW_PASSWORD"

# Restart application to pick up new password
systemctl restart roip-server

echo "Database password rotated successfully"
```

### Automated Rotation

```javascript
// services/secret-rotation.js
import cron from 'node-cron';
import { rotateJWTSecret, rotateDatabasePassword } from './rotation-handlers.js';

/**
 * Schedule automated secret rotation
 */
export function scheduleSecretRotation() {
    // Rotate JWT secret monthly
    cron.schedule('0 0 1 * *', async () => {
        console.log('Starting JWT secret rotation...');
        await rotateJWTSecret();
    });

    // Rotate database password quarterly
    cron.schedule('0 0 1 */3 *', async () => {
        console.log('Starting database password rotation...');
        await rotateDatabasePassword();
    });

    console.log('Secret rotation scheduled');
}
```

---

## Secret Detection & Prevention

### Pre-Commit Hooks

#### 1. Install git-secrets

```bash
# Install git-secrets
git clone https://github.com/awslabs/git-secrets.git
cd git-secrets
make install

# Configure for repository
cd /path/to/roip
git secrets --install
git secrets --register-aws
```

#### 2. Custom Patterns

```bash
# Add custom patterns
git secrets --add 'JWT_SECRET.*=.*'
git secrets --add 'DB_PASSWORD.*=.*'
git secrets --add '-----BEGIN (RSA|DSA|EC) PRIVATE KEY-----'
```

#### 3. Scan History

```bash
# Scan git history for secrets
git secrets --scan-history
```

### GitHub Secret Scanning

Enable secret scanning in repository settings:
- Settings → Security & analysis
- Enable "Secret scanning"
- Enable "Secret scanning push protection"

### Automated Detection

```javascript
// scripts/detect-secrets.js
import { execSync } from 'child_process';
import fs from 'fs';

const PATTERNS = [
    /JWT_SECRET\s*=\s*['"]([^'"]+)['"]/,
    /password\s*=\s*['"]([^'"]+)['"]/,
    /api[_-]?key\s*=\s*['"]([^'"]+)['"]/,
    /-----BEGIN\s+(RSA|DSA|EC)\s+PRIVATE\s+KEY-----/,
];

function scanFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const findings = [];

    for (const pattern of PATTERNS) {
        const matches = content.match(pattern);
        if (matches) {
            findings.push({
                file: filePath,
                pattern: pattern.toString(),
                line: findLineNumber(content, matches[0]),
            });
        }
    }

    return findings;
}

function scanRepository() {
    const files = execSync('git ls-files').toString().split('\n');
    const allFindings = [];

    for (const file of files) {
        if (!file) continue;
        const findings = scanFile(file);
        allFindings.push(...findings);
    }

    return allFindings;
}

const findings = scanRepository();
if (findings.length > 0) {
    console.error('⚠️  Potential secrets detected:');
    findings.forEach(f => console.error(`  ${f.file}:${f.line}`));
    process.exit(1);
}
```

---

## Production Deployment

### Kubernetes Secrets

```yaml
# kubernetes/secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: roip-secrets
type: Opaque
stringData:
  jwt-secret: <base64-encoded-value>
  db-password: <base64-encoded-value>
```

```yaml
# kubernetes/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: roip-server
spec:
  template:
    spec:
      containers:
      - name: roip-server
        image: roip-server:latest
        env:
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: roip-secrets
              key: jwt-secret
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: roip-secrets
              key: db-password
```

### Docker Secrets

```bash
# Create Docker secret
echo "my-jwt-secret" | docker secret create jwt_secret -

# Use in Docker Compose
docker-compose up -d
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  roip-server:
    image: roip-server:latest
    secrets:
      - jwt_secret
      - db_password
    environment:
      JWT_SECRET_FILE: /run/secrets/jwt_secret
      DB_PASSWORD_FILE: /run/secrets/db_password

secrets:
  jwt_secret:
    external: true
  db_password:
    external: true
```

### Systemd Service with Secrets

```ini
# /etc/systemd/system/roip-server.service
[Unit]
Description=RoIP Server
After=network.target

[Service]
Type=simple
User=roip
WorkingDirectory=/opt/roip
EnvironmentFile=/etc/roip/secrets.env
ExecStart=/usr/bin/node server.js
Restart=always

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true

[Install]
WantedBy=multi-user.target
```

---

## Emergency Procedures

### Secret Compromise

If a secret is compromised:

#### 1. Immediate Actions

```bash
# 1. Revoke compromised secret immediately
vault kv metadata delete secret/roip/jwt

# 2. Generate new secret
NEW_SECRET=$(openssl rand -base64 32)
vault kv put secret/roip/jwt secret="$NEW_SECRET"

# 3. Update environment variable
export JWT_SECRET="$NEW_SECRET"

# 4. Restart services
systemctl restart roip-server

# 5. Invalidate all existing tokens/sessions
redis-cli FLUSHDB  # If using Redis for sessions
```

#### 2. Investigation

```bash
# Check git history for the secret
git log -p -S "compromised-secret"

# Check who accessed the secret (Vault audit log)
vault audit list

# Check application logs
grep "compromised-secret" /var/log/roip/*.log
```

#### 3. Notification

```bash
# Notify security team
curl -X POST https://security-webhook.example.com/alert \
  -H "Content-Type: application/json" \
  -d '{
    "severity": "high",
    "type": "secret_compromise",
    "secret_type": "jwt_secret",
    "timestamp": "'$(date -Iseconds)'"
  }'
```

### Secret Rotation Emergency

```bash
#!/bin/bash
# scripts/emergency-rotation.sh

echo "Emergency secret rotation initiated..."

# Rotate all critical secrets
./scripts/rotate-jwt-secret.sh
./scripts/rotate-db-password.sh
./scripts/rotate-api-keys.sh

# Restart all services
systemctl restart roip-server
systemctl restart nginx

# Verify services are healthy
sleep 10
curl -f http://localhost:8080/health || exit 1

echo "Emergency rotation complete"
```

---

## Quick Reference

### Generate Secrets

```bash
# Strong random string (32 bytes, base64)
openssl rand -base64 32

# Strong random string (hex)
openssl rand -hex 32

# UUID
uuidgen

# Generate SIP password
openssl rand -base64 16
```

### Check for Secrets in Code

```bash
# Scan for hardcoded secrets
./security/audit.sh --quick

# Scan git history
git secrets --scan-history

# Manual search
grep -r "password.*=.*['\"]" roip-server/src/
```

### Verify Secret Strength

```bash
# Check password strength
echo "your-password" | pwscore

# Entropy check
echo -n "your-secret" | wc -c
```

---

## Checklist

- [ ] No secrets committed to version control
- [ ] .env file in .gitignore
- [ ] .env.example provided for developers
- [ ] All secrets use environment variables
- [ ] Strong, random secrets generated
- [ ] Secrets validated on application start
- [ ] Secret rotation schedule defined
- [ ] Pre-commit hooks configured
- [ ] Secret scanning enabled
- [ ] Production secrets in vault/secrets manager
- [ ] Emergency procedures documented
- [ ] Team trained on secret management

---

**Document Version:** 1.0
**Last Updated:** 2024-11-22
**Author:** Security Team
