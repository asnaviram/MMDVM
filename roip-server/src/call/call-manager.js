/**
 * Call Manager
 * Manages call lifecycle, routing, conferencing, recording, and statistics
 * Integrates with SIP and RTP for full VoIP call handling
 */

import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import crypto from 'crypto';

/**
 * Call state enumeration
 */
export const CallState = {
  IDLE: 'idle',
  DIALING: 'dialing',
  RINGING: 'ringing',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ON_HOLD: 'on_hold',
  RECORDING: 'recording',
  TRANSFERRING: 'transferring',
  DISCONNECTING: 'disconnecting',
  ENDED: 'ended',
  FAILED: 'failed'
};

/**
 * Call direction enumeration
 */
export const CallDirection = {
  INBOUND: 'inbound',
  OUTBOUND: 'outbound'
};

/**
 * Individual call representation
 */
class Call {
  constructor(callId, config, logger) {
    this.id = callId;
    this.config = config;
    this.logger = logger;

    // Call metadata
    this.state = CallState.IDLE;
    this.direction = null;
    this.startTime = null;
    this.endTime = null;
    this.durationSeconds = 0;

    // Participants
    this.initiator = null;
    this.recipient = null;
    this.participants = new Map(); // Map of participant ID -> participant info

    // SIP and RTP
    this.sipSessionId = null;
    this.rtpSessions = new Map(); // Map of participant ID -> RTP session

    // Call features
    this.isRecording = false;
    this.recordingFilePath = null;
    this.recordingStartTime = null;
    this.recordingData = [];
    this.isConference = false;
    this.onHold = false;
    this.transferTarget = null;

    // Timeouts
    this.timeoutHandle = null;
    this.dialTimeout = config.call.dial_timeout || 30000;
    this.ringTimeout = config.call.ring_timeout || 60000;
    this.idleTimeout = config.call.idle_timeout || 600000; // 10 minutes

    // Statistics
    this.stats = {
      packetsReceived: 0,
      packetsSent: 0,
      bytesReceived: 0,
      bytesSent: 0,
      packetsLost: 0,
      jitter: 0,
      latency: 0,
      audioQuality: 'excellent'
    };
  }

  /**
   * Add participant to call
   */
  addParticipant(participantInfo) {
    const { id, extension, address, port, codec } = participantInfo;

    // Check conference size limit if this is a conference
    if (this.isConference) {
      const maxParticipants = this.config.call.max_conference_participants || 10;
      if (this.participants.size >= maxParticipants) {
        this.logger?.warn?.(`Cannot add participant: conference at maximum capacity (${maxParticipants})`);
        return false;
      }
    }

    this.participants.set(id, {
      id,
      extension,
      address,
      port,
      codec,
      joinedAt: Date.now(),
      muted: false,
      volume: 100,
      audioStream: null
    });
    return true;
  }

  /**
   * Remove participant from call
   */
  removeParticipant(participantId) {
    return this.participants.delete(participantId);
  }

  /**
   * Get all participants
   */
  getParticipants() {
    return Array.from(this.participants.values());
  }

  /**
   * Get participant count
   */
  getParticipantCount() {
    return this.participants.size;
  }

  /**
   * Set call state
   */
  setState(newState) {
    const oldState = this.state;
    this.state = newState;

    // Handle timing for duration tracking
    if (newState === CallState.CONNECTED && !this.startTime) {
      this.startTime = Date.now();
    } else if (newState === CallState.ENDED || newState === CallState.FAILED) {
      this.endTime = Date.now();
      if (this.startTime) {
        this.durationSeconds = Math.floor((this.endTime - this.startTime) / 1000);
      }
    }

    this.logger.debug(`Call ${this.id} state changed: ${oldState} -> ${newState}`);
    return oldState;
  }

  /**
   * Mute participant
   */
  muteParticipant(participantId) {
    const participant = this.participants.get(participantId);
    if (participant) {
      participant.muted = true;
      return true;
    }
    return false;
  }

  /**
   * Unmute participant
   */
  unmuteParticipant(participantId) {
    const participant = this.participants.get(participantId);
    if (participant) {
      participant.muted = false;
      return true;
    }
    return false;
  }

  /**
   * Check if call is active
   */
  isActive() {
    return [CallState.CONNECTED, CallState.RECORDING, CallState.ON_HOLD, CallState.TRANSFERRING]
      .includes(this.state);
  }

