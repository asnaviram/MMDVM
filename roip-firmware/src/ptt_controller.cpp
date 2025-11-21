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

#include "ptt_controller.h"

#include <cstring>
#include <cstdio>

// Default values
#define DEFAULT_COS_DEBOUNCE_MS      50U     // 50ms debounce for COS
#define DEFAULT_VOX_HANG_TIME_MS     300U    // 300ms hang time for VOX
#define DEFAULT_TAIL_DELAY_MS        500U    // 500ms tail delay
#define DEFAULT_TX_TIMEOUT_SECS      180U    // 3 minutes max TX
#define DEFAULT_VOX_THRESHOLD        8000U   // VOX threshold level
#define DEFAULT_AUDIO_LEVEL_WINDOW   10U     // 10 samples for averaging

// Timeout constraints
#define MIN_TX_TIMEOUT_SECS          30U
#define MAX_TX_TIMEOUT_SECS          3600U
#define MIN_TAIL_DELAY_MS            10U
#define MAX_TAIL_DELAY_MS            5000U

CPTTController::CPTTController() :
m_pttPin(255),
m_cosPin(255),
m_voxPin(255),
m_mode(PTT_MODE::DISABLED),
m_priority(TX_PRIORITY::COS_PRIORITY),
m_currentState(PTT_STATE::IDLE),
m_previousState(PTT_STATE::IDLE),
m_cosDebounceTime(DEFAULT_COS_DEBOUNCE_MS),
m_cosDebounceCounter(0U),
m_cosInvert(false),
m_cosActive(false),
m_cosDebounced(false),
m_cosActiveDuration(0U),
m_voxEnabled(false),
m_voxThreshold(DEFAULT_VOX_THRESHOLD),
m_voxHangTime(DEFAULT_VOX_HANG_TIME_MS),
m_voxHangCounter(0U),
m_voxActive(false),
m_voxActiveDuration(0U),
m_currentAudioLevel(0U),
m_peakAudioLevel(0U),
m_audioLevelCounter(0U),
m_audioLevelSum(0U),
m_tailDelay(DEFAULT_TAIL_DELAY_MS),
m_tailDelayCounter(0U),
m_txTimeoutSecs(DEFAULT_TX_TIMEOUT_SECS),
m_txDuration(0U),
m_timeoutOccurred(false),
m_pttActive(false),
m_forcedPTT(false),
m_pttInvert(false),
m_clockCounter(0U),
m_totalActiveDuration(0U)
{
}

CPTTController::~CPTTController()
{
  detachCOSInterrupt();
}

void CPTTController::initialize(uint8_t pttPin, uint8_t cosPin, uint8_t voxPin)
{
  m_pttPin = pttPin;
  m_cosPin = cosPin;
  m_voxPin = voxPin;

  resetState();
}

void CPTTController::setMode(PTT_MODE mode)
{
  if (m_mode != mode) {
    m_mode = mode;
    resetState();
  }
}

PTT_MODE CPTTController::getMode() const
{
  return m_mode;
}

void CPTTController::setCOSDebounceTime(uint16_t msecs)
{
  if (msecs < 10U) msecs = 10U;    // Minimum 10ms
  if (msecs > 500U) msecs = 500U;  // Maximum 500ms
  m_cosDebounceTime = msecs;
}

uint16_t CPTTController::getCOSDebounceTime() const
{
  return m_cosDebounceTime;
}

void CPTTController::setCOSInvert(bool invert)
{
  m_cosInvert = invert;
}

bool CPTTController::getCOSInvert() const
{
  return m_cosInvert;
}

void CPTTController::setVOXEnabled(bool enabled)
{
  m_voxEnabled = enabled;
  if (!enabled && m_voxActive) {
    m_voxActive = false;
    m_voxActiveDuration = 0U;
  }
}

bool CPTTController::getVOXEnabled() const
{
  return m_voxEnabled;
}

