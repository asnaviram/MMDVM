# ESP32 RoIP System - Production Deployment Guide

This guide provides comprehensive instructions for deploying the ESP32 RoIP system to production environments.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Deployment Methods](#deployment-methods)
- [Pre-Deployment Checklist](#pre-deployment-checklist)
- [Docker Deployment](#docker-deployment)
- [Kubernetes Deployment](#kubernetes-deployment)
- [AWS Terraform Deployment](#aws-terraform-deployment)
- [Ansible Deployment](#ansible-deployment)
- [Health Checks](#health-checks)
- [Database Migrations](#database-migrations)
- [Zero-Downtime Deployment](#zero-downtime-deployment)
- [Post-Deployment Verification](#post-deployment-verification)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)

## Overview

The ESP32 RoIP system supports multiple deployment methods:

- **Docker Compose**: Single-host deployment with containers
- **Kubernetes**: Multi-host orchestrated deployment
- **AWS Terraform**: Cloud infrastructure with auto-scaling
- **Ansible**: Configuration management and provisioning

Each method includes:
- Automated database migrations
- Health check integration
- Rollback capabilities
- Production hardening
- Monitoring setup

## Prerequisites

### System Requirements

**Minimum Production Requirements:**
- CPU: 4 cores (8+ recommended)
- RAM: 8 GB (16+ GB recommended)
- Disk: 100 GB SSD (500+ GB recommended)
- Network: 1 Gbps

**Operating Systems:**
- Ubuntu 20.04 LTS or later (recommended)
- Debian 11 or later
- RHEL/CentOS 8 or later

### Required Software

```bash
# Docker deployment
- Docker 20.10+
- Docker Compose 2.0+

# Kubernetes deployment
- kubectl 1.25+
- Helm 3.0+ (optional)
- Access to Kubernetes cluster

# Terraform deployment
- Terraform 1.0+
- AWS CLI configured
- Valid AWS credentials

# Ansible deployment
- Ansible 2.10+
- Python 3.8+
- SSH access to target hosts
```

### Network Requirements

**Firewall Rules:**
- TCP 80, 443 (HTTP/HTTPS)
- TCP 8080 (API)
- TCP 8081 (WebSocket)
- UDP 5060 (SIP)
- UDP 10000-10100 (RTP)
- TCP 3478 (TURN)

**DNS:**
- A/AAAA records configured
- SSL/TLS certificates obtained

## Deployment Methods

### Method Comparison

| Method | Complexity | Scalability | Best For |
|--------|-----------|-------------|----------|
| Docker Compose | Low | Low | Single server, development |
| Kubernetes | High | High | Production, high availability |
| Terraform | Medium | High | Cloud infrastructure |
| Ansible | Medium | Medium | Configuration management |

## Pre-Deployment Checklist

### Security

- [ ] Generate strong passwords for all services
- [ ] Configure SSL/TLS certificates
- [ ] Set up firewall rules
- [ ] Configure fail2ban
- [ ] Enable automatic security updates
- [ ] Review and update secrets

### Configuration

- [ ] Review production.yaml configuration
- [ ] Set environment-specific variables
- [ ] Configure database connection
- [ ] Set up TURN/STUN servers
- [ ] Configure monitoring endpoints

### Infrastructure

- [ ] Provision servers/instances
- [ ] Set up load balancer
- [ ] Configure DNS
- [ ] Prepare backup storage
- [ ] Set up monitoring infrastructure

### Backup

- [ ] Configure automated backups
- [ ] Test backup restoration
- [ ] Document backup procedures
- [ ] Set up off-site backup storage

## Docker Deployment

### Quick Start

```bash
# Navigate to deployment directory
cd deployment

# Create environment file
cp .env.example .env

# Edit configuration (IMPORTANT!)
nano .env

# Deploy
docker-compose -f docker-compose.prod.yml up -d

# Check status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f
```

### Production Deployment Script

```bash
# One-click production deployment
./scripts/deploy-production.sh

# Custom deployment
./scripts/deploy-production.sh --method docker --no-zero-downtime

# Deploy with specific options
DEPLOYMENT_METHOD=docker \
ENABLE_BACKUP=true \
ENABLE_MIGRATION=true \
./scripts/deploy-production.sh
```

### Docker Compose Configuration

The production docker-compose file includes:

- **PostgreSQL**: High-performance database
- **Redis**: Caching and session management
- **RoIP Server**: Application with clustering
- **Nginx**: Reverse proxy and SSL termination
- **Coturn**: TURN/STUN server
- **Prometheus**: Metrics collection
- **Grafana**: Monitoring dashboards

### Environment Variables

Required variables in `.env`:

```bash
# Database
DB_NAME=roip_production
DB_USER=roip_user
DB_PASSWORD=<strong-password>

# Security
JWT_SECRET=<random-64-char-string>

# TURN Server
TURN_USERNAME=<username>
TURN_PASSWORD=<strong-password>

# Monitoring
GRAFANA_ADMIN_PASSWORD=<strong-password>
```

## Kubernetes Deployment

### Prerequisites

```bash
# Verify cluster access
kubectl cluster-info

# Create namespace
kubectl apply -f deployment/kubernetes/production/namespace.yaml
```

### Deploy to Kubernetes

```bash
# Apply configurations in order
kubectl apply -f deployment/kubernetes/production/configmap.yaml
kubectl apply -f deployment/kubernetes/production/secrets.yaml
kubectl apply -f deployment/kubernetes/production/postgres-statefulset.yaml
kubectl apply -f deployment/kubernetes/production/redis-statefulset.yaml
kubectl apply -f deployment/kubernetes/production/roip-deployment.yaml
kubectl apply -f deployment/kubernetes/production/roip-service.yaml
kubectl apply -f deployment/kubernetes/production/ingress.yaml
kubectl apply -f deployment/kubernetes/production/hpa.yaml
kubectl apply -f deployment/kubernetes/production/pod-disruption-budget.yaml

# Or deploy all at once
kubectl apply -f deployment/kubernetes/production/
```

### Update Secrets

```bash
# Update database password
kubectl create secret generic roip-secrets \
  --from-literal=DB_PASSWORD=<password> \
  --from-literal=JWT_SECRET=<secret> \
  --from-literal=TURN_PASSWORD=<password> \
  --namespace=roip-production \
  --dry-run=client -o yaml | kubectl apply -f -
```

### Verify Deployment

```bash
# Check pod status
kubectl get pods -n roip-production

# Check services
kubectl get svc -n roip-production

# Check ingress
kubectl get ingress -n roip-production

# View logs
kubectl logs -f deployment/roip-server -n roip-production
```

## AWS Terraform Deployment

### Initialize Terraform

```bash
cd deployment/terraform

# Initialize
terraform init

# Create terraform.tfvars
cat > terraform.tfvars << EOF
project_name        = "roip"
environment         = "production"
domain_name         = "roip.example.com"
ssl_certificate_arn = "arn:aws:acm:..."
instance_type       = "t3.large"
min_size            = 2
max_size            = 10
desired_capacity    = 3
EOF
```

### Deploy Infrastructure

```bash
# Plan deployment
terraform plan -out=tfplan

# Review plan
terraform show tfplan

# Apply changes
terraform apply tfplan

# Get outputs
terraform output
```

### Update Application

```bash
# Trigger new deployment
aws autoscaling start-instance-refresh \
  --auto-scaling-group-name roip-production \
  --preferences MinHealthyPercentage=90

# Monitor refresh
aws autoscaling describe-instance-refreshes \
  --auto-scaling-group-name roip-production
```

## Ansible Deployment

### Inventory Setup

```bash
# Edit production inventory
nano deployment/ansible/inventory/production

[all_in_one]
roip-prod-01 ansible_host=<ip-address>

[app_servers]
roip-prod-01

[database]
roip-prod-01

[web_servers]
roip-prod-01
```

### Deploy with Ansible

```bash
# Check connection
ansible -i deployment/ansible/inventory/production all -m ping

# Run playbook (check mode)
ansible-playbook \
  -i deployment/ansible/inventory/production \
  deployment/ansible/production-playbook.yml \
  --check

# Deploy to production
ansible-playbook \
  -i deployment/ansible/inventory/production \
  deployment/ansible/production-playbook.yml

# Deploy specific components
ansible-playbook \
  -i deployment/ansible/inventory/production \
  deployment/ansible/production-playbook.yml \
  --tags app,deploy
```

## Health Checks

The system provides multiple health check endpoints:

### Basic Health
```bash
curl http://localhost:8080/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-01T00:00:00Z",
  "uptime": 3600,
  "version": "1.0.0",
  "environment": "production"
}
```

### Readiness Probe
```bash
curl http://localhost:8080/health/ready
```

### Liveness Probe
```bash
curl http://localhost:8080/health/live
```

### Startup Probe
```bash
curl http://localhost:8080/health/startup
```

### Detailed Health
```bash
curl http://localhost:8080/health/detailed
```

## Database Migrations

### Running Migrations

```bash
# Run all pending migrations
cd roip-server
node src/migrations/migrate.js up

# Check migration status
node src/migrations/migrate.js status

# Rollback last migration
node src/migrations/migrate.js down

# Rollback multiple migrations
node src/migrations/migrate.js down 3
```

### Creating New Migrations

```bash
# Create migration
node src/migrations/migrate.js create "add user preferences"

# Edit the generated migration file
nano src/migrations/<timestamp>_add_user_preferences.js
```

### Automated Migrations

Migrations run automatically during deployment:

- **Docker**: Included in startup script
- **Kubernetes**: Init container
- **Terraform**: User data script
- **Ansible**: Deployment playbook

## Zero-Downtime Deployment

### Docker Zero-Downtime

```bash
./scripts/deploy-production.sh --method docker

# The script automatically:
# 1. Pulls new images
# 2. Scales up new instances
# 3. Waits for health checks
# 4. Stops old instances
# 5. Scales down to desired count
```

### Kubernetes Rolling Update

```bash
# Update image
kubectl set image deployment/roip-server \
  roip-server=roip-server:v1.1.0 \
  -n roip-production

# Monitor rollout
kubectl rollout status deployment/roip-server -n roip-production

# Check rollout history
kubectl rollout history deployment/roip-server -n roip-production
```

## Post-Deployment Verification

### Automated Tests

```bash
# Run smoke tests
./scripts/smoke-tests.sh

# Run integration tests
cd roip-server
npm run test:integration
```

### Manual Verification

1. **Check Services**
   ```bash
   # Docker
   docker-compose ps

   # Kubernetes
   kubectl get pods -n roip-production
   ```

2. **Test API**
   ```bash
   curl https://roip.example.com/health
   ```

3. **Test WebSocket**
   ```bash
   wscat -c wss://roip.example.com/ws
   ```

4. **Test SIP Registration**
   ```bash
   # Use SIP client to register
   ```

5. **Monitor Logs**
   ```bash
   # Docker
   docker logs -f roip-server-prod

   # Kubernetes
   kubectl logs -f deployment/roip-server -n roip-production
   ```

## Monitoring

### Prometheus Metrics

Access metrics at:
```
http://localhost:9090/metrics
```

### Grafana Dashboards

1. Access Grafana: `http://localhost:3000`
2. Login with admin credentials
3. Import pre-configured dashboards

### Key Metrics

- **API Performance**: Request rate, latency, errors
- **Database**: Connection pool, query time
- **System**: CPU, memory, disk usage
- **Application**: Active calls, registered devices

### Alerting

Configure alerts in Prometheus:

```yaml
# Example alert rule
groups:
  - name: roip
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: High error rate detected
```

## Troubleshooting

### Common Issues

**Database Connection Failed**
```bash
# Check database status
docker exec roip-postgres-prod pg_isready

# Check connection settings
docker logs roip-server-prod | grep -i "database"
```

**Port Already in Use**
```bash
# Find process using port
sudo lsof -i :8080

# Kill process
sudo kill -9 <PID>
```

**High Memory Usage**
```bash
# Check memory usage
docker stats

# Restart service
docker-compose restart roip-server
```

**SSL Certificate Issues**
```bash
# Check certificate expiry
echo | openssl s_client -servername roip.example.com \
  -connect roip.example.com:443 2>/dev/null | \
  openssl x509 -noout -dates
```

### Log Analysis

```bash
# Docker
docker-compose logs --tail=100 -f roip-server

# Kubernetes
kubectl logs -f deployment/roip-server -n roip-production

# Filter errors
docker logs roip-server-prod 2>&1 | grep -i error
```

### Performance Issues

1. **Check Resource Usage**
   ```bash
   docker stats
   kubectl top pods -n roip-production
   ```

2. **Check Database Performance**
   ```bash
   docker exec roip-postgres-prod psql -U roip_user -c \
     "SELECT * FROM pg_stat_activity;"
   ```

3. **Check Cache Hit Rate**
   ```bash
   docker exec roip-redis redis-cli info stats
   ```

## Support and Documentation

- **GitHub Issues**: Report bugs and feature requests
- **Documentation**: See `/docs` directory
- **API Documentation**: `/docs/API.md`
- **Architecture**: `/docs/ARCHITECTURE.md`

## Security Considerations

### Production Checklist

- [ ] All default passwords changed
- [ ] Firewall configured
- [ ] SSL/TLS enabled
- [ ] Database access restricted
- [ ] API rate limiting enabled
- [ ] Monitoring and alerting configured
- [ ] Backup and recovery tested
- [ ] Security updates automated
- [ ] Access logs enabled
- [ ] Intrusion detection configured

### Regular Maintenance

- Monitor security advisories
- Apply security patches promptly
- Review access logs weekly
- Test backup restoration monthly
- Rotate credentials quarterly
- Security audit annually

## Conclusion

This guide covers the essential aspects of deploying the ESP32 RoIP system to production. Always test deployments in a staging environment before applying to production, maintain regular backups, and monitor system health continuously.

For additional assistance, refer to the troubleshooting section or consult the project documentation.
