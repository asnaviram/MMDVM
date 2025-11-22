# RoIP Monitoring Setup Guide

Complete guide for setting up and using the comprehensive monitoring infrastructure for the ESP32 RoIP system.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Components](#components)
4. [Installation](#installation)
5. [Configuration](#configuration)
6. [Dashboards](#dashboards)
7. [Alerting](#alerting)
8. [Metrics Reference](#metrics-reference)
9. [Troubleshooting](#troubleshooting)
10. [Best Practices](#best-practices)

---

## Overview

The RoIP monitoring stack provides comprehensive observability for production deployments:

- **Metrics Collection**: Prometheus scrapes metrics from multiple exporters
- **Visualization**: Grafana dashboards for real-time monitoring
- **Alerting**: Prometheus Alertmanager for incident notifications
- **Log Aggregation**: Loki for centralized log management
- **Health Checks**: Blackbox Exporter for endpoint probing

### Key Features

- 6 comprehensive Grafana dashboards
- 50+ alert rules covering all critical scenarios
- Real-time RTP/audio quality monitoring
- SIP signaling metrics
- Database performance tracking
- Security event monitoring
- Custom business metrics

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Monitoring Stack                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐     ┌──────────────┐     ┌────────────┐ │
│  │  Prometheus  │────▶│ Alertmanager │────▶│  Webhook   │ │
│  │   :9090      │     │    :9093     │     │  /Email    │ │
│  └──────────────┘     └──────────────┘     └────────────┘ │
│         ▲                                                   │
│         │                                                   │
│         │ scrape metrics                                    │
│         │                                                   │
│  ┌──────┴───────────────────────────────────────────────┐  │
│  │                                                        │  │
│  │  Exporters:                                           │  │
│  │  • RoIP Server Metrics (:9100)                       │  │
│  │  • RTP Metrics (:9101)                               │  │
│  │  • SIP Metrics (:9102)                               │  │
│  │  • Node Exporter (:9100)                             │  │
│  │  • Postgres Exporter (:9187)                         │  │
│  │  • cAdvisor (:8080)                                  │  │
│  │  • Blackbox Exporter (:9115)                         │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────┐     ┌──────────────┐                    │
│  │   Grafana    │────▶│     Loki     │◀──── Promtail     │
│  │    :3000     │     │    :3100     │                    │
│  └──────────────┘     └──────────────┘                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. Prometheus (Port 9090)

**Purpose**: Time-series metrics database and scraping engine

**Key Features**:
- Scrapes metrics every 15s (default)
- 30-day data retention
- PromQL query language
- Alert rule evaluation

**Access**: http://localhost:9090

### 2. Grafana (Port 3000)

**Purpose**: Visualization and dashboarding

**Key Features**:
- Pre-configured dashboards
- Auto-provisioned datasources
- Custom queries and panels
- Alert visualization

**Access**: http://localhost:3000
**Credentials**: admin / roip_admin_2024

### 3. Alertmanager (Port 9093)

**Purpose**: Alert routing and notification management

**Key Features**:
- Alert grouping and deduplication
- Multiple notification channels
- Alert inhibition rules
- Silence management

**Access**: http://localhost:9093

### 4. Loki (Port 3100)

**Purpose**: Log aggregation system

**Key Features**:
- Label-based log indexing
- LogQL query language
- Integration with Grafana
- 720h log retention

**Access**: http://localhost:3100

### 5. Node Exporter (Port 9100)

**Purpose**: System-level metrics (CPU, memory, disk, network)

**Metrics Collected**:
- CPU usage and load
- Memory and swap usage
- Disk I/O and space
- Network traffic

### 6. Postgres Exporter (Port 9187)

**Purpose**: PostgreSQL database metrics

**Metrics Collected**:
- Connection pool usage
- Query performance
- Transaction rates
- Cache hit ratio
- Database size

### 7. cAdvisor (Port 8080)

**Purpose**: Container resource usage metrics

**Metrics Collected**:
- Container CPU usage
- Container memory usage
- Network I/O per container
- Filesystem usage

### 8. Blackbox Exporter (Port 9115)

**Purpose**: Endpoint health checks and probing

**Probes**:
- HTTP/HTTPS endpoints
- TCP/UDP ports (SIP)
- ICMP ping
- WebSocket connections

---

## Installation

### Prerequisites

- Docker and Docker Compose installed
- At least 4GB RAM available
- 50GB disk space for metrics storage

### Quick Start

1. **Clone the repository**:
   ```bash
   cd /path/to/MMDVM
   ```

2. **Set environment variables**:
   ```bash
   export POSTGRES_PASSWORD=your_secure_password
   ```

3. **Start the monitoring stack**:
   ```bash
   docker-compose -f docker-compose.monitoring.yml up -d
   ```

4. **Verify all services are running**:
   ```bash
   docker-compose -f docker-compose.monitoring.yml ps
   ```

5. **Access Grafana**:
   - URL: http://localhost:3000
   - Username: admin
   - Password: roip_admin_2024

### Step-by-Step Deployment

#### 1. Create Docker Network

```bash
docker network create roip-network
```

#### 2. Start PostgreSQL First

```bash
docker-compose -f docker-compose.monitoring.yml up -d postgres
```

#### 3. Start Monitoring Components

```bash
docker-compose -f docker-compose.monitoring.yml up -d \
  prometheus alertmanager grafana loki promtail
```

#### 4. Start Exporters

```bash
docker-compose -f docker-compose.monitoring.yml up -d \
  node-exporter postgres-exporter cadvisor blackbox-exporter
```

#### 5. Verify Services

```bash
# Check Prometheus targets
curl http://localhost:9090/api/v1/targets

# Check Grafana health
curl http://localhost:3000/api/health

# Check Alertmanager
curl http://localhost:9093/-/healthy
```

---

## Configuration

### Prometheus Configuration

**Location**: `monitoring/prometheus/prometheus.yml`

**Key Settings**:
- `scrape_interval: 15s` - How often to scrape targets
- `evaluation_interval: 15s` - How often to evaluate rules
- `retention.time: 30d` - Data retention period

**Adding New Scrape Targets**:

```yaml
scrape_configs:
  - job_name: 'my-new-service'
    static_configs:
      - targets: ['my-service:9100']
        labels:
          service: 'my-service'
```

### Alert Rules

**Location**: `monitoring/prometheus/alerts.yml`

**Alert Groups**:
- Infrastructure (CPU, memory, disk)
- Database (connections, queries, errors)
- RTP/Audio Quality (packet loss, jitter, latency)
- SIP Signaling (registrations, calls)
- Application (HTTP errors, latency)
- Security (auth failures, rate limits)
- Health Checks (service availability)

**Creating Custom Alerts**:

```yaml
groups:
  - name: custom_alerts
    interval: 30s
    rules:
      - alert: HighCustomMetric
        expr: my_custom_metric > 100
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Custom metric is high"
          description: "Value: {{ $value }}"
```

### Grafana Datasources

**Auto-configured datasources**:
- Prometheus (default)
- Loki (logs)
- PostgreSQL (direct DB queries)

**Configuration**: `monitoring/grafana/provisioning/datasources/datasources.yml`

### Loki Configuration

**Location**: `monitoring/loki/loki-config.yml`

**Key Settings**:
- Retention: 720h (30 days)
- Storage: Filesystem (local)
- Ingestion rate: 16MB/s

---

## Dashboards

### 1. System Overview Dashboard

**UID**: `roip-system-overview`

**Panels**:
- Service status indicators
- Active devices and calls
- CPU and memory usage gauges
- HTTP request rates and latency
- Network traffic
- Disk space usage

**Use Case**: High-level system health monitoring

### 2. RTP/Audio Quality Dashboard

**UID**: `roip-rtp-audio`

**Panels**:
- Packet loss per stream
- Jitter measurements
- Latency tracking
- RTP packet rates
- Buffer size and issues
- Active stream count

**Use Case**: Real-time audio quality monitoring

**Alert Thresholds**:
- Packet Loss: Warning >5%, Critical >10%
- Jitter: Warning >30ms, Critical >50ms
- Latency: Warning >150ms, Critical >250ms

### 3. SIP Call Metrics Dashboard

**UID**: `roip-sip-calls`

**Panels**:
- Active registrations and calls
- Call success rate gauge
- Call setup duration percentiles
- SIP response codes
- SIP messages by method
- Error rates

**Use Case**: VoIP signaling and call quality monitoring

### 4. Database Performance Dashboard

**UID**: `roip-database-perf`

**Panels**:
- Connection pool usage
- Transaction rates
- Query operations (insert, update, delete, select)
- Cache hit ratio
- Block I/O rates
- Conflicts and deadlocks

**Use Case**: Database optimization and troubleshooting

### 5. Security Monitoring Dashboard

**UID**: `roip-security`

**Panels**:
- Authentication failures by IP
- Security events by type
- Rate limit violations
- HTTP security errors (401, 403, 429)
- Top failed login IPs
- TLS certificate expiry

**Use Case**: Security incident detection and response

### 6. Error Tracking Dashboard

**UID**: `roip-errors`

**Panels**:
- HTTP 5xx errors by status code
- Application errors by level
- SIP errors
- RTP errors by type
- Top error endpoints
- Recent error logs (from Loki)
- Database errors
- Node.js critical errors

**Use Case**: Debugging and error analysis

---

## Alerting

### Alert Severity Levels

- **Critical**: Immediate action required (service down, critical failures)
- **Warning**: Action needed soon (high resource usage, degraded performance)
- **Info**: Informational only (low device count, high call volume)

### Alert Routing

**Configuration**: `monitoring/alertmanager/alertmanager.yml`

**Teams and Receivers**:
- `critical-alerts`: Oncall team (email + webhook)
- `infrastructure-team`: Infrastructure alerts
- `database-team`: Database issues
- `security-team`: Security events
- `operations-team`: Audio quality issues
- `voip-team`: SIP/call issues

### Notification Channels

#### Email Notifications

Configure SMTP in `alertmanager.yml`:

```yaml
global:
  smtp_smarthost: 'smtp.example.com:587'
  smtp_from: 'alerts@roip.example.com'
  smtp_auth_username: 'alerts'
  smtp_auth_password: 'password'
  smtp_require_tls: true
```

#### Webhook Integration

For Slack, PagerDuty, or custom webhooks:

```yaml
receivers:
  - name: 'slack-alerts'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL'
        channel: '#alerts'
        title: '{{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'
```

### Silencing Alerts

**Via Alertmanager UI**:
1. Go to http://localhost:9093
2. Click "Silences" → "New Silence"
3. Set matchers (e.g., `alertname="HighCPUUsage"`)
4. Set duration and comment
5. Create

**Via API**:
```bash
curl -X POST http://localhost:9093/api/v1/silences \
  -H "Content-Type: application/json" \
  -d '{
    "matchers": [{"name":"alertname","value":"HighCPUUsage","isRegex":false}],
    "startsAt": "2024-01-01T00:00:00Z",
    "endsAt": "2024-01-01T01:00:00Z",
    "createdBy": "admin",
    "comment": "Planned maintenance"
  }'
```

---

## Metrics Reference

### Application Metrics

| Metric | Type | Description | Labels |
|--------|------|-------------|--------|
| `http_requests_total` | Counter | Total HTTP requests | method, path, status |
| `http_request_duration_seconds` | Histogram | Request duration | method, path |
| `application_errors_total` | Counter | Application errors | level, type |
| `active_devices_total` | Gauge | Active ESP32 devices | - |
| `active_calls_total` | Gauge | Active calls | - |
| `websocket_connections_active` | Gauge | Active WebSocket connections | - |

### RTP Metrics

| Metric | Type | Description | Labels |
|--------|------|-------------|--------|
| `rtp_packet_loss_percent` | Gauge | Packet loss percentage | call_id, device_id |
| `rtp_jitter_ms` | Gauge | Jitter in milliseconds | call_id, device_id |
| `rtp_latency_ms` | Gauge | Latency in milliseconds | call_id, device_id |
| `rtp_buffer_size_packets` | Gauge | Buffer size | call_id, device_id |
| `rtp_buffer_underruns_total` | Counter | Buffer underruns | - |
| `rtp_buffer_overflows_total` | Counter | Buffer overflows | - |
| `rtp_packets_received_total` | Counter | Total packets received | - |
| `rtp_packets_sent_total` | Counter | Total packets sent | - |

### SIP Metrics

| Metric | Type | Description | Labels |
|--------|------|-------------|--------|
| `sip_active_registrations` | Gauge | Active SIP registrations | - |
| `sip_active_calls` | Gauge | Active SIP calls | - |
| `sip_call_attempts_total` | Counter | Total call attempts | - |
| `sip_calls_established_total` | Counter | Successfully established calls | - |
| `sip_call_setup_failures_total` | Counter | Call setup failures | - |
| `sip_messages_total` | Counter | SIP messages | method |
| `sip_responses_total` | Counter | SIP responses | code |
| `sip_invalid_messages_total` | Counter | Invalid SIP messages | - |

### Database Metrics

| Metric | Type | Description | Labels |
|--------|------|-------------|--------|
| `pg_up` | Gauge | Database status (1=up) | - |
| `pg_stat_database_numbackends` | Gauge | Active connections | - |
| `pg_settings_max_connections` | Gauge | Max connections | - |
| `pg_stat_database_xact_commit` | Counter | Committed transactions | - |
| `pg_stat_database_xact_rollback` | Counter | Rolled back transactions | - |
| `pg_stat_database_blks_hit` | Counter | Blocks hit (cache) | - |
| `pg_stat_database_blks_read` | Counter | Blocks read (disk) | - |

### Security Metrics

| Metric | Type | Description | Labels |
|--------|------|-------------|--------|
| `auth_failures_total` | Counter | Authentication failures | source_ip, reason |
| `rate_limit_exceeded_total` | Counter | Rate limit violations | endpoint, source_ip |
| `security_events_total` | Counter | Security events | type, severity |

---

## Troubleshooting

### Common Issues

#### 1. Prometheus Not Scraping Targets

**Symptoms**: Targets show as "DOWN" in Prometheus UI

**Solutions**:
- Check target is reachable: `curl http://target:port/metrics`
- Verify network connectivity between containers
- Check Docker network configuration
- Review Prometheus logs: `docker logs roip-prometheus`

#### 2. Grafana Dashboards Show No Data

**Symptoms**: Empty panels or "No data" messages

**Solutions**:
- Verify Prometheus datasource is configured
- Check time range selection
- Verify metrics are being scraped in Prometheus
- Check PromQL queries in panel settings
- Review Grafana logs: `docker logs roip-grafana`

#### 3. Alerts Not Firing

**Symptoms**: Expected alerts don't trigger

**Solutions**:
- Check alert rules in Prometheus UI → Alerts
- Verify alert expression returns data
- Check `for` duration hasn't been met yet
- Review Alertmanager configuration
- Check Alertmanager logs: `docker logs roip-alertmanager`

#### 4. High Memory Usage

**Symptoms**: Prometheus/Grafana consuming too much memory

**Solutions**:
- Reduce retention time in Prometheus config
- Increase scrape intervals
- Remove unnecessary targets
- Add resource limits in docker-compose:
  ```yaml
  prometheus:
    deploy:
      resources:
        limits:
          memory: 2G
  ```

#### 5. Loki Not Receiving Logs

**Symptoms**: No logs in Grafana Explore

**Solutions**:
- Check Promtail is running: `docker ps | grep promtail`
- Verify log file paths in promtail config
- Check Loki is accessible from Promtail
- Review Promtail logs: `docker logs roip-promtail`
- Test Loki API: `curl http://localhost:3100/ready`

### Debug Commands

```bash
# Check all services status
docker-compose -f docker-compose.monitoring.yml ps

# View logs for specific service
docker logs -f roip-prometheus
docker logs -f roip-grafana
docker logs -f roip-alertmanager

# Restart specific service
docker-compose -f docker-compose.monitoring.yml restart prometheus

# Check Prometheus configuration
curl http://localhost:9090/api/v1/status/config

# Check Prometheus targets
curl http://localhost:9090/api/v1/targets | jq .

# Test Prometheus query
curl 'http://localhost:9090/api/v1/query?query=up'

# Check Alertmanager status
curl http://localhost:9093/api/v1/status

# Test Loki query
curl -G -s 'http://localhost:3100/loki/api/v1/query' \
  --data-urlencode 'query={job="roip-server"}'
```

---

## Best Practices

### 1. Metric Naming

Follow Prometheus naming conventions:
- Use lowercase with underscores
- Include unit suffix (`_bytes`, `_seconds`, `_total`)
- Use descriptive prefixes (`http_`, `rtp_`, `sip_`)

### 2. Label Usage

- Keep label cardinality low (avoid unique values per request)
- Use consistent label names across metrics
- Don't use labels for high-cardinality data (IDs, timestamps)

### 3. Alert Design

- Set appropriate `for` durations to avoid flapping
- Use severity levels consistently
- Include actionable descriptions in annotations
- Test alerts before deploying

### 4. Dashboard Organization

- Group related panels together
- Use consistent time ranges
- Add panel descriptions
- Set appropriate refresh intervals (10s-30s)

### 5. Data Retention

- Balance storage costs with retention needs
- Use recording rules for frequently queried data
- Consider remote storage for long-term retention

### 6. Security

- Change default Grafana credentials
- Use TLS for external access
- Implement authentication for Prometheus/Alertmanager
- Restrict network access to monitoring ports
- Regularly update container images

### 7. Resource Management

- Monitor monitoring stack resource usage
- Set resource limits in production
- Use separate storage volumes for data
- Implement backup strategies for metrics and configs

### 8. Integration

**RoIP Server Integration**:

Add to your server startup code:

```javascript
import { initializeMetrics } from './monitoring/metrics-exporter.js';
import { initializeRTPMetrics } from './monitoring/rtp-metrics.js';
import { initializeSIPMetrics } from './monitoring/sip-metrics.js';

// Initialize exporters
const metrics = initializeMetrics({ port: 9100 });
const rtpMetrics = initializeRTPMetrics({ port: 9101 });
const sipMetrics = initializeSIPMetrics({ port: 9102 });

// Use middleware
app.use(metrics.httpMetricsMiddleware());

// Track events
metrics.updateActiveDevices(deviceCount);
rtpMetrics.initializeStream(callId, deviceId);
sipMetrics.trackRegistration(true, deviceId);
```

---

## Maintenance

### Regular Tasks

**Daily**:
- Review critical alerts
- Check dashboard for anomalies
- Monitor disk usage

**Weekly**:
- Review alert trends
- Update dashboards as needed
- Check for service updates

**Monthly**:
- Review and update alert thresholds
- Clean up old silences
- Update documentation
- Backup Grafana dashboards and configs

### Backup and Restore

**Backup Prometheus Data**:
```bash
docker run --rm -v prometheus-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/prometheus-backup.tar.gz /data
```

**Restore Prometheus Data**:
```bash
docker run --rm -v prometheus-data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/prometheus-backup.tar.gz -C /
```

**Export Grafana Dashboards**:
```bash
# Via API
curl -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:3000/api/dashboards/uid/roip-system-overview > dashboard-backup.json
```

---

## Resources

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [PromQL Basics](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [Alert Rule Examples](https://awesome-prometheus-alerts.grep.to/)
- [Loki Documentation](https://grafana.com/docs/loki/latest/)

---

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review component logs
3. Consult official documentation
4. Contact the operations team

---

**Last Updated**: 2024-11-22
**Version**: 1.0.0
