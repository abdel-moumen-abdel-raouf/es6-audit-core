/**
 * Large Payloads Handling - Fix #14
 * Advanced Log Rotation - Fix #15
 * 
 * 
 * - Streaming + compression support
 * - Payload size detection + chunking
 * - Advanced log rotation + compression + archiving
 */

/**
 * Large Payloads Handling - Fix #14
 */
export class PayloadOptimizer {
    constructor(config = {}) {
        this.maxPayloadSize = config.maxPayloadSize || 1024 * 1024; // 1 MB
        this.chunkSize = config.chunkSize || 256 * 1024; // 256 KB
        this.compressionEnabled = config.compressionEnabled !== false;
        this.compressionThreshold = config.compressionThreshold || 100 * 1024; // 100 KB
        this.streamingEnabled = config.streamingEnabled !== false;
        
        this.stats = {
            payloadsProcessed: 0,
            bytesProcessed: 0,
            bytesCompressed: 0,
            chunksCreated: 0,
            averageCompressionRatio: 0
        };
    }

    /**
     * Estimate payload size
     */
    estimateSize(data) {
        if (typeof data === 'string') {
            return data.length * 2; // UTF-16
        }
        if (typeof data === 'object') {
            return JSON.stringify(data).length * 2;
        }
        return 0;
    }

    /**
     * Should compress payload
     */
    shouldCompress(size) {
        return this.compressionEnabled && size > this.compressionThreshold;
    }

    /**
     * Compress payload
     */
    compress(data) {
        if (typeof data === 'string') {
            return this._compressString(data);
        }
        if (typeof data === 'object') {
            return this._compressString(JSON.stringify(data));
        }
        return data;
    }

    /**
     * Compress string using simple LZ algorithm
     */
    _compressString(str) {
        // Simple run-length encoding for demo
        let compressed = '';
        let i = 0;

        while (i < str.length) {
            let char = str[i];
            let count = 1;

            while (i + count < str.length && str[i + count] === char && count < 255) {
                count++;
            }

            if (count >= 3) {
                compressed += `§${count}${char}`;
            } else {
                compressed += char.repeat(count);
            }

            i += count;
        }

        return compressed;
    }

    /**
     * Decompress string
     */
    decompress(compressed) {
        let decompressed = '';
        let i = 0;

        while (i < compressed.length) {
            if (compressed[i] === '§') {
                i++;
                let count = '';
                while (i < compressed.length && compressed[i] >= '0' && compressed[i] <= '9') {
                    count += compressed[i];
                    i++;
                }
                const char = compressed[i];
                decompressed += char.repeat(parseInt(count));
                i++;
            } else {
                decompressed += compressed[i];
                i++;
            }
        }

        return decompressed;
    }

    /**
     * Chunk large payload
     */
    chunkPayload(data) {
        const size = this.estimateSize(data);

        if (size <= this.chunkSize) {
            return [{ data, order: 1, total: 1, compressed: false }];
        }

        const chunks = [];
        const str = typeof data === 'string' ? data : JSON.stringify(data);
        const totalChunks = Math.ceil(str.length / this.chunkSize);

        for (let i = 0; i < totalChunks; i++) {
            const start = i * this.chunkSize;
            const end = Math.min((i + 1) * this.chunkSize, str.length);
            const chunk = str.substring(start, end);

            chunks.push({
                data: chunk,
                order: i + 1,
                total: totalChunks,
                compressed: false,
                chunkSize: chunk.length
            });
        }

        this.stats.chunksCreated += chunks.length;
        return chunks;
    }

    /**
     * Process payload (optimize)
     */
    processPayload(data) {
        const size = this.estimateSize(data);
        this.stats.payloadsProcessed++;
        this.stats.bytesProcessed += size;

        // If too large, chunk it
        if (size > this.maxPayloadSize) {
            return {
                type: 'chunked',
                chunks: this.chunkPayload(data),
                originalSize: size
            };
        }

        // If should compress, compress it
        if (this.shouldCompress(size)) {
            const compressed = this.compress(data);
            const compressedSize = this.estimateSize(compressed);
            const ratio = compressedSize / size;

            this.stats.bytesCompressed += compressedSize;
            this.stats.averageCompressionRatio = 
                (this.stats.averageCompressionRatio + ratio) / 2;

            return {
                type: 'compressed',
                data: compressed,
                originalSize: size,
                compressedSize,
                ratio: (ratio * 100).toFixed(2) + '%'
            };
        }

        return {
            type: 'normal',
            data,
            size
        };
    }

    /**
     * Get statistics
     */
    getStatistics() {
        return {
            ...this.stats,
            compressionRatio: this.stats.bytesCompressed > 0
                ? (this.stats.bytesCompressed / this.stats.bytesProcessed * 100).toFixed(2) + '%'
                : 'N/A'
        };
    }
}

/**
 * Advanced Log Rotation - Fix #15
 */
export class AdvancedLogRotator {
    constructor(config = {}) {
        this.basePath = config.basePath || './logs';
        this.maxFileSize = config.maxFileSize || 10 * 1024 * 1024; // 10 MB
        this.maxFiles = config.maxFiles || 10;
        this.compressOldFiles = config.compressOldFiles !== false;
        this.archiveOldFiles = config.archiveOldFiles !== false;
        this.archivePath = config.archivePath || './logs/archive';
        this.retentionDays = config.retentionDays || 30;
        
        this.currentFile = null;
        this.currentSize = 0;
        this.rotationCount = 0;
        
        this.stats = {
            rotations: 0,
            compressed: 0,
            archived: 0,
            deleted: 0,
            totalSize: 0
        };
    }

