/**
 * SIP Metrics Exporter for Prometheus
 *
 * Tracks SIP signaling metrics:
 * - Registrations (active, successes, failures)
 * - Call setup (attempts, successes, failures, duration)
 * - SIP messages (by method and response code)
 * - Invalid messages
 */

import express from 'express';
import { EventEmitter } from 'events';

class SIPMetricsExporter extends EventEmitter {
  constructor(options = {}) {
    super();
    this.port = options.port || 9102;

    // Registration metrics
    this.activeRegistrations = 0;
    this.registrationSuccesses = 0;
    this.registrationFailures = 0;

    // Call metrics
    this.activeCalls = 0;
    this.callAttempts = 0;
    this.callsEstablished = 0;
    this.callSetupFailures = 0;
    this.callSetupDurations = [];

    // SIP message counters
    this.messagesByMethod = new Map();
    this.responsesByCode = new Map();
    this.invalidMessages = 0;

    // Call duration tracking
    this.callDurations = new Map();

    this.initializeCounters();
    this.startServer();
  }

  /**
   * Initialize message and response counters
   */
  initializeCounters() {
    // Initialize common SIP methods
    const methods = ['REGISTER', 'INVITE', 'ACK', 'BYE', 'CANCEL', 'OPTIONS', 'INFO', 'UPDATE'];
    methods.forEach(method => {
      this.messagesByMethod.set(method, 0);
    });

    // Initialize common response codes
    const codes = ['200', '401', '403', '404', '408', '480', '486', '487', '500', '503'];
    codes.forEach(code => {
      this.responsesByCode.set(code, 0);
    });
  }

  /**
   * Track SIP registration
   */
  trackRegistration(success, deviceId = null) {
    if (success) {
      this.activeRegistrations++;
      this.registrationSuccesses++;
      this.emit('registration', { success: true, deviceId });
    } else {
      this.registrationFailures++;
      this.emit('registration', { success: false, deviceId });
    }
  }

  /**
   * Track SIP unregistration
   */
  trackUnregistration(deviceId = null) {
    if (this.activeRegistrations > 0) {
      this.activeRegistrations--;
      this.emit('unregistration', { deviceId });
    }
  }

  /**
   * Track call attempt
   */
  trackCallAttempt(callId, fromDevice, toDevice) {
    this.callAttempts++;
    this.emit('callAttempt', { callId, fromDevice, toDevice, timestamp: Date.now() });
  }

  /**
   * Track call establishment
   */
  trackCallEstablished(callId, setupDurationMs) {
    this.activeCalls++;
    this.callsEstablished++;

    // Track setup duration
    if (setupDurationMs !== undefined) {
      this.callSetupDurations.push(setupDurationMs / 1000); // Convert to seconds
      if (this.callSetupDurations.length > 1000) {
        this.callSetupDurations.shift();
      }
    }

    // Start tracking call duration
    this.callDurations.set(callId, Date.now());

    this.emit('callEstablished', { callId, setupDurationMs, timestamp: Date.now() });
  }

  /**
   * Track call termination
   */
  trackCallTerminated(callId, reason = 'normal') {
    if (this.activeCalls > 0) {
      this.activeCalls--;
    }

    // Calculate call duration if we tracked start time
    const startTime = this.callDurations.get(callId);
    let duration = 0;
    if (startTime) {
      duration = Date.now() - startTime;
      this.callDurations.delete(callId);
    }

    this.emit('callTerminated', { callId, reason, duration, timestamp: Date.now() });
  }

  /**
   * Track call setup failure
   */
  trackCallSetupFailure(callId, reason) {
    this.callSetupFailures++;
    this.emit('callSetupFailure', { callId, reason, timestamp: Date.now() });
  }

  /**
   * Track SIP message by method
   */
  trackMessage(method) {
    const currentCount = this.messagesByMethod.get(method) || 0;
    this.messagesByMethod.set(method, currentCount + 1);
    this.emit('sipMessage', { method, timestamp: Date.now() });
  }

  /**
   * Track SIP response by code
   */
  trackResponse(code) {
    const codeStr = code.toString();
    const currentCount = this.responsesByCode.get(codeStr) || 0;
    this.responsesByCode.set(codeStr, currentCount + 1);
    this.emit('sipResponse', { code, timestamp: Date.now() });
  }

  /**
   * Track invalid SIP message
   */
  trackInvalidMessage(reason = 'unknown') {
    this.invalidMessages++;
    this.emit('invalidMessage', { reason, timestamp: Date.now() });
  }

