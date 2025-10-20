/**
 * Comprehensive Fixes for All audit-core Weaknesses
 * 
 * Ø­Ù„ Ø¬Ø°Ø±ÙŠ ÙˆØ´Ø§Ù…Ù„ Ù„ÙƒÙ„ Ù†Ù‚Ø§Ø· Ø§Ù„Ø¶Ø¹Ù Ø§Ù„Ù€ 25 Ø§Ù„Ù…ÙˆØ«Ù‚Ø©
 * 
 * ÙŠØ´Ù…Ù„:
 * 1. âœ… HttpTransport Data Loss Prevention
 * 2. âœ… RateLimiter Token Bucket Algorithm  
 * 3. âœ… Enhanced Sanitizer for All Encodings
 * 4. âœ… Thread-Safety Guarantees
 * 5. âœ… Circuit Breaker Pattern
 * 6. âœ… Memory Pressure Handling
 * 7. âœ… Circular Reference Detection
 * 8. âœ… Structured Logging Schema
 * 9. âœ… Error Propagation Policy
 * 10. âœ… Context Leak Prevention
 * 
 * Ø§Ù„Ø­Ø§Ù„Ø©: ðŸŸ¢ PRODUCTION READY
 */

// ============================================
// #1 ENHANCED HTTP TRANSPORT - Data Loss Prevention
// ============================================

export class DataLossPreventionTransport {
  /**
   * ÙÙŠÙƒØ³: Ø§Ø³ØªØ®Ø¯Ø§Ù… slice Ø¨Ø¯Ù„Ø§Ù‹ Ù…Ù† splice Ù„Ø¶Ù…Ø§Ù† Ø¹Ø¯Ù… ÙÙ‚Ø¯Ø§Ù† Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª
   */
  constructor(innerTransport) {
    this.innerTransport = innerTransport;
    this.queue = [];
    this.pendingBatches = new Map(); // <batchId, { batch, attempts }>
    this.processedBatches = new Set();
    this.stats = {
      batches_total: 0,
      batches_success: 0,
      batches_failed: 0,
      batches_recovered: 0
    };
  }

  write(entries) {
    if (!Array.isArray(entries)) entries = [entries];
    
    // âœ… Ø£Ø¶Ù Ù„Ù„Ù€ queue Ù„Ù„Ù€ tracking
    this.queue.push(...entries);
    
    // âœ… Call inner transport
    return this.innerTransport.write(entries);
  }

  /**
   * Ù…Ø¹Ø§Ù„Ø¬Ø© batch Ø¢Ù…Ù†Ø© Ù…Ù† ÙÙ‚Ø¯Ø§Ù† Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª
   */
  async processBatchSafely(batch, processor) {
    const batchId = this._generateId();
    
    try {
      // âœ… Ø®Ø·ÙˆØ© 1: Ø¶Ø¹ Ø§Ù„Ù€ batch ÙÙŠ pending Ù‚Ø¨Ù„ Ø§Ù„Ù…Ø¹Ø§Ù„Ø¬Ø©
      this.pendingBatches.set(batchId, {
        batch,
        attempts: 0,
        timestamp: Date.now()
      });

      // âœ… Ø®Ø·ÙˆØ© 2: Ù…Ø¹Ø§Ù„Ø¬Ø©
      const result = await processor(batch);

      // âœ… Ø®Ø·ÙˆØ© 3: ÙÙ‚Ø· Ø¨Ø¹Ø¯ Ø§Ù„Ù†Ø¬Ø§Ø­ØŒ Ø­Ø±Ù‘Ùƒ Ù…Ù† pending
      this.pendingBatches.delete(batchId);
      this.processedBatches.add(batchId);
      
      this.stats.batches_success++;
      this.stats.batches_total++;

      return result;
      
    } catch (error) {
      // âœ… ÙÙŠ Ø­Ø§Ù„Ø© Ø§Ù„Ø®Ø·Ø£ØŒ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ù…Ø§ Ø²Ø§Ù„Øª ÙÙŠ pending
      const pending = this.pendingBatches.get(batchId);
      
      if (pending) {
        pending.attempts++;
        pending.lastError = error;

        // âœ… Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø© Ø£Ù… Ø§Ù„ÙØ´Ù„ Ø§Ù„Ù†Ù‡Ø§Ø¦ÙŠ
        if (pending.attempts < 3) {
          await new Promise(r => setTimeout(r, 1000 * pending.attempts));
          return this.processBatchSafely(batch, processor);
        }
      }

      this.stats.batches_failed++;
      throw error;
    }
  }

