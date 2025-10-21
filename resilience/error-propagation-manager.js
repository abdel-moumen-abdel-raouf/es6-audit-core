/**
 * Error Propagation & Standardization System
 *
 */

export class ErrorPropagationManager {
  constructor(options = {}) {
    this.errorCategories = {
      SYSTEM: 'system',
      NETWORK: 'network',
      VALIDATION: 'validation',
      AUTHORIZATION: 'authorization',
      NOT_FOUND: 'not_found',
      CONFLICT: 'conflict',
      INTERNAL: 'internal',
      UNKNOWN: 'unknown',
    };

    this.severityLevels = {
      LOW: 'low',
      MEDIUM: 'medium',
      HIGH: 'high',
      CRITICAL: 'critical',
    };

    this.retryStrategies = {
      NEVER: 'never',
      IMMEDIATE: 'immediate',
      EXPONENTIAL: 'exponential',
      LINEAR: 'linear',
    };

    this.config = {
      maxErrorChainDepth: options.maxErrorChainDepth ?? 10,
      maxErrorContextSize: options.maxErrorContextSize ?? 5000,
      trackStackTrace: options.trackStackTrace ?? true,
      trackContext: options.trackContext ?? true,
    };

    this.stats = {
      totalErrors: 0,
      errorsByCategory: {},
      errorsBySeverity: {},
      errorHistory: [],
      recoveryAttempts: 0,
      successfulRecoveries: 0,
    };

    for (const category of Object.values(this.errorCategories)) {
      this.stats.errorsByCategory[category] = 0;
    }

    for (const severity of Object.values(this.severityLevels)) {
      this.stats.errorsBySeverity[severity] = 0;
    }
  }

  /**
   *
   */
  createStandardError(options = {}) {
    const error = {
      id: this._generateErrorId(),
      message: options.message || 'Unknown error',
      category: options.category || this.errorCategories.UNKNOWN,
      severity: options.severity || this.severityLevels.MEDIUM,
      timestamp: Date.now(),
      retryable: options.retryable ?? false,
      retryStrategy: options.retryStrategy || this.retryStrategies.NEVER,
      maxRetries: options.maxRetries ?? 0,
      attemptsRemaining: options.maxRetries ?? 0,

      // Chain of errors
      originalError: options.originalError || null,
      chain: [],

      // Context
      context: options.context || {},
      operationId: options.operationId || null,
      userId: options.userId || null,

      // Stack trace
      stackTrace: options.stackTrace || (this.config.trackStackTrace ? new Error().stack : null),

      // Recovery
      recoveryHint: options.recoveryHint || null,
      recoveryAttempts: 0,
      lastRecoveryAt: null,
    };

    if (options.originalError) {
      error.chain = this._buildErrorChain(options.originalError);
    }

    this.stats.totalErrors++;
    this.stats.errorsByCategory[error.category]++;
    this.stats.errorsBySeverity[error.severity]++;

    this._recordError(error);

    return error;
  }

  /**
   *
   */
  _buildErrorChain(error, depth = 0) {
    if (depth > this.config.maxErrorChainDepth) {
      return [];
    }

    const chain = [];

    if (error instanceof Error) {
      chain.push({
        message: error.message,
        type: error.constructor.name,
        stackTrace: this.config.trackStackTrace ? error.stack : null,
        depth,
      });

      if (error.cause) {
        chain.push(...this._buildErrorChain(error.cause, depth + 1));
      }
    } else if (typeof error === 'string') {
      chain.push({
        message: error,
        type: 'String',
        depth,
      });
    }

    return chain;
  }

  /**
   *
   */
  _recordError(error) {
    const record = {
      id: error.id,
      message: error.message,
      category: error.category,
      severity: error.severity,
      timestamp: error.timestamp,
      operationId: error.operationId,
      chainLength: error.chain.length,
    };

    this.stats.errorHistory.push(record);

    if (this.stats.errorHistory.length > 1000) {
      this.stats.errorHistory.shift();
    }
  }

  /**
   *
   */
  attemptRecovery(error, recoveryFn) {
    if (!error.retryable || error.attemptsRemaining <= 0) {
      return {
        success: false,
        reason: 'not_retryable',
        error,
      };
    }

    this.stats.recoveryAttempts++;
    error.recoveryAttempts++;
    error.lastRecoveryAt = Date.now();

    try {
      let delay = 0;

      switch (error.retryStrategy) {
        case this.retryStrategies.IMMEDIATE:
          delay = 0;
          break;
        case this.retryStrategies.LINEAR:
          delay = (error.maxRetries - error.attemptsRemaining + 1) * 1000;
          break;
        case this.retryStrategies.EXPONENTIAL:
          delay = Math.pow(2, error.maxRetries - error.attemptsRemaining) * 1000;
          break;
      }

      const result = recoveryFn();

      if (result instanceof Promise) {
        return result
          .then(() => {
            this.stats.successfulRecoveries++;
            return {
              success: true,
              delay,
              attemptsUsed: error.maxRetries - error.attemptsRemaining,
            };
          })
          .catch((recoveryError) => {
            error.attemptsRemaining--;
            return {
              success: false,
              reason: 'recovery_failed',
              error: recoveryError,
            };
          });
      } else {
        this.stats.successfulRecoveries++;
        return {
          success: true,
          delay,
          attemptsUsed: error.maxRetries - error.attemptsRemaining,
        };
      }
    } catch (e) {
      error.attemptsRemaining--;
      return {
        success: false,
        reason: 'recovery_threw',
        error: e,
      };
    }
  }

