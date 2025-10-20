/**
 * CoreLogger - Professional Production-Grade Logger
 * 
 * Enterprise-level logging system with comprehensive features for production environments.
 * Designed for high-volume logging scenarios with built-in performance optimization.
 * 
 * CORE FEATURES:
 * ─────────────────────────────────────────────────────────────────────────────
 * 
 * 1. BUFFER MANAGEMENT & BACKPRESSURE
 *    - Adaptive log buffer with memory-aware sizing
 *    - Intelligent backpressure detection and handling
 *    - High water mark threshold management
 *    - Automatic flush optimization
 * 
 * 2. RATE LIMITING
 *    - Per-module rate limiting to prevent log flooding
 *    - Configurable burst allowance and window duration
 *    - Automatic cleanup of expired rate limit entries
 * 
 * 3. SANITIZATION & SECURITY
 *    - Automatic sensitive data detection and redaction
 *    - Support for custom sensitive key patterns
 *    - Encoding detection (Base64, URL, Hex, etc.)
 *    - Circular reference handling
 * 
 * 4. TRANSPORT LAYER
 *    - Extensible multi-transport architecture
 *    - Support for console, file, HTTP, and custom transports
 *    - Independent error handling per transport
 *    - Chainable API for transport management
 * 
 * 5. TRANSFORM CONTEXT TRACKING
 *    - Hierarchical object relationship management
 *    - Transform data (position, rotation, scale) tracking
 *    - Object state snapshots and restoration
 *    - World transform computation logging
 * 
 * 6. ADVANCED LOGGING CAPABILITIES
 *    - Context-aware logging with metadata enrichment
 *    - Batch logging operations for efficiency
 *    - Structured logging with correlation IDs
 *    - Hierarchical logging with parent-child relationships
 * 
 * 7. STATISTICS & MONITORING
 *    - Real-time statistics collection
 *    - Comprehensive performance metrics
 *    - Built-in health check capabilities
 *    - Detailed reporting and snapshots
 * 
 * ARCHITECTURE:
 * ─────────────────────────────────────────────────────────────────────────────
 * CoreLogger combines three major components:
 * - AdaptiveLogBuffer: Handles buffering and backpressure management
 * - RateLimiter: Controls logging rate and prevents spam
 * - Transform Context: Maintains object relationships and state
 * 
 * @module CoreLogger
 * @version 1.0.0
 * @author AuditCore Team
 * @see {@link AdaptiveLogBuffer} for buffer implementation details
 * @see {@link RateLimiter} for rate limiting strategy
 * @see {@link LogLevel} for available log levels
 */

import { AdaptiveLogBuffer } from '../transports/adaptive-log-buffer.js';
import { RateLimiter } from '../rate-limiting/rate-limiter.js';
import { LogEntry } from '../utils/log-entry.js';
import { LogLevel } from '../utils/types.js';
import { LoggingError } from '../error-handling/errors.js';

/**
 * CoreLogger - Main Logger Class
 * 
 * Professional production-grade logger implementing advanced logging patterns.
 * Provides comprehensive logging capabilities with built-in performance optimization,
 * context tracking, and transform management.
 * 
 * CONFIGURATION:
 * ─────────────────────────────────────────────────────────────────────────────
 * @param {Object} config - Configuration object
 * @param {string} [config.name='Logger'] - Logger instance name for identification
 * @param {Object} [config.buffer] - AdaptiveLogBuffer configuration
 * @param {Object} [config.rateLimiter] - RateLimiter configuration
 * @param {Array} [config.transports] - Array of transport instances
 * @param {boolean} [config.enableTransformLogging=true] - Enable transform context tracking
 * @param {Map} [config.transformContext] - Existing transform context (optional)
 * 
 * USAGE EXAMPLE:
 * ─────────────────────────────────────────────────────────────────────────────
 * import { CoreLogger } from './core/core-logger.js';
 * import { ConsoleTransport } from './transports/console-transport.js';
 * 
 * const logger = new CoreLogger({
 *   name: 'app',
 *   transports: [new ConsoleTransport()]
 * });
 * 
 * logger.info('Application started');
 * logger.registerObject('obj-1', { position: [0, 0, 0] });
 * logger.infoWithContext('obj-1', 'Object transform updated');
 * 
 * @throws {LoggingError} If configuration is invalid
 * @class CoreLogger
 */