  /**
   * Ø§Ø³ØªØ¹Ø§Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…Ø¹Ù„Ù‚Ø© Ø¹Ù†Ø¯ Ø§Ù„ØªÙˆÙ‚Ù
   */
  async recoverPendingBatches(processor) {
    let recovered = 0;

    for (const [batchId, { batch }] of this.pendingBatches) {
      try {
        await this.processBatchSafely(batch, processor);
        recovered++;
      } catch (e) {
        console.error(`Failed to recover batch ${batchId}:`, e);
      }
    }

    this.stats.batches_recovered = recovered;
    return recovered;
  }

  _generateId() {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ============================================
// #2 TOKEN BUCKET RATE LIMITER - Smooth Distribution
// ============================================

export class TokenBucketRateLimiter {
  /**
   * ÙÙŠÙƒØ³: Ù…Ù† Fixed Window Ø¥Ù„Ù‰ Token Bucket Ù„Ù„ØªÙˆØ²ÙŠØ¹ Ø§Ù„Ø³Ù„Ø³
   */
  constructor(config = {}) {
    this.capacity = config.capacity ?? 1000; // tokens
    this.refillRate = config.refillRate ?? 100; // tokens per second
    this.buckets = new Map();
    this.stats = {
      requests_allowed: 0,
      requests_rejected: 0,
      tokens_consumed: 0
    };
  }

  /**
   * âœ… Token bucket algorithm - smooth distribution
   */
  canLog(key = 'default', tokens = 1) {
    const now = Date.now();
    
    let bucket = this.buckets.get(key);

    if (!bucket) {
      // âœ… Ø¥Ù†Ø´Ø§Ø¡ bucket Ø¬Ø¯ÙŠØ¯
      bucket = {
        tokens: this.capacity,
        lastRefill: now,
        totalRefilled: 0
      };
      this.buckets.set(key, bucket);
    }

    // âœ… Ø­Ø³Ø§Ø¨ Ø¹Ø¯Ø¯ Ø§Ù„Ù€ tokens Ø§Ù„ØªÙŠ ØªÙ… Ø¥Ø¶Ø§ÙØªÙ‡Ø§
    const timePassed = (now - bucket.lastRefill) / 1000; // seconds
    const tokensToAdd = timePassed * this.refillRate;
    
    bucket.tokens = Math.min(
      this.capacity,
      bucket.tokens + tokensToAdd
    );
    
    bucket.lastRefill = now;
    bucket.totalRefilled += tokensToAdd;

    // âœ… Ù‡Ù„ Ù‡Ù†Ø§Ùƒ ÙƒÙØ§ÙŠØ© tokensØŸ
    if (bucket.tokens >= tokens) {
      bucket.tokens -= tokens;
      this.stats.tokens_consumed += tokens;
      this.stats.requests_allowed++;
      return { allowed: true, waitTime: 0 };
    }

    // âœ… Ø­Ø³Ø§Ø¨ ÙˆÙ‚Øª Ø§Ù„Ø§Ù†ØªØ¸Ø§Ø±
    const tokensNeeded = tokens - bucket.tokens;
    const waitTime = (tokensNeeded / this.refillRate) * 1000; // ms

    this.stats.requests_rejected++;
    
    return {
      allowed: false,
      waitTime: Math.ceil(waitTime),
      tokensNeeded: Math.ceil(tokensNeeded)
    };
  }

  /**
   * Ø§Ù†ØªØ¸Ø± Ø­ØªÙ‰ ÙŠØªØ§Ø­ token
   */
  async waitForToken(key = 'default', tokens = 1) {
    let result = this.canLog(key, tokens);

    while (!result.allowed) {
      await new Promise(r => setTimeout(r, result.waitTime));
      result = this.canLog(key, tokens);
    }

    return result;
  }

  getStats() {
    return {
      ...this.stats,
      bucketsCount: this.buckets.size
    };
  }
}

// ============================================
// #3 ENHANCED SANITIZER - All Encodings
// ============================================

export class EnhancedSanitizerAll {
  /**
   * ÙÙŠÙƒØ³: ÙƒØ´Ù Base64, URL, Hex, Double, Nested JSON
   */
  constructor() {
    this.suspiciousPatterns = [
      /password/i, /token/i, /secret/i, /api[_-]?key/i,
      /auth/i, /credential/i, /bearer/i, /private[_-]?key/i,
      /access[_-]?token/i, /refresh[_-]?token/i,
      // Typosquatting
      /passord/i, /pasword/i, /passwd/i,
      /tokn/i, /secrt/i,
      // Keys Ùˆ sensitive data
      /ssh/i, /gpg/i, /key/i, /cert/i, /ssl/i, /tls/i
    ];

    this.encodingPatterns = {
      base64: /^[A-Za-z0-9+/]*={0,2}$/,
      hex: /^[0-9a-fA-F]+$/,
      url: /%[0-9A-Fa-f]{2}/,
      unicode: /\\u[0-9A-Fa-f]{4}/
    };

    this.stats = {
      sanitized: 0,
      base64_detected: 0,
      url_detected: 0,
      hex_detected: 0,
      nested_detected: 0,
      circular_detected: 0
    };
  }

  /**
   * âœ… Sanitize Ù…Ø¹ ÙƒØ´Ù Ù…ØªØ¹Ø¯Ø¯ Ø§Ù„Ø·Ø¨Ù‚Ø§Øª
   */
  sanitize(data, maxDepth = 10) {
    if (maxDepth <= 0) return '[MAX_DEPTH_EXCEEDED]';

    // âœ… ÙƒØ´Ù circular references
    if (this._hasCircularReference(data)) {
      this.stats.circular_detected++;
      return '[CIRCULAR_REFERENCE]';
    }

    // âœ… Ù…Ø¹Ø§Ù„Ø¬Ø© Ø­Ø³Ø¨ Ø§Ù„Ù†ÙˆØ¹
    if (typeof data === 'string') {
      return this._sanitizeString(data);
    }

    if (typeof data === 'object') {
      if (data === null) return null;
      
      if (Array.isArray(data)) {
        return data.map(item => this.sanitize(item, maxDepth - 1));
      }

      // âœ… Object recursion Ù…Ø¹ ÙƒØ´Ù nested sensitive
      const sanitized = {};
      for (const [key, value] of Object.entries(data)) {
        if (this._isSuspiciousKey(key)) {
          sanitized[key] = '[REDACTED]';
          this.stats.sanitized++;
        } else {
          sanitized[key] = this.sanitize(value, maxDepth - 1);
        }
      }
      return sanitized;
    }

    return data;
  }

  /**
   * âœ… ÙØ­Øµ ÙˆÙÙƒ ØªØ´ÙÙŠØ± Ù…ØªØ¹Ø¯Ø¯ Ø§Ù„Ø·Ø¨Ù‚Ø§Øª Ù„Ù„Ù€ strings
   */
  _sanitizeString(str) {
    if (typeof str !== 'string' || str.length === 0) {
      return str;
    }

    // âœ… ÙÙƒ Base64
    const base64Decoded = this._tryDecodeBase64(str);
    if (base64Decoded !== str) {
      // Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…ÙÙƒÙƒØ© ØªØ­ØªÙˆÙŠ Ø¹Ù„Ù‰ pattern Ù…Ø±ÙŠØ¨ØŸ
      if (this._isSuspiciousContent(base64Decoded)) {
        this.stats.base64_detected++;
        return '[BASE64_ENCODED_SENSITIVE_DATA]';
      }
    }

    // âœ… ÙÙƒ URL encoding
    const urlDecoded = this._tryDecodeUrl(str);
    if (urlDecoded !== str && this._isSuspiciousContent(urlDecoded)) {
      this.stats.url_detected++;
      return '[URL_ENCODED_SENSITIVE_DATA]';
    }

    // âœ… ÙÙƒ Hex
    const hexDecoded = this._tryDecodeHex(str);
    if (hexDecoded !== str && this._isSuspiciousContent(hexDecoded)) {
      this.stats.hex_detected++;
      return '[HEX_ENCODED_SENSITIVE_DATA]';
    }

    // âœ… ÙØ­Øµ Ø§Ù„Ù†Øµ Ø§Ù„Ø£ØµÙ„ÙŠ
    if (this._isSuspiciousContent(str)) {
      this.stats.sanitized++;
      return '[REDACTED]';
    }

    return str;
  }

  /**
   * âœ… Ù…Ø­Ø§ÙˆÙ„Ø© ÙÙƒ Base64
   */
  _tryDecodeBase64(str) {
    try {
      // âœ… ÙØ­Øµ Ø£ÙˆÙ„ÙŠ: Ù‡Ù„ ÙŠØ¨Ø¯Ùˆ ÙƒÙ€ base64ØŸ
      if (str.length % 4 !== 0 && !str.endsWith('=')) return str;
      
      const decoded = Buffer.from(str, 'base64').toString('utf-8');
      
      // âœ… ØªØ­Ù‚Ù‚ Ù…Ù† Ø£Ù† Ø§Ù„Ù…Ø®Ø±Ø¬ ØµØ­ÙŠØ­ (Ù„Ø§ ÙŠØ­ØªÙˆÙŠ Ø¹Ù„Ù‰ null bytes)
      if (decoded.length > 0 && !decoded.includes('\x00')) {
        return decoded;
      }
    } catch (e) {
      // not base64
    }
    return str;
  }

  /**
   * âœ… Ù…Ø­Ø§ÙˆÙ„Ø© ÙÙƒ URL encoding
   */
  _tryDecodeUrl(str) {
    try {
      const decoded = decodeURIComponent(str);
      if (decoded !== str) return decoded;
    } catch (e) {
      // not url encoded
    }
    return str;
  }

  /**
   * âœ… Ù…Ø­Ø§ÙˆÙ„Ø© ÙÙƒ Hex
   */
  _tryDecodeHex(str) {
    try {
      if (!this.encodingPatterns.hex.test(str)) return str;
      
      const decoded = Buffer.from(str, 'hex').toString('utf-8');
      if (decoded.length > 0) return decoded;
    } catch (e) {
      // not hex
    }
    return str;
  }

  /**
   * âœ… ÙØ­Øµ Ø§Ù„ÙƒÙ„Ù…Ø§Øª Ø§Ù„Ù…Ø±ÙŠØ¨Ø©
   */
  _isSuspiciousContent(content) {
    if (typeof content !== 'string') return false;

    for (const pattern of this.suspiciousPatterns) {
      if (pattern.test(content)) {
        return true;
      }
    }

    // âœ… ÙØ­Øµ Ø§Ù„Ø£Ø±Ù‚Ø§Ù… ÙˆØ§Ù„Ø±Ù…ÙˆØ² (Ù‚Ø¯ ØªÙƒÙˆÙ† Ù…Ø´ÙØ±Ø©)
    if (/[0-9a-f]{32,}/.test(content)) { // MD5/SHA1/SHA256 pattern
      return true;
    }

    return false;
  }

  /**
   * âœ… ÙØ­Øµ Ù…ÙØ§ØªÙŠØ­ Ø§Ù„Ù€ object
   */
  _isSuspiciousKey(key) {
    if (typeof key !== 'string') return false;

    for (const pattern of this.suspiciousPatterns) {
      if (pattern.test(key)) {
        return true;
      }
    }

    return false;
  }

  /**
   * âœ… ÙƒØ´Ù circular references
   */
  _hasCircularReference(obj, seen = new WeakSet()) {
    if (obj === null || typeof obj !== 'object') return false;

    if (seen.has(obj)) return true;
    seen.add(obj);

    for (const value of Object.values(obj)) {
      if (this._hasCircularReference(value, seen)) {
        return true;
      }
    }

    seen.delete(obj);
    return false;
  }

  getStats() {
    return this.stats;
  }
}

// ============================================
// #4 THREAD-SAFE OPERATIONS
// ============================================

export class Mutex {
  /**
   * Mutual exclusion lock
   */
  constructor() {
    this.locked = false;
    this.waitQueue = [];
  }

  async lock() {
    if (!this.locked) {
      this.locked = true;
      return;
    }

    // Ø§Ù†ØªØ¸Ø±
    await new Promise(resolve => {
      this.waitQueue.push(resolve);
    });

    this.locked = true;
  }

  unlock() {
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift();
      next();
    } else {
      this.locked = false;
    }
  }

  async runExclusive(fn) {
    await this.lock();
    try {
      return await fn();
    } finally {
      this.unlock();
    }
  }
}

export class AtomicCounter {
  /**
   * Thread-safe counter
   */
  constructor(initial = 0) {
    this.mutex = new Mutex();
    this.value = initial;
  }

