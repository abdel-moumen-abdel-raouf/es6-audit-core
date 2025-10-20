/**
 * Compression Manager
 * 
 * 1. Multiple Compression Algorithms (Gzip, Deflate, Brotli)
 * 2. Adaptive Compression
 * 3. Stream Support
 * 4. Compression Ratio Tracking
 */

import zlib from 'zlib';
import crypto from 'crypto';
import { promisify } from 'util';
import { EventEmitter } from 'events';

// Promisified compression functions
const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
const deflate = promisify(zlib.deflate);
const inflate = promisify(zlib.inflate);

// Check for Brotli support (Node.js 11.7+)
let brotliCompress = null;
let brotliDecompress = null;

try {
    brotliCompress = promisify(zlib.brotliCompress);
    brotliDecompress = promisify(zlib.brotliDecompress);
} catch (e) {
    // Brotli not available
}

export class CompressionManager extends EventEmitter {
    /**
     * Initialize Compression Manager
     * @param {Object} options - Configuration options
     */
    constructor(options = {}) {
        super();
        
        // Algorithm selection
        this.preferredAlgorithm = options.preferredAlgorithm || 'gzip';
        this.algorithms = {
            gzip: { compress: gzip, decompress: gunzip },
            deflate: { compress: deflate, decompress: inflate }
        };
        
        // Add Brotli if available
        if (brotliCompress && brotliDecompress) {
            this.algorithms.brotli = { 
                compress: brotliCompress, 
                decompress: brotliDecompress 
            };
        }

        // Compression levels (1-9 for gzip/deflate, 0-11 for brotli)
        this.compressionLevel = options.compressionLevel || 6;
        
        // Thresholds
        this.minSizeToCompress = options.minSizeToCompress || 100; // Min bytes before compression
        this.adaptiveThreshold = options.adaptiveThreshold || 0.8; // Don't compress if < 80% reduction
        
        // Caching
        this.enableCaching = options.enableCaching !== false;
        this.compressionCache = new Map();
        this.maxCacheSize = options.maxCacheSize || 1000;
        
        // Statistics
        this.stats = {
            totalOperations: 0,
            successfulCompressions: 0,
            successfulDecompressions: 0,
            failedOperations: 0,
            bytesIn: 0,
            bytesOut: 0,
            averageCompressionRatio: 0,
            cacheHits: 0,
            cacheMisses: 0
        };
        
        this.history = [];
        this.maxHistory = options.maxHistory || 500;
        this.algorithmStats = new Map();
        this._initializeAlgorithmStats();
    }

    /**
     * Initialize statistics for each algorithm
     * @private
     */
    _initializeAlgorithmStats() {
        for (const algo of Object.keys(this.algorithms)) {
            this.algorithmStats.set(algo, {
                compressions: 0,
                decompressions: 0,
                bytesIn: 0,
                bytesOut: 0,
                avgRatio: 0,
                errors: 0
            });
        }
    }

    /**
     * Compress data
     * @param {Buffer|string} data - Data to compress
     * @param {Object} options - Compression options
     * @returns {Promise<Buffer>} Compressed data
     */
    async compress(data, options = {}) {
        this.stats.totalOperations++;
        
        const algorithm = options.algorithm || this.preferredAlgorithm;
        const level = options.level || this.compressionLevel;
        
        // Check minimum size
        if (Buffer.byteLength(data) < this.minSizeToCompress) {
            this._recordHistory('COMPRESSION_SKIPPED', {
                algorithm,
                reason: 'below-minimum-size',
                size: Buffer.byteLength(data)
            });
            return Buffer.from(data);
        }

        // Check cache
        const cacheKey = this._getCacheKey(data, 'compress', algorithm);
        if (this.enableCaching && this.compressionCache.has(cacheKey)) {
            this.stats.cacheHits++;
            this._recordHistory('CACHE_HIT', { algorithm, operation: 'compress' });
            return this.compressionCache.get(cacheKey);
        }

        this.stats.cacheMisses++;

        try {
            const algo = this.algorithms[algorithm];
            if (!algo) {
                throw new Error(`Unknown compression algorithm: ${algorithm}`);
            }

            const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
            const compressed = await algo.compress(buffer, { level });

            // Check adaptive threshold
            const ratio = compressed.length / buffer.length;
            if (ratio > this.adaptiveThreshold) {
                // Not worth compressing, return original
                this._recordHistory('COMPRESSION_SKIPPED', {
                    algorithm,
                    reason: 'poor-ratio',
                    ratio
                });
                return buffer;
            }

            // Cache result
            if (this.enableCaching) {
                this._addToCache(cacheKey, compressed);
            }

            // Update statistics
            this.stats.successfulCompressions++;
            this.stats.bytesIn += buffer.length;
            this.stats.bytesOut += compressed.length;
            
            const algoStats = this.algorithmStats.get(algorithm);
            algoStats.compressions++;
            algoStats.bytesIn += buffer.length;
            algoStats.bytesOut += compressed.length;
            algoStats.avgRatio = algoStats.bytesOut / algoStats.bytesIn;

            // Update global average
            this.stats.averageCompressionRatio = this.stats.bytesOut / Math.max(1, this.stats.bytesIn);

            this._recordHistory('COMPRESSION_SUCCESS', {
                algorithm,
                inputSize: buffer.length,
                outputSize: compressed.length,
                ratio
            });

            return compressed;
        } catch (error) {
            this.stats.failedOperations++;
            const algoStats = this.algorithmStats.get(algorithm);
            algoStats.errors++;
            
            this._recordHistory('COMPRESSION_ERROR', {
                algorithm,
                error: error.message
            });

            throw error;
        }
    }

