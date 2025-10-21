/**
 * Log Buffer System
 *
 * Buffers log entries for batch processing and performance optimization
 */

/**
 * Log Buffer
 * Collects log entries before sending to transports
 */
class LogBuffer {
  /**
   * Create log buffer
   * @param {Object} options - Configuration options
   * @param {number} [options.maxSize] - Max buffer size before flush (100 default)
   * @param {number} [options.flushInterval] - Auto-flush interval in ms (5000 default)
   * @param {number} [options.maxQueueSize] - Max queue size before blocking (10000 default)
   * @param {Function} [options.onFlush] - Callback on flush
   */
  constructor(options = {}) {
    this.maxSize = options.maxSize ?? 100;
    this.flushInterval = options.flushInterval ?? 5000;
    this.maxQueueSize = options.maxQueueSize ?? 10000;
    this.onFlush = options.onFlush ?? null;

    this.buffer = [];
    this.flushTimer = null;
    this.isRunning = false;
    this.isProcessing = false;

    this.validateOptions();
  }

  /**
   * Validate options
   * @throws {Error} If options invalid
   */
  validateOptions() {
    if (this.maxSize <= 0) {
      throw new Error('maxSize must be positive');
    }
    if (this.flushInterval <= 0) {
      throw new Error('flushInterval must be positive');
    }
    if (this.maxQueueSize <= 0) {
      throw new Error('maxQueueSize must be positive');
    }
  }

  /**
   * Start buffer (auto-flush)
   * @returns {LogBuffer} This (for chaining)
   */
  start() {
    if (this.isRunning) {
      return this;
    }

    this.isRunning = true;
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushInterval);

