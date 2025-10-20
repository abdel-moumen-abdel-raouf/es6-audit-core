/**
 * 
 * 
 * - Token distribution smoothing
 * - Concurrent request handling
 * - Multiple rate limiter strategy
 * - Load-aware adjustment
 * - Statistics tracking
 */

export class StrictBurstLimiter {
  constructor(config = {}) {
    this.tokensPerSecond = config.tokensPerSecond ?? 1000;
    this.burstCapacity = config.burstCapacity ?? Math.ceil(this.tokensPerSecond / 10); // 10% of TPS
    this.maxConcurrent = config.maxConcurrent ?? Math.ceil(this.tokensPerSecond / 100); // 1% for concurrent
    
    
    this.buckets = new Map(); // key -> bucket state
    this.concurrentRequests = new Map(); // key -> count
    
    // Statistics
    this.stats = {
      allowed: 0,
      rejected: 0,
      throttled: 0,
      burstUsed: 0,
      concurrentLimited: 0
    };

    // Configuration
    this.logger = config.logger || null;
  }

  /**
 * 
 */
  canLog(key = 'default') {
    const now = Date.now() / 1000; 
    let bucket = this.buckets.get(key);

    
    if (!bucket) {
      bucket = {
        tokens: Math.min(this.burstCapacity, this.tokensPerSecond / 100), 
        lastRefillTime: now,
        lastTokenTime: now,
        concurrentCount: 0
      };
      this.buckets.set(key, bucket);
    }

    
    if (bucket.concurrentCount >= this.maxConcurrent) {
      this.stats.concurrentLimited++;
      return false;
    }

    
    const timeElapsed = now - bucket.lastRefillTime;
    const tokensToAdd = timeElapsed * this.tokensPerSecond;

    
    bucket.tokens = Math.min(this.burstCapacity, bucket.tokens + tokensToAdd);

    
    bucket.lastRefillTime = now;

    
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      bucket.concurrentCount++;
      bucket.lastTokenTime = now;

      this.stats.allowed++;

      
      return {
        allowed: true,
        release: () => this._releaseToken(key)
      };
    }

    
    const waitTime = (1 - bucket.tokens) / this.tokensPerSecond * 1000; 

    this.stats.throttled++;

