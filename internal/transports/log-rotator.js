/**
 * @internal
 * This module is for internal/experimental use only and is not part of the public API.
 * It may change or be removed without notice.
 */
/**
 * Log Rotation System
 *
 * Handles automatic log file rotation based on size and date
 */

import fs from 'fs';
import path from 'path';

/**
 * Rotation Strategy
 */
const RotationStrategy = {
  DAILY: 'daily', // Rotate daily
  SIZE: 'size', // Rotate based on file size
  BOTH: 'both', // Rotate based on both conditions
};

/**
 * Log Rotator
 * Manages log file rotation with multiple strategies
 */
class LogRotator {
  /**
   * Create log rotator
   * @param {Object} options - Configuration options
   * @param {number} [options.maxFileSize] - Max file size in bytes (10MB default)
   * @param {number} [options.maxFiles] - Max number of files to keep (5 default)
   * @param {string} [options.strategy] - Rotation strategy (daily, size, both)
   * @param {string} [options.dateFormat] - Date format for rotated files
   */
  constructor(options = {}) {
    this.maxFileSize = options.maxFileSize ?? 10 * 1024 * 1024; // 10MB
    this.maxFiles = options.maxFiles ?? 5;
    this.strategy = options.strategy ?? RotationStrategy.DAILY;
    this.dateFormat = options.dateFormat ?? 'YYYY-MM-DD_HH-mm-ss';
    this.lastRotationDate = new Date();
    this.validateOptions();
  }

  /**
   * Validate options
   * @throws {Error} If options invalid
   */
  validateOptions() {
    if (this.maxFileSize <= 0) {
      throw new Error('maxFileSize must be positive');
    }
    if (this.maxFiles <= 0) {
      throw new Error('maxFiles must be positive');
    }
    if (!Object.values(RotationStrategy).includes(this.strategy)) {
      throw new Error(`Invalid strategy: ${this.strategy}`);
    }
  }

  /**
   * Check if rotation needed
   * @param {string} filePath - Path to log file
   * @returns {boolean} True if rotation needed
   */
  shouldRotate(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        return false;
      }

      const stats = fs.statSync(filePath);
      const now = new Date();

      // Check size-based rotation
      if (this.strategy === RotationStrategy.SIZE || this.strategy === RotationStrategy.BOTH) {
        if (stats.size >= this.maxFileSize) {
          return true;
        }
      }

      // Check daily rotation
      if (this.strategy === RotationStrategy.DAILY || this.strategy === RotationStrategy.BOTH) {
        if (this._isDifferentDay(this.lastRotationDate, now)) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Error checking rotation:', error);
      return false;
    }
  }

  /**
   * Check if dates are different days
   * @param {Date} date1 - First date
   * @param {Date} date2 - Second date
   * @returns {boolean} True if different days
   */
  _isDifferentDay(date1, date2) {
    return date1.toDateString() !== date2.toDateString();
  }

  /**
   * Rotate log file
   * @param {string} filePath - Path to log file
   * @returns {Promise<string>} Path to rotated file
   * @throws {Error} If rotation fails
   */
  async rotate(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        return filePath;
      }

      const dir = path.dirname(filePath);
      const ext = path.extname(filePath);
      const basename = path.basename(filePath, ext);

      // Generate rotated filename with timestamp
      const timestamp = this._getTimestamp();
      const rotatedPath = path.join(dir, `${basename}.${timestamp}${ext}`);

      // Rename current file
      await fs.promises.rename(filePath, rotatedPath);

      // Update last rotation date
      this.lastRotationDate = new Date();

      // Clean old files
      await this._cleanupOldFiles(dir, basename, ext);

      return rotatedPath;
    } catch (error) {
      throw new Error(`Failed to rotate log file: ${error.message}`);
    }
  }

  /**
   * Get timestamp for rotated file
   * @returns {string} Formatted timestamp
   */
  _getTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    return this.dateFormat
      .replace('YYYY', year)
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hours)
      .replace('mm', minutes)
      .replace('ss', seconds);
  }

  /**
   * Cleanup old rotated files
   * @param {string} dir - Directory path
   * @param {string} basename - File basename
   * @param {string} ext - File extension
   * @returns {Promise<void>}
   */
  async _cleanupOldFiles(dir, basename, ext) {
    try {
      const files = await fs.promises.readdir(dir);

      // Find rotated files matching pattern
      const rotatedFiles = files
        .filter((file) => file.startsWith(basename) && file.includes('.') && file.endsWith(ext))
        .filter((file) => file !== `${basename}${ext}`) // Exclude current file
        .map((file) => ({
          name: file,
          path: path.join(dir, file),
          time: this._getFileTime(path.join(dir, file)),
        }))
        .sort((a, b) => b.time - a.time); // Newest first

      // Keep only maxFiles
      if (rotatedFiles.length >= this.maxFiles) {
        const toDelete = rotatedFiles.slice(this.maxFiles);

        for (const file of toDelete) {
          try {
            await fs.promises.unlink(file.path);
          } catch (error) {
            console.error(`Failed to delete old log file ${file.path}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Error cleaning up old files:', error);
    }
  }

  /**
   * Get file modification time
   * @param {string} filePath - File path
   * @returns {number} Modification time in milliseconds
   */
  _getFileTime(filePath) {
    try {
      const stats = fs.statSync(filePath);
      return stats.mtimeMs || stats.mtime.getTime();
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get all rotated files
   * @param {string} filePath - Base log file path
   * @returns {string[]} Array of rotated file paths
   */
  getRotatedFiles(filePath) {
    try {
      const dir = path.dirname(filePath);
      const ext = path.extname(filePath);
      const basename = path.basename(filePath, ext);

      if (!fs.existsSync(dir)) {
        return [];
      }

      const files = fs.readdirSync(dir);

      return files
        .filter((file) => file.startsWith(basename) && file.includes('.') && file.endsWith(ext))
        .filter((file) => file !== `${basename}${ext}`)
        .map((file) => path.join(dir, file))
        .sort()
        .reverse();
    } catch (error) {
      console.error('Error getting rotated files:', error);
      return [];
    }
  }

  /**
   * Get rotation stats
   * @param {string} filePath - Base log file path
   * @returns {Object} Rotation statistics
   */
  getStats(filePath) {
    try {
      const rotatedFiles = this.getRotatedFiles(filePath);
      let totalSize = 0;

      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        totalSize = stats.size;
      }

      for (const file of rotatedFiles) {
        try {
          const stats = fs.statSync(file);
          totalSize += stats.size;
        } catch (e) {
          // Ignore file not found
        }
      }

      return {
        currentFileSize: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0,
        rotatedFilesCount: rotatedFiles.length,
        totalSize: totalSize,
        rotatedFiles: rotatedFiles,
        strategy: this.strategy,
        maxFileSize: this.maxFileSize,
        maxFiles: this.maxFiles,
      };
    } catch (error) {
      console.error('Error getting stats:', error);
      return null;
    }
  }
}

export { LogRotator, RotationStrategy };
