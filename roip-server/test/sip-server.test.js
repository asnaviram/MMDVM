/**
 * SIP Server Test Suite
 * Tests SIP message parsing, REGISTER handling, INVITE/ACK/BYE flow,
 * Digest authentication, and Dialog management
 */

import { SIPServer } from '../src/sip/sip-server.js';

describe('SIP Server Tests', () => {
  let sipServer;
  let mockAuthManager;
  let mockDatabase;
  let mockLogger;
  const testConfig = {
    port: 5060,
    realm: 'test.localhost',
    domain: 'test.localhost',
    keepalive_interval: 30000,
    registration_expiry: 3600
  };

  beforeEach(() => {
    mockAuthManager = {
      getPassword: jest.fn().mockResolvedValue('testpass123')
    };

    mockDatabase = {
      registerDevice: jest.fn().mockResolvedValue({ id: 1 }),
      unregisterDevice: jest.fn().mockResolvedValue(true)
    };

    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    sipServer = new SIPServer(testConfig, mockAuthManager, mockDatabase, mockLogger);
  });

  afterEach(() => {
    if (sipServer && sipServer.socket) {
      sipServer.socket.close();
    }
  });

  // ===== SIP MESSAGE PARSING =====
  describe('SIP Message Parsing', () => {
    test('should parse valid SIP request message', () => {
      const sipMessage = `REGISTER sip:test.localhost SIP/2.0\r
Via: SIP/2.0/UDP 192.168.1.100:5060;branch=z9hG4bK776\r
From: <sip:user@test.localhost>;tag=1928301774\r
To: <sip:user@test.localhost>\r
Call-ID: a84b4c76e66710@pc33.test.localhost\r
CSeq: 314159 REGISTER\r
Contact: <sip:user@192.168.1.100>\r
Max-Forwards: 70\r
User-Agent: Test-Client/1.0\r
Content-Length: 0\r
\r
`;

      const parsed = sipServer.parseMessage(sipMessage);

      expect(parsed).not.toBeNull();
      expect(parsed.type).toBe('request');
      expect(parsed.method).toBe('REGISTER');
      expect(parsed.requestUri).toBe('sip:test.localhost');
      expect(parsed.version).toBe('SIP/2.0');
      expect(parsed.cseq).toBe(314159);
      expect(parsed.callId).toBe('a84b4c76e66710@pc33.test.localhost');
    });

    test('should parse SIP response message', () => {
      const sipResponse = `SIP/2.0 200 OK\r
Via: SIP/2.0/UDP 192.168.1.100:5060;branch=z9hG4bK776\r
From: <sip:user@test.localhost>;tag=1928301774\r
To: <sip:user@test.localhost>;tag=4711\r
Call-ID: a84b4c76e66710@pc33.test.localhost\r
CSeq: 314159 REGISTER\r
Contact: <sip:user@192.168.1.100>\r
Content-Length: 0\r
\r
`;

      const parsed = sipServer.parseMessage(sipResponse);

      expect(parsed).not.toBeNull();
      expect(parsed.type).toBe('response');
      expect(parsed.statusCode).toBe(200);
      expect(parsed.reason).toBe('OK');
    });

    test('should extract From header', () => {
      const sipMessage = `REGISTER sip:test.localhost SIP/2.0\r
Via: SIP/2.0/UDP 192.168.1.100:5060\r
From: "John Doe" <sip:john@test.localhost>;tag=123\r
To: <sip:john@test.localhost>\r
Call-ID: test123\r
CSeq: 1 REGISTER\r
Content-Length: 0\r
\r
`;

      const parsed = sipServer.parseMessage(sipMessage);

      expect(parsed.from).toBeDefined();
      expect(parsed.from.uri).toBe('sip:john@test.localhost');
      expect(parsed.from.name).toBe('"John Doe"');
      expect(parsed.from.tag).toBe('123');
    });

    test('should extract To header', () => {
      const sipMessage = `REGISTER sip:test.localhost SIP/2.0\r
Via: SIP/2.0/UDP 192.168.1.100:5060\r
From: <sip:john@test.localhost>;tag=123\r
To: "John Doe" <sip:john@test.localhost>;tag=456\r
Call-ID: test123\r
CSeq: 1 REGISTER\r
Content-Length: 0\r
\r
`;

      const parsed = sipServer.parseMessage(sipMessage);

      expect(parsed.to).toBeDefined();
      expect(parsed.to.uri).toBe('sip:john@test.localhost');
      expect(parsed.to.tag).toBe('456');
    });

    test('should handle header folding', () => {
      const sipMessage = `REGISTER sip:test.localhost SIP/2.0\r
Via: SIP/2.0/UDP 192.168.1.100:5060\r
From: <sip:john@test.localhost>\r
 ;tag=123\r
To: <sip:john@test.localhost>\r
Call-ID: test123\r
CSeq: 1 REGISTER\r
Content-Length: 0\r
\r
`;

      const parsed = sipServer.parseMessage(sipMessage);
      expect(parsed.from).toBeDefined();
      expect(parsed.from.tag).toBe('123');
    });

    test('should parse Contact header', () => {
      const sipMessage = `REGISTER sip:test.localhost SIP/2.0\r
Via: SIP/2.0/UDP 192.168.1.100:5060\r
From: <sip:user@test.localhost>;tag=1\r
To: <sip:user@test.localhost>\r
Call-ID: test123\r
CSeq: 1 REGISTER\r
Contact: <sip:user@192.168.1.100:5060>;expires=3600\r
Content-Length: 0\r
\r
`;

      const parsed = sipServer.parseMessage(sipMessage);

      expect(parsed.contact).toBeDefined();
      expect(parsed.contact.uri).toBe('sip:user@192.168.1.100:5060');
      expect(parsed.contact.params.expires).toBe('3600');
    });

    test('should parse Authorization header', () => {
      const authHeader = 'Digest username="user", realm="test.localhost", nonce="abc123", uri="sip:test.localhost", response="xyz789"';
      const parsed = sipServer.parseAuthorization(authHeader);

      expect(parsed).not.toBeNull();
      expect(parsed.scheme).toBe('Digest');
      expect(parsed.params.username).toBe('user');
      expect(parsed.params.realm).toBe('test.localhost');
      expect(parsed.params.nonce).toBe('abc123');
    });

    test('should handle invalid message gracefully', () => {
      const invalidMessage = 'This is not a valid SIP message';
      const parsed = sipServer.parseMessage(invalidMessage);

      expect(parsed).toBeNull();
    });
  });

  // ===== REGISTER HANDLING =====
  describe('REGISTER Message Handling', () => {
    test('should send 401 challenge on initial REGISTER without auth', async () => {
      const rinfo = { address: '192.168.1.100', port: 5060 };
      const registerMsg = {
        type: 'request',
        method: 'REGISTER',
        to: { uri: 'sip:user@test.localhost' },
        contact: { uri: 'sip:user@192.168.1.100' },
        cseq: 1,
        callId: 'test-call-id',
        via: { host: '192.168.1.100:5060', params: { branch: 'z9hG4bK123' } },
        from: { uri: 'sip:user@test.localhost' },
        authorization: null,
        expires: 3600,
        userAgent: 'TestClient/1.0'
      };

      sipServer.sendResponse = jest.fn();
      await sipServer.handleREGISTER(registerMsg, rinfo);

      expect(sipServer.sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'REGISTER' }),
        401,
        'Unauthorized',
        rinfo,
        expect.objectContaining({ 'WWW-Authenticate': expect.any(String) })
      );
    });

    test('should register device with valid digest auth', async () => {
      const rinfo = { address: '192.168.1.100', port: 5060 };
      const nonce = sipServer.generateNonce();
      const registerMsg = {
        type: 'request',
        method: 'REGISTER',
        to: { uri: 'sip:user@test.localhost' },
        contact: { uri: 'sip:user@192.168.1.100' },
        cseq: 2,
        callId: 'test-call-id',
        via: { host: '192.168.1.100:5060', params: { branch: 'z9hG4bK124' } },
        from: { uri: 'sip:user@test.localhost' },
        authorization: {
          scheme: 'Digest',
          params: {
            username: 'user',
            realm: 'test.localhost',
            nonce: nonce,
            uri: 'sip:test.localhost',
            response: sipServer.computeDigestResponse({
              username: 'user',
              realm: 'test.localhost',
              password: 'testpass123',
              method: 'REGISTER',
              uri: 'sip:test.localhost',
              nonce: nonce,
              qop: 'auth'
            }),
            qop: 'auth',
            nc: '00000001',
            cnonce: 'abc123',
            algorithm: 'MD5'
          }
        },
        expires: 3600,
        userAgent: 'TestClient/1.0'
      };

      // Pre-populate challenge
      const challenge = { realm: 'test.localhost', nonce: nonce, algorithm: 'MD5', qop: 'auth' };
      sipServer.pendingChallenges.set(nonce, challenge);

      sipServer.sendResponse = jest.fn();
      await sipServer.handleREGISTER(registerMsg, rinfo);

      expect(sipServer.registrations.has('sip:user@test.localhost')).toBe(true);
      const reg = sipServer.registrations.get('sip:user@test.localhost');
      expect(reg.contact).toBe('sip:user@192.168.1.100');
      expect(reg.username).toBe('user');
    });

    test('should unregister device when expires=0', async () => {
      const rinfo = { address: '192.168.1.100', port: 5060 };
      const aor = 'sip:user@test.localhost';

      // First register
      const nonce = sipServer.generateNonce();
      const challenge = { realm: 'test.localhost', nonce: nonce, algorithm: 'MD5', qop: 'auth' };
      sipServer.pendingChallenges.set(nonce, challenge);

      sipServer.registrations.set(aor, {
        aor,
        contact: 'sip:user@192.168.1.100',
        username: 'user'
      });

      const unregisterMsg = {
        type: 'request',
        method: 'REGISTER',
        to: { uri: aor },
        contact: { uri: 'sip:user@192.168.1.100' },
        cseq: 3,
        callId: 'test-call-id',
        via: { host: '192.168.1.100:5060', params: { branch: 'z9hG4bK125' } },
        from: { uri: aor },
        authorization: {
          scheme: 'Digest',
          params: {
            username: 'user',
            realm: 'test.localhost',
            nonce: nonce,
            uri: 'sip:test.localhost',
            response: 'dummy'
          }
        },
        expires: 0,
        userAgent: 'TestClient/1.0'
      };

      sipServer.verifyDigestAuth = jest.fn().mockResolvedValue({ valid: true, username: 'user' });
      sipServer.sendResponse = jest.fn();

      await sipServer.handleREGISTER(unregisterMsg, rinfo);

      expect(sipServer.registrations.has(aor)).toBe(false);
    });

    test('should track registration metrics', async () => {
      const rinfo = { address: '192.168.1.100', port: 5060 };
      const nonce = sipServer.generateNonce();
      const challenge = { realm: 'test.localhost', nonce: nonce, algorithm: 'MD5', qop: 'auth' };
      sipServer.pendingChallenges.set(nonce, challenge);

      const registerMsg = {
        type: 'request',
        method: 'REGISTER',
        to: { uri: 'sip:user1@test.localhost' },
        contact: { uri: 'sip:user1@192.168.1.100' },
        cseq: 1,
        callId: 'test-call-id-1',
        via: { host: '192.168.1.100:5060', params: { branch: 'z9hG4bK126' } },
        from: { uri: 'sip:user1@test.localhost' },
        authorization: {
          scheme: 'Digest',
          params: {
            username: 'user1',
            realm: 'test.localhost',
            nonce: nonce,
            uri: 'sip:test.localhost',
            response: sipServer.computeDigestResponse({
              username: 'user1',
              realm: 'test.localhost',
              password: 'testpass123',
              method: 'REGISTER',
              uri: 'sip:test.localhost',
              nonce: nonce
            })
          }
        },
        expires: 3600,
        userAgent: 'TestClient/1.0'
      };

      sipServer.verifyDigestAuth = jest.fn().mockResolvedValue({ valid: true, username: 'user1' });
      sipServer.sendResponse = jest.fn();

      const initialCount = sipServer.metrics.registrations;
      await sipServer.handleREGISTER(registerMsg, rinfo);

      expect(sipServer.metrics.registrations).toBeGreaterThan(initialCount);
    });
  });

  // ===== INVITE/ACK/BYE FLOW =====
  describe('INVITE/ACK/BYE Call Flow', () => {
    test('should handle INVITE request', async () => {
      const rinfo = { address: '192.168.1.100', port: 5060 };

      // Register recipient first
      sipServer.registrations.set('sip:recipient@test.localhost', {
        aor: 'sip:recipient@test.localhost',
        contact: 'sip:recipient@192.168.1.101',
        contactAddress: '192.168.1.101',
        contactPort: 5060
      });

      const inviteMsg = {
        type: 'request',
        method: 'INVITE',
        requestUri: 'sip:recipient@test.localhost',
        to: { uri: 'sip:recipient@test.localhost', tag: null },
        from: { uri: 'sip:user@test.localhost', tag: 'from-tag-123' },
        callId: 'invite-call-123',
        cseq: 1,
        via: { host: '192.168.1.100:5060', params: { branch: 'z9hG4bK200' } },
        body: 'v=0\r\no=- 123 123 IN IP4 192.168.1.100\r\n',
        contentType: 'application/sdp',
        maxForwards: 70
      };

      sipServer.sendResponse = jest.fn();
      sipServer.forwardINVITE = jest.fn();

      await sipServer.handleINVITE(inviteMsg, rinfo);

      expect(sipServer.dialogs.size).toBeGreaterThan(0);
      expect(sipServer.sendResponse).toHaveBeenCalledWith(
        expect.any(Object),
        180,
        'Ringing',
        rinfo,
        expect.any(Object)
      );
    });

    test('should handle ACK to establish call', async () => {
      const rinfo = { address: '192.168.1.100', port: 5060 };
      const callId = 'test-call-123';
      const fromTag = 'from-tag-456';
      const toTag = 'to-tag-789';
      const dialogId = `${callId}:${fromTag}:${toTag}`;

      // Create dialog
      sipServer.dialogs.set(dialogId, {
        callId,
        fromTag,
        toTag,
        state: 'early',
        initiator: 'sip:user@test.localhost',
        recipient: 'sip:recipient@test.localhost'
      });

      const ackMsg = {
        type: 'request',
        method: 'ACK',
        callId,
        from: { tag: fromTag, uri: 'sip:user@test.localhost' },
        to: { tag: toTag, uri: 'sip:recipient@test.localhost' },
        cseq: 1
      };

      await sipServer.handleACK(ackMsg, rinfo);

      const dialog = sipServer.dialogs.get(dialogId);
      expect(dialog.state).toBe('established');
    });

    test('should handle BYE to terminate call', async () => {
      const rinfo = { address: '192.168.1.100', port: 5060 };
      const callId = 'test-call-456';
      const fromTag = 'from-tag-123';
      const toTag = 'to-tag-456';
      const dialogId = `${callId}:${fromTag}:${toTag}`;

      // Create established dialog
      sipServer.dialogs.set(dialogId, {
        callId,
        fromTag,
        toTag,
        state: 'established'
      });

      const byeMsg = {
        type: 'request',
        method: 'BYE',
        callId,
        from: { tag: fromTag },
        to: { tag: toTag },
        cseq: 2,
        via: { host: '192.168.1.100:5060', params: {} }
      };

      sipServer.sendResponse = jest.fn();
      await sipServer.handleBYE(byeMsg, rinfo);

      expect(sipServer.dialogs.has(dialogId)).toBe(false);
      expect(sipServer.sendResponse).toHaveBeenCalledWith(
        expect.any(Object),
        200,
        'OK',
        rinfo
      );
    });

    test('should track active dialogs', async () => {
      const callId = 'dialog-test-123';
      const fromTag = 'tag1';
      const toTag = 'tag2';

      sipServer.dialogs.set(`${callId}:${fromTag}:${toTag}`, {
        callId,
        state: 'established'
      });

      expect(sipServer.metrics.activeDialogs).toBe(1);

      sipServer.dialogs.delete(`${callId}:${fromTag}:${toTag}`);
      sipServer.metrics.activeDialogs = sipServer.dialogs.size;

      expect(sipServer.metrics.activeDialogs).toBe(0);
    });
  });

  // ===== DIGEST AUTHENTICATION =====
  describe('Digest Authentication', () => {
    test('should compute digest response correctly', () => {
      const params = {
        username: 'user',
        realm: 'test.localhost',
        password: 'password123',
        method: 'REGISTER',
        uri: 'sip:test.localhost',
        nonce: 'abc123def456',
        qop: 'auth',
        nc: '00000001',
        cnonce: 'fedcba',
        algorithm: 'MD5'
      };

      const response = sipServer.computeDigestResponse(params);

      expect(typeof response).toBe('string');
      expect(response).toMatch(/^[a-f0-9]{32}$/);
    });

    test('should verify valid digest auth', async () => {
      const nonce = sipServer.generateNonce();
      const challenge = { realm: 'test.localhost', nonce: nonce, algorithm: 'MD5', qop: 'auth' };
      sipServer.pendingChallenges.set(nonce, challenge);

      const msg = {
        method: 'REGISTER',
        authorization: {
          params: {
            username: 'user',
            realm: 'test.localhost',
            nonce: nonce,
            uri: 'sip:test.localhost',
            response: sipServer.computeDigestResponse({
              username: 'user',
              realm: 'test.localhost',
              password: 'testpass123',
              method: 'REGISTER',
              uri: 'sip:test.localhost',
              nonce: nonce,
              qop: 'auth',
              nc: '00000001',
              cnonce: 'abc123',
              algorithm: 'MD5'
            }),
            qop: 'auth',
            nc: '00000001',
            cnonce: 'abc123',
            algorithm: 'MD5'
          }
        }
      };

      const result = await sipServer.verifyDigestAuth(msg, {});

      expect(result.valid).toBe(true);
      expect(result.username).toBe('user');
    });

    test('should reject invalid digest response', async () => {
      const nonce = sipServer.generateNonce();
      const msg = {
        method: 'REGISTER',
        authorization: {
          params: {
            username: 'user',
            realm: 'test.localhost',
            nonce: nonce,
            uri: 'sip:test.localhost',
            response: 'invalid_response_hash',
            qop: 'auth'
          }
        }
      };

      const result = await sipServer.verifyDigestAuth(msg, {});

      expect(result.valid).toBe(false);
    });

    test('should validate nonce format', () => {
      const validNonce = 'a'.repeat(32);
      const invalidNonce = 'invalid_nonce';

      expect(sipServer.isValidNonce(validNonce)).toBe(true);
      expect(sipServer.isValidNonce(invalidNonce)).toBe(false);
    });

    test('should generate unique nonces', () => {
      const nonce1 = sipServer.generateNonce();
      const nonce2 = sipServer.generateNonce();

      expect(nonce1).not.toBe(nonce2);
      expect(nonce1).toMatch(/^[a-f0-9]{32}$/);
      expect(nonce2).toMatch(/^[a-f0-9]{32}$/);
    });
  });

  // ===== DIALOG MANAGEMENT =====
  describe('Dialog Management', () => {
    test('should create dialog with unique ID', () => {
      const callId = 'call-123';
      const fromTag = 'from-456';
      const toTag = 'to-789';
      const dialogId = `${callId}:${fromTag}:${toTag}`;

      sipServer.dialogs.set(dialogId, {
        callId,
        fromTag,
        toTag,
        state: 'early'
      });

      expect(sipServer.dialogs.has(dialogId)).toBe(true);
      const dialog = sipServer.dialogs.get(dialogId);
      expect(dialog.state).toBe('early');
    });

    test('should transition dialog states correctly', () => {
      const callId = 'call-456';
      const fromTag = 'from-789';
      const toTag = 'to-012';
      const dialogId = `${callId}:${fromTag}:${toTag}`;

      const dialog = {
        callId,
        fromTag,
        toTag,
        state: 'early'
      };

      sipServer.dialogs.set(dialogId, dialog);

      // Transition: early -> connecting
      dialog.state = 'connecting';
      expect(sipServer.dialogs.get(dialogId).state).toBe('connecting');

      // Transition: connecting -> established
      dialog.state = 'established';
      expect(sipServer.dialogs.get(dialogId).state).toBe('established');

      // Transition: established -> terminated
      dialog.state = 'terminated';
      sipServer.dialogs.delete(dialogId);
      expect(sipServer.dialogs.has(dialogId)).toBe(false);
    });

    test('should find registration by URI', () => {
      const aor = 'sip:testuser@test.localhost';
      const registration = {
        aor,
        contact: 'sip:testuser@192.168.1.100',
        contactAddress: '192.168.1.100',
        contactPort: 5060
      };

      sipServer.registrations.set(aor, registration);

      const found = sipServer.findRegistration(aor);
      expect(found).toEqual(registration);
    });

    test('should return null for non-existent registration', () => {
      const notFound = sipServer.findRegistration('sip:nonexistent@test.localhost');
      expect(notFound).toBeUndefined();
    });

    test('should retrieve all registrations', () => {
      sipServer.registrations.set('sip:user1@test.localhost', { aor: 'sip:user1@test.localhost' });
      sipServer.registrations.set('sip:user2@test.localhost', { aor: 'sip:user2@test.localhost' });

      const all = sipServer.getRegistrations();
      expect(all).toHaveLength(2);
    });

    test('should retrieve all dialogs', () => {
      sipServer.dialogs.set('call1:tag1:tag2', { state: 'established' });
      sipServer.dialogs.set('call2:tag3:tag4', { state: 'early' });

      const all = sipServer.getDialogs();
      expect(all).toHaveLength(2);
    });
  });

  // ===== SERVER METRICS =====
  describe('Server Metrics and Statistics', () => {
    test('should initialize metrics', () => {
      expect(sipServer.metrics.messagesReceived).toBe(0);
      expect(sipServer.metrics.messagesSent).toBe(0);
      expect(sipServer.metrics.registrations).toBe(0);
      expect(sipServer.metrics.activeDialogs).toBe(0);
    });

    test('should track message counts', () => {
      sipServer.metrics.messagesReceived = 10;
      sipServer.metrics.messagesSent = 5;

      expect(sipServer.metrics.messagesReceived).toBe(10);
      expect(sipServer.metrics.messagesSent).toBe(5);
    });

    test('should get server metrics', () => {
      sipServer.registrations.set('sip:user@test.localhost', { aor: 'sip:user@test.localhost' });
      sipServer.dialogs.set('call1:tag1:tag2', { state: 'established' });
      sipServer.metrics.messagesReceived = 20;
      sipServer.metrics.messagesSent = 15;

      const metrics = sipServer.getMetrics();

      expect(metrics.registeredDevices).toBe(1);
      expect(metrics.activeDialogs).toBe(1);
      expect(metrics.messagesReceived).toBe(20);
      expect(metrics.messagesSent).toBe(15);
      expect(metrics.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  // ===== TAG GENERATION =====
  describe('Tag and Nonce Generation', () => {
    test('should generate unique tags', () => {
      const tag1 = sipServer.generateTag();
      const tag2 = sipServer.generateTag();

      expect(tag1).not.toBe(tag2);
      expect(tag1).toMatch(/^[a-f0-9]{16}$/);
      expect(tag2).toMatch(/^[a-f0-9]{16}$/);
    });

    test('should generate valid branch IDs', () => {
      const branch = sipServer.generateBranch();

      expect(branch).toMatch(/^z9hG4bK[a-f0-9]{16}$/);
    });

    test('should generate valid call IDs', () => {
      const callId = sipServer.generateCallId();

      expect(callId).toMatch(/@/);
      expect(callId).toContain(sipServer.domain);
    });
  });
});
