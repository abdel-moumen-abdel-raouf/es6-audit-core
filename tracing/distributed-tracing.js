/**
 * Distributed Tracing Integration - Fix #22
 * 
 * Ø§Ù„Ù…Ù…ÙŠØ²Ø§Øª:
 * - Automatic trace ID generation
 * - OpenTelemetry compatibility
 * - Context propagation across services
 * - Span tracking
 * 
 * @author audit-core
 * @version 1.0.0-fix22
 */

import { randomUUID } from 'crypto';

export class TraceContext {
  /**
   * Distributed trace context
   */
  constructor(config = {}) {
    // âœ… Trace ID (unique for entire request)
    this.traceId = config.traceId || randomUUID();
    
    // âœ… Span ID (unique for this operation)
    this.spanId = config.spanId || randomUUID().replace(/-/g, '').substring(0, 16);
    
    // Parent span ID (for nested operations)
    this.parentSpanId = config.parentSpanId || null;
    
    // Service name
    this.service = config.service || 'unknown-service';
    
    // Timestamp
    this.timestamp = config.timestamp || Date.now();
    
    // Tags/labels
    this.tags = config.tags || {};
    
    // Baggage (metadata to propagate)
    this.baggage = config.baggage || {};
  }

  /**
   * Create child span
   */
  createChildSpan(operationName, config = {}) {
    const childSpan = new TraceContext({
      traceId: this.traceId,  // âœ… Same trace ID
      spanId: randomUUID().replace(/-/g, '').substring(0, 16),
      parentSpanId: this.spanId,  // âœ… Point to parent
      service: this.service,
      tags: {
        ...this.tags,
        operationName,
        ...config.tags
      },
      baggage: { ...this.baggage, ...config.baggage }
    });

    return childSpan;
  }

  /**
   * Convert to OpenTelemetry format
   */
  toOpenTelemetry() {
    return {
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId,
      service: this.service,
      timestamp: this.timestamp,
      attributes: this.tags,
      baggage: this.baggage
    };
  }

  /**
   * Convert to W3C Trace Context format
   */
  toW3CTraceContext() {
    // Format: version-traceId-spanId-traceFlags
    const traceFlags = this.parentSpanId ? '01' : '00'; // 01 = traced, 00 = not traced
    return `00-${this.traceId.replace(/-/g, '')}-${this.spanId}-${traceFlags}`;
  }

  /**
   * Convert to Jaeger format
   */
  toJaegerFormat() {
    return {
      uber_trace_id: `${this.traceId}:${this.spanId}:${this.parentSpanId || 0}:1`
    };
  }

  /**
   * Serialize for HTTP headers
   */
  getHeaders() {
    return {
      'traceparent': this.toW3CTraceContext(),
      'x-trace-id': this.traceId,
      'x-span-id': this.spanId,
      'x-parent-span-id': this.parentSpanId || '',
      'x-service': this.service
    };
  }

  /**
   * Parse from HTTP headers
   */
  static fromHeaders(headers) {
    const traceparent = headers['traceparent'];
    
    if (traceparent) {
      // W3C format: version-traceId-spanId-traceFlags
      const parts = traceparent.split('-');
      return new TraceContext({
        traceId: parts[1],
        spanId: parts[2],
        service: headers['x-service'] || 'unknown-service'
      });
    }

    // Fallback
    return new TraceContext({
      traceId: headers['x-trace-id'] || randomUUID(),
      spanId: headers['x-span-id'] || randomUUID().replace(/-/g, '').substring(0, 16),
      service: headers['x-service'] || 'unknown-service'
    });
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      traceId: this.traceId,
      spanId: this.spanId,
      service: this.service,
      depth: this.parentSpanId ? 'child' : 'root'
    };
  }
}

// ============================================
// Distributed Tracer
// ============================================

export class DistributedTracer {
  /**
   * Manage distributed traces
   */
  constructor(config = {}) {
    this.serviceName = config.serviceName || 'app';
    this.enabled = config.enabled ?? true;
    this.samplingRate = config.samplingRate ?? 1.0; // 100% by default
    
    this.activeTraces = new Map(); // traceId -> TraceContext
    this.stats = {
      traced: 0,
      sampled: 0,
      propagated: 0,
      errors: 0
    };
  }