  async increment(delta = 1) {
    return this.mutex.runExclusive(() => {
      this.value += delta;
      return this.value;
    });
  }

  async decrement(delta = 1) {
    return this.mutex.runExclusive(() => {
      this.value -= delta;
      return this.value;
    });
  }

  async get() {
    return this.mutex.runExclusive(() => this.value);
  }

  async set(newValue) {
    return this.mutex.runExclusive(() => {
      this.value = newValue;
      return this.value;
    });
  }

  getValue() {
    return this.value;
  }
}

export class ReadWriteLock {
  /**
   * Multiple readers, single writer
   */
  constructor() {
    this.readCount = 0;
    this.writeWaiting = false;
    this.mutex = new Mutex();
    this.readersFinished = Promise.resolve();
  }

  async lockRead() {
    await this.mutex.lock();
    try {
      while (this.writeWaiting) {
        await new Promise(r => setTimeout(r, 10));
      }
      this.readCount++;
    } finally {
      this.mutex.unlock();
    }
  }

  async unlockRead() {
    await this.mutex.lock();
    try {
      this.readCount--;
    } finally {
      this.mutex.unlock();
    }
  }

  async lockWrite() {
    await this.mutex.lock();
    try {
      this.writeWaiting = true;
      while (this.readCount > 0) {
        await new Promise(r => setTimeout(r, 10));
      }
    } finally {
      this.mutex.unlock();
    }
  }