    return this;
  }

  /**
   * Stop buffer (flush remaining)
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Final flush
    await this.flush();
  }

  /**
   * Add entry to buffer
   * @param {*} entry - Entry to add
   * @returns {boolean} True if added, false if queue full
   */
  add(entry) {
    if (this.buffer.length >= this.maxQueueSize) {
      console.warn('Log buffer queue full, entry dropped');
      return false;
    }

    this.buffer.push(entry);

    // Auto-flush if buffer full
    if (this.buffer.length >= this.maxSize) {
      this.flush();
    }

    return true;
  }

  /**
   * Flush buffer (synchronous)
   * @returns {Array} Flushed entries
   */
  flush() {
    if (this.buffer.length === 0) {
      return [];
    }

    const entries = this.buffer.splice(0);

    // Call flush callback
    if (this.onFlush) {
      try {
        this.onFlush(entries);
      } catch (error) {
        console.error('Error in buffer flush callback:', error);
      }
    }

    return entries;
  }

  /**
   * Async flush (for async operations)
   * @returns {Promise<Array>} Flushed entries
   */
  async flushAsync() {
    if (this.isProcessing) {
      return [];
    }

    this.isProcessing = true;
    try {
      return await Promise.resolve(this.flush());
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Peek at buffer
   * @param {number} [count] - Number of entries to peek (all by default)
   * @returns {Array} Copy of buffer entries
   */
  peek(count = null) {
    if (count === null) {
      return [...this.buffer];
    }
    return this.buffer.slice(0, count);
  }

  /**
   * Get buffer size
   * @returns {number} Number of entries in buffer
   */
  size() {
    return this.buffer.length;
  }

  /**
   * Check if buffer is full
   * @returns {boolean} True if full
   */
  isFull() {
    return this.buffer.length >= this.maxSize;
  }

  /**
   * Check if buffer is empty
   * @returns {boolean} True if empty
   */
  isEmpty() {
    return this.buffer.length === 0;
  }

  /**
   * Clear buffer
   * @returns {Array} Cleared entries
   */
  clear() {
    const entries = this.buffer.splice(0);
    return entries;
  }

  /**
   * Get buffer stats
   * @returns {Object} Buffer statistics
   */
  getStats() {
    return {
      size: this.buffer.length,
      maxSize: this.maxSize,
      isFull: this.isFull(),
      isEmpty: this.isEmpty(),
      flushInterval: this.flushInterval,
      maxQueueSize: this.maxQueueSize,
      isRunning: this.isRunning,
      utilizationPercent: ((this.buffer.length / this.maxSize) * 100).toFixed(2),
    };
  }
}

/**
 * Async Buffer Queue
 * For async processing with backpressure handling
 */
class AsyncLogBuffer {
  /**
   * Create async buffer
   * @param {Object} options - Configuration options
   * @param {number} [options.maxSize] - Max buffer size
   * @param {number} [options.flushInterval] - Auto-flush interval
   * @param {number} [options.maxQueueSize] - Max queue size
   */
  constructor(options = {}) {
    this.maxSize = options.maxSize ?? 100;
    this.flushInterval = options.flushInterval ?? 5000;
    this.maxQueueSize = options.maxQueueSize ?? 10000;

    this.buffer = [];
    this.waitList = [];
    this.flushTimer = null;
    this.isRunning = false;
  }

  /**
   * Add entry with backpressure handling
   * @param {*} entry - Entry to add
   * @returns {Promise<boolean>} True if added
   */
  async add(entry) {
    // If queue full, wait until space available
    while (this.buffer.length >= this.maxQueueSize) {
      await new Promise((resolve) => {
        this.waitList.push(resolve);
      });
    }

    this.buffer.push(entry);

    // Auto-flush if full
    if (this.buffer.length >= this.maxSize) {
      await this.flush();
    }

    return true;
  }

  /**
   * Flush async buffer
   * @returns {Promise<Array>} Flushed entries
   */
  async flush() {
    if (this.buffer.length === 0) {
      return [];
    }

    const entries = this.buffer.splice(0);

    // Resolve waiting processes
    const waiters = this.waitList.splice(0);
    for (const waiter of waiters) {
      waiter();
    }

    return entries;
  }

  /**
   * Start auto-flush
   * @returns {AsyncLogBuffer} This (for chaining)
   */
  start() {
    if (this.isRunning) {
      return this;
    }

    this.isRunning = true;
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushInterval);

    return this;
  }

  /**
   * Stop auto-flush
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Final flush
    await this.flush();
  }

  /**
   * Get size
   * @returns {number} Buffer size
   */
  size() {
    return this.buffer.length;
  }

  /**
   * Get stats
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      size: this.buffer.length,
      maxSize: this.maxSize,
      waiting: this.waitList.length,
      flushInterval: this.flushInterval,
      isRunning: this.isRunning,
    };
  }
}

/**
 * Batch Processor
 * Processes buffer entries in batches
 */
class BatchProcessor {
  /**
   * Create batch processor
   * @param {Function} processor - Function to process batch
   * @param {Object} options - Configuration options
   */
  constructor(processor, options = {}) {
    if (typeof processor !== 'function') {
      throw new Error('Processor must be a function');
    }

    this.processor = processor;
    this.batchSize = options.batchSize ?? 50;
    this.maxBatches = options.maxBatches ?? 10;
  }

  /**
   * Process entries in batches
   * @param {Array} entries - Entries to process
   * @returns {Promise<Array>} Processing results
   */
  async processBatches(entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
      return [];
    }

    const results = [];
    const batches = this._createBatches(entries);

    for (const batch of batches) {
      try {
        const result = await Promise.resolve(this.processor(batch));
        results.push({
          success: true,
          batch: batch,
          result: result,
        });
      } catch (error) {
        results.push({
          success: false,
          batch: batch,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Create batches from entries
   * @param {Array} entries - Entries
   * @returns {Array<Array>} Batches
   */
  _createBatches(entries) {
    const batches = [];

    for (let i = 0; i < entries.length; i += this.batchSize) {
      batches.push(entries.slice(i, i + this.batchSize));

      if (batches.length >= this.maxBatches) {
        break;
      }
    }

    return batches;
  }

  /**
   * Get stats
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      batchSize: this.batchSize,
      maxBatches: this.maxBatches,
    };
  }
}

export { LogBuffer, AsyncLogBuffer, BatchProcessor };
