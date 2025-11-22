#!/usr/bin/env node
/**
 * ESP32 RoIP Server
 * Professional Radio over IP server for ESP32 clients
 * Handles SIP registration, RTP media, and provides REST API
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';
import http from 'http';
import https from 'https';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createLogger, format, transports } from 'winston';
import cluster from 'cluster';
import os from 'os';
import v8 from 'v8';

import { SIPServer } from './sip/sip-server.js';
import { RTPManager } from './rtp/rtp-manager.js';
import { Database } from './database/database.js';
import { AuthManager } from './auth/auth-manager.js';
import { CallManager } from './call/call-manager.js';
import { WebSocketServer } from './websocket/ws-server.js';
import { APIRouter } from './api/api-router.js';
import { STUNServer } from './stun/stun-server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class RoIPServer {
  constructor(configPath = null) {
    this.configPath = configPath || path.join(__dirname, '../config/default.yaml');
    this.config = null;
    this.logger = null;
    this.components = {};
    this.running = false;
  }

  /**
   * Load configuration from YAML file
   */
  loadConfig() {
    try {
      const configFile = fs.readFileSync(this.configPath, 'utf8');
      this.config = YAML.parse(configFile);

      // Override with environment variables
      this.applyEnvironmentOverrides();

      console.log(`✓ Configuration loaded from ${this.configPath}`);
      return true;
    } catch (error) {
      console.error(`✗ Failed to load configuration: ${error.message}`);
      return false;
    }
  }

  /**
   * Apply environment variable overrides
   */
  applyEnvironmentOverrides() {
    if (process.env.SIP_PORT) {
      this.config.server.sip.port = parseInt(process.env.SIP_PORT);
    }
    if (process.env.API_PORT) {
      this.config.server.api.port = parseInt(process.env.API_PORT);
    }
    if (process.env.DB_TYPE) {
      this.config.database.type = process.env.DB_TYPE;
    }
    if (process.env.DB_FILE) {
      this.config.database.sqlite.file = process.env.DB_FILE;
    }
    if (process.env.JWT_SECRET) {
      this.config.auth.jwt_secret = process.env.JWT_SECRET;
    }
    if (process.env.LOG_LEVEL) {
      this.config.logging.level = process.env.LOG_LEVEL;
    }
    if (process.env.TLS_ENABLED) {
      this.config.tls.enabled = process.env.TLS_ENABLED === 'true';
    }
    if (process.env.TLS_CERT) {
      this.config.tls.cert = process.env.TLS_CERT;
    }
    if (process.env.TLS_KEY) {
      this.config.tls.key = process.env.TLS_KEY;
    }
    if (process.env.TLS_CA) {
      this.config.tls.ca = process.env.TLS_CA;
    }
  }

  /**
   * Initialize logger
   */
  initLogger() {
    const logFormat = format.combine(
      format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      format.errors({ stack: true }),
      format.splat(),
      format.printf(({ timestamp, level, message, stack }) => {
        let log = `${timestamp} [${level.toUpperCase()}] ${message}`;
        if (stack) log += `\n${stack}`;
        return log;
      })
    );

    const logTransports = [];

    // Console transport
    if (this.config.logging.console.enabled) {
      logTransports.push(new transports.Console({
        format: this.config.logging.console.colorize
          ? format.combine(format.colorize(), logFormat)
          : logFormat
      }));
    }

    // File transport
    if (this.config.logging.file.enabled) {
      const logDir = this.config.logging.file.path;
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      logTransports.push(new transports.File({
        filename: path.join(logDir, this.config.logging.file.filename),
        maxsize: this.parseSize(this.config.logging.file.max_size),
        maxFiles: this.config.logging.file.max_files,
        format: logFormat
      }));
    }

    this.logger = createLogger({
      level: this.config.logging.level,
      transports: logTransports
    });

    this.logger.info('Logger initialized');
  }

  /**
   * Parse size strings (e.g., "10m" -> 10485760)
   */
  parseSize(sizeStr) {
    const units = { k: 1024, m: 1024 * 1024, g: 1024 * 1024 * 1024 };
    const match = sizeStr.match(/^(\d+)([kmg])?$/i);
    if (!match) return parseInt(sizeStr);
    const value = parseInt(match[1]);
    const unit = match[2]?.toLowerCase() || '';
    return value * (units[unit] || 1);
  }

  /**
   * Initialize database
   */
  async initDatabase() {
    this.logger.info('Initializing database...');
    this.components.database = new Database(this.config.database, this.logger);
    await this.components.database.initialize();
    this.logger.info('✓ Database ready');
  }

  /**
   * Initialize authentication manager
   */
  initAuthManager() {
    this.logger.info('Initializing authentication...');
    this.components.auth = new AuthManager(
      this.config.auth,
      this.components.database,
      this.logger
    );
    this.logger.info('✓ Authentication manager ready');
  }

  /**
   * Initialize SIP server
   */
  async initSIPServer() {
    this.logger.info(`Starting SIP server on port ${this.config.server.sip.port}...`);
    this.components.sip = new SIPServer(
      this.config.server.sip,
      this.components.auth,
      this.components.database,
      this.logger
    );
    await this.components.sip.start();
    this.logger.info(`✓ SIP server listening on UDP ${this.config.server.host}:${this.config.server.sip.port}`);
  }

  /**
   * Initialize RTP manager
   */
  initRTPManager() {
    this.logger.info('Initializing RTP manager...');
    this.components.rtp = new RTPManager(
      this.config.server.rtp,
      this.config.audio,
      this.logger
    );
    this.logger.info(`✓ RTP manager ready (ports ${this.config.server.rtp.port_min}-${this.config.server.rtp.port_max})`);
  }

  /**
   * Initialize call manager
   */
  initCallManager() {
    this.logger.info('Initializing call manager...');
    this.components.call = new CallManager(
      this.config.routing,
      this.components.sip,
      this.components.rtp,
      this.components.database,
      this.logger
    );
    this.logger.info('✓ Call manager ready');
  }

  /**
   * Initialize STUN server
   */
  async initSTUNServer() {
    if (!this.config.nat_traversal.stun.enabled) {
      this.logger.info('STUN server disabled');
      return;
    }

    this.logger.info('Starting STUN server...');
    this.components.stun = new STUNServer(
      this.config.nat_traversal.stun,
      this.logger
    );
    await this.components.stun.start();
    this.logger.info('✓ STUN server ready');
  }

  /**
   * Initialize web API
   */
  async initWebAPI() {
    this.logger.info(`Starting Web API on port ${this.config.server.api.port}...`);

    const app = express();

    // Security middleware
    app.use(helmet({
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }));

    // Enhanced compression middleware with performance tuning
    app.use(compression({
      level: this.config.performance?.compression?.level || 6,
      threshold: this.config.performance?.compression?.threshold || 1024,
      filter: (req, res) => {
        if (req.headers['x-no-compression']) {
          return false;
        }
        return compression.filter(req, res);
      }
    }));

    // Additional security headers
    app.use((req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
      next();
    });

    // SECURITY: CORS with proper origin validation
    if (this.config.server.api.enable_cors) {
      const corsOrigins = this.config.server.api.cors_origins;

      // SECURITY WARNING: Reject wildcard origins in production
      if (corsOrigins === '*') {
        this.logger.warn('WARNING: CORS is configured with wildcard (*). This is NOT recommended for production!');
        if (process.env.NODE_ENV === 'production') {
          this.logger.error('SECURITY ERROR: Wildcard CORS is not allowed in production. Please configure specific origins.');
          throw new Error('Wildcard CORS not allowed in production');
        }
      }

      app.use(cors({
        origin: (origin, callback) => {
          // Allow requests with no origin (like mobile apps or curl)
          if (!origin) {
            return callback(null, true);
          }

          // Check if origin is allowed
          if (corsOrigins === '*') {
            return callback(null, true);
          }

          const allowedOrigins = Array.isArray(corsOrigins) ? corsOrigins : [corsOrigins];

          if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
            callback(null, true);
          } else {
            this.logger.warn(`CORS blocked origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
          }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        maxAge: 86400 // 24 hours
      }));

      this.logger.info('✓ CORS configured', {
        origins: corsOrigins === '*' ? 'WILDCARD (development only)' : corsOrigins
      });
    }

    // Body parsers
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Request logging
    app.use((req, res, next) => {
      this.logger.debug(`${req.method} ${req.path}`);
      next();
    });

    // API routes
    const apiRouter = new APIRouter(this.components, this.config, this.logger);
    app.use('/api/v1', apiRouter.getRouter());

    // Health check endpoint
    if (this.config.monitoring.health_check_enabled) {
      app.get('/health', (req, res) => {
        res.json({
          status: 'ok',
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
          tls: this.config.tls?.enabled || false
        });
      });
    }

    // Metrics endpoint
    if (this.config.monitoring.metrics_enabled) {
      app.get('/metrics', (req, res) => {
        const metrics = this.collectMetrics();
        res.json(metrics);
      });
    }

    // Error handler
    app.use((err, req, res, next) => {
      this.logger.error(`API Error: ${err.message}`, { stack: err.stack });
      res.status(err.status || 500).json({
        error: err.message || 'Internal server error'
      });
    });

    // Create server based on TLS configuration
    const tlsConfig = this.config.tls || { enabled: false };

    if (tlsConfig.enabled) {
      try {
        // Load TLS certificates
        const tlsOptions = {
          cert: fs.readFileSync(tlsConfig.cert),
          key: fs.readFileSync(tlsConfig.key)
        };

        // Add CA certificate if provided
        if (tlsConfig.ca) {
          tlsOptions.ca = fs.readFileSync(tlsConfig.ca);
        }

        // Create HTTPS server
        this.components.apiServer = https.createServer(tlsOptions, app);

        this.components.apiServer.listen(this.config.server.api.port, this.config.server.host, () => {
          this.logger.info(`✓ Web API listening on https://${this.config.server.host}:${this.config.server.api.port}`);
        });

        // Configure HTTP keep-alive for better performance
        this.configureKeepAlive(this.components.apiServer);

        // Optionally create HTTP server for redirect
        if (tlsConfig.redirect_http) {
          const httpApp = express();
          httpApp.use((req, res) => {
            const httpsUrl = `https://${req.hostname}:${this.config.server.api.port}${req.url}`;
            this.logger.debug(`Redirecting HTTP to HTTPS: ${httpsUrl}`);
            res.redirect(301, httpsUrl);
          });

          this.components.httpRedirectServer = http.createServer(httpApp);
          const httpPort = tlsConfig.http_redirect_port || 8079;

          this.components.httpRedirectServer.listen(httpPort, this.config.server.host, () => {
            this.logger.info(`✓ HTTP redirect server listening on http://${this.config.server.host}:${httpPort}`);
          });
        }

      } catch (error) {
        this.logger.error(`Failed to load TLS certificates: ${error.message}`);
        this.logger.warn('Falling back to HTTP mode');

        // Fall back to HTTP
        this.components.apiServer = http.createServer(app);
        this.components.apiServer.listen(this.config.server.api.port, this.config.server.host, () => {
          this.logger.info(`✓ Web API listening on http://${this.config.server.host}:${this.config.server.api.port}`);
        });

        // Configure HTTP keep-alive
        this.configureKeepAlive(this.components.apiServer);
      }
    } else {
      // Create HTTP server
      this.components.apiServer = http.createServer(app);
      this.components.apiServer.listen(this.config.server.api.port, this.config.server.host, () => {
        this.logger.info(`✓ Web API listening on http://${this.config.server.host}:${this.config.server.api.port}`);
      });

      // Configure HTTP keep-alive
      this.configureKeepAlive(this.components.apiServer);
    }
  }

  /**
   * Configure HTTP keep-alive settings for better performance
   */
  configureKeepAlive(server) {
    if (this.config.performance?.keepAlive?.enabled !== false) {
      server.keepAliveTimeout = this.config.performance?.keepAlive?.timeout || 65000;
      server.headersTimeout = this.config.performance?.keepAlive?.headersTimeout || 66000;
      this.logger.info('✓ HTTP keep-alive configured', {
        keepAliveTimeout: `${server.keepAliveTimeout}ms`,
        headersTimeout: `${server.headersTimeout}ms`
      });
    }
  }

  /**
   * Initialize WebSocket server with security
   */
  async initWebSocket() {
    this.logger.info(`Starting WebSocket server on port ${this.config.server.websocket.port}...`);

    // SECURITY: Configure WebSocket with authentication and origin validation
    const wsOptions = {
      ...this.config.server.websocket,
      logger: this.logger,
      jwtSecret: this.config.auth.jwt_secret,
      allowedOrigins: this.config.server.api.cors_origins === '*'
        ? ['*'] // Only for development
        : (Array.isArray(this.config.server.api.cors_origins)
          ? this.config.server.api.cors_origins
          : [this.config.server.api.cors_origins]),
      requireAuth: this.config.security?.websocket?.require_auth !== false,
      maxConnectionsPerIP: this.config.security?.websocket?.max_connections_per_ip || 10,
      connectionWindowMs: this.config.security?.websocket?.connection_window_ms || 60000
    };

    this.components.websocket = new WebSocketServer(wsOptions);
    await this.components.websocket.start();

    this.logger.info(`✓ WebSocket server listening on ws://${this.config.server.host}:${this.config.server.websocket.port}`);
    this.logger.info('✓ WebSocket security enabled', {
      requireAuth: wsOptions.requireAuth,
      allowedOrigins: wsOptions.allowedOrigins.length > 10 ? `${wsOptions.allowedOrigins.length} origins` : wsOptions.allowedOrigins
    });
  }

  /**
   * Collect system metrics
   */
  collectMetrics() {
    const metrics = {
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      },
      sip: this.components.sip?.getMetrics() || {},
      rtp: this.components.rtp?.getMetrics() || {},
      calls: this.components.call?.getMetrics() || {},
      database: this.components.database?.getMetrics() || {}
    };
    return metrics;
  }

  /**
   * Start the server
   */
  async start() {
    console.log('═══════════════════════════════════════════════════');
    console.log('  ESP32 RoIP Server');
    console.log('  Professional Radio over IP System');
    console.log('═══════════════════════════════════════════════════\n');

    try {
      // Load configuration
      if (!this.loadConfig()) {
        process.exit(1);
      }

      // Initialize logger
      this.initLogger();

      this.logger.info('Starting server initialization...');

      // Initialize components in order
      await this.initDatabase();
      this.initAuthManager();
      await this.initSIPServer();
      this.initRTPManager();
      this.initCallManager();
      await this.initSTUNServer();
      await this.initWebAPI();
      await this.initWebSocket();

      this.running = true;

      this.logger.info('═══════════════════════════════════════════════════');
      this.logger.info('✓ Server fully initialized and running');
      this.logger.info('═══════════════════════════════════════════════════');
      this.logger.info(`SIP:       udp://0.0.0.0:${this.config.server.sip.port}`);
      this.logger.info(`API:       http://0.0.0.0:${this.config.server.api.port}`);
      this.logger.info(`WebSocket: ws://0.0.0.0:${this.config.server.websocket.port}`);
      this.logger.info('═══════════════════════════════════════════════════\n');

      // Setup monitoring
      this.setupMonitoring();

    } catch (error) {
      this.logger?.error(`Failed to start server: ${error.message}`, { stack: error.stack });
      console.error(`✗ Failed to start server: ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * Setup monitoring and periodic tasks
   */
  setupMonitoring() {
    // Periodic stats logging
    if (this.config.monitoring.stats_interval > 0) {
      setInterval(() => {
        const metrics = this.collectMetrics();
        this.logger.debug('System metrics', { metrics });
      }, this.config.monitoring.stats_interval * 1000);
    }

    // Event loop lag monitoring
    if (this.config.performance?.eventLoopMonitoring?.enabled) {
      const lagThreshold = this.config.performance.eventLoopMonitoring.lagThreshold || 100;
      const checkInterval = this.config.performance.eventLoopMonitoring.checkInterval || 5000;

      this.logger.info('✓ Event loop monitoring enabled', {
        lagThreshold: `${lagThreshold}ms`,
        checkInterval: `${checkInterval}ms`
      });

      setInterval(() => {
        const start = Date.now();
        setImmediate(() => {
          const lag = Date.now() - start;
          if (lag > lagThreshold) {
            this.logger.warn('Event loop lag detected', {
              lag: `${lag}ms`,
              threshold: `${lagThreshold}ms`
            });
          }
        });
      }, checkInterval);
    }

    // Memory monitoring
    if (this.config.performance?.memoryMonitoring?.enabled) {
      const checkInterval = this.config.performance.memoryMonitoring.checkInterval || 60000;
      const threshold = this.config.performance.memoryMonitoring.threshold || 0.9;

      this.logger.info('✓ Memory monitoring enabled', {
        threshold: `${(threshold * 100).toFixed(0)}%`,
        checkInterval: `${checkInterval}ms`
      });

      setInterval(() => {
        const stats = v8.getHeapStatistics();
        const used = stats.used_heap_size / stats.heap_size_limit;

        if (used > threshold) {
          this.logger.error('High memory usage detected', {
            usedHeapSize: `${(stats.used_heap_size / 1024 / 1024).toFixed(2)}MB`,
            heapSizeLimit: `${(stats.heap_size_limit / 1024 / 1024).toFixed(2)}MB`,
            percentUsed: `${(used * 100).toFixed(2)}%`,
            threshold: `${(threshold * 100).toFixed(0)}%`
          });

          // Suggest garbage collection if usage is critically high
          if (used > 0.95 && global.gc) {
            this.logger.warn('Forcing garbage collection due to critical memory usage');
            global.gc();
          }
        }
      }, checkInterval);
    }
  }

  /**
   * Stop the server gracefully
   */
  async stop() {
    if (!this.running) return;

    this.logger.info('Graceful shutdown initiated...');
    this.running = false;

    try {
      // Stop accepting new connections
      if (this.components.apiServer) {
        await new Promise((resolve) => {
          this.components.apiServer.close(() => {
            this.logger.info('✓ API server closed');
            resolve();
          });
        });
      }

      // Stop HTTP redirect server if running
      if (this.components.httpRedirectServer) {
        await new Promise((resolve) => {
          this.components.httpRedirectServer.close(() => {
            this.logger.info('✓ HTTP redirect server closed');
            resolve();
          });
        });
      }

      // Stop WebSocket connections
      if (this.components.websocket) {
        await this.components.websocket.stop();
        this.logger.info('✓ WebSocket server stopped');
      }

      // End all active calls
      if (this.components.call) {
        const activeCalls = this.components.call.getActiveCalls();
        if (activeCalls.length > 0) {
          this.logger.info(`Terminating ${activeCalls.length} active calls...`);
          for (const call of activeCalls) {
            await this.components.call.endCall(call.id, 'server_shutdown').catch(err => {
              this.logger.error(`Failed to end call ${call.id}: ${err.message}`);
            });
          }
          this.logger.info('✓ All calls terminated');
        }
      }

      // Stop STUN server
      if (this.components.stun) {
        await this.components.stun.stop();
        this.logger.info('✓ STUN server stopped');
      }

      // Stop SIP server
      if (this.components.sip) {
        await this.components.sip.stop();
        this.logger.info('✓ SIP server stopped');
      }

      // Close database connections
      if (this.components.database) {
        await this.components.database.close();
        this.logger.info('✓ Database closed');
      }

      this.logger.info('✓ Graceful shutdown completed');
    } catch (error) {
      this.logger.error(`Error during shutdown: ${error.message}`, { stack: error.stack });
      throw error;
    }
  }
}

// Main entry point
const main = async () => {
  const configPath = process.argv[2];

  // Check if clustering is enabled
  const tempConfig = loadConfigSync(configPath);
  const clusterEnabled = tempConfig?.performance?.cluster?.enabled || false;
  const numWorkers = tempConfig?.performance?.cluster?.workers || os.cpus().length;

  // Cluster mode for multi-core performance
  if (clusterEnabled && cluster.isPrimary) {
    console.log('═══════════════════════════════════════════════════');
    console.log('  ESP32 RoIP Server - Cluster Mode');
    console.log(`  Starting ${numWorkers} workers on ${os.cpus().length} CPUs`);
    console.log('═══════════════════════════════════════════════════\n');

    // Fork workers
    for (let i = 0; i < numWorkers; i++) {
      const worker = cluster.fork();
      console.log(`✓ Worker ${worker.process.pid} started`);
    }

    // Handle worker lifecycle
    cluster.on('exit', (worker, code, signal) => {
      console.error(`Worker ${worker.process.pid} died (${signal || code}). Restarting...`);
      const newWorker = cluster.fork();
      console.log(`✓ New worker ${newWorker.process.pid} started`);
    });

    cluster.on('online', (worker) => {
      console.log(`Worker ${worker.process.pid} is online`);
    });

    // Graceful shutdown for cluster master
    let isShuttingDown = false;
    const shutdownCluster = async (signal) => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      console.log(`\n${signal} received, shutting down cluster...`);

      for (const id in cluster.workers) {
        cluster.workers[id].kill();
      }

      setTimeout(() => {
        console.log('All workers stopped');
        process.exit(0);
      }, 5000);
    };

    process.on('SIGTERM', () => shutdownCluster('SIGTERM'));
    process.on('SIGINT', () => shutdownCluster('SIGINT'));

  } else {
    // Worker process or standalone mode
    const server = new RoIPServer(configPath);
    let isShuttingDown = false;

    // Graceful shutdown
    const shutdown = async (signal) => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      console.log(`\n${signal} received, shutting down gracefully...`);

      try {
        await server.stop();
        console.log('✓ Server shutdown complete');
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Unhandled errors
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      if (server.logger) {
        server.logger.error('Unhandled Rejection', { reason, promise });
      }
      process.exit(1);
    });

    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      if (server.logger) {
        server.logger.error('Uncaught Exception', { error });
      }
      process.exit(1);
    });

    // Start server
    await server.start();
  }
};

/**
 * Load configuration synchronously (for cluster mode detection)
 */
function loadConfigSync(configPath) {
  try {
    const defaultPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../config/default.yaml');
    const configFile = fs.readFileSync(configPath || defaultPath, 'utf8');
    return YAML.parse(configFile);
  } catch (error) {
    console.error('Failed to load config:', error.message);
    return {};
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { RoIPServer };
