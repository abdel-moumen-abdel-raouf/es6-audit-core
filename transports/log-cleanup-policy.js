/**
 * LogCleanupPolicy - Automatic deletion of old and oversized log files
 * 
 * Features:
 * - Delete files older than specified age
 * - Delete when total directory size exceeds limit
 * - Priority-based cleanup (oldest first or largest first)
 * - Scheduled automatic cleanup
 * - Size calculation and reporting
 * 
 * @author audit-core
 * @version 1.0.0
 */

import { LoggingError } from '../error-handling/errors.js';
import fs from 'fs';
import path from 'path';

class LogCleanupPolicy {
  /**
   * Initialize cleanup policy
   * 
   * @param {Object} [options={}] - Configuration options
   * @param {number} [options.maxAge=7776000000] - Max age in ms (default: 90 days)
   * @param {number} [options.maxTotalSize=1073741824] - Max total size in bytes (default: 1GB)
   * @param {number} [options.checkInterval=86400000] - Check interval in ms (default: 24 hours)
   * @param {string} [options.priority='age'] - Cleanup priority: 'age' | 'size'
   * @param {boolean} [options.autoStart=false] - Auto-start cleanup scheduler
   * @param {string} [options.pattern='*.log*'] - File pattern to match
   * @throws {LoggingError} If configuration is invalid
   */
  constructor(options = {}) {
    this._validateOptions(options);
    
    this.maxAge = options.maxAge ?? 90 * 24 * 60 * 60 * 1000; // 90 days
    this.maxTotalSize = options.maxTotalSize ?? 1024 * 1024 * 1024; // 1GB
    this.checkInterval = options.checkInterval ?? 24 * 60 * 60 * 1000; // 24 hours
    this.priority = options.priority ?? 'age'; // 'age' | 'size'
    this.pattern = options.pattern ?? '*.log*';
    
    this._checkTimer = null;
    this._isRunning = false;
    this._lastCheckTime = null;
  }
  
  /**
   * Validate options
   * @private
   * @param {Object} options - Options to validate
   * @throws {LoggingError}
   */
  _validateOptions(options) {
    if (options.maxAge && (typeof options.maxAge !== 'number' || options.maxAge <= 0)) {
      throw new LoggingError(
        'INVALID_CONFIG',
        'maxAge must be a positive number',
        { receivedMaxAge: options.maxAge }
      );
    }
    
    if (options.maxTotalSize && (typeof options.maxTotalSize !== 'number' || options.maxTotalSize <= 0)) {
      throw new LoggingError(
        'INVALID_CONFIG',
        'maxTotalSize must be a positive number',
        { receivedMaxTotalSize: options.maxTotalSize }
      );
    }
    
    if (options.checkInterval && (typeof options.checkInterval !== 'number' || options.checkInterval <= 0)) {
      throw new LoggingError(
        'INVALID_CONFIG',
        'checkInterval must be a positive number',
        { receivedCheckInterval: options.checkInterval }
      );
    }
    
    const validPriorities = ['age', 'size'];
    if (options.priority && !validPriorities.includes(options.priority)) {
      throw new LoggingError(
        'INVALID_CONFIG',
        `priority must be one of: ${validPriorities.join(', ')}`,
        { receivedPriority: options.priority }
      );
    }
  }
  
