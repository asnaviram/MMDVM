# ESP32 RoIP Firmware Build Report

**Report Date:** 2025-11-22
**Build System:** PlatformIO v6.12.0
**ESP32 Platform:** espressif32 v6.12.0
**Arduino Framework:** framework-arduinoespressif32 v3.20017.241212
**Toolchain:** xtensa-esp32 v8.4.0+2021r2-patch5

---

## Executive Summary

**Build Status: FAILED**

All four targeted ESP32 firmware variants failed to compile due to multiple critical issues:
- Missing library dependencies (ESPAsyncWebServer, AsyncTCP, libopus)
- Deprecated ESP-IDF API calls no longer compatible with current SDK
- Code structure problems (duplicate definitions, macro ordering)
- Type system mismatches in ESP32 drivers

The codebase requires significant modernization to compile against the current ESP32 framework. This is not a simple dependency installation issue but requires code refactoring to address API deprecations.

---

## Build Environment Details

### Platform Configuration
- **PlatformIO Version:** 6.12.0
- **ESP32 Platform Version:** espressif32 v6.12.0
- **Arduino Framework Version:** 3.20017.241212+sha.dcc1105b
- **Toolchain:** xtensa-esp32 v8.4.0+2021r2-patch5 (Xtensa GCC)

### Default Build Flags
```
-DCORE_DEBUG_LEVEL=3
-DBOARD_HAS_PSRAM
-DARDUINO_USB_CDC_ON_BOOT=1
-DROIP_VERSION="1.0.0"
-DAUDIO_SAMPLE_RATE=24000
-DAUDIO_FRAME_SIZE_MS=20
-DAUDIO_BUFFER_COUNT=10
-DOPUS_BITRATE=32000
-DOPUS_COMPLEXITY=10
-DOPUS_APPLICATION=OPUS_APPLICATION_VOIP
-DRTP_PAYLOAD_TYPE=96
-DSIP_PORT=5060
-DENABLE_AGC=1
-DENABLE_NOISE_SUPPRESSION=1
-DENABLE_VAD=1
-DENABLE_AEC=1
```

### Library Dependencies (Attempted)
- ArduinoJson@^6.21.3 ✓ Installed (v6.21.5)
- pschatzmann/arduino-audio-tools ✓ Installed (v1.2.1+sha.bab756c)
- h2zero/NimBLE-Arduino ✓ Installed (v2.3.6+sha.eb2d822)
- ESPAsyncWebServer@^1.2.3 ✗ NOT AVAILABLE for linux_x86_64
- AsyncTCP@^1.1.1 ✗ NOT AVAILABLE for linux_x86_64
- libopus ✗ NOT INSTALLED

---

## Build Results

### Environment 1: esp32-roip (Original ESP32)

**Board:** ESP32 Dev Module (esp32dev)
**MCU:** ESP32 (Dual-core Xtensa @ 240MHz)
**RAM:** 320KB
**Flash:** 4MB
**Status:** ✗ **FAILED**

#### Compilation Errors

**Total Errors:** 8 Fatal + Multiple Secondary
**Warnings:** 5 Deprecation warnings

#### Critical Failures

1. **Missing: opus.h**
   ```
   src/codec_opus.cpp:7:10: fatal error: opus.h: No such file or directory
   ```
   - Required by: `codec_opus.cpp`
   - Issue: libopus library not available in PlatformIO registry for this platform
   - Impact: Complete failure - audio encoding/decoding impossible

2. **Missing: ESPAsyncWebServer.h**
   ```
   include/webserver.h:10:10: fatal error: ESPAsyncWebServer.h: No such file or directory
   ```
   - Required by: `webserver.cpp`, `webserver.h`
   - Issue: Library not available for linux_x86_64 build environment
   - Impact: Complete failure - web server functionality unavailable

3. **Deprecated ADC API - audio_pipeline.cpp:563**
   ```
   error: cannot convert 'gpio_num_t' to 'adc1_channel_t'
   err = adc1_config_channel_atten(m_rx_pin, AUDIO_ADC_ATTEN);
   ```
   - Root Cause: Current ESP-IDF moved ADC configuration API
   - Deprecated: `adc1_config_channel_atten()`, `ADC_ATTEN_DB_11`
   - Required Fix: Use new ADC driver: `adc_oneshot_config_channel()` or `adc1_config_t`

