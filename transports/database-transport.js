/**
 * Database Transport for logging
 * 
 * - Batch processing
 * - Connection pooling support
 * - Error recovery
 * - Support for multiple DB types (SQLite, MySQL, PostgreSQL, MongoDB)
 */

export class DatabaseTransport {
  constructor(config = {}) {
    
    this.db = config.database;
    if (!this.db) {
      throw new Error('Database Transport requires database instance');
    }

    this.tableName = config.tableName ?? 'logs';
    this.batchSize = config.batchSize ?? 100;
    this.batchTimeout = config.batchTimeout ?? 5000;
    this.retention = config.retention ?? 30 * 24 * 60 * 60 * 1000; // 30 days
    
    // Custom methods
    this.beforeInsert = config.beforeInsert;
    this.onSuccess = config.onSuccess;
    this.onError = config.onError;
    
    
    this.queue = [];
    this.processing = false;
    this.batchTimer = null;
    
    
    this.stats = {
      inserted: 0,
      failed: 0,
      bytes: 0,
      lastInsertedAt: null,
      lastErrorAt: null,
      lastError: null,
      cleanups: 0
    };

    
    this.cleanupInterval = setInterval(() => {
      this._cleanup();
    }, 60000); 
  }

  /**
 * 
 */
  write(entries) {
    if (!Array.isArray(entries)) {
      entries = [entries];
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

    try {
      
      const batch = this.queue.splice(0, this.batchSize);
      
      
      let records = batch;
      if (this.beforeInsert) {
        try {
          records = await Promise.all(batch.map(log => this.beforeInsert(log)));
        } catch (e) {
          console.error('[DatabaseTransport] beforeInsert error:', e);
        }
      }

      
      await this._insertBatch(records);

      
      this.stats.inserted += batch.length;
      this.stats.lastInsertedAt = new Date();

      
      if (this.onSuccess) {
        try {
          await this.onSuccess(batch);
        } catch (e) {
          console.error('[DatabaseTransport] onSuccess error:', e);
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
          console.error('[DatabaseTransport] onError error:', e);
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
  async _insertBatch(records) {
    
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    
    if (this.db.insertMany) {
      return await this.db.insertMany(this.tableName, records);
    }

    
    if (this.db.insert || this.db.run) {
      
      if (this.db.insertMany) {
        return await this.db.insertMany(this.tableName, records);
      }

      
      const results = [];
      for (const record of records) {
        const result = await this.db.insert(this.tableName, record);
        results.push(result);
        this.stats.bytes += JSON.stringify(record).length;
      }
      return results;
    }

    throw new Error('Unsupported database type');
  }

  /**
 * 
 */
  async _cleanup() {
    try {
      if (!this.db || !this.db.delete) {
        return;
      }

      
      const cutoffDate = new Date(Date.now() - this.retention);

      
      await this.db.delete(this.tableName, {
        timestamp: { $lt: cutoffDate.toISOString() }
      });

      this.stats.cleanups++;
    } catch (error) {
      console.error('[DatabaseTransport] Cleanup error:', error);
    }
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
      await new Promise(resolve => {
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
      bytesMB: (this.stats.bytes / 1024 / 1024).toFixed(2),
      retentionDays: Math.floor(this.retention / (24 * 60 * 60 * 1000))
    };
  }

  /**
 * 
 */
  printStatistics() {
    const stats = this.getStatistics();
    console.log('\n=== DATABASE TRANSPORT STATISTICS ===');
    console.log(`Table: ${this.tableName}`);
    console.log(`Inserted: ${stats.inserted}`);
    console.log(`Failed: ${stats.failed}`);
    console.log(`Bytes Written: ${stats.bytesMB}MB`);
    console.log(`Queue Size: ${stats.queueSize}`);
    console.log(`Processing: ${stats.processing}`);
    console.log(`Cleanups: ${stats.cleanups}`);
    console.log(`Retention: ${stats.retentionDays} days`);
    if (stats.lastError) {
      console.log(`Last Error: ${stats.lastError}`);
    }
    console.log(`Last Inserted At: ${stats.lastInsertedAt}`);
    console.log('=====================================\n');
  }

  /**
 * 
 */
  async destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    await this.flush();
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }
    this.queue = [];
    return this;
  }
}
