# Load Testing Suite

This directory contains comprehensive load testing scenarios for the ESP32 RoIP system using k6.

## Prerequisites

### Install k6

**Linux:**
```bash
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

**macOS:**
```bash
brew install k6
```

**Docker:**
```bash
docker pull grafana/k6:latest
```

## Test Files

### 1. load-test-config.js

Configuration file defining test scenarios:
- **rampUp**: Gradually increase load (0 → 100 VUs)
- **stress**: High load stress test (up to 200 VUs)
- **spike**: Sudden traffic burst (100 → 500 VUs)
- **soak**: Long-running stability test (3 hours)
- **breakpoint**: Find system limits (incremental load increase)

### 2. api-load-test.js

Tests REST API endpoints:
- Device management (CRUD operations)
- Route management
- Status endpoints
- Metrics collection
- Batch requests

**Key Metrics:**
- Request rate (req/s)
- Response time (p50, p95, p99)
- Error rate
- API latency

### 3. call-load-test.js

Tests WebSocket/RTP call functionality:
- WebSocket connection establishment
- Call setup and teardown
- RTP packet transmission
- Audio quality metrics

**Key Metrics:**
- Call setup time
- Concurrent calls
- RTP latency
- Jitter
- Packet loss rate

## Running Tests

### Basic Usage

```bash
# Run API load test
k6 run api-load-test.js

# Run call load test
k6 run call-load-test.js

# Run with specific scenario
k6 run -e SCENARIO=stress api-load-test.js
```

### Advanced Options

```bash
# Set custom base URL
k6 run -e BASE_URL=https://roip.example.com api-load-test.js

# Run with authentication
k6 run -e API_KEY=your-api-key api-load-test.js

# Generate detailed output
k6 run --out json=results.json api-load-test.js

# Run specific scenario from config
k6 run --config load-test-config.js api-load-test.js

# Increase virtual users
k6 run --vus 100 --duration 5m api-load-test.js
```

### Using Docker

```bash
# Run API test in Docker
docker run --rm -i grafana/k6:latest run - <api-load-test.js

# Run with host network access
docker run --rm --network="host" -v $(pwd):/scripts grafana/k6:latest run /scripts/api-load-test.js
```

## Test Scenarios

### 1. Ramp-Up Test (Quick Validation)

**Purpose:** Validate system handles gradual load increase

```bash
k6 run --vus 0 --stage 2m:10 --stage 5m:50 --stage 5m:100 --stage 2m:0 api-load-test.js
```

**Expected Results:**
- Response time (p95) < 500ms
- Error rate < 1%
- No memory leaks

**Duration:** ~14 minutes

### 2. Stress Test (Capacity Testing)

**Purpose:** Find system breaking point

```bash
k6 run --stage 5m:100 --stage 10m:200 --stage 5m:0 api-load-test.js
```

**Expected Results:**
- System handles 200 concurrent users
- Graceful degradation if exceeded
- No crashes

**Duration:** ~20 minutes

### 3. Spike Test (Resilience)

**Purpose:** Test system recovery from sudden load

```bash
k6 run --stage 10s:100 --stage 1m:100 --stage 10s:500 --stage 3m:500 --stage 10s:100 --stage 3m:100 api-load-test.js
```

**Expected Results:**
- Graceful degradation during spike
- Recovery within 30 seconds
- No data loss

**Duration:** ~8 minutes

### 4. Soak Test (Stability)

**Purpose:** Detect memory leaks and degradation over time

```bash
k6 run --vus 50 --duration 3h call-load-test.js
```

**Expected Results:**
- Stable performance over time
- No memory leaks
- Consistent response times

**Duration:** 3 hours

### 5. Breakpoint Test (Limits)

**Purpose:** Find exact system capacity

```bash
k6 run --stage 2m:10 --stage 2m:50 --stage 2m:100 --stage 2m:200 --stage 2m:400 api-load-test.js
```

**Expected Results:**
- Identify max concurrent users
- Document resource limits
- Set capacity planning metrics

**Duration:** ~10 minutes

## Interpreting Results

### Response Time Targets

| Percentile | Target | Acceptable | Critical |
|------------|--------|------------|----------|
| p50 | < 50ms | < 100ms | > 200ms |
| p95 | < 100ms | < 300ms | > 500ms |
| p99 | < 200ms | < 500ms | > 1000ms |

### Error Rate Thresholds

- **Good:** < 0.1%
- **Acceptable:** < 1%
- **Critical:** > 5%

### Call Performance Targets

| Metric | Target | Acceptable | Critical |
|--------|--------|------------|----------|
| Setup Time (p95) | < 1s | < 2s | > 3s |
| RTP Latency (p95) | < 100ms | < 150ms | > 200ms |
| Jitter (avg) | < 20ms | < 30ms | > 50ms |
| Packet Loss | < 0.5% | < 2% | > 5% |

## Output Formats

### JSON Output

```bash
k6 run --out json=results.json api-load-test.js
```

Generates detailed JSON with all metrics for analysis.

### CSV Output

```bash
k6 run --out csv=results.csv api-load-test.js
```

### InfluxDB Output

```bash
k6 run --out influxdb=http://localhost:8086/k6 api-load-test.js
```

Sends metrics to InfluxDB for Grafana visualization.

### Cloud Output

```bash
k6 run --out cloud api-load-test.js
```

Sends results to k6 Cloud for analysis.

## Performance Regression Testing

### Automated Testing

Create a CI/CD pipeline step:

```bash
#!/bin/bash
# run-performance-tests.sh

