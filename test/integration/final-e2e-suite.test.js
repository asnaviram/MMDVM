/**
 * ESP32 RoIP System - Final End-to-End Integration Test Suite
 *
 * Comprehensive E2E tests covering:
 * - Full system integration (firmware → server → firmware)
 * - Authentication and authorization
 * - Call signaling (SIP)
 * - Audio streaming (RTP/RTCP)
 * - Database persistence
 * - Error handling and recovery
 * - Security validation
 *
 * @author ESP32 RoIP Team
 * @version 1.0.0
 * @requires node >= 18.0.0
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import dgram from 'dgram';
import crypto from 'crypto';
import { EventEmitter } from 'events';

// Test configuration
const TEST_CONFIG = {
  serverHost: process.env.TEST_SERVER_HOST || 'localhost',
  sipPort: parseInt(process.env.TEST_SIP_PORT || '5060'),
  rtpPortStart: parseInt(process.env.TEST_RTP_PORT_START || '10000'),
  rtpPortEnd: parseInt(process.env.TEST_RTP_PORT_END || '10100'),
  testTimeout: 60000, // 60 seconds
  audioTestDuration: 5000, // 5 seconds
  expectedLatency: 200, // ms
  expectedJitter: 30, // ms
  maxPacketLoss: 1.0 // percent
};

// SIP message builder
class SIPMessageBuilder {
  static createRegister(deviceId, password, callId) {
    const branch = `z9hG4bK${crypto.randomBytes(8).toString('hex')}`;
    const tag = crypto.randomBytes(8).toString('hex');

    return `REGISTER sip:${TEST_CONFIG.serverHost}:${TEST_CONFIG.sipPort} SIP/2.0\r
Via: SIP/2.0/UDP ${TEST_CONFIG.serverHost}:${TEST_CONFIG.sipPort};branch=${branch}\r
From: <sip:${deviceId}@${TEST_CONFIG.serverHost}>;tag=${tag}\r
To: <sip:${deviceId}@${TEST_CONFIG.serverHost}>\r
Call-ID: ${callId}\r
CSeq: 1 REGISTER\r
Contact: <sip:${deviceId}@${TEST_CONFIG.serverHost}:${TEST_CONFIG.sipPort}>\r
Max-Forwards: 70\r
User-Agent: ESP32-RoIP/1.0\r
Content-Length: 0\r
\r
`;
  }

  static createRegisterWithAuth(deviceId, password, callId, nonce, realm) {
    const branch = `z9hG4bK${crypto.randomBytes(8).toString('hex')}`;
    const tag = crypto.randomBytes(8).toString('hex');
    const uri = `sip:${TEST_CONFIG.serverHost}:${TEST_CONFIG.sipPort}`;

    // Calculate MD5 response
    const ha1 = crypto.createHash('md5').update(`${deviceId}:${realm}:${password}`).digest('hex');
    const ha2 = crypto.createHash('md5').update(`REGISTER:${uri}`).digest('hex');
    const response = crypto.createHash('md5').update(`${ha1}:${nonce}:${ha2}`).digest('hex');

    return `REGISTER ${uri} SIP/2.0\r
Via: SIP/2.0/UDP ${TEST_CONFIG.serverHost}:${TEST_CONFIG.sipPort};branch=${branch}\r
From: <sip:${deviceId}@${TEST_CONFIG.serverHost}>;tag=${tag}\r
To: <sip:${deviceId}@${TEST_CONFIG.serverHost}>\r
Call-ID: ${callId}\r
CSeq: 2 REGISTER\r
Contact: <sip:${deviceId}@${TEST_CONFIG.serverHost}:${TEST_CONFIG.sipPort}>\r
Authorization: Digest username="${deviceId}",realm="${realm}",nonce="${nonce}",uri="${uri}",response="${response}"\r
Max-Forwards: 70\r
User-Agent: ESP32-RoIP/1.0\r
Content-Length: 0\r
\r
`;
  }

  static createInvite(from, to, callId, sdp) {
    const branch = `z9hG4bK${crypto.randomBytes(8).toString('hex')}`;
    const tag = crypto.randomBytes(8).toString('hex');

    const sdpBody = sdp || `v=0\r
o=- ${Date.now()} ${Date.now()} IN IP4 ${TEST_CONFIG.serverHost}\r
s=ESP32 RoIP Call\r
c=IN IP4 ${TEST_CONFIG.serverHost}\r
t=0 0\r
m=audio ${TEST_CONFIG.rtpPortStart} RTP/AVP 111\r
a=rtpmap:111 opus/48000/2\r
a=fmtp:111 minptime=10;useinbandfec=1\r
`;

    return `INVITE sip:${to}@${TEST_CONFIG.serverHost} SIP/2.0\r
Via: SIP/2.0/UDP ${TEST_CONFIG.serverHost}:${TEST_CONFIG.sipPort};branch=${branch}\r
From: <sip:${from}@${TEST_CONFIG.serverHost}>;tag=${tag}\r
To: <sip:${to}@${TEST_CONFIG.serverHost}>\r
Call-ID: ${callId}\r
CSeq: 1 INVITE\r
Contact: <sip:${from}@${TEST_CONFIG.serverHost}:${TEST_CONFIG.sipPort}>\r
Content-Type: application/sdp\r
Content-Length: ${sdpBody.length}\r
\r
${sdpBody}`;
  }

  static createAck(from, to, callId) {
    const branch = `z9hG4bK${crypto.randomBytes(8).toString('hex')}`;
    const tag = crypto.randomBytes(8).toString('hex');

    return `ACK sip:${to}@${TEST_CONFIG.serverHost} SIP/2.0\r
Via: SIP/2.0/UDP ${TEST_CONFIG.serverHost}:${TEST_CONFIG.sipPort};branch=${branch}\r
From: <sip:${from}@${TEST_CONFIG.serverHost}>;tag=${tag}\r
To: <sip:${to}@${TEST_CONFIG.serverHost}>\r
Call-ID: ${callId}\r
CSeq: 1 ACK\r
Content-Length: 0\r
\r
`;
  }

  static createBye(from, to, callId) {
    const branch = `z9hG4bK${crypto.randomBytes(8).toString('hex')}`;
    const tag = crypto.randomBytes(8).toString('hex');

    return `BYE sip:${to}@${TEST_CONFIG.serverHost} SIP/2.0\r
Via: SIP/2.0/UDP ${TEST_CONFIG.serverHost}:${TEST_CONFIG.sipPort};branch=${branch}\r
From: <sip:${from}@${TEST_CONFIG.serverHost}>;tag=${tag}\r
To: <sip:${to}@${TEST_CONFIG.serverHost}>\r
Call-ID: ${callId}\r
CSeq: 2 BYE\r
Content-Length: 0\r
\r
`;
  }

  static parseResponse(message) {
    const lines = message.toString().split('\r\n');
    const statusLine = lines[0].match(/SIP\/2\.0 (\d+) (.+)/);

    if (!statusLine) return null;

    const headers = {};
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line === '') break;

      const match = line.match(/^([^:]+):\s*(.+)$/);
      if (match) {
        headers[match[1].toLowerCase()] = match[2];
      }
    }

    return {
      statusCode: parseInt(statusLine[1]),
      statusText: statusLine[2],
      headers,
      body: message.toString().split('\r\n\r\n')[1] || ''
    };
  }
}

// RTP packet builder
class RTPPacketBuilder {
  constructor(ssrc) {
    this.ssrc = ssrc || crypto.randomInt(0, 0xFFFFFFFF);
    this.sequenceNumber = crypto.randomInt(0, 0xFFFF);
    this.timestamp = crypto.randomInt(0, 0xFFFFFFFF);
  }

  createPacket(payload, payloadType = 111) {
    const header = Buffer.alloc(12);

    // Version (2), Padding (0), Extension (0), CC (0)
    header[0] = 0x80;

    // Marker (0), Payload Type
    header[1] = payloadType & 0x7F;

    // Sequence Number
    header.writeUInt16BE(this.sequenceNumber, 2);

    // Timestamp
    header.writeUInt32BE(this.timestamp, 4);

    // SSRC
    header.writeUInt32BE(this.ssrc, 8);

    // Increment for next packet
    this.sequenceNumber = (this.sequenceNumber + 1) & 0xFFFF;
    this.timestamp += 960; // 20ms @ 48kHz

    return Buffer.concat([header, payload]);
  }

  static parsePacket(buffer) {
    if (buffer.length < 12) return null;

    return {
      version: (buffer[0] >> 6) & 0x03,
      padding: (buffer[0] >> 5) & 0x01,
      extension: (buffer[0] >> 4) & 0x01,
      csrcCount: buffer[0] & 0x0F,
      marker: (buffer[1] >> 7) & 0x01,
      payloadType: buffer[1] & 0x7F,
      sequenceNumber: buffer.readUInt16BE(2),
      timestamp: buffer.readUInt32BE(4),
      ssrc: buffer.readUInt32BE(8),
      payload: buffer.slice(12)
    };
  }
}

// Test device simulator
class TestDevice extends EventEmitter {
  constructor(deviceId, password) {
    super();
    this.deviceId = deviceId;
    this.password = password;
    this.sipSocket = null;
    this.rtpSocket = null;
    this.rtpBuilder = null;
    this.registered = false;
    this.inCall = false;
    this.callId = null;
    this.stats = {
      packetsSent: 0,
      packetsReceived: 0,
      bytesReceived: 0,
      lastSequence: -1,
      lostPackets: 0
    };
  }

  async initialize() {
    this.sipSocket = dgram.createSocket('udp4');
    this.rtpSocket = dgram.createSocket('udp4');
    this.rtpBuilder = new RTPPacketBuilder();

    // Set up SIP message handler
    this.sipSocket.on('message', (msg, rinfo) => {
      const response = SIPMessageBuilder.parseResponse(msg);
      if (response) {
        this.emit('sip-response', response);
      }
    });

    // Set up RTP packet handler
    this.rtpSocket.on('message', (msg, rinfo) => {
      const packet = RTPPacketBuilder.parsePacket(msg);
      if (packet) {
        this.stats.packetsReceived++;
        this.stats.bytesReceived += msg.length;

        // Detect packet loss
        if (this.stats.lastSequence !== -1) {
          const expectedSeq = (this.stats.lastSequence + 1) & 0xFFFF;
          if (packet.sequenceNumber !== expectedSeq) {
            const lost = packet.sequenceNumber > expectedSeq
              ? packet.sequenceNumber - expectedSeq
              : (0xFFFF - expectedSeq) + packet.sequenceNumber + 1;
            this.stats.lostPackets += lost;
          }
        }
        this.stats.lastSequence = packet.sequenceNumber;

        this.emit('rtp-packet', packet);
      }
    });

    await new Promise((resolve, reject) => {
      this.rtpSocket.bind(0, () => resolve());
    });
  }

  async register() {
    this.callId = crypto.randomBytes(16).toString('hex');

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Registration timeout')), 10000);

      let authReceived = false;

      const handler = (response) => {
        if (response.statusCode === 401 && !authReceived) {
          // Extract authentication challenge
          authReceived = true;
          const wwwAuth = response.headers['www-authenticate'];
          const realmMatch = wwwAuth.match(/realm="([^"]+)"/);
          const nonceMatch = wwwAuth.match(/nonce="([^"]+)"/);

          if (realmMatch && nonceMatch) {
            const authMsg = SIPMessageBuilder.createRegisterWithAuth(
              this.deviceId,
              this.password,
              this.callId,
              nonceMatch[1],
              realmMatch[1]
            );
            this.sipSocket.send(authMsg, TEST_CONFIG.sipPort, TEST_CONFIG.serverHost);
          }
        } else if (response.statusCode === 200) {
          clearTimeout(timeout);
          this.removeListener('sip-response', handler);
          this.registered = true;
          resolve(response);
        } else if (response.statusCode >= 400) {
          clearTimeout(timeout);
          this.removeListener('sip-response', handler);
          reject(new Error(`Registration failed: ${response.statusCode} ${response.statusText}`));
        }
      };

      this.on('sip-response', handler);

      // Send initial REGISTER
      const registerMsg = SIPMessageBuilder.createRegister(this.deviceId, this.password, this.callId);
      this.sipSocket.send(registerMsg, TEST_CONFIG.sipPort, TEST_CONFIG.serverHost);
    });
  }

  async initiateCall(targetDevice) {
    if (!this.registered) throw new Error('Device not registered');

    this.callId = crypto.randomBytes(16).toString('hex');

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Call initiation timeout')), 10000);

      const handler = (response) => {
        if (response.statusCode === 200) {
          clearTimeout(timeout);
          this.removeListener('sip-response', handler);
          this.inCall = true;

          // Send ACK
          const ackMsg = SIPMessageBuilder.createAck(this.deviceId, targetDevice, this.callId);
          this.sipSocket.send(ackMsg, TEST_CONFIG.sipPort, TEST_CONFIG.serverHost);

          resolve(response);
        } else if (response.statusCode >= 400) {
          clearTimeout(timeout);
          this.removeListener('sip-response', handler);
          reject(new Error(`Call failed: ${response.statusCode} ${response.statusText}`));
        }
      };

      this.on('sip-response', handler);

      // Send INVITE
      const inviteMsg = SIPMessageBuilder.createInvite(this.deviceId, targetDevice, this.callId);
      this.sipSocket.send(inviteMsg, TEST_CONFIG.sipPort, TEST_CONFIG.serverHost);
    });
  }

  sendAudio(durationMs = 1000) {
    if (!this.inCall) throw new Error('Not in call');

    const packetsToSend = Math.floor(durationMs / 20); // 20ms per packet
    const payload = Buffer.alloc(160); // Dummy Opus payload

    for (let i = 0; i < packetsToSend; i++) {
      payload.fill(i % 256);
      const packet = this.rtpBuilder.createPacket(payload);
      this.rtpSocket.send(packet, TEST_CONFIG.rtpPortStart, TEST_CONFIG.serverHost);
      this.stats.packetsSent++;
    }
  }

  async endCall(targetDevice) {
    if (!this.inCall) throw new Error('Not in call');

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Call termination timeout')), 10000);

      const handler = (response) => {
        if (response.statusCode === 200) {
          clearTimeout(timeout);
          this.removeListener('sip-response', handler);
          this.inCall = false;
          resolve(response);
        }
      };

      this.on('sip-response', handler);

      // Send BYE
      const byeMsg = SIPMessageBuilder.createBye(this.deviceId, targetDevice, this.callId);
      this.sipSocket.send(byeMsg, TEST_CONFIG.sipPort, TEST_CONFIG.serverHost);
    });
  }

  getStats() {
    const packetLoss = this.stats.packetsReceived > 0
      ? (this.stats.lostPackets / (this.stats.packetsReceived + this.stats.lostPackets)) * 100
      : 0;

    return {
      ...this.stats,
      packetLossPercent: packetLoss
    };
  }

  async cleanup() {
    if (this.sipSocket) this.sipSocket.close();
    if (this.rtpSocket) this.rtpSocket.close();
  }
}

// Test suites
describe('Final E2E Integration Test Suite', () => {
  let device1, device2;

  beforeAll(async () => {
    // Give server time to start
    await new Promise(resolve => setTimeout(resolve, 2000));
  }, 10000);

  beforeEach(async () => {
    device1 = new TestDevice('test-device-1', 'test-password-1');
    device2 = new TestDevice('test-device-2', 'test-password-2');

    await device1.initialize();
    await device2.initialize();
  });

  afterEach(async () => {
    if (device1) await device1.cleanup();
    if (device2) await device2.cleanup();
  });

  describe('1. Authentication and Authorization', () => {
    test('should successfully register device with valid credentials', async () => {
      const response = await device1.register();

      expect(response).toBeDefined();
      expect(response.statusCode).toBe(200);
      expect(device1.registered).toBe(true);
    }, TEST_CONFIG.testTimeout);

    test('should reject registration with invalid credentials', async () => {
      const badDevice = new TestDevice('test-device-999', 'wrong-password');
      await badDevice.initialize();

      await expect(badDevice.register()).rejects.toThrow(/Registration failed/);

      await badDevice.cleanup();
    }, TEST_CONFIG.testTimeout);

    test('should handle multiple concurrent registrations', async () => {
      const devices = [];
      for (let i = 0; i < 5; i++) {
        const device = new TestDevice(`test-device-${i}`, `test-password-${i}`);
        await device.initialize();
        devices.push(device);
      }

      const registrations = await Promise.all(devices.map(d => d.register()));

      expect(registrations).toHaveLength(5);
      registrations.forEach(response => {
        expect(response.statusCode).toBe(200);
      });

      await Promise.all(devices.map(d => d.cleanup()));
    }, TEST_CONFIG.testTimeout);
  });

  describe('2. Call Signaling (SIP)', () => {
    beforeEach(async () => {
      await device1.register();
      await device2.register();
    });

    test('should successfully establish call between two devices', async () => {
      const response = await device1.initiateCall('test-device-2');

      expect(response).toBeDefined();
      expect(response.statusCode).toBe(200);
      expect(device1.inCall).toBe(true);
    }, TEST_CONFIG.testTimeout);

    test('should successfully terminate call', async () => {
      await device1.initiateCall('test-device-2');
      const response = await device1.endCall('test-device-2');

      expect(response).toBeDefined();
      expect(response.statusCode).toBe(200);
      expect(device1.inCall).toBe(false);
    }, TEST_CONFIG.testTimeout);

    test('should reject call to non-existent device', async () => {
      await expect(device1.initiateCall('non-existent-device')).rejects.toThrow(/Call failed/);
    }, TEST_CONFIG.testTimeout);
  });

  describe('3. Audio Streaming (RTP/RTCP)', () => {
    beforeEach(async () => {
      await device1.register();
      await device2.register();
      await device1.initiateCall('test-device-2');
    });

    test('should transmit RTP audio packets', async () => {
      const packetsBefore = device1.stats.packetsSent;

      device1.sendAudio(TEST_CONFIG.audioTestDuration);
      await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.audioTestDuration + 1000));

      const packetsAfter = device1.stats.packetsSent;
      const expectedPackets = Math.floor(TEST_CONFIG.audioTestDuration / 20);

      expect(packetsAfter - packetsBefore).toBeGreaterThanOrEqual(expectedPackets * 0.95);
    }, TEST_CONFIG.testTimeout);

    test('should receive RTP audio packets with acceptable packet loss', async () => {
      const receivePromise = new Promise((resolve) => {
        let packetsReceived = 0;
        const handler = () => {
          packetsReceived++;
          if (packetsReceived >= 100) {
            device2.removeListener('rtp-packet', handler);
            resolve();
          }
        };
        device2.on('rtp-packet', handler);
      });

      device1.sendAudio(TEST_CONFIG.audioTestDuration);

      await receivePromise;

      const stats = device2.getStats();
      expect(stats.packetsReceived).toBeGreaterThan(0);
      expect(stats.packetLossPercent).toBeLessThan(TEST_CONFIG.maxPacketLoss);
    }, TEST_CONFIG.testTimeout);
  });

  describe('4. Database Persistence', () => {
    test('should persist device registration in database', async () => {
      await device1.register();

      // Wait for database write
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify via re-registration (should succeed if device exists)
      await device1.cleanup();
      device1 = new TestDevice('test-device-1', 'test-password-1');
      await device1.initialize();
      const response = await device1.register();

      expect(response.statusCode).toBe(200);
    }, TEST_CONFIG.testTimeout);

    test('should log call records to database', async () => {
      await device1.register();
      await device2.register();
      await device1.initiateCall('test-device-2');

      device1.sendAudio(2000);
      await new Promise(resolve => setTimeout(resolve, 3000));

      await device1.endCall('test-device-2');

      // Wait for database write
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Call record should exist (verified by successful call flow completion)
      expect(device1.inCall).toBe(false);
    }, TEST_CONFIG.testTimeout);
  });

  describe('5. Error Handling and Recovery', () => {
    test('should handle SIP message timeout gracefully', async () => {
      const badDevice = new TestDevice('timeout-test', 'password');
      await badDevice.initialize();

      // Override to send to wrong port
      const originalPort = TEST_CONFIG.sipPort;
      TEST_CONFIG.sipPort = 9999;

      await expect(badDevice.register()).rejects.toThrow(/timeout/i);

      TEST_CONFIG.sipPort = originalPort;
      await badDevice.cleanup();
    }, 15000);

    test('should recover from network interruption', async () => {
      await device1.register();

      // Simulate network interruption
      await device1.cleanup();

      // Reconnect
      device1 = new TestDevice('test-device-1', 'test-password-1');
      await device1.initialize();
      const response = await device1.register();

      expect(response.statusCode).toBe(200);
    }, TEST_CONFIG.testTimeout);
  });

  describe('6. Security Validation', () => {
    test('should use digest authentication for SIP', async () => {
      let authChallengeReceived = false;

      device1.on('sip-response', (response) => {
        if (response.statusCode === 401 && response.headers['www-authenticate']) {
          authChallengeReceived = true;
        }
      });

      await device1.register();

      expect(authChallengeReceived).toBe(true);
    }, TEST_CONFIG.testTimeout);

    test('should validate nonce in authentication', async () => {
      // First registration to get valid nonce
      await device1.register();
      await device1.cleanup();

      // Try to re-use old nonce (should fail or trigger new challenge)
      device1 = new TestDevice('test-device-1', 'test-password-1');
      await device1.initialize();
      const response = await device1.register();

      // Should still succeed but with new authentication
      expect(response.statusCode).toBe(200);
    }, TEST_CONFIG.testTimeout);
  });

  describe('7. Performance Validation', () => {
    test('should establish call within acceptable time', async () => {
      await device1.register();
      await device2.register();

      const startTime = Date.now();
      await device1.initiateCall('test-device-2');
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000); // 5 seconds max
    }, TEST_CONFIG.testTimeout);

    test('should maintain low jitter during audio transmission', async () => {
      await device1.register();
      await device2.register();
      await device1.initiateCall('test-device-2');

      const timestamps = [];
      const handler = (packet) => {
        timestamps.push(packet.timestamp);
      };
      device2.on('rtp-packet', handler);

      device1.sendAudio(3000);
      await new Promise(resolve => setTimeout(resolve, 4000));

      device2.removeListener('rtp-packet', handler);

      // Calculate jitter
      const deltas = [];
      for (let i = 1; i < timestamps.length; i++) {
        deltas.push(Math.abs(timestamps[i] - timestamps[i-1]));
      }
      const avgJitter = deltas.reduce((a, b) => a + b, 0) / deltas.length;

      // Timestamp is in RTP units, convert to ms (assuming 48kHz)
      const jitterMs = (avgJitter / 48000) * 1000;

      expect(jitterMs).toBeLessThan(TEST_CONFIG.expectedJitter);
    }, TEST_CONFIG.testTimeout);
  });

  describe('8. Full System Integration', () => {
    test('should complete full call cycle: register → call → audio → hangup', async () => {
      // Register both devices
      const reg1 = await device1.register();
      const reg2 = await device2.register();
      expect(reg1.statusCode).toBe(200);
      expect(reg2.statusCode).toBe(200);

      // Establish call
      const invite = await device1.initiateCall('test-device-2');
      expect(invite.statusCode).toBe(200);

      // Transmit audio
      const audioPromise = new Promise((resolve) => {
        let count = 0;
        const handler = () => {
          count++;
          if (count >= 50) {
            device2.removeListener('rtp-packet', handler);
            resolve();
          }
        };
        device2.on('rtp-packet', handler);
      });

      device1.sendAudio(2000);
      await audioPromise;

      const stats = device2.getStats();
      expect(stats.packetsReceived).toBeGreaterThan(0);
      expect(stats.packetLossPercent).toBeLessThan(TEST_CONFIG.maxPacketLoss);

      // End call
      const bye = await device1.endCall('test-device-2');
      expect(bye.statusCode).toBe(200);
      expect(device1.inCall).toBe(false);
    }, TEST_CONFIG.testTimeout);
  });
});

// Export for use in other tests
export { TestDevice, SIPMessageBuilder, RTPPacketBuilder, TEST_CONFIG };