  /**
   * Start a new trace
   */
  startTrace(operationName, config = {}) {
    if (!this.enabled) return null;

    // âœ… Sampling decision
    if (Math.random() > this.samplingRate) {
      return null;
    }

    const trace = new TraceContext({
      traceId: randomUUID(),
      service: this.serviceName,
      tags: {
        operationName,
        ...config.tags
      },
      baggage: config.baggage
    });

    this.activeTraces.set(trace.traceId, trace);
    this.stats.traced++;

    return trace;
  }

  /**
   * Continue trace from headers
   */
  continueTrace(headers, operationName) {
    if (!this.enabled) return null;

    try {
      const trace = TraceContext.fromHeaders(headers);
      
      // Create child span for this operation
      const childSpan = trace.createChildSpan(operationName, {
        service: this.serviceName
      });

      this.activeTraces.set(trace.traceId, childSpan);
      this.stats.propagated++;

      return childSpan;

    } catch (error) {
      console.error('[DistributedTracer] Error continuing trace:', error);
      this.stats.errors++;
      return null;
    }
  }

  /**
   * End trace
   */
  endTrace(traceId) {
    this.activeTraces.delete(traceId);
  }

  /**
   * Get current trace
   */
  getTrace(traceId) {
    return this.activeTraces.get(traceId);
  }

  /**
   * Get statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      activeTraces: this.activeTraces.size,
      samplingRate: this.samplingRate
    };
  }
}

// ============================================
// Log Entry with Trace Information
// ============================================

export class LogEntryWithTrace {
  /**
   * Log entry that includes trace information
   */
  constructor(entry, traceContext) {
    this.entry = entry;
    this.traceContext = traceContext;
    this.timestamp = Date.now();
  }

  /**
   * Serialize for transmission
   */
  serialize() {
    const base = typeof this.entry === 'string' 
      ? { message: this.entry }
      : this.entry;

    if (this.traceContext) {
      return {
        ...base,
        trace: this.traceContext.toOpenTelemetry(),
        traceId: this.traceContext.traceId,
        spanId: this.traceContext.spanId,
        service: this.traceContext.service
      };
    }

    return base;
  }

  /**
   * Get HTTP headers for propagation
   */
  getHeaders() {
    if (this.traceContext) {
      return this.traceContext.getHeaders();
    }
    return {};
  }
}

// ============================================
// Logger Integration
// ============================================

export class LoggerWithDistributedTracing {
  /**
   * Logger that integrates distributed tracing
   */
  constructor(config = {}) {
    this.logger = config.logger; // Main logger instance
    this.tracer = new DistributedTracer({
      serviceName: config.serviceName || 'app',
      enabled: config.tracingEnabled ?? true,
      samplingRate: config.samplingRate ?? 1.0
    });

    this.currentTrace = null;
    this.stats = {
      logged: 0,
      traced: 0
    };
  }

  /**
   * Start operation with tracing
   */
  startOperation(operationName, config = {}) {
    this.currentTrace = this.tracer.startTrace(operationName, config);
    return this.currentTrace;
  }

  /**
   * Continue operation (incoming request)
   */
  continueOperation(headers, operationName) {
    this.currentTrace = this.tracer.continueTrace(headers, operationName);
    return this.currentTrace;
  }

  /**
   * Log with trace
   */
  log(message, level = 'INFO') {
    const entry = {
      message,
      level,
      timestamp: new Date().toISOString()
    };

    // âœ… Add trace information
    if (this.currentTrace) {
      const entryWithTrace = new LogEntryWithTrace(entry, this.currentTrace);
      this.logger.log(entryWithTrace.serialize());
      this.stats.traced++;
    } else {
      this.logger.log(entry);
    }

    this.stats.logged++;
  }

  /**
   * End operation
   */
  endOperation() {
    if (this.currentTrace) {
      this.tracer.endTrace(this.currentTrace.traceId);
      this.currentTrace = null;
    }
  }

  /**
   * Get propagation headers (for outbound requests)
   */
  getPropagationHeaders() {
    if (this.currentTrace) {
      return this.currentTrace.getHeaders();
    }
    return {};
  }

  /**
   * Get statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      tracer: this.tracer.getStatistics()
    };
  }
}

// ============================================
// Configuration Helper
// ============================================

export function createLoggerWithTracing(config = {}) {
  /**
   * Factory function
   */
  return new LoggerWithDistributedTracing({
    logger: config.logger,
    serviceName: config.serviceName,
    tracingEnabled: config.tracingEnabled ?? true,
    samplingRate: config.samplingRate ?? 1.0
  });
}

export default DistributedTracer;

