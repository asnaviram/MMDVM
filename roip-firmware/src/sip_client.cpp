#include "sip_client.h"
#include <iostream>
#include <sstream>
#include <algorithm>
#include <cstring>
#include <iomanip>
#include <random>
#include <chrono>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <fcntl.h>

// Simple MD5 implementation (simplified for RoIP)
class MD5 {
public:
    static std::string hash(const std::string& data) {
        // Simple MD5 implementation for authentication
        // This is a basic implementation suitable for SIP Digest auth
        unsigned char result[16];
        md5_compute(reinterpret_cast<const unsigned char*>(data.c_str()),
                   data.length(), result);

        std::ostringstream oss;
        for (int i = 0; i < 16; ++i) {
            oss << std::hex << std::setw(2) << std::setfill('0')
                << static_cast<int>(result[i]);
        }
        return oss.str();
    }

private:
    // MD5 constants
    static const unsigned int S[64];
    static const unsigned int K[64];

    static void md5_init(unsigned int* context) {
        context[0] = 0x67452301;
        context[1] = 0xefcdab89;
        context[2] = 0x98badcfe;
        context[3] = 0x10325476;
    }

    static void md5_transform(unsigned int* context, const unsigned char* block) {
        unsigned int a = context[0], b = context[1], c = context[2], d = context[3];
        unsigned int x[16];

        for (int i = 0; i < 16; ++i) {
            x[i] = (block[i*4] | (block[i*4+1] << 8) |
                   (block[i*4+2] << 16) | (block[i*4+3] << 24));
        }

        // Rounds
        for (int i = 0; i < 64; ++i) {
            unsigned int f, g;
            if (i < 16) {
                f = (b & c) | (~b & d);
                g = i;
            } else if (i < 32) {
                f = (d & b) | (~d & c);
                g = (5 * i + 1) % 16;
            } else if (i < 48) {
                f = b ^ c ^ d;
                g = (3 * i + 5) % 16;
            } else {
                f = c ^ (b | ~d);
                g = (7 * i) % 16;
            }

            unsigned int temp = d;
            d = c;
            c = b;
            b = b + rol(a + f + K[i] + x[g], S[i]);
            a = temp;
        }

        context[0] += a;
        context[1] += b;
        context[2] += c;
        context[3] += d;
    }

    static void md5_compute(const unsigned char* data, size_t len,
                           unsigned char* result) {
        unsigned int context[4];
        md5_init(context);

        unsigned char buffer[64];
        size_t offset = 0;

        while (len - offset >= 64) {
            md5_transform(context, data + offset);
            offset += 64;
        }

        size_t remaining = len - offset;
        std::memcpy(buffer, data + offset, remaining);
        buffer[remaining] = 0x80;
        std::memset(buffer + remaining + 1, 0, 63 - remaining);

        unsigned long long bits = len * 8;
        for (int i = 0; i < 8; ++i) {
            buffer[56 + i] = (bits >> (i * 8)) & 0xff;
        }

        md5_transform(context, buffer);

        for (int i = 0; i < 4; ++i) {
            result[i*4] = context[i] & 0xff;
            result[i*4+1] = (context[i] >> 8) & 0xff;
            result[i*4+2] = (context[i] >> 16) & 0xff;
            result[i*4+3] = (context[i] >> 24) & 0xff;
        }
    }

    static unsigned int rol(unsigned int x, unsigned int n) {
        return (x << n) | (x >> (32 - n));
    }
};

// MD5 constants
const unsigned int MD5::S[64] = {
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
};

const unsigned int MD5::K[64] = {
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a,
    0xa8304613, 0xfd469501, 0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be,
    0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821, 0xf61e2562, 0xc040b340,
    0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8,
    0x676f02d9, 0x8d2a4c8a, 0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
    0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70, 0x289b7ec6, 0xeaa127fa,
    0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92,
    0xffeff47d, 0x85845dd1, 0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1,
    0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391
};

// ============================================================================
// SDP Implementation
// ============================================================================

std::string SDPMediaDescription::toString() const {
    std::ostringstream oss;
    std::string mediaType = (type == SDPMediaType::AUDIO) ? "audio" : "video";
    oss << "m=" << mediaType << " " << port << " " << protocol;

    for (const auto& pt : payloadTypes) {
        oss << " " << static_cast<int>(pt);
    }
    oss << "\r\n";

    for (const auto& attr : attributes) {
        oss << "a=" << attr.first << ":" << attr.second << "\r\n";
    }

    return oss.str();
}

SDPMediaDescription SDPMediaDescription::fromString(const std::string& line) {
    SDPMediaDescription desc;
    std::istringstream iss(line);
    std::string token;

    iss >> token; // Skip 'm='
    iss >> token;
    desc.type = (token == "audio") ? SDPMediaType::AUDIO : SDPMediaType::VIDEO;

    iss >> desc.port >> desc.protocol;

    uint8_t pt;
    while (iss >> pt) {
        desc.payloadTypes.push_back(pt);
    }

    return desc;
}

std::string SDPSession::toString() const {
    std::ostringstream oss;
    oss << "v=0\r\n";
    oss << "o=" << origin << "\r\n";
    oss << "s=" << sessionName << "\r\n";
    oss << "c=" << connectionInfo << "\r\n";
    oss << "t=0 0\r\n";

    for (const auto& attr : attributes) {
        oss << "a=" << attr.first << ":" << attr.second << "\r\n";
    }

    for (const auto& med : media) {
        oss << med.toString();
    }

    return oss.str();
}