void CPTTController::setVOXThreshold(uint16_t threshold)
{
  // Threshold should be reasonable (e.g., 4000-16000 for 16-bit audio)
  if (threshold < 1000U) threshold = 1000U;
  if (threshold > 32000U) threshold = 32000U;
  m_voxThreshold = threshold;
}

uint16_t CPTTController::getVOXThreshold() const
{
  return m_voxThreshold;
}

void CPTTController::setVOXHangTime(uint16_t msecs)
{
  if (msecs < 50U) msecs = 50U;      // Minimum 50ms
  if (msecs > 5000U) msecs = 5000U;  // Maximum 5 seconds
  m_voxHangTime = msecs;
}

uint16_t CPTTController::getVOXHangTime() const
{
  return m_voxHangTime;
}

void CPTTController::setTailDelay(uint16_t msecs)
{
  if (msecs < MIN_TAIL_DELAY_MS) msecs = MIN_TAIL_DELAY_MS;
  if (msecs > MAX_TAIL_DELAY_MS) msecs = MAX_TAIL_DELAY_MS;
  m_tailDelay = msecs;
}

uint16_t CPTTController::getTailDelay() const
{
  return m_tailDelay;
}

void CPTTController::setTXTimeout(uint16_t secs)
{
  if (secs < MIN_TX_TIMEOUT_SECS) secs = MIN_TX_TIMEOUT_SECS;
  if (secs > MAX_TX_TIMEOUT_SECS) secs = MAX_TX_TIMEOUT_SECS;
  m_txTimeoutSecs = secs;
}

uint16_t CPTTController::getTXTimeout() const
{
  return m_txTimeoutSecs;
}

void CPTTController::setTXPriority(TX_PRIORITY priority)
{
  m_priority = priority;
}

TX_PRIORITY CPTTController::getTXPriority() const
{
  return m_priority;
}

void CPTTController::forcePTT(bool active)
{
  m_forcedPTT = active;
  if (active) {
    transitionTo(PTT_STATE::TRANSMITTING);
    m_txDuration = 0U;
    m_timeoutOccurred = false;
  }
}

bool CPTTController::isForcedPTT() const
{
  return m_forcedPTT;
}

PTT_STATE CPTTController::getState() const
{
  return m_currentState;
}

bool CPTTController::isTransmitting() const
{
  return m_pttActive;
}

void CPTTController::updateAudioLevel(uint16_t level)
{
  m_currentAudioLevel = level;
  m_audioLevelSum += level;
  m_audioLevelCounter++;

  // Update peak level
  if (level > m_peakAudioLevel) {
    m_peakAudioLevel = level;
  }

  // Average over a window of samples
  if (m_audioLevelCounter >= DEFAULT_AUDIO_LEVEL_WINDOW) {
    m_currentAudioLevel = m_audioLevelSum / m_audioLevelCounter;
    m_audioLevelSum = 0U;
    m_audioLevelCounter = 0U;

    // Detect VOX activity based on averaged level
    if (m_voxEnabled && !m_forcedPTT) {
      if (m_currentAudioLevel >= m_voxThreshold) {
        if (!m_voxActive) {
          m_voxActive = true;
          m_voxActiveDuration = 0U;
        }
        // Reset hang time while voice is detected
        m_voxHangCounter = 0U;
      } else {
        // No voice detected, start hang time countdown
        if (m_voxActive) {
          m_voxHangCounter = m_voxHangTime;
        }
      }
    }
  }
}

uint16_t CPTTController::getAudioLevel() const
{
  return m_currentAudioLevel;
}

uint16_t CPTTController::getAudioPeakLevel() const
{
  return m_peakAudioLevel;
}

void CPTTController::clock(uint8_t lengthMs)
{
  if (m_mode == PTT_MODE::DISABLED) {
    return;
  }

  m_clockCounter += lengthMs;

  // Update all timers
  updateCOSDebounce();
  updateVOXHangTime();
  updateTailDelay();
  updateTXTimeout();

  // Update duration counters
  if (m_pttActive) {
    m_txDuration += lengthMs;
    m_totalActiveDuration += lengthMs;
  }

  if (m_cosDebounced) {
    m_cosActiveDuration += lengthMs;
  }

  if (m_voxActive) {
    m_voxActiveDuration += lengthMs;
  }

  // Run state machine
  updateStateMachine();
}

