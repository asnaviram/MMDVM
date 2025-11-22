# Detailed Compilation Issues Reference

## Issue Tracker

This document provides specific file locations and detailed analysis of each compilation error found during the build verification process.

---

## CRITICAL ISSUES (Block All Builds)

### Issue #1: Missing libopus Library

**Files Affected:**
- `src/codec_opus.cpp:7`

**Error Message:**
```
fatal error: opus.h: No such file or directory
 #include <opus.h>
          ^~~~~~~
```

**Root Cause:**
The Opus audio codec library is not installed in PlatformIO package manager for the linux_x86_64 build environment.

**Impact:**
- Audio encoding/decoding is completely non-functional
- RoIP cannot process voice traffic
- Firmware cannot initialize

**Resolution Options:**

Option A: Add pre-compiled Opus library
```ini
; In platformio.ini
lib_deps =
    https://github.com/espressif/esp-idf/tree/master/components/opus
```

Option B: Use Arduino-compatible Opus wrapper
```ini
lib_deps =
    https://github.com/pschatzmann/Arduino-Opus
```

Option C: Provide pre-built binaries in lib/ directory
```
lib/opus/
  - opus.a (compiled library)
  - opus.h (header)
```

**Complexity:** MEDIUM (1-2 hours research + integration)

---

### Issue #2: Missing ESPAsyncWebServer Library

**Files Affected:**
- `include/webserver.h:10`
- `src/webserver.cpp:6`

**Error Message:**
```
fatal error: ESPAsyncWebServer.h: No such file or directory
 #include <ESPAsyncWebServer.h>
          ^~~~~~~~~~~~~~~~~~~~~

Looking for ESPAsyncWebServer.h dependency? Check our library registry!
CLI  > platformio lib search "header:ESPAsyncWebServer.h"
Web  > https://registry.platformio.org/search?q=header:ESPAsyncWebServer.h
```

**Root Cause:**
ESPAsyncWebServer library is not available for the linux_x86_64 build platform. This library is designed for embedded systems but the PlatformIO package manager cannot install it on x86 build machines.

**Dependency Chain:**
```
webserver.h
  -> ESPAsyncWebServer.h (PRIMARY MISSING)
  -> AsyncTCP.h (SECONDARY MISSING)
webserver.cpp
  -> ESPAsyncWebServer.h (PRIMARY MISSING)
```

**Impact:**
- Web server API broken
- REST API endpoints unavailable
- Configuration interface unavailable
- OTA updates unavailable

**Files in webserver.h Using These Libraries:**
```cpp
#include <ESPAsyncWebServer.h>  // Line 10
#include <AsyncTCP.h>           // Line 12

class WebServerManager {
    AsyncWebServer server(WEB_SERVER_PORT);
    // WebSocket handlers
    // Async request processing
};
```

**Resolution Options:**

Option A: Replace with built-in WebServer.h
```cpp
// Replace in include/webserver.h
#include <WebServer.h>  // Built-in, no dependencies

// Refactor WebServerManager to use synchronous API
class WebServerManager {
    WebServer server(WEB_SERVER_PORT);
    // Convert async handlers to synchronous
};
```

Option B: Use alternative async library
```ini
lib_deps =
    https://github.com/me-no-dev/ESPAsyncWebServer#master
```
(Requires checking if available for platform)

Option C: Provide pre-built async library
```
Create custom wrapper around WebServer.h
```

**Files Requiring Changes:**
- `include/webserver.h` - Remove async includes, refactor class
- `src/webserver.cpp` - Rewrite request handlers
- `platformio.ini` - Update lib_deps

**Complexity:** HIGH (3-5 hours refactoring)

---

### Issue #3: Missing AsyncTCP Library (Cascading from ESPAsyncWebServer)

**Dependency:**
This is a dependency of ESPAsyncWebServer, but manifests separately if the build continues.

**Files Affected:**
- `include/webserver.h:12` (indirectly)

**Error Message:**
```
UnknownPackageError: Could not find the package with 'me-no-dev/AsyncTCP @ ^1.1.1'
requirements for your system 'linux_x86_64'
```

**Resolution:**
Addressed by resolving Issue #2 (ESPAsyncWebServer replacement)

---

