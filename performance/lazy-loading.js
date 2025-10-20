/**
 * ============================================================================
 * ============================================================================
 * 
 * Purpose:
 *   - Defer module/resource loading until first use
 *   - Manage dependency graphs efficiently
 *   - Track loading state and performance
 *   - Support circular dependency detection
 * 
 * Architecture:
 *   - Lazy module initialization on first access
 *   - Cached modules to avoid re-initialization
 *   - Dependency tracking and resolution
 *   - Performance metrics per module
 */

import { EventEmitter } from 'events';

export class LazyLoadingManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        // Configuration
        this.cacheLoaded = options.cacheLoaded !== false;
        this.maxConcurrentLoads = options.maxConcurrentLoads || 5;
        this.timeout = options.timeout || 30000; // 30 seconds
        
        // Module management
        this.modules = new Map(); // { name: { factory, loaded, instance, dependencies } }
        this.loadingPromises = new Map();
        this.loadedModules = new Set();
        this.loadingModules = new Set();
        
        // Statistics
        this.stats = {
            totalModules: 0,
            loadedModules: 0,
            failedModules: 0,
            totalLoadTime: 0,
            maxLoadTime: 0,
            minLoadTime: Infinity,
            cacheHits: 0,
            cacheMisses: 0,
            averageLoadTime: 0
        };
    }

    /**
     * Register module
     * @param {string} name - Module name
     * @param {Function|Object} factory - Factory function or object
     * @param {Array} dependencies - List of dependencies
     */
    register(name, factory, dependencies = []) {
        if (this.modules.has(name)) {
            throw new Error(`Module ${name} already registered`);
        }

        // Check for duplicate dependencies
        const uniqueDeps = [...new Set(dependencies)];
        
        this.modules.set(name, {
            name,
            factory,
            loaded: false,
            instance: null,
            dependencies: uniqueDeps,
            loadedAt: null,
            loadTime: 0
        });

        this.stats.totalModules++;
    }

    /**
     * Register multiple modules
     * @param {Array} modules - Array of {name, factory, dependencies}
     */
    registerBatch(modules) {
        for (const module of modules) {
            this.register(module.name, module.factory, module.dependencies || []);
        }
    }

    /**
     * Load module (lazy)
     * @param {string} name - Module name
     * @returns {Promise<*>} Module instance
     */
    async load(name) {
        const module = this.modules.get(name);
        if (!module) {
            throw new Error(`Module ${name} not registered`);
        }

        // Return cached instance
        if (module.loaded && this.cacheLoaded) {
            this.stats.cacheHits++;
            return module.instance;
        }

        // Return pending promise if already loading
        if (this.loadingModules.has(name)) {
            return this.loadingPromises.get(name);
        }

        // Check for circular dependencies
        if (this._hasCircularDependency(name)) {
            throw new Error(`Circular dependency detected in ${name}`);
        }

        // Mark as loading
        this.loadingModules.add(name);
        this.stats.cacheMisses++;

        const loadPromise = this._executeLoad(name);
        this.loadingPromises.set(name, loadPromise);

        try {
            const instance = await Promise.race([
                loadPromise,
                this._createTimeoutPromise(name)
            ]);
            return instance;
        } finally {
            this.loadingModules.delete(name);
        }
    }

    /**
     * Load multiple modules
     * @param {Array} names - Module names
     * @returns {Promise<Object>} Loaded modules
     */
    async loadBatch(names) {
        const promises = names.map(name => this.load(name));
        const instances = await Promise.all(promises);

        const result = {};
        for (let i = 0; i < names.length; i++) {
            result[names[i]] = instances[i];
        }
        return result;
    }

    /**
     * Unload module
     * @param {string} name - Module name
     * @returns {boolean} Success
     */
    unload(name) {
        const module = this.modules.get(name);
        if (!module) return false;

        if (module.loaded && typeof module.instance?.destroy === 'function') {
            module.instance.destroy();
        }

        module.loaded = false;
        module.instance = null;
        this.loadedModules.delete(name);

        this.emit('unloaded', { module: name });
        return true;
    }

    /**
     * Get module instance without loading
     * @param {string} name - Module name
     * @returns {*} Module instance or null
     */
    get(name) {
        const module = this.modules.get(name);
        if (!module || !module.loaded) {
            return null;
        }
        return module.instance;
    }

    /**
     * Check if module is loaded
     * @param {string} name - Module name
     * @returns {boolean}
     */
    isLoaded(name) {
        const module = this.modules.get(name);
        return module && module.loaded;
    }

    /**
     * Get loading status
     * @param {string} name - Module name
     * @returns {Object} Status
     */
    getStatus(name) {
        const module = this.modules.get(name);
        if (!module) return null;

        return {
            name,
            loaded: module.loaded,
            loading: this.loadingModules.has(name),
            dependencies: module.dependencies,
            loadedAt: module.loadedAt,
            loadTime: module.loadTime + 'ms'
        };
    }

    /**
     * Get all loaded modules
     * @returns {Array} List of loaded module names
     */
    getLoadedModules() {
        return Array.from(this.loadedModules);
    }

    /**
     * Get all registered modules
     * @returns {Array} List of all registered module names
     */
    getRegisteredModules() {
        return Array.from(this.modules.keys());
    }

    /**
     * Get dependencies graph
     * @returns {Object} Dependency graph
     */
    getDependencyGraph() {
        const graph = {};
        for (const [name, module] of this.modules) {
            graph[name] = module.dependencies;
        }
        return graph;
    }

    /**
     * Get loading statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        const avgTime = this.stats.loadedModules > 0
            ? this.stats.totalLoadTime / this.stats.loadedModules
            : 0;

        return {
            ...this.stats,
            averageLoadTime: avgTime.toFixed(2) + 'ms',
            maxLoadTime: this.stats.maxLoadTime + 'ms',
            minLoadTime: this.stats.minLoadTime === Infinity ? '0ms' : this.stats.minLoadTime + 'ms',
            cacheHitRate: (this.stats.cacheHits / Math.max(1, this.stats.cacheHits + this.stats.cacheMisses) * 100).toFixed(2) + '%'
        };
    }

    /**
     * Reset statistics
     */
    resetStatistics() {
        this.stats = {
            totalModules: this.modules.size,
            loadedModules: 0,
            failedModules: 0,
            totalLoadTime: 0,
            maxLoadTime: 0,
            minLoadTime: Infinity,
            cacheHits: 0,
            cacheMisses: 0,
            averageLoadTime: 0
        };
    }

    /**
     * Execute module load
     * @private
     */
    async _executeLoad(name) {
        const module = this.modules.get(name);
        const startTime = Date.now();

        try {
            // Load dependencies first
            const depInstances = {};
            for (const depName of module.dependencies) {
                depInstances[depName] = await this.load(depName);
            }

            // Load module
            let instance;
            if (typeof module.factory === 'function') {
                instance = await module.factory(depInstances);
            } else {
                instance = module.factory;
            }

            // Mark as loaded
            module.loaded = true;
            module.instance = instance;
            module.loadedAt = Date.now();
            module.loadTime = module.loadedAt - startTime;
            this.loadedModules.add(name);
            this.stats.loadedModules++;
            this.stats.totalLoadTime += module.loadTime;
            this.stats.maxLoadTime = Math.max(this.stats.maxLoadTime, module.loadTime);
            this.stats.minLoadTime = Math.min(this.stats.minLoadTime, module.loadTime);

            this.emit('loaded', { module: name, loadTime: module.loadTime });
            return instance;
        } catch (error) {
            this.stats.failedModules++;
            this.emit('failed', { module: name, error: error.message });
            throw error;
        }
    }

    /**
     * Create timeout promise
     * @private
     */
    _createTimeoutPromise(name) {
        return new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`Module ${name} load timeout`));
            }, this.timeout);
        });
    }

    /**
     * Check for circular dependencies
     * @private
     */
    _hasCircularDependency(name, visited = new Set()) {
        if (visited.has(name)) return true;
        
        const module = this.modules.get(name);
        if (!module) return false;

        visited.add(name);

        for (const dep of module.dependencies) {
            if (this._hasCircularDependency(dep, new Set(visited))) {
                return true;
            }
        }

        return false;
    }
}

export default LazyLoadingManager;
