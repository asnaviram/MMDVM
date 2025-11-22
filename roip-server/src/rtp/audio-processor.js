/**
 * Audio Processor with Worker Thread Pool
 *
 * Manages a pool of worker threads for parallel audio processing
 *
 * @module audio-processor
 */

import { Worker } from 'worker_threads';
import os from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Audio Processor with Worker Pool
 */
export class AudioProcessor {
  constructor(options = {}) {
    this.numWorkers = options.numWorkers || os.cpus().length;
    this.workers = [];
    this.currentWorker = 0;
    this.taskQueue = [];
    this.activeWorkers = 0;

    // Statistics
    this.stats = {
      tasksCompleted: 0,
      tasksQueued: 0,
      tasksFailed: 0,
      totalProcessingTime: 0,
      workerUtilization: 0
    };

    // Initialize workers
    this.initializeWorkers();
  }

  /**
   * Initialize worker thread pool
   * @private
   */
  initializeWorkers() {
    const workerPath = join(__dirname, 'audio-worker.js');

    for (let i = 0; i < this.numWorkers; i++) {
      try {
        const worker = new Worker(workerPath);
        worker.workerId = i;
        worker.isBusy = false;

        worker.on('error', (err) => {
          console.error(`Worker ${i} error:`, err);
          this.stats.tasksFailed++;
        });

        this.workers.push(worker);
      } catch (error) {
        console.warn(`Failed to create worker ${i}:`, error.message);
      }
    }

    if (this.workers.length === 0) {
      console.warn('No workers could be created, processing will be synchronous');
    }
  }

  /**
   * Process audio using worker thread
   * @param {string} type - Processing type
   * @param {Buffer|Array} audioData - Audio data to process
   * @param {object} options - Processing options
   * @returns {Promise} Promise that resolves with processed audio
   */
  async processAudio(type, audioData, options = {}) {
    if (this.workers.length === 0) {
      throw new Error('No workers available');
    }

    const startTime = Date.now();

    // Find available worker
    const worker = this.getNextAvailableWorker();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Audio processing timeout'));
        this.stats.tasksFailed++;
      }, options.timeout || 5000);

      // Set up response handler
      const messageHandler = (result) => {
        clearTimeout(timeout);
        worker.removeListener('message', messageHandler);
        worker.isBusy = false;
        this.activeWorkers--;

        // Update statistics
        const processingTime = Date.now() - startTime;
        this.stats.totalProcessingTime += processingTime;
        this.stats.workerUtilization =
          (this.activeWorkers / this.workers.length) * 100;

        if (result.success) {
          this.stats.tasksCompleted++;
          resolve(result.result);
        } else {
          this.stats.tasksFailed++;
          reject(new Error(result.error));
        }

        // Process queued tasks
        this.processQueue();
      };

      worker.once('message', messageHandler);

      // Send task to worker
      worker.isBusy = true;
      this.activeWorkers++;
      this.stats.tasksQueued++;

      worker.postMessage({
        type,
        audioData,
        options
      });
    });
  }

  /**
   * Get next available worker
   * @private
   * @returns {Worker} Available worker
   */
  getNextAvailableWorker() {
    // Try to find idle worker
    for (let i = 0; i < this.workers.length; i++) {
      const worker = this.workers[i];
      if (!worker.isBusy) {
        return worker;
      }
    }

    // All workers busy, use round-robin
    const worker = this.workers[this.currentWorker];
    this.currentWorker = (this.currentWorker + 1) % this.workers.length;
    return worker;
  }

  /**
   * Process queued tasks
   * @private
   */
  processQueue() {
    if (this.taskQueue.length === 0) return;

    // Find idle worker
    for (const worker of this.workers) {
      if (!worker.isBusy && this.taskQueue.length > 0) {
        const task = this.taskQueue.shift();
        this.processAudio(task.type, task.audioData, task.options)
          .then(task.resolve)
          .catch(task.reject);
      }
    }
  }

  /**
   * Mix audio streams
   * @param {Array} audioStreams - Array of audio buffers
   * @param {object} options - Mix options
   * @returns {Promise<Buffer>} Mixed audio
   */
  async mix(audioStreams, options = {}) {
    return this.processAudio('mix', audioStreams, options);
  }

  /**
   * Resample audio
   * @param {Buffer} audioData - Input audio
   * @param {object} options - Resample options
   * @returns {Promise<Buffer>} Resampled audio
   */
  async resample(audioData, options = {}) {
    return this.processAudio('resample', audioData, options);
  }

  /**
   * Filter audio
   * @param {Buffer} audioData - Input audio
   * @param {object} options - Filter options
   * @returns {Promise<Buffer>} Filtered audio
   */
  async filter(audioData, options = {}) {
    return this.processAudio('filter', audioData, options);
  }

  /**
   * Normalize audio
   * @param {Buffer} audioData - Input audio
   * @param {object} options - Normalization options
   * @returns {Promise<Buffer>} Normalized audio
   */
  async normalize(audioData, options = {}) {
    return this.processAudio('normalize', audioData, options);
  }

  /**
   * Analyze audio
   * @param {Buffer} audioData - Input audio
   * @param {object} options - Analysis options
   * @returns {Promise<object>} Analysis results
   */
  async analyze(audioData, options = {}) {
    return this.processAudio('analyze', audioData, options);
  }

  /**
   * Get processor statistics
   * @returns {object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      numWorkers: this.workers.length,
      activeWorkers: this.activeWorkers,
      queueLength: this.taskQueue.length,
      avgProcessingTime: this.stats.tasksCompleted > 0
        ? (this.stats.totalProcessingTime / this.stats.tasksCompleted).toFixed(2) + 'ms'
        : '0ms'
    };
  }

  /**
   * Shutdown all workers
   */
  async shutdown() {
    const promises = this.workers.map(worker => worker.terminate());
    await Promise.all(promises);
    this.workers = [];
  }
}

export default AudioProcessor;
