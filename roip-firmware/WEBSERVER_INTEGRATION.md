# Web Server Integration Guide

## Quick Start

### 1. Include Headers in Your Main Sketch

```cpp
#include "webserver.h"
#include "config.h"

// Create instances
ConfigManager configManager;
RoIPWebServer webServer(&configManager);
```

### 2. Initialize in setup()

```cpp
void setup() {
    Serial.begin(115200);
    delay(1000);

    // Initialize preferences/config
    configManager.begin();
    configManager.load();

    // Initialize WiFi first
    WiFi.mode(WIFI_STA);
    WiFi.begin(configManager.getConfig().wifi_ssid,
               configManager.getConfig().wifi_password);

    // Wait for WiFi connection
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts++ < 20) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("\nWiFi connected!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());

    // Initialize web server
    if (webServer.begin()) {
        Serial.println("Web server started successfully");
    } else {
        Serial.println("Failed to start web server");
    }

    // Set admin password (should be from config)
    webServer.setAdminPassword(configManager.getConfig().admin_password);

    // Enable captive portal if not yet configured
    if (!configManager.getConfig().isConfigured()) {
        webServer.enableCaptivePortal(true);
        Serial.println("Captive portal enabled");
    }
}
```

### 3. Update Loop

```cpp
void loop() {
    // Main loop code for audio, SIP, PTT/COS handling...

    // Periodically broadcast status (every 5 seconds)
    static unsigned long lastBroadcast = 0;
    if (millis() - lastBroadcast > 5000) {
        lastBroadcast = millis();

        webServer.broadcastSystemStatus();
        webServer.broadcastNetworkStatus();
        webServer.broadcastAudioStatus();
    }

    // Rest of loop...
    delay(10);
}
```

## Integration Points

### 1. Configuration Management

The webserver integrates with your existing ConfigManager:

```cpp
// Get configuration
RoIPConfig& config = configManager.getConfig();

// Update and save
config.wifi_ssid = "MyNetwork";
config.sip_server = "sip.example.com";
configManager.save();

// Broadcast changes
webServer.broadcastConfigChanged();
```

### 2. System Status Updates

Update relevant metrics and broadcast:

```cpp
// In your audio processing loop
void updateAudioMetrics() {
    // Your audio processing code...
    webServer.broadcastAudioStatus();
}

// On WiFi connection change
void onWiFiChange() {
    webServer.broadcastNetworkStatus();
}

// On SIP registration
void onSIPStatusChange() {
    // Update configuration
    webServer.broadcastConfigChanged();
}

// On errors
void handleError(const char* errorMsg) {
    webServer.broadcastError(errorMsg);
}
```

### 3. OTA Update Integration

Connect the OTA handler to your update mechanism:

```cpp
// In your setup
server.on("/api/ota/upload", HTTP_POST,
    [](AsyncWebServerRequest *request){},
    [&](AsyncWebServerRequest *request, const String& filename,
        size_t index, uint8_t *data, size_t len, bool final) {
        handleOTAUpdate(request, filename, index, data, len, final);
    });

// OTA update handler
void handleOTAUpdate(AsyncWebServerRequest *request, String filename,
                     size_t index, uint8_t *data, size_t len, bool final) {
    if (!index) {
        Serial.println("OTA Update Start: " + filename);
        if (!Update.begin(UPDATE_SIZE_UNKNOWN, U_FLASH)) {
            Update.printError(Serial);
        }
    }

    if (Update.write(data, len) != len) {
        Update.printError(Serial);
    }

    if (final) {
        if (Update.end(true)) {
            Serial.println("OTA Update Success");
            request->send(200, "text/plain", "Update successful");
            delay(1000);
            ESP.restart();
        } else {
            Serial.println("OTA Update Failed");
            request->send(500, "text/plain", "Update failed");
        }
    }
}
```

### 4. Captive Portal Integration

Auto-enable on first boot:

```cpp
void setup() {
    // ... existing setup code ...

    // Check if device is configured
    if (!isDeviceConfigured()) {
        webServer.enableCaptivePortal(true);
        // Optionally start AP mode
        WiFi.mode(WIFI_AP);
        WiFi.softAP("RoIP-Setup", "password");
    }
}

bool isDeviceConfigured() {
    return strlen(configManager.getConfig().sip_server) > 0 &&
           strlen(configManager.getConfig().wifi_ssid) > 0;
}
```

## API Request Handlers

### Adding Custom Endpoints

```cpp
// In RoIPWebServer class, add to setupAPIRoutes()

// Example: Custom telemetry endpoint
server.on("/api/telemetry", HTTP_GET, [this](AsyncWebServerRequest* request) {
    DynamicJsonDocument doc(512);
    doc["device_uptime"] = millis() / 1000;
    doc["audio_level"] = getCurrentAudioLevel();
    doc["sip_call_active"] = isCallActive();

    String response;
    serializeJson(doc, response);
    request->send(200, "application/json", response);
});

// Example: PTT control endpoint
server.on("/api/ptt/press", HTTP_POST, [this](AsyncWebServerRequest* request) {
    if (!verifyAuth(request)) {
        request->send(401);
        return;
    }

    // Activate PTT
    activatePTT();

    request->send(200, "application/json", "{\"status\":\"ptt_activated\"}");
});
```

## Handling WebSocket Messages

Extend WebSocket message handling for custom commands:

```cpp
// Modify onWSMessage in webserver.cpp
if (cmd == "ptt_press") {
    activatePTT();
    // Broadcast status change
    broadcastAudioStatus();
} else if (cmd == "ptt_release") {
    deactivatePTT();
    broadcastAudioStatus();
} else if (cmd == "get_levels") {
    DynamicJsonDocument doc(256);
    doc["input_level"] = getInputLevel();
    doc["output_level"] = getOutputLevel();
    // Send back to client
}
```

