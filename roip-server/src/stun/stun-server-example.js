/**
 * STUN Server Example and Test
 * Demonstrates STUN binding request/response and NAT detection
 */

import { STUNServer, STUN } from './stun-server.js';
import dgram from 'dgram';

/**
 * Simple logger for testing
 */
const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  debug: (msg) => console.log(`[DEBUG] ${msg}`),
  warn: (msg) => console.log(`[WARN] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`),
};

/**
 * Create and send a STUN Binding Request
 */
function createBindingRequest() {
  const buffer = Buffer.alloc(20);
  let offset = 0;

  // Message type (Binding Request)
  buffer.writeUInt16BE(STUN.MESSAGE_TYPE.BINDING_REQUEST, offset);
  offset += 2;

  // Message length (0 for no attributes)
  buffer.writeUInt16BE(0, offset);
  offset += 2;

  // Magic cookie
  buffer.writeUInt32BE(STUN.MAGIC_COOKIE, offset);
  offset += 4;

  // Transaction ID (random)
  crypto.randomBytes(12).copy(buffer, offset);

  return buffer;
}

/**
 * Example usage
 */
async function runExample() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  STUN Server Example');
  console.log('═══════════════════════════════════════════════════\n');

  const config = {
    port: 3478,
    host: '127.0.0.1',
    alternate_port: 3479,
  };

  const server = new STUNServer(config, logger);

  try {
    // Start STUN server
    console.log('Starting STUN server...');
    await server.start();
    console.log('✓ STUN server started\n');

    // Wait a moment for server to be ready
    await new Promise(resolve => setTimeout(resolve, 500));

    // Send test binding request
    console.log('Sending STUN Binding Request...');
    await sendTestRequest();

    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get server stats
    const stats = server.getStats();
    console.log('\nServer Statistics:');
    console.log(`  Requests received: ${stats.requestsReceived}`);
    console.log(`  Responses sent: ${stats.responseSent}`);
    console.log(`  Errors handled: ${stats.errorsHandled}`);
    console.log(`  Active transactions: ${stats.transactionsActive}`);
    console.log(`  Clients tracked: ${stats.clientsTracked}`);

    // Get metrics
    const metrics = server.getMetrics();
    console.log('\nServer Metrics:');
    console.log(`  Status: ${metrics.stun.running ? 'Running' : 'Stopped'}`);
    console.log(`  Port: ${metrics.stun.port}`);
    console.log(`  Host: ${metrics.stun.host}`);

    // Get NAT report
    const natReport = server.getNATTypeReport();
    console.log('\nNAT Type Report:');
    console.log(`  Total clients: ${natReport.total}`);
    console.log(`  By type: ${JSON.stringify(natReport.byType)}`);

    // Stop server
    console.log('\nStopping STUN server...');
    await server.stop();
    console.log('✓ STUN server stopped\n');

    console.log('═══════════════════════════════════════════════════');
    console.log('  Example completed successfully!');
    console.log('═══════════════════════════════════════════════════');

  } catch (error) {
    console.error(`Error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * Send a test STUN Binding Request
 */
function sendTestRequest() {
  return new Promise((resolve, reject) => {
    const client = dgram.createSocket('udp4');
    const request = createBindingRequest();

    const timeout = setTimeout(() => {
      client.close();
      resolve();
    }, 2000);

    client.on('message', (message, rinfo) => {
      clearTimeout(timeout);
      console.log(`✓ Response received from ${rinfo.address}:${rinfo.port}`);
      console.log(`  Message length: ${message.length} bytes`);

      // Parse response
      if (message.length >= 20) {
        const type = message.readUInt16BE(0);
        const length = message.readUInt16BE(2);
        const magicCookie = message.readUInt32BE(4);

        console.log(`  Type: 0x${type.toString(16).padStart(4, '0')}`);
        console.log(`  Length: ${length}`);
        console.log(`  Magic Cookie: 0x${magicCookie.toString(16)}`);

        // Parse XOR-MAPPED-ADDRESS
        let offset = 20;
        while (offset < message.length) {
          const attrType = message.readUInt16BE(offset);
          const attrLen = message.readUInt16BE(offset + 2);

          if (attrType === STUN.ATTRIBUTE_TYPE.XOR_MAPPED_ADDRESS) {
            console.log(`  ✓ XOR-MAPPED-ADDRESS found`);
            const family = message[offset + 5];
            if (family === STUN.ADDRESS_FAMILY.IPV4) {
              const xorPort = message.readUInt16BE(offset + 6);
              const port = xorPort ^ (STUN.MAGIC_COOKIE >> 16);

              const magic = Buffer.alloc(4);
              magic.writeUInt32BE(STUN.MAGIC_COOKIE, 0);

              const ipBytes = [];
              for (let i = 0; i < 4; i++) {
                ipBytes.push(message[offset + 8 + i] ^ magic[i]);
              }

              const ip = ipBytes.join('.');
              console.log(`    Public IP:   ${ip}`);
              console.log(`    Public Port: ${port}`);
            }
          }

          offset += 4 + attrLen;
          while (offset % 4 !== 0) offset++;
        }
      }

      client.close();
      resolve();
    });

    client.on('error', (err) => {
      clearTimeout(timeout);
      console.error(`Client error: ${err.message}`);
      client.close();
      reject(err);
    });

    console.log('  Sending request to 127.0.0.1:3478...');
    client.send(request, 0, request.length, 3478, '127.0.0.1', (err) => {
      if (err) {
        clearTimeout(timeout);
        console.error(`Send error: ${err.message}`);
        client.close();
        reject(err);
      }
    });
  });
}

// Import crypto at module level
import crypto from 'crypto';

// Run example if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runExample().catch(console.error);
}

export { runExample };
