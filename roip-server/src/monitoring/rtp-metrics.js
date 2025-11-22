/**
 * RTP Metrics Exporter for Prometheus
 *
 * Tracks RTP/audio quality metrics:
 * - Packet loss
 * - Jitter
 * - Latency
 * - Buffer statistics
 * - Audio codec performance
 */

import express from 'express';
import { EventEmitter } from 'events';

class RTPMetricsExporter extends EventEmitter {
  constructor(options = {}) {
    super();
    this.port = options.port || 9101;
    this.streamMetrics = new Map(); // Per-stream metrics
    this.aggregateMetrics = {
      packetsReceived: 0,
      packetsSent: 0,
      packetsLost: 0,
      bufferUnderruns: 0,
      bufferOverflows: 0,
      decodeErrors: 0,
      invalidPackets: 0
    };

    this.startServer();
  }

  /**
   * Initialize metrics for a new RTP stream
   */
  initializeStream(callId, deviceId) {
    const streamKey = `${callId}_${deviceId}`;

    this.streamMetrics.set(streamKey, {
      callId,
      deviceId,
      startTime: Date.now(),
      packetsReceived: 0,
      packetsSent: 0,
      packetsLost: 0,
      packetLossPercent: 0,
      jitterMs: 0,
      latencyMs: 0,
      bufferSize: 0,
      bufferUnderruns: 0,
      bufferOverflows: 0,
      decodeErrors: 0,
      invalidPackets: 0,
      lastSequenceNumber: 0,
      lastTimestamp: 0,
      jitterBuffer: [],
      latencyMeasurements: []
    });

    this.emit('streamInitialized', { callId, deviceId });
  }

  /**
   * Update RTP packet statistics
   */
  updatePacketStats(callId, deviceId, stats) {
    const streamKey = `${callId}_${deviceId}`;
    const stream = this.streamMetrics.get(streamKey);

    if (!stream) {
      console.warn(`Stream ${streamKey} not found, initializing...`);
      this.initializeStream(callId, deviceId);
      return;
    }

    // Update packet counters
    if (stats.received !== undefined) {
      stream.packetsReceived = stats.received;
      this.aggregateMetrics.packetsReceived++;
    }

    if (stats.sent !== undefined) {
      stream.packetsSent = stats.sent;
      this.aggregateMetrics.packetsSent++;
    }

    // Calculate packet loss
    if (stats.sequenceNumber !== undefined) {
      const expectedSeq = stream.lastSequenceNumber + 1;
      if (stats.sequenceNumber > expectedSeq && stream.lastSequenceNumber > 0) {
        const lost = stats.sequenceNumber - expectedSeq;
        stream.packetsLost += lost;
        this.aggregateMetrics.packetsLost += lost;
      }
      stream.lastSequenceNumber = stats.sequenceNumber;
    }

    // Calculate packet loss percentage
    if (stream.packetsReceived > 0) {
      stream.packetLossPercent = (stream.packetsLost / (stream.packetsReceived + stream.packetsLost)) * 100;
    }

    // Update jitter
    if (stats.jitter !== undefined) {
      stream.jitterMs = stats.jitter;
      stream.jitterBuffer.push(stats.jitter);
      if (stream.jitterBuffer.length > 100) {
        stream.jitterBuffer.shift();
      }
    }

    // Update latency
    if (stats.latency !== undefined) {
      stream.latencyMs = stats.latency;
      stream.latencyMeasurements.push(stats.latency);
      if (stream.latencyMeasurements.length > 100) {
        stream.latencyMeasurements.shift();
      }
    }

    // Update buffer size
    if (stats.bufferSize !== undefined) {
      stream.bufferSize = stats.bufferSize;
    }
  }

  /**
   * Track buffer underrun
   */
  trackBufferUnderrun(callId, deviceId) {
    const streamKey = `${callId}_${deviceId}`;
    const stream = this.streamMetrics.get(streamKey);

    if (stream) {
      stream.bufferUnderruns++;
      this.aggregateMetrics.bufferUnderruns++;
    }
  }

  /**
   * Track buffer overflow
   */
  trackBufferOverflow(callId, deviceId) {
    const streamKey = `${callId}_${deviceId}`;
    const stream = this.streamMetrics.get(streamKey);

    if (stream) {
      stream.bufferOverflows++;
      this.aggregateMetrics.bufferOverflows++;
    }
  }

