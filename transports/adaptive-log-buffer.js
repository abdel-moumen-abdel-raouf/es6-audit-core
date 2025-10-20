/**
 * Adaptive LogBuffer with Memory Management and Backpressure Handling
 * 
 * Features:
 * - Buffer size control (number of entries and memory)
 * - High water mark detection and throttling
 * - Backpressure handling for high load
 * - Drain and dry callbacks
 * - ✅ Mutex for race condition protection
 * - Detailed statistics
 */

import { Mutex } from '../sync/mutex.js';

export class AdaptiveLogBuffer {
  constructor(config = {}) {
    
    this.maxSize = config.maxSize ?? 1000;           // Max entries
    this.maxMemory = config.maxMemory ?? 50 * 1024 * 1024;  // 50MB
    
    
    this.flushInterval = config.flushInterval ?? 1000;      // 1 second
    this.highWaterMark = config.highWaterMark ?? 0.8;       // 80% full
    this.lowWaterMark = config.lowWaterMark ?? 0.5;         
    
    
    this.buffer = [];
    this.memoryUsage = 0;
    this.flushTimer = null;
    this.listeners = [];
    
    
    this.mutex = new Mutex();
    
    // Backpressure handling
    this.isPaused = false;
    this.drainCallbacks = [];

    
    this.stats = {
      totalPushed: 0,
      totalFlushed: 0,
      timesFulled: 0,
      timesPaused: 0,
      timesResumed: 0
    };
  }

  /**
   * @returns {boolean} true if entry accepted, false if backpressure active
   */
  async push(logEntry) {
    
    return this.mutex.runExclusive(async () => {
      
      if (this.isFull()) {
        if (this.isPaused) {
          // Buffer is full and paused, return false for backpressure
          this.stats.timesFulled++;
          return false;
        } else {
          // Force flush oldest entries (garbage collection)
          this._forceFlush(Math.floor(this.maxSize * 0.25)); // Flush 25%
        }
      }

      
      this.buffer.push(logEntry);
      this.stats.totalPushed++;
      
      
      this.memoryUsage += this._estimateSize(logEntry);

      
      const utilizationPercent = this.buffer.length / this.maxSize;
      if (utilizationPercent > this.highWaterMark && !this.isPaused) {
        this._pause();
      }

      
      if (!this.flushTimer && this.buffer.length > 0) {
        this._flushSoon();
      }

      return true;
    });
  }

  /**
 * 
 */
  _pause() {
    this.isPaused = true;
    this.stats.timesPaused++;
    
    
    this._flushSoon(100); // Urgent flush
  }

  /**
 * 
 */
  _resume() {
    this.isPaused = false;
    this.stats.timesResumed++;
    
    
    const callbacks = this.drainCallbacks.splice(0);
    for (const callback of callbacks) {
      try {
        callback();
      } catch (e) {
        console.error('Error in drain callback:', e);
      }
    }
  }

  /**
 * 
 */
  onDrain(callback) {
    if (!this.isPaused) {
      
      try {
        callback();
      } catch (e) {
        console.error('Error in drain callback:', e);
      }
    } else {
      
      this.drainCallbacks.push(callback);
    }
  }

  /**
 * 
 */
  isFull() {
    return this.buffer.length >= this.maxSize ||
           this.memoryUsage >= this.maxMemory;
  }

  /**
 * 
 */
  _forceFlush(count) {
    const entries = this.buffer.splice(0, count);
    
    
    for (const entry of entries) {
      this.memoryUsage -= this._estimateSize(entry);
    }

    
    this._notifyListeners(entries);
    this.stats.totalFlushed += entries.length;
    
    
    const utilizationPercent = this.buffer.length / this.maxSize;
    if (utilizationPercent < this.lowWaterMark && this.isPaused) {
      this._resume();
    }
  }

