/*
 * ESP32 RoIP - Web Server & REST API
 * Async HTTP server with WebSocket, REST API, OTA updates, and captive portal
 */

#ifndef ROIP_WEBSERVER_H
#define ROIP_WEBSERVER_H

#include <Arduino.h>
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>
#include <AsyncTCP.h>
#include "config.h"

// Web server configuration
#define WEB_SERVER_PORT 80
#define HTTPS_PORT 443
#define WS_PATH "/ws"
#define API_PATH "/api"
#define AUTH_TIMEOUT_MS 3600000  // 1 hour

// API Response codes
enum class APIStatus {
    OK = 200,
    Created = 201,
    BadRequest = 400,
    Unauthorized = 401,
    Forbidden = 403,
    NotFound = 404,
    InternalError = 500
};

// WebSocket event types
enum class WSEventType {
    SystemStatus,
    AudioStatus,
    NetworkStatus,
    ConfigChanged,
    FirmwareUpdate,
    Error
};

// Forward declarations
class ConfigManager;

class RoIPWebServer {
public:
    RoIPWebServer(ConfigManager* config);
    ~RoIPWebServer();

    // Server lifecycle
    bool begin();
    void stop();
    bool isRunning() const { return running; }

    // WebSocket broadcast
    void broadcastSystemStatus();
    void broadcastAudioStatus();
    void broadcastNetworkStatus();
    void broadcastConfigChanged();
    void broadcastError(const char* error);

    // Authentication
    bool verifyAuth(AsyncWebServerRequest* request);
    void setAdminPassword(const char* password);

    // Captive portal
    void enableCaptivePortal(bool enable);
    bool isCaptivePortalMode() const { return captivePortalMode; }

    // OTA update
    void handleOTAUpdate(AsyncWebServerRequest* request, String filename,
                        size_t index, uint8_t* data, size_t len, bool final);

private:
    AsyncWebServer server;
    ConfigManager* configManager;
    bool running;
    bool captivePortalMode;
    unsigned long lastActivityTime;

    // Authentication
    String adminPassword;
    struct {
        String token;
        unsigned long timestamp;
        bool valid;
    } sessionTokens[5];

    // WebSocket clients
    void onWSConnect(AsyncWebSocket* server, AsyncWebSocketClient* client);
    void onWSDisconnect(AsyncWebSocket* server, AsyncWebSocketClient* client);
    void onWSMessage(void* arg, uint8_t* data, size_t len);

    // Captive portal handlers
    void setupCaptivePortal();
    void handleCaptivePortalRequest(AsyncWebServerRequest* request);

    // REST API handlers
    void setupAPIRoutes();

    // System endpoints
    void handleGetStatus(AsyncWebServerRequest* request);
    void handleGetSystemInfo(AsyncWebServerRequest* request);
    void handleGetHealth(AsyncWebServerRequest* request);
    void handleRestart(AsyncWebServerRequest* request);
    void handleFactoryReset(AsyncWebServerRequest* request);

    // Configuration endpoints
    void handleGetConfig(AsyncWebServerRequest* request);
    void handlePostConfig(AsyncWebServerRequest* request);
    void handleGetConfigItem(AsyncWebServerRequest* request);
    void handlePostConfigItem(AsyncWebServerRequest* request);
    void handleExportConfig(AsyncWebServerRequest* request);
    void handleImportConfig(AsyncWebServerRequest* request);

    // WiFi endpoints
    void handleGetWiFiStatus(AsyncWebServerRequest* request);
    void handlePostWiFi(AsyncWebServerRequest* request);
    void handleGetWiFiNetworks(AsyncWebServerRequest* request);

    // Audio endpoints
    void handleGetAudioStatus(AsyncWebServerRequest* request);
    void handlePostAudio(AsyncWebServerRequest* request);
    void handleGetAudioDevices(AsyncWebServerRequest* request);

    // Network endpoints
    void handleGetNetworkStatus(AsyncWebServerRequest* request);
    void handlePostNetwork(AsyncWebServerRequest* request);

    // SIP endpoints
    void handleGetSIPStatus(AsyncWebServerRequest* request);
    void handlePostSIP(AsyncWebServerRequest* request);

    // OTA endpoints
    void handleGetOTAStatus(AsyncWebServerRequest* request);
    void handlePostOTA(AsyncWebServerRequest* request);

    // Authentication endpoints
    void handleLogin(AsyncWebServerRequest* request);
    void handleLogout(AsyncWebServerRequest* request);
    void handleVerifyAuth(AsyncWebServerRequest* request);

    // Logging endpoints
    void handleGetLogs(AsyncWebServerRequest* request);
    void handleClearLogs(AsyncWebServerRequest* request);

    // Utility methods
    String generateAuthToken();
    bool validateAuthToken(const String& token);
    void updateActivityTime();
    APIStatus handleJSONRequest(AsyncWebServerRequest* request,
                                DynamicJsonDocument& doc);

    // CORS headers
    void addCORSHeaders(AsyncWebServerResponse* response);

    // Static content serving
    void setupStaticRoutes();

    // HTML asset getters
    const char* getIndexHTML() const;
    const char* getDashboardHTML() const;
    const char* getConfigHTML() const;
    const char* getSetupHTML() const;
    const char* getCSS() const;
    const char* getMainJS() const;
    const char* getConfigJS() const;
    const char* getSetupJS() const;
};

#endif // ROIP_WEBSERVER_H
