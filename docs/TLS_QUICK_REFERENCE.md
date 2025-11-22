# TLS/HTTPS Quick Reference Guide

Quick reference for common TLS operations on the ESP32 RoIP Server.

## Files and Locations

```
Configuration:
  roip-server/config/default.yaml          - Main configuration
  roip-server/config/tls-production.yaml   - Production example

Scripts:
  scripts/setup-letsencrypt.sh             - Let's Encrypt automation
  scripts/generate-self-signed-cert.sh     - Self-signed certificates

Certificates (Let's Encrypt):
  /etc/letsencrypt/live/DOMAIN/fullchain.pem  - Certificate + chain
  /etc/letsencrypt/live/DOMAIN/privkey.pem    - Private key
  /etc/letsencrypt/live/DOMAIN/chain.pem      - Certificate chain

Certificates (Self-Signed):
  certs/server.crt                         - Certificate
  certs/server.key                         - Private key
  certs/fullchain.pem                      - Same as server.crt
  certs/dhparam.pem                        - DH parameters

Nginx:
  /etc/nginx/sites-available/roip          - Nginx configuration
  /etc/nginx/dhparam.pem                   - DH parameters

Documentation:
  docs/TLS_SETUP.md                        - Complete guide
  docs/TLS_QUICK_REFERENCE.md              - This file
```

## Common Commands

### Setup

```bash
# Production (Let's Encrypt)
sudo ./scripts/setup-letsencrypt.sh roip.example.com admin@example.com

# Development (Self-Signed)
./scripts/generate-self-signed-cert.sh roip.local ./certs

# Test mode (staging)
sudo ./scripts/setup-letsencrypt.sh roip.example.com admin@example.com --staging
```

### Configuration

```yaml
# Enable TLS in config/default.yaml
tls:
  enabled: true
  cert: "/etc/letsencrypt/live/roip.example.com/fullchain.pem"
  key: "/etc/letsencrypt/live/roip.example.com/privkey.pem"
  redirect_http: true
```

### Server Control

```bash
# Systemd
sudo systemctl restart roip-server
sudo systemctl status roip-server
sudo journalctl -u roip-server -f

# Docker
docker-compose restart roip-server
docker-compose logs -f roip-server

# Standalone
cd roip-server && npm restart
```

### Testing

```bash
# Health check
curl https://roip.example.com:8080/health

# Self-signed (skip verification)
curl -k https://roip.local:8080/health

# Certificate info
openssl s_client -connect roip.example.com:8080 -servername roip.example.com

# Certificate expiry
echo | openssl s_client -connect roip.example.com:8080 -servername roip.example.com 2>/dev/null | openssl x509 -noout -dates

# Test TLS version
openssl s_client -connect roip.example.com:8080 -tls1_2
openssl s_client -connect roip.example.com:8080 -tls1_3

# Security headers
curl -I https://roip.example.com:8080
```

### Certificate Renewal

```bash
# Test renewal
sudo certbot renew --dry-run

# Force renewal
sudo certbot renew --force-renewal

# Check certbot timer
sudo systemctl status certbot.timer

# Manual certificate check
sudo certbot certificates
```

### Troubleshooting

```bash
# Check certificate files
sudo ls -la /etc/letsencrypt/live/roip.example.com/

# Verify permissions
sudo chmod 644 /etc/letsencrypt/live/roip.example.com/*.pem
sudo chmod 600 /etc/letsencrypt/live/roip.example.com/privkey.pem

# Test nginx config
sudo nginx -t
sudo systemctl reload nginx

# Check ports
sudo netstat -tlnp | grep -E '8080|8079|443'
sudo lsof -i :8080

# View server logs
sudo journalctl -u roip-server -n 100 --no-pager
docker-compose logs --tail=100 roip-server

# Test locally
curl -k https://localhost:8080/health
```

## Configuration Examples

### Minimal TLS Configuration

```yaml
tls:
  enabled: true
  cert: "/etc/letsencrypt/live/roip.example.com/fullchain.pem"
  key: "/etc/letsencrypt/live/roip.example.com/privkey.pem"
```