## MAJOR ISSUES (Prevent Compilation)

### Issue #4: ADC API Type Mismatch

**Files Affected:**
- `src/audio_pipeline.cpp:563`

**Error Message:**
```
error: cannot convert 'gpio_num_t' to 'adc1_channel_t'
   err = adc1_config_channel_atten(m_rx_pin, AUDIO_ADC_ATTEN);
                                   ^~~~~~~~
/root/.platformio/packages/framework-arduinoespressif32/tools/sdk/esp32/include/driver/include/driver/adc.h:209:52: note:   initializing argument 1 of 'esp_err_t adc1_config_channel_atten(adc1_channel_t, adc_atten_t)'
 esp_err_t adc1_config_channel_atten(adc1_channel_t channel, adc_atten_t atten);
                                     ~~~~~~~~~~~~~~~^~~~~~~
```

**Root Cause:**
The ADC API changed in newer ESP-IDF versions. The old function expects an `adc1_channel_t` (which is an enum of ADC1 channels like ADC1_CHANNEL_0, ADC1_CHANNEL_1, etc.), but the code is passing a GPIO pin number (`gpio_num_t`).

**Current Code:**
```cpp
// In audio_pipeline.h (line 97)
#define AUDIO_ADC_PIN           GPIO_NUM_32     // GPIO pin number
#define AUDIO_ADC_ATTEN         ADC_ATTEN_DB_11

// In audio_pipeline.cpp (line 563)
audio_error_t AudioPipeline::initADC() {
    int m_rx_pin = AUDIO_ADC_PIN;  // gpio_num_t
    adc_atten_t atten = AUDIO_ADC_ATTEN;
    
    // WRONG: Expects adc1_channel_t, got gpio_num_t
    err = adc1_config_channel_atten(m_rx_pin, AUDIO_ADC_ATTEN);
```

**Solution:**

Step 1: Map GPIO to ADC channel
```cpp
// GPIO 32 is ADC1_CHANNEL_4
adc1_channel_t channel = ADC1_CHANNEL_4;
err = adc1_config_channel_atten(channel, AUDIO_ADC_ATTEN);
```

Step 2 (Better): Use modern ADC driver
```cpp
// New approach using adc_oneshot driver
adc_oneshot_unit_init_cfg_t init_config = {
    .unit_id = ADC_UNIT_1,
};
adc_oneshot_new_unit(&init_config, &adc_handle);

adc_oneshot_chan_cfg_t config = {
    .bitwidth = ADC_BITWIDTH_12,
    .atten = ADC_ATTEN_DB_11,
};
adc_oneshot_config_channel(adc_handle, ADC_CHANNEL_4, &config);
```

**Files to Update:**
- `src/audio_pipeline.cpp` - lines 560-575 (initADC function)
- `src/audio_pipeline.h` - lines 90-100 (ADC pin/channel definitions)

**Complexity:** MEDIUM (2-3 hours)

---

### Issue #5: Deprecated ADC_ATTEN_DB_11 Flag

**Files Affected:**
- `src/audio_pipeline.h:97`
- `src/audio_pipeline.cpp:563`

**Warning Message:**
```
warning: 'ADC_ATTEN_DB_11' is deprecated [-Wdeprecated-declarations]
 #define AUDIO_ADC_ATTEN            ADC_ATTEN_DB_11
                                    ^~~~~~~~~~~~~~~
In file included from src/audio_pipeline.cpp:16:
src/audio_pipeline.h:97:36: warning: 'ADC_ATTEN_DB_11' is deprecated [-Wdeprecated-declarations]

/root/.platformio/packages/framework-arduinoespressif32/tools/sdk/esp32/include/hal/include/hal/adc_types.h:54:5: note: declared here
     ADC_ATTEN_DB_11 __attribute__((deprecated)) = ADC_ATTEN_DB_12,
     ^~~~~~~~~~~~~~~
     This is deprecated, it behaves the same as `ADC_ATTEN_DB_12`
```

**Root Cause:**
ESP-IDF deprecated `ADC_ATTEN_DB_11` as it was ambiguous. The replacement is `ADC_ATTEN_DB_12` which has the exact same behavior.

