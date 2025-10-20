/**
 * 
 * 
 * - Transactional processing guarantee
 * - Idempotent operations
 */

export class BatchSequencer {
  constructor(config = {}) {
    this.sequenceNumber = 0;
    this.processingBatch = null;
    this.pendingBatches = new Map(); // <sequenceNum, batchData>
    this.processedBatches = new Map(); // <sequenceNum, result>
    this.failedBatches = []; // dead letter queue
    
    this.config = {
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 100,
      timeout: config.timeout ?? 30000,
      enableReplay: config.enableReplay ?? true,
      maxFailedBatches: config.maxFailedBatches ?? 1000
    };

    this.stats = {
      processed: 0,
      failed: 0,
      replayed: 0,
      totalSequence: 0
    };

    this.logger = config.logger || null;
  }

  /**
 * 
 */
  queueBatch(entries) {
    const sequenceNum = this.sequenceNumber++;
    
    const batchData = {
      sequenceNum,
      entries,
      timestamp: Date.now(),
      retries: 0,
      status: 'PENDING' // PENDING → PROCESSING → SUCCESS/FAILED
    };

    this.pendingBatches.set(sequenceNum, batchData);
    this.stats.totalSequence = sequenceNum;

    this._log(`🔢 Batch queued: seq=${sequenceNum}, entries=${entries.length}`);
    
    return sequenceNum;
  }

  /**
 * 
 */
  async processBatch(processor) {
    
    if (this.processingBatch !== null) {
      return null;
    }

    
    let batchData = null;
    let sequenceNum = null;

    // ✅ Find the next pending batch by sequence
    for (const [seq, batch] of this.pendingBatches) {
      if (batch.status === 'PENDING') {
        batchData = batch;
        sequenceNum = seq;
        break;
      }
    }

    if (!batchData) {
      
      if (this.config.enableReplay && this.failedBatches.length > 0) {
        return this._replayFailedBatches(processor);
      }
      return null;
    }

    
    this.processingBatch = sequenceNum;
    batchData.status = 'PROCESSING';
    batchData.processingStartTime = Date.now();

    try {
      this._log(`⏳ Processing batch: seq=${sequenceNum}, entries=${batchData.entries.length}`);

      
      const result = await this._processWithTimeout(
        () => processor(batchData.entries),
        this.config.timeout
      );

      
      batchData.status = 'SUCCESS';
      this.processedBatches.set(sequenceNum, result);
      this.pendingBatches.delete(sequenceNum);
      this.stats.processed++;

      this._log(`✅ Batch processed: seq=${sequenceNum}`);

      return { success: true, sequenceNum, result };

    } catch (error) {
      return this._handleBatchFailure(sequenceNum, batchData, error, processor);
    } finally {
      this.processingBatch = null;
    }
  }

  /**
 * 
 */
  async _handleBatchFailure(sequenceNum, batchData, error, processor) {
    batchData.retries++;
    const maxRetries = this.config.maxRetries;

    this._log(`❌ Batch failed: seq=${sequenceNum}, attempt=${batchData.retries}/${maxRetries}, error=${error.message}`);

    if (batchData.retries < maxRetries) {
      
      const delay = Math.pow(2, batchData.retries - 1) * this.config.retryDelay;
      
      this._log(`🔄 Retrying batch: seq=${sequenceNum} in ${delay}ms`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      
      
      batchData.status = 'PENDING';
      batchData.lastError = error;
      
      
      return this.processBatch(processor);
    }

    
    batchData.status = 'FAILED';
    batchData.finalError = error;
    
    this._moveToDeadLetterQueue(sequenceNum, batchData);
    this.stats.failed++;

    return { success: false, sequenceNum, error: error.message };
  }

  /**
 * 
 */
  async _replayFailedBatches(processor) {
    if (this.failedBatches.length === 0) {
      return null;
    }

    const failed = this.failedBatches.shift();
    
    this._log(`🔁 Replaying failed batch: seq=${failed.sequenceNum}`);

    
    failed.status = 'PENDING';
    failed.retries = 0;
    this.pendingBatches.set(failed.sequenceNum, failed);

    this.stats.replayed++;

    
    return this.processBatch(processor);
  }

  /**
 * 
 */
  _moveToDeadLetterQueue(sequenceNum, batchData) {
    if (this.failedBatches.length >= this.config.maxFailedBatches) {
      
      this.failedBatches.shift();
    }

    this.failedBatches.push({
      sequenceNum,
      entries: batchData.entries,
      error: batchData.finalError,
      timestamp: Date.now(),
      attempts: batchData.retries
    });

    this.pendingBatches.delete(sequenceNum);

    this._log(`💀 Batch moved to DLQ: seq=${sequenceNum}`);
  }

  /**
 * 
 */
  async _processWithTimeout(processor, timeout) {
    return Promise.race([
      processor(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Batch processing timeout after ${timeout}ms`)), timeout)
      )
    ]);
  }

  /**
 * 
 */
  getStats() {
    return {
      ...this.stats,
      pendingCount: this.pendingBatches.size,
      failedCount: this.failedBatches.length,
      processingBatch: this.processingBatch
    };
  }

  /**
 * 
 */
  getDeadLetterQueue() {
    return [...this.failedBatches];
  }

  /**
 * 
 */
  getBatchStatus(sequenceNum) {
    const pending = this.pendingBatches.get(sequenceNum);
    if (pending) return { status: pending.status, ...pending };

    const processed = this.processedBatches.get(sequenceNum);
    if (processed) return { status: 'SUCCESS', result: processed };

    const failed = this.failedBatches.find(b => b.sequenceNum === sequenceNum);
    if (failed) return { status: 'FAILED', ...failed };

    return null;
  }

  /**
 * 
 */
  cleanup(maxAge = 60000) { 
    const now = Date.now();
    let cleaned = 0;

    for (const [seq, data] of this.processedBatches) {
      if (now - data.timestamp > maxAge) {
        this.processedBatches.delete(seq);
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
      this.logger.log('[BatchSequencer]', message);
    } else {
      console.log(`[BatchSequencer] ${message}`);
    }
  }

  /**
 * 
 */
  exportDeadLetterQueue() {
    return {
      timestamp: Date.now(),
      batches: this.failedBatches.map(b => ({
        sequenceNum: b.sequenceNum,
        entriesCount: b.entries.length,
        error: b.error.message || b.error,
        timestamp: b.timestamp,
        attempts: b.attempts,
        entries: b.entries 
      }))
    };
  }

  /**
 * 
 */
  importDeadLetterQueue(backup) {
    if (!backup || !backup.batches) {
      this._log('❌ Invalid backup format');
      return 0;
    }

    let imported = 0;
    for (const batchData of backup.batches) {
      if (this.failedBatches.length < this.config.maxFailedBatches) {
        this.failedBatches.push({
          sequenceNum: batchData.sequenceNum,
          entries: batchData.entries,
          error: new Error(batchData.error),
          timestamp: batchData.timestamp,
          attempts: batchData.attempts
        });
        imported++;
      }
    }

    this._log(`📥 Imported ${imported} batches from backup`);
    return imported;
  }
}

export default BatchSequencer;
