/**
 * RotatingFileTransport - File transport with log rotation support
 * 
 * Features:
 * - Size-based rotation (splits file at max size)
 * - Date-based rotation (daily)
 * - Combined rotation (both size and date)
 * - Automatic old file removal (keep max N files)
 * - Asynchronous I/O operations
 * - Error handling and recovery
 * 
 * @author audit-core
 * @version 1.0.0
 */

import { BaseTransport } from './base-transport.js';
import { LoggingError } from '../error-handling/errors.js';
import fs from 'fs';
import path from 'path';

class RotatingFileTransport extends BaseTransport {
  /**
   * Initialize rotating file transport
   * 
   * @param {Object} options - Configuration options
   * @param {string} options.filePath - Path to log file
   * @param {number} [options.maxFileSize=10485760] - Max file size in bytes (default: 10MB)
   * @param {number} [options.maxFiles=5] - Maximum number of rotated files to keep
   * @param {string} [options.rotationStrategy='both'] - 'size' | 'daily' | 'both'
   * @param {string} [options.dateFormat='YYYY-MM-DD'] - Date format for rotation names
   * @param {boolean} [options.compress=false] - Auto-compress rotated files
   * @throws {LoggingError} If configuration is invalid
   */
  constructor(options = {}) {
    super();
    
    this._validateOptions(options);
    
    this.filePath = options.filePath;
    this.maxFileSize = options.maxFileSize ?? 10 * 1024 * 1024; // 10MB
    this.maxFiles = options.maxFiles ?? 5;
    this.rotationStrategy = options.rotationStrategy ?? 'both'; // 'size' | 'daily' | 'both'
    this.dateFormat = options.dateFormat ?? 'YYYY-MM-DD';
    this.compress = options.compress ?? false;
    
    // Track current file state
    this._currentDate = this._getCurrentDateString();
    this._fileCheckInterval = null;
    this._initialized = false;
    this._pendingWrites = [];
    this._isRotating = false;
  }
  
  /**
   * Validate options
   * @private
   * @param {Object} options - Options to validate
   * @throws {LoggingError} If options are invalid
   */
  _validateOptions(options) {
    if (!options.filePath || typeof options.filePath !== 'string') {
      throw new LoggingError(
        'INVALID_CONFIG',
        'filePath must be a non-empty string',
        { receivedFilePath: options.filePath }
      );
    }
    
    if (options.maxFileSize && (typeof options.maxFileSize !== 'number' || options.maxFileSize <= 0)) {
      throw new LoggingError(
        'INVALID_CONFIG',
        'maxFileSize must be a positive number',
        { receivedMaxFileSize: options.maxFileSize }
      );
    }
    
    if (options.maxFiles && (typeof options.maxFiles !== 'number' || options.maxFiles < 1)) {
      throw new LoggingError(
        'INVALID_CONFIG',
        'maxFiles must be a positive number >= 1',
        { receivedMaxFiles: options.maxFiles }
      );
    }
    
    const validStrategies = ['size', 'daily', 'both'];
    if (options.rotationStrategy && !validStrategies.includes(options.rotationStrategy)) {
      throw new LoggingError(
        'INVALID_CONFIG',
        `rotationStrategy must be one of: ${validStrategies.join(', ')}`,
        { receivedStrategy: options.rotationStrategy }
      );
    }
  }
  
