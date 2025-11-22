/**
 * SIP Server Module
 * Professional SIP protocol implementation for UDP-based VoIP/RoIP communications
 * Handles REGISTER, INVITE, ACK, BYE, OPTIONS messages with Digest MD5 authentication
 */

import dgram from 'dgram';
import crypto from 'crypto';
import { EventEmitter } from 'events';

/**
 * SIP Server - Main SIP protocol handler
 * Implements RFC 3261 SIP protocol for registration and call management
 */
export class SIPServer extends EventEmitter {
  constructor(config, authManager, database, logger) {
    super();

    this.config = config || {};
    this.auth = authManager;
    this.db = database;
    this.logger = logger;

    // Server state
    this.socket = null;
    this.running = false;
    this.localAddress = '0.0.0.0';
    this.localPort = config.port || 5060;

    // SIP transaction tracking
    this.transactions = new Map(); // branch_id -> transaction
    this.registrations = new Map(); // aor (address of record) -> registration
    this.dialogs = new Map(); // call_id + from_tag + to_tag -> dialog
    this.pendingChallenges = new Map(); // nonce -> challenge

    // Metrics
    this.metrics = {
      messagesReceived: 0,
      messagesSent: 0,
      registrations: 0,
      activeDialogs: 0,
      transactionErrors: 0,
      lastActivity: null,
      uptime: 0
    };

    // Keep-alive configuration
    this.keepAliveInterval = config.keepalive_interval || 30000; // 30 seconds
    this.registrationExpiry = config.registration_expiry || 3600; // 1 hour
    this.keepAliveTimer = null;
    this.startTime = Date.now();

    // SIP configuration
    this.sipVersion = 'SIP/2.0';
    this.serverName = `ESP-RoIP/1.0`;
    this.realm = config.realm || 'localhost';
    this.domain = config.domain || 'localhost';

    // Transaction timers (RFC 3261)
    this.TIMER_T1 = 500; // RTT estimate (ms)
    this.TIMER_T2 = 4000; // Maximum retransmit interval (ms)
    this.TIMER_T4 = 5000; // Maximum duration a message will remain in the network (ms)
  }

  /**
   * Start the SIP server
   */
  async start() {
    try {
      this.socket = dgram.createSocket('udp4');

      // Event handlers
      this.socket.on('message', (buffer, rinfo) => {
        this.handleMessage(buffer, rinfo);
      });

      this.socket.on('error', (error) => {
        this.logger.error(`SIP socket error: ${error.message}`, { stack: error.stack });
      });

      this.socket.on('listening', () => {
        const addr = this.socket.address();
        this.logger.info(`SIP server listening on ${addr.address}:${addr.port}`);
      });

      // Bind to port
      return new Promise((resolve, reject) => {
        this.socket.bind(this.localPort, this.localAddress, () => {
          this.running = true;
          this.startKeepAliveTimer();
          this.startRegistrationExpiryCheck();
          resolve();
        });

        setTimeout(() => {
          reject(new Error('SIP server startup timeout'));
        }, 5000);
      });
    } catch (error) {
      this.logger.error(`Failed to start SIP server: ${error.message}`, { stack: error.stack });
      throw error;
    }
  }

  /**
   * Stop the SIP server
   */
  async stop() {
    try {
      this.running = false;

      if (this.keepAliveTimer) {
        clearInterval(this.keepAliveTimer);
      }

      if (this.registrationExpiryTimer) {
        clearInterval(this.registrationExpiryTimer);
      }

      if (this.socket) {
        await new Promise((resolve) => {
          this.socket.close(() => {
            this.logger.info('SIP server socket closed');
            resolve();
          });
        });
      }

      this.socket = null;
      this.logger.info('SIP server stopped');
    } catch (error) {
      this.logger.error(`Error stopping SIP server: ${error.message}`, { stack: error.stack });
    }
  }