**Current Code:**
```cpp
#define AUDIO_ADC_ATTEN  ADC_ATTEN_DB_11  // Deprecated
```

**Fix:**
```cpp
#define AUDIO_ADC_ATTEN  ADC_ATTEN_DB_12  // Recommended (same behavior)
```

**Complexity:** TRIVIAL (< 5 minutes)

---

### Issue #6: Deprecated ADC Power Functions

**Files Affected:**
- `src/audio_pipeline.cpp:570` (adc_power_on)
- `src/audio_pipeline.cpp:697` (adc_power_off)

**Warning Message:**
```
warning: 'void adc_power_on()' is deprecated [-Wdeprecated-declarations]
   adc_power_on();
                ^
In file included from src/audio_pipeline.h:26:
/root/.platformio/packages/framework-arduinoespressif32/tools/sdk/esp32/include/driver/include/driver/adc.h:125:6: note: declared here
 void adc_power_on(void) __attribute__((deprecated));
      ^~~~~~~~~~~~

warning: 'void adc_power_off()' is deprecated [-Wdeprecated-declarations]
   adc_power_off();
```

**Root Cause:**
Modern ADC drivers manage power state automatically. Manual power control is no longer needed or recommended.

**Current Code:**
```cpp
// In audio_pipeline.cpp
adc_power_on();   // Line 570 - deprecated
adc_power_off();  // Line 697 - deprecated
```

**Fix:**
Simply remove these calls. The ADC driver manages power automatically.

```cpp
// Remove adc_power_on() and adc_power_off() calls
// ADC power is managed by adc_oneshot driver
```

**Complexity:** TRIVIAL (< 5 minutes)

---

### Issue #7: Timer ISR Signature Mismatch

**Files Affected:**
- `src/audio_pipeline.cpp:677`
- `src/audio_pipeline.h` (audioTimerISR function definition)

**Error Message:**
```
error: invalid conversion from 'void (*)(void*)' to 'timer_isr_t' {aka 'bool (*)(void*)'}
                                 audioTimerISR, (void*)this, 0);
                                 ^~~~~~~~~~~~~
In file included from src/audio_pipeline.h:27:
/root/.platformio/packages/framework-arduinoespressif32/tools/sdk/esp32/include/driver/include/driver/timer.h:211:94: note:   initializing argument 3 of 'esp_err_t timer_isr_callback_add(timer_group_t, timer_idx_t, timer_isr_t, void*, int)'
 esp_err_t timer_isr_callback_add(timer_group_t group_num, timer_idx_t timer_num, timer_isr_t isr_handler, void *arg, int intr_alloc_flags);
                                                                                  ~~~~~~~~~~~~^~~~~~~~~~~
```

**Root Cause:**
The ESP-IDF timer ISR callback changed to require a `bool` return type. The old code uses `void` return type.

**Current Code:**
```cpp
// In audio_pipeline.h
void audioTimerISR(void* arg);  // WRONG - returns void

// In audio_pipeline.cpp (line 677)
timer_isr_callback_add(TIMER_GROUP_0, TIMER_0, audioTimerISR, (void*)this, 0);
```

**ESP-IDF Expectation:**
```cpp
// Timer ISR handler
typedef bool (*timer_isr_t)(void *arg);

// Function signature must be:
bool audioTimerISR(void* arg);  // Must return bool
```

**Fix:**
```cpp
// In audio_pipeline.h
bool audioTimerISR(void* arg);  // Change return type

// In audio_pipeline.cpp
bool AudioPipeline::audioTimerISR(void* arg) {
    AudioPipeline* pipeline = (AudioPipeline*)arg;
    
    // ... existing ISR code ...
    
    return true;  // Return bool - true to continue, false to remove ISR
}
```

**Complexity:** EASY (15-20 minutes)

---

## STRUCTURAL ISSUES (Code Organization)

### Issue #8: Duplicate ConfigManager Class Definition

**Files Affected:**
- `src/main.cpp:182`
- `src/include/config.h:172`

**Error Message:**
```
error: redefinition of 'class ConfigManager'
 class ConfigManager {
       ^~~~~~~~~~~~~
In file included from src/main.cpp:33:
src/../include/config.h:172: note: previous definition of 'class ConfigManager'
 class ConfigManager {
       ^~~~~~~~~~~~~
```

