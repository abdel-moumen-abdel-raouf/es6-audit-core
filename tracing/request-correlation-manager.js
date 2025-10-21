/**
 * Request Correlation Manager
 *
 * 2. Async Context Tracking
 * 3. Multiple Identifier Support
 * 4. Audit Trail
 */

export class RequestCorrelationManager {
  /**
   * Initialize Request Correlation Manager
   * @param {Object} options - Manager configuration
   */
  constructor(options = {}) {
    this.correlationIdMap = new Map(); // Main correlation contexts
    this.contextStack = new WeakMap();
    this.activeContexts = new Set(); // Active correlation IDs
    this.stats = {
      correlationsCreated: 0,
      contextsPropagated: 0,
      tracesCollected: 0,
      orphanedContexts: 0,
      errors: 0,
    };
    this.history = []; // Audit trail
    this.maxHistory = options.maxHistory || 1000;
    this.correlationIdHeader = options.correlationIdHeader || 'x-correlation-id';
    this.requestIdHeader = options.requestIdHeader || 'x-request-id';
    this.traceIdHeader = options.traceIdHeader || 'x-trace-id';
  }

  /**
   * Create new correlation context
   * @param {Object} metadata - Initial context metadata
   * @returns {string} Correlation ID
   */
  createCorrelation(metadata = {}) {
    const correlationId = this._generateId();
    const requestId = this._generateId();
    const traceId = this._generateId();

    const context = {
      correlationId,
      requestId,
      traceId,
      parentTraceId: metadata.parentTraceId || null,
      userId: metadata.userId || null,
      tenantId: metadata.tenantId || null,
      source: metadata.source || 'unknown',
      startTime: Date.now(),
      endTime: null,
      duration: null,
      status: 'active',
      spans: [], // Tracing spans
      events: [], // Context events
      metadata: { ...metadata },
      children: [], // Child correlation IDs
      parents: metadata.parentIds || [], // Parent correlation IDs
    };

    this.correlationIdMap.set(correlationId, context);
    this.activeContexts.add(correlationId);
    this.stats.correlationsCreated++;

    this._recordHistory('CORRELATION_CREATED', {
      correlationId,
      metadata,
    });

    return correlationId;
  }

  /**
   * Propagate context to child/downstream service
   * @param {string} correlationId - Source correlation ID
   * @param {Object} metadata - Additional metadata for propagation
   * @returns {Object} Headers to send to downstream service
   */
  propagateContext(correlationId, metadata = {}) {
    const context = this.correlationIdMap.get(correlationId);
    if (!context) {
      this.stats.errors++;
      return {};
    }

    // Create child correlation ID
    const childId = this.createCorrelation({
      ...metadata,
      parentTraceId: context.traceId,
      parentIds: [correlationId],
    });

    const childContext = this.correlationIdMap.get(childId);

    // Track parent-child relationship
    context.children.push(childId);

    // Generate propagation headers
    const headers = {
      [this.correlationIdHeader]: correlationId,
      [this.requestIdHeader]: childContext.requestId,
      [this.traceIdHeader]: childContext.traceId,
      traceparent: this._generateW3CTraceParent(childContext.traceId, childContext.parentTraceId),
      'x-parent-trace-id': context.traceId,
    };

    this.stats.contextsPropagated++;

    this._recordHistory('CONTEXT_PROPAGATED', {
      sourceCorrelationId: correlationId,
      childCorrelationId: childId,
      headers: Object.keys(headers),
    });

    return headers;
  }

  /**
   * Register a span within correlation context
   * @param {string} correlationId - Correlation ID
   * @param {Object} spanData - Span information
   * @returns {Object} Span with metadata
   */
  addSpan(correlationId, spanData) {
    const context = this.correlationIdMap.get(correlationId);
    if (!context) {
      this.stats.errors++;
      return null;
    }

    const span = {
      spanId: this._generateId(),
      name: spanData.name || 'unnamed',
      kind: spanData.kind || 'INTERNAL', // INTERNAL, SERVER, CLIENT, PRODUCER, CONSUMER
      startTime: Date.now(),
      endTime: null,
      duration: null,
      status: 'running',
      attributes: spanData.attributes || {},
      events: [],
      links: spanData.links || [],
    };

    context.spans.push(span);
    this.stats.tracesCollected++;

    this._recordHistory('SPAN_ADDED', {
      correlationId,
      spanId: span.spanId,
      spanName: span.name,
    });

    return span;
  }

  /**
   * Complete a span
   * @param {string} correlationId - Correlation ID
   * @param {string} spanId - Span ID
   * @param {Object} result - Completion data
   */
  completeSpan(correlationId, spanId, result = {}) {
    const context = this.correlationIdMap.get(correlationId);
    if (!context) return;

    const span = context.spans.find((s) => s.spanId === spanId);
    if (!span) return;

    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = result.error ? 'error' : 'success';
    if (result.error) {
      span.error = result.error;
    }
  }

  /**
   * Record event in context
   * @param {string} correlationId - Correlation ID
   * @param {string} eventType - Event type
   * @param {Object} details - Event details
   */
  recordEvent(correlationId, eventType, details = {}) {
    const context = this.correlationIdMap.get(correlationId);
    if (!context) return;

    context.events.push({
      timestamp: Date.now(),
      type: eventType,
      details,
    });
  }

