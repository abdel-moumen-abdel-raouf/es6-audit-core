/**
 * @internal
 * This module is for internal/experimental use only and is not part of the public API.
 * It may change or be removed without notice.
 */
/**
 * Output Customization System
 *
 * Provides advanced output customization:
 * - Custom transport handlers
 * - Output transformation pipeline
 * - Multi-target routing
 * - Conditional output
 */

/**
 * Output Transformer
 * Base class for output transformations
 */
class OutputTransformer {
  /**
   * Transform output
   * @param {string} output - Output text
   * @param {LogEntry} entry - Original log entry
   * @returns {string|null} Transformed output or null to skip
   */
  transform(output, entry) {
    throw new Error('transform() must be implemented');
  }

  /**
   * Get transformer name
   * @returns {string} Transformer name
   */
  getName() {
    return this.constructor.name;
  }
}

/**
 * Prefix Transformer
 * Add prefix to each line
 */
class PrefixTransformer extends OutputTransformer {
  /**
   * Create prefix transformer
   * @param {string|Function} prefix - Prefix string or function
   */
  constructor(prefix) {
    super();
    if (typeof prefix !== 'string' && typeof prefix !== 'function') {
      throw new Error('Prefix must be string or function');
    }
    this.prefix = prefix;
  }

  transform(output, entry) {
    let prefix = this.prefix;
    if (typeof prefix === 'function') {
      prefix = prefix(entry);
    }

    return output
      .split('\n')
      .map((line) => `${prefix}${line}`)
      .join('\n');
  }
}

/**
 * Suffix Transformer
 * Add suffix to output
 */
class SuffixTransformer extends OutputTransformer {
  /**
   * Create suffix transformer
   * @param {string|Function} suffix - Suffix string or function
   */
  constructor(suffix) {
    super();
    if (typeof suffix !== 'string' && typeof suffix !== 'function') {
      throw new Error('Suffix must be string or function');
    }
    this.suffix = suffix;
  }

  transform(output, entry) {
    let suffix = this.suffix;
    if (typeof suffix === 'function') {
      suffix = suffix(entry);
    }

    return `${output}${suffix}`;
  }
}

/**
 * Filter Transformer
 * Filter output based on conditions
 */
class FilterTransformer extends OutputTransformer {
  /**
   * Create filter transformer
   * @param {Function} predicate - Filter function
   */
  constructor(predicate) {
    super();
    if (typeof predicate !== 'function') {
      throw new Error('Predicate must be function');
    }
    this.predicate = predicate;
  }

  transform(output, entry) {
    // Return null to skip output, or original if passes
    return this.predicate(entry) ? output : null;
  }
}

/**
 * Replace Transformer
 * Replace patterns in output
 */
class ReplaceTransformer extends OutputTransformer {
  /**
   * Create replace transformer
   * @param {RegExp|string} pattern - Pattern to replace
   * @param {string|Function} replacement - Replacement string or function
   */
  constructor(pattern, replacement) {
    super();
    this.pattern = pattern;
    this.replacement = replacement;
  }

  transform(output, entry) {
    if (typeof this.replacement === 'function') {
      return output.replace(this.pattern, (...args) => {
        return this.replacement(...args, entry);
      });
    }
    return output.replace(this.pattern, this.replacement);
  }
}

/**
 * Truncate Transformer
 * Limit output length
 */
class TruncateTransformer extends OutputTransformer {
  /**
   * Create truncate transformer
   * @param {number} maxLength - Maximum length
   * @param {string} [ellipsis] - Ellipsis text
   */
  constructor(maxLength, ellipsis = '...') {
    super();
    this.maxLength = maxLength;
    this.ellipsis = ellipsis;
  }

  transform(output, entry) {
    if (output.length <= this.maxLength) {
      return output;
    }
    return output.substring(0, this.maxLength - this.ellipsis.length) + this.ellipsis;
  }
}

/**
 * Output Routing Rule
 * Route output to specific handlers based on conditions
 */