  /**
   * Handle incoming SIP message
   */
  async handleMessage(buffer, rinfo) {
    try {
      this.metrics.messagesReceived++;
      this.metrics.lastActivity = new Date();

      const message = buffer.toString('utf8');
      const parsedMessage = this.parseMessage(message);

      if (!parsedMessage) {
        this.logger.warn('Failed to parse SIP message');
        return;
      }

      this.logger.debug(`Received ${parsedMessage.type} message`, {
        from: `${rinfo.address}:${rinfo.port}`,
        method: parsedMessage.method,
        cseq: parsedMessage.cseq,
        callId: parsedMessage.callId
      });

      // Route to appropriate handler
      if (parsedMessage.type === 'request') {
        await this.handleRequest(parsedMessage, rinfo);
      } else if (parsedMessage.type === 'response') {
        await this.handleResponse(parsedMessage, rinfo);
      }
    } catch (error) {
      this.metrics.transactionErrors++;
      this.logger.error(`Error handling message: ${error.message}`, {
        error: error.message,
        stack: error.stack,
        remote: `${rinfo.address}:${rinfo.port}`
      });
    }
  }

  /**
   * Handle incoming SIP request
   */
  async handleRequest(msg, rinfo) {
    switch (msg.method) {
      case 'REGISTER':
        await this.handleREGISTER(msg, rinfo);
        break;
      case 'INVITE':
        await this.handleINVITE(msg, rinfo);
        break;
      case 'ACK':
        await this.handleACK(msg, rinfo);
        break;
      case 'BYE':
        await this.handleBYE(msg, rinfo);
        break;
      case 'CANCEL':
        await this.handleCANCEL(msg, rinfo);
        break;
      case 'OPTIONS':
        await this.handleOPTIONS(msg, rinfo);
        break;
      case 'INFO':
        await this.handleINFO(msg, rinfo);
        break;
      default:
        this.logger.warn(`Unsupported SIP method: ${msg.method}`);
        await this.sendResponse(msg, 405, 'Method Not Allowed', rinfo);
    }
  }

  /**
   * Handle SIP REGISTER request
   * Devices register their contact addresses for call routing
   */
  async handleREGISTER(msg, rinfo) {
    try {
      const aor = msg.to.uri; // Address of Record
      const contact = msg.contact;
      const fromTag = msg.from.tag || this.generateTag();
      const toTag = this.generateTag();

      // Check for digest authentication
      if (!msg.authorization) {
        this.logger.debug('Registration challenge sent', { aor });
        const nonce = this.generateNonce();
        const challenge = {
          realm: this.realm,
          nonce: nonce,
          algorithm: 'MD5',
          qop: 'auth'
        };
        this.pendingChallenges.set(nonce, challenge);

        await this.sendResponse(
          msg,
          401,
          'Unauthorized',
          rinfo,
          { 'WWW-Authenticate': this.buildWWWAuthenticate(challenge) }
        );
        return;
      }

      // Verify authentication
      const authResult = await this.verifyDigestAuth(msg, rinfo);
      if (!authResult.valid) {
        this.logger.warn('Authentication failed', { aor, reason: authResult.reason });
        await this.sendResponse(msg, 403, 'Forbidden', rinfo);
        return;
      }

      // Extract contact information
      if (!contact) {
        await this.sendResponse(msg, 400, 'Bad Request', rinfo);
        return;
      }

      const expires = this.parseExpires(msg);

      if (expires === 0) {
        // Unregister
        this.registrations.delete(aor);
        this.metrics.registrations = this.registrations.size;
        this.logger.info('Device unregistered', { aor });
      } else {
        // Register
        const registration = {
          aor,
          contact: contact.uri,
          contactAddress: rinfo.address,
          contactPort: rinfo.port,
          expires: Date.now() + (expires * 1000),
          registered: Date.now(),
          cseq: msg.cseq,
          callId: msg.callId,
          userAgent: msg.userAgent,
          username: authResult.username,
          fromTag,
          toTag
        };

        this.registrations.set(aor, registration);
        this.metrics.registrations = this.registrations.size;

        this.logger.info('Device registered', {
          aor,
          contact: contact.uri,
          expires,
          username: authResult.username
        });

        // Store in database
        if (this.db) {
          try {
            await this.db.registerDevice({
              aor,
              contact: contact.uri,
              address: rinfo.address,
              port: rinfo.port,
              expires: registration.expires,
              username: authResult.username,
              userAgent: msg.userAgent
            });
          } catch (error) {
            this.logger.error(`Failed to store registration in database: ${error.message}`);
          }
        }
      }

      // Send 200 OK response
      const contactHeader = `<${contact.uri}>;expires=${expires}`;
      await this.sendResponse(
        msg,
        200,
        'OK',
        rinfo,
        {
          'Contact': contactHeader,
          'Expires': expires.toString()
        }
      );

      this.emit('registered', { aor, contact: contact.uri, username: authResult.username });
    } catch (error) {
      this.logger.error(`REGISTER error: ${error.message}`, { stack: error.stack });
      await this.sendResponse(msg, 500, 'Server Internal Error', rinfo);
    }
  }

