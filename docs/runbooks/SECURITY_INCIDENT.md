# Security Incident Response Runbook
## ESP32 RoIP Production System

**Version**: 1.0
**Last Updated**: 2025-11-22
**Severity**: P0 - Critical
**Classification**: CONFIDENTIAL

---

## Table of Contents

1. [Overview](#overview)
2. [Incident Types](#incident-types)
3. [Response Procedures](#response-procedures)
4. [Containment](#containment)
5. [Eradication](#eradication)
6. [Recovery](#recovery)
7. [Post-Incident](#post-incident)

---

## Overview

This runbook defines procedures for responding to security incidents including unauthorized access, data breaches, DDoS attacks, and malware infections.

### Security Incident Categories

| Category | Examples | Initial Response Time |
|----------|----------|---------------------|
| **Critical** | Data breach, ransomware, root compromise | Immediate (<5 min) |
| **High** | Unauthorized access attempts, DDoS | 15 minutes |
| **Medium** | Suspicious activity, policy violations | 1 hour |
| **Low** | False positives, minor policy violations | 4 hours |

---

## Incident Types

### Type 1: Unauthorized Access / Intrusion

**Indicators**:
- Failed login attempts from unknown IPs
- Successful logins from suspicious locations
- Privilege escalation attempts
- Unusual sudo commands
- Modified system files

**Detection**:
```bash
# Check failed login attempts
sudo lastb | head -20

# Check successful logins
sudo last | head -20

# Check sudo usage
sudo grep sudo /var/log/auth.log | tail -20

# Check for suspicious processes
ps aux | grep -v root | sort -k 3 -rn | head -10

# Check network connections
sudo netstat -tulpn | grep ESTABLISHED
```

### Type 2: Data Breach / Data Exfiltration

**Indicators**:
- Unusual database queries
- Large data transfers
- Database dumps
- Credential theft
- API key compromise

**Detection**:
```bash
# Check database access logs
sudo tail -100 /var/log/postgresql/postgresql-*-main.log | grep -i "select\|dump"

# Check for large queries
psql -U roip_user -d roip_production -c "
SELECT query, calls, total_time
FROM pg_stat_statements
WHERE query LIKE '%SELECT%'
ORDER BY total_time DESC
LIMIT 10;"

# Check outbound network traffic
sudo iftop -n -i eth0

# Check for data dumps
find /tmp -name "*.dump" -o -name "*.sql" -mtime -1
```

### Type 3: DDoS Attack

**Indicators**:
- Abnormally high traffic
- Service unavailability
- Connection timeouts
- High CPU/network usage

**Detection**:
```bash
# Check connection count
netstat -an | grep ESTABLISHED | wc -l

# Check traffic by IP
netstat -ntu | awk '{print $5}' | cut -d: -f1 | sort | uniq -c | sort -rn | head -20

# Check SYN flood
netstat -an | grep SYN | wc -l

# Monitor in real-time
watch -n 1 'netstat -an | grep ":80\|:443\|:8080" | wc -l'
```

### Type 4: Malware / Ransomware

**Indicators**:
- Encrypted files
- Ransom notes
- Unusual processes
- High CPU usage
- Modified binaries

**Detection**:
```bash
# Check for suspicious processes
ps aux | awk '{if($3>50) print $0}'

# Check for file modifications
sudo find /opt/roip-server -mtime -1 -type f

# Check for unusual cron jobs
crontab -l
sudo cat /etc/crontab

# Check for rootkits
sudo chkrootkit
sudo rkhunter --check
```

---

## Response Procedures

### Phase 1: Detection and Assessment (0-15 minutes)

#### Step 1: Confirm Incident

```bash
# Document initial evidence
echo "$(date) - Security incident detected" >> /tmp/security-incident-log.txt

# Take screenshot of monitoring dashboard
# Take note of all suspicious indicators

# Check if automated alert or manual report
# Verify it's not a false positive
```

#### Step 2: Initial Triage

```bash
# Assess severity based on:
SEVERITY="CRITICAL"  # or HIGH, MEDIUM, LOW

# Factors:
# - Data accessed/compromised
# - Systems affected
# - Attack sophistication
# - Ongoing vs completed
```

#### Step 3: Activate Incident Response Team

```bash
# Notify security team immediately
echo "SECURITY INCIDENT - $SEVERITY" | \
  mail -s "URGENT: Security Incident" security@example.com

# Page on-call security engineer
# Notify management for CRITICAL incidents

# Create incident war room (Slack channel)
# #security-incident-YYYYMMDD-HHMM
```

### Phase 2: Containment (15-60 minutes)

**Objective**: Stop the attack and prevent further damage

#### Quick Containment Actions

**For Unauthorized Access**:
```bash
# 1. Disable compromised accounts
sudo usermod -L compromised_user
sudo pkill -u compromised_user

# 2. Block attacker IP
sudo ufw deny from ATTACKER_IP
sudo iptables -A INPUT -s ATTACKER_IP -j DROP

# 3. Revoke API tokens
psql -U roip_user -d roip_production -c "
UPDATE api_tokens
SET active = false
WHERE user_id = 'compromised_user';"

# 4. Force password reset
psql -U roip_user -d roip_production -c "
UPDATE users
SET password_reset_required = true
WHERE id = 'compromised_user_id';"
```

**For DDoS Attack**:
```bash
# 1. Enable rate limiting
sudo nano /etc/nginx/nginx.conf
# Add:
limit_req_zone $binary_remote_addr zone=ddos:10m rate=10r/s;
limit_req zone=ddos burst=20 nodelay;

sudo systemctl reload nginx

# 2. Block attacking IPs (if identifiable)
for IP in $(netstat -ntu | awk '{print $5}' | cut -d: -f1 | sort | uniq -c | sort -rn | head -20 | awk '{if($1>100) print $2}'); do
  sudo ufw deny from $IP
done

# 3. Enable SYN cookies (if SYN flood)
sudo sysctl -w net.ipv4.tcp_syncookies=1
sudo sysctl -w net.ipv4.tcp_max_syn_backlog=8192

# 4. Contact ISP/CloudFlare for upstream filtering
```

**For Data Breach**:
```bash
# 1. Stop application immediately
sudo systemctl stop roip-server

# 2. Close database connections
psql -U roip_user -d roip_production -c "
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE pid != pg_backend_pid();"

# 3. Backup evidence
sudo tar -czf /tmp/evidence-$(date +%Y%m%d_%H%M%S).tar.gz \
  /var/log/roip-server/ \
  /var/log/postgresql/ \
  /var/log/auth.log \
  /var/log/syslog

# 4. Copy to secure location
scp /tmp/evidence-*.tar.gz secure-server:/security-incidents/
```

**For Malware/Ransomware**:
```bash
# 1. Isolate infected system IMMEDIATELY
sudo iptables -P INPUT DROP
sudo iptables -P OUTPUT DROP
sudo iptables -P FORWARD DROP

# 2. Kill suspicious processes
sudo pkill -f suspicious_process

# 3. Prevent autostart
sudo systemctl disable suspicious_service

# 4. Take forensic image (if possible)
sudo dd if=/dev/sda of=/mnt/external/forensic-image.dd bs=4M
```

### Phase 3: Eradication (1-4 hours)

**Objective**: Remove threat completely

#### For Unauthorized Access

```bash
# 1. Change ALL passwords
# Database
ALTER USER roip_user WITH PASSWORD 'NEW_SECURE_PASSWORD';

# Application secrets
sudo nano /opt/roip-server/.env
# Update all secrets: JWT_SECRET, API_KEYS, etc.

# System accounts
sudo passwd root
sudo passwd admin_user

# 2. Rotate SSH keys
ssh-keygen -t ed25519 -C "new-key-$(date +%Y%m%d)"
# Update authorized_keys on all servers

# 3. Rotate SSL/TLS certificates
sudo certbot revoke --cert-path /etc/letsencrypt/live/roip.example.com/cert.pem
sudo certbot certonly --force-renewal -d roip.example.com

# 4. Audit and remove backdoors
sudo find / -name ".ssh" -o -name "authorized_keys" 2>/dev/null
sudo find /etc -mtime -7 -ls
sudo crontab -l -u root
sudo systemctl list-units --type=service --state=running

# 5. Patch vulnerabilities
sudo apt update && sudo apt upgrade -y
sudo apt install unattended-upgrades
```

#### For Malware

```bash
# 1. Scan and remove malware
sudo apt install clamav clamav-daemon
sudo freshclam
sudo clamscan -r --remove /

# 2. Verify system binaries
sudo debsums -c
sudo rpm -Va  # For RHEL/CentOS

# 3. Reinstall suspicious packages
sudo apt-get install --reinstall <package>

# 4. Restore from clean backup
cd /opt/roip-server
git status  # Check for modifications
git reset --hard origin/main  # Reset to clean state
```

#### For DDoS

```bash
# 1. Analyze attack pattern
sudo tcpdump -i eth0 -n -c 1000 -w /tmp/ddos-capture.pcap

# 2. Implement permanent mitigation
# - Enable CloudFlare (or similar CDN)
# - Configure fail2ban rules
# - Set up GeoIP blocking

sudo nano /etc/fail2ban/jail.local
# Add custom rules for attack pattern

# 3. Block attack sources at network level
# Contact ISP for null routing
# Configure upstream firewall rules
```

### Phase 4: Recovery (Variable)

**Objective**: Restore normal operations safely

#### Step 1: Verify System Clean

```bash
# 1. Security scan
sudo lynis audit system

# 2. Rootkit check
sudo chkrootkit
sudo rkhunter --check

# 3. File integrity check
sudo aide --check

# 4. Network scan
sudo nmap -sV localhost
```

#### Step 2: Restore Service

```bash
# 1. Apply all security patches
sudo apt update && sudo apt upgrade -y

# 2. Harden configuration
# Disable unused services
sudo systemctl disable cups bluetooth

# Enable firewall
sudo ufw enable

# Harden SSH
sudo nano /etc/ssh/sshd_config
# PermitRootLogin no
# PasswordAuthentication no
# AllowUsers specific_users

# 3. Start application
sudo systemctl start postgresql
sudo systemctl start roip-server

# 4. Monitor closely
sudo journalctl -u roip-server -f
watch -n 5 'netstat -an | grep ESTABLISHED | wc -l'
```

#### Step 3: Validate Security

```bash
# 1. Test authentication
# Try old credentials (should fail)
# Try new credentials (should work)

# 2. Verify no backdoors
ps aux | grep -v root
sudo find / -perm -4000 -ls

# 3. Check firewall rules
sudo ufw status verbose
sudo iptables -L -n -v

# 4. Monitor for 24 hours
# Watch for suspicious activity
# Review logs hourly
```

---

## Post-Incident

### Evidence Preservation

```bash
# Collect all logs
sudo mkdir -p /security-incidents/INC-$(date +%Y%m%d)/
sudo cp -r /var/log/* /security-incidents/INC-$(date +%Y%m%d)/

# Hash evidence
cd /security-incidents/INC-$(date +%Y%m%d)/
find . -type f -exec sha256sum {} \; > checksums.txt

# Archive securely
tar -czf ../INC-$(date +%Y%m%d)-evidence.tar.gz .
gpg --encrypt --recipient security@example.com ../INC-$(date +%Y%m%d)-evidence.tar.gz
```

### Notification Requirements

**Internal**:
- Management (immediate for critical incidents)
- Legal team (for data breaches)
- PR team (if public disclosure needed)

**External** (if required):
- Law enforcement (for crimes)
- Regulatory bodies (GDPR, HIPAA, etc.)
- Affected customers (data breach laws)
- Insurance company

### Post-Incident Report

```markdown
# Security Incident Report

**Incident ID**: SEC-2025-1122-001
**Severity**: CRITICAL
**Date Detected**: 2025-11-22 14:35 UTC
**Date Resolved**: 2025-11-22 18:00 UTC

## Summary
{What happened in 2-3 sentences}

## Timeline
| Time | Event |
|------|-------|
| 14:35 | Suspicious login detected |
| 14:40 | Incident confirmed |
| 14:45 | Attacker IP blocked |
| 15:00 | All passwords rotated |
| 17:00 | System restored |
| 18:00 | Incident closed |

## Attack Vector
{How did the attack happen?}

## Systems Affected
- Server: roip-prod-01
- Database: PostgreSQL instance
- Accounts compromised: user_admin

## Data Compromised
- User data: YES/NO
- Credentials: YES/NO
- Financial data: YES/NO
- Scope: {Details}

## Root Cause
{Why did this happen?}

## Actions Taken
1. {Action 1}
2. {Action 2}

## Preventative Measures
1. {Prevention 1}
2. {Prevention 2}

## Lessons Learned
{What did we learn?}
```

---

## Prevention

### Security Hardening Checklist

```bash
# 1. Keep system updated
sudo apt update && sudo apt upgrade -y
sudo unattended-upgrades --dry-run

# 2. Install security tools
sudo apt install fail2ban aide rkhunter clamav ufw

# 3. Configure firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# 4. Enable intrusion detection
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# 5. Set up file integrity monitoring
sudo aideinit
sudo systemctl enable aide-check.timer

# 6. Harden SSH
sudo nano /etc/ssh/sshd_config
# Port 2222  # Non-standard port
# PermitRootLogin no
# PasswordAuthentication no
# MaxAuthTries 3
# LoginGraceTime 30

# 7. Enable audit logging
sudo apt install auditd
sudo systemctl enable auditd
sudo systemctl start auditd

# 8. Set up log monitoring
sudo apt install logwatch
sudo logwatch --detail high --mailto security@example.com --range today
```

### Regular Security Audits

```bash
# Weekly security scan
#!/bin/bash
# /opt/roip/scripts/weekly-security-scan.sh

# Update vulnerability database
sudo freshclam

# Scan for malware
sudo clamscan -r -i /opt/roip-server /var/www

# Check for rootkits
sudo rkhunter --update
sudo rkhunter --check --skip-keypress

# System audit
sudo lynis audit system --quiet > /tmp/lynis-report.txt
mail -s "Weekly Security Audit" security@example.com < /tmp/lynis-report.txt

# Check for outdated packages
apt list --upgradable | mail -s "Packages Need Update" ops@example.com
```

### Monitoring and Alerting

```yaml
# Prometheus alert rules for security
groups:
  - name: security
    rules:
      - alert: FailedLoginAttempts
        expr: rate(auth_failed_total[5m]) > 5
        annotations:
          summary: "High rate of failed login attempts"

      - alert: UnauthorizedAPIAccess
        expr: rate(api_unauthorized_total[5m]) > 10
        annotations:
          summary: "Unusual unauthorized API access"

      - alert: SuspiciousDatabaseQuery
        expr: rate(db_dump_queries[1m]) > 0
        annotations:
          summary: "Suspicious database dump query detected"
```

---

## Emergency Contacts

- **Security Team Lead**: security-lead@example.com, +1-555-0200
- **CISO**: ciso@example.com, +1-555-0201
- **Legal**: legal@example.com
- **Law Enforcement**: Non-emergency: 311, Emergency: 911
- **Cyber Insurance**: policy@insurance.com, +1-555-0300

---

**CONFIDENTIAL - FOR INTERNAL USE ONLY**

**Document Version**: 1.0
**Last Updated**: 2025-11-22
**Next Review**: 2026-02-22
