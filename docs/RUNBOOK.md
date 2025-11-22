# ESP32 RoIP System - Production Runbook

## Table of Contents
1. [Common Operational Procedures](#common-operational-procedures)
2. [Troubleshooting Guide](#troubleshooting-guide)
3. [Incident Response](#incident-response)
4. [Scaling Procedures](#scaling-procedures)
5. [Maintenance Windows](#maintenance-windows)
6. [Emergency Procedures](#emergency-procedures)
7. [On-Call Reference](#on-call-reference)

---

## Common Operational Procedures

### Starting Services

```bash
# Start all services (Docker Compose)
cd /opt/roip
docker-compose -f deployment/docker-compose.prod.yml up -d

# Start individual services (systemd)
sudo systemctl start roip-server
sudo systemctl start postgresql
sudo systemctl start coturn
sudo systemctl start nginx

# Verify services are running
sudo systemctl status roip-server
docker-compose -f deployment/docker-compose.prod.yml ps
```

### Stopping Services

```bash
# Stop all services gracefully (Docker Compose)
docker-compose -f deployment/docker-compose.prod.yml down

# Stop individual services (systemd)
sudo systemctl stop roip-server
sudo systemctl stop postgresql
sudo systemctl stop coturn

# Force stop if necessary
sudo systemctl kill -s SIGKILL roip-server
```

### Restarting Services

```bash
# Graceful restart
sudo systemctl restart roip-server

# Reload configuration without restart
sudo systemctl reload roip-server

# Docker restart
docker-compose -f deployment/docker-compose.prod.yml restart roip-server
```

### Checking Service Health

```bash
# API health check
curl -i http://localhost:8080/health

# Detailed health check
curl http://localhost:8080/health/detailed | jq '.'

# Database health
curl http://localhost:8080/health/db

# Check active calls
curl http://localhost:8080/api/v1/calls/active

# Check registered devices
curl http://localhost:8080/api/v1/devices | jq '.[] | select(.status=="online")'
```

### Viewing Logs

```bash
# Real-time logs (Docker)
docker-compose -f deployment/docker-compose.prod.yml logs -f roip-server

# Real-time logs (systemd)
sudo journalctl -u roip-server -f

# Last 100 lines
sudo journalctl -u roip-server -n 100

# Logs with specific priority
sudo journalctl -u roip-server -p err

# Application logs
tail -f /opt/roip-server/logs/roip-server.log

# Filter logs by level
grep ERROR /opt/roip-server/logs/roip-server.log

# JSON logs analysis
cat /opt/roip-server/logs/roip-server.log | jq 'select(.level=="error")'
```

### Database Operations

```bash
# Connect to database
psql -U roip_user -d roip_production

# Check database size
psql -U roip_user -d roip_production -c "SELECT pg_size_pretty(pg_database_size('roip_production'));"

# Check table sizes
psql -U roip_user -d roip_production -c "
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;"

# Active connections
psql -U roip_user -d roip_production -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';"

# Long-running queries
psql -U roip_user -d roip_production -c "
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active' AND now() - pg_stat_activity.query_start > interval '5 seconds'
ORDER BY duration DESC;"

# Kill slow query
psql -U roip_user -d roip_production -c "SELECT pg_terminate_backend(PID);"
```

### Backup Operations

```bash
# Manual backup
sudo /usr/local/bin/backup-postgres.sh

# Full system backup
cd /opt/roip/deployment/backup
sudo ./backup.sh full

# Database only backup
sudo ./backup.sh database

# Verify latest backup
ls -lh /var/backups/roip/database/ | head

# List S3 backups
aws s3 ls s3://roip-backups/database/ --recursive
```

### Certificate Management

```bash
# Check certificate expiry
sudo certbot certificates

# Renew certificates
sudo certbot renew

# Force renewal
sudo certbot renew --force-renewal

# Test renewal (dry run)
sudo certbot renew --dry-run
```

---

## Troubleshooting Guide

### Server Not Starting

**Symptoms**: Service fails to start, exits immediately

**Diagnosis**:
```bash
# Check service status
sudo systemctl status roip-server

# Check recent logs
sudo journalctl -u roip-server -n 50 --no-pager

# Check if port is already in use
sudo netstat -tulpn | grep 8080
sudo lsof -i :8080

# Check configuration syntax
cd /opt/roip-server
npm run config:validate
```

**Resolution**:
1. Check environment variables in `/opt/roip-server/.env`
2. Verify database connectivity: `psql -U roip_user -h localhost -d roip_production`
3. Check file permissions: `ls -la /opt/roip-server`
4. Kill conflicting process: `sudo kill -9 $(lsof -t -i:8080)`
5. Clear stale PID files: `sudo rm -f /var/run/roip-server.pid`

### High CPU Usage

**Symptoms**: CPU >80%, slow response times

**Diagnosis**:
```bash
# Check CPU usage
top -b -n 1 | head -20
htop

# Check process CPU
ps aux --sort=-%cpu | head

# Check Node.js process details
pgrep -a node
ps -p $(pgrep node) -o pid,ppid,cmd,%mem,%cpu

# Profile application
node --prof /opt/roip-server/src/server.js
```

**Resolution**:
1. Check for runaway processes: `top`
2. Analyze slow queries in database
3. Check for infinite loops in logs
4. Restart service if CPU doesn't drop
5. Scale horizontally if persistent high load

### High Memory Usage

**Symptoms**: Memory >80%, OOM errors

**Diagnosis**:
```bash
# Check memory usage
free -h
cat /proc/meminfo

# Check process memory
ps aux --sort=-%mem | head

# Check for memory leaks
node --inspect /opt/roip-server/src/server.js
# Then connect with Chrome DevTools

# Check V8 heap size
node -e 'console.log(v8.getHeapStatistics())'
```

**Resolution**:
1. Check for memory leaks in application logs
2. Restart service to clear memory
3. Increase Node.js heap size: `NODE_OPTIONS="--max-old-space-size=4096"`
4. Enable garbage collection logging
5. Scale vertically (add more RAM) if persistent

### Database Connection Issues

**Symptoms**: "Too many connections", connection timeouts

**Diagnosis**:
```bash
# Check active connections
psql -U roip_user -d roip_production -c "
SELECT count(*), state
FROM pg_stat_activity
GROUP BY state;"

# Check connection limit
psql -U roip_user -d roip_production -c "SHOW max_connections;"

# Check connection pool
grep DB_POOL_SIZE /opt/roip-server/.env

# Test connectivity
psql -U roip_user -h localhost -d roip_production -c "SELECT 1;"
```

**Resolution**:
1. Kill idle connections:
   ```sql
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE state = 'idle'
   AND state_change < current_timestamp - interval '5 minutes';
   ```
2. Increase max_connections in postgresql.conf
3. Reduce DB_POOL_SIZE in application
4. Check for connection leaks in application

### Call Quality Issues

**Symptoms**: Choppy audio, dropped calls, high latency

**Diagnosis**:
```bash
# Check RTP metrics
curl http://localhost:8080/metrics | grep rtp

# Check network stats
ss -s
netstat -i
iftop -n

# Check packet loss
ping -c 100 8.8.8.8 | tail -2

# Check jitter and latency
iperf3 -c <remote-server> -u -b 100k

# Check TURN server
curl http://localhost:8080/api/v1/turn/status
```

**Resolution**:
1. Check network bandwidth: `iftop`
2. Verify QoS settings on router
3. Check for network congestion
4. Verify TURN server is running
5. Check firewall isn't blocking RTP ports
6. Adjust codec bitrate in configuration

### ESP32 Devices Not Connecting

**Symptoms**: Devices offline, registration failures

**Diagnosis**:
```bash
# Check SIP registrations
curl http://localhost:8080/api/v1/devices | jq '.[] | {name, status, last_registered}'

# Check SIP traffic
sudo tcpdump -i any -n port 5060

# Check authentication failures
sudo journalctl -u roip-server | grep "auth failed"

# Check network connectivity
ping <esp32-ip>
```

**Resolution**:
1. Verify device credentials in database
2. Check SIP realm configuration matches
3. Verify firewall allows SIP port 5060
4. Check STUN/TURN server accessibility
5. Review ESP32 device logs
6. Check WiFi connectivity on device

### Audio One-Way or No Audio

**Symptoms**: Can hear but not speak, or vice versa

**Diagnosis**:
```bash
# Check RTP ports open
sudo netstat -tulpn | grep -E '10000|10100'

# Check NAT traversal
curl http://localhost:8080/api/v1/devices/<device-id> | jq '.nat_type'

# Check TURN relay usage
curl http://localhost:8080/metrics | grep turn_relay_active

# Capture RTP traffic
sudo tcpdump -i any -n udp port 10000-10100 -w rtp_capture.pcap
```

**Resolution**:
1. Verify RTP port range (10000-10100) is open in firewall
2. Check TURN server is functioning
3. Verify NAT traversal is working
4. Check for symmetric NAT issues
5. Review SDP negotiation in logs
6. Test with different codec

### High API Response Time

**Symptoms**: API calls taking >1 second

**Diagnosis**:
```bash
# Check API metrics
curl http://localhost:8080/metrics | grep http_request_duration

# Test API response time
time curl http://localhost:8080/api/v1/devices

# Check database query time
psql -U roip_user -d roip_production -c "
SELECT query, mean_time, calls
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;"

# Check load
uptime
```

**Resolution**:
1. Identify slow queries in database
2. Add database indexes if needed
3. Enable query caching
4. Increase database connection pool
5. Scale application servers
6. Enable Redis caching

---

## Incident Response

### Severity Levels

| Level | Description | Response Time | Escalation |
|-------|-------------|---------------|------------|
| P0 - Critical | Complete outage, data loss | 15 minutes | Immediate |
| P1 - High | Major functionality broken | 1 hour | After 2 hours |
| P2 - Medium | Degraded performance | 4 hours | After 8 hours |
| P3 - Low | Minor issues, cosmetic bugs | 24 hours | After 48 hours |

### P0 - Critical Incident Response

1. **Acknowledge** (Within 5 minutes)
   - Acknowledge alert in PagerDuty/Slack
   - Post to status page: "Investigating issue"

2. **Assess** (Within 15 minutes)
   ```bash
   # Quick health check
   curl http://localhost:8080/health
   sudo systemctl status roip-server
   docker-compose ps

   # Check logs for errors
   sudo journalctl -u roip-server -n 100 | grep ERROR

   # Check resource usage
   top -b -n 1 | head -20
   df -h
   ```

3. **Mitigate** (Within 30 minutes)
   - If database down: Restore from replica or backup
   - If server down: Restart service or failover
   - If DDoS: Enable rate limiting, block IPs

4. **Communicate**
   - Update status page every 30 minutes
   - Notify stakeholders via email
   - Post updates in incident Slack channel

5. **Resolve**
   - Verify all services restored
   - Update status page: "Issue resolved"
   - Schedule post-mortem

6. **Post-Mortem** (Within 48 hours)
   - Document timeline
   - Identify root cause
   - List action items
   - Assign owners and deadlines

### Incident Communication Template

```
[INCIDENT] RoIP Service Degradation

Status: Investigating / Identified / Monitoring / Resolved
Severity: P0 / P1 / P2 / P3
Start Time: 2025-11-22 14:35 UTC
Impact: [Describe user impact]
Affected Components: [List affected services]

Timeline:
14:35 - Issue detected via monitoring alerts
14:40 - Incident acknowledged, investigation started
14:50 - Root cause identified: [description]
15:00 - Mitigation applied: [description]
15:15 - Service restored, monitoring

Next Update: 15:45 UTC or when status changes

Incident Commander: [Name]
Communication Lead: [Name]
```

---

## Scaling Procedures

### Vertical Scaling (Add Resources)

**When**: CPU >70% sustained, Memory >80% sustained

**Procedure**:
```bash
# 1. Schedule maintenance window
# 2. Create snapshot/backup
aws ec2 create-snapshot --volume-id vol-xxxxx

# 3. Stop service
sudo systemctl stop roip-server

# 4. Resize instance (AWS Console or CLI)
aws ec2 modify-instance-attribute --instance-id i-xxxxx --instance-type t3.large

# 5. Start instance
aws ec2 start-instances --instance-ids i-xxxxx

# 6. Verify and start service
sudo systemctl start roip-server
curl http://localhost:8080/health
```

### Horizontal Scaling (Add Servers)

**When**: Active calls >80% capacity, response time >500ms

**Docker Swarm**:
```bash
# Scale service
docker service scale roip-server=3

# Verify
docker service ls
docker service ps roip-server
```

**Kubernetes**:
```bash
# Manual scaling
kubectl scale deployment roip-server --replicas=3 -n roip-production

# Verify
kubectl get pods -n roip-production
kubectl get hpa -n roip-production
```

**Load Balancer Configuration**:
```bash
# Add server to load balancer
# Update nginx upstream configuration
sudo nano /etc/nginx/conf.d/roip-upstream.conf

upstream roip_backend {
    least_conn;
    server 10.0.1.10:8080 max_fails=3 fail_timeout=30s;
    server 10.0.1.11:8080 max_fails=3 fail_timeout=30s;  # New server
    server 10.0.1.12:8080 max_fails=3 fail_timeout=30s;  # New server
}

# Reload nginx
sudo nginx -t
sudo systemctl reload nginx
```

---

## Maintenance Windows

### Weekly Maintenance (Low Priority Updates)

**Schedule**: Every Sunday 02:00-04:00 UTC

**Tasks**:
- Security patches (non-critical)
- Log rotation and cleanup
- Database maintenance (VACUUM, ANALYZE)
- Backup verification

**Procedure**:
```bash
# 1. Announce maintenance
# 2. Apply updates
sudo apt update && sudo apt upgrade -y

# 3. Database maintenance
psql -U roip_user -d roip_production -c "VACUUM ANALYZE;"

# 4. Clean old logs
find /opt/roip-server/logs -name "*.log" -mtime +30 -delete

# 5. Verify backups
cd /opt/roip/deployment/backup
./backup.sh --verify

# 6. Restart services if needed
sudo systemctl restart roip-server

# 7. Smoke tests
curl http://localhost:8080/health
```

### Monthly Maintenance (Major Updates)

**Schedule**: First Sunday of month, 02:00-06:00 UTC

**Tasks**:
- Major version updates
- Database schema migrations
- Performance optimization
- Disaster recovery testing

### Emergency Maintenance

**Trigger**: Critical security patches, P0 incidents

**Notification**: Minimum 30 minutes notice via status page

---

## Emergency Procedures

### Complete Datacenter Failure

1. **Activate DR Site**
   ```bash
   # Update DNS to DR site
   aws route53 change-resource-record-sets \
     --hosted-zone-id Z123456 \
     --change-batch file://dr-dns-update.json

   # Start services on DR
   ssh dr-server
   cd /opt/roip
   docker-compose up -d
   ```

2. **Restore Latest Backup**
   ```bash
   cd /opt/roip/deployment/backup
   ./restore.sh database s3://roip-backups/database/roip_db_latest.dump.gz
   ```

3. **Verify Services**
   ```bash
   curl https://roip-dr.example.com/health
   ```

### Database Corruption

1. **Stop Application**
   ```bash
   sudo systemctl stop roip-server
   ```

2. **Restore from Backup**
   ```bash
   cd /opt/roip/deployment/backup
   ./restore.sh database <timestamp>
   ```

3. **Verify Database**
   ```bash
   psql -U roip_user -d roip_production -c "SELECT COUNT(*) FROM devices;"
   ```

4. **Start Application**
   ```bash
   sudo systemctl start roip-server
   ```

### Security Breach

1. **Isolate** - Disconnect affected systems
2. **Assess** - Determine scope and impact
3. **Contain** - Change all credentials, rotate keys
4. **Eradicate** - Remove malicious code/access
5. **Recover** - Restore from clean backup
6. **Document** - Full incident report
7. **Report** - Notify affected users, authorities if required

---

## On-Call Reference

### Quick Commands

```bash
# Service status
systemctl status roip-server

# Active calls
curl localhost:8080/api/v1/calls/active | jq length

# Recent errors
journalctl -u roip-server -p err -n 50

# Restart service
systemctl restart roip-server

# Database connections
psql -U roip_user -d roip_production -c "SELECT count(*) FROM pg_stat_activity;"

# Disk space
df -h

# Memory
free -h

# Top processes
top -b -n 1 | head -20
```

### Contact List

- **Primary On-Call**: +1-555-0100
- **Secondary On-Call**: +1-555-0101
- **Database Admin**: dba@example.com
- **Network Team**: network@example.com
- **Security Team**: security@example.com

### Escalation Path

1. **L1**: On-call engineer (respond within 15 min)
2. **L2**: Senior engineer (escalate after 1 hour)
3. **L3**: Engineering manager (escalate after 2 hours)
4. **L4**: CTO (P0 incidents only)

### Runbook Version

**Version**: 1.0
**Last Updated**: 2025-11-22
**Next Review**: 2026-02-22
**Owner**: DevOps Team
