# On-Call Engineer Guide
## ESP32 RoIP Production System

**Version**: 1.0
**Last Updated**: 2025-11-22

---

## On-Call Responsibilities

### Primary Responsibilities

1. **Respond to alerts within SLA**
   - P0: 5 minutes
   - P1: 15 minutes
   - P2: 1 hour
   - P3: 4 hours

2. **Triage and resolve incidents**
   - Use runbooks for common issues
   - Escalate when needed
   - Document all actions taken

3. **Communicate status**
   - Update status page
   - Notify stakeholders
   - Post updates in #incidents

4. **Perform scheduled tasks**
   - Daily health checks (if assigned)
   - Backup verification
   - Certificate renewal monitoring

---

## On-Call Rotation

### Schedule

Check current on-call rotation in PagerDuty:
- Web: https://roip.pagerduty.com
- Mobile: PagerDuty app
- Phone: Call +1-555-ONCALL

### Handoff Procedure

**At Start of Shift** (receive handoff):
```bash
# Review handoff notes from previous on-call
cat /var/log/roip/oncall-handoff-latest.txt

# Check current system status
curl http://localhost:8080/health | jq '.'

# Review open incidents
# Check PagerDuty for open alerts
# Review #incidents channel in Slack

# Acknowledge you're on-call
# Post in #operations: "On-call shift started, all systems nominal"
```

**At End of Shift** (handoff):
```bash
# Create handoff document
cat > /var/log/roip/oncall-handoff-$(date +%Y%m%d_%H%M).txt <<EOF
On-Call Handoff - $(date)
========================

SYSTEM STATUS
-------------
Services: All running
Active Calls: $(curl -s http://localhost:8080/api/v1/calls/active | jq 'length')
Online Devices: $(curl -s http://localhost:8080/api/v1/devices | jq '[.[] | select(.status=="online")] | length')

INCIDENTS THIS SHIFT
--------------------
[List any incidents with INC numbers]

ONGOING ISSUES
--------------
[List any known issues being monitored]

PENDING TASKS
-------------
[List any tasks for next shift]

NOTES
-----
[Any other important information]

Handed off by: [Your Name]
Next on-call: [Check PagerDuty]
EOF

# Post handoff in #operations
cat /var/log/roip/oncall-handoff-$(date +%Y%m%d_%H%M).txt | \
  mail -s "On-Call Handoff" ops@example.com

# Update latest handoff symlink
ln -sf /var/log/roip/oncall-handoff-$(date +%Y%m%d_%H%M).txt \
  /var/log/roip/oncall-handoff-latest.txt
```

---

## Alert Response Workflow

### Step 1: Alert Notification (0-2 minutes)

**You will be notified via**:
- PagerDuty phone call
- PagerDuty mobile push
- Slack @mention in #alerts
- Email (backup)

**Acknowledge the alert**:
1. Press 4 on PagerDuty phone call
2. Or tap "Acknowledge" in mobile app
3. Or react with :eyes: in Slack

### Step 2: Initial Assessment (2-5 minutes)

```bash
# Quick triage script
#!/bin/bash
# Save as /opt/roip/scripts/triage.sh

echo "=== Quick Triage - $(date) ==="

# Check all services
echo -e "\nServices:"
for svc in roip-server postgresql coturn nginx; do
  systemctl is-active $svc || echo "❌ $svc DOWN"
done

# Check health
echo -e "\nHealth Check:"
curl -s http://localhost:8080/health | jq '.' || echo "❌ API Down"

# Check recent errors
echo -e "\nRecent Errors (last 10):"
sudo journalctl -u roip-server -p err -n 10 --no-pager

# Check resources
echo -e "\nResources:"
echo "CPU: $(top -b -n 1 | grep "Cpu" | awk '{print $2}')"
echo "Mem: $(free | awk 'NR==2{printf "%.0f%%", $3*100/$2}')"
echo "Disk: $(df -h / | awk 'NR==2{print $5}')"
```

