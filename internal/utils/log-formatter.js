/**
 * @internal
 * This module is for internal/experimental use only and is not part of the public API.
 * It may change or be removed without notice.
 */
/**
 * Log Formatter System
 *
 * Provides multiple formatting options for log entries:
 * - Default: Standard format with timestamp, level, module, message
 * - JSON: Machine-readable JSON format
 * - Compact: One-line format with essential info
 * - Custom: Template-based formatting with variable substitution
 */

/**
 * Base Formatter Class
 */
class BaseFormatter {
  /**
   * Format a log entry
   * @param {LogEntry} entry - Log entry to format
   * @returns {string} Formatted string
   */
  format(entry) {
    throw new Error('format() must be implemented');
  }

  /**
   * Get formatter name
   * @returns {string} Formatter name
   */
  getName() {
    return this.constructor.name;
  }
}

/**
 * Default Formatter
 * Standard format: [timestamp] [module] [level]: message
 */
class DefaultFormatter extends BaseFormatter {
  format(entry) {
    const parts = [
      `[${entry.timestamp.toISOString()}]`,
      `[${entry.moduleName}]`,
      `[${this._getLevelName(entry.level)}]`,
      `${entry.message}`,
    ];

    let result = parts.join(' ');

    // Add context if present
    if (
      entry.context &&
      typeof entry.context === 'object' &&
      Object.keys(entry.context).length > 0
    ) {
      result += `\n  Context: ${JSON.stringify(entry.context, null, 2)}`;
    }

    // Add correlation ID if present
    if (entry.correlationId) {
      result += `\n  Correlation ID: ${entry.correlationId}`;
    }

    return result;
  }

  _getLevelName(level) {
    const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    return levels[level] || 'UNKNOWN';
  }
}

/**
 * JSON Formatter
 * Output as machine-readable JSON
 */
class JSONFormatter extends BaseFormatter {
  format(entry) {
    const obj = {
      timestamp: entry.timestamp.toISOString(),
      level: this._getLevelName(entry.level),
      module: entry.moduleName,
      message: entry.message,
      context: entry.context || null,
    };

    // Add optional fields if present
    if (entry.correlationId) {
      obj.correlationId = entry.correlationId;
    }

    if (entry.requestContext) {
      obj.request = entry.requestContext.getSummary
        ? entry.requestContext.getSummary()
        : entry.requestContext;
    }

    if (entry.errorContext) {
      obj.error = {
        message: entry.errorContext.message || entry.message,
        location: entry.errorContext.location,
      };
    }

    return JSON.stringify(obj);
  }

  _getLevelName(level) {
    const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    return levels[level] || 'UNKNOWN';
  }
}

/**
 * Compact Formatter
 * One-line format with essential info only
 */
class CompactFormatter extends BaseFormatter {
  format(entry) {
    const time = entry.timestamp.toISOString().substring(11, 19);
    const level = this._getLevelName(entry.level).charAt(0);
    const corrId = entry.correlationId ? ` [${entry.correlationId.substring(0, 8)}]` : '';

    return `${time} ${level} ${entry.moduleName}: ${entry.message}${corrId}`;
  }

  _getLevelName(level) {
    const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    return levels[level] || 'UNKNOWN';
  }
}

/**
 * Custom Formatter
 * Template-based formatting with variable substitution
 */
class CustomFormatter extends BaseFormatter {
  /**
   * Create custom formatter with template
   * @param {string} template - Template string with {var} placeholders
   */
  constructor(template) {
    super();
    this.template = template;
    this.validateTemplate(template);
  }

  /**
   * Validate template string
   * @param {string} template - Template to validate
   * @throws {Error} If template is invalid
   */
  validateTemplate(template) {
    if (typeof template !== 'string' || template.length === 0) {
      throw new Error('Template must be a non-empty string');
    }

    // Check for valid variable names
    const varPattern = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
    const variables = new Set();
    let match;
    while ((match = varPattern.exec(template)) !== null) {
      variables.add(match[1]);
    }

    // Valid variables: time, date, level, module, message, context, correlationId, request, error, system
    const validVars = [
      'time',
      'date',
      'timestamp',
      'iso',
      'level',
      'levelName',
      'module',
      'moduleName',
      'message',
      'msg',
      'context',
      'ctx',
      'correlationId',
      'corrId',
      'requestId',
      'userId',
      'request',
      'error',
      'errorMessage',
      'hostname',
      'pid',
    ];

    for (const variable of variables) {
      if (!validVars.includes(variable)) {
        console.warn(`⚠️  Unknown variable in template: {${variable}}`);
      }
    }
  }

