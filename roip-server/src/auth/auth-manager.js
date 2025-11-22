import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { EventEmitter } from 'events';

/**
 * AuthManager - Comprehensive authentication manager for RoIP server
 * Handles JWT tokens, SIP digest authentication, user credentials, and session management
 */
class AuthManager extends EventEmitter {
  constructor(config = {}) {
    super();

    // Configuration
    this.jwtSecret = config.jwtSecret || process.env.JWT_SECRET || 'change-me-in-production';
    this.jwtExpiry = config.jwtExpiry || '24h';
    this.jwtRefreshExpiry = config.jwtRefreshExpiry || '7d';
    this.bcryptRounds = config.bcryptRounds || 10;
    this.sessionTimeout = config.sessionTimeout || 3600000; // 1 hour in milliseconds
    this.maxRefreshTokenAge = config.maxRefreshTokenAge || 604800000; // 7 days

    // Storage maps (in-memory, can be replaced with DB)
    this.users = new Map(); // userId -> { username, passwordHash, roles, metadata }
    this.sessions = new Map(); // sessionId -> { userId, token, refreshToken, expiresAt, createdAt, lastActivity }
    this.tokenBlacklist = new Map(); // token -> { revokedAt, reason }
    this.sipCredentials = new Map(); // username -> { password, realm, qop, algorithm }

    // Start cleanup interval for expired sessions
    this.startSessionCleanup();
  }

