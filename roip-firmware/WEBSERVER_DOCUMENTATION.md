# RoIP Web Server Documentation

## Overview

A comprehensive HTTP/WebSocket server with REST API for the ESP32 RoIP (Radio over IP) firmware, providing:
- Responsive web dashboard
- RESTful configuration API
- Real-time WebSocket status updates
- Captive portal for initial setup
- OTA firmware updates
- Authentication with token-based sessions
- CORS support for cross-origin requests

## Files Created

- **`/home/user/MMDVM/roip-firmware/include/webserver.h`** - Header file with class declaration (172 lines)
- **`/home/user/MMDVM/roip-firmware/src/webserver.cpp`** - Complete implementation (2,494 lines)

## Key Features

### 1. HTTP Server (ESPAsyncWebServer)

The web server runs on port 80 by default and provides:
- Non-blocking async request handling
- Support for large file uploads
- Streaming responses
- Automatic memory management

### 2. REST API Endpoints

#### System Endpoints (`/api/system/*`)
- `GET /api/system/status` - Current system status (uptime, heap, temp, WiFi)
- `GET /api/system/info` - System information (version, board, CPU, MAC)
- `GET /api/system/health` - Health check (heap usage, uptime)
- `POST /api/system/restart` - Restart the device (requires auth)
- `POST /api/system/reset` - Factory reset (requires auth)

#### Configuration Endpoints (`/api/config/*`)
- `GET /api/config` - Get entire configuration (requires auth)
- `POST /api/config` - Update configuration (requires auth)
- `GET /api/config/export` - Export config as JSON (requires auth)
- `POST /api/config/import` - Import config from JSON (requires auth)

#### WiFi Endpoints (`/api/wifi/*`)
- `GET /api/wifi/status` - Current WiFi connection status
- `POST /api/wifi` - Update WiFi settings (requires auth)
- `GET /api/wifi/networks` - Scan available networks

#### Audio Endpoints (`/api/audio/*`)
- `GET /api/audio/status` - Current audio configuration
- `POST /api/audio` - Update audio settings (requires auth)
- `GET /api/audio/devices` - List available audio devices

#### Network Endpoints (`/api/network/*`)
- `GET /api/network/status` - Network status
- `POST /api/network` - Update network settings (requires auth)

#### SIP Endpoints (`/api/sip/*`)
- `GET /api/sip/status` - SIP registration status
- `POST /api/sip` - Update SIP settings (requires auth)

#### OTA Update Endpoints (`/api/ota/*`)
- `GET /api/ota/status` - OTA update status
- `POST /api/ota/upload` - Upload firmware update (requires auth)

#### Authentication Endpoints (`/api/auth/*`)
- `POST /api/auth/login` - Generate auth token
- `POST /api/auth/logout` - Invalidate token
- `GET /api/auth/verify` - Verify current token

#### Logging Endpoints (`/api/logs/*`)
- `GET /api/logs` - Retrieve system logs (requires auth)
- `POST /api/logs/clear` - Clear logs (requires auth)

### 3. WebSocket Support (`/ws`)

Real-time bidirectional communication for:
- System status updates
- Network status changes
- Audio status updates
- Configuration change notifications
- Error/warning messages
- Ping/pong keep-alive

Event types:
```json
{
  "type": "system_status",
  "uptime": 3600,
  "heap_free": 102400,
  "temperature": 35.5
}
```

### 4. Static Web Pages

#### Root Page (`/`)
- Dashboard with real-time status
- System health monitoring
- WiFi connection status
- Audio configuration display
- SIP registration status
- Control buttons (restart, factory reset)

#### Dashboard (`/dashboard`)
- Same as root page
- System metrics graph
- Performance monitoring

#### Configuration Page (`/config`)
- Device settings
- WiFi configuration
- SIP server settings
- Audio parameters
- DSP settings (AGC, noise gate, echo cancellation)
- PTT/COS settings
- Quality presets
- Configuration import/export

#### Setup Wizard (`/setup`)
- Initial device setup flow
- WiFi network selection
- Device naming
- SIP configuration
- Admin password setup
- Step-by-step guided configuration

