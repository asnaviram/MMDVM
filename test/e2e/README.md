# RoIP E2E Integration Tests

Comprehensive end-to-end integration tests for the RoIP (Radio over IP) system. Simulates a complete real-world scenario of two ESP32 devices connecting through a server for radio communication.

## Overview

The E2E test suite executes 8 major test stages:

1. **Server Startup & Verification** - Initialize and verify all services
2. **Device 1 Registration** - First ESP32 device SIP registration
3. **Device 2 Registration** - Second ESP32 device SIP registration
4. **Call Initiation** - SIP call establishment between devices
5. **Audio Transmission** - RTP audio streaming with quality monitoring
6. **Call Features** - PTT, VOX, audio quality, jitter buffer testing
7. **Call Termination** - Proper call tear-down and cleanup
8. **Verification & Cleanup** - Verify metrics and check for memory leaks

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Docker & Docker Compose (optional, for full stack testing)

### Installation

```bash
cd /home/user/MMDVM/test/e2e
npm install
```

### Run Tests

**Basic Test (Standalone):**
```bash
node runner.js
```

**With Verbose Output:**
```bash
VERBOSE=true node runner.js
```

**Full Stack Test (Requires Docker):**
```bash
bash test_e2e.sh
```

## Test Architecture

### Core Components

#### config.js
Centralized test configuration with:
- Server endpoints
- Device definitions
- Test parameters
- Logging settings

**Usage:**
```javascript
import config from './config.js';
// Customize test parameters
config.test.callDuration = 10000; // 10 seconds
```

#### logger.js
Custom logging framework with:
- Timestamped log entries
- Log level control (info, debug, warn, error)
- File and console output
- Structured data logging

**Usage:**
```javascript
import TestLogger from './logger.js';
const logger = new TestLogger(config);
logger.success('Operation completed', { data: 'value' });
```

#### sip-client.js
Simulated ESP32 SIP client that:
- Generates valid SIP messages
- Simulates REGISTER, INVITE, BYE flows
- Creates SDP session descriptions
- Tracks call state

**Usage:**
```javascript
import { SIPClient } from './sip-client.js';
const client = new SIPClient(deviceConfig, logger);
await client.register();
await client.sendInvite('sip:device2@roip.local');
```

#### rtp-client.js
RTP audio stream handler that:
- Generates simulated RTP packets
- Simulates audio transmission/reception
- Calculates quality metrics (jitter, latency)
- Exchanges RTCP reports

**Usage:**
```javascript
import { RTPClient } from './rtp-client.js';
const rtp = new RTPClient(deviceConfig, logger);
const stats = await rtp.sendAudioPackets(5000, 25); // 5s, 25pps
```

#### test-harness.js
Main test orchestration that:
- Coordinates all test stages
- Manages device lifecycle
- Collects and aggregates metrics
- Generates final report

**Usage:**
```javascript
import E2ETestHarness from './test-harness.js';
const harness = new E2ETestHarness(config);
const results = await harness.run();
```

#### runner.js
Entry point for executing tests with:
- Error handling
- Process exit codes
- Output formatting

## Test Stages Explained

### Stage 1: Server Startup & Verification
Tests basic server initialization:
- Database connectivity
- Health check endpoint
- Service discovery

**Expected Results:**
- Database initialized in ~10-50ms
- Health check responds within timeout
- Server info retrieved successfully

### Stage 2 & 3: Device Registration
Tests ESP32 device SIP registration:
- WiFi connection simulation
- SIP REGISTER message handling
- Device database entry creation
- Registration expiry tracking

**Expected Results:**
- Each registration completes in ~800ms
- Devices appear in database
- Registration expires in 1 hour

### Stage 4: Call Initiation
Tests SIP call establishment:
- Device 1 sends INVITE
- Device 2 receives and accepts with 200 OK
- RTP ports negotiated via SDP
- Call state established

**Expected Results:**
- Call establishment in ~1000ms
- Call ID assigned
- RTP ports allocated
- Both devices synchronized

### Stage 5: Audio Transmission
Tests RTP audio quality:
- Device 1 transmits 125 RTP packets (5 seconds @ 25pps)
- Device 2 receives all packets
- Quality metrics collected:
  - Packet loss
  - Latency
  - Jitter
  - Bitrate
  - RTT
- RTCP reports exchanged

**Expected Results:**
- 0% packet loss
- Latency: 10-50ms (typical LAN)
- Jitter: < 10ms
- Bitrate: ~150+ kbps

### Stage 6: Call Features
Tests advanced RoIP features:
- **PTT (Push-to-Talk):** Activation and duration
- **VOX (Voice Activation):** Threshold and detection
- **Audio Quality:** SNR, THD, frequency response
- **Jitter Buffer:** Delay adaptation and status

**Expected Results:**
- PTT activation detected
- VOX threshold: -40dBFS
- SNR: > 15dB
- Jitter buffer: 20-120ms adaptive range

### Stage 7: Call Termination
Tests proper call tear-down:
- Device 1 sends BYE message
- RTP streams closed
- Call logged to database
- Resources released

**Expected Results:**
- BYE sent within 100ms
- Call record created
- All metrics logged
- No resource leaks

### Stage 8: Verification & Cleanup
Final verification:
- Call duration validation
- Audio metrics verification
- Memory leak detection
- Resource cleanup verification

**Expected Results:**
- All metrics match recorded values
- No memory leaks
- All resources freed
- Database connections closed

## Configuration

### config.js

