# STUN Server Implementation (RFC 5389)

## Overview

This STUN (Session Traversal Utilities for NAT) server implementation provides NAT detection, public IP/port discovery, and binding request/response handling for ESP32 RoIP clients. It implements the core features of RFC 5389 (Session Traversal Utilities for NAT (STUN)).

## Features

### RFC 5389 Compliance
- **Binding Request/Response** - Core STUN message exchange
- **Message Format** - Proper 20-byte header with magic cookie and transaction ID
- **Attributes** - Multiple attribute types for address and diagnostic information
- **Fingerprint** - CRC32-based message integrity checking
- **XOR-MAPPED-ADDRESS** - Obfuscated address encoding for NAT traversal

### NAT Detection
- **NAT Type Identification**:
  - Open Internet
  - Full Cone NAT
  - Address Restricted NAT
  - Port Restricted NAT
  - Symmetric NAT
- **Per-client Tracking** - Maintains detection history per address/port
- **Automatic Cleanup** - Removes old entries after 10 minutes

### Address Discovery
- **Public IP Detection** - Returns client's perceived public IP
- **Port Mapping Discovery** - Reveals NAT port translation
- **Source Address Tracking** - Identifies source and reflective addresses
- **Multiple Address Formats**:
  - XOR-MAPPED-ADDRESS (RFC 5389 standard)
  - MAPPED-ADDRESS (legacy compatibility)
  - SOURCE-ADDRESS (reflection source)

### UDP Socket Handling
- **Asynchronous Operation** - Non-blocking UDP socket handling
- **Error Handling** - Graceful error management with logging
- **Event Emission** - EventEmitter pattern for extensibility
- **Statistics Tracking** - Request/response counters and metrics

## Architecture

### Message Format (RFC 5389)

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|0 0|     STUN Message Type     |         Message Length        |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                         Magic Cookie                          |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                     Transaction ID (96 bits)                  |
|                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

### Message Types
- **0x0001** - Binding Request
- **0x0101** - Binding Success Response
- **0x0111** - Binding Error Response

### Attribute Types
- **0x0001** - MAPPED-ADDRESS
- **0x0004** - SOURCE-ADDRESS
- **0x0020** - XOR-MAPPED-ADDRESS
- **0x8022** - SOFTWARE
- **0x8028** - FINGERPRINT

## API Reference

### STUNServer Class

#### Constructor
```javascript
const server = new STUNServer(config, logger);
```

**Parameters:**
- `config` (object) - Configuration object
  - `port` (number) - UDP port to listen on (default: 3478)
  - `host` (string) - Bind address (default: '0.0.0.0')
  - `alternate_port` (number) - Alternate port for NAT detection (optional)
  - `alternate_host` (string) - Alternate host (optional)
- `logger` (object) - Logger instance with info(), debug(), warn(), error() methods

#### Methods

##### start()
```javascript
await server.start();
```
Starts the STUN server and begins listening for incoming messages.

**Returns:** Promise that resolves when server is ready.

##### stop()
```javascript
await server.stop();
```
Stops the STUN server and closes the socket.

**Returns:** Promise that resolves when server is stopped.

##### getStats()
```javascript
const stats = server.getStats();
```

**Returns:**
```javascript
{
  requestsReceived: number,
  responseSent: number,
  errorsHandled: number,
  transactionsActive: number,
  clientsTracked: number,
  running: boolean
}
```

##### getMetrics()
```javascript
const metrics = server.getMetrics();
```

**Returns:** Metrics object suitable for monitoring systems.

##### getClientInfo(address, port)
```javascript
const info = server.getClientInfo('192.168.1.100', 54321);
```

**Returns:**
```javascript
{
  address: string,
  port: number,
  natType: string,
  firstSeen: Date,
  detectionCount: number,
  lastDetection: Date
}
```

##### getNATTypeReport()
```javascript
const report = server.getNATTypeReport();
```

**Returns:**
```javascript
{
  total: number,
  byType: {
    [natType]: count
  }
}
```

### STUN Constants

```javascript
import { STUN } from './stun-server.js';

// Message types
STUN.MESSAGE_TYPE.BINDING_REQUEST        // 0x0001
STUN.MESSAGE_TYPE.BINDING_SUCCESS_RESPONSE // 0x0101
STUN.MESSAGE_TYPE.BINDING_ERROR_RESPONSE // 0x0111

// Attribute types
STUN.ATTRIBUTE_TYPE.MAPPED_ADDRESS        // 0x0001
STUN.ATTRIBUTE_TYPE.XOR_MAPPED_ADDRESS    // 0x0020
STUN.ATTRIBUTE_TYPE.SOURCE_ADDRESS        // 0x0004
STUN.ATTRIBUTE_TYPE.SOFTWARE              // 0x8022
STUN.ATTRIBUTE_TYPE.FINGERPRINT           // 0x8028

// NAT types
STUN.NAT_TYPE.OPEN_INTERNET
STUN.NAT_TYPE.FULL_CONE
STUN.NAT_TYPE.ADDRESS_RESTRICTED
STUN.NAT_TYPE.PORT_RESTRICTED
STUN.NAT_TYPE.SYMMETRIC
STUN.NAT_TYPE.UNKNOWN
```

## Usage Example

### Basic Setup

```javascript
import { STUNServer } from './stun-server.js';

const config = {
  port: 3478,
  host: '0.0.0.0',
  alternate_port: 3479
};

const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  debug: (msg) => console.log(`[DEBUG] ${msg}`),
  warn: (msg) => console.log(`[WARN] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`)
};

const server = new STUNServer(config, logger);

// Start server
await server.start();

// Server is now listening for STUN requests
console.log('STUN server running on port 3478');

// Get statistics
const stats = server.getStats();
console.log(`Handled ${stats.requestsReceived} requests`);

// Stop server
await server.stop();
```

