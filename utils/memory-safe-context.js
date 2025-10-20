/**
 * Memory Safe Context Manager - Fix #9
 * 
 * - عدم وجود WeakReference
 * 
 * - Cleanup handlers
 * - Reference counting
 * - GC-safe context management
 */

export class ContextReference {
    constructor(context, id = null) {
        this.contextId = id || Math.random().toString(36).substr(2, 9);
        this.context = context;
        this.createdAt = Date.now();
        this.accessCount = 0;
        this.lastAccessedAt = Date.now();
        this.metadata = new Map();
    }

    /**
     * Record access
     */
    recordAccess() {
        this.accessCount++;
        this.lastAccessedAt = Date.now();
    }

    /**
     * Get age in milliseconds
     */
    getAge() {
        return Date.now() - this.createdAt;
    }

    /**
     * Get idle time
     */
    getIdleTime() {
        return Date.now() - this.lastAccessedAt;
    }
}

export class ContextManager {
    constructor(config = {}) {
        this.maxContexts = config.maxContexts || 1000;
        this.contextTimeout = config.contextTimeout || 5 * 60 * 1000; // 5 minutes
        this.cleanupInterval = config.cleanupInterval || 60 * 1000; // 1 minute
        
        // Use WeakMap for automatic garbage collection
        this.contexts = new Map(); // We use Map but track with IDs for control
        this.contextRefs = new WeakMap(); // Weak references to actual contexts
        this.cleanupCallbacks = new Map();
        this.idToContext = new Map(); // ID to context mapping for cleanup
        
        // Statistics
        this.stats = {
            created: 0,
            destroyed: 0,
            cleaned: 0,
            active: 0,
            maxActive: 0
        };

        // Start cleanup timer
        this._startCleanupTimer();
    }

