/**
 * k6 WebSocket/RTP Call Load Test for ESP32 RoIP System
 * Simulates concurrent voice calls to test RTP handling and call management
 */

import ws from 'k6/ws';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import encoding from 'k6/encoding';

// Custom metrics
const callSetupTime = new Trend('call_setup_time');
const callDuration = new Trend('call_duration');
const callFailures = new Rate('call_failures');
const rtpPacketsSent = new Counter('rtp_packets_sent');
const rtpPacketsReceived = new Counter('rtp_packets_received');
const audioQuality = new Trend('audio_quality');

// Configuration
const WS_URL = __ENV.WS_URL || 'ws://localhost:8080';
const RTP_PORT = __ENV.RTP_PORT || 5004;

export const options = {
  stages: [
    { duration: '30s', target: 5 },   // Start with 5 concurrent calls
    { duration: '2m', target: 20 },   // Ramp to 20 calls
    { duration: '3m', target: 50 },   // Stress test with 50 calls
    { duration: '1m', target: 10 },   // Ramp down
    { duration: '30s', target: 0 }    // Cool down
  ],
  thresholds: {
    'call_setup_time': ['p(95)<2000'],      // 95% of calls setup in <2s
    'call_failures': ['rate<0.02'],         // <2% call failure rate
    'rtp_packets_received': ['count>1000']  // Ensure RTP flows
  }
};

// Simulated audio packet (Opus codec, 20ms frame)
function generateAudioPacket() {
  // Simulate Opus encoded audio (960 samples @ 48kHz = 20ms)
  const packetSize = 160; // Typical Opus packet size
  const packet = new Uint8Array(packetSize);

  // Fill with simulated audio data
  for (let i = 0; i < packetSize; i++) {
    packet[i] = Math.floor(Math.random() * 256);
  }

  return packet;
}

export default function() {
  const deviceId = `load-test-${__VU}-${__ITER}`;
  const startTime = Date.now();
  let setupTime = 0;
  let callEstablished = false;
  let packetsReceived = 0;

  group('Call Lifecycle', () => {
    const url = `${WS_URL}?deviceId=${deviceId}`;

    const res = ws.connect(url, {
      tags: { name: 'RoIPCall' }
    }, function(socket) {

      // Call setup phase
      socket.on('open', function() {
        console.log(`[${deviceId}] WebSocket connected`);

        // Register device
        socket.send(JSON.stringify({
          type: 'register',
          deviceId: deviceId,
          capabilities: {
            codec: 'opus',
            sampleRate: 48000,
            channels: 1
          }
        }));
      });

      // Handle incoming messages
      socket.on('message', function(message) {
        const data = JSON.parse(message);

        switch(data.type) {
          case 'registered':
            console.log(`[${deviceId}] Device registered`);

            // Initiate call
            socket.send(JSON.stringify({
              type: 'call',
              from: deviceId,
              to: 'test-receiver',
              codec: 'opus'
            }));
            break;

          case 'call_established':
            callEstablished = true;
            setupTime = Date.now() - startTime;
            callSetupTime.add(setupTime);
            console.log(`[${deviceId}] Call established in ${setupTime}ms`);

            // Start sending RTP packets
            simulateAudioStream(socket);
            break;

          case 'rtp_packet':
            packetsReceived++;
            rtpPacketsReceived.add(1);

            // Measure audio quality (simulated)
            if (data.quality) {
              audioQuality.add(data.quality);
            }
            break;

          case 'call_ended':
            const duration = Date.now() - startTime - setupTime;
            callDuration.add(duration);
            console.log(`[${deviceId}] Call ended, duration: ${duration}ms`);
            socket.close();
            break;

          case 'error':
            console.error(`[${deviceId}] Error: ${data.message}`);
            callFailures.add(1);
            socket.close();
            break;
        }
      });

      // Handle errors
      socket.on('error', function(e) {
        console.error(`[${deviceId}] WebSocket error:`, e);
        callFailures.add(1);
      });

      // Simulate audio stream
      function simulateAudioStream(socket) {
        // Send audio packets for 30 seconds (simulating a call)
        const callDurationMs = 30000;
        const packetIntervalMs = 20; // 20ms packets
        const totalPackets = callDurationMs / packetIntervalMs;
        let packetsSent = 0;

        const interval = setInterval(() => {
          if (packetsSent >= totalPackets) {
            clearInterval(interval);

            // End call
            socket.send(JSON.stringify({
              type: 'end_call',
              deviceId: deviceId
            }));
            return;
          }

          // Generate and send RTP packet
          const audioPacket = generateAudioPacket();
          socket.send(JSON.stringify({
            type: 'rtp_packet',
            deviceId: deviceId,
            sequenceNumber: packetsSent,
            timestamp: Date.now(),
            payload: encoding.b64encode(audioPacket)
          }));

          packetsSent++;
          rtpPacketsSent.add(1);
        }, packetIntervalMs);

        // Cleanup after call duration
        socket.setTimeout(function() {
          clearInterval(interval);
          if (callEstablished) {
            socket.send(JSON.stringify({
              type: 'end_call',
              deviceId: deviceId
            }));
          }
          sleep(1);
          socket.close();
        }, callDurationMs + 5000);
      }

      // Keep connection alive
      socket.setInterval(function() {
        socket.ping();
      }, 10000);
    });

    // Verify call completed successfully
    check(res, {
      'call setup successful': () => callEstablished,
      'packets received': () => packetsReceived > 0,
      'setup time acceptable': () => setupTime < 3000
    });
  });

  // Think time between call attempts
  sleep(5);
}

