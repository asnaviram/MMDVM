# RTP Manager Module

A comprehensive Real-Time Protocol (RTP) stream management module for Node.js implementing Radio over IP (RoIP) conferencing capabilities.

## Features

### Core RTP Functionality
- **RTP Packet Handling**: Full RFC 3550 compliant RTP packet parsing and creation
- **RTCP Support**: Sender Report (SR) and Receiver Report (RR) packet generation
- **Dynamic Port Allocation**: Automatic port allocation from configurable range (default: 10000-10100)
- **UDP Socket Management**: Efficient UDP socket handling with error recovery

### Stream Management
- **Stream Creation/Destruction**: Create and manage multiple RTP streams with unique SSRCs
- **Stream Statistics**: Comprehensive per-stream metrics including:
  - Packets sent/received
  - Bytes transmitted/received
  - Uptime tracking
  - Jitter buffer statistics

### Audio Processing
- **Jitter Buffer**: Adaptive jitter buffer to handle out-of-order and delayed packets
- **Audio Mixing**: Conference mixing supporting:
  - Multiple concurrent streams
  - Configurable stream weights
  - Soft clipping to prevent overflow
  - 16-bit PCM audio format
- **Packet Forwarding**: Relay RTP packets between streams with SSRC rewriting

### Advanced Features
- **Event-Driven Architecture**: Comprehensive event emission for all operations
- **Error Handling**: Robust error handling with detailed error reporting
- **Performance Monitoring**: Built-in statistics and metrics tracking
- **Graceful Shutdown**: Clean resource cleanup on shutdown

## Installation

```bash
npm install dgram events
```

Note: `dgram` and `events` are built-in Node.js modules.

## Quick Start

```javascript
import { RTPManager } from './src/rtp/rtp-manager.js';

// Create RTP Manager instance
const rtpManager = new RTPManager({
  portRangeStart: 10000,
  portRangeEnd: 10100,
  maxStreams: 50,
  enableMixing: true,
  enableRTCP: true
});

// Listen for events
rtpManager.on('streamCreated', (info) => {
  console.log(`Stream created: ${info.streamId} on port ${info.localPort}`);
});

rtpManager.on('error', (error) => {
  console.error(`Error: ${error.message}`);
});

// Create a new stream
const stream = rtpManager.createStream(
  'user1',           // unique stream ID
  '192.168.1.100',   // remote IP address
  5000,              // remote port
  { label: 'User 1' }
);

console.log(`Listening on port: ${stream.localPort}`);
```

## Usage Examples

### 1. Basic Stream Creation

```javascript
// Create multiple streams for a conference
const stream1 = rtpManager.createStream('participant1', '192.168.1.100', 5000);
const stream2 = rtpManager.createStream('participant2', '192.168.1.101', 5000);
const stream3 = rtpManager.createStream('participant3', '192.168.1.102', 5000);

console.log('Stream 1 listening on port:', stream1.localPort);
console.log('Stream 1 SSRC:', stream1.ssrc);
```

### 2. Audio Transmission

```javascript
// Create audio frame (160 bytes = 20ms at 8kHz)
const audioFrame = Buffer.alloc(160, 0xFF);

// Send to a stream
rtpManager.sendAudio(
  'participant1',  // target stream ID
  audioFrame,      // audio data (16-bit PCM)
  8000,           // sample rate in Hz
  8               // RTP payload type (8=PCMU/G.711)
);
```

### 3. Packet Relaying

```javascript
// Simple relay: forward speaker's packets to listener
rtpManager.setupRelay('speaker', 'listener');

// Multi-target relay: forward to multiple recipients
rtpManager.setupRelay('speaker', ['listener1', 'listener2']);

// Remove relay
rtpManager.removeRelay('speaker', 'listener');
```

### 4. Conference Mixing

```javascript
// Start mixing all streams
rtpManager.startMixing();

// Or mix specific streams
rtpManager.startMixing(['participant1', 'participant2']);

// Stop mixing
rtpManager.stopMixing();
```