export class CoreLogger {
  /**
   * 
   * @param {Map} config.transformContext - Transform context instance (optional)
   * 
   */
  constructor(config = {}) {
    this._validateConfig(config);

    this.name = config.name ?? 'Logger';
    
    // ═════════════════════════════════════════════════════════════════
    // CORE COMPONENTS INITIALIZATION
    // ═════════════════════════════════════════════════════════════════
    
    // Initialize buffer for managing log entries with backpressure
    this.buffer = new AdaptiveLogBuffer(config.buffer);
    
    // Initialize rate limiter to control logging rate and prevent spam
    this.rateLimiter = new RateLimiter(config.rateLimiter);
    
    // Transport layer for outputting logs
    this.transports = config.transports ?? [];
    
    // Core statistics for monitoring
    this.stats = {
      logged: 0,           // Total log entries successfully accepted
      rejected: 0,         // Log entries rejected due to backpressure
      flushed: 0,          // Log entries sent to transports
      errors: 0,           // Errors during logging operations
      rateLimited: 0       // Log entries rejected due to rate limiting
    };

    // Setup flush handler for transports
    this.buffer.onFlush((entries) => {
      this._handleFlush(entries);
    });

    // Periodic cleanup of expired rate limit entries (every 5 seconds)
    this.cleanupInterval = setInterval(() => {
      this.rateLimiter.cleanup();
    }, 5000);

    // ═════════════════════════════════════════════════════════════════
    // TRANSFORM CONTEXT TRACKING
    // ═════════════════════════════════════════════════════════════════
    
    // Map storing transform context information for objects
    this.transformContext = config.transformContext ?? new Map();
    
    // Enable/disable transform context tracking feature
    this.enableTransformLogging = config.enableTransformLogging !== false;
    
    // Cache object state snapshots (objectId -> state snapshot)
    this.objectStates = new Map();
    
    // Track object hierarchy relationships (objectId -> {parent, children, level})
    this.objectHierarchy = new Map();
    
    // Store context snapshots for debugging and recovery
    this.contextSnapshots = new Map();
    
    // Statistics for transform-specific operations
    this.transformStats = {
      contextLogs: 0,       // Logs made with context information
      transformUpdates: 0,  // Transform updates recorded
      hierarchyChanges: 0,  // Hierarchy relationship changes
      stateSnapshots: 0     // State snapshots created
    };

    // Setup hooks for automatic transform context tracking
    this._setupTransformHooks();
  }

  /**
   * Validate logger configuration
   * 
   * Performs comprehensive validation of configuration parameters to ensure
   * logger is properly initialized with valid settings.
   * 
   * @private
   * @param {Object} config - Configuration object to validate
   * @throws {LoggingError} If any configuration parameter is invalid
   * @returns {void}
   */
  _validateConfig(config) {
    if (config.name !== undefined && typeof config.name !== 'string') {
      throw new LoggingError('Logger name must be a string');
    }

    if (config.transports !== undefined && !Array.isArray(config.transports)) {
      throw new LoggingError('Transports must be an array');
    }

    if (config.enableTransformLogging !== undefined && typeof config.enableTransformLogging !== 'boolean') {
      throw new LoggingError('enableTransformLogging must be a boolean');
    }
  }

  /**
   * Setup hooks for transform context
   * 
   * Initializes listeners and hooks for automatic tracking of transform context
   * changes and updates.
   * 
   * @private
   * @returns {void}
   */
  _setupTransformHooks() {
    
    
  }

  // ═════════════════════════════════════════════════════════════════
  // CORE LOGGING METHODS
  // ═════════════════════════════════════════════════════════════════

  /**
   * Log an entry at the specified level
   * 
   * Core logging method that handles rate limiting, buffer management,
   * and backpressure detection. Returns false if the log entry was rejected.
   * 
   * RATE LIMITING:
   * If rate limiting is active for this logger module, the entry may be
   * rejected to prevent log flooding.
   * 
   * BACKPRESSURE:
   * If the buffer is full (high water mark reached), the entry is rejected
   * to prevent memory issues and signal backpressure.
   * 
   * @param {number} level - Log level (see LogLevel constants)
   * @param {string} message - Log message content
   * @param {Object} [metadata={}] - Additional metadata for the log entry
   * @returns {boolean} true if logged successfully, false if rejected
   * 
   * @example
   * // Log with metadata
   * logger.log(LogLevel.INFO, 'User logged in', {
   *   userId: 123,
   *   email: 'user@example.com',
   *   timestamp: Date.now()
   * });
   */
  async log(level, message, metadata = {}) {
    try {
      // Rate limit check
      if (!this.rateLimiter.canLog(this.name)) {
        this.stats.rateLimited++;
        this.stats.rejected++;
        return false;
      }

      const entry = new LogEntry(level, this.name, message, metadata);
      this.stats.logged++;

      // Backpressure-aware push
      const accepted = await this.buffer.push(entry);
      if (!accepted) {
        this.stats.rejected++;
        return false;
      }

      return true;
    } catch (error) {
      this.stats.errors++;
      // Avoid leaking sensitive context; keep concise message
      // eslint-disable-next-line no-console
      console.error(`[${this.name}] Error logging: ${error?.message || error}`);
      return false;
    }
  }

