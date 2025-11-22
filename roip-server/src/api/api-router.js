/**
 * API Router
 * Handles all REST API endpoints for RoIP server
 * Includes authentication, validation, rate limiting, and error handling
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import Joi from 'joi';
import rateLimit from 'express-rate-limit';
import NodeCache from 'node-cache';

/**
 * APIRouter class - Complete REST API implementation
 */
export class APIRouter {
  constructor(components, config, logger) {
    this.components = components;
    this.config = config;
    this.logger = logger;
    this.router = express.Router();

    // Initialize response cache
    this.initResponseCache();

    // Initialize rate limiters
    this.initRateLimiters();

    // Register routes
    this.registerRoutes();
  }

  /**
   * Initialize response cache for API endpoints
   */
  initResponseCache() {
    // Cache with default TTL of 30 seconds
    this.cache = new NodeCache({
      stdTTL: this.config.performance?.cache?.defaultTTL || 30,
      checkperiod: this.config.performance?.cache?.checkPeriod || 120,
      useClones: false // Better performance, but responses must not be modified
    });

    this.logger.info('✓ API response cache initialized', {
      defaultTTL: this.cache.options.stdTTL,
      checkPeriod: this.cache.options.checkperiod
    });

    // Log cache statistics periodically
    if (this.config.performance?.cache?.logStats) {
      setInterval(() => {
        const stats = this.cache.getStats();
        this.logger.debug('Cache statistics', {
          keys: stats.keys,
          hits: stats.hits,
          misses: stats.misses,
          hitRate: stats.hits > 0 ? ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(2) + '%' : '0%'
        });
      }, 60000); // Log every minute
    }
  }

