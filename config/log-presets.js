/**
 * Log Presets
 *
 * Predefined logging configurations for common use cases:
 * - Development: Verbose output with colors
 * - Production: Performance-optimized, minimal output
 * - Testing: Quiet output, good for test runners
 * - Debugging: Maximum detail, stack traces, context
 */

import {
  LogFormatterManager,
  DefaultFormatter,
  JSONFormatter,
  CompactFormatter,
} from 'internal/utils/log-formatter.js';
import { ColorConfig, ColorTheme, ANSIColors } from './color-config.js';
import {
  OutputCustomizer,
  PrefixTransformer,
  FilterTransformer,
} from 'internal/utils/output-customizer.js';

/**
 * Preset Configuration
 */
class PresetConfig {
  /**
   * Create preset configuration
   * @param {Object} config - Configuration object
   */
  constructor(config) {
    this.name = config.name;
    this.description = config.description;
    this.formatter = config.formatter;
    this.colorTheme = config.colorTheme;
    this.minLevel = config.minLevel ?? 0; // 0=DEBUG, 1=INFO, 2=WARN, 3=ERROR
    this.transports = config.transports || [];
    this.outputCustomizer = config.outputCustomizer;
    this.contextIncluded = config.contextIncluded ?? true;
    this.stackTraceIncluded = config.stackTraceIncluded ?? true;
    this.correlationIdIncluded = config.correlationIdIncluded ?? true;
  }

  /**
   * Get preset as object
   * @returns {Object} Configuration object
   */
  toJSON() {
    return {
      name: this.name,
      description: this.description,
      formatter: this.formatter,
      colorTheme: this.colorTheme,
      minLevel: this.minLevel,
      contextIncluded: this.contextIncluded,
      stackTraceIncluded: this.stackTraceIncluded,
      correlationIdIncluded: this.correlationIdIncluded,
    };
  }
}

/**
 * Log Presets Manager
 */
class LogPresets {
  static #presets = new Map();
  static #currentPreset = null;

  /**
   * Initialize built-in presets
   */
  static {
    // Development Preset
    const devCustomizer = new OutputCustomizer().addTransformer(new PrefixTransformer('🔧 [DEV] '));

    LogPresets.registerPreset(
      'development',
      new PresetConfig({
        name: 'Development',
        description: 'Verbose output with colors for development',
        formatter: 'default',
        colorTheme: 'vibrant',
        minLevel: 0, // Show all levels
        contextIncluded: true,
        stackTraceIncluded: true,
        correlationIdIncluded: true,
        outputCustomizer: devCustomizer,
        transports: ['console'],
      })
    );

    // Production Preset
    const prodCustomizer = new OutputCustomizer().addTransformer(
      new FilterTransformer((entry) => entry.level >= 1)
    ); // INFO and above

    LogPresets.registerPreset(
      'production',
      new PresetConfig({
        name: 'Production',
        description: 'Performance-optimized, minimal output',
        formatter: 'json',
        colorTheme: null,
        minLevel: 1, // INFO and above
        contextIncluded: false,
        stackTraceIncluded: false,
        correlationIdIncluded: true,
        outputCustomizer: prodCustomizer,
        transports: ['console', 'file'],
      })
    );

    // Testing Preset
    const testCustomizer = new OutputCustomizer().addTransformer(
      new FilterTransformer((entry) => entry.level >= 2)
    ); // WARN and above

    LogPresets.registerPreset(
      'testing',
      new PresetConfig({
        name: 'Testing',
        description: 'Quiet output, suitable for test runners',
        formatter: 'compact',
        colorTheme: null,
        minLevel: 2, // WARN and above
        contextIncluded: false,
        stackTraceIncluded: false,
        correlationIdIncluded: false,
        outputCustomizer: testCustomizer,
        transports: ['console'],
      })
    );

    // Debugging Preset
    const debugCustomizer = new OutputCustomizer().addTransformer(
      new PrefixTransformer('🐛 [DEBUG] ')
    );

    LogPresets.registerPreset(
      'debugging',
      new PresetConfig({
        name: 'Debugging',
        description: 'Maximum detail with stack traces and context',
        formatter: 'default',
        colorTheme: 'standard',
        minLevel: 0, // Show all levels
        contextIncluded: true,
        stackTraceIncluded: true,
        correlationIdIncluded: true,
        outputCustomizer: debugCustomizer,
        transports: ['console', 'file'],
      })
    );

    // Set default preset
    LogPresets.setPreset('development');
  }

  /**
   * Register a preset
   * @param {string} name - Preset name
   * @param {PresetConfig} config - Preset configuration
   * @throws {Error} If preset already registered or config invalid
   */
  static registerPreset(name, config) {
    if (!(config instanceof PresetConfig)) {
      throw new Error('Preset config must be instance of PresetConfig');
    }
    if (this.#presets.has(name)) {
      throw new Error(`Preset '${name}' already registered`);
    }
    this.#presets.set(name, config);
  }

