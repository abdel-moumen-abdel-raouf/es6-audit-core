/**
 * Async Queue Manager
 *
 * 1. Backpressure Handling
 * 2. Priority-Based Processing
 * 3. Batch Processing Support
 * 4. Cancellation & Timeout
 */

import { EventEmitter } from 'events';

export class AsyncQueueManager extends EventEmitter {
  /**
   * Initialize Async Queue Manager
   * @param {Object} options - Configuration options
   */
  constructor(options = {}) {
    super();

    // Queue configuration
    this.queue = [];
    this.maxQueueSize = options.maxQueueSize || 10000; // Max items in queue
    this.maxConcurrent = options.maxConcurrent || 5; // Max parallel workers
    this.currentConcurrent = 0;

    // Processing configuration
    this.batchSize = options.batchSize || 1; // Items per batch
    this.batchTimeout = options.batchTimeout || 1000; // Wait time for batch
    this.processingTimeout = options.processingTimeout || 30000; // Per-task timeout

    // Backpressure thresholds
    this.backpressureThreshold = options.backpressureThreshold || 0.8; // 80% full
    this.backpressureMode = false;

    // Item tracking
    this.itemId = 0;
    this.activeItems = new Map(); // id -> item data
    this.completedItems = [];
    this.failedItems = [];

    // Statistics
    this.stats = {
      enqueued: 0,
      processed: 0,
      failed: 0,
      cancelled: 0,
      totalProcessingTime: 0,
      avgProcessingTime: 0,
      backpressureEvents: 0,
      batchesProcessed: 0,
    };

    this.history = [];
    this.maxHistory = options.maxHistory || 500;

    // Processing state
    this.processing = false;
    this.batchTimer = null;
  }

  /**
   * Add item to queue
   * @param {*} data - Item data
   * @param {Object} options - Item options
   * @returns {Promise} Promise that resolves when item is processed
   */
  enqueue(data, options = {}) {
    return new Promise((resolve, reject) => {
      // Check backpressure
      if (this._isBackpressured()) {
        this.backpressureMode = true;
        this.stats.backpressureEvents++;
        this.emit('backpressure', { queueSize: this.queue.length });
      }

      if (this.queue.length >= this.maxQueueSize) {
        const error = new Error('Queue is full - backpressure limit reached');
        this.stats.failed++;
        reject(error);
        return;
      }

      const itemId = ++this.itemId;
      const item = {
        id: itemId,
        data,
        priority: options.priority || 0,
        createdAt: Date.now(),
        timeout: options.timeout || this.processingTimeout,
        retryCount: 0,
        maxRetries: options.maxRetries || 0,
        batchGroup: options.batchGroup || null,
        resolve,
        reject,
      };

      this.queue.push(item);
      this.stats.enqueued++;
      this.activeItems.set(itemId, item);

      this._recordHistory('ITEM_ENQUEUED', {
        itemId,
        priority: item.priority,
        queueSize: this.queue.length,
      });

      // Trigger processing
      this._processQueue();
    });
  }

  /**
   * Check if queue is in backpressure
   * @private
   */
  _isBackpressured() {
    const fillRatio = this.queue.length / this.maxQueueSize;
    return fillRatio > this.backpressureThreshold;
  }

  /**
   * Process queue
   * @private
   */
  _processQueue() {
    if (this.processing || this.queue.length === 0) return;

    // Sort by priority (higher first)
    this.queue.sort((a, b) => b.priority - a.priority);

    // Create batches
    const batches = this._createBatches();

    if (batches.length > 0) {
      this.processing = true;
      this._processBatches(batches);
    }
  }

  /**
   * Create batches from queue
   * @private
   */
  _createBatches() {
    const batches = [];
    const availableSlots = this.maxConcurrent - this.currentConcurrent;

    while (this.queue.length > 0 && availableSlots > batches.length) {
      const batch = [];
      const batchGrouped = new Map();

      // Group items by batchGroup if specified
      while (this.queue.length > 0 && batch.length < this.batchSize) {
        const item = this.queue.shift();

        if (item.batchGroup) {
          if (!batchGrouped.has(item.batchGroup)) {
            batchGrouped.set(item.batchGroup, []);
          }
          batchGrouped.get(item.batchGroup).push(item);
        } else {
          batch.push(item);
        }

        if (batch.length >= this.batchSize) break;
      }

      // Add grouped items to batch
      for (const [group, items] of batchGrouped) {
        batch.push(...items);
        if (batch.length >= this.batchSize) {
          // Put excess back in queue
          const excess = batch.splice(this.batchSize);
          this.queue.unshift(...excess);
          break;
        }
      }

      if (batch.length > 0) {
        batches.push(batch);
      }
    }

    return batches;
  }

  /**
   * Process batches
   * @private
   */
  async _processBatches(batches) {
    const batchPromises = batches.map((batch) => this._processBatch(batch));

    try {
      await Promise.allSettled(batchPromises);
    } finally {
      this.processing = false;

      // Clear backpressure if below threshold
      if (!this._isBackpressured()) {
        this.backpressureMode = false;
        this.emit('backpressure-cleared', { queueSize: this.queue.length });
      }

      // Continue processing if items remain
      if (this.queue.length > 0) {
        setImmediate(() => this._processQueue());
      }
    }
  }

