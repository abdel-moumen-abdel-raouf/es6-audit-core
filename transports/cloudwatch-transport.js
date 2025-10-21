/**
 * CloudWatch Transport for AWS logging
 *
 * - Batch processing
 * - Error handling و retry logic
 * - Statistics tracking
 */

export class CloudWatchTransport {
  constructor(config = {}) {
    this.logGroupName = config.logGroupName;
    this.logStreamName = config.logStreamName;
    this.client = config.client; // AWS CloudWatch Logs client

    if (!this.logGroupName) {
      throw new Error('CloudWatch Transport requires logGroupName');
    }

    if (!this.logStreamName) {
      throw new Error('CloudWatch Transport requires logStreamName');
    }

    if (!this.client) {
      throw new Error('CloudWatch Transport requires CloudWatch Logs client');
    }

    this.batchSize = config.batchSize ?? 1000; // CloudWatch limit
    this.batchTimeout = config.batchTimeout ?? 5000;
    this.maxRetries = config.maxRetries ?? 3;
    this.retryDelay = config.retryDelay ?? 100;

    // Custom methods
    this.beforeFormat = config.beforeFormat;
    this.onSuccess = config.onSuccess;
    this.onError = config.onError;

    this.queue = [];
    this.processing = false;
    this.batchTimer = null;
    this.sequenceToken = null;
    this.initialized = false;

    this.stats = {
      sent: 0,
      failed: 0,
      retries: 0,
      events: 0,
      lastSentAt: null,
      lastErrorAt: null,
      lastError: null,
    };

    this._initialize();
  }

  /**
   *
   */
  async _initialize() {
    try {
      try {
        await this.client.describeLogGroups({
          logGroupNamePrefix: this.logGroupName,
        });
      } catch (e) {
        if (e.code === 'ResourceNotFoundException') {
          await this.client.createLogGroup({
            logGroupName: this.logGroupName,
          });
        }
      }

      try {
        const response = await this.client.describeLogStreams({
          logGroupName: this.logGroupName,
          logStreamNamePrefix: this.logStreamName,
        });

        if (response.logStreams && response.logStreams.length > 0) {
          this.sequenceToken = response.logStreams[0].uploadSequenceToken;
        }
      } catch (e) {
        if (e.code === 'ResourceNotFoundException') {
          await this.client.createLogStream({
            logGroupName: this.logGroupName,
            logStreamName: this.logStreamName,
          });
        }
      }

      this.initialized = true;
    } catch (error) {
      console.error('[CloudWatchTransport] Initialization error:', error);
      this.stats.lastError = error.message;
    }
  }

  /**
   *
   */
  write(entries) {
    if (!Array.isArray(entries)) {
      entries = [entries];
    }

    this.queue.push(...entries);
    this.stats.events += entries.length;

    this._scheduleBatch();
  }

  /**
   *
   */
  _scheduleBatch() {
    if (!this.initialized) {
      return;
    }

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
    if (this.processing || this.queue.length === 0 || !this.initialized) {
      return;
    }

    this.processing = true;

    try {
      const batch = this.queue.splice(0, this.batchSize);

      const logEvents = batch.map((entry) => {
        let message = entry;

        if (typeof entry === 'object') {
          message = JSON.stringify(entry);
        }

        if (this.beforeFormat) {
          try {
            message = this.beforeFormat(entry, message);
          } catch (e) {
            console.error('[CloudWatchTransport] beforeFormat error:', e);
          }
        }

        return {
          message: String(message).substring(0, 4096), // CloudWatch limit
          timestamp: Date.now(),
        };
      });

      await this._putLogEventsWithRetry(logEvents);

      this.stats.sent += batch.length;
      this.stats.lastSentAt = new Date();

      if (this.onSuccess) {
        try {
          await this.onSuccess(batch);
        } catch (e) {
          console.error('[CloudWatchTransport] onSuccess error:', e);
        }
      }
    } catch (error) {
      this.stats.failed++;
      this.stats.lastErrorAt = new Date();
      this.stats.lastError = error.message;

      if (this.onError) {
        try {
          await this.onError(error);
        } catch (e) {
          console.error('[CloudWatchTransport] onError error:', e);
        }
      }
    } finally {
      this.processing = false;

      if (this.queue.length > 0) {
        this._scheduleBatch();
      }
    }
  }

  /**
   *
   */
  async _putLogEventsWithRetry(logEvents, attempt = 0) {
    try {
      const params = {
        logGroupName: this.logGroupName,
        logStreamName: this.logStreamName,
        logEvents: logEvents,
        sequenceToken: this.sequenceToken,
      };

      if (!params.sequenceToken) {
        delete params.sequenceToken;
      }

      const response = await this.client.putLogEvents(params);

      if (response.nextSequenceToken) {
        this.sequenceToken = response.nextSequenceToken;
      }

      return response;
    } catch (error) {
      if (
        error.code === 'InvalidSequenceTokenException' ||
        error.code === 'ResourceNotFoundException'
      ) {
        this.sequenceToken = null;
        await this._initialize();

        if (attempt < this.maxRetries) {
          await this._delay(this.retryDelay * Math.pow(2, attempt));
          this.stats.retries++;
          return this._putLogEventsWithRetry(logEvents, attempt + 1);
        }
      }

      if (attempt < this.maxRetries) {
        await this._delay(this.retryDelay * Math.pow(2, attempt));
        this.stats.retries++;
        return this._putLogEventsWithRetry(logEvents, attempt + 1);
      }

      throw error;
    }
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
  async flush() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    if (!this.initialized) {
      await new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (this.initialized) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 10);
      });
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
      processing: this.processing,
      initialized: this.initialized,
      logGroup: this.logGroupName,
      logStream: this.logStreamName,
    };
  }

  /**
   *
   */
  printStatistics() {
    const stats = this.getStatistics();
    console.log('\n=== CLOUDWATCH TRANSPORT STATISTICS ===');
    console.log(`Log Group: ${stats.logGroup}`);
    console.log(`Log Stream: ${stats.logStream}`);
    console.log(`Initialized: ${stats.initialized}`);
    console.log(`Sent: ${stats.sent}`);
    console.log(`Failed: ${stats.failed}`);
    console.log(`Retries: ${stats.retries}`);
    console.log(`Total Events: ${stats.events}`);
    console.log(`Queue Size: ${stats.queueSize}`);
    console.log(`Processing: ${stats.processing}`);
    if (stats.lastError) {
      console.log(`Last Error: ${stats.lastError}`);
    }
    console.log(`Last Sent At: ${stats.lastSentAt}`);
    console.log('=======================================\n');
  }

  /**
   *
   */
  async destroy() {
    await this.flush();
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }
    this.queue = [];
    return this;
  }
}