### Full Production Configuration

```yaml
tls:
  enabled: true
  cert: "/etc/letsencrypt/live/roip.example.com/fullchain.pem"
  key: "/etc/letsencrypt/live/roip.example.com/privkey.pem"
  ca: null
  redirect_http: true
  http_redirect_port: 8079
  min_version: "TLSv1.2"
  max_version: "TLSv1.3"
  ciphers:
    - "TLS_AES_128_GCM_SHA256"
    - "TLS_AES_256_GCM_SHA384"
    - "ECDHE-RSA-AES128-GCM-SHA256"
```

### Development Configuration

```yaml
tls:
  enabled: true
  cert: "./certs/server.crt"
  key: "./certs/server.key"
  redirect_http: false
```

### Environment Variables

```bash
# Enable via environment
export TLS_ENABLED=true
export TLS_CERT=/etc/letsencrypt/live/roip.example.com/fullchain.pem
export TLS_KEY=/etc/letsencrypt/live/roip.example.com/privkey.pem
npm start
```

### Docker Environment

```yaml
# docker-compose.yml
environment:
  TLS_ENABLED: "true"
  TLS_CERT: "/etc/letsencrypt/live/roip.example.com/fullchain.pem"
  TLS_KEY: "/etc/letsencrypt/live/roip.example.com/privkey.pem"
volumes:
  - /etc/letsencrypt:/etc/letsencrypt:ro
ports:
  - "443:8080"
  - "8079:8079"
```

## Nginx Configuration

### Minimal Reverse Proxy

```nginx
server {
    listen 443 ssl http2;
    server_name roip.example.com;

    ssl_certificate /etc/letsencrypt/live/roip.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/roip.example.com/privkey.pem;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name roip.example.com;
    return 301 https://$server_name$request_uri;
}
```

## Port Reference

```
Default Ports:
  5060     - SIP (UDP)
  8080     - API HTTP/HTTPS
  8081     - WebSocket/WSS
  8079     - HTTP redirect
  10000-10100 - RTP/SRTP (UDP)
  443      - HTTPS (if using nginx)
  9090     - Metrics

Required Open Ports:
  Production: 80, 443, 5060, 10000-10100
  Development: 8079, 8080, 8081, 5060, 10000-10100
```

## Security Checklist

- [ ] TLS enabled in configuration
- [ ] Valid certificate installed
- [ ] Private key secured (chmod 600)
- [ ] HTTP to HTTPS redirect enabled
- [ ] HSTS header configured
- [ ] Security headers enabled
- [ ] TLS 1.2+ only
- [ ] Modern cipher suites
- [ ] Certificate auto-renewal configured
- [ ] Monitoring configured
- [ ] Firewall rules updated
- [ ] Secrets in environment variables
- [ ] Regular security updates

## URLs for Testing

```
Let's Encrypt staging:
  https://acme-staging-v02.api.letsencrypt.org/directory

SSL testing:
  https://www.ssllabs.com/ssltest/
  https://observatory.mozilla.org/

Certificate monitoring:
  https://crt.sh/
  https://transparencyreport.google.com/https/certificates
```

## Emergency Procedures

### Disable TLS Quickly

```bash
# Set in config
tls:
  enabled: false

# Or via environment
export TLS_ENABLED=false

# Restart
sudo systemctl restart roip-server
```

### Certificate Expired

```bash
# Renew immediately
sudo certbot renew --force-renewal

# Restart services
sudo systemctl restart nginx roip-server
```

### Locked Out

```bash
# Access via HTTP (if redirect not working)
curl http://localhost:8080/health

# Disable TLS in config
sudo nano roip-server/config/default.yaml
# Set: tls.enabled = false

# Restart
sudo systemctl restart roip-server
```

## Support Resources

- Full Guide: `docs/TLS_SETUP.md`
- Production Config: `roip-server/config/tls-production.yaml`
- Let's Encrypt: https://letsencrypt.org/docs/
- Mozilla SSL Config: https://ssl-config.mozilla.org/