**Root Cause:**
ConfigManager is defined in both main.cpp and config.h. When config.h is included in main.cpp, both definitions are visible, causing a redefinition error.

**Current Code Structure:**
```
src/main.cpp (line 182)
  |
  +-> #include "config.h" (line 33)
        |
        +-> class ConfigManager { ... }  // First definition
  |
  +-> class ConfigManager { ... }  // Second definition (line 182)
```

**Fix Options:**

Option A: Remove duplicate from main.cpp
```cpp
// In src/main.cpp - DELETE lines 182-250 (the duplicate class definition)
// Use the version from config.h instead
```

Option B: Move main.cpp definition to header
```cpp
// Move the ConfigManager class to a separate header:
// src/include/config_manager.h
// Then include it in main.cpp
```

**Recommended:** Option A (remove duplicate)

**Complexity:** EASY (< 10 minutes)

---

### Issue #9: Serial Not Declared in Scope

**Files Affected:**
- `src/main.cpp:353+` (LOG_INFO/LOG_ERROR macro definitions)
- `src/audio_pipeline_example.cpp:15+` (18 instances)
- Other example files

**Error Message:**
```
error: 'Serial' was not declared in this scope
 #define LOG_INFO(fmt, ...)  do { if (LOG_LEVEL >= LOG_LEVEL_INFO) { Serial.printf("[INFO] " fmt "\n", ##__VA_ARGS__); } } while(0)
                                                                     ^~~~~~
src/main.cpp:365:5: note: in expansion of macro 'LOG_INFO'
     LOG_INFO("=========================================");
     ^~~~~~~~
```

**Root Cause:**
The LOG_INFO and LOG_ERROR macros use `Serial.printf()`, but they are defined at global scope where Serial object is not yet initialized. Additionally, some example code tries to use Serial before initialization.

**Problem Pattern:**
```cpp
// src/main.cpp - WRONG ORDER

// Line 353 - Macro defined here, using Serial
#define LOG_INFO(fmt, ...)  do { if (LOG_LEVEL >= LOG_LEVEL_INFO) { Serial.printf(...); } } while(0)

// Line 365 - Macro used here
void setup() {
    LOG_INFO("Starting up");  // Serial not initialized yet!
    Serial.begin(115200);     // Initialized here - TOO LATE
}
```

**Fix Option 1: Move macro to header file after Serial is available**
```cpp
// Create src/logging.h
#ifndef LOGGING_H
#define LOGGING_H

#include <Arduino.h>

#define LOG_LEVEL 3
#define LOG_LEVEL_ERROR 1
#define LOG_LEVEL_INFO 3

#define LOG_INFO(fmt, ...)  do { if (LOG_LEVEL >= LOG_LEVEL_INFO) { Serial.printf("[INFO] " fmt "\n", ##__VA_ARGS__); } } while(0)
#define LOG_ERROR(fmt, ...) do { if (LOG_LEVEL >= LOG_LEVEL_ERROR) { Serial.printf("[ERROR] " fmt "\n", ##__VA_ARGS__); } } while(0)

#endif
```

**Fix Option 2: Defer macro expansion with lazy evaluation**
```cpp
// In main.cpp
#define LOG_INFO(fmt, ...) \
    do { \
        if (LOG_LEVEL >= LOG_LEVEL_INFO && Serial) { \
            Serial.printf("[INFO] " fmt "\n", ##__VA_ARGS__); \
        } \
    } while(0)
```

**Files to Update:**
- `src/main.cpp` - Move macros to proper location
- `src/audio_pipeline_example.cpp` - Ensure Serial initialized
- `src/rtp_example.cpp` - Ensure Serial initialized

**Complexity:** EASY (20-30 minutes)

---

### Issue #10: Macro Definition Before Use

**Files Affected:**
- `src/main.cpp:201-365`

**Error Message:**
```
error: 'LOG_INFO' was not declared in this scope
         LOG_INFO("NetworkManager: Initializing...");
         ^~~~~~~~
src/main.cpp:353: note: it was later defined here
 #define LOG_INFO(fmt, ...)  do { if (LOG_LEVEL >= LOG_LEVEL_INFO) { Serial.printf("[INFO] " fmt "\n", ##__VA_ARGS__); } } while(0)
```