SDPSession SDPSession::fromString(const std::string& sdpData) {
    SDPSession session;
    std::istringstream iss(sdpData);
    std::string line;

    while (std::getline(iss, line)) {
        if (line.empty()) continue;
        if (line.back() == '\r') line.pop_back();

        if (line.substr(0, 2) == "o=") {
            session.origin = line.substr(2);
        } else if (line.substr(0, 2) == "s=") {
            session.sessionName = line.substr(2);
        } else if (line.substr(0, 2) == "c=") {
            session.connectionInfo = line.substr(2);
        } else if (line.substr(0, 2) == "m=") {
            SDPMediaDescription media = SDPMediaDescription::fromString(line);
            session.media.push_back(media);
        } else if (line.substr(0, 2) == "a=") {
            std::string attr = line.substr(2);
            size_t colonPos = attr.find(':');
            if (colonPos != std::string::npos) {
                session.attributes[attr.substr(0, colonPos)] = attr.substr(colonPos + 1);
            }
        }
    }

    return session;
}

std::string SDPSession::getAudioPort() const {
    for (const auto& med : media) {
        if (med.type == SDPMediaType::AUDIO) {
            return std::to_string(med.port);
        }
    }
    return "";
}

// ============================================================================
// SIP Message Implementation
// ============================================================================

std::string SIPHeaders::toString(SIPMethod method, const std::string& requestUri) const {
    std::ostringstream oss;

    // Request line or Status line
    if (method != SIPMethod::UNKNOWN) {
        std::string methodStr;
        switch (method) {
            case SIPMethod::REGISTER: methodStr = "REGISTER"; break;
            case SIPMethod::INVITE: methodStr = "INVITE"; break;
            case SIPMethod::ACK: methodStr = "ACK"; break;
            case SIPMethod::BYE: methodStr = "BYE"; break;
            case SIPMethod::CANCEL: methodStr = "CANCEL"; break;
            case SIPMethod::OPTIONS: methodStr = "OPTIONS"; break;
            default: methodStr = "UNKNOWN"; break;
        }
        oss << methodStr << " " << requestUri << " SIP/2.0\r\n";
    }

    if (!via.empty()) oss << "Via: " << via << "\r\n";
    if (!from.empty()) oss << "From: " << from << "\r\n";
    if (!to.empty()) oss << "To: " << to << "\r\n";
    if (!contact.empty()) oss << "Contact: " << contact << "\r\n";
    if (!callId.empty()) oss << "Call-ID: " << callId << "\r\n";
    if (!cseq.empty()) oss << "CSeq: " << cseq << "\r\n";
    if (!userAgent.empty()) oss << "User-Agent: " << userAgent << "\r\n";
    if (!authorization.empty()) oss << "Authorization: " << authorization << "\r\n";
    if (!wwwAuthenticate.empty()) oss << "WWW-Authenticate: " << wwwAuthenticate << "\r\n";
    if (!route.empty()) oss << "Route: " << route << "\r\n";
    if (!recordRoute.empty()) oss << "Record-Route: " << recordRoute << "\r\n";

    if (!contentType.empty()) {
        oss << "Content-Type: " << contentType << "\r\n";
    }
    if (!contentLength.empty()) {
        oss << "Content-Length: " << contentLength << "\r\n";
    }

    for (const auto& header : customHeaders) {
        oss << header.first << ": " << header.second << "\r\n";
    }

    oss << "\r\n";
    return oss.str();
}

SIPHeaders SIPHeaders::fromString(const std::string& headerData) {
    SIPHeaders headers;
    std::istringstream iss(headerData);
    std::string line;

    while (std::getline(iss, line)) {
        if (line.empty() || line == "\r") break;
        if (line.back() == '\r') line.pop_back();

        size_t colonPos = line.find(':');
        if (colonPos == std::string::npos) continue;

        std::string name = line.substr(0, colonPos);
        std::string value = line.substr(colonPos + 1);

        // Trim whitespace
        value.erase(0, value.find_first_not_of(" \t"));
        value.erase(value.find_last_not_of(" \t") + 1);

        if (name == "Via") headers.via = value;
        else if (name == "From") headers.from = value;
        else if (name == "To") headers.to = value;
        else if (name == "Contact") headers.contact = value;
        else if (name == "Call-ID") headers.callId = value;
        else if (name == "CSeq") headers.cseq = value;
        else if (name == "Content-Type") headers.contentType = value;
        else if (name == "Content-Length") headers.contentLength = value;
        else if (name == "User-Agent") headers.userAgent = value;
        else if (name == "Authorization") headers.authorization = value;
        else if (name == "WWW-Authenticate") headers.wwwAuthenticate = value;
        else if (name == "Route") headers.route = value;
        else if (name == "Record-Route") headers.recordRoute = value;
        else headers.customHeaders[name] = value;
    }

    return headers;
}

std::string SIPMessage::toString() const {
    std::ostringstream oss;

    if (isRequest()) {
        std::string methodStr;
        switch (method) {
            case SIPMethod::REGISTER: methodStr = "REGISTER"; break;
            case SIPMethod::INVITE: methodStr = "INVITE"; break;
            case SIPMethod::ACK: methodStr = "ACK"; break;
            case SIPMethod::BYE: methodStr = "BYE"; break;
            case SIPMethod::CANCEL: methodStr = "CANCEL"; break;
            case SIPMethod::OPTIONS: methodStr = "OPTIONS"; break;
            default: methodStr = "UNKNOWN"; break;
        }
        oss << methodStr << " " << requestUri << " " << version << "\r\n";
    } else {
        oss << version << " " << statusCode << " " << reasonPhrase << "\r\n";
    }

    oss << headers.toString(method, requestUri);

    if (!body.empty()) {
        oss << body;
    }

    return oss.str();
}

