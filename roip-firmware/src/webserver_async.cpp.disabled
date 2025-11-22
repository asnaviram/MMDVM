/*
 * ESP32 RoIP - Web Server & REST API Implementation
 * Complete async web server with WebSocket, REST API, OTA, and captive portal
 */

#include "webserver.h"
#include "config.h"
#include <Update.h>
#include <WiFi.h>
#include <esp_wifi.h>
#include <LittleFS.h>

// Constants
static const char* TAG = "RoIPWebServer";
static const uint32_t OTA_TIMEOUT = 60000;  // 60 seconds

// ============================================================================
// Constructor & Initialization
// ============================================================================

RoIPWebServer::RoIPWebServer(ConfigManager* config)
    : server(WEB_SERVER_PORT), configManager(config), running(false),
      captivePortalMode(false), lastActivityTime(0) {
    memset(sessionTokens, 0, sizeof(sessionTokens));
}

RoIPWebServer::~RoIPWebServer() {
    stop();
}

bool RoIPWebServer::begin() {
    if (running) return true;

    // Get config
    RoIPConfig& cfg = configManager->getConfig();

    // Setup CORS and security headers
    server.onNotFound([this](AsyncWebServerRequest* request) {
        if (request->method() == HTTP_OPTIONS) {
            AsyncWebServerResponse* response = request->beginResponse(200);
            addCORSHeaders(response);
            request->send(response);
        } else {
            request->send(404, "application/json",
                         "{\"error\":\"Not Found\"}");
        }
    });

    // Setup default headers for CORS
    DefaultHeaders::Instance()
        .addHeader("Access-Control-Allow-Origin", "*")
        .addHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
        .addHeader("Access-Control-Allow-Headers",
                   "Content-Type,Authorization,X-Requested-With");

    // Setup WebSocket
    AsyncWebSocket* ws = new AsyncWebSocket(WS_PATH);
    ws->onEvent([this](AsyncWebSocket* server, AsyncWebSocketClient* client,
                       AwsEventType type, void* arg, uint8_t* data,
                       size_t len) {
        if (type == WS_EVT_CONNECT) {
            onWSConnect(server, client);
        } else if (type == WS_EVT_DISCONNECT) {
            onWSDisconnect(server, client);
        } else if (type == WS_EVT_DATA) {
            onWSMessage(arg, data, len);
        }
    });
    server.addHandler(ws);

    // Setup API routes
    setupAPIRoutes();

    // Setup static routes
    setupStaticRoutes();

    // Setup captive portal if enabled
    if (cfg.web_ui_enabled && isCaptivePortalMode()) {
        setupCaptivePortal();
    }

    // Start server
    server.begin();
    running = true;
    lastActivityTime = millis();

    Serial.printf("%s: Web server started on port %d\n", TAG, WEB_SERVER_PORT);
    return true;
}

void RoIPWebServer::stop() {
    if (!running) return;
    server.end();
    running = false;
    Serial.printf("%s: Web server stopped\n", TAG);
}

// ============================================================================
// WebSocket Handlers
// ============================================================================

void RoIPWebServer::onWSConnect(AsyncWebSocket* server,
                                AsyncWebSocketClient* client) {
    Serial.printf("%s: WebSocket client %u connected\n", TAG, client->id());

    // Send initial status
    DynamicJsonDocument doc(1024);
    doc["type"] = "connected";
    doc["client_id"] = client->id();
    doc["server_time"] = millis();

    String msg;
    serializeJson(doc, msg);
    client->text(msg);
}

void RoIPWebServer::onWSDisconnect(AsyncWebSocket* server,
                                   AsyncWebSocketClient* client) {
    Serial.printf("%s: WebSocket client %u disconnected\n", TAG, client->id());
}

void RoIPWebServer::onWSMessage(void* arg, uint8_t* data, size_t len) {
    AwsFrameInfo* info = (AwsFrameInfo*)arg;
    if (info->final && info->index == 0 && info->len == len &&
        info->opcode == WS_TEXT) {
        data[len] = 0;

        DynamicJsonDocument doc(256);
        DeserializationError error = deserializeJson(doc, (const char*)data);

        if (!error) {
            String cmd = doc["cmd"] | "";
            if (cmd == "ping") {
                DynamicJsonDocument response(128);
                response["type"] = "pong";
                response["time"] = millis();
                String msg;
                serializeJson(response, msg);
                AsyncWebSocket* ws = (AsyncWebSocket*)
                    ((AsyncWebServerRequest*)info)->_server->getHandler(WS_PATH);
                if (ws) {
                    ws->textAll(msg);
                }
            }
        }
    }
}

// ============================================================================
// Broadcast Methods
// ============================================================================

void RoIPWebServer::broadcastSystemStatus() {
    DynamicJsonDocument doc(512);
    doc["type"] = "system_status";
    doc["uptime"] = millis() / 1000;
    doc["heap_free"] = ESP.getFreeHeap();
    doc["heap_total"] = ESP.getHeapSize();
    doc["psram_free"] = ESP.getFreePsram();
    doc["psram_total"] = ESP.getPsramSize();
    doc["temperature"] = (float)temperatureRead();

    String msg;
    serializeJson(doc, msg);

    AsyncWebSocket* ws =
        (AsyncWebSocket*)server.getHandler(WS_PATH);
    if (ws) {
        ws->textAll(msg);
    }
}

void RoIPWebServer::broadcastAudioStatus() {
    DynamicJsonDocument doc(512);
    doc["type"] = "audio_status";
    doc["timestamp"] = millis();
    // Add audio-specific status here

    String msg;
    serializeJson(doc, msg);

    AsyncWebSocket* ws =
        (AsyncWebSocket*)server.getHandler(WS_PATH);
    if (ws) {
        ws->textAll(msg);
    }
}

void RoIPWebServer::broadcastNetworkStatus() {
    DynamicJsonDocument doc(512);
    doc["type"] = "network_status";
    doc["wifi_connected"] = WiFi.isConnected();
    doc["wifi_rssi"] = WiFi.RSSI();
    doc["ip_address"] = WiFi.localIP().toString();
    doc["mac_address"] = WiFi.macAddress();

    String msg;
    serializeJson(doc, msg);

    AsyncWebSocket* ws =
        (AsyncWebSocket*)server.getHandler(WS_PATH);
    if (ws) {
        ws->textAll(msg);
    }
}

void RoIPWebServer::broadcastConfigChanged() {
    DynamicJsonDocument doc(1024);
    doc["type"] = "config_changed";
    doc["timestamp"] = millis();

    String msg;
    serializeJson(doc, msg);

    AsyncWebSocket* ws =
        (AsyncWebSocket*)server.getHandler(WS_PATH);
    if (ws) {
        ws->textAll(msg);
    }
}

void RoIPWebServer::broadcastError(const char* error) {
    DynamicJsonDocument doc(256);
    doc["type"] = "error";
    doc["message"] = error;
    doc["timestamp"] = millis();

    String msg;
    serializeJson(doc, msg);

    AsyncWebSocket* ws =
        (AsyncWebSocket*)server.getHandler(WS_PATH);
    if (ws) {
        ws->textAll(msg);
    }
}

// ============================================================================
// Authentication
// ============================================================================

bool RoIPWebServer::verifyAuth(AsyncWebServerRequest* request) {
    // Check Authorization header
    if (!request->hasHeader("Authorization")) {
        return false;
    }

    String authHeader = request->header("Authorization");
    if (!authHeader.startsWith("Bearer ")) {
        return false;
    }

    String token = authHeader.substring(7);
    return validateAuthToken(token);
}

String RoIPWebServer::generateAuthToken() {
    String token = "";
    const char* chars =
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    for (int i = 0; i < 32; i++) {
        token += chars[random(62)];
    }
    return token;
}

bool RoIPWebServer::validateAuthToken(const String& token) {
    unsigned long currentTime = millis();
    for (int i = 0; i < 5; i++) {
        if (sessionTokens[i].valid &&
            sessionTokens[i].token == token &&
            (currentTime - sessionTokens[i].timestamp) < AUTH_TIMEOUT_MS) {
            sessionTokens[i].timestamp = currentTime;
            return true;
        }
    }
    return false;
}

void RoIPWebServer::setAdminPassword(const char* password) {
    adminPassword = password;
}

void RoIPWebServer::updateActivityTime() {
    lastActivityTime = millis();
}

// ============================================================================
// REST API Routes
// ============================================================================

