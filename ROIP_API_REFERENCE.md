# ESP32 RoIP API Reference

Complete API documentation for the RoIP server and ESP32 client.

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Device Management](#device-management)
4. [Call Control](#call-control)
5. [Configuration](#configuration)
6. [Monitoring](#monitoring)
7. [Recording](#recording)
8. [WebSocket Events](#websocket-events)
9. [Error Handling](#error-handling)
10. [Code Examples](#code-examples)

---

## Overview

### API Endpoints

The RoIP system provides a REST API on port 8080:

```
Base URL: http://<device-ip>:8080/api/v1/
```

### Authentication

All endpoints (except `/auth/login`) require JWT authentication:

```
Authorization: Bearer <jwt_token>
```

### Response Format

All responses are JSON:

```json
{
  "status": "success",
  "code": 200,
  "data": { ... },
  "message": "Operation completed"
}
```

Error responses:

```json
{
  "status": "error",
  "code": 400,
  "message": "Invalid request",
  "errors": {
    "field_name": "Error description"
  }
}
```

---

## Authentication

### Login

**Endpoint**: `POST /auth/login`

**Parameters**:
```json
{
  "username": "admin",
  "password": "password123"
}
```

**Response**:
```json
{
  "status": "success",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_in": 3600,
    "user": {
      "id": 1,
      "username": "admin",
      "role": "admin"
    }
  }
}
```

**cURL Example**:
```bash
curl -X POST http://192.168.1.100:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password123"}'

# Save token for subsequent calls
TOKEN=$(curl ... | jq -r '.data.token')
```

### Register New User

**Endpoint**: `POST /auth/register`

**Parameters**:
```json
{
  "username": "newuser",
  "password": "password123",
  "email": "user@example.com",
  "full_name": "John Doe"
}
```

**Response**: Returns user object with token

### Logout

**Endpoint**: `POST /auth/logout`

**Authorization**: Required

**Response**:
```json
{
  "status": "success",
  "message": "Logged out successfully"
}
```

### Verify Token

**Endpoint**: `GET /auth/verify`

**Authorization**: Required

**Response**:
```json
{
  "status": "success",
  "data": {
    "valid": true,
    "expires_in": 1234,
    "user": { ... }
  }
}
```

---

## Device Management

### List All Devices

**Endpoint**: `GET /devices`

**Query Parameters**:
- `status` - Filter by status: "online", "offline", "idle"
- `limit` - Results per page (default: 50)
- `offset` - Pagination offset (default: 0)

**Response**:
```json
{
  "status": "success",
  "data": {
    "devices": [
      {
        "id": 1,
        "device_name": "Repeater 1",
        "sip_uri": "esp32_001@roip.example.com",
        "mac_address": "aa:bb:cc:dd:ee:ff",
        "ip_address": "192.168.1.100",
        "device_type": "esp32-s3",
        "firmware_version": "1.0.0",
        "status": "online",
        "last_registered": "2025-11-21T14:30:00Z",
        "signal_strength": -45,
        "cpu_usage": 35.2,
        "memory_usage": 62.5,
        "last_activity": "2025-11-21T14:35:22Z"
      }
    ],
    "total": 1,
    "limit": 50,
    "offset": 0
  }
}
```

### Get Device Details

**Endpoint**: `GET /devices/<device_id>`

**Response**:
```json
{
  "status": "success",
  "data": {
    "id": 1,
    "device_name": "Repeater 1",
    "user_id": 5,
    "sip_uri": "esp32_001@roip.example.com",
    "mac_address": "aa:bb:cc:dd:ee:ff",
    "ip_address": "192.168.1.100",
    "device_type": "esp32-s3",
    "firmware_version": "1.0.0",
    "status": "online",
    "config": {
      "audio_gain": 5,
      "noise_suppression": "medium",
      "vox_enabled": true,
      "vox_sensitivity": 5
    },
    "metrics": {
      "uptime_seconds": 86400,
      "calls_today": 42,
      "audio_frames_processed": 4320000,
      "packets_sent": 8640,
      "packets_lost": 12,
      "packet_loss_percent": 0.14
    }
  }
}
```

### Create Device

**Endpoint**: `POST /devices`

**Parameters**:
```json
{
  "device_name": "Remote Repeater",
  "user_id": 5,
  "device_type": "esp32-s3",
  "firmware_version": "1.0.0",
  "config": {
    "audio_gain": 5,
    "noise_suppression": "medium"
  }
}
```

**Response**: Returns created device object

### Update Device

**Endpoint**: `PUT /devices/<device_id>`

**Parameters** (all optional):
```json
{
  "device_name": "Updated Name",
  "config": {
    "audio_gain": 8,
    "vox_sensitivity": 6
  }
}
```

**Response**: Returns updated device object

### Delete Device

**Endpoint**: `DELETE /devices/<device_id>`

**Response**:
```json
{
  "status": "success",
  "message": "Device deleted successfully"
}
```

### Get Device Metrics

**Endpoint**: `GET /devices/<device_id>/metrics`

**Query Parameters**:
- `period` - "hour", "day", "week", "month" (default: "day")
- `metric` - Specific metric name (optional)

**Response**:
```json
{
  "status": "success",
  "data": {
    "device_id": 1,
    "period": "day",
    "metrics": {
      "cpu_usage": {
        "min": 20.1,
        "max": 65.3,
        "average": 42.5,
        "current": 45.2
      },
      "memory_usage": {
        "min": 55.0,
        "max": 72.3,
        "average": 63.1,
        "current": 68.5
      },
      "wifi_signal": {
        "min": -65,
        "max": -45,
        "average": -52
      },
      "packet_loss": {
        "min": 0.0,
        "max": 2.3,
        "average": 0.5
      }
    }
  }
}
```

---

## Call Control

### Initiate Call

**Endpoint**: `POST /calls/initiate`

**Parameters**:
```json
{
  "source_device_id": 1,
  "destination_device_id": 2,
  "destination_uri": "esp32_002@roip.example.com"
}
```

**Response**:
```json
{
  "status": "success",
  "data": {
    "call_id": "call_123456_789",
    "source": {
      "id": 1,
      "device_name": "Repeater 1"
    },
    "destination": {
      "id": 2,
      "device_name": "Repeater 2"
    },
    "state": "ringing",
    "started_at": "2025-11-21T14:35:22Z",
    "codec": "opus",
    "bitrate": 24000
  }
}
```

### Answer Call

**Endpoint**: `POST /calls/<call_id>/answer`

**Parameters**:
```json
{
  "device_id": 2
}
```

**Response**:
```json
{
  "status": "success",
  "data": {
    "call_id": "call_123456_789",
    "state": "connected",
    "audio_flow": "bidirectional"
  }
}
```

### End Call

**Endpoint**: `POST /calls/<call_id>/end`

**Parameters**:
```json
{
  "reason": "user_hangup"
}
```

**Response**:
```json
{
  "status": "success",
  "data": {
    "call_id": "call_123456_789",
    "state": "ended",
    "duration": 45,
    "end_reason": "user_hangup"
  }
}
```

### List Active Calls

**Endpoint**: `GET /calls/active`

**Response**:
```json
{
  "status": "success",
  "data": {
    "calls": [
      {
        "call_id": "call_123456_789",
        "source_device_id": 1,
        "dest_device_id": 2,
        "state": "connected",
        "started_at": "2025-11-21T14:35:22Z",
        "duration_seconds": 125,
        "codec": "opus",
        "bitrate": 24000,
        "audio_quality": {
          "jitter_ms": 15.3,
          "packet_loss_percent": 0.2,
          "latency_ms": 95
        }
      }
    ],
    "total": 1
  }
}
```

### Call History

**Endpoint**: `GET /calls/history`

**Query Parameters**:
- `limit` - Results per page (default: 50)
- `offset` - Pagination offset
- `start_date` - ISO 8601 date
- `end_date` - ISO 8601 date
- `source_id` - Filter by source device
- `dest_id` - Filter by destination device

**Response**:
```json
{
  "status": "success",
  "data": {
    "calls": [
      {
        "call_id": "call_123456_789",
        "source_device": {
          "id": 1,
          "name": "Repeater 1"
        },
        "destination_device": {
          "id": 2,
          "name": "Repeater 2"
        },
        "started_at": "2025-11-21T14:35:22Z",
        "ended_at": "2025-11-21T14:36:07Z",
        "duration_seconds": 45,
        "audio_quality": {
          "jitter_ms": 18.5,
          "packet_loss_percent": 0.5,
          "latency_ms": 105,
          "mos": 4.1
        },
        "recording": {
          "available": true,
          "path": "recordings/call_123456_789.wav"
        }
      }
    ],
    "total": 245,
    "limit": 50,
    "offset": 0
  }
}
```

---

## Configuration

### Get Configuration

**Endpoint**: `GET /config`

**Response**:
```json
{
  "status": "success",
  "data": {
    "device": {
      "name": "RoIP Device 1",
      "device_id": "esp32_001"
    },
    "network": {
      "wifi_ssid": "MyNetwork",
      "sip_server": "sip.example.com",
      "sip_port": 5060,
      "sip_username": "esp32_001",
      "dns_servers": ["8.8.8.8", "8.8.4.4"]
    },
    "audio": {
      "sample_rate": 24000,
      "frame_size": 480,
      "input_gain": 5,
      "output_gain": 0,
      "noise_suppression": "medium"
    },
    "codec": {
      "primary": "opus",
      "bitrate": 24000,
      "complexity": 7,
      "vbr_enabled": true,
      "dtx_enabled": true
    },
    "control": {
      "ptt_enabled": true,
      "ptt_delay_ms": 50,
      "ptt_tail_delay_ms": 200,
      "vox_enabled": true,
      "vox_sensitivity": 5,
      "vox_holdover_ms": 1000
    }
  }
}
```

### Update Configuration

**Endpoint**: `PUT /config`

**Parameters** (all optional):
```json
{
  "device": {
    "name": "Updated Device Name"
  },
  "audio": {
    "input_gain": 8,
    "output_gain": 2,
    "noise_suppression": "heavy"
  },
  "codec": {
    "bitrate": 32000,
    "complexity": 8
  }
}
```

**Response**: Returns updated configuration

### Get Specific Config Section

**Endpoint**: `GET /config/<section>`

Where section is: device, network, audio, codec, control, etc.

**Example**: `GET /config/audio`

### Reset Configuration

**Endpoint**: `POST /config/reset`

**Parameters**:
```json
{
  "reset_type": "factory"
}
```

Where reset_type is:
- "factory" - Reset to factory defaults
- "audio" - Reset only audio settings
- "network" - Reset network settings (except WiFi credentials)

**Response**:
```json
{
  "status": "success",
  "message": "Configuration reset to factory defaults. Device rebooting..."
}
```

---

## Monitoring

### System Status

**Endpoint**: `GET /status`

**Response**:
```json
{
  "status": "success",
  "data": {
    "system": {
      "state": "ready",
      "uptime_seconds": 86400,
      "last_boot": "2025-11-20T14:30:00Z",
      "temperature_c": 42.5
    },
    "network": {
      "wifi_connected": true,
      "wifi_ssid": "MyNetwork",
      "wifi_signal_dbm": -52,
      "wifi_signal_percent": 75,
      "ip_address": "192.168.1.100",
      "mac_address": "aa:bb:cc:dd:ee:ff"
    },
    "sip": {
      "registered": true,
      "server": "sip.example.com:5060",
      "username": "esp32_001",
      "last_register": "2025-11-21T14:30:00Z",
      "next_register": "2025-11-21T15:30:00Z"
    },
    "audio": {
      "input_level_dbfs": -18.5,
      "output_level_dbfs": -20.3,
      "codec": "opus",
      "bitrate": 24000
    },
    "cpu": {
      "usage_percent": 45.2,
      "frequency_mhz": 240,
      "cores_active": 2
    },
    "memory": {
      "total_kb": 512,
      "used_kb": 320,
      "free_kb": 192,
      "usage_percent": 62.5
    }
  }
}
```

### Health Check

**Endpoint**: `GET /health`

**Response**:
```json
{
  "status": "healthy",
  "checks": {
    "wifi": "ok",
    "sip": "ok",
    "audio": "ok",
    "storage": "ok",
    "memory": "warning"
  }
}
```

### Audio Levels

**Endpoint**: `GET /audio/levels`

**Response**:
```json
{
  "status": "success",
  "data": {
    "input": {
      "level_dbfs": -18.5,
      "peak_dbfs": -12.0,
      "rms_dbfs": -20.5,
      "clipping": false
    },
    "output": {
      "level_dbfs": -20.3,
      "peak_dbfs": -8.0,
      "rms_dbfs": -22.5,
      "clipping": false
    }
  }
}
```

### Network Quality

**Endpoint**: `GET /network/quality`

**Response**:
```json
{
  "status": "success",
  "data": {
    "wifi": {
      "signal_dbm": -52,
      "signal_percent": 75,
      "snr_db": 35,
      "tx_power_dbm": 17,
      "channel": 6,
      "bandwidth_mhz": 20
    },
    "latency": {
      "to_server_ms": 45,
      "dns_lookup_ms": 12,
      "average_rtt_ms": 50
    },
    "packet_stats": {
      "packets_sent": 8640,
      "packets_received": 8632,
      "packets_lost": 8,
      "loss_percent": 0.09,
      "jitter_ms": 8.5
    }
  }
}
```

### Performance Metrics

**Endpoint**: `GET /metrics`

**Query Parameters**:
- `resolution` - "second", "minute", "hour" (default: "minute")
- `limit` - Number of samples to return (default: 100)

**Response**:
```json
{
  "status": "success",
  "data": {
    "metrics": [
      {
        "timestamp": "2025-11-21T14:35:00Z",
        "cpu_percent": 45.2,
        "memory_percent": 62.5,
        "wifi_signal_dbm": -52,
        "audio_input_level": -18.5,
        "audio_output_level": -20.3,
        "rtp_packets_sent": 50,
        "rtp_packets_lost": 0
      },
      {
        "timestamp": "2025-11-21T14:34:00Z",
        "cpu_percent": 42.1,
        "memory_percent": 61.3,
        "wifi_signal_dbm": -51,
        "audio_input_level": -19.2,
        "audio_output_level": -21.1,
        "rtp_packets_sent": 50,
        "rtp_packets_lost": 0
      }
    ]
  }
}
```

---

## Recording

### List Recordings

**Endpoint**: `GET /recordings`

**Query Parameters**:
- `limit` - Results per page (default: 50)
- `offset` - Pagination offset
- `start_date` - ISO 8601 date filter
- `end_date` - ISO 8601 date filter

**Response**:
```json
{
  "status": "success",
  "data": {
    "recordings": [
      {
        "id": "rec_123456",
        "call_id": "call_123456_789",
        "device_name": "Repeater 1",
        "start_time": "2025-11-21T14:35:22Z",
        "end_time": "2025-11-21T14:36:07Z",
        "duration_seconds": 45,
        "format": "wav",
        "sample_rate": 24000,
        "bit_depth": 16,
        "file_size_kb": 215,
        "path": "recordings/rec_123456.wav"
      }
    ],
    "total": 342,
    "limit": 50,
    "offset": 0
  }
}
```

### Download Recording

**Endpoint**: `GET /recordings/<recording_id>/download`

**Response**: Binary WAV file

**cURL Example**:
```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://device-ip/api/v1/recordings/rec_123456/download \
  --output recording.wav
```

### Delete Recording

**Endpoint**: `DELETE /recordings/<recording_id>`

**Response**:
```json
{
  "status": "success",
  "message": "Recording deleted"
}
```

### Configure Recording

**Endpoint**: `PUT /config/recording`

**Parameters**:
```json
{
  "enabled": true,
  "auto_archive": true,
  "archive_days": 30,
  "storage_path": "/recordings",
  "max_storage_gb": 10
}
```

---

## WebSocket Events

### Connection

Connect to WebSocket endpoint:

```
ws://<device-ip>:8080/api/v1/status
```

With authorization header:

```javascript
const ws = new WebSocket('ws://192.168.1.100:8080/api/v1/status',
  ['authorization', 'Bearer ' + token]
);
```

### Event Types

#### Device Status Change

```json
{
  "type": "device.status_changed",
  "timestamp": "2025-11-21T14:35:22Z",
  "data": {
    "device_id": 1,
    "previous_status": "idle",
    "new_status": "registered",
    "reason": "sip_registered"
  }
}
```

#### Call Started

```json
{
  "type": "call.started",
  "timestamp": "2025-11-21T14:35:22Z",
  "data": {
    "call_id": "call_123456_789",
    "source_device_id": 1,
    "destination_device_id": 2,
    "direction": "outgoing"
  }
}
```

#### Call Ended

```json
{
  "type": "call.ended",
  "timestamp": "2025-11-21T14:36:07Z",
  "data": {
    "call_id": "call_123456_789",
    "duration_seconds": 45,
    "end_reason": "user_hangup",
    "audio_quality": {
      "jitter_ms": 18.5,
      "packet_loss_percent": 0.5,
      "mos": 4.1
    }
  }
}
```

#### Audio Level Update

```json
{
  "type": "audio.level_updated",
  "timestamp": "2025-11-21T14:35:22.123Z",
  "data": {
    "input_level_dbfs": -18.5,
    "output_level_dbfs": -20.3,
    "input_peak_dbfs": -12.0,
    "output_peak_dbfs": -8.0
  }
}
```

#### Metrics Update

```json
{
  "type": "metrics.updated",
  "timestamp": "2025-11-21T14:35:22Z",
  "data": {
    "cpu_percent": 45.2,
    "memory_percent": 62.5,
    "wifi_signal_dbm": -52,
    "temperature_c": 42.5
  }
}
```

#### Error Notification

```json
{
  "type": "error.notification",
  "timestamp": "2025-11-21T14:35:22Z",
  "data": {
    "severity": "warning",
    "error_code": "HIGH_MEMORY_USAGE",
    "message": "Memory usage above 90%"
  }
}
```

---

## Error Handling

### Standard Error Codes

| Code | Meaning | Notes |
|------|---------|-------|
| 200 | OK | Successful request |
| 201 | Created | Resource created |
| 400 | Bad Request | Invalid parameters |
| 401 | Unauthorized | Missing/invalid token |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate resource |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Server Error | Internal server error |
| 503 | Service Unavailable | Server overloaded |

### Error Response Example

```json
{
  "status": "error",
  "code": 400,
  "message": "Validation failed",
  "errors": {
    "device_name": "Device name is required",
    "sip_port": "Port must be between 1024 and 65535"
  }
}
```

### Rate Limiting

API requests are rate-limited per user:

```
Limits:
- Default: 100 requests per minute
- Burst: 200 requests per 10 seconds
- Per-endpoint limits may vary

Response headers:
  X-RateLimit-Limit: 100
  X-RateLimit-Remaining: 87
  X-RateLimit-Reset: 1637507400
```

---

## Code Examples

### Python

```python
import requests
import json

# Configuration
BASE_URL = "http://192.168.1.100:8080/api/v1"
USERNAME = "admin"
PASSWORD = "password123"

# Login
response = requests.post(
    f"{BASE_URL}/auth/login",
    json={"username": USERNAME, "password": PASSWORD}
)
token = response.json()["data"]["token"]
headers = {"Authorization": f"Bearer {token}"}

# Get device status
response = requests.get(f"{BASE_URL}/status", headers=headers)
status = response.json()["data"]
print(f"CPU Usage: {status['cpu']['usage_percent']}%")
print(f"WiFi Signal: {status['network']['wifi_signal_dbm']} dBm")

# Initiate call
call_data = {
    "source_device_id": 1,
    "destination_device_id": 2
}
response = requests.post(
    f"{BASE_URL}/calls/initiate",
    json=call_data,
    headers=headers
)
call = response.json()["data"]
print(f"Call ID: {call['call_id']}")

# Monitor metrics
response = requests.get(
    f"{BASE_URL}/metrics?resolution=second&limit=10",
    headers=headers
)
metrics = response.json()["data"]["metrics"]
for m in metrics:
    print(f"{m['timestamp']}: CPU {m['cpu_percent']}%")
```

### JavaScript/Node.js

```javascript
const axios = require('axios');

const BASE_URL = 'http://192.168.1.100:8080/api/v1';
let token = null;

// Login
async function login(username, password) {
  try {
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      username,
      password
    });
    token = response.data.data.token;
    console.log('Login successful');
  } catch (error) {
    console.error('Login failed:', error.response.data);
  }
}

// Get device list
async function listDevices() {
  try {
    const response = await axios.get(`${BASE_URL}/devices`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data.data.devices;
  } catch (error) {
    console.error('Failed to list devices:', error.response.data);
  }
}

// WebSocket monitoring
function setupWebSocket() {
  const ws = new WebSocket(
    `ws://192.168.1.100:8080/api/v1/status`,
    ['authorization', `Bearer ${token}`]
  );

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    console.log(`Event: ${message.type}`, message.data);
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
}

// Usage
(async () => {
  await login('admin', 'password123');
  const devices = await listDevices();
  devices.forEach(d => console.log(`${d.device_name}: ${d.status}`));
  setupWebSocket();
})();
```

### cURL

```bash
#!/bin/bash

BASE_URL="http://192.168.1.100:8080/api/v1"

# Login and get token
TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password123"}' \
  | jq -r '.data.token')

echo "Token: $TOKEN"

# Get device list
curl -s -X GET "$BASE_URL/devices" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.data.devices[] | {id, device_name, status}'

# Initiate call
curl -s -X POST "$BASE_URL/calls/initiate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"source_device_id":1,"destination_device_id":2}' \
  | jq '.data | {call_id, state}'

# Monitor status
curl -s -X GET "$BASE_URL/status" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.data | {uptime: .system.uptime_seconds, cpu: .cpu.usage_percent, memory: .memory.usage_percent}'
```

---

## Best Practices

1. **Always use HTTPS** in production (not HTTP)
2. **Store tokens securely** (don't log them, use environment variables)
3. **Implement retry logic** for network failures
4. **Use WebSocket** for real-time monitoring (more efficient than polling)
5. **Validate responses** before using data
6. **Handle rate limiting** gracefully
7. **Implement proper error handling** with try/catch
8. **Use connection pooling** for multiple requests
9. **Monitor token expiration** and refresh as needed
10. **Test in development** before production deployment

---

## Rate Limits & Quotas

```
Per-Minute Limits:
  - Anonymous requests: 10/min
  - Authenticated requests: 100/min
  - Admin requests: 500/min

Per-Second Burst Limits:
  - 20 requests/second

Per-Device Limits:
  - Concurrent connections: 10
  - Recordings per day: 1000
  - API calls per hour: 5000
```

---

## Versioning

The API uses URL versioning:

```
/api/v1/     Current stable version
/api/v2/     Future version (when released)
```

---

## Webhooks (Future)

Webhook support planned for v1.1+

---

## Next Steps

- [Client Setup Guide](ROIP_CLIENT_GUIDE.md)
- [Server Deployment](ROIP_SERVER_GUIDE.md)
- [Troubleshooting](ROIP_TROUBLESHOOTING.md)

---

**Last Updated**: November 2025
**API Version**: 1.0
**Version**: 1.0