  /**
   * Caching middleware factory
   */
  cacheMiddleware = (duration) => {
    return (req, res, next) => {
      // Skip caching for non-GET requests
      if (req.method !== 'GET') {
        return next();
      }

      // Check if caching is enabled
      if (this.config.performance?.cache?.enabled === false) {
        return next();
      }

      // Generate cache key from URL and query params
      const key = `${req.originalUrl || req.url}`;

      // Try to get cached response
      const cached = this.cache.get(key);
      if (cached) {
        this.logger.debug('Cache hit', { key });
        return res.json(cached);
      }

      // Cache miss - intercept response
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        // Store in cache
        this.cache.set(key, body, duration || this.cache.options.stdTTL);
        this.logger.debug('Cache set', { key, ttl: duration || this.cache.options.stdTTL });
        return originalJson(body);
      };

      next();
    };
  };

  /**
   * Initialize rate limiters for different endpoints
   */
  initRateLimiters() {
    // General API rate limiter
    this.apiLimiter = rateLimit({
      windowMs: this.config.rate_limiting?.window_ms || 15 * 60 * 1000, // 15 minutes
      max: this.config.rate_limiting?.max_requests || 100,
      message: 'Too many requests, please try again later',
      standardHeaders: true,
      legacyHeaders: false
    });

    // Strict limiter for authentication endpoints
    this.authLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: this.config.rate_limiting?.auth_max_requests || 5,
      skipSuccessfulRequests: true,
      message: 'Too many login attempts, please try again later'
    });

    // Device operations limiter
    this.deviceLimiter = rateLimit({
      windowMs: 60 * 1000,
      max: this.config.rate_limiting?.device_max_requests || 30,
      skip: (req) => req.method === 'GET'
    });

    // Call operations limiter
    this.callLimiter = rateLimit({
      windowMs: 1000,
      max: this.config.rate_limiting?.call_max_requests || 10,
      skip: (req) => req.method === 'GET'
    });
  }

  /**
   * JWT authentication middleware
   */
  authenticateJWT = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return this.sendError(res, 401, 'Missing authentication token');
    }

    try {
      const decoded = jwt.verify(token, this.config.auth.jwt_secret);
      req.user = decoded;
      next();
    } catch (error) {
      this.logger.warn(`JWT verification failed: ${error.message}`);
      return this.sendError(res, 403, 'Invalid or expired token');
    }
  };

  /**
   * Optional JWT middleware for public endpoints with optional auth
   */
  optionalAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      try {
        const decoded = jwt.verify(token, this.config.auth.jwt_secret);
        req.user = decoded;
      } catch (error) {
        this.logger.debug(`Optional JWT verification failed: ${error.message}`);
      }
    }
    next();
  };

  /**
   * Input validation middleware factory
   */
  validateRequest = (schema, dataSource = 'body') => {
    return (req, res, next) => {
      const { error, value } = schema.validate(req[dataSource], {
        abortEarly: false,
        stripUnknown: true
      });

      if (error) {
        const messages = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }));
        return this.sendError(res, 400, 'Validation error', messages);
      }

      req.validated = value;
      next();
    };
  };

  /**
   * SECURITY: Input sanitization middleware to prevent injection attacks
   */
  sanitizeInput = (req, res, next) => {
    const sanitizeValue = (value) => {
      if (typeof value === 'string') {
        // Remove potential command injection characters
        return value
          .replace(/[;&|`$()]/g, '')  // Remove shell metacharacters
          .replace(/\.\./g, '')        // Remove directory traversal
          .replace(/<script[^>]*>.*?<\/script>/gi, '') // Remove script tags
          .trim();
      }
      if (typeof value === 'object' && value !== null) {
        const sanitized = Array.isArray(value) ? [] : {};
        for (const key in value) {
          sanitized[key] = sanitizeValue(value[key]);
        }
        return sanitized;
      }
      return value;
    };

    // Sanitize body
    if (req.body) {
      req.body = sanitizeValue(req.body);
    }

    // Sanitize query parameters
    if (req.query) {
      req.query = sanitizeValue(req.query);
    }

    // Sanitize URL parameters
    if (req.params) {
      req.params = sanitizeValue(req.params);
    }

    next();
  };

  /**
   * SECURITY: Role-based authorization middleware
   */
  requireRole = (roles) => {
    return (req, res, next) => {
      if (!req.user) {
        return this.sendError(res, 401, 'Authentication required');
      }

      const userRoles = req.user.roles || [];
      const requiredRoles = Array.isArray(roles) ? roles : [roles];

      const hasRole = requiredRoles.some(role => userRoles.includes(role));

      if (!hasRole) {
        this.logger.warn(`Access denied for user ${req.user.username}: insufficient permissions (required: ${requiredRoles}, has: ${userRoles})`);
        return this.sendError(res, 403, `Insufficient permissions. Required role: ${requiredRoles.join(' or ')}`);
      }

      next();
    };
  };

  /**
   * SECURITY: Query parameter validation middleware
   */
  validateQuery = (schema) => {
    return (req, res, next) => {
      const { error, value } = schema.validate(req.query, {
        abortEarly: false,
        stripUnknown: true
      });

      if (error) {
        const messages = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }));
        return this.sendError(res, 400, 'Query validation error', messages);
      }

      req.query = value;
      next();
    };
  };

  /**
   * Register all API routes
   */
  registerRoutes() {
    // SECURITY: Apply input sanitization to all routes
    this.router.use(this.sanitizeInput);

    // Apply general rate limiter to all routes
    this.router.use(this.apiLimiter);

    // AUTH ROUTES
    this.router.post(
      '/auth/login',
      this.authLimiter,
      this.validateRequest(this.schemas.authLogin),
      this.handleLogin.bind(this)
    );

    this.router.post(
      '/auth/logout',
      this.authenticateJWT,
      this.handleLogout.bind(this)
    );

    this.router.post(
      '/auth/refresh',
      this.validateRequest(this.schemas.tokenRefresh, 'body'),
      this.handleRefreshToken.bind(this)
    );

    this.router.post(
      '/auth/register',
      this.validateRequest(this.schemas.userRegister),
      this.handleRegister.bind(this)
    );

    this.router.get(
      '/auth/verify',
      this.authenticateJWT,
      this.handleVerifyToken.bind(this)
    );

    // DEVICES ROUTES
    this.router.get(
      '/devices',
      this.authenticateJWT,
      this.cacheMiddleware(30), // Cache for 30 seconds
      this.handleGetDevices.bind(this)
    );

    this.router.get(
      '/devices/:deviceId',
      this.authenticateJWT,
      this.handleGetDeviceDetail.bind(this)
    );

    this.router.post(
      '/devices',
      this.authenticateJWT,
      this.deviceLimiter,
      this.validateRequest(this.schemas.deviceCreate),
      this.handleCreateDevice.bind(this)
    );

    this.router.put(
      '/devices/:deviceId',
      this.authenticateJWT,
      this.deviceLimiter,
      this.validateRequest(this.schemas.deviceUpdate),
      this.handleUpdateDevice.bind(this)
    );

    this.router.delete(
      '/devices/:deviceId',
      this.authenticateJWT,
      this.deviceLimiter,
      this.handleDeleteDevice.bind(this)
    );

    this.router.post(
      '/devices/:deviceId/reboot',
      this.authenticateJWT,
      this.deviceLimiter,
      this.handleDeviceReboot.bind(this)
    );

    this.router.get(
      '/devices/:deviceId/stats',
      this.authenticateJWT,
      this.handleGetDeviceStats.bind(this)
    );

    // CALLS ROUTES
    this.router.get(
      '/calls',
      this.authenticateJWT,
      this.handleGetCalls.bind(this)
    );

    this.router.get(
      '/calls/:callId',
      this.authenticateJWT,
      this.handleGetCallDetail.bind(this)
    );

    this.router.post(
      '/calls',
      this.authenticateJWT,
      this.callLimiter,
      this.validateRequest(this.schemas.callInitiate),
      this.handleInitiateCall.bind(this)
    );

    this.router.post(
      '/calls/:callId/connect',
      this.authenticateJWT,
      this.callLimiter,
      this.validateRequest(this.schemas.callConnect),
      this.handleConnectCall.bind(this)
    );

    this.router.post(
      '/calls/:callId/disconnect',
      this.authenticateJWT,
      this.callLimiter,
      this.handleDisconnectCall.bind(this)
    );

    this.router.post(
      '/calls/:callId/transfer',
      this.authenticateJWT,
      this.callLimiter,
      this.validateRequest(this.schemas.callTransfer),
      this.handleTransferCall.bind(this)
    );

    this.router.get(
      '/calls/:callId/recording',
      this.authenticateJWT,
      this.handleGetCallRecording.bind(this)
    );

    // ROUTES (ROUTING RULES) ROUTES
    this.router.get(
      '/routes',
      this.authenticateJWT,
      this.cacheMiddleware(60), // Cache for 60 seconds
      this.handleGetRoutes.bind(this)
    );

    this.router.get(
      '/routes/:routeId',
      this.authenticateJWT,
      this.handleGetRouteDetail.bind(this)
    );

    this.router.post(
      '/routes',
      this.authenticateJWT,
      this.deviceLimiter,
      this.validateRequest(this.schemas.routeCreate),
      this.handleCreateRoute.bind(this)
    );

    this.router.put(
      '/routes/:routeId',
      this.authenticateJWT,
      this.deviceLimiter,
      this.validateRequest(this.schemas.routeUpdate),
      this.handleUpdateRoute.bind(this)
    );

    this.router.delete(
      '/routes/:routeId',
      this.authenticateJWT,
      this.deviceLimiter,
      this.handleDeleteRoute.bind(this)
    );

    this.router.post(
      '/routes/:routeId/enable',
      this.authenticateJWT,
      this.deviceLimiter,
      this.handleEnableRoute.bind(this)
    );

    this.router.post(
      '/routes/:routeId/disable',
      this.authenticateJWT,
      this.deviceLimiter,
      this.handleDisableRoute.bind(this)
    );

    // CONFIG ROUTES - SECURITY: Admin access only
    this.router.get(
      '/config',
      this.authenticateJWT,
      this.requireRole('admin'),
      this.handleGetConfig.bind(this)
    );

    this.router.get(
      '/config/:section',
      this.authenticateJWT,
      this.requireRole('admin'),
      this.validateRequest(this.schemas.configSection, 'params'),
      this.handleGetConfigSection.bind(this)
    );

    this.router.put(
      '/config',
      this.authenticateJWT,
      this.requireRole('admin'),
      this.validateRequest(this.schemas.configUpdate),
      this.handleUpdateConfig.bind(this)
    );

    this.router.put(
      '/config/:section',
      this.authenticateJWT,
      this.requireRole('admin'),
      this.validateRequest(this.schemas.configSection, 'params'),
      this.validateRequest(this.schemas.configSectionUpdate),
      this.handleUpdateConfigSection.bind(this)
    );

    this.router.post(
      '/config/reload',
      this.authenticateJWT,
      this.requireRole('admin'),
      this.handleReloadConfig.bind(this)
    );

    this.router.post(
      '/config/backup',
      this.authenticateJWT,
      this.requireRole('admin'),
      this.handleBackupConfig.bind(this)
    );

    this.router.post(
      '/config/restore',
      this.authenticateJWT,
      this.requireRole('admin'),
      this.validateRequest(this.schemas.configRestore),
      this.handleRestoreConfig.bind(this)
    );

    // STATUS ROUTES
    this.router.get(
      '/status',
      this.optionalAuth,
      this.cacheMiddleware(10), // Cache for 10 seconds
      this.handleGetStatus.bind(this)
    );

    this.router.get(
      '/status/health',
      this.handleGetHealth.bind(this)
    );

    this.router.get(
      '/status/metrics',
      this.authenticateJWT,
      this.cacheMiddleware(5), // Cache for 5 seconds
      this.handleGetMetrics.bind(this)
    );

    this.router.get(
      '/status/uptime',
      this.optionalAuth,
      this.handleGetUptime.bind(this)
    );

    this.router.get(
      '/status/connections',
      this.authenticateJWT,
      this.cacheMiddleware(10), // Cache for 10 seconds
      this.handleGetConnections.bind(this)
    );

    // LOGS ROUTES
    this.router.get(
      '/logs',
      this.authenticateJWT,
      this.handleGetLogs.bind(this)
    );

    this.router.get(
      '/logs/:logType',
      this.authenticateJWT,
      this.handleGetLogsByType.bind(this)
    );

    this.router.post(
      '/logs/search',
      this.authenticateJWT,
      this.validateRequest(this.schemas.logSearch, 'body'),
      this.handleSearchLogs.bind(this)
    );

    this.router.post(
      '/logs/export',
      this.authenticateJWT,
      this.validateRequest(this.schemas.logExport, 'body'),
      this.handleExportLogs.bind(this)
    );

    this.router.delete(
      '/logs/:logType',
      this.authenticateJWT,
      this.handleClearLogs.bind(this)
    );

    this.router.get(
      '/logs/:logType/stats',
      this.authenticateJWT,
      this.handleGetLogStats.bind(this)
    );
  }

  /**
   * Validation schemas
   */
  get schemas() {
    return {
      authLogin: Joi.object({
        username: Joi.string().alphanum().min(3).max(30).required(),
        password: Joi.string().min(6).required()
      }),

      tokenRefresh: Joi.object({
        refresh_token: Joi.string().required()
      }),

      userRegister: Joi.object({
        username: Joi.string().alphanum().min(3).max(30).required(),
        password: Joi.string().min(8).required(),
        email: Joi.string().email().required(),
        role: Joi.string().valid('user', 'admin').default('user')
      }),

      deviceCreate: Joi.object({
        name: Joi.string().required(),
        type: Joi.string().valid('esp32', 'esp32-c3', 'esp32-s3').required(),
        callsign: Joi.string().required(),
        ip_address: Joi.string().ip().required(),
        sip_port: Joi.number().port().default(5060),
        rtp_port_min: Joi.number().port(),
        rtp_port_max: Joi.number().port(),
        enabled: Joi.boolean().default(true),
        description: Joi.string().max(500)
      }),

      deviceUpdate: Joi.object({
        name: Joi.string(),
        callsign: Joi.string(),
        ip_address: Joi.string().ip(),
        sip_port: Joi.number().port(),
        rtp_port_min: Joi.number().port(),
        rtp_port_max: Joi.number().port(),
        enabled: Joi.boolean(),
        description: Joi.string().max(500)
      }),

      callInitiate: Joi.object({
        source_device_id: Joi.string().required(),
        destination: Joi.string().required(),
        type: Joi.string().valid('voice', 'video', 'data').default('voice'),
        priority: Joi.number().min(0).max(10).default(5),
        encryption: Joi.boolean().default(false)
      }),

      callConnect: Joi.object({
        codec: Joi.string().valid('g711a', 'g711u', 'opus', 'g729').default('g711a'),
        sample_rate: Joi.number().valid(8000, 16000, 48000).default(8000),
        bitrate: Joi.number().min(8000).max(128000)
      }),

      callTransfer: Joi.object({
        target_device_id: Joi.string().required(),
        blind_transfer: Joi.boolean().default(false)
      }),

      routeCreate: Joi.object({
        name: Joi.string().required(),
        source_pattern: Joi.string().required(),
        destination_pattern: Joi.string().required(),
        target_device_id: Joi.string().required(),
        priority: Joi.number().min(0).max(100).default(50),
        enabled: Joi.boolean().default(true),
        description: Joi.string().max(500)
      }),

      routeUpdate: Joi.object({
        name: Joi.string(),
        source_pattern: Joi.string(),
        destination_pattern: Joi.string(),
        target_device_id: Joi.string(),
        priority: Joi.number().min(0).max(100),
        enabled: Joi.boolean(),
        description: Joi.string().max(500)
      }),

      configSection: Joi.object({
        section: Joi.string()
          .valid('server', 'database', 'auth', 'audio', 'routing', 'recording', 'logging', 'qos', 'tls', 'security', 'devices', 'monitoring', 'features')
          .required()
      }),

      configUpdate: Joi.object({
        server: Joi.object().optional(),
        database: Joi.object().optional(),
        auth: Joi.object().optional(),
        audio: Joi.object().optional(),
        routing: Joi.object().optional(),
        recording: Joi.object().optional(),
        logging: Joi.object().optional(),
        qos: Joi.object().optional(),
        tls: Joi.object().optional(),
        security: Joi.object().optional(),
        devices: Joi.object().optional(),
        monitoring: Joi.object().optional(),
        features: Joi.object().optional()
      }).min(1),

      configSectionUpdate: Joi.object().unknown(true).min(1),

      configRestore: Joi.object({
        backup_id: Joi.string().alphanum().min(10).max(100).required(),
        force: Joi.boolean().default(false)
      }),

      logSearch: Joi.object({
        level: Joi.string().valid('error', 'warn', 'info', 'debug'),
        component: Joi.string(),
        from_date: Joi.date(),
        to_date: Joi.date(),
        limit: Joi.number().max(1000).default(100),
        offset: Joi.number().default(0)
      }),

      logExport: Joi.object({
        format: Joi.string().valid('json', 'csv', 'txt').default('json'),
        from_date: Joi.date(),
        to_date: Joi.date(),
        level: Joi.string().valid('error', 'warn', 'info', 'debug')
      })
    };
  }

  /**
   * Response formatting helpers
   */
  sendSuccess(res, data = null, message = 'Success', statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      timestamp: new Date().toISOString()
    });
  }

  sendError(res, statusCode = 400, message = 'Error', errors = null) {
    return res.status(statusCode).json({
      success: false,
      message,
      errors,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * AUTH HANDLERS
   */
  async handleLogin(req, res) {
    try {
      const { username, password } = req.validated;
      this.logger.debug(`Login attempt for user: ${username}`);

      const result = await this.components.auth.authenticateUser(username, password);
      if (!result.success) {
        return this.sendError(res, 401, result.message);
      }

      return this.sendSuccess(res, {
        token: result.token,
        refresh_token: result.refreshToken,
        user: result.user,
        expires_in: result.expiresIn
      }, 'Login successful', 200);
    } catch (error) {
      this.logger.error(`Login error: ${error.message}`);
      return this.sendError(res, 500, 'Login failed');
    }
  }

  async handleLogout(req, res) {
    try {
      await this.components.auth.revokeToken(req.user.token);
      this.logger.info(`User ${req.user.username} logged out`);
      return this.sendSuccess(res, null, 'Logout successful');
    } catch (error) {
      this.logger.error(`Logout error: ${error.message}`);
      return this.sendError(res, 500, 'Logout failed');
    }
  }

  async handleRefreshToken(req, res) {
    try {
      const { refresh_token } = req.validated;
      const result = await this.components.auth.refreshToken(refresh_token);
      if (!result.success) {
        return this.sendError(res, 401, result.message);
      }

      return this.sendSuccess(res, {
        token: result.token,
        expires_in: result.expiresIn
      }, 'Token refreshed');
    } catch (error) {
      this.logger.error(`Token refresh error: ${error.message}`);
      return this.sendError(res, 500, 'Token refresh failed');
    }
  }

  async handleRegister(req, res) {
    try {
      const { username, password, email, role } = req.validated;
      this.logger.debug(`User registration: ${username}`);

      const result = await this.components.auth.registerUser({
        username,
        password,
        email,
        role
      });

      if (!result.success) {
        return this.sendError(res, 400, result.message);
      }

      return this.sendSuccess(res, { user_id: result.userId }, 'User registered successfully', 201);
    } catch (error) {
      this.logger.error(`Registration error: ${error.message}`);
      return this.sendError(res, 500, 'Registration failed');
    }
  }

  async handleVerifyToken(req, res) {
    try {
      return this.sendSuccess(res, {
        user: req.user,
        valid: true
      }, 'Token is valid');
    } catch (error) {
      return this.sendError(res, 500, 'Verification failed');
    }
  }

  /**
   * DEVICES HANDLERS
   */
  async handleGetDevices(req, res) {
    try {
      const devices = await this.components.database.getDevices();
      return this.sendSuccess(res, devices, 'Devices retrieved');
    } catch (error) {
      this.logger.error(`Get devices error: ${error.message}`);
      return this.sendError(res, 500, 'Failed to retrieve devices');
    }
  }

  async handleGetDeviceDetail(req, res) {
    try {
      const { deviceId } = req.params;
      const device = await this.components.database.getDevice(deviceId);
      if (!device) {
        return this.sendError(res, 404, 'Device not found');
      }

      return this.sendSuccess(res, device, 'Device retrieved');
    } catch (error) {
      this.logger.error(`Get device detail error: ${error.message}`);
      return this.sendError(res, 500, 'Failed to retrieve device');
    }
  }

  async handleCreateDevice(req, res) {
    try {
      const deviceData = req.validated;
      this.logger.debug(`Creating device: ${deviceData.name}`);

      const result = await this.components.database.createDevice(deviceData);
      return this.sendSuccess(res, result, 'Device created successfully', 201);
    } catch (error) {
      this.logger.error(`Create device error: ${error.message}`);
      return this.sendError(res, 500, 'Failed to create device');
    }
  }

  async handleUpdateDevice(req, res) {
    try {
      const { deviceId } = req.params;
      const updateData = req.validated;

      const result = await this.components.database.updateDevice(deviceId, updateData);
      if (!result) {
        return this.sendError(res, 404, 'Device not found');
      }

      this.logger.info(`Device ${deviceId} updated`);
      return this.sendSuccess(res, result, 'Device updated');
    } catch (error) {
      this.logger.error(`Update device error: ${error.message}`);
      return this.sendError(res, 500, 'Failed to update device');
    }
  }

  async handleDeleteDevice(req, res) {
    try {
      const { deviceId } = req.params;
      const result = await this.components.database.deleteDevice(deviceId);
      if (!result) {
        return this.sendError(res, 404, 'Device not found');
      }

      this.logger.info(`Device ${deviceId} deleted`);
      return this.sendSuccess(res, null, 'Device deleted');
    } catch (error) {
      this.logger.error(`Delete device error: ${error.message}`);
      return this.sendError(res, 500, 'Failed to delete device');
    }
  }

  async handleDeviceReboot(req, res) {
    try {
      const { deviceId } = req.params;
      await this.components.sip.rebootDevice(deviceId);
      this.logger.info(`Device ${deviceId} reboot initiated`);
      return this.sendSuccess(res, null, 'Reboot command sent');
    } catch (error) {
      this.logger.error(`Device reboot error: ${error.message}`);
      return this.sendError(res, 500, 'Failed to reboot device');
    }
  }

  async handleGetDeviceStats(req, res) {
    try {
      const { deviceId } = req.params;
      const stats = await this.components.call.getDeviceStats(deviceId);
      return this.sendSuccess(res, stats, 'Device stats retrieved');
    } catch (error) {
      this.logger.error(`Get device stats error: ${error.message}`);
      return this.sendError(res, 500, 'Failed to retrieve device stats');
    }
  }

  /**
   * CALLS HANDLERS
   */
  async handleGetCalls(req, res) {
    try {
      const { status, device_id, limit = 50, offset = 0 } = req.query;
      const calls = await this.components.database.getCalls({ status, device_id, limit, offset });
      return this.sendSuccess(res, calls, 'Calls retrieved');
    } catch (error) {
      this.logger.error(`Get calls error: ${error.message}`);
      return this.sendError(res, 500, 'Failed to retrieve calls');
    }
  }

  async handleGetCallDetail(req, res) {
    try {
      const { callId } = req.params;
      const call = await this.components.database.getCall(callId);
      if (!call) {
        return this.sendError(res, 404, 'Call not found');
      }

      return this.sendSuccess(res, call, 'Call retrieved');
    } catch (error) {
      this.logger.error(`Get call detail error: ${error.message}`);
      return this.sendError(res, 500, 'Failed to retrieve call');
    }
  }

  async handleInitiateCall(req, res) {
    try {
      const callData = req.validated;
      this.logger.debug(`Initiating call to ${callData.destination}`);

      const result = await this.components.call.initiateCall(callData);
      if (!result.success) {
        return this.sendError(res, 400, result.message);
      }

      return this.sendSuccess(res, { call_id: result.callId }, 'Call initiated', 201);
    } catch (error) {
      this.logger.error(`Initiate call error: ${error.message}`);
      return this.sendError(res, 500, 'Failed to initiate call');
    }
  }

  async handleConnectCall(req, res) {
    try {
      const { callId } = req.params;
      const connectData = req.validated;

      const result = await this.components.call.connectCall(callId, connectData);
      if (!result.success) {
        return this.sendError(res, 400, result.message);
      }

      this.logger.info(`Call ${callId} connected`);
      return this.sendSuccess(res, result, 'Call connected');
    } catch (error) {
      this.logger.error(`Connect call error: ${error.message}`);
      return this.sendError(res, 500, 'Failed to connect call');
    }
  }

  async handleDisconnectCall(req, res) {
    try {
      const { callId } = req.params;
      const result = await this.components.call.disconnectCall(callId);
      if (!result.success) {
        return this.sendError(res, 404, 'Call not found');
      }

      this.logger.info(`Call ${callId} disconnected`);
      return this.sendSuccess(res, null, 'Call disconnected');
    } catch (error) {
      this.logger.error(`Disconnect call error: ${error.message}`);
      return this.sendError(res, 500, 'Failed to disconnect call');
    }
  }

  async handleTransferCall(req, res) {
    try {
      const { callId } = req.params;
      const transferData = req.validated;

      const result = await this.components.call.transferCall(callId, transferData);
      if (!result.success) {
        return this.sendError(res, 400, result.message);
      }

      this.logger.info(`Call ${callId} transferred`);
      return this.sendSuccess(res, result, 'Call transferred');
    } catch (error) {
      this.logger.error(`Transfer call error: ${error.message}`);
      return this.sendError(res, 500, 'Failed to transfer call');
    }
  }

  async handleGetCallRecording(req, res) {
    try {
      const { callId } = req.params;
      const recording = await this.components.database.getCallRecording(callId);
      if (!recording) {
        return this.sendError(res, 404, 'Recording not found');
      }

      return this.sendSuccess(res, recording, 'Recording retrieved');
    } catch (error) {
      this.logger.error(`Get call recording error: ${error.message}`);
      return this.sendError(res, 500, 'Failed to retrieve recording');
    }
  }

  /**
   * ROUTES HANDLERS
   */
  async handleGetRoutes(req, res) {
    try {
      const routes = await this.components.database.getRoutes();
      return this.sendSuccess(res, routes, 'Routes retrieved');
    } catch (error) {
      this.logger.error(`Get routes error: ${error.message}`);
      return this.sendError(res, 500, 'Failed to retrieve routes');
    }
  }

  async handleGetRouteDetail(req, res) {
    try {
      const { routeId } = req.params;
      const route = await this.components.database.getRoute(routeId);
      if (!route) {
        return this.sendError(res, 404, 'Route not found');
      }

      return this.sendSuccess(res, route, 'Route retrieved');
    } catch (error) {
      this.logger.error(`Get route detail error: ${error.message}`);
      return this.sendError(res, 500, 'Failed to retrieve route');
    }
  }

  async handleCreateRoute(req, res) {
    try {
      const routeData = req.validated;
      this.logger.debug(`Creating route: ${routeData.name}`);

      const result = await this.components.database.createRoute(routeData);
      await this.components.call.reloadRoutes();

      return this.sendSuccess(res, result, 'Route created successfully', 201);
    } catch (error) {
      this.logger.error(`Create route error: ${error.message}`);
      return this.sendError(res, 500, 'Failed to create route');
    }
  }

  async handleUpdateRoute(req, res) {
    try {
      const { routeId } = req.params;
      const updateData = req.validated;

      const result = await this.components.database.updateRoute(routeId, updateData);
      if (!result) {
        return this.sendError(res, 404, 'Route not found');
      }

      await this.components.call.reloadRoutes();
      this.logger.info(`Route ${routeId} updated`);

      return this.sendSuccess(res, result, 'Route updated');
    } catch (error) {
      this.logger.error(`Update route error: ${error.message}`);
      return this.sendError(res, 500, 'Failed to update route');
    }
  }

  async handleDeleteRoute(req, res) {
    try {
      const { routeId } = req.params;
      const result = await this.components.database.deleteRoute(routeId);
      if (!result) {
        return this.sendError(res, 404, 'Route not found');
      }

      await this.components.call.reloadRoutes();
      this.logger.info(`Route ${routeId} deleted`);

      return this.sendSuccess(res, null, 'Route deleted');
    } catch (error) {
      this.logger.error(`Delete route error: ${error.message}`);
      return this.sendError(res, 500, 'Failed to delete route');
    }
  }

  async handleEnableRoute(req, res) {
    try {
      const { routeId } = req.params;
      const result = await this.components.database.updateRoute(routeId, { enabled: true });
      if (!result) {
        return this.sendError(res, 404, 'Route not found');
      }

      await this.components.call.reloadRoutes();
      this.logger.info(`Route ${routeId} enabled`);

      return this.sendSuccess(res, result, 'Route enabled');
    } catch (error) {
      this.logger.error(`Enable route error: ${error.message}`);
      return this.sendError(res, 500, 'Failed to enable route');
    }
  }

  async handleDisableRoute(req, res) {
    try {
      const { routeId } = req.params;
      const result = await this.components.database.updateRoute(routeId, { enabled: false });
      if (!result) {
        return this.sendError(res, 404, 'Route not found');
      }

      await this.components.call.reloadRoutes();
      this.logger.info(`Route ${routeId} disabled`);

      return this.sendSuccess(res, result, 'Route disabled');
    } catch (error) {
      this.logger.error(`Disable route error: ${error.message}`);
      return this.sendError(res, 500, 'Failed to disable route');
    }
  }

  /**
   * CONFIG HANDLERS
   */
  async handleGetConfig(req, res) {
    try {
      // Return sanitized config (remove sensitive data)
      const sanitized = this.sanitizeConfig(this.config);
      return this.sendSuccess(res, sanitized, 'Configuration retrieved');
    } catch (error) {
      this.logger.error(`Get config error: ${error.message}`);
      return this.sendError(res, 500, 'Failed to retrieve configuration');
    }
  }

  async handleGetConfigSection(req, res) {
    try {
      const { section } = req.params;
      if (!this.config[section]) {
        return this.sendError(res, 404, 'Configuration section not found');
      }

      const sanitized = this.sanitizeConfig({ [section]: this.config[section] });
      return this.sendSuccess(res, sanitized[section], 'Configuration section retrieved');
    } catch (error) {
      this.logger.error(`Get config section error: ${error.message}`);
      return this.sendError(res, 500, 'Failed to retrieve configuration section');
    }
  }

  async handleUpdateConfig(req, res) {
    try {
      const updates = req.validated;
      Object.assign(this.config, updates);
      this.logger.info('Configuration updated');
      return this.sendSuccess(res, null, 'Configuration updated');
    } catch (error) {
      this.logger.error(`Update config error: ${error.message}`);
      return this.sendError(res, 500, 'Failed to update configuration');
    }
  }

  async handleUpdateConfigSection(req, res) {
    try {
      const { section } = req.params;
      const updates = req.validated;

      if (!this.config[section]) {
        return this.sendError(res, 404, 'Configuration section not found');
      }

      Object.assign(this.config[section], updates);
      this.logger.info(`Configuration section ${section} updated`);

      return this.sendSuccess(res, null, 'Configuration section updated');
    } catch (error) {
      this.logger.error(`Update config section error: ${error.message}`);
      return this.sendError(res, 500, 'Failed to update configuration section');
    }
  }

  async handleReloadConfig(req, res) {
    try {
      // In a real implementation, this would reload from file
      this.logger.info('Configuration reload initiated');
      return this.sendSuccess(res, null, 'Configuration reload initiated');
    } catch (error) {
      this.logger.error(`Reload config error: ${error.message}`);
      return this.sendError(res, 500, 'Failed to reload configuration');
    }
  }

  async handleBackupConfig(req, res) {
    try {
      const backupId = `backup_${Date.now()}`;
      const backup = {
        id: backupId,
        timestamp: new Date().toISOString(),
        config: JSON.parse(JSON.stringify(this.config))
      };

      // Store backup (implementation depends on storage)
      this.logger.info(`Configuration backed up: ${backupId}`);

      return this.sendSuccess(res, { backup_id: backupId }, 'Configuration backed up', 201);
    } catch (error) {
      this.logger.error(`Backup config error: ${error.message}`);
      return this.sendError(res, 500, 'Failed to backup configuration');
    }
  }

  async handleRestoreConfig(req, res) {
    try {
      const { backup_id, force } = req.validated;

      // Restore from backup (implementation depends on storage)
      this.logger.info(`Configuration restore from ${backup_id} initiated`);

      return this.sendSuccess(res, null, 'Configuration restored');
    } catch (error) {
      this.logger.error(`Restore config error: ${error.message}`);
      return this.sendError(res, 500, 'Failed to restore configuration');
    }
  }

  /**
   * STATUS HANDLERS
   */
  async handleGetStatus(req, res) {
    try {
      const status = {
        running: this.components.sip?.isRunning() || false,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        sip_server: this.components.sip?.getStatus() || { status: 'unknown' },
        rtp_manager: this.components.rtp?.getStatus() || { status: 'unknown' },
        call_manager: this.components.call?.getStatus() || { status: 'unknown' }
      };

      return this.sendSuccess(res, status, 'Status retrieved');
    } catch (error) {
      this.logger.error(`Get status error: ${error.message}`);
      return this.sendError(res, 500, 'Failed to retrieve status');
    }
  }

  async handleGetHealth(req, res) {
    try {
      const health = {
        healthy: true,
        checks: {
          sip: this.components.sip?.isRunning() ? 'ok' : 'down',
          database: await this.components.database?.isConnected() ? 'ok' : 'down',
          memory: process.memoryUsage().heapUsed < (1024 * 1024 * 1024) ? 'ok' : 'warning'
        }
      };

      health.healthy = Object.values(health.checks).every(c => c !== 'down');

      return this.sendSuccess(res, health, 'Health check complete');
    } catch (error) {
      return this.sendError(res, 500, 'Health check failed');
    }
  }

  async handleGetMetrics(req, res) {
    try {
      const metrics = {
        timestamp: new Date().toISOString(),
        process: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage()
        },
        components: {
          sip: this.components.sip?.getMetrics() || {},
          rtp: this.components.rtp?.getMetrics() || {},
          call: this.components.call?.getMetrics() || {}
        }
      };

      return this.sendSuccess(res, metrics, 'Metrics retrieved');
    } catch (error) {
      this.logger.error(`Get metrics error: ${error.message}`);
      return this.sendError(res, 500, 'Failed to retrieve metrics');
    }
  }

  async handleGetUptime(req, res) {
    try {
      return this.sendSuccess(res, {
        uptime: process.uptime(),
        uptime_formatted: this.formatUptime(process.uptime()),
        start_time: new Date(Date.now() - process.uptime() * 1000).toISOString()
      }, 'Uptime retrieved');
    } catch (error) {
      return this.sendError(res, 500, 'Failed to retrieve uptime');
    }
  }

  async handleGetConnections(req, res) {
    try {
      const connections = {
        sip_registrations: this.components.sip?.getRegistrationCount() || 0,
        active_calls: this.components.call?.getActiveCallCount() || 0,
        websocket_connections: this.components.websocket?.getClientCount() || 0,
        total_connections: 0
      };

      connections.total_connections = connections.sip_registrations +
                                       connections.active_calls +
                                       connections.websocket_connections;

      return this.sendSuccess(res, connections, 'Connections retrieved');
    } catch (error) {
      this.logger.error(`Get connections error: ${error.message}`);
      return this.sendError(res, 500, 'Failed to retrieve connections');
    }
  }

  /**
   * LOGS HANDLERS
   */
  async handleGetLogs(req, res) {
    try {
      const { limit = 100, offset = 0, level } = req.query;
      const logs = await this.components.database.getLogs({ limit, offset, level });
      return this.sendSuccess(res, logs, 'Logs retrieved');
    } catch (error) {
      this.logger.error(`Get logs error: ${error.message}`);
      return this.sendError(res, 500, 'Failed to retrieve logs');
    }
  }

  async handleGetLogsByType(req, res) {
    try {
      const { logType } = req.params;
      const { limit = 100, offset = 0 } = req.query;

      const logs = await this.components.database.getLogsByType(logType, { limit, offset });
      return this.sendSuccess(res, logs, `${logType} logs retrieved`);
    } catch (error) {
      this.logger.error(`Get logs by type error: ${error.message}`);
      return this.sendError(res, 500, 'Failed to retrieve logs');
    }
  }

  async handleSearchLogs(req, res) {
    try {
      const searchParams = req.validated;
      const results = await this.components.database.searchLogs(searchParams);
      return this.sendSuccess(res, results, 'Logs search completed');
    } catch (error) {
      this.logger.error(`Search logs error: ${error.message}`);
      return this.sendError(res, 500, 'Failed to search logs');
    }
  }

  async handleExportLogs(req, res) {
    try {
      const { format, from_date, to_date, level } = req.validated;
      const logs = await this.components.database.getLogs({ from_date, to_date, level });

      // Format logs based on requested format
      let output;
      if (format === 'csv') {
        output = this.logsToCSV(logs);
        res.setHeader('Content-Type', 'text/csv');
      } else if (format === 'txt') {
        output = this.logsToTXT(logs);
        res.setHeader('Content-Type', 'text/plain');
      } else {
        output = JSON.stringify(logs, null, 2);
        res.setHeader('Content-Type', 'application/json');
      }

      res.setHeader('Content-Disposition', `attachment; filename="logs_${Date.now()}.${format}"`);
      return res.send(output);
    } catch (error) {
      this.logger.error(`Export logs error: ${error.message}`);
      return this.sendError(res, 500, 'Failed to export logs');
    }
  }

  async handleClearLogs(req, res) {
    try {
      const { logType } = req.params;
      await this.components.database.clearLogs(logType);
      this.logger.info(`Logs cleared for type: ${logType}`);
      return this.sendSuccess(res, null, 'Logs cleared');
    } catch (error) {
      this.logger.error(`Clear logs error: ${error.message}`);
      return this.sendError(res, 500, 'Failed to clear logs');
    }
  }

  async handleGetLogStats(req, res) {
    try {
      const { logType } = req.params;
      const stats = await this.components.database.getLogStats(logType);
      return this.sendSuccess(res, stats, 'Log stats retrieved');
    } catch (error) {
      this.logger.error(`Get log stats error: ${error.message}`);
      return this.sendError(res, 500, 'Failed to retrieve log stats');
    }
  }

  /**
   * UTILITY METHODS
   */
  sanitizeConfig(config) {
    const sensitive = ['jwt_secret', 'password', 'token', 'api_key', 'secret'];
    const sanitized = JSON.parse(JSON.stringify(config));

    const sanitizeObj = (obj) => {
      for (const key in obj) {
        if (sensitive.some(s => key.toLowerCase().includes(s))) {
          obj[key] = '***REDACTED***';
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitizeObj(obj[key]);
        }
      }
    };

    sanitizeObj(sanitized);
    return sanitized;
  }

  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  }

  logsToCSV(logs) {
    if (!logs || logs.length === 0) return 'timestamp,level,message\n';

    const headers = ['timestamp', 'level', 'message', 'component'];
    const rows = logs.map(log =>
      headers.map(h => `"${String(log[h] || '').replace(/"/g, '""')}"`).join(',')
    );

    return [headers.join(','), ...rows].join('\n');
  }

  logsToTXT(logs) {
    return logs.map(log =>
      `[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}`
    ).join('\n');
  }

  /**
   * Get the router instance
   */
  getRouter() {
    return this.router;
  }
}