    return {
      allowed: false,
      waitTime: Math.ceil(waitTime),
      tokens: bucket.tokens,
      estimatedAvailability: new Date(now * 1000 + waitTime)
    };
  }

  /**
 * 
 */
  _releaseToken(key) {
    const bucket = this.buckets.get(key);
    if (bucket && bucket.concurrentCount > 0) {
      bucket.concurrentCount--;
    }
  }

  /**
 * 
 */
  async allowWithWait(key = 'default', maxWaitTime = 10000) {
    let attempt = 0;
    const maxAttempts = 5;

    while (attempt < maxAttempts) {
      const result = this.canLog(key);

      
      if (result === true || (result && result.allowed)) {
        return {
          allowed: true,
          release: result.release || (() => this._releaseToken(key))
        };
      }

      
      if (result && result.waitTime) {
        
        const waitTime = Math.min(result.waitTime, maxWaitTime);
        
        if (waitTime > 0) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
          attempt++;
        } else {
          break;
        }
      } else {
        // concurrent limit
        await new Promise(resolve => setTimeout(resolve, 10)); 
        attempt++;
      }
    }

    return { allowed: false, reason: 'Max attempts reached' };
  }

  /**
 * 
 */
  async executeWithLimit(key = 'default', fn, maxWaitTime = 10000) {
    const permission = await this.allowWithWait(key, maxWaitTime);

    if (!permission.allowed) {
      throw new Error(`Rate limit exceeded: ${permission.reason}`);
    }

    try {
      const result = await fn();
      return result;
    } finally {
      if (permission.release) {
        permission.release();
      }
    }
  }

  /**
 * 
 */
  adjustForLoad(loadPercentage) {
    // loadPercentage: 0-100
    
    if (loadPercentage > 80) {
      
      this.burstCapacity = Math.max(1, Math.floor(this.tokensPerSecond / 20));
      this.maxConcurrent = Math.max(1, Math.floor(this.tokensPerSecond / 200));
    } else if (loadPercentage > 50) {
      
      this.burstCapacity = Math.floor(this.tokensPerSecond / 10);
      this.maxConcurrent = Math.floor(this.tokensPerSecond / 100);
    } else {
      
      this.burstCapacity = Math.ceil(this.tokensPerSecond / 10);
      this.maxConcurrent = Math.ceil(this.tokensPerSecond / 100);
    }
  }

  /**
 * 
 */
  getStats() {
    return {
      ...this.stats,
      bucketCount: this.buckets.size,
      tokensPerSecond: this.tokensPerSecond,
      burstCapacity: this.burstCapacity,
      maxConcurrent: this.maxConcurrent
    };
  }

  /**
 * 
 */
  getBucketStatus(key = 'default') {
    const bucket = this.buckets.get(key);
    if (!bucket) return null;

    return {
      tokens: bucket.tokens.toFixed(2),
      burstCapacity: this.burstCapacity,
      concurrentCount: bucket.concurrentCount,
      maxConcurrent: this.maxConcurrent,
      lastTokenTime: new Date(bucket.lastTokenTime * 1000)
    };
  }

  /**
 * 
 */
  cleanup(maxIdleTime = 60000) {
    const now = Date.now() / 1000;
    let cleaned = 0;

    for (const [key, bucket] of this.buckets) {
      const idleTime = (now - bucket.lastTokenTime) * 1000; 
      
      if (idleTime > maxIdleTime && bucket.concurrentCount === 0) {
        this.buckets.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
 * 
 */
  _log(message) {
    if (this.logger) {
      this.logger.log('[StrictBurstLimiter]', message);
    } else {
      console.log(`[StrictBurstLimiter] ${message}`);
    }
  }
}

/**
 * ✅ Multi-Layer Rate Limiter
 */
export class MultiLayerRateLimiter {
  constructor(config = {}) {
    this.globalLimiter = new StrictBurstLimiter({
      tokensPerSecond: config.globalTPS ?? 10000,
      ...config
    });

    this.moduleLimiters = new Map(); // module-specific limiters
    
    this.config = {
      defaultModuleTPS: config.defaultModuleTPS ?? 1000,
      ...config
    };

    this.stats = {
      globalAllowed: 0,
      globalRejected: 0,
      moduleAllowed: 0,
      moduleRejected: 0
    };
  }

  /**
 * 
 */
  async canLog(moduleName = 'default', key = 'default') {
    // ✅ Layer 1: Global limit
    const globalResult = await this.globalLimiter.allowWithWait('global');
    if (!globalResult.allowed) {
      this.stats.globalRejected++;
      return { allowed: false, reason: 'Global rate limit exceeded' };
    }

    // ✅ Layer 2: Module-specific limit
    let moduleLimiter = this.moduleLimiters.get(moduleName);
    if (!moduleLimiter) {
      moduleLimiter = new StrictBurstLimiter({
        tokensPerSecond: this.config.defaultModuleTPS
      });
      this.moduleLimiters.set(moduleName, moduleLimiter);
    }

    const moduleResult = await moduleLimiter.allowWithWait(key);
    if (!moduleResult.allowed) {
      this.stats.moduleRejected++;
      globalResult.release?.();
      return { allowed: false, reason: `Module ${moduleName} rate limit exceeded` };
    }

    this.stats.globalAllowed++;
    this.stats.moduleAllowed++;

    
    return {
      allowed: true,
      release: () => {
        globalResult.release?.();
        moduleResult.release?.();
      }
    };
  }

  /**
 * 
 */
  setModuleTPS(moduleName, tps) {
    const limiter = new StrictBurstLimiter({
      tokensPerSecond: tps
    });
    this.moduleLimiters.set(moduleName, limiter);
  }

  /**
 * 
 */
  getStats() {
    return {
      global: this.globalLimiter.getStats(),
      modules: Object.fromEntries(
        [...this.moduleLimiters].map(([name, limiter]) => [name, limiter.getStats()])
      ),
      ...this.stats
    };
  }
}

export default StrictBurstLimiter;
