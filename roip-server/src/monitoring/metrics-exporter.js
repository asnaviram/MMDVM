/**
 * Prometheus Metrics Exporter for RoIP Server
 *
 * This module exports metrics in Prometheus format for monitoring:
 * - Application metrics (requests, errors, latency)
 * - System metrics (CPU, memory, event loop)
 * - Business metrics (active devices, calls, routes)
 * - Custom metrics (RTP, SIP)
 */

import express from 'express';
import { EventEmitter } from 'events';

class MetricsExporter extends EventEmitter {
  constructor(options = {}) {
    super();
    this.port = options.port || 9100;
    this.metrics = new Map();
    this.histograms = new Map();
    this.counters = new Map();
    this.gauges = new Map();

    this.initializeMetrics();
    this.startServer();
  }

  /**
   * Initialize default metrics
   */
  initializeMetrics() {
    // HTTP Request Metrics
    this.createCounter('http_requests_total', 'Total HTTP requests', ['method', 'path', 'status']);
    this.createHistogram('http_request_duration_seconds', 'HTTP request duration', ['method', 'path']);

    // Application Errors
    this.createCounter('application_errors_total', 'Total application errors', ['level', 'type']);
    this.createCounter('nodejs_unhandled_rejections_total', 'Unhandled promise rejections');
    this.createCounter('nodejs_uncaught_exceptions_total', 'Uncaught exceptions');

    // Business Metrics
    this.createGauge('active_devices_total', 'Total active ESP32 devices');
    this.createGauge('active_calls_total', 'Total active calls');
    this.createGauge('active_routes_total', 'Total active routes');
    this.createCounter('call_duration_seconds', 'Call duration in seconds', ['device_id']);

    // Node.js Process Metrics
    this.createGauge('nodejs_heap_size_total_bytes', 'Total heap size');
    this.createGauge('nodejs_heap_size_used_bytes', 'Used heap size');
    this.createGauge('nodejs_external_memory_bytes', 'External memory');
    this.createGauge('nodejs_eventloop_lag_seconds', 'Event loop lag');

    // WebSocket Metrics
    this.createGauge('websocket_connections_active', 'Active WebSocket connections');
    this.createCounter('websocket_disconnections_total', 'Total WebSocket disconnections', ['reason']);
    this.createCounter('websocket_messages_total', 'WebSocket messages', ['direction', 'type']);

    // Database Metrics
    this.createCounter('database_queries_total', 'Database queries', ['operation', 'table']);
    this.createCounter('database_errors_total', 'Database errors', ['type']);
    this.createHistogram('database_query_duration_seconds', 'Database query duration', ['operation']);

    // Cache Metrics
    this.createCounter('cache_hits_total', 'Cache hits');
    this.createCounter('cache_misses_total', 'Cache misses');
    this.createGauge('cache_size_bytes', 'Cache size in bytes');

    // Security Metrics
    this.createCounter('auth_failures_total', 'Authentication failures', ['source_ip', 'reason']);
    this.createCounter('rate_limit_exceeded_total', 'Rate limit exceeded', ['endpoint', 'source_ip']);
    this.createCounter('security_events_total', 'Security events', ['type', 'severity']);
  }

  /**
   * Create a counter metric
   */
  createCounter(name, help, labels = []) {
    this.counters.set(name, {
      type: 'counter',
      help,
      labels,
      values: new Map()
    });
  }

  /**
   * Create a gauge metric
   */
  createGauge(name, help, labels = []) {
    this.gauges.set(name, {
      type: 'gauge',
      help,
      labels,
      values: new Map()
    });
  }

