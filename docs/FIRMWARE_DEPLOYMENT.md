# ESP32 RoIP Firmware Deployment Guide

## Table of Contents
1. [Firmware Build Process](#firmware-build-process)
2. [OTA Update Procedures](#ota-update-procedures)
3. [Firmware Signing and Security](#firmware-signing-and-security)
4. [Rollback Procedures](#rollback-procedures)
5. [Fleet Management](#fleet-management)
6. [Version Tracking](#version-tracking)
7. [Testing and Validation](#testing-and-validation)

---

## Firmware Build Process

### Development Environment Setup

```bash
# Install PlatformIO
pip install platformio

# Clone repository
git clone https://github.com/yourorg/roip-firmware.git
cd roip-firmware

# Install dependencies
pio lib install

# Verify environment
pio run -t clean
pio run -e esp32-roip
```

### Building Firmware

```bash
# Build for ESP32
pio run -e esp32-roip

# Build for ESP32-S3
pio run -e esp32s3-roip

# Build for ESP32-C3
pio run -e esp32c3-roip

# Build with debugging symbols
pio run -e esp32-roip-debug

# Build for production (optimized, no debug)
PLATFORMIO_BUILD_FLAGS="-DNDEBUG -Os" pio run -e esp32-roip

# Build all environments
pio run

# Build and flash
pio run -e esp32-roip -t upload

# Build, flash, and monitor
pio run -e esp32-roip -t upload && pio device monitor
```

### Build Configuration

**platformio.ini**:
```ini
[env:esp32-roip]
platform = espressif32
board = esp32dev
framework = arduino

; Build flags
build_flags =
    -DCORE_DEBUG_LEVEL=3
    -DBOARD_HAS_PSRAM
    -DARDUINO_USB_CDC_ON_BOOT=1
    -DROIP_VERSION=\"${env:VERSION}\"
    -Os

; Libraries
lib_deps =
    espressif/esp-dsp@^1.4.2
    pschatzmann/ESP32-audioI2S@^0.9.6
    bblanchon/ArduinoJson@^6.21.3
    knolleary/PubSubClient@^2.8
    me-no-dev/AsyncTCP@^1.1.1
    me-no-dev/ESPAsyncWebServer@^1.2.3

; Upload settings
upload_speed = 921600
monitor_speed = 115200
monitor_filters = esp32_exception_decoder
```

### Firmware Versioning

**Version Format**: `MAJOR.MINOR.PATCH-BUILD`
- Example: `1.2.3-456`

**Version File** (`include/version.h`):
```cpp
#ifndef VERSION_H
#define VERSION_H

#define FIRMWARE_VERSION_MAJOR 1
#define FIRMWARE_VERSION_MINOR 2
#define FIRMWARE_VERSION_PATCH 3
#define FIRMWARE_BUILD_NUMBER 456

#define FIRMWARE_VERSION_STRING "1.2.3-456"
#define FIRMWARE_BUILD_DATE __DATE__
#define FIRMWARE_BUILD_TIME __TIME__

#endif // VERSION_H
```

### Automated Build Pipeline

**GitHub Actions** (`.github/workflows/build-firmware.yml`):
```yaml
name: Build Firmware

on:
  push:
    branches: [main, develop]
    tags: ['v*']
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.x'

      - name: Install PlatformIO
        run: |
          pip install platformio
          pio update

      - name: Build firmware
        run: |
          export VERSION=$(git describe --tags --always)
          pio run -e esp32-roip
          pio run -e esp32s3-roip
          pio run -e esp32c3-roip

      - name: Sign firmware
        run: |
          ./scripts/sign-firmware.sh .pio/build/esp32-roip/firmware.bin

      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: firmware
          path: |
            .pio/build/*/firmware.bin
            .pio/build/*/firmware.bin.signed

      - name: Create release
        if: startsWith(github.ref, 'refs/tags/')
        uses: softprops/action-gh-release@v1
        with:
          files: |
            .pio/build/*/firmware.bin
            .pio/build/*/firmware.bin.signed
```

---

## OTA Update Procedures

### OTA Update Architecture

```
┌──────────────┐       HTTPS        ┌──────────────┐
│  ESP32       │◄──────────────────►│  OTA Server  │
│  Device      │  1. Check version  │  (S3/HTTP)   │
└──────────────┘  2. Download       └──────────────┘
       │          3. Verify                │
       │          4. Flash                 │
       ▼                                   ▼
┌──────────────┐                    ┌──────────────┐
│  OTA1 Part   │                    │  Version DB  │
│  (Active)    │                    │  + Metadata  │
└──────────────┘                    └──────────────┘
       │
       ▼
┌──────────────┐
│  OTA0 Part   │
│  (Backup)    │
└──────────────┘
```

### OTA Server Setup

**Option 1: AWS S3**
```bash
# Create S3 bucket
aws s3 mb s3://roip-firmware

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket roip-firmware \
  --versioning-configuration Status=Enabled

# Upload firmware
aws s3 cp firmware.bin s3://roip-firmware/esp32/v1.2.3/firmware.bin \
  --acl public-read \
  --content-type application/octet-stream

# Create version manifest
cat > manifest.json <<EOF
{
  "version": "1.2.3-456",
  "build_date": "2025-11-22T14:35:00Z",
  "url": "https://roip-firmware.s3.amazonaws.com/esp32/v1.2.3/firmware.bin",
  "checksum": "sha256:abcdef123456...",
  "size": 1234567,
  "min_version": "1.0.0",
  "release_notes": "Bug fixes and performance improvements"
}
EOF

aws s3 cp manifest.json s3://roip-firmware/esp32/latest.json \
  --acl public-read \
  --content-type application/json
```

**Option 2: HTTP Server**
```nginx
# Nginx configuration for OTA server
server {
    listen 443 ssl http2;
    server_name ota.roip.example.com;

    ssl_certificate /etc/letsencrypt/live/ota.roip.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ota.roip.example.com/privkey.pem;

    root /var/www/ota;

    location /firmware/ {
        autoindex on;
        add_header Content-Type application/octet-stream;
        add_header X-Firmware-Version $arg_version;
    }

    location /manifest.json {
        add_header Content-Type application/json;
        add_header Cache-Control "no-cache, must-revalidate";
    }

    # Rate limiting to prevent abuse
    limit_req_zone $binary_remote_addr zone=ota:10m rate=1r/s;
    limit_req zone=ota burst=5;
}
```

### ESP32 OTA Client Code

```cpp
#include <Update.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

class OTAUpdater {
private:
    const char* otaServerUrl;
    const char* currentVersion;
    String manifestUrl;

public:
    OTAUpdater(const char* server, const char* version)
        : otaServerUrl(server), currentVersion(version) {
        manifestUrl = String(otaServerUrl) + "/manifest.json";
    }

    bool checkForUpdate() {
        HTTPClient http;
        http.begin(manifestUrl);
        int httpCode = http.GET();

        if (httpCode != HTTP_CODE_OK) {
            Serial.printf("Failed to fetch manifest: %d\n", httpCode);
            return false;
        }

        String payload = http.getString();
        http.end();

        DynamicJsonDocument doc(1024);
        deserializeJson(doc, payload);

        const char* latestVersion = doc["version"];
        const char* firmwareUrl = doc["url"];
        const char* checksum = doc["checksum"];
        size_t size = doc["size"];

        if (isNewerVersion(latestVersion, currentVersion)) {
            Serial.printf("Update available: %s -> %s\n", currentVersion, latestVersion);
            return performOTA(firmwareUrl, checksum, size);
        }

        Serial.println("Already on latest version");
        return false;
    }

    bool performOTA(const char* url, const char* checksum, size_t size) {
        HTTPClient http;
        http.begin(url);
        http.setTimeout(30000); // 30 second timeout

        int httpCode = http.GET();
        if (httpCode != HTTP_CODE_OK) {
            Serial.printf("Download failed: %d\n", httpCode);
            return false;
        }

        WiFiClient* stream = http.getStreamPtr();
        size_t totalRead = 0;

        if (!Update.begin(size)) {
            Serial.printf("OTA begin failed: %s\n", Update.errorString());
            return false;
        }

        // Write firmware to flash
        uint8_t buffer[1024];
        while (http.connected() && totalRead < size) {
            size_t available = stream->available();
            if (available) {
                int bytesRead = stream->readBytes(buffer,
                    min(available, sizeof(buffer)));
                Update.write(buffer, bytesRead);
                totalRead += bytesRead;

                // Progress indication
                if (totalRead % 10240 == 0) {
                    Serial.printf("Progress: %d%%\n",
                        (totalRead * 100) / size);
                }
            }
            delay(1);
        }

        if (Update.end(true)) {
            Serial.printf("OTA successful! Size: %d bytes\n", totalRead);
            Serial.println("Rebooting...");
            delay(1000);
            ESP.restart();
            return true;
        } else {
            Serial.printf("OTA failed: %s\n", Update.errorString());
            return false;
        }
    }

    bool isNewerVersion(const char* latest, const char* current) {
        // Simple version comparison (implement semantic versioning)
        int latestMajor, latestMinor, latestPatch;
        int currentMajor, currentMinor, currentPatch;

        sscanf(latest, "%d.%d.%d", &latestMajor, &latestMinor, &latestPatch);
        sscanf(current, "%d.%d.%d", &currentMajor, &currentMinor, &currentPatch);

        if (latestMajor > currentMajor) return true;
        if (latestMajor == currentMajor && latestMinor > currentMinor) return true;
        if (latestMajor == currentMajor && latestMinor == currentMinor &&
            latestPatch > currentPatch) return true;

        return false;
    }
};

// Usage in main code
void setup() {
    Serial.begin(115200);
    WiFi.begin(ssid, password);
    while (WiFi.status() != WL_CONNECTED) delay(500);

    OTAUpdater ota("https://ota.roip.example.com", FIRMWARE_VERSION_STRING);

    // Check for updates on boot
    ota.checkForUpdate();

    // Schedule periodic checks
    // (every 6 hours in production)
}
```

### OTA Update Strategies

#### 1. Manual Update (Individual Device)
```bash
# Via web interface
curl -X POST http://<device-ip>/api/ota/update \
  -H "Content-Type: application/json" \
  -d '{"version": "1.2.3"}'

# Via MQTT command
mosquitto_pub -h roip-server -t "roip/device/<device-id>/ota" \
  -m '{"action": "update", "version": "1.2.3"}'
```

#### 2. Staged Rollout
```python
# Python script for staged rollout
import requests
import time

def staged_rollout(version, stages=[0.1, 0.3, 0.5, 1.0]):
    devices = get_all_devices()
    total = len(devices)

    for stage_pct in stages:
        count = int(total * stage_pct)
        print(f"Updating {count} devices ({stage_pct*100}%)...")

        for device in devices[:count]:
            update_device(device, version)
            time.sleep(5)  # Rate limiting

        # Wait and check for issues
        print(f"Monitoring stage... waiting 30 minutes")
        time.sleep(1800)

        # Check error rate
        if check_error_rate() > 0.05:  # >5% error rate
            print("ERROR: High failure rate, stopping rollout")
            rollback_stage(devices[:count])
            return False

    print("Rollout completed successfully")
    return True
```

#### 3. A/B Testing
```cpp
// Enable A/B testing in firmware
#ifdef ENABLE_AB_TESTING
    if (deviceId % 2 == 0) {
        // Variant A
        useNewAudioPipeline();
    } else {
        // Variant B
        useStableAudioPipeline();
    }
#endif
```

---

## Firmware Signing and Security

### Generating Signing Keys

```bash
# Generate RSA key pair
openssl genrsa -out firmware_private.pem 2048
openssl rsa -in firmware_private.pem -pubout -out firmware_public.pem

# Store private key securely (never commit to git)
chmod 600 firmware_private.pem

# Embed public key in firmware
xxd -i firmware_public.pem > include/public_key.h
```

### Signing Firmware

```bash
#!/bin/bash
# scripts/sign-firmware.sh

FIRMWARE_FILE="$1"
PRIVATE_KEY="firmware_private.pem"
SIGNATURE_FILE="${FIRMWARE_FILE}.sig"

# Generate SHA256 hash
openssl dgst -sha256 -binary "${FIRMWARE_FILE}" > "${FIRMWARE_FILE}.hash"

# Sign the hash
openssl rsautl -sign -inkey "${PRIVATE_KEY}" \
  -in "${FIRMWARE_FILE}.hash" \
  -out "${SIGNATURE_FILE}"

# Create signed firmware bundle
cat "${FIRMWARE_FILE}" "${SIGNATURE_FILE}" > "${FIRMWARE_FILE}.signed"

echo "Firmware signed: ${FIRMWARE_FILE}.signed"
```

### Verification in ESP32

```cpp
#include "mbedtls/rsa.h"
#include "mbedtls/sha256.h"

bool verifyFirmwareSignature(const uint8_t* firmware, size_t firmwareSize,
                             const uint8_t* signature, size_t signatureSize) {
    // Calculate SHA256 hash of firmware
    uint8_t hash[32];
    mbedtls_sha256(firmware, firmwareSize, hash, 0);

    // Initialize RSA context
    mbedtls_rsa_context rsa;
    mbedtls_rsa_init(&rsa, MBEDTLS_RSA_PKCS_V15, 0);

    // Load public key
    if (mbedtls_rsa_import_raw(&rsa,
        public_key_modulus, public_key_modulus_len,
        NULL, 0, NULL, 0, NULL, 0,
        public_key_exponent, public_key_exponent_len) != 0) {
        return false;
    }

    // Verify signature
    int result = mbedtls_rsa_pkcs1_verify(&rsa, NULL, NULL,
        MBEDTLS_RSA_PUBLIC, MBEDTLS_MD_SHA256,
        32, hash, signature);

    mbedtls_rsa_free(&rsa);

    return (result == 0);
}
```

### Secure Boot (ESP32)

```bash
# Enable secure boot in platformio.ini
[env:esp32-roip-secure]
board_build.partitions = partitions-secure.csv
build_flags =
    -DCONFIG_SECURE_BOOT_ENABLED=1
    -DCONFIG_SECURE_BOOT_V2_ENABLED=1

# Generate secure boot keys
espsecure.py generate_signing_key secure_boot_signing_key.pem

# Sign bootloader
espsecure.py sign_data --keyfile secure_boot_signing_key.pem \
  -o bootloader-signed.bin bootloader.bin

# Flash with secure boot
esptool.py --port /dev/ttyUSB0 write_flash 0x1000 bootloader-signed.bin
```

---

## Rollback Procedures

### Automatic Rollback

```cpp
// Firmware rollback mechanism
#include <esp_ota_ops.h>

void setup() {
    // Check if this is first boot after OTA
    const esp_partition_t* running = esp_ota_get_running_partition();
    esp_ota_img_states_t ota_state;

    if (esp_ota_get_state_partition(running, &ota_state) == ESP_OK) {
        if (ota_state == ESP_OTA_IMG_PENDING_VERIFY) {
            // New firmware running, perform validation
            if (systemHealthCheck()) {
                // Mark as valid
                esp_ota_mark_app_valid_cancel_rollback();
                Serial.println("New firmware validated");
            } else {
                // Rollback to previous version
                Serial.println("Health check failed, rolling back...");
                esp_ota_mark_app_invalid_rollback_and_reboot();
            }
        }
    }
}

bool systemHealthCheck() {
    // Perform critical system checks
    bool wifiConnected = (WiFi.status() == WL_CONNECTED);
    bool serverReachable = pingServer();
    bool audioWorking = testAudioPipeline();

    return wifiConnected && serverReachable && audioWorking;
}
```

### Manual Rollback

```bash
# Via web interface
curl -X POST http://<device-ip>/api/ota/rollback

# Via serial console
# Connect to device
screen /dev/ttyUSB0 115200

# In ESP32 console
> ota rollback
Rollback initiated...
Rebooting...

# Via MQTT
mosquitto_pub -h roip-server -t "roip/device/<device-id>/ota" \
  -m '{"action": "rollback"}'
```

### Server-Side Rollback

```python
# Rollback all devices to previous version
import requests

def rollback_fleet(device_ids, target_version):
    for device_id in device_ids:
        device_info = get_device(device_id)
        if device_info['firmware_version'] != target_version:
            print(f"Rolling back {device_id} to {target_version}")
            trigger_ota_update(device_id, target_version)
            time.sleep(10)  # Rate limiting

def get_device(device_id):
    response = requests.get(f"http://roip-server:8080/api/v1/devices/{device_id}")
    return response.json()

def trigger_ota_update(device_id, version):
    payload = {"version": version, "force": True}
    response = requests.post(
        f"http://roip-server:8080/api/v1/devices/{device_id}/ota",
        json=payload
    )
    return response.status_code == 200
```

---

## Fleet Management

### Device Inventory

```sql
-- Database schema for device tracking
CREATE TABLE devices (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(64) UNIQUE NOT NULL,
    mac_address VARCHAR(17) UNIQUE,
    firmware_version VARCHAR(32),
    hardware_version VARCHAR(32),
    last_seen TIMESTAMP,
    last_update TIMESTAMP,
    update_status VARCHAR(32),  -- pending, in_progress, completed, failed
    location VARCHAR(255),
    notes TEXT
);

CREATE INDEX idx_devices_firmware ON devices(firmware_version);
CREATE INDEX idx_devices_update_status ON devices(update_status);
```

### Fleet Status Dashboard

```bash
# Get fleet statistics
curl http://roip-server:8080/api/v1/fleet/stats | jq '.'

{
  "total_devices": 150,
  "online_devices": 142,
  "firmware_versions": {
    "1.2.3": 120,
    "1.2.2": 20,
    "1.2.1": 2
  },
  "update_status": {
    "up_to_date": 120,
    "update_available": 30,
    "update_in_progress": 0,
    "update_failed": 0
  }
}

# Get devices needing updates
curl http://roip-server:8080/api/v1/fleet/outdated | jq '.'

# Trigger fleet-wide update
curl -X POST http://roip-server:8080/api/v1/fleet/update \
  -H "Content-Type: application/json" \
  -d '{
    "version": "1.2.3",
    "rollout_strategy": "staged",
    "stages": [0.1, 0.3, 0.5, 1.0]
  }'
```

### Update Monitoring

```bash
# Monitor update progress
watch -n 5 'curl -s http://roip-server:8080/api/v1/fleet/update/status | jq "."'

{
  "update_id": "update-123",
  "target_version": "1.2.3",
  "total_devices": 150,
  "completed": 75,
  "in_progress": 5,
  "failed": 2,
  "pending": 68,
  "success_rate": 97.4,
  "started_at": "2025-11-22T14:00:00Z",
  "estimated_completion": "2025-11-22T18:00:00Z"
}
```

---

## Version Tracking

### Firmware Manifest Database

```sql
CREATE TABLE firmware_releases (
    id SERIAL PRIMARY KEY,
    version VARCHAR(32) UNIQUE NOT NULL,
    build_number INTEGER NOT NULL,
    build_date TIMESTAMP NOT NULL,
    git_commit VARCHAR(40),
    release_type VARCHAR(16), -- stable, beta, alpha, dev
    url TEXT NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    size_bytes INTEGER NOT NULL,
    min_version VARCHAR(32),  -- Minimum version that can upgrade
    release_notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    deprecated BOOLEAN DEFAULT FALSE
);

CREATE TABLE device_firmware_history (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(64) NOT NULL,
    from_version VARCHAR(32),
    to_version VARCHAR(32) NOT NULL,
    update_started TIMESTAMP NOT NULL,
    update_completed TIMESTAMP,
    status VARCHAR(32),  -- success, failed, rolled_back
    error_message TEXT,
    FOREIGN KEY (device_id) REFERENCES devices(device_id)
);
```

### Release Management

```bash
# Create new firmware release
curl -X POST http://roip-server:8080/api/v1/firmware/releases \
  -H "Content-Type: application/json" \
  -d '{
    "version": "1.2.4",
    "build_number": 789,
    "release_type": "stable",
    "url": "https://ota.roip.example.com/firmware/v1.2.4/firmware.bin",
    "checksum": "sha256:abc123...",
    "size_bytes": 1234567,
    "min_version": "1.0.0",
    "release_notes": "- Fixed audio latency issue\n- Improved WiFi stability"
  }'

# Mark version as deprecated
curl -X PUT http://roip-server:8080/api/v1/firmware/releases/1.2.0/deprecate

# Get version compatibility
curl http://roip-server:8080/api/v1/firmware/compatibility?from=1.1.0&to=1.2.4
```

---

## Testing and Validation

### Pre-Release Testing Checklist

- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Build succeeds for all targets (ESP32, ESP32-S3, ESP32-C3)
- [ ] Code signing verification works
- [ ] OTA update works
- [ ] Rollback mechanism works
- [ ] Audio quality validation
- [ ] Network connectivity tests
- [ ] Memory leak testing (24h run)
- [ ] Power consumption testing
- [ ] Security scan (no vulnerabilities)

### Automated Testing

```bash
# PlatformIO test framework
pio test -e esp32-roip

# Example test
#include <unity.h>

void test_audio_pipeline() {
    AudioPipeline pipeline;
    TEST_ASSERT_TRUE(pipeline.initialize());
    TEST_ASSERT_EQUAL(24000, pipeline.getSampleRate());
}

void test_opus_codec() {
    OpusCodec codec;
    int16_t samples[480];
    uint8_t encoded[1024];
    size_t encodedSize = codec.encode(samples, 480, encoded, 1024);
    TEST_ASSERT_GREATER_THAN(0, encodedSize);
}

void setup() {
    UNITY_BEGIN();
    RUN_TEST(test_audio_pipeline);
    RUN_TEST(test_opus_codec);
    UNITY_END();
}

void loop() {}
```

### Beta Testing Program

1. **Recruit Beta Testers** (5-10 devices)
2. **Deploy Beta Firmware** (tagged as `beta`)
3. **Collect Metrics** (via telemetry)
4. **Gather Feedback** (via survey)
5. **Iterate** (fix issues)
6. **Promote to Stable** (after 1 week of testing)

---

## Emergency Procedures

### Mass Rollback

```python
# Emergency rollback script
#!/usr/bin/env python3
import requests

ROIP_SERVER = "http://roip-server:8080"
SAFE_VERSION = "1.2.2"  # Known good version

def emergency_rollback():
    # Get all devices on problematic version
    response = requests.get(f"{ROIP_SERVER}/api/v1/devices")
    devices = response.json()

    affected = [d for d in devices if d['firmware_version'] == "1.2.3"]

    print(f"Rolling back {len(affected)} devices to {SAFE_VERSION}")

    for device in affected:
        device_id = device['device_id']
        print(f"Rolling back {device_id}...")

        requests.post(
            f"{ROIP_SERVER}/api/v1/devices/{device_id}/ota",
            json={"version": SAFE_VERSION, "priority": "critical"}
        )

    print("Emergency rollback initiated")

if __name__ == "__main__":
    if input("Confirm emergency rollback (yes/no): ") == "yes":
        emergency_rollback()
```

### Factory Reset

```cpp
// Trigger via serial console or API
void factoryReset() {
    Serial.println("WARNING: Factory reset in 10 seconds...");
    delay(10000);

    // Erase NVS (settings)
    nvs_flash_erase();

    // Erase WiFi config
    WiFi.disconnect(true, true);

    // Clear OTA partitions
    const esp_partition_t* ota_0 = esp_partition_find_first(
        ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_APP_OTA_0, NULL);
    esp_partition_erase_range(ota_0, 0, ota_0->size);

    Serial.println("Factory reset complete. Rebooting...");
    delay(1000);
    ESP.restart();
}
```

---

**Document Version**: 1.0
**Last Updated**: 2025-11-22
**Next Review**: 2026-02-22
**Owner**: Firmware Team