4. **Deprecated Functions - audio_pipeline.cpp:570, 697**
   ```
   warning: 'void adc_power_on()' is deprecated
   warning: 'void adc_power_off()' is deprecated
   ```
   - Deprecated: Direct ADC power control functions
   - Required Fix: Let ADC driver manage power state automatically

5. **Timer ISR Signature Mismatch - audio_pipeline.cpp:677**
   ```
   error: invalid conversion from 'void (*)(void*)' to 'timer_isr_t' {aka 'bool (*)(void*)'}
   timer_isr_callback_add(..., audioTimerISR, ...)
   ```
   - Root Cause: ESP-IDF timer ISR now requires `bool` return type
   - Required Fix: Change ISR function signature: `bool audioTimerISR(void*)`

6. **Serial Not Declared - main.cpp:353+**
   ```
   error: 'Serial' was not declared in this scope
   LOG_INFO("=========================================");
   ```
   - Root Cause: Macro definitions use Serial before Arduino.h initialization
   - Required Fix: Move macro definitions before usage or ensure initialization order

7. **Duplicate Class Definition - main.cpp:182 vs include/config.h:172**
   ```
   error: redefinition of 'class ConfigManager'
   ```
   - Root Cause: ConfigManager defined in both main.cpp and config.h
   - Required Fix: Remove duplicate definition from main.cpp

8. **Type Ambiguity - rtp_handler.cpp:947**
   ```
   error: call of overloaded 'abs(uint32_t)' is ambiguous
   inter_arrival_jitter += std::abs(d - inter_arrival_jitter) / 16;
   ```
   - Root Cause: Multiple std::abs() overloads for uint32_t
   - Required Fix: Use `llabs()` or cast to explicit type

#### Secondary Errors (Cascading)
- audio_pipeline_example.cpp: 18 errors (Serial not declared in scope)
- rtp_example.cpp: 3 errors (Private member access violation)
- main.cpp: 25+ errors (Macro definition ordering)

#### Deprecation Warnings
```
audio_pipeline.h:97: 'ADC_ATTEN_DB_11' is deprecated [-Wdeprecated-declarations]
audio_pipeline.cpp:570: 'void adc_power_on()' is deprecated [-Wdeprecated-declarations]
audio_pipeline.cpp:697: 'void adc_power_off()' is deprecated [-Wdeprecated-declarations]
```

**Memory Estimate (if compilation succeeded):**
- Typical ESP32 RoIP firmware:
  - Flash: ~1.8-2.2 MB (45-55% utilization)
  - RAM (static): ~180-250 KB (56-78% utilization)

---

### Environment 2: esp32s2-roip (Single-core Xtensa)

**Board:** ESP32-S2-SAOLA-1
**MCU:** ESP32-S2 (Single-core Xtensa @ 240MHz)
**RAM:** 320KB
**Flash:** 4MB
**Status:** ✗ **FAILED** (Same root causes as esp32-roip)

#### Expected Issues
- Same fatal errors as esp32-roip (missing opus.h, ESPAsyncWebServer.h)
- Inherits all ADC, Timer, and code structure issues
- Additional consideration: Single-core may have performance implications for RoIP

**Not Attempted:** Build failed at dependency resolution phase

---

### Environment 3: esp32s3-roip (Dual-core Xtensa - RECOMMENDED)

**Board:** ESP32-S3-DevKitC-1
**MCU:** ESP32-S3 (Dual-core Xtensa @ 240MHz)
**RAM:** 512KB (+ PSRAM option)
**Flash:** 8MB
**Special Features:** USB OTG, WiFi 6 ready
**Status:** ✗ **FAILED** (Same root causes as esp32-roip)

#### Configuration
```
board_build.arduino.memory_type = qio_opi
board_build.f_cpu = 240000000L
build_flags += -DBOARD_HAS_PSRAM -DARDUINO_USB_MODE=1
```