  /**
   * Process a batch of items
   * @private
   */
  async _processBatch(items) {
    this.currentConcurrent++;
    this.stats.batchesProcessed++;

    try {
      const startTime = Date.now();

      // Process all items in batch
      const results = await Promise.allSettled(items.map((item) => this._processItem(item)));

      const processingTime = Date.now() - startTime;
      this.stats.totalProcessingTime += processingTime;

      // Update average
      if (this.stats.processed > 0) {
        this.stats.avgProcessingTime = this.stats.totalProcessingTime / this.stats.processed;
      }

      // Handle results
      results.forEach((result, index) => {
        const item = items[index];
        if (result.status === 'fulfilled') {
          item.resolve(result.value);
          this.completedItems.push({
            id: item.id,
            data: item.data,
            result: result.value,
            processingTime,
          });
          this.stats.processed++;
        } else {
          this.failedItems.push({
            id: item.id,
            data: item.data,
            error: result.reason,
            retries: item.retryCount,
          });

          // Check if should retry
          if (item.retryCount < item.maxRetries) {
            item.retryCount++;
            this.queue.push(item);
          } else {
            item.reject(result.reason);
            this.stats.failed++;
          }
        }

        this.activeItems.delete(item.id);
      });

      this._recordHistory('BATCH_PROCESSED', {
        batchSize: items.length,
        processingTime,
        successCount: results.filter((r) => r.status === 'fulfilled').length,
      });
    } finally {
      this.currentConcurrent--;
    }
  }

  /**
   * Process a single item with timeout
   * @private
   */
  _processItem(item) {
    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        reject(new Error(`Item processing timeout after ${item.timeout}ms`));
      }, item.timeout);

      // Emit event for processing
      this.emit('process-item', item.data, (error, result) => {
        clearTimeout(timeoutHandle);

        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      });
    });
  }

  /**
   * Cancel an item in queue
   * @param {number} itemId - Item ID
   * @returns {boolean} Whether item was cancelled
   */
  cancel(itemId) {
    const item = this.activeItems.get(itemId);
    if (!item) return false;

    // Remove from queue
    const index = this.queue.findIndex((i) => i.id === itemId);
    if (index >= 0) {
      this.queue.splice(index, 1);
      this.activeItems.delete(itemId);
      this.stats.cancelled++;

      item.reject(new Error('Item was cancelled'));
      this._recordHistory('ITEM_CANCELLED', { itemId });

      return true;
    }

    return false;
  }

  /**
   * Get queue statistics
   * @returns {Object} Statistics
   */
  getStatistics() {
    return {
      queueSize: this.queue.length,
      maxQueueSize: this.maxQueueSize,
      activeItems: this.activeItems.size,
      currentConcurrent: this.currentConcurrent,
      maxConcurrent: this.maxConcurrent,
      backpressureMode: this.backpressureMode,
      enqueued: this.stats.enqueued,
      processed: this.stats.processed,
      failed: this.stats.failed,
      cancelled: this.stats.cancelled,
      totalProcessingTime: this.stats.totalProcessingTime,
      avgProcessingTime: Math.round(this.stats.avgProcessingTime * 100) / 100,
      backpressureEvents: this.stats.backpressureEvents,
      batchesProcessed: this.stats.batchesProcessed,
      completedItemsCount: this.completedItems.length,
      failedItemsCount: this.failedItems.length,
    };
  }

  /**
   * Get queue size
   * @returns {number} Current queue size
   */
  getQueueSize() {
    return this.queue.length;
  }

  /**
   * Get completed items
   * @param {number} limit - Max items to return
   * @returns {Array} Completed items
   */
  getCompletedItems(limit = 100) {
    return this.completedItems.slice(-limit);
  }

  /**
   * Get failed items
   * @param {number} limit - Max items to return
   * @returns {Array} Failed items
   */
  getFailedItems(limit = 100) {
    return this.failedItems.slice(-limit);
  }

  /**
   * Clear completed items history
   */
  clearCompletedItems() {
    const count = this.completedItems.length;
    this.completedItems = [];
    this._recordHistory('COMPLETED_ITEMS_CLEARED', { count });
    return count;
  }

  /**
   * Clear failed items history
   */
  clearFailedItems() {
    const count = this.failedItems.length;
    this.failedItems = [];
    this._recordHistory('FAILED_ITEMS_CLEARED', { count });
    return count;
  }

  /**
   * Wait for queue to empty
   * @param {number} timeout - Max wait time
   * @returns {Promise} Resolves when queue is empty
   */
  drain(timeout = null) {
    return new Promise((resolve, reject) => {
      let timeoutHandle;

      const checkDrain = () => {
        if (this.queue.length === 0 && this.currentConcurrent === 0) {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          resolve();
          return;
        }

        setImmediate(checkDrain);
      };

      if (timeout) {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`Drain timeout after ${timeout}ms`));
        }, timeout);
      }

      checkDrain();
    });
  }

  /**
   * Get history entries
   * @param {Object} filter - Filter criteria
   * @returns {Array} History entries
   */
  getHistory(filter = {}) {
    return this.history.filter((entry) => {
      if (filter.action && entry.action !== filter.action) return false;
      return true;
    });
  }

  /**
   * Record history entry
   * @private
   */
  _recordHistory(action, details) {
    this.history.push({
      timestamp: Date.now(),
      action,
      details,
    });

    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  /**
   * Reset statistics
   */
  resetStatistics() {
    this.stats = {
      enqueued: 0,
      processed: 0,
      failed: 0,
      cancelled: 0,
      totalProcessingTime: 0,
      avgProcessingTime: 0,
      backpressureEvents: 0,
      batchesProcessed: 0,
    };
    this._recordHistory('STATISTICS_RESET', {});
  }
}
