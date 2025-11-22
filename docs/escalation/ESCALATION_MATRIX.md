# Escalation Matrix
## ESP32 RoIP Production System

**Version**: 1.0
**Last Updated**: 2025-11-22

---

## Escalation Levels

```
┌─────────────────────────────────────────────────────────────┐
│                    Escalation Hierarchy                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Level 4: VP Engineering / CTO                              │
│           (P0 only, major business impact)                  │
│                        ↑                                     │
│  Level 3: Engineering Manager                               │
│           (P0 after 1h, P1 after 2h, all security)         │
│                        ↑                                     │
│  Level 2: Senior Engineer / Team Lead                       │
│           (P0 after 30min, P1 after 1h, complex issues)    │
│                        ↑                                     │
│  Level 1: On-Call Engineer (Primary Response)              │
│           (All incidents, first responder)                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Level 1: On-Call Engineer

### Responsibilities

- **First responder** for all alerts
- **Triage** and assess severity
- **Resolve** common issues using runbooks
- **Escalate** when needed
- **Document** all actions taken
- **Communicate** status to stakeholders

### Response Time SLAs

| Severity | Acknowledge | Begin Work | First Update |
|----------|-------------|------------|--------------|
| P0 | 5 min | Immediate | 15 min |
| P1 | 15 min | 15 min | 30 min |
| P2 | 1 hour | 2 hours | 4 hours |
| P3 | 4 hours | 8 hours | 24 hours |

### Escalation Triggers

**Escalate to L2 if**:
- Cannot resolve within 30 minutes (P0)
- Cannot resolve within 1 hour (P1)
- Incident requires expertise beyond L1
- Multiple simultaneous P0/P1 incidents
- Unsure of root cause or solution
- Security incident suspected

### Contact Information

- **Current On-Call**: Check PagerDuty rotation
- **PagerDuty**: https://roip.pagerduty.com
- **Slack**: @oncall in #operations
- **Phone**: Via PagerDuty app
- **Backup On-Call**: Check PagerDuty secondary

---

## Level 2: Senior Engineer / Team Lead

### Responsibilities

- **Advanced troubleshooting** of complex issues
- **Guide** L1 engineers
- **Make technical decisions** for fixes
- **Coordinate** with other teams (DBA, Network, etc.)
- **Update** runbooks based on new scenarios
- **Approve** risky changes during incidents

### Response Time

- **P0**: Respond within 15 minutes of escalation
- **P1**: Respond within 30 minutes of escalation
- **P2**: Respond within 2 hours of escalation

### Escalation Triggers

**Escalate to L3 if**:
- P0 incident not resolved after 1 hour
- P1 incident not resolved after 2 hours
- Incident requires management decision (e.g., extended outage, rollback major release)
- Customer-facing impact significant
- Media/PR implications
- Security breach confirmed

### Contact Information

| Name | Phone | Email | Slack | Availability |
|------|-------|-------|-------|-------------|
| Senior Engineer 1 | +1-555-0111 | senior1@example.com | @senior1 | Mon-Fri 9-5 UTC |
| Senior Engineer 2 | +1-555-0112 | senior2@example.com | @senior2 | Weekends |
| Team Lead | +1-555-0113 | teamlead@example.com | @teamlead | Always |

**Escalation Method**:
```bash
# PagerDuty:
# 1. Open incident in PagerDuty
# 2. Click "Add Responder"
# 3. Select "Senior Engineer" escalation policy

# Slack:
# Post in #incidents:
# "🔺 Escalating to L2: [incident details]
#  @senior-engineer or @team-lead"

# Phone (urgent P0):
# Call Team Lead directly: +1-555-0113
```

---

## Level 3: Engineering Manager

### Responsibilities

- **Business decision making** for incidents
- **Resource allocation** (adding more engineers)
- **External communication** (customers, press)
- **Post-incident review** oversight
- **Process improvements** from incidents
- **Escalation** to executive level if needed

### Response Time

- **P0**: Respond within 30 minutes of escalation
- **P1**: Respond within 1 hour of escalation
- Security incidents: Immediate notification required

### Escalation Triggers

**Escalate to L4 if**:
- P0 incident exceeds 2 hours
- Multiple simultaneous P0 incidents
- Data breach affecting >1000 users
- Financial impact >$100k
- Requires C-level decision
- Media/legal involvement

### Contact Information

| Name | Phone | Email | Slack | Backup |
|------|-------|-------|-------|--------|
| Engineering Manager | +1-555-0102 | manager@example.com | @eng-manager | +1-555-0104 |

**Escalation Method**:
```bash
# Email + Phone for P0:
# Call: +1-555-0102
# Email: manager@example.com with subject "P0: [brief description]"

