import { BaseTransport } from './base-transport.js';
import { LoggingError } from '../error-handling/errors.js';
import fs from 'fs';
import path from 'path';
import { once } from 'events';

const __isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

/**
 * Transport that writes log entries to daily rotating files.
 * Optimized with:
 * - Async I/O operations (fs.promises)
 * - Stream-based writing for better performance
 * - Write queue for batch processing
 * - Efficient file handle management
 */
class FileTransportImpl extends BaseTransport {
  /**
   * Creates a new FileTransport instance.
   * @param config - Configuration for file transport.
   * @throws {LoggingError} When configuration is invalid.
   */
  constructor(config) {
    super();
    if (!config.logDirectory || typeof config.logDirectory !== 'string') {
      throw new LoggingError('logDirectory must be a non-empty string');
    }
    this.logDirectory = config.logDirectory;

    // Stream-based optimization
    this._fileStreams = new Map(); // Cache open streams by file path
    this._writeQueue = []; // Queue for batch writes
    this._isProcessing = false;
    this._maxQueueSize = config.maxQueueSize ?? 50; // Batch process after 50 entries
    this._flushInterval = config.flushInterval ?? 1000; // Flush queue every 1 second
    this._flushTimer = null;
  }

  /**
   * Initialize transport (start flush timer)
   */
  async initialize() {
    if (!this._flushTimer) {
      this._flushTimer = setInterval(() => {
        this._processWriteQueue();
      }, this._flushInterval);
    }
  }

  /**
   * Writes a log entry to the appropriate daily log file.
   * @param entry - The log entry to write.
   */
  async log(entry) {
    try {
      // FileTransport relies on Node's fs/path. Guard so the module
      // can be imported in browser environments without trying to
      // resolve Node built-ins at module-parse time.
      if (typeof process === 'undefined' || !process.versions || !process.versions.node) {
        // Not running in Node — file transport not available in browser.
        this.handleError(
          new LoggingError('FileTransport is not supported in non-Node environments'),
          entry
        );
        return;
      }

      await this.initialize();

      // Add to write queue instead of writing immediately
      const filePath = await this.getLogFilePath(entry.moduleName);
      const logLine = entry.toString() + '\n';

      this._writeQueue.push({ filePath, logLine });

      // Auto-flush if queue is full
      if (this._writeQueue.length >= this._maxQueueSize) {
        await this._processWriteQueue();
      }
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error(String(error)), entry);
    }
  }

  /**
   * Batch write for compatibility with batched flushes
   */
  async write(entries) {
    try {
      if (!Array.isArray(entries) || entries.length === 0) return;
      await this.initialize();
      for (const entry of entries) {
        const filePath = await this.getLogFilePath(entry.moduleName);
        const logLine = entry.toString() + '\n';
        this._writeQueue.push({ filePath, logLine });
      }
      if (this._writeQueue.length >= this._maxQueueSize) {
        await this._processWriteQueue();
      }
    } catch (error) {
      // Log one representative error
      const err = error instanceof Error ? error : new Error(String(error));
      this.handleError(err);
    }
  }

  /**
   * Process write queue with batch operations
   * @private
   */
  async _processWriteQueue() {
    if (this._isProcessing || this._writeQueue.length === 0) {
      return;
    }

    this._isProcessing = true;
    try {
      // Group writes by file path for efficiency
      const groupedWrites = new Map();

      for (const { filePath, logLine } of this._writeQueue) {
        if (!groupedWrites.has(filePath)) {
          groupedWrites.set(filePath, []);
        }
        groupedWrites.get(filePath).push(logLine);
      }

      // Write grouped entries to their respective files using streams
      for (const [filePath, lines] of groupedWrites) {
        const content = lines.join('');
        try {
          const stream = await this._getStream(filePath);
          if (!stream.write(content, 'utf8')) {
            // Backpressure: wait for drain
            await once(stream, 'drain');
          }
        } catch (error) {
          console.warn(`Failed to write to ${filePath}:`, error.message);
        }
      }

      this._writeQueue = [];
    } finally {
      this._isProcessing = false;
    }
  }

  /**
   * Determines and ensures the existence of the log file path for a given module.
   * @param moduleName - The name of the module generating the log.
   * @returns The full path to the log file.
   * @throws {LoggingError} When file system operations fail.
   */
  async getLogFilePath(moduleName) {
    try {
      // Ensure we are running in Node before using fs/path
      if (typeof process === 'undefined' || !process.versions || !process.versions.node) {
        throw new LoggingError('FileTransport.getLogFilePath called in non-Node environment');
      }

      // Sanitize module name for filesystem safety
      const sanitizedModuleName = moduleName.replace(/[^a-zA-Z0-9-_]/g, '_');
      const moduleLogDir = path.join(this.logDirectory, sanitizedModuleName);

      // Ensure directory exists (non-blocking)
      try {
        await fs.promises.mkdir(moduleLogDir, { recursive: true });
      } catch (error) {
        if (error.code !== 'EEXIST') {
          throw error;
        }
      }

      // Create filename based on current date
      const date = new Date();
      const dateString = date.toISOString().split('T')[0]; // YYYY-MM-DD
      const fileName = `${dateString}.log`;
      return path.join(moduleLogDir, fileName);
    } catch (error) {
      throw new LoggingError(
        `Failed to create log file path for module "${moduleName}"`,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Get or create a persistent write stream for a file path
   * @private
   */
  async _getStream(filePath) {
    let stream = this._fileStreams.get(filePath);
    if (stream && !stream.destroyed) return stream;

    // Ensure directory exists
    const dir = path.dirname(filePath);
    try {
      await fs.promises.mkdir(dir, { recursive: true });
    } catch (e) {
      // ignore EEXIST
    }

    stream = fs.createWriteStream(filePath, { flags: 'a', encoding: 'utf8' });
    stream.on('error', (err) => {
      console.warn('File stream error:', err.message);
      try {
        stream.destroy();
      } catch {}
      this._fileStreams.delete(filePath);
    });
    this._fileStreams.set(filePath, stream);
    return stream;
  }

  /**
   * Shutdown transport (flush queue and close streams)
   */
  async shutdown() {
    // Final flush
    await this._processWriteQueue();

    // Clear timer
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }

    // Close all streams
    for (const stream of this._fileStreams.values()) {
      try {
        stream.destroy();
      } catch (error) {
        console.warn('Error closing stream:', error.message);
      }
    }
    this._fileStreams.clear();
  }
}

// Export a browser-safe stub when not running in Node.
class FileTransportStub {
  constructor() {
    // No-op stub: silently ignore file transport operations in browsers.
    this.logDirectory = null;
  }
  async log(entry) {
    // noop in browsers
    return;
  }
  async getLogFilePath(moduleName) {
    // return a dummy path-like string; should never be used in browsers
    return `/dev/null/${moduleName}.log`;
  }
}

export const FileTransport = __isNode ? FileTransportImpl : FileTransportStub;