SIPMessage SIPMessage::fromString(const std::string& rawMessage) {
    SIPMessage msg;
    std::istringstream iss(rawMessage);
    std::string line;

    // First line (request or response)
    std::getline(iss, line);
    if (line.back() == '\r') line.pop_back();

    std::istringstream firstLine(line);
    std::string token1, token2, token3;
    firstLine >> token1 >> token2 >> token3;

    if (token1 == "SIP/2.0") {
        // Response
        msg.statusCode = std::stoi(token2);
        msg.reasonPhrase = token3;
        msg.version = token1;
    } else {
        // Request
        msg.requestUri = token2;
        msg.version = token3;

        if (token1 == "REGISTER") msg.method = SIPMethod::REGISTER;
        else if (token1 == "INVITE") msg.method = SIPMethod::INVITE;
        else if (token1 == "ACK") msg.method = SIPMethod::ACK;
        else if (token1 == "BYE") msg.method = SIPMethod::BYE;
        else if (token1 == "CANCEL") msg.method = SIPMethod::CANCEL;
        else if (token1 == "OPTIONS") msg.method = SIPMethod::OPTIONS;
    }

    // Headers
    std::string headerData;
    while (std::getline(iss, line)) {
        if (line == "\r" || line.empty()) break;
        headerData += line + "\n";
    }

    msg.headers = SIPHeaders::fromString(headerData);

    // Body
    std::string bodyLine;
    while (std::getline(iss, bodyLine)) {
        msg.body += bodyLine + "\n";
    }

    if (!msg.body.empty() && msg.body.back() == '\n') {
        msg.body.pop_back();
    }

    return msg;
}

// ============================================================================
// SIP Client Implementation
// ============================================================================

SIPClient::SIPClient()
    : m_udpSocket(-1), m_localPort(5060), m_cseqCounter(1),
      m_localAudioPort(5000), m_lastKeepAliveTime(0),
      m_keepAliveIntervalMs(30000), m_proxyPort(5060),
      m_initialized(false), m_useProxy(false),
      m_pendingAuthChallenge(false), m_regRefreshIntervalSec(3600),
      m_lastRegistrationAttempt(0) {

    m_registrationInfo.state = RegistrationState::UNREGISTERED;
    m_registrationInfo.expirationSeconds = 3600;
    m_registrationInfo.nonceCount = 0;

    m_currentCall.state = CallState::IDLE;
    m_currentCall.cseq = 1;

    m_userAgent = "MMDVM-RoIP/1.0";
}

SIPClient::~SIPClient() {
    shutdown();
}

bool SIPClient::initialize(uint16_t localPort, const std::string& localAddress) {
    m_localPort = localPort;
    m_localAddress = localAddress;
    m_localIPAddress = "127.0.0.1"; // Default, should be detected

    if (!openUDPSocket()) {
        if (m_errorCallback) {
            m_errorCallback("Failed to open UDP socket");
        }
        return false;
    }

    m_initialized = true;
    m_lastKeepAliveTime = getCurrentTimeMs();

    return true;
}

bool SIPClient::shutdown() {
    if (m_registrationInfo.state == RegistrationState::REGISTERED) {
        unregisterFromServer();
    }

    return closeUDPSocket();
}

void SIPClient::setRegistration(const std::string& domain,
                               const std::string& userId,
                               const std::string& password,
                               const std::string& displayName) {
    m_registrationInfo.domain = domain;
    m_registrationInfo.userId = userId;
    m_registrationInfo.password = password;
    m_registrationInfo.displayName = displayName.empty() ? userId : displayName;
}

void SIPClient::setProxyServer(const std::string& proxyAddress, uint16_t proxyPort) {
    m_proxyAddress = proxyAddress;
    m_proxyPort = proxyPort;
    m_useProxy = true;
}

void SIPClient::setUserAgent(const std::string& userAgent) {
    m_userAgent = userAgent;
}

bool SIPClient::registerWithServer() {
    if (!m_initialized) return false;

    updateRegistrationState(RegistrationState::REGISTERING);

    SIPMessage registerMsg = buildRegisterMessage(false);

    std::string host = m_useProxy ? m_proxyAddress : m_registrationInfo.domain;
    uint16_t port = m_useProxy ? m_proxyPort : 5060;

    m_lastRegistrationAttempt = getCurrentTimeMs();

    return sendUDP(registerMsg.toString(), host, port);
}

bool SIPClient::unregisterFromServer() {
    if (m_registrationInfo.state != RegistrationState::REGISTERED) {
        return false;
    }

    m_registrationInfo.expirationSeconds = 0;
    SIPMessage unregisterMsg = buildRegisterMessage(true);

    std::string host = m_useProxy ? m_proxyAddress : m_registrationInfo.domain;
    uint16_t port = m_useProxy ? m_proxyPort : 5060;

    bool result = sendUDP(unregisterMsg.toString(), host, port);

    updateRegistrationState(RegistrationState::UNREGISTERED);
    m_registrationInfo.expirationSeconds = 3600;

    return result;
}

bool SIPClient::makeCall(const std::string& remoteUri, const std::string& displayName) {
    if (m_registrationInfo.state != RegistrationState::REGISTERED) {
        if (m_errorCallback) {
            m_errorCallback("Cannot make call: not registered");
        }
        return false;
    }

    if (m_currentCall.state != CallState::IDLE) {
        if (m_errorCallback) {
            m_errorCallback("Cannot make call: call already in progress");
        }
        return false;
    }

    m_currentCall.callId = generateCallId();
    m_currentCall.remoteUri = remoteUri;
    m_currentCall.remoteDisplayName = displayName;
    m_currentCall.startTime = getCurrentTimeMs();
    m_currentCall.cseq = 1;

    updateCallState(CallState::INVITING);

    SIPMessage inviteMsg = buildInviteMessage(remoteUri);

    std::string host = m_useProxy ? m_proxyAddress : extractDomain(remoteUri);
    uint16_t port = m_useProxy ? m_proxyPort : 5060;

    return sendUDP(inviteMsg.toString(), host, port);
}

