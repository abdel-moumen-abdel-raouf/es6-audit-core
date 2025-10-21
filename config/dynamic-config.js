/**
 * Dynamic Configuration System - Fix #23
 *
 *
 * - Safe runtime config updates
 * - Module-level log level changes
 * - Config validation + rollback mechanism
 * - Zero downtime updates
 */

export class DynamicConfigurationManager {
  constructor(config = {}) {
    this.currentConfig = this._deepClone(config);
    this.previousConfig = null;
    this.configHistory = [];
    this.maxHistorySize = config.maxHistorySize || 100;
    this.validators = new Map();
    this.listeners = new Set();
    this.auditLog = [];

    this.stats = {
      updates: 0,
      rollbacks: 0,
      validationFailures: 0,
      listeners: 0,
    };

    // Register default validators
    this._registerDefaultValidators();
  }

  /**
   * Register validator for config key
   */
  registerValidator(key, validatorFn) {
    if (typeof validatorFn !== 'function') {
      throw new Error('Validator must be a function');
    }
    this.validators.set(key, validatorFn);
    return this;
  }

  /**
   * Register change listener
   */
  onConfigChange(listener) {
    if (typeof listener !== 'function') {
      throw new Error('Listener must be a function');
    }
    this.listeners.add(listener);
    this.stats.listeners = this.listeners.size;
    return this;
  }

  /**
   * Remove listener
   */
  removeListener(listener) {
    this.listeners.delete(listener);
    this.stats.listeners = this.listeners.size;
    return this;
  }

  /**
   * Update single config value safely
   */
  updateConfig(key, value, options = {}) {
    const startTime = Date.now();
    const oldValue = this._getNestedValue(this.currentConfig, key);

    // Step 1: Validate
    if (!this._validateConfigValue(key, value)) {
      this.stats.validationFailures++;
      throw new Error(`Validation failed for config key '${key}'`);
    }

    // Step 2: Create backup
    const backup = this._deepClone(this.currentConfig);

    try {
      // Step 3: Update
      this._setNestedValue(this.currentConfig, key, value);

      // Step 4: Audit log
      this._auditLog('UPDATE', key, oldValue, value, options.reason);

      // Step 5: Notify listeners
      this._notifyListeners({
        type: 'UPDATE',
        key,
        oldValue,
        newValue: value,
        timestamp: Date.now(),
        duration: Date.now() - startTime,
      });

      this.stats.updates++;

      return {
        success: true,
        key,
        oldValue,
        newValue: value,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      // Rollback on error
      this.currentConfig = backup;
      throw error;
    }
  }

  /**
   * Update multiple config values (transaction)
   */
  updateMultiple(updates, options = {}) {
    const startTime = Date.now();
    const backup = this._deepClone(this.currentConfig);
    const results = [];

    try {
      for (const [key, value] of Object.entries(updates)) {
        if (!this._validateConfigValue(key, value)) {
          throw new Error(`Validation failed for config key '${key}'`);
        }

        const oldValue = this._getNestedValue(this.currentConfig, key);
        this._setNestedValue(this.currentConfig, key, value);

        results.push({
          key,
          oldValue,
          newValue: value,
        });

        this._auditLog('UPDATE_BATCH', key, oldValue, value, options.reason);
      }

      // Notify listeners for batch update
      this._notifyListeners({
        type: 'UPDATE_BATCH',
        updates: results,
        timestamp: Date.now(),
        duration: Date.now() - startTime,
      });

      this.stats.updates++;

      return {
        success: true,
        updates: results,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      // Rollback entire transaction
      this.currentConfig = backup;
      throw error;
    }
  }

  /**
   * Temporary config update (auto-rollback)
   */
  updateTemporary(key, value, duration = 5 * 60 * 1000, options = {}) {
    const oldValue = this._getNestedValue(this.currentConfig, key);

    // Update config
    this.updateConfig(key, value, { ...options, temporary: true });

    // Schedule rollback
    const timer = setTimeout(() => {
      try {
        this.updateConfig(key, oldValue, { ...options, reason: 'Temporary update expired' });
      } catch (error) {
        console.error(`Failed to rollback temporary config for '${key}':`, error);
      }
    }, duration);

    return {
      cancel: () => clearTimeout(timer),
      getRemaining: () => Math.max(0, duration - (Date.now() - startTime)),
    };
  }

  /**
   * Rollback to previous config
   */
  rollback(stepsBack = 1) {
    if (this.configHistory.length < stepsBack) {
      throw new Error(
        `Cannot rollback ${stepsBack} steps, only ${this.configHistory.length} in history`
      );
    }

    const backup = this._deepClone(this.currentConfig);
    const target = this.configHistory[this.configHistory.length - stepsBack];

    this.currentConfig = this._deepClone(target.config);
    this.previousConfig = backup;

    this._auditLog('ROLLBACK', `to_${stepsBack}_steps_back`, backup, this.currentConfig);

    this._notifyListeners({
      type: 'ROLLBACK',
      stepsBack,
      previousConfig: backup,
      currentConfig: this.currentConfig,
      timestamp: Date.now(),
    });

    this.stats.rollbacks++;

    return {
      success: true,
      previousConfig: backup,
      currentConfig: this.currentConfig,
    };
  }

  /**
   * Get current config
   */
  getConfig(key = null) {
    if (key) {
      return this._getNestedValue(this.currentConfig, key);
    }
    return this._deepClone(this.currentConfig);
  }

  /**
   * Get config history
   */
  getHistory() {
    return this.configHistory.map((entry) => ({
      timestamp: entry.timestamp,
      config: this._deepClone(entry.config),
      summary: entry.summary,
    }));
  }

  /**
   * Get audit log
   */
  getAuditLog() {
    return this.auditLog.slice(-100); // Last 100 entries
  }

  /**
   * Get statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      historySize: this.configHistory.length,
      auditLogSize: this.auditLog.length,
      registeredValidators: this.validators.size,
    };
  }

  /**
   * Validate config value
   */
  _validateConfigValue(key, value) {
    const validator = this.validators.get(key);

    if (!validator) {
      return true; // No validator means accept
    }

    try {
      return validator(value);
    } catch (error) {
      console.error(`Validator error for '${key}':`, error);
      return false;
    }
  }

  /**
   * Notify listeners
   */
  _notifyListeners(change) {
    for (const listener of this.listeners) {
      try {
        listener(change);
      } catch (error) {
        console.error('Listener error:', error);
      }
    }
  }

  /**
   * Audit log entry
   */
  _auditLog(action, key, oldValue, newValue, reason = null) {
    const entry = {
      timestamp: Date.now(),
      action,
      key,
      oldValue,
      newValue,
      reason,
      userId: 'system',
    };

    this.auditLog.push(entry);

    // Keep size limited
    if (this.auditLog.length > 10000) {
      this.auditLog.shift();
    }
  }

  /**
   * Get nested value from object
   */
  _getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Set nested value in object
   */
  _setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    let current = obj;

    for (const key of keys) {
      if (!(key in current)) {
        current[key] = {};
      }
      current = current[key];
    }

    current[lastKey] = value;
  }

  /**
   * Deep clone
   */
  _deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * Register default validators
   */
  _registerDefaultValidators() {
    this.registerValidator('logLevel', (value) => {
      const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];
      return levels.includes(value);
    });

    this.registerValidator('sampleRate', (value) => {
      return typeof value === 'number' && value >= 0 && value <= 1;
    });

    this.registerValidator('timeout', (value) => {
      return typeof value === 'number' && value > 0;
    });

    this.registerValidator('maxBufferSize', (value) => {
      return typeof value === 'number' && value > 0;
    });
  }
}