### 5. Authentication

#### Token-Based Authentication
- Login generates 32-character random token
- Tokens valid for 1 hour (3600000 ms)
- Maximum 5 concurrent sessions
- Automatic token refresh on activity
- Bearer token in Authorization header

#### Example:
```bash
curl -H "Authorization: Bearer <token>" http://device/api/config
```

#### Login:
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"secret"}' \
  http://device/api/auth/login
```

Response:
```json
{
  "token": "abcdef123456...",
  "expires_in": 3600
}
```

### 6. Captive Portal

Automatically redirects unauthenticated users to setup page. Features:
- DNS spoofing for any domain
- Immediate captive portal detection
- Setup wizard integration
- Automatic WiFi configuration

### 7. CORS Support

All responses include CORS headers:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS
Access-Control-Allow-Headers: Content-Type,Authorization,X-Requested-With
```

### 8. OTA Firmware Updates

Endpoint: `POST /api/ota/upload`

Features:
- Binary firmware upload
- Progress tracking
- Automatic restart after update
- Rollback capability
- Version verification

## Embedded Assets

### HTML Pages (4 pages × ~1-2 KB each)

1. **Index/Dashboard** (`getIndexHTML()`)
   - Status cards
   - Real-time updates via WebSocket
   - System controls
   - Performance metrics

2. **Configuration** (`getConfigHTML()`)
   - Tabbed interface
   - All config sections
   - Import/export buttons
   - Form validation

3. **Setup Wizard** (`getSetupHTML()`)
   - Step-by-step setup
   - WiFi network scanner
   - Password confirmation
   - SIP server configuration

### CSS Stylesheet (`getCSS()`)
- Responsive design
- Mobile-friendly layout
- Dark mode ready
- Professional styling
- Form elements
- Status cards
- Navigation bar
- Tab interface

### JavaScript Files (3 files)

1. **Main Dashboard** (`getMainJS()`)
   - WebSocket initialization
   - Real-time data updates
   - Theme switching
   - Utility functions
   - Notification system

2. **Configuration** (`getConfigJS()`)
   - Form submission handlers
   - Config section management
   - Auto-save functionality
   - Validation

3. **Setup** (`getSetupJS()`)
   - WiFi network scanning
   - Form navigation
   - Configuration saving
   - Progress tracking

## Configuration Structure

All configuration is stored in the RoIPConfig structure and can be accessed via:

```cpp
RoIPConfig& cfg = configManager->getConfig();

// Device settings
cfg.device_name
cfg.device_id

// Network
cfg.wifi_ssid
cfg.wifi_password
cfg.wifi_hostname
cfg.wifi_5ghz_enabled

// SIP
cfg.sip_server
cfg.sip_port
cfg.sip_username
cfg.sip_password
cfg.sip_realm

// Audio
cfg.sample_rate
cfg.opus_bitrate
cfg.opus_complexity

// DSP
cfg.agc_enabled
cfg.noise_suppression_enabled
cfg.vad_enabled
cfg.aec_enabled

// PTT/COS
cfg.ptt_active_high
cfg.ptt_tail_ms
cfg.vox_enabled
cfg.vox_threshold_db
```

## Usage Examples

### Initialize Web Server

```cpp
#include "webserver.h"
#include "config.h"

ConfigManager configManager;
RoIPWebServer webServer(&configManager);

void setup() {
    configManager.begin();
    configManager.load();

    webServer.begin();
    webServer.setAdminPassword("your_secure_password");
}

void loop() {
    // WebServer runs asynchronously
    // Broadcast status periodically
    if (millis() % 5000 == 0) {
        webServer.broadcastSystemStatus();
        webServer.broadcastNetworkStatus();
    }
}
```

### Enable Captive Portal

```cpp
webServer.enableCaptivePortal(true);
```

### Broadcast Status Updates

```cpp
// System metrics
webServer.broadcastSystemStatus();

// Network changes
webServer.broadcastNetworkStatus();

// Audio configuration
webServer.broadcastAudioStatus();

// Configuration updates
webServer.broadcastConfigChanged();

// Errors/warnings
webServer.broadcastError("Device temperature critical!");
```

