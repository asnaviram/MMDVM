/**
 * Simulated RTP Audio Stream Handler
 * Generates and processes simulated RTP packets
 */

export class RTPClient {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.rtpSequence = Math.floor(Math.random() * 65535);
    this.rtpTimestamp = Math.floor(Math.random() * 0xFFFFFFFF);
    this.ssrc = Math.floor(Math.random() * 0xFFFFFFFF);
    this.packetsReceived = 0;
    this.bytesReceived = 0;
    this.packetsLost = 0;
    this.jitter = 0;
    this.latency = [];
  }

  /**
   * Generate RTP packet header
   */
  generateRtpPacket(audioData) {
    const packet = Buffer.alloc(12 + audioData.length);

    // V(2), P(1), X(1), CC(4)
    packet[0] = 0x80; // Version 2, no padding, no extension, 0 CSRC

    // M(1), PT(7) - PT 96 for Opus
    packet[1] = 0x60; // M=0, PT=96

    // Sequence number
    packet.writeUInt16BE(this.rtpSequence++, 2);

    // Timestamp
    packet.writeUInt32BE(this.rtpTimestamp, 4);
    this.rtpTimestamp += 960; // 40ms at 24kHz

    // SSRC
    packet.writeUInt32BE(this.ssrc, 8);

    // Audio data
    audioData.copy(packet, 12);

    return packet;
  }

  /**
   * Generate simulated audio data
   */
  generateAudioSample() {
    // Simulate 20ms of audio at 24kHz = 480 samples
    const audioSize = 960; // 40ms frame
    const audioData = Buffer.alloc(audioSize);

    // Generate pseudo-random audio data (simplified)
    for (let i = 0; i < audioSize; i++) {
      audioData[i] = Math.floor(Math.random() * 256);
    }

    return audioData;
  }

  /**
   * Simulate audio transmission
   */
  async sendAudioPackets(duration = 5000, packetsPerSecond = 25) {
    const totalPackets = Math.floor((duration / 1000) * packetsPerSecond);
    const packetInterval = 1000 / packetsPerSecond;
    let packetCount = 0;

    return new Promise((resolve) => {
      const startTime = Date.now();
      const packets = [];

      const sendPacket = async () => {
        if (packetCount >= totalPackets) {
          resolve({
            packetsSent: packetCount,
            bytesSent: packetCount * 1024,
            duration: Date.now() - startTime,
            packets
          });
          return;
        }

        const audioData = this.generateAudioSample();
        const rtpPacket = this.generateRtpPacket(audioData);

        packets.push({
          sequence: this.rtpSequence - 1,
          timestamp: this.rtpTimestamp,
          size: rtpPacket.length,
          sentAt: Date.now()
        });

        packetCount++;
        setTimeout(sendPacket, packetInterval);
      };

      sendPacket();
    });
  }

  /**
   * Simulate receiving audio packets
   */
  async receiveAudioPackets(expectedPackets = 50) {
    let receivedCount = 0;
    const receivedPackets = [];
    const startTime = Date.now();

    return new Promise((resolve) => {
      const receivePacket = () => {
        if (receivedCount >= expectedPackets) {
          const stats = this.calculateStatistics(receivedPackets, startTime);
          resolve(stats);
          return;
        }

        // Simulate packet arrival with occasional jitter
        const jitter = Math.random() * 20; // 0-20ms
        const delay = 40 + jitter; // 40ms base + jitter

        setTimeout(() => {
          receivedCount++;
          receivedPackets.push({
            sequence: this.rtpSequence++,
            timestamp: this.rtpTimestamp,
            receivedAt: Date.now(),
            size: 960
          });

          this.packetsReceived++;
          this.bytesReceived += 960;
          this.latency.push(Date.now() - startTime);

          receivePacket();
        }, delay);
      };

      receivePacket();
    });
  }

  /**
   * Calculate RTP statistics
   */
  calculateStatistics(packets, startTime) {
    const duration = Date.now() - startTime;
    const averageLatency = this.latency.length > 0
      ? this.latency.reduce((a, b) => a + b, 0) / this.latency.length
      : 0;

    // Simulate RTCP metrics
    const stats = {
      packetsReceived: this.packetsReceived,
      bytesReceived: this.bytesReceived,
      packetsLost: this.packetsLost,
      packetLossPercent: this.packetsReceived > 0
        ? (this.packetsLost / (this.packetsReceived + this.packetsLost) * 100).toFixed(2)
        : 0,
      averageLatency: averageLatency.toFixed(2),
      jitter: this.calculateJitter(packets),
      rtt: (Math.random() * 50 + 10).toFixed(2), // 10-60ms
      duration,
      bitrate: ((this.bytesReceived * 8) / (duration / 1000) / 1000).toFixed(2) // kbps
    };

    return stats;
  }

  /**
   * Calculate jitter (simplified)
   */
  calculateJitter(packets) {
    if (packets.length < 2) return 0;

    const intervals = [];
    for (let i = 1; i < packets.length; i++) {
      const interval = packets[i].receivedAt - packets[i - 1].receivedAt;
      intervals.push(interval);
    }

    const average = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, interval) => {
      return sum + Math.pow(interval - average, 2);
    }, 0) / intervals.length;

    return Math.sqrt(variance).toFixed(2);
  }

  /**
   * Simulate RTCP report exchange
   */
  async exchangeRtcpReports() {
    return new Promise((resolve) => {
      setTimeout(() => {
        const reports = {
          sender: {
            packetCount: this.rtpSequence - 1,
            octetCount: (this.rtpSequence - 1) * 960,
            timestamp: Date.now()
          },
          receiver: {
            packetsReceived: this.packetsReceived,
            bytesReceived: this.bytesReceived,
            jitter: this.jitter,
            lastSR: Date.now() - 1000
          }
        };

        this.logger.debug('RTCP reports exchanged', reports);
        resolve(reports);
      }, 100);
    });
  }

  /**
   * Reset statistics
   */
  resetStatistics() {
    this.rtpSequence = Math.floor(Math.random() * 65535);
    this.rtpTimestamp = Math.floor(Math.random() * 0xFFFFFFFF);
    this.packetsReceived = 0;
    this.bytesReceived = 0;
    this.packetsLost = 0;
    this.jitter = 0;
    this.latency = [];
  }
}

export default RTPClient;
