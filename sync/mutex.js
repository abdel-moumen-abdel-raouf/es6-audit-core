/**
 * Mutex for thread-safe operations
 * Ensures exclusive access to critical sections
 */

export class Mutex {
  constructor() {
    this.isLocked = false;
    this.waitQueue = [];
  }

  /**
   * Acquire the lock
   */
  async lock() {
    if (!this.isLocked) {
      this.isLocked = true;
      return;
    }

    // Wait for lock to be released
    await new Promise((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  /**
   * Release the lock
   */
  unlock() {
    if (this.waitQueue.length > 0) {
      const resolve = this.waitQueue.shift();
      resolve();
    } else {
      this.isLocked = false;
    }
  }

  /**
   * Run function exclusively (acquire lock, run, release lock)
   */
  async runExclusive(fn) {
    await this.lock();
    try {
      return await fn();
    } finally {
      this.unlock();
    }
  }
}