void CPTTController::cosInterrupt(bool cosActive)
{
  // Store raw COS state with inversion logic
  m_cosActive = cosActive ^ m_cosInvert;

  // Start debounce counter
  m_cosDebounceCounter = m_cosDebounceTime;
}

void CPTTController::attachCOSInterrupt(void (*handler)(void))
{
  // Platform-specific GPIO interrupt attachment
  // This is a placeholder for platform-specific implementation
  (void)handler; // Suppress unused parameter warning
}

void CPTTController::detachCOSInterrupt()
{
  // Platform-specific GPIO interrupt detachment
}

bool CPTTController::getCOSActive() const
{
  return m_cosDebounced;
}

bool CPTTController::getVOXActive() const
{
  return m_voxActive;
}

bool CPTTController::getPTTActive() const
{
  return m_pttActive;
}

uint16_t CPTTController::getTXDuration() const
{
  return m_txDuration / 1000U; // Convert to seconds
}

void CPTTController::resetState()
{
  m_currentState = PTT_STATE::IDLE;
  m_previousState = PTT_STATE::IDLE;
  resetAllTimers();
  m_cosActive = false;
  m_cosDebounced = false;
  m_voxActive = false;
  m_pttActive = false;
  m_forcedPTT = false;
  m_timeoutOccurred = false;
  setPTTOutput(false);
}

void CPTTController::resetTimeouts()
{
  m_txDuration = 0U;
  m_timeoutOccurred = false;
}

const char* CPTTController::getStateString() const
{
  switch (m_currentState) {
    case PTT_STATE::IDLE:
      return "IDLE";
    case PTT_STATE::COS_ACTIVE:
      return "COS_ACTIVE";
    case PTT_STATE::VOX_ACTIVE:
      return "VOX_ACTIVE";
    case PTT_STATE::TX_PENDING:
      return "TX_PENDING";
    case PTT_STATE::TRANSMITTING:
      return "TRANSMITTING";
    case PTT_STATE::TIMEOUT:
      return "TIMEOUT";
    case PTT_STATE::ERROR:
      return "ERROR";
    default:
      return "UNKNOWN";
  }
}

void CPTTController::dumpState()
{
  // Platform-specific logging implementation
  // This is a placeholder for platform-specific implementation
}

// ============================================================================
// Private Implementation
// ============================================================================

void CPTTController::updateCOSDebounce()
{
  if (m_cosDebounceCounter > 0U) {
    if (m_cosDebounceCounter <= 20U) {
      m_cosDebounceCounter = 0U;
      // Debounce complete, update debounced state
      m_cosDebounced = m_cosActive;
    } else {
      m_cosDebounceCounter -= 20U; // Assuming ~20ms clock intervals
    }
  }
}

void CPTTController::updateVOXHangTime()
{
  if (m_voxActive && m_voxHangCounter > 0U) {
    if (m_voxHangCounter <= 20U) {
      m_voxHangCounter = 0U;
      m_voxActive = false;
      m_voxActiveDuration = 0U;
    } else {
      m_voxHangCounter -= 20U;
    }
  }
}

void CPTTController::updateTailDelay()
{
  if (m_tailDelayCounter > 0U) {
    if (m_tailDelayCounter <= 20U) {
      m_tailDelayCounter = 0U;
    } else {
      m_tailDelayCounter -= 20U;
    }
  }
}

void CPTTController::updateTXTimeout()
{
  if (m_pttActive && m_txDuration > 0U) {
    uint32_t maxTXDurationMs = (uint32_t)m_txTimeoutSecs * 1000U;
    if (m_txDuration >= maxTXDurationMs) {
      m_timeoutOccurred = true;
      transitionTo(PTT_STATE::TIMEOUT);
    }
  }
}

