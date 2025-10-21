/**
 * Core Logging Module - AuditCore
 * Central logging implementations and configurations
 *
 * ⭐ Official Production Logger: CoreLogger
 * - Full buffer management & rate limiting
 * - Transform context tracking
 * - Hierarchical object support
 * - Comprehensive statistics
 */

// ⭐ OFFICIAL PRODUCTION LOGGER
export { CoreLogger } from './core-logger.js';
export { CoreLogger as EnhancedLogger } from './core-logger.js';
export { CoreLogger as EnhancedLoggerV2 } from './core-logger.js';
export { CoreLogger as EnhancedLoggerV3 } from './core-logger.js';
export { CoreLogger as Logger } from './core-logger.js';

// Configurations
export { CoreLoggerConfig } from './core-logger-config.js';
export { CoreLoggerConfig as EnhancedLoggerConfig } from './core-logger-config.js';
export { StructuredLoggingSchema } from './structured-logging-schema.js';

// Additional Loggers (if specialized use cases needed)
export { AdaptiveLogger } from './adaptive-logger.js';
export { ResilientLogger } from './resilient-logger.js';