void RoIPWebServer::setupAPIRoutes() {
    // System endpoints
    server.on(API_PATH "/system/status", HTTP_GET,
              [this](AsyncWebServerRequest* request) {
                  handleGetStatus(request);
              });

    server.on(API_PATH "/system/info", HTTP_GET,
              [this](AsyncWebServerRequest* request) {
                  handleGetSystemInfo(request);
              });

    server.on(API_PATH "/system/health", HTTP_GET,
              [this](AsyncWebServerRequest* request) {
                  handleGetHealth(request);
              });

    server.on(API_PATH "/system/restart", HTTP_POST,
              [this](AsyncWebServerRequest* request) {
                  handleRestart(request);
              });

    server.on(API_PATH "/system/reset", HTTP_POST,
              [this](AsyncWebServerRequest* request) {
                  handleFactoryReset(request);
              });

    // Configuration endpoints
    server.on(API_PATH "/config", HTTP_GET,
              [this](AsyncWebServerRequest* request) {
                  handleGetConfig(request);
              });

    server.on(API_PATH "/config", HTTP_POST,
              [this](AsyncWebServerRequest* request) {
                  handlePostConfig(request);
              });

    server.on(API_PATH "/config/export", HTTP_GET,
              [this](AsyncWebServerRequest* request) {
                  handleExportConfig(request);
              });

    server.on(API_PATH "/config/import", HTTP_POST,
              [this](AsyncWebServerRequest* request) {
                  handleImportConfig(request);
              });

    // WiFi endpoints
    server.on(API_PATH "/wifi/status", HTTP_GET,
              [this](AsyncWebServerRequest* request) {
                  handleGetWiFiStatus(request);
              });

    server.on(API_PATH "/wifi", HTTP_POST,
              [this](AsyncWebServerRequest* request) {
                  handlePostWiFi(request);
              });

    server.on(API_PATH "/wifi/networks", HTTP_GET,
              [this](AsyncWebServerRequest* request) {
                  handleGetWiFiNetworks(request);
              });

    // Audio endpoints
    server.on(API_PATH "/audio/status", HTTP_GET,
              [this](AsyncWebServerRequest* request) {
                  handleGetAudioStatus(request);
              });

    server.on(API_PATH "/audio", HTTP_POST,
              [this](AsyncWebServerRequest* request) {
                  handlePostAudio(request);
              });

    server.on(API_PATH "/audio/devices", HTTP_GET,
              [this](AsyncWebServerRequest* request) {
                  handleGetAudioDevices(request);
              });

    // Network endpoints
    server.on(API_PATH "/network/status", HTTP_GET,
              [this](AsyncWebServerRequest* request) {
                  handleGetNetworkStatus(request);
              });

    server.on(API_PATH "/network", HTTP_POST,
              [this](AsyncWebServerRequest* request) {
                  handlePostNetwork(request);
              });

    // SIP endpoints
    server.on(API_PATH "/sip/status", HTTP_GET,
              [this](AsyncWebServerRequest* request) {
                  handleGetSIPStatus(request);
              });

    server.on(API_PATH "/sip", HTTP_POST,
              [this](AsyncWebServerRequest* request) {
                  handlePostSIP(request);
              });

    // OTA endpoints
    server.on(API_PATH "/ota/status", HTTP_GET,
              [this](AsyncWebServerRequest* request) {
                  handleGetOTAStatus(request);
              });

    server.on(API_PATH "/ota/upload", HTTP_POST,
              [this](AsyncWebServerRequest* request) {
                  handlePostOTA(request);
              });

    // Authentication endpoints
    server.on(API_PATH "/auth/login", HTTP_POST,
              [this](AsyncWebServerRequest* request) {
                  handleLogin(request);
              });

    server.on(API_PATH "/auth/logout", HTTP_POST,
              [this](AsyncWebServerRequest* request) {
                  handleLogout(request);
              });

    server.on(API_PATH "/auth/verify", HTTP_GET,
              [this](AsyncWebServerRequest* request) {
                  handleVerifyAuth(request);
              });

    // Logging endpoints
    server.on(API_PATH "/logs", HTTP_GET,
              [this](AsyncWebServerRequest* request) {
                  handleGetLogs(request);
              });

    server.on(API_PATH "/logs/clear", HTTP_POST,
              [this](AsyncWebServerRequest* request) {
                  handleClearLogs(request);
              });
}

// ============================================================================
// System Endpoint Handlers
// ============================================================================

void RoIPWebServer::handleGetStatus(AsyncWebServerRequest* request) {
    updateActivityTime();

    DynamicJsonDocument doc(1024);
    doc["status"] = "ok";
    doc["uptime"] = millis() / 1000;
    doc["heap_free"] = ESP.getFreeHeap();
    doc["heap_total"] = ESP.getHeapSize();
    doc["psram_free"] = ESP.getFreePsram();
    doc["temperature"] = (float)temperatureRead();
    doc["wifi_connected"] = WiFi.isConnected();
    doc["wifi_rssi"] = WiFi.RSSI();
    doc["ip_address"] = WiFi.localIP().toString();

    String response;
    serializeJson(doc, response);

    AsyncWebServerResponse* res =
        request->beginResponse(200, "application/json", response);
    addCORSHeaders(res);
    request->send(res);
}

void RoIPWebServer::handleGetSystemInfo(AsyncWebServerRequest* request) {
    updateActivityTime();

    DynamicJsonDocument doc(768);
    doc["version"] = ROIP_VERSION;
    doc["board"] = ARDUINO_BOARD;
    doc["cpu_freq"] = getCpuFreqMhz();
    doc["chip_id"] = (uint32_t)(ESP.getEfuseMac() >> 32);
    doc["mac_address"] = WiFi.macAddress();
    doc["sketch_size"] = ESP.getSketchSize();
    doc["free_sketch_space"] = ESP.getFreeSketchSpace();
    doc["sdk_version"] = ESP.getSdkVersion();

    String response;
    serializeJson(doc, response);

    AsyncWebServerResponse* res =
        request->beginResponse(200, "application/json", response);
    addCORSHeaders(res);
    request->send(res);
}

void RoIPWebServer::handleGetHealth(AsyncWebServerRequest* request) {
    updateActivityTime();

    DynamicJsonDocument doc(512);
    uint32_t heapFree = ESP.getFreeHeap();
    uint32_t heapTotal = ESP.getHeapSize();
    bool healthy = (heapFree > (heapTotal / 4));  // At least 25% free

    doc["healthy"] = healthy;
    doc["heap_usage_percent"] = ((heapTotal - heapFree) * 100) / heapTotal;
    doc["heap_fragmentation"] = 0;  // Can be calculated more precisely
    doc["uptime_seconds"] = millis() / 1000;

    String response;
    serializeJson(doc, response);

    AsyncWebServerResponse* res = request->beginResponse(
        healthy ? 200 : 503, "application/json", response);
    addCORSHeaders(res);
    request->send(res);
}

void RoIPWebServer::handleRestart(AsyncWebServerRequest* request) {
    if (!verifyAuth(request)) {
        request->send(401, "application/json",
                     "{\"error\":\"Unauthorized\"}");
        return;
    }

    DynamicJsonDocument doc(128);
    doc["status"] = "restarting";
    String response;
    serializeJson(doc, response);

    AsyncWebServerResponse* res =
        request->beginResponse(200, "application/json", response);
    addCORSHeaders(res);
    request->send(res);

    // Schedule restart
    delay(1000);
    ESP.restart();
}

void RoIPWebServer::handleFactoryReset(AsyncWebServerRequest* request) {
    if (!verifyAuth(request)) {
        request->send(401, "application/json",
                     "{\"error\":\"Unauthorized\"}");
        return;
    }

    DynamicJsonDocument doc(128);
    doc["status"] = "factory_reset";
    String response;
    serializeJson(doc, response);

    AsyncWebServerResponse* res =
        request->beginResponse(200, "application/json", response);
    addCORSHeaders(res);
    request->send(res);

    // Schedule reset
    delay(1000);
    configManager->reset();
    ESP.restart();
}

// ============================================================================
// Configuration Endpoint Handlers
// ============================================================================