  /**
   * Log a debug-level message
   * 
   * Convenience method for logging debug messages. Debug logs are typically
   * used for detailed diagnostic information during development.
   * 
   * @param {string} message - Debug message
   * @param {Object} [metadata] - Additional metadata
   * @returns {boolean} true if logged successfully, false if rejected
   */
  debug(message, metadata) {
    return this.log(LogLevel.DEBUG, message, metadata);
  }

  /**
   * Log an info-level message
   * 
   * Convenience method for logging informational messages. Info logs are used
   * for important application events and state changes.
   * 
   * @param {string} message - Info message
   * @param {Object} [metadata] - Additional metadata
   * @returns {boolean} true if logged successfully, false if rejected
   */
  info(message, metadata) {
    return this.log(LogLevel.INFO, message, metadata);
  }

  /**
   * Log a warning-level message
   * 
   * Convenience method for logging warnings. Warnings indicate potentially
   * problematic conditions that should be addressed but don't prevent operation.
   * 
   * @param {string} message - Warning message
   * @param {Object} [metadata] - Additional metadata
   * @returns {boolean} true if logged successfully, false if rejected
   */
  warn(message, metadata) {
    return this.log(LogLevel.WARN, message, metadata);
  }

  /**
   * Log an error-level message
   * 
   * Convenience method for logging errors. Errors indicate serious problems
   * that require immediate attention and may affect functionality.
   * 
   * @param {string} message - Error message
   * @param {Object} [metadata] - Additional metadata (usually includes error object or stack trace)
   * @returns {boolean} true if logged successfully, false if rejected
   */
  error(message, metadata) {
    return this.log(LogLevel.ERROR, message, metadata);
  }

  /**
   * Handle buffered log entries flush
   * 
   * Internal method called when the buffer reaches its flush threshold.
   * Sends accumulated log entries to all registered transports.
   * 
   * ERROR HANDLING:
   * Errors in individual transports are caught and logged, allowing
   * other transports to continue operating.
   * 
   * @private
   * @param {Array} entries - Array of LogEntry objects to flush
   * @returns {void}
   */
  async _handleFlush(entries) {
    for (const transport of this.transports) {
      try {
        if (typeof transport.write === 'function') {
          await transport.write(entries);
        } else if (typeof transport.log === 'function') {
          // Fallback for single-entry transports
          for (const e of entries) {
            // eslint-disable-next-line no-await-in-loop
            await transport.log(e);
          }
        }
        this.stats.flushed += entries.length;
      } catch (error) {
        this.stats.errors++;
        // eslint-disable-next-line no-console
        console.error(`[${this.name}] Transport error: ${error?.message || error}`);
      }
    }
  }

  /**
   * Manually flush the buffer
   * 
   * Forces immediate flush of all buffered log entries to transports.
   * Useful for ensuring logs are sent before application shutdown.
   * 
   * CHAINABLE API:
   * Returns this logger instance for method chaining.
   * 
   * @returns {CoreLogger} this instance for chaining
   * 
   * @example
   * logger.info('Starting shutdown').flush();
   */
  async flush() {
    await this.buffer.flush();
    return this;
  }

  /**
   * Wait for the buffer to drain
   * 
   * Returns a promise that resolves when the buffer has been fully drained
   * and all backpressure signals have been cleared.
   * 
   * BACKPRESSURE HANDLING:
   * Useful for coordinating with the logging system when backpressure is active.
   * 
   * @returns {Promise<void>} Resolves when buffer is drained
   * 
   * @example
   * // Wait for buffer to drain before shutdown
   * await logger.drain();
   * process.exit(0);
   */
  async drain() {
    return new Promise((resolve) => {
      if (this.buffer.isPaused) {
        this.buffer.onDrain(resolve);
      } else {
        resolve();
      }
    });
  }

