/**
 * RTP Manager - Usage Examples
 *
 * This file demonstrates how to use the RTPManager class for:
 * - Creating and managing RTP streams
 * - Audio transmission
 * - Conference mixing
 * - Statistics tracking
 * - Stream relaying
 *
 * @example
 * import { RTPManager } from './rtp-manager.js';
 *
 * // Initialize RTP Manager
 * const rtpManager = new RTPManager({
 *   portRangeStart: 10000,
 *   portRangeEnd: 10100,
 *   maxStreams: 50,
 *   enableMixing: true,
 *   enableRTCP: true
 * });
 *
 * // Listen for events
 * rtpManager.on('streamCreated', (info) => {
 *   console.log(`Stream created:`, info);
 * });
 *
 * rtpManager.on('error', (error) => {
 *   console.error('RTP Error:', error.message);
 * });
 *
 * rtpManager.on('audioPacket', ({ streamId, packet }) => {
 *   console.log(`Received audio from ${streamId}, sequence: ${packet.sequenceNumber}`);
 * });
 *
 * try {
 *   // Create stream for first user
 *   const stream1 = rtpManager.createStream(
 *     'user1',
 *     '192.168.1.100',
 *     5000,
 *     { label: 'User 1' }
 *   );
 *   console.log(`User1 listening on port: ${stream1.localPort}`);
 *
 *   // Create stream for second user
 *   const stream2 = rtpManager.createStream(
 *     'user2',
 *     '192.168.1.101',
 *     5000,
 *     { label: 'User 2' }
 *   );
 *   console.log(`User2 listening on port: ${stream2.localPort}`);
 *
 *   // Create stream for third user
 *   const stream3 = rtpManager.createStream(
 *     'user3',
 *     '192.168.1.102',
 *     5000
 *   );
 *
 *   // Example 1: Simple Relay (forward user1 packets to user2)
 *   rtpManager.setupRelay('user1', 'user2');
 *   console.log('Relay setup: user1 -> user2');
 *
 *   // Example 2: Multi-stream Relay (forward user1 packets to both user2 and user3)
 *   rtpManager.setupRelay('user1', ['user2', 'user3']);
 *   console.log('Relay setup: user1 -> [user2, user3]');
 *
 *   // Example 3: Bidirectional Relay
 *   rtpManager.setupRelay('user2', ['user1', 'user3']);
 *   rtpManager.setupRelay('user3', ['user1', 'user2']);
 *   console.log('Bidirectional relay configured');
 *
 *   // Example 4: Send audio to a stream
 *   // Create a 160-sample G.711 mu-law encoded audio frame (20ms at 8kHz)
 *   const audioFrame = Buffer.from([
 *     0xff, 0xfe, 0xfd, 0xfc, // Sample audio data
 *     // ... more samples ...
 *   ]);
 *   rtpManager.sendAudio('user1', audioFrame, 8000, 8); // PT=8 for PCMU (G.711)
 *
 *   // Example 5: Conference mixing
 *   // Start mixing from all active streams
 *   rtpManager.startMixing();
 *   console.log('Conference mixing started');
 *
 *   // Mix only specific streams
 *   rtpManager.startMixing(['user1', 'user2']);
 *   console.log('Selective mixing started: user1 + user2');
 *
 *   // Example 6: Get statistics
 *   setTimeout(() => {
 *     const managerStats = rtpManager.getStats();
 *     console.log('Manager Stats:', managerStats);
 *
 *     const stream1Stats = rtpManager.getStreamStats('user1');
 *     console.log('User1 Stats:', stream1Stats);
 *
 *     const allStreams = rtpManager.getActiveStreams();
 *     console.log('Active streams:', allStreams);
 *   }, 5000);
 *
 *   // Example 7: Remove relay
 *   rtpManager.removeRelay('user1', 'user2');
 *   console.log('Relay removed: user1 -/-> user2');
 *
 *   // Example 8: Stop mixing
 *   rtpManager.stopMixing();
 *   console.log('Conference mixing stopped');
 *
 *   // Example 9: Destroy a stream
 *   rtpManager.destroyStream('user3');
 *   console.log('Stream user3 destroyed');
 *
 *   // Example 10: Graceful shutdown
 *   setTimeout(() => {
 *     rtpManager.shutdown();
 *     console.log('RTP Manager shutdown complete');
 *     process.exit(0);
 *   }, 30000);
 *
 * } catch (error) {
 *   console.error('Error:', error.message);
 *   process.exit(1);
 * }
 */

import { RTPManager } from './rtp-manager.js';

/**
 * Example 1: Basic RTP Stream Management
 */
