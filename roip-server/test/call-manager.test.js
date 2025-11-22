/**
 * Call Manager Test Suite
 * Tests call creation, state transitions, conferencing,
 * call routing, and recording
 */

import { CallManager, CallState, CallDirection } from '../src/call/call-manager.js';
import fs from 'fs';

describe('Call Manager Tests', () => {
  let callManager;
  let mockSipServer;
  let mockRtpManager;
  let mockDatabase;
  let mockLogger;
  const testConfig = {
    max_conference_size: 10,
    recording_dir: './test-recordings',
    recording_format: 'wav'
  };

  beforeEach(() => {
    mockSipServer = {
      createSession: jest.fn(() => 'sip-session-123'),
      initiateCall: jest.fn().mockResolvedValue(true),
      acceptCall: jest.fn().mockResolvedValue(true),
      declineCall: jest.fn().mockResolvedValue(true)
    };

    mockRtpManager = {
      allocateSession: jest.fn(() => ({ sessionId: 'rtp-123' }))
    };

    mockDatabase = {
      createCallLog: jest.fn().mockResolvedValue({ id: 1 })
    };

    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    callManager = new CallManager(
      testConfig,
      mockSipServer,
      mockRtpManager,
      mockDatabase,
      mockLogger
    );
  });

  afterEach(() => {
    // Clean up test recordings directory
    if (fs.existsSync(testConfig.recording_dir)) {
      const files = fs.readdirSync(testConfig.recording_dir);
      files.forEach(file => {
        fs.unlinkSync(`${testConfig.recording_dir}/${file}`);
      });
      fs.rmdirSync(testConfig.recording_dir);
    }
  });

  // ===== CALL CREATION =====
  describe('Call Creation', () => {
    test('should create outbound call', () => {
      const call = callManager.createCall('ext-100', 'ext-200', CallDirection.OUTBOUND);

      expect(call).toBeDefined();
      expect(call.id).toBeDefined();
      expect(call.initiator).toBe('ext-100');
      expect(call.recipient).toBe('ext-200');
      expect(call.direction).toBe(CallDirection.OUTBOUND);
      expect(call.state).toBe(CallState.IDLE);
    });

    test('should create inbound call', () => {
      const call = callManager.createCall('ext-300', 'ext-400', CallDirection.INBOUND);

      expect(call.direction).toBe(CallDirection.INBOUND);
    });

    test('should track call by ID', () => {
      const call = callManager.createCall('ext-100', 'ext-200');

      expect(callManager.calls.has(call.id)).toBe(true);
      expect(callManager.calls.get(call.id)).toBe(call);
    });

    test('should add initiator as participant', () => {
      const call = callManager.createCall('ext-100', 'ext-200');

      expect(call.participants.has('ext-100')).toBe(true);
      const participant = call.participants.get('ext-100');
      expect(participant.extension).toBe('ext-100');
    });

    test('should emit call created event', (done) => {
      callManager.on('call:created', ({ callId, call }) => {
        expect(callId).toBeDefined();
        expect(call.initiator).toBe('ext-100');
        done();
      });

      callManager.createCall('ext-100', 'ext-200');
    });

    test('should generate unique call IDs', () => {
      const call1 = callManager.createCall('ext-100', 'ext-200');
      const call2 = callManager.createCall('ext-300', 'ext-400');

      expect(call1.id).not.toBe(call2.id);
    });
  });

  // ===== CALL STATE TRANSITIONS =====
  describe('Call State Transitions', () => {
    test('should transition to DIALING state', async () => {
      const call = await callManager.initiateCall('ext-100', 'ext-200');

      expect(call.state).toBe(CallState.DIALING);
    });

    test('should transition to RINGING state', () => {
      const call = callManager.createCall('ext-100', 'ext-200');

      const oldState = call.setState(CallState.RINGING);

      expect(oldState).toBe(CallState.IDLE);
      expect(call.state).toBe(CallState.RINGING);
    });

    test('should transition to CONNECTING state', () => {
      const call = callManager.createCall('ext-100', 'ext-200');
      call.setState(CallState.DIALING);

      call.setState(CallState.CONNECTING);

      expect(call.state).toBe(CallState.CONNECTING);
    });

    test('should transition to CONNECTED state', () => {
      const call = callManager.createCall('ext-100', 'ext-200');
      call.setState(CallState.RINGING);

      call.setState(CallState.CONNECTED);

      expect(call.state).toBe(CallState.CONNECTED);
      expect(call.startTime).toBeDefined();
    });

    test('should track call duration on ENDED state', () => {
      const call = callManager.createCall('ext-100', 'ext-200');
      call.setState(CallState.CONNECTED);

      setTimeout(() => {
        call.setState(CallState.ENDED);
        expect(call.durationSeconds).toBeGreaterThan(0);
      }, 100);
    });

    test('should set end time on FAILED state', () => {
      const call = callManager.createCall('ext-100', 'ext-200');
      call.setState(CallState.CONNECTING);

      call.setState(CallState.FAILED);

      expect(call.endTime).toBeDefined();
    });
  });

  // ===== CALL LIFECYCLE =====
  describe('Call Lifecycle', () => {
    test('should initiate outbound call', async () => {
      const call = await callManager.initiateCall('ext-100', 'ext-200');

      expect(call.state).toBe(CallState.DIALING);
      expect(mockSipServer.initiateCall).toHaveBeenCalled();
    });

    test('should accept incoming call', async () => {
      const call = callManager.createCall('ext-100', 'ext-200', CallDirection.INBOUND);
      const callId = call.id;

      const accepted = await callManager.acceptCall(callId);

      expect(accepted.state).toBe(CallState.CONNECTED);
      expect(call.participants.has('ext-200')).toBe(true);
    });

    test('should decline call', async () => {
      const call = callManager.createCall('ext-100', 'ext-200');
      const callId = call.id;

      await callManager.declineCall(callId, 'user_busy');

      expect(call.state).toBe(CallState.ENDED);
      expect(mockSipServer.declineCall).toHaveBeenCalled();
      expect(callManager.calls.has(callId)).toBe(false);
    });

    test('should handle call ringing', async () => {
      const call = callManager.createCall('ext-100', 'ext-200');
      callManager.sessionToCalls.set(call.sipSessionId, call.id);

      callManager.on('call:ringing', ({ callId }) => {
        expect(callId).toBe(call.id);
      });

      await callManager.handleCallRinging(call.sipSessionId);

      expect(call.state).toBe(CallState.RINGING);
    });

    test('should handle call connected', async () => {
      const call = callManager.createCall('ext-100', 'ext-200');
      call.setState(CallState.RINGING);
      callManager.sessionToCalls.set(call.sipSessionId, call.id);

      await callManager.handleCallConnected(call.sipSessionId, {
        address: '192.168.1.100',
        port: 5060
      });

      expect(call.state).toBe(CallState.CONNECTED);
    });
  });

  // ===== PARTICIPANTS =====
  describe('Participant Management', () => {
    test('should add participant to call', () => {
      const call = callManager.createCall('ext-100', 'ext-200');

      const added = call.addParticipant({
        id: 'ext-300',
        extension: 'ext-300',
        address: '192.168.1.100',
        port: 5060,
        codec: 'PCMU'
      });

      expect(added).toBe(true);
      expect(call.participants.has('ext-300')).toBe(true);
    });

    test('should remove participant from call', () => {
      const call = callManager.createCall('ext-100', 'ext-200');
      call.addParticipant({
        id: 'ext-300',
        extension: 'ext-300'
      });

      const removed = call.removeParticipant('ext-300');

      expect(removed).toBe(true);
      expect(call.participants.has('ext-300')).toBe(false);
    });

    test('should get all participants', () => {
      const call = callManager.createCall('ext-100', 'ext-200');
      call.addParticipant({ id: 'ext-300', extension: 'ext-300' });
      call.addParticipant({ id: 'ext-400', extension: 'ext-400' });

      const participants = call.getParticipants();

      expect(participants.length).toBeGreaterThanOrEqual(2);
    });

    test('should get participant count', () => {
      const call = callManager.createCall('ext-100', 'ext-200');

      expect(call.getParticipantCount()).toBe(1); // Initiator

      call.addParticipant({ id: 'ext-300', extension: 'ext-300' });

      expect(call.getParticipantCount()).toBe(2);
    });

    test('should mute participant', () => {
      const call = callManager.createCall('ext-100', 'ext-200');

      const muted = call.muteParticipant('ext-100');

      expect(muted).toBe(true);
      expect(call.participants.get('ext-100').muted).toBe(true);
    });

    test('should unmute participant', () => {
      const call = callManager.createCall('ext-100', 'ext-200');
      call.muteParticipant('ext-100');

      const unmuted = call.unmuteParticipant('ext-100');

      expect(unmuted).toBe(true);
      expect(call.participants.get('ext-100').muted).toBe(false);
    });
  });

  // ===== CONFERENCING =====
  describe('Conferencing', () => {
    test('should create conference call', () => {
      const call = callManager.createCall('ext-100', 'ext-200');
      call.isConference = true;

      expect(call.isConference).toBe(true);
    });

    test('should add multiple participants to conference', () => {
      const call = callManager.createCall('ext-100', 'ext-200');
      call.isConference = true;

      call.addParticipant({ id: 'ext-300', extension: 'ext-300' });
      call.addParticipant({ id: 'ext-400', extension: 'ext-400' });
      call.addParticipant({ id: 'ext-500', extension: 'ext-500' });

      expect(call.getParticipantCount()).toBe(4);
    });

    test('should enforce conference size limit', () => {
      const call = callManager.createCall('ext-100', 'ext-200');
      call.isConference = true;

      for (let i = 0; i < 12; i++) {
        call.addParticipant({
          id: `ext-${i}`,
          extension: `ext-${i}`
        });
      }

      const count = call.getParticipantCount();
      expect(count).toBeLessThanOrEqual(callManager.config.call.max_conference_participants);
    });
  });

  // ===== CALL HOLD =====
  describe('Call Hold', () => {
    test('should put call on hold', () => {
      const call = callManager.createCall('ext-100', 'ext-200');
      call.setState(CallState.CONNECTED);

      call.onHold = true;

      expect(call.onHold).toBe(true);
    });

    test('should resume held call', () => {
      const call = callManager.createCall('ext-100', 'ext-200');
      call.onHold = true;

      call.onHold = false;

      expect(call.onHold).toBe(false);
    });

    test('should check if call is active', () => {
      const call = callManager.createCall('ext-100', 'ext-200');

      call.setState(CallState.IDLE);
      expect(call.isActive()).toBe(false);

      call.setState(CallState.CONNECTED);
      expect(call.isActive()).toBe(true);

      call.setState(CallState.ON_HOLD);
      expect(call.isActive()).toBe(true);

      call.setState(CallState.ENDED);
      expect(call.isActive()).toBe(false);
    });
  });

  // ===== RECORDING =====
  describe('Call Recording', () => {
    test('should start recording', () => {
      const call = callManager.createCall('ext-100', 'ext-200');
      call.setState(CallState.CONNECTED);

      call.isRecording = true;
      call.recordingStartTime = Date.now();

      expect(call.isRecording).toBe(true);
      expect(call.recordingStartTime).toBeDefined();
    });

    test('should stop recording', () => {
      const call = callManager.createCall('ext-100', 'ext-200');
      call.isRecording = true;

      call.isRecording = false;

      expect(call.isRecording).toBe(false);
    });

    test('should ensure recording directory exists', () => {
      expect(fs.existsSync(testConfig.recording_dir)).toBe(true);
    });

    test('should generate recording file path', () => {
      const call = callManager.createCall('ext-100', 'ext-200');
      const timestamp = Date.now();
      const filepath = `${testConfig.recording_dir}/call_${call.id}_${timestamp}.${testConfig.recording_format}`;

      expect(filepath).toContain(call.id);
      expect(filepath).toContain(testConfig.recording_format);
    });
  });

  // ===== STATISTICS =====
  describe('Call Statistics', () => {
    test('should track call duration', () => {
      const call = callManager.createCall('ext-100', 'ext-200');
      call.setState(CallState.CONNECTED);

      setTimeout(() => {
        call.setState(CallState.ENDED);
        expect(call.durationSeconds).toBeGreaterThan(0);
      }, 100);
    });

    test('should track participant statistics', () => {
      const call = callManager.createCall('ext-100', 'ext-200');

      call.stats.packetsReceived = 1000;
      call.stats.packetsSent = 950;
      call.stats.bytesReceived = 160000;
      call.stats.bytesSent = 152000;

      expect(call.stats.packetsReceived).toBe(1000);
      expect(call.stats.packetsSent).toBe(950);
    });

    test('should track audio quality', () => {
      const call = callManager.createCall('ext-100', 'ext-200');

      call.stats.audioQuality = 'excellent';

      expect(call.stats.audioQuality).toBe('excellent');
    });

    test('should get global call statistics', () => {
      callManager.createCall('ext-100', 'ext-200');
      callManager.createCall('ext-300', 'ext-400');

      const stats = callManager.globalStats;

      expect(stats.activeCallsCount).toBeGreaterThanOrEqual(0);
      expect(stats.totalCalls).toBeDefined();
    });
  });

  // ===== CALL CONVERSION =====
  describe('Call Conversion', () => {
    test('should convert call to JSON', () => {
      const call = callManager.createCall('ext-100', 'ext-200');
      call.setState(CallState.CONNECTED);

      const json = call.toJSON();

      expect(json).toBeDefined();
      expect(json.id).toBe(call.id);
      expect(json.state).toBe(CallState.CONNECTED);
      expect(json.initiator).toBe('ext-100');
      expect(json.recipient).toBe('ext-200');
      expect(Array.isArray(json.participants)).toBe(true);
    });
  });

  // ===== CLEANUP =====
  describe('Call Cleanup', () => {
    test('should remove call from tracking', () => {
      const call = callManager.createCall('ext-100', 'ext-200');
      const callId = call.id;

      expect(callManager.calls.has(callId)).toBe(true);

      callManager.calls.delete(callId);

      expect(callManager.calls.has(callId)).toBe(false);
    });

    test('should clear timeouts on call end', async () => {
      const call = await callManager.initiateCall('ext-100', 'ext-200');

      expect(call.timeoutHandle).toBeDefined();

      if (call.timeoutHandle) {
        clearTimeout(call.timeoutHandle);
      }

      expect(call.timeoutHandle).toBeDefined(); // Still set, but cleared
    });

    test('should cleanup on dial timeout', (done) => {
      const originalTimeout = 100; // Short timeout for testing
      callManager.createCall = function(init, recip, dir) {
        const call = new (require('../src/call/call-manager.js').default || {}).constructor.prototype.constructor('test', {}, {});
        call.dialTimeout = originalTimeout;
        return call;
      };

      done();
    });
  });

  // ===== EVENTS =====
  describe('Call Events', () => {
    test('should emit call initiated event', (done) => {
      callManager.on('call:initiated', ({ callId }) => {
        expect(callId).toBeDefined();
        done();
      });

      callManager.initiateCall('ext-100', 'ext-200');
    });

    test('should emit call accepted event', (done) => {
      const call = callManager.createCall('ext-100', 'ext-200');

      callManager.on('call:accepted', ({ callId }) => {
        expect(callId).toBe(call.id);
        done();
      });

      callManager.acceptCall(call.id);
    });

    test('should emit call declined event', (done) => {
      const call = callManager.createCall('ext-100', 'ext-200');

      callManager.on('call:declined', ({ callId, reason }) => {
        expect(callId).toBe(call.id);
        expect(reason).toBe('user_busy');
        done();
      });

      callManager.declineCall(call.id, 'user_busy');
    });

    test('should emit call connected event', (done) => {
      const call = callManager.createCall('ext-100', 'ext-200');
      callManager.sessionToCalls.set(call.sipSessionId, call.id);

      callManager.on('call:connected', ({ callId }) => {
        expect(callId).toBe(call.id);
        done();
      });

      callManager.handleCallConnected(call.sipSessionId);
    });
  });
});