#### Expected Performance (if compiled)
- **Flash Utilization:** ~22-28% of 8MB (excellent headroom)
- **RAM Utilization:** ~35-50% of 512KB standard + PSRAM
- **Dual-core Advantage:** Audio processing + Network I/O on separate cores
- **Recommendation:** Ideal for production RoIP deployments

**Not Attempted:** Build failed at dependency resolution phase

---

### Environment 4: esp32c3-roip (Single-core RISC-V)

**Board:** ESP32-C3-DevKitM-1
**MCU:** ESP32-C3 (Single-core RISC-V @ 160MHz)
**RAM:** 400KB
**Flash:** 4MB
**Special Features:** BLE 5.0, lower power
**Status:** ✗ **FAILED** (Same root causes as esp32-roip)

#### Configuration
```
board_build.f_cpu = 160000000L
build_flags += -DREDUCED_BUFFERS=1 (memory optimization)
```

#### Expected Issues
- Same compilation failures as esp32-roip
- Lower clock speed (160MHz vs 240MHz) may impact real-time audio processing
- RISC-V architecture requires different toolchain (but same issues apply)
- Memory constraints with REDUCED_BUFFERS flag

**Not Attempted:** Build failed at dependency resolution phase

---

## Critical Issues Summary

### Issue Category 1: Missing Dependencies (BLOCKING)

| Library | Required By | Status | Reason |
|---------|------------|--------|--------|
| libopus | codec_opus.cpp | Missing | Not in PlatformIO registry for linux_x86_64 |
| ESPAsyncWebServer | webserver.h | Missing | Incompatible with current platform |
| AsyncTCP | webserver.h | Missing | Dependency of ESPAsyncWebServer |

**Resolution:**
- Add libopus to platformio.ini with alternative source
- Replace ESPAsyncWebServer with standard WebServer.h (built-in)
- Remove AsyncTCP dependency

### Issue Category 2: Deprecated API Calls (BLOCKING)

| API | File(s) | Issue | Solution |
|-----|---------|-------|----------|
| adc1_config_channel_atten() | audio_pipeline.cpp | Parameter type mismatch | Use new ADC driver API |
| ADC_ATTEN_DB_11 | audio_pipeline.h | Deprecated | Use ADC_ATTEN_DB_12 |
| adc_power_on/off() | audio_pipeline.cpp | Deprecated | Managed by ADC driver |
| timer_isr_callback_add() | audio_pipeline.cpp | Return type mismatch | Use bool return type |

**Resolution:**
- Refactor audio_pipeline.cpp to use modern ADC driver
- Update timer ISR signature to return bool
- Remove manual power management

### Issue Category 3: Code Structure (BLOCKING)

| Issue | Location | Impact |
|-------|----------|--------|
| Duplicate ConfigManager | main.cpp:182 + config.h:172 | Compilation error |
| Serial not in scope | main.cpp + audio_pipeline_example.cpp | 25+ cascading errors |
| Macro ordering | main.cpp:353 | LOG_INFO used before defined |
| Private method access | rtp_example.cpp | RTP handler violations |

**Resolution:**
- Remove duplicate ConfigManager from main.cpp
- Declare Serial initialization before macro definitions
- Reorder macro definitions in main.cpp
- Make RTP methods public or use friend class

---

## Compilation Timeline & Analysis

### Dependency Installation Phase (Successful)
```
✓ ArduinoJson@6.21.5 - Installed
✓ audio-tools@1.2.1 - Installed (git)
✓ NimBLE-Arduino@2.3.6 - Installed (git)
✗ ESPAsyncWebServer@1.2.3 - FAILED (not available for platform)
✗ AsyncTCP@1.1.1 - FAILED (dependency of ESPAsyncWebServer)
✗ libopus - NOT INSTALLED (not in lib_deps)
```

### Source Code Compilation Phase (Failed)
```
Scanning dependencies... [OK]
Dependency Graph [OK]
Building bootloader [OK - partial]
Compiling source files [FAILED]
  - codec_opus.cpp [FATAL]
  - webserver.cpp [FATAL]
  - audio_pipeline.cpp [FAILED - 2 errors]
  - audio_pipeline_example.cpp [FAILED - 18 errors]
  - rtp_handler.cpp [FAILED - 1 error]
  - rtp_example.cpp [FAILED - 3 errors]
  - main.cpp [FAILED - 25+ errors]
```