  /**
   * Convert to JSON
   */
  toJSON() {
    return {
      id: this.id,
      state: this.state,
      direction: this.direction,
      initiator: this.initiator,
      recipient: this.recipient,
      participants: this.getParticipants(),
      isRecording: this.isRecording,
      isConference: this.isConference,
      onHold: this.onHold,
      durationSeconds: this.durationSeconds,
      startTime: this.startTime,
      stats: this.stats
    };
  }
}

/**
 * Call Manager - Main class
 */
export class CallManager extends EventEmitter {
  constructor(routingConfig, sipServer, rtpManager, database, logger) {
    super();

    this.routingConfig = routingConfig;
    this.sipServer = sipServer;
    this.rtpManager = rtpManager;
    this.database = database;
    this.logger = logger;

    // Active calls store
    this.calls = new Map(); // callId -> Call
    this.extensionToCalls = new Map(); // extension -> Set<callId>
    this.sessionToCalls = new Map(); // SIP session ID -> callId

    // Configuration
    this.config = {
      call: {
        dial_timeout: 30000,
        ring_timeout: 60000,
        idle_timeout: 600000,
        max_conference_participants: routingConfig.max_conference_size || 10,
        recording_dir: routingConfig.recording_dir || './recordings',
        recording_format: routingConfig.recording_format || 'wav'
      },
      routing: routingConfig
    };

    // Create recording directory if needed
    this.ensureRecordingDirectory();

    // Statistics
    this.globalStats = {
      totalCalls: 0,
      activeCallsCount: 0,
      totalDuration: 0,
      failedCalls: 0,
      recordedCalls: 0,
      conferenceCalls: 0,
      startTime: Date.now(),
      callsByExtension: {},
      callsByHour: {}
    };

    // Setup periodic cleanup
    this.startCleanupInterval();

    this.logger.info('CallManager initialized with configuration:', {
      maxConferenceParticipants: this.config.call.max_conference_participants,
      recordingDir: this.config.call.recording_dir,
      dialTimeout: this.config.call.dial_timeout
    });
  }

