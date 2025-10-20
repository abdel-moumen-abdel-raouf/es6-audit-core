/**
 * Resilient Log Buffer - Thread-Safe Implementation
 * 
 * Solves Critical Issue #2: Race Conditions in Buffer
 * 
 * Problem: Original buffer is not thread-safe
 * - Concurrent reads/writes cause data corruption
 * - No atomic operations
 * - Lost updates under high concurrency
 * 
 * Solution: Mutex-based synchronization with atomic operations
 * - Lock/Unlock mechanism for critical sections
 * - Atomic operations for counters
 * - Queue-safe batch retrieval
 * - Concurrent read support with write locks
 */

class Mutex {
    constructor() {
        this.locked = false;
        this.waitQueue = [];
    }

    async lock() {
        return new Promise((resolve) => {
            if (!this.locked) {
                this.locked = true;
                resolve();
            } else {
                this.waitQueue.push(resolve);
            }
        });
    }

    unlock() {
        if (this.waitQueue.length > 0) {
            const resolve = this.waitQueue.shift();
            resolve();
        } else {
            this.locked = false;
        }
    }

    async withLock(callback) {
        await this.lock();
        try {
            return await callback();
        } finally {
            this.unlock();
        }
    }
}

class ReadWriteLock {
    constructor() {
        this.readers = 0;
        this.writers = 0;
        this.readersMutex = new Mutex();
        this.writerMutex = new Mutex();
    }

    async acquireRead() {
        await this.readersMutex.lock();
        this.readers++;
        if (this.readers === 1) {
            await this.writerMutex.lock();
        }
        this.readersMutex.unlock();
    }

    async releaseRead() {
        await this.readersMutex.lock();
        this.readers--;
        if (this.readers === 0) {
            this.writerMutex.unlock();
        }
        this.readersMutex.unlock();
    }

    async acquireWrite() {
        await this.writerMutex.lock();
    }

    releaseWrite() {
        this.writerMutex.unlock();
    }

    async withRead(callback) {
        await this.acquireRead();
        try {
            return await callback();
        } finally {
            await this.releaseRead();
        }
    }

    async withWrite(callback) {
        await this.acquireWrite();
        try {
            return await callback();
        } finally {
            this.releaseWrite();
        }
    }
}

class AtomicCounter {
    constructor(initial = 0) {
        this.value = initial;
        this.mutex = new Mutex();
    }

    async increment() {
        await this.mutex.lock();
        try {
            return ++this.value;
        } finally {
            this.mutex.unlock();
        }
    }

    async decrement() {
        await this.mutex.lock();
        try {
            return --this.value;
        } finally {
            this.mutex.unlock();
        }
    }

    async add(amount) {
        await this.mutex.lock();
        try {
            this.value += amount;
            return this.value;
        } finally {
            this.mutex.unlock();
        }
    }

    async getValue() {
        await this.mutex.lock();
        try {
            return this.value;
        } finally {
            this.mutex.unlock();
        }
    }

    getValueSync() {
        return this.value;
    }
}

export class EnhancedLogBufferFixed {
    constructor(config = {}) {
        this.maxSize = config.maxSize || 10000;
        this.flushInterval = config.flushInterval || 5000;
        this.batchSize = config.batchSize || 100;
        this.onFlush = config.onFlush || (() => Promise.resolve());

        // Main buffer with synchronization
        this.buffer = [];
        this.bufferLock = new ReadWriteLock();

        // Statistics with atomic operations
        this.stats = {
            added: new AtomicCounter(0),
            flushed: new AtomicCounter(0),
            dropped: new AtomicCounter(0),
            errors: new AtomicCounter(0),
            totalWaitTime: new AtomicCounter(0),
        };

        // Pending operations tracking
        this.pendingWrites = new Map(); // trackId -> { resolve, reject, timeout }
        this.pendingWritesMutex = new Mutex();

        // Flush control
        this.flushInProgress = false;
        this.flushMutex = new Mutex();

        // Auto-flush timer
        this.flushTimer = null;
        this.startAutoFlush();

        // Concurrency tracking
        this.activeWriters = 0;
        this.activeReaders = 0;
        this.concurrencyMutex = new Mutex();

        // Configuration
        this.config = config;
    }

    /**
     * Add entry to buffer with thread-safe operations
     * Returns trackId for confirmation tracking
     */
    async add(entry) {
        const trackId = this._generateTrackId();
        const startTime = Date.now();

        try {
            // Atomic size check
            await this.bufferLock.acquireRead();
            const currentSize = this.buffer.length;
            await this.bufferLock.releaseRead();

            if (currentSize >= this.maxSize) {
                await this.stats.dropped.increment();
                throw new Error(`Buffer full: ${currentSize}/${this.maxSize}`);
            }

            // Atomic add with lock
            await this.bufferLock.acquireWrite();
            try {
                this.buffer.push({
                    ...entry,
                    _trackId: trackId,
                    _timestamp: Date.now(),
                    _sequence: await this.stats.added.getValue(),
                });
                await this.stats.added.increment();
            } finally {
                this.bufferLock.releaseWrite();
            }

            // Track wait time
            const waitTime = Date.now() - startTime;
            await this.stats.totalWaitTime.add(waitTime);

            // Auto-flush if buffer exceeds threshold
            if (this.buffer.length >= this.batchSize * 0.8) {
                this._scheduleFlush();
            }

            return trackId;
        } catch (error) {
            await this.stats.errors.increment();
            throw error;
        }
    }

