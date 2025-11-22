/**
 * STUN Server Implementation (RFC 5389)
 * Handles NAT detection, public IP/port discovery for ESP32 RoIP clients
 * Implements Binding Request/Response protocol
 */

import dgram from 'dgram';
import crypto from 'crypto';
import { EventEmitter } from 'events';

/**
 * STUN Protocol Constants
 */
const STUN = {
  // Magic cookie (RFC 5389)
  MAGIC_COOKIE: 0x2112a442,

  // Message types
  MESSAGE_TYPE: {
    BINDING_REQUEST: 0x0001,
    BINDING_SUCCESS_RESPONSE: 0x0101,
    BINDING_ERROR_RESPONSE: 0x0111,
  },

  // Attribute types
  ATTRIBUTE_TYPE: {
    MAPPED_ADDRESS: 0x0001,
    RESPONSE_ADDRESS: 0x0002,
    CHANGE_REQUEST: 0x0003,
    SOURCE_ADDRESS: 0x0004,
    CHANGED_ADDRESS: 0x0005,
    USERNAME: 0x0006,
    MESSAGE_INTEGRITY: 0x0008,
    ERROR_CODE: 0x0009,
    UNKNOWN_ATTRIBUTES: 0x000A,
    REFLECTED_FROM: 0x000B,
    REALM: 0x0014,
    NONCE: 0x0015,
    XOR_MAPPED_ADDRESS: 0x0020,
    SOFTWARE: 0x8022,
    ALTERNATE_SERVER: 0x8023,
    FINGERPRINT: 0x8028,
  },

  // Address family
  ADDRESS_FAMILY: {
    IPV4: 0x01,
    IPV6: 0x02,
  },

  // NAT detection states
  NAT_TYPE: {
    OPEN_INTERNET: 'OpenInternet',
    FULL_CONE: 'FullCone',
    ADDRESS_RESTRICTED: 'AddressRestricted',
    PORT_RESTRICTED: 'PortRestricted',
    SYMMETRIC: 'Symmetric',
    UNKNOWN: 'Unknown',
  },
};

/**
 * STUN Server Class
 */
class STUNServer extends EventEmitter {
  constructor(config, logger) {
    super();
    this.config = config || {};
    this.logger = logger;
    this.socket = null;
    this.running = false;

    // Server configuration
    this.port = this.config.port || 3478;
    this.host = this.config.host || '0.0.0.0';
    this.bindingPort = this.port;

    // Alternate server for NAT detection
    this.alternatePort = this.config.alternate_port || 3479;
    this.alternateHost = this.config.alternate_host || this.host;

    // Track active transactions
    this.transactions = new Map();

    // NAT detection state per client
    this.natDetection = new Map();

    // Statistics
    this.stats = {
      requestsReceived: 0,
      responseSent: 0,
      errorsHandled: 0,
      natDetected: {},
    };
  }