  /**
 * 
 */
  _flushSoon(delayMs = this.flushInterval) {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      if (this.buffer.length > 0) {
        this.flush();
      }
    }, delayMs);
  }

  /**
 * 
 */
  async flush() {
    
    return this.mutex.runExclusive(async () => {
      if (this.buffer.length === 0) return;

      
      const entries = [...this.buffer];
      
      
      this.buffer = [];
      this.memoryUsage = 0;
      
      this._notifyListeners(entries);
      this.stats.totalFlushed += entries.length;

      
      if (this.isPaused) {
        this._resume();
      }

      return entries;
    });
  }

  /**
 * 
 */
  async peek(count) {
    
    return this.mutex.runExclusive(async () => {
      return this.buffer.slice(0, count);
    });
  }

  /**
 * 
 */
  async clear() {
    
    return this.mutex.runExclusive(async () => {
      const size = this.buffer.length;
      this.buffer = [];
      this.memoryUsage = 0;
      if (this.flushTimer) {
        clearTimeout(this.flushTimer);
        this.flushTimer = null;
      }
      return size;
    });
  }

  /**
 * 
 */
  _notifyListeners(entries) {
    for (const listener of this.listeners) {
      try {
        listener(entries);
      } catch (e) {
        console.error('Error in flush listener:', e);
      }
    }
  }

  /**
 * 
 */
  _estimateSize(logEntry) {
    
    try {
      return JSON.stringify(logEntry).length * 2;
    } catch (e) {
      // Default estimate if stringify fails
      return 100;
    }
  }

  /**
 * 
 */
  onFlush(callback) {
    this.listeners.push(callback);
    return this;
  }

  /**
 * 
 */
  removeFlushListener(callback) {
    const index = this.listeners.indexOf(callback);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
    return this;
  }

  /**
 * 
 */
  getStatistics() {
    return {
      
      entriesCount: this.buffer.length,
      memoryUsageMB: (this.memoryUsage / 1024 / 1024).toFixed(2),
      memoryUsageBytes: this.memoryUsage,
      
      
      maxSize: this.maxSize,
      maxMemoryMB: (this.maxMemory / 1024 / 1024).toFixed(0),
      highWaterMark: (this.highWaterMark * 100).toFixed(0) + '%',
      lowWaterMark: (this.lowWaterMark * 100).toFixed(0) + '%',
      
      
      utilizationByCount: ((this.buffer.length / this.maxSize) * 100).toFixed(1) + '%',
      utilizationByMemory: ((this.memoryUsage / this.maxMemory) * 100).toFixed(1) + '%',
      
      
      isPaused: this.isPaused,
      isFull: this.isFull(),
      listenersCount: this.listeners.length,
      
      
      ...this.stats
    };
  }

  /**
 * 
 */
  printStatistics() {
    const stats = this.getStatistics();
    console.log('\n=== BUFFER STATISTICS ===');
    console.log(`Entries: ${stats.entriesCount}/${stats.maxSize} (${stats.utilizationByCount})`);
    console.log(`Memory: ${stats.memoryUsageMB}MB/${stats.maxMemoryMB}MB (${stats.utilizationByMemory})`);
    console.log(`Status: ${stats.isPaused ? 'PAUSED (backpressure)' : 'ACTIVE'} | Full: ${stats.isFull}`);
    console.log(`\nStatistics:`);
    console.log(`  Total Pushed: ${stats.totalPushed}`);
    console.log(`  Total Flushed: ${stats.totalFlushed}`);
    console.log(`  Times Filled: ${stats.timesFulled}`);
    console.log(`  Times Paused: ${stats.timesPaused}`);
    console.log(`  Times Resumed: ${stats.timesResumed}`);
    console.log(`  Listeners: ${stats.listenersCount}`);
    console.log('========================\n');
  }

  /**
 * 
 */
  getStatus() {
    return {
      size: this.buffer.length,
      maxSize: this.maxSize,
      memory: this.memoryUsage,
      maxMemory: this.maxMemory,
      isPaused: this.isPaused,
      isFull: this.isFull()
    };
  }

  /**
 * 
 */
  destroy() {
    this.flush();
    this.clear();
    this.listeners = [];
    this.drainCallbacks = [];
  }
}
