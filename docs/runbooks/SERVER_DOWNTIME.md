# Server Downtime Recovery Runbook
## ESP32 RoIP Production System

**Version**: 1.0
**Last Updated**: 2025-11-22
**Severity**: P0 - Critical
**Estimated Time to Recovery**: 15-30 minutes

---

## Table of Contents

1. [Overview](#overview)
2. [Symptoms](#symptoms)
3. [Initial Assessment](#initial-assessment)
4. [Recovery Procedures](#recovery-procedures)
5. [Validation](#validation)
6. [Prevention](#prevention)

---

## Overview

This runbook covers procedures for recovering from complete or partial server downtime affecting the RoIP service.

### When to Use This Runbook

- RoIP server is completely unresponsive
- HTTP 502/503/504 errors
- All health checks failing
- No response to ping or network requests
- Service crashed or won't start

### Not Covered Here

- Database-only failures (see [DATABASE_FAILURE.md](DATABASE_FAILURE.md))
- Network connectivity issues (see [../troubleshooting/PERFORMANCE_DEBUG.md](../troubleshooting/PERFORMANCE_DEBUG.md))
- Partial service degradation (see [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md))

---

## Symptoms

### Primary Indicators

```bash
# Health check fails
curl http://localhost:8080/health
# Returns: Connection refused, timeout, or HTTP 502/503

# Service status shows failed/dead
sudo systemctl status roip-server
# Shows: inactive (dead) or failed

# Docker container not running
docker-compose ps
# Shows: Exit 1, Restarting, or not listed
```

### Secondary Indicators

- All ESP32 devices showing offline
- Monitoring dashboards showing no data
- User reports of service unavailability
- Load balancer health checks failing

---

## Initial Assessment

**Time Allocation**: 5 minutes maximum

### Step 1: Verify Server Accessibility

```bash
# Can you SSH to the server?
ssh user@roip-server.example.com

# Is the server responsive?
uptime
top -b -n 1 | head -5

# Check system logs for critical errors
sudo dmesg | tail -50
sudo journalctl -p err -n 50
```

**Decision Point**:
- ✅ Server accessible → Proceed to Step 2
- ❌ Server not accessible → **ESCALATE**: Possible hardware/infrastructure failure

### Step 2: Check System Resources

```bash
# Check disk space (most common cause)
df -h
# Critical if >95% on any partition

# Check memory
free -h
# Critical if swap heavily used or OOM

# Check CPU
uptime
# Note load average

# Check for OOM killer events
sudo dmesg | grep -i "killed process"
sudo journalctl --since "1 hour ago" | grep -i "out of memory"
```

**Common Issues Found**:

| Issue | Check | Quick Fix |
|-------|-------|-----------|
| Disk full | `df -h` | Clean logs: `sudo journalctl --vacuum-size=500M` |
| OOM | `dmesg \| grep OOM` | Restart service with lower limits |
| Kernel panic | `dmesg` | Reboot server |
| Network down | `ip addr` | Restart network: `sudo systemctl restart networking` |

### Step 3: Check Service Status

```bash
# Check RoIP server
sudo systemctl status roip-server

# Check dependencies
sudo systemctl status postgresql
sudo systemctl status coturn
sudo systemctl status nginx

# Check Docker (if using Docker)
docker-compose -f /opt/roip/docker-compose.prod.yml ps
```

**Decision Tree**:

```
Is roip-server service running?
├─ YES → Is it responding to health checks?
│   ├─ YES → Not a server downtime issue (see INCIDENT_RESPONSE.md)
│   └─ NO → Application hung (proceed to Recovery Procedure B)
└─ NO → Is PostgreSQL running?
    ├─ YES → Application crashed (proceed to Recovery Procedure A)
    └─ NO → Database down (see DATABASE_FAILURE.md)
```

---

## Recovery Procedures

### Procedure A: Service Crashed or Won't Start

**Estimated Time**: 10-15 minutes

#### Step 1: Check Recent Logs

```bash
# View crash logs
sudo journalctl -u roip-server -n 200 --no-pager

# Look for:
# - Uncaught exceptions
# - Port already in use
# - Database connection errors
# - Configuration errors
# - Permission denied

# Save logs for later analysis
sudo journalctl -u roip-server --since "1 hour ago" > /tmp/crash-logs.txt
```

#### Step 2: Common Issues and Quick Fixes

**Issue 1: Port Already in Use**
```bash
# Check what's using port 8080
sudo lsof -i :8080
sudo netstat -tulpn | grep 8080

# Kill the process
sudo kill -9 $(sudo lsof -t -i:8080)

# Start service
sudo systemctl start roip-server
```

**Issue 2: Configuration Error**
```bash
# Validate configuration
cd /opt/roip-server
npm run config:validate

# If validation fails, restore from backup
sudo cp /opt/roip-server/.env.backup /opt/roip-server/.env

# Start service
sudo systemctl start roip-server
```

**Issue 3: Database Connection Failed**
```bash
# Test database connectivity
psql -U roip_user -h localhost -d roip_production -c "SELECT 1;"

# If fails, check PostgreSQL is running
sudo systemctl status postgresql

# If PostgreSQL is down
sudo systemctl start postgresql

# Wait for database to be ready
until pg_isready -h localhost -p 5432; do sleep 1; done

# Start RoIP service
sudo systemctl start roip-server
```

**Issue 4: Permissions Error**
```bash
# Fix ownership
sudo chown -R roip:roip /opt/roip-server
sudo chown -R roip:roip /var/log/roip

# Fix permissions
sudo chmod 755 /opt/roip-server
sudo chmod 644 /opt/roip-server/.env
sudo chmod 755 /var/log/roip

# Start service
sudo systemctl start roip-server
```

**Issue 5: Out of Memory**
```bash
# Check OOM in logs
sudo journalctl -u roip-server | grep -i "out of memory"

# Clear system cache
sync; echo 3 | sudo tee /proc/sys/vm/drop_caches

# Increase Node.js heap size
sudo nano /etc/systemd/system/roip-server.service
# Add: Environment="NODE_OPTIONS=--max-old-space-size=4096"

# Reload and restart
sudo systemctl daemon-reload
sudo systemctl start roip-server
```

#### Step 3: Start Service

```bash
# Attempt to start
sudo systemctl start roip-server

# Watch startup logs in real-time
sudo journalctl -u roip-server -f

# Wait for "Server listening on port 8080" message
# Typically takes 10-30 seconds

# If service fails to start after 60 seconds, check logs again
sudo systemctl status roip-server
sudo journalctl -u roip-server -n 50
```

#### Step 4: If Still Failing - Safe Mode Start

```bash
# Create safe mode configuration
sudo cp /opt/roip-server/.env /opt/roip-server/.env.full
sudo nano /opt/roip-server/.env

# Disable non-critical features:
# ENABLE_RECORDING=false
# ENABLE_TURN=false
# ENABLE_WEBSOCKET=false
# LOG_LEVEL=debug

# Try starting again
sudo systemctl restart roip-server

# Once started, gradually re-enable features
```

### Procedure B: Application Hung/Not Responding

**Estimated Time**: 5-10 minutes

#### Step 1: Verify Application is Hung

```bash
# Check process exists
ps aux | grep node

# Check if process is consuming CPU (hung vs crashed)
top -b -n 1 -p $(pgrep -f roip-server)

# Check open connections
sudo lsof -p $(pgrep -f roip-server) | wc -l

# Test responsiveness
timeout 10 curl http://localhost:8080/health
# If times out → hung
# If connection refused → crashed
```

#### Step 2: Get Thread Dump (for post-mortem)

```bash
# Get Node.js process PID
PID=$(pgrep -f roip-server)

# Send SIGUSR1 to trigger thread dump
sudo kill -USR1 $PID

# Thread dump will be in logs
sudo journalctl -u roip-server -n 200 > /tmp/thread-dump.txt
```

#### Step 3: Graceful Restart Attempt

```bash
# Try graceful restart first (15 second timeout)
sudo systemctl restart roip-server

# Monitor restart
timeout 30 sudo journalctl -u roip-server -f

# Check if started
curl http://localhost:8080/health
```

#### Step 4: Force Restart if Graceful Fails

```bash
# If graceful restart times out, force kill
sudo systemctl kill -s SIGKILL roip-server

# Clean up stale resources
sudo rm -f /var/run/roip-server.pid
sudo rm -f /tmp/roip-*.sock

# Start fresh
sudo systemctl start roip-server

# Monitor startup
sudo journalctl -u roip-server -f
```

### Procedure C: Complete System Failure (Last Resort)

**Estimated Time**: 15-30 minutes

#### Step 1: Emergency Reboot Decision

**Only reboot if**:
- Service cannot be restarted
- Critical system errors (kernel panic)
- Severe resource exhaustion
- All other recovery attempts failed

**Before rebooting**:
```bash
# Save diagnostic information
sudo journalctl > /tmp/full-system-logs.txt
sudo dmesg > /tmp/dmesg-output.txt
ps aux > /tmp/process-list.txt
df -h > /tmp/disk-usage.txt
free -h > /tmp/memory-usage.txt

# Notify team
echo "EMERGENCY REBOOT in 60 seconds" | mail -s "URGENT: Server Reboot" ops@example.com

# Copy logs to remote location if possible
scp /tmp/*-output.txt backup-server:/backups/$(date +%Y%m%d_%H%M%S)/
```

#### Step 2: Perform Reboot

```bash
# Schedule reboot with warning
sudo shutdown -r +1 "Emergency maintenance reboot"

# Or immediate reboot if critical
sudo reboot now

# NOTE: You will lose connection. Wait 3-5 minutes for server to come back
```

#### Step 3: Post-Reboot Recovery

```bash
# Wait for server to be accessible (may take 2-5 minutes)
while ! ping -c 1 roip-server.example.com; do sleep 5; done

# SSH back in
ssh user@roip-server.example.com

# Check all services started
sudo systemctl status roip-server postgresql coturn nginx

# Start any that didn't auto-start
sudo systemctl start roip-server
sudo systemctl start postgresql
sudo systemctl start coturn

# Proceed to Validation section
```

### Procedure D: Failover to DR Site (High Availability Setup)

**Estimated Time**: 10-20 minutes

**Prerequisites**: DR site must be configured and synchronized

#### Step 1: Verify DR Site Readiness

```bash
# SSH to DR server
ssh user@roip-dr.example.com

# Check DR database is up-to-date
psql -U roip_user -d roip_production -c "
SELECT max(created_at) FROM devices;"
# Compare with primary to ensure recent sync

# Check all services are ready
sudo systemctl status roip-server postgresql coturn
```

#### Step 2: Activate DR Site

```bash
# On DR server: Start all services
cd /opt/roip
docker-compose -f docker-compose.prod.yml up -d

# Verify services started
curl http://localhost:8080/health

# Check database connectivity
curl http://localhost:8080/health/db
```

#### Step 3: Update DNS

```bash
# Update DNS to point to DR site
# Method 1: AWS Route53 (automated)
aws route53 change-resource-record-sets \
  --hosted-zone-id ZXXXXX \
  --change-batch file://dr-failover.json

# Method 2: Manual DNS update
# Login to DNS provider
# Change A record for roip.example.com to DR IP

# Verify DNS propagation
dig roip.example.com +short
# Should show DR server IP
```

#### Step 4: Notify and Monitor

```bash
# Notify team of failover
echo "FAILOVER TO DR SITE COMPLETE" | mail -s "RoIP Failover" ops@example.com

# Update status page
curl -X POST https://status.example.com/api/update \
  -d '{"status": "monitoring", "message": "Service restored on backup site"}'

# Monitor DR site closely for 1 hour
watch -n 30 'curl -s http://localhost:8080/health | jq ".status"'
```

---

## Validation

### Step 1: Health Checks

```bash
# Basic health check
curl http://localhost:8080/health
# Expected: {"status":"ok"}

# Detailed health check
curl http://localhost:8080/health/detailed | jq '.'
# All checks should show "status":"ok"

# Database connectivity
curl http://localhost:8080/health/db
# Expected: {"status":"ok","database":"connected"}
```

### Step 2: Service Functionality Tests

```bash
# Test API endpoints
curl http://localhost:8080/api/v1/devices
curl http://localhost:8080/api/v1/calls/active

# Check device count
DEVICE_COUNT=$(curl -s http://localhost:8080/api/v1/devices | jq 'length')
echo "Devices online: $DEVICE_COUNT"

# Test WebSocket connection (if enabled)
wscat -c ws://localhost:8080/ws
# Should connect successfully
```

### Step 3: End-to-End Test

```bash
# 1. Test ESP32 device can register
# Check device logs or use test device

# 2. Test call can be established
# Initiate test call between two devices

# 3. Verify audio quality
# Listen to test call, check for clear audio

# 4. Check call metrics
curl http://localhost:8080/metrics | grep roip_calls
```

### Step 4: Monitor for Stability

```bash
# Monitor logs for errors (15 minutes)
sudo journalctl -u roip-server -f | grep -i --line-buffered error

# Monitor resource usage
watch -n 10 'echo "=== CPU & Memory ==="; top -b -n 1 | head -10; echo "=== Disk ==="; df -h | grep -v tmpfs'

# Monitor active calls
watch -n 30 'curl -s http://localhost:8080/api/v1/calls/active | jq "length"'

# Check for recurring crashes
ps aux | grep roip-server  # Note the PID
# Wait 15 minutes
ps aux | grep roip-server  # Verify PID hasn't changed
```

### Success Criteria

- ✅ Health checks all passing
- ✅ No errors in logs for 15 minutes
- ✅ ESP32 devices can register successfully
- ✅ Calls can be established and audio is clear
- ✅ Resource usage is normal (CPU <50%, Memory <70%)
- ✅ Response times <200ms for API calls

---

## Prevention

### Proactive Monitoring

```bash
# Add these checks to monitoring system (Prometheus/Nagios)

# 1. Service uptime check (every 1 minute)
systemctl is-active roip-server

# 2. HTTP health check (every 30 seconds)
curl -f http://localhost:8080/health || exit 1

# 3. Response time check (alert if >500ms)
time curl http://localhost:8080/health

# 4. Resource usage alerts
# - CPU >70% for 5 minutes
# - Memory >80% for 5 minutes
# - Disk >85%

# 5. Process count (detect crash-restart loops)
pgrep -c node  # Should be stable, not changing frequently
```

### Capacity Planning

```bash
# Weekly capacity review

# Check trends in resource usage
# CPU trend
sar -u 1 10

# Memory trend
free -h
cat /proc/meminfo

# Disk growth rate
df -h
du -sh /var/log/roip /opt/roip-server

# Database size growth
psql -U roip_user -d roip_production -c "
SELECT pg_size_pretty(pg_database_size('roip_production'));"

# Connection count trends
psql -U roip_user -d roip_production -c "
SELECT count(*) FROM pg_stat_activity;"
```

### Regular Maintenance

```bash
# Weekly maintenance script

#!/bin/bash
# /opt/roip/scripts/weekly-maintenance.sh

# Clean old logs
find /var/log/roip -name "*.log" -mtime +30 -delete
sudo journalctl --vacuum-time=30d

# Clean temp files
find /tmp -name "roip-*" -mtime +7 -delete

# Vacuum database
psql -U roip_user -d roip_production -c "VACUUM ANALYZE;"

# Check for unused indexes
psql -U roip_user -d roip_production -f /opt/roip/scripts/check-indexes.sql

# Verify backups
ls -lh /var/backups/roip/database/ | head -5

# Test restore (on test environment)
# /opt/roip/scripts/test-restore.sh
```

### Auto-Recovery Configuration

```bash
# Configure systemd to auto-restart service

sudo nano /etc/systemd/system/roip-server.service

# Add these lines to [Service] section:
Restart=always
RestartSec=10
StartLimitInterval=200
StartLimitBurst=5

# Reload systemd
sudo systemctl daemon-reload

# This will automatically restart the service if it crashes
# Up to 5 times within 200 seconds
```

### Health Check Endpoints

Ensure your application has comprehensive health checks:

```javascript
// /opt/roip-server/src/health.js

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/health/detailed', async (req, res) => {
  const checks = {
    database: await checkDatabase(),
    redis: await checkRedis(),
    disk: checkDiskSpace(),
    memory: checkMemory(),
  };

  const allOk = Object.values(checks).every(c => c.status === 'ok');
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    checks
  });
});
```

### Documentation

- Keep this runbook updated with lessons learned
- Document any custom configuration or modifications
- Maintain current contact list
- Update recovery time estimates based on actual incidents

---

## Appendix A: Common Error Messages

| Error Message | Cause | Solution |
|---------------|-------|----------|
| "EADDRINUSE" | Port already in use | Kill process on port 8080 |
| "ECONNREFUSED" | Cannot connect to database | Start PostgreSQL |
| "ENOSPC" | No space left on device | Clean logs, expand disk |
| "ENOMEM" | Out of memory | Clear cache, increase heap size |
| "Permission denied" | Wrong file ownership | Fix with chown |
| "Module not found" | Missing dependencies | Run `npm ci` |
| "Invalid configuration" | Config file error | Restore .env from backup |

## Appendix B: Emergency Contacts

- **Primary On-Call**: Check PagerDuty rotation
- **Database Admin**: dba@example.com, +1-555-0100
- **Network Operations**: netops@example.com, +1-555-0101
- **Infrastructure Team**: infra@example.com
- **Security Team**: security@example.com

## Appendix C: Related Runbooks

- [Database Failure Recovery](DATABASE_FAILURE.md)
- [Network Connectivity Issues](../troubleshooting/PERFORMANCE_DEBUG.md)
- [Incident Response](INCIDENT_RESPONSE.md)
- [Disaster Recovery Plan](../disaster-recovery/DR_PLAN.md)

---

**Document Revision History**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-11-22 | Ops Team | Initial version |

**Next Review Date**: 2026-02-22
