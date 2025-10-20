/**
 * LogArchiver - Compress and archive old log files
 * 
 * Features:
 * - Automatic compression using gzip (80-90% size reduction)
 * - Batch archiving of multiple files
 * - Archive file integrity verification
 * - Error handling and logging
 * - Configurable age threshold
 * 
 * @author audit-core
 * @version 1.0.0
 */

import { LoggingError } from '../error-handling/errors.js';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

class LogArchiver {
  /**
   * Archive old log files in a directory
   * 
   * @static
   * @async
   * @param {string} directory - Directory containing log files
   * @param {Object} [options={}] - Archiving options
   * @param {number} [options.maxAge=2592000000] - Max age in ms (default: 30 days)
   * @param {string} [options.pattern='*.log'] - File pattern to match
   * @param {boolean} [options.removeOriginal=true] - Delete original after archiving
   * @returns {Promise<Object>} Archiving result with statistics
   * @throws {LoggingError} If archiving fails
   */
  static async archiveOldLogs(directory, options = {}) {
    try {
      LogArchiver._validateDirectory(directory);
      
      const maxAge = options.maxAge ?? 30 * 24 * 60 * 60 * 1000; // 30 days
      const pattern = options.pattern ?? '*.log';
      const removeOriginal = options.removeOriginal ?? true;
      
      const files = LogArchiver._findFilesOlderThan(directory, maxAge, pattern);
      
      const results = {
        archived: [],
        failed: [],
        stats: {
          filesProcessed: files.length,
          originalSize: 0,
          compressedSize: 0,
          compressionRatio: 0,
          timeTaken: 0
        }
      };
      
      const startTime = Date.now();
      
      for (const file of files) {
        try {
          const result = await LogArchiver.compressFile(file.path, {
            removeOriginal
          });
          
          results.archived.push(result);
          results.stats.originalSize += result.originalSize;
          results.stats.compressedSize += result.compressedSize;
          
        } catch (error) {
          results.failed.push({
            file: file.path,
            error: error.message
          });
        }
      }
      
      results.stats.timeTaken = Date.now() - startTime;
      
      if (results.stats.originalSize > 0) {
        results.stats.compressionRatio = (1 - results.stats.compressedSize / results.stats.originalSize) * 100;
      }
      
      return results;
      
    } catch (error) {
      throw new LoggingError(
        'ARCHIVE_FAILED',
        `Failed to archive logs in directory ${directory}: ${error.message}`,
        { originalError: error, directory }
      );
    }
  }
  
