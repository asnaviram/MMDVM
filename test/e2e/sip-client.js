/**
 * Simulated ESP32 SIP Client
 * Simulates SIP registration and call flow
 */

import dgram from 'dgram';
import crypto from 'crypto';

export class SIPClient {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.registered = false;
    this.callId = null;
    this.sequenceNumber = 1;
    this.socket = null;
    this.cseq = 1;
    this.tag = Math.random().toString(36).substring(7);
  }

  /**
   * Generate SIP message from-tag
   */
  generateTag() {
    return Math.random().toString(36).substring(2, 10);
  }

  /**
   * Generate SIP Call-ID
   */
  generateCallId() {
    return `${Date.now()}-${Math.random().toString(36).substring(7)}@${this.config.host}`;
  }

  /**
   * Simulate SIP REGISTER message
   */
  generateRegisterMessage() {
    const callId = this.generateCallId();
    this.callId = callId;
    const fromTag = this.generateTag();

    const message = `REGISTER sip:${this.config.host} SIP/2.0\r
Via: SIP/2.0/UDP ${this.config.deviceId}:${this.config.port}\r
Max-Forwards: 70\r
To: <sip:${this.config.username}@${this.config.host}>\r
From: <sip:${this.config.username}@${this.config.host}>;tag=${fromTag}\r
Call-ID: ${callId}\r
CSeq: ${this.cseq} REGISTER\r
Contact: <sip:${this.config.username}@${this.config.deviceId}:${this.config.port}>\r
User-Agent: ESP32-RoIP-Client/1.0\r
Expires: 3600\r
Content-Length: 0\r
\r
`;

    return message;
  }

  /**
   * Simulate SIP INVITE message for call initiation
   */
  generateInviteMessage(targetUri, sdpBody) {
    const fromTag = this.generateTag();
    const callId = this.generateCallId();

    const message = `INVITE ${targetUri} SIP/2.0\r
Via: SIP/2.0/UDP ${this.config.deviceId}:${this.config.port};branch=z9hG4bK${Math.random().toString(36).substring(7)}\r
Max-Forwards: 70\r
To: <${targetUri}>\r
From: <sip:${this.config.username}@${this.config.host}>;tag=${fromTag}\r
Call-ID: ${callId}\r
CSeq: ${this.cseq} INVITE\r
Contact: <sip:${this.config.username}@${this.config.deviceId}:${this.config.port}>\r
Content-Type: application/sdp\r
Content-Length: ${sdpBody.length}\r
User-Agent: ESP32-RoIP-Client/1.0\r
\r
${sdpBody}`;

    this.callId = callId;
    return message;
  }

  /**
   * Generate SIP 200 OK response
   */
  generateOkResponse(incomingRequest, sdpBody) {
    const response = `SIP/2.0 200 OK\r
Via: ${incomingRequest.match(/Via: [^\r]*/)[0]}\r
To: ${incomingRequest.match(/To: [^\r]*/)[0]};tag=${this.generateTag()}\r
From: ${incomingRequest.match(/From: [^\r]*/)[0]}\r
Call-ID: ${incomingRequest.match(/Call-ID: [^\r]*/)[0]}\r
CSeq: ${incomingRequest.match(/CSeq: [^\r]*/)[0]}\r
Contact: <sip:${this.config.username}@${this.config.deviceId}:${this.config.port}>\r
Content-Type: application/sdp\r
Content-Length: ${sdpBody.length}\r
\r
${sdpBody}`;

    return response;
  }

  /**
   * Generate SIP BYE message to terminate call
   */
  generateByeMessage(targetUri, callId, cseq) {
    const message = `BYE ${targetUri} SIP/2.0\r
Via: SIP/2.0/UDP ${this.config.deviceId}:${this.config.port}\r
Max-Forwards: 70\r
To: <${targetUri}>\r
From: <sip:${this.config.username}@${this.config.host}>\r
Call-ID: ${callId}\r
CSeq: ${cseq} BYE\r
User-Agent: ESP32-RoIP-Client/1.0\r
Content-Length: 0\r
\r
`;

    return message;
  }

  /**
   * Generate SDP body for media negotiation
   */
  generateSdpBody(localIp, audioPort) {
    const sessionId = Math.floor(Date.now() / 1000);
    const sdp = `v=0\r
o=- ${sessionId} 1 IN IP4 ${localIp}\r
s=ESP32 RoIP Session\r
c=IN IP4 ${localIp}\r
t=0 0\r
a=tool:esp32-roip\r
a=rtcp-unicast:reflection\r
m=audio ${audioPort} RTP/AVP 96 0\r
a=rtpmap:96 opus/24000/1\r
a=rtpmap:0 PCMU/8000/1\r
a=fmtp:96 maxplaybackrate=24000; useinbandfec=1\r
a=sendrecv\r
`;

    return sdp;
  }

  /**
   * Simulate SIP registration
   */
  async register() {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        this.registered = true;
        this.logger.success(`SIP registration successful`, {
          username: this.config.username,
          sipUri: this.config.sipUri
        });
        resolve();
      }, 500);
    });
  }

  /**
   * Simulate sending INVITE
   */
  async sendInvite(targetUri) {
    return new Promise((resolve, reject) => {
      const sdp = this.generateSdpBody(this.config.ipAddress, this.config.port + 1000);
      const message = this.generateInviteMessage(targetUri, sdp);

      this.logger.debug('Sending INVITE', {
        from: this.config.username,
        to: targetUri,
        callId: this.callId
      });

      setTimeout(() => {
        this.logger.success('INVITE sent', { targetUri });
        resolve({
          callId: this.callId,
          cseq: this.cseq++
        });
      }, 200);
    });
  }

  /**
   * Simulate receiving and accepting INVITE
   */
  async acceptInvite(inviteData) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const sdp = this.generateSdpBody(this.config.ipAddress, this.config.port + 1000);
        this.logger.success('INVITE accepted with 200 OK', {
          callId: inviteData.callId,
          from: this.config.username
        });

        resolve({
          callId: inviteData.callId,
          cseq: this.cseq++,
          status: 200
        });
      }, 300);
    });
  }

  /**
   * Simulate hang up (BYE)
   */
  async hangup(callId) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        this.logger.success('BYE sent - call terminated', {
          callId,
          username: this.config.username
        });
        this.registered = false;
        resolve();
      }, 100);
    });
  }

  /**
   * Get registration status
   */
  isRegistered() {
    return this.registered;
  }
}

export default SIPClient;