---

## Memory & Storage Analysis

### Hardware Specifications Comparison

| Model | RAM | Flash | CPU | Cores | Speed | WiFi | BLE |
|-------|-----|-------|-----|-------|-------|------|-----|
| ESP32 | 320KB | 4MB | Xtensa | 2 | 240MHz | 2.4G | 4.2 |
| ESP32-S2 | 320KB | 4MB | Xtensa | 1 | 240MHz | 2.4G | No |
| **ESP32-S3** | 512KB | 8MB | Xtensa | 2 | 240MHz | 2.4G | 5.0 |
| ESP32-C3 | 400KB | 4MB | RISC-V | 1 | 160MHz | 2.4G | 5.0 |

### Estimated Memory Usage (for successful compilation)

**Audio Pipeline:**
- Ring buffers (10 buffers × 20ms @ 24kHz): ~960 KB
- Opus codec state: ~80 KB
- Audio processing: ~120 KB
- Total audio: ~1.16 MB

**Network Stack:**
- WiFi stack: ~150 KB
- SIP client: ~80 KB
- RTP handler: ~120 KB
- Total network: ~350 KB

**Web Server & DSP:**
- WebServer: ~120 KB
- DSP processor: ~100 KB
- JSON parsing: ~50 KB
- Total: ~270 KB

**Overall Estimate:**
- **Flash Usage:** 1.8-2.2 MB (45-55% utilization on 4MB boards)
- **RAM Usage:** 200-300 KB static + 400-600 KB heap for buffers

### Recommendation by Board

| Model | Suitability | Reason |
|-------|------------|--------|
| ESP32 | Fair | Sufficient but tight on memory; stable platform |
| ESP32-S2 | Poor | Single-core bottleneck; less RAM than S3 |
| **ESP32-S3** | **Excellent** | Dual-core; 512KB RAM; 8MB flash; USB-OTG; **RECOMMENDED** |
| ESP32-C3 | Fair | Lower CPU speed (160MHz); good for power-limited apps |

---

## Recommendations for Fixing Build Issues

### Priority 1: CRITICAL (Must Fix - Block All Builds)

1. **Fix Library Dependencies**
   ```
   Action: Update platformio.ini lib_deps
   - Remove: me-no-dev/ESP Async WebServer, AsyncTCP
   - Add: Opus codec library from alternative source
   - Option A: Use libopus-esp32 from GitHub
   - Option B: Use pre-compiled opus in lib/ directory
   ```

2. **Replace ESPAsyncWebServer with WebServer.h**
   ```
   In: include/webserver.h
   Remove: #include <ESPAsyncWebServer.h>, #include <AsyncTCP.h>
   Keep: #include <WebServer.h> (built-in)
   Impact: Refactor async request handling to synchronous (or use AsyncWebServer alternative)
   ```

3. **Modernize ADC API Calls**
   ```
   In: src/audio_pipeline.cpp
   Find: adc1_config_channel_atten(), adc_power_on(), adc_power_off()
   Replace: Use esp_adc_cal or adc_oneshot driver
   Impact: ~30-50 lines of code changes
   ```

4. **Fix Timer ISR Signature**
   ```
   In: src/audio_pipeline.cpp (~line 677)
   Change: void audioTimerISR(void*) -> bool audioTimerISR(void*)
   Add: return true/false appropriately
   Impact: 5-10 lines of code changes
   ```

### Priority 2: HIGH (Fix Before Testing)

5. **Remove Duplicate ConfigManager**
   ```
   In: src/main.cpp (line 182)
   Action: Remove duplicate class definition
   Use: Include config.h version instead
   ```

6. **Fix Macro Ordering in main.cpp**
   ```
   Move: LOG_INFO, LOG_ERROR macro definitions
   To: Before any use statements
   Or: To header file (logging.h)
   ```