**Root Cause:**
LOG_INFO macro is used in function definitions (lines 201+) but not defined until line 353.

**Current Code Structure:**
```cpp
// src/main.cpp

class NetworkManager {
    bool begin() {
        LOG_INFO("NetworkManager: Initializing...");  // Line 201 - USED
        // ...
    }
};

// ... more code ...

// Line 353 - DEFINED HERE (AFTER FIRST USE!)
#define LOG_INFO(fmt, ...)  do { ... } while(0)
```

**Fix:**
Move macro definitions to the top of the file or to a header file

```cpp
// At top of src/main.cpp
#define LOG_LEVEL 3
#define LOG_LEVEL_ERROR 1
#define LOG_LEVEL_INFO 3

#define LOG_INFO(fmt, ...)  do { if (LOG_LEVEL >= LOG_LEVEL_INFO) { Serial.printf("[INFO] " fmt "\n", ##__VA_ARGS__); } } while(0)
#define LOG_ERROR(fmt, ...) do { if (LOG_LEVEL >= LOG_LEVEL_ERROR) { Serial.printf("[ERROR] " fmt "\n", ##__VA_ARGS__); } } while(0)

// Then define classes
class NetworkManager {
    // ...
};
```

**Complexity:** EASY (< 10 minutes)

---

## SECONDARY ISSUES (Cascading from Primary)

### Issue #11: RTP Handler Private Method Access

**Files Affected:**
- `src/rtp_example.cpp:75-77, 119`

**Error Message:**
```
error: 'uint16_t RTPHandler::ntohs(uint16_t) const' is private within this context
         uint16_t seq = rtp.ntohs(packet.sequence_number);
```

**Root Cause:**
`rtp_example.cpp` attempts to call private methods (ntohs, ntohl, getJitterBuffer) from RTPHandler class.

**Current Code:**
```cpp
// In rtp_handler.h
class RTPHandler {
private:
    uint16_t ntohs(uint16_t value) const;    // Line 357 - PRIVATE
    uint32_t ntohl(uint32_t value) const;    // Line 356 - PRIVATE
    JitterBuffer& getJitterBuffer() { ... }  // PRIVATE
};

// In rtp_example.cpp
uint16_t seq = rtp.ntohs(packet.sequence_number);  // ERROR - private!
```

**Fix Option 1: Make methods public**
```cpp
// In rtp_handler.h
class RTPHandler {
public:
    uint16_t ntohs(uint16_t value) const;
    uint32_t ntohl(uint32_t value) const;
    JitterBuffer& getJitterBuffer() { ... }
};
```

**Fix Option 2: Use friend class**
```cpp
// In rtp_handler.h
class RTPHandler {
    friend class RoIPReceiver;  // Grant access to example code
};
```

**Fix Option 3: Remove example code from firmware**
```
Move rtp_example.cpp to separate examples/ directory
Don't include in main firmware build
```

**Complexity:** EASY (< 10 minutes)

---

### Issue #12: std::abs() Type Ambiguity

**Files Affected:**
- `src/rtp_handler.cpp:947`

**Error Message:**
```
error: call of overloaded 'abs(uint32_t)' is ambiguous
     inter_arrival_jitter += std::abs(d - inter_arrival_jitter) / 16;

/root/.platformio/packages/toolchain-xtensa-esp32/xtensa-esp32-elf/include/c++/8.4.0/bits/std_abs.h:56:3: note: candidate: 'long int std::abs(long int)'
/root/.platformio/packages/toolchain-xtensa-esp32/xtensa-esp32-elf/include/c++/8.4.0/bits/std_abs.h:61:3: note: candidate: 'long long int std::abs(long long int)'
   abs(long long __x) { return __builtin_llabs (__x); }
/root/.platformio/packages/toolchain-xtensa-esp32/xtensa-esp32-elf/include/c++/8.4.0/bits/std_abs.h:70:3: note: candidate: 'constexpr double std::abs(double)'
   abs(double __x)
```

**Root Cause:**
`std::abs()` has multiple overloads for different types. With `uint32_t`, the compiler can't determine which overload to use.