  /**
   * Initialize transport
   * @async
   * @returns {Promise<void>}
   * @throws {LoggingError} If initialization fails
   */
  async initialize() {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Check current file size and rotate if needed
      if (fs.existsSync(this.filePath)) {
        await this._checkAndRotateIfNeeded();
      }
      
      this._initialized = true;
    } catch (error) {
      throw new LoggingError(
        'INIT_FAILED',
        `Failed to initialize RotatingFileTransport: ${error.message}`,
        { originalError: error, filePath: this.filePath }
      );
    }
  }
  
  /**
   * Log entry to file
   * @async
   * @param {LogEntry|LogEntry[]} entries - Log entry or array of entries
   * @throws {LoggingError} If logging fails
   */
  async log(entries) {
    try {
      if (!this._initialized) {
        await this.initialize();
      }
      
      if (!Array.isArray(entries)) {
        entries = [entries];
      }
      
      // Check if rotation needed before writing
      await this._checkAndRotateIfNeeded();
      
      // Format and write entries
      const content = entries
        .map(entry => entry.toString())
        .join('\n') + '\n';
      
      await this._writeToFile(content);
      
      // Check again after writing (in case this write triggered size limit)
      await this._checkAndRotateIfNeeded();
      
    } catch (error) {
      if (error instanceof LoggingError) {
        throw error;
      }
      throw new LoggingError(
        'LOG_FAILED',
        `Failed to log entry: ${error.message}`,
        { originalError: error }
      );
    }
  }
  
  /**
   * Check if rotation is needed and perform if necessary
   * @private
   * @async
   * @returns {Promise<void>}
   */
  async _checkAndRotateIfNeeded() {
    if (this._isRotating) return;
    
    if (!fs.existsSync(this.filePath)) {
      return; // File doesn't exist yet, no rotation needed
    }
    
    const shouldRotate = await this._shouldRotate();
    if (shouldRotate) {
      this._isRotating = true;
      try {
        await this._rotate();
      } finally {
        this._isRotating = false;
      }
    }
  }
  
  /**
   * Determine if rotation should occur
   * @private
   * @async
   * @returns {Promise<boolean>}
   */
  async _shouldRotate() {
    // Size-based rotation
    if (['size', 'both'].includes(this.rotationStrategy)) {
      const stats = fs.statSync(this.filePath);
      if (stats.size >= this.maxFileSize) {
        return true;
      }
    }
    
    // Date-based rotation
    if (['daily', 'both'].includes(this.rotationStrategy)) {
      const currentDate = this._getCurrentDateString();
      if (currentDate !== this._currentDate) {
        this._currentDate = currentDate;
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Rotate the current log file
   * @private
   * @async
   * @returns {Promise<void>}
   */
  async _rotate() {
    try {
      if (!fs.existsSync(this.filePath)) {
        return;
      }
      
      // Create rotation filename with timestamp
      const timestamp = this._getTimestamp();
      const ext = path.extname(this.filePath);
      const basename = path.basename(this.filePath, ext);
      const dirname = path.dirname(this.filePath);
      const rotatedPath = path.join(dirname, `${basename}.${timestamp}${ext}`);
      
      // Rename current file to rotated name
      await this._renameFile(this.filePath, rotatedPath);
      
      // Clean up old files (keep only maxFiles)
      await this._cleanupOldFiles(dirname, basename, ext);
      
    } catch (error) {
      throw new LoggingError(
        'ROTATION_FAILED',
        `Failed to rotate log file: ${error.message}`,
        { originalError: error, filePath: this.filePath }
      );
    }
  }
  
  /**
   * Cleanup old log files
   * @private
   * @async
   * @param {string} dirname - Directory path
   * @param {string} basename - File basename
   * @param {string} ext - File extension
   * @returns {Promise<void>}
   */
  async _cleanupOldFiles(dirname, basename, ext) {
    try {
      if (!fs.existsSync(dirname)) {
        return;
      }
      
      const files = fs.readdirSync(dirname);
      
      // Filter for rotated files with same basename
      const rotatedFiles = files
        .filter(f => {
          const pattern = new RegExp(`^${basename}\\.\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}${ext}$`);
          return pattern.test(f);
        })
        .map(f => ({
          name: f,
          path: path.join(dirname, f),
          mtime: fs.statSync(path.join(dirname, f)).mtime
        }))
        .sort((a, b) => b.mtime - a.mtime); // Sort newest first
      
      // Delete files beyond maxFiles limit
      for (let i = this.maxFiles - 1; i < rotatedFiles.length; i++) {
        const filePath = rotatedFiles[i].path;
        try {
          fs.unlinkSync(filePath);
        } catch (error) {
          // Log but don't throw - cleanup failure shouldn't block logging
          console.warn(`Failed to delete old log file: ${filePath}`, error);
        }
      }
      
    } catch (error) {
      // Log but don't throw - cleanup failure shouldn't block logging
      console.warn(`Failed to cleanup old log files: ${error.message}`);
    }
  }
  
  /**
   * Write content to file
   * @private
   * @async
   * @param {string} content - Content to write
   * @returns {Promise<void>}
   */
  async _writeToFile(content) {
    try {
      await fs.promises.appendFile(this.filePath, content);
    } catch (error) {
      throw new LoggingError(
        'WRITE_FAILED',
        `Failed to write to log file: ${error.message}`,
        { originalError: error, filePath: this.filePath }
      );
    }
  }
  
  /**
   * Rename file
   * @private
   * @async
   * @param {string} oldPath - Old file path
   * @param {string} newPath - New file path
   * @returns {Promise<void>}
   */
  async _renameFile(oldPath, newPath) {
    try {
      await fs.promises.rename(oldPath, newPath);
    } catch (error) {
      throw new LoggingError(
        'RENAME_FAILED',
        `Failed to rename log file: ${error.message}`,
        { originalError: error, oldPath, newPath }
      );
    }
  }
  
  /**
   * Get current date string for rotation
   * @private
   * @returns {string}
   */
  _getCurrentDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  /**
   * Get timestamp for rotation filename
   * @private
   * @returns {string} ISO timestamp
   */
  _getTimestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  }
  
  /**
   * Get transport information
   * @returns {Object} Transport info
   */
  getInfo() {
    return {
      type: 'rotating-file',
      filePath: this.filePath,
      maxFileSize: this.maxFileSize,
      maxFiles: this.maxFiles,
      rotationStrategy: this.rotationStrategy,
      compress: this.compress,
      initialized: this._initialized
    };
  }
  
  /**
   * Shutdown transport
   * @async
   * @returns {Promise<void>}
   */
  async shutdown() {
    this._initialized = false;
  }
}

export default RotatingFileTransport;