  /**
   * Create a histogram metric
   */
  createHistogram(name, help, labels = [], buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]) {
    this.histograms.set(name, {
      type: 'histogram',
      help,
      labels,
      buckets,
      values: new Map()
    });
  }

  /**
   * Increment a counter
   */
  incCounter(name, labels = {}, value = 1) {
    const metric = this.counters.get(name);
    if (!metric) {
      console.error(`Counter ${name} not found`);
      return;
    }

    const key = this.getLabelKey(labels);
    const current = metric.values.get(key) || 0;
    metric.values.set(key, current + value);
  }

  /**
   * Set a gauge value
   */
  setGauge(name, labels = {}, value) {
    const metric = this.gauges.get(name);
    if (!metric) {
      console.error(`Gauge ${name} not found`);
      return;
    }

    const key = this.getLabelKey(labels);
    metric.values.set(key, value);
  }

  /**
   * Observe a histogram value
   */
  observeHistogram(name, labels = {}, value) {
    const metric = this.histograms.get(name);
    if (!metric) {
      console.error(`Histogram ${name} not found`);
      return;
    }

    const key = this.getLabelKey(labels);
    if (!metric.values.has(key)) {
      metric.values.set(key, {
        count: 0,
        sum: 0,
        buckets: new Map(metric.buckets.map(b => [b, 0]))
      });
    }

    const hist = metric.values.get(key);
    hist.count++;
    hist.sum += value;

    // Increment bucket counters
    for (const bucket of metric.buckets) {
      if (value <= bucket) {
        hist.buckets.set(bucket, hist.buckets.get(bucket) + 1);
      }
    }
  }

  /**
   * Get label key for storage
   */
  getLabelKey(labels) {
    return JSON.stringify(labels);
  }

  /**
   * Format labels for Prometheus output
   */
  formatLabels(labelObj) {
    if (Object.keys(labelObj).length === 0) return '';

    const pairs = Object.entries(labelObj)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');

    return `{${pairs}}`;
  }

  /**
   * Collect Node.js process metrics
   */
  collectProcessMetrics() {
    const memUsage = process.memoryUsage();
    this.setGauge('nodejs_heap_size_total_bytes', {}, memUsage.heapTotal);
    this.setGauge('nodejs_heap_size_used_bytes', {}, memUsage.heapUsed);
    this.setGauge('nodejs_external_memory_bytes', {}, memUsage.external);

    // Event loop lag measurement
    const start = process.hrtime.bigint();
    setImmediate(() => {
      const lag = Number(process.hrtime.bigint() - start) / 1e9;
      this.setGauge('nodejs_eventloop_lag_seconds', {}, lag);
    });
  }

  /**
   * Export metrics in Prometheus format
   */
  exportMetrics() {
    let output = '';

    // Export counters
    for (const [name, metric] of this.counters) {
      output += `# HELP ${name} ${metric.help}\n`;
      output += `# TYPE ${name} counter\n`;

      for (const [key, value] of metric.values) {
        const labels = key === '{}' ? '' : key.slice(1, -1);
        const labelStr = labels ? `{${labels}}` : '';
        output += `${name}${labelStr} ${value}\n`;
      }
    }

    // Export gauges
    for (const [name, metric] of this.gauges) {
      output += `# HELP ${name} ${metric.help}\n`;
      output += `# TYPE ${name} gauge\n`;

      for (const [key, value] of metric.values) {
        const labels = key === '{}' ? '' : key.slice(1, -1);
        const labelStr = labels ? `{${labels}}` : '';
        output += `${name}${labelStr} ${value}\n`;
      }
    }

    // Export histograms
    for (const [name, metric] of this.histograms) {
      output += `# HELP ${name} ${metric.help}\n`;
      output += `# TYPE ${name} histogram\n`;

      for (const [key, hist] of metric.values) {
        const labels = key === '{}' ? '' : key.slice(1, -1);
        const baseLabel = labels ? `{${labels}}` : '';

        // Export buckets
        for (const [bucket, count] of hist.buckets) {
          const bucketLabel = labels ? `{${labels},le="${bucket}"}` : `{le="${bucket}"}`;
          output += `${name}_bucket${bucketLabel} ${count}\n`;
        }

        // Export +Inf bucket
        const infLabel = labels ? `{${labels},le="+Inf"}` : `{le="+Inf"}`;
        output += `${name}_bucket${infLabel} ${hist.count}\n`;

        // Export sum and count
        output += `${name}_sum${baseLabel} ${hist.sum}\n`;
        output += `${name}_count${baseLabel} ${hist.count}\n`;
      }
    }

    return output;
  }

  /**
   * Start the metrics HTTP server
   */
  startServer() {
    const app = express();

    // Metrics endpoint
    app.get('/metrics', (req, res) => {
      this.collectProcessMetrics();
      res.set('Content-Type', 'text/plain; version=0.0.4');
      res.send(this.exportMetrics());
    });

    // Health check
    app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });

    this.server = app.listen(this.port, () => {
      console.log(`Metrics exporter listening on port ${this.port}`);
      this.emit('started', { port: this.port });
    });
  }

  /**
   * Stop the metrics server
   */
  stop() {
    if (this.server) {
      this.server.close(() => {
        console.log('Metrics exporter stopped');
        this.emit('stopped');
      });
    }
  }

  /**
   * Middleware for Express to track HTTP metrics
   */
  httpMetricsMiddleware() {
    return (req, res, next) => {
      const start = process.hrtime.bigint();

      res.on('finish', () => {
        const duration = Number(process.hrtime.bigint() - start) / 1e9;
        const labels = {
          method: req.method,
          path: req.route ? req.route.path : req.path,
          status: res.statusCode.toString()
        };

        this.incCounter('http_requests_total', labels);
        this.observeHistogram('http_request_duration_seconds',
          { method: req.method, path: req.route ? req.route.path : req.path },
          duration
        );
      });

      next();
    };
  }

  /**
   * Middleware for database query tracking
   */
  trackDatabaseQuery(operation, table, duration) {
    this.incCounter('database_queries_total', { operation, table });
    this.observeHistogram('database_query_duration_seconds', { operation }, duration);
  }

  /**
   * Track database error
   */
  trackDatabaseError(type) {
    this.incCounter('database_errors_total', { type });
  }

  /**
   * Track authentication failure
   */
  trackAuthFailure(sourceIp, reason) {
    this.incCounter('auth_failures_total', { source_ip: sourceIp, reason });
  }

  /**
   * Track security event
   */
  trackSecurityEvent(type, severity = 'medium') {
    this.incCounter('security_events_total', { type, severity });
  }

  /**
   * Update active devices count
   */
  updateActiveDevices(count) {
    this.setGauge('active_devices_total', {}, count);
  }

  /**
   * Update active calls count
   */
  updateActiveCalls(count) {
    this.setGauge('active_calls_total', {}, count);
  }

  /**
   * Track WebSocket connection
   */
  trackWebSocketConnection(delta) {
    const current = this.gauges.get('websocket_connections_active')?.values.get('{}') || 0;
    this.setGauge('websocket_connections_active', {}, current + delta);
  }

  /**
   * Track cache operation
   */
  trackCacheHit() {
    this.incCounter('cache_hits_total', {});
  }

  trackCacheMiss() {
    this.incCounter('cache_misses_total', {});
  }
}

// Singleton instance
let metricsExporter = null;

export function initializeMetrics(options = {}) {
  if (!metricsExporter) {
    metricsExporter = new MetricsExporter(options);
  }
  return metricsExporter;
}

export function getMetrics() {
  if (!metricsExporter) {
    throw new Error('Metrics exporter not initialized. Call initializeMetrics() first.');
  }
  return metricsExporter;
}

export default MetricsExporter;
