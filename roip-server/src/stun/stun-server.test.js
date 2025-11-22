/**
 * STUN Server Unit Tests
 * Tests RFC 5389 implementation and NAT detection functionality
 */

import { STUNServer, STUN } from './stun-server.js';
import dgram from 'dgram';
import crypto from 'crypto';

/**
 * Test Logger
 */
const testLogger = {
  info: (msg) => console.log(`  [INFO] ${msg}`),
  debug: (msg) => { /* silent for tests */ },
  warn: (msg) => console.log(`  [WARN] ${msg}`),
  error: (msg) => console.error(`  [ERROR] ${msg}`),
};

/**
 * Test: STUN Constants
 */
function testConstants() {
  console.log('\n✓ Test: STUN Constants');

  // Validate magic cookie
  if (STUN.MAGIC_COOKIE !== 0x2112a442) {
    throw new Error('Invalid magic cookie');
  }

  // Validate message types
  if (STUN.MESSAGE_TYPE.BINDING_REQUEST !== 0x0001) {
    throw new Error('Invalid binding request type');
  }

  if (STUN.MESSAGE_TYPE.BINDING_SUCCESS_RESPONSE !== 0x0101) {
    throw new Error('Invalid binding success response type');
  }

  // Validate attribute types
  if (STUN.ATTRIBUTE_TYPE.XOR_MAPPED_ADDRESS !== 0x0020) {
    throw new Error('Invalid XOR_MAPPED_ADDRESS type');
  }

  // Validate NAT types
  if (!STUN.NAT_TYPE.FULL_CONE) {
    throw new Error('Missing NAT type');
  }

  console.log('  ✓ All constants valid');
}

/**
 * Test: Server Initialization
 */
async function testServerInitialization() {
  console.log('\n✓ Test: Server Initialization');

  const config = {
    port: 9000,
    host: '127.0.0.1',
  };

  const server = new STUNServer(config, testLogger);

  // Verify properties
  if (server.port !== 9000) {
    throw new Error('Port not set correctly');
  }

  if (server.host !== '127.0.0.1') {
    throw new Error('Host not set correctly');
  }

  if (server.running === true) {
    throw new Error('Server should not be running initially');
  }

  console.log('  ✓ Server initialized correctly');
}

/**
 * Test: STUN Message Creation
 */
function testMessageCreation() {
  console.log('\n✓ Test: STUN Message Creation');

  const buffer = Buffer.alloc(20);
  let offset = 0;

  // Write message type
  buffer.writeUInt16BE(STUN.MESSAGE_TYPE.BINDING_REQUEST, offset);
  offset += 2;

  // Write message length
  buffer.writeUInt16BE(0, offset);
  offset += 2;

  // Write magic cookie
  buffer.writeUInt32BE(STUN.MAGIC_COOKIE, offset);
  offset += 4;

  // Write transaction ID
  crypto.randomBytes(12).copy(buffer, offset);

  // Verify structure
  if (buffer.readUInt16BE(0) !== STUN.MESSAGE_TYPE.BINDING_REQUEST) {
    throw new Error('Message type not written correctly');
  }

  if (buffer.readUInt32BE(4) !== STUN.MAGIC_COOKIE) {
    throw new Error('Magic cookie not written correctly');
  }

  console.log('  ✓ STUN message created correctly');
}

/**
 * Test: Message Parsing
 */
function testMessageParsing() {
  console.log('\n✓ Test: Message Parsing');

  const server = new STUNServer({}, testLogger);

  // Create a valid STUN message
  const buffer = Buffer.alloc(20);
  buffer.writeUInt16BE(STUN.MESSAGE_TYPE.BINDING_REQUEST, 0);
  buffer.writeUInt16BE(0, 2);
  buffer.writeUInt32BE(STUN.MAGIC_COOKIE, 4);
  crypto.randomBytes(12).copy(buffer, 8);

  // Parse message
  const parsed = server.parseMessage(buffer);

  if (!parsed) {
    throw new Error('Message parsing returned null');
  }

  if (parsed.type !== STUN.MESSAGE_TYPE.BINDING_REQUEST) {
    throw new Error('Message type not parsed correctly');
  }

  if (parsed.transactionId.length !== 12) {
    throw new Error('Transaction ID not parsed correctly');
  }

  console.log('  ✓ Message parsing works correctly');
}

/**
 * Test: Invalid Message Handling
 */
function testInvalidMessageHandling() {
  console.log('\n✓ Test: Invalid Message Handling');

  const server = new STUNServer({}, testLogger);

  // Test: Message too short
  const shortMessage = Buffer.alloc(10);
  const result1 = server.parseMessage(shortMessage);
  if (result1 !== null) {
    throw new Error('Should reject short message');
  }

  // Test: Invalid magic cookie
  const invalidMagic = Buffer.alloc(20);
  invalidMagic.writeUInt32BE(0xDEADBEEF, 4);
  const result2 = server.parseMessage(invalidMagic);
  if (result2 !== null) {
    throw new Error('Should reject invalid magic cookie');
  }

  console.log('  ✓ Invalid message handling works correctly');
}

/**
 * Test: CRC32 Calculation
 */
function testCRC32Calculation() {
  console.log('\n✓ Test: CRC32 Calculation');

  const server = new STUNServer({}, testLogger);

  // Test data
  const testData = Buffer.from('STUN');
  const crc1 = server.calculateCRC32(testData);
  const crc2 = server.calculateCRC32(testData);

  if (crc1 !== crc2) {
    throw new Error('CRC32 not deterministic');
  }

  if (crc1 === 0) {
    throw new Error('CRC32 should not be zero for valid data');
  }

  console.log('  ✓ CRC32 calculation works correctly');
}

/**
 * Test: Address Parsing
 */
