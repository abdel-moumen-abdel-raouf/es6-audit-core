/**
 * Internal / experimental exports.
 * These are not part of the stable public API and may change without notice.
 * Import from 'es6-audit-core/internal' only if you accept the instability.
 */

// Experimental loggers
export { default as ResilientLogger } from './experimental/resilient-logger.js';
export { default as AdaptiveLogger } from './experimental/adaptive-logger.js';

// Advanced rate limiting
export { default as RateLimiterAdvanced } from './experimental/rate-limiter-advanced.js';
export { default as RateLimiterStrict } from './experimental/rate-limiter-strict.js';

// Transport helpers and storage utilities
export { default as BatchQueue } from './transports/batch-queue.js';
export { default as BatchSequencer } from './transports/batch-sequencer.js';
export { default as LogArchiver } from './transports/log-archiver.js';
export { default as LogRotator } from './transports/log-rotator.js';
export { default as LogCleanupPolicy } from './transports/log-cleanup-policy.js';
export { default as PayloadRotation } from './transports/payload-rotation.js';

// Error handling utilities and advanced sanitization
export { default as ContextualLogEntry } from './utils/contextual-log-entry.js';
export { default as ErrorHandler } from './utils/error-handler.js';
export { default as AdvancedSanitizer } from './utils/sanitizer-advanced.js';

// Workers
export { default as WorkerThreadPool } from './workers/worker-thread-pool.js';
export { default as WorkerThreadIntegration } from './workers/worker-thread-integration.js';
export { default as WorkerIntegration } from './workers/worker-integration.js';

// Tracing integration
export { default as TracingIntegration } from './tracing/tracing-integration.js';

// Formatting and output customization utilities
export { default as StackTrace } from './utils/stack-trace.js';
export { default as LogFormatter } from './utils/log-formatter.js';
export { default as ModulePatternMatcher } from './utils/module-pattern-matcher.js';
export { default as OutputCustomizer } from './utils/output-customizer.js';
export { default as MemorySafeContext } from './utils/memory-safe-context.js';
export { default as SupportSystems } from './utils/support-systems.js';
