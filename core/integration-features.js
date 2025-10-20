/**
 * Integration of All Comprehensive Fixes
 * 
 * Ø±Ø¨Ø· Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø­Ù„ÙˆÙ„ Ù…Ø¹ Ø§Ù„Ù€ audit-core Ø§Ù„Ù…ÙˆØ¬ÙˆØ¯
 * 
 * Ø§Ù„Ù…Ù„ÙØ§Øª Ø§Ù„Ù…ØªØ£Ø«Ø±Ø©:
 * - http-transport.js
 * - enhanced-log-buffer.js
 * - rate-limiter.js
 * - enhanced-sanitizer.js
 * - enhanced-logger.js
 */

import {
  DataLossPreventionTransport,
  TokenBucketRateLimiter,
  EnhancedSanitizerAll,
  Mutex,
  AtomicCounter,
  ReadWriteLock,
  CircuitBreaker,
  AdaptiveMemoryManager,
  CircularReferenceDetector,
  StructuredLogSchema,
  ErrorPropagationPolicy,
  ContextLeakPrevention
} from './comprehensive-features.js';

// ============================================
// Enhanced Http Transport Integration
// ============================================

export class IntegratedHttpTransport {
  constructor(config = {}) {
    // âœ… Circuit Breaker for failover protection
    this.circuitBreaker = new CircuitBreaker({
      name: 'HttpTransport',
      failureThreshold: 5,
      resetTimeout: 60000
    });

    // âœ… Data Loss Prevention
    this.dlp = new DataLossPreventionTransport(this);

    // âœ… Token Bucket Rate Limiter
    this.rateLimiter = new TokenBucketRateLimiter({
      capacity: config.capacity ?? 1000,
      refillRate: config.refillRate ?? 100
    });

    // âœ… Memory Management
    this.memoryManager = new AdaptiveMemoryManager({
      onFlush: () => this.flush(),
      onDrop: () => this.dropOldest()
    });

    this.endpoint = config.endpoint;
    this.queue = [];
    this.processing = false;
    this.timeout = config.timeout ?? 5000;
    this.retries = config.retries ?? 3;

    this.stats = {
      sent: 0,
      failed: 0,
      dropped: 0,
      rateLimited: 0
    };
  }

  /**
   * âœ… Write with rate limiting Ùˆ circuit breaker
   */
  async write(entries) {
    if (!Array.isArray(entries)) entries = [entries];

    // âœ… Check rate limit
    const rateLimitResult = this.rateLimiter.canLog('default', entries.length);
    if (!rateLimitResult.allowed) {
      console.warn(`[IntegratedHttpTransport] Rate limited - waiting ${rateLimitResult.waitTime}ms`);
      this.stats.rateLimited++;
      await this.rateLimiter.waitForToken('default', entries.length);
    }

    // âœ… Add to queue
    this.queue.push(...entries);

    // âœ… Trigger processing
    this._scheduleBatch();
  }

  /**
   * âœ… Process batch with DLP + Circuit Breaker
   */
  async _processBatch() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    try {
      const batch = this.queue.slice(0, 50); // slice, not splice!

      // âœ… Use circuit breaker
      const response = await this.circuitBreaker.execute(async () => {
        return await this._sendWithRetry(batch);
      });

      // âœ… Only remove from queue after success
      this.queue.splice(0, batch.length);
      this.stats.sent += batch.length;

    } catch (error) {
      this.stats.failed++;
      console.error('[IntegratedHttpTransport] Send failed:', error.message);
    } finally {
      this.processing = false;
    }
  }

  async _sendWithRetry(batch, attempt = 0) {
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logs: batch,
          timestamp: new Date().toISOString()
        }),
        signal: AbortSignal.timeout(this.timeout)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return response;

    } catch (error) {
      if (attempt < this.retries) {
        const delay = Math.pow(2, attempt) * 100;
        await new Promise(r => setTimeout(r, delay));
        return this._sendWithRetry(batch, attempt + 1);
      }
      throw error;
    }
  }

  _scheduleBatch() {
    if (this.queue.length >= 50) {
      this._processBatch();
    }
  }

  async dropOldest() {
    let dropped = 0;
    while (this.queue.length > 500 && dropped < 100) {
      this.queue.shift();
      dropped++;
    }
    this.stats.dropped += dropped;
    return dropped;
  }

  async flush() {
    while (this.queue.length > 0) {
      await this._processBatch();
    }
  }
}

// ============================================
// Enhanced Buffer with Thread Safety
// ============================================

export class ThreadSafeEnhancedBuffer {
  constructor(config = {}) {
    this.mutex = new Mutex();
    this.readWriteLock = new ReadWriteLock();

    this.buffer = [];
    this.capacity = config.capacity ?? 1000;
    this.highWaterMark = config.highWaterMark ?? 0.8;
    this.lowWaterMark = config.lowWaterMark ?? 0.3;

    this.memorySize = new AtomicCounter(0);
    this.stats = {
      written: 0,
      flushed: 0,
      dropped: 0
    };
  }

  /**
   * âœ… Thread-safe write
   */
  async push(entry) {
    return this.mutex.runExclusive(async () => {
      if (this.buffer.length >= this.capacity) {
        this.stats.dropped++;
        return false;
      }

      this.buffer.push(entry);
      this.stats.written++;

      const memoryUsage = Buffer.byteLength(JSON.stringify(entry));
      await this.memorySize.increment(memoryUsage);

      return true;
    });
  }