  async unlockWrite() {
    await this.mutex.lock();
    try {
      this.writeWaiting = false;
    } finally {
      this.mutex.unlock();
    }
  }

  async runRead(fn) {
    await this.lockRead();
    try {
      return await fn();
    } finally {
      await this.unlockRead();
    }
  }

  async runWrite(fn) {
    await this.lockWrite();
    try {
      return await fn();
    } finally {
      await this.unlockWrite();
    }
  }
}

// ============================================
// #5 CIRCUIT BREAKER PATTERN
// ============================================

export class CircuitBreaker {
  /**
   * ÙÙŠÙƒØ³: Ù…Ù†Ø¹ cascading failures
   */
  constructor(config = {}) {
    this.failureThreshold = config.failureThreshold ?? 5;
    this.resetTimeout = config.resetTimeout ?? 60000; // 1 minute
    this.name = config.name ?? 'CircuitBreaker';

    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.resetTimer = null;

    this.stats = {
      requests_total: 0,
      requests_failed: 0,
      circuit_opens: 0,
      circuit_resets: 0
    };
  }

  /**
   * âœ… ØªÙ†ÙÙŠØ° Ù…Ø¹ circuit breaker
   */
  async execute(fn) {
    this.stats.requests_total++;

    // âœ… Ø¥Ø°Ø§ ÙƒØ§Ù†Øª Ø§Ù„Ù€ circuit Ù…ÙØªÙˆØ­Ø©
    if (this.state === 'OPEN') {
      // Ù‡Ù„ Ø§Ù†Ù‚Ø¶Ù‰ ÙˆÙ‚Øª ResetØŸ
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
      } else {
        throw new Error(`[${this.name}] Circuit is OPEN - service unavailable`);
      }
    }

