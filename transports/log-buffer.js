/**
 * LogBuffer - Buffer and batch log entries for better performance
 * 
 * Features:
 * - Efficient buffering of log entries
 * - Automatic flushing on size or time threshold
 * - Batch processing support
 * - Configurable buffer size and flush interval
 * - Graceful shutdown with final flush
 * 
 * @author audit-core
 * @version 1.0.0
 */

import { LoggingError } from '../error-handling/errors.js';

class LogBuffer {
  /**
   * Initialize log buffer
   * 
   * @param {Object} [options={}] - Configuration options
   * @param {number} [options.maxSize=100] - Max buffer size before auto-flush
   * @param {number} [options.flushInterval=5000] - Auto-flush interval in ms (default: 5s)
   * @param {Function} [options.onFlush] - Callback when buffer flushes
   * @throws {LoggingError} If configuration is invalid
   */
  constructor(options = {}) {
    this._validateOptions(options);
    
    this.maxSize = options.maxSize ?? 100;
    this.flushInterval = options.flushInterval ?? 5000; // 5 seconds
    this.onFlush = options.onFlush || null;
    
    this._buffer = [];
    this._flushTimer = null;
    this._isRunning = false;
    this._isPaused = false;
    this._stats = {
      entriesAdded: 0,
      entriesFlushed: 0,
      flushCount: 0,
      autoFlushCount: 0
    };
  }
  
  /**
   * Validate options
   * @private
   * @param {Object} options - Options to validate
   * @throws {LoggingError}
   */
  _validateOptions(options) {
    if (options.maxSize && (typeof options.maxSize !== 'number' || options.maxSize < 1)) {
      throw new LoggingError(
        'INVALID_CONFIG',
        'maxSize must be a number >= 1',
        { receivedMaxSize: options.maxSize }
      );
    }
    
    if (options.flushInterval && (typeof options.flushInterval !== 'number' || options.flushInterval < 1)) {
      throw new LoggingError(
        'INVALID_CONFIG',
        'flushInterval must be a number >= 1',
        { receivedFlushInterval: options.flushInterval }
      );
    }
    
    if (options.onFlush && typeof options.onFlush !== 'function') {
      throw new LoggingError(
        'INVALID_CONFIG',
        'onFlush must be a function'
      );
    }
  }
  
  /**
   * Add entry to buffer
   * 
   * @param {LogEntry} entry - Entry to add
   * @returns {Object} Buffer state
   * @throws {LoggingError} If entry is invalid
   */
  add(entry) {
    if (!entry) {
      throw new LoggingError(
        'INVALID_ENTRY',
        'Entry cannot be null or undefined'
      );
    }
    
    if (this._isPaused) {
      throw new LoggingError(
        'BUFFER_PAUSED',
        'Buffer is paused and cannot accept new entries'
      );
    }
    
    this._buffer.push(entry);
    this._stats.entriesAdded++;
    
    // Auto-flush if buffer size exceeded
    if (this._buffer.length >= this.maxSize) {
      this.flush(true); // Pass true to indicate auto-flush
    }
    
    return this.getState();
  }
  
  /**
   * Add multiple entries at once
   * 
   * @param {Array<LogEntry>} entries - Entries to add
   * @returns {Object} Buffer state
   * @throws {LoggingError} If entries are invalid
   */
  addBatch(entries) {
    if (!Array.isArray(entries)) {
      throw new LoggingError(
        'INVALID_INPUT',
        'entries must be an array'
      );
    }
    
    if (entries.length === 0) {
      throw new LoggingError(
        'EMPTY_BATCH',
        'Batch cannot be empty'
      );
    }
    
    for (const entry of entries) {
      if (!entry) {
        throw new LoggingError(
          'INVALID_ENTRY',
          'Batch contains null or undefined entry'
        );
      }
    }
    
    this._buffer.push(...entries);
    this._stats.entriesAdded += entries.length;
    
    // Auto-flush if buffer size exceeded
    if (this._buffer.length >= this.maxSize) {
      this.flush(true); // Pass true to indicate auto-flush
    }
    
    return this.getState();
  }
  