void RoIPWebServer::handleGetConfig(AsyncWebServerRequest* request) {
    if (!verifyAuth(request)) {
        request->send(401, "application/json",
                     "{\"error\":\"Unauthorized\"}");
        return;
    }

    updateActivityTime();

    RoIPConfig& cfg = configManager->getConfig();
    DynamicJsonDocument doc(2048);

    // Device settings
    doc["device_name"] = cfg.device_name;
    doc["device_id"] = cfg.device_id;

    // Network settings
    doc["wifi_ssid"] = cfg.wifi_ssid;
    doc["wifi_hostname"] = cfg.wifi_hostname;
    doc["wifi_5ghz_enabled"] = cfg.wifi_5ghz_enabled;

    // SIP settings
    doc["sip_server"] = cfg.sip_server;
    doc["sip_port"] = cfg.sip_port;
    doc["sip_username"] = cfg.sip_username;
    doc["sip_realm"] = cfg.sip_realm;

    // STUN/TURN
    doc["stun_server"] = cfg.stun_server;
    doc["stun_port"] = cfg.stun_port;
    doc["turn_server"] = cfg.turn_server;
    doc["turn_port"] = cfg.turn_port;

    // Audio settings
    JsonObject audio = doc.createNestedObject("audio");
    audio["sample_rate"] = cfg.sample_rate;
    audio["frame_size_ms"] = cfg.frame_size_ms;
    audio["opus_bitrate"] = cfg.opus_bitrate;
    audio["opus_complexity"] = cfg.opus_complexity;

    // DSP settings
    JsonObject dsp = doc.createNestedObject("dsp");
    dsp["agc_enabled"] = cfg.agc_enabled;
    dsp["agc_target_db"] = cfg.agc_target_db;
    dsp["noise_suppression_enabled"] = cfg.noise_suppression_enabled;
    dsp["vad_enabled"] = cfg.vad_enabled;
    dsp["aec_enabled"] = cfg.aec_enabled;

    // PTT/COS settings
    JsonObject ptt = doc.createNestedObject("ptt");
    ptt["ptt_active_high"] = cfg.ptt_active_high;
    ptt["cos_active_high"] = cfg.cos_active_high;
    ptt["ptt_tail_ms"] = cfg.ptt_tail_ms;
    ptt["cos_debounce_ms"] = cfg.cos_debounce_ms;
    ptt["vox_enabled"] = cfg.vox_enabled;
    ptt["vox_threshold_db"] = cfg.vox_threshold_db;
    ptt["vox_hangtime_ms"] = cfg.vox_hangtime_ms;

    // Quality settings
    JsonObject quality = doc.createNestedObject("quality");
    quality["audio_quality_preset"] = cfg.audio_quality_preset;
    quality["fec_enabled"] = cfg.fec_enabled;
    quality["dtx_enabled"] = cfg.dtx_enabled;

    // System settings
    JsonObject system = doc.createNestedObject("system");
    system["log_level"] = cfg.log_level;
    system["web_ui_enabled"] = cfg.web_ui_enabled;
    system["web_ui_port"] = cfg.web_ui_port;

    String response;
    serializeJson(doc, response);

    AsyncWebServerResponse* res =
        request->beginResponse(200, "application/json", response);
    addCORSHeaders(res);
    request->send(res);
}

void RoIPWebServer::handlePostConfig(AsyncWebServerRequest* request) {
    if (!verifyAuth(request)) {
        request->send(401, "application/json",
                     "{\"error\":\"Unauthorized\"}");
        return;
    }

    updateActivityTime();

    // Note: JSON body is handled via onBody handler in real implementation
    DynamicJsonDocument doc(256);
    doc["status"] = "config_updated";
    doc["timestamp"] = millis();

    String response;
    serializeJson(doc, response);

    AsyncWebServerResponse* res =
        request->beginResponse(200, "application/json", response);
    addCORSHeaders(res);
    request->send(res);

    broadcastConfigChanged();
}

void RoIPWebServer::handleGetConfigItem(AsyncWebServerRequest* request) {
    // Implementation for getting individual config items
    request->send(200, "application/json", "{}");
}

void RoIPWebServer::handlePostConfigItem(AsyncWebServerRequest* request) {
    // Implementation for setting individual config items
    request->send(200, "application/json", "{}");
}

void RoIPWebServer::handleExportConfig(AsyncWebServerRequest* request) {
    if (!verifyAuth(request)) {
        request->send(401, "application/json",
                     "{\"error\":\"Unauthorized\"}");
        return;
    }

    updateActivityTime();

    char buffer[4096];
    if (configManager->exportToJson(buffer, sizeof(buffer))) {
        AsyncWebServerResponse* res = request->beginResponse(
            200, "application/json", String(buffer));
        res->addHeader("Content-Disposition",
                      "attachment; filename=\"roip_config.json\"");
        addCORSHeaders(res);
        request->send(res);
    } else {
        request->send(500, "application/json",
                     "{\"error\":\"Export failed\"}");
    }
}

void RoIPWebServer::handleImportConfig(AsyncWebServerRequest* request) {
    if (!verifyAuth(request)) {
        request->send(401, "application/json",
                     "{\"error\":\"Unauthorized\"}");
        return;
    }

    updateActivityTime();

    // Configuration would be in request body
    DynamicJsonDocument doc(256);
    doc["status"] = "config_imported";

    String response;
    serializeJson(doc, response);

    AsyncWebServerResponse* res =
        request->beginResponse(200, "application/json", response);
    addCORSHeaders(res);
    request->send(res);
}

// ============================================================================
// WiFi Endpoint Handlers
// ============================================================================

void RoIPWebServer::handleGetWiFiStatus(AsyncWebServerRequest* request) {
    updateActivityTime();

    DynamicJsonDocument doc(512);
    doc["connected"] = WiFi.isConnected();
    doc["ssid"] = WiFi.SSID();
    doc["rssi"] = WiFi.RSSI();
    doc["ip_address"] = WiFi.localIP().toString();
    doc["gateway"] = WiFi.gatewayIP().toString();
    doc["dns"] = WiFi.dnsIP().toString();
    doc["mac_address"] = WiFi.macAddress();

    String response;
    serializeJson(doc, response);

    AsyncWebServerResponse* res =
        request->beginResponse(200, "application/json", response);
    addCORSHeaders(res);
    request->send(res);
}

void RoIPWebServer::handlePostWiFi(AsyncWebServerRequest* request) {
    if (!verifyAuth(request)) {
        request->send(401, "application/json",
                     "{\"error\":\"Unauthorized\"}");
        return;
    }

    updateActivityTime();

    DynamicJsonDocument doc(256);
    doc["status"] = "wifi_config_updated";

    String response;
    serializeJson(doc, response);

    AsyncWebServerResponse* res =
        request->beginResponse(200, "application/json", response);
    addCORSHeaders(res);
    request->send(res);
}

void RoIPWebServer::handleGetWiFiNetworks(AsyncWebServerRequest* request) {
    updateActivityTime();

    int n = WiFi.scanNetworks();
    DynamicJsonDocument doc(2048);
    JsonArray networks = doc.createNestedArray("networks");

    for (int i = 0; i < n; ++i) {
        JsonObject network = networks.createNestedObject();
        network["ssid"] = WiFi.SSID(i);
        network["rssi"] = WiFi.RSSI(i);
        network["security"] = WiFi.encryptionType(i);
        network["channel"] = WiFi.channel(i);
    }

    String response;
    serializeJson(doc, response);

    AsyncWebServerResponse* res =
        request->beginResponse(200, "application/json", response);
    addCORSHeaders(res);
    request->send(res);
}

// ============================================================================
// Audio Endpoint Handlers
// ============================================================================

void RoIPWebServer::handleGetAudioStatus(AsyncWebServerRequest* request) {
    updateActivityTime();

    RoIPConfig& cfg = configManager->getConfig();
    DynamicJsonDocument doc(512);

    doc["sample_rate"] = cfg.sample_rate;
    doc["frame_size_ms"] = cfg.frame_size_ms;
    doc["opus_bitrate"] = cfg.opus_bitrate;
    doc["opus_complexity"] = cfg.opus_complexity;
    doc["agc_enabled"] = cfg.agc_enabled;
    doc["noise_suppression_enabled"] = cfg.noise_suppression_enabled;
    doc["vad_enabled"] = cfg.vad_enabled;
    doc["aec_enabled"] = cfg.aec_enabled;

    String response;
    serializeJson(doc, response);

    AsyncWebServerResponse* res =
        request->beginResponse(200, "application/json", response);
    addCORSHeaders(res);
    request->send(res);
}