bool SIPClient::answerCall(const std::string& callId) {
    if (m_currentCall.callId != callId) {
        return false;
    }

    updateCallState(CallState::ESTABLISHED);

    // Build local SDP for response
    m_currentCall.localSDP.origin = "MMDVM-RoIP " + std::to_string(getCurrentTimeMs()) +
                                   " 1 IN IP4 " + m_localIPAddress;
    m_currentCall.localSDP.sessionName = "MMDVM Radio over IP";
    m_currentCall.localSDP.connectionInfo = "IN IP4 " + m_localIPAddress;

    SDPMediaDescription audio;
    audio.type = SDPMediaType::AUDIO;
    audio.port = m_localAudioPort;
    audio.protocol = "RTP/AVP";
    audio.payloadTypes = {0};
    audio.attributes["rtpmap"] = "0 PCMU/8000";
    m_currentCall.localSDP.media.push_back(audio);

    // Send 200 OK response with SDP
    SIPMessage okResponse;
    okResponse.statusCode = 200;
    okResponse.reasonPhrase = "OK";
    okResponse.version = "SIP/2.0";
    okResponse.body = m_currentCall.localSDP.toString();
    okResponse.headers.contentType = "application/sdp";
    okResponse.headers.contentLength = std::to_string(okResponse.body.length());

    sendMessage(okResponse);

    return true;
}

bool SIPClient::rejectCall(const std::string& callId) {
    if (m_currentCall.callId != callId) {
        return false;
    }

    updateCallState(CallState::FAILED);

    SIPMessage rejectResponse;
    rejectResponse.statusCode = 486;
    rejectResponse.reasonPhrase = "Busy Here";
    rejectResponse.version = "SIP/2.0";

    return true;
}

bool SIPClient::hangupCall(const std::string& callId) {
    if (m_currentCall.callId != callId || m_currentCall.state == CallState::IDLE) {
        return false;
    }

    updateCallState(CallState::DISCONNECTING);

    SIPMessage byeMsg = buildByeMessage(callId);

    std::string host = m_useProxy ? m_proxyAddress : extractDomain(m_currentCall.remoteUri);
    uint16_t port = m_useProxy ? m_proxyPort : 5060;

    bool result = sendUDP(byeMsg.toString(), host, port);

    updateCallState(CallState::IDLE);
    m_currentCall.callId = "";

    return result;
}

bool SIPClient::sendDTMF(const std::string& callId, char digit) {
    if (m_currentCall.callId != callId || m_currentCall.state != CallState::ESTABLISHED) {
        return false;
    }

    // In RoIP, DTMF would be transmitted via RTP
    // This is a placeholder for DTMF relay implementation
    return true;
}

void SIPClient::process() {
    if (!m_initialized) return;

    // Handle incoming messages
    std::string message;
    std::string remoteHost;
    uint16_t remotePort;

    while (receiveUDP(message, remoteHost, remotePort)) {
        SIPMessage sipMsg = SIPMessage::fromString(message);
        handleIncomingMessage(sipMsg);
    }

    // Handle timeouts and keep-alive
    handleTimeout();
    cleanupExpiredTransactions();

    // Periodic registration refresh
    uint64_t currentTime = getCurrentTimeMs();
    if (m_registrationInfo.state == RegistrationState::REGISTERED) {
        uint64_t timeSinceRegister = currentTime - m_registrationInfo.lastRegisterTime;
        if (timeSinceRegister > (m_regRefreshIntervalSec * 1000)) {
            registerWithServer();
        }
    }

    // Keep-alive (OPTIONS or REGISTER refresh)
    if (currentTime - m_lastKeepAliveTime > m_keepAliveIntervalMs) {
        if (m_registrationInfo.state == RegistrationState::REGISTERED) {
            SIPMessage optionsMsg = buildOptionsMessage();
            std::string host = m_useProxy ? m_proxyAddress : m_registrationInfo.domain;
            uint16_t port = m_useProxy ? m_proxyPort : 5060;
            sendUDP(optionsMsg.toString(), host, port);
        }
        m_lastKeepAliveTime = currentTime;
    }
}

bool SIPClient::sendMessage(const SIPMessage& message) {
    return sendMessage(message.toString());
}

bool SIPClient::sendMessage(const std::string& rawMessage) {
    std::string host = m_useProxy ? m_proxyAddress : m_registrationInfo.domain;
    uint16_t port = m_useProxy ? m_proxyPort : 5060;

    return sendUDP(rawMessage, host, port);
}

// ============================================================================
// Network Operations
// ============================================================================

bool SIPClient::openUDPSocket() {
    m_udpSocket = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    if (m_udpSocket < 0) {
        return false;
    }

    // Set non-blocking mode
    int flags = fcntl(m_udpSocket, F_GETFL, 0);
    fcntl(m_udpSocket, F_SETFL, flags | O_NONBLOCK);

    struct sockaddr_in addr;
    addr.sin_family = AF_INET;
    addr.sin_port = htons(m_localPort);
    addr.sin_addr.s_addr = inet_addr(m_localAddress.c_str());

    if (bind(m_udpSocket, (struct sockaddr*)&addr, sizeof(addr)) < 0) {
        close(m_udpSocket);
        m_udpSocket = -1;
        return false;
    }

    return true;
}

bool SIPClient::closeUDPSocket() {
    if (m_udpSocket >= 0) {
        close(m_udpSocket);
        m_udpSocket = -1;
    }
    return true;
}

