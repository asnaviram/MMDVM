#ifndef SIP_CLIENT_H
#define SIP_CLIENT_H

#include <string>
#include <map>
#include <vector>
#include <cstdint>
#include <ctime>
#include <functional>

// SIP message types
enum class SIPMethod {
    REGISTER,
    INVITE,
    ACK,
    BYE,
    CANCEL,
    OPTIONS,
    UNKNOWN
};

// SIP call states
enum class CallState {
    IDLE,
    REGISTERING,
    REGISTERED,
    INVITING,
    RINGING,
    ESTABLISHED,
    DISCONNECTING,
    FAILED
};

// Registration states
enum class RegistrationState {
    UNREGISTERED,
    REGISTERING,
    REGISTERED,
    REGISTRATION_FAILED
};

// SDP media types
enum class SDPMediaType {
    AUDIO,
    VIDEO,
    UNKNOWN
};

// SIP transaction states
enum class TransactionState {
    TRYING,
    PROCEEDING,
    COMPLETED,
    TERMINATED
};

// SDP Media Description
struct SDPMediaDescription {
    SDPMediaType type;
    uint16_t port;
    std::string protocol;        // "RTP/AVP"
    std::vector<uint8_t> payloadTypes;
    std::map<std::string, std::string> attributes;

    std::string toString() const;
    static SDPMediaDescription fromString(const std::string& line);
};

// SDP Session Description
struct SDPSession {
    std::string sessionId;
    std::string sessionVersion;
    std::string origin;            // o= line
    std::string sessionName;       // s= line
    std::string connectionInfo;    // c= line (e.g., "IN IP4 192.168.1.1")
    std::vector<SDPMediaDescription> media;
    std::map<std::string, std::string> attributes;

    std::string toString() const;
    static SDPSession fromString(const std::string& sdpData);
    std::string getAudioPort() const;
};

// SIP Header structure
struct SIPHeaders {
    std::string to;
    std::string from;
    std::string via;
    std::string contact;
    std::string callId;
    std::string cseq;
    std::string contentType;
    std::string contentLength;
    std::string userAgent;
    std::string authorization;
    std::string wwwAuthenticate;
    std::string route;
    std::string recordRoute;
    std::map<std::string, std::string> customHeaders;

    std::string toString(SIPMethod method, const std::string& requestUri) const;
    static SIPHeaders fromString(const std::string& headerData);
};

// SIP Message structure
struct SIPMessage {
    SIPMethod method;
    std::string requestUri;
    std::string version;           // SIP/2.0
    int statusCode;                // For responses
    std::string reasonPhrase;      // For responses
    SIPHeaders headers;
    std::string body;

    std::string toString() const;
    static SIPMessage fromString(const std::string& rawMessage);
    bool isRequest() const { return method != SIPMethod::UNKNOWN && statusCode == 0; }
    bool isResponse() const { return statusCode > 0; }
};

// Transaction handle for tracking requests
struct SIPTransaction {
    std::string transactionId;
    SIPMethod method;
    TransactionState state;
    uint64_t createdTime;
    uint64_t lastActivityTime;
    std::string branchParameter;

    bool isExpired(uint64_t currentTime, uint32_t timeoutMs = 32000) const;
};

// SIP Registration Info
struct RegistrationInfo {
    std::string domain;
    std::string userId;
    std::string password;
    std::string displayName;
    uint16_t expirationSeconds;
    RegistrationState state;
    uint64_t lastRegisterTime;
    uint64_t nextRegisterTime;
    std::string nonce;             // From server challenge
    std::string realm;             // From server challenge
    std::string opaque;            // From server challenge
    bool nonceCountValid;
    uint32_t nonceCount;
};

// Call information
struct CallInfo {
    std::string callId;
    std::string remoteUri;
    std::string remoteDisplayName;
    CallState state;
    uint64_t startTime;
    SDPSession remoteSDP;
    SDPSession localSDP;
    uint32_t audioPort;
    uint32_t cseq;                 // Call sequence number
};

// Callback function types
using CallStateCallback = std::function<void(const CallInfo&)>;
using RegistrationStateCallback = std::function<void(RegistrationState)>;
using IncomingCallCallback = std::function<void(const CallInfo&)>;
using ErrorCallback = std::function<void(const std::string&)>;

// Main SIP Client class
class SIPClient {
public:
    SIPClient();
    ~SIPClient();

    // Initialization
    bool initialize(uint16_t localPort, const std::string& localAddress = "0.0.0.0");
    bool shutdown();

    // Configuration
    void setRegistration(const std::string& domain, const std::string& userId,
                       const std::string& password, const std::string& displayName = "");
    void setProxyServer(const std::string& proxyAddress, uint16_t proxyPort = 5060);
    void setLocalAudioPort(uint16_t port) { m_localAudioPort = port; }
    void setUserAgent(const std::string& userAgent);

