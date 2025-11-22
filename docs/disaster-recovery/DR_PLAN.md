# Disaster Recovery Plan
## ESP32 RoIP Production System

**Version**: 1.0
**Last Updated**: 2025-11-22
**Classification**: CONFIDENTIAL

---

## Executive Summary

This document defines the disaster recovery (DR) strategy, procedures, and responsibilities for the ESP32 RoIP production system. The plan ensures business continuity in the event of catastrophic failures, natural disasters, or other events that render the primary production environment unavailable.

### Recovery Objectives

| Metric | Target | Rationale |
|--------|--------|-----------|
| **RTO** (Recovery Time Objective) | 1 hour | Maximum acceptable downtime |
| **RPO** (Recovery Point Objective) | 15 minutes | Maximum acceptable data loss |
| **Service Availability** | 99.9% | Three nines uptime target |

---

## Table of Contents

1. [Disaster Scenarios](#disaster-scenarios)
2. [DR Architecture](#dr-architecture)
3. [Recovery Procedures](#recovery-procedures)
4. [Failover Procedures](#failover-procedures)
5. [Failback Procedures](#failback-procedures)
6. [Testing and Validation](#testing-and-validation)
7. [Roles and Responsibilities](#roles-and-responsibilities)

---

## Disaster Scenarios

### Scenario 1: Complete Datacenter Failure

**Triggers**:
- Natural disaster (fire, flood, earthquake)
- Power outage >4 hours
- Network partition from internet
- Physical security breach

**Impact**: Complete production outage

**Recovery Method**: Failover to DR site

**Estimated RTO**: 1 hour

---

### Scenario 2: Database Corruption/Failure

**Triggers**:
- Hardware failure (disk corruption)
- Software bug causing data corruption
- Ransomware/malware
- Human error (accidental deletion)

**Impact**: Data unavailable or corrupted

**Recovery Method**: Restore from backup

**Estimated RTO**: 45 minutes

---

### Scenario 3: Regional Internet Outage

**Triggers**:
- ISP failure
- BGP routing issues
- DDoS attack
- DNS failure

**Impact**: Services unreachable

**Recovery Method**: DNS failover to alternate region

**Estimated RTO**: 30 minutes (DNS TTL dependent)

---

### Scenario 4: Application Failure

**Triggers**:
- Bad deployment
- Memory leak causing crashes
- Security vulnerability requiring shutdown
- Certificate expiry

**Impact**: Application unavailable

**Recovery Method**: Rollback or service restart

**Estimated RTO**: 15-30 minutes

---

## DR Architecture

### Primary Site

**Location**: [Primary Datacenter / AWS us-east-1]

**Components**:
- Application Servers (2x)
- PostgreSQL Database (Primary)
- TURN/STUN Server
- Load Balancer
- Monitoring Infrastructure

**Network**: 1 Gbps redundant connections

---

### DR Site

**Location**: [DR Datacenter / AWS us-west-2]

**Components**:
- Application Servers (2x, standby)
- PostgreSQL Database (Standby, streaming replication)
- TURN/STUN Server (active)
- Load Balancer (standby)
- Monitoring Infrastructure

**Network**: 1 Gbps redundant connections

**Replication**:
- Database: Streaming replication (async)
- Files: S3 cross-region replication
- Configurations: Git repository (globally distributed)

---

### Replication Strategy

```
┌─────────────────────────────────────────────────────────┐
│                  Replication Flow                       │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  PRIMARY SITE (us-east-1)                               │
│  ┌────────────┐                                         │
│  │ PostgreSQL │────────┐                                │
│  │  Primary   │        │ Streaming Replication          │
│  └────────────┘        │ (15s lag target)               │
│                        │                                 │
│  ┌────────────┐        │                                │
│  │ App Files  │────────┼───────┐                        │
│  │    /opt/   │        │       │ S3 Sync (5 min)        │
│  └────────────┘        │       │                        │
│                        │       │                         │
│                        ▼       ▼                         │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                        │       │                         │
│  DR SITE (us-west-2)   │       │                        │
│                        ▼       ▼                         │
│  ┌────────────┐   ┌────────────┐                        │
│  │ PostgreSQL │   │ S3 Bucket  │                        │
│  │  Standby   │   │  Replica   │                        │
│  └────────────┘   └────────────┘                        │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## Recovery Procedures

### Procedure 1: Database Recovery from Backup

**Time Estimate**: 45 minutes

#### Prerequisites
- Recent backup available
- DR database server accessible
- Application can be stopped

#### Steps

**1. Stop Application (5 minutes)**
```bash
# Stop application to prevent writes
ssh roip-prod
sudo systemctl stop roip-server

# Verify no connections
psql -U roip_user -d roip_production -c "SELECT count(*) FROM pg_stat_activity;"
```

**2. Identify Backup to Restore (5 minutes)**
```bash
# List available backups
ls -lh /var/backups/roip/database/

# Or from S3
aws s3 ls s3://roip-backups/database/ --recursive | tail -20

# Choose backup (latest before corruption)
BACKUP_FILE=/var/backups/roip/database/roip_20251122_020000.dump

# Or download from S3
aws s3 cp s3://roip-backups/database/roip_20251122_020000.dump.gz /tmp/
gunzip /tmp/roip_20251122_020000.dump.gz
```

**3. Restore Database (20 minutes)**
```bash
# Stop PostgreSQL
sudo systemctl stop postgresql

# Backup current (corrupted) database
sudo -u postgres pg_dump roip_production > /tmp/corrupted-$(date +%Y%m%d_%H%M%S).sql

# Drop existing database
sudo -u postgres psql -c "DROP DATABASE roip_production;"

# Create fresh database
sudo -u postgres psql -c "CREATE DATABASE roip_production OWNER roip_user;"

# Restore from backup
sudo -u postgres pg_restore -d roip_production $BACKUP_FILE

# Or from SQL dump
# sudo -u postgres psql roip_production < $BACKUP_FILE

# Verify restoration
sudo -u postgres psql -d roip_production -c "SELECT count(*) FROM devices;"
sudo -u postgres psql -d roip_production -c "SELECT MAX(created_at) FROM devices;"
```

**4. Start Services (5 minutes)**
```bash
# Start PostgreSQL
sudo systemctl start postgresql

# Verify database health
psql -U roip_user -h localhost -d roip_production -c "SELECT 1;"

# Start application
sudo systemctl start roip-server

# Verify application health
curl http://localhost:8080/health
```

**5. Validate Recovery (10 minutes)**
```bash
# Check device count
curl http://localhost:8080/api/v1/devices | jq 'length'

# Check recent calls
curl http://localhost:8080/api/v1/calls/history?limit=10 | jq '.'

# Test device registration
# Connect test ESP32 device

# Test call establishment
# Make test call between two devices

# Monitor for errors
sudo journalctl -u roip-server -f
```

---

### Procedure 2: Failover to DR Site

**Time Estimate**: 60 minutes

#### Prerequisites
- DR site operational
- Database replication current (lag <5 minutes)
- DNS access credentials available

#### Steps

**1. Declare Disaster (5 minutes)**
```bash
# Incident Commander decision required
# Notify:
# - Engineering team
# - Management
# - Customers (via status page)

# Document disaster declaration
echo "$(date): Disaster declared - Primary site unavailable" >> /var/log/roip/dr-events.log
```

**2. Verify DR Site Readiness (10 minutes)**
```bash
# SSH to DR site
ssh dr-server.example.com

# Check replication lag
psql -U roip_user -h localhost -d roip_production -c "
SELECT now() - pg_last_xact_replay_timestamp() AS replication_lag;"

# Should be <5 minutes for acceptable data loss

# Check services
sudo systemctl status roip-server postgresql coturn nginx

# Check disk space
df -h

# Check network connectivity
ping -c 5 8.8.8.8
```

**3. Promote DR Database (10 minutes)**
```bash
# On DR site
ssh dr-server.example.com

# Promote standby to primary
sudo -u postgres pg_ctl promote -D /var/lib/postgresql/15/standby

# Verify promotion
psql -U roip_user -d roip_production -c "SELECT pg_is_in_recovery();"
# Should return: false (meaning it's now primary)

# Check database writable
psql -U roip_user -d roip_production -c "CREATE TABLE dr_test (id int);"
psql -U roip_user -d roip_production -c "DROP TABLE dr_test;"
```

**4. Start DR Services (10 minutes)**
```bash
# Start all services on DR site
sudo systemctl start roip-server
sudo systemctl start coturn
sudo systemctl start nginx

# Verify all services running
sudo systemctl status roip-server postgresql coturn nginx

# Check application health
curl http://localhost:8080/health
curl http://localhost:8080/health/detailed | jq '.'

# Check logs for errors
sudo journalctl -u roip-server -n 50
```

**5. Update DNS (15 minutes)**
```bash
# Update DNS A record to point to DR site

# Method 1: AWS Route53 (automated)
aws route53 change-resource-record-sets \
  --hosted-zone-id ZXXXXXXXXXXXXX \
  --change-batch file://dr-dns-failover.json

# dr-dns-failover.json:
# {
#   "Changes": [{
#     "Action": "UPSERT",
#     "ResourceRecordSet": {
#       "Name": "roip.example.com",
#       "Type": "A",
#       "TTL": 60,
#       "ResourceRecords": [{"Value": "DR_SITE_IP"}]
#     }
#   }]
# }

# Method 2: Manual DNS update
# Login to DNS provider (CloudFlare, GoDaddy, etc.)
# Change A record for roip.example.com
# Set to DR site IP address
# Reduce TTL to 60 seconds

# Verify DNS propagation
dig roip.example.com +short
# Should show DR site IP

# Check from multiple locations
# Use https://www.whatsmydns.net
```

**6. Verify DR Site Operational (10 minutes)**
```bash
# Test from external network
curl https://roip.example.com/health

# Test device connection
# Connect test ESP32 device
# Should register successfully

# Test API
curl https://roip.example.com/api/v1/devices

# Monitor metrics
# Check Grafana dashboard shows DR site metrics

# Monitor for 15 minutes
watch -n 30 'curl -s https://roip.example.com/health | jq ".status"'
```

**7. Communicate Failover Complete**
```bash
# Update status page
# Status: Operational
# Message: "Service restored on backup infrastructure.
#          We are monitoring closely. Primary site recovery in progress."

# Notify stakeholders
# Email management, customers
# Post in #incidents channel

# Document failover
cat >> /var/log/roip/dr-events.log <<EOF
$(date): Failover to DR site complete
Primary Site: DOWN
DR Site: ACTIVE
DNS Updated: YES
RTO Achieved: [Calculate actual time]
EOF
```

---

## Failback Procedures

**When to Failback**: After primary site is restored and verified stable

**Time Estimate**: 90 minutes (requires maintenance window)

### Prerequisites
- Primary site fully restored
- Primary site tested and verified
- Maintenance window scheduled
- Customer notification sent

### Steps

**1. Prepare Primary Site (30 minutes)**
```bash
# On primary site (once restored)
ssh roip-prod.example.com

# Ensure all services installed and configured
sudo systemctl status roip-server postgresql coturn nginx

# Stop services (not accepting traffic yet)
sudo systemctl stop roip-server
sudo systemctl stop postgresql

# Restore configuration
cd /opt/roip-server
git pull origin main

# Restore environment
cp /var/backups/roip/config/roip-server.env .env
```

**2. Sync Data from DR to Primary (30 minutes)**
```bash
# Create database dump on DR site
ssh dr-server.example.com
sudo -u postgres pg_dump -Fc roip_production > /tmp/dr-backup-$(date +%Y%m%d_%H%M%S).dump

# Transfer to primary
scp dr-server.example.com:/tmp/dr-backup-*.dump /tmp/

# On primary site
# Restore database
sudo systemctl stop postgresql
sudo -u postgres dropdb roip_production
sudo -u postgres createdb roip_production -O roip_user
sudo -u postgres pg_restore -d roip_production /tmp/dr-backup-*.dump

# Verify data
psql -U roip_user -d roip_production -c "SELECT count(*) FROM devices;"
```

**3. Test Primary Site (15 minutes)**
```bash
# Start services on primary
sudo systemctl start postgresql
sudo systemctl start roip-server

# Internal testing (before DNS switch)
curl http://localhost:8080/health

# Test endpoints
curl http://localhost:8080/api/v1/devices
curl http://localhost:8080/api/v1/calls/active

# Monitor logs
sudo journalctl -u roip-server -f &

# Load test (optional)
ab -n 1000 -c 10 http://localhost:8080/health
```

**4. Switch DNS Back (10 minutes)**
```bash
# Update DNS to primary site
aws route53 change-resource-record-sets \
  --hosted-zone-id ZXXXXXXXXXXXXX \
  --change-batch file://primary-dns-restore.json

# Verify DNS
dig roip.example.com +short
# Should show primary site IP

# Wait for TTL expiration (60 seconds)
sleep 90
```

**5. Verify Primary Site (15 minutes)**
```bash
# Test from external network
curl https://roip.example.com/health

# Monitor traffic shifting
watch -n 10 'sudo netstat -an | grep :8080 | grep ESTABLISHED | wc -l'

# Check Grafana
# Verify metrics coming from primary site

# Test device connection
# ESP32 devices should re-register to primary

# Monitor for errors
sudo journalctl -u roip-server -f
```

**6. Deactivate DR Site (Standby Mode)**
```bash
# On DR site
# Stop application (keep database in standby)
sudo systemctl stop roip-server
sudo systemctl stop nginx

# Reconfigure database as standby
# Edit recovery.conf
sudo nano /var/lib/postgresql/15/main/recovery.conf
# standby_mode = 'on'
# primary_conninfo = 'host=primary-db port=5432 user=replicator'

# Restart PostgreSQL in standby mode
sudo systemctl restart postgresql

# Verify replication resumed
psql -U roip_user -d roip_production -c "SELECT pg_is_in_recovery();"
# Should return: true
```

---

## Testing and Validation

### DR Test Schedule

| Test Type | Frequency | Duration | Impact |
|-----------|-----------|----------|--------|
| Backup Restore | Weekly | 1 hour | None (test environment) |
| DR Site Validation | Monthly | 30 min | None (standby mode) |
| Partial Failover | Quarterly | 2 hours | Minimal (planned maintenance) |
| Full DR Exercise | Annually | 4 hours | Service interruption (planned) |

### Quarterly DR Test Procedure

**Schedule**: Last Sunday of quarter, 02:00 UTC

**Participants**:
- Incident Commander
- DBA
- Operations Engineer
- Network Engineer

**Procedure**:
```bash
#!/bin/bash
# DR Test Procedure

# 1. Notify stakeholders (T-24 hours)
# 2. Schedule maintenance window
# 3. Execute controlled failover
# 4. Verify DR site functionality
# 5. Measure RTO/RPO
# 6. Failback to primary
# 7. Document results
# 8. Post-test review meeting
```

**Success Criteria**:
- RTO <1 hour
- RPO <15 minutes
- All services operational on DR site
- No data loss
- All tests pass

---

## Roles and Responsibilities

### Disaster Declaration Authority

| Role | Authority | Criteria |
|------|-----------|----------|
| On-Call Engineer | Can recommend | P0 incident >30 min |
| Senior Engineer | Can recommend | P0 incident >1 hour |
| Engineering Manager | Can declare | P0 incident or risk assessment |
| VP Engineering | Ultimate authority | Any situation |

### DR Team Roles

**Incident Commander**:
- Declares disaster
- Coordinates recovery
- Communicates with stakeholders
- Makes go/no-go decisions

**Technical Lead**:
- Executes technical procedures
- Validates each step
- Troubleshoots issues
- Provides status to IC

**Database Administrator**:
- Database failover
- Data validation
- Backup/restore operations
- Replication management

**Network Engineer**:
- DNS changes
- Network verification
- Firewall rules
- Load balancer config

**Communications Lead**:
- Status page updates
- Customer notifications
- Internal communications
- Stakeholder management

---

## Contact Information

### DR Team

| Role | Primary | Backup | Phone |
|------|---------|--------|-------|
| Incident Commander | [Name] | [Name] | +1-555-0100 |
| Technical Lead | [Name] | [Name] | +1-555-0101 |
| DBA | [Name] | [Name] | +1-555-0102 |
| Network Engineer | [Name] | [Name] | +1-555-0103 |
| Communications | [Name] | [Name] | +1-555-0104 |

### External Contacts

| Vendor | Service | Contact | Account |
|--------|---------|---------|---------|
| AWS Support | Infrastructure | +1-888-774-0015 | XXXX-XXXX |
| DNS Provider | DNS Management | support@ | Acct# |
| ISP | Network | +1-XXX-XXX-XXXX | Circuit ID |

---

## Appendices

### Appendix A: DR Checklist

See separate DR Checklist document

### Appendix B: DNS Change Scripts

Located in: `/opt/roip/scripts/dr-dns-*.json`

### Appendix C: Network Diagrams

Located in: `/home/user/MMDVM/docs/disaster-recovery/diagrams/`

### Appendix D: DR Test Reports

Located in: `/var/log/roip/dr-tests/`

---

## Related Documentation

- [BACKUP_RESTORATION.md](BACKUP_RESTORATION.md)
- [INCIDENT_RESPONSE.md](../runbooks/INCIDENT_RESPONSE.md)
- [DATABASE_FAILURE.md](../runbooks/DATABASE_FAILURE.md)

---

**CONFIDENTIAL - FOR INTERNAL USE ONLY**

**Document Version**: 1.0
**Last Updated**: 2025-11-22
**Next Review**: 2026-02-22
**Next DR Test**: 2026-03-31
**Approved By**: [VP Engineering]