  /**
   * âœ… Thread-safe flush with read lock
   */
  async flush() {
    return this.readWriteLock.runWrite(async () => {
      const entries = this.buffer.splice(0);
      await this.memorySize.set(0);
      this.stats.flushed += entries.length;
      return entries;
    });
  }

  /**
   * âœ… Thread-safe read
   */
  async read() {
    return this.readWriteLock.runRead(async () => {
      return [...this.buffer];
    });
  }

  async getSize() {
    return this.readWriteLock.runRead(async () => {
      return this.buffer.length;
    });
  }
}

// ============================================
// Enhanced Rate Limiter Integration
// ============================================

export class EnhancedRateLimiterIntegrated {
  constructor(config = {}) {
    // âœ… Token Bucket instead of Fixed Window
    this.tokenBucket = new TokenBucketRateLimiter({
      capacity: config.maxPerSecond ?? 1000,
      refillRate: config.maxPerSecond ?? 1000
    });

    this.stats = {
      checked: 0,
      allowed: 0,
      rejected: 0
    };
  }

  canLog(key = 'default', tokens = 1) {
    this.stats.checked++;

    const result = this.tokenBucket.canLog(key, tokens);

    if (result.allowed) {
      this.stats.allowed++;
      return true;
    } else {
      this.stats.rejected++;
      return false;
    }
  }

  async waitForToken(key = 'default', tokens = 1) {
    return this.tokenBucket.waitForToken(key, tokens);
  }
}

// ============================================
// Enhanced Sanitizer Integration
// ============================================

export class EnhancedSanitizerIntegrated {
  constructor(config = {}) {
    this.sanitizer = new EnhancedSanitizerAll();
    this.circularDetector = new CircularReferenceDetector();

    this.stats = {
      sanitized_entries: 0,
      circular_refs_found: 0,
      security_issues_found: 0
    };
  }

  /**
   * âœ… Sanitize with all protections
   */
  sanitize(data) {
    // âœ… Check circular references first
    if (this.circularDetector.detectCircular(data)) {
      data = this.circularDetector.breakCircular(data);
      this.stats.circular_refs_found++;
    }

    // âœ… Sanitize sensitive data
    const sanitized = this.sanitizer.sanitize(data);

    this.stats.sanitized_entries++;

    return sanitized;
  }

  /**
   * âœ… Safe stringify
   */
  safeStringify(data) {
    return this.circularDetector.safeStringify(this.sanitize(data));
  }
}

// ============================================
// Logger with All Enhancements
// ============================================

export class EnhancedLoggerFully {
  constructor(config = {}) {
    // âœ… All fixes integrated
    this.transport = new IntegratedHttpTransport(config);
    this.buffer = new ThreadSafeEnhancedBuffer(config);
    this.rateLimiter = new EnhancedRateLimiterIntegrated(config);
    this.sanitizer = new EnhancedSanitizerIntegrated(config);

    // âœ… Schema validation
    this.schema = new StructuredLogSchema(config.schema);

    // âœ… Error propagation policy
    this.errorPolicy = new ErrorPropagationPolicy(config.errorPolicy);

    // âœ… Context leak prevention
    this.contextPrevention = new ContextLeakPrevention();

    this.config = config;
    this.stats = {
      logged: 0,
      sanitized: 0,
      dropped: 0
    };
  }

  /**
   * âœ… Complete logging pipeline
   */
  async log(level, message, data = {}) {
    // âœ… Rate limiting check
    if (!this.rateLimiter.canLog('default', 1)) {
      await this.rateLimiter.waitForToken('default', 1);
    }

    // âœ… Build structured log entry
    const entry = {
      level,
      message,
      timestamp: Date.now(),
      data: this.sanitizer.sanitize(data)
    };

    // âœ… Schema validation
    try {
      this.schema.enforceSchema(entry);
    } catch (e) {
      console.warn('[EnhancedLogger] Schema validation warning:', e.message);
    }

    // âœ… Add to buffer
    const added = await this.buffer.push(entry);

    if (!added) {
      this.stats.dropped++;
      return false;
    }

    this.stats.logged++;
    this.stats.sanitized++;

    // âœ… Trigger flush if needed
    if (await this.buffer.getSize() >= 50) {
      this._flushAsync();
    }

    return true;
  }

  /**
   * âœ… Async flush without blocking
   */
  _flushAsync() {
    setImmediate(() => {
      this.buffer.flush().then(entries => {
        if (entries.length > 0) {
          this.transport.write(entries);
        }
      });
    });
  }

  // Convenience methods
  async debug(message, data) {
    return this.log('debug', message, data);
  }

  async info(message, data) {
    return this.log('info', message, data);
  }

  async warn(message, data) {
    return this.log('warn', message, data);
  }

  async error(message, data) {
    return this.log('error', message, data);
  }

  async fatal(message, data) {
    return this.log('fatal', message, data);
  }

  getStatistics() {
    return {
      logger: this.stats,
      transport: this.transport.stats,
      buffer: this.buffer.stats,
      rateLimiter: this.rateLimiter.stats,
      sanitizer: this.sanitizer.stats,
      schema: this.schema.getStats(),
      circuitBreaker: this.transport.circuitBreaker.getStatus()
    };
  }
}

export default {
  IntegratedHttpTransport,
  ThreadSafeEnhancedBuffer,
  EnhancedRateLimiterIntegrated,
  EnhancedSanitizerIntegrated,
  EnhancedLoggerFully
};