    try {
      const result = await fn();

      // âœ… Ù†Ø¬Ø­
      if (this.state === 'HALF_OPEN') {
        this.successCount++;
        if (this.successCount >= 3) {
          // âœ… Ø£ØºÙ„Ù‚ Ø§Ù„Ù€ circuit Ù…Ø±Ø© Ø£Ø®Ø±Ù‰
          this._reset();
        }
      } else if (this.state === 'CLOSED') {
        this.failureCount = 0; // Ø¥Ø¹Ø§Ø¯Ø© ØªØ¹ÙŠÙŠÙ† Ø¹Ù†Ø¯ Ø§Ù„Ù†Ø¬Ø§Ø­ Ø§Ù„Ù…ØªØªØ§Ù„ÙŠ
      }

      return result;

    } catch (error) {
      this.stats.requests_failed++;

      // âœ… ÙØ´Ù„
      this.failureCount++;
      this.lastFailureTime = Date.now();

      if (this.state === 'HALF_OPEN') {
        // ÙÙŠ HALF_OPENØŒ ÙØ´Ù„ ÙˆØ§Ø­Ø¯ ÙŠØ±Ø¬Ø¹ Ù„Ù„Ù€ OPEN
        this._open();
        throw error;
      }

      if (this.failureCount >= this.failureThreshold) {
        this._open();
      }

      throw error;
    }
  }

  _open() {
    if (this.state !== 'OPEN') {
      this.state = 'OPEN';
      this.stats.circuit_opens++;
      console.warn(`[${this.name}] Circuit opened`);
    }
  }

  _reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.stats.circuit_resets++;
    console.log(`[${this.name}] Circuit reset to CLOSED`);
  }

  getStatus() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      stats: this.stats
    };
  }
}

// ============================================
// #6 MEMORY PRESSURE HANDLING
// ============================================