  /**
   * Get preset configuration
   * @param {string} name - Preset name
   * @returns {PresetConfig} Preset configuration
   * @throws {Error} If preset not found
   */
  static getPreset(name) {
    const preset = this.#presets.get(name);
    if (!preset) {
      throw new Error(`Preset '${name}' not found`);
    }
    return preset;
  }

  /**
   * Set current preset
   * @param {string} name - Preset name
   * @throws {Error} If preset not found
   */
  static setPreset(name) {
    const preset = this.getPreset(name);

    // Apply formatter
    if (preset.formatter && LogFormatterManager.exists(preset.formatter)) {
      LogFormatterManager.setDefault(preset.formatter);
    }

    // Apply color theme
    if (preset.colorTheme && ColorConfig.hasTheme(preset.colorTheme)) {
      ColorConfig.setTheme(preset.colorTheme);
      ColorConfig.setColorsEnabled(true);
    } else if (preset.colorTheme === null) {
      ColorConfig.setColorsEnabled(false);
    }

    this.#currentPreset = preset;
  }

  /**
   * Get current preset
   * @returns {PresetConfig} Current preset configuration
   */
  static getCurrentPreset() {
    return this.#currentPreset;
  }

  /**
   * List all presets
   * @returns {string[]} Array of preset names
   */
  static listPresets() {
    return Array.from(this.#presets.keys());
  }

  /**
   * Check if preset exists
   * @param {string} name - Preset name
   * @returns {boolean} True if exists
   */
  static hasPreset(name) {
    return this.#presets.has(name);
  }

  /**
   * Create custom preset and register
   * @param {string} name - Preset name
   * @param {Object} config - Configuration object
   * @returns {PresetConfig} Created preset
   */
  static createPreset(name, config) {
    const preset = new PresetConfig({
      name: name,
      description: config.description || 'Custom preset',
      formatter: config.formatter || 'default',
      colorTheme: config.colorTheme || 'standard',
      minLevel: config.minLevel ?? 0,
      contextIncluded: config.contextIncluded ?? true,
      stackTraceIncluded: config.stackTraceIncluded ?? true,
      correlationIdIncluded: config.correlationIdIncluded ?? true,
      outputCustomizer: config.outputCustomizer,
      transports: config.transports || [],
    });

    this.registerPreset(name, preset);
    return preset;
  }

  /**
   * Get preset details
   * @param {string} name - Preset name
   * @returns {Object} Detailed preset information
   */
  static getPresetInfo(name) {
    const preset = this.getPreset(name);
    const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];

    return {
      name: preset.name,
      description: preset.description,
      formatter: preset.formatter,
      colorTheme: preset.colorTheme,
      minLevel: levels[preset.minLevel],
      contextIncluded: preset.contextIncluded,
      stackTraceIncluded: preset.stackTraceIncluded,
      correlationIdIncluded: preset.correlationIdIncluded,
      transports: preset.transports,
    };
  }

  /**
   * Get debug info for all presets
   * @returns {Object} Debug information
   */
  static getDebugInfo() {
    return {
      currentPreset: this.#currentPreset?.name || null,
      availablePresets: this.listPresets(),
      presets: Object.fromEntries(
        this.listPresets().map((name) => [name, this.getPresetInfo(name)])
      ),
    };
  }

  /**
   * Compare two presets
   * @param {string} name1 - First preset name
   * @param {string} name2 - Second preset name
   * @returns {Object} Comparison result
   */
  static comparePresets(name1, name2) {
    const preset1 = this.getPreset(name1);
    const preset2 = this.getPreset(name2);

    return {
      preset1: this.getPresetInfo(name1),
      preset2: this.getPresetInfo(name2),
      differences: {
        formatter: preset1.formatter !== preset2.formatter,
        colorTheme: preset1.colorTheme !== preset2.colorTheme,
        minLevel: preset1.minLevel !== preset2.minLevel,
        contextIncluded: preset1.contextIncluded !== preset2.contextIncluded,
        stackTraceIncluded: preset1.stackTraceIncluded !== preset2.stackTraceIncluded,
        correlationIdIncluded: preset1.correlationIdIncluded !== preset2.correlationIdIncluded,
      },
    };
  }

  /**
   * Export preset as JSON
   * @param {string} name - Preset name
   * @returns {string} JSON representation
   */
  static exportPreset(name) {
    const preset = this.getPreset(name);
    return JSON.stringify(preset.toJSON(), null, 2);
  }

  /**
   * Get recommended preset based on environment
   * @returns {string} Recommended preset name
   */
  static getRecommendedPreset() {
    if (process.env.NODE_ENV === 'production') {
      return 'production';
    } else if (process.env.NODE_ENV === 'test') {
      return 'testing';
    }
    return 'development';
  }

  /**
   * Auto-select preset based on environment
   */
  static autoSelect() {
    const recommended = this.getRecommendedPreset();
    this.setPreset(recommended);
  }
}

export { PresetConfig, LogPresets };