### 5. Statistics

```javascript
// Get manager-level statistics
const stats = rtpManager.getStats();
console.log('Active streams:', stats.streamsActive);
console.log('Mixer stats:', stats.mixerStats);

// Get stream-specific statistics
const streamStats = rtpManager.getStreamStats('participant1');
console.log('Packets sent:', streamStats.packetsSent);
console.log('Bytes received:', streamStats.bytesReceived);
console.log('Uptime:', streamStats.uptime, 'ms');

// Get all active streams
const activeStreams = rtpManager.getActiveStreams();
activeStreams.forEach(stream => {
  console.log(`${stream.streamId}: ${stream.stats.packetsSent} packets sent`);
});
```

## API Reference

### RTPManager Class

#### Constructor

```javascript
new RTPManager(options)
```

**Options:**
- `portRangeStart` (number): Starting port for allocation (default: 10000)
- `portRangeEnd` (number): Ending port for allocation (default: 10100)
- `maxStreams` (number): Maximum concurrent streams (default: 50)
- `enableMixing` (boolean): Enable audio mixing (default: true)
- `enableRTCP` (boolean): Enable RTCP support (default: true)
- `mixInterval` (number): Audio mixing interval in ms (default: 20)

#### Methods

##### Stream Management

```javascript
createStream(streamId, remoteAddress, remotePort, options)
```
Creates a new RTP stream and returns stream info with allocated port.

```javascript
destroyStream(streamId)
```
Destroys a stream and frees allocated resources.

```javascript
getActiveStreams()
```
Returns array of all active streams with their statistics.

##### Audio Operations

```javascript
sendAudio(streamId, audioBuffer, sampleRate, payloadType)
```
Sends audio data to a stream.

**Parameters:**
- `streamId` (string): Target stream identifier
- `audioBuffer` (Buffer): Audio data (16-bit PCM)
- `sampleRate` (number): Sample rate in Hz (default: 8000)
- `payloadType` (number): RTP payload type (default: 8 for PCMU)

**Returns:** boolean - Success status

##### Relaying

```javascript
setupRelay(sourceStreamId, targetStreamIds)
```
Sets up packet relay from source to target stream(s).

```javascript
removeRelay(sourceStreamId, targetStreamIds)
```
Removes relay between streams.

##### Mixing

```javascript
startMixing(streamIds)
```
Starts audio mixing. If streamIds is null, mixes all streams.

```javascript
stopMixing()
```
Stops audio mixing.

##### Statistics

```javascript
getStats()
```
Returns manager-level statistics.

```javascript
getStreamStats(streamId)
```
Returns statistics for a specific stream.

##### Shutdown

```javascript
shutdown()
```
Gracefully shuts down the manager and releases all resources.

#### Events

```javascript
rtpManager.on('streamCreated', (info) => {})
```
Emitted when a new stream is created.

```javascript
rtpManager.on('streamDestroyed', ({ streamId }) => {})
```
Emitted when a stream is destroyed.

```javascript
rtpManager.on('audioPacket', ({ streamId, packet, data }) => {})
```
Emitted when an audio packet is received.

```javascript
rtpManager.on('rtcpPacket', ({ streamId, packet }) => {})
```
Emitted when an RTCP packet is received.

```javascript
rtpManager.on('mixingStarted', ({ streams }) => {})
```
Emitted when audio mixing starts.

```javascript
rtpManager.on('mixingStopped', () => {})
```
Emitted when audio mixing stops.

```javascript
rtpManager.on('error', (error) => {})
```
Emitted when an error occurs.

```javascript
rtpManager.on('shutdown', () => {})
```
Emitted when the manager is shut down.

## RTP Packet Format

The module implements RFC 3550 RTP packet format:

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|V=2|P|X|  CC   |M|     PT      |       sequence number         |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                           timestamp                           |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|           synchronization source (SSRC) identifier            |
+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+
|            contributing source (CSRC) identifiers             |
|                             ....                              |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

## RTP Payload Types

Common RTP payload types supported:

