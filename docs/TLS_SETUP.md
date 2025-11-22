# TLS/HTTPS Setup Guide for ESP32 RoIP Server

This comprehensive guide covers the setup, configuration, and management of TLS/HTTPS for the ESP32 RoIP Server.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Certificate Options](#certificate-options)
- [Production Setup (Let's Encrypt)](#production-setup-lets-encrypt)
- [Development Setup (Self-Signed)](#development-setup-self-signed)
- [Configuration](#configuration)
- [Nginx Reverse Proxy](#nginx-reverse-proxy)
- [Docker Deployment](#docker-deployment)
- [Testing](#testing)
- [Certificate Renewal](#certificate-renewal)
- [SRTP Media Encryption](#srtp-media-encryption)
- [Troubleshooting](#troubleshooting)
- [Security Best Practices](#security-best-practices)

---

## Overview

The ESP32 RoIP Server supports HTTPS/TLS for secure API and WebSocket communication. This guide covers:

- **API Server HTTPS**: Secure REST API access
- **WebSocket TLS**: Secure real-time communication
- **HTTP to HTTPS Redirect**: Automatic redirect from HTTP to HTTPS
- **SRTP**: Encrypted RTP media streams (framework provided)
- **Certificate Management**: Let's Encrypt and self-signed certificates

### Benefits of TLS

- Encrypted communication between clients and server
- Authentication of server identity
- Protection against man-in-the-middle attacks
- Compliance with security standards
- Required for production deployments

---

## Quick Start

### Production (Let's Encrypt)

```bash
# 1. Run Let's Encrypt setup script
sudo ./scripts/setup-letsencrypt.sh roip.example.com admin@example.com

# 2. Update configuration
nano roip-server/config/default.yaml
# Set: tls.enabled = true

# 3. Restart server
sudo systemctl restart roip-server
```

### Development (Self-Signed)

```bash
# 1. Generate self-signed certificate
./scripts/generate-self-signed-cert.sh roip.local ./certs

# 2. Update configuration
nano roip-server/config/default.yaml
# Set: tls.enabled = true
# Set: tls.cert = "./certs/server.crt"
# Set: tls.key = "./certs/server.key"

# 3. Restart server
npm restart
```

---

## Certificate Options

### 1. Let's Encrypt (Recommended for Production)

**Pros:**
- Free, automated, and trusted by all browsers
- Automatic renewal
- Industry-standard security

**Cons:**
- Requires valid domain name
- Requires internet-accessible server
- Rate limits apply

**Best for:** Production deployments, public-facing servers

### 2. Self-Signed Certificates

**Pros:**
- Quick and easy for development
- No external dependencies
- Works offline

**Cons:**
- Browser security warnings
- Not trusted by default
- Manual renewal required

**Best for:** Development, testing, internal networks

### 3. Custom CA Certificates

**Pros:**
- Full control over certificate lifecycle
- Can use internal CA
- No external dependencies

**Cons:**
- Complex setup
- Requires CA infrastructure
- Client trust configuration needed

**Best for:** Enterprise deployments, corporate networks

---

## Production Setup (Let's Encrypt)

### Prerequisites

1. **Domain Name**: You need a registered domain pointing to your server
2. **Public IP**: Server must be accessible from the internet
3. **Port 80 Open**: Required for ACME challenge
4. **Root Access**: Required for certbot installation

### Step-by-Step Setup

#### 1. DNS Configuration

Ensure your domain points to your server:

```bash
# Check DNS resolution
host roip.example.com

# Should return your server's IP address
# roip.example.com has address 203.0.113.10
```

#### 2. Run Let's Encrypt Setup Script

```bash
# Make script executable
chmod +x scripts/setup-letsencrypt.sh

# Run setup (production)
sudo ./scripts/setup-letsencrypt.sh roip.example.com admin@example.com

# Or use staging for testing
sudo ./scripts/setup-letsencrypt.sh roip.example.com admin@example.com --staging
```

The script will:
- Install certbot if needed
- Generate DH parameters
- Obtain certificates from Let's Encrypt
- Configure automatic renewal
- Test renewal process

#### 3. Verify Certificate Files

```bash
# Check certificate files
sudo ls -l /etc/letsencrypt/live/roip.example.com/

# You should see:
# - cert.pem       -> Certificate only
# - chain.pem      -> Certificate chain
# - fullchain.pem  -> Certificate + chain (use this)
# - privkey.pem    -> Private key (keep secure!)
```

#### 4. Update RoIP Configuration

Edit `roip-server/config/default.yaml`:

```yaml
tls:
  enabled: true
  cert: "/etc/letsencrypt/live/roip.example.com/fullchain.pem"
  key: "/etc/letsencrypt/live/roip.example.com/privkey.pem"
  ca: null
  redirect_http: true
  http_redirect_port: 8079
```

#### 5. Restart Server

```bash
# Systemd service
sudo systemctl restart roip-server

# Or Docker
docker-compose restart roip-server

# Or standalone
cd roip-server
npm restart
```

#### 6. Test HTTPS

```bash
# Test health endpoint
curl https://roip.example.com:8080/health

# Test SSL certificate
openssl s_client -connect roip.example.com:8080 -servername roip.example.com

# Test SSL configuration (external)
# Visit: https://www.ssllabs.com/ssltest/analyze.html?d=roip.example.com
```

---

## Development Setup (Self-Signed)

### Generate Self-Signed Certificate

```bash
# Using the provided script
./scripts/generate-self-signed-cert.sh roip.local ./certs

# Manual generation (alternative)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout certs/server.key \
  -out certs/server.crt \
  -subj "/CN=roip.local"
```

### Configure Server

Edit `roip-server/config/default.yaml`:

```yaml
tls:
  enabled: true
  cert: "./certs/server.crt"
  key: "./certs/server.key"
  redirect_http: true
  http_redirect_port: 8079
```

### Trust Certificate (Optional)

To avoid browser warnings, import the certificate:

**Linux:**
```bash
sudo cp certs/server.crt /usr/local/share/ca-certificates/roip-server.crt
sudo update-ca-certificates
```

**macOS:**
```bash
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain certs/server.crt
```

**Windows:**
```powershell
Import-Certificate -FilePath certs\server.crt -CertStoreLocation Cert:\LocalMachine\Root
```

---

## Configuration

### Complete TLS Configuration

```yaml
# roip-server/config/default.yaml

tls:
  # Enable HTTPS for API and WebSocket
  enabled: true

  # Certificate files (Let's Encrypt or custom)
  cert: "/etc/letsencrypt/live/roip.example.com/fullchain.pem"
  key: "/etc/letsencrypt/live/roip.example.com/privkey.pem"
  ca: null  # Optional: CA certificate bundle

  # HTTP to HTTPS redirect
  redirect_http: true
  http_redirect_port: 8079

  # TLS protocol versions
  min_version: "TLSv1.2"
  max_version: "TLSv1.3"

  # Cipher suites (modern, secure ciphers)
  ciphers:
    - "TLS_AES_128_GCM_SHA256"
    - "TLS_AES_256_GCM_SHA384"
    - "TLS_CHACHA20_POLY1305_SHA256"
    - "ECDHE-RSA-AES128-GCM-SHA256"
    - "ECDHE-RSA-AES256-GCM-SHA384"

  # Client certificate authentication (optional)
  client_cert_auth:
    enabled: false
    required: false
    ca_file: null

security:
  # Security headers (enforced by server)
  headers:
    hsts_enabled: true
    hsts_max_age: 31536000
    hsts_include_subdomains: true
    hsts_preload: true
    frame_options: "DENY"
    content_type_options: "nosniff"
    xss_protection: "1; mode=block"
```

### Environment Variables

You can override TLS settings using environment variables:

```bash
# Enable TLS
export TLS_ENABLED=true

# Certificate paths
export TLS_CERT=/etc/letsencrypt/live/roip.example.com/fullchain.pem
export TLS_KEY=/etc/letsencrypt/live/roip.example.com/privkey.pem
export TLS_CA=/path/to/ca-bundle.pem

# Start server
npm start
```

---

## Nginx Reverse Proxy

Using nginx as a reverse proxy provides additional benefits:
- SSL termination
- Load balancing
- Rate limiting
- Better static file serving

### Installation

```bash
# Install nginx
sudo apt-get install nginx

# Copy configuration
sudo cp deployment/ansible/roles/nginx/templates/roip-site.conf.j2 \
        /etc/nginx/sites-available/roip

# Enable site
sudo ln -s /etc/nginx/sites-available/roip /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Configuration

Edit `/etc/nginx/sites-available/roip`:

```nginx
# SSL configuration
ssl_certificate /etc/letsencrypt/live/roip.example.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/roip.example.com/privkey.pem;
ssl_trusted_certificate /etc/letsencrypt/live/roip.example.com/chain.pem;

# Modern TLS configuration
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';
ssl_prefer_server_ciphers off;

# OCSP stapling
ssl_stapling on;
ssl_stapling_verify on;

# Security headers
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
```

---

## Docker Deployment

### Docker Compose with TLS

Update `docker/docker-compose.yml`:

```yaml
services:
  roip-server:
    environment:
      TLS_ENABLED: "true"
      TLS_CERT: "/etc/letsencrypt/live/roip.example.com/fullchain.pem"
      TLS_KEY: "/etc/letsencrypt/live/roip.example.com/privkey.pem"
    ports:
      - "443:8080"      # HTTPS port
      - "8079:8079"     # HTTP redirect
    volumes:
      # Mount Let's Encrypt certificates
      - /etc/letsencrypt:/etc/letsencrypt:ro
```

### Using Docker Secrets (Recommended)

```bash
# Create secrets
echo "/etc/letsencrypt/live/roip.example.com/fullchain.pem" | \
  docker secret create tls_cert -
echo "/etc/letsencrypt/live/roip.example.com/privkey.pem" | \
  docker secret create tls_key -

# Update docker-compose.yml
services:
  roip-server:
    secrets:
      - tls_cert
      - tls_key
```

---

## Testing

### Basic Connectivity Tests

```bash
# Test HTTPS endpoint
curl https://roip.example.com:8080/health

# Test with self-signed certificate (skip verification)
curl -k https://roip.local:8080/health

# Test HTTP redirect
curl -I http://roip.example.com:8079/health
# Should return: HTTP/1.1 301 Moved Permanently
```

### SSL Certificate Tests

```bash
# View certificate details
openssl s_client -connect roip.example.com:8080 -servername roip.example.com

# Check certificate expiry
openssl s_client -connect roip.example.com:8080 -servername roip.example.com \
  2>/dev/null | openssl x509 -noout -dates

# Test specific TLS version
openssl s_client -connect roip.example.com:8080 -tls1_2
openssl s_client -connect roip.example.com:8080 -tls1_3
```

### Security Scan

```bash
# Using SSL Labs (online)
# Visit: https://www.ssllabs.com/ssltest/analyze.html?d=roip.example.com

# Using testssl.sh (local)
git clone https://github.com/drwetter/testssl.sh.git
cd testssl.sh
./testssl.sh https://roip.example.com:8080
```

### Header Verification

```bash
# Check security headers
curl -I https://roip.example.com:8080

# Should include:
# Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
# X-Frame-Options: DENY
# X-Content-Type-Options: nosniff
```

---

## Certificate Renewal

### Automatic Renewal (Let's Encrypt)

The setup script configures automatic renewal. Verify it's working:

```bash
# Test renewal (dry run)
sudo certbot renew --dry-run

# Check certbot timer
sudo systemctl status certbot.timer

# Manual renewal
sudo certbot renew
```

### Renewal Hooks

Reload services after renewal:

```bash
# Edit renewal hook
sudo nano /etc/letsencrypt/renewal-hooks/deploy/roip-reload.sh

#!/bin/bash
systemctl reload nginx
systemctl restart roip-server
docker restart roip-server  # If using Docker
```

### Self-Signed Certificate Renewal

```bash
# Generate new certificate
./scripts/generate-self-signed-cert.sh roip.local ./certs

# Restart server
sudo systemctl restart roip-server
```

---

## SRTP Media Encryption

SRTP (Secure RTP) provides encryption for media streams.

### Configuration

```yaml
security:
  srtp:
    enabled: false  # Set to true when ready
    crypto_suites:
      - "AES_CM_128_HMAC_SHA1_80"
      - "AES_CM_128_HMAC_SHA1_32"
      - "AEAD_AES_256_GCM"
      - "AEAD_AES_128_GCM"
    key_derivation_rate: 0
```

### Implementation Notes

The RoIP server includes SRTP framework code in `rtp-manager.js`:

- `initializeSRTP()` - Initialize SRTP context
- `encryptSRTP()` - Encrypt RTP packets
- `decryptSRTP()` - Decrypt SRTP packets
- `generateSRTPKeyMaterial()` - Generate keys

**Current Status:** Framework implemented, requires integration with native SRTP library (e.g., `libsrtp`, `srtp2`, or `wrtc`).

### Future Implementation

To enable SRTP:

1. Install SRTP library:
   ```bash
   npm install srtp2  # Or appropriate library
   ```

2. Implement encryption/decryption in `rtp-manager.js`

3. Update SIP SDP to include SRTP crypto attributes

4. Test with SRTP-capable clients

---

## Troubleshooting

### Common Issues

#### 1. Certificate File Not Found

**Error:** `Failed to load TLS certificates: ENOENT`

**Solution:**
```bash
# Verify certificate paths
ls -l /etc/letsencrypt/live/roip.example.com/

# Check file permissions
sudo chmod 644 /etc/letsencrypt/live/roip.example.com/*.pem
sudo chmod 600 /etc/letsencrypt/live/roip.example.com/privkey.pem
```

#### 2. Port Already in Use

**Error:** `Error: listen EADDRINUSE: address already in use :::8080`

**Solution:**
```bash
# Find process using port
sudo lsof -i :8080
sudo netstat -tlnp | grep 8080

# Kill process or change port in configuration
```

#### 3. Browser Security Warnings (Self-Signed)

**Solution:** Import certificate into browser/system trust store, or use `-k` flag with curl for testing.

#### 4. Let's Encrypt Rate Limits

**Error:** `too many certificates already issued`

**Solution:** Use staging environment for testing:
```bash
sudo ./scripts/setup-letsencrypt.sh roip.example.com admin@example.com --staging
```

#### 5. HTTPS Not Working After Setup

**Debug Steps:**
```bash
# Check server logs
journalctl -u roip-server -f

# Verify configuration
node -e "console.log(require('yaml').parse(require('fs').readFileSync('roip-server/config/default.yaml', 'utf8')))"

# Test locally
curl -k https://localhost:8080/health

# Check firewall
sudo ufw status
sudo firewall-cmd --list-all
```

---

## Security Best Practices

### 1. Keep Certificates Secure

```bash
# Proper permissions
sudo chmod 600 /etc/letsencrypt/live/*/privkey.pem
sudo chmod 644 /etc/letsencrypt/live/*.pem

# Never commit certificates to version control
echo "*.pem" >> .gitignore
echo "*.key" >> .gitignore
echo "*.crt" >> .gitignore
```

### 2. Use Strong TLS Configuration

- Enable TLS 1.2 and 1.3 only
- Use modern cipher suites
- Enable perfect forward secrecy (PFS)
- Enable OCSP stapling
- Set HSTS headers

### 3. Regular Updates

```bash
# Update certbot
sudo apt-get update && sudo apt-get upgrade certbot

# Update server dependencies
cd roip-server
npm audit fix
```

### 4. Monitor Certificate Expiry

```bash
# Set up monitoring
# Add to crontab:
0 0 * * * certbot renew --quiet

# Or use monitoring service
# - SSL Labs
# - Uptime Robot
# - Let's Monitor
```

### 5. Implement Client Certificate Authentication (Optional)

For high-security environments:

```yaml
tls:
  client_cert_auth:
    enabled: true
    required: true
    ca_file: /path/to/client-ca.pem
```

---

## Additional Resources

### Documentation
- [Mozilla SSL Configuration Generator](https://ssl-config.mozilla.org/)
- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
- [SSL Labs Best Practices](https://github.com/ssllabs/research/wiki/SSL-and-TLS-Deployment-Best-Practices)

### Tools
- [SSL Labs Server Test](https://www.ssllabs.com/ssltest/)
- [testssl.sh](https://testssl.sh/)
- [Certbot](https://certbot.eff.org/)

### Standards
- [RFC 5246 - TLS 1.2](https://tools.ietf.org/html/rfc5246)
- [RFC 8446 - TLS 1.3](https://tools.ietf.org/html/rfc8446)
- [RFC 3711 - SRTP](https://tools.ietf.org/html/rfc3711)

---

## Support

For issues or questions:
- Check the [Troubleshooting](#troubleshooting) section
- Review server logs: `journalctl -u roip-server -f`
- Test with verbose output: `curl -v https://...`
- File an issue on GitHub with:
  - Server version
  - TLS configuration
  - Error messages
  - Certificate details (not private keys!)