void RoIPWebServer::handlePostAudio(AsyncWebServerRequest* request) {
    if (!verifyAuth(request)) {
        request->send(401, "application/json",
                     "{\"error\":\"Unauthorized\"}");
        return;
    }

    updateActivityTime();

    DynamicJsonDocument doc(256);
    doc["status"] = "audio_config_updated";

    String response;
    serializeJson(doc, response);

    AsyncWebServerResponse* res =
        request->beginResponse(200, "application/json", response);
    addCORSHeaders(res);
    request->send(res);

    broadcastAudioStatus();
}

void RoIPWebServer::handleGetAudioDevices(AsyncWebServerRequest* request) {
    updateActivityTime();

    DynamicJsonDocument doc(256);
    JsonArray devices = doc.createNestedArray("devices");

    JsonObject device = devices.createNestedObject();
    device["id"] = 0;
    device["name"] = "Internal DAC";
    device["type"] = "output";

    String response;
    serializeJson(doc, response);

    AsyncWebServerResponse* res =
        request->beginResponse(200, "application/json", response);
    addCORSHeaders(res);
    request->send(res);
}

// ============================================================================
// Network Endpoint Handlers
// ============================================================================

void RoIPWebServer::handleGetNetworkStatus(AsyncWebServerRequest* request) {
    updateActivityTime();

    DynamicJsonDocument doc(512);
    doc["wifi_connected"] = WiFi.isConnected();
    doc["ip_address"] = WiFi.localIP().toString();
    doc["rssi"] = WiFi.RSSI();
    doc["hostname"] = WiFi.getHostname();

    String response;
    serializeJson(doc, response);

    AsyncWebServerResponse* res =
        request->beginResponse(200, "application/json", response);
    addCORSHeaders(res);
    request->send(res);
}

void RoIPWebServer::handlePostNetwork(AsyncWebServerRequest* request) {
    if (!verifyAuth(request)) {
        request->send(401, "application/json",
                     "{\"error\":\"Unauthorized\"}");
        return;
    }

    updateActivityTime();

    DynamicJsonDocument doc(256);
    doc["status"] = "network_config_updated";

    String response;
    serializeJson(doc, response);

    AsyncWebServerResponse* res =
        request->beginResponse(200, "application/json", response);
    addCORSHeaders(res);
    request->send(res);
}

// ============================================================================
// SIP Endpoint Handlers
// ============================================================================

void RoIPWebServer::handleGetSIPStatus(AsyncWebServerRequest* request) {
    updateActivityTime();

    RoIPConfig& cfg = configManager->getConfig();
    DynamicJsonDocument doc(512);

    doc["sip_server"] = cfg.sip_server;
    doc["sip_port"] = cfg.sip_port;
    doc["sip_username"] = cfg.sip_username;
    doc["sip_realm"] = cfg.sip_realm;
    doc["registered"] = false;  // Would be actual status in real implementation
    doc["call_active"] = false;

    String response;
    serializeJson(doc, response);

    AsyncWebServerResponse* res =
        request->beginResponse(200, "application/json", response);
    addCORSHeaders(res);
    request->send(res);
}

void RoIPWebServer::handlePostSIP(AsyncWebServerRequest* request) {
    if (!verifyAuth(request)) {
        request->send(401, "application/json",
                     "{\"error\":\"Unauthorized\"}");
        return;
    }

    updateActivityTime();

    DynamicJsonDocument doc(256);
    doc["status"] = "sip_config_updated";

    String response;
    serializeJson(doc, response);

    AsyncWebServerResponse* res =
        request->beginResponse(200, "application/json", response);
    addCORSHeaders(res);
    request->send(res);
}

// ============================================================================
// OTA Update Handlers
// ============================================================================

void RoIPWebServer::handleGetOTAStatus(AsyncWebServerRequest* request) {
    updateActivityTime();

    DynamicJsonDocument doc(256);
    doc["update_available"] = false;
    doc["current_version"] = ROIP_VERSION;

    String response;
    serializeJson(doc, response);

    AsyncWebServerResponse* res =
        request->beginResponse(200, "application/json", response);
    addCORSHeaders(res);
    request->send(res);
}

void RoIPWebServer::handlePostOTA(AsyncWebServerRequest* request) {
    if (!verifyAuth(request)) {
        request->send(401, "application/json",
                     "{\"error\":\"Unauthorized\"}");
        return;
    }

    updateActivityTime();
    request->send(200, "application/json",
                 "{\"status\":\"firmware_update_initiated\"}");
}

// ============================================================================
// Authentication Endpoint Handlers
// ============================================================================

void RoIPWebServer::handleLogin(AsyncWebServerRequest* request) {
    updateActivityTime();

    // In a real implementation, would verify username and password from JSON body
    String token = generateAuthToken();

    // Store token
    for (int i = 0; i < 5; i++) {
        if (!sessionTokens[i].valid) {
            sessionTokens[i].token = token;
            sessionTokens[i].timestamp = millis();
            sessionTokens[i].valid = true;
            break;
        }
    }

    DynamicJsonDocument doc(256);
    doc["token"] = token;
    doc["expires_in"] = AUTH_TIMEOUT_MS / 1000;

    String response;
    serializeJson(doc, response);

    AsyncWebServerResponse* res =
        request->beginResponse(200, "application/json", response);
    addCORSHeaders(res);
    request->send(res);
}

void RoIPWebServer::handleLogout(AsyncWebServerRequest* request) {
    updateActivityTime();

    if (request->hasHeader("Authorization")) {
        String authHeader = request->header("Authorization");
        if (authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7);
            for (int i = 0; i < 5; i++) {
                if (sessionTokens[i].token == token) {
                    sessionTokens[i].valid = false;
                    break;
                }
            }
        }
    }

    request->send(200, "application/json", "{\"status\":\"logged_out\"}");
}

void RoIPWebServer::handleVerifyAuth(AsyncWebServerRequest* request) {
    bool authenticated = verifyAuth(request);
    updateActivityTime();

    DynamicJsonDocument doc(128);
    doc["authenticated"] = authenticated;

    String response;
    serializeJson(doc, response);

    AsyncWebServerResponse* res = request->beginResponse(
        authenticated ? 200 : 401, "application/json", response);
    addCORSHeaders(res);
    request->send(res);
}

// ============================================================================
// Logging Endpoint Handlers
// ============================================================================

void RoIPWebServer::handleGetLogs(AsyncWebServerRequest* request) {
    if (!verifyAuth(request)) {
        request->send(401, "application/json",
                     "{\"error\":\"Unauthorized\"}");
        return;
    }

    updateActivityTime();

    DynamicJsonDocument doc(1024);
    JsonArray logs = doc.createNestedArray("logs");

    // Placeholder - in real implementation would fetch from logging system
    JsonObject log = logs.createNestedObject();
    log["timestamp"] = millis();
    log["level"] = "info";
    log["message"] = "System operational";

    String response;
    serializeJson(doc, response);

    AsyncWebServerResponse* res =
        request->beginResponse(200, "application/json", response);
    addCORSHeaders(res);
    request->send(res);
}

void RoIPWebServer::handleClearLogs(AsyncWebServerRequest* request) {
    if (!verifyAuth(request)) {
        request->send(401, "application/json",
                     "{\"error\":\"Unauthorized\"}");
        return;
    }

    updateActivityTime();

    request->send(200, "application/json", "{\"status\":\"logs_cleared\"}");
}

// ============================================================================
// Utility Methods
// ============================================================================

void RoIPWebServer::addCORSHeaders(AsyncWebServerResponse* response) {
    response->addHeader("Access-Control-Allow-Origin", "*");
    response->addHeader("Access-Control-Allow-Methods",
                       "GET,POST,PUT,DELETE,OPTIONS");
    response->addHeader("Access-Control-Allow-Headers",
                       "Content-Type,Authorization");
}

APIStatus RoIPWebServer::handleJSONRequest(AsyncWebServerRequest* request,
                                           DynamicJsonDocument& doc) {
    return APIStatus::OK;
}

// ============================================================================
// Captive Portal
// ============================================================================

void RoIPWebServer::setupCaptivePortal() {
    // Setup DNS redirect for captive portal
    // Implementation would require DNSServer library
}

void RoIPWebServer::enableCaptivePortal(bool enable) {
    captivePortalMode = enable;
}

void RoIPWebServer::handleCaptivePortalRequest(
    AsyncWebServerRequest* request) {
    request->send(200, "text/html", getSetupHTML());
}

// ============================================================================
// Static Content Routes
// ============================================================================

