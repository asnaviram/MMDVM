/**
 * Multi-Level Cache Manager for RoIP Server
 * Implements L1 (in-memory) and L2 (Redis) caching with automatic failover
 */

import Redis from 'ioredis';
import NodeCache from 'node-cache';
import { EventEmitter } from 'events';

class CacheManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      // L1 Cache (in-memory)
      l1: {
        stdTTL: options.l1TTL || 60,           // 60 seconds default
        checkperiod: options.l1CheckPeriod || 120,
        maxKeys: options.l1MaxKeys || 1000,
        useClones: false  // Better performance, use with caution
      },
      // L2 Cache (Redis)
      l2: {
        enabled: options.l2Enabled !== false,
        host: options.redisHost || 'localhost',
        port: options.redisPort || 6379,
        db: options.redisDB || 0,
        password: options.redisPassword,
        keyPrefix: options.keyPrefix || 'roip:',
        enableReadyCheck: true,
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          if (times > 3) {
            this.emit('redis-error', new Error('Redis max retries exceeded'));
            return null;
          }
          return Math.min(times * 50, 2000);
        }
      }
    };

    // Initialize L1 cache (always available)
    this.l1 = new NodeCache(this.options.l1);

    // Initialize L2 cache (Redis) if enabled
    this.l2 = null;
    this.l2Available = false;

    if (this.options.l2.enabled) {
      this.initializeL2();
    }

    // Metrics
    this.metrics = {
      l1Hits: 0,
      l1Misses: 0,
      l2Hits: 0,
      l2Misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0
    };

    // Setup cache event handlers
    this.setupEventHandlers();
  }

  /**
   * Initialize Redis (L2) cache
   */
  initializeL2() {
    try {
      this.l2 = new Redis(this.options.l2);

      this.l2.on('ready', () => {
        this.l2Available = true;
        this.emit('l2-ready');
        console.log('[Cache] Redis (L2) cache connected');
      });

      this.l2.on('error', (error) => {
        this.l2Available = false;
        this.metrics.errors++;
        this.emit('l2-error', error);
        console.warn('[Cache] Redis error:', error.message);
      });

      this.l2.on('reconnecting', () => {
        console.log('[Cache] Redis reconnecting...');
      });

    } catch (error) {
      console.error('[Cache] Failed to initialize Redis:', error);
      this.l2Available = false;
    }
  }

  /**
   * Setup cache event handlers
   */
  setupEventHandlers() {
    this.l1.on('expired', (key, value) => {
      this.emit('key-expired', { level: 'l1', key });
    });

    this.l1.on('del', (key, value) => {
      this.emit('key-deleted', { level: 'l1', key });
    });
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {Promise<any>} Cached value or null
   */
  async get(key) {
    try {
      // Try L1 cache first
      const l1Value = this.l1.get(key);
      if (l1Value !== undefined) {
        this.metrics.l1Hits++;
        this.emit('cache-hit', { level: 'l1', key });
        return l1Value;
      }

      this.metrics.l1Misses++;

      // Try L2 cache if available
      if (this.l2Available && this.l2) {
        const l2Value = await this.l2.get(key);
        if (l2Value !== null) {
          this.metrics.l2Hits++;
          this.emit('cache-hit', { level: 'l2', key });

          // Promote to L1
          const parsed = this.deserialize(l2Value);
          this.l1.set(key, parsed);

          return parsed;
        }

        this.metrics.l2Misses++;
      }

      this.emit('cache-miss', { key });
      return null;

    } catch (error) {
      this.metrics.errors++;
      this.emit('error', { operation: 'get', key, error });
      console.error('[Cache] Get error:', error);
      return null;
    }
  }

  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<boolean>} Success status
   */
  async set(key, value, ttl = null) {
    try {
      const effectiveTTL = ttl || this.options.l1.stdTTL;

      // Set in L1
      this.l1.set(key, value, effectiveTTL);

      // Set in L2 if available
      if (this.l2Available && this.l2) {
        const serialized = this.serialize(value);
        await this.l2.setex(key, effectiveTTL, serialized);
      }

      this.metrics.sets++;
      this.emit('cache-set', { key, ttl: effectiveTTL });

      return true;

    } catch (error) {
      this.metrics.errors++;
      this.emit('error', { operation: 'set', key, error });
      console.error('[Cache] Set error:', error);
      return false;
    }
  }

  /**
   * Delete key from cache
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} Success status
   */
  async del(key) {
    try {
      // Delete from L1
      this.l1.del(key);

      // Delete from L2 if available
      if (this.l2Available && this.l2) {
        await this.l2.del(key);
      }

      this.metrics.deletes++;
      this.emit('cache-delete', { key });

      return true;

    } catch (error) {
      this.metrics.errors++;
      this.emit('error', { operation: 'del', key, error });
      console.error('[Cache] Delete error:', error);
      return false;
    }
  }

  /**
   * Delete multiple keys
   * @param {Array<string>} keys - Array of cache keys
   * @returns {Promise<number>} Number of keys deleted
   */
  async delMultiple(keys) {
    let deleted = 0;

    for (const key of keys) {
      if (await this.del(key)) {
        deleted++;
      }
    }

    return deleted;
  }

  /**
   * Check if key exists
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} Existence status
   */
  async has(key) {
    // Check L1
    if (this.l1.has(key)) {
      return true;
    }

    // Check L2 if available
    if (this.l2Available && this.l2) {
      const exists = await this.l2.exists(key);
      return exists === 1;
    }

    return false;
  }

  /**
   * Get or set pattern - retrieve from cache or compute and store
   * @param {string} key - Cache key
   * @param {Function} fetchFn - Function to fetch data if not cached
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<any>} Cached or fetched value
   */
  async getOrSet(key, fetchFn, ttl = null) {
    // Try to get from cache
    const cached = await this.get(key);
    if (cached !== null) {
      return cached;
    }

    // Fetch fresh data
    try {
      const value = await fetchFn();

      // Store in cache
      await this.set(key, value, ttl);

      return value;

    } catch (error) {
      this.emit('error', { operation: 'getOrSet', key, error });
      throw error;
    }
  }

  /**
   * Flush all caches
   * @returns {Promise<void>}
   */
  async flush() {
    // Flush L1
    this.l1.flushAll();

    // Flush L2 if available
    if (this.l2Available && this.l2) {
      await this.l2.flushdb();
    }

    this.emit('cache-flushed');
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    const l1Stats = this.l1.getStats();

    const totalRequests = this.metrics.l1Hits + this.metrics.l1Misses;
    const l1HitRate = totalRequests > 0
      ? (this.metrics.l1Hits / totalRequests) * 100
      : 0;

    const l2Requests = this.metrics.l2Hits + this.metrics.l2Misses;
    const l2HitRate = l2Requests > 0
      ? (this.metrics.l2Hits / l2Requests) * 100
      : 0;

    return {
      l1: {
        keys: l1Stats.keys,
        hits: this.metrics.l1Hits,
        misses: this.metrics.l1Misses,
        hitRate: l1HitRate.toFixed(2) + '%',
        ksize: l1Stats.ksize,
        vsize: l1Stats.vsize
      },
      l2: {
        available: this.l2Available,
        hits: this.metrics.l2Hits,
        misses: this.metrics.l2Misses,
        hitRate: l2HitRate.toFixed(2) + '%'
      },
      operations: {
        sets: this.metrics.sets,
        deletes: this.metrics.deletes,
        errors: this.metrics.errors
      }
    };
  }

  /**
   * Serialize value for storage
   * @param {any} value - Value to serialize
   * @returns {string} Serialized value
   */
  serialize(value) {
    try {
      return JSON.stringify(value);
    } catch (error) {
      console.error('[Cache] Serialization error:', error);
      return '';
    }
  }

  /**
   * Deserialize value from storage
   * @param {string} value - Serialized value
   * @returns {any} Deserialized value
   */
  deserialize(value) {
    try {
      return JSON.parse(value);
    } catch (error) {
      console.error('[Cache] Deserialization error:', error);
      return null;
    }
  }

  /**
   * Close all cache connections
   * @returns {Promise<void>}
   */
  async close() {
    this.l1.close();

    if (this.l2) {
      await this.l2.quit();
    }

    this.emit('closed');
  }

  /**
   * Warm up cache with initial data
   * @param {Object} data - Key-value pairs to cache
   * @returns {Promise<void>}
   */
  async warmup(data) {
    console.log('[Cache] Warming up cache...');

    const promises = Object.entries(data).map(([key, value]) => {
      return this.set(key, value);
    });

    await Promise.all(promises);

    console.log(`[Cache] Warmed up ${Object.keys(data).length} keys`);
  }
}

// Export singleton instance
let cacheInstance = null;

export function createCacheManager(options) {
  if (!cacheInstance) {
    cacheInstance = new CacheManager(options);
  }
  return cacheInstance;
}

export function getCacheManager() {
  if (!cacheInstance) {
    throw new Error('Cache manager not initialized. Call createCacheManager() first.');
  }
  return cacheInstance;
}

export default CacheManager;
