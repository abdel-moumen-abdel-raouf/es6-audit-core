/**
 * Memory Pool Manager
 * 
 * 1. Object Pooling & Reuse
 * 2. Buffer Management
 * 3. GC Pressure Reduction
 * 4. Memory Leak Detection
 */

import { EventEmitter } from 'events';

export class MemoryPoolManager extends EventEmitter {
    /**
     * Initialize Memory Pool Manager
     * @param {Object} options - Configuration options
     */
    constructor(options = {}) {
        super();
        
        // Pool configuration
        this.poolSize = options.poolSize || 1000; // Max objects in pool
        this.objectFactory = options.objectFactory || (() => ({}));
        this.resetFunction = options.resetFunction || ((obj) => obj);
        
        // Multiple pools for different object types
        this.pools = new Map(); // type -> pool array
        this.poolStats = new Map(); // type -> statistics
        this.globalPool = new Map(); // generic objects
        
        // Memory tracking
        this.allocatedMemory = 0;
        this.peakMemory = 0;
        this.reclaimedObjects = 0;
        
        // GC-related settings
        this.enableGCTracking = options.enableGCTracking !== false;
        this.gcThreshold = options.gcThreshold || 1000; // Force cleanup after N operations
        this.gcCounter = 0;
        
        // Warnings
        this.memoryWarningThreshold = options.memoryWarningThreshold || 100 * 1024 * 1024; // 100MB
        this.leakDetectionEnabled = options.leakDetectionEnabled !== false;
        this.leakThreshold = options.leakThreshold || 500; // Objects not returned after this count
        
        // Statistics
        this.stats = {
            poolHits: 0,
            poolMisses: 0,
            objectsCreated: 0,
            objectsReused: 0,
            objectsReleased: 0,
            gcRuns: 0,
            averagePoolUtilization: 0
        };
        
        this.history = [];
        this.maxHistory = options.maxHistory || 500;
        this.checkedOutObjects = new Map(); // Track checked out objects for leak detection
    }

    /**
     * Create or acquire object from pool
     * @param {string} type - Object type
     * @returns {Object} Pooled object
     */
    acquire(type = 'default') {
        if (!this.pools.has(type)) {
            this.pools.set(type, []);
            this.poolStats.set(type, {
                created: 0,
                reused: 0,
                released: 0,
                available: 0,
                checkedOut: 0
            });
        }

        const pool = this.pools.get(type);
        const typeStats = this.poolStats.get(type);

        let obj;
        if (pool.length > 0) {
            obj = pool.pop();
            this.stats.poolHits++;
            this.stats.objectsReused++;
            typeStats.reused++;
            this.emit('pool-hit', { type });
        } else {
            obj = this._createObject(type);
            this.stats.poolMisses++;
            this.stats.objectsCreated++;
            typeStats.created++;
            this.emit('pool-miss', { type });
            
            // Assign ID only on first creation
            obj.__poolId = Symbol('poolObject_' + type + '_' + this.stats.objectsCreated);
        }

        // Track checkout
        obj.__poolType = type;
        obj.__acquiredAt = Date.now();
        
        this.checkedOutObjects.set(obj.__poolId, {
            type,
            acquiredAt: Date.now(),
            obj
        });

        typeStats.checkedOut++;
        this.gcCounter++;

        // Periodic GC
        if (this.gcCounter >= this.gcThreshold) {
            this._performGC();
        }

        return obj;
    }

    /**
     * Create new object instance
     * @private
     */
    _createObject(type) {
        const factory = typeof this.objectFactory === 'function' 
            ? this.objectFactory 
            : this.objectFactory[type] || (() => ({}));
        
        const obj = factory();
        this.allocatedMemory += this._estimateSize(obj);
        
        if (this.allocatedMemory > this.peakMemory) {
            this.peakMemory = this.allocatedMemory;
        }

        if (this.allocatedMemory > this.memoryWarningThreshold) {
            this.emit('memory-warning', {
                allocated: this.allocatedMemory,
                threshold: this.memoryWarningThreshold
            });
        }

        return obj;
    }

    /**
     * Release object back to pool
     * @param {Object} obj - Object to release
     * @returns {boolean} Whether object was successfully released
     */
    release(obj) {
        if (!obj || !obj.__poolId || !obj.__poolType) {
            return false;
        }

        const type = obj.__poolType;
        const pool = this.pools.get(type);
        const typeStats = this.poolStats.get(type);

        if (!pool) {
            return false;
        }

        // Check for leaks
        if (this.leakDetectionEnabled) {
            const objectId = obj.__poolId;
            this.checkedOutObjects.delete(objectId);
        }

        // Reset object state
        const resetFn = typeof this.resetFunction === 'function' 
            ? this.resetFunction 
            : this.resetFunction[type] || ((o) => o);
        
        resetFn(obj);

        // Clear pool metadata but keep for identification
        obj.__acquiredAt = null;

        // Check pool size
        if (pool.length < this.poolSize) {
            pool.push(obj);
            typeStats.released++;
            typeStats.checkedOut = Math.max(0, typeStats.checkedOut - 1);
            typeStats.available = pool.length;
            
            this.stats.objectsReleased++;
            this._recordHistory('OBJECT_RELEASED', { type, poolSize: pool.length });
            
            return true;
        } else {
            // Pool is full, discard object
            this.reclaimedObjects++;
            this._recordHistory('OBJECT_DISCARDED', { type, reason: 'pool-full' });
            return false;
        }
    }

    /**
     * Batch release multiple objects
     * @param {Array} objects - Objects to release
     * @returns {number} Count of successfully released objects
     */
    releaseBatch(objects) {
        let count = 0;
        for (const obj of objects) {
            if (this.release(obj)) {
                count++;
            }
        }
        this._recordHistory('BATCH_RELEASED', { count, total: objects.length });
        return count;
    }