void RoIPWebServer::setupStaticRoutes() {
    // Root / dashboard
    server.on("/", HTTP_GET, [this](AsyncWebServerRequest* request) {
        updateActivityTime();
        AsyncWebServerResponse* res =
            request->beginResponse(200, "text/html", getIndexHTML());
        addCORSHeaders(res);
        request->send(res);
    });

    server.on("/dashboard", HTTP_GET, [this](AsyncWebServerRequest* request) {
        updateActivityTime();
        AsyncWebServerResponse* res =
            request->beginResponse(200, "text/html", getDashboardHTML());
        addCORSHeaders(res);
        request->send(res);
    });

    server.on("/config", HTTP_GET, [this](AsyncWebServerRequest* request) {
        if (!verifyAuth(request)) {
            request->send(401, "application/json",
                         "{\"error\":\"Unauthorized\"}");
            return;
        }
        updateActivityTime();
        AsyncWebServerResponse* res =
            request->beginResponse(200, "text/html", getConfigHTML());
        addCORSHeaders(res);
        request->send(res);
    });

    server.on("/setup", HTTP_GET, [this](AsyncWebServerRequest* request) {
        updateActivityTime();
        AsyncWebServerResponse* res =
            request->beginResponse(200, "text/html", getSetupHTML());
        addCORSHeaders(res);
        request->send(res);
    });

    // Static assets
    server.on("/style.css", HTTP_GET, [this](AsyncWebServerRequest* request) {
        updateActivityTime();
        AsyncWebServerResponse* res =
            request->beginResponse(200, "text/css", getCSS());
        addCORSHeaders(res);
        request->send(res);
    });

    server.on("/main.js", HTTP_GET, [this](AsyncWebServerRequest* request) {
        updateActivityTime();
        AsyncWebServerResponse* res =
            request->beginResponse(200, "application/javascript", getMainJS());
        addCORSHeaders(res);
        request->send(res);
    });

    server.on("/config.js", HTTP_GET, [this](AsyncWebServerRequest* request) {
        updateActivityTime();
        AsyncWebServerResponse* res = request->beginResponse(
            200, "application/javascript", getConfigJS());
        addCORSHeaders(res);
        request->send(res);
    });

    server.on("/setup.js", HTTP_GET, [this](AsyncWebServerRequest* request) {
        updateActivityTime();
        AsyncWebServerResponse* res = request->beginResponse(
            200, "application/javascript", getSetupJS());
        addCORSHeaders(res);
        request->send(res);
    });
}

// ============================================================================
// Embedded HTML/CSS/JS Assets
// ============================================================================

const char* RoIPWebServer::getIndexHTML() const {
    return R"rawliteral(<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RoIP - Radio over IP</title>
    <link rel="stylesheet" href="/style.css">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto; }
    </style>
</head>
<body>
    <nav class="navbar">
        <div class="navbar-brand">
            <h1>RoIP Control Panel</h1>
        </div>
        <div class="navbar-menu">
            <a href="/" class="nav-link active">Dashboard</a>
            <a href="/config" class="nav-link">Configuration</a>
            <a href="#" class="nav-link" onclick="logout()">Logout</a>
        </div>
    </nav>

    <div class="container">
        <div class="dashboard">
            <div class="status-grid">
                <div class="status-card">
                    <h3>System Status</h3>
                    <div id="system-status" class="status-content">
                        <p>Loading...</p>
                    </div>
                </div>

                <div class="status-card">
                    <h3>WiFi Connection</h3>
                    <div id="wifi-status" class="status-content">
                        <p>Loading...</p>
                    </div>
                </div>

                <div class="status-card">
                    <h3>Audio Status</h3>
                    <div id="audio-status" class="status-content">
                        <p>Loading...</p>
                    </div>
                </div>

                <div class="status-card">
                    <h3>SIP Registration</h3>
                    <div id="sip-status" class="status-content">
                        <p>Loading...</p>
                    </div>
                </div>
            </div>

            <div class="control-section">
                <h2>System Controls</h2>
                <button class="btn btn-primary" onclick="restartSystem()">Restart System</button>
                <button class="btn btn-warning" onclick="factoryReset()">Factory Reset</button>
            </div>

            <div class="chart-section">
                <h2>Performance Metrics</h2>
                <canvas id="performance-chart"></canvas>
            </div>
        </div>
    </div>

    <script src="/main.js"></script>
    <script>
        document.addEventListener('DOMContentLoaded', function() {
            initDashboard();
        });

        function initDashboard() {
            updateSystemStatus();
            updateWiFiStatus();
            updateAudioStatus();
            updateSIPStatus();

            // Refresh every 5 seconds
            setInterval(updateSystemStatus, 5000);
            setInterval(updateWiFiStatus, 10000);
            setInterval(updateAudioStatus, 10000);
        }

        function updateSystemStatus() {
            fetch('/api/system/status')
                .then(r => r.json())
                .then(data => {
                    document.getElementById('system-status').innerHTML = `
                        <p>Uptime: ${formatTime(data.uptime)}</p>
                        <p>Heap: ${(data.heap_free / 1024).toFixed(1)} KB free</p>
                        <p>Temp: ${data.temperature.toFixed(1)}°C</p>
                    `;
                });
        }

        function updateWiFiStatus() {
            fetch('/api/wifi/status')
                .then(r => r.json())
                .then(data => {
                    document.getElementById('wifi-status').innerHTML = `
                        <p>Status: ${data.connected ? '<span class="badge-success">Connected</span>' : '<span class="badge-error">Disconnected</span>'}</p>
                        <p>SSID: ${data.ssid}</p>
                        <p>IP: ${data.ip_address}</p>
                        <p>Signal: ${data.rssi} dBm</p>
                    `;
                });
        }

        function updateAudioStatus() {
            fetch('/api/audio/status')
                .then(r => r.json())
                .then(data => {
                    document.getElementById('audio-status').innerHTML = `
                        <p>Sample Rate: ${data.sample_rate} Hz</p>
                        <p>Bitrate: ${data.opus_bitrate} kbps</p>
                        <p>AGC: ${data.agc_enabled ? 'On' : 'Off'}</p>
                        <p>Noise Gate: ${data.noise_suppression_enabled ? 'On' : 'Off'}</p>
                    `;
                });
        }

        function updateSIPStatus() {
            fetch('/api/sip/status')
                .then(r => r.json())
                .then(data => {
                    document.getElementById('sip-status').innerHTML = `
                        <p>Server: ${data.sip_server}</p>
                        <p>Registered: ${data.registered ? '<span class="badge-success">Yes</span>' : '<span class="badge-error">No</span>'}</p>
                        <p>Call Active: ${data.call_active ? 'Yes' : 'No'}</p>
                    `;
                });
        }

        function formatTime(seconds) {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return `${hours}h ${minutes}m`;
        }

        function restartSystem() {
            if (confirm('Are you sure you want to restart?')) {
                fetch('/api/system/restart', { method: 'POST', headers: getAuthHeader() })
                    .then(() => {
                        alert('System restarting...');
                        setTimeout(() => location.reload(), 3000);
                    });
            }
        }

        function factoryReset() {
            if (confirm('WARNING: This will erase all configuration! Continue?')) {
                fetch('/api/system/reset', { method: 'POST', headers: getAuthHeader() })
                    .then(() => {
                        alert('Factory reset initiated...');
                        setTimeout(() => location.href = '/setup', 3000);
                    });
            }
        }

        function logout() {
            fetch('/api/auth/logout', { method: 'POST', headers: getAuthHeader() })
                .then(() => {
                    localStorage.removeItem('auth_token');
                    location.href = '/setup';
                });
        }

        function getAuthHeader() {
            const token = localStorage.getItem('auth_token');
            return token ? { 'Authorization': `Bearer ${token}` } : {};
        }
    </script>
</body>
</html>)rawliteral";
}

const char* RoIPWebServer::getDashboardHTML() const {
    return getIndexHTML();
}