  /**
   * Complete correlation context
   * @param {string} correlationId - Correlation ID
   * @param {Object} result - Completion result
   */
  completeCorrelation(correlationId, result = {}) {
    const context = this.correlationIdMap.get(correlationId);
    if (!context) return;

    context.endTime = Date.now();
    context.duration = context.endTime - context.startTime;
    context.status = result.error ? 'error' : 'success';
    if (result.error) {
      context.error = result.error;
    }

    this.activeContexts.delete(correlationId);

    this._recordHistory('CORRELATION_COMPLETED', {
      correlationId,
      duration: context.duration,
      status: context.status,
    });
  }

  /**
   * Get correlation context
   * @param {string} correlationId - Correlation ID
   */
  getContext(correlationId) {
    return this.correlationIdMap.get(correlationId);
  }

  /**
   * Get trace tree (context with all spans and children)
   * @param {string} correlationId - Root correlation ID
   */
  getTraceTree(correlationId) {
    const context = this.correlationIdMap.get(correlationId);
    if (!context) return null;

    return {
      ...context,
      children: context.children.map((childId) => this.getTraceTree(childId)),
    };
  }

  /**
   * Link contexts (for distributed tracing across services)
   * @param {string} sourceId - Source correlation ID
   * @param {string} targetId - Target correlation ID
   * @param {string} linkType - Type of link (CHILD_OF, FOLLOWS_FROM, etc)
   */
  linkContexts(sourceId, targetId, linkType = 'CHILD_OF') {
    const sourceContext = this.correlationIdMap.get(sourceId);
    const targetContext = this.correlationIdMap.get(targetId);

    if (!sourceContext || !targetContext) {
      this.stats.errors++;
      return false;
    }

    if (!targetContext.parents.includes(sourceId)) {
      targetContext.parents.push(sourceId);
    }

    if (!sourceContext.children.includes(targetId)) {
      sourceContext.children.push(targetId);
    }

    this._recordHistory('CONTEXTS_LINKED', {
      sourceId,
      targetId,
      linkType,
    });

    return true;
  }

  /**
   * Extract correlation from headers
   * @param {Object} headers - HTTP headers
   * @returns {Object} Extracted correlation data
   */
  extractFromHeaders(headers) {
    const headersLower = {};
    for (const [key, value] of Object.entries(headers || {})) {
      headersLower[key.toLowerCase()] = value;
    }

    return {
      correlationId: headersLower[this.correlationIdHeader.toLowerCase()] || null,
      requestId: headersLower[this.requestIdHeader.toLowerCase()] || null,
      traceId: headersLower[this.traceIdHeader.toLowerCase()] || null,
      traceparent: headersLower['traceparent'] || null,
      parentTraceId: headersLower['x-parent-trace-id'] || null,
    };
  }

  /**
   * Get statistics
   */
  getStatistics() {
    return {
      correlationsCreated: this.stats.correlationsCreated,
      activeContexts: this.activeContexts.size,
      contextsPropagated: this.stats.contextsPropagated,
      tracesCollected: this.stats.tracesCollected,
      orphanedContexts: this.stats.orphanedContexts,
      errors: this.stats.errors,
      historyLength: this.history.length,
    };
  }

  /**
   * Get history entries
   * @param {Object} filter - Filter criteria
   */
  getHistory(filter = {}) {
    return this.history.filter((entry) => {
      if (filter.action && entry.action !== filter.action) {
        return false;
      }
      if (filter.correlationId && entry.details.correlationId !== filter.correlationId) {
        return false;
      }
      return true;
    });
  }

  /**
   * Clean up orphaned contexts (no children, completed)
   */
  cleanupOrphanedContexts() {
    const idsToDelete = [];

    for (const [id, context] of this.correlationIdMap) {
      if (
        context.status === 'success' &&
        context.children.length === 0 &&
        !this.activeContexts.has(id) &&
        Date.now() - context.endTime > 300000 // 5 minutes
      ) {
        idsToDelete.push(id);
        this.stats.orphanedContexts++;
      }
    }

    idsToDelete.forEach((id) => this.correlationIdMap.delete(id));

    return idsToDelete.length;
  }

  /**
   * Generate unique ID
   * @private
   */
  _generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate W3C trace parent header
   * @private
   */
  _generateW3CTraceParent(traceId, parentTraceId) {
    // Format: 00-traceid-spanid-sampled
    const version = '00';
    const sampled = '01'; // Always sampled for now
    const spanId = this._generateId().substring(0, 16);

    return `${version}-${traceId.substring(0, 32).padEnd(32, '0')}-${spanId}-${sampled}`;
  }

  /**
   * Record history entry
   * @private
   */
  _recordHistory(action, details) {
    this.history.push({
      timestamp: Date.now(),
      action,
      details,
    });

    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  /**
   * Reset manager
   */
  reset() {
    this.correlationIdMap.clear();
    this.activeContexts.clear();
    this.history = [];
    this.stats = {
      correlationsCreated: 0,
      contextsPropagated: 0,
      tracesCollected: 0,
      orphanedContexts: 0,
      errors: 0,
    };
  }
}

export default RequestCorrelationManager;