# Run quick validation test
k6 run --quiet api-load-test.js > results.json

# Extract p95 response time
P95=$(jq '.metrics.http_req_duration.values.p95' results.json)

# Compare to threshold
if (( $(echo "$P95 > 500" | bc -l) )); then
  echo "Performance regression detected! p95: ${P95}ms"
  exit 1
fi

echo "Performance test passed. p95: ${P95}ms"
```

### Weekly Performance Report

```bash
# Generate weekly performance report
./scripts/weekly-performance-report.sh
```

## Troubleshooting

### High Error Rates

**Symptoms:**
- Error rate > 5%
- Many 5xx responses

**Solutions:**
1. Check server logs
2. Verify database connectivity
3. Check resource limits (CPU, memory, connections)
4. Reduce load to find stable capacity

### Connection Failures

**Symptoms:**
- WebSocket connection failures
- "Connection refused" errors

**Solutions:**
1. Verify server is running
2. Check firewall rules
3. Verify URL and ports
4. Check connection limits

### Inconsistent Results

**Symptoms:**
- Metrics vary significantly between runs

**Solutions:**
1. Run tests multiple times
2. Ensure clean system state before tests
3. Check for background processes
4. Use dedicated test environment

## Best Practices

1. **Baseline First**: Always establish baseline before optimizations
2. **Isolate Changes**: Test one optimization at a time
3. **Multiple Runs**: Run tests 3-5 times, use median
4. **Clean State**: Reset system between tests
5. **Document Everything**: Record conditions, changes, results
6. **Monitor Resources**: Watch CPU, memory, network during tests
7. **Gradual Load**: Don't start at max capacity
8. **Real Scenarios**: Use realistic user behavior patterns

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Performance Tests

on:
  push:
    branches: [main]
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM

jobs:
  performance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run k6 tests
        uses: grafana/k6-action@v0.3.0
        with:
          filename: test/load-testing/api-load-test.js
          cloud: true
```

## Resources

- [k6 Documentation](https://k6.io/docs/)
- [k6 Examples](https://github.com/grafana/k6/tree/master/examples)
- [Performance Testing Guide](https://k6.io/docs/testing-guides/)
- [k6 Cloud](https://app.k6.io/)

## Support

For issues or questions:
1. Check test logs
2. Review documentation
3. Open GitHub issue
4. Contact performance engineering team