    /**
     * Create and register context
     */
    createContext(data = {}, id = null) {
        if (this.stats.active >= this.maxContexts) {
            // Force cleanup before creating new
            this._forceCleanup(Math.floor(this.maxContexts * 0.1));
        }

        const contextId = id || `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const ref = new ContextReference(data, contextId);

        // Store in both maps
        this.contexts.set(contextId, ref);
        this.idToContext.set(contextId, ref);

        this.stats.created++;
        this.stats.active++;
        this.stats.maxActive = Math.max(this.stats.maxActive, this.stats.active);

        return contextId;
    }

    /**
     * Get context
     */
    getContext(contextId) {
        const ref = this.contexts.get(contextId);
        if (ref) {
            ref.recordAccess();
            return ref.context;
        }
        return null;
    }

    /**
     * Update context
     */
    updateContext(contextId, data) {
        const ref = this.contexts.get(contextId);
        if (ref) {
            ref.recordAccess();
            ref.context = { ...ref.context, ...data };
            return true;
        }
        return false;
    }

    /**
     * Destroy context manually
     */
    destroyContext(contextId) {
        const ref = this.contexts.get(contextId);
        if (ref) {
            // Call cleanup callback if registered
            if (this.cleanupCallbacks.has(contextId)) {
                const callback = this.cleanupCallbacks.get(contextId);
                try {
                    callback(ref.context);
                } catch (error) {
                    console.error(`Cleanup callback error for context ${contextId}:`, error);
                }
                this.cleanupCallbacks.delete(contextId);
            }

            // Remove references
            this.contexts.delete(contextId);
            this.idToContext.delete(contextId);

            this.stats.destroyed++;
            this.stats.active--;

            return true;
        }
        return false;
    }

    /**
     * Register cleanup callback
     */
    onContextDestroy(contextId, callback) {
        if (typeof callback === 'function') {
            this.cleanupCallbacks.set(contextId, callback);
        }
    }

    /**
     * Auto cleanup old contexts
     */
    _performCleanup() {
        const now = Date.now();
        const toDelete = [];

        for (const [contextId, ref] of this.contexts.entries()) {
            const idleTime = ref.getIdleTime();
            const age = ref.getAge();

            // Remove if idle too long or too old
            if (idleTime > this.contextTimeout || age > this.contextTimeout * 2) {
                toDelete.push(contextId);
            }
        }

        for (const contextId of toDelete) {
            this.destroyContext(contextId);
            this.stats.cleaned++;
        }

        return toDelete.length;
    }

    /**
     * Force cleanup oldest contexts
     */
    _forceCleanup(count) {
        const sorted = Array.from(this.contexts.entries())
            .sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt)
            .slice(0, count)
            .map(entry => entry[0]);

        for (const contextId of sorted) {
            this.destroyContext(contextId);
            this.stats.cleaned++;
        }
    }

    /**
     * Start cleanup timer
     */
    _startCleanupTimer() {
        this.cleanupTimer = setInterval(() => {
            this._performCleanup();
        }, this.cleanupInterval);
    }

    /**
     * Get statistics
     */
    getStatistics() {
        return {
            ...this.stats,
            contextTimeoutMs: this.contextTimeout,
            cleanupIntervalMs: this.cleanupInterval
        };
    }

    /**
     * List all contexts (for debugging)
     */
    listContexts() {
        const list = [];
        for (const [contextId, ref] of this.contexts.entries()) {
            list.push({
                id: contextId,
                age: ref.getAge(),
                idle: ref.getIdleTime(),
                accessCount: ref.accessCount,
                metadata: Object.fromEntries(ref.metadata)
            });
        }
        return list;
    }

    /**
     * Stop cleanup timer
     */
    stop() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }

    /**
     * Cleanup all contexts
     */
    clear() {
        const count = this.contexts.size;
        for (const contextId of this.contexts.keys()) {
            this.destroyContext(contextId);
        }
        return count;
    }

    /**
     * Get context memory usage estimate
     */
    getMemoryEstimate() {
        let bytes = 0;
        for (const [contextId, ref] of this.contexts.entries()) {
            // Rough estimate
            bytes += JSON.stringify(ref.context).length * 2; // UTF-16
            bytes += contextId.length * 2;
        }
        return {
            bytes,
            kilobytes: (bytes / 1024).toFixed(2),
            megabytes: (bytes / 1024 / 1024).toFixed(2)
        };
    }
}

/**
 * Async Context Manager for Node.js
 */
export class AsyncContextManager {
    constructor(config = {}) {
        this.contextManager = new ContextManager(config);
        this.asyncContexts = new Map(); // Store for async context IDs
    }

    /**
     * Run function with context
     */
    async runWithContext(context, fn) {
        const contextId = this.contextManager.createContext(context);

        try {
            const asyncContext = { contextId, context };
            return await fn(contextId);
        } finally {
            this.contextManager.destroyContext(contextId);
        }
    }

    /**
     * Get current context
     */
    getCurrentContext(contextId) {
        return this.contextManager.getContext(contextId);
    }

    /**
     * Update context during async operation
     */
    updateCurrentContext(contextId, data) {
        return this.contextManager.updateContext(contextId, data);
    }

    /**
     * Get statistics
     */
    getStatistics() {
        return this.contextManager.getStatistics();
    }

    /**
     * Stop manager
     */
    stop() {
        this.contextManager.stop();
    }
}

/**
 * Scoped Context - Similar to try-with-resources in Java
 */
export class ScopedContext {
    constructor(manager, data = {}) {
        this.manager = manager;
        this.contextId = manager.createContext(data);
    }

    /**
     * Get context
     */
    get() {
        return this.manager.getContext(this.contextId);
    }

    /**
     * Update context
     */
    update(data) {
        return this.manager.updateContext(this.contextId, data);
    }

    /**
     * Register cleanup handler
     */
    onExit(callback) {
        this.manager.onContextDestroy(this.contextId, callback);
        return this;
    }

    /**
     * Manually exit scope
     */
    exit() {
        return this.manager.destroyContext(this.contextId);
    }

    /**
     * Async scoped context
     */
    static async async(manager, data, fn) {
        const scope = new ScopedContext(manager, data);
        try {
            return await fn(scope);
        } finally {
            scope.exit();
        }
    }

    /**
     * Sync scoped context
     */
    static sync(manager, data, fn) {
        const scope = new ScopedContext(manager, data);
        try {
            return fn(scope);
        } finally {
            scope.exit();
        }
    }
}