  /**
   * Calculate call setup duration percentiles
   */
  getCallSetupPercentile(percentile) {
    if (this.callSetupDurations.length === 0) {
      return 0;
    }

    const sorted = [...this.callSetupDurations].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index] || 0;
  }

  /**
   * Export metrics in Prometheus format
   */
  exportMetrics() {
    let output = '';

    // Active registrations
    output += '# HELP sip_active_registrations Number of active SIP registrations\n';
    output += '# TYPE sip_active_registrations gauge\n';
    output += `sip_active_registrations ${this.activeRegistrations}\n`;

    // Registration metrics
    output += '# HELP sip_registration_successes_total Total successful SIP registrations\n';
    output += '# TYPE sip_registration_successes_total counter\n';
    output += `sip_registration_successes_total ${this.registrationSuccesses}\n`;

    output += '# HELP sip_registration_failures_total Total failed SIP registrations\n';
    output += '# TYPE sip_registration_failures_total counter\n';
    output += `sip_registration_failures_total ${this.registrationFailures}\n`;

    // Active calls
    output += '# HELP sip_active_calls Number of active SIP calls\n';
    output += '# TYPE sip_active_calls gauge\n';
    output += `sip_active_calls ${this.activeCalls}\n`;

    // Call metrics
    output += '# HELP sip_call_attempts_total Total SIP call attempts\n';
    output += '# TYPE sip_call_attempts_total counter\n';
    output += `sip_call_attempts_total ${this.callAttempts}\n`;

    output += '# HELP sip_calls_established_total Total SIP calls successfully established\n';
    output += '# TYPE sip_calls_established_total counter\n';
    output += `sip_calls_established_total ${this.callsEstablished}\n`;

    output += '# HELP sip_call_setup_failures_total Total SIP call setup failures\n';
    output += '# TYPE sip_call_setup_failures_total counter\n';
    output += `sip_call_setup_failures_total ${this.callSetupFailures}\n`;

    // Call setup duration histogram
    if (this.callSetupDurations.length > 0) {
      output += '# HELP sip_call_setup_duration_seconds SIP call setup duration in seconds\n';
      output += '# TYPE sip_call_setup_duration_seconds histogram\n';

      const buckets = [0.1, 0.25, 0.5, 1, 2, 5];
      const counts = new Map(buckets.map(b => [b, 0]));

      // Count values in each bucket
      for (const duration of this.callSetupDurations) {
        for (const bucket of buckets) {
          if (duration <= bucket) {
            counts.set(bucket, counts.get(bucket) + 1);
          }
        }
      }

      // Output bucket counts (cumulative)
      for (const bucket of buckets) {
        output += `sip_call_setup_duration_seconds_bucket{le="${bucket}"} ${counts.get(bucket)}\n`;
      }
      output += `sip_call_setup_duration_seconds_bucket{le="+Inf"} ${this.callSetupDurations.length}\n`;

      const sum = this.callSetupDurations.reduce((a, b) => a + b, 0);
      output += `sip_call_setup_duration_seconds_sum ${sum.toFixed(3)}\n`;
      output += `sip_call_setup_duration_seconds_count ${this.callSetupDurations.length}\n`;
    }

    // SIP messages by method
    output += '# HELP sip_messages_total Total SIP messages by method\n';
    output += '# TYPE sip_messages_total counter\n';
    for (const [method, count] of this.messagesByMethod) {
      output += `sip_messages_total{method="${method}"} ${count}\n`;
    }

    // SIP responses by code
    output += '# HELP sip_responses_total Total SIP responses by code\n';
    output += '# TYPE sip_responses_total counter\n';
    for (const [code, count] of this.responsesByCode) {
      output += `sip_responses_total{code="${code}"} ${count}\n`;
    }

    // Invalid messages
    output += '# HELP sip_invalid_messages_total Total invalid SIP messages\n';
    output += '# TYPE sip_invalid_messages_total counter\n';
    output += `sip_invalid_messages_total ${this.invalidMessages}\n`;

    return output;
  }

  /**
   * Start the metrics HTTP server
   */
  startServer() {
    const app = express();

    app.get('/metrics', (req, res) => {
      res.set('Content-Type', 'text/plain; version=0.0.4');
      res.send(this.exportMetrics());
    });

    app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        activeRegistrations: this.activeRegistrations,
        activeCalls: this.activeCalls,
        timestamp: Date.now()
      });
    });

    app.get('/stats', (req, res) => {
      res.json({
        registrations: {
          active: this.activeRegistrations,
          successes: this.registrationSuccesses,
          failures: this.registrationFailures,
          successRate: this.registrationSuccesses > 0
            ? ((this.registrationSuccesses / (this.registrationSuccesses + this.registrationFailures)) * 100).toFixed(2)
            : 0
        },
        calls: {
          active: this.activeCalls,
          attempts: this.callAttempts,
          established: this.callsEstablished,
          failures: this.callSetupFailures,
          successRate: this.callAttempts > 0
            ? ((this.callsEstablished / this.callAttempts) * 100).toFixed(2)
            : 0,
          setupDuration: {
            p50: this.getCallSetupPercentile(50),
            p95: this.getCallSetupPercentile(95),
            p99: this.getCallSetupPercentile(99)
          }
        },
        messages: {
          byMethod: Object.fromEntries(this.messagesByMethod),
          byCode: Object.fromEntries(this.responsesByCode),
          invalid: this.invalidMessages
        }
      });
    });

    this.server = app.listen(this.port, () => {
      console.log(`SIP metrics exporter listening on port ${this.port}`);
      this.emit('started', { port: this.port });
    });
  }

  /**
   * Stop the metrics server
   */
  stop() {
    if (this.server) {
      this.server.close(() => {
        console.log('SIP metrics exporter stopped');
        this.emit('stopped');
      });
    }
  }

  /**
   * Reset all metrics (for testing)
   */
  reset() {
    this.activeRegistrations = 0;
    this.registrationSuccesses = 0;
    this.registrationFailures = 0;
    this.activeCalls = 0;
    this.callAttempts = 0;
    this.callsEstablished = 0;
    this.callSetupFailures = 0;
    this.callSetupDurations = [];
    this.callDurations.clear();
    this.invalidMessages = 0;

    this.messagesByMethod.forEach((value, key) => {
      this.messagesByMethod.set(key, 0);
    });

    this.responsesByCode.forEach((value, key) => {
      this.responsesByCode.set(key, 0);
    });

    this.emit('reset');
  }
}

// Singleton instance
let sipMetricsExporter = null;

export function initializeSIPMetrics(options = {}) {
  if (!sipMetricsExporter) {
    sipMetricsExporter = new SIPMetricsExporter(options);
  }
  return sipMetricsExporter;
}

export function getSIPMetrics() {
  if (!sipMetricsExporter) {
    throw new Error('SIP metrics exporter not initialized. Call initializeSIPMetrics() first.');
  }
  return sipMetricsExporter;
}

export default SIPMetricsExporter;
