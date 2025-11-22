#!/usr/bin/env node

/**
 * Performance Benchmarking Script for RoIP Server
 * Uses autocannon for HTTP load testing
 */

import autocannon from 'autocannon';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_URL = process.env.API_URL || 'http://localhost:8080';
const DURATION = parseInt(process.env.DURATION) || 30; // seconds
const CONNECTIONS = parseInt(process.env.CONNECTIONS) || 100;

console.log('═══════════════════════════════════════════════════');
console.log('  RoIP Server Performance Benchmark');
console.log('═══════════════════════════════════════════════════\n');
console.log(`Target URL: ${API_URL}`);
console.log(`Duration: ${DURATION} seconds`);
console.log(`Concurrent connections: ${CONNECTIONS}`);
console.log('═══════════════════════════════════════════════════\n');

const results = {
  timestamp: new Date().toISOString(),
  configuration: {
    url: API_URL,
    duration: DURATION,
    connections: CONNECTIONS
  },
  benchmarks: {}
};

/**
 * Run a single benchmark
 */
async function runBenchmark(name, options) {
  console.log(`\n🚀 Running: ${name}...`);

  const instance = autocannon({
    url: options.url || API_URL,
    duration: options.duration || DURATION,
    connections: options.connections || CONNECTIONS,
    pipelining: options.pipelining || 1,
    method: options.method || 'GET',
    headers: options.headers || {},
    body: options.body,
    ...options
  });

  return new Promise((resolve, reject) => {
    autocannon.track(instance, { renderProgressBar: true });

    instance.on('done', (result) => {
      console.log(`✓ ${name} completed`);

      const summary = {
        requestsTotal: result.requests.total,
        requestsPerSecond: result.requests.average.toFixed(2),
        latency: {
          mean: result.latency.mean.toFixed(2),
          stddev: result.latency.stddev.toFixed(2),
          p50: result.latency.p50,
          p75: result.latency.p75,
          p90: result.latency.p90,
          p95: result.latency.p95,
          p99: result.latency.p99,
          p999: result.latency.p99_9,
          max: result.latency.max
        },
        throughput: {
          mean: (result.throughput.mean / 1024 / 1024).toFixed(2) + ' MB/s',
          total: (result.throughput.total / 1024 / 1024).toFixed(2) + ' MB'
        },
        errors: result.errors,
        timeouts: result.timeouts,
        non2xx: result.non2xx,
        duration: result.duration
      };

      results.benchmarks[name] = summary;
      resolve(summary);
    });

    instance.on('error', reject);
  });
}

/**
 * Main benchmarking suite
 */
async function runAllBenchmarks() {
  try {
    // 1. Health endpoint (baseline)
    await runBenchmark('Health Endpoint (Baseline)', {
      url: `${API_URL}/health`,
      connections: 10,
      duration: 10
    });

    // 2. Health endpoint with moderate load
    await runBenchmark('Health Endpoint (Moderate Load)', {
      url: `${API_URL}/health`,
      connections: 50,
      duration: 30
    });

    // 3. Health endpoint with high load
    await runBenchmark('Health Endpoint (High Load)', {
      url: `${API_URL}/health`,
      connections: 100,
      duration: 30
    });

    // 4. Health endpoint with very high load
    await runBenchmark('Health Endpoint (Very High Load)', {
      url: `${API_URL}/health`,
      connections: 200,
      duration: 30
    });

    // 5. Metrics endpoint (if available)
    await runBenchmark('Metrics Endpoint', {
      url: `${API_URL}/metrics`,
      connections: 50,
      duration: 20
    });

    // 6. Pipeline test
    await runBenchmark('Health Endpoint (Pipelined)', {
      url: `${API_URL}/health`,
      connections: 50,
      pipelining: 10,
      duration: 20
    });

    // 7. Mixed load test
    await runBenchmark('Mixed Endpoints', {
      url: API_URL,
      connections: 100,
      duration: 30,
      requests: [
        { path: '/health', method: 'GET' },
        { path: '/metrics', method: 'GET' },
        { path: '/health', method: 'GET' }
      ]
    });

    // Print summary
    console.log('\n\n═══════════════════════════════════════════════════');
    console.log('  Benchmark Results Summary');
    console.log('═══════════════════════════════════════════════════\n');

    for (const [name, result] of Object.entries(results.benchmarks)) {
      console.log(`\n${name}:`);
      console.log(`  Requests/sec: ${result.requestsPerSecond}`);
      console.log(`  Avg Latency:  ${result.latency.mean} ms`);
      console.log(`  P95 Latency:  ${result.latency.p95} ms`);
      console.log(`  P99 Latency:  ${result.latency.p99} ms`);
      console.log(`  Throughput:   ${result.throughput.mean}`);
      console.log(`  Total Reqs:   ${result.requestsTotal}`);
      console.log(`  Errors:       ${result.errors}`);
      console.log(`  Timeouts:     ${result.timeouts}`);
    }

    // Calculate recommendations
    const recommendations = generateRecommendations();
    results.recommendations = recommendations;

    console.log('\n\n═══════════════════════════════════════════════════');
    console.log('  Performance Recommendations');
    console.log('═══════════════════════════════════════════════════\n');

    recommendations.forEach((rec, idx) => {
      console.log(`${idx + 1}. ${rec}`);
    });

    // Save results to file
    const outputPath = path.join(__dirname, '../benchmark-results.json');
    writeFileSync(outputPath, JSON.stringify(results, null, 2));

    console.log(`\n\n✓ Benchmark results saved to: ${outputPath}`);

    console.log('\n═══════════════════════════════════════════════════');
    console.log('  Benchmark Complete!');
    console.log('═══════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('Benchmark failed:', error);
    process.exit(1);
  }
}

/**
 * Generate performance recommendations based on results
 */
function generateRecommendations() {
  const recommendations = [];

  // Check latency
  const healthBaseline = results.benchmarks['Health Endpoint (Baseline)'];
  if (healthBaseline && healthBaseline.latency.mean > 50) {
    recommendations.push('Consider enabling compression to reduce response times');
  }

  // Check high load performance
  const healthHighLoad = results.benchmarks['Health Endpoint (High Load)'];
  if (healthHighLoad && healthHighLoad.errors > 0) {
    recommendations.push('Increase server resources or enable cluster mode for better error handling under load');
  }

  // Check throughput
  if (healthHighLoad && healthHighLoad.requestsPerSecond < 1000) {
    recommendations.push('Enable cluster mode to utilize multiple CPU cores');
    recommendations.push('Consider using a load balancer for horizontal scaling');
  }

  // Check P99 latency
  if (healthBaseline && healthBaseline.latency.p99 > 100) {
    recommendations.push('Enable API response caching to improve P99 latency');
  }

  // Check timeouts
  if (healthHighLoad && healthHighLoad.timeouts > 0) {
    recommendations.push('Increase timeout settings or optimize database queries');
  }

  // General recommendations
  recommendations.push('Monitor memory usage and enable object pooling for call management');
  recommendations.push('Enable keep-alive connections for better performance');
  recommendations.push('Use production configuration with optimized settings');

  return recommendations;
}

// Run all benchmarks
runAllBenchmarks().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