class RoutingRule {
  /**
   * Create routing rule
   * @param {Function} predicate - Rule condition
   * @param {Function} handler - Output handler
   */
  constructor(predicate, handler) {
    if (typeof predicate !== 'function' || typeof handler !== 'function') {
      throw new Error('Predicate and handler must be functions');
    }
    this.predicate = predicate;
    this.handler = handler;
  }

  /**
   * Check if rule applies
   * @param {LogEntry} entry - Log entry
   * @returns {boolean} True if rule applies
   */
  applies(entry) {
    try {
      return this.predicate(entry) === true;
    } catch (e) {
      console.error('Error in routing rule predicate:', e);
      return false;
    }
  }

  /**
   * Execute handler
   * @param {string} output - Output text
   * @param {LogEntry} entry - Log entry
   * @returns {Promise<void>|void}
   */
  async execute(output, entry) {
    try {
      return await Promise.resolve(this.handler(output, entry));
    } catch (e) {
      console.error('Error in routing rule handler:', e);
    }
  }
}

/**
 * Output Customizer
 * Manages transformers and routing
 */
class OutputCustomizer {
  /**
   * Create output customizer
   */
  constructor() {
    this.#transformers = [];
    this.#routingRules = [];
  }

  #transformers;
  #routingRules;

  /**
   * Add output transformer
   * @param {OutputTransformer} transformer - Transformer to add
   * @returns {OutputCustomizer} This (for chaining)
   */
  addTransformer(transformer) {
    if (!(transformer instanceof OutputTransformer)) {
      throw new Error('Transformer must extend OutputTransformer');
    }
    this.#transformers.push(transformer);
    return this;
  }

