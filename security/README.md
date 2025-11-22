# ESP32 RoIP Security Suite

## Overview

This directory contains comprehensive security audit tools and procedures for the ESP32 Radio over IP (RoIP) system. These tools help identify vulnerabilities, enforce security policies, and maintain a secure deployment.

## Quick Start

```bash
# Run a quick security audit
./security/audit.sh --quick

# Run comprehensive audit with vulnerability scanning
./security/audit.sh --full --report

# Run automated security tests
cd roip-server && npm test -- ../security/security.test.js

# Review security checklist before deployment
cat security/SECURITY_CHECKLIST.md
```

## Files in This Directory

### 1. audit.sh
**Automated security scanning script**

**Purpose:** Comprehensive automated security scanning for the RoIP system

**Features:**
- File system security checks
- Secret scanning (hardcoded passwords, API keys)
- Dependency vulnerability checking (npm audit)
- Code security analysis (SQL injection, XSS, etc.)
- Configuration security review
- SSL/TLS certificate validation
- Docker security checks
- Logging and monitoring verification

**Usage:**
```bash
# Quick scan (skips dependency scans)
./security/audit.sh --quick

# Full scan with all checks
./security/audit.sh --full

# Generate detailed report
./security/audit.sh --full --report

# Auto-fix issues where possible
./security/audit.sh --fix
```

**Output:**
- Console output with color-coded findings
- Detailed report in `security/reports/`
- Risk score and severity classification

---

### 2. SECURITY_CHECKLIST.md
**Pre-deployment security checklist**

**Purpose:** Comprehensive checklist to ensure all security measures are in place before production deployment

**Sections:**
- Authentication & Authorization (JWT, SIP, Database)
- Network Security (Firewall, TLS/SSL, DDoS Protection)
- Application Security (Input Validation, Security Headers, CORS)
- Data Security (Encryption, Backups, Recording Security)
- Infrastructure Security (Server Hardening, Docker, ESP32)
- Monitoring & Logging (Security Events, Audit Trail)
- Compliance & Documentation (GDPR, Audit Trail)
- Operational Security (Deployment, Backup, Access Control)
- Configuration Hardening (Rate Limiting, Session Management)
- Pre-Launch Final Checks

**Usage:**
- Review before each deployment
- Update quarterly
- Use as basis for security audits

---

### 3. PENETRATION_TESTING.md
**Comprehensive penetration testing guide**

**Purpose:** Detailed procedures for security testing VoIP/RoIP systems

**Attack Vectors Covered:**
- SIP Protocol Attacks (Registration Hijacking, Enumeration, Auth Bypass)
- RTP Stream Attacks (Injection, Eavesdropping, Flood)
- Web Application Attacks (SQL Injection, XSS, CSRF)
- Denial of Service Attacks (SIP Flood, RTP Flood)

**Testing Phases:**
1. Information Gathering (Reconnaissance)
2. SIP Authentication Testing
3. SIP Vulnerability Testing
4. RTP Media Stream Testing
5. Web API Security Testing
6. WebSocket Security
7. Database Security
8. ESP32 Firmware Security

**Tools Referenced:**
- SIPVicious (SIP enumeration and cracking)
- SIPp (SIP performance testing)
- Metasploit (VoIP modules)
- Wireshark (Packet analysis)
- SQLMap (SQL injection)
- Burp Suite (Web app testing)
- nmap (Network scanning)

**Usage:**
- Only test systems you own or have permission to test
- Follow legal and ethical guidelines
- Document all findings
- Remediate before production

---

### 4. security-config.yaml
**Security policies and configuration**

**Purpose:** Centralized security configuration for the RoIP system

**Configuration Sections:**
- **Security Policies:** Overall security level, compliance frameworks
- **Authentication:** JWT, password policy, account lockout, MFA, session management
- **Authorization:** RBAC, role definitions, permissions
- **Rate Limiting:** API endpoints, SIP, WebSocket
- **Firewall Rules:** Inbound/outbound rules, IP whitelist/blacklist, GeoIP
- **DDoS Protection:** SYN flood, connection limits, packet filtering
- **Encryption:** TLS/SSL, SRTP, database encryption, key management
- **Input Validation:** Validation rules, sanitization, file uploads
- **Security Headers:** CSP, HSTS, X-Frame-Options, etc.
- **Logging & Monitoring:** Security events, log storage, alerting
- **Intrusion Detection:** Behavioral analysis, pattern matching
- **Backup & Recovery:** Encryption, verification, retention
- **Compliance:** GDPR, audit trail, data subject rights

