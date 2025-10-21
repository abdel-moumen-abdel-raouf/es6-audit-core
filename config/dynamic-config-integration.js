/**
 * Dynamic Configuration Auto-Integration
 *
 * Automatic runtime configuration management with support for:
 * - Runtime config updates
 * - Rollback mechanism
 * - Change tracking
 * - Validation
 * - Zero-downtime updates
 *
 * @module DynamicConfigIntegration
 * @version 1.0.0
 */

import { DynamicConfigurationManager } from './dynamic-config.js';

export class DynamicConfigIntegration {
  static #manager = null;
  static #enabled = false;
  static #history = [];
  static #maxHistorySize = 50;

  /**
   *
   */
  static enable(config = {}) {
    if (this.#enabled) {
      return this.#manager;
    }

    this.#manager = new DynamicConfigurationManager({
      logLevel: config.defaultLogLevel ?? 'INFO',
      storage: config.storage,
      logger: config.logger || null,
    });

    this.#enabled = true;

    console.log('[DynamicConfig] ✅ Dynamic configuration enabled');

    return this.#manager;
  }

  /**
   *
   */
  static setModuleLogLevel(moduleName, level, duration = null) {
    if (!this.#enabled || !this.#manager) {
      throw new Error('Dynamic config not enabled');
    }

    const configKey = `moduleLogLevels.${moduleName}`;
    const previous = this.#manager.getConfig(configKey);

    this._recordChange({
      type: 'setModuleLogLevel',
      module: moduleName,
      level,
      duration,
      previous,
      timestamp: Date.now(),
    });

    try {
      this.#manager.updateConfig(configKey, level);
    } catch (e) {
      this.#manager.setConfig({ [`moduleLogLevels.${moduleName}`]: level });
    }

    if (duration) {
      setTimeout(() => {
        this.rollbackChange(moduleName);
      }, duration);
    }

    return {
      success: true,
      module: moduleName,
      level,
      previous,
      duration,
    };
  }

  /**
   *
   */
  static getModuleLogLevel(moduleName) {
    if (!this.#enabled || !this.#manager) {
      return 'INFO'; // default
    }
    try {
      return this.#manager.getConfig(`moduleLogLevels.${moduleName}`) ?? 'INFO';
    } catch {
      return 'INFO';
    }
  }

  /**
   *
   */
  static setGlobalLogLevel(level) {
    if (!this.#enabled || !this.#manager) {
      throw new Error('Dynamic config not enabled');
    }

    const previous = this.getConfig().logLevel ?? 'INFO';

    this._recordChange({
      type: 'setGlobalLogLevel',
      level,
      previous,
      timestamp: Date.now(),
    });

    try {
      this.#manager.updateConfig('logLevel', level);
    } catch (e) {
      this.#manager.setConfig({ logLevel: level });
    }

    return {
      success: true,
      level,
      previous,
    };
  }

  /**
   *
   */
  static getConfig() {
    if (!this.#enabled || !this.#manager) {
      return { logLevel: 'INFO' };
    }
    try {
      return this.#manager.getConfig() ?? { logLevel: 'INFO' };
    } catch {
      return { logLevel: 'INFO' };
    }
  }

  /**
   *
   */
  static setRateLimit(moduleName, tokensPerSecond) {
    if (!this.#enabled || !this.#manager) {
      throw new Error('Dynamic config not enabled');
    }

    const configKey = `moduleRateLimits.${moduleName}`;
    const previous = this.getModuleConfig(moduleName)?.rateLimitTPS;

    this._recordChange({
      type: 'setRateLimit',
      module: moduleName,
      tokensPerSecond,
      previous,
      timestamp: Date.now(),
    });

    try {
      this.#manager.updateConfig(configKey, tokensPerSecond);
    } catch (e) {
      this.#manager.setConfig({ [configKey]: tokensPerSecond });
    }

    return {
      success: true,
      module: moduleName,
      tokensPerSecond,
      previous,
    };
  }

  /**
   *
   */
  static getModuleConfig(moduleName) {
    if (!this.#enabled || !this.#manager) {
      return {};
    }
    try {
      const logLevel = this.#manager.getConfig(`moduleLogLevels.${moduleName}`);
      const rateLimit = this.#manager.getConfig(`moduleRateLimits.${moduleName}`);
      return {
        logLevel,
        rateLimitTPS: rateLimit,
      };
    } catch {
      return {};
    }
  }

  /**
   *
   */
  static setSampleRate(moduleName, sampleRate) {
    if (!this.#enabled || !this.#manager) {
      throw new Error('Dynamic config not enabled');
    }

    if (sampleRate < 0 || sampleRate > 1) {
      throw new Error('Sample rate must be between 0 and 1');
    }

    const configKey = `moduleSampleRates.${moduleName}`;
    const previous = this.getModuleConfig(moduleName)?.sampleRate;

    this._recordChange({
      type: 'setSampleRate',
      module: moduleName,
      sampleRate,
      previous,
      timestamp: Date.now(),
    });

    try {
      this.#manager.updateConfig(configKey, sampleRate);
    } catch (e) {
      this.#manager.setConfig({ [configKey]: sampleRate });
    }

    return {
      success: true,
      module: moduleName,
      sampleRate,
      previous,
    };
  }

  /**
   *
   */
  static rollbackChange(identifier) {
    if (!this.#enabled || !this.#manager) {
      throw new Error('Dynamic config not enabled');
    }

    const changeIndex = this.#history.findIndex(
      (ch) => ch.module === identifier || ch.type.includes(identifier)
    );

    if (changeIndex === -1) {
      throw new Error(`No change found for ${identifier}`);
    }

    const change = this.#history[changeIndex];
    const result = {
      success: true,
      rolledBack: change,
    };

    try {
      if (change.type === 'setModuleLogLevel') {
        const configKey = `moduleLogLevels.${change.module}`;
        this.#manager.updateConfig(configKey, change.previous);
        result.message = `Module ${change.module} log level rolled back to ${change.previous}`;
      } else if (change.type === 'setGlobalLogLevel') {
        this.#manager.updateConfig('logLevel', change.previous);
        result.message = `Global log level rolled back to ${change.previous}`;
      } else if (change.type === 'setRateLimit') {
        const configKey = `moduleRateLimits.${change.module}`;
        this.#manager.updateConfig(configKey, change.previous);
        result.message = `Rate limit rolled back for ${change.module}`;
      } else if (change.type === 'setSampleRate') {
        const configKey = `moduleSampleRates.${change.module}`;
        this.#manager.updateConfig(configKey, change.previous);
        result.message = `Sample rate rolled back for ${change.module}`;
      }
    } catch (e) {
      result.error = e.message;
      result.message = `Rollback attempted but may have failed: ${e.message}`;
    }

    this.#history.splice(changeIndex, 1);

    return result;
  }

  /**
   *
   */
  static getAllChanges() {
    return [...this.#history];
  }

  /**
   *
   */
  static getCurrentConfig() {
    if (!this.#enabled || !this.#manager) {
      return null;
    }

    return this.#manager.getConfig();
  }

  /**
   *
   */
  static _recordChange(change) {
    this.#history.push(change);

    if (this.#history.length > this.#maxHistorySize) {
      this.#history.shift();
    }
  }

  /**
   *
   */
  static patchEnhancedLogger(EnhancedLoggerClass) {
    const originalConstructor = EnhancedLoggerClass.prototype.constructor;

    EnhancedLoggerClass.prototype.constructor = function (moduleName, config) {
      originalConstructor.call(this, moduleName, config);

      if (config.dynamicConfig) {
        DynamicConfigIntegration.enable({
          defaultLogLevel: config.globalConfig?.logLevel || 'INFO',
          logger: config.logger || null,
        });

        this.dynamicConfig = true;
      }
    };

    return EnhancedLoggerClass;
  }

  /**
   *
   */
  static createEndpoint() {
    return {
      getConfig: () => {
        return DynamicConfigIntegration.getCurrentConfig();
      },

      getModuleConfig: (moduleName) => {
        return DynamicConfigIntegration.getModuleConfig(moduleName);
      },

      updateConfig: (updates) => {
        const results = [];

        for (const [module, config] of Object.entries(updates)) {
          if (config.logLevel) {
            results.push(DynamicConfigIntegration.setModuleLogLevel(module, config.logLevel));
          }
          if (config.rateLimitTPS) {
            results.push(DynamicConfigIntegration.setRateLimit(module, config.rateLimitTPS));
          }
          if (config.sampleRate !== undefined) {
            results.push(DynamicConfigIntegration.setSampleRate(module, config.sampleRate));
          }
        }

        return results;
      },

      rollback: (identifier) => {
        return DynamicConfigIntegration.rollbackChange(identifier);
      },

      getChanges: () => {
        return DynamicConfigIntegration.getChanges();
      },
    };
  }

  /**
   *
   */
  static getStats() {
    return {
      enabled: this.#enabled,
      changesCount: this.#history.length,
      changes: this.#history,
      currentConfig: this.#manager?.getConfig(),
    };
  }
}

export default DynamicConfigIntegration;
