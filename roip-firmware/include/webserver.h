/*
 * ESP32 RoIP - Web Server & REST API
 * Synchronous HTTP server with REST API, OTA updates, and captive portal
 */

#ifndef ROIP_WEBSERVER_H
#define ROIP_WEBSERVER_H

#include <Arduino.h>
#include <WebServer.h>
#include <ArduinoJson.h>
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

    // Status methods
    void updateSystemStatus();
    void updateAudioStatus();
    void updateNetworkStatus();

    // Authentication
    bool verifyAuth();
    void setAdminPassword(const char* password);

    // Captive portal
    void enableCaptivePortal(bool enable);
    bool isCaptivePortalMode() const { return captivePortalMode; }

    // Request handling loop
    void handleClient();

private:
    WebServer server;
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

    // Captive portal handlers
    void setupCaptivePortal();
    void handleCaptivePortalRequest();

    // REST API handlers
    void setupAPIRoutes();

    // System endpoints
    void handleGetStatus();
    void handleGetSystemInfo();
    void handleGetHealth();
    void handleRestart();
    void handleFactoryReset();

    // Configuration endpoints
    void handleGetConfig();
    void handlePostConfig();
    void handleGetConfigItem();
    void handlePostConfigItem();
    void handleExportConfig();
    void handleImportConfig();

    // WiFi endpoints
    void handleGetWiFiStatus();
    void handlePostWiFi();
    void handleGetWiFiNetworks();

    // Audio endpoints
    void handleGetAudioStatus();
    void handlePostAudio();
    void handleGetAudioDevices();

    // Network endpoints
    void handleGetNetworkStatus();
    void handlePostNetwork();

    // SIP endpoints
    void handleGetSIPStatus();
    void handlePostSIP();

    // OTA endpoints
    void handleGetOTAStatus();
    void handlePostOTA();

    // Authentication endpoints
    void handleLogin();
    void handleLogout();
    void handleVerifyAuth();

    // Logging endpoints
    void handleGetLogs();
    void handleClearLogs();

    // Utility methods
    String generateAuthToken();
    bool validateAuthToken(const String& token);
    void updateActivityTime();
    void sendJSON(int code, const String& json);
    void sendCORS();

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
