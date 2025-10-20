/**
 * Advanced RateLimiter with Token Bucket, Sliding Window, and Adaptive Throttling
 * Fixes #24-25: RateLimiter Advanced Features & Adaptive Throttling
 * 
 * Includes:
 * - Token Bucket algorithm
 * - Sliding Window Log counter
 * - Per-module rate limits
 * - Adaptive throttling based on load
 * - Priority queue for important logs
 */

class TokenBucket {
    constructor(capacity, refillRate) {
        this.capacity = capacity;
        this.refillRate = refillRate;  // tokens per second
        this.tokens = capacity;
        this.lastRefillTime = Date.now();
    }

    /**
     * Try to consume tokens
     * Returns: { allowed: boolean, tokensNeeded: number }
     */
    tryConsume(tokensNeeded = 1) {
        this.refill();

        if (this.tokens >= tokensNeeded) {
            this.tokens -= tokensNeeded;
            return { allowed: true, tokensNeeded, tokensRemaining: this.tokens };
        }

        return { 
            allowed: false, 
            tokensNeeded,
            tokensAvailable: this.tokens,
            waitTime: Math.ceil((tokensNeeded - this.tokens) / this.refillRate * 1000)
        };
    }

    /**
     * Refill tokens based on elapsed time
     */
    refill() {
        const now = Date.now();
        const elapsedSeconds = (now - this.lastRefillTime) / 1000;
        const tokensToAdd = elapsedSeconds * this.refillRate;

        if (tokensToAdd > 0) {
            this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
            this.lastRefillTime = now;
        }
    }

    getState() {
        this.refill();
        return {
            tokens: this.tokens,
            capacity: this.capacity,
            refillRate: this.refillRate
        };
    }
}

class SlidingWindowCounter {
    constructor(windowSizeMs, limit) {
        this.windowSizeMs = windowSizeMs;
        this.limit = limit;
        this.requests = [];
    }

    /**
     * Check if request is allowed
     */
    isAllowed() {
        const now = Date.now();
        const windowStart = now - this.windowSizeMs;

        // Remove old requests outside window
        this.requests = this.requests.filter(time => time > windowStart);

        if (this.requests.length < this.limit) {
            this.requests.push(now);
            return true;
        }

        return false;
    }

    getWindowInfo() {
        const now = Date.now();
        const windowStart = now - this.windowSizeMs;
        const activeRequests = this.requests.filter(time => time > windowStart);

        return {
            activeRequests: activeRequests.length,
            limit: this.limit,
            percentUsed: (activeRequests.length / this.limit) * 100,
            oldestRequest: activeRequests.length > 0 ? activeRequests[0] : null,
            nextAvailableTime: activeRequests.length >= this.limit 
                ? activeRequests[0] + this.windowSizeMs - now
                : 0
        };
    }
}

class AdvancedRateLimiter {
    constructor(options = {}) {
        this.globalLimit = options.globalLimit || 1000;  // logs per minute
        this.windowSizeMs = options.windowSizeMs || 60000;  // 1 minute
        
        // Token bucket config
        this.tokenCapacity = options.tokenCapacity || this.globalLimit;
        this.refillRate = options.refillRate || (this.globalLimit / 60);  // per second
        this.tokenBucket = new TokenBucket(this.tokenCapacity, this.refillRate);

        // Per-module limits
        this.moduleLimits = new Map();
        this.moduleCounters = new Map();

        // Adaptive throttling
        this.adaptiveMode = options.adaptiveMode !== false;
        this.loadThresholds = options.loadThresholds || {
            low: 0.3,      // < 30% capacity
            medium: 0.6,   // 30-60%
            high: 0.8      // 60-80%
            // > 80% = critical
        };

        // Priority queue
        this.priorityQueue = [];
        this.priorityWeights = {
            CRITICAL: 100,
            ERROR: 80,
            WARN: 50,
            INFO: 20,
            DEBUG: 10
        };

        // Statistics
        this.stats = {
            allowed: 0,
            rejected: 0,
            throttled: 0,
            priorityProcessed: 0
        };
    }

    /**
     * Set rate limit for a specific module
     */
    setModuleLimit(moduleName, logsPerMinute) {
        this.moduleLimits.set(moduleName, logsPerMinute);
        this.moduleCounters.set(
            moduleName,
            new SlidingWindowCounter(this.windowSizeMs, logsPerMinute)
        );
    }

    /**
     * Get rate limit for a module
     */
    getModuleLimit(moduleName) {
        if (!this.moduleLimits.has(moduleName)) {
            return this.globalLimit;
        }
        return this.moduleLimits.get(moduleName);
    }