    /**
     * Estimate object size in bytes
     * @private
     */
    _estimateSize(obj) {
        if (typeof obj !== 'object' || obj === null) {
            return 8; // Primitive pointer size
        }

        let size = 48; // Base object overhead
        
        if (Array.isArray(obj)) {
            size += obj.length * 8;
        } else if (typeof obj === 'object') {
            const keys = Object.keys(obj);
            size += keys.length * 8;
        }

        return Math.min(size, 1024); // Cap estimate at 1KB
    }

    /**
     * Perform garbage collection on pools
     * @private
     */
    _performGC() {
        this.gcCounter = 0;
        
        // Detect leaked objects
        if (this.leakDetectionEnabled) {
            const now = Date.now();
            const leakedObjects = [];

            for (const [id, tracked] of this.checkedOutObjects) {
                if (now - tracked.acquiredAt > 60000) { // 1 minute timeout
                    leakedObjects.push(tracked);
                    this.checkedOutObjects.delete(id);
                }
            }

            if (leakedObjects.length > 0) {
                this.emit('leak-detected', { count: leakedObjects.length });
                this._recordHistory('LEAK_DETECTED', { count: leakedObjects.length });
            }
        }

        // Shrink pools if utilization is low
        for (const [type, pool] of this.pools) {
            const stats = this.poolStats.get(type);
            const utilizationRatio = stats.checkedOut / (stats.checkedOut + pool.length);

            // If pool is underutilized, keep only what's needed
            if (pool.length > 10 && utilizationRatio < 0.1) {
                const targetSize = Math.max(10, Math.ceil(stats.checkedOut * 2));
                const excess = pool.length - targetSize;
                pool.splice(targetSize);
                this.reclaimedObjects += excess;
            }
        }

        this.stats.gcRuns++;
        this._recordHistory('GC_RUN', {
            pools: this.pools.size,
            checkedOut: this.checkedOutObjects.size
        });
    }

    /**
     * Clear pool and free memory
     * @param {string} type - Optional specific type to clear
     */
    clear(type = null) {
        if (type) {
            const pool = this.pools.get(type);
            if (pool) {
                this.reclaimedObjects += pool.length;
                pool.length = 0;
                this._recordHistory('POOL_CLEARED', { type });
            }
        } else {
            // Clear all pools
            let totalReclaimed = 0;
            for (const [t, pool] of this.pools) {
                totalReclaimed += pool.length;
                pool.length = 0;
            }
            this.reclaimedObjects += totalReclaimed;
            this._recordHistory('ALL_POOLS_CLEARED', { count: totalReclaimed });
        }
    }

    /**
     * Get pool statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        let totalAvailable = 0;
        let totalCheckedOut = 0;
        const typeStats = {};

        for (const [type, stats] of this.poolStats) {
            totalAvailable += stats.available;
            totalCheckedOut += stats.checkedOut;
            typeStats[type] = { ...stats };
        }

        const hitRate = this.stats.poolHits + this.stats.poolMisses > 0
            ? (this.stats.poolHits / (this.stats.poolHits + this.stats.poolMisses) * 100).toFixed(2)
            : 0;

        return {
            poolCount: this.pools.size,
            totalObjectsAvailable: totalAvailable,
            totalObjectsCheckedOut: totalCheckedOut,
            objectsCreated: this.stats.objectsCreated,
            objectsReused: this.stats.objectsReused,
            objectsReleased: this.stats.objectsReleased,
            reclaimedObjects: this.reclaimedObjects,
            poolHits: this.stats.poolHits,
            poolMisses: this.stats.poolMisses,
            hitRate: hitRate + '%',
            allocatedMemory: this.allocatedMemory,
            peakMemory: this.peakMemory,
            gcRuns: this.stats.gcRuns,
            checkedOutLeaks: this.checkedOutObjects.size,
            typeStatistics: typeStats
        };
    }

    /**
     * Get specific type statistics
     * @param {string} type - Object type
     */
    getTypeStatistics(type) {
        return this.poolStats.get(type) || null;
    }

    /**
     * Validate pool integrity
     * @returns {Array} Array of issues found
     */
    validate() {
        const issues = [];

        for (const [type, pool] of this.pools) {
            // Check for duplicates
            const seen = new Set();
            for (const obj of pool) {
                if (obj.__poolId) {
                    if (seen.has(obj.__poolId)) {
                        issues.push(`Duplicate object in pool: ${type}`);
                    }
                    seen.add(obj.__poolId);
                }
            }
        }

        // Check for leaked objects
        if (this.leakDetectionEnabled) {
            const now = Date.now();
            for (const [id, tracked] of this.checkedOutObjects) {
                if (now - tracked.acquiredAt > 300000) { // 5 minutes
                    issues.push(`Long-lived object checkout: ${tracked.type}`);
                }
            }
        }

        return issues;
    }

    /**
     * Get history entries
     * @param {Object} filter - Filter criteria
     */
    getHistory(filter = {}) {
        return this.history.filter(entry => {
            if (filter.action && entry.action !== filter.action) return false;
            return true;
        });
    }

    /**
     * Record history entry
     * @private
     */
    _recordHistory(action, details) {
        this.history.push({
            timestamp: Date.now(),
            action,
            details
        });

        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }
    }

    /**
     * Reset all statistics
     */
    resetStatistics() {
        this.stats = {
            poolHits: 0,
            poolMisses: 0,
            objectsCreated: 0,
            objectsReused: 0,
            objectsReleased: 0,
            gcRuns: 0,
            averagePoolUtilization: 0
        };
        this._recordHistory('STATISTICS_RESET', {});
    }
}
