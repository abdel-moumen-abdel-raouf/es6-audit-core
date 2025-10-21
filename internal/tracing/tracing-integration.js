/**
 * @internal
 * This module is for internal/experimental use only and is not part of the public API.
 * It may change or be removed without notice.
 */
/**
 * Distributed Tracing Auto-Integration - FIXED
 *
 */

/**
 * Distributed Tracing Integration Module
 *
 * Core tracing integration for distributed system monitoring:
 * - Trace context management
 * - Span creation and tracking
 * - Context propagation
 *
 * @module TracingIntegration
 * @version 1.0.0
 */

import { TraceContext } from './distributed-tracing.js';

export class DistributedTracingIntegration {
  static #globalContext = null;
  static #enabled = false;

  static enable(config = {}) {
    if (this.#enabled) return;
    this.#enabled = true;
    console.log('[DistributedTracing] ✅ Enabled');
    return { enabled: true };
  }

  static getOrCreateContext() {
    if (!this.#enabled) return null;
    if (!this.#globalContext) {
      this.#globalContext = new TraceContext();
    }
    return this.#globalContext;
  }

  static startSpan(operationName, parentContext = null) {
    if (!this.#enabled) return null;
    const context = parentContext || this.getOrCreateContext();
    if (!context) return null;
    return {
      traceId: context.traceId,
      spanId: this._generateSpanId(),
      parentSpanId: context.spanId,
      operationName,
      startTime: Date.now(),
    };
  }

  static endSpan(span, error = null) {
    if (!span) return null;
    return {
      ...span,
      endTime: Date.now(),
      duration: Date.now() - span.startTime,
      error: error ? error.message : null,
    };
  }

  static enrichLogEntry(entry, context = null) {
    if (!this.#enabled) return entry;
    const traceContext = context || this.getOrCreateContext();
    if (!traceContext) return entry;
    return {
      ...entry,
      traceId: traceContext.traceId,
      spanId: traceContext.spanId,
      parentSpanId: traceContext.parentSpanId,
      traceFlags: 1,
    };
  }

  static getHTTPHeaders(context = null) {
    if (!this.#enabled) return {};
    const traceContext = context || this.getOrCreateContext();
    if (!traceContext) return {};
    return {
      'X-Trace-ID': traceContext.traceId,
      'X-Span-ID': traceContext.spanId,
      'X-Parent-Span-ID': traceContext.parentSpanId || 'null',
      Traceparent: `00-${traceContext.traceId}-${traceContext.spanId}-01`,
    };
  }

  static extractHeaders(headers) {
    if (!this.#enabled) return null;
    const traceparent = headers?.traceparent || headers?.['X-Traceparent'];
    if (traceparent) {
      const parts = traceparent.split('-');
      if (parts.length >= 4) {
        return {
          traceId: parts[1],
          spanId: parts[2],
          sampled: parts[3] === '01',
        };
      }
    }
    return {
      traceId: headers?.['x-trace-id'] || headers?.['X-Trace-ID'],
      spanId: headers?.['x-span-id'] || headers?.['X-Span-ID'],
      parentSpanId: headers?.['x-parent-span-id'] || headers?.['X-Parent-Span-ID'],
    };
  }

  static patchEnhancedLogger(EnhancedLoggerClass) {
    const originalLog = EnhancedLoggerClass.prototype.log;
    EnhancedLoggerClass.prototype.log = function (...args) {
      let entry = args[0] || {};
      if (typeof entry !== 'object') {
        entry = { message: entry };
      }
      const enrichedEntry = DistributedTracingIntegration.enrichLogEntry(entry);
      return originalLog.call(this, enrichedEntry, ...args.slice(1));
    };
    return EnhancedLoggerClass;
  }

  static patchHttpTransport(HttpTransportClass) {
    const originalSendWithRetry = HttpTransportClass.prototype._sendWithRetry;
    HttpTransportClass.prototype._sendWithRetry = async function (payload, attempt = 0) {
      const headers = {
        ...this.headers,
        ...DistributedTracingIntegration.getHTTPHeaders(),
      };
      const originalHeaders = this.headers;
      this.headers = headers;
      try {
        return await originalSendWithRetry.call(this, payload, attempt);
      } finally {
        this.headers = originalHeaders;
      }
    };
    return HttpTransportClass;
  }

  static _generateSpanId() {
    return Math.random().toString(16).substring(2, 18);
  }

  static getStats() {
    return {
      enabled: this.#enabled,
      context: this.#globalContext
        ? {
            traceId: this.#globalContext.traceId,
            spanId: this.#globalContext.spanId,
          }
        : null,
    };
  }
}

export default DistributedTracingIntegration;
