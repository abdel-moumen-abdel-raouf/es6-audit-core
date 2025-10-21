/**
 * Contextual Log Entry with Full Error Context
 *
 * Combines standard logging with comprehensive error context:
 * - Stack traces
 * - Correlation IDs
 * - Request information
 * - System metadata
 */

import { ErrorContext, StackTraceExtractor } from '../utils/stack-trace.js';
import { LogContext } from '../context/log-context.js';
import { RequestContextStorage } from '../context/request-context.js';
import { LogEntry } from '../utils/log-entry.js';
import os from 'os';

/**
 * Contextual Log Entry with Full Context
 */
class ContextualLogEntry extends LogEntry {
  constructor(level, message, context = {}, moduleName = 'unknown') {
    // Call parent constructor with correct parameter order
    // LogEntry(level, moduleName, message, context)
    super(level, moduleName, message, context);

    // Add enhanced context
    this.correlationId = LogContext.getCorrelationId();
    this.errorContext = null;
    this.requestContext = RequestContextStorage.getCurrent();
    this.systemInfo = {
      hostname: os.hostname(),
      pid: process.pid,
      platform: process.platform,
      nodeVersion: process.version,
    };

    // Capture error context if applicable
    if (level <= 1) {
      // ERROR level or higher priority
      if (context.error instanceof Error) {
        this.errorContext = new ErrorContext(context.error, message);
      } else if (context instanceof Error) {
        this.errorContext = new ErrorContext(context, message);
      } else {
        // Capture source location
        this.errorContext = {
          location: StackTraceExtractor.getSourceLocation(2),
          timestamp: new Date().toISOString(),
        };
      }
    }

    // Ensure context is plain object
    if (typeof this.context === 'object' && this.context !== null) {
      this.context = {
        ...this.context,
        correlationId: this.correlationId,
        requestId: this.requestContext?.id,
        userId: this.requestContext?.userId,
      };
    }
  }

  /**
   * Get correlation chain ID
   * @returns {string|null} Correlation ID for tracking
   */
  getCorrelationId() {
    return this.correlationId;
  }

  /**
   * Get request information
   * @returns {object|null} Request context or null
   */
  getRequestInfo() {
    return this.requestContext ? this.requestContext.getSummary() : null;
  }

  /**
   * Get full error information
   * @returns {object|null} Error context or null
   */
  getErrorInfo() {
    return this.errorContext
      ? {
          message: this.errorContext.message || this.message,
          name: this.errorContext.name,
          code: this.errorContext.code,
          location: this.errorContext.location,
          stack: this.errorContext.stack?.slice(0, 5).map((f) => f.toString()) || [],
          timestamp: this.errorContext.timestamp,
        }
      : null;
  }

  /**
   * Get complete context
   * @returns {object} Full context object
   */
  getFullContext() {
    return {
      ...this.context,
      correlationId: this.correlationId,
      request: this.getRequestInfo(),
      error: this.getErrorInfo(),
      system: this.systemInfo,
      timestamp: this.timestamp,
    };
  }

  /**
   * Format as JSON
   * @returns {object} JSON representation
   */
  toJSON() {
    return {
      timestamp: this.timestamp,
      level: this.level,
      levelName: this.constructor.getLevelName(this.level),
      module: this.moduleName,
      message: this.message,
      correlationId: this.correlationId,
      context: this.context,
      request: this.getRequestInfo(),
      error: this.getErrorInfo(),
      system: this.systemInfo,
    };
  }

  /**
   * Format as readable string
   * @returns {string} Formatted string
   */
  toString() {
    let output = super.toString();

    // Add correlation ID
    if (this.correlationId) {
      output += `\n  Correlation ID: ${this.correlationId}`;
    }

    // Add request info
    if (this.requestContext) {
      output += `\n  Request: ${this.requestContext.toString()}`;
      if (this.requestContext.userId) {
        output += `\n  User: ${this.requestContext.userId}`;
      }
    }

    // Add error context
    if (this.errorContext) {
      if (this.errorContext.stack) {
        output += `\n  Stack Trace:\n${this.errorContext.getFormattedStack(3)}`;
      } else if (this.errorContext.location) {
        output += `\n  Location: ${this.errorContext.location.fileName}:${this.errorContext.location.lineNumber}`;
      }
    }

    // Add system info
    output += `\n  System: ${this.systemInfo.hostname} (PID: ${this.systemInfo.pid})`;

    return output;
  }

  /**
   * Format as compact string
   * @returns {string} Compact format
   */
  toCompactString() {
    let parts = [];

    // Timestamp
    parts.push(`[${this.timestamp}]`);

    // Correlation ID (short)
    if (this.correlationId) {
      const shortId = this.correlationId.substring(0, 8);
      parts.push(`[${shortId}]`);
    }

    // Level and Module
    parts.push(`[${this.constructor.getLevelName(this.level)}]`);
    parts.push(`[${this.moduleName}]`);

    // Message
    parts.push(this.message);

    // Request info (if available)
    if (this.requestContext) {
      parts.push(`(${this.requestContext.method} ${this.requestContext.url})`);
    }

    // Error location (if error)
    if (this.errorContext && this.errorContext.location) {
      const loc = this.errorContext.location;
      parts.push(`at ${loc.fileName}:${loc.lineNumber}`);
    }

    return parts.join(' ');
  }

  /**
   * Check if has correlation ID
   * @returns {boolean} True if has correlation ID
   */
  hasCorrelationId() {
    return !!this.correlationId;
  }

  /**
   * Check if has request context
   * @returns {boolean} True if has request context
   */
  hasRequestContext() {
    return !!this.requestContext;
  }

  /**
   * Check if has error context
   * @returns {boolean} True if has error context
   */
  hasErrorContext() {
    return !!this.errorContext;
  }

  /**
   * Get static level name
   * @param {number} level - Log level
   * @returns {string} Level name
   */
  static getLevelName(level) {
    const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    return levels[level] || 'UNKNOWN';
  }
}

export { ContextualLogEntry };
export { ContextualLogEntry as EnhancedLogEntry };