bool SIPClient::sendUDP(const std::string& message, const std::string& host, uint16_t port) {
    if (m_udpSocket < 0) return false;

    struct sockaddr_in addr;
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);
    addr.sin_addr.s_addr = inet_addr(host.c_str());

    ssize_t sent = sendto(m_udpSocket, message.c_str(), message.length(), 0,
                         (struct sockaddr*)&addr, sizeof(addr));

    return sent == static_cast<ssize_t>(message.length());
}

bool SIPClient::receiveUDP(std::string& message, std::string& remoteHost, uint16_t& remotePort) {
    if (m_udpSocket < 0) return false;

    char buffer[4096];
    struct sockaddr_in addr;
    socklen_t addrLen = sizeof(addr);

    ssize_t recvLen = recvfrom(m_udpSocket, buffer, sizeof(buffer), 0,
                              (struct sockaddr*)&addr, &addrLen);

    if (recvLen > 0) {
        message = std::string(buffer, recvLen);
        remoteHost = inet_ntoa(addr.sin_addr);
        remotePort = ntohs(addr.sin_port);
        return true;
    }

    return false;
}

// ============================================================================
// SIP Message Handling
// ============================================================================

void SIPClient::handleIncomingMessage(const SIPMessage& message) {
    if (message.isRequest()) {
        if (message.method == SIPMethod::INVITE) {
            handleInviteRequest(message);
        } else if (message.method == SIPMethod::BYE) {
            handleByeRequest(message);
        } else if (message.method == SIPMethod::OPTIONS) {
            // Send 200 OK for OPTIONS
        }
    } else if (message.isResponse()) {
        if (message.statusCode == 401) {
            handle401Challenge(message);
        } else if (message.statusCode == 100 || message.statusCode == 180) {
            handleProvisionalResponse(message);
        } else if (message.statusCode == 200) {
            // Check if it's a REGISTER, INVITE, BYE, or OPTIONS response
            std::istringstream cseq(message.headers.cseq);
            std::string cseqNum, method;
            cseq >> cseqNum >> method;

            if (method == "REGISTER") {
                handleRegisterResponse(message);
            } else if (method == "INVITE") {
                handleInviteResponse(message);
            }
        }
    }
}

void SIPClient::handleRegisterResponse(const SIPMessage& response) {
    if (response.statusCode == 200) {
        m_registrationInfo.lastRegisterTime = getCurrentTimeMs();
        m_registrationInfo.nextRegisterTime = m_registrationInfo.lastRegisterTime +
                                             (m_registrationInfo.expirationSeconds * 1000);
        updateRegistrationState(RegistrationState::REGISTERED);

        if (m_regStateCallback) {
            m_regStateCallback(RegistrationState::REGISTERED);
        }
    } else if (response.statusCode == 401) {
        // Digest challenge - will be handled by handle401Challenge
    } else {
        updateRegistrationState(RegistrationState::REGISTRATION_FAILED);

        if (m_regStateCallback) {
            m_regStateCallback(RegistrationState::REGISTRATION_FAILED);
        }
    }
}

void SIPClient::handleInviteResponse(const SIPMessage& response) {
    if (response.statusCode == 200) {
        updateCallState(CallState::ESTABLISHED);

        // Parse remote SDP if present
        if (!response.body.empty()) {
            m_currentCall.remoteSDP = parseSDP(response.body);
            std::string audioPort = m_currentCall.remoteSDP.getAudioPort();
            if (!audioPort.empty()) {
                m_currentCall.audioPort = std::stoul(audioPort);
            }
        }

        // Send ACK
        SIPMessage ack = buildAckMessage(m_currentCall.callId, m_currentCall.cseq);
        std::string host = m_useProxy ? m_proxyAddress : extractDomain(m_currentCall.remoteUri);
        uint16_t port = m_useProxy ? m_proxyPort : 5060;
        sendUDP(ack.toString(), host, port);

        if (m_callStateCallback) {
            m_callStateCallback(m_currentCall);
        }
    } else if (response.statusCode == 407 || response.statusCode == 401) {
        handle401Challenge(response);
    } else if (response.statusCode >= 400) {
        updateCallState(CallState::FAILED);
        if (m_errorCallback) {
            m_errorCallback("Call failed: " + response.reasonPhrase);
        }
    }
}

void SIPClient::handleInviteRequest(const SIPMessage& request) {
    // Incoming call
    m_currentCall.callId = request.headers.callId;
    m_currentCall.remoteUri = request.headers.from;
    m_currentCall.startTime = getCurrentTimeMs();

    updateCallState(CallState::RINGING);

    // Parse remote SDP
    if (!request.body.empty()) {
        m_currentCall.remoteSDP = parseSDP(request.body);
    }

    if (m_incomingCallCallback) {
        m_incomingCallCallback(m_currentCall);
    }

    // Send 100 Trying response
    SIPMessage tryingResponse = buildResponse(request, 100, "Trying");
    sendMessage(tryingResponse);
}

void SIPClient::handleByeRequest(const SIPMessage& request) {
    if (m_currentCall.callId == request.headers.callId) {
        updateCallState(CallState::IDLE);
        m_currentCall.callId = "";

        // Send 200 OK response
        SIPMessage okResponse = buildResponse(request, 200, "OK");
        sendMessage(okResponse);
    }
}

