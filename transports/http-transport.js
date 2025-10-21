/**
 * Advanced HTTP Transport with Permanent Error Handling
 *
 * Provides robust HTTP transport with:
 * - Permanent vs temporary error differentiation
 * - Dead letter queue for undeliverable messages
 * - Fallback to local file storage
 * - Exponential backoff with jitter
 * - Circuit breaker integration
 */

class PermanentErrorHandler {
  constructor(options = {}) {
    this.permanentStatusCodes = new Set([
      400, 401, 403, 404, 405, 406, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 421, 422, 423,
      424, 425, 426, 428, 431, 451,
    ]);

    this.temporaryStatusCodes = new Set([
      429, // Too Many Requests - explicitly temporary
      500,
      502,
      503,
      504,
      505,
      506,
      507,
      508,
      510,
      511,
    ]);

    this.maxRetries = options.maxRetries || 5;
    this.deadLetterQueue = [];
    this.errorStats = {
      permanentErrors: 0,
      temporaryErrors: 0,
      retriedSuccessfully: 0,
      failedPermanently: 0,
    };
  }

  isPermanentError(statusCode, error) {
    // 4xx errors (except 429) are usually permanent
    if (statusCode >= 400 && statusCode < 500) {
      // 429 (Too Many Requests) is temporary
      if (statusCode === 429) return false;
      return true;
    }

    // Network errors might be temporary
    if (error && error.code === 'ECONNREFUSED') return false;
    if (error && error.code === 'ECONNRESET') return false;
    if (error && error.code === 'ETIMEDOUT') return false;

    return false;
  }

  isTemporaryError(statusCode, error) {
    return this.temporaryStatusCodes.has(statusCode);
  }

  classifyError(statusCode, error) {
    if (this.isPermanentError(statusCode, error)) {
      this.errorStats.permanentErrors++;
      return { type: 'permanent', retryable: false };
    }

    if (this.isTemporaryError(statusCode, error)) {
      this.errorStats.temporaryErrors++;
      return { type: 'temporary', retryable: true };
    }

    // Network/connection errors are usually temporary
    if (
      error &&
      (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT')
    ) {
      this.errorStats.temporaryErrors++;
      return { type: 'temporary', retryable: true };
    }

    // Unknown errors - treat as temporary
    return { type: 'unknown', retryable: true };
  }

  addToDeadLetterQueue(entry, error, attemptCount) {
    this.deadLetterQueue.push({
      timestamp: new Date().toISOString(),
      entry,
      error: error.message,
      attemptCount,
      statusCode: error.statusCode,
      context: {
        permanent: this.isPermanentError(error.statusCode, error),
        errorType: this.classifyError(error.statusCode, error).type,
      },
    });

    // Limit queue size
    if (this.deadLetterQueue.length > 1000) {
      this.deadLetterQueue.shift();
    }
  }

  getDeadLetterQueue() {
    return [...this.deadLetterQueue];
  }

  getErrorStats() {
    return { ...this.errorStats };
  }

  resetStats() {
    this.errorStats = {
      permanentErrors: 0,
      temporaryErrors: 0,
      retriedSuccessfully: 0,
      failedPermanently: 0,
    };
  }
}

class AdvancedHttpTransport {
  constructor(url, options = {}) {
    this.url = url;
    this.options = options;
    this.errorHandler = new PermanentErrorHandler(options);
    this.circuitBreaker = options.circuitBreaker || null;
    /**
     * Reserved for a future persistent fallback store (e.g., file-backed queue)
     * when remote delivery is unavailable. Currently unused but kept for
     * backward-compatibility and to signal the extension point.
     * @type {Array}
     */
    this.fallbackQueue = [];
    /**
     * Reserved for tracking per-entry attempt counts if/when batching or
     * de-duplication across retries is introduced. Currently unused.
     * @type {Map<any, number>}
     */
    this.attemptCounts = new Map();
    this.lastSuccessfulSend = null;

    this.config = {
      timeout: options.timeout || 5000,
      maxRetries: options.maxRetries || 5,
      initialBackoff: options.initialBackoff || 100,
      maxBackoff: options.maxBackoff || 30000,
      jitter: options.jitter !== false,
      compressionEnabled: options.compressionEnabled !== false,
      // Fallback configuration
      fallbackEnabled: options.fallbackEnabled !== false,
      fallbackStrategy: options.fallbackStrategy || 'memory', // 'memory' | 'file'
      fallbackFilePath: options.fallbackFilePath || null, // used when strategy === 'file'
    };
  }

  /**
   * Calculate exponential backoff with optional jitter
   */
  calculateBackoff(attemptNumber) {
    const backoff = this.config.initialBackoff * Math.pow(2, attemptNumber);
    const maxBackoff = this.config.maxBackoff;
    const delay = Math.min(backoff, maxBackoff);

    if (this.config.jitter) {
      return delay + Math.random() * delay;
    }
    return delay;
  }