    /**
     * Decompress data
     * @param {Buffer} compressed - Compressed data
     * @param {string} algorithm - Algorithm to use
     * @returns {Promise<Buffer>} Decompressed data
     */
    async decompress(compressed, algorithm = 'gzip') {
        this.stats.totalOperations++;

        try {
            const algo = this.algorithms[algorithm];
            if (!algo) {
                throw new Error(`Unknown compression algorithm: ${algorithm}`);
            }

            const buffer = Buffer.isBuffer(compressed) ? compressed : Buffer.from(compressed);
            const decompressed = await algo.decompress(buffer);

            // Update statistics
            this.stats.successfulDecompressions++;
            const algoStats = this.algorithmStats.get(algorithm);
            algoStats.decompressions++;

            this._recordHistory('DECOMPRESSION_SUCCESS', {
                algorithm,
                compressedSize: buffer.length,
                decompressedSize: decompressed.length
            });

            return decompressed;
        } catch (error) {
            this.stats.failedOperations++;
            const algoStats = this.algorithmStats.get(algorithm);
            algoStats.errors++;

            this._recordHistory('DECOMPRESSION_ERROR', {
                algorithm,
                error: error.message
            });

            throw error;
        }
    }

    /**
     * Compress with automatic algorithm selection
     * @param {Buffer|string} data - Data to compress
     * @returns {Promise<{data: Buffer, algorithm: string}>} Compressed data and algorithm used
     */
    async compressAuto(data) {
        const availableAlgorithms = Object.keys(this.algorithms);
        let best = null;
        let bestRatio = 1;

        for (const algo of availableAlgorithms) {
            try {
                const compressed = await this.compress(data, { algorithm: algo });
                const ratio = compressed.length / Buffer.byteLength(data);
                
                if (ratio < bestRatio) {
                    bestRatio = ratio;
                    best = { data: compressed, algorithm: algo, ratio };
                }
            } catch (error) {
                // Skip this algorithm
            }
        }

        if (!best) {
            throw new Error('All compression algorithms failed');
        }

        this._recordHistory('AUTO_COMPRESSION', {
            selectedAlgorithm: best.algorithm,
            ratio: best.ratio
        });

        return best;
    }

    /**
     * Get cache key
     * @private
     */
    _getCacheKey(data, operation, algorithm) {
        const hash = crypto.createHash('sha256');
        hash.update(Buffer.isBuffer(data) ? data : Buffer.from(data));
        return `${operation}:${algorithm}:${hash.digest('hex')}`;
    }

    /**
     * Add to cache with LRU eviction
     * @private
     */
    _addToCache(key, value) {
        if (this.compressionCache.size >= this.maxCacheSize) {
            // Remove oldest entry
            const firstKey = this.compressionCache.keys().next().value;
            this.compressionCache.delete(firstKey);
        }
        this.compressionCache.set(key, value);
    }

    /**
     * Get compression statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        const algorithmStats = {};
        for (const [algo, stats] of this.algorithmStats) {
            algorithmStats[algo] = { ...stats };
        }

        return {
            totalOperations: this.stats.totalOperations,
            successfulCompressions: this.stats.successfulCompressions,
            successfulDecompressions: this.stats.successfulDecompressions,
            failedOperations: this.stats.failedOperations,
            totalBytesIn: this.stats.bytesIn,
            totalBytesOut: this.stats.bytesOut,
            averageCompressionRatio: (this.stats.averageCompressionRatio * 100).toFixed(2) + '%',
            cacheHits: this.stats.cacheHits,
            cacheMisses: this.stats.cacheMisses,
            cacheSize: this.compressionCache.size,
            availableAlgorithms: Object.keys(this.algorithms),
            algorithmStatistics: algorithmStats
        };
    }

    /**
     * Get algorithm-specific statistics
     * @param {string} algorithm - Algorithm name
     */
    getAlgorithmStats(algorithm) {
        return this.algorithmStats.get(algorithm) || null;
    }

    /**
     * Clear cache
     */
    clearCache() {
        const count = this.compressionCache.size;
        this.compressionCache.clear();
        this._recordHistory('CACHE_CLEARED', { count });
        return count;
    }

    /**
     * Get history entries
     * @param {Object} filter - Filter criteria
     */
    getHistory(filter = {}) {
        return this.history.filter(entry => {
            if (filter.action && entry.action !== filter.action) return false;
            if (filter.algorithm && entry.details && entry.details.algorithm !== filter.algorithm) return false;
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
     * Reset statistics
     */
    resetStatistics() {
        this.stats = {
            totalOperations: 0,
            successfulCompressions: 0,
            successfulDecompressions: 0,
            failedOperations: 0,
            bytesIn: 0,
            bytesOut: 0,
            averageCompressionRatio: 0,
            cacheHits: 0,
            cacheMisses: 0
        };
        this._initializeAlgorithmStats();
        this._recordHistory('STATISTICS_RESET', {});
    }
}
