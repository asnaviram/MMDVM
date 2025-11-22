/*
 * FreeRTOS.h - Mock Header for Testing
 * Provides minimal FreeRTOS compatibility for desktop testing
 */

#ifndef INC_FREERTOS_H
#define INC_FREERTOS_H

#include <stdint.h>
#include <pthread.h>
#include <semaphore.h>
#include <stdlib.h>

// FreeRTOS type definitions
typedef void* SemaphoreHandle_t;
typedef void* QueueHandle_t;
typedef void* TaskHandle_t;

// Tick type
typedef uint32_t TickType_t;
typedef uint32_t portTickType;

// Macro helpers
#define pdTRUE    1
#define pdFALSE   0
#define pdMS_TO_TICKS(ms) ((TickType_t)(ms))

#define xSemaphoreTake(handle, timeout) (1)  // Always succeeds in mock
#define xSemaphoreGive(handle) (1)            // Always succeeds in mock
#define xSemaphoreCreateMutex() ((SemaphoreHandle_t)malloc(sizeof(sem_t)))
#define vSemaphoreDelete(handle) if (handle) free(handle)

#define xQueueCreate(length, itemSize) ((QueueHandle_t)malloc(sizeof(void*)))
#define vQueueDelete(queue) if (queue) free(queue)

// Stub functions
inline void vTaskDelay(TickType_t xTicksToDelay) {}
inline uint32_t ulTaskGetTickCount(void) { return 0; }

#endif // INC_FREERTOS_H
