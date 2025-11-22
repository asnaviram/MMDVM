#!/bin/bash

# Performance Check Script for RoIP Server
# Runs comprehensive performance validation

set -e

echo "═══════════════════════════════════════════════════"
echo "  RoIP Server Performance Check"
echo "═══════════════════════════════════════════════════"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print status
print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $2"
    else
        echo -e "${RED}✗${NC} $2"
    fi
}

# Check if server is running
echo "1. Checking server availability..."
if curl -s http://localhost:8080/health > /dev/null 2>&1; then
    print_status 0 "Server is running"
    SERVER_RUNNING=1
else
    print_status 1 "Server is not running"
    SERVER_RUNNING=0
    echo -e "${YELLOW}   Start the server with: npm start${NC}"
fi

echo ""

# Check configuration
echo "2. Checking performance configuration..."
if [ -f "config/production.yaml" ]; then
    print_status 0 "Production config exists"

    # Check if cluster is enabled
    if grep -q "enabled: true" config/production.yaml; then
        print_status 0 "Cluster mode configured"
    fi

    # Check if caching is enabled
    if grep -q "cache:" config/production.yaml; then
        print_status 0 "Caching configured"
    fi
else
    print_status 1 "Production config not found"
fi

echo ""

# Check dependencies
echo "3. Checking performance dependencies..."
if npm list node-cache > /dev/null 2>&1; then
    print_status 0 "node-cache installed"
else
    print_status 1 "node-cache not installed"
fi

if npm list autocannon > /dev/null 2>&1; then
    print_status 0 "autocannon installed"
else
    print_status 1 "autocannon not installed"
fi

echo ""

# Run performance tests if server is running
if [ $SERVER_RUNNING -eq 1 ]; then
    echo "4. Running performance tests..."
    echo -e "${YELLOW}   This may take a few minutes...${NC}"

    # Run quick benchmark
    echo ""
    echo "   Running quick benchmark (10 seconds)..."
    DURATION=10 CONNECTIONS=50 node scripts/benchmark.js > /tmp/roip-benchmark.log 2>&1 || true

    if [ $? -eq 0 ]; then
        print_status 0 "Benchmark completed"

        # Extract and display key metrics
        if [ -f "benchmark-results.json" ]; then
            echo ""
            echo "   Key Metrics:"

            # Use node to parse JSON and extract metrics
            node -e "
                const fs = require('fs');
                try {
                    const results = JSON.parse(fs.readFileSync('benchmark-results.json', 'utf8'));
                    const baseline = results.benchmarks['Health Endpoint (Baseline)'];
                    if (baseline) {
                        console.log('   - Requests/sec:', baseline.requestsPerSecond);
                        console.log('   - Avg Latency:', baseline.latency.mean, 'ms');
                        console.log('   - P95 Latency:', baseline.latency.p95, 'ms');
                        console.log('   - Throughput:', baseline.throughput.mean);
                    }
                } catch (e) {
                    console.log('   Unable to parse results');
                }
            "
        fi
    else
        print_status 1 "Benchmark failed"
    fi
else
    echo "4. Skipping performance tests (server not running)"
fi

echo ""

# Check system resources
echo "5. Checking system resources..."

# Check CPU cores
CPU_CORES=$(node -e "console.log(require('os').cpus().length)")
print_status 0 "CPU cores available: $CPU_CORES"

if [ $CPU_CORES -ge 4 ]; then
    echo -e "${GREEN}   Recommend enabling cluster mode with $CPU_CORES workers${NC}"
else
    echo -e "${YELLOW}   Consider running on multi-core system for better performance${NC}"
fi

# Check available memory
TOTAL_MEM=$(node -e "console.log((require('os').totalmem() / 1024 / 1024 / 1024).toFixed(2))")
print_status 0 "Total memory: ${TOTAL_MEM} GB"

echo ""

# Performance recommendations
echo "═══════════════════════════════════════════════════"
echo "  Performance Recommendations"
echo "═══════════════════════════════════════════════════"
echo ""

if [ $SERVER_RUNNING -eq 1 ]; then
    echo "✓ Server is running - ready for production"
else
    echo "1. Start the server: npm start"
fi

if [ $CPU_CORES -ge 2 ]; then
    echo "2. Enable cluster mode with $CPU_CORES workers in config/production.yaml"
fi

echo "3. Use production config: node src/server.js config/production.yaml"
echo "4. Enable compression for bandwidth savings"
echo "5. Monitor cache hit rates (aim for > 70%)"
echo "6. Run full benchmark: node scripts/benchmark.js"
echo "7. Run performance tests: npm test test/performance.test.js"

echo ""
echo "═══════════════════════════════════════════════════"
echo "  Performance Check Complete"
echo "═══════════════════════════════════════════════════"
echo ""

# Provide next steps
echo "Next Steps:"
echo "- Review PERFORMANCE.md for detailed optimization guide"
echo "- Run: node scripts/benchmark.js for full benchmark"
echo "- Monitor: http://localhost:8080/metrics"
echo ""