function testAddressParsing() {
  console.log('\n✓ Test: Address Parsing');

  const testCases = [
    { ip: '127.0.0.1', expected: [127, 0, 0, 1] },
    { ip: '192.168.1.1', expected: [192, 168, 1, 1] },
    { ip: '10.0.0.1', expected: [10, 0, 0, 1] },
  ];

  testCases.forEach(({ ip, expected }) => {
    const parts = ip.split('.').map(Number);
    if (JSON.stringify(parts) !== JSON.stringify(expected)) {
      throw new Error(`IP parsing failed for ${ip}`);
    }
  });

  console.log('  ✓ Address parsing works correctly');
}

/**
 * Test: XOR-MAPPED-ADDRESS Encoding
 */
function testXORMappedAddressEncoding() {
  console.log('\n✓ Test: XOR-MAPPED-ADDRESS Encoding');

  const server = new STUNServer({}, testLogger);
  const buffer = Buffer.alloc(256);

  // Add XOR-MAPPED-ADDRESS
  const offset = server.addXORMappedAddress(buffer, 20, '192.168.1.100', 54321);

  if (offset <= 20) {
    throw new Error('Attribute not added');
  }

  // Verify attribute type
  const attrType = buffer.readUInt16BE(20);
  if (attrType !== STUN.ATTRIBUTE_TYPE.XOR_MAPPED_ADDRESS) {
    throw new Error('Incorrect attribute type');
  }

  // Verify attribute length
  const attrLen = buffer.readUInt16BE(22);
  if (attrLen !== 8) { // 1 reserved + 1 family + 2 port + 4 IP
    throw new Error('Incorrect attribute length');
  }

  console.log('  ✓ XOR-MAPPED-ADDRESS encoding works correctly');
}

/**
 * Test: MAPPED-ADDRESS Encoding
 */
function testMappedAddressEncoding() {
  console.log('\n✓ Test: MAPPED-ADDRESS Encoding');

  const server = new STUNServer({}, testLogger);
  const buffer = Buffer.alloc(256);

  // Add MAPPED-ADDRESS
  const offset = server.addMappedAddress(buffer, 20, '192.168.1.100', 54321);

  if (offset <= 20) {
    throw new Error('Attribute not added');
  }

  // Verify attribute type
  const attrType = buffer.readUInt16BE(20);
  if (attrType !== STUN.ATTRIBUTE_TYPE.MAPPED_ADDRESS) {
    throw new Error('Incorrect attribute type');
  }

  // Verify attribute length
  const attrLen = buffer.readUInt16BE(22);
  if (attrLen !== 8) {
    throw new Error('Incorrect attribute length');
  }

  console.log('  ✓ MAPPED-ADDRESS encoding works correctly');
}

/**
 * Test: NAT Detection Tracking
 */
function testNATDetectionTracking() {
  console.log('\n✓ Test: NAT Detection Tracking');

  const server = new STUNServer({}, testLogger);

  // Create test message
  const buffer = Buffer.alloc(20);
  buffer.writeUInt16BE(STUN.MESSAGE_TYPE.BINDING_REQUEST, 0);
  buffer.writeUInt32BE(STUN.MAGIC_COOKIE, 4);

  const stunMessage = server.parseMessage(buffer);

  // Track detection
  server.trackNATDetection('192.168.1.100', 54321, stunMessage);

  // Verify tracking
  const info = server.getClientInfo('192.168.1.100', 54321);
  if (!info) {
    throw new Error('Client not tracked');
  }

  if (info.address !== '192.168.1.100') {
    throw new Error('Address not stored correctly');
  }

  if (info.port !== 54321) {
    throw new Error('Port not stored correctly');
  }

  if (info.detectionCount !== 1) {
    throw new Error('Detection count incorrect');
  }

  console.log('  ✓ NAT detection tracking works correctly');
}

/**
 * Test: Statistics Collection
 */
function testStatisticsCollection() {
  console.log('\n✓ Test: Statistics Collection');

  const server = new STUNServer({}, testLogger);

  // Verify initial stats
  const stats = server.getStats();

  if (stats.requestsReceived !== 0) {
    throw new Error('Initial requests should be zero');
  }

  if (stats.responseSent !== 0) {
    throw new Error('Initial responses should be zero');
  }

  if (stats.running !== false) {
    throw new Error('Server should not be running initially');
  }

  console.log('  ✓ Statistics collection works correctly');
}

/**
 * Test: Metrics Export
 */
function testMetricsExport() {
  console.log('\n✓ Test: Metrics Export');

  const server = new STUNServer({ port: 3478, host: '0.0.0.0' }, testLogger);

  const metrics = server.getMetrics();

  if (!metrics.stun) {
    throw new Error('Metrics missing stun object');
  }

  if (metrics.stun.port !== 3478) {
    throw new Error('Port not in metrics');
  }

  if (metrics.stun.host !== '0.0.0.0') {
    throw new Error('Host not in metrics');
  }

  if (typeof metrics.stun.requestsReceived !== 'number') {
    throw new Error('requestsReceived not in metrics');
  }

  console.log('  ✓ Metrics export works correctly');
}

/**
 * Run All Tests
 */
async function runAllTests() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  STUN Server Unit Tests');
  console.log('═══════════════════════════════════════════════════');

  const tests = [
    testConstants,
    testServerInitialization,
    testMessageCreation,
    testMessageParsing,
    testInvalidMessageHandling,
    testCRC32Calculation,
    testAddressParsing,
    testXORMappedAddressEncoding,
    testMappedAddressEncoding,
    testNATDetectionTracking,
    testStatisticsCollection,
    testMetricsExport,
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await test();
      passed++;
    } catch (error) {
      failed++;
      console.error(`  ✗ FAILED: ${error.message}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch(console.error);
}

export { runAllTests };
