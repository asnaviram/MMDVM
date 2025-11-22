# RoIP System Deployment

This directory contains all deployment configurations and tools for the ESP32 RoIP system.

## Directory Structure

```
deployment/
├── ansible/                    # Ansible playbooks for automated deployment
│   ├── playbook.yml           # Main playbook
│   ├── inventory/             # Production and staging inventories
│   └── roles/                 # Ansible roles
│       ├── roip-server/       # RoIP server deployment
│       ├── postgresql/        # Database setup
│       ├── coturn/            # TURN/STUN server
│       ├── nginx/             # Reverse proxy
│       └── monitoring/        # Prometheus & Grafana
│
├── terraform/                 # Terraform infrastructure as code
│   ├── main.tf               # Main infrastructure
│   ├── variables.tf          # Configuration variables
│   ├── outputs.tf            # Output values
│   └── modules/              # Reusable modules
│       ├── vpc/              # VPC and networking
│       ├── compute/          # EC2 instances
│       ├── database/         # RDS PostgreSQL
│       └── loadbalancer/     # Application Load Balancer
│
├── k8s/                      # Kubernetes manifests
│   ├── namespace.yaml        # Namespace definition
│   ├── deployment.yaml       # Application deployments
│   ├── service.yaml          # Services
│   ├── ingress.yaml          # Ingress rules
│   ├── configmap.yaml        # Configuration
│   ├── secrets.yaml          # Secrets (template)
│   ├── pvc.yaml              # Persistent volume claims
│   └── hpa.yaml              # Horizontal pod autoscaler
│
├── monitoring/               # Monitoring and alerting
│   ├── prometheus.yml        # Prometheus configuration
│   ├── alertmanager.yml      # Alert manager config
│   ├── alert-rules/          # Alert rule definitions
│   └── grafana-dashboards/   # Pre-built dashboards
│
├── backup/                   # Backup and restore scripts
│   ├── backup.sh             # Automated backup script
│   ├── restore.sh            # Recovery script
│   └── backup-config.yml     # Backup configuration
│
├── docker-compose.prod.yml   # Production Docker Compose
└── README.md                 # This file
```

## Deployment Options

### 1. Docker Compose (Quickest)

**Best for**: Small deployments (1-10 devices), development, testing

```bash
# Setup
cd /opt/roip
cp deployment/docker-compose.prod.yml docker-compose.yml
cp .env.example .env
# Edit .env with your configuration

# Deploy
docker-compose up -d

# Monitor
docker-compose logs -f

# Scale
docker-compose up -d --scale roip-server=3
```

**Documentation**: [Docker Deployment Guide](../docker/DEPLOYMENT.md)

### 2. Ansible (Recommended for Production)

**Best for**: Medium to large deployments (10-100+ devices), automated management

```bash
# Prerequisites
sudo apt install ansible

# Configure inventory
cd deployment/ansible
cp inventory/production.example inventory/production
# Edit inventory/production with your servers

# Deploy
ansible-playbook -i inventory/production playbook.yml

# Deploy specific components
ansible-playbook -i inventory/production playbook.yml --tags roip-server
ansible-playbook -i inventory/production playbook.yml --tags database

# Dry run
ansible-playbook -i inventory/production playbook.yml --check
```