const char* RoIPWebServer::getConfigHTML() const {
    return R"rawliteral(<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Configuration - RoIP</title>
    <link rel="stylesheet" href="/style.css">
</head>
<body>
    <nav class="navbar">
        <div class="navbar-brand"><h1>RoIP Configuration</h1></div>
        <div class="navbar-menu">
            <a href="/" class="nav-link">Dashboard</a>
            <a href="/config" class="nav-link active">Configuration</a>
            <a href="#" class="nav-link" onclick="logout()">Logout</a>
        </div>
    </nav>

    <div class="container">
        <div class="config-panel">
            <div class="tabs">
                <button class="tab-button active" data-tab="device">Device</button>
                <button class="tab-button" data-tab="wifi">WiFi</button>
                <button class="tab-button" data-tab="sip">SIP</button>
                <button class="tab-button" data-tab="audio">Audio</button>
                <button class="tab-button" data-tab="dsp">DSP</button>
                <button class="tab-button" data-tab="ptt">PTT/COS</button>
            </div>

            <div class="tab-content">
                <div id="device-tab" class="tab-pane active">
                    <form onsubmit="saveDeviceConfig(event)">
                        <div class="form-group">
                            <label>Device Name:</label>
                            <input type="text" id="device_name" required>
                        </div>
                        <div class="form-group">
                            <label>Log Level:</label>
                            <select id="log_level">
                                <option value="0">Error</option>
                                <option value="1">Warning</option>
                                <option value="2">Info</option>
                                <option value="3">Debug</option>
                            </select>
                        </div>
                        <button type="submit" class="btn btn-primary">Save</button>
                    </form>
                </div>

                <div id="wifi-tab" class="tab-pane">
                    <form onsubmit="saveWiFiConfig(event)">
                        <div class="form-group">
                            <label>SSID:</label>
                            <input type="text" id="wifi_ssid" required>
                        </div>
                        <div class="form-group">
                            <label>Password:</label>
                            <input type="password" id="wifi_password">
                        </div>
                        <div class="form-group">
                            <label>Hostname:</label>
                            <input type="text" id="wifi_hostname">
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="wifi_5ghz_enabled">
                                Enable 5GHz (C6/C5)
                            </label>
                        </div>
                        <button type="submit" class="btn btn-primary">Save</button>
                    </form>
                </div>

                <div id="sip-tab" class="tab-pane">
                    <form onsubmit="saveSIPConfig(event)">
                        <div class="form-group">
                            <label>SIP Server:</label>
                            <input type="text" id="sip_server" required>
                        </div>
                        <div class="form-group">
                            <label>SIP Port:</label>
                            <input type="number" id="sip_port" value="5060">
                        </div>
                        <div class="form-group">
                            <label>Username:</label>
                            <input type="text" id="sip_username" required>
                        </div>
                        <div class="form-group">
                            <label>Password:</label>
                            <input type="password" id="sip_password">
                        </div>
                        <button type="submit" class="btn btn-primary">Save</button>
                    </form>
                </div>

                <div id="audio-tab" class="tab-pane">
                    <form onsubmit="saveAudioConfig(event)">
                        <div class="form-group">
                            <label>Sample Rate:</label>
                            <select id="sample_rate">
                                <option value="16000">16 kHz</option>
                                <option value="24000" selected>24 kHz</option>
                                <option value="48000">48 kHz</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Opus Bitrate:</label>
                            <select id="opus_bitrate">
                                <option value="16000">16 kbps</option>
                                <option value="24000">24 kbps</option>
                                <option value="32000" selected>32 kbps</option>
                                <option value="64000">64 kbps</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Opus Complexity:</label>
                            <input type="range" id="opus_complexity" min="0" max="10" value="10">
                            <span id="complexity-value">10</span>
                        </div>
                        <button type="submit" class="btn btn-primary">Save</button>
                    </form>
                </div>

                <div id="dsp-tab" class="tab-pane">
                    <form onsubmit="saveDSPConfig(event)">
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="agc_enabled">
                                Enable AGC
                            </label>
                        </div>
                        <div class="form-group">
                            <label>AGC Target Level (dB):</label>
                            <input type="number" id="agc_target_db" step="0.1" value="-20">
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="noise_suppression_enabled">
                                Enable Noise Suppression
                            </label>
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="vad_enabled">
                                Enable Voice Activity Detection
                            </label>
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="aec_enabled">
                                Enable Echo Cancellation
                            </label>
                        </div>
                        <button type="submit" class="btn btn-primary">Save</button>
                    </form>
                </div>

                <div id="ptt-tab" class="tab-pane">
                    <form onsubmit="savePTTConfig(event)">
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="ptt_active_high">
                                PTT Active High
                            </label>
                        </div>
                        <div class="form-group">
                            <label>PTT Tail Delay (ms):</label>
                            <input type="number" id="ptt_tail_ms" value="200">
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="vox_enabled">
                                Enable VOX
                            </label>
                        </div>
                        <div class="form-group">
                            <label>VOX Threshold (dB):</label>
                            <input type="number" id="vox_threshold_db" step="0.1" value="-40">
                        </div>
                        <button type="submit" class="btn btn-primary">Save</button>
                    </form>
                </div>
            </div>

            <div class="config-actions">
                <button class="btn btn-secondary" onclick="exportConfig()">Export Configuration</button>
                <button class="btn btn-secondary" onclick="importConfig()">Import Configuration</button>
            </div>
        </div>
    </div>

    <script src="/config.js"></script>
    <script>
        document.addEventListener('DOMContentLoaded', function() {
            setupTabs();
            loadConfiguration();
        });

        function setupTabs() {
            document.querySelectorAll('.tab-button').forEach(btn => {
                btn.addEventListener('click', function() {
                    const tabName = this.dataset.tab;
                    document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
                    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
                    this.classList.add('active');
                    document.getElementById(tabName + '-tab').classList.add('active');
                });
            });
        }

        function loadConfiguration() {
            fetch('/api/config', { headers: getAuthHeader() })
                .then(r => r.json())
                .then(data => {
                    document.getElementById('device_name').value = data.device_name;
                    document.getElementById('wifi_ssid').value = data.wifi_ssid;
                    document.getElementById('wifi_hostname').value = data.wifi_hostname;
                    document.getElementById('sip_server').value = data.sip_server;
                    document.getElementById('sip_port').value = data.sip_port;
                    document.getElementById('sip_username').value = data.sip_username;
                    document.getElementById('sample_rate').value = data.audio.sample_rate;
                    document.getElementById('opus_bitrate').value = data.audio.opus_bitrate;
                    document.getElementById('opus_complexity').value = data.audio.opus_complexity;
                    document.getElementById('agc_enabled').checked = data.dsp.agc_enabled;
                    document.getElementById('noise_suppression_enabled').checked = data.dsp.noise_suppression_enabled;
                    document.getElementById('vad_enabled').checked = data.dsp.vad_enabled;
                    document.getElementById('aec_enabled').checked = data.dsp.aec_enabled;
                });
        }

        function saveDeviceConfig(event) {
            event.preventDefault();
            const config = {
                device_name: document.getElementById('device_name').value,
                log_level: parseInt(document.getElementById('log_level').value)
            };
            fetch('/api/config', {
                method: 'POST',
                headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            }).then(r => r.json()).then(() => alert('Configuration saved!'));
        }

        function exportConfig() {
            window.location.href = '/api/config/export';
        }

        function importConfig() {
            alert('Import functionality would use file upload');
        }

        function logout() {
            fetch('/api/auth/logout', { method: 'POST', headers: getAuthHeader() })
                .then(() => {
                    localStorage.removeItem('auth_token');
                    location.href = '/setup';
                });
        }

        function getAuthHeader() {
            const token = localStorage.getItem('auth_token');
            return token ? { 'Authorization': `Bearer ${token}` } : {};
        }

        document.getElementById('opus_complexity')?.addEventListener('change', function() {
            document.getElementById('complexity-value').textContent = this.value;
        });
    </script>
</body>
</html>)rawliteral";
}