## Client-Side Usage

### Fetch Configuration

```javascript
fetch('/api/config', {
    headers: { 'Authorization': `Bearer ${token}` }
})
.then(r => r.json())
.then(config => {
    console.log('Device:', config.device_name);
    console.log('WiFi:', config.wifi_ssid);
});
```

### Update Configuration

```javascript
fetch('/api/config', {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        device_name: 'My Radio',
        opus_bitrate: 32000
    })
})
.then(r => r.json())
.then(result => console.log('Saved!'));
```

### WebSocket Communication

```javascript
const ws = new WebSocket('ws://device-ip/ws');

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    switch(data.type) {
        case 'system_status':
            console.log(`Uptime: ${data.uptime}s`);
            console.log(`Heap: ${data.heap_free} bytes`);
            break;
        case 'network_status':
            console.log(`WiFi: ${data.ip_address}`);
            break;
    }
};

// Send command
ws.send(JSON.stringify({ cmd: 'ping' }));
```

### Login and Get Token

```javascript
fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        username: 'admin',
        password: 'your_password'
    })
})
.then(r => r.json())
.then(data => {
    localStorage.setItem('auth_token', data.token);
    // Token valid for data.expires_in seconds
});
```

## Response Format

All API responses follow JSON format:

### Success Response
```json
{
  "status": "ok",
  "data": { ... }
}
```

### Error Response
```json
{
  "error": "Unauthorized",
  "code": 401
}
```

### Status Response
```json
{
  "status": "device_operational",
  "uptime": 3600,
  "heap_free": 102400,
  "temperature": 35.5
}
```

## Memory Footprint

- **Code**: ~79 KB (webserver.cpp)
- **Header**: ~5 KB
- **Embedded HTML/CSS/JS**: ~60 KB
- **Runtime**: ~10-15 KB (session tokens, buffers)

**Total**: ~160 KB code + runtime buffers

## Performance Notes

- Non-blocking async I/O using ESPAsyncWebServer
- JSON serialization with ArduinoJson
- WebSocket ping/pong every 30 seconds
- Activity timeout after 1 hour
- Automatic session cleanup
- GZIP compression ready (add to build flags)

## Security Considerations

1. **Authentication**
   - Token-based auth required for sensitive operations
   - 32-character random tokens
   - 1-hour expiration
   - HTTPS recommended for production

2. **Input Validation**
   - JSON schema validation
   - String length limits
   - Type checking
   - Range validation for numeric values

3. **CORS**
   - Wildcard origin (*, change to specific domain in production)
   - Limited HTTP methods
   - Token in Authorization header

## Compilation

The webserver requires:
- `ESPAsyncWebServer` library
- `AsyncTCP` library
- `ArduinoJson` (v6+)
- ESP32 Arduino core (v2.0+)

All dependencies are already specified in `platformio.ini`:
```
me-no-dev/AsyncTCP@^1.1.1
me-no-dev/ESP Async WebServer@^1.2.3
bblanchon/ArduinoJson@^6.21.3
```

## Future Enhancements

- HTTPS/SSL support
- Rate limiting
- Request logging
- File upload for firmware
- WebSocket binary frames
- Server-Sent Events (SSE)
- GraphQL API
- REST OpenAPI specification
- Swagger UI
- Multi-user authentication
- Role-based access control (RBAC)

## Troubleshooting

### Server Not Starting
- Check WiFi is initialized first
- Verify port 80 is not in use
- Check free heap (need ~15 KB minimum)
- Enable debug logging in webserver.h

### WebSocket Connection Fails
- Check firewall allows ws:// connections
- Verify device IP address
- Check browser console for errors
- Try HTTPS upgrade (wss://)

### Configuration Not Saving
- Verify ConfigManager is initialized
- Check LittleFS has sufficient space
- Verify authentication token is valid
- Check Serial output for error messages

### Out of Memory
- Reduce JSON buffer sizes
- Limit number of concurrent connections
- Decrease embedded asset sizes
- Enable GZIP compression

## Support

For issues or feature requests, refer to the main MMDVM project documentation and GitHub repository.