export async function exampleBasicStreamManagement() {
  console.log('\n=== Example 1: Basic Stream Management ===\n');

  const rtpManager = new RTPManager({
    portRangeStart: 10000,
    portRangeEnd: 10100,
    maxStreams: 50,
    enableMixing: true
  });

  rtpManager.on('streamCreated', (info) => {
    console.log(`[Event] Stream created - ${info.streamId} on port ${info.localPort}`);
  });

  rtpManager.on('error', (error) => {
    console.error(`[Error] ${error.message}`);
  });

  try {
    // Create streams
    const user1 = rtpManager.createStream('user1', '192.168.1.100', 5000);
    const user2 = rtpManager.createStream('user2', '192.168.1.101', 5000);

    console.log('Created streams:', {
      user1: { port: user1.localPort, ssrc: user1.ssrc },
      user2: { port: user2.localPort, ssrc: user2.ssrc }
    });

    // Get active streams
    const activeStreams = rtpManager.getActiveStreams();
    console.log(`Active streams: ${activeStreams.length}`);

    // Get manager stats
    const stats = rtpManager.getStats();
    console.log('Manager stats:', {
      streamsCreated: stats.streamsCreated,
      streamsActive: stats.streamsActive,
      availablePorts: stats.availablePorts
    });

    // Cleanup
    rtpManager.shutdown();
  } catch (error) {
    console.error('Example failed:', error.message);
  }
}

/**
 * Example 2: Packet Relaying between Streams
 */
export async function examplePacketRelaying() {
  console.log('\n=== Example 2: Packet Relaying ===\n');

  const rtpManager = new RTPManager({
    portRangeStart: 10000,
    portRangeEnd: 10100
  });

  rtpManager.on('audioPacket', ({ streamId, packet }) => {
    console.log(`[Audio] ${streamId} - Seq: ${packet.sequenceNumber}, TS: ${packet.timestamp}`);
  });

  try {
    // Create three streams
    const stream1 = rtpManager.createStream('speaker', '192.168.1.100', 5000);
    const stream2 = rtpManager.createStream('listener1', '192.168.1.101', 5000);
    const stream3 = rtpManager.createStream('listener2', '192.168.1.102', 5000);

    console.log('Created 3 streams: speaker, listener1, listener2');

    // Setup relay: speaker -> [listener1, listener2]
    rtpManager.setupRelay('speaker', ['listener1', 'listener2']);
    console.log('Relay configured: speaker -> [listener1, listener2]');

    // Simulate audio transmission
    const dummyAudio = Buffer.alloc(160, 0xFF); // 160 bytes of dummy audio
    rtpManager.sendAudio('speaker', dummyAudio, 8000, 8);
    console.log('Audio packet sent from speaker');

    // Get stats
    const speakerStats = rtpManager.getStreamStats('speaker');
    console.log('Speaker stats:', {
      packetsSent: speakerStats.packetsSent,
      bytesSent: speakerStats.bytesSent
    });

    // Cleanup
    rtpManager.shutdown();
  } catch (error) {
    console.error('Example failed:', error.message);
  }
}

/**
 * Example 3: Conference Audio Mixing
 */
export async function exampleConferenceMixing() {
  console.log('\n=== Example 3: Conference Mixing ===\n');

  const rtpManager = new RTPManager({
    portRangeStart: 10000,
    portRangeEnd: 10100,
    enableMixing: true,
    mixInterval: 20
  });

  rtpManager.on('mixingStarted', ({ streams }) => {
    console.log(`[Mixing] Started mixing from ${streams.length} streams`);
  });

  rtpManager.on('mixingStopped', () => {
    console.log('[Mixing] Stopped');
  });

  try {
    // Create conference participants
    const participants = [];
    for (let i = 1; i <= 3; i++) {
      const stream = rtpManager.createStream(
        `participant${i}`,
        `192.168.1.${100 + i}`,
        5000
      );
      participants.push(`participant${i}`);
    }

    console.log(`Created ${participants.length} conference participants`);

    // Start mixing all participants
    rtpManager.startMixing(participants);
    console.log('Conference mixing started');

    // Get mixer stats
    setTimeout(() => {
      const managerStats = rtpManager.getStats();
      console.log('Mixer stats:', managerStats.mixerStats);

      // Stop mixing
      rtpManager.stopMixing();

      // Cleanup
      rtpManager.shutdown();
    }, 2000);
  } catch (error) {
    console.error('Example failed:', error.message);
  }
}

/**
 * Example 4: Audio Sending and Reception
 */