// Summary handler
export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    test_type: 'call_load_test',
    metrics: {},
    thresholds: {}
  };

  // Extract key metrics
  if (data.metrics.call_setup_time) {
    summary.metrics.call_setup = {
      avg: data.metrics.call_setup_time.values.avg,
      p95: data.metrics.call_setup_time.values['p(95)'],
      p99: data.metrics.call_setup_time.values['p(99)']
    };
  }

  if (data.metrics.call_failures) {
    summary.metrics.failure_rate = data.metrics.call_failures.values.rate;
  }

  if (data.metrics.rtp_packets_sent) {
    summary.metrics.rtp_sent = data.metrics.rtp_packets_sent.values.count;
  }

  if (data.metrics.rtp_packets_received) {
    summary.metrics.rtp_received = data.metrics.rtp_packets_received.values.count;
  }

  // Calculate packet loss
  if (summary.metrics.rtp_sent && summary.metrics.rtp_received) {
    const packetLoss = 1 - (summary.metrics.rtp_received / summary.metrics.rtp_sent);
    summary.metrics.packet_loss_rate = packetLoss;
  }

  return {
    'call-load-summary.json': JSON.stringify(summary, null, 2),
    'stdout': generateTextSummary(summary)
  };
}

function generateTextSummary(summary) {
  let text = '\n=== Call Load Test Results ===\n\n';

  if (summary.metrics.call_setup) {
    text += `Call Setup Time:\n`;
    text += `  Average: ${summary.metrics.call_setup.avg.toFixed(2)}ms\n`;
    text += `  P95: ${summary.metrics.call_setup.p95.toFixed(2)}ms\n`;
    text += `  P99: ${summary.metrics.call_setup.p99.toFixed(2)}ms\n\n`;
  }

  if (summary.metrics.failure_rate !== undefined) {
    text += `Call Failure Rate: ${(summary.metrics.failure_rate * 100).toFixed(2)}%\n\n`;
  }

  if (summary.metrics.rtp_sent && summary.metrics.rtp_received) {
    text += `RTP Statistics:\n`;
    text += `  Packets Sent: ${summary.metrics.rtp_sent}\n`;
    text += `  Packets Received: ${summary.metrics.rtp_received}\n`;
    text += `  Packet Loss: ${(summary.metrics.packet_loss_rate * 100).toFixed(2)}%\n\n`;
  }

  return text;
}
