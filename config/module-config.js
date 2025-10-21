/**
 * ModuleConfig - Module-Level Configuration Manager
 *
 * Manages per-module log level configurations with pattern matching support:
 * - Per-module log level configuration
 * - Pattern-based module matching
 * - Dynamic configuration changes
 *
 * USAGE EXAMPLE:
 * const config = new ModuleConfig(LogLevel.INFO);
 * config.setModuleLevel('math-lib', LogLevel.DEBUG);
 * config.getLogLevelForModule('math-lib'); // => LogLevel.DEBUG
 */

import { ModulePatternMatcher } from '../utils/module-pattern-matcher.js';
import { LogLevel } from '../utils/types.js';
import { LoggingError } from '../error-handling/errors.js';

export class ModuleConfig {
  /**
   *
   */
  constructor(defaultLevel = LogLevel.INFO) {
    this._validateLogLevel(defaultLevel);

    this.defaultLevel = defaultLevel;
    this.moduleLevels = new Map(); // { moduleName => level }
    this.patternLevels = new Map(); // { pattern => level }
    this.listeners = [];
  }

  /**
   *
   * @private
   */
  _validateLogLevel(level) {
    if (typeof level !== 'number' || !(level in LogLevel)) {
      throw new LoggingError(`Invalid log level: ${level}. Must be a valid LogLevel enum value.`);
    }
  }

  /**
   *
   *
   * @example
   * config.setModuleLevel('math-lib', LogLevel.DEBUG);
   * config.setModuleLevel('drawing-lib', LogLevel.WARN);
   */
  setModuleLevel(moduleName, level) {
    if (!moduleName || typeof moduleName !== 'string') {
      throw new LoggingError('Module name must be a non-empty string');
    }

    this._validateLogLevel(level);

    const oldLevel = this.moduleLevels.get(moduleName);
    this.moduleLevels.set(moduleName, level);

    if (oldLevel !== level) {
      this._notifyListeners({
        type: 'moduleLevel',
        moduleName,
        oldLevel,
        newLevel: level,
      });
    }
  }

  /**
   *
   *
   * @example
   * config.setPatternLevel('math-*', LogLevel.DEBUG);
   * config.setPatternLevel('*-lib', LogLevel.INFO);
   */
  setPatternLevel(pattern, level) {
    if (!ModulePatternMatcher.isValidPattern(pattern)) {
      throw new LoggingError(`Invalid pattern: ${pattern}`);
    }

    this._validateLogLevel(level);

    const oldLevel = this.patternLevels.get(pattern);
    this.patternLevels.set(pattern, level);

    if (oldLevel !== level) {
      this._notifyListeners({
        type: 'patternLevel',
        pattern,
        oldLevel,
        newLevel: level,
      });
    }
  }

  /**
   *
   *
   *
   * @example
   * config.setModuleLevel('math-lib', LogLevel.DEBUG);
   * config.setPatternLevel('*-lib', LogLevel.INFO);
   * config.getLogLevelForModule('math-lib'); // => LogLevel.DEBUG
   * config.getLogLevelForModule('style-lib');
   * config.getLogLevelForModule('custom');
   */
  getLogLevelForModule(moduleName) {
    if (!moduleName) {
      return this.defaultLevel;
    }

    if (this.moduleLevels.has(moduleName)) {
      return this.moduleLevels.get(moduleName);
    }

    for (const [pattern, level] of this.patternLevels) {
      if (ModulePatternMatcher.matches(moduleName, pattern)) {
        return level;
      }
    }

    return this.defaultLevel;
  }

  /**
   *
   *
   * @example
   * config.removeModuleLevel('math-lib');
   */
  removeModuleLevel(moduleName) {
    const existed = this.moduleLevels.has(moduleName);

    if (existed) {
      this.moduleLevels.delete(moduleName);
      this._notifyListeners({
        type: 'moduleLevelRemoved',
        moduleName,
      });
    }

    return existed;
  }

  /**
   *
   *
   * @example
   * config.removePatternLevel('math-*');
   */
  removePatternLevel(pattern) {
    const existed = this.patternLevels.has(pattern);

    if (existed) {
      this.patternLevels.delete(pattern);
      this._notifyListeners({
        type: 'patternLevelRemoved',
        pattern,
      });
    }

    return existed;
  }

  /**
   *
   *
   * @example
   * config.getAll();
   * // => {
   * //   defaultLevel: 2,
   * //   moduleLevels: { 'math-lib': 3, 'drawing-lib': 0 },
   * //   patternLevels: { '*-lib': 2 }
   * // }
   */
  getAll() {
    return {
      defaultLevel: this.defaultLevel,
      moduleLevels: Object.fromEntries(this.moduleLevels),
      patternLevels: Object.fromEntries(this.patternLevels),
    };
  }

  /**
   *
   *
   * @example
   * config.getDebugInfo('math-lib');
   * // => {
   * //   moduleName: 'math-lib',
   * //   assignedLevel: 3,
   * //   fromSource: 'module',
   * //   defaultLevel: 2,
   * //   matchingPatterns: ['math-*', '*-lib']
   * // }
   */
  getDebugInfo(moduleName) {
    const level = this.getLogLevelForModule(moduleName);
    let fromSource = 'default';

    if (this.moduleLevels.has(moduleName)) {
      fromSource = 'module';
    } else {
      for (const pattern of this.patternLevels.keys()) {
        if (ModulePatternMatcher.matches(moduleName, pattern)) {
          fromSource = `pattern: ${pattern}`;
          break;
        }
      }
    }

    return {
      moduleName,
      assignedLevel: level,
      fromSource,
      defaultLevel: this.defaultLevel,
      matchingPatterns: ModulePatternMatcher.getMatchingPatterns(
        moduleName,
        Array.from(this.patternLevels.keys())
      ),
    };
  }

  /**
   *
   *
   * @example
   * const unsubscribe = config.onChange((change) => {
   * });
   *
   * unsubscribe();
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
        console.error('Error in ModuleConfig listener:', error);
      }
    }
  }

  /**
   *
   * @example
   * config.clear();
   */
  clear() {
    this.moduleLevels.clear();
    this.patternLevels.clear();
    this.listeners = [];
    this.defaultLevel = LogLevel.INFO;
  }

  /**
   *
   * @returns {string} - JSON string
   *
   * @example
   * const json = config.toJSON();
   */
  toJSON() {
    return JSON.stringify(this.getAll());
  }

  /**
   *
   * @static
   * @param {string} json - JSON string
   *
   * @example
   * const config = ModuleConfig.fromJSON(jsonString);
   */
  static fromJSON(json) {
    try {
      const data = JSON.parse(json);
      const config = new ModuleConfig(data.defaultLevel);

      for (const [moduleName, level] of Object.entries(data.moduleLevels || {})) {
        config.setModuleLevel(moduleName, level);
      }

      for (const [pattern, level] of Object.entries(data.patternLevels || {})) {
        config.setPatternLevel(pattern, level);
      }

      return config;
    } catch (error) {
      throw new LoggingError(`Failed to parse ModuleConfig from JSON: ${error.message}`);
    }
  }
}

export default ModuleConfig;