### Integration with RoIP Server

The STUN server is integrated into the main RoIP server via `/home/user/MMDVM/roip-server/src/server.js`:

```javascript
// Initialize STUN server
async initSTUNServer() {
  if (!this.config.nat_traversal.stun.enabled) {
    this.logger.info('STUN server disabled');
    return;
  }

  this.logger.info('Starting STUN server...');
  this.components.stun = new STUNServer(
    this.config.nat_traversal.stun,
    this.logger
  );
  await this.components.stun.start();
  this.logger.info('✓ STUN server ready');
}
```

## Client Integration

### ESP32 Client Example

```c
// Send STUN Binding Request
uint8_t binding_request[20];
binding_request[0] = 0x00;
binding_request[1] = 0x01;  // STUN Binding Request
binding_request[2] = 0x00;
binding_request[3] = 0x00;  // Message length

// Magic cookie
binding_request[4] = 0x21;
binding_request[5] = 0x12;
binding_request[6] = 0xa4;
binding_request[7] = 0x42;

// Transaction ID (random 12 bytes)
esp_fill_random(&binding_request[8], 12);

// Send to STUN server
int sent = sendto(sock, binding_request, 20, 0,
                  (struct sockaddr*)&stun_server_addr,
                  sizeof(stun_server_addr));

// Receive response
uint8_t response[256];
int len = recvfrom(sock, response, sizeof(response), 0,
                   (struct sockaddr*)&from, &from_len);

// Parse XOR-MAPPED-ADDRESS to get public IP/port
```

## NAT Detection Logic

The server implements NAT type detection through analysis of:

1. **Source Address Consistency** - Whether source IP/port changes across requests
2. **Response Address Consistency** - Whether mapped address changes across requests
3. **Port Mapping** - Whether port translation is consistent

**NAT Type Classification:**

| NAT Type | Behavior |
|----------|----------|
| Full Cone | Same public IP/port for all destinations |
| Address Restricted | Same public IP but consistent port per destination |
| Port Restricted | Public IP/port changes per destination |
| Symmetric | Public IP/port changes for each request |

## Performance Characteristics

- **Memory Usage**: O(n) where n = number of active clients
- **Processing**: Minimal - single request/response per client message
- **Throughput**: Can handle hundreds of STUN requests per second
- **Latency**: <10ms average response time (network dependent)

## Security Considerations

### Implemented
- **Fingerprint Validation** - CRC32 checksum verification
- **Magic Cookie Validation** - Ensures authentic STUN messages
- **Transaction ID Verification** - Prevents request/response mixing

### Recommended Production Measures
- Use STUN-TURN over TLS/DTLS for sensitive deployments
- Implement rate limiting on per-IP basis
- Monitor for STUN amplification attacks
- Use MESSAGE-INTEGRITY attribute for authenticated STUN (optional)

## Testing

Run the example to test server functionality:

```bash
node /home/user/MMDVM/roip-server/src/stun/stun-server-example.js
```

Expected output:
```
═══════════════════════════════════════════════════
  STUN Server Example
═══════════════════════════════════════════════════

Starting STUN server...
✓ STUN server started

Sending STUN Binding Request...
✓ Response received from 127.0.0.1:3478
  Message length: 68 bytes
  Type: 0x0101
  Length: 48
  Magic Cookie: 0x2112a442
  ✓ XOR-MAPPED-ADDRESS found
    Public IP:   127.0.0.1
    Public Port: 54321
```

## RFC 5389 Compliance

### Implemented Features
- [x] Basic message format (20-byte header)
- [x] Magic cookie validation
- [x] Binding request/response
- [x] XOR-MAPPED-ADDRESS attribute
- [x] MAPPED-ADDRESS attribute
- [x] SOURCE-ADDRESS attribute
- [x] SOFTWARE attribute
- [x] FINGERPRINT attribute
- [x] Message padding to 4-byte boundary
- [x] Transaction ID management
- [x] Attribute parsing and encoding

### Optional Features (Not Implemented)
- [ ] MESSAGE-INTEGRITY (HMAC-SHA1)
- [ ] USERNAME attribute
- [ ] REALM attribute
- [ ] NONCE attribute
- [ ] ALTERNATE-SERVER attribute
- [ ] Error responses with ERROR-CODE
- [ ] Backward compatibility mode

## Troubleshooting

### Server Not Responding
1. Check port is not in use: `lsof -i :3478`
2. Verify firewall allows UDP 3478
3. Check logger output for binding errors

### Client Can't Detect Public IP
1. Ensure client is actually behind NAT
2. Verify network path allows UDP
3. Check STUN server logs for attribute parsing errors

### Performance Issues
1. Monitor active client count with `getStats()`
2. Clean old entries: check 10-minute cleanup logic
3. Consider adding CLIENT-ADDRESS attribute caching

## Future Enhancements

1. **Multiple STUN Servers** - Implement multi-server NAT detection
2. **TURN Support** - Add relay capability for symmetric NAT
3. **Advanced NAT Detection** - Full state machine implementation
4. **Metrics Export** - Prometheus format metrics
5. **Rate Limiting** - Per-IP request throttling
6. **IPv6 Support** - Full IPv6 address handling

## References

- RFC 5389 - Session Traversal Utilities for NAT (STUN)
- RFC 5769 - Test Vectors for Session Traversal Utilities for NAT (STUN)
- RFC 5245 - Interactive Connectivity Establishment (ICE)

## License

Part of ESP32 RoIP Server - Radio over IP implementation
