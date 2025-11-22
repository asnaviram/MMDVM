# Common Issues and Solutions
## ESP32 RoIP Production System

**Version**: 1.0
**Last Updated**: 2025-11-22

---

## Quick Reference

| Issue | First Check | Quick Fix | Detailed Guide |
|-------|-------------|-----------|----------------|
| Service won't start | `systemctl status roip-server` | `systemctl restart roip-server` | [Server Issues](#server-issues) |
| High CPU | `top` | Restart service | [Performance](#performance-issues) |
| Database slow | `psql -c "SELECT 1;"` | `VACUUM ANALYZE` | [Database](#database-issues) |
| No audio | Check firewall | Open RTP ports | [Audio](#audio-issues) |
| Devices offline | Check SIP port | Verify network | [Connectivity](#connectivity-issues) |

---

## Server Issues

### Issue: Service Won't Start

**Symptoms**: `systemctl start roip-server` fails

**Common Causes**:
1. Port already in use
2. Configuration error
3. Database unavailable
4. Permission issues

**Diagnosis**:
```bash
# Check detailed status
sudo systemctl status roip-server

# Check logs for error
sudo journalctl -u roip-server -n 50

# Check if port in use
sudo lsof -i :8080
```

**Solutions**:
```bash
# 1. Port conflict
sudo kill -9 $(sudo lsof -t -i:8080)
sudo systemctl start roip-server

# 2. Configuration error
cd /opt/roip-server
npm run config:validate
# Fix errors in .env file
sudo systemctl start roip-server

# 3. Database not ready
sudo systemctl status postgresql
sudo systemctl start postgresql
until pg_isready; do sleep 1; done
sudo systemctl start roip-server

# 4. Permission fix
sudo chown -R roip:roip /opt/roip-server
sudo systemctl start roip-server
```

### Issue: Service Crashes Repeatedly

**Symptoms**: Service starts then stops within minutes

**Diagnosis**:
```bash
# Check crash logs
sudo journalctl -u roip-server --since "1 hour ago" | grep -i "error\|exception\|crash"

# Check for OOM
sudo dmesg | grep -i "out of memory\|oom"

# Monitor in real-time
sudo journalctl -u roip-server -f
```

**Solutions**:
```bash
# If out of memory
# Increase Node.js heap
sudo nano /etc/systemd/system/roip-server.service
# Add: Environment="NODE_OPTIONS=--max-old-space-size=4096"
sudo systemctl daemon-reload
sudo systemctl restart roip-server

# If uncaught exception
# Check application logs for stack trace
# Fix code bug or revert to previous version

# If database connection lost
# Increase connection timeout
# Fix database connectivity
```

---

## Database Issues

### Issue: "Too Many Connections"

**Symptoms**: Error message "FATAL: too many clients already"

**Diagnosis**:
```bash
# Check active connections
psql -U roip_user -d roip_production -c "
SELECT count(*), state
FROM pg_stat_activity
GROUP BY state;"

# Check limit
psql -U roip_user -d roip_production -c "SHOW max_connections;"
```

**Solutions**:
```bash
# Terminate idle connections
psql -U roip_user -d roip_production -c "
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle'
  AND state_change < NOW() - INTERVAL '10 minutes'
  AND pid != pg_backend_pid();"

# Reduce application connection pool
sudo nano /opt/roip-server/.env
# DB_POOL_SIZE=20  # Reduce from 50
sudo systemctl restart roip-server

# Or increase max_connections (requires restart)
sudo nano /etc/postgresql/15/main/postgresql.conf
# max_connections = 200  # Up from 100
sudo systemctl restart postgresql
```

### Issue: Slow Queries

**Symptoms**: Database response time >1 second

**Diagnosis**:
```bash
# Find slow queries
psql -U roip_user -d roip_production -c "
SELECT pid, now() - query_start AS duration, state, query
FROM pg_stat_activity
WHERE state = 'active'
ORDER BY duration DESC
LIMIT 10;"

# Check query statistics
psql -U roip_user -d roip_production -c "
SELECT query, calls, mean_time, max_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;"
```

**Solutions**:
```bash
# Update statistics
psql -U roip_user -d roip_production -c "ANALYZE;"

# Vacuum tables
psql -U roip_user -d roip_production -c "VACUUM ANALYZE;"

# Add missing indexes
psql -U roip_user -d roip_production -c "
CREATE INDEX CONCURRENTLY idx_devices_status ON devices(status);"

# Kill long-running query
psql -U roip_user -d roip_production -c "
SELECT pg_terminate_backend(PID);"
```

---

## Performance Issues

### Issue: High CPU Usage

**Symptoms**: CPU >80%, system sluggish

**Diagnosis**:
```bash
# Identify CPU hog
top -b -n 1 | head -20
ps aux --sort=-%cpu | head -10

# Check Node.js threads
pgrep -f roip-server | xargs ps -o pid,psr,pcpu,comm -p
```

**Solutions**:
```bash
# If Node.js using high CPU
# Check for infinite loop in logs
sudo journalctl -u roip-server -n 100

# Restart service
sudo systemctl restart roip-server

# If database using high CPU
# Check for runaway queries
psql -U roip_user -d roip_production -c "
SELECT pid, query
FROM pg_stat_activity
WHERE state = 'active';"

# Scale vertically if sustained high load
# Add more CPU cores
```

### Issue: High Memory Usage

**Symptoms**: Memory >90%, swap heavily used

**Diagnosis**:
```bash
# Check memory usage
free -h
ps aux --sort=-%mem | head -10

# Check for memory leaks
ps -o pid,vsz,rss,cmd -p $(pgrep -f roip-server)
```

**Solutions**:
```bash
# Clear caches
sync; echo 3 | sudo tee /proc/sys/vm/drop_caches

# Restart service to free memory
sudo systemctl restart roip-server

# Increase swap (temporary)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Long-term: Add more RAM or fix memory leak
```

### Issue: Disk Full

**Symptoms**: "No space left on device"

**Diagnosis**:
```bash
# Check disk usage
df -h

# Find large files
du -sh /* | sort -hr | head -10

# Find large logs
find /var/log -type f -size +100M -exec ls -lh {} \;
```

**Solutions**:
```bash
# Clean logs
sudo journalctl --vacuum-size=500M
find /var/log -name "*.log.*" -mtime +7 -delete

# Clean old backups (if local)
find /var/backups/roip -name "*.dump" -mtime +30 -delete

# Clean temp files
sudo find /tmp -type f -atime +7 -delete

# Clean database (reclaim space)
psql -U roip_user -d roip_production -c "VACUUM FULL;"

# Emergency: Remove old call recordings
find /var/roip/recordings -name "*.wav" -mtime +90 -delete

# Long-term: Expand disk or add storage
```

---

## Connectivity Issues

### Issue: Devices Won't Register

**Symptoms**: ESP32 devices show "Registration Failed"

**Diagnosis**:
```bash
# Check SIP port accessible
sudo netstat -tulpn | grep 5060

# Check for SIP traffic
sudo tcpdump -i any -n port 5060 -c 10

# Check device registration logs
curl http://localhost:8080/api/v1/devices | jq '.[] | select(.status=="offline")'

# Check authentication failures
sudo grep "auth" /var/log/roip-server/roip-server.log | tail -20
```

**Solutions**:
```bash
# Verify SIP port open
sudo ufw allow 5060/udp
sudo systemctl reload roip-server

# Check device credentials
psql -U roip_user -d roip_production -c "
SELECT id, username, active
FROM devices
WHERE username = 'esp32_001';"

# Reset device password
psql -U roip_user -d roip_production -c "
UPDATE devices
SET password = crypt('newpassword', gen_salt('bf'))
WHERE username = 'esp32_001';"

# Restart SIP service
sudo systemctl restart roip-server
```

### Issue: Network Timeouts

**Symptoms**: Intermittent connection drops

**Diagnosis**:
```bash
# Test network connectivity
ping -c 100 <device-ip>

# Check packet loss
ping -c 100 8.8.8.8 | grep "packet loss"

# Check network errors
ip -s link show

# Monitor connections
watch -n 1 'netstat -an | grep ESTABLISHED | wc -l'
```

**Solutions**:
```bash
# Increase timeouts
sudo nano /opt/roip-server/.env
# SIP_TIMEOUT=10000  # Up from 5000
# RTP_TIMEOUT=60     # Up from 30

sudo systemctl restart roip-server

# Check firewall not blocking
sudo ufw status | grep 5060

# Check for network congestion
iftop -n

# Enable TCP keepalive
sudo sysctl -w net.ipv4.tcp_keepalive_time=60
```

---

## Audio Issues

### Issue: One-Way Audio

**Symptoms**: Can hear but not speak (or vice versa)

**Diagnosis**:
```bash
# Check RTP ports open
sudo ufw status | grep 10000

# Check firewall blocking
sudo iptables -L -n | grep 10000

# Monitor RTP traffic
sudo tcpdump -i any -n udp port 10000-10100 -c 20

# Check NAT configuration
curl http://localhost:8080/api/v1/devices/$DEVICE_ID | jq '.nat_type'
```

**Solutions**:
```bash
# Open RTP ports
sudo ufw allow 10000:10100/udp
sudo iptables -A INPUT -p udp --dport 10000:10100 -j ACCEPT

# Enable TURN relay
curl -X PATCH http://localhost:8080/api/v1/devices/$DEVICE_ID/settings \
  -d '{"force_turn": true}'

# Check TURN server running
sudo systemctl status coturn

# Verify codec negotiation
curl http://localhost:8080/api/v1/calls/$CALL_ID | jq '.negotiated_codec'
```

### Issue: Poor Audio Quality

**Symptoms**: Choppy, robotic, or garbled audio

**Diagnosis**:
```bash
# Check packet loss
curl http://localhost:8080/api/v1/calls/$CALL_ID/metrics | jq '.packet_loss'

# Check jitter
curl http://localhost:8080/api/v1/calls/$CALL_ID/metrics | jq '.jitter_ms'

# Check network quality
ping -c 100 <device-ip> | grep "packet loss"

# Check call quality metrics
curl http://localhost:8080/metrics | grep roip_call_quality
```

**Solutions**:
```bash
# Enable FEC (Forward Error Correction)
curl -X PATCH http://localhost:8080/api/v1/devices/$DEVICE_ID/settings \
  -d '{"fec_enabled": true}'

# Increase jitter buffer
curl -X PATCH http://localhost:8080/api/v1/devices/$DEVICE_ID/settings \
  -d '{"jitter_buffer_ms": 100}'

# Reduce codec bitrate (if bandwidth limited)
curl -X PATCH http://localhost:8080/api/v1/devices/$DEVICE_ID/settings \
  -d '{"opus_bitrate": 24000}'

# Enable QoS
sudo iptables -t mangle -A OUTPUT -p udp --dport 10000:10100 -j DSCP --set-dscp-class ef
```

---

## Certificate Issues

### Issue: SSL Certificate Expired

**Symptoms**: HTTPS fails, browser shows warning

**Diagnosis**:
```bash
# Check certificate expiry
sudo certbot certificates

# Verify certificate
openssl x509 -in /etc/letsencrypt/live/roip.example.com/cert.pem -noout -dates
```

**Solutions**:
```bash
# Renew certificate
sudo certbot renew

# Force renewal if not yet due
sudo certbot renew --force-renewal

# If renewal fails, get new certificate
sudo certbot certonly --standalone -d roip.example.com

# Reload nginx
sudo systemctl reload nginx

# Verify new certificate
openssl s_client -connect roip.example.com:443 -servername roip.example.com < /dev/null 2>/dev/null | openssl x509 -noout -dates
```

---

## Monitoring/Alerting Issues

### Issue: No Metrics in Grafana

**Symptoms**: Dashboards show no data

**Diagnosis**:
```bash
# Check Prometheus
curl http://localhost:9090/metrics

# Check if Prometheus scraping
curl http://localhost:9090/api/v1/targets

# Check application metrics endpoint
curl http://localhost:8080/metrics
```

**Solutions**:
```bash
# Restart Prometheus
sudo systemctl restart prometheus

# Check Prometheus config
sudo nano /etc/prometheus/prometheus.yml

# Verify scrape targets
# Ensure roip-server metrics endpoint is listed

# Restart Grafana
sudo systemctl restart grafana-server

# Re-import dashboards if needed
```

---

## Emergency Procedures

### Complete System Failure

```bash
# 1. Check if server accessible
ping roip-server.example.com

# 2. If accessible, check services
ssh roip-server.example.com
sudo systemctl status roip-server postgresql nginx

# 3. Check logs
sudo journalctl -xe | tail -100

# 4. Restart services
sudo systemctl restart roip-server postgresql nginx

# 5. If still failed, reboot
sudo reboot

# 6. If cannot access server
# Contact infrastructure team or cloud provider
```

### Data Corruption

```bash
# 1. Stop application immediately
sudo systemctl stop roip-server

# 2. Backup corrupted database
sudo -u postgres pg_dump roip_production > /tmp/corrupted-$(date +%Y%m%d_%H%M%S).sql

# 3. Restore from latest backup
# See disaster-recovery/BACKUP_RESTORATION.md

# 4. Verify data
psql -U roip_user -d roip_production -c "SELECT count(*) FROM devices;"

# 5. Restart application
sudo systemctl start roip-server
```

---

## Getting Help

### Information to Collect Before Escalating

```bash
#!/bin/bash
# Collect diagnostic information

mkdir -p /tmp/diagnostics-$(date +%Y%m%d_%H%M%S)
cd /tmp/diagnostics-$(date +%Y%m%d_%H%M%S)

# System info
uname -a > system-info.txt
uptime >> system-info.txt
free -h >> system-info.txt
df -h >> system-info.txt

# Service status
systemctl status roip-server > service-status.txt
systemctl status postgresql >> service-status.txt
systemctl status nginx >> service-status.txt

# Logs
sudo journalctl -u roip-server -n 500 > roip-server.log
sudo tail -500 /var/log/postgresql/postgresql-*-main.log > postgresql.log

# Configuration (sanitize passwords first!)
sudo cp /opt/roip-server/.env .env.backup
sed -i 's/PASSWORD=.*/PASSWORD=REDACTED/g' .env.backup

# Network
ss -tulpn > network.txt
sudo iptables -L -n > firewall.txt

# Create archive
cd ..
tar -czf diagnostics-$(date +%Y%m%d_%H%M%S).tar.gz diagnostics-$(date +%Y%m%d_%H%M%S)/

echo "Diagnostic package created: $(pwd)/diagnostics-$(date +%Y%m%d_%H%M%S).tar.gz"
```

### Escalation

See [ON_CALL_GUIDE.md](../escalation/ON_CALL_GUIDE.md) for escalation procedures.

---

## Related Documentation

- [SERVER_DOWNTIME.md](../runbooks/SERVER_DOWNTIME.md)
- [DATABASE_FAILURE.md](../runbooks/DATABASE_FAILURE.md)
- [CALL_QUALITY_ISSUES.md](../runbooks/CALL_QUALITY_ISSUES.md)
- [PERFORMANCE_DEBUG.md](PERFORMANCE_DEBUG.md)
- [LOG_ANALYSIS.md](LOG_ANALYSIS.md)

---

**Document Version**: 1.0
**Last Updated**: 2025-11-22
**Next Review**: 2026-02-22
