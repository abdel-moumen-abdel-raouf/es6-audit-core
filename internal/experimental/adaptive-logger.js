/**
 * @internal
 * This module is for internal/experimental use only and is not part of the public API.
 * It may change or be removed without notice.
 */
/**
 * Adaptive Logger Fixed - Memory Pressure Management
 *
 * Solves Critical Issue #5: Memory Pressure at High Volume
 *
 * Problem: Crashes when logging >100k logs/sec
 * - No backpressure handling
 * - Unbounded queue growth
 * - No adaptive flushing
 * - No memory monitoring
 *
 * Solution: Adaptive flush strategy with backpressure
 * - Memory monitoring
 * - Adaptive flush intervals based on memory
 * - Backpressure signals
 * - Queue pressure detection
 * - Graceful degradation
 */

export class MemoryMonitor {
  constructor(config = {}) {
    this.warningThreshold = config.warningThreshold || 0.7; // 70%
    this.criticalThreshold = config.criticalThreshold || 0.85; // 85%
    this.checkInterval = config.checkInterval || 5000;
    this.baselineHeap = 0;

    this.stats = {
      checks: 0,
      warnings: 0,
      critical: 0,
    };

    this._initialize();
  }

  /**
   * Initialize monitoring
   */
  _initialize() {
    if (global.gc) {
      global.gc(); // Force GC if available
      const memUsage = process.memoryUsage();
      this.baselineHeap = memUsage.heapUsed;
    }
  }

  /**
   * Check current memory pressure
   */
  check() {
    this.stats.checks++;
    const memUsage = process.memoryUsage();
    const heapLimit = memUsage.heapTotal;
    const heapUsed = memUsage.heapUsed;
    const pressure = heapUsed / heapLimit;

    const status = {
      pressure,
      heapUsedMb: Math.round(heapUsed / 1024 / 1024),
      heapLimitMb: Math.round(heapLimit / 1024 / 1024),
      pressurePercent: (pressure * 100).toFixed(2),
    };

    if (pressure >= this.criticalThreshold) {
      this.stats.critical++;
      status.level = 'CRITICAL';
    } else if (pressure >= this.warningThreshold) {
      this.stats.warnings++;
      status.level = 'WARNING';
    } else {
      status.level = 'OK';
    }

    return status;
  }

  /**
   * Get backpressure signal
   */
  getBackpressure() {
    const status = this.check();

    if (status.level === 'CRITICAL') {
      return { shouldBackoff: true, delayMs: 500, reason: 'CRITICAL_MEMORY' };
    } else if (status.level === 'WARNING') {
      return { shouldBackoff: true, delayMs: 100, reason: 'WARNING_MEMORY' };
    }

    return { shouldBackoff: false, delayMs: 0, reason: 'NORMAL' };
  }

  /**
   * Get statistics
   */
  getStats() {
    return { ...this.stats };
  }
}

export class AdaptiveFlushStrategy {
  constructor(config = {}) {
    this.minInterval = config.minInterval || 100; // 100ms
    this.maxInterval = config.maxInterval || 5000; // 5s
    this.currentInterval = this.minInterval;

    this.queuePressureThresholds = config.queuePressureThresholds || {
      low: 0.25,
      medium: 0.5,
      high: 0.75,
      critical: 0.9,
    };

    this.stats = {
      intervalAdjustments: 0,
      avgInterval: this.minInterval,
    };
  }

  /**
   * Calculate adaptive flush interval based on queue pressure
   */
  calculateInterval(queueSize, maxQueueSize, memoryPressure) {
    const queuePressure = queueSize / maxQueueSize;

    let adjustedInterval = this.minInterval;

    // Increase flush frequency under pressure
    if (queuePressure < this.queuePressureThresholds.low) {
      adjustedInterval = this.maxInterval;
    } else if (queuePressure < this.queuePressureThresholds.medium) {
      adjustedInterval = (this.minInterval + this.maxInterval) / 2;
    } else if (queuePressure < this.queuePressureThresholds.high) {
      adjustedInterval = this.minInterval * 2;
    } else if (queuePressure < this.queuePressureThresholds.critical) {
      adjustedInterval = this.minInterval;
    } else {
      adjustedInterval = Math.max(50, this.minInterval / 2);
    }

    // Factor in memory pressure
    if (memoryPressure && memoryPressure.level === 'CRITICAL') {
      adjustedInterval = Math.max(50, adjustedInterval / 2);
    } else if (memoryPressure && memoryPressure.level === 'WARNING') {
      adjustedInterval = Math.max(100, adjustedInterval * 0.75);
    }

    this.currentInterval = adjustedInterval;
    this.stats.intervalAdjustments++;

    return Math.round(adjustedInterval);
  }

  /**
   * Get current interval
   */
  getCurrentInterval() {
    return Math.round(this.currentInterval);
  }

  /**
   * Get statistics
   */
  getStats() {
    return { ...this.stats };
  }
}

export class PressureAwareBatcher {
  constructor(config = {}) {
    this.baseBatchSize = config.baseBatchSize || 100;
    this.maxBatchSize = config.maxBatchSize || 1000;
    this.minBatchSize = config.minBatchSize || 10;

    this.stats = {
      batchesCreated: 0,
      itemsProcessed: 0,
      avgBatchSize: this.baseBatchSize,
    };
  }

