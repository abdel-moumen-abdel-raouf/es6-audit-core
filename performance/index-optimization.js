/**
 * ============================================================================
 * ============================================================================
 * 
 * Purpose:
 *   - Implement efficient indexing strategies
 *   - Support binary search and range queries
 *   - Optimize lookup performance with indexes
 *   - Track index statistics and performance
 * 
 * Architecture:
 *   - B-tree like indexing for sorted data
 *   - Hash-based indexing for fast lookups
 *   - Multi-field indexing support
 *   - Query optimization and planning
 */

import { EventEmitter } from 'events';

export class IndexOptimizationManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        // Configuration
        this.maxIndexSize = options.maxIndexSize || 10000;
        this.enableAutoIndex = options.enableAutoIndex !== false;
        this.compressionEnabled = options.compressionEnabled || false;
        
        // Storage
        this.data = [];
        this.indexes = new Map(); // fieldName -> Map(value -> indices)
        this.rangeIndexes = new Map(); // fieldName -> sorted array of {value, indices}
        this.primaryKey = null;
        
        // Statistics
        this.stats = {
            totalRecords: 0,
            indexCount: 0,
            lookupOperations: 0,
            rangeOperations: 0,
            avgLookupTime: 0,
            totalLookupTime: 0,
            maxLookupTime: 0,
            minLookupTime: Infinity,
            cacheHits: 0,
            cacheMisses: 0,
            indexedFields: []
        };
        
        this.lookupCache = new Map();
        this.cacheSize = options.cacheSize || 100;
    }

    /**
     * Add data record
     * @param {Object} record - Data record
     */
    add(record) {
        const recordId = this.data.length;
        this.data.push(record);
        this.stats.totalRecords++;

        if (this.enableAutoIndex) {
            // Auto-index fields
            for (const [field, value] of Object.entries(record)) {
                this._addToIndex(field, value, recordId);
            }
        }

        this.emit('added', { recordId, record });
    }

    /**
     * Add multiple records
     * @param {Array} records - Records to add
     */
    addBatch(records) {
        for (const record of records) {
            this.add(record);
        }
    }

    /**
     * Create index on field
     * @param {string} field - Field name
     * @param {Object} options - Index options (type: 'hash'|'range')
     */
    createIndex(field, options = {}) {
        const indexType = options.type || 'hash';

        // Skip if already indexed
        if (this.indexes.has(field) && this.stats.indexedFields.includes(field)) {
            return;
        }

        if (!this.indexes.has(field)) {
            this.indexes.set(field, new Map());
            this.rangeIndexes.set(field, []);
            
            // Build index for existing data (only if not auto-indexed)
            if (!this.enableAutoIndex) {
                for (let i = 0; i < this.data.length; i++) {
                    const value = this.data[i][field];
                    this._addToIndex(field, value, i);
                }
            }
        }

        if (!this.stats.indexedFields.includes(field)) {
            this.stats.indexedFields.push(field);
            this.stats.indexCount++;
        }

        this.emit('index-created', { field, type: indexType });
    }

    /**
     * Find record by field value
     * @param {string} field - Field name
     * @param {*} value - Value to search
     * @returns {Array} Matching records
     */
    find(field, value) {
        const startTime = Date.now();
        this.stats.lookupOperations++;

        // Check cache
        const cacheKey = `${field}:${value}`;
        if (this.lookupCache.has(cacheKey)) {
            this.stats.cacheHits++;
            return this.lookupCache.get(cacheKey);
        }

        this.stats.cacheMisses++;

        const index = this.indexes.get(field);
        if (!index) {
            // No index, perform full scan
            const result = this.data.filter(r => r[field] === value);
            this._cacheResult(cacheKey, result);
            return result;
        }

        // Use index
        const indices = index.get(value) || [];
        const result = indices.map(idx => this.data[idx]);

        // Update stats
        const duration = Date.now() - startTime;
        this.stats.totalLookupTime += duration;
        this.stats.maxLookupTime = Math.max(this.stats.maxLookupTime, duration);
        this.stats.minLookupTime = Math.min(this.stats.minLookupTime, duration);

        this._cacheResult(cacheKey, result);
        this.emit('lookup', { field, value, resultCount: result.length, duration });

        return result;
    }

    /**
     * Range query
     * @param {string} field - Field name
     * @param {*} min - Minimum value
     * @param {*} max - Maximum value
     * @returns {Array} Matching records
     */
    range(field, min, max) {
        const startTime = Date.now();
        
        const rangeIndex = this.rangeIndexes.get(field);
        let result;
        
        if (!rangeIndex || rangeIndex.length === 0) {
            // No index, perform full scan
            result = this.data.filter(r => {
                const v = r[field];
                return v >= min && v <= max;
            });
        } else {
            // Use binary search on sorted range index
            result = [];
            const indices = new Set();

            for (const entry of rangeIndex) {
                if (entry.value >= min && entry.value <= max) {
                    for (const idx of entry.indices) {
                        indices.add(idx);
                    }
                }
            }

            for (const idx of indices) {
                result.push(this.data[idx]);
            }
        }

        const duration = Date.now() - startTime;
        this.stats.rangeOperations++;

        this.emit('range-query', { field, min, max, resultCount: result.length, duration });

        return result;
    }

    /**
     * Drop index on field
     * @param {string} field - Field name
     * @returns {boolean} Success
     */
    dropIndex(field) {
        if (!this.indexes.has(field)) return false;

        this.indexes.delete(field);
        this.rangeIndexes.delete(field);

        const idx = this.stats.indexedFields.indexOf(field);
        if (idx > -1) {
            this.stats.indexedFields.splice(idx, 1);
            this.stats.indexCount--;
        }

        this.emit('index-dropped', { field });
        return true;
    }

    /**
     * Get all indexes
     * @returns {Array} List of indexed fields
     */
    getIndexes() {
        return this.stats.indexedFields;
    }

    /**
     * Clear cache
     */
    clearCache() {
        const count = this.lookupCache.size;
        this.lookupCache.clear();
        return count;
    }

    /**
     * Get index statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        const avgLookupTime = this.stats.lookupOperations > 0
            ? this.stats.totalLookupTime / this.stats.lookupOperations
            : 0;

        return {
            ...this.stats,
            averageLookupTime: avgLookupTime.toFixed(2) + 'ms',
            maxLookupTime: this.stats.maxLookupTime + 'ms',
            minLookupTime: this.stats.minLookupTime === Infinity ? '0ms' : this.stats.minLookupTime + 'ms',
            cacheHitRate: (this.stats.cacheHits / Math.max(1, this.stats.cacheHits + this.stats.cacheMisses) * 100).toFixed(2) + '%',
            cachedItems: this.lookupCache.size,
            maxCacheSize: this.cacheSize
        };
    }

    /**
     * Reset statistics
     */
    resetStatistics() {
        this.stats = {
            totalRecords: this.data.length,
            indexCount: this.indexes.size,
            lookupOperations: 0,
            rangeOperations: 0,
            avgLookupTime: 0,
            totalLookupTime: 0,
            maxLookupTime: 0,
            minLookupTime: Infinity,
            cacheHits: 0,
            cacheMisses: 0,
            indexedFields: [...this.stats.indexedFields]
        };
    }

    /**
     * Add entry to index
     * @private
     */
    _addToIndex(field, value, recordId) {
        // Hash index
        if (!this.indexes.has(field)) {
            this.indexes.set(field, new Map());
        }
        
        const hashIndex = this.indexes.get(field);
        if (!hashIndex.has(value)) {
            hashIndex.set(value, []);
        }
        hashIndex.get(value).push(recordId);

        // Range index (for sorted queries)
        if (!this.rangeIndexes.has(field)) {
            this.rangeIndexes.set(field, []);
        }

        const rangeIndex = this.rangeIndexes.get(field);
        let entry = rangeIndex.find(e => e.value === value);
        if (!entry) {
            entry = { value, indices: [] };
            rangeIndex.push(entry);
            rangeIndex.sort((a, b) => {
                if (a.value < b.value) return -1;
                if (a.value > b.value) return 1;
                return 0;
            });
        }
        entry.indices.push(recordId);
    }

    /**
     * Cache lookup result
     * @private
     */
    _cacheResult(key, result) {
        if (this.lookupCache.size >= this.cacheSize) {
            // Remove oldest entry
            const firstKey = this.lookupCache.keys().next().value;
            this.lookupCache.delete(firstKey);
        }
        this.lookupCache.set(key, result);
    }
}

export default IndexOptimizationManager;
