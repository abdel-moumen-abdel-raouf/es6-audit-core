/**
 * AuditCore - Enterprise-Grade Logging & Audit System
 * Exports organized by functional category
 */

// ========================================
// Core Logging Module
// ⭐ Official Production Logger: CoreLogger
// ========================================
export { CoreLogger } from './core/core-logger.js';
export { CoreLogger as EnhancedLogger } from './core/core-logger.js';
export { CoreLogger as EnhancedLoggerV2 } from './core/core-logger.js';
export { CoreLogger as EnhancedLoggerV3 } from './core/core-logger.js';
export { CoreLogger as Logger } from './core/core-logger.js';

// Additional specialized loggers
export { AdaptiveLoggerFixed as AdaptiveLogger } from './core/adaptive-logger.js';
export { ResilientLoggerFixed as ResilientLogger } from './core/resilient-logger.js';

// ========================================
// Configuration
// ========================================
export { LoggerConfig } from './config/logger-config.js';
export { ModuleConfig } from './config/module-config.js';
export { LogPresets } from './config/log-presets.js';
export { DynamicConfigurationManager as DynamicConfig } from './config/dynamic-config.js';
export { DynamicConfigIntegration } from './config/dynamic-config-integration.js';
export { CoreLoggerConfig } from './core/core-logger-config.js';
export { CoreLoggerConfig as EnhancedLoggerConfig } from './core/core-logger-config.js';

// ========================================
// Context Management
// ========================================
export { LogContext } from './context/log-context.js';
export { RequestContext } from './context/request-context.js';

// ========================================
// Transport Layer
// ========================================
export { ConsoleTransport } from './transports/console-transport.js';
export { FileTransport } from './transports/file-transport.js';
export { AdvancedHttpTransport as HttpTransport } from './transports/http-transport.js';
export { BatchQueue } from './transports/batch-queue.js';
export { BatchSequencer } from './transports/batch-sequencer.js';
export { default as LogBuffer } from './transports/log-buffer.js';
export { AdaptiveLogBuffer } from './transports/adaptive-log-buffer.js';
export { AdaptiveLogBuffer as EnhancedLogBuffer } from './transports/adaptive-log-buffer.js';
export { default as LogArchiver } from './transports/log-archiver.js';
export { LogRotator } from './transports/log-rotator.js';
export { default as LogCleanupPolicy } from './transports/log-cleanup-policy.js';
export { PayloadOptimizer } from './transports/payload-rotation.js';

// ========================================
// Rate Limiting
// ========================================
export { RateLimiter } from './rate-limiting/rate-limiter.js';
export { AdvancedRateLimiter as RateLimiterAdvanced } from './rate-limiting/rate-limiter-advanced.js';
export { StrictBurstLimiter, MultiLayerRateLimiter } from './rate-limiting/rate-limiter-strict.js';

// ========================================
// Error Handling
// ========================================
export { LoggingError } from './error-handling/errors.js';
export { ContextualLogEntry } from './error-handling/contextual-log-entry.js';
export { ContextualLogEntry as EnhancedErrorLogEntry } from './error-handling/contextual-log-entry.js';
export { ErrorHandler } from './error-handling/error-handler.js';

// ========================================
// Sanitization
// ========================================
export { DataSanitizer } from './sanitizer/data-sanitizer.js';
export { DataSanitizer as EnhancedSanitizer } from './sanitizer/data-sanitizer.js';
export { EncodingDetector } from './sanitizer/encoding-detector.js';
export { AdvancedSanitizer } from './sanitizer/sanitizer-advanced.js';

// ========================================
// Resilience & Circuit Breaking
// ========================================
export { CircuitBreakerEnhanced as CircuitBreaker } from './resilience/circuit-breaker.js';

// ========================================
// Worker Thread Integration
// ========================================
export { WorkerThreadPool } from './workers/worker-thread-pool.js';
export { LoggerWithWorkerThreads as WorkerThreadIntegration } from './workers/worker-thread-integration.js';
export { LoggerWorkerIntegration } from './workers/worker-integration.js';

// ========================================
// Distributed Tracing
// ========================================
export { DistributedTracer as DistributedTracing } from './tracing/distributed-tracing.js';
export { DistributedTracingIntegration } from './tracing/tracing-integration.js';

// ========================================
// Synchronization Utilities
// ========================================
export { Mutex } from './sync/mutex.js';

// ========================================
// General Utilities
// ========================================
export { LogLevel } from './utils/types.js';
export { LogEntry } from './utils/log-entry.js';
export { StackTraceExtractor as StackTrace } from './utils/stack-trace.js';
export { LogFormatterManager as LogFormatter } from './utils/log-formatter.js';
export { ModulePatternMatcher } from './utils/module-pattern-matcher.js';
export { OutputCustomizer } from './utils/output-customizer.js';
export { ContextManager as MemorySafeContext } from './utils/memory-safe-context.js';
export { Sampler as SupportSystems } from './utils/support-systems.js';