    // Callbacks
    void setCallStateCallback(CallStateCallback callback) { m_callStateCallback = callback; }
    void setRegistrationStateCallback(RegistrationStateCallback callback) { m_regStateCallback = callback; }
    void setIncomingCallCallback(IncomingCallCallback callback) { m_incomingCallCallback = callback; }
    void setErrorCallback(ErrorCallback callback) { m_errorCallback = callback; }

    // Registration
    bool registerWithServer();
    bool unregisterFromServer();
    RegistrationState getRegistrationState() const { return m_registrationInfo.state; }
    bool isRegistered() const { return m_registrationInfo.state == RegistrationState::REGISTERED; }

    // Call control
    bool makeCall(const std::string& remoteUri, const std::string& displayName = "");
    bool answerCall(const std::string& callId);
    bool rejectCall(const std::string& callId);
    bool hangupCall(const std::string& callId);
    bool sendDTMF(const std::string& callId, char digit);

    // Call information
    CallInfo* getCurrentCall() { return &m_currentCall; }
    CallState getCallState() const { return m_currentCall.state; }

    // Main processing loop - call this regularly
    void process();

    // Message sending (low-level)
    bool sendMessage(const SIPMessage& message);
    bool sendMessage(const std::string& rawMessage);

    // Keep-alive/refresh
    void setKeepAliveInterval(uint32_t intervalMs) { m_keepAliveIntervalMs = intervalMs; }
    void setRegistrationRefreshInterval(uint32_t intervalSec) { m_regRefreshIntervalSec = intervalSec; }

private:
    // Network operations
    bool openUDPSocket();
    bool closeUDPSocket();
    bool sendUDP(const std::string& message, const std::string& host, uint16_t port);
    bool receiveUDP(std::string& message, std::string& remoteHost, uint16_t& remotePort);

    // SIP message handling
    void handleIncomingMessage(const SIPMessage& message);
    void handleRegisterResponse(const SIPMessage& response);
    void handleInviteResponse(const SIPMessage& response);
    void handleInviteRequest(const SIPMessage& request);
    void handleByeRequest(const SIPMessage& request);
    void handle401Challenge(const SIPMessage& response);
    void handleProvisionalResponse(const SIPMessage& response);

    // Message building
    SIPMessage buildRegisterMessage(bool authenticate = false);
    SIPMessage buildInviteMessage(const std::string& remoteUri);
    SIPMessage buildAckMessage(const std::string& callId, uint32_t cseq);
    SIPMessage buildByeMessage(const std::string& callId);
    SIPMessage buildOptionsMessage();
    SIPMessage buildResponse(const SIPMessage& request, int statusCode,
                            const std::string& reasonPhrase = "");

    // Authentication
    std::string generateAuthorizationHeader(const std::string& method,
                                           const std::string& uri,
                                           const std::string& realm,
                                           const std::string& nonce,
                                           const std::string& opaque);
    std::string calculateMD5Digest(const std::string& data);
    std::string calculateResponseHash(const std::string& method,
                                     const std::string& uri,
                                     const std::string& ha1,
                                     const std::string& nonce,
                                     const std::string& opaque);

    // SDP handling
    std::string buildSDP(uint32_t audioPort);
    SDPSession parseSDP(const std::string& sdpData);

    // Utilities
    std::string generateCallId();
    std::string generateBranchParameter();
    std::string generateTransactionId();
    uint32_t getNextCseq();
    uint64_t getCurrentTimeMs();
    std::string formatSIPUri(const std::string& userId, const std::string& domain);
    std::string extractDomain(const std::string& uri);
    std::string extractUserId(const std::string& uri);
    void parseNameAddr(const std::string& nameAddr, std::string& uri,
                      std::string& displayName);
    std::vector<std::string> splitString(const std::string& str, char delimiter);
    std::string trimString(const std::string& str);
    std::string toUpperCase(const std::string& str);
    std::string toLowerCase(const std::string& str);

    // State machine
    void updateCallState(CallState newState);
    void updateRegistrationState(RegistrationState newState);
    void handleTimeout();
    void cleanupExpiredTransactions();

    // Member variables
    int m_udpSocket;
    uint16_t m_localPort;
    std::string m_localAddress;
    std::string m_userAgent;

    // Registration
    RegistrationInfo m_registrationInfo;
    uint32_t m_regRefreshIntervalSec;
    uint64_t m_lastRegistrationAttempt;
    bool m_pendingAuthChallenge;

    // Call management
    CallInfo m_currentCall;
    std::map<std::string, SIPTransaction> m_transactions;
    uint32_t m_cseqCounter;
    uint16_t m_localAudioPort;
    uint64_t m_lastKeepAliveTime;
    uint32_t m_keepAliveIntervalMs;

    // Proxy/Server info
    std::string m_proxyAddress;
    uint16_t m_proxyPort;
    std::string m_localIPAddress;

    // Callbacks
    CallStateCallback m_callStateCallback;
    RegistrationStateCallback m_regStateCallback;
    IncomingCallCallback m_incomingCallCallback;
    ErrorCallback m_errorCallback;

    // Utility
    bool m_initialized;
    bool m_useProxy;
};

#endif // SIP_CLIENT_H