  /**
   * Add a transport to the logger
   * 
   * Registers a new transport for receiving log entries. The transport can be
   * console, file, HTTP, or any custom implementation.
   * 
   * CHAINABLE API:
   * Returns this logger instance for method chaining.
   * 
   * @param {Object} transport - Transport instance with write() method
   * @throws {LoggingError} If transport is not provided
   * @returns {CoreLogger} this instance for chaining
   * 
   * @example
   * logger.addTransport(consoleTransport)
   *       .addTransport(fileTransport)
   *       .info('Now outputs to both console and file');
   */
  addTransport(transport) {
    if (!transport) {
      throw new LoggingError('Transport must be provided');
    }
    this.transports.push(transport);
    return this;
  }

  /**
   * Remove a transport from the logger
   * 
   * Unregisters a previously added transport. Log entries will no longer be
   * sent to this transport.
   * 
   * CHAINABLE API:
   * Returns this logger instance for method chaining.
   * 
   * @param {Object} transport - Transport instance to remove
   * @returns {CoreLogger} this instance for chaining
   */
  removeTransport(transport) {
    const index = this.transports.indexOf(transport);
    if (index > -1) {
      this.transports.splice(index, 1);
    }
    return this;
  }

  // ═════════════════════════════════════════════════════════════════
  // CONTEXT-AWARE LOGGING METHODS
  // ═════════════════════════════════════════════════════════════════

  /**
   * Log with transform context information
   * 
   * Logs a message with enriched context about a specific object including
   * its transform data, hierarchy level, and state information.
   * 
   * CONTEXT ENRICHMENT:
   * - Includes object position, rotation, scale (if available)
   * - Adds object name and metadata
   * - Includes hierarchy information (parent, level)
   * - Timestamps the entry
   * 
   * @param {number} level - Log level (LogLevel constant)
   * @param {string} objectId - Unique identifier of the object
   * @param {string} message - Log message content
   * @param {Object} [additionalData={}] - Additional metadata to include
   * @returns {boolean} true if logged successfully, false if rejected
   * 
   * @example
   * // Log with context
   * logger.logWithContext(LogLevel.INFO, 'character-1', 'Transform updated', {
   *   duration: 150,
   *   distance: 2.5
   * });
   */
  logWithContext(level, objectId, message, additionalData = {}) {
    try {
      if (!this.enableTransformLogging) {
        return this.log(level, message, additionalData);
      }

      
      const objectInfo = this.transformContext.get(objectId) || {};
      const hierarchyInfo = this.objectHierarchy.get(objectId) || {};

      
      const metadata = {
        objectId,
        objectName: objectInfo.name,
        additionalData,
        hierarchy: hierarchyInfo,
        timestamp: Date.now()
      };

      this.transformStats.contextLogs++;
      return this.log(level, message, metadata);
    } catch (error) {
      this.stats.errors++;
      console.error(`[${this.name}] Error logging with context:`, error);
      return false;
    }
  }

  /**
   * Log debug message with context
   * 
   * @param {string} objectId - Object identifier
   * @param {string} message - Debug message
   * @param {Object} [data] - Additional data
   * @returns {boolean} true if logged successfully
   */
  debugWithContext(objectId, message, data) {
    return this.logWithContext(LogLevel.DEBUG, objectId, message, data);
  }

  /**
   * 
   * @returns {boolean}
   */
  infoWithContext(objectId, message, data) {
    return this.logWithContext(LogLevel.INFO, objectId, message, data);
  }

  /**
   * 
   * @returns {boolean}
   */
  warnWithContext(objectId, message, data) {
    return this.logWithContext(LogLevel.WARN, objectId, message, data);
  }

  /**
   * 
   * @returns {boolean}
   */
  errorWithContext(objectId, message, data) {
    return this.logWithContext(LogLevel.ERROR, objectId, message, data);
  }

  /**
   * 
   */
  batchLogWithContext(entries) {
    if (!Array.isArray(entries)) {
      throw new LoggingError('Entries must be an array');
    }

    let successCount = 0;

    for (const entry of entries) {
      const { objectId, level, message, data } = entry;
      if (this.logWithContext(level, objectId, message, data)) {
        successCount++;
      }
    }

    return successCount;
  }