  /**
   * Remove transformer by name
   * @param {string} name - Transformer name
   * @returns {boolean} True if removed
   */
  removeTransformer(name) {
    const index = this.#transformers.findIndex((t) => t.getName() === name);
    if (index !== -1) {
      this.#transformers.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Clear all transformers
   * @returns {OutputCustomizer} This (for chaining)
   */
  clearTransformers() {
    this.#transformers = [];
    return this;
  }

  /**
   * Get all transformers
   * @returns {OutputTransformer[]} List of transformers
   */
  getTransformers() {
    return [...this.#transformers];
  }

  /**
   * Add routing rule
   * @param {RoutingRule} rule - Rule to add
   * @returns {OutputCustomizer} This (for chaining)
   */
  addRoutingRule(rule) {
    if (!(rule instanceof RoutingRule)) {
      throw new Error('Rule must be instance of RoutingRule');
    }
    this.#routingRules.push(rule);
    return this;
  }

  /**
   * Add routing rule with convenience constructor
   * @param {Function} predicate - Rule condition
   * @param {Function} handler - Output handler
   * @returns {OutputCustomizer} This (for chaining)
   */
  addRoute(predicate, handler) {
    return this.addRoutingRule(new RoutingRule(predicate, handler));
  }

  /**
   * Clear all routing rules
   * @returns {OutputCustomizer} This (for chaining)
   */
  clearRoutes() {
    this.#routingRules = [];
    return this;
  }

  /**
   * Get all routing rules
   * @returns {RoutingRule[]} List of rules
   */
  getRoutes() {
    return [...this.#routingRules];
  }

  /**
   * Process output through transformers
   * @param {string} output - Output text
   * @param {LogEntry} entry - Log entry
   * @returns {string|null} Transformed output or null if filtered
   */
  processTransformers(output, entry) {
    let result = output;

    for (const transformer of this.#transformers) {
      result = transformer.transform(result, entry);
      if (result === null) {
        return null;
      }
    }

    return result;
  }

  /**
   * Process output through routing rules
   * @param {string} output - Output text
   * @param {LogEntry} entry - Log entry
   * @returns {Promise<void>}
   */
  async processRouting(output, entry) {
    for (const rule of this.#routingRules) {
      if (rule.applies(entry)) {
        await rule.execute(output, entry);
      }
    }
  }

  /**
   * Process output (transformers then routing)
   * @param {string} output - Output text
   * @param {LogEntry} entry - Log entry
   * @returns {Promise<string|null>} Transformed output or null
   */
  async process(output, entry) {
    const transformed = this.processTransformers(output, entry);
    if (transformed !== null) {
      await this.processRouting(transformed, entry);
    }
    return transformed;
  }

  /**
   * Create custom handler for specific transport
   * @param {string} transportName - Transport name
   * @returns {Function} Handler function
   */
  createTransportHandler(transportName) {
    return (output, entry) => {
      // This handler can be used to route to specific transports
      console.log(`[${transportName}] ${output}`);
    };
  }
}

/**
 * Common Custom Handlers
 */
class CustomHandlers {
  /**
   * Create handler for sending to external service
   * @param {string} url - Service URL
   * @returns {Function} Handler function
   */
  static createWebhookHandler(url) {
    return async (output, entry) => {
      try {
        // In production, this would use fetch or axios
        console.log(`📡 Webhook: ${url} - ${output.substring(0, 50)}...`);
      } catch (error) {
        console.error('Webhook handler error:', error);
      }
    };
  }

  /**
   * Create handler for file rotation
   * @param {string} logDir - Log directory path
   * @returns {Function} Handler function
   */
  static createRotatingFileHandler(logDir) {
    return (output, entry) => {
      try {
        // In production, this would write to rotating log files
        console.log(`📁 File: ${logDir}/${entry.moduleName}.log`);
      } catch (error) {
        console.error('File handler error:', error);
      }
    };
  }

  /**
   * Create handler for email alerts
   * @param {string} emailAddress - Email address
   * @returns {Function} Handler function
   */
  static createEmailHandler(emailAddress) {
    return async (output, entry) => {
      try {
        if (entry.level >= 3) {
          // ERROR only
          console.log(`📧 Email: ${emailAddress} - ${output.substring(0, 50)}...`);
        }
      } catch (error) {
        console.error('Email handler error:', error);
      }
    };
  }

  /**
   * Create handler for metrics/monitoring
   * @param {string} metricsEndpoint - Metrics endpoint URL
   * @returns {Function} Handler function
   */
  static createMetricsHandler(metricsEndpoint) {
    return (output, entry) => {
      try {
        // In production, this would send metrics
        console.log(`📊 Metrics: ${metricsEndpoint}`);
      } catch (error) {
        console.error('Metrics handler error:', error);
      }
    };
  }

  /**
   * Create handler for Slack messages
   * @param {string} webhookUrl - Slack webhook URL
   * @returns {Function} Handler function
   */
  static createSlackHandler(webhookUrl) {
    return async (output, entry) => {
      try {
        // In production, this would post to Slack
        const color = entry.level >= 3 ? 'danger' : 'warning';
        console.log(`💬 Slack: [${color}] ${output.substring(0, 50)}...`);
      } catch (error) {
        console.error('Slack handler error:', error);
      }
    };
  }

  /**
   * Create handler for database logging
   * @param {Object} dbConfig - Database configuration
   * @returns {Function} Handler function
   */
  static createDatabaseHandler(dbConfig) {
    return (output, entry) => {
      try {
        // In production, this would insert into database
        console.log(`🗄️  Database: Logging to ${dbConfig.database}`);
      } catch (error) {
        console.error('Database handler error:', error);
      }
    };
  }

  /**
   * Create handler for console grouping
   * @returns {Function} Handler function
   */
  static createConsoleGroupHandler() {
    return (output, entry) => {
      const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
      console.group(`${levels[entry.level]}: ${entry.moduleName}`);
      console.log(output);
      console.groupEnd();
    };
  }

  /**
   * Create handler for performance tracking
   * @returns {Function} Handler function
   */
  static createPerformanceHandler() {
    return (output, entry) => {
      if (entry.context?.duration) {
        const duration = entry.context.duration;
        console.log(`⏱️  Performance: ${duration}ms`);
      }
    };
  }
}

export {
  OutputTransformer,
  PrefixTransformer,
  SuffixTransformer,
  FilterTransformer,
  ReplaceTransformer,
  TruncateTransformer,
  RoutingRule,
  OutputCustomizer,
  CustomHandlers,
};
