/**
 * ✅ HTTP Transport - FIXED VERSION
 *
 */

export class HttpTransportFixed {
  constructor(config = {}) {
    this.endpoint = config.endpoint;
    if (!this.endpoint) {
      throw new Error('HTTP Transport requires endpoint URL');
    }

    this.headers = config.headers ?? { 'Content-Type': 'application/json' };
    this.timeout = config.timeout ?? 5000;
    this.retries = config.retries ?? 3;
    this.initialRetryDelay = config.initialRetryDelay ?? 100;
    this.maxRetryDelay = config.maxRetryDelay ?? 10000;
    this.batchSize = config.batchSize ?? 50;
    this.batchTimeout = config.batchTimeout ?? 2000;
    this.maxFailedBatches = config.maxFailedBatches ?? 100;

    // Custom hooks
    this.beforeSend = config.beforeSend;
    this.onSuccess = config.onSuccess;
    this.onError = config.onError;
    this.onArchived = config.onArchived;

    this.queue = [];
    this.failedBatches = [];
    this.archivedBatches = [];
    this.pendingBatches = new Map();
    this.processing = false;
    this.batchTimer = null;
    this.retryScheduler = null;
    this.retryAttempts = 0;

    this.stats = {
      sent: 0,
      failed: 0,
      archived: 0,
      retried: 0,
      retries: 0,
      bytes: 0,
      lastSentAt: null,
      lastErrorAt: null,
      lastError: null,
      totalAttempts: 0,
    };
  }

  /**
   *
   */
  write(entries) {
    if (!Array.isArray(entries)) {
      entries = [entries];
    }

    if (this.queue.length + entries.length > 10000) {
      console.warn('[HttpTransport] Queue is full, dropping entries');
      return;
    }

    this.queue.push(...entries);
    this._scheduleBatch();
  }

  /**
   *
   */
  _scheduleBatch() {
    if (this.queue.length >= this.batchSize) {
      this._processBatch();
      return;
    }

    if (this.batchTimer) {
      return;
    }

    this.batchTimer = setTimeout(() => {
      this.batchTimer = null;
      if (this.queue.length > 0) {
        this._processBatch();
      }
    }, this.batchTimeout);
  }

  /**
   *
   */
  async _processBatch() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    let batch = null;
    const batchId = this._generateUUID();

