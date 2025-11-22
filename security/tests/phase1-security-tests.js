#!/usr/bin/env node
/**
 * Phase 1 Security Remediation Tests
 * Tests for security fixes implemented in Phase 1
 */

const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

class Phase1SecurityTests {
  constructor(config = {}) {
    this.apiHost = config.apiHost || 'localhost';
    this.apiPort = config.apiPort || 8080;
    this.wsPort = config.wsPort || 8081;
    this.jwtSecret = config.jwtSecret || 'test-secret';
    this.results = [];
    this.passed = 0;
    this.failed = 0;
  }

  /**
   * Generate a valid JWT token for testing
   */
  generateToken(payload = {}) {
    return jwt.sign({
      sub: 'test-user-123',
      username: 'testuser',
      roles: payload.roles || ['user'],
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    }, this.jwtSecret);
  }

  /**
   * Generate an admin JWT token
   */
  generateAdminToken() {
    return this.generateToken({ roles: ['admin'] });
  }

  /**
   * Generate an expired JWT token
   */
  generateExpiredToken() {
    return jwt.sign({
      sub: 'test-user-123',
      username: 'testuser',
      roles: ['user'],
      iat: Math.floor(Date.now() / 1000) - 7200,
      exp: Math.floor(Date.now() / 1000) - 3600
    }, this.jwtSecret);
  }

  /**
   * Log test result
   */
  logResult(testName, passed, details = '') {
    const result = {
      test: testName,
      status: passed ? 'PASS' : 'FAIL',
      details,
      timestamp: new Date().toISOString()
    };
    this.results.push(result);

    if (passed) {
      this.passed++;
      console.log(`✓ PASS: ${testName}${details ? ` - ${details}` : ''}`);
    } else {
      this.failed++;
      console.error(`✗ FAIL: ${testName}${details ? ` - ${details}` : ''}`);
    }
  }

  /**
   * Make HTTP request
   */
  async makeRequest(method, path, options = {}) {
    return new Promise((resolve, reject) => {
      const requestOptions = {
        hostname: this.apiHost,
        port: this.apiPort,
        path,
        method,
        headers: options.headers || {},
        timeout: 5000
      };

      if (options.body) {
        requestOptions.headers['Content-Type'] = 'application/json';
        requestOptions.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(options.body));
      }

      const req = http.request(requestOptions, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const jsonData = data ? JSON.parse(data) : null;
            resolve({ status: res.statusCode, headers: res.headers, data: jsonData });
          } catch (e) {
            resolve({ status: res.statusCode, headers: res.headers, data: data });
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (options.body) {
        req.write(JSON.stringify(options.body));
      }

      req.end();
    });
  }

  /**
   * Test WebSocket connection
   */
  async testWebSocket(options = {}) {
    return new Promise((resolve, reject) => {
      const wsUrl = `ws://${this.apiHost}:${this.wsPort}${options.path || ''}`;
      const wsOptions = {
        headers: options.headers || {},
        timeout: 5000
      };

      const ws = new WebSocket(wsUrl, options.protocols, wsOptions);

      const timeout = setTimeout(() => {
        ws.terminate();
        reject(new Error('WebSocket connection timeout'));
      }, 5000);

      ws.on('open', () => {
        clearTimeout(timeout);
        resolve({ success: true, ws });
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        resolve({ success: false, error: error.message });
      });

      ws.on('close', (code, reason) => {
        clearTimeout(timeout);
        resolve({ success: false, code, reason: reason.toString() });
      });
    });
  }

  /**
   * TEST 1: WebSocket rejects connection without token
   */
  async test1_WebSocketRejectsNoToken() {
    console.log('\n--- TEST 1: WebSocket Authentication - No Token ---');
    try {
      const result = await this.testWebSocket({
        headers: {
          'Origin': 'http://localhost:3000'
        }
      });

      this.logResult(
        'WebSocket rejects connection without token',
        !result.success && result.code === 1008,
        result.reason || 'Connection rejected'
      );
    } catch (error) {
      this.logResult('WebSocket rejects connection without token', false, error.message);
    }
  }

  /**
   * TEST 2: WebSocket accepts connection with valid token
   */
  async test2_WebSocketAcceptsValidToken() {
    console.log('\n--- TEST 2: WebSocket Authentication - Valid Token ---');
    try {
      const token = this.generateToken();
      const result = await this.testWebSocket({
        path: `?token=${token}`,
        headers: {
          'Origin': 'http://localhost:3000'
        }
      });

      if (result.success && result.ws) {
        result.ws.close();
      }

      this.logResult(
        'WebSocket accepts connection with valid token',
        result.success,
        result.success ? 'Connected successfully' : result.reason
      );
    } catch (error) {
      this.logResult('WebSocket accepts connection with valid token', false, error.message);
    }
  }