## Memory and Performance Considerations

### 1. Optimize JSON Buffers

```cpp
// In webserver.h, adjust buffer sizes based on available RAM
#define JSON_BUFFER_SIZE_SMALL 256
#define JSON_BUFFER_SIZE_MEDIUM 512
#define JSON_BUFFER_SIZE_LARGE 1024
#define JSON_BUFFER_SIZE_XLARGE 2048
```

### 2. Reduce Embedded Asset Sizes

```cpp
// Options:
// 1. Use GZIP compression
// 2. Minify CSS/JS
// 3. Move assets to LittleFS
// 4. Use progressive enhancement (HTML-only first)

// Example: Serve CSS from LittleFS instead
server.serveStatic("/style.css", LittleFS, "/style.css");
```

### 3. Limit Concurrent Connections

```cpp
#define MAX_WS_CLIENTS 5
#define MAX_HTTP_CLIENTS 10
// Monitor in loop: webServer.getActiveConnections()
```

## Testing

### Test with curl

```bash
# Get status (no auth needed)
curl http://192.168.1.100/api/system/status

# Login
TOKEN=$(curl -X POST -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password"}' \
  http://192.168.1.100/api/auth/login | jq -r .token)

# Get config (requires auth)
curl -H "Authorization: Bearer $TOKEN" \
  http://192.168.1.100/api/config

# Update config
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"device_name":"MyRadio"}' \
  http://192.168.1.100/api/config

# Restart device
curl -X POST -H "Authorization: Bearer $TOKEN" \
  http://192.168.1.100/api/system/restart
```

### Test WebSocket

```bash
# Using wscat
npm install -g wscat

wscat -c ws://192.168.1.100/ws

# In the connection, send:
> {"cmd":"ping"}

# Receive:
< {"type":"pong","time":12345}
```

### Browser DevTools

1. Open http://device-ip in browser
2. Open DevTools (F12)
3. Check Network tab for API requests
4. Check Console for WebSocket messages
5. Monitor Memory usage

## Debugging

### Enable Debug Logging

```cpp
// Add to config.h or build_flags
#define WEBSERVER_DEBUG 1
#define WEBSOCKET_DEBUG 1
#define API_DEBUG 1

// In webserver.cpp, add logging
#ifdef WEBSERVER_DEBUG
Serial.printf("[WebServer] %s\n", message);
#endif
```

### Monitor Heap Usage

```cpp
void loop() {
    static unsigned long lastCheck = 0;
    if (millis() - lastCheck > 10000) {
        lastCheck = millis();
        Serial.printf("Free heap: %d bytes\n", ESP.getFreeHeap());
        Serial.printf("Free PSRAM: %d bytes\n", ESP.getFreePsram());
        Serial.printf("Active WS clients: %d\n",
                      webServer.getActiveWebSocketClients());
    }
}
```

### Check Network Issues

```cpp
// Monitor WiFi
void checkWiFi() {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("WiFi disconnected!");
        webServer.broadcastError("WiFi connection lost");
    }
}

// Monitor DNS
void checkDNS() {
    IPAddress ip;
    if (!WiFi.hostByName("sip.example.com", ip)) {
        Serial.println("DNS resolution failed!");
    }
}
```

## Deployment Checklist

- [ ] All libraries installed (ESPAsyncWebServer, AsyncTCP, ArduinoJson)
- [ ] WebServer header/cpp files in correct directories
- [ ] ConfigManager integrated and initialized
- [ ] WiFi connection established before webserver starts
- [ ] Admin password set securely
- [ ] Captive portal enabled for first-time setup
- [ ] OTA update handler implemented
- [ ] CORS headers configured appropriately
- [ ] Authentication tokens validated
- [ ] Rate limiting implemented (optional but recommended)
- [ ] Memory usage monitored
- [ ] Compiled and tested successfully
- [ ] HTTPS/SSL configured (production)
- [ ] Backup/rollback mechanism in place

## Common Issues and Solutions

### Issue: "Address already in use"
**Solution:** Check if another process is using port 80, or change WEB_SERVER_PORT in webserver.h

### Issue: "WebSocket connection refused"
**Solution:** Verify device IP, check firewall, ensure async handlers are properly registered

### Issue: "Out of memory" errors
**Solution:** Reduce JSON buffer sizes, limit concurrent connections, implement periodic cleanup

### Issue: "Config not saving"
**Solution:** Check Preferences/LittleFS initialization, verify ConfigManager.save() is called

### Issue: "Slow response times"
**Solution:** Check WiFi signal strength, reduce JSON payload sizes, enable compression

### Issue: "Authentication always fails"
**Solution:** Verify token generation, check timestamp synchronization, review token validation logic

## Performance Optimization Tips

1. **Use async/await patterns** - Don't block the event loop
2. **Compress responses** - Implement GZIP compression
3. **Cache responses** - Add cache headers for static assets
4. **Optimize JSON** - Use smaller field names, remove unnecessary data
5. **Stream large responses** - Use chunked transfer encoding
6. **Reduce WebSocket frequency** - Don't update faster than necessary
7. **Use binary frames** - For high-frequency data
8. **Implement rate limiting** - Prevent abuse and overload

## Next Steps

1. Review the embedded HTML/CSS/JS in webserver.cpp
2. Test each REST endpoint manually
3. Verify WebSocket functionality in browser
4. Implement device-specific endpoints as needed
5. Add authentication to protect sensitive operations
6. Set up monitoring and logging
7. Deploy to production environment
8. Plan HTTPS/SSL implementation

For more details, see WEBSERVER_DOCUMENTATION.md