**Determine severity**:
- Is the system completely down? → P0
- Are multiple users affected? → P1
- Is it isolated to one user/device? → P2
- Is it a false alarm? → P3 or resolve

### Step 3: Response (5-30 minutes)

**P0/P1 Response**:
1. Post to #incidents Slack channel
2. Update status page: "Investigating"
3. Use appropriate runbook:
   - [SERVER_DOWNTIME.md](../runbooks/SERVER_DOWNTIME.md)
   - [DATABASE_FAILURE.md](../runbooks/DATABASE_FAILURE.md)
   - [CALL_QUALITY_ISSUES.md](../runbooks/CALL_QUALITY_ISSUES.md)
   - [SECURITY_INCIDENT.md](../runbooks/SECURITY_INCIDENT.md)

**P2/P3 Response**:
1. Investigate issue
2. Document findings
3. Resolve or escalate
4. Update ticket

### Step 4: Resolution (Variable)

**After resolving**:
1. Update status page: "Resolved"
2. Post to #incidents: "Resolved" with summary
3. Resolve PagerDuty alert
4. Document actions in incident ticket
5. Monitor for 15 minutes to ensure stability

**If cannot resolve**:
1. Escalate (see Escalation Matrix)
2. Stay on call until handoff
3. Keep stakeholders updated

---

## Common Scenarios and Quick Fixes

### Scenario 1: Server Unresponsive

```bash
# 1. Check if server accessible
ping roip-server.example.com

# 2. Check services
ssh roip-server.example.com
sudo systemctl status roip-server

# 3. Quick fix attempt
sudo systemctl restart roip-server

# 4. Verify
curl http://localhost:8080/health

# If still down → Escalate and use SERVER_DOWNTIME.md runbook
```

### Scenario 2: High Alert Volume

```bash
# Check what's alerting
curl http://localhost:9090/api/v1/alerts | jq '.data.alerts[] | {name: .labels.alertname, severity: .labels.severity}'

# Common causes:
# - Monitoring system issue (false alarms)
# - Actual incident causing multiple symptoms
# - Configuration change

# Quick fix:
# 1. Identify root cause
# 2. Fix root cause (stops cascade of alerts)
# 3. Or silence non-critical alerts temporarily
```

### Scenario 3: Database Connection Issues

```bash
# 1. Check PostgreSQL
sudo systemctl status postgresql

# 2. Check connections
psql -U roip_user -d roip_production -c "
SELECT count(*), state FROM pg_stat_activity GROUP BY state;"

# 3. If too many connections
psql -U roip_user -d roip_production -c "
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle' AND state_change < NOW() - INTERVAL '10 minutes';"

# 4. Restart application
sudo systemctl restart roip-server

# See DATABASE_FAILURE.md for details
```

### Scenario 4: Disk Space Full

```bash
# 1. Check disk usage
df -h

# 2. Find large files
du -sh /* | sort -hr | head -10

# 3. Quick cleanup
sudo journalctl --vacuum-size=500M
find /var/log -name "*.log.*" -mtime +7 -delete
find /tmp -type f -atime +7 -delete

# 4. Verify
df -h

# If persistent issue → Escalate for disk expansion
```

### Scenario 5: SSL Certificate Expiry

```bash
# 1. Check expiry
sudo certbot certificates

# 2. Renew
sudo certbot renew

# 3. Reload nginx
sudo systemctl reload nginx

# 4. Verify
openssl s_client -connect roip.example.com:443 < /dev/null 2>/dev/null | \
  openssl x509 -noout -dates
```

---

## Escalation Guidelines

### When to Escalate

**Escalate Immediately if**:
- P0 incident (complete outage)
- Security breach suspected
- Data loss/corruption
- Cannot resolve within SLA
- Unsure how to proceed