# Slack for P1/P2:
# @eng-manager in #incidents with summary
```

---

## Level 4: VP Engineering / CTO

### Responsibilities

- **Executive decision making**
- **Customer executive communication**
- **Press/media coordination**
- **Legal/compliance** decisions
- **Major business impact** mitigation

### Response Time

- Notified immediately for all P0 incidents >1 hour
- Responds at discretion based on business impact

### Contact Information

| Name | Phone | Email | Assistant |
|------|-------|-------|-----------|
| VP Engineering | +1-555-0105 | vp@example.com | assistant@example.com |
| CTO | +1-555-0106 | cto@example.com | exec-assistant@example.com |

**Escalation Method**:
- Through Engineering Manager only
- Include business impact assessment
- Prepare incident summary and timeline

---

## Specialized Escalations

### Database Issues

**Database Administrator Team**

| Severity | Contact | Response Time |
|----------|---------|---------------|
| Critical | +1-555-0100 | 15 minutes |
| High | dba@example.com | 1 hour |
| Medium | Slack @dba-team | 4 hours |

**When to Escalate**:
- Database corruption detected
- Replication failure (HA setups)
- Performance degradation >50%
- Cannot resolve connection issues
- Need to restore from backup

**Escalation Process**:
```bash
# Critical (P0):
# 1. Call DBA on-call: +1-555-0100
# 2. Email: dba@example.com
# 3. Slack: @dba-team in #database

# Include in escalation:
# - Database logs: tail -100 /var/log/postgresql/postgresql-*-main.log
# - Connection count: psql -c "SELECT count(*) FROM pg_stat_activity;"
# - Error messages
# - Actions already attempted
```

### Network Issues

**Network Operations Team**

| Contact | Phone | Email | Slack |
|---------|-------|-------|-------|
| NetOps On-Call | +1-555-0103 | netops@example.com | @netops |

**When to Escalate**:
- Complete network outage
- DDoS attack in progress
- Firewall issues
- Routing problems
- ISP outage

**Escalation Process**:
```bash
# Include network diagnostics:
ping -c 10 8.8.8.8
traceroute roip.example.com
ss -s
netstat -i

# Describe symptoms:
# - Packet loss percentage
# - Affected services/ports
# - Geographic scope
```

### Security Incidents

**Security Team**

| Severity | Contact | Response Time |
|----------|---------|---------------|
| Critical Breach | +1-555-0200 | Immediate |
| High | security@example.com | 15 minutes |
| Medium | Slack @security | 1 hour |

**ALWAYS Escalate For**:
- Suspected data breach
- Unauthorized access detected
- DDoS attack
- Malware/ransomware
- Credential theft
- Any security-related P0/P1

**Escalation Process**:
```bash
# DO NOT investigate deeply (preserve evidence)
# DO NOT reboot servers (destroys evidence)

# 1. Immediately notify security team
# 2. Isolate affected systems if safe to do so
# 3. Preserve logs
# 4. Document timeline
# 5. Follow Security Team instructions

# See SECURITY_INCIDENT.md for detailed procedures
```

### Infrastructure / Cloud Provider

**AWS / Cloud Provider Support**

| Issue Type | Support Level | Contact |
|------------|---------------|---------|
| Production Down | Business Critical | +1-888-774-0015 |
| Performance | High | AWS Console Support |
| Billing/Account | Standard | support.aws.amazon.com |

**When to Escalate**:
- EC2 instance unreachable
- RDS database failure
- S3 bucket access issues
- Billing spike
- Service limit reached

---

## Escalation Decision Tree

```
┌─────────────────────────────────────────┐
│       Incident Detected                 │
└────────────┬────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────┐
│  L1: Assess Severity                   │
│  - Check health endpoints              │
│  - Review logs                         │
│  - Determine impact                    │
└────────────┬───────────────────────────┘
             │
             ▼
┌────────────────────────────────────────┐
│  Can resolve with runbook?             │
└─────┬──────────────────────┬───────────┘
      │ YES                  │ NO
      ▼                      ▼