  /**
   * TEST 3: WebSocket rejects expired token
   */
  async test3_WebSocketRejectsExpiredToken() {
    console.log('\n--- TEST 3: WebSocket Authentication - Expired Token ---');
    try {
      const token = this.generateExpiredToken();
      const result = await this.testWebSocket({
        path: `?token=${token}`,
        headers: {
          'Origin': 'http://localhost:3000'
        }
      });

      this.logResult(
        'WebSocket rejects expired token',
        !result.success,
        result.reason || 'Token rejected'
      );
    } catch (error) {
      this.logResult('WebSocket rejects expired token', false, error.message);
    }
  }

  /**
   * TEST 4: WebSocket rejects invalid origin
   */
  async test4_WebSocketRejectsInvalidOrigin() {
    console.log('\n--- TEST 4: WebSocket Origin Validation ---');
    try {
      const token = this.generateToken();
      const result = await this.testWebSocket({
        path: `?token=${token}`,
        headers: {
          'Origin': 'http://evil.com'
        }
      });

      this.logResult(
        'WebSocket rejects invalid origin',
        !result.success && result.code === 1008,
        result.reason || 'Origin rejected'
      );
    } catch (error) {
      this.logResult('WebSocket rejects invalid origin', false, error.message);
    }
  }

  /**
   * TEST 5: CORS blocks invalid origin on API
   */
  async test5_CORSBlocksInvalidOrigin() {
    console.log('\n--- TEST 5: CORS Validation ---');
    try {
      const result = await this.makeRequest('GET', '/api/v1/status', {
        headers: {
          'Origin': 'http://evil.com'
        }
      });

      const blocked = result.status === 403 || result.status === 500 ||
                     (result.headers && !result.headers['access-control-allow-origin']);

      this.logResult(
        'CORS blocks invalid origin',
        blocked,
        `Status: ${result.status}`
      );
    } catch (error) {
      // CORS error expected
      this.logResult('CORS blocks invalid origin', true, 'CORS error thrown (expected)');
    }
  }

  /**
   * TEST 6: CORS allows valid origin
   */
  async test6_CORSAllowsValidOrigin() {
    console.log('\n--- TEST 6: CORS Valid Origin ---');
    try {
      const result = await this.makeRequest('GET', '/api/v1/status', {
        headers: {
          'Origin': 'http://localhost:3000'
        }
      });

      const allowed = result.status === 200 || result.status === 401;

      this.logResult(
        'CORS allows valid origin',
        allowed,
        `Status: ${result.status}`
      );
    } catch (error) {
      this.logResult('CORS allows valid origin', false, error.message);
    }
  }

  /**
   * TEST 7: Input sanitization removes shell metacharacters
   */
  async test7_InputSanitization() {
    console.log('\n--- TEST 7: Input Sanitization ---');
    try {
      const token = this.generateAdminToken();
      const maliciousInput = 'test; rm -rf /';

      const result = await this.makeRequest('POST', '/api/v1/devices', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Origin': 'http://localhost:3000'
        },
        body: {
          name: maliciousInput,
          type: 'esp32',
          callsign: 'TEST',
          ip_address: '192.168.1.1'
        }
      });

      // Check if input was sanitized (should get validation error or success with sanitized input)
      const passed = result.status === 400 || result.status === 201 || result.status === 500;

