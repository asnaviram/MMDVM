# Incident Response Runbook
## ESP32 RoIP Production System

**Version**: 1.0
**Last Updated**: 2025-11-22
**Owner**: Operations Team
**Review Cycle**: Quarterly

---

## Table of Contents

1. [Overview](#overview)
2. [Incident Classification](#incident-classification)
3. [Incident Response Process](#incident-response-process)
4. [Communication Templates](#communication-templates)
5. [Severity Definitions](#severity-definitions)
6. [Response Time SLAs](#response-time-slas)
7. [Escalation Procedures](#escalation-procedures)
8. [Post-Incident Review](#post-incident-review)

---

## Overview

This runbook defines the incident response procedures for the ESP32 RoIP production system. It provides step-by-step guidance for handling incidents from detection through resolution and post-mortem.

### Goals

- Minimize service disruption and downtime
- Ensure rapid incident detection and response
- Maintain clear communication with stakeholders
- Document incidents for continuous improvement
- Prevent incident recurrence

### Scope

This runbook covers all production incidents affecting:
- RoIP server infrastructure
- Database services
- Network connectivity
- ESP32 device connectivity
- Call quality and audio services
- Web dashboard and API

---

## Incident Classification

### Incident Severity Matrix

| Severity | Impact | Examples | Response Time |
|----------|--------|----------|---------------|
| **P0 - Critical** | Complete service outage, data loss | Server down, database corruption, security breach | 15 minutes |
| **P1 - High** | Major functionality degraded | Call quality issues affecting all users, SIP registration failures | 1 hour |
| **P2 - Medium** | Partial functionality affected | Single device offline, intermittent audio issues | 4 hours |
| **P3 - Low** | Minor issues, workaround available | UI bugs, non-critical feature issues | 24 hours |
| **P4 - Info** | Informational, no impact | Planned maintenance, monitoring alerts | 48 hours |

### Service Impact Classification

```
┌─────────────────────────────────────────────────────────────┐
│                    Impact Assessment                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Critical: >50% of users unable to make/receive calls       │
│  High:     Call quality degraded for >25% of users          │
│  Medium:   Single feature/component unavailable             │
│  Low:      Cosmetic issues, limited user impact             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Incident Response Process

### Phase 1: Detection and Acknowledgment (0-5 minutes)

**Objective**: Detect and acknowledge the incident immediately

1. **Incident Detection Sources**
   - Automated monitoring alerts (Prometheus, Grafana)
   - User reports (support tickets, emails)
   - Internal team observations
   - Health check failures

2. **Immediate Actions**
   ```bash
   # Acknowledge alert in monitoring system
   # PagerDuty: Press '4' to acknowledge via phone
   # Slack: React with :eyes: emoji to incident notification

   # Create incident ticket
   # Record incident start time
   # Note initial symptoms
   ```

3. **Initial Communication**
   - Post to #incidents Slack channel
   - Update status page: "Investigating"
   - Notify on-call team leads

**Example Initial Message**:
```
🚨 INCIDENT DETECTED - P1
Time: 2025-11-22 14:35 UTC
Symptoms: Multiple SIP registration failures
Affected: ~30 devices
Incident Commander: @john.doe
Status: INVESTIGATING
```

### Phase 2: Triage and Assessment (5-15 minutes)

**Objective**: Understand scope and severity

1. **Quick Health Checks**
   ```bash
   # Check all services
   curl -s http://localhost:8080/health | jq '.'
   sudo systemctl status roip-server postgresql coturn nginx
   docker-compose ps

   # Check resource usage
   top -b -n 1 | head -20
   df -h
   free -h

   # Check active connections
   curl http://localhost:8080/api/v1/devices | jq 'length'
   curl http://localhost:8080/api/v1/calls/active | jq 'length'
   ```

2. **Review Recent Changes**
   ```bash
   # Check deployment history
   git log -n 5 --oneline

   # Check recent restarts
   sudo journalctl -u roip-server --since "1 hour ago" | grep -i restart

   # Check recent configuration changes
   sudo find /etc/roip -mtime -1 -ls
   ```

3. **Check Error Logs**
   ```bash
   # Application errors (last 100 lines)
   sudo journalctl -u roip-server -n 100 | grep -i error

   # Database errors
   sudo tail -100 /var/log/postgresql/postgresql-*-main.log | grep ERROR

   # System errors
   sudo tail -100 /var/log/syslog | grep -i error
   ```

4. **Determine Severity**
   - Count affected users
   - Assess functionality impact
   - Check if workaround exists
   - Classify using severity matrix above

### Phase 3: Incident Command Structure (10-20 minutes)

**Objective**: Organize response team and assign roles

**Roles and Responsibilities**:

1. **Incident Commander (IC)**
   - Overall incident coordination
   - Decision-making authority
   - Declares incident resolved
   - Ensures post-mortem completed

2. **Technical Lead (TL)**
   - Technical investigation and resolution
   - Executes remediation steps
   - Provides status updates to IC
   - Documents technical findings

3. **Communication Lead (CL)**
   - Stakeholder communication
   - Status page updates
   - Customer notifications
   - Internal team updates

4. **Scribe**
   - Document timeline
   - Record decisions made
   - Capture command outputs
   - Note action items

**Team Formation**:
```
For P0/P1 incidents:
- IC: Senior engineer or on-call lead
- TL: On-call engineer + backup
- CL: Support team lead
- Scribe: Junior engineer or automated logging

For P2/P3 incidents:
- IC + TL: Same person (on-call engineer)
- CL: As needed
- Scribe: Automated logging
```

### Phase 4: Investigation and Diagnosis (15-45 minutes)

**Objective**: Identify root cause

**Investigation Checklist**:

- [ ] Review monitoring dashboards
- [ ] Check recent deployments/changes
- [ ] Review error logs (application, database, system)
- [ ] Check resource utilization (CPU, memory, disk, network)
- [ ] Verify external dependencies (DNS, network, third-party APIs)
- [ ] Check database health and connections
- [ ] Review recent alerts and patterns
- [ ] Consult runbooks for similar incidents

**Common Diagnosis Commands**:

```bash
# Check active calls and quality
curl http://localhost:8080/api/v1/calls/active | jq '.[] | {from, to, duration, quality}'

# Check SIP registrations
curl http://localhost:8080/api/v1/devices | jq '.[] | select(.status=="online") | {name, last_registered}'

# Check RTP metrics
curl http://localhost:8080/metrics | grep rtp_

# Database connection status
psql -U roip_user -d roip_production -c "
SELECT count(*), state
FROM pg_stat_activity
GROUP BY state;"

# Network connectivity
ping -c 5 8.8.8.8
ss -tulpn | grep -E '5060|8080|10000'

# Check disk I/O
iostat -x 1 5

# Process details
ps aux --sort=-%cpu | head -20
ps aux --sort=-%mem | head -20
```

**Pattern Recognition**:

Look for patterns in logs:
```bash
# Identify error patterns
sudo journalctl -u roip-server --since "1 hour ago" | grep -i error | sort | uniq -c | sort -rn

# Time-based analysis
sudo journalctl -u roip-server --since "2025-11-22 14:00:00" --until "2025-11-22 14:30:00"

# Correlation with system events
sudo grep -i "oom\|killed\|segfault" /var/log/syslog
```

### Phase 5: Mitigation and Resolution (Variable)

**Objective**: Restore service as quickly as possible

**Mitigation Strategies** (in priority order):

1. **Quick Fixes** (Try first if safe)
   ```bash
   # Restart service (if appears hung)
   sudo systemctl restart roip-server

   # Clear cache (if memory issues)
   sync; echo 3 | sudo tee /proc/sys/vm/drop_caches

   # Kill problematic process (if identified)
   sudo kill -9 <PID>

   # Increase limits temporarily
   ulimit -n 65536
   ```

2. **Service Isolation** (If specific component failing)
   ```bash
   # Disable problematic feature
   # Edit /opt/roip-server/.env
   ENABLE_FEATURE_X=false
   sudo systemctl restart roip-server

   # Route around failed component
   # Update nginx to bypass service
   ```

3. **Rollback** (If recent deployment caused issue)
   ```bash
   # Docker rollback
   docker-compose down
   docker tag roip-server:latest roip-server:broken
   docker tag roip-server:previous roip-server:latest
   docker-compose up -d

   # Git rollback
   cd /opt/roip-server
   git log --oneline -n 10
   git checkout <previous-commit>
   npm ci --production
   sudo systemctl restart roip-server
   ```

4. **Database Recovery** (If database issues)
   ```bash
   # Restart database
   sudo systemctl restart postgresql

   # Kill long-running queries
   psql -U roip_user -d roip_production -c "
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE state = 'active'
   AND now() - pg_stat_activity.query_start > interval '5 minutes';"

   # Restore from backup (last resort)
   # See DATABASE_FAILURE.md
   ```

5. **Failover** (For HA deployments)
   ```bash
   # Promote standby database
   sudo -u postgres pg_ctl promote -D /var/lib/postgresql/15/standby

   # Update DNS to DR site
   aws route53 change-resource-record-sets \
     --hosted-zone-id ZXXXXX \
     --change-batch file://dr-dns.json

   # Start services on DR server
   ssh dr-server "cd /opt/roip && docker-compose up -d"
   ```

**Validation After Mitigation**:
```bash
# Verify services healthy
curl http://localhost:8080/health
curl http://localhost:8080/health/db
curl http://localhost:8080/health/detailed | jq '.'

# Check metrics returning to normal
curl http://localhost:8080/metrics | grep -E 'cpu|memory|calls'

# Test end-to-end functionality
# - ESP32 can register
# - Calls can be established
# - Audio quality is good
# - API responds quickly

# Monitor for 15 minutes to ensure stability
watch -n 10 'curl -s http://localhost:8080/health | jq ".status"'
```

### Phase 6: Monitoring and Validation (30-60 minutes)

**Objective**: Ensure issue is fully resolved and stable

**Monitoring Checklist**:

- [ ] All services reporting healthy
- [ ] No error spikes in logs
- [ ] Resource utilization normal
- [ ] Active calls stable
- [ ] Device registration success rate >95%
- [ ] API response times <200ms
- [ ] No new related alerts firing

**Extended Monitoring**:
```bash
# Monitor for recurring issues
while true; do
  curl -s http://localhost:8080/health | jq -c '{time: now, status: .status, checks: .checks}'
  sleep 30
done

# Monitor logs for errors
sudo journalctl -u roip-server -f | grep -i --line-buffered error

# Monitor metrics
watch -n 5 'curl -s http://localhost:8080/metrics | grep -E "roip_calls_active|roip_devices_online|roip_errors_total"'
```

### Phase 7: Communication and Closure (15-30 minutes)

**Objective**: Inform stakeholders and close incident

1. **Resolution Announcement**
   ```
   ✅ INCIDENT RESOLVED - P1

   Incident ID: INC-2025-1122-001
   Duration: 1 hour 25 minutes (14:35 - 16:00 UTC)

   Root Cause: Database connection pool exhaustion due to
   connection leak in SIP registration handler

   Resolution:
   - Restarted roip-server service
   - Applied hotfix to close database connections properly
   - Increased connection pool size from 20 to 50

   Impact: Approximately 30 devices unable to register for
   45 minutes. No data loss. Calls in progress were not affected.

   Follow-up:
   - Post-mortem scheduled for 2025-11-23 10:00 UTC
   - Permanent fix to be deployed in next release
   - Additional monitoring added for connection pool metrics

   Incident Commander: @john.doe
   ```

2. **Status Page Update**
   - Mark incident as resolved
   - Summarize issue and resolution
   - Thank users for patience

3. **Internal Notification**
   - Post resolution summary to #incidents
   - Notify management of P0/P1 incidents
   - Update incident tracking system

4. **Incident Closure**
   ```bash
   # Mark incident as resolved in ticketing system
   # Schedule post-mortem meeting
   # Assign action items from incident
   # Archive incident logs and timeline
   ```

---

## Communication Templates

### P0 - Critical Incident

**Initial Notification** (Within 5 minutes):
```
🚨 CRITICAL INCIDENT - P0

Incident ID: INC-{DATE}-{NUMBER}
Time Detected: {UTC_TIME}
Status: INVESTIGATING

Impact: {DESCRIPTION OF IMPACT}
Affected Users: {NUMBER/PERCENTAGE}
Affected Services: {LIST OF SERVICES}

Current Status: Team is investigating the root cause and
working on immediate mitigation.

Incident Commander: {NAME}
Next Update: {TIME} or when status changes

Live Status: https://status.roip.example.com
```

**Progress Update** (Every 15-30 minutes):
```
📊 INCIDENT UPDATE - P0

Incident ID: INC-{DATE}-{NUMBER}
Elapsed Time: {DURATION}

Current Status: {INVESTIGATING/MITIGATING/MONITORING}

Findings:
- {FINDING 1}
- {FINDING 2}

Actions Taken:
- {ACTION 1}
- {ACTION 2}

Next Steps:
- {NEXT STEP 1}
- {NEXT STEP 2}

Next Update: {TIME}
```

**Resolution Notice**:
```
✅ INCIDENT RESOLVED - P0

Incident ID: INC-{DATE}-{NUMBER}
Duration: {TOTAL_DURATION}
Resolution Time: {UTC_TIME}

Root Cause: {ROOT_CAUSE_SUMMARY}

Resolution:
- {RESOLUTION_STEP_1}
- {RESOLUTION_STEP_2}

Impact Summary:
- Users Affected: {NUMBER/PERCENTAGE}
- Duration: {TIME}
- Data Loss: {YES/NO + DETAILS}

Preventative Actions:
- {PREVENTION_1}
- {PREVENTION_2}

Post-Mortem: {SCHEDULED_DATE_TIME}

We apologize for the disruption and thank you for your patience.
```

### P1 - High Severity

**Initial Notification** (Within 15 minutes):
```
⚠️  HIGH SEVERITY INCIDENT - P1

Incident ID: INC-{DATE}-{NUMBER}
Status: INVESTIGATING

Impact: {DESCRIPTION}
Affected: {SCOPE}

We are actively investigating and will provide updates
every 30 minutes.

Status Page: https://status.roip.example.com
```

### P2 - Medium Severity

**Notification** (Within 1 hour):
```
ℹ️  SERVICE DEGRADATION - P2

Issue: {DESCRIPTION}
Impact: {SCOPE}
Workaround: {IF_AVAILABLE}

We are working to resolve this issue. Updates will be
posted on our status page.
```

---

## Severity Definitions

### P0 - Critical

**Definition**: Complete service outage or critical functionality unavailable affecting majority of users

**Examples**:
- RoIP server completely down (HTTP 500/503)
- Database unavailable or corrupted
- Security breach or data leak
- All ESP32 devices unable to register
- Complete loss of audio in all calls

**Response**:
- Immediate acknowledgment (5 min)
- All-hands response if needed
- Hourly executive updates
- Public status page updates every 15 min

**Escalation**: Automatic to VP Engineering

### P1 - High

**Definition**: Major functionality degraded, significant user impact, no workaround

**Examples**:
- Call quality issues affecting >25% of users
- SIP registration failures (but service up)
- Database performance degraded >50%
- Intermittent service availability

**Response**:
- Acknowledge within 15 min
- Dedicated engineer assigned
- Updates every 30 min
- Status page updated

**Escalation**: To senior engineer after 1 hour

### P2 - Medium

**Definition**: Partial functionality affected, workaround available

**Examples**:
- Single ESP32 device offline
- Web dashboard slow but functional
- Non-critical API endpoints failing
- Monitoring alerts but no user impact

**Response**:
- Acknowledge within 1 hour
- Standard investigation
- Updates as significant progress made
- May not require status page update

**Escalation**: To team lead after 4 hours

### P3 - Low

**Definition**: Minor issues, cosmetic bugs, minimal impact

**Examples**:
- UI rendering issues
- Non-critical log errors
- Documentation errors
- Feature requests disguised as bugs

**Response**:
- Acknowledge within 24 hours
- Schedule for next sprint
- No emergency response needed

**Escalation**: Standard ticket escalation

---

## Response Time SLAs

| Severity | Acknowledge | Begin Investigation | First Update | Resolution Target |
|----------|-------------|-------------------|--------------|------------------|
| P0 | 5 minutes | Immediately | 15 minutes | 1-2 hours |
| P1 | 15 minutes | 15 minutes | 30 minutes | 2-4 hours |
| P2 | 1 hour | 2 hours | 4 hours | 8-24 hours |
| P3 | 4 hours | 24 hours | 24 hours | 1-2 weeks |
| P4 | 24 hours | As scheduled | N/A | As scheduled |

---

## Escalation Procedures

See [ESCALATION_MATRIX.md](../escalation/ESCALATION_MATRIX.md) for detailed escalation paths.

**Quick Reference**:

```
Level 1: On-Call Engineer (Primary Response)
  ↓ (No progress after 1 hour for P1, 30 min for P0)
Level 2: Senior Engineer / Team Lead
  ↓ (No progress after 2 hours for P1, 1 hour for P0)
Level 3: Engineering Manager
  ↓ (P0 only, or major incidents)
Level 4: VP Engineering / CTO
```

---

## Post-Incident Review

### Post-Mortem Meeting

**Timing**: Within 48 hours of incident resolution

**Attendees**:
- Incident Commander
- Technical Lead
- Communication Lead
- Engineering Manager
- Product Manager (if user-facing impact)
- Affected team members

**Agenda** (60 minutes):
1. Timeline review (10 min)
2. Root cause analysis (15 min)
3. What went well (10 min)
4. What could be improved (15 min)
5. Action items (10 min)

### Post-Mortem Document Template

```markdown
# Post-Mortem: {Incident Title}

**Incident ID**: INC-{DATE}-{NUMBER}
**Date**: {INCIDENT_DATE}
**Duration**: {TOTAL_DURATION}
**Severity**: P{0-4}
**Incident Commander**: {NAME}

## Summary

{2-3 sentence summary of what happened}

## Impact

- **Users Affected**: {NUMBER/PERCENTAGE}
- **Duration**: {TIME}
- **Revenue Impact**: {IF_APPLICABLE}
- **Data Loss**: {YES/NO + DETAILS}
- **Functionality Affected**: {LIST}

## Timeline

All times in UTC

| Time | Event |
|------|-------|
| 14:35 | Monitoring alert: High error rate |
| 14:37 | Incident acknowledged |
| 14:40 | Investigation began |
| 14:50 | Root cause identified |
| 15:00 | Mitigation applied |
| 15:30 | Service restored |
| 16:00 | Incident closed |

## Root Cause

{Detailed technical explanation of what caused the incident}

### Contributing Factors

1. {FACTOR_1}
2. {FACTOR_2}
3. {FACTOR_3}

## Detection

- **Detection Method**: {HOW_WAS_IT_DETECTED}
- **Detection Time**: {TIME_FROM_START_TO_DETECTION}
- **Detection Quality**: {GOOD/NEEDS_IMPROVEMENT}

## Response

### What Went Well

1. {POSITIVE_1}
2. {POSITIVE_2}

### What Could Be Improved

1. {IMPROVEMENT_1}
2. {IMPROVEMENT_2}

## Resolution

{Describe how the incident was resolved}

## Action Items

| Action | Owner | Deadline | Status |
|--------|-------|----------|--------|
| {ACTION_1} | {NAME} | {DATE} | Open |
| {ACTION_2} | {NAME} | {DATE} | Open |

## Lessons Learned

1. {LESSON_1}
2. {LESSON_2}

## Prevention

Steps to prevent recurrence:

1. {PREVENTION_MEASURE_1}
2. {PREVENTION_MEASURE_2}
```

### Action Item Tracking

- Create tickets for each action item
- Assign owners and deadlines
- Review in weekly ops meeting
- Track completion rate
- Update runbooks with learnings

---

## Appendix

### Useful Commands Reference

```bash
# Quick health check
curl -s http://localhost:8080/health | jq '.'

# Service status
sudo systemctl status roip-server postgresql coturn nginx

# Recent errors
sudo journalctl -u roip-server -p err -n 50

# Active calls
curl -s http://localhost:8080/api/v1/calls/active | jq 'length'

# Resource usage
top -b -n 1 | head -20
free -h
df -h

# Database connections
psql -U roip_user -d roip_production -c "SELECT count(*) FROM pg_stat_activity;"

# Network connectivity
ss -tulpn | grep -E '5060|8080|10000'
```

### Contact Information

- **Primary On-Call**: See PagerDuty rotation
- **Incident Slack Channel**: #incidents
- **Status Page**: https://status.roip.example.com
- **Runbook Repository**: https://github.com/yourorg/roip-runbooks
- **Monitoring Dashboard**: https://grafana.roip.example.com

### Related Runbooks

- [Server Downtime Recovery](SERVER_DOWNTIME.md)
- [Database Failure Recovery](DATABASE_FAILURE.md)
- [Call Quality Issues](CALL_QUALITY_ISSUES.md)
- [Security Incident Response](SECURITY_INCIDENT.md)
- [Escalation Matrix](../escalation/ESCALATION_MATRIX.md)

---

**Document Revision History**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-11-22 | Ops Team | Initial version |

**Next Review Date**: 2026-02-22
