/**
 * CoreLoggerConfig
 *
 * Configuration manager for CoreLogger with support for:
 * - Module-specific log levels
 * - Dynamic level updates
 * - Pattern-based configuration
 *
 * Integrates with ModuleConfig for advanced module management
 */

import { LogLevel } from '../utils/types.js';
import { ModuleConfig } from '../config/module-config.js';
import { BaseTransport } from '../transports/base-transport.js';
import { LoggingError } from '../error-handling/errors.js';

export class CoreLoggerConfig {
  /**
   * Create new CoreLoggerConfig
   *
   * @param {Object} config - Configuration object
   * @param {number} config.defaultLevel - Default log level (default: LogLevel.INFO)
   * @param {BaseTransport[]} config.transports - List of transports (required)
   * @param {string} config.moduleName - Current module name (default: 'app')
   * @param {Object} config.moduleConfig - ModuleConfig instance (optional)
   *
   * @throws {LoggingError} If configuration is invalid
   */
  constructor(config = {}) {
    this._validateConfig(config);

    this.defaultLevel = config.defaultLevel ?? LogLevel.INFO;
    this.moduleName = config.moduleName ?? 'app';
    this.transports = Object.freeze([...config.transports]);

    if (config.moduleConfig instanceof ModuleConfig) {
      this.moduleConfig = config.moduleConfig;
    } else {
      this.moduleConfig = new ModuleConfig(this.defaultLevel);
    }

    this.listeners = [];

    this._setupModuleConfigListener();

    Object.freeze(this);
  }

  /**
   *
   * @private
   */
  _validateConfig(config) {
    if (!config.transports || !Array.isArray(config.transports)) {
      throw new LoggingError('Transports must be an array');
    }

    if (config.transports.length === 0) {
      throw new LoggingError('At least one transport must be configured');
    }

    config.transports.forEach((transport, index) => {
      if (!(transport instanceof BaseTransport)) {
        throw new LoggingError(`Transport at index ${index} must be an instance of BaseTransport`);
      }
    });

    if (config.defaultLevel !== undefined) {
      if (typeof config.defaultLevel !== 'number' || !(config.defaultLevel in LogLevel)) {
        throw new LoggingError(`Invalid default log level: ${config.defaultLevel}`);
      }
    }

    if (config.moduleName !== undefined) {
      if (typeof config.moduleName !== 'string' || !config.moduleName.trim()) {
        throw new LoggingError('Module name must be a non-empty string');
      }
    }

    if (config.moduleConfig !== undefined && !(config.moduleConfig instanceof ModuleConfig)) {
      throw new LoggingError('moduleConfig must be an instance of ModuleConfig');
    }
  }

  /**
   *
   * @private
   */
  _setupModuleConfigListener() {
    this.moduleConfig.onChange((change) => {
      this._notifyListeners({
        type: 'moduleConfigChanged',
        change,
      });
    });
  }

  /**
   *
   *
   */
  getLogLevelForModule(moduleName) {
    if (!moduleName) {
      return this.defaultLevel;
    }

    return this.moduleConfig.getLogLevelForModule(moduleName);
  }

  /**
   *
   */
  setModuleLevel(moduleName, level) {
    this.moduleConfig.setModuleLevel(moduleName, level);
  }

  /**
   *
   */
  setPatternLevel(pattern, level) {
    this.moduleConfig.setPatternLevel(pattern, level);
  }

  /**
   *
   * @returns {ModuleConfig}
   */
  getModuleConfig() {
    return this.moduleConfig;
  }

  /**
   *
   * @returns {BaseTransport[]}
   */
  getTransports() {
    return this.transports;
  }

  /**
   *
   * @returns {Object}
   */
  getInfo() {
    return {
      defaultLevel: LogLevel[this.defaultLevel],
      moduleName: this.moduleName,
      transportsCount: this.transports.length,
      transportsTypes: this.transports.map((t) => t.constructor.name),
      moduleConfigSize: this.moduleConfig.getAll(),
    };
  }

  /**
   *
   */
  onChange(callback) {
    if (typeof callback !== 'function') {
      throw new LoggingError('Callback must be a function');
    }

    this.listeners.push(callback);

    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   *
   * @private
   */
  _notifyListeners(change) {
    for (const listener of this.listeners) {
      try {
        listener(change);
      } catch (error) {
        console.error('Error in EnhancedLoggerConfig listener:', error);
      }
    }
  }

  /**
   *
   * @returns {string}
   */
  toJSON() {
    return JSON.stringify({
      defaultLevel: this.defaultLevel,
      moduleName: this.moduleName,
      transportsCount: this.transports.length,
      moduleConfig: this.moduleConfig.getAll(),
    });
  }
}

export default CoreLoggerConfig;
