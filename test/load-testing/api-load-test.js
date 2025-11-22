/**
 * k6 API Load Test for ESP32 RoIP Server
 * Tests REST API endpoints under various load conditions
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { randomIntBetween, randomItem } from 'k6';

// Custom metrics
const errorRate = new Rate('errors');
const apiLatency = new Trend('api_latency');
const requestCount = new Counter('request_count');

// Test configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const API_KEY = __ENV.API_KEY || 'test-api-key';

// Test data
const devices = [];
const routes = [];

export const options = {
  stages: [
    { duration: '1m', target: 20 },
    { duration: '3m', target: 50 },
    { duration: '1m', target: 0 }
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500'],
    'errors': ['rate<0.05']
  }
};

// Setup function - runs once at the start
export function setup() {
  // Create test devices
  const setupDevices = [];
  for (let i = 0; i < 10; i++) {
    const res = http.post(`${BASE_URL}/api/devices`, JSON.stringify({
      id: `test-device-${i}`,
      name: `Test Device ${i}`,
      type: 'esp32'
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      }
    });

    if (res.status === 201) {
      setupDevices.push(res.json());
    }
  }

  return { devices: setupDevices };
}

// Main test function
export default function(data) {
  // Test 1: Get all devices
  group('Device Management', () => {
    const res = http.get(`${BASE_URL}/api/devices`, {
      headers: { 'Authorization': `Bearer ${API_KEY}` }
    });

    const success = check(res, {
      'status is 200': (r) => r.status === 200,
      'response time < 300ms': (r) => r.timings.duration < 300,
      'has devices array': (r) => Array.isArray(r.json().devices)
    });

    errorRate.add(!success);
    apiLatency.add(res.timings.duration);
    requestCount.add(1);
  });

  // Test 2: Get device status
  group('Device Status', () => {
    if (data.devices && data.devices.length > 0) {
      const device = randomItem(data.devices);
      const res = http.get(`${BASE_URL}/api/devices/${device.id}/status`, {
        headers: { 'Authorization': `Bearer ${API_KEY}` }
      });

      check(res, {
        'status is 200': (r) => r.status === 200,
        'has status field': (r) => r.json().status !== undefined
      });

      apiLatency.add(res.timings.duration);
      requestCount.add(1);
    }
  });

  // Test 3: Batch API requests
  group('Batch Requests', () => {
    const responses = http.batch([
      ['GET', `${BASE_URL}/api/devices`, null, { headers: { 'Authorization': `Bearer ${API_KEY}` } }],
      ['GET', `${BASE_URL}/api/routes`, null, { headers: { 'Authorization': `Bearer ${API_KEY}` } }],
      ['GET', `${BASE_URL}/api/status`, null, { headers: { 'Authorization': `Bearer ${API_KEY}` } }],
      ['GET', `${BASE_URL}/api/metrics`, null, { headers: { 'Authorization': `Bearer ${API_KEY}` } }]
    ]);

    responses.forEach((res, idx) => {
      const success = check(res, {
        'status is 200': (r) => r.status === 200,
        'response time < 500ms': (r) => r.timings.duration < 500
      });

      errorRate.add(!success);
      apiLatency.add(res.timings.duration);
      requestCount.add(1);
    });
  });

  // Test 4: Route management
  group('Route Management', () => {
    const res = http.get(`${BASE_URL}/api/routes`, {
      headers: { 'Authorization': `Bearer ${API_KEY}` }
    });

    check(res, {
      'status is 200': (r) => r.status === 200,
      'has routes array': (r) => Array.isArray(r.json().routes)
    });

    apiLatency.add(res.timings.duration);
    requestCount.add(1);
  });

  // Test 5: Create and delete route
  group('Route CRUD', () => {
    if (data.devices && data.devices.length >= 2) {
      // Create route
      const createRes = http.post(`${BASE_URL}/api/routes`, JSON.stringify({
        source: data.devices[0].id,
        destination: data.devices[1].id,
        type: 'permanent'
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        }
      });

      check(createRes, {
        'route created': (r) => r.status === 201
      });

      // Delete route if created
      if (createRes.status === 201) {
        const routeId = createRes.json().id;
        const deleteRes = http.del(`${BASE_URL}/api/routes/${routeId}`, null, {
          headers: { 'Authorization': `Bearer ${API_KEY}` }
        });

        check(deleteRes, {
          'route deleted': (r) => r.status === 204
        });
      }

      requestCount.add(2);
    }
  });

  // Test 6: Metrics endpoint
  group('Metrics', () => {
    const res = http.get(`${BASE_URL}/api/metrics`, {
      headers: { 'Authorization': `Bearer ${API_KEY}` }
    });

    check(res, {
      'status is 200': (r) => r.status === 200,
      'has metrics': (r) => r.json().metrics !== undefined
    });

    apiLatency.add(res.timings.duration);
    requestCount.add(1);
  });

  // Think time between iterations
  sleep(randomIntBetween(1, 3));
}

// Teardown function - runs once at the end
export function teardown(data) {
  // Clean up test devices
  if (data.devices) {
    data.devices.forEach(device => {
      http.del(`${BASE_URL}/api/devices/${device.id}`, null, {
        headers: { 'Authorization': `Bearer ${API_KEY}` }
      });
    });
  }
}

// Handle summary for custom reporting
export function handleSummary(data) {
  return {
    'summary.json': JSON.stringify(data),
    'stdout': textSummary(data, { indent: ' ', enableColors: true })
  };
}

function textSummary(data, options) {
  const indent = options.indent || '';
  let summary = '\n' + indent + 'API Load Test Summary\n';
  summary += indent + '='.repeat(50) + '\n\n';

  // Add custom formatting
  if (data.metrics.http_req_duration) {
    summary += indent + `Request Duration:\n`;
    summary += indent + `  avg: ${data.metrics.http_req_duration.values.avg.toFixed(2)}ms\n`;
    summary += indent + `  p95: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms\n`;
    summary += indent + `  p99: ${data.metrics.http_req_duration.values['p(99)'].toFixed(2)}ms\n\n`;
  }

  if (data.metrics.errors) {
    summary += indent + `Error Rate: ${(data.metrics.errors.values.rate * 100).toFixed(2)}%\n\n`;
  }

  return summary;
}
