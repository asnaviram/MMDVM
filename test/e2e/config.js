/**
 * E2E Test Configuration
 */

export const config = {
  // Server configuration
  server: {
    host: 'localhost',
    sipPort: 5060,
    apiPort: 8080,
    websocketPort: 8081,
    healthCheckUrl: 'http://localhost:8080/health',
    apiBaseUrl: 'http://localhost:8080/api'
  },

  // Database configuration
  database: {
    type: 'sqlite',
    file: '/tmp/roip_e2e_test.db'
  },

  // Test devices
  devices: {
    device1: {
      deviceId: 'ESP32-DEV-001',
      username: 'device1',
      password: 'test_password_1',
      sipUri: 'sip:device1@roip.local',
      ipAddress: '127.0.0.1',
      port: 5061,
      codec: 'opus',
      sampleRate: 24000
    },
    device2: {
      deviceId: 'ESP32-DEV-002',
      username: 'device2',
      password: 'test_password_2',
      sipUri: 'sip:device2@roip.local',
      ipAddress: '127.0.0.1',
      port: 5062,
      codec: 'opus',
      sampleRate: 24000
    }
  },

  // Test scenarios
  test: {
    timeout: 30000,
    callDuration: 5000,
    audioPackets: 10,
    rtcpInterval: 1000,
    jitterBufferSize: 20
  },

  // Logging
  logging: {
    level: 'info',
    file: '/tmp/roip_e2e_test.log',
    verbose: true
  },

  // Metrics collection
  metrics: {
    enabled: true,
    sampleInterval: 1000,
    reportPath: '/tmp/roip_e2e_report.json'
  }
};

export default config;