  /**
   * Send log entry with permanent error handling
   */
  async send(entry, attemptNumber = 0) {
    // Check circuit breaker
    if (this.circuitBreaker && !this.circuitBreaker.canExecute()) {
      throw new Error('Circuit breaker is open');
    }

    try {
      const response = await this._sendRequest(entry);
      this.lastSuccessfulSend = new Date().toISOString();

      if (this.circuitBreaker) {
        this.circuitBreaker.recordSuccess();
      }

      return { success: true, response };
    } catch (error) {
      const statusCode = error.statusCode || error.code;
      const classification = this.errorHandler.classifyError(statusCode, error);

      // Permanent error - don't retry
      if (!classification.retryable) {
        this.errorHandler.errorStats.failedPermanently++;
        this.errorHandler.addToDeadLetterQueue(entry, error, attemptNumber + 1);
        // Enqueue to fallback for durability if enabled
        if (this.config.fallbackEnabled) {
          await this._enqueueFallback(entry, { reason: 'permanent-error', statusCode });
        }

        if (this.circuitBreaker) {
          this.circuitBreaker.recordFailure();
        }

        return {
          success: false,
          error: `Permanent error (${statusCode}): ${error.message}`,
          deadLettered: true,
        };
      }

      // Temporary error - can retry
      if (attemptNumber < this.config.maxRetries) {
        const delay = this.calculateBackoff(attemptNumber);
        await this._delay(delay);

        return this.send(entry, attemptNumber + 1);
      }

      // Max retries exceeded
      this.errorHandler.errorStats.failedPermanently++;
      this.errorHandler.addToDeadLetterQueue(entry, error, attemptNumber + 1);
      if (this.config.fallbackEnabled) {
        await this._enqueueFallback(entry, { reason: 'retry-exhausted', statusCode });
      }

      if (this.circuitBreaker) {
        this.circuitBreaker.recordFailure();
      }

      return {
        success: false,
        error: `Failed after ${attemptNumber + 1} attempts: ${error.message}`,
        deadLettered: true,
      };
    }
  }

  // Single-entry log compatibility
  async log(entry) {
    return this.send(entry);
  }

  // Batch write compatibility
  async write(entries) {
    for (const entry of entries) {
      // eslint-disable-next-line no-await-in-loop
      await this.send(entry);
    }
  }

  /**
   * Internal HTTP request
   */
  async _sendRequest(entry) {
    return new Promise((resolve, reject) => {
      // Simulate HTTP request (in real code, use http/https module)
      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, this.config.timeout);

      try {
        // Validate URL
        new URL(this.url);

        // Simulate success/failure based on options
        if (this.options.shouldFail === true) {
          clearTimeout(timeout);
          const error = new Error('Simulated failure');
          error.statusCode = this.options.failureStatusCode || 500;
          reject(error);
        } else {
          clearTimeout(timeout);
          resolve({ status: 200, statusText: 'OK' });
        }
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Helper to delay execution
   */
  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get dead letter entries
   */
  getDeadLetterEntries() {
    return this.errorHandler.getDeadLetterQueue();
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.errorHandler.getErrorStats(),
      deadLetterCount: this.errorHandler.deadLetterQueue.length,
      lastSuccessfulSend: this.lastSuccessfulSend,
      fallbackQueueSize: this.fallbackQueue.length,
      fallbackStrategy: this.config.fallbackStrategy,
    };
  }

  /**
   * Clear dead letter queue
   */
  clearDeadLetterQueue() {
    this.errorHandler.deadLetterQueue = [];
  }

  /**
   * Enqueue entry into fallback store (memory or file)
   * @private
   */
  async _enqueueFallback(entry, meta = {}) {
    try {
      const payload = { timestamp: new Date().toISOString(), entry, meta };
      if (this.config.fallbackStrategy === 'file' && this.config.fallbackFilePath) {
        const fs = await import('node:fs/promises');
        await fs.appendFile(this.config.fallbackFilePath, JSON.stringify(payload) + '\n', 'utf8');
      } else {
        this.fallbackQueue.push(payload);
        // backpressure: trim to reasonable size
        if (this.fallbackQueue.length > 5000) this.fallbackQueue.shift();
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to enqueue fallback entry:', e);
    }
  }

  /**
   * Attempt to flush the in-memory fallback queue
   * Returns number of successfully re-sent entries
   */
  async flushFallbackQueue() {
    let success = 0;
    const remaining = [];
    for (const item of this.fallbackQueue) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const res = await this.send(item.entry);
        if (res && res.success) success += 1;
        else remaining.push(item);
      } catch {
        remaining.push(item);
      }
    }
    this.fallbackQueue = remaining;
    return success;
  }
}

// Export
export { AdvancedHttpTransport, PermanentErrorHandler };