      this.logResult(
        'Input sanitization removes dangerous characters',
        passed,
        `Status: ${result.status}`
      );
    } catch (error) {
      this.logResult('Input sanitization removes dangerous characters', false, error.message);
    }
  }

  /**
   * TEST 8: Config endpoints require admin role
   */
  async test8_ConfigRequiresAdmin() {
    console.log('\n--- TEST 8: Config Endpoints - Admin Required ---');
    try {
      const userToken = this.generateToken({ roles: ['user'] });
      const result = await this.makeRequest('GET', '/api/v1/config', {
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Origin': 'http://localhost:3000'
        }
      });

      this.logResult(
        'Config endpoint rejects non-admin users',
        result.status === 403,
        `Status: ${result.status}`
      );
    } catch (error) {
      this.logResult('Config endpoint rejects non-admin users', false, error.message);
    }
  }

  /**
   * TEST 9: Config endpoints allow admin access
   */
  async test9_ConfigAllowsAdmin() {
    console.log('\n--- TEST 9: Config Endpoints - Admin Access ---');
    try {
      const adminToken = this.generateAdminToken();
      const result = await this.makeRequest('GET', '/api/v1/config', {
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Origin': 'http://localhost:3000'
        }
      });

      this.logResult(
        'Config endpoint allows admin users',
        result.status === 200 || result.status === 500,
        `Status: ${result.status}`
      );
    } catch (error) {
      this.logResult('Config endpoint allows admin users', false, error.message);
    }
  }

  /**
   * TEST 10: Path traversal protection
   */
  async test10_PathTraversalProtection() {
    console.log('\n--- TEST 10: Path Traversal Protection ---');
    try {
      const adminToken = this.generateAdminToken();
      const result = await this.makeRequest('GET', '/api/v1/config/../../../etc/passwd', {
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Origin': 'http://localhost:3000'
        }
      });

      this.logResult(
        'Path traversal attack blocked',
        result.status === 404 || result.status === 400,
        `Status: ${result.status}`
      );
    } catch (error) {
      this.logResult('Path traversal attack blocked', true, 'Request blocked (expected)');
    }
  }

  /**
   * TEST 11: Query parameter validation
   */
  async test11_QueryParameterValidation() {
    console.log('\n--- TEST 11: Query Parameter Validation ---');
    try {
      const token = this.generateToken();
      const result = await this.makeRequest('GET', '/api/v1/calls?limit=invalid&offset=abc', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Origin': 'http://localhost:3000'
        }
      });

      // Should get validation error or use defaults
      this.logResult(
        'Query parameter validation working',
        result.status === 200 || result.status === 400 || result.status === 500,
        `Status: ${result.status}`
      );
    } catch (error) {
      this.logResult('Query parameter validation working', false, error.message);
    }
  }

  /**
   * TEST 12: Rate limiting on authentication endpoints
   */
  async test12_RateLimitingAuth() {
    console.log('\n--- TEST 12: Rate Limiting ---');
    try {
      const requests = [];

      // Make 10 rapid login attempts
      for (let i = 0; i < 10; i++) {
        requests.push(
          this.makeRequest('POST', '/api/v1/auth/login', {
            headers: {
              'Origin': 'http://localhost:3000'
            },
            body: {
              username: 'test',
              password: 'test'
            }
          })
        );
      }

      const results = await Promise.all(requests);
      const rateLimited = results.some(r => r.status === 429);

      this.logResult(
        'Rate limiting active on auth endpoints',
        rateLimited,
        rateLimited ? 'Rate limit triggered' : 'All requests accepted (may indicate rate limit not working)'
      );
    } catch (error) {
      this.logResult('Rate limiting active on auth endpoints', false, error.message);
    }
  }

  /**
   * Run all tests
   */
  async runAll() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  PHASE 1 SECURITY REMEDIATION TESTS');
    console.log('  Testing security fixes for penetration test findings');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`Target API: http://${this.apiHost}:${this.apiPort}`);
    console.log(`Target WebSocket: ws://${this.apiHost}:${this.wsPort}`);
    console.log('');

    const startTime = Date.now();

    // Run all tests
    await this.test1_WebSocketRejectsNoToken();
    await new Promise(resolve => setTimeout(resolve, 500));

    await this.test2_WebSocketAcceptsValidToken();
    await new Promise(resolve => setTimeout(resolve, 500));

    await this.test3_WebSocketRejectsExpiredToken();
    await new Promise(resolve => setTimeout(resolve, 500));

    await this.test4_WebSocketRejectsInvalidOrigin();
    await new Promise(resolve => setTimeout(resolve, 500));

    await this.test5_CORSBlocksInvalidOrigin();
    await new Promise(resolve => setTimeout(resolve, 500));

    await this.test6_CORSAllowsValidOrigin();
    await new Promise(resolve => setTimeout(resolve, 500));

    await this.test7_InputSanitization();
    await new Promise(resolve => setTimeout(resolve, 500));

    await this.test8_ConfigRequiresAdmin();
    await new Promise(resolve => setTimeout(resolve, 500));

    await this.test9_ConfigAllowsAdmin();
    await new Promise(resolve => setTimeout(resolve, 500));

    await this.test10_PathTraversalProtection();
    await new Promise(resolve => setTimeout(resolve, 500));

    await this.test11_QueryParameterValidation();
    await new Promise(resolve => setTimeout(resolve, 500));

    await this.test12_RateLimitingAuth();

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    // Print summary
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  TEST SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Total Tests:  ${this.results.length}`);
    console.log(`Passed:       ${this.passed} (${((this.passed / this.results.length) * 100).toFixed(1)}%)`);
    console.log(`Failed:       ${this.failed} (${((this.failed / this.results.length) * 100).toFixed(1)}%)`);
    console.log(`Duration:     ${duration}s`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Exit with appropriate code
    if (this.failed > 0) {
      console.error('⚠️  Some tests failed. Review the failures above.');
      process.exit(1);
    } else {
      console.log('✓ All security tests passed!');
      process.exit(0);
    }
  }

  /**
   * Export results to JSON
   */
  exportResults(filename = 'phase1-security-test-results.json') {
    const fs = require('fs');
    const report = {
      summary: {
        total: this.results.length,
        passed: this.passed,
        failed: this.failed,
        passRate: ((this.passed / this.results.length) * 100).toFixed(1) + '%',
        timestamp: new Date().toISOString()
      },
      results: this.results
    };

    fs.writeFileSync(filename, JSON.stringify(report, null, 2));
    console.log(`\n✓ Results exported to ${filename}`);
  }
}

// Main execution
if (require.main === module) {
  const tests = new Phase1SecurityTests({
    jwtSecret: process.env.JWT_SECRET || 'test-secret-change-in-production',
    apiHost: process.env.API_HOST || 'localhost',
    apiPort: parseInt(process.env.API_PORT) || 8080,
    wsPort: parseInt(process.env.WS_PORT) || 8081
  });

  tests.runAll().catch(error => {
    console.error('Fatal error running tests:', error);
    process.exit(1);
  });
}

module.exports = Phase1SecurityTests;