void SIPClient::handle401Challenge(const SIPMessage& response) {
    // Extract authentication parameters from WWW-Authenticate header
    std::string authHeader = response.headers.wwwAuthenticate;

    // Simple parsing - in production this should be more robust
    size_t realmPos = authHeader.find("realm=\"");
    size_t noncePos = authHeader.find("nonce=\"");
    size_t opaquePos = authHeader.find("opaque=\"");

    if (realmPos != std::string::npos) {
        size_t endPos = authHeader.find("\"", realmPos + 7);
        m_registrationInfo.realm = authHeader.substr(realmPos + 7, endPos - (realmPos + 7));
    }

    if (noncePos != std::string::npos) {
        size_t endPos = authHeader.find("\"", noncePos + 7);
        m_registrationInfo.nonce = authHeader.substr(noncePos + 7, endPos - (noncePos + 7));
    }

    if (opaquePos != std::string::npos) {
        size_t endPos = authHeader.find("\"", opaquePos + 8);
        m_registrationInfo.opaque = authHeader.substr(opaquePos + 8, endPos - (opaquePos + 8));
    }

    m_registrationInfo.nonceCount = 1;
    m_pendingAuthChallenge = true;

    // Check if this is for REGISTER or INVITE
    std::istringstream cseq(response.headers.cseq);
    std::string cseqNum, method;
    cseq >> cseqNum >> method;

    if (method == "REGISTER") {
        registerWithServer();
    } else if (method == "INVITE") {
        makeCall(m_currentCall.remoteUri, m_currentCall.remoteDisplayName);
    }
}

void SIPClient::handleProvisionalResponse(const SIPMessage& response) {
    if (response.statusCode == 180) {
        updateCallState(CallState::RINGING);
        if (m_callStateCallback) {
            m_callStateCallback(m_currentCall);
        }
    }
}

// ============================================================================
// Message Building
// ============================================================================

SIPMessage SIPClient::buildRegisterMessage(bool authenticate) {
    SIPMessage msg;
    msg.method = SIPMethod::REGISTER;
    msg.requestUri = "sip:" + m_registrationInfo.domain;
    msg.version = "SIP/2.0";

    std::string callId = generateCallId();
    uint32_t cseq = getNextCseq();

    msg.headers.via = "SIP/2.0/UDP " + m_localIPAddress + ":" + std::to_string(m_localPort) +
                     ";branch=" + generateBranchParameter();
    msg.headers.from = "<sip:" + m_registrationInfo.userId + "@" + m_registrationInfo.domain + ">;tag=" +
                      generateTransactionId();
    msg.headers.to = "<sip:" + m_registrationInfo.userId + "@" + m_registrationInfo.domain + ">";
    msg.headers.contact = "<sip:" + m_registrationInfo.userId + "@" + m_localIPAddress + ":" +
                         std::to_string(m_localPort) + ">";
    msg.headers.callId = callId;
    msg.headers.cseq = std::to_string(cseq) + " REGISTER";
    msg.headers.userAgent = m_userAgent;

    if (authenticate && !m_registrationInfo.nonce.empty()) {
        std::string uri = "sip:" + m_registrationInfo.domain;
        msg.headers.authorization = generateAuthorizationHeader(
            "REGISTER", uri, m_registrationInfo.realm, m_registrationInfo.nonce,
            m_registrationInfo.opaque);
    }

    msg.headers.customHeaders["Max-Forwards"] = "70";

    if (m_registrationInfo.expirationSeconds > 0) {
        msg.headers.customHeaders["Expires"] = std::to_string(m_registrationInfo.expirationSeconds);
    }

    msg.headers.contentLength = "0";

    return msg;
}

SIPMessage SIPClient::buildInviteMessage(const std::string& remoteUri) {
    SIPMessage msg;
    msg.method = SIPMethod::INVITE;
    msg.requestUri = remoteUri;
    msg.version = "SIP/2.0";

    std::string callId = m_currentCall.callId;
    m_currentCall.cseq = 1;

    msg.headers.via = "SIP/2.0/UDP " + m_localIPAddress + ":" + std::to_string(m_localPort) +
                     ";branch=" + generateBranchParameter();
    msg.headers.from = "<sip:" + m_registrationInfo.userId + "@" + m_registrationInfo.domain +
                      ">;tag=" + generateTransactionId();
    msg.headers.to = "<" + remoteUri + ">";
    msg.headers.contact = "<sip:" + m_registrationInfo.userId + "@" + m_localIPAddress + ":" +
                         std::to_string(m_localPort) + ">";
    msg.headers.callId = callId;
    msg.headers.cseq = std::to_string(m_currentCall.cseq) + " INVITE";
    msg.headers.userAgent = m_userAgent;

    // Build SDP
    msg.body = buildSDP(m_localAudioPort);
    msg.headers.contentType = "application/sdp";
    msg.headers.contentLength = std::to_string(msg.body.length());

    msg.headers.customHeaders["Max-Forwards"] = "70";

    if (m_pendingAuthChallenge && !m_registrationInfo.nonce.empty()) {
        std::string uri = remoteUri;
        msg.headers.authorization = generateAuthorizationHeader(
            "INVITE", uri, m_registrationInfo.realm, m_registrationInfo.nonce,
            m_registrationInfo.opaque);
    }

    return msg;
}

SIPMessage SIPClient::buildAckMessage(const std::string& callId, uint32_t cseq) {
    SIPMessage msg;
    msg.method = SIPMethod::ACK;
    msg.requestUri = m_currentCall.remoteUri;
    msg.version = "SIP/2.0";

    msg.headers.via = "SIP/2.0/UDP " + m_localIPAddress + ":" + std::to_string(m_localPort) +
                     ";branch=" + generateBranchParameter();
    msg.headers.from = "<sip:" + m_registrationInfo.userId + "@" + m_registrationInfo.domain +
                      ">;tag=" + generateTransactionId();
    msg.headers.to = "<" + m_currentCall.remoteUri + ">";
    msg.headers.callId = callId;
    msg.headers.cseq = std::to_string(cseq) + " ACK";
    msg.headers.userAgent = m_userAgent;
    msg.headers.contentLength = "0";
    msg.headers.customHeaders["Max-Forwards"] = "70";

    return msg;
}