  /**
   *
   */
  classifyError(error) {
    const classification = {
      category: this.errorCategories.UNKNOWN,
      severity: this.severityLevels.MEDIUM,
      retryable: false,
      retryStrategy: this.retryStrategies.NEVER,
    };

    const message = error.message?.toLowerCase() || '';
    const name = error.constructor?.name?.toLowerCase() || '';

    if (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('econnrefused') ||
      message.includes('timeout')
    ) {
      classification.category = this.errorCategories.NETWORK;
      classification.severity = this.severityLevels.HIGH;
      classification.retryable = true;
      classification.retryStrategy = this.retryStrategies.EXPONENTIAL;
    } else if (
      message.includes('not found') ||
      message.includes('404') ||
      name.includes('notfounderror')
    ) {
      classification.category = this.errorCategories.NOT_FOUND;
      classification.severity = this.severityLevels.LOW;
      classification.retryable = false;
    } else if (
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('401') ||
      message.includes('403')
    ) {
      classification.category = this.errorCategories.AUTHORIZATION;
      classification.severity = this.severityLevels.HIGH;
      classification.retryable = false;
    } else if (message.includes('validation') || message.includes('invalid')) {
      classification.category = this.errorCategories.VALIDATION;
      classification.severity = this.severityLevels.LOW;
      classification.retryable = false;
    } else if (message.includes('conflict') || message.includes('duplicate')) {
      classification.category = this.errorCategories.CONFLICT;
      classification.severity = this.severityLevels.MEDIUM;
      classification.retryable = true;
      classification.retryStrategy = this.retryStrategies.LINEAR;
    } else if (message.includes('out of memory') || message.includes('stack overflow')) {
      classification.category = this.errorCategories.SYSTEM;
      classification.severity = this.severityLevels.CRITICAL;
      classification.retryable = false;
    }

    return classification;
  }

  /**
   *
   */
  formatErrorForLogging(error) {
    return {
      id: error.id,
      message: error.message,
      category: error.category,
      severity: error.severity,
      timestamp: new Date(error.timestamp).toISOString(),
      operationId: error.operationId,
      userId: error.userId,
      retryable: error.retryable,
      recoveryAttempts: error.recoveryAttempts,
      chainLength: error.chain.length,
      stackTracePreview: error.stackTrace
        ? error.stackTrace.split('\n').slice(0, 3).join('\n')
        : null,
    };
  }

  /**
   *
   */
  getErrorDetails(errorId) {
    const errorRecord = this.stats.errorHistory.find((e) => e.id === errorId);
    if (!errorRecord) {
      return null;
    }

    return {
      ...errorRecord,
      contextSize: this.config.maxErrorContextSize,
      stackTraceEnabled: this.config.trackStackTrace,
    };
  }

  /**
   *
   */
  getStatistics() {
    return {
      ...this.stats,
      averageChainLength: this._calculateAverageChainLength(),
      recoverySuccessRate: this._calculateRecoverySuccessRate(),
      mostCommonCategory: this._getMostCommonCategory(),
      criticalErrorsCount: this.stats.errorsBySeverity[this.severityLevels.CRITICAL] || 0,
    };
  }

  /**
   *
   */
  _calculateAverageChainLength() {
    if (this.stats.errorHistory.length === 0) return 0;

    const sum = this.stats.errorHistory.reduce((acc, e) => acc + e.chainLength, 0);
    return (sum / this.stats.errorHistory.length).toFixed(2);
  }

  /**
   *
   */
  _calculateRecoverySuccessRate() {
    if (this.stats.recoveryAttempts === 0) return 0;
    return ((this.stats.successfulRecoveries / this.stats.recoveryAttempts) * 100).toFixed(1);
  }

  /**
   *
   */
  _getMostCommonCategory() {
    let maxCategory = this.errorCategories.UNKNOWN;
    let maxCount = 0;

    for (const [category, count] of Object.entries(this.stats.errorsByCategory)) {
      if (count > maxCount) {
        maxCount = count;
        maxCategory = category;
      }
    }

    return maxCategory;
  }

  /**
   *
   */
  _generateErrorId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   *
   */
  reset() {
    this.stats = {
      totalErrors: 0,
      errorsByCategory: {},
      errorsBySeverity: {},
      errorHistory: [],
      recoveryAttempts: 0,
      successfulRecoveries: 0,
    };

    for (const category of Object.values(this.errorCategories)) {
      this.stats.errorsByCategory[category] = 0;
    }

    for (const severity of Object.values(this.severityLevels)) {
      this.stats.errorsBySeverity[severity] = 0;
    }
  }
}
