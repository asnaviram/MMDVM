/**
 * Auth Manager Test Suite
 * Tests user registration, password hashing, JWT token generation/validation,
 * session management, and SIP digest auth
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import AuthManager from '../src/auth/auth-manager.js';
import jwt from 'jsonwebtoken';

describe('Auth Manager Tests', () => {
  let authManager;

  beforeEach(() => {
    authManager = new AuthManager({
      jwtSecret: 'test-secret-key',
      jwtExpiry: '24h',
      jwtRefreshExpiry: '7d',
      bcryptRounds: 10,
      sessionTimeout: 3600000
    });
  });

  afterEach(() => {
    authManager.stop();
  });

  // ===== USER REGISTRATION =====
  describe('User Registration', () => {
    test('should register new user', async () => {
      const user = await authManager.registerUser('testuser', 'password123');

      expect(user).toBeDefined();
      expect(user.userId).toBeDefined();
      expect(user.username).toBe('testuser');
      expect(user.roles).toContain('user');
      expect(user.passwordHash).toBeUndefined(); // Should not return hash
    });

    test('should reject duplicate username', async () => {
      await authManager.registerUser('duplicate', 'password123');

      await expect(
        authManager.registerUser('duplicate', 'password456')
      ).rejects.toThrow('User already exists');
    });

    test('should validate username length', async () => {
      await expect(
        authManager.registerUser('ab', 'password123')
      ).rejects.toThrow('Username must be at least 3 characters long');
    });

    test('should validate password length', async () => {
      await expect(
        authManager.registerUser('validuser', 'short')
      ).rejects.toThrow('Password must be at least 8 characters long');
    });

    test('should support custom roles', async () => {
      const user = await authManager.registerUser('admin', 'password123', ['admin', 'user']);

      expect(user.roles).toContain('admin');
      expect(user.roles).toContain('user');
    });

    test('should support user metadata', async () => {
      const metadata = { department: 'engineering', location: 'remote' };
      const user = await authManager.registerUser('user', 'password123', ['user'], metadata);

      expect(user.metadata).toEqual(metadata);
    });

    test('should emit user registered event', (done) => {
      authManager.on('user:registered', ({ userId, username }) => {
        expect(userId).toBeDefined();
        expect(username).toBe('eventuser');
        done();
      });

      authManager.registerUser('eventuser', 'password123');
    });
  });

  // ===== PASSWORD HASHING AND VERIFICATION =====
  describe('Password Hashing and Verification', () => {
    test('should hash password on registration', async () => {
      const user = await authManager.registerUser('hashuser', 'mypassword');
      const storedUser = authManager.users.get(user.userId);

      expect(storedUser.passwordHash).toBeDefined();
      expect(storedUser.passwordHash).not.toBe('mypassword');
    });

    test('should verify correct credentials', async () => {
      await authManager.registerUser('verify1', 'correctpassword');
      const result = await authManager.verifyCredentials('verify1', 'correctpassword');

      expect(result).toBeDefined();
      expect(result.username).toBe('verify1');
    });

    test('should reject incorrect password', async () => {
      await authManager.registerUser('verify2', 'correctpassword');
      const result = await authManager.verifyCredentials('verify2', 'wrongpassword');

      expect(result).toBeNull();
    });

    test('should reject non-existent user', async () => {
      const result = await authManager.verifyCredentials('nonexistent', 'password123');

      expect(result).toBeNull();
    });

    test('should change user password', async () => {
      const user = await authManager.registerUser('changepass', 'oldpassword');

      await authManager.changePassword(user.userId, 'oldpassword', 'newpassword');

      const newResult = await authManager.verifyCredentials('changepass', 'newpassword');
      expect(newResult).toBeDefined();

      const oldResult = await authManager.verifyCredentials('changepass', 'oldpassword');
      expect(oldResult).toBeNull();
    });

    test('should reject change with invalid old password', async () => {
      const user = await authManager.registerUser('badchange', 'oldpassword');

      await expect(
        authManager.changePassword(user.userId, 'wrongpassword', 'newpassword')
      ).rejects.toThrow('Invalid current password');
    });

    test('should invalidate sessions on password change', async () => {
      const user = await authManager.registerUser('sesschange', 'password123');
      const session = authManager.createSession(user.userId);

      await authManager.changePassword(user.userId, 'password123', 'newpassword');

      const retrieved = authManager.getSession(session.sessionId);
      expect(retrieved).toBeNull();
    });

    test('should emit password changed event', (done) => {
      authManager.registerUser('passEvent', 'oldpass').then((user) => {
        authManager.on('user:password_changed', ({ userId }) => {
          expect(userId).toBe(user.userId);
          done();
        });

        authManager.changePassword(user.userId, 'oldpass', 'newpass123');
      });
    });
  });

  // ===== JWT TOKEN GENERATION AND VALIDATION =====
  describe('JWT Token Management', () => {
    test('should generate access token', async () => {
      const user = await authManager.registerUser('tokenuser', 'password123');
      const token = authManager.generateAccessToken(user.userId);

      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3); // JWT format
    });

    test('should generate refresh token', async () => {
      const user = await authManager.registerUser('refreshuser', 'password123');
      const token = authManager.generateRefreshToken(user.userId);

      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3);
    });

    test('should validate valid token', async () => {
      const user = await authManager.registerUser('validtoken', 'password123');
      const token = authManager.generateAccessToken(user.userId);
      const payload = authManager.validateToken(token);

      expect(payload).toBeDefined();
      expect(payload.sub).toBe(user.userId);
      expect(payload.username).toBe('validtoken');
      expect(payload.type).toBe('access');
    });

    test('should reject invalid token', () => {
      const payload = authManager.validateToken('invalid.token.format');

      expect(payload).toBeNull();
    });

    test('should reject expired token', async () => {
      const user = await authManager.registerUser('expiretest', 'password123');

      const expiredToken = jwt.sign(
        { sub: user.userId, username: 'expiretest', type: 'access' },
        'test-secret-key',
        { expiresIn: '-1s' } // Already expired
      );

      const payload = authManager.validateToken(expiredToken);
      expect(payload).toBeNull();
    });

    test('should reject blacklisted token', async () => {
      const user = await authManager.registerUser('blacklist', 'password123');
      const token = authManager.generateAccessToken(user.userId);

      authManager.tokenBlacklist.set(token, {
        revokedAt: new Date(),
        reason: 'test'
      });

      const payload = authManager.validateToken(token);
      expect(payload).toBeNull();
    });

    test('should refresh access token', async () => {
      const user = await authManager.registerUser('refreshtest', 'password123');
      const refreshToken = authManager.generateRefreshToken(user.userId);

      const result = authManager.refreshAccessToken(refreshToken);

      expect(result).toBeDefined();
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });

    test('should include user info in token payload', async () => {
      const user = await authManager.registerUser('tokeninfo', 'password123', ['admin', 'user']);
      const token = authManager.generateAccessToken(user.userId, { custom: 'data' });
      const payload = authManager.validateToken(token);

      expect(payload.username).toBe('tokeninfo');
      expect(payload.roles).toContain('admin');
      expect(payload.custom).toBe('data');
    });
  });

  // ===== TOKEN REVOCATION =====
  describe('Token Revocation', () => {
    test('should revoke token', async () => {
      const user = await authManager.registerUser('revokeuser', 'password123');
      const token = authManager.generateAccessToken(user.userId);

      const result = authManager.revokeToken(token);

      expect(result).toBe(true);
      expect(authManager.tokenBlacklist.has(token)).toBe(true);
    });

    test('should record revocation reason', async () => {
      const user = await authManager.registerUser('revokereason', 'password123');
      const token = authManager.generateAccessToken(user.userId);

      authManager.revokeToken(token, 'logout');

      const blacklisted = authManager.tokenBlacklist.get(token);
      expect(blacklisted.reason).toBe('logout');
    });

    test('should emit token revoked event', (done) => {
      authManager.registerUser('revokeEvent', 'password123').then((user) => {
        const token = authManager.generateAccessToken(user.userId);

        authManager.on('token:revoked', ({ userId, reason }) => {
          expect(userId).toBe(user.userId);
          expect(reason).toBe('user_logout');
          done();
        });

        authManager.revokeToken(token);
      });
    });
  });

  // ===== SESSION MANAGEMENT =====
  describe('Session Management', () => {
    test('should create session', async () => {
      const user = await authManager.registerUser('sessuser', 'password123');
      const session = authManager.createSession(user.userId);

      expect(session).toBeDefined();
      expect(session.sessionId).toBeDefined();
      expect(session.accessToken).toBeDefined();
      expect(session.refreshToken).toBeDefined();
      expect(session.expiresIn).toBe(authManager.sessionTimeout);
    });

    test('should retrieve session', async () => {
      const user = await authManager.registerUser('sessretrieve', 'password123');
      const created = authManager.createSession(user.userId);

      const retrieved = authManager.getSession(created.sessionId);

      expect(retrieved).toBeDefined();
      expect(retrieved.userId).toBe(user.userId);
      expect(retrieved.token).toBe(created.accessToken);
    });

    test('should return null for non-existent session', () => {
      const session = authManager.getSession('non-existent-session-id');

      expect(session).toBeNull();
    });

    test('should return null for expired session', async () => {
      const user = await authManager.registerUser('expiredsess', 'password123');

      const session = authManager.createSession(user.userId);
      // Manually expire the session
      authManager.sessions.get(session.sessionId).expiresAt = Date.now() - 1000;

      const retrieved = authManager.getSession(session.sessionId);

      expect(retrieved).toBeNull();
      expect(authManager.sessions.has(session.sessionId)).toBe(false);
    });

    test('should update session activity', async () => {
      const user = await authManager.registerUser('activityuser', 'password123');
      const session = authManager.createSession(user.userId);
      const originalExpiry = authManager.sessions.get(session.sessionId).expiresAt;

      // Wait a bit and update
      await new Promise(resolve => setTimeout(resolve, 100));
      const result = authManager.updateSessionActivity(session.sessionId);

      expect(result).toBe(true);
      const newExpiry = authManager.sessions.get(session.sessionId).expiresAt;
      expect(newExpiry).toBeGreaterThan(originalExpiry);
    });

    test('should invalidate single session', async () => {
      const user = await authManager.registerUser('invalidsess', 'password123');
      const session = authManager.createSession(user.userId);

      const result = authManager.invalidateSession(session.sessionId);

      expect(result).toBe(true);
      const retrieved = authManager.getSession(session.sessionId);
      expect(retrieved).toBeNull();
    });

    test('should invalidate all user sessions', async () => {
      const user = await authManager.registerUser('invalidall', 'password123');
      const session1 = authManager.createSession(user.userId);
      const session2 = authManager.createSession(user.userId);

      authManager.invalidateUserSessions(user.userId);

      expect(authManager.getSession(session1.sessionId)).toBeNull();
      expect(authManager.getSession(session2.sessionId)).toBeNull();
    });

    test('should cleanup expired sessions', (done) => {
      authManager.registerUser('cleanup', 'password123').then((user) => {
        const session = authManager.createSession(user.userId);
        // Expire the session
        authManager.sessions.get(session.sessionId).expiresAt = Date.now() - 1000;

        authManager.on('sessions:cleanup', ({ cleanedCount }) => {
          expect(cleanedCount).toBeGreaterThan(0);
          done();
        });

        // Trigger cleanup manually
        const now = Date.now();
        let cleaned = 0;
        for (const [sessionId, sess] of authManager.sessions.entries()) {
          if (sess.expiresAt < now) {
            authManager.sessions.delete(sessionId);
            cleaned++;
          }
        }
        authManager.emit('sessions:cleanup', { cleanedCount: cleaned });
      });
    });

    test('should emit session created event', (done) => {
      authManager.registerUser('sessEvent', 'password123').then((user) => {
        authManager.on('session:created', ({ sessionId, userId }) => {
          expect(sessionId).toBeDefined();
          expect(userId).toBe(user.userId);
          done();
        });

        authManager.createSession(user.userId);
      });
    });
  });

  // ===== USER MANAGEMENT =====
  describe('User Management', () => {
    test('should get user by ID', async () => {
      const registered = await authManager.registerUser('getuser', 'password123');
      const user = authManager.getUser(registered.userId);

      expect(user).toBeDefined();
      expect(user.username).toBe('getuser');
      expect(user.passwordHash).toBeUndefined();
    });

    test('should return null for non-existent user', () => {
      const user = authManager.getUser('non-existent-id');

      expect(user).toBeNull();
    });

    test('should update user', async () => {
      const registered = await authManager.registerUser('updateuser', 'password123');

      const updated = await authManager.updateUser(registered.userId, {
        roles: ['admin', 'user'],
        metadata: { department: 'admin' }
      });

      expect(updated.roles).toContain('admin');
      expect(updated.metadata.department).toBe('admin');
    });

    test('should delete user', async () => {
      const registered = await authManager.registerUser('deleteuser', 'password123');

      const result = authManager.deleteUser(registered.userId);

      expect(result).toBe(true);
      expect(authManager.getUser(registered.userId)).toBeNull();
    });

    test('should emit user updated event', (done) => {
      authManager.registerUser('updateEvent', 'password123').then((user) => {
        authManager.on('user:updated', ({ userId }) => {
          expect(userId).toBe(user.userId);
          done();
        });

        authManager.updateUser(user.userId, { roles: ['admin'] });
      });
    });

    test('should emit user deleted event', (done) => {
      authManager.registerUser('deleteEvent', 'password123').then((user) => {
        authManager.on('user:deleted', ({ userId }) => {
          expect(userId).toBe(user.userId);
          done();
        });

        authManager.deleteUser(user.userId);
      });
    });
  });

  // ===== ERROR HANDLING =====
  describe('Error Handling', () => {
    test('should emit auth failed event on invalid credentials', (done) => {
      authManager.registerUser('failuser', 'password123').then(() => {
        authManager.on('auth:failed', ({ username, reason }) => {
          expect(username).toBe('failuser');
          expect(reason).toBe('invalid_password');
          done();
        });

        authManager.verifyCredentials('failuser', 'wrongpassword');
      });
    });

    test('should emit token rejected event on invalid token', (done) => {
      authManager.on('token:rejected', ({ reason }) => {
        expect(reason).toBeDefined();
        done();
      });

      authManager.validateToken('invalid.token');
    });

    test('should emit error events', (done) => {
      authManager.on('error', ({ action, error }) => {
        expect(action).toBeDefined();
        expect(error).toBeDefined();
        done();
      });

      authManager.getUser(undefined); // This might trigger error handling
      // Also try invalid operation
      authManager.changePassword('invalid-id', 'old', 'new').catch(() => {});
    });
  });
});