/**
 * Module-level Dynamic Config
 */
export class ModuleLevelConfig {
  constructor(baseConfig = {}) {
    this.baseConfig = baseConfig;
    this.moduleConfigs = new Map();
    this.listeners = new Map(); // per module
  }

  /**
   * Set module-specific config
   */
  setModuleConfig(moduleName, config) {
    this.moduleConfigs.set(moduleName, config);
    this._notifyModuleListeners(moduleName, config);
  }

  /**
   * Get module config (with fallback to base)
   */
  getModuleConfig(moduleName) {
    const moduleConfig = this.moduleConfigs.get(moduleName);
    return { ...this.baseConfig, ...moduleConfig };
  }

  /**
   * Update module log level
   */
  setModuleLogLevel(moduleName, level) {
    const currentConfig = this.moduleConfigs.get(moduleName) || {};
    currentConfig.logLevel = level;
    this.setModuleConfig(moduleName, currentConfig);
  }

  /**
   * Get module log level
   */
  getModuleLogLevel(moduleName) {
    return this.getModuleConfig(moduleName).logLevel || this.baseConfig.logLevel;
  }

  /**
   * Register module listener
   */
  onModuleConfigChange(moduleName, listener) {
    if (!this.listeners.has(moduleName)) {
      this.listeners.set(moduleName, []);
    }
    this.listeners.get(moduleName).push(listener);
  }

  /**
   * Notify module listeners
   */
  _notifyModuleListeners(moduleName, config) {
    const listeners = this.listeners.get(moduleName) || [];
    for (const listener of listeners) {
      try {
        listener(config);
      } catch (error) {
        console.error(`Listener error for module '${moduleName}':`, error);
      }
    }
  }

  /**
   * List all modules with custom config
   */
  listModules() {
    return Array.from(this.moduleConfigs.keys());
  }

  /**
   * Get all configs
   */
  getAllConfigs() {
    const result = { base: this.baseConfig, modules: {} };
    for (const [module, config] of this.moduleConfigs.entries()) {
      result.modules[module] = config;
    }
    return result;
  }
}