void CPTTController::updateStateMachine()
{
  switch (m_currentState) {
    case PTT_STATE::IDLE:
      handleIdleState();
      break;

    case PTT_STATE::COS_ACTIVE:
      handleCOSActiveState();
      break;

    case PTT_STATE::VOX_ACTIVE:
      handleVOXActiveState();
      break;

    case PTT_STATE::TX_PENDING:
      handleTXPendingState();
      break;

    case PTT_STATE::TRANSMITTING:
      handleTransmittingState();
      break;

    case PTT_STATE::TIMEOUT:
      handleTimeoutState();
      break;

    case PTT_STATE::ERROR:
      handleErrorState();
      break;

    default:
      transitionTo(PTT_STATE::ERROR);
      break;
  }
}

void CPTTController::handleIdleState()
{
  // In IDLE state, wait for COS or VOX activation
  if (m_forcedPTT) {
    transitionTo(PTT_STATE::TRANSMITTING);
    m_txDuration = 0U;
    return;
  }

  // Check COS activation
  if (m_mode == PTT_MODE::COS_MODE || m_mode == PTT_MODE::HYBRID_MODE) {
    if (m_cosDebounced) {
      transitionTo(PTT_STATE::COS_ACTIVE);
      m_txDuration = 0U;
      m_timeoutOccurred = false;
      return;
    }
  }

  // Check VOX activation
  if (m_mode == PTT_MODE::VOX_MODE || m_mode == PTT_MODE::HYBRID_MODE) {
    if (m_voxEnabled && m_voxActive) {
      transitionTo(PTT_STATE::VOX_ACTIVE);
      m_txDuration = 0U;
      m_timeoutOccurred = false;
      return;
    }
  }
}

void CPTTController::handleCOSActiveState()
{
  // In COS_ACTIVE state, PTT is active
  if (!m_pttActive) {
    setPTTOutput(true);
  }

  // Check for COS deactivation
  if (!m_cosDebounced) {
    // COS has dropped, start tail delay
    m_tailDelayCounter = m_tailDelay;
    transitionTo(PTT_STATE::TX_PENDING);
    return;
  }

  // Check for timeout
  if (m_timeoutOccurred) {
    transitionTo(PTT_STATE::TIMEOUT);
    return;
  }

  // In HYBRID mode, VOX can interrupt COS
  if (m_mode == PTT_MODE::HYBRID_MODE) {
    // Priority handling is managed by the transmission logic
  }
}

void CPTTController::handleVOXActiveState()
{
  // In VOX_ACTIVE state, PTT is active
  if (!m_pttActive) {
    setPTTOutput(true);
  }

  // Check for VOX deactivation (hang time managed by updateVOXHangTime)
  if (!m_voxActive) {
    // VOX has dropped, start tail delay
    m_tailDelayCounter = m_tailDelay;
    transitionTo(PTT_STATE::TX_PENDING);
    return;
  }

  // Check for timeout
  if (m_timeoutOccurred) {
    transitionTo(PTT_STATE::TIMEOUT);
    return;
  }

  // In HYBRID mode, COS can interrupt VOX if it has higher priority
  if (m_mode == PTT_MODE::HYBRID_MODE && m_cosDebounced) {
    if (m_priority == TX_PRIORITY::COS_PRIORITY) {
      // Stay in current state (VOX) but note COS is also active
      // This allows smooth transitions
    }
  }
}

void CPTTController::handleTXPendingState()
{
  // Keep PTT active during tail delay
  if (!m_pttActive) {
    setPTTOutput(true);
  }

  // Check if tail delay has completed
  if (m_tailDelayCounter == 0U) {
    // Check if we should continue transmission
    if ((m_mode == PTT_MODE::COS_MODE && m_cosDebounced) ||
        (m_mode == PTT_MODE::VOX_MODE && m_voxActive) ||
        (m_mode == PTT_MODE::HYBRID_MODE && (m_cosDebounced || m_voxActive))) {
      // Input reactivated during tail delay, return to transmission
      if (m_cosDebounced) {
        transitionTo(PTT_STATE::COS_ACTIVE);
      } else if (m_voxActive) {
        transitionTo(PTT_STATE::VOX_ACTIVE);
      }
    } else {
      // Tail delay complete, release PTT
      setPTTOutput(false);
      transitionTo(PTT_STATE::IDLE);
    }
  }
}