SIPMessage SIPClient::buildByeMessage(const std::string& callId) {
    SIPMessage msg;
    msg.method = SIPMethod::BYE;
    msg.requestUri = m_currentCall.remoteUri;
    msg.version = "SIP/2.0";

    msg.headers.via = "SIP/2.0/UDP " + m_localIPAddress + ":" + std::to_string(m_localPort) +
                     ";branch=" + generateBranchParameter();
    msg.headers.from = "<sip:" + m_registrationInfo.userId + "@" + m_registrationInfo.domain +
                      ">;tag=" + generateTransactionId();
    msg.headers.to = "<" + m_currentCall.remoteUri + ">";
    msg.headers.callId = callId;
    msg.headers.cseq = std::to_string(++m_currentCall.cseq) + " BYE";
    msg.headers.userAgent = m_userAgent;
    msg.headers.contentLength = "0";
    msg.headers.customHeaders["Max-Forwards"] = "70";

    return msg;
}

SIPMessage SIPClient::buildOptionsMessage() {
    SIPMessage msg;
    msg.method = SIPMethod::OPTIONS;
    msg.requestUri = "sip:" + m_registrationInfo.domain;
    msg.version = "SIP/2.0";

    msg.headers.via = "SIP/2.0/UDP " + m_localIPAddress + ":" + std::to_string(m_localPort) +
                     ";branch=" + generateBranchParameter();
    msg.headers.from = "<sip:" + m_registrationInfo.userId + "@" + m_registrationInfo.domain +
                      ">;tag=" + generateTransactionId();
    msg.headers.to = "<sip:" + m_registrationInfo.domain + ">";
    msg.headers.callId = generateCallId();
    msg.headers.cseq = std::to_string(getNextCseq()) + " OPTIONS";
    msg.headers.userAgent = m_userAgent;
    msg.headers.contentLength = "0";
    msg.headers.customHeaders["Max-Forwards"] = "70";

    return msg;
}

SIPMessage SIPClient::buildResponse(const SIPMessage& request, int statusCode,
                                   const std::string& reasonPhrase) {
    SIPMessage response;
    response.statusCode = statusCode;
    response.reasonPhrase = reasonPhrase.empty() ? "OK" : reasonPhrase;
    response.version = "SIP/2.0";

    response.headers.via = request.headers.via;
    response.headers.from = request.headers.from;
    response.headers.to = request.headers.to;
    response.headers.callId = request.headers.callId;
    response.headers.cseq = request.headers.cseq;
    response.headers.userAgent = m_userAgent;
    response.headers.contentLength = "0";

    if (statusCode == 200) {
        response.headers.contact = "<sip:" + m_registrationInfo.userId + "@" + m_localIPAddress +
                                  ":" + std::to_string(m_localPort) + ">";
    }

    return response;
}

// ============================================================================
// Authentication
// ============================================================================

std::string SIPClient::generateAuthorizationHeader(const std::string& method,
                                                  const std::string& uri,
                                                  const std::string& realm,
                                                  const std::string& nonce,
                                                  const std::string& opaque) {
    // Calculate HA1
    std::string ha1Input = m_registrationInfo.userId + ":" + realm + ":" +
                          m_registrationInfo.password;
    std::string ha1 = calculateMD5Digest(ha1Input);

    // Calculate HA2
    std::string ha2Input = method + ":" + uri;
    std::string ha2 = calculateMD5Digest(ha2Input);

    // Calculate response hash
    m_registrationInfo.nonceCount++;
    std::string ncValue = std::to_string(m_registrationInfo.nonceCount);
    ncValue = std::string(8 - ncValue.length(), '0') + ncValue; // Zero-pad to 8 digits

    std::string cnonce = generateTransactionId();

    std::string responseInput = ha1 + ":" + nonce + ":" + ncValue + ":" + cnonce +
                               ":auth:" + ha2;
    std::string response = calculateMD5Digest(responseInput);

    std::ostringstream authHeader;
    authHeader << "Digest username=\"" << m_registrationInfo.userId << "\","
              << "realm=\"" << realm << "\","
              << "nonce=\"" << nonce << "\","
              << "uri=\"" << uri << "\","
              << "response=\"" << response << "\","
              << "opaque=\"" << opaque << "\","
              << "algorithm=MD5,"
              << "nc=" << ncValue << ","
              << "cnonce=\"" << cnonce << "\"";

    return authHeader.str();
}

std::string SIPClient::calculateMD5Digest(const std::string& data) {
    return MD5::hash(data);
}

std::string SIPClient::calculateResponseHash(const std::string& method,
                                            const std::string& uri,
                                            const std::string& ha1,
                                            const std::string& nonce,
                                            const std::string& opaque) {
    std::string ha2Input = method + ":" + uri;
    std::string ha2 = calculateMD5Digest(ha2Input);

    std::string responseInput = ha1 + ":" + nonce + ":" + ha2;
    return calculateMD5Digest(responseInput);
}

// ============================================================================
// SDP Handling
// ============================================================================

std::string SIPClient::buildSDP(uint32_t audioPort) {
    SDPSession sdp;

    uint64_t now = getCurrentTimeMs();
    sdp.origin = "MMDVM-RoIP " + std::to_string(now) + " " + std::to_string(now) +
                " IN IP4 " + m_localIPAddress;
    sdp.sessionName = "MMDVM Radio over IP";
    sdp.connectionInfo = "IN IP4 " + m_localIPAddress;

    SDPMediaDescription audio;
    audio.type = SDPMediaType::AUDIO;
    audio.port = audioPort;
    audio.protocol = "RTP/AVP";
    audio.payloadTypes = {0}; // PCMU
    audio.attributes["rtpmap"] = "0 PCMU/8000";

    sdp.media.push_back(audio);

    return sdp.toString();
}