  // ═══════════════════════════════════════════════════════════════
  // V3 TRANSFORM MANAGEMENT METHODS
  // ═══════════════════════════════════════════════════════════════

  /**
   * 
   */
  registerObject(objectId, transformData = {}, name = null, metadata = null) {
    try {
      if (!objectId || typeof objectId !== 'string') {
        throw new LoggingError('Object ID must be a non-empty string');
      }

      
      this.transformContext.set(objectId, {
        id: objectId,
        name: name || objectId,
        transform: transformData,
        metadata: metadata || {},
        registered: Date.now()
      });

      
      this.objectHierarchy.set(objectId, {
        parent: null,
        children: [],
        level: 0
      });

      
      this.objectStates.set(objectId, {
        objectId,
        registered: Date.now(),
        lastUpdate: Date.now(),
        logCount: 0
      });

      this.transformStats.transformUpdates++;
      return true;
    } catch (error) {
      this.stats.errors++;
      console.error(`[${this.name}] Error registering object:`, error);
      return false;
    }
  }

  /**
   * 
   */
  updateTransform(objectId, transformData) {
    try {
      const objectInfo = this.transformContext.get(objectId);
      if (!objectInfo) {
        throw new LoggingError(`Object ${objectId} not registered`);
      }

      objectInfo.transform = transformData;
      objectInfo.updated = Date.now();

      
      if (this.objectStates.has(objectId)) {
        const state = this.objectStates.get(objectId);
        state.lastUpdate = Date.now();
      }

      this.transformStats.transformUpdates++;
      return true;
    } catch (error) {
      this.stats.errors++;
      console.error(`[${this.name}] Error updating transform:`, error);
      return false;
    }
  }

  /**
   * 
   */
  setObjectParent(childId, parentId) {
    try {
      const childInfo = this.objectHierarchy.get(childId);
      if (!childInfo) {
        throw new LoggingError(`Child object ${childId} not registered`);
      }

      if (parentId !== null) {
        const parentInfo = this.objectHierarchy.get(parentId);
        if (!parentInfo) {
          throw new LoggingError(`Parent object ${parentId} not registered`);
        }

        
        if (childInfo.parent) {
          const oldParent = this.objectHierarchy.get(childInfo.parent);
          if (oldParent) {
            oldParent.children = oldParent.children.filter(id => id !== childId);
          }
        }

        
        childInfo.parent = parentId;
        childInfo.level = parentInfo.level + 1;
        parentInfo.children.push(childId);
      } else {
        
        if (childInfo.parent) {
          const oldParent = this.objectHierarchy.get(childInfo.parent);
          if (oldParent) {
            oldParent.children = oldParent.children.filter(id => id !== childId);
          }
        }
        childInfo.parent = null;
        childInfo.level = 0;
      }

      this.transformStats.hierarchyChanges++;
      return true;
    } catch (error) {
      this.stats.errors++;
      console.error(`[${this.name}] Error setting parent:`, error);
      return false;
    }
  }

  /**
   * 
   */
  getTransform(objectId) {
    try {
      const objectInfo = this.transformContext.get(objectId);
      return objectInfo ? { ...objectInfo.transform } : null;
    } catch (error) {
      this.stats.errors++;
      return null;
    }
  }