**Usage:**
```javascript
// Load security configuration
import YAML from 'yaml';
import fs from 'fs';

const securityConfig = YAML.parse(
    fs.readFileSync('security/security-config.yaml', 'utf8')
);

// Apply rate limiting
app.use(rateLimit({
    windowMs: 60 * 1000,
    max: securityConfig.rate_limiting.api['/api/v1/*'].requests_per_minute
}));
```

---

### 5. security.test.js
**Automated security test suite**

**Purpose:** Automated security tests for continuous security validation

**Test Categories:**
- **Authentication Security:** JWT validation, login security, session management
- **Authorization Security:** RBAC, privilege escalation prevention
- **Input Validation:** SQL injection, XSS, command injection, path traversal
- **Security Headers:** All required headers present and correct
- **CORS Configuration:** Proper origin restrictions
- **CSRF Protection:** Token validation
- **Rate Limiting:** Enforcement verification
- **Error Handling:** No information leakage
- **Session Cookies:** Secure, HttpOnly, SameSite flags
- **Password Policy:** Complexity enforcement
- **File Upload Security:** Type and size validation

**Usage:**
```bash
# Run all security tests
cd roip-server
npm test -- ../security/security.test.js

# Run specific test suite
npm test -- ../security/security.test.js --grep "Authentication"

# Generate coverage report
npm test -- ../security/security.test.js --coverage
```

**Integration:**
- Add to CI/CD pipeline
- Run before each deployment
- Fail build on critical issues

---

### 6. SECRET_MANAGEMENT.md
**Secret management guide**

**Purpose:** Comprehensive guide for handling secrets securely

**Topics Covered:**
- What are secrets (JWT, database passwords, API keys, certificates)
- Secret storage best practices (do's and don'ts)
- Environment variables (setup, validation)
- Vault integration (HashiCorp Vault, AWS Secrets Manager, Azure Key Vault)
- Secret rotation (schedules, procedures, automation)
- Secret detection & prevention (pre-commit hooks, scanning)
- Production deployment (Kubernetes, Docker, systemd)
- Emergency procedures (compromise response, rotation)

**Key Commands:**
```bash
# Generate strong JWT secret
openssl rand -base64 32

# Generate database password
openssl rand -base64 24

# Scan for committed secrets
git secrets --scan-history

# Rotate secrets
./scripts/rotate-jwt-secret.sh
./scripts/rotate-db-password.sh
```

**Checklist:**
- [ ] No secrets in source code
- [ ] .env in .gitignore
- [ ] Environment variables validated
- [ ] Secret rotation scheduled
- [ ] Pre-commit hooks configured
- [ ] Emergency procedures documented

---

## Security Audit Results

### Latest Audit Summary

**Audit Date:** 2024-11-22
**Risk Level:** HIGH (Risk Score: 48)

#### Critical Issues (2)
1. **Default JWT Secret:** `change-me-in-production` found in auth-manager.js
2. **Default Database Password:** `roip_password` found in multiple files

#### High Issues (4)
1. **Potential SQL Injection:** String concatenation in database queries
2. **No HTTPS/TLS Configuration:** Communications may be unencrypted
3. **Missing Rate Limiting:** No rate limiting implementation found
4. **Password Logging:** Potential password logging in SIP server

#### Medium Issues (3)
1. **Command Execution:** Ensure input sanitization for exec() calls
2. **Service Binding:** Services binding to 0.0.0.0 in configuration
3. **No Audit Logging:** Audit logging implementation missing

#### Low Issues (2)
1. **Stack Trace Exposure:** Review error handling to prevent stack trace leaks
2. **Missing .dockerignore:** Docker build may include sensitive files

---

## Remediation Priorities

### Immediate (Before Any Deployment)