  /**
   * Calculate batch size based on pressure
   */
  calculateBatchSize(queueSize, memoryPressure) {
    let batchSize = this.baseBatchSize;

    // Increase batch size if queue is large
    if (queueSize > this.baseBatchSize * 5) {
      batchSize = Math.min(this.maxBatchSize, this.baseBatchSize * 3);
    } else if (queueSize > this.baseBatchSize * 2) {
      batchSize = this.baseBatchSize * 2;
    }

    // Decrease batch size under memory pressure
    if (memoryPressure && memoryPressure.level === 'CRITICAL') {
      batchSize = Math.max(this.minBatchSize, Math.round(batchSize / 2));
    } else if (memoryPressure && memoryPressure.level === 'WARNING') {
      batchSize = Math.max(this.minBatchSize, Math.round(batchSize * 0.75));
    }

    return Math.round(batchSize);
  }

  /**
   * Create batch
   */
  createBatch(items, memoryPressure) {
    const batchSize = this.calculateBatchSize(items.length, memoryPressure);
    const batch = items.slice(0, batchSize);

    this.stats.batchesCreated++;
    this.stats.itemsProcessed += batch.length;
    this.stats.avgBatchSize = Math.round(this.stats.itemsProcessed / this.stats.batchesCreated);

    return batch;
  }

  /**
   * Get statistics
   */
  getStats() {
    return { ...this.stats };
  }
}

export class AdaptiveLoggerFixed {
  constructor(config = {}) {
    this.maxQueueSize = config.maxQueueSize || 10000;
    this.onFlush = config.onFlush || (() => Promise.resolve());

    this.memoryMonitor = new MemoryMonitor(config.memoryMonitor);
    this.flushStrategy = new AdaptiveFlushStrategy(config.flushStrategy);
    this.batcher = new PressureAwareBatcher(config.batcher);

    this.queue = [];
    this.flushInProgress = false;
    this.flushTimer = null;

    this.stats = {
      logged: 0,
      dropped: 0,
      flushed: 0,
      backpressured: 0,
      errors: 0,
    };

    this.startAdaptiveFlush();
  }

  /**
   * Log entry with pressure awareness
   */
  async log(entry) {
    this.stats.logged++;

    try {
      // Check backpressure
      const backpressure = this.memoryMonitor.getBackpressure();
      if (backpressure.shouldBackoff) {
        this.stats.backpressured++;
        // Wait to apply backpressure
        await this._sleep(backpressure.delayMs);
      }

      // Check queue size
      if (this.queue.length >= this.maxQueueSize) {
        this.stats.dropped++;
        throw new Error(`Queue full: ${this.queue.length}/${this.maxQueueSize}`);
      }

      this.queue.push({
        ...entry,
        _timestamp: Date.now(),
      });

      // Trigger flush if queue is growing
      if (this.queue.length >= Math.ceil(this.maxQueueSize * 0.8)) {
        this._triggerFlush();
      }
    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Log batch
   */
  async logBatch(entries) {
    const results = {
      total: entries.length,
      logged: 0,
      dropped: 0,
    };

    for (const entry of entries) {
      try {
        await this.log(entry);
        results.logged++;
      } catch (error) {
        results.dropped++;
      }
    }

    return results;
  }

  /**
   * Flush with adaptive strategy
   */
  async flush() {
    if (this.flushInProgress) {
      return;
    }

    this.flushInProgress = true;

    try {
      while (this.queue.length > 0) {
        // Get memory and queue status
        const memStatus = this.memoryMonitor.check();
        const batchSize = this.batcher.calculateBatchSize(this.queue.length, memStatus);

        // Create batch
        const batch = this.queue.slice(0, batchSize);

        if (batch.length === 0) {
          break;
        }

        try {
          await this.onFlush(batch);
          this.queue.splice(0, batchSize);
          this.stats.flushed += batch.length;
        } catch (error) {
          // Backoff on error
          await this._sleep(100);
          throw error;
        }
      }
    } catch (error) {
      // Log error but don't crash
      this.stats.errors++;
    } finally {
      this.flushInProgress = false;
    }
  }

  /**
   * Start adaptive flush timer
   */
  startAdaptiveFlush() {
    const tick = async () => {
      // Calculate adaptive interval
      const memStatus = this.memoryMonitor.check();
      const interval = this.flushStrategy.calculateInterval(
        this.queue.length,
        this.maxQueueSize,
        memStatus
      );

      // Flush
      try {
        await this.flush();
      } catch (e) {
        // Ignore
      }

      // Schedule next
      this.flushTimer = setTimeout(tick, interval);
    };

    this.flushTimer = setTimeout(tick, this.flushStrategy.getCurrentInterval());
  }

  /**
   * Stop adaptive flush
   */
  stopAdaptiveFlush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Trigger immediate flush
   */
  _triggerFlush() {
    this.flush().catch(() => {
      // Ignore
    });
  }

  /**
   * Sleep helper
   */
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get logger statistics
   */
  getStats() {
    return {
      logged: this.stats.logged,
      dropped: this.stats.dropped,
      flushed: this.stats.flushed,
      backpressured: this.stats.backpressured,
      errors: this.stats.errors,
      queueSize: this.queue.length,
      maxQueueSize: this.maxQueueSize,
      memoryMonitor: this.memoryMonitor.getStats(),
      flushStrategy: this.flushStrategy.getStats(),
      batcher: this.batcher.getStats(),
      currentFlushInterval: this.flushStrategy.getCurrentInterval(),
    };
  }

  /**
   * Get detailed status
   */
  getStatus() {
    const memStatus = this.memoryMonitor.check();
    const interval = this.flushStrategy.calculateInterval(
      this.queue.length,
      this.maxQueueSize,
      memStatus
    );

    return {
      stats: this.getStats(),
      memory: memStatus,
      adaptiveInterval: interval,
      flushInProgress: this.flushInProgress,
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    this.stopAdaptiveFlush();
    await this.flush();
  }
}

export default AdaptiveLoggerFixed;
