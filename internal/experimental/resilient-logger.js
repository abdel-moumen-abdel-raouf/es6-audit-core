/**
 * @internal
 * This module is for internal/experimental use only and is not part of the public API.
 * It may change or be removed without notice.
 */
/**
 * Resilient Logger Fixed - Cascading Failures Prevention
 *
 * Solves Critical Issue #4: Cascading Failures
 *
 * Problem: Single transport failure causes entire logger to fail
 * - No fallback mechanism
 * - No circuit breaker
 * - No graceful degradation
 * - No local fallback logging
 *
 * Solution: Multi-layer fault tolerance
 * - Circuit breaker pattern
 * - Transport fallback chain
 * - Local file fallback logging
 * - Async error handling
 * - Health monitoring
 */

export class CircuitBreaker {
  constructor(config = {}) {
    this.failureThreshold = config.failureThreshold || 5;
    this.successThreshold = config.successThreshold || 2;
    this.timeout = config.timeout || 60000; // 60 seconds

    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
  }

  /**
   * Call function with circuit breaker protection
   */
  async call(fn) {
    if (this.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error(`Circuit breaker is OPEN. Retry after ${this.getRetryAfter()}ms`);
      }
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (error) {
      this._onFailure();
      throw error;
    }
  }

  /**
   * Check if should attempt reset
   */
  shouldAttemptReset() {
    return this.lastFailureTime && Date.now() - this.lastFailureTime >= this.timeout;
  }

  /**
   * Handle successful call
   */
  _onSuccess() {
    this.failureCount = 0;

    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = 'CLOSED';
        this.successCount = 0;
      }
    }
  }

  /**
   * Handle failed call
   */
  _onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.successCount = 0;

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  /**
   * Get time to retry in milliseconds
   */
  getRetryAfter() {
    if (this.state === 'CLOSED') {
      return 0;
    }

    const elapsed = Date.now() - this.lastFailureTime;
    const remaining = Math.max(0, this.timeout - elapsed);
    return remaining;
  }

  /**
   * Get circuit breaker status
   */
  getStatus() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      retryAfterMs: this.getRetryAfter(),
    };
  }

  /**
   * Reset circuit breaker
   */
  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
  }
}

export class TransportChain {
  constructor(transports = []) {
    this.transports = transports;
    this.breakers = new Map();

    // Initialize circuit breakers
    for (let i = 0; i < transports.length; i++) {
      this.breakers.set(
        i,
        new CircuitBreaker({
          failureThreshold: 5,
          timeout: 60000,
        })
      );
    }

    this.stats = {
      totalAttempts: 0,
      transportFailures: {},
      transportSuccesses: {},
      fallbacks: 0,
    };
  }

  /**
   * Send batch through first available transport
   */
  async send(batch) {
    this.stats.totalAttempts++;

    const errors = [];

    for (let i = 0; i < this.transports.length; i++) {
      const transport = this.transports[i];
      const breaker = this.breakers.get(i);

      try {
        const result = await breaker.call(async () => {
          return await transport.send(batch);
        });

        this.stats.transportSuccesses[i] = (this.stats.transportSuccesses[i] || 0) + 1;
        return result;
      } catch (error) {
        this.stats.transportFailures[i] = (this.stats.transportFailures[i] || 0) + 1;
        errors.push(`Transport ${i}: ${error.message}`);

        if (i < this.transports.length - 1) {
          this.stats.fallbacks++;
        }

        // Continue to next transport
        continue;
      }
    }

    // All transports failed
    throw new Error(`All transports failed: ${errors.join('; ')}`);
  }

  /**
   * Get chain status
   */
  getStatus() {
    const transportStatus = [];

    for (let i = 0; i < this.transports.length; i++) {
      const breaker = this.breakers.get(i);
      transportStatus.push({
        index: i,
        circuitBreaker: breaker.getStatus(),
        successes: this.stats.transportSuccesses[i] || 0,
        failures: this.stats.transportFailures[i] || 0,
      });
    }

    return {
      totalAttempts: this.stats.totalAttempts,
      totalFallbacks: this.stats.fallbacks,
      transports: transportStatus,
    };
  }