**Documentation**: [Ansible Deployment Guide](../docs/PRODUCTION_DEPLOYMENT.md#method-2-ansible-deployment)

### 3. Terraform (Cloud Infrastructure)

**Best for**: AWS/Cloud deployments, infrastructure as code

```bash
# Prerequisites
# Install Terraform: https://www.terraform.io/downloads

# Configure
cd deployment/terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your AWS settings

# Deploy
terraform init
terraform plan -out=tfplan
terraform apply tfplan

# Get outputs
terraform output

# Destroy (careful!)
terraform destroy
```

**Documentation**: [Terraform Deployment Guide](../docs/PRODUCTION_DEPLOYMENT.md#method-4-terraform-cloud-infrastructure)

### 4. Kubernetes

**Best for**: Container orchestration, high availability, auto-scaling

```bash
# Prerequisites
# - Kubernetes cluster (EKS, GKE, or self-hosted)
# - kubectl configured

# Create namespace
kubectl apply -f deployment/k8s/namespace.yaml

# Create secrets
kubectl create secret generic roip-secrets \
  --from-literal=db-password=CHANGE_ME \
  --from-literal=jwt-secret=CHANGE_ME \
  --from-literal=turn-password=CHANGE_ME \
  -n roip-production

# Deploy
kubectl apply -f deployment/k8s/

# Monitor
kubectl get pods -n roip-production
kubectl logs -f deployment/roip-server -n roip-production

# Scale
kubectl scale deployment roip-server --replicas=5 -n roip-production
```

**Documentation**: [Kubernetes Deployment Guide](../docs/PRODUCTION_DEPLOYMENT.md#method-3-kubernetes-deployment)

## Quick Start

### Minimal Production Setup (Single Server)

```bash
# 1. Provision Ubuntu 22.04 server (2 vCPU, 4GB RAM minimum)

# 2. Install Docker and Docker Compose
curl -fsSL https://get.docker.com | sh
sudo systemctl enable --now docker

# 3. Clone repository
cd /opt
sudo git clone https://github.com/yourorg/roip-system.git roip
cd roip

# 4. Configure environment
cp .env.example .env
sudo nano .env
# Set DB_PASSWORD, JWT_SECRET, TURN_PASSWORD

# 5. Deploy
docker-compose -f deployment/docker-compose.prod.yml up -d

# 6. Verify
curl http://localhost:8080/health
docker-compose logs -f
```

## Configuration

### Environment Variables

Key environment variables to configure:

```bash
# Database
DB_NAME=roip_production
DB_USER=roip_user
DB_PASSWORD=<strong-password>

# Authentication
JWT_SECRET=<random-256-bit-key>

# TURN/STUN
TURN_SERVER=<your-server-ip>
TURN_USERNAME=roip
TURN_PASSWORD=<strong-password>

# Domain (for SSL)
DOMAIN_NAME=roip.example.com
```

### Firewall Ports

Required open ports:

| Port(s) | Protocol | Purpose |
|---------|----------|---------|
| 22 | TCP | SSH (restrict to admin IPs) |
| 80, 443 | TCP | HTTP/HTTPS |
| 5060 | UDP | SIP signaling |
| 8080 | TCP | API (behind proxy) |
| 8081 | TCP | WebSocket (behind proxy) |
| 3478 | UDP/TCP | STUN |
| 5349 | TCP | TURNS (encrypted) |
| 10000-10100 | UDP | RTP media |
| 49152-65535 | UDP | TURN relay |

### SSL/TLS Certificates

```bash
# Option 1: Let's Encrypt (automated)
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d roip.example.com

# Option 2: Manual certificate
# Place cert files in /etc/roip/ssl/
# - server.crt
# - server.key
# - chain.pem
```

## Monitoring

### Access Grafana Dashboard

```
URL: http://your-server:3000
Default credentials:
  Username: admin
  Password: (set in GRAFANA_ADMIN_PASSWORD env var)
```

### Prometheus Metrics

```
URL: http://your-server:9090
```

### Health Checks

```bash
# Server health
curl http://localhost:8080/health

# Detailed health
curl http://localhost:8080/health/detailed

# Metrics
curl http://localhost:8080/metrics
```

## Backup and Recovery

### Automated Backups

```bash
# Configure backup
cd deployment/backup
cp backup-config.yml.example backup-config.yml
# Edit backup-config.yml

# Run manual backup
./backup.sh full

# Schedule automated backups (cron)
0 2 * * * /opt/roip/deployment/backup/backup.sh full
```

### Restore from Backup

```bash
cd deployment/backup

# Database restore
./restore.sh database 20251122_020000

# Full restore
./restore.sh full /var/backups/roip/
```

## Scaling

### Horizontal Scaling

```bash
# Docker Compose
docker-compose up -d --scale roip-server=3

# Kubernetes
kubectl scale deployment roip-server --replicas=5 -n roip-production
```

### Vertical Scaling

```bash
# Update docker-compose.prod.yml resources
deploy:
  resources:
    limits:
      cpus: '4.0'
      memory: 8G

# Recreate containers
docker-compose up -d
```

## Troubleshooting

### Common Issues

1. **Service won't start**
   ```bash
   # Check logs
   docker-compose logs roip-server
   # Or
   sudo journalctl -u roip-server -f
   ```

2. **Database connection failed**
   ```bash
   # Test database
   docker-compose exec postgres psql -U roip_user -d roip_production
   ```

3. **High CPU/Memory**
   ```bash
   # Check resources
   docker stats
   htop
   ```

4. **Network issues**
   ```bash
   # Check firewall
   sudo ufw status
   # Test ports
   nc -zv localhost 5060
   ```

## Documentation

- [Production Deployment Guide](../docs/PRODUCTION_DEPLOYMENT.md)
- [Production Runbook](../docs/RUNBOOK.md)
- [Firmware Deployment](../docs/FIRMWARE_DEPLOYMENT.md)
- [Troubleshooting Guide](../ROIP_TROUBLESHOOTING.md)
- [API Reference](../ROIP_API_REFERENCE.md)

## Support

- **Issues**: https://github.com/yourorg/roip-system/issues
- **Discussions**: https://github.com/yourorg/roip-system/discussions
- **Email**: support@roip.example.com

## License

GPL-2.0 (same as MMDVM)

## Version

**Deployment Package Version**: 1.0.0
**Last Updated**: 2025-11-22
**Compatible with**: RoIP Server v1.x, ESP32 Firmware v1.x