```javascript
export const config = {
  // Server endpoints
  server: {
    host: 'localhost',
    sipPort: 5060,
    apiPort: 8080,
    websocketPort: 8081,
  },

  // Test devices
  devices: {
    device1: {
      deviceId: 'ESP32-DEV-001',
      username: 'device1',
      password: 'test_password_1',
      // ... more config
    },
    device2: {
      // ... similar config
    }
  },

  // Test parameters
  test: {
    timeout: 30000,        // 30 second timeout
    callDuration: 5000,    // 5 second calls
    audioPackets: 10,      // RTP packets per test
    rtcpInterval: 1000,    // RTCP report interval
  }
};
```

### Environment Variables

Control test behavior via environment variables:

```bash
# Verbose logging
VERBOSE=true node runner.js

# Skip Docker services
SKIP_DOCKER=true bash test_e2e.sh

# Custom timeout
TIMEOUT=60 bash test_e2e.sh

# Skip cleanup
SKIP_CLEANUP=true node runner.js
```

## Output and Reporting

### Console Output

Test execution produces formatted console output:

```
============================================================
  Stage 1: Server Startup & Verification
============================================================

[TIMESTAMP] [INFO] Checking database connectivity...
[TIMESTAMP] [SUCCESS] ✓ Database initialized
[TIMESTAMP] [INFO] Server startup completed in 29ms
```

### Log Files

- **Detailed Log:** `/tmp/roip_e2e_test.log`
  - All log messages with timestamps
  - Debug information
  - Error details

- **Test Report:** `/tmp/roip_e2e_report.json`
  - Structured test results
  - Metrics and statistics
  - Test summary

### Test Report

Comprehensive markdown report generated at: `E2E_TEST_REPORT.md`

Includes:
- Executive summary
- Stage-by-stage results
- Performance metrics
- Audio quality analysis
- System architecture validation
- Conclusions and recommendations

## Performance Metrics

Expected timing for each stage (on localhost):

| Stage | Expected Duration | Typical Range |
|-------|-------------------|---------------|
| Server Startup | < 50ms | 10-100ms |
| Device 1 Reg | < 1000ms | 700-1200ms |
| Device 2 Reg | < 1000ms | 700-1200ms |
| Call Init | < 1500ms | 1000-2000ms |
| Audio Trans | ~6000ms* | 5000-7000ms |
| Call Features | < 1000ms | 400-1000ms |
| Call Termination | < 1000ms | 400-1000ms |
| Verification | < 100ms | 10-100ms |

*Audio stage includes 5 second call duration

## Troubleshooting

### Tests Fail to Connect to Server

**Problem:** Connection refused on port 5060/8080
```
ECONNREFUSED 127.0.0.1:5060
```

**Solution:**
- Ensure RoIP server is running
- Check server configuration (correct ports)
- Use SKIP_DOCKER=false to start services

```bash
bash test_e2e.sh
```

### Tests Hang

**Problem:** Tests don't complete within timeout
**Solution:**
- Increase timeout: `TIMEOUT=120 bash test_e2e.sh`
- Check server logs: `docker logs roip-server`
- Verify network connectivity

### Memory Issues

**Problem:** High memory usage during audio transmission
**Solution:**
- Reduce audio packet count in config
- Close other applications
- Check for resource leaks in server

### Database Errors

**Problem:** SQLite database locked or corrupted
**Solution:**
```bash
# Remove test database
rm /tmp/roip_e2e_test.db

# Re-run tests
node runner.js
```

## Advanced Usage

### Custom Test Configuration

Modify test parameters:

```javascript
// test-harness.js modifications
const customConfig = {
  ...config,
  test: {
    callDuration: 10000,    // 10 second calls
    audioPackets: 20,       // More packets
  }
};
const harness = new E2ETestHarness(customConfig);
```

### Running Specific Stages

Extract and run individual test stages:

```javascript
const harness = new E2ETestHarness(config);

// Run only server startup
await harness.testServerStartup();

// Run device registration
await harness.testDevice1Registration();
await harness.testDevice2Registration();
```

### Adding Custom Tests

Extend test harness with new stages:

```javascript
class CustomTestHarness extends E2ETestHarness {
  async testCustomFeature() {
    this.logger.section('Custom Test Stage');
    // Your test logic here
    this.results.custom = { /* results */ };
  }
}
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests
on: [push, pull_request]

jobs:
  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - name: Install dependencies
        run: npm install
        working-directory: test/e2e
      - name: Run E2E tests
        run: node runner.js
        working-directory: test/e2e
```

### Docker Compose Pipeline

```bash
# Build and test
cd /home/user/MMDVM
docker-compose -f docker/docker-compose.yml up -d
sleep 10
cd test/e2e && npm install && node runner.js
docker-compose -f docker/docker-compose.yml down
```

## Best Practices

1. **Run tests regularly** - Execute E2E tests after each code change
2. **Monitor metrics** - Track performance trends over time
3. **Use real network** - Test with actual network conditions when possible
4. **Load testing** - Extend tests for concurrent call scenarios
5. **Error injection** - Test with packet loss and delay
6. **Integration** - Combine with unit tests for full coverage

## Support

For issues or questions:
1. Check test logs: `/tmp/roip_e2e_test.log`
2. Review test report: `E2E_TEST_REPORT.md`
3. Check server logs: `docker logs roip-server`
4. Verify configuration: `config.js`

## License

GPL-2.0 - See LICENSE file in project root

## Contributing

To add new tests or improve existing ones:
1. Add test stage to `test-harness.js`
2. Update configuration in `config.js` if needed
3. Document in this README
4. Run full test suite
5. Commit with clear message

---

**Last Updated:** 2025-11-22
**Version:** 1.0.0
**Status:** Production Ready