#### 1. Fix Default Secrets
**Critical Risk**

**Files to Update:**
- `/home/user/MMDVM/roip-server/src/auth/auth-manager.js` (line 15)
- `/home/user/MMDVM/roip-server/src/database/database.js` (line 36)
- `/home/user/MMDVM/roip-server/config/default.yaml`

**Action Required:**
```bash
# Generate strong secrets
JWT_SECRET=$(openssl rand -base64 32)
DB_PASSWORD=$(openssl rand -base64 24)

# Update .env file
cat > roip-server/.env <<EOF
JWT_SECRET=$JWT_SECRET
DB_PASSWORD=$DB_PASSWORD
EOF

# Update code to require environment variables
# Remove default fallback values
```

**Code Fix:**
```javascript
// BEFORE (VULNERABLE)
this.jwtSecret = config.jwtSecret || process.env.JWT_SECRET || 'change-me-in-production';

// AFTER (SECURE)
this.jwtSecret = process.env.JWT_SECRET;
if (!this.jwtSecret) {
    throw new Error('JWT_SECRET environment variable is required');
}
```

---

#### 2. Fix SQL Injection Vulnerabilities
**High Risk**

**Files to Review:**
- `/home/user/MMDVM/roip-server/src/database/database.js`

**Issue:** String concatenation used to build SQL queries

**Current Code (VULNERABLE):**
```javascript
query += this.config.type === 'sqlite' ? ' AND is_active = ?' : ' AND is_active = $' + (params.length + 1);
```

**Recommended Fix:**
```javascript
// Use prepared statements with parameterized queries
// For SQLite
const stmt = this.db.prepare('SELECT * FROM users WHERE is_active = ?');
const result = stmt.all(isActive);

// For PostgreSQL
const result = await this.pgPool.query(
    'SELECT * FROM users WHERE is_active = $1',
    [isActive]
);
```

---

#### 3. Add HTTPS/TLS Support
**High Risk**

**Action Required:**
```javascript
// server.js - Add HTTPS support
import https from 'https';
import fs from 'fs';

const tlsOptions = {
    key: fs.readFileSync(process.env.TLS_KEY_PATH),
    cert: fs.readFileSync(process.env.TLS_CERT_PATH),
    ca: fs.readFileSync(process.env.TLS_CA_PATH),
    minVersion: 'TLSv1.2',
    ciphers: [
        'TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384',
        'TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256',
    ].join(':'),
};

const httpsServer = https.createServer(tlsOptions, app);
httpsServer.listen(443);
```

**Generate Self-Signed Certificate (Development):**
```bash
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes
```

**Production:** Use Let's Encrypt
```bash
# Install certbot
sudo apt install certbot

# Get certificate
sudo certbot certonly --standalone -d roip.example.com

# Auto-renewal
sudo certbot renew --dry-run
```

---

#### 4. Implement Rate Limiting
**High Risk**

**Action Required:**
```bash
npm install express-rate-limit
```

**Code:**
```javascript
import rateLimit from 'express-rate-limit';

// API rate limiting
const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

app.use('/api/', apiLimiter);

// Strict rate limiting for authentication
const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    skipSuccessfulRequests: true,
});

app.use('/api/v1/auth/login', authLimiter);
```

---

### High Priority (Before Production)

#### 5. Remove Password Logging
**Files:** `/home/user/MMDVM/roip-server/src/sip/sip-server.js`

**Fix:**
```javascript
// BEFORE (VULNERABLE)
this.logger.warn(`Failed to get password for user: ${username}`);

// AFTER (SECURE)
this.logger.warn('Failed to get password for user', { username });
// Never log passwords, tokens, or secrets
```

---

#### 6. Add Audit Logging
**Action Required:**
```javascript
// utils/audit-logger.js
import winston from 'winston';

const auditLogger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: { service: 'roip-audit' },
    transports: [
        new winston.transports.File({
            filename: 'logs/audit.log',
            maxsize: 10485760, // 10MB
            maxFiles: 10,
        }),
    ],
});

export function logSecurityEvent(event, details) {
    auditLogger.info({
        event,
        timestamp: new Date().toISOString(),
        ...details,
    });
}

// Usage
logSecurityEvent('authentication_failure', {
    username: req.body.username,
    ip: req.ip,
    userAgent: req.get('user-agent'),
});
```