  /**
   * Handle SIP INVITE request
   * Initiate call setup
   */
  async handleINVITE(msg, rinfo) {
    try {
      const callId = msg.callId;
      const fromTag = msg.from.tag;
      const toTag = this.generateTag();
      const uri = msg.requestUri;

      this.logger.debug('INVITE received', {
        from: msg.from.uri,
        to: msg.to.uri,
        callId,
        contentType: msg.contentType
      });

      // Verify dialog doesn't already exist
      const dialogId = `${callId}:${fromTag}:${toTag}`;
      if (this.dialogs.has(dialogId)) {
        await this.sendResponse(msg, 493, 'Undecipherable', rinfo);
        return;
      }

      // Look up recipient
      const recipientUri = msg.to.uri;
      const registration = this.findRegistration(recipientUri);

      if (!registration) {
        this.logger.warn('Recipient not found', { uri: recipientUri });
        await this.sendResponse(msg, 404, 'Not Found', rinfo);
        return;
      }

      // Create dialog
      const dialog = {
        callId,
        fromTag,
        toTag,
        state: 'early',
        initiator: msg.from.uri,
        recipient: recipientUri,
        created: Date.now(),
        sdp: msg.body
      };

      this.dialogs.set(dialogId, dialog);
      this.metrics.activeDialogs = this.dialogs.size;

      // Send 180 Ringing provisional response
      await this.sendResponse(
        msg,
        180,
        'Ringing',
        rinfo,
        { 'To': `<${msg.to.uri}>;tag=${toTag}` }
      );

      // Forward INVITE to registered contact
      try {
        await this.forwardINVITE(msg, registration);
      } catch (error) {
        this.logger.error(`Failed to forward INVITE: ${error.message}`);
        dialog.state = 'terminated';
        await this.sendResponse(msg, 480, 'Temporarily Unavailable', rinfo);
      }

      this.emit('invite', {
        from: msg.from.uri,
        to: recipientUri,
        callId,
        sdp: msg.body
      });
    } catch (error) {
      this.logger.error(`INVITE error: ${error.message}`, { stack: error.stack });
      await this.sendResponse(msg, 500, 'Server Internal Error', rinfo);
    }
  }

  /**
   * Forward INVITE to registered contact
   */
  async forwardINVITE(msg, registration) {
    const forwardMsg = this.buildRequest(
      'INVITE',
      registration.contact,
      {
        'From': this.buildHeaderValue('From', msg.from),
        'To': this.buildHeaderValue('To', msg.to),
        'Via': this.buildVia(),
        'CSeq': `${msg.cseq} INVITE`,
        'Call-ID': msg.callId,
        'Max-Forwards': '69',
        'User-Agent': this.serverName,
        'Content-Type': msg.contentType || 'application/sdp',
        'Content-Length': msg.body ? msg.body.length : 0
      },
      msg.body
    );

    // Send to registered contact
    await this.sendMessage(forwardMsg, registration.contactAddress, registration.contactPort);
  }

  /**
   * Handle SIP ACK request
   * Acknowledges receipt of final response to INVITE
   */
  async handleACK(msg, rinfo) {
    try {
      this.logger.debug('ACK received', {
        from: msg.from.uri,
        to: msg.to.uri,
        callId: msg.callId
      });

      const dialogId = `${msg.callId}:${msg.from.tag}:${msg.to.tag}`;
      const dialog = this.dialogs.get(dialogId);

      if (dialog) {
        dialog.state = 'established';
        this.logger.info('Call established', { callId: msg.callId });
        this.emit('callEstablished', { callId: msg.callId });
      }
    } catch (error) {
      this.logger.error(`ACK error: ${error.message}`, { stack: error.stack });
    }
  }

