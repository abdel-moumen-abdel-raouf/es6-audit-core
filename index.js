/**
 * AuditCore - Enterprise-Grade Logging & Audit System
 * Public exports: STABLE API ONLY
 */

// Core Logger
export { CoreLogger } from './core/core-logger.js';
export { CoreLogger as Logger } from './core/core-logger.js';

// Configuration
export { CoreLoggerConfig } from './core/core-logger-config.js';
export { LoggerConfig } from './config/logger-config.js';
export { ModuleConfig } from './config/module-config.js';
export { DynamicConfigurationManager as DynamicConfig } from './config/dynamic-config.js';

// Context
export { LogContext } from './context/log-context.js';
export { RequestContext } from './context/request-context.js';

// Transports and buffers
export { ConsoleTransport } from './transports/console-transport.js';
export { FileTransport } from './transports/file-transport.js';
export { AdvancedHttpTransport as HttpTransport } from './transports/http-transport.js';
export { default as LogBuffer } from './transports/log-buffer.js';
export { AdaptiveLogBuffer } from './transports/adaptive-log-buffer.js';

// Rate limiting (basic)
export { RateLimiter } from './rate-limiting/rate-limiter.js';

// Errors
export { LoggingError } from './error-handling/errors.js';

// Sanitization
export { DataSanitizer } from './sanitizer/data-sanitizer.js';
export { EncodingDetector } from './sanitizer/encoding-detector.js';

// Synchronization
export { Mutex } from './sync/mutex.js';

// General types
export { LogLevel } from './utils/types.js';
export { LogEntry } from './utils/log-entry.js';