SDPSession SIPClient::parseSDP(const std::string& sdpData) {
    return SDPSession::fromString(sdpData);
}

// ============================================================================
// Utility Functions
// ============================================================================

std::string SIPClient::generateCallId() {
    uint64_t timestamp = getCurrentTimeMs();
    std::ostringstream oss;
    oss << timestamp << "@" << m_localIPAddress;
    return oss.str();
}

std::string SIPClient::generateBranchParameter() {
    static uint32_t counter = 0;
    std::ostringstream oss;
    oss << "z9hG4bK-" << getCurrentTimeMs() << "-" << (++counter);
    return oss.str();
}

std::string SIPClient::generateTransactionId() {
    static std::random_device rd;
    static std::mt19937 gen(rd());
    std::uniform_int_distribution<> dis(0, 15);

    std::ostringstream oss;
    for (int i = 0; i < 16; ++i) {
        oss << std::hex << dis(gen);
    }
    return oss.str();
}

uint32_t SIPClient::getNextCseq() {
    return m_cseqCounter++;
}

uint64_t SIPClient::getCurrentTimeMs() {
    return std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();
}

std::string SIPClient::formatSIPUri(const std::string& userId, const std::string& domain) {
    return "sip:" + userId + "@" + domain;
}

std::string SIPClient::extractDomain(const std::string& uri) {
    size_t atPos = uri.find('@');
    if (atPos != std::string::npos) {
        size_t endPos = uri.find(':', atPos);
        if (endPos == std::string::npos) {
            endPos = uri.find('>', atPos);
        }
        if (endPos == std::string::npos) {
            endPos = uri.length();
        }
        return uri.substr(atPos + 1, endPos - (atPos + 1));
    }
    return uri;
}

std::string SIPClient::extractUserId(const std::string& uri) {
    size_t startPos = uri.find("sip:");
    if (startPos == std::string::npos) startPos = 0;
    else startPos += 4;

    size_t atPos = uri.find('@', startPos);
    if (atPos != std::string::npos) {
        return uri.substr(startPos, atPos - startPos);
    }
    return "";
}

void SIPClient::parseNameAddr(const std::string& nameAddr, std::string& uri,
                             std::string& displayName) {
    size_t anglePos = nameAddr.find('<');
    if (anglePos != std::string::npos) {
        displayName = nameAddr.substr(0, anglePos);
        displayName = trimString(displayName);

        size_t endPos = nameAddr.find('>', anglePos);
        uri = nameAddr.substr(anglePos + 1, endPos - (anglePos + 1));
    } else {
        uri = nameAddr;
        displayName = "";
    }
}

std::vector<std::string> SIPClient::splitString(const std::string& str, char delimiter) {
    std::vector<std::string> tokens;
    std::string token;
    std::istringstream iss(str);

    while (std::getline(iss, token, delimiter)) {
        tokens.push_back(token);
    }

    return tokens;
}

std::string SIPClient::trimString(const std::string& str) {
    size_t start = str.find_first_not_of(" \t\r\n");
    size_t end = str.find_last_not_of(" \t\r\n");

    if (start == std::string::npos) return "";
    return str.substr(start, end - start + 1);
}

std::string SIPClient::toUpperCase(const std::string& str) {
    std::string result = str;
    std::transform(result.begin(), result.end(), result.begin(), ::toupper);
    return result;
}

std::string SIPClient::toLowerCase(const std::string& str) {
    std::string result = str;
    std::transform(result.begin(), result.end(), result.begin(), ::tolower);
    return result;
}

// ============================================================================
// State Management
// ============================================================================

void SIPClient::updateCallState(CallState newState) {
    m_currentCall.state = newState;

    if (m_callStateCallback) {
        m_callStateCallback(m_currentCall);
    }
}

void SIPClient::updateRegistrationState(RegistrationState newState) {
    m_registrationInfo.state = newState;

    if (m_regStateCallback) {
        m_regStateCallback(newState);
    }
}

void SIPClient::handleTimeout() {
    uint64_t currentTime = getCurrentTimeMs();

    // Check for call timeout
    if (m_currentCall.state == CallState::INVITING ||
        m_currentCall.state == CallState::RINGING) {
        if (currentTime - m_currentCall.startTime > 300000) { // 5 minutes
            updateCallState(CallState::FAILED);
            m_currentCall.callId = "";
        }
    }

    // Check for registration timeout
    if (m_registrationInfo.state == RegistrationState::REGISTERING) {
        if (currentTime - m_lastRegistrationAttempt > 32000) { // 32 seconds
            if (!m_pendingAuthChallenge) {
                updateRegistrationState(RegistrationState::REGISTRATION_FAILED);
            }
        }
    }
}

void SIPClient::cleanupExpiredTransactions() {
    uint64_t currentTime = getCurrentTimeMs();
    std::vector<std::string> expiredIds;

    for (auto& trans : m_transactions) {
        if (trans.second.isExpired(currentTime)) {
            expiredIds.push_back(trans.first);
        }
    }

    for (const auto& id : expiredIds) {
        m_transactions.erase(id);
    }
}

// ============================================================================
// Transaction Utilities
// ============================================================================

bool SIPTransaction::isExpired(uint64_t currentTime, uint32_t timeoutMs) const {
    return (currentTime - lastActivityTime) > timeoutMs;
}