**Current Code:**
```cpp
// rtp_handler.cpp:947
uint32_t d = /* some calculation */;
uint32_t inter_arrival_jitter = /* some value */;
inter_arrival_jitter += std::abs(d - inter_arrival_jitter) / 16;
// Error: uint32_t doesn't match any std::abs() overload exactly
```

**Fix Options:**

Option 1: Use explicit casting
```cpp
inter_arrival_jitter += std::abs((int32_t)(d - inter_arrival_jitter)) / 16;
```

Option 2: Use llabs for long values
```cpp
inter_arrival_jitter += llabs((long long)(d - inter_arrival_jitter)) / 16;
```

Option 3: Use helper function
```cpp
inline uint32_t uint_abs(uint32_t a, uint32_t b) {
    return a > b ? (a - b) : (b - a);
}

inter_arrival_jitter += uint_abs(d, inter_arrival_jitter) / 16;
```

**Complexity:** TRIVIAL (< 5 minutes)

---

### Issue #13: Serial Not Declared in Example Code

**Files Affected:**
- `src/audio_pipeline_example.cpp:15, 27, 39, 88, 99, 124, 153, 172, 181, 193, 221, 265`

**Error Message:**
```
error: 'Serial' was not declared in this scope
     Serial.printf("Audio pipeline init failed: %s\n",
     ^~~~~~
```

**Root Cause:**
Example code uses Serial.printf() without proper initialization or includes. These examples are not meant for production firmware compilation.

**Fix Options:**

Option 1: Remove example files from src/
```
Move audio_pipeline_example.cpp to examples/
Move rtp_example.cpp to examples/
Only include core source files in build
```

Option 2: Add conditional compilation
```cpp
#ifdef AUDIO_DEBUG
void example_basic_usage() {
    // example code
}
#endif
```

Option 3: Provide proper initialization
```cpp
void setup_examples() {
    Serial.begin(115200);
    while(!Serial);  // Wait for Serial connection
    example_basic_usage();
}
```

**Complexity:** EASY (15-30 minutes)

---

## Summary Table

| Issue # | Severity | Category | File(s) | Fix Time | Status |
|---------|----------|----------|---------|----------|--------|
| 1 | CRITICAL | Library | codec_opus.cpp | 1-2h | Not Started |
| 2 | CRITICAL | Library | webserver.h/cpp | 3-5h | Not Started |
| 3 | CRITICAL | Library | (cascading) | (with #2) | Not Started |
| 4 | MAJOR | API | audio_pipeline.cpp | 2-3h | Not Started |
| 5 | MAJOR | Deprecation | audio_pipeline.h | <5m | Not Started |
| 6 | MAJOR | Deprecation | audio_pipeline.cpp | <5m | Not Started |
| 7 | MAJOR | API | audio_pipeline.cpp/h | 15-20m | Not Started |
| 8 | HIGH | Structure | main.cpp | <10m | Not Started |
| 9 | HIGH | Structure | main.cpp + examples | 20-30m | Not Started |
| 10 | HIGH | Structure | main.cpp | <10m | Not Started |
| 11 | MEDIUM | Access | rtp_example.cpp | <10m | Not Started |
| 12 | MEDIUM | Type | rtp_handler.cpp | <5m | Not Started |
| 13 | MEDIUM | Example | audio_pipeline_example.cpp | 15-30m | Not Started |

**Total Estimated Fix Time:** 12-20 hours (with thorough testing)

---

## Testing After Fixes

Once issues are resolved, verify:

1. **Compilation**
   - [ ] No errors on all 4 variants
   - [ ] No warnings (or acceptable warnings)
   - [ ] All symbols resolved

2. **Linking**
   - [ ] Binary size within limits
   - [ ] No undefined references
   - [ ] All libraries linked correctly

3. **Runtime**
   - [ ] Boots successfully
   - [ ] Serial output appears
   - [ ] WiFi connects
   - [ ] Web server starts
   - [ ] Audio pipeline initializes
   - [ ] RTP handler ready

4. **Memory**
   - [ ] Flash usage < target
   - [ ] RAM static allocation OK
   - [ ] Heap available for buffers
   - [ ] No memory fragmentation

---

**Generated:** 2025-11-22
**Status:** INCOMPLETE - Ready for developer action
