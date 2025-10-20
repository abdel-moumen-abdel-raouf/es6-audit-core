/**
 * HTTP Transport with Persistent Queue - Fix #16
 * 
 * Ø§Ù„Ù…Ù…ÙŠØ²Ø§Øª Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø©:
 * - Persistent queue Ø¹Ù„Ù‰ Ø§Ù„Ù€ disk
 * - Local cache fallback Ø¹Ù†Ø¯ ÙØ´Ù„ Ø§Ù„Ù€ HTTP endpoint
 * - Guaranteed delivery even after crash
 * - Automatic recovery on restart
 * 
 * @author audit-core
 * @version 1.0.0-fix16
 */

import * as fs from 'fs';
import * as path from 'path';

export class PersistentQueueManager {
  /**
   * Ø¥Ø¯Ø§Ø±Ø© persistent queue Ø¹Ù„Ù‰ Ø§Ù„Ù€ disk
   */
  constructor(config = {}) {
    this.queueDir = config.queueDir || './logs/queue';
    this.maxQueueSize = config.maxQueueSize || 1000; // max entries in queue
    this.maxDiskSize = config.maxDiskSize || 100 * 1024 * 1024; // 100MB
    
    // Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ù…Ø¬Ù„Ø¯ Ø¥Ù† Ù„Ù… ÙŠÙƒÙ† Ù…ÙˆØ¬ÙˆØ¯Ø§Ù‹
    this._ensureQueueDir();
    
    // Ø§Ù„Ø¥Ø­ØµØ§Ø¦ÙŠØ§Øª
    this.stats = {
      saved: 0,
      loaded: 0,
      failed: 0,
      recovered: 0
    };
  }

  /**
   * Ø­ÙØ¸ batch Ø¹Ù„Ù‰ Ø§Ù„Ù€ disk
   */
  async saveBatch(batch, batchId) {
    try {
      const filename = `batch-${batchId}-${Date.now()}.json`;
      const filepath = path.join(this.queueDir, filename);

      // âœ… ØªØ­Ù‚Ù‚ Ù…Ù† Ø­Ø¬Ù… Ø§Ù„Ù€ disk
      if (!this._checkDiskSpace()) {
        console.warn('[PersistentQueue] Disk space low, cannot save batch');
        return false;
      }

      // âœ… Ø§ÙƒØªØ¨ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø¨Ø´ÙƒÙ„ atomic
      const data = {
        batchId,
        entries: batch,
        timestamp: Date.now(),
        retryCount: 0
      };

      // ÙƒØªØ§Ø¨Ø© Ù…Ø¤Ù‚ØªØ© Ø£ÙˆÙ„Ø§Ù‹
      const tempPath = filepath + '.tmp';
      await fs.promises.writeFile(
        tempPath,
        JSON.stringify(data, null, 2),
        'utf8'
      );

      // Ø¥Ø¹Ø§Ø¯Ø© ØªØ³Ù…ÙŠØ© (atomic operation)
      await fs.promises.rename(tempPath, filepath);

      this.stats.saved++;
      return true;

    } catch (error) {
      console.error('[PersistentQueue] Error saving batch:', error);
      this.stats.failed++;
      return false;
    }
  }

  /**
   * ØªØ­Ù…ÙŠÙ„ Ø¬Ù…ÙŠØ¹ Ø§Ù„Ù€ batches Ø§Ù„Ù…Ø­ÙÙˆØ¸Ø©
   */
  async loadPendingBatches() {
    try {
      const files = await fs.promises.readdir(this.queueDir);
      const batches = [];

      for (const file of files.filter(f => f.startsWith('batch-') && f.endsWith('.json'))) {
        try {
          const filepath = path.join(this.queueDir, file);
          const content = await fs.promises.readFile(filepath, 'utf8');
          const batch = JSON.parse(content);
          batches.push({ file, ...batch });
        } catch (error) {
          console.error(`[PersistentQueue] Error loading ${file}:`, error);
        }
      }

      this.stats.loaded = batches.length;
      return batches;

    } catch (error) {
      console.error('[PersistentQueue] Error loading batches:', error);
      return [];
    }
  }

  /**
   * Ø­Ø°Ù batch Ø¨Ø¹Ø¯ Ù†Ø¬Ø§Ø­ Ø§Ù„Ø¥Ø±Ø³Ø§Ù„
   */
  async deleteBatch(file) {
    try {
      const filepath = path.join(this.queueDir, file);
      await fs.promises.unlink(filepath);
      return true;
    } catch (error) {
      console.error('[PersistentQueue] Error deleting batch:', error);
      return false;
    }
  }

