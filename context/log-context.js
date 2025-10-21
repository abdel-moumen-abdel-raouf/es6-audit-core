/**
 * Log Context Manager
 *
 * Manages correlation IDs and request contexts for tracking log chains.
 * Uses async-local-storage pattern for thread-safe context tracking.
 */

import { randomBytes } from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';

/**
 * Context Store using AsyncLocalStorage
 * Provides thread-safe storage for log context
 */
class ContextStore {
  constructor() {
    this.storage = new AsyncLocalStorage();
    this.globalContext = null;
  }

  /**
   * Get current context
   * @returns {object} Current context or null
   */
  getContext() {
    try {
      return this.storage.getStore() || this.globalContext;
    } catch {
      return this.globalContext;
    }
  }

  /**
   * Set context for async operations
   * @param {object} context - Context to set
   * @param {Function} callback - Function to run with context
   * @returns {*} Result of callback
   */
  runWithContext(context, callback) {
    return this.storage.run(context, callback);
  }

  /**
   * Set global context (fallback)
   * @param {object} context - Context to set
   */
  setGlobalContext(context) {
    this.globalContext = context;
  }

  /**
   * Clear context
   */
  clear() {
    this.globalContext = null;
  }
}

/**
 * Correlation ID Generator
 */
class CorrelationIdGenerator {
  /**
   * Generate unique correlation ID
   * @returns {string} Unique correlation ID
   */
  static generate() {
    const timestamp = Date.now().toString(36);
    const random = randomBytes(8).toString('hex');
    return `${timestamp}-${random}`;
  }

  /**
   * Generate with prefix
   * @param {string} prefix - Prefix for the ID
   * @returns {string} Prefixed correlation ID
   */
  static generateWithPrefix(prefix = 'log') {
    return `${prefix}-${this.generate()}`;
  }

  /**
   * Validate correlation ID format
   * @param {string} id - ID to validate
   * @returns {boolean} True if valid
   */
  static isValid(id) {
    return typeof id === 'string' && id.length > 10 && !id.includes(' ');
  }
}

/**
 * Main Log Context Manager
 */
class LogContext {
  static #store = new ContextStore();
  static #currentId = null;
  static #requestContext = null;

  /**
   * Initialize context for new operation
   * @param {string} correlationId - Optional correlation ID to use
   * @returns {string} Correlation ID
   */
  static initialize(correlationId = null) {
    const id = correlationId || CorrelationIdGenerator.generate();
    this.#currentId = id;

    const context = {
      correlationId: id,
      createdAt: new Date().toISOString(),
      requestContext: null,
    };

    this.#store.setGlobalContext(context);
    return id;
  }

  /**
   * Set correlation ID
   * @param {string} id - Correlation ID
   */
  static setCorrelationId(id) {
    if (!CorrelationIdGenerator.isValid(id)) {
      throw new Error(`Invalid correlation ID: ${id}`);
    }
    this.#currentId = id;
    const ctx = this.#store.getContext() || {};
    ctx.correlationId = id;
    this.#store.setGlobalContext(ctx);
  }

  /**
   * Get current correlation ID
   * @returns {string|null} Current correlation ID or null
   */
  static getCorrelationId() {
    const ctx = this.#store.getContext();
    return ctx?.correlationId || this.#currentId;
  }

  /**
   * Set request context
   * @param {object} requestContext - Request context object
   */
  static setRequestContext(requestContext) {
    this.#requestContext = requestContext;
    const ctx = this.#store.getContext() || {};
    ctx.requestContext = requestContext;
    this.#store.setGlobalContext(ctx);
  }

  /**
   * Get request context
   * @returns {object|null} Request context or null
   */
  static getRequestContext() {
    const ctx = this.#store.getContext();
    return ctx?.requestContext || this.#requestContext;
  }

  /**
   * Get complete context
   * @returns {object} Complete context object
   */
  static getContext() {
    return (
      this.#store.getContext() || {
        correlationId: this.#currentId,
        requestContext: this.#requestContext,
      }
    );
  }

  /**
   * Run function with new context
   * @param {Function} callback - Function to run
   * @param {string} correlationId - Optional correlation ID
   * @returns {*} Result of callback
   */
  static runWithContext(callback, correlationId = null) {
    const id = correlationId || CorrelationIdGenerator.generate();
    const context = {
      correlationId: id,
      createdAt: new Date().toISOString(),
      requestContext: this.#requestContext,
    };

    return this.#store.runWithContext(context, callback);
  }

  /**
   * Clear all context
   */
  static clear() {
    this.#currentId = null;
    this.#requestContext = null;
    this.#store.clear();
  }

  /**
   * Get debug info
   * @returns {object} Debug information
   */
  static getDebugInfo() {
    return {
      correlationId: this.getCorrelationId(),
      requestContext: this.getRequestContext(),
      timestamp: new Date().toISOString(),
    };
  }
}

export { LogContext, CorrelationIdGenerator, ContextStore };
