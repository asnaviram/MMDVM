/*
 *   Copyright (C) 2024 by MMDVM Contributors
 *
 *   This program is free software; you can redistribute it and/or modify
 *   it under the terms of the GNU General Public License as published by
 *   the Free Software Foundation; either version 2 of the License, or
 *   (at your option) any later version.
 *
 *   This program is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU General Public License for more details.
 *
 *   You should have received a copy of the GNU General Public License
 *   along with this program; if not, write to the Free Software
 *   Foundation, Inc., 675 Mass Ave, Cambridge, MA 02139, USA.
 */

#if !defined(PTT_CONTROLLER_H)
#define PTT_CONTROLLER_H

#include <cstdint>
#include <cstdbool>

// TX/RX State Machine States
enum class PTT_STATE {
  IDLE,           // No transmission
  COS_ACTIVE,     // COS signal detected
  VOX_ACTIVE,     // Voice activity detected
  TX_PENDING,     // Waiting for tail delay to expire
  TRANSMITTING,   // Currently transmitting
  TIMEOUT,        // Transmission timeout occurred
  ERROR           // Error state
};

// PTT Input Mode
enum class PTT_MODE {
  PTT_DISABLED,   // PTT controller disabled
  COS_MODE,       // Carrier Operated Squelch mode
  VOX_MODE,       // Voice Operated Switch mode
  HYBRID_MODE     // COS + VOX with priority handling
};

// Priority levels for hybrid mode
enum class TX_PRIORITY {
  COS_PRIORITY,   // COS takes priority
  VOX_PRIORITY,   // VOX takes priority
  EQUAL_PRIORITY  // Both have equal priority
};

class CPTTController {
public:
  CPTTController();
  ~CPTTController();

  // Initialization
  void initialize(uint8_t pttPin, uint8_t cosPin, uint8_t voxPin);

  // Mode Configuration
  void setMode(PTT_MODE mode);
  PTT_MODE getMode() const;

  // COS Configuration
  void setCOSDebounceTime(uint16_t msecs);
  uint16_t getCOSDebounceTime() const;
  void setCOSInvert(bool invert);
  bool getCOSInvert() const;

  // VOX Configuration
  void setVOXEnabled(bool enabled);
  bool getVOXEnabled() const;
  void setVOXThreshold(uint16_t threshold);
  uint16_t getVOXThreshold() const;
  void setVOXHangTime(uint16_t msecs);
  uint16_t getVOXHangTime() const;

  // Tail Delay Configuration (delay before releasing PTT after COS/VOX drops)
  void setTailDelay(uint16_t msecs);
  uint16_t getTailDelay() const;

  // TX Timeout Configuration (maximum transmission time)
  void setTXTimeout(uint16_t secs);
  uint16_t getTXTimeout() const;

  // Priority Configuration (for hybrid mode)
  void setTXPriority(TX_PRIORITY priority);
  TX_PRIORITY getTXPriority() const;

  // Runtime Control
  void forcePTT(bool active);
  bool isForcedPTT() const;

  // State Management
  PTT_STATE getState() const;
  bool isTransmitting() const;

  // Audio Level Monitoring (for VOX)
  void updateAudioLevel(uint16_t level);
  uint16_t getAudioLevel() const;
  uint16_t getAudioPeakLevel() const;

  // Clock/Update Function (must be called regularly, e.g., every 20ms)
  void clock(uint8_t lengthMs);

  // COS Input Detection (called from interrupt handler)
  void cosInterrupt(bool cosActive);

  // Status Queries
  bool getCOSActive() const;
  bool getVOXActive() const;
  bool getPTTActive() const;
  uint16_t getTXDuration() const;

  // Safety/Debug Functions
  void resetState();
  void resetTimeouts();

  // GPIO Interrupt Handler Registration
  void attachCOSInterrupt(void (*handler)(void));
  void detachCOSInterrupt();

  // Logging/Debug
  const char* getStateString() const;
  void dumpState();

private:
  // GPIO Pin Configuration
  uint8_t m_pttPin;
  uint8_t m_cosPin;
  uint8_t m_voxPin;

  // Operating Mode
  PTT_MODE m_mode;
  TX_PRIORITY m_priority;

  // State Machine
  PTT_STATE m_currentState;
  PTT_STATE m_previousState;

  // COS Configuration & State
  uint16_t m_cosDebounceTime;    // in milliseconds
  uint16_t m_cosDebounceCounter; // countdown timer
  bool m_cosInvert;
  bool m_cosActive;              // raw COS input state
  bool m_cosDebounced;           // debounced COS state
  uint32_t m_cosActiveDuration;  // time COS has been active

  // VOX Configuration & State
  bool m_voxEnabled;
  uint16_t m_voxThreshold;       // audio level threshold for VOX activation
  uint16_t m_voxHangTime;        // time to keep TX active after voice stops
  uint16_t m_voxHangCounter;     // countdown timer for hang time
  bool m_voxActive;              // VOX currently detecting voice
  uint32_t m_voxActiveDuration;  // time VOX has been active

  // Audio Level Monitoring
  uint16_t m_currentAudioLevel;
  uint16_t m_peakAudioLevel;
  uint16_t m_audioLevelCounter;  // for averaging
  uint32_t m_audioLevelSum;

  // Tail Delay Configuration
  uint16_t m_tailDelay;          // delay before releasing PTT (in ms)
  uint16_t m_tailDelayCounter;   // countdown timer

  // TX Timeout Protection
  uint16_t m_txTimeoutSecs;      // maximum TX duration in seconds
  uint32_t m_txDuration;         // current TX duration in milliseconds
  bool m_timeoutOccurred;        // flag when timeout is reached

  // PTT Control
  bool m_pttActive;              // actual PTT output state
  bool m_forcedPTT;              // forced PTT override
  bool m_pttInvert;              // invert PTT output logic

  // Internal State Management
  uint32_t m_clockCounter;       // for timing calculations
  uint32_t m_totalActiveDuration;// total time spent in transmission

  // Timer Infrastructure
  void updateCOSDebounce();
  void updateVOXHangTime();
  void updateTailDelay();
  void updateTXTimeout();

  // State Machine Logic
  void updateStateMachine();
  void handleIdleState();
  void handleCOSActiveState();
  void handleVOXActiveState();
  void handleTXPendingState();
  void handleTransmittingState();
  void handleTimeoutState();
  void handleErrorState();

  // Internal Helpers
  bool shouldTransmit() const;
  void setPTTOutput(bool active);
  void transitionTo(PTT_STATE newState);
  void resetAllTimers();
  void updateAudioPeakLevel();
};

#endif