export async function exampleAudioTransmission() {
  console.log('\n=== Example 4: Audio Transmission ===\n');

  const rtpManager = new RTPManager();

  rtpManager.on('audioPacket', ({ streamId, packet }) => {
    console.log(
      `[Received] ${streamId} - Seq: ${packet.sequenceNumber}, ` +
      `Payload Length: ${packet.payloadLength} bytes`
    );
  });

  try {
    // Create two communicating streams
    const streamA = rtpManager.createStream('deviceA', '192.168.1.200', 5000);
    const streamB = rtpManager.createStream('deviceB', '192.168.1.201', 5000);

    console.log('Created streams:');
    console.log(`  deviceA: port ${streamA.localPort}, SSRC ${streamA.ssrc}`);
    console.log(`  deviceB: port ${streamB.localPort}, SSRC ${streamB.ssrc}`);

    // Send audio from A to B
    const audioData = Buffer.alloc(160, 0x80); // 160 bytes of audio at 8kHz (20ms)
    const result = rtpManager.sendAudio('deviceA', audioData, 8000, 8);
    console.log(`Audio sent from deviceA: ${result}`);

    // Send return audio from B to A
    const returnAudio = Buffer.alloc(160, 0x40);
    rtpManager.sendAudio('deviceB', returnAudio, 8000, 8);
    console.log('Audio sent from deviceB');

    // Wait and get statistics
    setTimeout(() => {
      const statsA = rtpManager.getStreamStats('deviceA');
      const statsB = rtpManager.getStreamStats('deviceB');

      console.log('Statistics:');
      console.log(`  deviceA packets sent: ${statsA.packetsSent}, bytes: ${statsA.bytesSent}`);
      console.log(`  deviceB packets sent: ${statsB.packetsSent}, bytes: ${statsB.bytesSent}`);

      rtpManager.shutdown();
    }, 1000);
  } catch (error) {
    console.error('Example failed:', error.message);
  }
}

/**
 * Example 5: Advanced Stream Statistics
 */
export async function exampleStreamStatistics() {
  console.log('\n=== Example 5: Stream Statistics ===\n');

  const rtpManager = new RTPManager({
    enableMixing: true
  });

  try {
    // Create multiple streams with different loads
    const streams = ['user1', 'user2', 'user3'];
    for (let i = 0; i < streams.length; i++) {
      rtpManager.createStream(streams[i], `192.168.1.${100 + i}`, 5000 + i);
    }

    // Simulate some activity
    for (let j = 0; j < 5; j++) {
      for (const streamId of streams) {
        const audio = Buffer.alloc(160, Math.random() * 256);
        rtpManager.sendAudio(streamId, audio, 8000, 8);
      }
    }

    // Print comprehensive statistics
    console.log('\n--- Manager Statistics ---');
    const managerStats = rtpManager.getStats();
    console.log(`Streams created: ${managerStats.streamsCreated}`);
    console.log(`Streams active: ${managerStats.streamsActive}`);
    console.log(`Available ports: ${managerStats.availablePorts}`);
    console.log(`Mixing enabled: ${managerStats.mixingEnabled}`);
    console.log(`Uptime: ${managerStats.uptime}ms`);

    console.log('\n--- Stream Statistics ---');
    for (const streamId of streams) {
      const stats = rtpManager.getStreamStats(streamId);
      console.log(`\n${streamId}:`);
      console.log(`  Packets sent: ${stats.packetsSent}`);
      console.log(`  Packets received: ${stats.packetsReceived}`);
      console.log(`  Bytes sent: ${stats.bytesSent}`);
      console.log(`  Bytes received: ${stats.bytesReceived}`);
      console.log(`  Uptime: ${stats.uptime}ms`);
      console.log(`  Jitter buffer: ${stats.jitterBufferStats.packetsAdded} added, ` +
        `${stats.jitterBufferStats.packetsLost} lost`);
    }

    rtpManager.shutdown();
  } catch (error) {
    console.error('Example failed:', error.message);
  }
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const example = process.argv[2] || '1';

  switch (example) {
    case '1':
      exampleBasicStreamManagement().catch(console.error);
      break;
    case '2':
      examplePacketRelaying().catch(console.error);
      break;
    case '3':
      exampleConferenceMixing().catch(console.error);
      break;
    case '4':
      exampleAudioTransmission().catch(console.error);
      break;
    case '5':
      exampleStreamStatistics().catch(console.error);
      break;
    default:
      console.log('Usage: node rtp-manager.example.js [1-5]');
      console.log('Examples:');
      console.log('  1 - Basic Stream Management');
      console.log('  2 - Packet Relaying');
      console.log('  3 - Conference Mixing');
      console.log('  4 - Audio Transmission');
      console.log('  5 - Stream Statistics');
      process.exit(1);
  }
}