  /**
   * Handle SIP BYE request
   * Terminate call
   */
  async handleBYE(msg, rinfo) {
    try {
      this.logger.debug('BYE received', { callId: msg.callId });

      const dialogId = `${msg.callId}:${msg.from.tag}:${msg.to.tag}`;
      const dialog = this.dialogs.get(dialogId);

      if (dialog) {
        dialog.state = 'terminated';
        this.dialogs.delete(dialogId);
        this.metrics.activeDialogs = this.dialogs.size;

        this.logger.info('Call terminated', { callId: msg.callId });
        this.emit('callTerminated', { callId: msg.callId });
      }

      await this.sendResponse(msg, 200, 'OK', rinfo);
    } catch (error) {
      this.logger.error(`BYE error: ${error.message}`, { stack: error.stack });
      await this.sendResponse(msg, 500, 'Server Internal Error', rinfo);
    }
  }

  /**
   * Handle SIP CANCEL request
   * Cancel pending INVITE
   */
  async handleCANCEL(msg, rinfo) {
    try {
      this.logger.debug('CANCEL received', { callId: msg.callId });

      // Find matching INVITE transaction
      const transactionKey = `${msg.callId}:${msg.cseq}`;
      const transaction = this.transactions.get(transactionKey);

      if (transaction) {
        transaction.cancelled = true;
      }

      await this.sendResponse(msg, 200, 'OK', rinfo);
    } catch (error) {
      this.logger.error(`CANCEL error: ${error.message}`, { stack: error.stack });
    }
  }

  /**
   * Handle SIP OPTIONS request
   * Server capabilities query
   */
  async handleOPTIONS(msg, rinfo) {
    try {
      await this.sendResponse(
        msg,
        200,
        'OK',
        rinfo,
        {
          'Allow': 'INVITE, ACK, BYE, CANCEL, OPTIONS, INFO',
          'Accept': 'application/sdp',
          'Accept-Encoding': 'gzip, deflate',
          'Accept-Language': 'en'
        }
      );
    } catch (error) {
      this.logger.error(`OPTIONS error: ${error.message}`, { stack: error.stack });
    }
  }

  /**
   * Handle SIP INFO request
   * Mid-call information
   */
  async handleINFO(msg, rinfo) {
    try {
      this.logger.debug('INFO received', { callId: msg.callId });
      await this.sendResponse(msg, 200, 'OK', rinfo);
    } catch (error) {
      this.logger.error(`INFO error: ${error.message}`, { stack: error.stack });
    }
  }

  /**
   * Handle incoming SIP response
   */
  async handleResponse(msg, rinfo) {
    this.logger.debug(`Response received: ${msg.statusCode} ${msg.reason}`, {
      from: msg.from?.uri,
      callId: msg.callId
    });

    // Match response to transaction
    const transactionKey = `${msg.callId}:${msg.cseq}`;
    const transaction = this.transactions.get(transactionKey);

    if (transaction) {
      transaction.response = msg;
      transaction.lastResponse = Date.now();
    }
  }

