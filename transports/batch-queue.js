/**
 * Batch Queue for managing log entries
 * Handles memory limits and queue size constraints
 */

export class BatchQueue {
  constructor(config = {}) {
    this.maxSize = config.maxSize || 50;
    this.maxMemory = config.maxMemory || 50 * 1024 * 1024; // 50 MB

    this.queue = [];
    this.totalSize = 0;
  }

  /**
   * Add entry to queue
   */
  enqueue(entry) {
    // Check size limits
    if (this.queue.length >= this.maxSize) {
      throw new Error('Queue is full: reached maxSize limit');
    }

    const entrySize = JSON.stringify(entry).length;
    if (this.totalSize + entrySize > this.maxMemory) {
      throw new Error('Queue is full: reached memory limit');
    }

    this.queue.push(entry);
    this.totalSize += entrySize;

    return true;
  }

  /**
   * Remove and return entries from queue
   */
  dequeue(count) {
    const removed = this.queue.splice(0, count);

    // Update total size
    for (const entry of removed) {
      this.totalSize -= JSON.stringify(entry).length;
    }

    return removed;
  }

  /**
   * View entries without removing them
   */
  peek(count) {
    return this.queue.slice(0, count);
  }

  /**
   * Check if queue is empty
   */
  isEmpty() {
    return this.queue.length === 0;
  }

  /**
   * Get current size info
   */
  getSize() {
    return {
      entries: this.queue.length,
      bytes: this.totalSize,
      megabytes: (this.totalSize / 1024 / 1024).toFixed(2),
    };
  }

  /**
   * Clear entire queue
   */
  clear() {
    this.queue = [];
    this.totalSize = 0;
  }
}