  /**
   * Ensure recording directory exists
   */
  ensureRecordingDirectory() {
    const dir = this.config.call.recording_dir;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      this.logger.info(`Recording directory created: ${dir}`);
    }
  }

  /**
   * Create a new call
   */
  createCall(initiatorExtension, recipientExtension, direction = CallDirection.OUTBOUND) {
    const callId = this.generateCallId();
    const call = new Call(callId, this.config, this.logger);

    call.direction = direction;
    call.initiator = initiatorExtension;
    call.recipient = recipientExtension;
    call.sipSessionId = this.sipServer?.createSession?.() || `sip-${callId}`;

    // Add initiator as participant
    call.addParticipant({
      id: initiatorExtension,
      extension: initiatorExtension,
      address: '0.0.0.0',
      port: 0,
      codec: 'PCMU'
    });

    this.calls.set(callId, call);
    this.sessionToCalls.set(call.sipSessionId, callId);
    this.addExtensionCall(initiatorExtension, callId);

    this.logger.info(`Call created: ${callId}`, {
      initiator: initiatorExtension,
      recipient: recipientExtension,
      direction: direction
    });

    this.emit('call:created', { callId, call: call.toJSON() });
    return call;
  }

  /**
   * Initiate outbound call
   */
  async initiateCall(initiatorExtension, recipientExtension) {
    try {
      const call = this.createCall(initiatorExtension, recipientExtension, CallDirection.OUTBOUND);
      call.setState(CallState.DIALING);

      // Set dial timeout
      call.timeoutHandle = setTimeout(() => {
        this.logger.warn(`Call ${call.id} dial timeout`);
        this.endCall(call.id, 'dial_timeout');
      }, call.dialTimeout);

      // Notify SIP server to initiate INVITE
      if (this.sipServer?.initiateCall) {
        await this.sipServer.initiateCall(call.sipSessionId, recipientExtension);
      }

      this.emit('call:initiated', { callId: call.id, call: call.toJSON() });
      return call;
    } catch (error) {
      this.logger.error(`Failed to initiate call: ${error.message}`, { error });
      throw error;
    }
  }

  /**
   * Accept incoming call
   */
  async acceptCall(callId) {
    try {
      const call = this.calls.get(callId);
      if (!call) throw new Error(`Call ${callId} not found`);

      // Clear ring timeout
      if (call.timeoutHandle) {
        clearTimeout(call.timeoutHandle);
      }

      call.setState(CallState.CONNECTING);

      // Add recipient as participant
      call.addParticipant({
        id: call.recipient,
        extension: call.recipient,
        address: '0.0.0.0',
        port: 0,
        codec: 'PCMU'
      });

      // Notify SIP server
      if (this.sipServer?.acceptCall) {
        await this.sipServer.acceptCall(call.sipSessionId);
      }

      // Allocate RTP sessions
      await this.allocateRTPSessions(call);

      call.setState(CallState.CONNECTED);

      this.logger.info(`Call ${callId} accepted`);
      this.emit('call:accepted', { callId: call.id, call: call.toJSON() });

      return call;
    } catch (error) {
      this.logger.error(`Failed to accept call ${callId}: ${error.message}`, { error });
      throw error;
    }
  }

  /**
   * Decline incoming call
   */
  async declineCall(callId, reason = 'user_busy') {
    try {
      const call = this.calls.get(callId);
      if (!call) throw new Error(`Call ${callId} not found`);

      if (call.timeoutHandle) {
        clearTimeout(call.timeoutHandle);
      }

      call.setState(CallState.ENDED);

      // Notify SIP server
      if (this.sipServer?.declineCall) {
        await this.sipServer.declineCall(call.sipSessionId, reason);
      }

      this.logger.info(`Call ${callId} declined: ${reason}`);
      this.emit('call:declined', { callId: call.id, reason });

      // Clean up
      this.removeCall(callId);
      return true;
    } catch (error) {
      this.logger.error(`Failed to decline call ${callId}: ${error.message}`, { error });
      throw error;
    }
  }

  /**
   * Handle incoming call ringing
   */
  async handleCallRinging(sipSessionId) {
    const callId = this.sessionToCalls.get(sipSessionId);
    if (!callId) {
      this.logger.warn(`Received ringing for unknown session: ${sipSessionId}`);
      return;
    }

    const call = this.calls.get(callId);
    if (!call) return;

    call.setState(CallState.RINGING);

    // Set ring timeout
    call.timeoutHandle = setTimeout(() => {
      this.logger.warn(`Call ${callId} ring timeout`);
      this.endCall(callId, 'ring_timeout');
    }, call.ringTimeout);

    this.emit('call:ringing', { callId, call: call.toJSON() });
  }

  /**
   * Handle call connection established
   */
  async handleCallConnected(sipSessionId, remoteInfo) {
    const callId = this.sessionToCalls.get(sipSessionId);
    if (!callId) return;

    const call = this.calls.get(callId);
    if (!call) return;

    if (call.timeoutHandle) {
      clearTimeout(call.timeoutHandle);
    }

    // Update participant info with remote address
    const participants = Array.from(call.participants.values());
    if (participants.length > 0 && remoteInfo) {
      participants[participants.length - 1].address = remoteInfo.address;
      participants[participants.length - 1].port = remoteInfo.port;
    }

    call.setState(CallState.CONNECTED);

    // Allocate RTP sessions if not already done
    if (call.rtpSessions.size === 0) {
      await this.allocateRTPSessions(call);
    }

    this.logger.info(`Call ${callId} connected`);
    this.emit('call:connected', { callId, call: call.toJSON() });
  }

  /**
   * Allocate RTP sessions for call participants
   */
  async allocateRTPSessions(call) {
    try {
      const participants = call.getParticipants();

      for (const participant of participants) {
        if (!call.rtpSessions.has(participant.id)) {
          const rtpSession = this.rtpManager?.allocateSession?.({
            sessionId: `${call.id}-${participant.id}`,
            callId: call.id,
            participantId: participant.id,
            codec: participant.codec || 'PCMU',
            sampleRate: 8000,
            channels: 1,
            payloadType: 0 // PCMU
          });

          if (rtpSession) {
            call.rtpSessions.set(participant.id, rtpSession);
            this.logger.debug(`RTP session allocated for participant ${participant.id} in call ${call.id}`);
          }
        }
      }

      return true;
    } catch (error) {
      this.logger.error(`Failed to allocate RTP sessions for call ${call.id}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Start call recording
   */
  async startRecording(callId) {
    try {
      const call = this.calls.get(callId);
      if (!call) throw new Error(`Call ${callId} not found`);

      if (call.isRecording) {
        this.logger.warn(`Call ${callId} is already recording`);
        return false;
      }

      // Generate recording file path
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `call-${callId}-${timestamp}.${this.config.call.recording_format}`;
      call.recordingFilePath = path.join(this.config.call.recording_dir, filename);

      call.isRecording = true;
      call.recordingStartTime = Date.now();
      call.recordingData = [];

      // Update call state if not already recording
      if (call.state === CallState.CONNECTED) {
        call.setState(CallState.RECORDING);
      }

      this.logger.info(`Recording started for call ${callId}: ${call.recordingFilePath}`);
      this.emit('recording:started', { callId, filePath: call.recordingFilePath });

      return true;
    } catch (error) {
      this.logger.error(`Failed to start recording for call ${callId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Stop call recording and save to file
   */
  async stopRecording(callId) {
    try {
      const call = this.calls.get(callId);
      if (!call) throw new Error(`Call ${callId} not found`);

      if (!call.isRecording) {
        this.logger.warn(`Call ${callId} is not recording`);
        return false;
      }

      call.isRecording = false;

      // Save recording data to file (simplified - in production would use proper audio encoding)
      if (call.recordingFilePath && call.recordingData.length > 0) {
        const buffer = Buffer.concat(call.recordingData);
        fs.writeFileSync(call.recordingFilePath, buffer);

        const duration = Math.floor((Date.now() - call.recordingStartTime) / 1000);
        this.logger.info(`Recording stopped for call ${callId}: ${call.recordingFilePath} (${duration}s)`);

        this.emit('recording:stopped', {
          callId,
          filePath: call.recordingFilePath,
          duration
        });
      }

      // Clear recording data
      call.recordingData = [];

      return true;
    } catch (error) {
      this.logger.error(`Failed to stop recording for call ${callId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Add audio data to call recording
   */
  addRecordingData(callId, audioData) {
    const call = this.calls.get(callId);
    if (call && call.isRecording) {
      call.recordingData.push(audioData);
    }
  }

  /**
   * Start conference with multiple participants
   */
  async startConference(initiatorExtension, participantExtensions) {
    try {
      if (participantExtensions.length < 2) {
        throw new Error('Conference requires at least 2 participants');
      }

      if (participantExtensions.length > this.config.call.max_conference_participants) {
        throw new Error(
          `Conference size exceeds maximum of ${this.config.call.max_conference_participants}`
        );
      }

      const conferenceId = this.generateCallId();
      const conference = new Call(conferenceId, this.config, this.logger);

      conference.direction = CallDirection.OUTBOUND;
      conference.initiator = initiatorExtension;
      conference.isConference = true;
      conference.sipSessionId = this.sipServer?.createSession?.() || `sip-${conferenceId}`;

      // Add all participants
      for (const extension of participantExtensions) {
        conference.addParticipant({
          id: extension,
          extension: extension,
          address: '0.0.0.0',
          port: 0,
          codec: 'PCMU'
        });
      }

      this.calls.set(conferenceId, conference);
      this.sessionToCalls.set(conference.sipSessionId, conferenceId);

      for (const extension of participantExtensions) {
        this.addExtensionCall(extension, conferenceId);
      }

      conference.setState(CallState.CONNECTING);

      // Allocate RTP sessions
      await this.allocateRTPSessions(conference);

      conference.setState(CallState.CONNECTED);

      this.globalStats.conferenceCalls++;

      this.logger.info(`Conference ${conferenceId} started with ${participantExtensions.length} participants`);
      this.emit('conference:started', {
        conferenceId,
        participants: participantExtensions,
        conference: conference.toJSON()
      });

      return conference;
    } catch (error) {
      this.logger.error(`Failed to start conference: ${error.message}`);
      throw error;
    }
  }

  /**
   * Add participant to conference
   */
  async addConferenceParticipant(conferenceId, extension) {
    try {
      const call = this.calls.get(conferenceId);
      if (!call) throw new Error(`Conference ${conferenceId} not found`);
      if (!call.isConference) throw new Error(`Call ${conferenceId} is not a conference`);

      if (call.getParticipantCount() >= this.config.call.max_conference_participants) {
        throw new Error(`Conference is at maximum capacity`);
      }

      call.addParticipant({
        id: extension,
        extension: extension,
        address: '0.0.0.0',
        port: 0,
        codec: 'PCMU'
      });

      this.addExtensionCall(extension, conferenceId);

      // Allocate RTP session for new participant
      const rtpSession = this.rtpManager?.allocateSession?.({
        sessionId: `${conferenceId}-${extension}`,
        callId: conferenceId,
        participantId: extension,
        codec: 'PCMU'
      });

      if (rtpSession) {
        call.rtpSessions.set(extension, rtpSession);
      }

      this.logger.info(`Participant ${extension} added to conference ${conferenceId}`);
      this.emit('conference:participantAdded', {
        conferenceId,
        extension,
        participantCount: call.getParticipantCount()
      });

      return true;
    } catch (error) {
      this.logger.error(`Failed to add participant to conference: ${error.message}`);
      throw error;
    }
  }

  /**
   * Remove participant from conference
   */
  async removeConferenceParticipant(conferenceId, extension) {
    try {
      const call = this.calls.get(conferenceId);
      if (!call) throw new Error(`Conference ${conferenceId} not found`);

      call.removeParticipant(extension);

      // Release RTP session
      const rtpSession = call.rtpSessions.get(extension);
      if (rtpSession && this.rtpManager?.releaseSession) {
        this.rtpManager.releaseSession(rtpSession.sessionId);
      }
      call.rtpSessions.delete(extension);

      this.removeExtensionCall(extension, conferenceId);

      this.logger.info(`Participant ${extension} removed from conference ${conferenceId}`);
      this.emit('conference:participantRemoved', {
        conferenceId,
        extension,
        participantCount: call.getParticipantCount()
      });

      // End conference if only one participant left
      if (call.isConference && call.getParticipantCount() < 2) {
        await this.endCall(conferenceId, 'insufficient_participants');
      }

      return true;
    } catch (error) {
      this.logger.error(`Failed to remove participant from conference: ${error.message}`);
      throw error;
    }
  }

  /**
   * Hold call
   */
  async holdCall(callId) {
    try {
      const call = this.calls.get(callId);
      if (!call) throw new Error(`Call ${callId} not found`);

      if (!call.isActive()) {
        throw new Error(`Call ${callId} is not active`);
      }

      call.onHold = true;
      const previousState = call.setState(CallState.ON_HOLD);

      // Notify SIP server
      if (this.sipServer?.holdCall) {
        await this.sipServer.holdCall(call.sipSessionId);
      }

      this.logger.info(`Call ${callId} put on hold`);
      this.emit('call:held', { callId, call: call.toJSON() });

      return true;
    } catch (error) {
      this.logger.error(`Failed to hold call ${callId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Resume held call
   */
  async resumeCall(callId) {
    try {
      const call = this.calls.get(callId);
      if (!call) throw new Error(`Call ${callId} not found`);

      if (!call.onHold) {
        throw new Error(`Call ${callId} is not on hold`);
      }

      call.onHold = false;
      call.setState(CallState.CONNECTED);

      // Notify SIP server
      if (this.sipServer?.resumeCall) {
        await this.sipServer.resumeCall(call.sipSessionId);
      }

      this.logger.info(`Call ${callId} resumed from hold`);
      this.emit('call:resumed', { callId, call: call.toJSON() });

      return true;
    } catch (error) {
      this.logger.error(`Failed to resume call ${callId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Transfer call to another extension
   */
  async transferCall(callId, targetExtension) {
    try {
      const call = this.calls.get(callId);
      if (!call) throw new Error(`Call ${callId} not found`);

      call.setState(CallState.TRANSFERRING);
      call.transferTarget = targetExtension;

      // Notify SIP server for transfer
      if (this.sipServer?.transferCall) {
        await this.sipServer.transferCall(call.sipSessionId, targetExtension);
      }

      this.logger.info(`Call ${callId} transferring to ${targetExtension}`);
      this.emit('call:transferring', {
        callId,
        targetExtension,
        call: call.toJSON()
      });

      return true;
    } catch (error) {
      this.logger.error(`Failed to transfer call ${callId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Mute participant in call
   */
  muteParticipant(callId, participantId) {
    const call = this.calls.get(callId);
    if (!call) return false;

    const result = call.muteParticipant(participantId);
    if (result) {
      this.emit('call:participantMuted', { callId, participantId });
    }
    return result;
  }

  /**
   * Unmute participant in call
   */
  unmuteParticipant(callId, participantId) {
    const call = this.calls.get(callId);
    if (!call) return false;

    const result = call.unmuteParticipant(participantId);
    if (result) {
      this.emit('call:participantUnmuted', { callId, participantId });
    }
    return result;
  }

  /**
   * Set participant volume
   */
  setParticipantVolume(callId, participantId, volume) {
    const call = this.calls.get(callId);
    if (!call) return false;

    const participant = call.participants.get(participantId);
    if (!participant) return false;

    participant.volume = Math.max(0, Math.min(100, volume));
    this.emit('call:volumeChanged', { callId, participantId, volume: participant.volume });
    return true;
  }

  /**
   * End call
   */
  async endCall(callId, reason = 'normal') {
    try {
      const call = this.calls.get(callId);
      if (!call) {
        this.logger.warn(`Attempted to end unknown call: ${callId}`);
        return false;
      }

      // Clear timeout
      if (call.timeoutHandle) {
        clearTimeout(call.timeoutHandle);
      }

      // Stop recording if active
      if (call.isRecording) {
        await this.stopRecording(callId);
        this.globalStats.recordedCalls++;
      }

      // Release RTP sessions
      for (const [participantId, rtpSession] of call.rtpSessions) {
        if (this.rtpManager?.releaseSession) {
          this.rtpManager.releaseSession(rtpSession?.sessionId || `${callId}-${participantId}`);
        }
      }
      call.rtpSessions.clear();

      call.setState(CallState.ENDED);

      // Notify SIP server
      if (this.sipServer?.endCall) {
        await this.sipServer.endCall(call.sipSessionId, reason);
      }

      // Save call record to database
      await this.saveCallRecord(call, reason);

      this.logger.info(`Call ${callId} ended: ${reason}`, {
        initiator: call.initiator,
        recipient: call.recipient,
        duration: call.durationSeconds,
        isConference: call.isConference,
        participantCount: call.getParticipantCount()
      });

      this.emit('call:ended', {
        callId,
        reason,
        call: call.toJSON()
      });

      // Clean up
      this.removeCall(callId);

      return true;
    } catch (error) {
      this.logger.error(`Failed to end call ${callId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Save call record to database
   */
  async saveCallRecord(call, reason) {
    try {
      if (!this.database?.saveCallRecord) {
        return;
      }

      await this.database.saveCallRecord({
        callId: call.id,
        initiator: call.initiator,
        recipient: call.recipient,
        direction: call.direction,
        startTime: new Date(call.startTime),
        endTime: new Date(call.endTime),
        duration: call.durationSeconds,
        reason: reason,
        isConference: call.isConference,
        participantCount: call.getParticipantCount(),
        isRecorded: call.recordingFilePath ? true : false,
        recordingPath: call.recordingFilePath,
        stats: call.stats
      });
    } catch (error) {
      this.logger.error(`Failed to save call record: ${error.message}`);
    }
  }

  /**
   * Remove call from tracking
   */
  removeCall(callId) {
    const call = this.calls.get(callId);
    if (!call) return;

    // Remove from extension tracking
    for (const [extension, callIds] of this.extensionToCalls) {
      callIds.delete(callId);
      if (callIds.size === 0) {
        this.extensionToCalls.delete(extension);
      }
    }

    // Remove from session tracking
    this.sessionToCalls.delete(call.sipSessionId);

    // Remove from calls store
    this.calls.delete(callId);

    this.logger.debug(`Call ${callId} removed from tracking`);
  }

  /**
   * Route call based on configuration
   */
  async routeCall(extension, dialed) {
    try {
      const routing = this.routingConfig.routing_rules || [];

      for (const rule of routing) {
        const pattern = new RegExp(rule.pattern);
        if (pattern.test(dialed)) {
          switch (rule.type) {
            case 'extension':
              return { type: 'extension', target: rule.target };
            case 'group':
              return { type: 'group', target: rule.target };
            case 'queue':
              return { type: 'queue', target: rule.target };
            case 'ivr':
              return { type: 'ivr', target: rule.target };
            case 'external':
              return { type: 'external', target: rule.target, gateway: rule.gateway };
            default:
              this.logger.warn(`Unknown routing type: ${rule.type}`);
          }
        }
      }

      // Default routing to direct extension
      return { type: 'extension', target: dialed };
    } catch (error) {
      this.logger.error(`Routing error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Add extension to call tracking
   */
  addExtensionCall(extension, callId) {
    if (!this.extensionToCalls.has(extension)) {
      this.extensionToCalls.set(extension, new Set());
    }
    this.extensionToCalls.get(extension).add(callId);

    // Track stats
    if (!this.globalStats.callsByExtension[extension]) {
      this.globalStats.callsByExtension[extension] = 0;
    }
    this.globalStats.callsByExtension[extension]++;
  }

  /**
   * Remove extension from call tracking
   */
  removeExtensionCall(extension, callId) {
    const callIds = this.extensionToCalls.get(extension);
    if (callIds) {
      callIds.delete(callId);
    }
  }

  /**
   * Get calls for extension
   */
  getExtensionCalls(extension) {
    const callIds = this.extensionToCalls.get(extension) || new Set();
    return Array.from(callIds).map(id => this.calls.get(id)).filter(call => call);
  }

  /**
   * Get call by ID
   */
  getCall(callId) {
    return this.calls.get(callId);
  }

  /**
   * Get all active calls
   */
  getActiveCalls() {
    const activeCalls = [];
    for (const call of this.calls.values()) {
      if (call.isActive()) {
        activeCalls.push(call.toJSON());
      }
    }
    return activeCalls;
  }

  /**
   * Update call statistics
   */
  updateCallStats(callId, rtpStats) {
    const call = this.calls.get(callId);
    if (!call) return;

    if (rtpStats) {
      Object.assign(call.stats, rtpStats);
    }
  }

  /**
   * Get call statistics
   */
  getCallStats(callId) {
    const call = this.calls.get(callId);
    return call ? call.stats : null;
  }

  /**
   * Generate unique call ID
   */
  generateCallId() {
    return `call-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * Start cleanup interval for expired calls
   */
  startCleanupInterval() {
    setInterval(() => {
      this.cleanupExpiredCalls();
    }, 60000); // Run every minute
  }

  /**
   * Cleanup expired calls
   */
  cleanupExpiredCalls() {
    const now = Date.now();
    const callsToEnd = [];

    for (const [callId, call] of this.calls) {
      // Check for idle timeout
      if (call.isActive() && call.startTime) {
        const age = now - call.startTime;
        if (age > call.idleTimeout) {
          callsToEnd.push({ callId, reason: 'idle_timeout' });
        }
      }

      // Check for ringing timeout
      if (call.state === CallState.RINGING && call.startTime) {
        const ringTime = now - call.startTime;
        if (ringTime > call.ringTimeout) {
          callsToEnd.push({ callId, reason: 'ring_timeout' });
        }
      }
    }

    // End expired calls
    for (const { callId, reason } of callsToEnd) {
      this.logger.info(`Cleaning up expired call ${callId} (${reason})`);
      this.endCall(callId, reason).catch(err => {
        this.logger.error(`Failed to cleanup call ${callId}: ${err.message}`);
      });
    }
  }

  /**
   * Get metrics for monitoring
   */
  getMetrics() {
    // Update active calls count
    this.globalStats.activeCallsCount = this.getActiveCalls().length;

    // Calculate total duration
    let totalDuration = 0;
    for (const call of this.calls.values()) {
      if (call.state === CallState.ENDED || call.state === CallState.FAILED) {
        totalDuration += call.durationSeconds;
      }
    }
    this.globalStats.totalDuration = totalDuration;

    const uptime = Date.now() - this.globalStats.startTime;

    return {
      totalCalls: this.globalStats.totalCalls,
      activeCallsCount: this.globalStats.activeCallsCount,
      totalDuration: this.globalStats.totalDuration,
      failedCalls: this.globalStats.failedCalls,
      recordedCalls: this.globalStats.recordedCalls,
      conferenceCalls: this.globalStats.conferenceCalls,
      averageCallDuration: this.globalStats.totalCalls > 0
        ? Math.floor(this.globalStats.totalDuration / this.globalStats.totalCalls)
        : 0,
      uptime,
      callsByExtension: this.globalStats.callsByExtension,
      activeCalls: this.getActiveCalls()
    };
  }

  /**
   * Health check
   */
  getHealth() {
    return {
      status: 'healthy',
      activeCalls: this.getActiveCalls().length,
      sipConnected: this.sipServer?.isConnected?.() || false,
      rtpReady: this.rtpManager?.isReady?.() || false,
      dbConnected: this.database?.isConnected?.() || false,
      timestamp: new Date().toISOString()
    };
  }
}

export default CallManager;