  /**
   * Parse incoming SIP message
   */
  parseMessage(data) {
    try {
      const lines = data.split('\r\n');
      if (lines.length < 2) return null;

      const parsed = {
        raw: data,
        headers: {},
        body: ''
      };

      // Parse first line
      const firstLine = lines[0];
      if (firstLine.startsWith('SIP/2.0')) {
        // Response
        const parts = firstLine.split(' ');
        parsed.type = 'response';
        parsed.statusCode = parseInt(parts[1]);
        parsed.reason = parts.slice(2).join(' ');
      } else {
        // Request
        const parts = firstLine.split(' ');
        parsed.type = 'request';
        parsed.method = parts[0];
        parsed.requestUri = parts[1];
        parsed.version = parts[2];
      }

      // Parse headers
      let i = 1;
      let bodyStart = -1;

      for (; i < lines.length; i++) {
        const line = lines[i];

        if (line === '') {
          bodyStart = i + 1;
          break;
        }

        // Handle header folding
        if (line.startsWith(' ') || line.startsWith('\t')) {
          if (i > 0) {
            const lastKey = Object.keys(parsed.headers).pop();
            parsed.headers[lastKey] += line.trim();
          }
          continue;
        }

        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          const key = line.substring(0, colonIdx).trim();
          const value = line.substring(colonIdx + 1).trim();

          // Handle compact form
          const normalizedKey = this.normalizeHeader(key);
          parsed.headers[normalizedKey] = value;
        }
      }

      // Parse body
      if (bodyStart >= 0) {
        parsed.body = lines.slice(bodyStart).join('\r\n').trim();
      }

      // Parse individual headers
      this.parseHeaders(parsed);

      return parsed;
    } catch (error) {
      this.logger.error(`Message parsing error: ${error.message}`);
      return null;
    }
  }

  /**
   * Parse structured headers
   */
  parseHeaders(msg) {
    try {
      // Via header
      const viaHeader = msg.headers['Via'] || msg.headers['via'] || msg.headers['v'];
      if (viaHeader) {
        msg.via = this.parseVia(viaHeader);
      }

      // From header
      const fromHeader = msg.headers['From'] || msg.headers['from'] || msg.headers['f'];
      if (fromHeader) {
        msg.from = this.parseNameAddr(fromHeader);
      }

      // To header
      const toHeader = msg.headers['To'] || msg.headers['to'] || msg.headers['t'];
      if (toHeader) {
        msg.to = this.parseNameAddr(toHeader);
      }

      // Call-ID header
      msg.callId = msg.headers['Call-ID'] || msg.headers['i'];

      // CSeq header
      const cseqHeader = msg.headers['CSeq'];
      if (cseqHeader) {
        const parts = cseqHeader.split(/\s+/);
        msg.cseq = parseInt(parts[0]);
        msg.cseqMethod = parts[1];
      }

      // Contact header
      const contactHeader = msg.headers['Contact'] || msg.headers['m'];
      if (contactHeader) {
        msg.contact = this.parseNameAddr(contactHeader);
      }

      // Authorization header
      if (msg.headers['Authorization']) {
        msg.authorization = this.parseAuthorization(msg.headers['Authorization']);
      }

      // Expires header
      msg.expires = parseInt(msg.headers['Expires'] || 3600);

      // Content-Type header
      msg.contentType = msg.headers['Content-Type'] || msg.headers['c'];

      // User-Agent header
      msg.userAgent = msg.headers['User-Agent'];

      // Max-Forwards header
      msg.maxForwards = parseInt(msg.headers['Max-Forwards'] || 70);
    } catch (error) {
      this.logger.error(`Header parsing error: ${error.message}`);
    }
  }

  /**
   * Parse Via header
   */
  parseVia(header) {
    try {
      const match = header.match(/SIP\/(\d\.\d)\/(UDP|TCP|TLS|SCTP|WS|WSS)\s+([\w\.\-:]+)(.*)$/i);
      if (!match) return null;

      const [, version, protocol, host, params] = match;
      const via = {
        version: version,
        protocol: protocol.toUpperCase(),
        host: host,
        params: {}
      };

      // Parse parameters
      const paramParts = params.split(';').filter(p => p.trim());
      for (const part of paramParts) {
        const [key, value] = part.trim().split('=');
        if (key) {
          via.params[key.trim().toLowerCase()] = (value || '').trim();
        }
      }

      return via;
    } catch (error) {
      this.logger.error(`Via parsing error: ${error.message}`);
      return null;
    }
  }

  /**
   * Parse name-addr header (From, To, Contact)
   */
  parseNameAddr(header) {
    try {
      let uri = '';
      let name = '';
      let tag = '';
      let params = {};

      // Extract display name and URI
      let uriMatch = header.match(/<([^>]+)>/);
      if (uriMatch) {
        uri = uriMatch[1];
        name = header.substring(0, uriMatch.index).trim();
      } else {
        // URI without angle brackets
        const parts = header.split(';')[0].split(' ');
        uri = parts[parts.length - 1];
        name = parts.slice(0, -1).join(' ');
      }

      // Extract parameters
      const paramParts = header.split(';').slice(1);
      for (const part of paramParts) {
        const [key, value] = part.split('=');
        if (key.trim() === 'tag') {
          tag = value?.trim() || '';
        } else if (key) {
          params[key.trim()] = (value || '').trim();
        }
      }

      return { uri, name, tag, params };
    } catch (error) {
      this.logger.error(`NameAddr parsing error: ${error.message}`);
      return { uri: '', name: '', tag: '', params: {} };
    }
  }

  /**
   * Parse Authorization header
   */
  parseAuthorization(header) {
    try {
      const match = header.match(/^\s*Digest\s+(.*)$/i);
      if (!match) return null;

      const auth = { scheme: 'Digest', params: {} };
      const parts = match[1].split(',');

      for (const part of parts) {
        const eqIdx = part.indexOf('=');
        if (eqIdx > 0) {
          const key = part.substring(0, eqIdx).trim().toLowerCase();
          let value = part.substring(eqIdx + 1).trim();

          // Remove quotes
          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.slice(1, -1);
          }

          auth.params[key] = value;
        }
      }

      return auth;
    } catch (error) {
      this.logger.error(`Authorization parsing error: ${error.message}`);
      return null;
    }
  }

  /**
   * Verify Digest authentication
   */
  async verifyDigestAuth(msg, rinfo) {
    try {
      if (!msg.authorization || !msg.authorization.params) {
        return { valid: false, reason: 'No authorization header' };
      }

      const auth = msg.authorization.params;
      const { username, realm, nonce, uri: authUri, response, opaque, algorithm, qop, nc, cnonce } = auth;

      if (!username || !realm || !nonce || !response) {
        return { valid: false, reason: 'Missing auth parameters' };
      }

      // Verify nonce
      const challenge = this.pendingChallenges.get(nonce);
      if (!challenge && !this.isValidNonce(nonce)) {
        return { valid: false, reason: 'Invalid nonce' };
      }

      // Get password from auth manager
      let password;
      try {
        password = await this.auth.getPassword(username);
      } catch (error) {
        this.logger.warn(`Failed to get password for user: ${username}`);
        return { valid: false, reason: 'User not found' };
      }

      // Compute response hash
      const expectedResponse = this.computeDigestResponse({
        username,
        realm,
        password,
        method: msg.method,
        uri: authUri,
        nonce,
        qop: qop || 'auth',
        nc,
        cnonce,
        algorithm: algorithm || 'MD5'
      });

      if (response !== expectedResponse) {
        this.logger.warn(`Digest auth failed for user: ${username}`);
        return { valid: false, reason: 'Invalid response' };
      }

      // Remove used nonce
      if (challenge) {
        this.pendingChallenges.delete(nonce);
      }

      this.logger.debug(`Authentication successful for user: ${username}`);
      return { valid: true, username };
    } catch (error) {
      this.logger.error(`Digest authentication error: ${error.message}`);
      return { valid: false, reason: error.message };
    }
  }

  /**
   * Compute Digest authentication response
   */
  computeDigestResponse(params) {
    const { username, realm, password, method, uri, nonce, qop, nc, cnonce, algorithm } = params;

    // Compute A1
    let a1 = `${username}:${realm}:${password}`;
    if (algorithm && algorithm.toUpperCase() === 'MD5-SESS') {
      a1 = crypto.createHash('md5').update(a1).digest('hex') + `:${nonce}:${cnonce}`;
    }
    const ha1 = crypto.createHash('md5').update(a1).digest('hex');

    // Compute A2
    const a2 = `${method}:${uri}`;
    const ha2 = crypto.createHash('md5').update(a2).digest('hex');

    // Compute response
    let response;
    if (qop === 'auth' || qop === 'auth-int') {
      response = `${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`;
    } else {
      response = `${ha1}:${nonce}:${ha2}`;
    }

    return crypto.createHash('md5').update(response).digest('hex');
  }

  /**
   * Find device registration by URI
   */
  findRegistration(uri) {
    return this.registrations.get(uri);
  }

  /**
   * Send SIP response
   */
  async sendResponse(request, statusCode, reason, rinfo, additionalHeaders = {}) {
    try {
      const response = this.buildResponse(request, statusCode, reason, additionalHeaders);
      await this.sendMessage(response, rinfo.address, rinfo.port);
      this.metrics.messagesSent++;
    } catch (error) {
      this.logger.error(`Failed to send response: ${error.message}`);
    }
  }

  /**
   * Send raw SIP message
   */
  async sendMessage(message, address, port) {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not initialized'));
        return;
      }

      const buffer = Buffer.from(message);
      this.socket.send(buffer, 0, buffer.length, port, address, (error) => {
        if (error) {
          this.logger.error(`Failed to send message: ${error.message}`);
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Build SIP response
   */
  buildResponse(request, statusCode, reason, additionalHeaders = {}) {
    const via = request.via || { host: 'localhost', params: {} };
    const branch = via.params.branch || this.generateBranch();
    const toTag = additionalHeaders['To'] ? this.extractTag(additionalHeaders['To']) : this.generateTag();

    let response = `${this.sipVersion} ${statusCode} ${reason}\r\n`;

    // Via header
    response += `Via: SIP/2.0/${via.protocol} ${via.host}`;
    if (via.params.branch) {
      response += `;branch=${via.params.branch}`;
    }
    if (via.params.received) {
      response += `;received=${via.params.received}`;
    }
    response += '\r\n';

    // From header
    if (request.from) {
      response += `From: ${this.buildHeaderValue('From', request.from)}\r\n`;
    }

    // To header
    if (request.to) {
      const toUri = request.to.uri;
      const toName = request.to.name;
      response += `To: `;
      if (toName) response += `"${toName}" `;
      response += `<${toUri}>;tag=${toTag}\r\n`;
    }

    // Call-ID
    if (request.callId) {
      response += `Call-ID: ${request.callId}\r\n`;
    }

    // CSeq
    if (request.cseq && request.method) {
      response += `CSeq: ${request.cseq} ${request.method}\r\n`;
    }

    // User-Agent
    response += `User-Agent: ${this.serverName}\r\n`;

    // Add additional headers
    for (const [key, value] of Object.entries(additionalHeaders)) {
      if (key !== 'To') { // To header already handled above
        response += `${key}: ${value}\r\n`;
      }
    }

    // Content-Length
    response += 'Content-Length: 0\r\n';
    response += '\r\n';

    return response;
  }

  /**
   * Build SIP request
   */
  buildRequest(method, uri, headers, body = '') {
    let request = `${method} ${uri} ${this.sipVersion}\r\n`;

    for (const [key, value] of Object.entries(headers)) {
      request += `${key}: ${value}\r\n`;
    }

    const contentLength = body ? body.length : 0;
    request += `Content-Length: ${contentLength}\r\n`;
    request += '\r\n';

    if (body) {
      request += body;
    }

    return request;
  }

  /**
   * Build Via header
   */
  buildVia() {
    return `SIP/2.0/UDP localhost;branch=${this.generateBranch()}`;
  }

  /**
   * Build header value
   */
  buildHeaderValue(type, addr) {
    let value = '';
    if (addr.name) {
      value += `"${addr.name}" `;
    }
    value += `<${addr.uri}>`;
    if (addr.tag) {
      value += `;tag=${addr.tag}`;
    }
    return value;
  }

  /**
   * Build WWW-Authenticate header
   */
  buildWWWAuthenticate(challenge) {
    const params = [
      `realm="${challenge.realm}"`,
      `nonce="${challenge.nonce}"`,
      `algorithm=${challenge.algorithm}`,
      `qop="${challenge.qop}"`
    ];
    return `Digest ${params.join(', ')}`;
  }

  /**
   * Parse Expires header
   */
  parseExpires(msg) {
    if (msg.contact && msg.contact.params && msg.contact.params.expires !== undefined) {
      return parseInt(msg.contact.params.expires);
    }
    if (msg.expires !== undefined) {
      return msg.expires;
    }
    return this.registrationExpiry;
  }

  /**
   * Extract tag from address
   */
  extractTag(headerValue) {
    const match = headerValue.match(/tag=([^\s;]+)/);
    return match ? match[1] : this.generateTag();
  }

  /**
   * Generate SIP tag
   */
  generateTag() {
    return crypto.randomBytes(8).toString('hex');
  }

  /**
   * Generate SIP branch ID
   */
  generateBranch() {
    const magic = 'z9hG4bK';
    return magic + crypto.randomBytes(8).toString('hex');
  }

  /**
   * Generate nonce for authentication
   */
  generateNonce() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Validate nonce format
   */
  isValidNonce(nonce) {
    // Simple format check - nonce should be a hex string
    return /^[a-f0-9]{32}$/.test(nonce);
  }

  /**
   * Normalize header names
   */
  normalizeHeader(name) {
    // Handle compact form
    const compactHeaders = {
      'f': 'From',
      't': 'To',
      'v': 'Via',
      'm': 'Contact',
      'i': 'Call-ID',
      'c': 'Content-Type',
      'l': 'Content-Length'
    };

    const lower = name.toLowerCase();
    return compactHeaders[lower] || name;
  }

  /**
   * Start keep-alive timer
   * Sends periodic OPTIONS to ensure connectivity
   */
  startKeepAliveTimer() {
    this.keepAliveTimer = setInterval(() => {
      this.sendKeepAlives();
    }, this.keepAliveInterval);
  }

  /**
   * Send keep-alive OPTIONS to all registered devices
   */
  sendKeepAlives() {
    try {
      for (const [aor, registration] of this.registrations) {
        const keepAliveMsg = this.buildRequest(
          'OPTIONS',
          registration.contact,
          {
            'Via': this.buildVia(),
            'From': `<sip:${this.domain}>`,
            'To': `<${aor}>`,
            'Call-ID': this.generateCallId(),
            'CSeq': `1 OPTIONS`,
            'User-Agent': this.serverName,
            'Max-Forwards': '70'
          }
        );

        this.sendMessage(keepAliveMsg, registration.contactAddress, registration.contactPort)
          .catch(error => {
            this.logger.warn(`Keep-alive failed for ${aor}: ${error.message}`);
          });
      }
    } catch (error) {
      this.logger.error(`Keep-alive error: ${error.message}`);
    }
  }

  /**
   * Start registration expiry check timer
   */
  startRegistrationExpiryCheck() {
    this.registrationExpiryTimer = setInterval(() => {
      this.checkRegistrationExpiry();
    }, 60000); // Check every minute
  }

  /**
   * Check and remove expired registrations
   */
  checkRegistrationExpiry() {
    const now = Date.now();
    let removedCount = 0;

    for (const [aor, registration] of this.registrations) {
      if (registration.expires < now) {
        this.registrations.delete(aor);
        removedCount++;

        this.logger.info('Registration expired', { aor });

        // Notify database
        if (this.db) {
          try {
            this.db.unregisterDevice(aor).catch(error => {
              this.logger.error(`Failed to remove expired registration: ${error.message}`);
            });
          } catch (error) {
            this.logger.error(`Expiry check error: ${error.message}`);
          }
        }
      }
    }

    if (removedCount > 0) {
      this.metrics.registrations = this.registrations.size;
      this.logger.info(`Removed ${removedCount} expired registrations`);
    }
  }

  /**
   * Generate Call-ID
   */
  generateCallId() {
    return `${crypto.randomBytes(8).toString('hex')}@${this.domain}`;
  }

  /**
   * Get server metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      uptime: (Date.now() - this.startTime) / 1000,
      registeredDevices: this.registrations.size,
      activeDialogs: this.dialogs.size,
      pendingTransactions: this.transactions.size
    };
  }

  /**
   * Get registered devices
   */
  getRegistrations() {
    return Array.from(this.registrations.values());
  }

  /**
   * Get active dialogs
   */
  getDialogs() {
    return Array.from(this.dialogs.values());
  }

  /**
   * Terminate dialog by call ID
   */
  terminateDialog(callId) {
    for (const [dialogId, dialog] of this.dialogs) {
      if (dialog.callId === callId) {
        dialog.state = 'terminated';
        this.dialogs.delete(dialogId);
      }
    }
    this.metrics.activeDialogs = this.dialogs.size;
  }

  /**
   * Unregister device by AOR
   */
  unregisterDevice(aor) {
    if (this.registrations.has(aor)) {
      this.registrations.delete(aor);
      this.metrics.registrations = this.registrations.size;
      this.logger.info('Device unregistered', { aor });
      return true;
    }
    return false;
  }
}

export default SIPServer;