  /**
   * Flush buffer (get entries and clear)
   * 
   * @param {boolean} [isAutoFlush=false] - Whether this is an auto-flush
   * @returns {Array<LogEntry>} Flushed entries
   */
  flush(isAutoFlush = false) {
    if (this._buffer.length === 0) {
      return [];
    }
    
    const entries = this._buffer.splice(0);
    this._stats.entriesFlushed += entries.length;
    this._stats.flushCount++;
    
    if (isAutoFlush) {
      this._stats.autoFlushCount++;
    }
    
    // Call flush callback if provided
    if (this.onFlush) {
      try {
        this.onFlush(entries, {
          isAutoFlush,
          bufferSize: this._buffer.length,
          stats: { ...this._stats }
        });
      } catch (error) {
        console.warn('Flush callback error:', error.message);
      }
    }
    
    return entries;
  }
  
  /**
   * Peek at buffer without removing entries
   * 
   * @param {number} [count] - Number of entries to peek (default: all)
   * @returns {Array<LogEntry>}
   */
  peek(count = null) {
    if (count === null) {
      return [...this._buffer];
    }
    return this._buffer.slice(0, count);
  }
  
  /**
   * Start automatic flush timer
   * 
   * @returns {void}
   * @throws {LoggingError} If already started
   */
  start() {
    if (this._isRunning) {
      throw new LoggingError(
        'ALREADY_STARTED',
        'Buffer timer is already running'
      );
    }
    
    this._isRunning = true;
    this._flushTimer = setInterval(() => {
      if (this._buffer.length > 0) {
        this.flush(true); // Auto-flush
      }
    }, this.flushInterval);
  }
  
  /**
   * Stop automatic flush timer
   * 
   * @returns {Object} Statistics
   */
  stop() {
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
    
    this._isRunning = false;
    
    // Final flush before stopping
    if (this._buffer.length > 0) {
      this.flush();
    }
    
    return this.getStats();
  }
  
  /**
   * Pause buffer (reject new entries)
   * 
   * @returns {Object} Current stats
   */
  pause() {
    this._isPaused = true;
    return this.getStats();
  }
  
  /**
   * Resume buffer (accept new entries)
   * 
   * @returns {Object} Current stats
   */
  resume() {
    this._isPaused = false;
    return this.getStats();
  }
  
  /**
   * Clear buffer without flushing
   * 
   * @returns {number} Number of entries cleared
   */
  clear() {
    const count = this._buffer.length;
    this._buffer = [];
    return count;
  }
  
  /**
   * Get current buffer state
   * 
   * @returns {Object} State object
   */
  getState() {
    return {
      size: this._buffer.length,
      maxSize: this.maxSize,
      isFull: this._buffer.length >= this.maxSize,
      isEmpty: this._buffer.length === 0,
      isRunning: this._isRunning,
      isPaused: this._isPaused,
      stats: { ...this._stats }
    };
  }
  
  /**
   * Get buffer statistics
   * 
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      entriesAdded: this._stats.entriesAdded,
      entriesFlushed: this._stats.entriesFlushed,
      entriesPending: this._buffer.length,
      flushCount: this._stats.flushCount,
      autoFlushCount: this._stats.autoFlushCount,
      manualFlushCount: this._stats.flushCount - this._stats.autoFlushCount,
      averageFlushSize: this._stats.flushCount > 0 
        ? this._stats.entriesFlushed / this._stats.flushCount 
        : 0,
      efficiency: this._stats.entriesAdded > 0 
        ? ((this._stats.entriesFlushed / this._stats.entriesAdded) * 100).toFixed(2) + '%'
        : '0%'
    };
  }
  
  /**
   * Get configuration
   * 
   * @returns {Object} Configuration
   */
  getConfig() {
    return {
      maxSize: this.maxSize,
      flushInterval: this.flushInterval,
      hasFlushCallback: this.onFlush !== null
    };
  }
  
  /**
   * Update configuration
   * 
   * @param {Object} options - New options
   * @throws {LoggingError} If options are invalid
   */
  updateConfig(options) {
    this._validateOptions(options);
    
    if (options.maxSize !== undefined) {
      this.maxSize = options.maxSize;
    }
    
    if (options.flushInterval !== undefined) {
      // Restart timer with new interval if running
      if (this._isRunning) {
        this.stop();
        this.flushInterval = options.flushInterval;
        this.start();
      } else {
        this.flushInterval = options.flushInterval;
      }
    }
    
    if (options.onFlush !== undefined) {
      this.onFlush = options.onFlush;
    }
  }
}

export default LogBuffer;