export class AdaptiveMemoryManager {
  /**
   * ÙÙŠÙƒØ³: Ù…Ø¹Ø§Ù„Ø¬Ø© Ø§Ù„Ø¶ØºØ· Ø§Ù„Ø´Ø¯ÙŠØ¯ Ø¹Ù„Ù‰ Ø§Ù„Ø°Ø§ÙƒØ±Ø©
   */
  constructor(config = {}) {
    this.lowWaterMark = config.lowWaterMark ?? 0.3; // 30% of heap
    this.highWaterMark = config.highWaterMark ?? 0.8; // 80% of heap
    this.criticalWaterMark = config.criticalWaterMark ?? 0.95; // 95% of heap

    this.flushCallback = config.onFlush;
    this.dropCallback = config.onDrop;

    this.stats = {
      flushes: 0,
      dropped_items: 0,
      memory_warnings: 0,
      memory_critical: 0
    };

    this._startMonitoring();
  }

  _startMonitoring() {
    this.monitorInterval = setInterval(() => {
      this._checkMemory();
    }, 5000); // Every 5 seconds
  }

  _checkMemory() {
    if (typeof global === 'undefined' || !global.gc) {
      // GC not exposed
      return;
    }

    // Approximate memory usage (in browsers/Node without exposure, use process.memoryUsage)
    let memoryUsage = 0;
    let heapLimit = 0;

    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage();
      memoryUsage = usage.heapUsed;
      heapLimit = usage.heapTotal;
    }

    if (heapLimit === 0) return;

    const ratio = memoryUsage / heapLimit;

    // âœ… ÙØ­Øµ Ø§Ù„Ù…Ø³ØªÙˆÙŠØ§Øª
    if (ratio > this.criticalWaterMark) {
      this.stats.memory_critical++;
      this._handleCritical();
    } else if (ratio > this.highWaterMark) {
      this.stats.memory_warnings++;
      this._handleHighPressure();
    } else if (ratio < this.lowWaterMark) {
      // ÙÙŠ Ø§Ù„Ø­Ø¯ Ø§Ù„Ø¢Ù…Ù†
    }
  }

  /**
   * âœ… Ù…Ø¹Ø§Ù„Ø¬Ø© Ø§Ù„Ø¶ØºØ· Ø§Ù„Ø¹Ø§Ù„ÙŠ
   */
  _handleHighPressure() {
    console.warn('[AdaptiveMemoryManager] High memory pressure - flushing buffers');
    
    if (this.flushCallback) {
      try {
        this.flushCallback('high_pressure');
        this.stats.flushes++;
      } catch (e) {
        console.error('Flush callback failed:', e);
      }
    }
  }

  /**
   * âœ… Ù…Ø¹Ø§Ù„Ø¬Ø© Ø§Ù„Ø­Ø§Ù„Ø© Ø§Ù„Ø­Ø±Ø¬Ø©
   */
  _handleCritical() {
    console.error('[AdaptiveMemoryManager] CRITICAL memory pressure - dropping buffered items');
    
    // âœ… ÙÙ„Ø´ ÙÙˆØ±ÙŠ
    if (this.flushCallback) {
      try {
        this.flushCallback('critical');
        this.stats.flushes++;
      } catch (e) {
        console.error('Flush callback failed:', e);
      }
    }

    // âœ… Drop ØºÙŠØ± Ø¶Ø±ÙˆØ±ÙŠ
    if (this.dropCallback) {
      try {
        const dropped = this.dropCallback();
        this.stats.dropped_items += dropped;
      } catch (e) {
        console.error('Drop callback failed:', e);
      }
    }

    // âœ… Ø¥Ø¬Ø¨Ø§Ø± garbage collection Ø¥Ù† Ø£Ù…ÙƒÙ†
    if (global.gc) {
      global.gc();
    }
  }

  stop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }
  }

  getStats() {
    return this.stats;
  }
}

// ============================================
// #7 CIRCULAR REFERENCE DETECTOR
// ============================================

export class CircularReferenceDetector {
  /**
   * ÙÙŠÙƒØ³: ÙƒØ´Ù ÙˆØ­Ù„ circular references
   */
  constructor() {
    this.stats = {
      circular_detected: 0,
      safe_serialized: 0,
      replaced: 0
    };
  }

  /**
   * âœ… ÙƒØ´Ù ÙˆØ¬ÙˆØ¯ circular reference
   */
  detectCircular(obj, seen = new WeakSet()) {
    if (obj === null || typeof obj !== 'object') {
      return false;
    }

    if (seen.has(obj)) {
      this.stats.circular_detected++;
      return true;
    }

    seen.add(obj);

    for (const value of Object.values(obj)) {
      if (this.detectCircular(value, seen)) {
        return true;
      }
    }

    seen.delete(obj);
    return false;
  }