  /**
   * Track decode error
   */
  trackDecodeError(callId, deviceId) {
    const streamKey = `${callId}_${deviceId}`;
    const stream = this.streamMetrics.get(streamKey);

    if (stream) {
      stream.decodeErrors++;
      this.aggregateMetrics.decodeErrors++;
    }
  }

  /**
   * Track invalid packet
   */
  trackInvalidPacket(callId, deviceId) {
    const streamKey = `${callId}_${deviceId}`;
    const stream = this.streamMetrics.get(streamKey);

    if (stream) {
      stream.invalidPackets++;
      this.aggregateMetrics.invalidPackets++;
    }
  }

  /**
   * Calculate average jitter for a stream
   */
  getAverageJitter(callId, deviceId) {
    const streamKey = `${callId}_${deviceId}`;
    const stream = this.streamMetrics.get(streamKey);

    if (!stream || stream.jitterBuffer.length === 0) {
      return 0;
    }

    const sum = stream.jitterBuffer.reduce((a, b) => a + b, 0);
    return sum / stream.jitterBuffer.length;
  }

  /**
   * Calculate average latency for a stream
   */
  getAverageLatency(callId, deviceId) {
    const streamKey = `${callId}_${deviceId}`;
    const stream = this.streamMetrics.get(streamKey);

    if (!stream || stream.latencyMeasurements.length === 0) {
      return 0;
    }

    const sum = stream.latencyMeasurements.reduce((a, b) => a + b, 0);
    return sum / stream.latencyMeasurements.length;
  }

  /**
   * Remove stream metrics when call ends
   */
  removeStream(callId, deviceId) {
    const streamKey = `${callId}_${deviceId}`;
    this.streamMetrics.delete(streamKey);
    this.emit('streamRemoved', { callId, deviceId });
  }

  /**
   * Export metrics in Prometheus format
   */
  exportMetrics() {
    let output = '';

    // RTP stream metrics
    output += '# HELP rtp_active_streams Number of active RTP streams\n';
    output += '# TYPE rtp_active_streams gauge\n';
    output += `rtp_active_streams ${this.streamMetrics.size}\n`;

    // Packet metrics per stream
    output += '# HELP rtp_packets_received_total Total RTP packets received\n';
    output += '# TYPE rtp_packets_received_total counter\n';
    output += `rtp_packets_received_total ${this.aggregateMetrics.packetsReceived}\n`;

    output += '# HELP rtp_packets_sent_total Total RTP packets sent\n';
    output += '# TYPE rtp_packets_sent_total counter\n';
    output += `rtp_packets_sent_total ${this.aggregateMetrics.packetsSent}\n`;

    // Packet loss per stream
    output += '# HELP rtp_packet_loss_percent Packet loss percentage per stream\n';
    output += '# TYPE rtp_packet_loss_percent gauge\n';
    for (const [key, stream] of this.streamMetrics) {
      output += `rtp_packet_loss_percent{call_id="${stream.callId}",device_id="${stream.deviceId}"} ${stream.packetLossPercent.toFixed(2)}\n`;
    }

    // Jitter per stream
    output += '# HELP rtp_jitter_ms RTP jitter in milliseconds\n';
    output += '# TYPE rtp_jitter_ms gauge\n';
    for (const [key, stream] of this.streamMetrics) {
      const avgJitter = this.getAverageJitter(stream.callId, stream.deviceId);
      output += `rtp_jitter_ms{call_id="${stream.callId}",device_id="${stream.deviceId}"} ${avgJitter.toFixed(2)}\n`;
    }

    // Latency per stream
    output += '# HELP rtp_latency_ms RTP latency in milliseconds\n';
    output += '# TYPE rtp_latency_ms gauge\n';
    for (const [key, stream] of this.streamMetrics) {
      const avgLatency = this.getAverageLatency(stream.callId, stream.deviceId);
      output += `rtp_latency_ms{call_id="${stream.callId}",device_id="${stream.deviceId}"} ${avgLatency.toFixed(2)}\n`;
    }

    // Buffer size per stream
    output += '# HELP rtp_buffer_size_packets RTP buffer size in packets\n';
    output += '# TYPE rtp_buffer_size_packets gauge\n';
    for (const [key, stream] of this.streamMetrics) {
      output += `rtp_buffer_size_packets{call_id="${stream.callId}",device_id="${stream.deviceId}"} ${stream.bufferSize}\n`;
    }

    // Buffer issues
    output += '# HELP rtp_buffer_underruns_total Total RTP buffer underruns\n';
    output += '# TYPE rtp_buffer_underruns_total counter\n';
    output += `rtp_buffer_underruns_total ${this.aggregateMetrics.bufferUnderruns}\n`;

    output += '# HELP rtp_buffer_overflows_total Total RTP buffer overflows\n';
    output += '# TYPE rtp_buffer_overflows_total counter\n';
    output += `rtp_buffer_overflows_total ${this.aggregateMetrics.bufferOverflows}\n`;

    // Error metrics
    output += '# HELP rtp_decode_errors_total Total RTP decode errors\n';
    output += '# TYPE rtp_decode_errors_total counter\n';
    output += `rtp_decode_errors_total ${this.aggregateMetrics.decodeErrors}\n`;

    output += '# HELP rtp_invalid_packets_total Total invalid RTP packets\n';
    output += '# TYPE rtp_invalid_packets_total counter\n';
    output += `rtp_invalid_packets_total ${this.aggregateMetrics.invalidPackets}\n`;

    output += '# HELP rtp_errors_total Total RTP errors\n';
    output += '# TYPE rtp_errors_total counter\n';
    const totalErrors = this.aggregateMetrics.decodeErrors + this.aggregateMetrics.invalidPackets +
      this.aggregateMetrics.bufferUnderruns + this.aggregateMetrics.bufferOverflows;
    output += `rtp_errors_total ${totalErrors}\n`;

    return output;
  }

