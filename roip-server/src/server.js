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
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createLogger, format, transports } from 'winston';

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
    app.use(helmet());
    app.use(compression());

    // CORS
    if (this.config.server.api.enable_cors) {
      app.use(cors({
        origin: this.config.server.api.cors_origins,
        credentials: true
      }));
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
          timestamp: new Date().toISOString()
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

    // Start server
    this.components.apiServer = app.listen(this.config.server.api.port, this.config.server.host, () => {
      this.logger.info(`✓ Web API listening on http://${this.config.server.host}:${this.config.server.api.port}`);
    });
  }

  /**
   * Initialize WebSocket server
   */
  async initWebSocket() {
    this.logger.info(`Starting WebSocket server on port ${this.config.server.websocket.port}...`);
    this.components.websocket = new WebSocketServer(
      this.config.server.websocket,
      this.components,
      this.logger
    );
    await this.components.websocket.start();
    this.logger.info(`✓ WebSocket server listening on ws://${this.config.server.host}:${this.config.server.websocket.port}`);
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
  }

  /**
   * Stop the server gracefully
   */
  async stop() {
    if (!this.running) return;

    this.logger.info('Stopping server...');
    this.running = false;

    // Stop all components
    if (this.components.websocket) await this.components.websocket.stop();
    if (this.components.apiServer) this.components.apiServer.close();
    if (this.components.stun) await this.components.stun.stop();
    if (this.components.sip) await this.components.sip.stop();
    if (this.components.database) await this.components.database.close();

    this.logger.info('✓ Server stopped');
  }
}

// Main entry point
const main = async () => {
  const configPath = process.argv[2];
  const server = new RoIPServer(configPath);

  // Graceful shutdown
  const shutdown = async (signal) => {
    console.log(`\n${signal} received, shutting down gracefully...`);
    await server.stop();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Unhandled errors
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });

  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
  });

  // Start server
  await server.start();
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { RoIPServer };
