/**
 * k6 Load Test Configuration for ESP32 RoIP System
 * This configuration defines various testing scenarios to evaluate system performance
 * under different load conditions.
 */

export default {
  scenarios: {
    // Ramp up test - Gradually increase load to test system scaling
    rampUp: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 10 },   // Warm up
        { duration: '5m', target: 50 },   // Moderate load
        { duration: '5m', target: 100 },  // High load
        { duration: '2m', target: 0 }     // Cool down
      ],
      gracefulRampDown: '30s'
    },

    // Stress test - Push system beyond normal capacity
    stress: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 200,
      maxVUs: 500,
      stages: [
        { duration: '5m', target: 100 },   // Normal load
        { duration: '10m', target: 200 },  // Stress load
        { duration: '5m', target: 0 }      // Recovery
      ]
    },

    // Spike test - Sudden traffic bursts
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 100 },  // Quick ramp up
        { duration: '1m', target: 100 },   // Stable
        { duration: '10s', target: 500 },  // Spike!
        { duration: '3m', target: 500 },   // Sustained spike
        { duration: '10s', target: 100 },  // Drop
        { duration: '3m', target: 100 },   // Recovery
        { duration: '10s', target: 0 }     // End
      ]
    },

    // Soak test (endurance) - Long-running stability test
    soak: {
      executor: 'constant-vus',
      vus: 50,
      duration: '3h'
    },

    // Breakpoint test - Find system limits
    breakpoint: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 1000,
      stages: [
        { duration: '2m', target: 10 },
        { duration: '2m', target: 50 },
        { duration: '2m', target: 100 },
        { duration: '2m', target: 200 },
        { duration: '2m', target: 400 },
        { duration: '2m', target: 800 },
        { duration: '2m', target: 1600 }
      ]
    }
  },

  // Performance thresholds - Tests fail if these are exceeded
  thresholds: {
    // HTTP metrics
    'http_req_duration': ['p(95)<500', 'p(99)<1000'],  // 95% under 500ms
    'http_req_failed': ['rate<0.01'],                   // <1% errors

    // Custom RoIP metrics
    'rtp_latency': ['p(95)<150'],      // 95% under 150ms
    'jitter': ['avg<30'],              // Average jitter under 30ms
    'packet_loss': ['rate<0.05'],      // <5% packet loss

    // WebSocket metrics
    'ws_connecting': ['p(95)<1000'],   // Connection time
    'ws_msgs_received': ['count>0'],   // Ensure messages flow

    // System metrics
    'iteration_duration': ['p(95)<2000']
  },

  // Global options
  noConnectionReuse: false,
  userAgent: 'k6-roip-loadtest/1.0',

  // Tags for filtering results
  tags: {
    test_type: 'load',
    environment: 'staging',
    version: '1.0.0'
  },

  // Summary settings
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  summaryTimeUnit: 'ms'
};
