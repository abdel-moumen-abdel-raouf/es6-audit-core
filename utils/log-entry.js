import { LoggingError } from '../error-handling/errors.js';
import { LogLevel } from './types.js';
import { DataSanitizer } from '../sanitizer/data-sanitizer.js';

/**
 * Sanitizes an object by redacting sensitive values using DataSanitizer.
 * Sensitive keys (password, token, secret, apiKey, etc.) will have their values
 * masked/redacted to prevent accidental exposure of secrets in log files.
 * 
 * Creates a shallow copy of the object with sensitive values replaced.
 * Does NOT modify the original object.
 * 
 * @param obj - The object to sanitize
 * @returns A new object with sensitive values masked, or null if obj is falsy
 * 
 * @example
 * sanitizeContext({ username: 'admin', password: 'secret123' })
 * // Returns: { username: 'admin', password: 's*' }
 * 
 * @example
 * sanitizeContext({ email: 'user@example.com', apiKey: 'sk_live_12345' })
 * // Returns: { email: 'user@example.com', apiKey: 'sk**' }
 * 
 * @private
 */
const sanitizer = new DataSanitizer({
    // Secure-by-default: mask common PII patterns
    maskEmails: true,
    maskIPs: true,
    maskPhones: true
});

function sanitizeContext(obj) {
    if (!obj || typeof obj !== 'object') {
        return obj;
    }

    // Use EnhancedSanitizer to sanitize all data
    return sanitizer.sanitize(obj, false); // trackStats=false for performance
}
/**
 * Represents a single log entry with all necessary metadata.
 * Immutable and contains all data needed for transport processing.
 * 
 * SECURITY: Context objects are automatically sanitized to remove sensitive values
 * (passwords, tokens, API keys, etc.) before storing. This prevents accidental
 * exposure of secrets in log files.
 */
export class LogEntry {
    /**
     * Creates a new LogEntry instance.
     * @param level - The severity level of the log entry.
     * @param moduleName - The name of the module generating the log.
     * @param message - The main log message.
     * @param context - Optional additional structured context data.
     *                  Sensitive keys (password, token, secret, etc.) will be automatically redacted.
     */
    constructor(level, moduleName, message, context) {
        this.level = level;
        this.moduleName = moduleName;
        this.message = message;
        // SECURITY: Sanitize context to redact sensitive values
        this.context = sanitizeContext(context);
        this.timestamp = new Date();
        this.validate();
    }
    /**
     * Validates the log entry for required properties and constraints.
     * @throws {LoggingError} When validation fails.
     */
    validate() {
        if (!this.moduleName || typeof this.moduleName !== 'string') {
            throw new LoggingError('Module name must be a non-empty string');
        }
        if (!this.message || typeof this.message !== 'string') {
            throw new LoggingError('Log message must be a non-empty string');
        }
        if (this.context && (typeof this.context !== 'object' || Array.isArray(this.context))) {
            throw new LoggingError('Log context must be a plain object');
        }
    }
    /**
     * Creates a formatted string representation of the log entry.
     * @returns Formatted log string.
     */
    toString() {
        const levelName = LogLevel[this.level];
        const timestamp = this.timestamp.toISOString();
        const contextStr = this.context ? ` - ${JSON.stringify(this.context)}` : '';
        return `[${timestamp}] [${this.moduleName}] [${levelName}]: ${this.message}${contextStr}`;
    }
}