---

### Medium Priority

#### 7. Restrict Service Binding
**File:** `/home/user/MMDVM/roip-server/config/default.yaml`

**Change:**
```yaml
# BEFORE (binds to all interfaces)
server:
  host: 0.0.0.0

# AFTER (bind to specific interface in production)
server:
  host: 10.0.0.50  # Or use environment variable
```

---

#### 8. Create .dockerignore
**Action Required:**
```bash
cat > .dockerignore <<EOF
.git
.github
.env
.env.*
*.log
node_modules
npm-debug.log
coverage/
.vscode/
.idea/
*.pem
*.key
*.crt
security/reports/
test/
docs/
*.md
!README.md
EOF
```

---

## Recommended Tools

### Security Scanning
- **npm audit:** Built-in Node.js vulnerability scanner
- **Snyk:** Comprehensive dependency and code scanning
- **OWASP ZAP:** Web application security scanner
- **SQLMap:** SQL injection detection
- **git-secrets:** Prevent committing secrets

### VoIP/RoIP Specific
- **SIPVicious:** SIP enumeration and testing
- **SIPp:** SIP load testing
- **Wireshark:** Packet analysis
- **tcpdump:** Network traffic capture

### Installation
```bash
# Install security tools
npm install -g snyk retire

# Install SIP tools (Debian/Ubuntu)
sudo apt install sipvicious wireshark tcpdump

# Install pre-commit hooks
pip install pre-commit
pre-commit install
```

---

## Security Monitoring

### Log Files
```bash
# Security audit logs
/home/user/MMDVM/security/reports/security_audit_*.txt

# Application logs
/var/log/roip/security.log
/var/log/roip/access.log
/var/log/roip/error.log
```

### Monitoring Commands
```bash
# Watch for failed authentication attempts
tail -f /var/log/roip/security.log | grep "auth:failed"

# Monitor SIP traffic
tcpdump -i eth0 port 5060 -n

# Check for suspicious connections
netstat -an | grep :5060
```

---

## Continuous Security

### Daily
- Review security logs
- Check for failed authentication attempts
- Monitor system resources

### Weekly
- Run quick security audit: `./security/audit.sh --quick`
- Review and update firewall rules
- Check certificate expiration

### Monthly
- Run full security audit: `./security/audit.sh --full --report`
- Update dependencies: `npm update`
- Review and rotate secrets
- Penetration testing (internal)

### Quarterly
- External penetration testing
- Security policy review
- Rotate all secrets
- Security awareness training

---

## Emergency Response

### If Security Breach Detected

1. **Immediate Actions:**
   ```bash
   # Isolate affected systems
   sudo iptables -A INPUT -j DROP

   # Capture evidence
   sudo tcpdump -i eth0 -w breach_$(date +%s).pcap

   # Review logs
   grep -i "suspicious" /var/log/roip/*.log
   ```

2. **Rotate All Secrets:**
   ```bash
   ./scripts/emergency-rotation.sh
   ```

3. **Notify:**
   - Security team
   - System administrators
   - Affected users (if applicable)

4. **Document:**
   - Timeline of events
   - Actions taken
   - Lessons learned

---

## Support & Resources

### Documentation
- `/home/user/MMDVM/security/SECURITY_CHECKLIST.md` - Pre-deployment checklist
- `/home/user/MMDVM/security/PENETRATION_TESTING.md` - Testing procedures
- `/home/user/MMDVM/security/SECRET_MANAGEMENT.md` - Secret handling guide

### External Resources
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE Top 25](https://cwe.mitre.org/top25/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [VoIP Security Alliance](https://voipsa.org/)

### Contact
- **Security Team:** security@example.com
- **On-Call:** +1-555-0100
- **Incident Response:** incident@example.com

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2024-11-22 | Security Team | Initial security suite implementation |

---

**Last Security Audit:** 2024-11-22
**Next Scheduled Audit:** 2024-12-22
**Security Policy Version:** 1.0
