/**
 * Internal API (unstable) - subject to change without notice
 * Import path: @svg-character-engine/audit-core/internal
 */

// Core aliases and specialized loggers
export { CoreLogger as EnhancedLogger } from '../core/core-logger.js';
export { CoreLogger as EnhancedLoggerV2 } from '../core/core-logger.js';
export { CoreLogger as EnhancedLoggerV3 } from '../core/core-logger.js';
export { AdaptiveLoggerFixed as AdaptiveLogger } from '../core/adaptive-logger.js';
export { ResilientLoggerFixed as ResilientLogger } from '../core/resilient-logger.js';

// Configuration helpers and presets
export { LogPresets } from '../config/log-presets.js';
export { DynamicConfigIntegration } from '../config/dynamic-config-integration.js';

// Transport helpers and storage utilities
export { BatchQueue } from '../transports/batch-queue.js';
export { BatchSequencer } from '../transports/batch-sequencer.js';
export { default as LogArchiver } from '../transports/log-archiver.js';
export { LogRotator } from '../transports/log-rotator.js';
export { default as LogCleanupPolicy } from '../transports/log-cleanup-policy.js';
export { PayloadOptimizer } from '../transports/payload-rotation.js';

// Advanced rate limiting
export { AdvancedRateLimiter as RateLimiterAdvanced } from '../rate-limiting/rate-limiter-advanced.js';
export { StrictBurstLimiter, MultiLayerRateLimiter } from '../rate-limiting/rate-limiter-strict.js';

// Error handling utilities
export { ContextualLogEntry as EnhancedErrorLogEntry } from '../error-handling/contextual-log-entry.js';
export { ErrorHandler } from '../error-handling/error-handler.js';

// Advanced sanitization
export { AdvancedSanitizer } from '../sanitizer/sanitizer-advanced.js';

// Resilience
export { CircuitBreakerEnhanced as CircuitBreaker } from '../resilience/circuit-breaker.js';

// Worker thread integrations
export { WorkerThreadPool } from '../workers/worker-thread-pool.js';
export { LoggerWithWorkerThreads as WorkerThreadIntegration } from '../workers/worker-thread-integration.js';
export { LoggerWorkerIntegration } from '../workers/worker-integration.js';

// Distributed tracing
export { DistributedTracer as DistributedTracing } from '../tracing/distributed-tracing.js';
export { DistributedTracingIntegration } from '../tracing/tracing-integration.js';

// Formatting and output customization
export { StackTraceExtractor as StackTrace } from '../utils/stack-trace.js';
export { LogFormatterManager as LogFormatter } from '../utils/log-formatter.js';
export { ModulePatternMatcher } from '../utils/module-pattern-matcher.js';
export { OutputCustomizer } from '../utils/output-customizer.js';
export { ContextManager as MemorySafeContext } from '../utils/memory-safe-context.js';
export { Sampler as SupportSystems } from '../utils/support-systems.js';