  /**
   * Perform cleanup in a directory
   * 
   * @async
   * @param {string} directory - Directory to clean
   * @param {Object} [overrides={}] - Override options for this cleanup
   * @returns {Promise<Object>} Cleanup result with statistics
   * @throws {LoggingError} If cleanup fails
   */
  async cleanup(directory, overrides = {}) {
    try {
      this._validateDirectory(directory);
      
      const maxAge = overrides.maxAge ?? this.maxAge;
      const maxTotalSize = overrides.maxTotalSize ?? this.maxTotalSize;
      const priority = overrides.priority ?? this.priority;
      
      const result = {
        directory,
        deletedFiles: [],
        failedDeletions: [],
        stats: {
          originalSize: 0,
          deletedSize: 0,
          remainingSize: 0,
          filesDeleted: 0,
          filesRemaining: 0,
          timeTaken: 0
        }
      };
      
      const startTime = Date.now();
      
      // Get current directory stats
      const files = this._findFiles(directory);
      result.stats.filesRemaining = files.length;
      
      for (const file of files) {
        const stats = fs.statSync(file.path);
        result.stats.originalSize += stats.size;
      }
      
      // Check if cleanup is needed
      const shouldCleanup = await this._shouldCleanup(directory, maxAge, maxTotalSize);
      
      if (!shouldCleanup) {
        result.stats.remainingSize = result.stats.originalSize;
        result.stats.timeTaken = Date.now() - startTime;
        return result;
      }
      
      // Determine files to delete
      const filesToDelete = this._selectFilesToDelete(files, maxAge, maxTotalSize, priority);
      
      // Delete files
      for (const file of filesToDelete) {
        try {
          fs.unlinkSync(file.path);
          result.deletedFiles.push({
            file: file.path,
            size: file.stats.size,
            age: Date.now() - file.stats.mtime.getTime()
          });
          result.stats.deletedSize += file.stats.size;
          result.stats.filesDeleted++;
          result.stats.filesRemaining--;
          
        } catch (error) {
          result.failedDeletions.push({
            file: file.path,
            error: error.message
          });
        }
      }
      
      result.stats.remainingSize = result.stats.originalSize - result.stats.deletedSize;
      result.stats.timeTaken = Date.now() - startTime;
      
      this._lastCheckTime = Date.now();
      
      return result;
      
    } catch (error) {
      throw new LoggingError(
        'CLEANUP_FAILED',
        `Failed to cleanup directory ${directory}: ${error.message}`,
        { originalError: error, directory }
      );
    }
  }
  
  /**
   * Start automatic cleanup scheduler
   * 
   * @async
   * @param {string} directory - Directory to monitor
   * @param {Function} [onCleanup] - Callback on cleanup completion
   * @returns {Promise<void>}
   */
  async start(directory, onCleanup = null) {
    if (this._isRunning) {
      throw new LoggingError(
        'ALREADY_RUNNING',
        'Cleanup scheduler is already running'
      );
    }
    
    this._validateDirectory(directory);
    this._isRunning = true;
    
    // Perform initial cleanup
    try {
      await this.cleanup(directory);
    } catch (error) {
      console.warn('Initial cleanup failed:', error.message);
    }
    
    // Start scheduler
    this._checkTimer = setInterval(async () => {
      try {
        const result = await this.cleanup(directory);
        if (onCleanup) {
          onCleanup(result);
        }
      } catch (error) {
        console.warn('Scheduled cleanup failed:', error.message);
      }
    }, this.checkInterval);
  }
  
  /**
   * Stop automatic cleanup scheduler
   */
  stop() {
    if (this._checkTimer) {
      clearInterval(this._checkTimer);
      this._checkTimer = null;
    }
    this._isRunning = false;
  }
  