┌──────────────┐    ┌────────────────────┐
│  Resolve     │    │  Escalate to L2    │
│  Document    │    │  (Senior Engineer) │
│  Close       │    └────────┬───────────┘
└──────────────┘             │
                             ▼
                ┌────────────────────────────┐
                │  L2: Advanced diagnosis     │
                │  Can resolve?               │
                └─────┬──────────────┬────────┘
                      │ YES          │ NO
                      ▼              ▼
              ┌───────────┐  ┌──────────────┐
              │  Resolve  │  │ Escalate L3  │
              │  Document │  │ (Manager)    │
              │  Close    │  └──────┬───────┘
              └───────────┘         │
                                    ▼
                        ┌───────────────────────┐
                        │ L3: Business Decision │
                        │ Major incident?       │
                        └────┬──────────┬───────┘
                             │ YES      │ NO
                             ▼          ▼
                      ┌──────────┐  ┌─────────┐
                      │ Escalate │  │ Resolve │
                      │ to L4    │  │  Close  │
                      └──────────┘  └─────────┘
```

---

## Escalation Checklist

### Before Escalating

- [ ] Attempted resolution using runbooks
- [ ] Collected diagnostic information
- [ ] Documented what was tried
- [ ] Assessed severity correctly
- [ ] Determined technical expertise needed
- [ ] Prepared summary for next level

### During Escalation

- [ ] Choose appropriate escalation path
- [ ] Contact via primary method (PagerDuty/Phone)
- [ ] Provide clear, concise summary
- [ ] Share relevant logs/diagnostics
- [ ] Remain available for questions
- [ ] Continue monitoring situation

### After Escalation

- [ ] Document escalation in incident ticket
- [ ] Continue assisting as needed
- [ ] Update stakeholders on who's leading
- [ ] Don't leave until properly handed off
- [ ] Follow up on resolution

---

## Communication During Escalation

### Escalation Summary Template

```
ESCALATION TO L[2/3/4]

Incident ID: INC-YYYYMMDD-NNN
Severity: P[0/1/2/3]
Start Time: [UTC timestamp]
Escalation Time: [UTC timestamp]

SUMMARY:
[1-2 sentence description of issue]

IMPACT:
- Users affected: [Number/percentage]
- Services affected: [List]
- Business impact: [Description]

ACTIONS TAKEN:
1. [Action 1]
2. [Action 2]
3. [Action 3]

CURRENT STATUS:
[Current state of system]

EXPERTISE NEEDED:
[Why escalating - specific expertise or decision needed]

ATTACHED:
- Logs: [Location]
- Diagnostics: [Location]
- Screenshots: [If relevant]

ESCALATED BY: [Your name]
CONTACT: [Your phone/Slack]
```

---

## SLA Tracking

### Response Time Metrics

| Level | Target Response | Actual (Last 30 days) | Trend |
|-------|-----------------|----------------------|-------|
| L1 P0 | 5 min | [Metrics from PagerDuty] | ↑↓→ |
| L1 P1 | 15 min | [Metrics] | ↑↓→ |
| L2 P0 | 15 min | [Metrics] | ↑↓→ |
| L3 P0 | 30 min | [Metrics] | ↑↓→ |

### Escalation Rate

```bash
# Track escalation rate monthly
# Goal: <20% of incidents require escalation

# Query incident database:
# - Total incidents
# - Escalated incidents
# - Escalation rate by severity
```

---

## Contact Directory

### Quick Reference

| Role | Primary Contact | Backup | Slack Channel |
|------|----------------|--------|---------------|
| L1 On-Call | PagerDuty | PagerDuty Secondary | #operations |
| L2 Senior Eng | +1-555-0111 | +1-555-0112 | #incidents |
| L3 Manager | +1-555-0102 | +1-555-0104 | #engineering |
| L4 VP/CTO | +1-555-0105 | +1-555-0106 | Direct only |
| DBA Team | +1-555-0100 | dba@example.com | #database |
| NetOps | +1-555-0103 | netops@example.com | #network |
| Security | +1-555-0200 | security@example.com | #security |
| Support | support@example.com | N/A | #support |

### External Vendors

| Vendor | Service | Contact | Account # |
|--------|---------|---------|-----------|
| AWS | Infrastructure | +1-888-774-0015 | XXXX-XXXX-XXXX |
| CloudFlare | CDN/Security | support.cloudflare.com | Account ID: XXXX |
| PagerDuty | Alerting | support@pagerduty.com | Acct: roip |
| Let's Encrypt | SSL Certs | community.letsencrypt.org | N/A |

---

## Related Documentation

- [ON_CALL_GUIDE.md](ON_CALL_GUIDE.md)
- [INCIDENT_RESPONSE.md](../runbooks/INCIDENT_RESPONSE.md)
- [SECURITY_INCIDENT.md](../runbooks/SECURITY_INCIDENT.md)

---

**Document Version**: 1.0
**Last Updated**: 2025-11-22
**Next Review**: 2026-02-22
**Maintained By**: Operations Team