| Type | Codec | Sample Rate | Frame Duration |
|------|-------|-------------|-----------------|
| 0 | PCMU (G.711µ) | 8000 Hz | 20 ms |
| 8 | PCMA (G.711a) | 8000 Hz | 20 ms |
| 9 | G.722 | 16000 Hz | 20 ms |
| 18 | G.729 | 8000 Hz | 20 ms |

## Statistics Structure

### Manager Statistics
```javascript
{
  createdTime: number,           // Timestamp when manager was created
  streamsCreated: number,        // Total streams created
  streamsActive: number,         // Currently active streams
  totalPacketsForwarded: number, // Total packets relayed
  totalPacketsMixed: number,     // Total packets mixed
  availablePorts: number,        // Available ports in pool
  mixerStats: {
    streamsActive: number,       // Active mixer streams
    samplesProcessed: number,    // Total samples mixed
    lastMixTime: number         // Last mix operation time
  },
  mixingEnabled: boolean,        // Mixing status
  uptime: number                // Manager uptime in ms
}
```

### Stream Statistics
```javascript
{
  packetsSent: number,           // RTP packets sent
  packetsReceived: number,       // RTP packets received
  bytesSent: number,             // Total bytes sent
  bytesReceived: number,         // Total bytes received
  lastPacketTime: number,        // Last packet receive timestamp
  createdTime: number,           // Stream creation time
  lastActivityTime: number,      // Last activity timestamp
  jitterBufferStats: {
    packetsAdded: number,        // Packets added to buffer
    packetsRetrieved: number,    // Packets retrieved from buffer
    packetsLost: number,         // Lost packets detected
    latency: number              // Buffer latency in ms
  },
  uptime: number                // Stream uptime in ms
}
```

## Performance Considerations

### Port Allocation
- Default range: 10000-10100 (even ports for RTP, odd for RTCP)
- Maximum 51 simultaneous streams with default range
- Expand range if more streams needed: `portRangeStart: 10000, portRangeEnd: 11000`

### Audio Mixing
- Mixing interval: 20ms (suitable for 8kHz sampling)
- Supports multiple concurrent mixes
- CPU-efficient soft clipping to prevent overflow

### Jitter Buffer
- Default size: 200 packets
- Handles out-of-order arrival
- Configurable via JitterBuffer class

### Memory Usage
- Approximately 5-10 KB per stream baseline
- Additional memory for jitter buffers and socket buffers
- Garbage collection friendly with proper cleanup on stream destroy

## Error Handling

The module emits error events for all failures:

```javascript
rtpManager.on('error', (error) => {
  console.error(`${error.message}`);

  // Handle specific error types
  if (error.message.includes('No available ports')) {
    // Port exhaustion - need to cleanup or expand range
  } else if (error.message.includes('Socket error')) {
    // Network issue
  } else if (error.message.includes('Invalid RTP packet')) {
    // Malformed packet received
  }
});
```

## Examples

See `rtp-manager.example.js` for complete examples:

```bash
# Run example 1: Basic Stream Management
node src/rtp/rtp-manager.example.js 1

# Run example 2: Packet Relaying
node src/rtp/rtp-manager.example.js 2

# Run example 3: Conference Mixing
node src/rtp/rtp-manager.example.js 3

# Run example 4: Audio Transmission
node src/rtp/rtp-manager.example.js 4

# Run example 5: Stream Statistics
node src/rtp/rtp-manager.example.js 5
```

## Testing

Unit tests for RTP Manager:

```bash
npm test -- rtp-manager
```

## License

GPL-2.0

## References

- RFC 3550 - RTP: A Transport Protocol for Real-Time Applications
- RFC 3551 - RTP Profile for Audio and Video Conferences with Minimal Control
- RFC 3389 - Real-Time Transport Protocol (RTP) Payload for Comfort Noise (CN)

## Contributing

Contributions are welcome. Please ensure:
- Code follows existing style conventions
- All features are documented
- Error handling is comprehensive
- Events are properly emitted