  /**
   * Compress a single file using gzip
   * 
   * @static
   * @async
   * @param {string} filePath - Path to file to compress
   * @param {Object} [options={}] - Compression options
   * @param {boolean} [options.removeOriginal=true] - Delete original after compression
   * @returns {Promise<Object>} Compression result
   * @throws {LoggingError} If compression fails
   */
  static async compressFile(filePath, options = {}) {
    try {
      LogArchiver._validateFile(filePath);
      
      const removeOriginal = options.removeOriginal ?? true;
      const archivePath = `${filePath}.gz`;
      
      // Check if already compressed
      if (fs.existsSync(archivePath)) {
        throw new LoggingError(
          'ARCHIVE_EXISTS',
          `Archive already exists: ${archivePath}`
        );
      }
      
      // Get original size
      const stats = fs.statSync(filePath);
      const originalSize = stats.size;
      
      // Perform compression
      await LogArchiver._gzipFile(filePath, archivePath);
      
      // Verify compression
      if (!fs.existsSync(archivePath)) {
        throw new LoggingError(
          'COMPRESSION_FAILED',
          'Archive file was not created'
        );
      }
      
      const archiveStats = fs.statSync(archivePath);
      const compressedSize = archiveStats.size;
      
      // Delete original if requested
      if (removeOriginal) {
        try {
          fs.unlinkSync(filePath);
        } catch (error) {
          // Rollback compression if deletion fails
          fs.unlinkSync(archivePath);
          throw new LoggingError(
            'CLEANUP_FAILED',
            `Failed to delete original file: ${error.message}`
          );
        }
      }
      
      return {
        originalFile: filePath,
        archiveFile: archivePath,
        originalSize,
        compressedSize,
        compressionRatio: (1 - compressedSize / originalSize) * 100,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      if (error instanceof LoggingError) {
        throw error;
      }
      throw new LoggingError(
        'COMPRESSION_ERROR',
        `Failed to compress file ${filePath}: ${error.message}`,
        { originalError: error, filePath }
      );
    }
  }
  
  /**
   * Extract/decompress a gzip archive
   * 
   * @static
   * @async
   * @param {string} archivePath - Path to .gz file
   * @param {string} [extractPath] - Path to extract to (default: remove .gz)
   * @returns {Promise<Object>} Extraction result
   * @throws {LoggingError} If extraction fails
   */
  static async extractFile(archivePath, extractPath = null) {
    try {
      LogArchiver._validateFile(archivePath);
      
      if (!archivePath.endsWith('.gz')) {
        throw new LoggingError(
          'INVALID_FORMAT',
          'File must be a .gz archive'
        );
      }
      
      extractPath = extractPath || archivePath.slice(0, -3);
      
      if (fs.existsSync(extractPath)) {
        throw new LoggingError(
          'FILE_EXISTS',
          `Extract destination already exists: ${extractPath}`
        );
      }
      
      await LogArchiver._gunzipFile(archivePath, extractPath);
      
      if (!fs.existsSync(extractPath)) {
        throw new LoggingError(
          'EXTRACTION_FAILED',
          'Extract file was not created'
        );
      }
      
      const originalStats = fs.statSync(archivePath);
      const extractStats = fs.statSync(extractPath);
      
      return {
        archiveFile: archivePath,
        extractedFile: extractPath,
        compressedSize: originalStats.size,
        extractedSize: extractStats.size,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      if (error instanceof LoggingError) {
        throw error;
      }
      throw new LoggingError(
        'EXTRACTION_ERROR',
        `Failed to extract file ${archivePath}: ${error.message}`,
        { originalError: error, archivePath }
      );
    }
  }
  
  /**
   * Verify archive integrity
   * 
   * @static
   * @async
   * @param {string} archivePath - Path to .gz file
   * @returns {Promise<boolean>} Whether archive is valid
   */
  static async verifyArchive(archivePath) {
    try {
      LogArchiver._validateFile(archivePath);
      
      // Try to read first few bytes of gzip header
      const buffer = Buffer.alloc(2);
      const fd = fs.openSync(archivePath, 'r');
      fs.readSync(fd, buffer, 0, 2);
      fs.closeSync(fd);
      
      // Check gzip magic number (1f 8b)
      return buffer[0] === 0x1f && buffer[1] === 0x8b;
      
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Get archive statistics
   * 
   * @static
   * @param {string} directory - Directory to analyze
   * @param {Object} [options={}] - Options
   * @param {string} [options.pattern='*.log*'] - File pattern
   * @returns {Object} Statistics
   */
  static getArchiveStats(directory, options = {}) {
    try {
      LogArchiver._validateDirectory(directory);
      
      const pattern = options.pattern ?? '*.log*';
      const files = LogArchiver._findFiles(directory, pattern);
      
      let totalSize = 0;
      let compressedSize = 0;
      let archiveCount = 0;
      let logCount = 0;
      
      files.forEach(file => {
        const stats = fs.statSync(file.path);
        totalSize += stats.size;
        
        if (file.name.endsWith('.gz')) {
          compressedSize += stats.size;
          archiveCount++;
        } else {
          logCount++;
        }
      });
      
      return {
        totalFiles: files.length,
        logFiles: logCount,
        archiveFiles: archiveCount,
        totalSize,
        compressedSize,
        uncompressedSize: totalSize - compressedSize,
        compressionRatio: totalSize > 0 ? (compressedSize / totalSize) * 100 : 0
      };
      
    } catch (error) {
      throw new LoggingError(
        'STATS_ERROR',
        `Failed to get archive stats: ${error.message}`,
        { originalError: error, directory }
      );
    }
  }
  
  /**
   * Gzip a file
   * @private
   * @static
   * @async
   * @param {string} filePath - Source file
   * @param {string} archivePath - Destination archive
   * @returns {Promise<void>}
   */
  static async _gzipFile(filePath, archivePath) {
    return new Promise((resolve, reject) => {
      const source = fs.createReadStream(filePath);
      const destination = fs.createWriteStream(archivePath);
      const gzip = zlib.createGzip();
      
      source
        .pipe(gzip)
        .pipe(destination)
        .on('error', reject)
        .on('finish', resolve);
      
      source.on('error', reject);
      gzip.on('error', reject);
    });
  }
  
  /**
   * Gunzip a file
   * @private
   * @static
   * @async
   * @param {string} archivePath - Source archive
   * @param {string} filePath - Destination file
   * @returns {Promise<void>}
   */
  static async _gunzipFile(archivePath, filePath) {
    return new Promise((resolve, reject) => {
      const source = fs.createReadStream(archivePath);
      const destination = fs.createWriteStream(filePath);
      const gunzip = zlib.createGunzip();
      
      source
        .pipe(gunzip)
        .pipe(destination)
        .on('error', reject)
        .on('finish', resolve);
      
      source.on('error', reject);
      gunzip.on('error', reject);
    });
  }
  
  /**
   * Validate directory exists
   * @private
   * @static
   * @param {string} directory - Directory path
   * @throws {LoggingError}
   */
  static _validateDirectory(directory) {
    if (!directory || typeof directory !== 'string') {
      throw new LoggingError(
        'INVALID_DIRECTORY',
        'Directory must be a non-empty string',
        { receivedDirectory: directory }
      );
    }
    
    if (!fs.existsSync(directory)) {
      throw new LoggingError(
        'DIRECTORY_NOT_FOUND',
        `Directory not found: ${directory}`
      );
    }
  }
  
  /**
   * Validate file exists
   * @private
   * @static
   * @param {string} filePath - File path
   * @throws {LoggingError}
   */
  static _validateFile(filePath) {
    if (!filePath || typeof filePath !== 'string') {
      throw new LoggingError(
        'INVALID_FILE',
        'File path must be a non-empty string',
        { receivedFilePath: filePath }
      );
    }
    
    if (!fs.existsSync(filePath)) {
      throw new LoggingError(
        'FILE_NOT_FOUND',
        `File not found: ${filePath}`
      );
    }
  }
  
  /**
   * Find files matching pattern
   * @private
   * @static
   * @param {string} directory - Directory to search
   * @param {string} [pattern='*'] - File pattern (supports basic glob)
   * @returns {Array<Object>} Files found
   */
  static _findFiles(directory, pattern = '*') {
    const files = fs.readdirSync(directory);
    const regex = LogArchiver._globToRegex(pattern);
    
    return files
      .filter(f => regex.test(f))
      .map(f => ({
        name: f,
        path: path.join(directory, f)
      }));
  }
  
  /**
   * Find files older than specified age
   * @private
   * @static
   * @param {string} directory - Directory to search
   * @param {number} maxAge - Max age in milliseconds
   * @param {string} [pattern='*'] - File pattern
   * @returns {Array<Object>} Files found
   */
  static _findFilesOlderThan(directory, maxAge, pattern = '*') {
    const files = LogArchiver._findFiles(directory, pattern);
    const now = Date.now();
    
    return files.filter(file => {
      const stats = fs.statSync(file.path);
      const age = now - stats.mtime.getTime();
      return age > maxAge;
    });
  }
  
  /**
   * Convert glob pattern to regex
   * @private
   * @static
   * @param {string} pattern - Glob pattern
   * @returns {RegExp}
   */
  static _globToRegex(pattern) {
    const escapeRegex = (str) => str.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const source = pattern
      .split('*')
      .map(escapeRegex)
      .join('.*');
    return new RegExp(`^${source}$`);
  }
}

export default LogArchiver;

