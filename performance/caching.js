/**
 * ============================================================================
 * ============================================================================
 *
 * Purpose:
 *   - Cache frequently accessed data with TTL support
 *   - Implement LRU (Least Recently Used) eviction strategy
 *   - Track cache hit/miss statistics
 *   - Support multiple cache layers and strategies
 *
 * Architecture:
 *   - LRU eviction: Remove least recently used items when full
 *   - TTL support: Auto-expire items after timeout
 *   - Key compression: Hash keys for storage efficiency
 *   - Statistics tracking: Hit rate, evictions, memory usage
 */

import crypto from 'crypto';
import { EventEmitter } from 'events';

export class CachingManager extends EventEmitter {
  constructor(options = {}) {
    super();

    // Configuration
    this.maxSize = options.maxSize || 1000;
    this.ttl = options.ttl || 3600000; // 1 hour default
    this.useCompression = options.useCompression || false;
    this.maxItemSize = options.maxItemSize || 10 * 1024 * 1024; // 10MB

    // Storage
    this.cache = new Map();
    this.accessOrder = []; // For LRU tracking
    this.expirationTimers = new Map();

    // Statistics
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expirations: 0,
      sets: 0,
      deletes: 0,
      totalItemSize: 0,
      currentSize: 0,
      peakSize: 0,
      avgItemSize: 0,
      hitRate: 0,
    };
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {*} Cached value or undefined
   */
  get(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      this._updateHitRate();
      return undefined;
    }