  /**
   * Start STUN server
   */
  async start() {
    return new Promise((resolve, reject) => {
      try {
        this.socket = dgram.createSocket('udp4');

        this.socket.on('message', (message, rinfo) => {
          this.handleMessage(message, rinfo).catch(err => {
            this.logger?.error(`STUN message handling error: ${err.message}`);
          });
        });

        this.socket.on('error', (err) => {
          this.logger?.error(`STUN socket error: ${err.message}`);
          this.emit('error', err);
        });

        this.socket.bind(this.port, this.host, () => {
          this.running = true;
          const addr = this.socket.address();
          this.logger?.info(`STUN server listening on ${addr.address}:${addr.port}`);
          resolve();
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop STUN server
   */
  async stop() {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        resolve();
        return;
      }

      try {
        this.running = false;
        this.socket.close(() => {
          this.logger?.info('STUN server stopped');
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle incoming STUN message
   */
  async handleMessage(message, rinfo) {
    try {
      // Parse STUN message
      const stunMessage = this.parseMessage(message);

      if (!stunMessage) {
        this.stats.errorsHandled++;
        return;
      }

      this.stats.requestsReceived++;

      // Log client info
      const clientAddr = `${rinfo.address}:${rinfo.port}`;
      this.logger?.debug(`STUN request from ${clientAddr}: type=0x${stunMessage.type.toString(16).padStart(4, '0')}`);

      // Handle binding request
      if (stunMessage.type === STUN.MESSAGE_TYPE.BINDING_REQUEST) {
        await this.handleBindingRequest(stunMessage, rinfo);
      }

    } catch (error) {
      this.logger?.error(`Error handling STUN message: ${error.message}`);
      this.stats.errorsHandled++;
    }
  }

  /**
   * Handle STUN Binding Request
   */
  async handleBindingRequest(stunMessage, rinfo) {
    try {
      const clientAddr = `${rinfo.address}:${rinfo.port}`;

      // Create binding response
      const response = this.createBindingResponse(stunMessage, rinfo);

      // Send response
      this.socket.send(response, rinfo.port, rinfo.address, (err) => {
        if (err) {
          this.logger?.error(`Failed to send STUN response to ${clientAddr}: ${err.message}`);
        } else {
          this.logger?.debug(`STUN response sent to ${clientAddr}`);
          this.stats.responseSent++;
        }
      });

      // Track NAT detection
      this.trackNATDetection(rinfo.address, rinfo.port, stunMessage);

    } catch (error) {
      this.logger?.error(`Error handling binding request: ${error.message}`);
      this.stats.errorsHandled++;
    }
  }

  /**
   * Create STUN Binding Success Response
   */
  createBindingResponse(stunMessage, rinfo) {
    const response = Buffer.alloc(1024);
    let offset = 0;

    // Message type (Binding Success Response)
    const messageType = STUN.MESSAGE_TYPE.BINDING_SUCCESS_RESPONSE;
    offset = this.writeUInt16BE(response, offset, messageType);

    // Placeholder for message length
    const lengthOffset = offset;
    offset += 2;

    // Magic cookie
    offset = this.writeUInt32BE(response, offset, STUN.MAGIC_COOKIE);

    // Transaction ID (echo from request)
    response.copy(response, offset, 8, 20);
    offset += 12;

    const attributesStart = offset;

    // XOR-MAPPED-ADDRESS attribute
    offset = this.addXORMappedAddress(response, offset, rinfo.address, rinfo.port);

    // SOURCE-ADDRESS attribute
    offset = this.addSourceAddress(response, offset, rinfo.address, rinfo.port);

    // MAPPED-ADDRESS attribute (for compatibility)
    offset = this.addMappedAddress(response, offset, rinfo.address, rinfo.port);

    // SOFTWARE attribute
    const softwareName = Buffer.from(`RoIP-STUN/1.0`);
    offset = this.addAttribute(response, offset, STUN.ATTRIBUTE_TYPE.SOFTWARE, softwareName);

    // MESSAGE-INTEGRITY (if needed)
    // Placeholder - can be implemented if authentication is required

    // FINGERPRINT attribute
    offset = this.addFingerprint(response, offset, stunMessage);

    // Update message length
    const messageLength = offset - 20;
    response.writeUInt16BE(messageLength, lengthOffset);

    return response.slice(0, offset);
  }

  /**
   * Add XOR-MAPPED-ADDRESS attribute (RFC 5389)
   */
  addXORMappedAddress(buffer, offset, address, port) {
    const startOffset = offset;

    // Attribute type and length placeholder
    offset = this.writeUInt16BE(buffer, offset, STUN.ATTRIBUTE_TYPE.XOR_MAPPED_ADDRESS);
    const lengthOffset = offset;
    offset += 2;

    // Reserved (0x00)
    buffer[offset++] = 0x00;

    // Address family (IPv4)
    buffer[offset++] = STUN.ADDRESS_FAMILY.IPV4;

    // XOR port
    const xorPort = port ^ (STUN.MAGIC_COOKIE >> 16);
    offset = this.writeUInt16BE(buffer, offset, xorPort);

    // XOR address (IPv4)
    const ipParts = address.split('.').map(Number);
    const magic = Buffer.alloc(4);
    magic.writeUInt32BE(STUN.MAGIC_COOKIE, 0);

    for (let i = 0; i < 4; i++) {
      buffer[offset + i] = ipParts[i] ^ magic[i];
    }
    offset += 4;

    // Update attribute length
    const length = offset - startOffset - 4;
    buffer.writeUInt16BE(length, lengthOffset);

    // Padding to 4-byte boundary
    while ((offset - 20) % 4 !== 0) {
      buffer[offset++] = 0x00;
    }

    return offset;
  }

  /**
   * Add MAPPED-ADDRESS attribute
   */
  addMappedAddress(buffer, offset, address, port) {
    const startOffset = offset;

    // Attribute type and length placeholder
    offset = this.writeUInt16BE(buffer, offset, STUN.ATTRIBUTE_TYPE.MAPPED_ADDRESS);
    const lengthOffset = offset;
    offset += 2;

    // Reserved (0x00)
    buffer[offset++] = 0x00;

    // Address family (IPv4)
    buffer[offset++] = STUN.ADDRESS_FAMILY.IPV4;

    // Port
    offset = this.writeUInt16BE(buffer, offset, port);

    // Address (IPv4)
    const ipParts = address.split('.').map(Number);
    for (let i = 0; i < 4; i++) {
      buffer[offset++] = ipParts[i];
    }

    // Update attribute length
    const length = offset - startOffset - 4;
    buffer.writeUInt16BE(length, lengthOffset);

    // Padding to 4-byte boundary
    while ((offset - 20) % 4 !== 0) {
      buffer[offset++] = 0x00;
    }

    return offset;
  }

  /**
   * Add SOURCE-ADDRESS attribute
   */
  addSourceAddress(buffer, offset, address, port) {
    const startOffset = offset;

    // Attribute type and length placeholder
    offset = this.writeUInt16BE(buffer, offset, STUN.ATTRIBUTE_TYPE.SOURCE_ADDRESS);
    const lengthOffset = offset;
    offset += 2;

    // Reserved (0x00)
    buffer[offset++] = 0x00;

    // Address family (IPv4)
    buffer[offset++] = STUN.ADDRESS_FAMILY.IPV4;

    // Port
    offset = this.writeUInt16BE(buffer, offset, port);

    // Address (IPv4)
    const ipParts = address.split('.').map(Number);
    for (let i = 0; i < 4; i++) {
      buffer[offset++] = ipParts[i];
    }

    // Update attribute length
    const length = offset - startOffset - 4;
    buffer.writeUInt16BE(length, lengthOffset);

    // Padding to 4-byte boundary
    while ((offset - 20) % 4 !== 0) {
      buffer[offset++] = 0x00;
    }

    return offset;
  }

  /**
   * Add generic attribute
   */
  addAttribute(buffer, offset, type, value) {
    const startOffset = offset;

    // Attribute type
    offset = this.writeUInt16BE(buffer, offset, type);

    // Attribute length
    offset = this.writeUInt16BE(buffer, offset, value.length);

    // Attribute value
    value.copy(buffer, offset);
    offset += value.length;

    // Padding to 4-byte boundary
    while ((offset - 20) % 4 !== 0) {
      buffer[offset++] = 0x00;
    }

    return offset;
  }

  /**
   * Add FINGERPRINT attribute (RFC 5389)
   */
  addFingerprint(buffer, offset, stunMessage) {
    const startOffset = offset;

    // Attribute type
    offset = this.writeUInt16BE(buffer, offset, STUN.ATTRIBUTE_TYPE.FINGERPRINT);

    // Attribute length (always 4 bytes for CRC32)
    offset = this.writeUInt16BE(buffer, offset, 4);

    // Calculate CRC32 fingerprint
    const messageData = buffer.slice(0, startOffset);
    const crc32 = this.calculateCRC32(messageData) ^ 0x5354554e; // XOR with "STUN"

    // Write fingerprint
    offset = this.writeUInt32BE(buffer, offset, crc32);

    return offset;
  }

  /**
   * Parse STUN message
   */
  parseMessage(buffer) {
    if (buffer.length < 20) {
      return null;
    }

    try {
      // Read message type
      const type = buffer.readUInt16BE(0);

      // Read message length
      const length = buffer.readUInt16BE(2);

      // Validate magic cookie
      const magicCookie = buffer.readUInt32BE(4);
      if (magicCookie !== STUN.MAGIC_COOKIE) {
        this.logger?.warn('Invalid STUN magic cookie');
        return null;
      }

      // Read transaction ID
      const transactionId = buffer.slice(8, 20);

      // Parse attributes
      const attributes = this.parseAttributes(buffer.slice(20, 20 + length));

      return {
        type,
        length,
        transactionId,
        attributes,
      };

    } catch (error) {
      this.logger?.error(`Error parsing STUN message: ${error.message}`);
      return null;
    }
  }

  /**
   * Parse STUN attributes
   */
  parseAttributes(buffer) {
    const attributes = {};
    let offset = 0;

    while (offset < buffer.length) {
      if (offset + 4 > buffer.length) break;

      const type = buffer.readUInt16BE(offset);
      const length = buffer.readUInt16BE(offset + 2);

      const value = buffer.slice(offset + 4, offset + 4 + length);

      attributes[type] = value;

      // Move to next attribute (accounting for 4-byte padding)
      offset += 4 + length;
      while (offset % 4 !== 0) {
        offset++;
      }
    }

    return attributes;
  }

  /**
   * Track NAT detection information
   */
  trackNATDetection(address, port, stunMessage) {
    const key = `${address}:${port}`;

    if (!this.natDetection.has(key)) {
      this.natDetection.set(key, {
        address,
        port,
        firstSeen: Date.now(),
        detections: [],
      });
    }

    const detection = this.natDetection.get(key);
    detection.detections.push({
      timestamp: Date.now(),
      transactionId: stunMessage.transactionId.toString('hex'),
      attributes: Object.keys(stunMessage.attributes),
    });

    // Clean up old entries (older than 10 minutes)
    if (Date.now() - detection.firstSeen > 10 * 60 * 1000) {
      this.natDetection.delete(key);
    }
  }

  /**
   * Detect NAT type based on multiple binding requests
   */
  detectNATType(address, port) {
    const key = `${address}:${port}`;
    const detection = this.natDetection.get(key);

    if (!detection || detection.detections.length === 0) {
      return STUN.NAT_TYPE.UNKNOWN;
    }

    // Simple NAT type detection logic
    // In a real implementation, this would require multiple STUN servers
    // and analysis of address/port changes

    const detectionCount = detection.detections.length;

    if (detectionCount >= 3) {
      // Multiple requests from same address/port suggests not symmetric NAT
      return STUN.NAT_TYPE.FULL_CONE;
    }

    return STUN.NAT_TYPE.ADDRESS_RESTRICTED;
  }

  /**
   * Calculate CRC32 checksum (basic implementation)
   */
  calculateCRC32(buffer) {
    const CRC32_TABLE = this.getCRC32Table();
    let crc = 0xffffffff;

    for (let i = 0; i < buffer.length; i++) {
      crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ buffer[i]) & 0xff];
    }

    return (crc ^ 0xffffffff) >>> 0;
  }

  /**
   * Get CRC32 lookup table
   */
  getCRC32Table() {
    if (STUNServer.CRC32_TABLE) {
      return STUNServer.CRC32_TABLE;
    }

    const table = [];
    for (let n = 0; n < 256; n++) {
      let crc = n;
      for (let k = 0; k < 8; k++) {
        crc = ((crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1)) >>> 0;
      }
      table[n] = crc;
    }

    STUNServer.CRC32_TABLE = table;
    return table;
  }

  /**
   * Helper: Write UInt16BE
   */
  writeUInt16BE(buffer, offset, value) {
    buffer.writeUInt16BE(value, offset);
    return offset + 2;
  }

  /**
   * Helper: Write UInt32BE
   */
  writeUInt32BE(buffer, offset, value) {
    buffer.writeUInt32BE(value, offset);
    return offset + 4;
  }

  /**
   * Get server statistics
   */
  getStats() {
    return {
      ...this.stats,
      transactionsActive: this.transactions.size,
      clientsTracked: this.natDetection.size,
      running: this.running,
    };
  }

  /**
   * Get metrics for monitoring
   */
  getMetrics() {
    return {
      stun: {
        running: this.running,
        port: this.port,
        host: this.host,
        ...this.getStats(),
      },
    };
  }

  /**
   * Get detected NAT types for a range of clients
   */
  getNATTypeReport() {
    const report = {
      total: this.natDetection.size,
      byType: {},
    };

    // Count NAT types
    for (const [key, detection] of this.natDetection) {
      const natType = this.detectNATType(detection.address, detection.port);
      report.byType[natType] = (report.byType[natType] || 0) + 1;
    }

    return report;
  }

  /**
   * Get client information
   */
  getClientInfo(address, port) {
    const key = `${address}:${port}`;
    const detection = this.natDetection.get(key);

    if (!detection) {
      return null;
    }

    return {
      address: detection.address,
      port: detection.port,
      natType: this.detectNATType(address, port),
      firstSeen: new Date(detection.firstSeen),
      detectionCount: detection.detections.length,
      lastDetection: detection.detections.length > 0
        ? new Date(detection.detections[detection.detections.length - 1].timestamp)
        : null,
    };
  }
}

export { STUNServer, STUN };