  /**
   * Start the metrics HTTP server
   */
  startServer() {
    const app = express();

    app.get('/metrics', (req, res) => {
      res.set('Content-Type', 'text/plain; version=0.0.4');
      res.send(this.exportMetrics());
    });

    app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        activeStreams: this.streamMetrics.size,
        timestamp: Date.now()
      });
    });

    this.server = app.listen(this.port, () => {
      console.log(`RTP metrics exporter listening on port ${this.port}`);
      this.emit('started', { port: this.port });
    });
  }

  /**
   * Stop the metrics server
   */
  stop() {
    if (this.server) {
      this.server.close(() => {
        console.log('RTP metrics exporter stopped');
        this.emit('stopped');
      });
    }
  }

  /**
   * Get stream statistics
   */
  getStreamStats(callId, deviceId) {
    const streamKey = `${callId}_${deviceId}`;
    const stream = this.streamMetrics.get(streamKey);

    if (!stream) {
      return null;
    }

    return {
      callId: stream.callId,
      deviceId: stream.deviceId,
      duration: Date.now() - stream.startTime,
      packetsReceived: stream.packetsReceived,
      packetsSent: stream.packetsSent,
      packetsLost: stream.packetsLost,
      packetLossPercent: stream.packetLossPercent,
      averageJitter: this.getAverageJitter(callId, deviceId),
      averageLatency: this.getAverageLatency(callId, deviceId),
      bufferSize: stream.bufferSize,
      bufferUnderruns: stream.bufferUnderruns,
      bufferOverflows: stream.bufferOverflows,
      decodeErrors: stream.decodeErrors,
      invalidPackets: stream.invalidPackets
    };
  }

  /**
   * Get all active streams
   */
  getAllStreams() {
    const streams = [];
    for (const [key, stream] of this.streamMetrics) {
      streams.push(this.getStreamStats(stream.callId, stream.deviceId));
    }
    return streams;
  }
}

// Singleton instance
let rtpMetricsExporter = null;

export function initializeRTPMetrics(options = {}) {
  if (!rtpMetricsExporter) {
    rtpMetricsExporter = new RTPMetricsExporter(options);
  }
  return rtpMetricsExporter;
}

export function getRTPMetrics() {
  if (!rtpMetricsExporter) {
    throw new Error('RTP metrics exporter not initialized. Call initializeRTPMetrics() first.');
  }
  return rtpMetricsExporter;
}

export default RTPMetricsExporter;