**Escalate After Attempting Resolution if**:
- Issue persists after following runbook
- Root cause unclear
- Fix requires expertise you don't have
- Incident duration >1 hour (P1) or >2 hours (P2)

### How to Escalate

**Level 1 → Level 2** (Senior Engineer):
```bash
# Via PagerDuty:
# 1. Add responder in PagerDuty incident
# 2. Select "Senior Engineer" or specific person
# 3. Add note explaining what you've tried

# Via Slack:
# Post in #incidents:
# "🔺 Escalating INC-123 to L2
#  Issue: [Brief description]
#  Attempted: [What you've tried]
#  Current status: [Current state]
#  @senior-engineer"

# Via Phone (if urgent):
# Call secondary on-call: +1-555-0101
```

**Level 2 → Level 3** (Engineering Manager):
```bash
# For P0 only or if L2 cannot resolve after 1 hour
# Contact: manager@example.com or +1-555-0102
```

See [ESCALATION_MATRIX.md](ESCALATION_MATRIX.md) for complete escalation paths.

---

## Communication

### Status Page Updates

```bash
# Access status page admin
# https://status.roip.example.com/admin

# Template for incident update:
Title: [Service Degradation / Partial Outage / Complete Outage]

Status: Investigating / Identified / Monitoring / Resolved

Message:
We are currently investigating [issue description].
[Affected services/features]
[Workaround if available]
Next update: [Time]

# Update every 30 minutes for P0/P1
# Update when status changes
```

### Stakeholder Notifications

**For P0 incidents**:
- Email management immediately
- Post in #incidents (Slack)
- Update status page
- Email affected customers (if external)

**For P1 incidents**:
- Post in #incidents (Slack)
- Update status page
- Email management after 1 hour if not resolved

**For P2/P3**:
- Post in #incidents (Slack)
- Status page optional
- No management notification unless prolonged

### Communication Templates

See [INCIDENT_RESPONSE.md](../runbooks/INCIDENT_RESPONSE.md) for detailed templates.

---

## Tools and Access

### Required Access

- [ ] SSH access to production servers
- [ ] PagerDuty account (admin)
- [ ] Grafana access (editor)
- [ ] Prometheus access
- [ ] Database access (roip_user)
- [ ] GitHub repository access
- [ ] Slack #incidents, #operations channels
- [ ] Status page admin
- [ ] AWS/Cloud provider console (if applicable)

### Credentials Location

```bash
# Credentials stored in password manager
# 1Password vault: "RoIP Production"

# SSH keys: ~/.ssh/roip-production
# Database password: In /opt/roip-server/.env (on server)
# API tokens: In 1Password
```

### Key URLs

| Service | URL | Purpose |
|---------|-----|---------|
| Production API | https://roip.example.com | Main service |
| Grafana | https://grafana.roip.example.com | Monitoring |
| Prometheus | https://prometheus.roip.example.com | Metrics |
| Status Page | https://status.roip.example.com | Public status |
| PagerDuty | https://roip.pagerduty.com | Alerts |
| GitHub | https://github.com/org/roip | Code |

---

## Daily Tasks (If On-Call During Business Hours)

### Morning Check (09:00 UTC)

```bash
# Run daily health check
/opt/roip/scripts/daily-health-check.sh

# Check for overnight incidents
grep "$(date -d yesterday +%Y-%m-%d)" /var/log/roip/incidents.log

# Review backup status
ls -lh /var/backups/roip/database/ | head -5

# Post status in #operations
# "☀️ Morning check complete, all systems healthy"
```

### Evening Check (17:00 UTC)

```bash
# Run end-of-day report
/opt/roip/scripts/daily-report.sh

# Review day's metrics
# Check Grafana for any trends

# Verify backups scheduled
crontab -l | grep backup
```

---

## Emergency Contacts

### Primary Contacts

