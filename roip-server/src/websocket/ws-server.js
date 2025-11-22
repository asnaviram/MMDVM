const WebSocket = require('ws');
const EventEmitter = require('events');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const url = require('url');

/**
 * WebSocketServer - Real-time communication server for RoIP system
 * Manages client connections, event broadcasting, and message routing
 *
 * SECURITY FEATURES:
 * - Origin validation against whitelist
 * - JWT token authentication on connection
 * - Token expiration checks
 * - Rate limiting per connection
 */
class WebSocketServer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.port = options.port || 8080;
    this.server = null;
    this.wss = null;
    this.clients = new Map(); // clientId -> {ws, metadata}
    this.rooms = new Map(); // roomId -> Set of clientIds
    this.authenticator = options.authenticator || null;
    this.logger = options.logger || console;
    this.heartbeatInterval = options.heartbeatInterval || 30000; // 30 seconds
    this.heartbeatTimeout = options.heartbeatTimeout || 5000; // 5 seconds
    this.messageHandlers = new Map();
    this.isAlive = new Map(); // clientId -> boolean
    this.authTokens = new Map(); // clientId -> token

    // SECURITY: Origin validation configuration
    this.allowedOrigins = options.allowedOrigins || ['http://localhost:3000', 'https://localhost:3000'];
    this.jwtSecret = options.jwtSecret || null;
    this.requireAuth = options.requireAuth !== false; // Default to true

    // SECURITY: Connection rate limiting
    this.connectionAttempts = new Map(); // IP -> {count, resetTime}
    this.maxConnectionsPerIP = options.maxConnectionsPerIP || 10;
    this.connectionWindowMs = options.connectionWindowMs || 60000; // 1 minute

    this._initializeHandlers();
  }

  /**
   * Initialize message type handlers
   */
  _initializeHandlers() {
    // Register event handlers
    this.registerHandler('device.registered', (client, data) => {
      this._handleDeviceRegistered(client, data);
    });

    this.registerHandler('call.started', (client, data) => {
      this._handleCallStarted(client, data);
    });

    this.registerHandler('call.ended', (client, data) => {
      this._handleCallEnded(client, data);
    });

    this.registerHandler('audio.level', (client, data) => {
      this._handleAudioLevel(client, data);
    });

    this.registerHandler('authenticate', (client, data) => {
      this._handleAuthentication(client, data);
    });

    this.registerHandler('ping', (client, data) => {
      this._handlePing(client, data);
    });
  }

  /**
   * Register a message handler for a specific event type
   * @param {string} eventType - Type of event to handle
   * @param {Function} handler - Handler function(client, data)
   */
  registerHandler(eventType, handler) {
    this.messageHandlers.set(eventType, handler);
    this.logger.debug(`Handler registered for event type: ${eventType}`);
  }

  /**
   * Start the WebSocket server
   * @param {http.Server} httpServer - HTTP server instance
   * @returns {Promise<void>}
   */
  start(httpServer) {
    return new Promise((resolve, reject) => {
      try {
        this.server = httpServer;

        this.wss = new WebSocket.Server({ server: httpServer });

        this.wss.on('connection', (ws, req) => {
          this._handleConnection(ws, req);
        });

        this.wss.on('error', (error) => {
          this.logger.error('WebSocket Server error:', error);
          this.emit('error', error);
        });

        this._startHeartbeat();

        this.logger.info(`WebSocket Server started on port ${this.port}`);
        this.emit('started');
        resolve();
      } catch (error) {
        this.logger.error('Failed to start WebSocket server:', error);
        reject(error);
      }
    });
  }

  /**
   * Stop the WebSocket server
   * @returns {Promise<void>}
   */
  stop() {
    return new Promise((resolve, reject) => {
      try {
        if (this._heartbeatTimer) {
          clearInterval(this._heartbeatTimer);
        }

        // Close all client connections
        for (const [clientId, client] of this.clients.entries()) {
          client.ws.close(1000, 'Server shutting down');
        }

        if (this.wss) {
          this.wss.close((error) => {
            if (error) {
              this.logger.error('Error closing WebSocket server:', error);
              reject(error);
            } else {
              this.logger.info('WebSocket Server stopped');
              this.emit('stopped');
              resolve();
            }
          });
        } else {
          resolve();
        }
      } catch (error) {
        this.logger.error('Error stopping WebSocket server:', error);
        reject(error);
      }
    });
  }

  /**
   * SECURITY: Validate origin against whitelist
   * @private
   */
  _validateOrigin(origin) {
    if (!origin) {
      return false;
    }

    // Check if origin is in allowed list
    // Support both exact match and wildcard patterns
    return this.allowedOrigins.some(allowed => {
      if (allowed === '*') {
        return true; // Wildcard (not recommended for production)
      }
      return origin === allowed || origin.startsWith(allowed);
    });
  }

  /**
   * SECURITY: Validate JWT token from request
   * @private
   */
  _validateJWTFromRequest(req) {
    try {
      // Try to get token from different sources
      let token = null;

      // 1. Check Sec-WebSocket-Protocol header (recommended for WebSocket)
      const protocols = req.headers['sec-websocket-protocol'];
      if (protocols) {
        const protocolList = protocols.split(',').map(p => p.trim());
        // Look for 'bearer.{token}' or just the token itself
        for (const protocol of protocolList) {
          if (protocol.startsWith('bearer.')) {
            token = protocol.substring(7);
            break;
          }
        }
      }

      // 2. Check Authorization header
      if (!token && req.headers.authorization) {
        const authHeader = req.headers.authorization;
        if (authHeader.startsWith('Bearer ')) {
          token = authHeader.substring(7);
        }
      }

      // 3. Check query parameter
      if (!token && req.url) {
        const parsedUrl = url.parse(req.url, true);
        token = parsedUrl.query.token;
      }

      if (!token) {
        return { valid: false, error: 'No token provided' };
      }

      // Validate token
      if (!this.jwtSecret) {
        this.logger.warn('JWT secret not configured, skipping validation');
        return { valid: true, payload: null };
      }

      const payload = jwt.verify(token, this.jwtSecret, {
        algorithms: ['HS256']
      });

      // Check token expiration
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        return { valid: false, error: 'Token expired' };
      }

      return { valid: true, payload, token };
    } catch (error) {
      this.logger.warn(`JWT validation failed: ${error.message}`);
      return { valid: false, error: error.message };
    }
  }

  /**
   * SECURITY: Check connection rate limit for IP
   * @private
   */
  _checkRateLimit(ip) {
    const now = Date.now();
    const record = this.connectionAttempts.get(ip);

    if (!record || now > record.resetTime) {
      // New window
      this.connectionAttempts.set(ip, {
        count: 1,
        resetTime: now + this.connectionWindowMs
      });
      return true;
    }

    if (record.count >= this.maxConnectionsPerIP) {
      return false;
    }

    record.count++;
    return true;
  }

  /**
   * Handle new client connection with security checks
   * @private
   */
  _handleConnection(ws, req) {
    const clientIp = req.socket.remoteAddress;
    const origin = req.headers.origin || req.headers.referer;

    // SECURITY: Rate limiting
    if (!this._checkRateLimit(clientIp)) {
      this.logger.warn(`Rate limit exceeded for IP: ${clientIp}`);
      ws.close(1008, 'Too many connection attempts');
      return;
    }

    // SECURITY: Origin validation
    if (origin && !this._validateOrigin(origin)) {
      this.logger.warn(`Connection rejected - invalid origin: ${origin} from ${clientIp}`);
      ws.close(1008, 'Origin not allowed');
      this.emit('connection:rejected', { ip: clientIp, origin, reason: 'invalid_origin' });
      return;
    }

    // SECURITY: JWT authentication (if required)
    let tokenPayload = null;
    let authToken = null;
    if (this.requireAuth) {
      const tokenValidation = this._validateJWTFromRequest(req);
      if (!tokenValidation.valid) {
        this.logger.warn(`Connection rejected - authentication failed: ${tokenValidation.error} from ${clientIp}`);
        ws.close(1008, 'Authentication required');
        this.emit('connection:rejected', { ip: clientIp, reason: 'auth_failed', error: tokenValidation.error });
        return;
      }
      tokenPayload = tokenValidation.payload;
      authToken = tokenValidation.token;
    }

    const clientId = this._generateClientId();
    this.logger.info(`Client connected: ${clientId} from ${clientIp}${tokenPayload ? ` (user: ${tokenPayload.username || tokenPayload.sub})` : ''}`);

    // Add client to clients map
    this.clients.set(clientId, {
      ws,
      clientId,
      ip: clientIp,
      authenticated: this.requireAuth ? true : false,
      tokenPayload,
      metadata: {},
      connectedAt: new Date(),
      lastHeartbeat: new Date()
    });

    if (authToken) {
      this.authTokens.set(clientId, authToken);
    }

    this.isAlive.set(clientId, true);

    // Setup message handler
    ws.on('message', (data) => {
      this._handleMessage(clientId, data);
    });

    // Setup ping handler for keepalive
    ws.on('pong', () => {
      this._handlePong(clientId);
    });

    // Setup close handler
    ws.on('close', () => {
      this._handleDisconnect(clientId);
    });

    // Setup error handler
    ws.on('error', (error) => {
      this.logger.error(`WebSocket error for client ${clientId}:`, error);
      this._handleClientError(clientId, error);
    });

    // Send welcome message
    this._sendToClient(clientId, {
      type: 'connection',
      action: 'welcome',
      clientId,
      timestamp: new Date().toISOString(),
      message: 'Connected to RoIP WebSocket Server'
    });

    this.emit('client:connected', { clientId, ip: clientIp });
  }

  /**
   * Handle incoming messages
   * @private
   */
  _handleMessage(clientId, data) {
    try {
      const client = this.clients.get(clientId);
      if (!client) {
        this.logger.warn(`Message from unknown client: ${clientId}`);
        return;
      }

      let message;
      try {
        message = JSON.parse(data.toString());
      } catch (error) {
        this.logger.error(`Invalid JSON from client ${clientId}:`, error);
        this._sendErrorToClient(clientId, 'INVALID_JSON', 'Message must be valid JSON');
        return;
      }

      const { type, action, payload = {}, token } = message;

      if (!type || !action) {
        this._sendErrorToClient(clientId, 'INVALID_MESSAGE', 'Missing type or action');
        return;
      }

      // Update last message timestamp
      client.lastHeartbeat = new Date();
      this.isAlive.set(clientId, true);

      // Route message to handler
      const eventType = `${type}.${action}`;
      const handler = this.messageHandlers.get(eventType);

      if (handler && typeof handler === 'function') {
        handler(client, payload);
      } else {
        this.logger.warn(`No handler for event type: ${eventType}`);
        this._sendErrorToClient(clientId, 'UNKNOWN_EVENT', `Unknown event type: ${eventType}`);
      }
    } catch (error) {
      this.logger.error(`Error handling message from ${clientId}:`, error);
      this._handleClientError(clientId, error);
    }
  }

  /**
   * Handle authentication request
   * @private
   */
  _handleAuthentication(client, data) {
    const { token } = data;

    if (!token) {
      this._sendErrorToClient(client.clientId, 'AUTH_FAILED', 'No token provided');
      return;
    }

    let isValid = false;

    // Use custom authenticator if provided
    if (this.authenticator && typeof this.authenticator === 'function') {
      try {
        isValid = this.authenticator(token);
      } catch (error) {
        this.logger.error(`Authentication error: ${error.message}`);
        isValid = false;
      }
    } else {
      // Default simple validation
      isValid = this._validateToken(token);
    }

    if (isValid) {
      client.authenticated = true;
      this.authTokens.set(client.clientId, token);

      this._sendToClient(client.clientId, {
        type: 'authenticate',
        action: 'success',
        authenticated: true,
        timestamp: new Date().toISOString(),
        message: 'Authentication successful'
      });

      this.logger.info(`Client authenticated: ${client.clientId}`);
      this.emit('client:authenticated', { clientId: client.clientId });
    } else {
      this._sendErrorToClient(client.clientId, 'AUTH_FAILED', 'Invalid token');
      this.logger.warn(`Authentication failed for client: ${client.clientId}`);
    }
  }

  /**
   * Handle device registration event
   * @private
   */
  _handleDeviceRegistered(client, data) {
    const { deviceId, deviceName, deviceType } = data;

    if (!deviceId) {
      this._sendErrorToClient(client.clientId, 'INVALID_DATA', 'deviceId is required');
      return;
    }

    client.metadata.deviceId = deviceId;
    client.metadata.deviceName = deviceName;
    client.metadata.deviceType = deviceType;

    this._sendToClient(client.clientId, {
      type: 'device',
      action: 'registered',
      deviceId,
      timestamp: new Date().toISOString(),
      message: `Device ${deviceId} registered successfully`
    });

    // Broadcast to all authenticated clients
    this._broadcastToAuthenticated({
      type: 'device',
      action: 'registered',
      clientId: client.clientId,
      deviceId,
      deviceName,
      deviceType,
      timestamp: new Date().toISOString()
    });

    this.logger.info(`Device registered: ${deviceId} by client ${client.clientId}`);
    this.emit('device:registered', { clientId: client.clientId, deviceId, deviceName, deviceType });
  }

  /**
   * Handle call started event
   * @private
   */
  _handleCallStarted(client, data) {
    const { callId, sourceDeviceId, destinationDeviceId, callType } = data;

    if (!callId || !sourceDeviceId || !destinationDeviceId) {
      this._sendErrorToClient(client.clientId, 'INVALID_DATA', 'callId, sourceDeviceId, and destinationDeviceId are required');
      return;
    }

    this._sendToClient(client.clientId, {
      type: 'call',
      action: 'started',
      callId,
      timestamp: new Date().toISOString(),
      message: `Call ${callId} started successfully`
    });

    // Broadcast to all authenticated clients
    this._broadcastToAuthenticated({
      type: 'call',
      action: 'started',
      clientId: client.clientId,
      callId,
      sourceDeviceId,
      destinationDeviceId,
      callType: callType || 'standard',
      timestamp: new Date().toISOString()
    });

    this.logger.info(`Call started: ${callId} from ${sourceDeviceId} to ${destinationDeviceId}`);
    this.emit('call:started', { clientId: client.clientId, callId, sourceDeviceId, destinationDeviceId });
  }

  /**
   * Handle call ended event
   * @private
   */
  _handleCallEnded(client, data) {
    const { callId, duration, reason } = data;

    if (!callId) {
      this._sendErrorToClient(client.clientId, 'INVALID_DATA', 'callId is required');
      return;
    }

    this._sendToClient(client.clientId, {
      type: 'call',
      action: 'ended',
      callId,
      timestamp: new Date().toISOString(),
      message: `Call ${callId} ended successfully`
    });

    // Broadcast to all authenticated clients
    this._broadcastToAuthenticated({
      type: 'call',
      action: 'ended',
      clientId: client.clientId,
      callId,
      duration: duration || 0,
      reason: reason || 'completed',
      timestamp: new Date().toISOString()
    });

    this.logger.info(`Call ended: ${callId} after ${duration || 0}s`);
    this.emit('call:ended', { clientId: client.clientId, callId, duration });
  }

  /**
   * Handle audio level event
   * @private
   */
  _handleAudioLevel(client, data) {
    const { deviceId, level, frequency } = data;

    if (deviceId === undefined || level === undefined) {
      this._sendErrorToClient(client.clientId, 'INVALID_DATA', 'deviceId and level are required');
      return;
    }

    // Validate level range
    if (level < 0 || level > 100) {
      this._sendErrorToClient(client.clientId, 'INVALID_DATA', 'level must be between 0 and 100');
      return;
    }

    // Broadcast to all authenticated clients
    this._broadcastToAuthenticated({
      type: 'audio',
      action: 'level',
      clientId: client.clientId,
      deviceId,
      level,
      frequency: frequency || 'periodic',
      timestamp: new Date().toISOString()
    });

    this.emit('audio:level', { clientId: client.clientId, deviceId, level });
  }

  /**
   * Handle ping request
   * @private
   */
  _handlePing(client, data) {
    this._sendToClient(client.clientId, {
      type: 'ping',
      action: 'pong',
      timestamp: new Date().toISOString(),
      clientId: client.clientId
    });
  }

  /**
   * Handle pong response
   * @private
   */
  _handlePong(clientId) {
    const client = this.clients.get(clientId);
    if (client) {
      client.lastHeartbeat = new Date();
      this.isAlive.set(clientId, true);
      this.logger.debug(`Pong received from client: ${clientId}`);
    }
  }

  /**
   * Handle client disconnect
   * @private
   */
  _handleDisconnect(clientId) {
    const client = this.clients.get(clientId);

    if (client) {
      this.logger.info(`Client disconnected: ${clientId}`);

      // Cleanup
      this.clients.delete(clientId);
      this.isAlive.delete(clientId);
      this.authTokens.delete(clientId);

      // Remove from rooms
      for (const [roomId, clientIds] of this.rooms.entries()) {
        clientIds.delete(clientId);
        if (clientIds.size === 0) {
          this.rooms.delete(roomId);
        }
      }

      this.emit('client:disconnected', { clientId, metadata: client.metadata });
    }
  }

  /**
   * Handle client error
   * @private
   */
  _handleClientError(clientId, error) {
    this.logger.error(`Error for client ${clientId}:`, error);
    this.emit('client:error', { clientId, error });
  }

  /**
   * Start heartbeat/keepalive mechanism
   * @private
   */
  _startHeartbeat() {
    this._heartbeatTimer = setInterval(() => {
      const now = Date.now();

      for (const [clientId, client] of this.clients.entries()) {
        if (!this.isAlive.get(clientId)) {
          // Client failed to pong, close connection
          this.logger.warn(`Client ${clientId} failed heartbeat check, closing connection`);
          client.ws.terminate();
          continue;
        }

        // Mark as not alive until we receive a pong
        this.isAlive.set(clientId, false);

        // Send ping
        const pingMessage = JSON.stringify({
          type: 'ping',
          action: 'ping',
          timestamp: new Date().toISOString()
        });

        try {
          client.ws.ping(pingMessage, (error) => {
            if (error) {
              this.logger.error(`Ping error for client ${clientId}:`, error);
            }
          });
        } catch (error) {
          this.logger.error(`Failed to send ping to client ${clientId}:`, error);
        }
      }
    }, this.heartbeatInterval);
  }

  /**
   * Send message to a specific client
   * @param {string} clientId - Target client ID
   * @param {object} message - Message to send
   */
  _sendToClient(clientId, message) {
    const client = this.clients.get(clientId);

    if (!client) {
      this.logger.warn(`Client not found: ${clientId}`);
      return false;
    }

    try {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(message), (error) => {
          if (error) {
            this.logger.error(`Failed to send message to ${clientId}:`, error);
          }
        });
        return true;
      } else {
        this.logger.warn(`Client ${clientId} is not in OPEN state`);
        return false;
      }
    } catch (error) {
      this.logger.error(`Error sending to client ${clientId}:`, error);
      return false;
    }
  }

  /**
   * Send error message to client
   * @private
   */
  _sendErrorToClient(clientId, errorCode, errorMessage) {
    this._sendToClient(clientId, {
      type: 'error',
      errorCode,
      message: errorMessage,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Broadcast message to all connected clients
   * @param {object} message - Message to broadcast
   * @param {string} excludeClientId - Optional client ID to exclude
   */
  broadcastToAll(message, excludeClientId = null) {
    for (const [clientId, client] of this.clients.entries()) {
      if (excludeClientId && clientId === excludeClientId) {
        continue;
      }

      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(message), (error) => {
          if (error) {
            this.logger.error(`Broadcast error to ${clientId}:`, error);
          }
        });
      }
    }
  }

  /**
   * Broadcast message to authenticated clients only
   * @param {object} message - Message to broadcast
   * @param {string} excludeClientId - Optional client ID to exclude
   */
  _broadcastToAuthenticated(message, excludeClientId = null) {
    for (const [clientId, client] of this.clients.entries()) {
      if (excludeClientId && clientId === excludeClientId) {
        continue;
      }

      if (client.authenticated && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(message), (error) => {
          if (error) {
            this.logger.error(`Broadcast error to ${clientId}:`, error);
          }
        });
      }
    }
  }

  /**
   * Broadcast to all clients in a specific room
   * @param {string} roomId - Room identifier
   * @param {object} message - Message to broadcast
   * @param {string} excludeClientId - Optional client ID to exclude
   */
  broadcastToRoom(roomId, message, excludeClientId = null) {
    const clientIds = this.rooms.get(roomId);

    if (!clientIds) {
      this.logger.warn(`Room not found: ${roomId}`);
      return;
    }

    for (const clientId of clientIds) {
      if (excludeClientId && clientId === excludeClientId) {
        continue;
      }

      this._sendToClient(clientId, message);
    }
  }

  /**
   * Join a room
   * @param {string} clientId - Client ID
   * @param {string} roomId - Room ID
   */
  joinRoom(clientId, roomId) {
    if (!this.clients.has(clientId)) {
      this.logger.warn(`Client not found: ${clientId}`);
      return false;
    }

    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }

    this.rooms.get(roomId).add(clientId);
    this.logger.info(`Client ${clientId} joined room ${roomId}`);
    return true;
  }

  /**
   * Leave a room
   * @param {string} clientId - Client ID
   * @param {string} roomId - Room ID
   */
  leaveRoom(clientId, roomId) {
    const clientIds = this.rooms.get(roomId);

    if (!clientIds) {
      return false;
    }

    clientIds.delete(clientId);
    if (clientIds.size === 0) {
      this.rooms.delete(roomId);
    }

    this.logger.info(`Client ${clientId} left room ${roomId}`);
    return true;
  }

  /**
   * Get all connected clients
   * @returns {Array} Array of client metadata
   */
  getConnectedClients() {
    const clients = [];
    for (const [clientId, client] of this.clients.entries()) {
      clients.push({
        clientId,
        ip: client.ip,
        authenticated: client.authenticated,
        connectedAt: client.connectedAt,
        deviceId: client.metadata.deviceId,
        deviceName: client.metadata.deviceName,
        deviceType: client.metadata.deviceType
      });
    }
    return clients;
  }

  /**
   * Get client count
   * @returns {number} Number of connected clients
   */
  getClientCount() {
    return this.clients.size;
  }

  /**
   * Get authenticated client count
   * @returns {number} Number of authenticated clients
   */
  getAuthenticatedClientCount() {
    let count = 0;
    for (const [, client] of this.clients.entries()) {
      if (client.authenticated) {
        count++;
      }
    }
    return count;
  }

  /**
   * Generate unique client ID
   * @private
   */
  _generateClientId() {
    return `client_${crypto.randomBytes(8).toString('hex')}_${Date.now()}`;
  }

  /**
   * Validate token (default implementation)
   * @private
   */
  _validateToken(token) {
    // Simple validation - token must be non-empty string
    // In production, implement proper JWT validation
    return typeof token === 'string' && token.length > 0;
  }
}

module.exports = WebSocketServer;
