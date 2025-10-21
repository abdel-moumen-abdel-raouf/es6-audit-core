/**
 * Unified Error Handling System - Fix #10
 *
 *
 * - Unified error types
 * - Clear error levels
 * - Consistent propagation
 * - Error tracking
 */

export const ErrorLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4,
};

export const ErrorType = {
  // System errors
  TRANSPORT_ERROR: 'TRANSPORT_ERROR',
  BUFFER_ERROR: 'BUFFER_ERROR',
  CONFIG_ERROR: 'CONFIG_ERROR',

  // Logic errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  CONTEXT_ERROR: 'CONTEXT_ERROR',
  SCHEMA_ERROR: 'SCHEMA_ERROR',

  // Runtime errors
  RATE_LIMIT_ERROR: 'RATE_LIMIT_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  MEMORY_ERROR: 'MEMORY_ERROR',

  // Network errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  CONNECTION_ERROR: 'CONNECTION_ERROR',

  // Unknown
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
};

export class LoggingError extends Error {
  constructor(config = {}) {
    super(config.message || 'Unknown logging error');

    this.name = 'LoggingError';
    this.type = config.type || ErrorType.UNKNOWN_ERROR;
    this.level = config.level || ErrorLevel.ERROR;
    this.code = config.code || 'ERR_UNKNOWN';
    this.context = config.context || {};
    this.originalError = config.originalError || null;
    this.timestamp = Date.now();
    this.cause = config.cause || null;
    this.shouldPropagate = config.shouldPropagate !== false;
    this.retriable = config.retriable || false;
    this.retryAfter = config.retryAfter || null;

    // Stack trace
    Error.captureStackTrace(this, LoggingError);
  }

  /**
   * Mark error as fatal
   */
  fatal() {
    this.level = ErrorLevel.FATAL;
    this.shouldPropagate = true;
    return this;
  }

  /**
   * Mark error as warning
   */
  warn() {
    this.level = ErrorLevel.WARN;
    this.shouldPropagate = false;
    return this;
  }

  /**
   * Mark as retriable
   */
  asRetriable(retryAfter = 1000) {
    this.retriable = true;
    this.retryAfter = retryAfter;
    return this;
  }

  /**
   * Set cause
   */
  withCause(error) {
    this.cause = error;
    return this;
  }

  /**
   * Convert to JSON
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      level: this.level,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp,
      retriable: this.retriable,
      retryAfter: this.retryAfter,
      shouldPropagate: this.shouldPropagate,
      stack: this.stack,
      cause: this.cause
        ? {
            name: this.cause.name,
            message: this.cause.message,
            stack: this.cause.stack,
          }
        : null,
    };
  }

  /**
   * Format for display
   */
  format() {
    const lines = [];
    lines.push(`[${this.type}] ${this.message}`);
    if (this.code) lines.push(`Code: ${this.code}`);
    if (this.retryAfter) lines.push(`Retry After: ${this.retryAfter}ms`);
    if (this.cause) lines.push(`Caused by: ${this.cause.message}`);
    return lines.join('\n');
  }
}

export class ErrorHandler {
  constructor(config = {}) {
    this.onError = config.onError; // Callback for errors
    this.errorThreshold = config.errorThreshold || ErrorLevel.ERROR;
    this.trackErrors = config.trackErrors !== false;

    this.errors = [];
    this.errorStats = {
      total: 0,
      byType: {},
      byLevel: {},
      byCode: {},
    };
  }

  /**
   * Handle error
   */
  handle(error, context = {}) {
    let loggingError;

    // Convert native Error to LoggingError
    if (error instanceof LoggingError) {
      loggingError = error;
    } else if (error instanceof Error) {
      loggingError = new LoggingError({
        message: error.message,
        originalError: error,
        context,
        code: error.code || 'ERR_NATIVE',
      });
    } else {
      loggingError = new LoggingError({
        message: String(error),
        context,
        code: 'ERR_UNKNOWN',
      });
    }

    // Track error
    if (this.trackErrors) {
      this._trackError(loggingError);
    }

    // Call callback if registered
    if (this.onError) {
      try {
        this.onError(loggingError);
      } catch (callbackError) {
        console.error('Error in error handler callback:', callbackError);
      }
    }

    // Decide whether to propagate
    if (loggingError.shouldPropagate && loggingError.level >= this.errorThreshold) {
      throw loggingError;
    }

    return loggingError;
  }

  /**
   * Handle retriable error
   */
  async handleRetriable(error, retryFn, maxRetries = 3) {
    const loggingError = this.handle(error);

    if (!loggingError.retriable) {
      throw loggingError;
    }

    let lastError = loggingError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this._sleep(loggingError.retryAfter);
        return await retryFn();
      } catch (e) {
        lastError = this.handle(e, { attempt, maxRetries });
        if (attempt === maxRetries) {
          throw lastError;
        }
      }
    }
  }

  /**
   * Track error statistics
   */
  _trackError(error) {
    this.errors.push({
      timestamp: error.timestamp,
      type: error.type,
      level: error.level,
      code: error.code,
      message: error.message,
    });

    this.errorStats.total++;
    this.errorStats.byType[error.type] = (this.errorStats.byType[error.type] || 0) + 1;
    this.errorStats.byLevel[error.level] = (this.errorStats.byLevel[error.level] || 0) + 1;
    this.errorStats.byCode[error.code] = (this.errorStats.byCode[error.code] || 0) + 1;

    // Keep only last 1000 errors
    if (this.errors.length > 1000) {
      this.errors.shift();
    }
  }

  /**
   * Get error statistics
   */
  getStatistics() {
    return {
      ...this.errorStats,
      recentErrors: this.errors.slice(-10),
    };
  }

  /**
   * Sleep helper
   */
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Clear tracked errors
   */
  clear() {
    this.errors = [];
    this.errorStats = {
      total: 0,
      byType: {},
      byLevel: {},
      byCode: {},
    };
  }
}