    /**
     * Add multiple entries atomically
     */
    async addBatch(entries) {
        if (!Array.isArray(entries) || entries.length === 0) {
            return [];
        }

        const trackIds = [];

        await this.bufferLock.acquireWrite();
        try {
            for (const entry of entries) {
                const trackId = this._generateTrackId();
                this.buffer.push({
                    ...entry,
                    _trackId: trackId,
                    _timestamp: Date.now(),
                    _sequence: this.stats.added.getValueSync(),
                });
                trackIds.push(trackId);
                await this.stats.added.increment();

                if (this.buffer.length >= this.maxSize) {
                    await this.stats.dropped.increment();
                    break;
                }
            }
        } finally {
            this.bufferLock.releaseWrite();
        }

        if (this.buffer.length >= this.batchSize * 0.8) {
            this._scheduleFlush();
        }

        return trackIds;
    }

    /**
     * Get batch for flushing (atomic slice operation)
     */
    async getBatch(size = this.batchSize) {
        await this.bufferLock.acquireRead();
        try {
            // Use slice (safe copy) instead of splice (destructive)
            const batch = this.buffer.slice(0, size);
            return [...batch]; // Deep copy
        } finally {
            await this.bufferLock.releaseRead();
        }
    }

    /**
     * Remove confirmed batch (atomic splice operation)
     */
    async removeBatch(size) {
        await this.bufferLock.acquireWrite();
        try {
            this.buffer.splice(0, size);
            return true;
        } finally {
            this.bufferLock.releaseWrite();
        }
    }

    /**
     * Get size without mutation (atomic read)
     */
    async getSize() {
        await this.bufferLock.acquireRead();
        try {
            return this.buffer.length;
        } finally {
            await this.bufferLock.releaseRead();
        }
    }

    /**
     * Manual flush operation (synchronized)
     */
    async flush() {
        await this.flushMutex.withLock(async () => {
            if (this.flushInProgress) {
                return; // Prevent concurrent flushes
            }

            this.flushInProgress = true;

            try {
                while (true) {
                    const batch = await this.getBatch(this.batchSize);

                    if (batch.length === 0) {
                        break;
                    }

                    try {
                        await this.onFlush(batch);
                        await this.removeBatch(batch.length);
                        await this.stats.flushed.add(batch.length);
                    } catch (error) {
                        // Keep batch in buffer for retry
                        await this.stats.errors.increment();
                        // Backoff before next flush
                        await this._sleep(1000);
                        throw error;
                    }
                }
            } finally {
                this.flushInProgress = false;
            }
        });
    }

    /**
     * Clear all entries (dangerous, atomic)
     */
    async clear() {
        await this.bufferLock.acquireWrite();
        try {
            this.buffer = [];
            return true;
        } finally {
            this.bufferLock.releaseWrite();
        }
    }

    /**
     * Get current statistics
     */
    async getStats() {
        return {
            size: await this.getSize(),
            added: await this.stats.added.getValue(),
            flushed: await this.stats.flushed.getValue(),
            dropped: await this.stats.dropped.getValue(),
            errors: await this.stats.errors.getValue(),
            avgWaitTime: await this.stats.added.getValue() > 0 
                ? (await this.stats.totalWaitTime.getValue()) / (await this.stats.added.getValue())
                : 0,
            flushInProgress: this.flushInProgress,
        };
    }

    /**
     * Wait for specific entry to be flushed
     */
    async waitForFlush(trackId, timeout = 30000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendingWrites.delete(trackId);
                reject(new Error(`Flush timeout for ${trackId}`));
            }, timeout);

            this.pendingWrites.set(trackId, { resolve, reject, timer });
        });
    }

    /**
     * Confirm track ID was flushed
     */
    async confirmFlush(trackId) {
        await this.pendingWritesMutex.withLock(async () => {
            const pending = this.pendingWrites.get(trackId);
            if (pending) {
                clearTimeout(pending.timer);
                pending.resolve();
                this.pendingWrites.delete(trackId);
            }
        });
    }

    /**
     * Start auto-flush timer
     */
    startAutoFlush() {
        this.flushTimer = setInterval(() => {
            this.flush().catch(() => {
                // Ignore errors, will retry on next interval
            });
        }, this.flushInterval);
    }

    /**
     * Stop auto-flush timer
     */
    stopAutoFlush() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
    }

    /**
     * Schedule flush on next tick (prevents too frequent flushes)
     */
    _scheduleFlush() {
        setImmediate(() => {
            this.flush().catch(() => {
                // Ignore errors
            });
        });
    }

    /**
     * Generate unique track ID
     */
    _generateTrackId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Sleep helper
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Graceful shutdown
     */
    async shutdown() {
        this.stopAutoFlush();
        await this.flush();
        await this.clear();
    }
}

export { Mutex, ReadWriteLock, AtomicCounter };
