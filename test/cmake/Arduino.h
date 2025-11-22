/*
 * Arduino.h - Mock Header for Testing
 * Provides minimal Arduino compatibility for desktop testing
 */

#ifndef ARDUINO_H
#define ARDUINO_H

#include <stdint.h>
#include <stdio.h>
#include <stdarg.h>
#include <cmath>

// Arduino type definitions
typedef uint8_t byte;
typedef uint16_t word;
typedef uint32_t dword;

// Arduino constants
#define HIGH 1
#define LOW  0
#define INPUT 0
#define OUTPUT 1
#define INPUT_PULLUP 2

// Serial mock object
class SerialMock {
public:
    void begin(unsigned long baud) { }
    void end() { }
    void print(const char* str) { printf("%s", str); }
    void println(const char* str) { printf("%s\n", str); }
    void printf(const char* format, ...) {
        va_list args;
        va_start(args, format);
        vprintf(format, args);
        va_end(args);
    }
    int available() { return 0; }
    int read() { return -1; }
    void write(uint8_t c) { printf("%c", c); }
    void flush() { fflush(stdout); }
};

extern SerialMock Serial;

// Arduino functions
inline void pinMode(uint8_t pin, uint8_t mode) { }
inline void digitalWrite(uint8_t pin, uint8_t val) { }
inline int digitalRead(uint8_t pin) { return 0; }
inline int analogRead(uint8_t pin) { return 0; }
inline void analogWrite(uint8_t pin, int val) { }
inline unsigned long millis(void) { return 0; }
inline unsigned long micros(void) { return 0; }
inline void delay(unsigned long ms) { }
inline void delayMicroseconds(unsigned int us) { }

// Math functions
inline float sinf(float x) { return std::sin(x); }
inline float cosf(float x) { return std::cos(x); }
inline float sqrtf(float x) { return std::sqrt(x); }
inline float log10f(float x) { return std::log10(x); }

#endif // ARDUINO_H