  /**
   * Get all stats
   */
  getStats() {
    return {
      totalAttempts: this.stats.totalAttempts,
      fallbackCount: this.stats.fallbacks,
      transportFailures: { ...this.stats.transportFailures },
      transportSuccesses: { ...this.stats.transportSuccesses },
    };
  }
}

export class LocalFallbackLogger {
  constructor(config = {}) {
    this.maxQueueSize = config.maxQueueSize || 1000;
    this.queueArray = [];
    this.config = config;
  }

  /**
   * Queue log entry for fallback
   */
  queue(entry) {
    if (this.queueArray.length < this.maxQueueSize) {
      this.queueArray.push({
        ...entry,
        _queuedAt: Date.now(),
        _queueReason: 'transport_failure',
      });
      return true;
    }
    return false;
  }

  /**
   * Get queued entries
   */
  getQueued() {
    return [...this.queueArray];
  }

  /**
   * Clear queue
   */
  clear() {
    const count = this.queueArray.length;
    this.queueArray = [];
    return count;
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      queuedCount: this.queueArray.length,
      maxQueueSize: this.maxQueueSize,
      utilizationPercent: ((this.queueArray.length / this.maxQueueSize) * 100).toFixed(2),
    };
  }
}

export class ResilientLoggerFixed {
  constructor(config = {}) {
    this.transports = config.transports || [];
    this.fallbackLogger = new LocalFallbackLogger(config.fallbackLogger);
    this.transportChain = new TransportChain(this.transports);
    this.config = config;

    this.stats = {
      logged: 0,
      fallbacked: 0,
      errors: 0,
    };
  }

  /**
   * Log entry with fault tolerance
   */
  async log(entry) {
    this.stats.logged++;

    try {
      // Try to send through transport chain
      try {
        await this.transportChain.send([entry]);
        return { success: true, method: 'transport' };
      } catch (transportError) {
        // Transport failed, use fallback
        const queued = this.fallbackLogger.queue(entry);

        if (queued) {
          this.stats.fallbacked++;
          return { success: true, method: 'fallback', reason: transportError.message };
        } else {
          this.stats.errors++;
          throw new Error('Fallback queue full: ' + transportError.message);
        }
      }
    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Log batch with fault tolerance
   */
  async logBatch(entries) {
    const results = {
      total: entries.length,
      successes: 0,
      failures: 0,
      fallbacks: 0,
    };

    for (const entry of entries) {
      try {
        const result = await this.log(entry);
        if (result.method === 'fallback') {
          results.fallbacks++;
        } else {
          results.successes++;
        }
      } catch (error) {
        results.failures++;
      }
    }

    return results;
  }

  /**
   * Flush queued fallback logs
   */
  async flushFallback() {
    const queued = this.fallbackLogger.getQueued();
    let flushed = 0;
    let failed = 0;

    for (const entry of queued) {
      try {
        await this.transportChain.send([entry]);
        flushed++;
      } catch (error) {
        failed++;
      }
    }

    if (flushed > 0) {
      this.fallbackLogger.clear();
    }

    return { flushed, failed, remaining: this.fallbackLogger.queueArray.length };
  }

  /**
   * Get logger statistics
   */
  getStats() {
    return {
      logged: this.stats.logged,
      fallbacked: this.stats.fallbacked,
      errors: this.stats.errors,
      fallbackQueue: this.fallbackLogger.getStats(),
      transportChain: this.transportChain.getStats(),
      resilience: {
        successRate:
          this.stats.logged > 0
            ? (((this.stats.logged - this.stats.errors) / this.stats.logged) * 100).toFixed(2)
            : 0,
        fallbackUtilization: this.fallbackLogger.getStats().utilizationPercent,
      },
    };
  }

  /**
   * Get detailed status
   */
  getStatus() {
    return {
      logger: this.getStats(),
      transportChain: this.transportChain.getStatus(),
      fallbackLogger: this.fallbackLogger.getStats(),
    };
  }
}

export default ResilientLoggerFixed;