| Role | Name | Phone | Email | Slack |
|------|------|-------|-------|-------|
| On-Call Primary | Check PagerDuty | | | @oncall |
| On-Call Secondary | Check PagerDuty | +1-555-0101 | | @oncall-backup |
| Database Admin | DBA Team | +1-555-0100 | dba@example.com | @dba-team |
| Network Ops | NetOps | +1-555-0103 | netops@example.com | @netops |
| Security Team | Security | +1-555-0200 | security@example.com | @security |
| Engineering Manager | Manager | +1-555-0102 | manager@example.com | @eng-manager |

### External Contacts

| Service | Contact | Use For |
|---------|---------|---------|
| AWS Support | +1-888-AMAZON | Infrastructure issues |
| CloudFlare | support.cloudflare.com | CDN/DNS issues |
| Let's Encrypt | community.letsencrypt.org | Certificate issues |
| ISP | +1-XXX-XXXX | Network outage |

---

## Self-Care

### On-Call Fatigue

- Take breaks between incidents
- Sleep schedule: 8 hours minimum
- Escalate if overwhelmed
- Handoff if personal emergency
- Use vacation/PTO for recovery

### Alert Fatigue

- If getting too many false alarms, document them
- Work with team to improve alert quality
- Silence non-critical alerts during sleep hours
- Use PagerDuty schedules for sleep window

### Stress Management

- Don't panic - follow runbooks
- Ask for help when needed
- Document everything - helps next person
- Learn from incidents - improve runbooks
- Debrief after major incidents

---

## Handoff Documentation

Keep these updated:
- `/var/log/roip/oncall-handoff-latest.txt` - Latest handoff notes
- `#operations` Slack channel - Status posts
- PagerDuty - Incident notes
- Incident tracking system - All incidents logged

---

## Training and Resources

### Required Reading

- [ ] [INCIDENT_RESPONSE.md](../runbooks/INCIDENT_RESPONSE.md)
- [ ] [SERVER_DOWNTIME.md](../runbooks/SERVER_DOWNTIME.md)
- [ ] [DATABASE_FAILURE.md](../runbooks/DATABASE_FAILURE.md)
- [ ] [COMMON_ISSUES.md](../troubleshooting/COMMON_ISSUES.md)
- [ ] [ESCALATION_MATRIX.md](ESCALATION_MATRIX.md)

### Recommended Reading

- [ ] [CALL_QUALITY_ISSUES.md](../runbooks/CALL_QUALITY_ISSUES.md)
- [ ] [SECURITY_INCIDENT.md](../runbooks/SECURITY_INCIDENT.md)
- [ ] [PERFORMANCE_DEBUG.md](../troubleshooting/PERFORMANCE_DEBUG.md)
- [ ] [DR_PLAN.md](../disaster-recovery/DR_PLAN.md)

### Shadow Shifts

Before being primary on-call:
- Shadow experienced on-call for 1 week
- Review past incidents
- Practice using runbooks in test environment

---

## Quick Reference Card

**Print and keep handy**:

```
===================================
RoIP ON-CALL QUICK REFERENCE
===================================

TRIAGE:
$ ssh roip-server
$ sudo systemctl status roip-server
$ curl http://localhost:8080/health
$ sudo journalctl -u roip-server -p err -n 20

QUICK FIXES:
Restart: sudo systemctl restart roip-server
DB cleanup: psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state='idle'..."
Logs: sudo journalctl --vacuum-size=500M
Disk: find /tmp -atime +7 -delete

ESCALATE:
L1→L2: +1-555-0101 (Senior Engineer)
L2→L3: +1-555-0102 (Manager)
Security: +1-555-0200
DBA: +1-555-0100

RUNBOOKS:
/home/user/MMDVM/docs/runbooks/
/home/user/MMDVM/docs/troubleshooting/

STATUS:
https://status.roip.example.com/admin

MONITORING:
https://grafana.roip.example.com

===================================
```

---

**Document Version**: 1.0
**Last Updated**: 2025-11-22
**Next Review**: 2026-02-22
