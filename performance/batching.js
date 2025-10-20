/**
 * ============================================================================
 * ============================================================================
 * 
 * Purpose:
 *   - Group operations into batches for efficient bulk processing
 *   - Support time-based and size-based batching strategies
 *   - Handle backpressure and flow control
 *   - Track batch statistics and performance metrics
 * 
 * Architecture:
 *   - Time-window batching: Flush after timeout
 *   - Size-triggered batching: Flush when batch reaches max size
 *   - Priority-based batching: Handle urgent items immediately
 *   - Adaptive thresholds: Adjust based on system performance
 */

import { EventEmitter } from 'events';

export class BatchingManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        // Configuration
        this.maxBatchSize = options.maxBatchSize || 100;
        this.maxBatchWaitTime = options.maxBatchWaitTime || 5000; // ms
        this.maxQueueSize = options.maxQueueSize || 10000;
        this.priorityLevels = options.priorityLevels || ['low', 'normal', 'high'];
        this.autoFlush = options.autoFlush !== false;
        
        // State
        this.queues = new Map(); // By priority level
        this.currentBatch = [];
        this.batchTimer = null;
        this.isPaused = false;
        this.isProcessing = false;
        
        // Statistics
        this.stats = {
            totalItems: 0,
            totalBatches: 0,
            itemsProcessed: 0,
            itemsDropped: 0,
            averageBatchSize: 0,
            maxBatchSize: 0,
            minBatchSize: Infinity,
            timeWindowFlushes: 0,
            sizeBasedFlushes: 0,
            priorityFlushes: 0,
            backpressureEvents: 0,
            totalWaitTime: 0,
            maxWaitTime: 0,
            minWaitTime: Infinity
        };
        
        // Initialize priority queues
        for (const priority of this.priorityLevels) {
            this.queues.set(priority, []);
        }
    }

    /**
     * Add item to batch queue
     * @param {*} item - Item to batch
     * @param {Object} options - Options (priority, immediate, onProcessed)
     * @returns {Promise<*>} Result from batch processor
     */
    async add(item, options = {}) {
        const priority = options.priority || 'normal';
        const immediate = options.immediate || false;
        
        if (!this.queues.has(priority)) {
            throw new Error(`Unknown priority level: ${priority}`);
        }

        // Check queue size
        const totalSize = Array.from(this.queues.values())
            .reduce((sum, q) => sum + q.length, 0) + this.currentBatch.length;
        
        if (totalSize >= this.maxQueueSize) {
            this.stats.backpressureEvents++;
            throw new Error('Batch queue overflow - system backpressure');
        }

        this.stats.totalItems++;

        // Handle immediate processing
        if (immediate && priority === 'high') {
            this.stats.priorityFlushes++;
            return await this._processSingleItem(item);
        }

        // Add to appropriate queue
        const queue = this.queues.get(priority);
        
        return new Promise((resolve, reject) => {
            queue.push({
                item,
                resolve,
                reject,
                addedAt: Date.now(),
                priority
            });

            // Check if we should flush
            if (this.autoFlush) {
                this._checkFlushConditions();
            }
        });
    }

    /**
     * Add multiple items at once
     * @param {Array} items - Items to add
     * @param {Object} options - Batch options
     * @returns {Promise<Array>} Results
     */
    async addBatch(items, options = {}) {
        const results = [];
        for (const item of items) {
            try {
                const result = await this.add(item, options);
                results.push({ success: true, result });
            } catch (error) {
                results.push({ success: false, error: error.message });
            }
        }
        return results;
    }

    /**
     * Manually flush current batch
     * @returns {Promise<Array>} Processed results
     */
    async flush() {
        if (this.isProcessing) {
            return; // Already processing
        }

        // Collect all pending items
        const allItems = [];
        for (const queue of this.queues.values()) {
            allItems.push(...queue);
        }
        this.queues.forEach(q => q.length = 0); // Clear queues

        if (allItems.length === 0) {
            return [];
        }

        return await this._processBatch(allItems, 'manual-flush');
    }

    /**
     * Pause batching (queue items but don't process)
     */
    pause() {
        this.isPaused = true;
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }
    }

    /**
     * Resume batching
     */
    resume() {
        this.isPaused = false;
        this._checkFlushConditions();
    }

    /**
     * Clear all pending items
     * @returns {number} Number of items cleared
     */
    clear() {
        let count = 0;
        for (const queue of this.queues.values()) {
            // Reject all pending promises
            for (const item of queue) {
                item.reject(new Error('Batch cleared'));
            }
            count += queue.length;
            queue.length = 0;
        }
        this.stats.itemsDropped += count;
        return count;
    }

    /**
     * Get current queue size by priority
     * @returns {Object} Size by priority
     */
    getQueueSizes() {
        const sizes = {};
        for (const [priority, queue] of this.queues) {
            sizes[priority] = queue.length;
        }
        return sizes;
    }

    /**
     * Get batching statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        const avgBatchSize = this.stats.totalBatches > 0
            ? this.stats.itemsProcessed / this.stats.totalBatches
            : 0;

        return {
            ...this.stats,
            averageBatchSize: avgBatchSize.toFixed(2),
            currentQueueSize: Array.from(this.queues.values())
                .reduce((sum, q) => sum + q.length, 0),
            isPaused: this.isPaused,
            isProcessing: this.isProcessing,
            averageWaitTime: this.stats.totalBatches > 0
                ? (this.stats.totalWaitTime / this.stats.totalBatches).toFixed(2)
                : 0,
            maxWaitTime: this.stats.maxWaitTime,
            minWaitTime: this.stats.minWaitTime === Infinity ? 0 : this.stats.minWaitTime
        };
    }

    /**
     * Reset statistics
     */
    resetStatistics() {
        this.stats = {
            totalItems: 0,
            totalBatches: 0,
            itemsProcessed: 0,
            itemsDropped: 0,
            averageBatchSize: 0,
            maxBatchSize: 0,
            minBatchSize: Infinity,
            timeWindowFlushes: 0,
            sizeBasedFlushes: 0,
            priorityFlushes: 0,
            backpressureEvents: 0,
            totalWaitTime: 0,
            maxWaitTime: 0,
            minWaitTime: Infinity
        };
    }

    /**
     * Check if batch should be flushed
     * @private
     */
    _checkFlushConditions() {
        if (this.isPaused || this.isProcessing) return;

        // Check total items across all queues
        let totalItems = 0;
        for (const queue of this.queues.values()) {
            totalItems += queue.length;
        }

        // Size-based flush
        if (totalItems >= this.maxBatchSize) {
            this.stats.sizeBasedFlushes++;
            this._startProcessing();
            return;
        }

        // Set/reset time window timer
        if (totalItems > 0 && !this.batchTimer) {
            this.batchTimer = setTimeout(() => {
                this.batchTimer = null;
                this.stats.timeWindowFlushes++;
                this._startProcessing();
            }, this.maxBatchWaitTime);
        }
    }

    /**
     * Start batch processing
     * @private
     */
    async _startProcessing() {
        if (this.isProcessing) return;

        this.isProcessing = true;

        try {
            // Collect all items from all queues
            const allItems = [];
            for (const queue of this.queues.values()) {
                allItems.push(...queue);
            }
            this.queues.forEach(q => q.length = 0);

            if (allItems.length > 0) {
                await this._processBatch(allItems, 'auto-flush');
            }
        } finally {
            this.isProcessing = false;
            
            // Check if more items arrived while processing
            const totalItems = Array.from(this.queues.values())
                .reduce((sum, q) => sum + q.length, 0);
            
            if (totalItems > 0 && this.autoFlush) {
                this._checkFlushConditions();
            }
        }
    }

    /**
     * Process batch of items
     * @private
     */
    async _processBatch(items, flushType) {
        if (items.length === 0) return [];

        const startTime = Date.now();
        const results = [];

        try {
            // Emit batch start event
            this.emit('batch-start', { 
                size: items.length, 
                flushType,
                timestamp: startTime
            });

            // Process items in order of priority
            for (const item of items) {
                try {
                    // Simulate processing
                    const result = await this._processSingleItem(item.item);
                    item.resolve(result);
                    results.push({ success: true, result });
                } catch (error) {
                    item.reject(error);
                    results.push({ success: false, error: error.message });
                }
            }

            // Update statistics
            const waitTime = Date.now() - startTime;
            this.stats.totalBatches++;
            this.stats.itemsProcessed += items.length;
            this.stats.totalWaitTime += waitTime;
            this.stats.maxWaitTime = Math.max(this.stats.maxWaitTime, waitTime);
            this.stats.minWaitTime = Math.min(this.stats.minWaitTime, waitTime);
            this.stats.maxBatchSize = Math.max(this.stats.maxBatchSize, items.length);
            this.stats.minBatchSize = Math.min(this.stats.minBatchSize, items.length);

            // Emit batch complete event
            this.emit('batch-complete', {
                size: items.length,
                flushType,
                duration: waitTime,
                successCount: results.filter(r => r.success).length,
                failureCount: results.filter(r => !r.success).length
            });

            return results;
        } catch (error) {
            // Reject all items on error
            for (const item of items) {
                item.reject(error);
            }
            throw error;
        }
    }

    /**
     * Process single item
     * @private
     */
    async _processSingleItem(item) {
        // Simulate processing
        return item;
    }
}

export default BatchingManager;