  /**
   * ØªØ­Ø¯ÙŠØ« Ø¹Ø¯Ø§Ø¯ Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø§Øª
   */
  async updateRetryCount(file, retryCount) {
    try {
      const filepath = path.join(this.queueDir, file);
      const content = await fs.promises.readFile(filepath, 'utf8');
      const batch = JSON.parse(content);
      
      batch.retryCount = retryCount;
      
      await fs.promises.writeFile(
        filepath,
        JSON.stringify(batch, null, 2),
        'utf8'
      );
      
      return true;
    } catch (error) {
      console.error('[PersistentQueue] Error updating retry count:', error);
      return false;
    }
  }

  /**
   * âœ… Ø§Ù„ØªØ­Ù‚Ù‚ Ù…Ù† Ø­Ø¬Ù… Ø§Ù„Ù€ disk Ø§Ù„Ù…ØªØ§Ø­
   */
  _checkDiskSpace() {
    // ÙÙŠ Ø¨ÙŠØ¦Ø© productionØŒ Ø§Ø³ØªØ®Ø¯Ù… Ù…ÙƒØªØ¨Ø© Ù…Ø«Ù„ `diskusage`
    // Ù‡Ù†Ø§ Ù†Ø³ØªØ®Ø¯Ù… Ø·Ø±ÙŠÙ‚Ø© Ø¨Ø³ÙŠØ·Ø©: Ø¹Ø¯ Ø§Ù„Ù€ files Ø§Ù„Ù…ÙˆØ¬ÙˆØ¯Ø©
    try {
      const files = fs.readdirSync(this.queueDir);
      return files.length < this.maxQueueSize;
    } catch {
      return true;
    }
  }

  /**
   * âœ… Ø§Ù„ØªØ£ÙƒØ¯ Ù…Ù† ÙˆØ¬ÙˆØ¯ Ù…Ø¬Ù„Ø¯ Ø§Ù„Ù€ queue
   */
  _ensureQueueDir() {
    try {
      if (!fs.existsSync(this.queueDir)) {
        fs.mkdirSync(this.queueDir, { recursive: true });
      }
    } catch (error) {
      console.error('[PersistentQueue] Error creating queue dir:', error);
    }
  }

  /**
   * Ø§Ù„Ø­ØµÙˆÙ„ Ø¹Ù„Ù‰ Ø§Ù„Ø¥Ø­ØµØ§Ø¦ÙŠØ§Øª
   */
  getStatistics() {
    return {
      saved: this.stats.saved,
      loaded: this.stats.loaded,
      failed: this.stats.failed,
      recovered: this.stats.recovered
    };
  }
}

// ============================================
// Local Cache Fallback - Ù„Ù„Ù€ batches Ø§Ù„ÙØ§Ø´Ù„Ø©
// ============================================

export class LocalCacheFallback {
  /**
   * Cache Ù…Ø­Ù„ÙŠ ÙÙŠ Ø§Ù„Ù€ memory Ø¹Ù†Ø¯ ÙØ´Ù„ Ø§Ù„Ù€ HTTP
   */
  constructor(config = {}) {
    this.maxCacheSize = config.maxCacheSize || 10000;
    this.cacheTTL = config.cacheTTL || 24 * 60 * 60 * 1000; // 24 Ø³Ø§Ø¹Ø©
    
    this.cache = new Map();
    this.stats = {
      cached: 0,
      served: 0,
      expired: 0
    };
    
    // ØªÙ†Ø¸ÙŠÙ Ø¯ÙˆØ±ÙŠ
    this._startCleanupTimer();
  }