  /**
   * Format using template
   * @param {LogEntry} entry - Entry to format
   * @returns {string} Formatted string
   */
  format(entry) {
    let result = this.template;

    // Build variable map
    const vars = {
      // Time variables
      time: entry.timestamp.toISOString().substring(11, 19),
      date: entry.timestamp.toISOString().substring(0, 10),
      timestamp: entry.timestamp.toISOString(),
      iso: entry.timestamp.toISOString(),

      // Level variables
      level: this._getLevelName(entry.level),
      levelName: this._getLevelName(entry.level),

      // Module variables
      module: entry.moduleName,
      moduleName: entry.moduleName,

      // Message variables
      message: entry.message,
      msg: entry.message,

      // Context variables
      context: JSON.stringify(entry.context || {}),
      ctx: JSON.stringify(entry.context || {}),

      // Correlation ID
      correlationId: entry.correlationId || 'N/A',
      corrId: entry.correlationId ? entry.correlationId.substring(0, 8) : 'N/A',

      // Request variables
      requestId: entry.requestContext?.id || 'N/A',
      userId: entry.requestContext?.userId || 'N/A',
      request: entry.requestContext ? JSON.stringify(entry.requestContext.getSummary()) : 'N/A',

      // Error variables
      error: entry.errorContext ? JSON.stringify(entry.errorContext) : 'N/A',
      errorMessage: entry.errorContext?.message || 'N/A',

      // System variables
      hostname: entry.systemInfo?.hostname || 'N/A',
      pid: entry.systemInfo?.pid || 'N/A',
    };

    // Replace all variables
    result = result.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (match, variable) => {
      return String(vars[variable] ?? 'UNKNOWN');
    });

    return result;
  }

  _getLevelName(level) {
    const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    return levels[level] || 'UNKNOWN';
  }
}

/**
 * Log Formatter Manager
 * Central registry and factory for formatters
 */
class LogFormatterManager {
  static #formatters = new Map();
  static #defaultFormatter = 'default';

  static {
    // Register built-in formatters
    LogFormatterManager.register('default', new DefaultFormatter());
    LogFormatterManager.register('json', new JSONFormatter());
    LogFormatterManager.register('compact', new CompactFormatter());
  }

  /**
   * Register a formatter
   * @param {string} name - Formatter name
   * @param {BaseFormatter} formatter - Formatter instance
   * @throws {Error} If name already registered or formatter invalid
   */
  static register(name, formatter) {
    if (!(formatter instanceof BaseFormatter)) {
      throw new Error('Formatter must extend BaseFormatter');
    }

    if (this.#formatters.has(name)) {
      throw new Error(`Formatter '${name}' already registered`);
    }

    this.#formatters.set(name, formatter);
  }

  /**
   * Get formatter by name
   * @param {string} name - Formatter name
   * @returns {BaseFormatter} Formatter instance
   * @throws {Error} If formatter not found
   */
  static get(name) {
    const formatter = this.#formatters.get(name);
    if (!formatter) {
      throw new Error(`Formatter '${name}' not found`);
    }
    return formatter;
  }

  /**
   * Get default formatter
   * @returns {BaseFormatter} Default formatter
   */
  static getDefault() {
    return this.get(this.#defaultFormatter);
  }

  /**
   * Set default formatter
   * @param {string} name - Formatter name to set as default
   */
  static setDefault(name) {
    if (!this.#formatters.has(name)) {
      throw new Error(`Formatter '${name}' not found`);
    }
    this.#defaultFormatter = name;
  }

  /**
   * List all registered formatters
   * @returns {string[]} Array of formatter names
   */
  static list() {
    return Array.from(this.#formatters.keys());
  }

  /**
   * Check if formatter exists
   * @param {string} name - Formatter name
   * @returns {boolean} True if exists
   */
  static exists(name) {
    return this.#formatters.has(name);
  }

  /**
   * Create custom template formatter and register it
   * @param {string} name - Formatter name
   * @param {string} template - Template string
   * @returns {CustomFormatter} Created formatter
   */
  static createCustom(name, template) {
    const formatter = new CustomFormatter(template);
    this.register(name, formatter);
    return formatter;
  }

  /**
   * Format entry using named formatter
   * @param {string} name - Formatter name
   * @param {LogEntry} entry - Entry to format
   * @returns {string} Formatted string
   */
  static format(name, entry) {
    return this.get(name).format(entry);
  }

  /**
   * Format entry using default formatter
   * @param {LogEntry} entry - Entry to format
   * @returns {string} Formatted string
   */
  static formatDefault(entry) {
    return this.getDefault().format(entry);
  }
}

export {
  BaseFormatter,
  DefaultFormatter,
  JSONFormatter,
  CompactFormatter,
  CustomFormatter,
  LogFormatterManager,
};