    // Check if expired
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this._remove(key);
      this.stats.misses++;
      this._updateHitRate();
      return undefined;
    }

    // Update LRU order
    this._updateAccessOrder(key);

    this.stats.hits++;
    this._updateHitRate();

    entry.accessCount++;
    entry.lastAccessed = Date.now();

    return entry.value;
  }

  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {Object} options - Set options (ttl, priority)
   * @returns {boolean} Success
   */
  set(key, value, options = {}) {
    const itemTtl = options.ttl || this.ttl;
    const priority = options.priority || 'normal';

    // Check item size
    const itemSize = this._estimateSize(value);
    if (itemSize > this.maxItemSize) {
      throw new Error(`Item size ${itemSize} exceeds max ${this.maxItemSize}`);
    }

    // Remove old value if exists
    if (this.cache.has(key)) {
      const oldSize = this._estimateSize(this.cache.get(key).value);
      this.stats.totalItemSize -= oldSize;
    } else {
      this.stats.sets++;
    }

    // Create entry
    const entry = {
      value,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      expiresAt: Date.now() + itemTtl,
      priority,
      accessCount: 1,
      size: itemSize,
    };

    // Add to cache
    this.cache.set(key, entry);
    this.stats.totalItemSize += itemSize;
    this.stats.currentSize = this.cache.size;
    this.stats.peakSize = Math.max(this.stats.peakSize, this.cache.size);
    this.stats.avgItemSize = this.stats.totalItemSize / Math.max(1, this.cache.size);

    // Update LRU order
    this._updateAccessOrder(key);

    // Set expiration timer
    this._setExpirationTimer(key, itemTtl);

    // Evict if necessary
    while (this.cache.size > this.maxSize) {
      this._evictLRU();
    }

    this.emit('set', { key, size: itemSize, ttl: itemTtl });
    return true;
  }

  /**
   * Delete from cache
   * @param {string} key - Cache key
   * @returns {boolean} Success
   */
  delete(key) {
    return this._remove(key);
  }

  /**
   * Check if key exists in cache
   * @param {string} key - Cache key
   * @returns {boolean}
   */
  has(key) {
    const entry = this.cache.get(key);

    if (!entry) return false;

    // Check expiration
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this._remove(key);
      return false;
    }

    return true;
  }

  /**
   * Clear entire cache
   * @returns {number} Number of items cleared
   */
  clear() {
    // Clear expiration timers
    for (const timer of this.expirationTimers.values()) {
      clearTimeout(timer);
    }

    const count = this.cache.size;
    this.cache.clear();
    this.accessOrder = [];
    this.expirationTimers.clear();

    this.stats.currentSize = 0;
    this.stats.totalItemSize = 0;

    this.emit('cleared', { count });
    return count;
  }

  /**
   * Get keys matching pattern
   * @param {string|RegExp} pattern - Key pattern
   * @returns {Array} Matching keys
   */
  keys(pattern) {
    const keys = Array.from(this.cache.keys());

    if (!pattern) return keys;

    if (typeof pattern === 'string') {
      return keys.filter((k) => k.includes(pattern));
    }

    if (pattern instanceof RegExp) {
      return keys.filter((k) => pattern.test(k));
    }

    return keys;
  }

  /**
   * Get cache statistics
   * @returns {Object} Statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      hitRate: (this.stats.hitRate * 100).toFixed(2) + '%',
      avgItemSize: this.stats.avgItemSize.toFixed(2) + ' bytes',
      peakSize: this.stats.peakSize,
      currentItems: this.cache.size,
      maxItems: this.maxSize,
    };
  }

  /**
   * Reset statistics
   */
  resetStatistics() {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expirations: 0,
      sets: 0,
      deletes: 0,
      totalItemSize: 0,
      currentSize: this.cache.size,
      peakSize: this.cache.size,
      avgItemSize: 0,
      hitRate: 0,
    };
  }

  /**
   * Update LRU access order
   * @private
   */
  _updateAccessOrder(key) {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }

  /**
   * Evict least recently used item
   * @private
   */
  _evictLRU() {
    // Find the least recently used item (first in accessOrder)
    const lruKey = this.accessOrder.shift();

    if (lruKey) {
      const entry = this.cache.get(lruKey);
      if (entry) {
        this.stats.totalItemSize -= entry.size;
      }

      this.cache.delete(lruKey);
      this.stats.evictions++;

      this.emit('evicted', { key: lruKey });
    }
  }

  /**
   * Remove item and cleanup
   * @private
   */
  _remove(key) {
    if (!this.cache.has(key)) return false;

    const entry = this.cache.get(key);
    this.stats.totalItemSize -= entry.size;
    this.stats.deletes++;

    // Clear expiration timer
    if (this.expirationTimers.has(key)) {
      clearTimeout(this.expirationTimers.get(key));
      this.expirationTimers.delete(key);
    }

    // Remove from access order
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }

    this.cache.delete(key);
    this.stats.currentSize = this.cache.size;

    return true;
  }

  /**
   * Set expiration timer for item
   * @private
   */
  _setExpirationTimer(key, ttl) {
    // Clear existing timer
    if (this.expirationTimers.has(key)) {
      clearTimeout(this.expirationTimers.get(key));
    }

    // Don't set timer if TTL is very long (prevent memory issues)
    if (ttl > 24 * 60 * 60 * 1000) {
      // 24 hours
      return;
    }

    const timer = setTimeout(() => {
      if (this.cache.has(key)) {
        this.stats.expirations++;
        this._remove(key);
        this.emit('expired', { key });
      }
    }, ttl);

    this.expirationTimers.set(key, timer);
  }

  /**
   * Estimate item size in bytes
   * @private
   */
  _estimateSize(value) {
    if (value === null || value === undefined) return 0;

    if (typeof value === 'string') {
      return value.length * 2; // UTF-16 encoding
    }

    if (typeof value === 'number') {
      return 8;
    }

    if (typeof value === 'boolean') {
      return 4;
    }

    if (Buffer.isBuffer(value)) {
      return value.length;
    }

    if (Array.isArray(value)) {
      return value.reduce((sum, item) => sum + this._estimateSize(item), 0);
    }

    if (typeof value === 'object') {
      return Object.values(value).reduce((sum, item) => sum + this._estimateSize(item), 0);
    }

    return 0;
  }

  /**
   * Update hit rate statistic
   * @private
   */
  _updateHitRate() {
    const total = this.stats.hits + this.stats.misses;
    if (total > 0) {
      this.stats.hitRate = this.stats.hits / total;
    }
  }
}

export default CachingManager;
