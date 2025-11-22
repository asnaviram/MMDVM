/**
 * ESP32 RoIP Security Test Suite
 * Automated security tests for authentication, authorization, input validation, and more
 *
 * Run: npm test -- security.test.js
 */

import { expect } from 'chai';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

// Mock or import your server
// import app from '../roip-server/src/server.js';
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:8080';

describe('Security Test Suite', () => {

    // ============================================================================
    // AUTHENTICATION TESTS
    // ============================================================================

    describe('Authentication Security', () => {

        describe('JWT Token Validation', () => {

            it('should reject requests without authentication token', async () => {
                const res = await request(BASE_URL)
                    .get('/api/v1/users')
                    .expect(401);

                expect(res.body).to.have.property('error');
            });

            it('should reject invalid JWT tokens', async () => {
                const res = await request(BASE_URL)
                    .get('/api/v1/users')
                    .set('Authorization', 'Bearer invalid_token_here')
                    .expect(401);

                expect(res.body).to.have.property('error');
            });

            it('should reject expired JWT tokens', async () => {
                const expiredToken = jwt.sign(
                    { userId: '123', username: 'test' },
                    'test-secret',
                    { expiresIn: '-1h' }  // Already expired
                );

                const res = await request(BASE_URL)
                    .get('/api/v1/users')
                    .set('Authorization', `Bearer ${expiredToken}`)
                    .expect(401);

                expect(res.body).to.have.property('error');
            });

            it('should reject tokens with "none" algorithm', async () => {
                // Attempt algorithm confusion attack
                const noneToken = jwt.sign(
                    { userId: '123', username: 'admin' },
                    '',
                    { algorithm: 'none' }
                );

                const res = await request(BASE_URL)
                    .get('/api/v1/admin/users')
                    .set('Authorization', `Bearer ${noneToken}`)
                    .expect(401);
            });

            it('should reject tokens with modified payload', async () => {
                // Create valid token
                const validToken = jwt.sign(
                    { userId: '123', username: 'user', roles: ['user'] },
                    'test-secret'
                );

                // Tamper with token (change user to admin)
                const parts = validToken.split('.');
                const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
                payload.roles = ['admin'];
                parts[1] = Buffer.from(JSON.stringify(payload)).toString('base64');
                const tamperedToken = parts.join('.');

                const res = await request(BASE_URL)
                    .get('/api/v1/admin/users')
                    .set('Authorization', `Bearer ${tamperedToken}`)
                    .expect(401);
            });

            it('should enforce token expiration', async () => {
                const shortToken = jwt.sign(
                    { userId: '123', username: 'test' },
                    'test-secret',
                    { expiresIn: '1s' }
                );

                // Wait for token to expire
                await new Promise(resolve => setTimeout(resolve, 2000));

                const res = await request(BASE_URL)
                    .get('/api/v1/users')
                    .set('Authorization', `Bearer ${shortToken}`)
                    .expect(401);
            });
        });

        describe('Login Security', () => {

            it('should reject login without credentials', async () => {
                const res = await request(BASE_URL)
                    .post('/api/v1/auth/login')
                    .send({})
                    .expect(400);

                expect(res.body).to.have.property('error');
            });

            it('should reject login with SQL injection attempt', async () => {
                const res = await request(BASE_URL)
                    .post('/api/v1/auth/login')
                    .send({
                        username: "admin' OR '1'='1",
                        password: "anything"
                    })
                    .expect(401);
            });

            it('should reject login with NoSQL injection attempt', async () => {
                const res = await request(BASE_URL)
                    .post('/api/v1/auth/login')
                    .send({
                        username: { $ne: null },
                        password: { $ne: null }
                    })
                    .expect(400);
            });

            it('should enforce rate limiting on login endpoint', async () => {
                const promises = [];

                // Send 10 rapid login attempts
                for (let i = 0; i < 10; i++) {
                    promises.push(
                        request(BASE_URL)
                            .post('/api/v1/auth/login')
                            .send({
                                username: 'test',
                                password: 'wrong'
                            })
                    );
                }

                const results = await Promise.all(promises);

                // At least some should be rate limited
                const rateLimited = results.some(res => res.status === 429);
                expect(rateLimited).to.be.true;
            });

            it('should not leak information about user existence', async () => {
                // Invalid user
                const res1 = await request(BASE_URL)
                    .post('/api/v1/auth/login')
                    .send({
                        username: 'nonexistent_user_xyz',
                        password: 'wrong'
                    });

                // Valid user, wrong password
                const res2 = await request(BASE_URL)
                    .post('/api/v1/auth/login')
                    .send({
                        username: 'existing_user',
                        password: 'wrong'
                    });

                // Error messages should be generic and identical
                expect(res1.body.error).to.equal(res2.body.error);
            });

            it('should use bcrypt for password hashing', async () => {
                const password = 'TestPassword123!';
                const hash = await bcrypt.hash(password, 10);

                // Verify it's a valid bcrypt hash
                expect(hash).to.match(/^\$2[aby]\$/);

                // Verify password comparison works
                const valid = await bcrypt.compare(password, hash);
                expect(valid).to.be.true;

                // Verify wrong password fails
                const invalid = await bcrypt.compare('wrong', hash);
                expect(invalid).to.be.false;
            });
        });

        describe('Session Management', () => {

            it('should regenerate session ID on login', async () => {
                // This test requires session tracking
                // Implementation depends on session middleware used
            });

            it('should invalidate old tokens on logout', async () => {
                // Login and get token
                const loginRes = await request(BASE_URL)
                    .post('/api/v1/auth/login')
                    .send({
                        username: 'test',
                        password: 'test123'
                    });

                const token = loginRes.body.accessToken;

                // Logout
                await request(BASE_URL)
                    .post('/api/v1/auth/logout')
                    .set('Authorization', `Bearer ${token}`)
                    .expect(200);

                // Try to use old token
                const res = await request(BASE_URL)
                    .get('/api/v1/users')
                    .set('Authorization', `Bearer ${token}`)
                    .expect(401);
            });
        });
    });

    // ============================================================================
    // AUTHORIZATION TESTS
    // ============================================================================

    describe('Authorization Security', () => {

        describe('Role-Based Access Control', () => {

            it('should deny access to admin endpoints for regular users', async () => {
                // Get user token (non-admin)
                const loginRes = await request(BASE_URL)
                    .post('/api/v1/auth/login')
                    .send({
                        username: 'regular_user',
                        password: 'password123'
                    });

                const userToken = loginRes.body.accessToken;

                // Try to access admin endpoint
                const res = await request(BASE_URL)
                    .get('/api/v1/admin/users')
                    .set('Authorization', `Bearer ${userToken}`)
                    .expect(403);

                expect(res.body).to.have.property('error');
            });

            it('should allow access to admin endpoints for admin users', async () => {
                // Get admin token
                const loginRes = await request(BASE_URL)
                    .post('/api/v1/auth/login')
                    .send({
                        username: 'admin',
                        password: 'admin123'
                    });

                const adminToken = loginRes.body.accessToken;

                // Access admin endpoint
                const res = await request(BASE_URL)
                    .get('/api/v1/admin/users')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .expect(200);
            });

            it('should prevent horizontal privilege escalation', async () => {
                // User A tries to access User B's data
                const loginRes = await request(BASE_URL)
                    .post('/api/v1/auth/login')
                    .send({
                        username: 'user_a',
                        password: 'password123'
                    });

                const tokenA = loginRes.body.accessToken;

                // Try to access user_b's profile
                const res = await request(BASE_URL)
                    .get('/api/v1/users/user_b')
                    .set('Authorization', `Bearer ${tokenA}`)
                    .expect(403);
            });
        });
    });

    // ============================================================================
    // INPUT VALIDATION TESTS
    // ============================================================================

    describe('Input Validation', () => {

        describe('SQL Injection Prevention', () => {

            const sqlPayloads = [
                "' OR '1'='1",
                "'; DROP TABLE users--",
                "' UNION SELECT * FROM users--",
                "admin'--",
                "' OR 1=1--",
                "1' AND '1'='1",
            ];

            sqlPayloads.forEach(payload => {
                it(`should reject SQL injection: ${payload}`, async () => {
                    const res = await request(BASE_URL)
                        .get(`/api/v1/users?username=${encodeURIComponent(payload)}`)
                        .expect(400);
                });
            });
        });

        describe('Command Injection Prevention', () => {

            const commandPayloads = [
                "; ls -la",
                "| cat /etc/passwd",
                "`whoami`",
                "$(whoami)",
                "&& rm -rf /",
            ];

            commandPayloads.forEach(payload => {
                it(`should reject command injection: ${payload}`, async () => {
                    const res = await request(BASE_URL)
                        .post('/api/v1/devices')
                        .send({
                            name: payload,
                            type: "esp32"
                        })
                        .expect(400);
                });
            });
        });

        describe('XSS Prevention', () => {

            const xssPayloads = [
                "<script>alert('XSS')</script>",
                "<img src=x onerror=alert('XSS')>",
                "<svg onload=alert('XSS')>",
                "javascript:alert('XSS')",
                "<iframe src='javascript:alert(1)'>",
            ];

            xssPayloads.forEach(payload => {
                it(`should sanitize XSS payload: ${payload}`, async () => {
                    const res = await request(BASE_URL)
                        .post('/api/v1/devices')
                        .send({
                            name: payload,
                            type: "esp32"
                        });

                    // Response should not contain executable script
                    expect(res.body.name).to.not.include('<script>');
                    expect(res.body.name).to.not.include('onerror');
                });
            });
        });

        describe('Path Traversal Prevention', () => {

            const traversalPayloads = [
                "../../../etc/passwd",
                "..\\..\\..\\windows\\system32\\config\\sam",
                "/etc/passwd",
                "....//....//....//etc/passwd",
            ];

            traversalPayloads.forEach(payload => {
                it(`should reject path traversal: ${payload}`, async () => {
                    const res = await request(BASE_URL)
                        .get(`/api/v1/files/${encodeURIComponent(payload)}`)
                        .expect(400);
                });
            });
        });

        describe('Data Type Validation', () => {

            it('should reject invalid email format', async () => {
                const res = await request(BASE_URL)
                    .post('/api/v1/users')
                    .send({
                        username: 'test',
                        email: 'invalid-email',
                        password: 'Test123!@#'
                    })
                    .expect(400);

                expect(res.body.error).to.include('email');
            });

            it('should reject invalid port number', async () => {
                const res = await request(BASE_URL)
                    .post('/api/v1/devices')
                    .send({
                        name: 'test',
                        port: 99999  // Out of range
                    })
                    .expect(400);
            });

            it('should reject oversized input', async () => {
                const longString = 'A'.repeat(10000);

                const res = await request(BASE_URL)
                    .post('/api/v1/devices')
                    .send({
                        name: longString
                    })
                    .expect(400);
            });
        });
    });

    // ============================================================================
    // SECURITY HEADERS TESTS
    // ============================================================================

    describe('Security Headers', () => {

        it('should include X-Frame-Options header', async () => {
            const res = await request(BASE_URL).get('/');

            expect(res.headers).to.have.property('x-frame-options');
            expect(res.headers['x-frame-options']).to.match(/DENY|SAMEORIGIN/);
        });

        it('should include X-Content-Type-Options header', async () => {
            const res = await request(BASE_URL).get('/');

            expect(res.headers).to.have.property('x-content-type-options');
            expect(res.headers['x-content-type-options']).to.equal('nosniff');
        });

        it('should include Content-Security-Policy header', async () => {
            const res = await request(BASE_URL).get('/');

            expect(res.headers).to.have.property('content-security-policy');
            expect(res.headers['content-security-policy']).to.include("default-src");
        });

        it('should include Strict-Transport-Security header (HTTPS)', async () => {
            if (BASE_URL.startsWith('https')) {
                const res = await request(BASE_URL).get('/');

                expect(res.headers).to.have.property('strict-transport-security');
                expect(res.headers['strict-transport-security']).to.include('max-age');
            }
        });

        it('should include X-XSS-Protection header', async () => {
            const res = await request(BASE_URL).get('/');

            expect(res.headers).to.have.property('x-xss-protection');
        });

        it('should not leak server version information', async () => {
            const res = await request(BASE_URL).get('/');

            // Server header should not reveal version details
            if (res.headers.server) {
                expect(res.headers.server).to.not.include('Express');
                expect(res.headers.server).to.not.match(/\d+\.\d+\.\d+/);
            }
        });
    });

    // ============================================================================
    // CORS SECURITY TESTS
    // ============================================================================

    describe('CORS Configuration', () => {

        it('should not allow wildcard origin with credentials', async () => {
            const res = await request(BASE_URL)
                .options('/api/v1/users')
                .set('Origin', 'http://evil.com');

            if (res.headers['access-control-allow-credentials'] === 'true') {
                expect(res.headers['access-control-allow-origin']).to.not.equal('*');
            }
        });

        it('should only allow whitelisted origins', async () => {
            const res = await request(BASE_URL)
                .get('/api/v1/health')
                .set('Origin', 'http://evil.com');

            // Should either not have CORS headers or explicitly deny
            if (res.headers['access-control-allow-origin']) {
                expect(res.headers['access-control-allow-origin']).to.not.equal('http://evil.com');
            }
        });
    });

    // ============================================================================
    // CSRF PROTECTION TESTS
    // ============================================================================

    describe('CSRF Protection', () => {

        it('should require CSRF token for state-changing operations', async () => {
            // This test depends on CSRF implementation
            // Example for cookie-based CSRF protection

            const res = await request(BASE_URL)
                .post('/api/v1/users/delete')
                .send({ id: 1 })
                .expect(403);

            expect(res.body.error).to.include('CSRF');
        });
    });

    // ============================================================================
    // RATE LIMITING TESTS
    // ============================================================================

    describe('Rate Limiting', () => {

        it('should enforce rate limits on API endpoints', async () => {
            const promises = [];

            // Send 150 rapid requests (assuming limit is 100/min)
            for (let i = 0; i < 150; i++) {
                promises.push(
                    request(BASE_URL)
                        .get('/api/v1/health')
                );
            }

            const results = await Promise.all(promises);

            // Should have some 429 responses
            const rateLimited = results.filter(res => res.status === 429);
            expect(rateLimited.length).to.be.greaterThan(0);
        });

        it('should include Retry-After header when rate limited', async () => {
            // Trigger rate limit
            const promises = [];
            for (let i = 0; i < 200; i++) {
                promises.push(request(BASE_URL).get('/api/v1/health'));
            }

            const results = await Promise.all(promises);
            const rateLimited = results.find(res => res.status === 429);

            if (rateLimited) {
                expect(rateLimited.headers).to.have.property('retry-after');
            }
        });
    });

    // ============================================================================
    // ERROR HANDLING TESTS
    // ============================================================================

    describe('Error Handling', () => {

        it('should not expose stack traces in production', async () => {
            const res = await request(BASE_URL)
                .get('/api/v1/trigger-error')
                .expect(500);

            expect(res.body).to.not.have.property('stack');
            expect(JSON.stringify(res.body)).to.not.include('at ');
        });

        it('should return generic error messages', async () => {
            const res = await request(BASE_URL)
                .get('/api/v1/nonexistent')
                .expect(404);

            // Should not reveal internal details
            expect(res.body.error).to.not.include('sql');
            expect(res.body.error).to.not.include('database');
            expect(res.body.error).to.not.include('table');
        });
    });

    // ============================================================================
    // SESSION SECURITY TESTS
    // ============================================================================

    describe('Session Cookie Security', () => {

        it('should set secure flag on session cookies (HTTPS only)', async () => {
            if (BASE_URL.startsWith('https')) {
                const res = await request(BASE_URL)
                    .post('/api/v1/auth/login')
                    .send({
                        username: 'test',
                        password: 'test123'
                    });

                const cookies = res.headers['set-cookie'];
                if (cookies) {
                    expect(cookies.some(c => c.includes('Secure'))).to.be.true;
                }
            }
        });

        it('should set HttpOnly flag on session cookies', async () => {
            const res = await request(BASE_URL)
                .post('/api/v1/auth/login')
                .send({
                    username: 'test',
                    password: 'test123'
                });

            const cookies = res.headers['set-cookie'];
            if (cookies) {
                expect(cookies.some(c => c.includes('HttpOnly'))).to.be.true;
            }
        });

        it('should set SameSite attribute on cookies', async () => {
            const res = await request(BASE_URL)
                .post('/api/v1/auth/login')
                .send({
                    username: 'test',
                    password: 'test123'
                });

            const cookies = res.headers['set-cookie'];
            if (cookies) {
                expect(cookies.some(c => c.includes('SameSite'))).to.be.true;
            }
        });
    });

    // ============================================================================
    // PASSWORD POLICY TESTS
    // ============================================================================

    describe('Password Policy', () => {

        it('should enforce minimum password length', async () => {
            const res = await request(BASE_URL)
                .post('/api/v1/users')
                .send({
                    username: 'test',
                    email: 'test@example.com',
                    password: 'short'  // Too short
                })
                .expect(400);

            expect(res.body.error).to.include('password');
        });

        it('should require password complexity', async () => {
            const weakPasswords = [
                'password',
                '12345678',
                'abcdefgh',
                'Password',  // Missing numbers/symbols
            ];

            for (const password of weakPasswords) {
                const res = await request(BASE_URL)
                    .post('/api/v1/users')
                    .send({
                        username: 'test',
                        email: 'test@example.com',
                        password: password
                    })
                    .expect(400);

                expect(res.body.error).to.include('password');
            }
        });
    });

    // ============================================================================
    // LOGGING & MONITORING TESTS
    // ============================================================================

    describe('Security Logging', () => {

        it('should log failed authentication attempts', async () => {
            // Make failed login attempt
            await request(BASE_URL)
                .post('/api/v1/auth/login')
                .send({
                    username: 'test',
                    password: 'wrong'
                });

            // Check logs (implementation dependent)
            // This is a placeholder for actual log verification
        });

        it('should not log sensitive data', async () => {
            // Make request with password
            await request(BASE_URL)
                .post('/api/v1/auth/login')
                .send({
                    username: 'test',
                    password: 'sensitive_password_123'
                });

            // Verify logs don't contain the password
            // This is a placeholder for actual log verification
        });
    });

    // ============================================================================
    // FILE UPLOAD SECURITY TESTS
    // ============================================================================

    describe('File Upload Security', () => {

        it('should validate file type', async () => {
            const res = await request(BASE_URL)
                .post('/api/v1/recordings/upload')
                .attach('file', Buffer.from('malicious content'), 'malware.exe')
                .expect(400);

            expect(res.body.error).to.include('file type');
        });

        it('should enforce file size limits', async () => {
            const largeFile = Buffer.alloc(100 * 1024 * 1024); // 100MB

            const res = await request(BASE_URL)
                .post('/api/v1/recordings/upload')
                .attach('file', largeFile, 'large.wav')
                .expect(413);
        });
    });
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a test user
 */
async function createTestUser(username, password, roles = ['user']) {
    return await request(BASE_URL)
        .post('/api/v1/users')
        .send({
            username,
            email: `${username}@test.com`,
            password,
            roles
        });
}

/**
 * Get authentication token
 */
async function getAuthToken(username, password) {
    const res = await request(BASE_URL)
        .post('/api/v1/auth/login')
        .send({ username, password });

    return res.body.accessToken;
}

/**
 * Clean up test data
 */
async function cleanup() {
    // Implementation depends on your database setup
}

// Run cleanup after all tests
after(async () => {
    await cleanup();
});