    try {
      batch = this.queue.slice(0, this.batchSize);

      this.pendingBatches.set(batchId, {
        batch,
        timestamp: Date.now(),
        retries: 0,
      });

      let payload = batch;
      if (this.beforeSend) {
        try {
          payload = await this.beforeSend(batch);
        } catch (e) {
          console.error('[HttpTransport] beforeSend error:', e);
        }
      }

      this.stats.totalAttempts++;
      await this._sendWithRetry(payload);

      this.queue.splice(0, this.batchSize);
      this.pendingBatches.delete(batchId);

      this.stats.sent += batch.length;
      this.stats.lastSentAt = new Date();

      if (this.onSuccess) {
        try {
          await this.onSuccess(batch);
        } catch (e) {
          console.error('[HttpTransport] onSuccess error:', e);
        }
      }
    } catch (error) {
      if (this.failedBatches.length < this.maxFailedBatches) {
        this.failedBatches.push({
          batchId,
          batch: batch || [],
          error: {
            message: error.message,
            code: error.code,
            timestamp: Date.now(),
          },
          retryCount: 0,
          firstAttemptAt: Date.now(),
        });
      } else {
        console.error('[HttpTransport] Failed batches queue is full, archiving');
        this._archiveFailedBatch({
          batchId,
          batch: batch || [],
          error: { message: 'Queue full' },
          retryCount: 0,
        });
      }

      this.stats.failed++;
      this.stats.lastErrorAt = new Date();
      this.stats.lastError = error.message;

      console.error(`[HttpTransport] Batch ${batchId} failed: ${error.message}`);

      if (this.onError) {
        try {
          await this.onError(error);
        } catch (e) {
          console.error('[HttpTransport] onError error:', e);
        }
      }

      this._scheduleRetry();
    } finally {
      this.processing = false;

      this._cleanupStaleRequests();

      if (this.queue.length > 0) {
        this._scheduleBatch();
      }
    }
  }

  /**
   *
   */
  async _sendWithRetry(payload, attempt = 0) {
    try {
      const response = await this._fetchWithTimeout(
        this.endpoint,
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify({
            logs: Array.isArray(payload) ? payload : [payload],
            timestamp: new Date().toISOString(),
            attempt: attempt,
          }),
        },
        this.timeout
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const bodySize = JSON.stringify(payload).length;
      this.stats.bytes += bodySize;

      return response;
    } catch (error) {
      if (attempt < this.retries) {
        const delay = this._getExponentialBackoffDelay(attempt);
        this.stats.retries++;

        await this._delay(delay);

        return this._sendWithRetry(payload, attempt + 1);
      }

      throw error;
    }
  }

  /**
   *
   */
  _getExponentialBackoffDelay(attempt) {
    const delay = this.initialRetryDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 0.1 * delay; // 10% jitter
    const finalDelay = Math.min(delay + jitter, this.maxRetryDelay);
    return Math.floor(finalDelay);
  }

  /**
   *
   */
  _fetchWithTimeout(url, options, timeoutMs) {
    return Promise.race([
      fetch(url, options),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Request timeout')), timeoutMs)),
    ]);
  }

  /**
   *
   */
  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   *
   */
  _scheduleRetry() {
    if (this.retryScheduler) {
      return;
    }

    const delay = Math.pow(2, Math.min(5, this.retryAttempts)) * 1000;

    this.retryScheduler = setTimeout(() => {
      this.retryScheduler = null;
      this._retryFailedBatches();
    }, delay);

    console.log(
      `[HttpTransport] Retrying failed batches in ${delay}ms (attempt ${this.retryAttempts})`
    );
  }

  /**
   *
   */
  async _retryFailedBatches() {
    if (this.failedBatches.length === 0) {
      this.retryAttempts = 0;
      return;
    }

    this.retryAttempts++;
    const maxRetries = 5;
    const toRemove = [];

    for (let i = 0; i < this.failedBatches.length; i++) {
      const failedItem = this.failedBatches[i];

      const ageMs = Date.now() - failedItem.firstAttemptAt;
      const maxAge = 24 * 60 * 60 * 1000;

      if (failedItem.retryCount >= maxRetries || ageMs > maxAge) {
        this._archiveFailedBatch(failedItem);
        toRemove.push(i);
        continue;
      }

      try {
        await this._sendWithRetry(failedItem.batch);

        toRemove.push(i);
        this.stats.retried++;

        console.log(
          `[HttpTransport] Batch ${failedItem.batchId} succeeded on retry ${failedItem.retryCount + 1}`
        );
      } catch (error) {
        failedItem.retryCount++;
        failedItem.lastError = error;
      }
    }

    for (let i = toRemove.length - 1; i >= 0; i--) {
      this.failedBatches.splice(toRemove[i], 1);
    }

    if (this.failedBatches.length > 0) {
      this._scheduleRetry();
    } else {
      this.retryAttempts = 0;
    }
  }

  /**
   *
   */
  _cleanupStaleRequests() {
    const now = Date.now();
    const timeout = 5 * 60 * 1000;

    for (const [batchId, request] of this.pendingBatches.entries()) {
      if (now - request.timestamp > timeout) {
        this.failedBatches.push({
          batchId,
          batch: request.batch,
          error: { message: 'Request timeout' },
          retryCount: 0,
          firstAttemptAt: Date.now(),
        });

        this.pendingBatches.delete(batchId);

        console.warn(`[HttpTransport] Batch ${batchId} timed out after ${timeout}ms`);
      }
    }
  }

  /**
   *
   */
  _archiveFailedBatch(failedItem) {
    this.archivedBatches.push({
      ...failedItem,
      archivedAt: Date.now(),
    });

    if (this.archivedBatches.length > 1000) {
      this.archivedBatches.shift();
    }

    this.stats.archived++;

    console.warn(
      `[HttpTransport] Batch ${failedItem.batchId} archived after ${failedItem.retryCount} retries`
    );

    if (this.onArchived) {
      try {
        this.onArchived(failedItem);
      } catch (e) {
        console.error('[HttpTransport] onArchived error:', e);
      }
    }
  }

  /**
   *
   */
  _generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0,
        v = c == 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   *
   */
  async flush() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    while (this.queue.length > 0 && !this.processing) {
      await this._processBatch();
    }

    if (this.processing) {
      await new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (!this.processing) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 10);
      });
    }

    return this;
  }

  /**
   *
   */
  getStatistics() {
    return {
      ...this.stats,
      queueSize: this.queue.length,
      failedBatchesSize: this.failedBatches.length,
      archivedBatchesSize: this.archivedBatches.length,
      processing: this.processing,
      bytesMB: (this.stats.bytes / 1024 / 1024).toFixed(2),
      successRate:
        this.stats.totalAttempts > 0
          ? ((this.stats.sent / this.stats.totalAttempts) * 100).toFixed(2)
          : 0,
    };
  }

  /**
   *
   */
  getArchivedBatches() {
    return [...this.archivedBatches];
  }

  /**
   *
   */
  printStatistics() {
    const stats = this.getStatistics();
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║  HTTP TRANSPORT STATISTICS (FIXED)    ║');
    console.log('╚════════════════════════════════════════╝');
    console.log(`Endpoint: ${this.endpoint}`);
    console.log(`Sent: ${stats.sent}`);
    console.log(`Failed: ${stats.failed}`);
    console.log(`Archived: ${stats.archived}`);
    console.log(`Retried: ${stats.retried}`);
    console.log(`Total Attempts: ${stats.totalAttempts}`);
    console.log(`Success Rate: ${stats.successRate}%`);
    console.log(`Queue Size: ${stats.queueSize}`);
    console.log(`Failed Batches: ${stats.failedBatchesSize}`);
    console.log(`Bytes Sent: ${stats.bytesMB}MB`);
    if (stats.lastError) {
      console.log(`Last Error: ${stats.lastError}`);
    }
    console.log(`Last Sent At: ${stats.lastSentAt}`);
    console.log('════════════════════════════════════════\n');
  }

  /**
   *
   */
  async destroy() {
    await this.flush();
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }
    if (this.retryScheduler) {
      clearTimeout(this.retryScheduler);
    }
    this.queue = [];
    return this;
  }
}

export { HttpTransportFixed as HttpTransport };