  /**
   * Session cleanup interval - removes expired sessions
   */
  startSessionCleanup() {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      let cleanedCount = 0;

      for (const [sessionId, session] of this.sessions.entries()) {
        if (session.expiresAt < now) {
          this.sessions.delete(sessionId);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        this.emit('sessions:cleanup', { cleanedCount });
      }
    }, 60000); // Run every minute
  }

  /**
   * Stop the cleanup interval
   */
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  // ========== USER CREDENTIAL MANAGEMENT ==========

  /**
   * Register a new user with password hashing
   * @param {string} username - User's username
   * @param {string} password - User's password (will be hashed)
   * @param {array} roles - User roles (e.g., ['user', 'admin'])
   * @param {object} metadata - Additional user metadata
   * @returns {Promise<object>} User object with userId
   */
  async registerUser(username, password, roles = ['user'], metadata = {}) {
    try {
      // Validate inputs
      if (!username || typeof username !== 'string' || username.length < 3) {
        throw new Error('Username must be at least 3 characters long');
      }
      if (!password || typeof password !== 'string' || password.length < 8) {
        throw new Error('Password must be at least 8 characters long');
      }

      // Check if user already exists
      const existingUser = Array.from(this.users.values()).find(u => u.username === username);
      if (existingUser) {
        throw new Error('User already exists');
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, this.bcryptRounds);

      // Generate user ID
      const userId = crypto.randomUUID();

      // Store user
      const user = {
        userId,
        username,
        passwordHash,
        roles,
        metadata,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      this.users.set(userId, user);

      // Emit event
      this.emit('user:registered', { userId, username });

      // Return user without password hash
      const { passwordHash: _, ...userWithoutHash } = user;
      return userWithoutHash;
    } catch (error) {
      this.emit('error', { action: 'registerUser', error: error.message });
      throw error;
    }
  }

  /**
   * Verify user credentials
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Promise<object|null>} User object if valid, null otherwise
   */
  async verifyCredentials(username, password) {
    try {
      const user = Array.from(this.users.values()).find(u => u.username === username);
      if (!user) {
        return null;
      }

      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        this.emit('auth:failed', { username, reason: 'invalid_password' });
        return null;
      }

      // Return user without password hash
      const { passwordHash: _, ...userWithoutHash } = user;
      return userWithoutHash;
    } catch (error) {
      this.emit('error', { action: 'verifyCredentials', error: error.message });
      return null;
    }
  }

  /**
   * Get user by ID
   * @param {string} userId - User ID
   * @returns {object|null} User object or null
   */
  getUser(userId) {
    const user = this.users.get(userId);
    if (!user) return null;

    const { passwordHash: _, ...userWithoutHash } = user;
    return userWithoutHash;
  }

  /**
   * Update user details
   * @param {string} userId - User ID
   * @param {object} updates - Fields to update (username, roles, metadata)
   * @returns {Promise<object>} Updated user object
   */
  async updateUser(userId, updates = {}) {
    try {
      const user = this.users.get(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Update fields
      if (updates.roles && Array.isArray(updates.roles)) {
        user.roles = updates.roles;
      }
      if (updates.metadata && typeof updates.metadata === 'object') {
        user.metadata = { ...user.metadata, ...updates.metadata };
      }

      user.updatedAt = new Date();
      this.users.set(userId, user);

      this.emit('user:updated', { userId });

      const { passwordHash: _, ...userWithoutHash } = user;
      return userWithoutHash;
    } catch (error) {
      this.emit('error', { action: 'updateUser', error: error.message });
      throw error;
    }
  }

  /**
   * Change user password
   * @param {string} userId - User ID
   * @param {string} oldPassword - Current password
   * @param {string} newPassword - New password
   * @returns {Promise<boolean>} Success status
   */
  async changePassword(userId, oldPassword, newPassword) {
    try {
      const user = this.users.get(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Verify old password
      const isValid = await bcrypt.compare(oldPassword, user.passwordHash);
      if (!isValid) {
        throw new Error('Invalid current password');
      }

      // Validate new password
      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
        throw new Error('New password must be at least 8 characters long');
      }

      // Hash and update
      user.passwordHash = await bcrypt.hash(newPassword, this.bcryptRounds);
      user.updatedAt = new Date();
      this.users.set(userId, user);

      // Invalidate all sessions for this user
      this.invalidateUserSessions(userId);

      this.emit('user:password_changed', { userId });
      return true;
    } catch (error) {
      this.emit('error', { action: 'changePassword', error: error.message });
      throw error;
    }
  }

  /**
   * Delete a user
   * @param {string} userId - User ID
   * @returns {boolean} Success status
   */
  deleteUser(userId) {
    try {
      if (!this.users.has(userId)) {
        throw new Error('User not found');
      }

      // Invalidate all sessions
      this.invalidateUserSessions(userId);

      // Delete user
      this.users.delete(userId);

      this.emit('user:deleted', { userId });
      return true;
    } catch (error) {
      this.emit('error', { action: 'deleteUser', error: error.message });
      throw error;
    }
  }

  // ========== JWT TOKEN MANAGEMENT ==========

  /**
   * Generate JWT access token
   * @param {string} userId - User ID
   * @param {object} payload - Additional payload data
   * @returns {string} JWT token
   */
  generateAccessToken(userId, payload = {}) {
    try {
      const user = this.users.get(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const tokenPayload = {
        sub: userId,
        username: user.username,
        roles: user.roles,
        type: 'access',
        iat: Math.floor(Date.now() / 1000),
        ...payload
      };

      const token = jwt.sign(tokenPayload, this.jwtSecret, {
        expiresIn: this.jwtExpiry,
        algorithm: 'HS256'
      });

      this.emit('token:generated', { userId, type: 'access' });
      return token;
    } catch (error) {
      this.emit('error', { action: 'generateAccessToken', error: error.message });
      throw error;
    }
  }

  /**
   * Generate JWT refresh token
   * @param {string} userId - User ID
   * @returns {string} Refresh token
   */
  generateRefreshToken(userId) {
    try {
      const user = this.users.get(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const tokenPayload = {
        sub: userId,
        type: 'refresh',
        iat: Math.floor(Date.now() / 1000)
      };

      const token = jwt.sign(tokenPayload, this.jwtSecret, {
        expiresIn: this.jwtRefreshExpiry,
        algorithm: 'HS256'
      });

      this.emit('token:generated', { userId, type: 'refresh' });
      return token;
    } catch (error) {
      this.emit('error', { action: 'generateRefreshToken', error: error.message });
      throw error;
    }
  }

  /**
   * Validate JWT token
   * @param {string} token - JWT token
   * @returns {object|null} Token payload if valid, null otherwise
   */
  validateToken(token) {
    try {
      // Check if token is blacklisted
      if (this.tokenBlacklist.has(token)) {
        this.emit('token:rejected', { reason: 'blacklisted' });
        return null;
      }

      const payload = jwt.verify(token, this.jwtSecret, {
        algorithms: ['HS256']
      });

      return payload;
    } catch (error) {
      this.emit('token:rejected', { reason: error.message });
      return null;
    }
  }

  /**
   * Refresh access token using refresh token
   * @param {string} refreshToken - Refresh token
   * @returns {object|null} { accessToken, refreshToken } or null if invalid
   */
  refreshAccessToken(refreshToken) {
    try {
      const payload = this.validateToken(refreshToken);
      if (!payload || payload.type !== 'refresh') {
        throw new Error('Invalid refresh token');
      }

      const userId = payload.sub;
      if (!this.users.has(userId)) {
        throw new Error('User not found');
      }

      // Generate new access token
      const newAccessToken = this.generateAccessToken(userId);
      const newRefreshToken = this.generateRefreshToken(userId);

      this.emit('token:refreshed', { userId });

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken
      };
    } catch (error) {
      this.emit('error', { action: 'refreshAccessToken', error: error.message });
      return null;
    }
  }

  /**
   * Revoke a token (add to blacklist)
   * @param {string} token - Token to revoke
   * @param {string} reason - Reason for revocation
   * @returns {boolean} Success status
   */
  revokeToken(token, reason = 'user_logout') {
    try {
      const payload = this.validateToken(token);
      if (!payload) {
        return false;
      }

      this.tokenBlacklist.set(token, {
        revokedAt: new Date(),
        reason,
        userId: payload.sub
      });

      this.emit('token:revoked', { userId: payload.sub, reason });
      return true;
    } catch (error) {
      this.emit('error', { action: 'revokeToken', error: error.message });
      return false;
    }
  }

  // ========== SESSION MANAGEMENT ==========

  /**
   * Create a new session
   * @param {string} userId - User ID
   * @param {object} metadata - Session metadata
   * @returns {object} { sessionId, accessToken, refreshToken }
   */
  createSession(userId, metadata = {}) {
    try {
      if (!this.users.has(userId)) {
        throw new Error('User not found');
      }

      const sessionId = crypto.randomUUID();
      const accessToken = this.generateAccessToken(userId);
      const refreshToken = this.generateRefreshToken(userId);

      const session = {
        sessionId,
        userId,
        token: accessToken,
        refreshToken,
        expiresAt: Date.now() + this.sessionTimeout,
        createdAt: new Date(),
        lastActivity: new Date(),
        metadata
      };

      this.sessions.set(sessionId, session);

      this.emit('session:created', { sessionId, userId });

      return {
        sessionId,
        accessToken,
        refreshToken,
        expiresIn: this.sessionTimeout
      };
    } catch (error) {
      this.emit('error', { action: 'createSession', error: error.message });
      throw error;
    }
  }

  /**
   * Get session by ID
   * @param {string} sessionId - Session ID
   * @returns {object|null} Session object or null
   */
  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    // Check if expired
    if (session.expiresAt < Date.now()) {
      this.sessions.delete(sessionId);
      return null;
    }

    return session;
  }

  /**
   * Update session activity
   * @param {string} sessionId - Session ID
   * @returns {boolean} Success status
   */
  updateSessionActivity(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Check if expired
    if (session.expiresAt < Date.now()) {
      this.sessions.delete(sessionId);
      return false;
    }

    session.lastActivity = new Date();
    session.expiresAt = Date.now() + this.sessionTimeout; // Extend timeout
    return true;
  }

  /**
   * Invalidate a session
   * @param {string} sessionId - Session ID
   * @returns {boolean} Success status
   */
  invalidateSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Revoke the token
    this.revokeToken(session.token, 'session_invalidated');

    // Delete session
    this.sessions.delete(sessionId);

    this.emit('session:invalidated', { sessionId, userId: session.userId });
    return true;
  }

  /**
   * Invalidate all sessions for a user
   * @param {string} userId - User ID
   * @returns {number} Number of sessions invalidated
   */
  invalidateUserSessions(userId) {
    let count = 0;
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.userId === userId) {
        this.revokeToken(session.token, 'user_sessions_invalidated');
        this.sessions.delete(sessionId);
        count++;
      }
    }

    this.emit('session:user_invalidated', { userId, count });
    return count;
  }

  /**
   * Get all sessions for a user
   * @param {string} userId - User ID
   * @returns {array} Array of sessions
   */
  getUserSessions(userId) {
    const userSessions = [];
    const now = Date.now();

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.userId === userId && session.expiresAt > now) {
        userSessions.push({
          sessionId,
          createdAt: session.createdAt,
          lastActivity: session.lastActivity,
          expiresAt: new Date(session.expiresAt)
        });
      }
    }

    return userSessions;
  }

  // ========== SIP DIGEST AUTHENTICATION ==========

  /**
   * Set SIP credentials for a user
   * @param {string} username - Username
   * @param {string} password - Password
   * @param {string} realm - SIP realm
   * @param {string} algorithm - Hash algorithm (MD5 or SHA-256)
   * @returns {object} SIP credentials
   */
  setSIPCredentials(username, password, realm = 'roip.local', algorithm = 'MD5') {
    try {
      if (!username || !password) {
        throw new Error('Username and password required');
      }

      const credentials = {
        username,
        password,
        realm,
        algorithm: algorithm.toUpperCase(),
        qop: 'auth,auth-int',
        createdAt: new Date()
      };

      this.sipCredentials.set(username, credentials);

      this.emit('sip:credentials_set', { username, realm });
      return credentials;
    } catch (error) {
      this.emit('error', { action: 'setSIPCredentials', error: error.message });
      throw error;
    }
  }

  /**
   * Calculate SIP digest response (MD5-based)
   * @param {string} username - Username
   * @param {string} password - Password
   * @param {string} realm - SIP realm
   * @param {string} method - SIP method (REGISTER, INVITE, etc.)
   * @param {string} uri - Request URI
   * @param {string} nonce - Server nonce
   * @param {string} nc - Nonce count
   * @param {string} cnonce - Client nonce
   * @param {string} qop - Quality of protection (auth or auth-int)
   * @returns {string} Digest response
   */
  calculateSIPDigest(username, password, realm, method, uri, nonce, nc, cnonce, qop = 'auth') {
    try {
      // Calculate HA1
      const ha1Input = `${username}:${realm}:${password}`;
      const ha1 = crypto.createHash('md5').update(ha1Input).digest('hex');

      // Calculate HA2
      const ha2Input = `${method}:${uri}`;
      const ha2 = crypto.createHash('md5').update(ha2Input).digest('hex');

      // Calculate response
      let responseInput;
      if (qop && (qop === 'auth' || qop === 'auth-int')) {
        responseInput = `${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`;
      } else {
        responseInput = `${ha1}:${nonce}:${ha2}`;
      }

      const response = crypto.createHash('md5').update(responseInput).digest('hex');

      return response;
    } catch (error) {
      this.emit('error', { action: 'calculateSIPDigest', error: error.message });
      throw error;
    }
  }

  /**
   * Verify SIP digest authentication
   * @param {string} username - Username
   * @param {string} password - Password
   * @param {string} realm - SIP realm
   * @param {string} method - SIP method
   * @param {string} uri - Request URI
   * @param {string} nonce - Server nonce
   * @param {string} nc - Nonce count
   * @param {string} cnonce - Client nonce
   * @param {string} qop - Quality of protection
   * @param {string} clientResponse - Client's digest response
   * @returns {boolean} Authentication result
   */
  verifySIPDigest(username, password, realm, method, uri, nonce, nc, cnonce, qop, clientResponse) {
    try {
      const serverResponse = this.calculateSIPDigest(
        username, password, realm, method, uri, nonce, nc, cnonce, qop
      );

      const isValid = serverResponse === clientResponse;

      if (!isValid) {
        this.emit('auth:failed', { username, realm, reason: 'invalid_digest' });
      } else {
        this.emit('auth:sip_success', { username, realm });
      }

      return isValid;
    } catch (error) {
      this.emit('error', { action: 'verifySIPDigest', error: error.message });
      return false;
    }
  }

  /**
   * Generate SIP nonce for challenge
   * @returns {string} Nonce value
   */
  generateSIPNonce() {
    const nonce = crypto.randomBytes(16).toString('hex');
    return nonce;
  }

  /**
   * Get SIP credentials for a user
   * @param {string} username - Username
   * @returns {object|null} SIP credentials or null
   */
  getSIPCredentials(username) {
    return this.sipCredentials.get(username) || null;
  }

  // ========== AUTHORIZATION CHECKS ==========

  /**
   * Check if user has required role
   * @param {string} userId - User ID
   * @param {string|array} requiredRoles - Required role(s)
   * @returns {boolean} Authorization result
   */
  hasRole(userId, requiredRoles) {
    const user = this.users.get(userId);
    if (!user) return false;

    const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
    return roles.some(role => user.roles.includes(role));
  }

  /**
   * Check if user can perform an action
   * @param {string} userId - User ID
   * @param {string} action - Action to check
   * @param {array} allowedRoles - Roles allowed to perform action
   * @returns {boolean} Authorization result
   */
  canPerform(userId, action, allowedRoles = ['admin']) {
    const user = this.users.get(userId);
    if (!user) {
      this.emit('auth:denied', { userId, action, reason: 'user_not_found' });
      return false;
    }

    const isAuthorized = this.hasRole(userId, allowedRoles);

    if (!isAuthorized) {
      this.emit('auth:denied', { userId, action, reason: 'insufficient_permissions' });
    } else {
      this.emit('auth:granted', { userId, action });
    }

    return isAuthorized;
  }

  /**
   * Authorize request based on token
   * @param {string} token - JWT token
   * @param {string} action - Required action
   * @param {array} allowedRoles - Allowed roles
   * @returns {object|null} { userId, user } if authorized, null otherwise
   */
  authorizeRequest(token, action, allowedRoles = ['user']) {
    const payload = this.validateToken(token);
    if (!payload) {
      return null;
    }

    const userId = payload.sub;
    if (!this.canPerform(userId, action, allowedRoles)) {
      return null;
    }

    return {
      userId,
      user: this.getUser(userId),
      roles: payload.roles
    };
  }

  /**
   * Create authorization middleware
   * @param {array} allowedRoles - Allowed roles
   * @returns {function} Express middleware
   */
  middleware(allowedRoles = ['user']) {
    return (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing authorization token' });
      }

      const token = authHeader.slice(7);
      const auth = this.authorizeRequest(token, 'api_access', allowedRoles);

      if (!auth) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      req.userId = auth.userId;
      req.user = auth.user;
      req.roles = auth.roles;

      next();
    };
  }

  // ========== UTILITY METHODS ==========

  /**
   * Get authentication statistics
   * @returns {object} Statistics object
   */
  getStats() {
    const now = Date.now();
    const activeSessions = Array.from(this.sessions.values()).filter(s => s.expiresAt > now).length;

    return {
      totalUsers: this.users.size,
      totalSessions: this.sessions.size,
      activeSessions,
      blacklistedTokens: this.tokenBlacklist.size,
      sipCredentials: this.sipCredentials.size
    };
  }

  /**
   * Clear all data (useful for testing)
   */
  clear() {
    this.users.clear();
    this.sessions.clear();
    this.tokenBlacklist.clear();
    this.sipCredentials.clear();
    this.emit('auth:cleared');
  }
}

export default AuthManager;