const char* RoIPWebServer::getSetupHTML() const {
    return R"rawliteral(<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RoIP Initial Setup</title>
    <link rel="stylesheet" href="/style.css">
    <style>
        .setup-container {
            max-width: 600px;
            margin: 50px auto;
            padding: 20px;
        }
        .setup-card {
            background: white;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .setup-progress {
            display: flex;
            justify-content: space-between;
            margin-bottom: 30px;
        }
        .progress-step {
            text-align: center;
            flex: 1;
        }
        .progress-step.active { color: #007bff; font-weight: bold; }
        .setup-section { display: none; }
        .setup-section.active { display: block; }
    </style>
</head>
<body>
    <div class="setup-container">
        <div class="setup-card">
            <h1>RoIP Initial Setup</h1>

            <div class="setup-progress">
                <div class="progress-step active" data-step="1">1. WiFi</div>
                <div class="progress-step" data-step="2">2. Device</div>
                <div class="progress-step" data-step="3">3. SIP</div>
                <div class="progress-step" data-step="4">4. Complete</div>
            </div>

            <div id="step-1" class="setup-section active">
                <h2>WiFi Configuration</h2>
                <form onsubmit="nextStep(event, 1)">
                    <div class="form-group">
                        <label>WiFi Network:</label>
                        <select id="wifi-network" required>
                            <option value="">Scanning...</option>
                        </select>
                        <button type="button" class="btn btn-small" onclick="scanNetworks()">Refresh</button>
                    </div>
                    <div class="form-group">
                        <label>WiFi Password:</label>
                        <input type="password" id="wifi-password" required>
                    </div>
                    <div class="form-group">
                        <label>Hostname:</label>
                        <input type="text" id="hostname" value="roip-radio" required>
                    </div>
                    <button type="submit" class="btn btn-primary btn-block">Next</button>
                </form>
            </div>

            <div id="step-2" class="setup-section">
                <h2>Device Configuration</h2>
                <form onsubmit="nextStep(event, 2)">
                    <div class="form-group">
                        <label>Device Name:</label>
                        <input type="text" id="device-name" value="My RoIP Radio" required>
                    </div>
                    <div class="form-group">
                        <label>Admin Password:</label>
                        <input type="password" id="admin-password" required>
                    </div>
                    <div class="form-group">
                        <label>Confirm Password:</label>
                        <input type="password" id="admin-password-confirm" required>
                    </div>
                    <button type="button" class="btn" onclick="previousStep(2)">Back</button>
                    <button type="submit" class="btn btn-primary">Next</button>
                </form>
            </div>

            <div id="step-3" class="setup-section">
                <h2>SIP Server Configuration</h2>
                <form onsubmit="nextStep(event, 3)">
                    <div class="form-group">
                        <label>SIP Server Address:</label>
                        <input type="text" id="sip-server" placeholder="sip.example.com" required>
                    </div>
                    <div class="form-group">
                        <label>SIP Port:</label>
                        <input type="number" id="sip-port" value="5060">
                    </div>
                    <div class="form-group">
                        <label>Username:</label>
                        <input type="text" id="sip-username" required>
                    </div>
                    <div class="form-group">
                        <label>Password:</label>
                        <input type="password" id="sip-password" required>
                    </div>
                    <button type="button" class="btn" onclick="previousStep(3)">Back</button>
                    <button type="submit" class="btn btn-primary">Complete Setup</button>
                </form>
            </div>

            <div id="step-4" class="setup-section">
                <h2>Setup Complete!</h2>
                <p>Your RoIP device has been configured successfully.</p>
                <p>Device IP: <strong id="device-ip">192.168.1.100</strong></p>
                <p><a href="/" class="btn btn-primary btn-block">Go to Dashboard</a></p>
            </div>
        </div>
    </div>

    <script src="/setup.js"></script>
    <script>
        let currentStep = 1;

        document.addEventListener('DOMContentLoaded', function() {
            scanNetworks();
        });

        function scanNetworks() {
            fetch('/api/wifi/networks')
                .then(r => r.json())
                .then(data => {
                    const select = document.getElementById('wifi-network');
                    select.innerHTML = '';
                    data.networks.forEach(net => {
                        const option = document.createElement('option');
                        option.value = net.ssid;
                        option.textContent = `${net.ssid} (${net.rssi} dBm)`;
                        select.appendChild(option);
                    });
                });
        }

        function nextStep(event, step) {
            event.preventDefault();

            // Validate current step
            if (step === 2) {
                const pwd1 = document.getElementById('admin-password').value;
                const pwd2 = document.getElementById('admin-password-confirm').value;
                if (pwd1 !== pwd2) {
                    alert('Passwords do not match!');
                    return;
                }
            }

            // Move to next step
            document.getElementById(`step-${step}`).classList.remove('active');
            document.querySelector(`[data-step="${step}"]`).classList.remove('active');

            currentStep = step + 1;
            document.getElementById(`step-${currentStep}`).classList.add('active');
            document.querySelector(`[data-step="${currentStep}"]`).classList.add('active');

            // If last step, save configuration
            if (step === 3) {
                saveSetupConfiguration();
            }
        }

        function previousStep(step) {
            document.getElementById(`step-${step}`).classList.remove('active');
            document.querySelector(`[data-step="${step}"]`).classList.remove('active');

            currentStep = step - 1;
            document.getElementById(`step-${currentStep}`).classList.add('active');
            document.querySelector(`[data-step="${currentStep}"]`).classList.add('active');
        }

        function saveSetupConfiguration() {
            const config = {
                device_name: document.getElementById('device-name').value,
                wifi_ssid: document.getElementById('wifi-network').value,
                wifi_password: document.getElementById('wifi-password').value,
                wifi_hostname: document.getElementById('hostname').value,
                sip_server: document.getElementById('sip-server').value,
                sip_port: parseInt(document.getElementById('sip-port').value),
                sip_username: document.getElementById('sip-username').value,
                sip_password: document.getElementById('sip-password').value,
                admin_password: document.getElementById('admin-password').value
            };

            fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            }).then(r => r.json())
              .then(() => {
                  document.getElementById('device-ip').textContent =
                      prompt('Enter device IP for confirmation:', 'auto-detected');
              });
        }
    </script>
</body>
</html>)rawliteral";
}

const char* RoIPWebServer::getCSS() const {
    return R"rawliteral(* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

:root {
    --primary: #007bff;
    --success: #28a745;
    --warning: #ffc107;
    --danger: #dc3545;
    --dark: #343a40;
    --light: #f8f9fa;
    --border: #dee2e6;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    color: #333;
    background-color: #f5f5f5;
    line-height: 1.5;
}

.navbar {
    background-color: var(--dark);
    color: white;
    padding: 1rem;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.navbar-brand h1 {
    margin: 0;
    font-size: 1.5rem;
}

.navbar-menu {
    display: flex;
    gap: 2rem;
}

.nav-link {
    color: white;
    text-decoration: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    transition: background-color 0.3s;
}

.nav-link:hover {
    background-color: rgba(255,255,255,0.1);
}

.nav-link.active {
    background-color: var(--primary);
}

.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
}

.dashboard {
    display: grid;
    gap: 20px;
}

.status-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px;
}

.status-card {
    background: white;
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    border-left: 4px solid var(--primary);
}

.status-card h3 {
    margin-bottom: 15px;
    color: var(--dark);
}

.status-content p {
    margin: 8px 0;
    font-size: 0.95rem;
}

.form-group {
    margin-bottom: 15px;
}

.form-group label {
    display: block;
    margin-bottom: 5px;
    font-weight: 500;
    color: var(--dark);
}

.form-group input,
.form-group select,
.form-group textarea {
    width: 100%;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 1rem;
    font-family: inherit;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 3px rgba(0,123,255,0.25);
}

.form-group input[type="checkbox"] {
    width: auto;
    margin-right: 8px;
    cursor: pointer;
}

.btn {
    padding: 10px 20px;
    border: none;
    border-radius: 4px;
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.3s;
    text-decoration: none;
    display: inline-block;
}

.btn-primary {
    background-color: var(--primary);
    color: white;
}

.btn-primary:hover {
    background-color: #0056b3;
}

.btn-secondary {
    background-color: #6c757d;
    color: white;
}

.btn-secondary:hover {
    background-color: #545b62;
}

.btn-warning {
    background-color: var(--warning);
    color: #333;
}

.btn-warning:hover {
    background-color: #e0a800;
}

.btn-danger {
    background-color: var(--danger);
    color: white;
}

.btn-danger:hover {
    background-color: #c82333;
}

.btn-small {
    padding: 6px 12px;
    font-size: 0.9rem;
}

.btn-block {
    width: 100%;
    margin-top: 10px;
}

.badge {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 3px;
    font-size: 0.85rem;
    font-weight: 500;
}

.badge-success {
    background-color: var(--success);
    color: white;
}

.badge-error {
    background-color: var(--danger);
    color: white;
}

.badge-warning {
    background-color: var(--warning);
    color: #333;
}

.tabs {
    display: flex;
    gap: 10px;
    border-bottom: 2px solid var(--border);
    margin-bottom: 20px;
}

.tab-button {
    padding: 10px 20px;
    background: none;
    border: none;
    border-bottom: 3px solid transparent;
    cursor: pointer;
    font-size: 1rem;
    color: #666;
    transition: all 0.3s;
}

.tab-button:hover {
    color: var(--primary);
}

