# ESP32 RoIP System - Rollback Procedure

This document provides comprehensive procedures for rolling back deployments in case of issues.

## Table of Contents

- [Overview](#overview)
- [When to Rollback](#when-to-rollback)
- [Rollback Methods](#rollback-methods)
- [Automated Rollback](#automated-rollback)
- [Manual Rollback](#manual-rollback)
- [Database Rollback](#database-rollback)
- [Verification](#verification)
- [Post-Rollback](#post-rollback)
- [Prevention](#prevention)

## Overview

The RoIP system includes multiple rollback mechanisms:

- **Automated Rollback**: Triggered on deployment failure
- **Script-Based Rollback**: Using `rollback.sh`
- **Container Rollback**: Docker/Kubernetes rollback
- **Infrastructure Rollback**: Terraform state management
- **Database Rollback**: Migration reversal

## When to Rollback

Consider rollback when:

- [ ] Deployment health checks fail
- [ ] Critical functionality is broken
- [ ] Performance degrades significantly
- [ ] Security vulnerability introduced
- [ ] Data corruption detected
- [ ] User-facing errors increase
- [ ] Third-party integration failures

**DO NOT rollback for:**
- Minor UI issues
- Non-critical bugs
- Performance issues that can be tuned
- Issues that can be hot-fixed

## Rollback Methods

### Quick Reference

| Method | Speed | Complexity | Data Loss Risk | Use Case |
|--------|-------|------------|----------------|----------|
| Automated Script | Fast | Low | Low | Deployment failure |
| Docker Rollback | Very Fast | Low | None | Container issues |
| Kubernetes Rollback | Fast | Low | None | Pod issues |
| Database Rollback | Slow | High | Medium | Schema issues |
| Full Infrastructure | Slow | High | Low | Complete failure |

## Automated Rollback

### Docker Automated Rollback

The deployment script includes automatic rollback on failure:

```bash
./scripts/deploy-production.sh

# Automatic rollback triggers if:
# - Health checks fail
# - Migration fails
# - Service fails to start
# - Response time exceeds threshold
```

### Kubernetes Automated Rollback

Kubernetes automatically rolls back on:
- Failed readiness probes
- Failed liveness probes
- Deployment timeout

Configure in deployment:

```yaml
spec:
  progressDeadlineSeconds: 600
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0
      maxSurge: 1
```

## Manual Rollback

### Using Rollback Script

#### List Available Backups

```bash
./scripts/rollback.sh --list
```

Output:
```
DEPLOYMENT ID        TIMESTAMP            GIT COMMIT      SIZE
20250101120000      2025-01-01T12:00:00  a1b2c3d4       250M
20250101100000      2025-01-01T10:00:00  e5f6g7h8       245M
20250101080000      2025-01-01T08:00:00  i9j0k1l2       240M
```

#### Rollback to Latest

```bash
# Preview rollback (dry run)
./scripts/rollback.sh latest --dry-run

# Execute rollback
./scripts/rollback.sh latest

# Force rollback (includes database)
./scripts/rollback.sh latest --force
```

#### Rollback to Specific Version

```bash
# Rollback to specific deployment
./scripts/rollback.sh 20250101100000

# With database restore
./scripts/rollback.sh 20250101100000 --force
```

### Docker Rollback

#### Rollback Services

```bash
# Stop current deployment
docker-compose -f deployment/docker-compose.prod.yml down

# Restore configuration from backup
tar -xzf /var/backups/roip/roip_<timestamp>/config.tar.gz \
  -C deployment/

# Start previous version
docker-compose -f deployment/docker-compose.prod.yml up -d

# Verify
docker-compose ps
docker-compose logs -f
```

#### Rollback Single Service

```bash
# Stop service
docker-compose stop roip-server

# Restore previous image
docker tag roip-server:previous roip-server:latest

# Start service
docker-compose up -d roip-server

# Monitor
docker logs -f roip-server-prod
```

### Kubernetes Rollback

#### View Rollout History

```bash
# Check rollout history
kubectl rollout history deployment/roip-server -n roip-production

# View specific revision
kubectl rollout history deployment/roip-server \
  --revision=2 -n roip-production
```

#### Rollback Deployment

```bash
# Rollback to previous revision
kubectl rollout undo deployment/roip-server -n roip-production

# Rollback to specific revision
kubectl rollout undo deployment/roip-server \
  --to-revision=2 -n roip-production

# Monitor rollback
kubectl rollout status deployment/roip-server -n roip-production

# Verify pods
kubectl get pods -n roip-production -w
```

#### Pause and Resume Rollout

```bash
# Pause rollout if issues detected
kubectl rollout pause deployment/roip-server -n roip-production

# Investigate issues
kubectl describe pod <pod-name> -n roip-production

# Resume or rollback
kubectl rollout resume deployment/roip-server -n roip-production
# OR
kubectl rollout undo deployment/roip-server -n roip-production
```

### Terraform Rollback

#### Rollback Infrastructure

```bash
cd deployment/terraform

# View state history
terraform state list

# Show current state
terraform show

# Rollback to previous state
terraform state pull > current.tfstate
aws s3 cp s3://roip-terraform-state/production/terraform.tfstate.backup \
  previous.tfstate

# Review changes
terraform plan -state=previous.tfstate

# Apply previous state
terraform apply -state=previous.tfstate
```

#### Partial Infrastructure Rollback

```bash
# Rollback specific resource
terraform taint aws_autoscaling_group.app
terraform apply

# Or replace resource
terraform apply -replace=aws_autoscaling_group.app
```

### Ansible Rollback

#### Rollback Application

```bash
# Deploy previous release
ansible-playbook \
  -i deployment/ansible/inventory/production \
  deployment/ansible/production-playbook.yml \
  -e "deploy_version=20250101100000" \
  --tags app,deploy
```

#### Rollback Configuration

```bash
# Restore configuration from backup
ansible-playbook \
  -i deployment/ansible/inventory/production \
  deployment/ansible/rollback-playbook.yml \
  -e "backup_id=20250101100000"
```

## Database Rollback

### Migration Rollback

#### Check Migration Status

```bash
cd roip-server
node src/migrations/migrate.js status
```

#### Rollback Migrations

```bash
# Rollback last migration
node src/migrations/migrate.js down

# Rollback multiple migrations
node src/migrations/migrate.js down 3

# Check status
node src/migrations/migrate.js status
```

### Full Database Restore

**WARNING**: This will overwrite current database data.

#### Docker Database Restore

```bash
# Stop application
docker-compose stop roip-server

# Restore database
docker exec -i roip-postgres-prod psql -U roip_user roip_production \
  < /var/backups/roip/roip_<timestamp>/database.sql

# Start application
docker-compose start roip-server

# Verify
docker logs -f roip-server-prod
```

#### Kubernetes Database Restore

```bash
# Scale down application
kubectl scale deployment roip-server --replicas=0 -n roip-production

# Restore database
kubectl exec -i postgres-0 -n roip-production -- \
  psql -U roip_user roip_production < backup.sql

# Scale up application
kubectl scale deployment roip-server --replicas=3 -n roip-production

# Verify
kubectl get pods -n roip-production
```

### Point-in-Time Recovery

For PostgreSQL with WAL archiving:

```bash
# Stop database
docker-compose stop postgres

# Restore from base backup
tar -xzf /var/backups/roip/base_backup.tar.gz -C /var/lib/postgresql/data/

# Configure recovery
cat > /var/lib/postgresql/data/recovery.conf << EOF
restore_command = 'cp /var/backups/roip/wal_archive/%f %p'
recovery_target_time = '2025-01-01 12:00:00'
EOF

# Start database
docker-compose start postgres

# Monitor recovery
docker logs -f roip-postgres-prod
```

## Verification

### Post-Rollback Checks

#### 1. Service Health

```bash
# Check health endpoints
curl http://localhost:8080/health
curl http://localhost:8080/health/ready
curl http://localhost:8080/health/live

# Expected: All return 200 OK
```

#### 2. Database Connectivity

```bash
# Docker
docker exec roip-postgres-prod pg_isready -U roip_user

# Kubernetes
kubectl exec postgres-0 -n roip-production -- pg_isready -U roip_user
```

#### 3. Application Functionality

```bash
# Test API endpoints
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'

# Test WebSocket
wscat -c ws://localhost:8081

# Test SIP registration
# Use SIP client
```

#### 4. Performance Metrics

```bash
# Check response times
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:8080/health

# curl-format.txt:
# time_total: %{time_total}s
# time_connect: %{time_connect}s
# time_starttransfer: %{time_starttransfer}s
```

#### 5. Error Rates

```bash
# Check logs for errors
docker logs --since 10m roip-server-prod 2>&1 | grep -i error

# Check error count
docker logs --since 10m roip-server-prod 2>&1 | grep -c ERROR
```

### Verification Checklist

- [ ] All services running
- [ ] Health checks passing
- [ ] Database accessible
- [ ] API responding correctly
- [ ] WebSocket connections working
- [ ] SIP registrations successful
- [ ] No critical errors in logs
- [ ] Performance metrics normal
- [ ] Monitoring dashboards green
- [ ] User-facing functionality works

## Post-Rollback

### Immediate Actions

1. **Notify Stakeholders**
   ```bash
   # Send notification
   echo "Rollback completed at $(date)" | \
     mail -s "Production Rollback Alert" team@example.com
   ```

2. **Document Incident**
   - What went wrong
   - When rollback occurred
   - What was rolled back
   - Current system state
   - Next steps

3. **Monitor Closely**
   ```bash
   # Watch logs
   docker-compose logs -f

   # Monitor metrics
   # Access Grafana dashboards
   ```

### Root Cause Analysis

1. **Collect Evidence**
   ```bash
   # Save logs
   docker logs roip-server-prod > /tmp/failure-logs.txt

   # Export metrics
   curl http://localhost:9090/api/v1/query?query=up \
     > /tmp/metrics.json

   # Database state
   docker exec roip-postgres-prod pg_dump -U roip_user \
     roip_production > /tmp/db-state.sql
   ```

2. **Analyze Issues**
   - Review deployment logs
   - Check code changes
   - Analyze metrics
   - Review configuration changes

3. **Create Action Items**
   - Fix identified issues
   - Improve testing
   - Update documentation
   - Enhance monitoring

### Prevention Measures

1. **Improve Testing**
   ```bash
   # Add integration tests
   npm run test:integration

   # Add load tests
   npm run test:load

   # Add smoke tests
   ./scripts/smoke-tests.sh
   ```

2. **Enhance Monitoring**
   - Add more health checks
   - Configure alerts
   - Monitor key metrics
   - Set up anomaly detection

3. **Improve Deployment Process**
   - Staged rollouts
   - Canary deployments
   - Blue-green deployments
   - Better pre-deployment validation

## Rollback Decision Matrix

### Severity Levels

**Critical (Immediate Rollback)**
- Complete service outage
- Data corruption
- Security breach
- Critical functionality broken

**High (Rollback within 1 hour)**
- Major functionality broken
- Significant performance degradation
- High error rates (>5%)
- Database connectivity issues

**Medium (Evaluate, may rollback)**
- Minor functionality broken
- Moderate performance issues
- Elevated error rates (1-5%)
- Non-critical bugs

**Low (Fix forward)**
- UI issues
- Non-functional bugs
- Minor performance issues
- Documentation issues

## Emergency Contacts

In case of rollback issues:

1. **On-Call Engineer**: <contact-info>
2. **Database Admin**: <contact-info>
3. **Infrastructure Team**: <contact-info>
4. **Security Team**: <contact-info>

## Rollback Runbook

### Quick Rollback Commands

```bash
# Docker - Full Rollback
./scripts/rollback.sh latest --force

# Kubernetes - Deployment Rollback
kubectl rollout undo deployment/roip-server -n roip-production

# Database - Migration Rollback
node src/migrations/migrate.js down

# Terraform - Infrastructure Rollback
terraform apply -state=previous.tfstate

# Check Health
curl http://localhost:8080/health/ready
```

### Rollback Timeline

1. **Minute 0**: Issue detected
2. **Minute 1-5**: Assess severity, decide on rollback
3. **Minute 5-10**: Execute rollback
4. **Minute 10-15**: Verify rollback success
5. **Minute 15-30**: Monitor stability
6. **Hour 1**: Document incident
7. **Hour 2-4**: Root cause analysis
8. **Day 1**: Action plan created

## Appendix

### Backup Locations

- **Docker Backups**: `/var/backups/roip/`
- **Database Backups**: `/var/backups/roip/postgres/`
- **Configuration Backups**: `/var/backups/roip/config/`
- **Terraform State**: `s3://roip-terraform-state/`

### Log Locations

- **Application Logs**: `/var/log/roip/`
- **Docker Logs**: `docker logs <container>`
- **Kubernetes Logs**: `kubectl logs <pod>`
- **System Logs**: `/var/log/syslog`

### Useful Commands

```bash
# Check all service statuses
./scripts/health-check.sh

# Create manual backup
./scripts/backup.sh

# Test rollback (dry run)
./scripts/rollback.sh latest --dry-run

# Monitor deployment
watch -n 1 'docker-compose ps && docker stats --no-stream'
```

## Conclusion

Rollback procedures are a critical part of production operations. Always:

- Test rollback procedures regularly
- Maintain up-to-date backups
- Document all rollback activities
- Learn from rollback events
- Improve deployment processes

Remember: A successful rollback is better than a failed deployment.
