import { LogLevel } from '../utils/types.js';
import { BaseTransport } from '../transports/base-transport.js';
import { LoggingError } from '../error-handling/errors.js';
/**
 * Configuration class for the Logger.
 * Enforces immutability and validation of logger configuration.
 */
export class LoggerConfig {
    /**
     * Creates a new LoggerConfig instance with validated configuration.
     * @param config - The configuration object.
     * @throws {LoggingError} When configuration validation fails.
     */
    constructor(config) {
        this.validateConfig(config);
        this.level = config.level;
        this.moduleName = config.moduleName;
        this.transports = Object.freeze([...config.transports]);
        // Deep freeze to ensure complete immutability
        Object.freeze(this);
    }
    /**
     * Validates the configuration object for required properties and constraints.
     * @param config - The configuration object to validate.
     * @throws {LoggingError} When validation fails.
     */
    validateConfig(config) {
        if (typeof config.level !== 'number' || !(config.level in LogLevel)) {
            throw new LoggingError(`Invalid log level: ${config.level}. Must be a valid LogLevel enum value.`);
        }
        if (!config.moduleName || typeof config.moduleName !== 'string') {
            throw new LoggingError('Module name must be a non-empty string');
        }
        if (!config.moduleName.trim()) {
            throw new LoggingError('Module name cannot be empty or whitespace');
        }
        if (!Array.isArray(config.transports)) {
            throw new LoggingError('Transports must be an array of BaseTransport instances');
        }
        if (config.transports.length === 0) {
            throw new LoggingError('At least one transport must be configured');
        }
        config.transports.forEach((transport, index) => {
            if (!(transport instanceof BaseTransport)) {
                throw new LoggingError(`Transport at index ${index} must be an instance of BaseTransport`);
            }
        });
    }
}