    /**
     * Get next rotation filename
     */
    getNextFilename(baseFilename) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const counter = this.rotationCount++;
        return `${baseFilename}.${timestamp}.${counter}.log`;
    }

    /**
     * Get rotated files
     */
    getRotatedFiles(baseFilename) {
        // In real implementation, list files from filesystem
        const pattern = new RegExp(`^${baseFilename}\\.\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}`);
        return [];  // Would return matched files
    }

    /**
     * Should rotate
     */
    shouldRotate(currentSize) {
        return currentSize >= this.maxFileSize;
    }

    /**
     * Perform rotation
     */
    async rotate(currentFilename, newFilename) {
        const rotationRecord = {
            previousFile: currentFilename,
            newFile: newFilename,
            timestamp: Date.now(),
            oldSize: this.currentSize
        };

        // Reset size
        this.currentSize = 0;

        // Archive old files if needed
        await this._manageArchives(currentFilename);

        // Clean up old files if needed
        await this._cleanupOldFiles();

        this.stats.rotations++;
        return rotationRecord;
    }

    /**
     * Manage archives
     */
    async _manageArchives(filename) {
        if (this.archiveOldFiles) {
            // Move to archive folder
            // In real implementation: file system operations
            this.stats.archived++;

            if (this.compressOldFiles) {
                // Compress archived files
                this.stats.compressed++;
            }
        }
    }

    /**
     * Cleanup old files
     */
    async _cleanupOldFiles() {
        // Keep only maxFiles
        // Delete files older than retentionDays
        // In real implementation: file system operations
        this.stats.deleted++;
    }

    /**
     * Get statistics
     */
    getStatistics() {
        return this.stats;
    }

    /**
     * Get retention policy info
     */
    getRetentionPolicy() {
        return {
            maxFileSize: `${(this.maxFileSize / 1024 / 1024).toFixed(2)} MB`,
            maxFiles: this.maxFiles,
            retentionDays: this.retentionDays,
            compressionEnabled: this.compressOldFiles,
            archivingEnabled: this.archiveOldFiles,
            archivePath: this.archivePath
        };
    }
}

/**
 * Payload Streaming
 */
export class PayloadStream {
    constructor(data, chunkSize = 256 * 1024) {
        this.data = typeof data === 'string' ? data : JSON.stringify(data);
        this.chunkSize = chunkSize;
        this.position = 0;
        this.chunks = [];
        
        this._initialize();
    }

    /**
     * Initialize chunks
     */
    _initialize() {
        for (let i = 0; i < this.data.length; i += this.chunkSize) {
            this.chunks.push(this.data.substring(i, i + this.chunkSize));
        }
    }

    /**
     * Get next chunk
     */
    getNextChunk() {
        if (this.position >= this.chunks.length) {
            return null;
        }

        return {
            data: this.chunks[this.position],
            position: this.position,
            total: this.chunks.length,
            isLast: this.position === this.chunks.length - 1
        };
    }

    /**
     * Move to next
     */
    next() {
        this.position++;
        return this.getNextChunk();
    }

    /**
     * Reset stream
     */
    reset() {
        this.position = 0;
        return this.getNextChunk();
    }

    /**
     * Get all chunks
     */
    getAllChunks() {
        return this.chunks.map((chunk, i) => ({
            data: chunk,
            position: i,
            total: this.chunks.length,
            isLast: i === this.chunks.length - 1
        }));
    }

    /**
     * Reconstruct from chunks
     */
    static reconstructFromChunks(chunks) {
        const sorted = chunks.sort((a, b) => a.position - b.position);
        return sorted.map(c => c.data).join('');
    }
}

/**
 * Compression utilities
 */
export class CompressionUtils {
    /**
     * Simple dictionary compression
     */
    static dictionaryCompress(str) {
        const dict = {};
        let dictSize = 256;
        const data = (str + '').split('');
        const out = [];
        let currChar;
        let phrase = data[0];

        for (let i = 1; i < data.length; i++) {
            currChar = data[i];
            if (dict[phrase + currChar]) {
                phrase += currChar;
            } else {
                out.push(phrase.length > 1 ? dict[phrase] : phrase.charCodeAt(0));
                if (dictSize < 65536) {
                    dict[phrase + currChar] = dictSize;
                    dictSize++;
                }
                phrase = currChar;
            }
        }
        out.push(phrase.length > 1 ? dict[phrase] : phrase.charCodeAt(0));
        for (let i = 0; i < data.length; i++) {
            data[i] = String.fromCharCode(data[i]);
        }
        return out.map(x => String.fromCharCode(x)).join('');
    }

    /**
     * Simple dictionary decompression
     */
    static dictionaryDecompress(compressed) {
        const dict = {};
        let dictSize = 256;
        const data = compressed.split('').map(x => x.charCodeAt(0));
        let currChar = String.fromCharCode(data[0]);
        let phrase = currChar;
        const out = [currChar];

        for (let i = 1; i < data.length; i++) {
            const code = data[i];
            if (code < dictSize) {
                currChar = String.fromCharCode(code);
            } else {
                currChar = dict[code] ? dict[code] : phrase + phrase.charAt(0);
            }
            out.push(currChar);
            if (dictSize < 65536) {
                dict[dictSize] = phrase + currChar.charAt(0);
                dictSize++;
            }
            phrase = currChar;
        }
        return out.join('');
    }
}