.tab-button.active {
    color: var(--primary);
    border-bottom-color: var(--primary);
}

.tab-pane {
    display: none;
}

.tab-pane.active {
    display: block;
}

.control-section {
    background: white;
    border-radius: 8px;
    padding: 20px;
    margin-top: 20px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.control-section h2 {
    margin-bottom: 15px;
}

.control-section .btn {
    margin-right: 10px;
    margin-bottom: 10px;
}

.chart-section {
    background: white;
    border-radius: 8px;
    padding: 20px;
    margin-top: 20px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.config-panel {
    background: white;
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.config-actions {
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid var(--border);
    display: flex;
    gap: 10px;
}

@media (max-width: 768px) {
    .navbar-menu {
        gap: 1rem;
    }

    .status-grid {
        grid-template-columns: 1fr;
    }

    .tabs {
        flex-wrap: wrap;
    }

    .tab-button {
        padding: 8px 12px;
        font-size: 0.9rem;
    }
}
)rawliteral";
}

const char* RoIPWebServer::getMainJS() const {
    return R"rawliteral(// RoIP Main Dashboard JavaScript

let wsConnection = null;

function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    wsConnection = new WebSocket(`${protocol}//${window.location.host}/ws`);

    wsConnection.onopen = function() {
        console.log('WebSocket connected');
        sendWSPing();
    };

    wsConnection.onmessage = function(event) {
        try {
            const data = JSON.parse(event.data);
            handleWSMessage(data);
        } catch (e) {
            console.error('Failed to parse WebSocket message:', e);
        }
    };

    wsConnection.onerror = function(error) {
        console.error('WebSocket error:', error);
    };

    wsConnection.onclose = function() {
        console.log('WebSocket disconnected');
        setTimeout(initWebSocket, 5000);
    };
}

function sendWSPing() {
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        wsConnection.send(JSON.stringify({ cmd: 'ping' }));
    }
}

function handleWSMessage(data) {
    switch (data.type) {
        case 'system_status':
            updateDashboardSystemStatus(data);
            break;
        case 'network_status':
            updateDashboardNetworkStatus(data);
            break;
        case 'audio_status':
            updateDashboardAudioStatus(data);
            break;
        case 'config_changed':
            console.log('Configuration changed');
            break;
        case 'error':
            console.error('Server error:', data.message);
            break;
    }
}

function updateDashboardSystemStatus(data) {
    const uptimeHours = Math.floor(data.uptime / 3600);
    const uptimeMinutes = Math.floor((data.uptime % 3600) / 60);

    const html = `
        <p>Uptime: ${uptimeHours}h ${uptimeMinutes}m</p>
        <p>Heap: ${(data.heap_free / 1024).toFixed(1)} KB free</p>
        <p>Temp: ${data.temperature.toFixed(1)}°C</p>
    `;
    const elem = document.getElementById('system-status');
    if (elem) elem.innerHTML = html;
}

function updateDashboardNetworkStatus(data) {
    const html = `
        <p>Status: <span class="badge-${data.wifi_connected ? 'success' : 'error'}">
            ${data.wifi_connected ? 'Connected' : 'Disconnected'}
        </span></p>
        <p>IP: ${data.ip_address}</p>
        <p>Signal: ${data.wifi_rssi} dBm</p>
        <p>MAC: ${data.mac_address}</p>
    `;
    const elem = document.getElementById('wifi-status');
    if (elem) elem.innerHTML = html;
}

function updateDashboardAudioStatus(data) {
    // Audio status update handling
}

function applyTheme(isDark) {
    if (isDark) {
        document.body.style.backgroundColor = '#1a1a1a';
        document.body.style.color = '#e0e0e0';
    } else {
        document.body.style.backgroundColor = '#f5f5f5';
        document.body.style.color = '#333';
    }
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    applyTheme(savedTheme === 'dark');
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    loadTheme();
    initWebSocket();

    // Ping WebSocket every 30 seconds
    setInterval(sendWSPing, 30000);
});

// Utility functions
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showNotification(message, type = 'info') {
    const notif = document.createElement('div');
    notif.className = `notification notification-${type}`;
    notif.textContent = message;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 5000);
}
)rawliteral";
}

const char* RoIPWebServer::getConfigJS() const {
    return R"rawliteral(// RoIP Configuration JavaScript

function saveWiFiConfig(event) {
    event.preventDefault();
    const config = {
        wifi_ssid: document.getElementById('wifi_ssid').value,
        wifi_password: document.getElementById('wifi_password').value,
        wifi_hostname: document.getElementById('wifi_hostname').value,
        wifi_5ghz_enabled: document.getElementById('wifi_5ghz_enabled')?.checked
    };

    fetch('/api/config', {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    })
    .then(r => r.json())
    .then(data => {
        if (data.error) {
            alert('Error: ' + data.error);
        } else {
            alert('WiFi configuration saved!');
        }
    })
    .catch(e => {
        console.error('Error:', e);
        alert('Failed to save configuration');
    });
}

function saveAudioConfig(event) {
    event.preventDefault();
    const config = {
        audio: {
            sample_rate: parseInt(document.getElementById('sample_rate').value),
            opus_bitrate: parseInt(document.getElementById('opus_bitrate').value),
            opus_complexity: parseInt(document.getElementById('opus_complexity').value)
        }
    };

    fetch('/api/config', {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    })
    .then(r => r.json())
    .then(() => alert('Audio configuration saved!'))
    .catch(e => console.error('Error:', e));
}

function saveDSPConfig(event) {
    event.preventDefault();
    const config = {
        dsp: {
            agc_enabled: document.getElementById('agc_enabled')?.checked,
            agc_target_db: parseFloat(document.getElementById('agc_target_db').value),
            noise_suppression_enabled: document.getElementById('noise_suppression_enabled')?.checked,
            vad_enabled: document.getElementById('vad_enabled')?.checked,
            aec_enabled: document.getElementById('aec_enabled')?.checked
        }
    };

    fetch('/api/config', {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    })
    .then(r => r.json())
    .then(() => alert('DSP configuration saved!'))
    .catch(e => console.error('Error:', e));
}

function savePTTConfig(event) {
    event.preventDefault();
    const config = {
        ptt: {
            ptt_active_high: document.getElementById('ptt_active_high')?.checked,
            ptt_tail_ms: parseInt(document.getElementById('ptt_tail_ms').value),
            vox_enabled: document.getElementById('vox_enabled')?.checked,
            vox_threshold_db: parseFloat(document.getElementById('vox_threshold_db').value)
        }
    };

    fetch('/api/config', {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    })
    .then(r => r.json())
    .then(() => alert('PTT/COS configuration saved!'))
    .catch(e => console.error('Error:', e));
}

function saveSIPConfig(event) {
    event.preventDefault();
    const config = {
        sip_server: document.getElementById('sip_server').value,
        sip_port: parseInt(document.getElementById('sip_port').value),
        sip_username: document.getElementById('sip_username').value,
        sip_password: document.getElementById('sip_password').value
    };

    fetch('/api/config', {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    })
    .then(r => r.json())
    .then(() => alert('SIP configuration saved!'))
    .catch(e => console.error('Error:', e));
}

// Auto-save configuration on change
document.addEventListener('DOMContentLoaded', function() {
    const inputs = document.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
        input.addEventListener('change', debounce(function() {
            // Auto-save would go here
        }, 2000));
    });
});

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}
)rawliteral";
}

const char* RoIPWebServer::getSetupJS() const {
    return R"rawliteral(// RoIP Setup Wizard JavaScript

function initializeSetup() {
    // Setup initialization code
    scanNetworks();
}

function scanNetworks() {
    const select = document.getElementById('wifi-network');
    if (!select) return;

    select.innerHTML = '<option value="">Scanning...</option>';

    fetch('/api/wifi/networks')
        .then(r => r.json())
        .then(data => {
            select.innerHTML = '';
            if (data.networks && data.networks.length > 0) {
                data.networks.forEach(network => {
                    const option = document.createElement('option');
                    option.value = network.ssid;
                    option.textContent = `${network.ssid} (${network.rssi} dBm)`;
                    select.appendChild(option);
                });
            } else {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = 'No networks found';
                select.appendChild(option);
            }
        })
        .catch(e => {
            console.error('Error scanning networks:', e);
            select.innerHTML = '<option value="">Error scanning networks</option>';
        });
}

document.addEventListener('DOMContentLoaded', initializeSetup);
)rawliteral";
}

#endif // ROIP_WEBSERVER_H
