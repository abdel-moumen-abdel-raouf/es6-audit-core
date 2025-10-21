/**
 * Request Context Manager
 *
 * Captures and manages request-level context information
 * (userId, URL, method, headers, etc.)
 */

/**
 * Request Context
 * Represents a single HTTP request context
 */
class RequestContext {
  constructor(options = {}) {
    this.id = options.id || this.#generateId();
    this.userId = options.userId || null;
    this.username = options.username || null;
    this.sessionId = options.sessionId || null;
    this.url = options.url || null;
    this.method = options.method || 'UNKNOWN';
    this.ip = options.ip || null;
    this.userAgent = options.userAgent || null;
    this.referer = options.referer || null;
    this.timestamp = new Date().toISOString();
    this.startTime = Date.now();
    this.tags = options.tags || {};
    this.metadata = options.metadata || {};
  }

  /**
   * Generate unique request ID
   * @private
   * @returns {string} Unique ID
   */
  #generateId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 9);
    return `req-${timestamp}-${random}`;
  }

  /**
   * Get request duration in milliseconds
   * @returns {number} Duration in ms
   */
  getDuration() {
    return Date.now() - this.startTime;
  }

  /**
   * Set user info
   * @param {string|number} userId - User ID
   * @param {string} username - Username (optional)
   */
  setUser(userId, username = null) {
    this.userId = userId;
    this.username = username;
  }

  /**
   * Add tag to request
   * @param {string} key - Tag key
   * @param {*} value - Tag value
   */
  addTag(key, value) {
    this.tags[key] = value;
  }

  /**
   * Add metadata
   * @param {string} key - Metadata key
   * @param {*} value - Metadata value
   */
  addMetadata(key, value) {
    this.metadata[key] = value;
  }

  /**
   * Get summary
   * @returns {object} Request summary
   */
  getSummary() {
    return {
      id: this.id,
      method: this.method,
      url: this.url,
      userId: this.userId,
      ip: this.ip,
      duration: this.getDuration(),
      timestamp: this.timestamp,
    };
  }

  /**
   * Convert to JSON
   * @returns {object} JSON representation
   */
  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      username: this.username,
      sessionId: this.sessionId,
      url: this.url,
      method: this.method,
      ip: this.ip,
      userAgent: this.userAgent,
      referer: this.referer,
      timestamp: this.timestamp,
      duration: this.getDuration(),
      tags: this.tags,
      metadata: this.metadata,
    };
  }

  /**
   * Get string representation
   * @returns {string} String representation
   */
  toString() {
    const parts = [this.method, this.url, `(${this.getDuration()}ms)`];
    if (this.userId) {
      parts.push(`user: ${this.userId}`);
    }
    return parts.filter(Boolean).join(' ');
  }
}

/**
 * Request Context Factory
 * Creates request contexts from different sources
 */
class RequestContextFactory {
  /**
   * Create from Express request object
   * @param {object} req - Express request object
   * @returns {RequestContext} Request context
   */
  static fromExpressRequest(req) {
    const headers = req.headers || {};
    return new RequestContext({
      id: req.get('X-Request-ID'),
      userId: req.user?.id,
      username: req.user?.username,
      sessionId: req.sessionID,
      url: req.originalUrl || req.url,
      method: req.method,
      ip: req.ip,
      userAgent: headers['user-agent'],
      referer: headers.referer,
    });
  }

  /**
   * Create from Fastify request object
   * @param {object} req - Fastify request object
   * @returns {RequestContext} Request context
   */
  static fromFastifyRequest(req) {
    const headers = req.headers || {};
    return new RequestContext({
      id: req.headers['x-request-id'],
      userId: req.user?.id,
      username: req.user?.username,
      sessionId: null,
      url: req.url,
      method: req.method,
      ip: req.ip,
      userAgent: headers['user-agent'],
      referer: headers.referer,
    });
  }

  /**
   * Create from Koa context
   * @param {object} ctx - Koa context
   * @returns {RequestContext} Request context
   */
  static fromKoaContext(ctx) {
    const headers = ctx.headers || {};
    return new RequestContext({
      id: headers['x-request-id'],
      userId: ctx.state.user?.id,
      username: ctx.state.user?.username,
      sessionId: ctx.cookies.get('sessionId'),
      url: ctx.originalUrl || ctx.url,
      method: ctx.method,
      ip: ctx.ip,
      userAgent: headers['user-agent'],
      referer: headers.referer,
    });
  }

  /**
   * Create from plain object
   * @param {object} obj - Plain object with request info
   * @returns {RequestContext} Request context
   */
  static fromObject(obj) {
    return new RequestContext(obj);
  }
}

/**
 * Request Context Storage
 * Thread-safe storage for current request context
 */
class RequestContextStorage {
  static #current = null;
  static #stack = [];

  /**
   * Set current request context
   * @param {RequestContext} context - Context to set
   */
  static setCurrent(context) {
    this.#current = context;
  }

  /**
   * Get current request context
   * @returns {RequestContext|null} Current context or null
   */
  static getCurrent() {
    return this.#current;
  }

  /**
   * Push context to stack (for nested contexts)
   * @param {RequestContext} context - Context to push
   */
  static push(context) {
    if (this.#current) {
      this.#stack.push(this.#current);
    }
    this.#current = context;
  }

  /**
   * Pop context from stack
   * @returns {RequestContext|null} Popped context or null
   */
  static pop() {
    const popped = this.#current;
    this.#current = this.#stack.pop() || null;
    return popped;
  }

  /**
   * Clear all contexts
   */
  static clear() {
    this.#current = null;
    this.#stack = [];
  }

  /**
   * Get context summary
   * @returns {object} Summary of current context
   */
  static getSummary() {
    return this.#current ? this.#current.getSummary() : null;
  }
}

export { RequestContext, RequestContextFactory, RequestContextStorage };