    /**
     * Check if log is allowed (with priority support)
     */
    isAllowed(entry) {
        const level = entry.level || 'INFO';
        const module = entry.module || 'default';
        const priority = this.priorityWeights[level] || 20;

        // Check global token bucket
        const globalCheck = this.tokenBucket.tryConsume(1);
        if (!globalCheck.allowed) {
            // High priority messages get queued
            if (priority >= 50) {  // ERROR or higher
                this.priorityQueue.push({
                    entry,
                    queuedAt: Date.now(),
                    priority,
                    waitTime: globalCheck.waitTime
                });
                this.stats.throttled++;
                return { allowed: false, queued: true, priority, waitTime: globalCheck.waitTime };
            }

            this.stats.rejected++;
            return { allowed: false, reason: 'global-rate-limit' };
        }

        // Check module-specific limit
        if (this.moduleCounters.has(module)) {
            const moduleCounter = this.moduleCounters.get(module);
            if (!moduleCounter.isAllowed()) {
                this.stats.rejected++;
                return { allowed: false, reason: 'module-rate-limit' };
            }
        }

        this.stats.allowed++;
        return { allowed: true };
    }

    /**
     * Get current load percentage
     */
    getCurrentLoad() {
        const state = this.tokenBucket.getState();
        return 1 - (state.tokens / state.capacity);
    }

    /**
     * Adapt limits based on load
     */
    adaptThrottling() {
        if (!this.adaptiveMode) return;

        const load = this.getCurrentLoad();
        const newLimit = this._calculateAdaptiveLimit(load);

        return {
            currentLoad: load,
            loadLevel: this._getLoadLevel(load),
            isActive: load > this.loadThresholds.high,
            newLimit,
            reduction: ((this.globalLimit - newLimit) / this.globalLimit * 100).toFixed(1) + '%'
        };
    }

    /**
     * Calculate adaptive limit based on load
     */
    _calculateAdaptiveLimit(load) {
        if (load < this.loadThresholds.low) {
            return this.globalLimit;  // No throttling
        } else if (load < this.loadThresholds.medium) {
            return Math.floor(this.globalLimit * 0.9);  // 10% reduction
        } else if (load < this.loadThresholds.high) {
            return Math.floor(this.globalLimit * 0.7);  // 30% reduction
        } else {
            return Math.floor(this.globalLimit * 0.5);  // 50% reduction
        }
    }

    /**
     * Get load level name
     */
    _getLoadLevel(load) {
        if (load < this.loadThresholds.low) return 'LOW';
        if (load < this.loadThresholds.medium) return 'MEDIUM';
        if (load < this.loadThresholds.high) return 'HIGH';
        return 'CRITICAL';
    }

    /**
     * Process priority queue
     */
    processPriorityQueue() {
        const processed = [];

        while (this.priorityQueue.length > 0) {
            const item = this.priorityQueue[0];
            const waitTimeElapsed = Date.now() - item.queuedAt;

            if (waitTimeElapsed >= item.waitTime) {
                // Try to send
                const check = this.tokenBucket.tryConsume(1);
                if (check.allowed) {
                    this.priorityQueue.shift();
                    this.stats.priorityProcessed++;
                    processed.push(item.entry);
                } else {
                    break;  // Can't process yet
                }
            } else {
                break;  // Not ready yet
            }
        }

        return processed;
    }

    /**
     * Get priority queue status
     */
    getPriorityQueueStatus() {
        return {
            queuedCount: this.priorityQueue.length,
            oldestEntry: this.priorityQueue.length > 0 
                ? {
                    age: Date.now() - this.priorityQueue[0].queuedAt,
                    waitTime: this.priorityQueue[0].waitTime,
                    priority: this.priorityQueue[0].priority
                }
                : null
        };
    }

    /**
     * Get statistics
     */
    getStats() {
        const load = this.getCurrentLoad();
        const totalRequests = this.stats.allowed + this.stats.rejected + this.stats.throttled;
        const allowRate = totalRequests > 0 ? (this.stats.allowed / totalRequests * 100).toFixed(1) : 0;

        return {
            ...this.stats,
            totalRequests,
            allowRate: allowRate + '%',
            currentLoad: (load * 100).toFixed(1) + '%',
            loadLevel: this._getLoadLevel(load),
            tokenBucketState: this.tokenBucket.getState(),
            moduleStats: this._getModuleStats(),
            priorityQueueStatus: this.getPriorityQueueStatus()
        };
    }

    /**
     * Get module-specific statistics
     */
    _getModuleStats() {
        const stats = {};
        for (const [module, counter] of this.moduleCounters.entries()) {
            stats[module] = counter.getWindowInfo();
        }
        return stats;
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            allowed: 0,
            rejected: 0,
            throttled: 0,
            priorityProcessed: 0
        };
    }

    /**
     * Clear priority queue
     */
    clearPriorityQueue() {
        this.priorityQueue = [];
    }
}

// Export
export { AdvancedRateLimiter, TokenBucket, SlidingWindowCounter };