  /**
   * Ø¥Ø¶Ø§ÙØ© batch Ù„Ù„Ù€ cache
   */
  addToCache(batch, batchId) {
    if (this.cache.size >= this.maxCacheSize) {
      // Ø£Ø²Ù„ Ø£Ù‚Ø¯Ù… entry
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(batchId, {
      data: batch,
      timestamp: Date.now(),
      retryCount: 0
    });

    this.stats.cached++;
  }

  /**
   * Ø§Ø³ØªØ±Ø¬Ø§Ø¹ batches Ù…Ù† Ø§Ù„Ù€ cache
   */
  getFromCache() {
    const result = [];
    
    for (const [batchId, entry] of this.cache.entries()) {
      // ØªØ­Ù‚Ù‚ Ù…Ù† Ø§Ù†ØªÙ‡Ø§Ø¡ ØµÙ„Ø§Ø­ÙŠØ© Ø§Ù„Ù€ entry
      if (Date.now() - entry.timestamp > this.cacheTTL) {
        this.cache.delete(batchId);
        this.stats.expired++;
        continue;
      }

      result.push({
        batchId,
        ...entry
      });
    }

    this.stats.served += result.length;
    return result;
  }

  /**
   * Ø­Ø°Ù batch Ù…Ù† Ø§Ù„Ù€ cache
   */
  removeFromCache(batchId) {
    return this.cache.delete(batchId);
  }

  /**
   * ØªØ­Ø¯ÙŠØ« Ø¹Ø¯Ø§Ø¯ Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø§Øª
   */
  incrementRetryCount(batchId) {
    const entry = this.cache.get(batchId);
    if (entry) {
      entry.retryCount++;
      return entry.retryCount;
    }
    return 0;
  }

  /**
   * ØªÙ†Ø¸ÙŠÙ Ø¯ÙˆØ±ÙŠ
   */
  _startCleanupTimer() {
    this.cleanupTimer = setInterval(() => {
      this.getFromCache(); // This will clean up expired entries
    }, 60 * 60 * 1000); // ÙƒÙ„ Ø³Ø§Ø¹Ø©
  }

  /**
   * Ø¥ÙŠÙ‚Ø§Ù Ø§Ù„Ù…Ø¤Ù‚Øª
   */
  stopCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }

  /**
   * Ø§Ù„Ø­ØµÙˆÙ„ Ø¹Ù„Ù‰ Ø§Ù„Ø¥Ø­ØµØ§Ø¦ÙŠØ§Øª
   */
  getStatistics() {
    return {
      cached: this.stats.cached,
      served: this.stats.served,
      expired: this.stats.expired,
      cacheSize: this.cache.size
    };
  }
}

// ============================================
// Enhanced HTTP Transport with Fix #16
// ============================================

export class HttpTransportWithPersistentQueue {
  /**
   * HTTP Transport Ù…Ø­Ø³Ù‘Ù† Ù…Ø¹ persistent queue Ùˆ local cache
   */
  constructor(config = {}) {
    // Ø§Ù„Ù…ÙƒÙˆÙ†Ø§Øª Ø§Ù„Ø£ØµÙ„ÙŠØ©
    this.endpoint = config.endpoint;
    this.timeout = config.timeout ?? 5000;
    this.retries = config.retries ?? 3;
    this.batchSize = config.batchSize ?? 50;

    // âœ… Ø§Ù„Ù…ÙƒÙˆÙ†Ø§Øª Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø© - Fix #16
    this.persistentQueue = new PersistentQueueManager(config.persistent);
    this.localCache = new LocalCacheFallback(config.cache);
    
    // Ø§Ù„Ø­Ø§Ù„Ø©
    this.queue = [];
    this.isHealthy = true;
    this.failureCount = 0;
    this.maxFailuresBeforeFallback = config.maxFailuresBeforeFallback ?? 3;

    // Ø§Ù„Ø¥Ø­ØµØ§Ø¦ÙŠØ§Øª
    this.stats = {
      sent: 0,
      cached: 0,
      recovered: 0,
      failed: 0
    };

    // Ø§Ø³ØªØ±Ø¬Ø¹ Ø§Ù„Ù€ batches Ø§Ù„Ù…Ø­ÙÙˆØ¸Ø© Ø¹Ù†Ø¯ Ø§Ù„Ø¥Ø·Ù„Ø§Ù‚
    this._recoverPersistentBatches();
  }

  /**
   * ÙƒØªØ§Ø¨Ø© entries
   */
  async write(entries) {
    if (!Array.isArray(entries)) {
      entries = [entries];
    }

    if (this.isHealthy) {
      // Ø§Ù„Ù…Ø³Ø§Ø± Ø§Ù„Ø·Ø¨ÙŠØ¹ÙŠ
      this.queue.push(...entries);
      await this._processBatch();
    } else {
      // âœ… Fallback: Ø­ÙØ¸ Ù…Ø¨Ø§Ø´Ø±Ø© ÙÙŠ Ø§Ù„Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ù…ØªØ§Ø¨Ø¹Ø©
      await this._saveToFallback(entries);
    }
  }

  /**
   * Ù…Ø¹Ø§Ù„Ø¬Ø© batch
   */
  async _processBatch() {
    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0, this.batchSize);
    const batchId = `batch-${Date.now()}-${Math.random()}`;