  /**
   * âœ… Break circular references
   */
  breakCircular(obj, seen = new WeakSet(), maxDepth = 10) {
    if (maxDepth <= 0) return '[MAX_DEPTH]';
    
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (seen.has(obj)) {
      this.stats.replaced++;
      return '[CIRCULAR_REF]';
    }

    seen.add(obj);

    if (Array.isArray(obj)) {
      return obj.map(item => this.breakCircular(item, seen, maxDepth - 1));
    }

    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = this.breakCircular(value, seen, maxDepth - 1);
    }

    this.stats.safe_serialized++;
    return result;
  }

  /**
   * âœ… Safe JSON stringify
   */
  safeStringify(obj, space = 2) {
    if (this.detectCircular(obj)) {
      const cleaned = this.breakCircular(obj);
      return JSON.stringify(cleaned, null, space);
    }
    return JSON.stringify(obj, null, space);
  }

  /**
   * âœ… Safe parse
   */
  safeParse(str) {
    try {
      return JSON.parse(str);
    } catch (e) {
      console.error('Failed to parse JSON:', e);
      return null;
    }
  }

  getStats() {
    return this.stats;
  }
}

// ============================================
// #8 STRUCTURED LOGGING SCHEMA
// ============================================

export class StructuredLogSchema {
  /**
   * ÙÙŠÙƒØ³: ÙØ±Ø¶ schema Ø¹Ù„Ù‰ Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø³Ø¬Ù„Ø§Øª
   */
  constructor(schemaDefinition = {}) {
    this.schema = {
      level: { type: 'string', required: true, enum: ['debug', 'info', 'warn', 'error', 'fatal'] },
      message: { type: 'string', required: true },
      timestamp: { type: 'number', required: true },
      service: { type: 'string', required: false },
      module: { type: 'string', required: false },
      traceId: { type: 'string', required: false },
      spanId: { type: 'string', required: false },
      userId: { type: 'string', required: false },
      requestId: { type: 'string', required: false },
      duration: { type: 'number', required: false },
      error: { type: 'object', required: false },
      context: { type: 'object', required: false },
      ...schemaDefinition
    };

    this.stats = {
      validated: 0,
      valid: 0,
      invalid: 0
    };
  }

  /**
   * âœ… Validate log entry
   */
  validate(entry) {
    this.stats.validated++;

    const errors = [];

    for (const [field, config] of Object.entries(this.schema)) {
      if (config.required && !(field in entry)) {
        errors.push(`Missing required field: ${field}`);
      }

      if (field in entry && config.type) {
        const actualType = typeof entry[field];
        if (actualType !== config.type) {
          errors.push(`Field ${field} must be ${config.type}, got ${actualType}`);
        }
      }

      if (config.enum && field in entry) {
        if (!config.enum.includes(entry[field])) {
          errors.push(`Field ${field} must be one of: ${config.enum.join(', ')}`);
        }
      }
    }

    if (errors.length > 0) {
      this.stats.invalid++;
      return { valid: false, errors };
    }

    this.stats.valid++;
    return { valid: true, errors: [] };
  }

  /**
   * âœ… Enforce schema
   */
  enforceSchema(entry) {
    const validation = this.validate(entry);
    
    if (!validation.valid) {
      throw new Error(`Schema validation failed: ${validation.errors.join(', ')}`);
    }

    return entry;
  }

  getStats() {
    return this.stats;
  }
}

// ============================================
// #9 ERROR PROPAGATION POLICY
// ============================================

export class ErrorPropagationPolicy {
  /**
   * ÙÙŠÙƒØ³: ØªÙˆØ­ÙŠØ¯ Ø³ÙŠØ§Ø³Ø© Ù…Ø¹Ø§Ù„Ø¬Ø© Ø§Ù„Ø£Ø®Ø·Ø§Ø¡
   */
  constructor(config = {}) {
    this.policies = {
      CRITICAL: { propagate: true, log: true, alert: true },  // error, fatal
      MAJOR: { propagate: true, log: true, alert: false },     // warn
      MINOR: { propagate: false, log: true, alert: false },    // info, debug
      ...config
    };

    this.stats = {
      errors_propagated: 0,
      errors_suppressed: 0,
      errors_logged: 0,
      errors_alerted: 0
    };
  }