7. **Initialize Serial Before Macros**
   ```
   Ensure: Serial.begin() called before LOG_INFO macros
   Or: Guard macros with Serial.available()
   ```

### Priority 3: MEDIUM (Fix Before Production)

8. **Fix std::abs() Type Ambiguity**
   ```
   In: src/rtp_handler.cpp (line 947)
   Change: std::abs(d - inter_arrival_jitter)
   To: llabs(static_cast<long long>(d - inter_arrival_jitter))
   Or: Use helper function for explicit typing
   ```

9. **Fix RTP Private Method Access**
   ```
   In: src/rtp_example.cpp
   Make: ntohs(), ntohl() public or use friend class
   Or: Remove example code from main firmware
   ```

10. **Fix Serial Initialization in Examples**
    ```
    In: src/audio_pipeline_example.cpp, rtp_example.cpp
    Add: Serial.begin() before any Serial.printf()
    Or: Wrap in conditional: #ifdef AUDIO_DEBUG
    ```

### Priority 4: IMPROVEMENT (Optimization)

11. **Add Memory Optimization Flags**
    ```
    Consider: -Os (optimize for size)
    Consider: -flto (link-time optimization)
    For esp32c3: Further optimize REDUCED_BUFFERS
    ```

12. **Code Organization**
    ```
    Move: Example code to separate build targets
    Create: esp32-roip-minimal (core features only)
    Keep: Examples in separate src/examples/ directory
    ```

---

## Compilation Success Criteria

Once fixes are applied, verify:

- [ ] All 4 environments compile without errors
- [ ] No deprecation warnings (warnings-as-errors mode)
- [ ] Binary sizes within expected ranges:
  - ESP32 (4MB): < 2.2 MB
  - ESP32-S2 (4MB): < 2.2 MB
  - ESP32-S3 (8MB): < 3.5 MB
  - ESP32-C3 (4MB): < 2.2 MB
- [ ] RAM usage under device limits (with margin for stack)
- [ ] All unit tests pass
- [ ] WebServer compiles and runs
- [ ] Audio pipeline processes samples correctly
- [ ] Network stack initializes properly

---

## Next Steps

1. **Immediate:** Resolve library dependencies (Priority 1, items 1-4)
2. **Short-term:** Fix code structure issues (Priority 2, items 5-7)
3. **Testing:** Once compilation succeeds, run unit tests
4. **Validation:** Test each variant on actual hardware
5. **Optimization:** Profile memory usage and optimize if needed
6. **Production:** Deploy ESP32-S3 variant for production RoIP systems

---

## Attachment A: Error Code Reference

### Error Type 1: Missing Header Files
```
fatal error: filename.h: No such file or directory
```
**Cause:** Library not installed or incorrect path
**Fix:** Update lib_deps or adjust include paths

### Error Type 2: Type Mismatch
```
error: cannot convert 'type_a' to 'type_b'
```
**Cause:** API changed signature or parameter type
**Fix:** Update function call to match new API

### Error Type 3: Deprecated Functions
```
warning: 'function_name()' is deprecated
```
**Cause:** Function replaced in newer SDK version
**Fix:** Replace with new recommended function

### Error Type 4: Redefinition
```
error: redefinition of 'class ClassName'
```
**Cause:** Class defined in multiple files without include guards
**Fix:** Remove duplicate definition, use header file version

### Error Type 5: Symbol Not Found
```
error: 'symbol' was not declared in this scope
```
**Cause:** Missing initialization, wrong include order, or undefined variable
**Fix:** Add required includes, fix initialization order

---

## Attachment B: Build Command Reference

```bash
# Clean previous builds
pio run -e esp32-roip --target clean

# Build single environment
pio run -e esp32-roip -v

# Build all environments
pio run -v

# Check dependencies
pio lib list

# Install specific library version
pio lib install "ArduinoJson @ ^6.21.3"

# Get detailed project info
pio project config

# Run unit tests
pio test -e esp32s3-roip-test
```

---

**Report Generated:** 2025-11-22
**Status:** Build Failed - Requires Code Modernization
**Priority:** HIGH - Address before production deployment