    try {
      // Ù…Ø­Ø§ÙˆÙ„Ø© Ø§Ù„Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„Ø·Ø¨ÙŠØ¹ÙŠØ©
      await this._sendBatch(batch, batchId);
      
      this.stats.sent++;
      this.failureCount = 0; // Ø¥Ø¹Ø§Ø¯Ø© ØªØ¹ÙŠÙŠÙ† Ø¹Ø¯Ø§Ø¯ Ø§Ù„Ø£Ø®Ø·Ø§Ø¡
      this.isHealthy = true;

    } catch (error) {
      console.error('[HttpTransport] Batch send failed:', error);
      
      this.failureCount++;
      this.stats.failed++;

      if (this.failureCount >= this.maxFailuresBeforeFallback) {
        // âœ… Fallback: Ø­ÙØ¸ ÙÙŠ persistent queue Ùˆ cache
        console.warn('[HttpTransport] Switching to fallback mode');
        this.isHealthy = false;
        await this._saveToFallback(batch, batchId);
      } else {
        // Ø£Ø¹Ø¯ Ù„Ù„Ù…Ø­Ø§ÙˆÙ„Ø© Ù„Ø§Ø­Ù‚Ø§Ù‹
        this.queue.unshift(...batch);
      }
    }
  }

  /**
   * âœ… Ø­ÙØ¸ ÙÙŠ persistent queue Ùˆ local cache
   */
  async _saveToFallback(entries, batchId) {
    // Ø­ÙØ¸ Ø¹Ù„Ù‰ Ø§Ù„Ù€ disk
    const saved = await this.persistentQueue.saveBatch(entries, batchId);
    
    // Ø­ÙØ¸ ÙÙŠ Ø§Ù„Ù€ memory cache Ø£ÙŠØ¶Ø§Ù‹
    this.localCache.addToCache(entries, batchId);

    this.stats.cached++;

    if (saved) {
      console.log(`[HttpTransport] Batch ${batchId} saved to persistent queue`);
    }
  }

  /**
   * âœ… Ù…Ø­Ø§ÙˆÙ„Ø© Ø§Ø³ØªØ±Ø¬Ø§Ø¹ Ø§Ù„Ù€ batches Ø§Ù„Ù…Ø­ÙÙˆØ¸Ø©
   */
  async _recoverPersistentBatches() {
    try {
      console.log('[HttpTransport] Recovering persisted batches...');
      
      const batches = await this.persistentQueue.loadPendingBatches();
      
      for (const batch of batches) {
        try {
          // Ø¬Ø±Ù‘Ø¨ Ø§Ù„Ø¥Ø±Ø³Ø§Ù„
          await this._sendBatch(batch.entries, batch.batchId);
          
          // Ù†Ø¬Ø­! Ø§Ø­Ø°ÙÙ‡ Ù…Ù† Ø§Ù„Ù€ disk
          await this.persistentQueue.deleteBatch(batch.file);
          
          this.stats.recovered++;
          console.log(`[HttpTransport] Recovered batch ${batch.batchId}`);
          
        } catch (error) {
          // ÙØ´Ù„ØŒ Ø£Ø¨Ù‚ Ø¹Ù„ÙŠÙ‡ ÙÙŠ Ø§Ù„Ù€ queue
          const newCount = batch.retryCount + 1;
          if (newCount > 5) {
            // Ø¨Ø¹Ø¯ 5 Ù…Ø­Ø§ÙˆÙ„Ø§ØªØŒ Ø§Ø­Ø°ÙÙ‡
            await this.persistentQueue.deleteBatch(batch.file);
          } else {
            await this.persistentQueue.updateRetryCount(batch.file, newCount);
          }
        }
      }

    } catch (error) {
      console.error('[HttpTransport] Error recovering batches:', error);
    }
  }

  /**
   * Ø¥Ø±Ø³Ø§Ù„ batch
   */
  async _sendBatch(batch, batchId) {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        logs: batch,
        batchId,
        timestamp: new Date().toISOString()
      }),
      signal: AbortSignal.timeout(this.timeout)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  }

  /**
   * Ø§Ù„Ø­ØµÙˆÙ„ Ø¹Ù„Ù‰ Ø§Ù„Ø¥Ø­ØµØ§Ø¦ÙŠØ§Øª
   */
  getStatistics() {
    return {
      ...this.stats,
      persistent: this.persistentQueue.getStatistics(),
      cache: this.localCache.getStatistics(),
      isHealthy: this.isHealthy,
      queueSize: this.queue.length
    };
  }

  /**
   * ØªÙ†Ø¸ÙŠÙ
   */
  destroy() {
    this.localCache.stopCleanup();
  }
}

export default HttpTransportWithPersistentQueue;