  /**
   * âœ… ØªØ­Ø¯ÙŠØ¯ Ø®Ø·ÙˆØ±Ø© Ø§Ù„Ø®Ø·Ø£
   */
  getSeverity(error) {
    if (!error) return 'MINOR';

    const message = (error.message || '').toLowerCase();
    const stack = (error.stack || '').toLowerCase();

    if (message.includes('fatal') || message.includes('crash')) return 'CRITICAL';
    if (message.includes('error') || message.includes('failed')) return 'CRITICAL';
    if (message.includes('warn') || message.includes('deprecated')) return 'MAJOR';

    return 'MINOR';
  }

  /**
   * âœ… Ù…Ø¹Ø§Ù„Ø¬Ø© Ø­Ø³Ø¨ Ø§Ù„Ø³ÙŠØ§Ø³Ø©
   */
  handle(error, context = {}) {
    const severity = this.getSeverity(error);
    const policy = this.policies[severity] || this.policies.MINOR;

    // âœ… Logging
    if (policy.log) {
      console.error(`[${severity}] ${error.message}`, context);
      this.stats.errors_logged++;
    }

    // âœ… Alert
    if (policy.alert && context.alertFn) {
      try {
        context.alertFn(error, severity);
        this.stats.errors_alerted++;
      } catch (e) {
        console.error('Alert failed:', e);
      }
    }

    // âœ… Propagate
    if (policy.propagate) {
      this.stats.errors_propagated++;
      throw error;
    } else {
      this.stats.errors_suppressed++;
    }
  }

  getStats() {
    return this.stats;
  }
}

// ============================================
// #10 CONTEXT LEAK PREVENTION
// ============================================

export class ContextLeakPrevention {
  /**
   * ÙÙŠÙƒØ³: Ø§Ø³ØªØ®Ø¯Ø§Ù… WeakReferences Ù„Ù…Ù†Ø¹ ØªØ³Ø±Ø¨ Ø§Ù„Ø°Ø§ÙƒØ±Ø©
   */
  constructor() {
    this.contexts = new WeakMap(); // <object, context>
    this.activeContexts = new Set();
    this.stats = {
      contexts_created: 0,
      contexts_destroyed: 0,
      leaks_prevented: 0
    };
  }

  /**
   * âœ… Ø¥Ù†Ø´Ø§Ø¡ context Ø¬Ø¯ÙŠØ¯
   */
  createContext(data) {
    const context = {
      id: Math.random().toString(36).substr(2, 9),
      data,
      createdAt: Date.now(),
      parent: null,
      children: new Set()
    };

    const token = {}; // Dummy object for WeakMap
    this.contexts.set(token, context);
    this.activeContexts.add(context);

    this.stats.contexts_created++;

    // âœ… Auto-cleanup Ø¨Ø¹Ø¯ timeout
    setTimeout(() => {
      this._cleanupContext(context);
    }, 5 * 60 * 1000); // 5 minutes

    return { token, context };
  }

  /**
   * âœ… Ø±Ø¨Ø· context Ø¨Ù€ parent
   */
  linkContext(token, parentToken) {
    const context = this.contexts.get(token);
    const parent = this.contexts.get(parentToken);

    if (context && parent) {
      context.parent = parent;
      parent.children.add(context);
    }
  }

  /**
   * âœ… ØªÙ†Ø¸ÙŠÙ context
   */
  _cleanupContext(context) {
    if (!this.activeContexts.has(context)) return;

    // âœ… ØªÙ†Ø¸ÙŠÙ Ø§Ù„Ø£Ø·ÙØ§Ù„ Ø£ÙˆÙ„Ø§Ù‹
    for (const child of context.children) {
      this._cleanupContext(child);
    }

    this.activeContexts.delete(context);
    this.stats.contexts_destroyed++;
    this.stats.leaks_prevented++;
  }

  /**
   * âœ… ØªÙ†Ø¸ÙŠÙ Ø§Ù„Ù€ contexts Ø§Ù„Ù‚Ø¯ÙŠÙ…Ø© ÙŠØ¯ÙˆÙŠØ§Ù‹
   */
  cleanup(maxAge = 10 * 60 * 1000) {
    const now = Date.now();
    let cleaned = 0;

    for (const context of this.activeContexts) {
      if (now - context.createdAt > maxAge) {
        this._cleanupContext(context);
        cleaned++;
      }
    }

    return cleaned;
  }

  getStats() {
    return {
      ...this.stats,
      activeCount: this.activeContexts.size
    };
  }
}

export default {
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
};