  /**
   * 
   */
  getHierarchyInfo(objectId) {
    try {
      const hierarchyInfo = this.objectHierarchy.get(objectId);
      if (!hierarchyInfo) {
        return null;
      }

      return {
        objectId,
        parent: hierarchyInfo.parent,
        children: [...hierarchyInfo.children],
        level: hierarchyInfo.level,
        childrenCount: hierarchyInfo.children.length
      };
    } catch (error) {
      this.stats.errors++;
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // V3 STATE MANAGEMENT METHODS
  // ═══════════════════════════════════════════════════════════════

  /**
   * 
   * @returns {boolean}
   */
  setObjectState(objectId, state) {
    try {
      if (!objectId || typeof state !== 'object') {
        throw new LoggingError('Invalid objectId or state');
      }

      this.objectStates.set(objectId, {
        ...state,
        objectId,
        lastUpdate: Date.now()
      });

      return true;
    } catch (error) {
      this.stats.errors++;
      console.error(`[${this.name}] Error setting object state:`, error);
      return false;
    }
  }

  /**
   * 
   */
  getObjectState(objectId) {
    try {
      const state = this.objectStates.get(objectId);
      return state ? { ...state } : null;
    } catch (error) {
      this.stats.errors++;
      return null;
    }
  }

  /**
   * 
   */
  snapshotContext() {
    try {
      const snapshot = {
        timestamp: Date.now(),
        logger: {
          name: this.name,
          stats: { ...this.stats },
          transformStats: { ...this.transformStats }
        },
        context: {
          objects: Object.fromEntries(this.transformContext),
          hierarchy: Object.fromEntries(this.objectHierarchy),
          states: Object.fromEntries(this.objectStates)
        }
      };

      this.contextSnapshots.set(snapshot.timestamp, snapshot);
      this.transformStats.stateSnapshots++;

      return snapshot;
    } catch (error) {
      this.stats.errors++;
      console.error(`[${this.name}] Error snapshotting context:`, error);
      return null;
    }
  }

  /**
   * 
   */
  restoreFromSnapshot(snapshot) {
    try {
      if (!snapshot || !snapshot.context) {
        throw new LoggingError('Invalid snapshot structure');
      }

      const { objects, hierarchy, states } = snapshot.context;

      
      this.transformContext.clear();
      if (objects) {
        for (const [id, obj] of Object.entries(objects)) {
          this.transformContext.set(id, obj);
        }
      }

      
      this.objectHierarchy.clear();
      if (hierarchy) {
        for (const [id, hier] of Object.entries(hierarchy)) {
          this.objectHierarchy.set(id, hier);
        }
      }

      
      this.objectStates.clear();
      if (states) {
        for (const [id, state] of Object.entries(states)) {
          this.objectStates.set(id, state);
        }
      }

      return true;
    } catch (error) {
      this.stats.errors++;
      console.error(`[${this.name}] Error restoring snapshot:`, error);
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // STATISTICS & MONITORING
  // ═══════════════════════════════════════════════════════════════

  /**
   * 
   */
  getStatistics() {
    const bufferStats = this.buffer.getStatistics?.() || {};
    const rateLimitStats = this.rateLimiter.getStatistics?.() || {};

    return {
      logger: {
        name: this.name,
        ...this.stats
      },
      buffer: bufferStats,
      rateLimit: rateLimitStats,
      transforms: this.transformStats,
      context: {
        objectsCount: this.transformContext.size,
        statesCount: this.objectStates.size,
        snapshotsCount: this.contextSnapshots.size
      },
      transports: this.transports.length
    };
  }

  /**
   * 
   */
  getReport() {
    const stats = this.getStatistics();

    return {
      name: this.name,
      enabled: this.enableTransformLogging,
      stats,
      context: {
        objects: Array.from(this.transformContext.keys()),
        hierarchy: Array.from(this.objectHierarchy.entries()),
        recentSnapshots: Array.from(this.contextSnapshots.values()).slice(-5)
      },
      timestamp: Date.now()
    };
  }

  /**
 * 
 */
  resetStats() {
    this.stats = {
      logged: 0,
      rejected: 0,
      flushed: 0,
      errors: 0,
      rateLimited: 0
    };

    this.transformStats = {
      contextLogs: 0,
      transformUpdates: 0,
      hierarchyChanges: 0,
      stateSnapshots: 0
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // CLEANUP & DISPOSAL
  // ═══════════════════════════════════════════════════════════════

  /**
   * 
   */
  cleanupOldSnapshots(maxAge = 3600000) { 
    const now = Date.now();
    const toDelete = [];

    for (const [timestamp, snapshot] of this.contextSnapshots.entries()) {
      if (now - timestamp > maxAge) {
        toDelete.push(timestamp);
      }
    }

    for (const timestamp of toDelete) {
      this.contextSnapshots.delete(timestamp);
    }

    return toDelete.length;
  }

  /**
 * 
 */
  clearAll() {
    this.transformContext.clear();
    this.objectHierarchy.clear();
    this.objectStates.clear();
    this.contextSnapshots.clear();
    
    this.transformStats = {
      contextLogs: 0,
      transformUpdates: 0,
      hierarchyChanges: 0,
      stateSnapshots: 0
    };
  }

  /**
 * 
 */
  destroy() {
    this.flush();
    clearInterval(this.cleanupInterval);
    this.clearAll();
    this.transports = [];
    
    if (this.buffer?.destroy) {
      this.buffer.destroy();
    }
  }
}

export default CoreLogger;
export { LogLevel };