/**
 * Error Recovery Strategy
 */
export class ErrorRecoveryStrategy {
  constructor(config = {}) {
    this.strategies = new Map();
    this.defaultStrategy = config.defaultStrategy || this._defaultRecovery;
    this.maxRetries = config.maxRetries || 3;
    this.backoffMultiplier = config.backoffMultiplier || 2;
    this.initialDelay = config.initialDelay || 100;
    this.maxDelay = config.maxDelay || 10000;
  }

  /**
   * Register recovery strategy for error type
   */
  register(errorType, strategy) {
    this.strategies.set(errorType, strategy);
    return this;
  }

  /**
   * Execute recovery
   */
  async recover(error, operation) {
    const strategy = this.strategies.get(error.type) || this.defaultStrategy;

    try {
      const result = await strategy(error, operation, {
        maxRetries: this.maxRetries,
        backoffMultiplier: this.backoffMultiplier,
        initialDelay: this.initialDelay,
        maxDelay: this.maxDelay,
      });

      return result;
    } catch (recoveryError) {
      throw new LoggingError({
        message: `Recovery failed: ${recoveryError.message}`,
        originalError: recoveryError,
        type: ErrorType.UNKNOWN_ERROR,
        level: ErrorLevel.FATAL,
        cause: error,
      });
    }
  }

  /**
   * Default recovery strategy
   */
  async _defaultRecovery(error, operation, options) {
    let lastError = error;

    for (let attempt = 1; attempt <= options.maxRetries; attempt++) {
      try {
        const delay = Math.min(
          options.initialDelay * Math.pow(options.backoffMultiplier, attempt - 1),
          options.maxDelay
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
        return await operation();
      } catch (e) {
        lastError = e;
        if (attempt === options.maxRetries) {
          throw lastError;
        }
      }
    }
  }

  /**
   * Network error strategy
   */
  static networkErrorStrategy(config = {}) {
    return async (error, operation, options) => {
      const maxRetries = config.maxRetries || options.maxRetries;
      let delay = config.initialDelay || options.initialDelay;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          await new Promise((resolve) => setTimeout(resolve, delay));
          return await operation();
        } catch (e) {
          if (attempt === maxRetries) throw e;
          delay = Math.min(delay * options.backoffMultiplier, options.maxDelay);
        }
      }
    };
  }

  /**
   * Memory error strategy
   */
  static memoryErrorStrategy() {
    return async (error, operation, options) => {
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      // Wait longer before retry
      await new Promise((resolve) => setTimeout(resolve, options.initialDelay * 10));
      return await operation();
    };
  }

  /**
   * Transport error strategy
   */
  static transportErrorStrategy(config = {}) {
    return async (error, operation, options) => {
      // Circuit breaker style recovery
      const maxRetries = config.maxRetries || 2;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const delay = options.initialDelay * attempt;
          await new Promise((resolve) => setTimeout(resolve, delay));
          return await operation();
        } catch (e) {
          if (attempt === maxRetries) throw e;
        }
      }
    };
  }
}

/**
 * Create standard error types
 */
export const createErrors = {
  transportError(message, context = {}) {
    return new LoggingError({
      message,
      type: ErrorType.TRANSPORT_ERROR,
      level: ErrorLevel.ERROR,
      code: 'ERR_TRANSPORT',
      context,
      retriable: true,
      retryAfter: 1000,
    });
  },

  bufferError(message, context = {}) {
    return new LoggingError({
      message,
      type: ErrorType.BUFFER_ERROR,
      level: ErrorLevel.ERROR,
      code: 'ERR_BUFFER',
      context,
    });
  },

  configError(message, context = {}) {
    return new LoggingError({
      message,
      type: ErrorType.CONFIG_ERROR,
      level: ErrorLevel.FATAL,
      code: 'ERR_CONFIG',
      context,
    });
  },

  validationError(message, context = {}) {
    return new LoggingError({
      message,
      type: ErrorType.VALIDATION_ERROR,
      level: ErrorLevel.WARN,
      code: 'ERR_VALIDATION',
      context,
    });
  },

  rateLimitError(message, context = {}) {
    return new LoggingError({
      message,
      type: ErrorType.RATE_LIMIT_ERROR,
      level: ErrorLevel.WARN,
      code: 'ERR_RATE_LIMIT',
      context,
      retriable: true,
      retryAfter: 5000,
    });
  },

  networkError(message, context = {}) {
    return new LoggingError({
      message,
      type: ErrorType.NETWORK_ERROR,
      level: ErrorLevel.ERROR,
      code: 'ERR_NETWORK',
      context,
      retriable: true,
      retryAfter: 2000,
    });
  },

  memoryError(message, context = {}) {
    return new LoggingError({
      message,
      type: ErrorType.MEMORY_ERROR,
      level: ErrorLevel.FATAL,
      code: 'ERR_MEMORY',
      context,
    });
  },

  fatalError(message, context = {}) {
    return new LoggingError({
      message,
      type: ErrorType.UNKNOWN_ERROR,
      level: ErrorLevel.FATAL,
      code: 'ERR_FATAL',
      context,
    });
  },
};
