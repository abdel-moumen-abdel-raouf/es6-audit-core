/**
 * Rate Limiter with Token Bucket Algorithm
 * 
 * - تتبع لكل مفتاح منفصل
 */

export class RateLimiter {
  constructor(config = {}) {
    this.tokensPerSecond = config.tokensPerSecond ?? 1000;
    this.burstCapacity = config.burstCapacity ?? this.tokensPerSecond * 2;
    
    this.buckets = new Map();
    
    this.stats = {
      totalAllowed: 0,
      totalRejected: 0,
      totalWaited: 0
    };
  }

  /**
 * 
 */
  canLog(key = 'default') {
    const now = Date.now() / 1000;  
    let bucket = this.buckets.get(key);

    
    if (!bucket) {
      bucket = {
        tokens: this.burstCapacity,      
        lastRefillTime: now
      };
    }

    
    const timeElapsed = now - bucket.lastRefillTime;
    const tokensToAdd = timeElapsed * this.tokensPerSecond;

    
    bucket.tokens = Math.min(this.burstCapacity, bucket.tokens + tokensToAdd);

    
    bucket.lastRefillTime = now;

    
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      this.buckets.set(key, bucket);
      this.stats.totalAllowed++;
      return true;  
    }

    
    this.buckets.set(key, bucket);
    this.stats.totalRejected++;
    return false;  
  }

  /**
 * 
 */
  async waitAndLog(key = 'default', logFn) {
    
    while (!this.canLog(key)) {
      await this._sleep(100);  
      this.stats.totalWaited++;
    }
    return logFn();  
  }

  /**
 * 
 */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
 * 
 */
  getRejectionReason(key = 'default') {
    const bucket = this.buckets.get(key);
    const availableTokens = bucket ? Math.floor(bucket.tokens) : 0;
    return `Rate limit exceeded for '${key}': available tokens ${availableTokens}, need 1`;
  }

  /**
 * 
 */
  getStatus(key = 'default') {
    const bucket = this.buckets.get(key);
    if (!bucket) return null;

    return {
      availableTokens: Math.floor(bucket.tokens),
      refillRate: this.tokensPerSecond,
      burstCapacity: this.burstCapacity,
      lastRefillTime: bucket.lastRefillTime
    };
  }

  /**
 * 
 */
  reset(key = 'default') {
    this.buckets.delete(key);
    return this;
  }

  /**
 * 
 */
  resetAll() {
    this.buckets.clear();
    return this;
  }

  /**
 * 
 */
  getStatistics() {
    const stats = {
      totalAllowed: this.stats.totalAllowed,
      totalRejected: this.stats.totalRejected,
      totalWaited: this.stats.totalWaited,
      activeKeys: this.buckets.size,
      tokensPerSecond: this.tokensPerSecond,
      burstCapacity: this.burstCapacity,
      details: {}
    };

    
    for (const [key, bucket] of this.buckets.entries()) {
      stats.details[key] = {
        availableTokens: Math.floor(bucket.tokens),
        capacity: this.burstCapacity,
        utilizationPercent: ((Math.max(0, this.burstCapacity - bucket.tokens) / this.burstCapacity) * 100).toFixed(1) + '%'
      };
    }

    return stats;
  }

  /**
 * 
 */
  printStatistics() {
    const stats = this.getStatistics();
    console.log('\n=== RATE LIMITER STATISTICS (Token Bucket) ===');
    console.log(`Total Allowed: ${stats.totalAllowed}`);
    console.log(`Total Rejected: ${stats.totalRejected}`);
    console.log(`Total Waited: ${stats.totalWaited}`);
    console.log(`Active Keys: ${stats.activeKeys}`);
    console.log(`Tokens Per Second: ${stats.tokensPerSecond}`);
    console.log(`Burst Capacity: ${stats.burstCapacity}`);
    console.log('\nDetailed Stats:');
    for (const [key, detail] of Object.entries(stats.details)) {
      console.log(`  ${key}: ${detail.availableTokens}/${detail.capacity} tokens (${detail.utilizationPercent} utilized)`);
    }
    console.log('===============================================\n');
  }

  /**
 * 
 */
  cleanup(maxAge = 60) {  
    const now = Date.now() / 1000;
    const keysToDelete = [];

    for (const [key, bucket] of this.buckets.entries()) {
      if (now - bucket.lastRefillTime > maxAge) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.buckets.delete(key);
    }

    return keysToDelete.length;
  }
}