  /**
   * Check if cleanup should be performed
   * @private
   * @async
   * @param {string} directory - Directory to check
   * @param {number} maxAge - Max age threshold
   * @param {number} maxTotalSize - Max total size threshold
   * @returns {Promise<boolean>}
   */
  async _shouldCleanup(directory, maxAge, maxTotalSize) {
    const files = this._findFiles(directory);
    const now = Date.now();
    let totalSize = 0;
    
    // Check if any file exceeds age
    for (const file of files) {
      const stats = fs.statSync(file.path);
      totalSize += stats.size;
      const age = now - stats.mtime.getTime();
      
      if (age > maxAge) {
        return true; // Has old files to delete
      }
    }
    
    // Check if total size exceeds limit
    if (totalSize > maxTotalSize) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Select files to delete based on priority
   * @private
   * @param {Array<Object>} files - Files to consider
   * @param {number} maxAge - Max age threshold
   * @param {number} maxTotalSize - Max total size threshold
   * @param {string} priority - 'age' or 'size'
   * @returns {Array<Object>} Files to delete
   */
  _selectFilesToDelete(files, maxAge, maxTotalSize, priority) {
    const now = Date.now();
    const filesToDelete = [];
    
    // First, always delete files exceeding age
    for (const file of files) {
      const age = now - file.stats.mtime.getTime();
      if (age > maxAge) {
        filesToDelete.push(file);
      }
    }
    
    // Check if we need to delete more based on size
    let totalSize = files.reduce((sum, f) => sum + f.stats.size, 0);
    const deleteSize = totalSize - maxTotalSize;
    
    if (deleteSize > 0) {
      // Sort files by priority
      const remainingFiles = files.filter(f => !filesToDelete.includes(f));
      
      if (priority === 'age') {
        // Sort by age (oldest first)
        remainingFiles.sort((a, b) => a.stats.mtime - b.stats.mtime);
      } else if (priority === 'size') {
        // Sort by size (largest first)
        remainingFiles.sort((a, b) => b.stats.size - a.stats.size);
      }
      
      // Delete files until size limit is met
      let currentDeleteSize = 0;
      for (const file of remainingFiles) {
        if (currentDeleteSize >= deleteSize) {
          break;
        }
        filesToDelete.push(file);
        currentDeleteSize += file.stats.size;
      }
    }
    
    return filesToDelete;
  }
  
  /**
   * Find files matching pattern
   * @private
   * @param {string} directory - Directory to search
   * @returns {Array<Object>} Files with stats
   */
  _findFiles(directory) {
    if (!fs.existsSync(directory)) {
      return [];
    }
    
    const files = fs.readdirSync(directory);
    const regex = this._globToRegex(this.pattern);
    
    return files
      .filter(f => regex.test(f))
      .map(f => {
        const filePath = path.join(directory, f);
        return {
          name: f,
          path: filePath,
          stats: fs.statSync(filePath)
        };
      });
  }
  
  /**
   * Get directory statistics
   * @async
   * @param {string} directory - Directory to analyze
   * @returns {Promise<Object>} Directory stats
   */
  async getDirectoryStats(directory) {
    try {
      this._validateDirectory(directory);
      
      const files = this._findFiles(directory);
      const now = Date.now();
      
      let totalSize = 0;
      let fileCount = 0;
      let oldestFile = null;
      let largestFile = null;
      
      for (const file of files) {
        totalSize += file.stats.size;
        fileCount++;
        
        const age = now - file.stats.mtime.getTime();
        if (!oldestFile || age > (now - oldestFile.stats.mtime.getTime())) {
          oldestFile = file;
        }
        
        if (!largestFile || file.stats.size > largestFile.stats.size) {
          largestFile = file;
        }
      }
      
      return {
        directory,
        fileCount,
        totalSize,
        averageFileSize: fileCount > 0 ? totalSize / fileCount : 0,
        oldestFile: oldestFile ? {
          name: oldestFile.name,
          age: now - oldestFile.stats.mtime.getTime(),
          size: oldestFile.stats.size
        } : null,
        largestFile: largestFile ? {
          name: largestFile.name,
          size: largestFile.stats.size
        } : null,
        needsCleanup: await this._shouldCleanup(directory, this.maxAge, this.maxTotalSize)
      };
      
    } catch (error) {
      throw new LoggingError(
        'STATS_ERROR',
        `Failed to get directory stats: ${error.message}`,
        { originalError: error, directory }
      );
    }
  }
  
  /**
   * Validate directory exists
   * @private
   * @param {string} directory - Directory path
   * @throws {LoggingError}
   */
  _validateDirectory(directory) {
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
   * Convert glob pattern to regex
   * @private
   * @param {string} pattern - Glob pattern
   * @returns {RegExp}
   */
  _globToRegex(pattern) {
    const escapeRegex = (str) => str.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const source = pattern
      .split('*')
      .map(escapeRegex)
      .join('.*');
    return new RegExp(`^${source}$`);
  }
  
  /**
   * Get policy information
   * @returns {Object}
   */
  getInfo() {
    return {
      maxAge: this.maxAge,
      maxTotalSize: this.maxTotalSize,
      checkInterval: this.checkInterval,
      priority: this.priority,
      pattern: this.pattern,
      isRunning: this._isRunning,
      lastCheckTime: this._lastCheckTime
    };
  }
}

export default LogCleanupPolicy;