void CPTTController::handleTransmittingState()
{
  // In TRANSMITTING state (forced PTT), keep TX active
  if (!m_pttActive) {
    setPTTOutput(true);
  }

  // Check for forced PTT release
  if (!m_forcedPTT) {
    m_tailDelayCounter = m_tailDelay;
    transitionTo(PTT_STATE::TX_PENDING);
    return;
  }

  // Check for timeout
  if (m_timeoutOccurred) {
    transitionTo(PTT_STATE::TIMEOUT);
    return;
  }
}

void CPTTController::handleTimeoutState()
{
  // Immediately release PTT on timeout for safety
  setPTTOutput(false);
  m_forcedPTT = false;

  // Transition back to IDLE after a short delay
  if (m_tailDelayCounter == 0U) {
    m_tailDelayCounter = 100U; // 100ms delay before returning to IDLE
  } else if (m_tailDelayCounter < 20U) {
    transitionTo(PTT_STATE::IDLE);
    m_timeoutOccurred = false;
  }
}

void CPTTController::handleErrorState()
{
  // Safety: release PTT immediately on error
  setPTTOutput(false);
  m_forcedPTT = false;

  // Attempt recovery after 1 second
  if (m_clockCounter > 1000U) {
    m_clockCounter = 0U;
    transitionTo(PTT_STATE::IDLE);
  }
}

bool CPTTController::shouldTransmit() const
{
  if (m_forcedPTT) {
    return true;
  }

  if (m_mode == PTT_MODE::COS_MODE) {
    return m_cosDebounced;
  }

  if (m_mode == PTT_MODE::VOX_MODE) {
    return m_voxActive;
  }

  if (m_mode == PTT_MODE::HYBRID_MODE) {
    return m_cosDebounced || m_voxActive;
  }

  return false;
}

void CPTTController::setPTTOutput(bool active)
{
  bool outputState = active ^ m_pttInvert;
  m_pttActive = active;

  // Platform-specific GPIO control
  // Example for Arduino/ESP32:
  // if (m_pttPin != 255) {
  //   digitalWrite(m_pttPin, outputState ? HIGH : LOW);
  // }
}

void CPTTController::transitionTo(PTT_STATE newState)
{
  if (m_currentState != newState) {
    m_previousState = m_currentState;
    m_currentState = newState;

    // State-specific initialization
    switch (newState) {
      case PTT_STATE::IDLE:
        m_tailDelayCounter = 0U;
        m_cosActiveDuration = 0U;
        m_voxActiveDuration = 0U;
        break;

      case PTT_STATE::COS_ACTIVE:
        // COS became active
        break;

      case PTT_STATE::VOX_ACTIVE:
        // VOX became active
        break;

      case PTT_STATE::TX_PENDING:
        // Entering tail delay period
        break;

      case PTT_STATE::TRANSMITTING:
        m_txDuration = 0U;
        m_timeoutOccurred = false;
        break;

      case PTT_STATE::TIMEOUT:
        // Timeout occurred - emergency release
        break;

      case PTT_STATE::ERROR:
        // Error condition - safe state
        break;

      default:
        break;
    }
  }
}

void CPTTController::resetAllTimers()
{
  m_cosDebounceCounter = 0U;
  m_voxHangCounter = 0U;
  m_tailDelayCounter = 0U;
  m_txDuration = 0U;
  m_cosActiveDuration = 0U;
  m_voxActiveDuration = 0U;
  m_clockCounter = 0U;
}

void CPTTController::updateAudioPeakLevel()
{
  // Decay peak level over time if no new peaks
  if (m_peakAudioLevel > 0U) {
    // Slow decay (reduce by ~10% every second)
    if (m_clockCounter % 1000U == 0U) {
      m_peakAudioLevel = (m_peakAudioLevel * 9U) / 10U;
    }
  }
}
