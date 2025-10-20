/**
 * Color Configuration System for Console Output
 * 
 * Provides ANSI color codes and color management:
 * - Per-level color customization (DEBUG, INFO, WARN, ERROR)
 * - TTY detection for automatic color toggling
 * - Support for 256-color and 16 million color mode
 * - Color theme presets
 */

/**
 * ANSI Color Codes
 */
class ANSIColors {
  // Basic colors
  static RESET = '\x1b[0m';
  static BOLD = '\x1b[1m';
  static DIM = '\x1b[2m';
  static ITALIC = '\x1b[3m';
  static UNDERLINE = '\x1b[4m';

  // Standard colors (30-37, 90-97)
  static BLACK = '\x1b[30m';
  static RED = '\x1b[31m';
  static GREEN = '\x1b[32m';
  static YELLOW = '\x1b[33m';
  static BLUE = '\x1b[34m';
  static MAGENTA = '\x1b[35m';
  static CYAN = '\x1b[36m';
  static WHITE = '\x1b[37m';

  static BRIGHT_BLACK = '\x1b[90m';
  static BRIGHT_RED = '\x1b[91m';
  static BRIGHT_GREEN = '\x1b[92m';
  static BRIGHT_YELLOW = '\x1b[93m';
  static BRIGHT_BLUE = '\x1b[94m';
  static BRIGHT_MAGENTA = '\x1b[95m';
  static BRIGHT_CYAN = '\x1b[96m';
  static BRIGHT_WHITE = '\x1b[97m';

  // Background colors
  static BG_BLACK = '\x1b[40m';
  static BG_RED = '\x1b[41m';
  static BG_GREEN = '\x1b[42m';
  static BG_YELLOW = '\x1b[43m';
  static BG_BLUE = '\x1b[44m';
  static BG_MAGENTA = '\x1b[45m';
  static BG_CYAN = '\x1b[46m';
  static BG_WHITE = '\x1b[47m';

  /**
   * Get 256-color code
   * @param {number} colorNumber - 0-255
   * @returns {string} ANSI code
   */
  static color256(colorNumber) {
    if (colorNumber < 0 || colorNumber > 255) {
      throw new Error('Color number must be 0-255');
    }
    return `\x1b[38;5;${colorNumber}m`;
  }

  /**
   * Get RGB color code (24-bit true color)
   * @param {number} r - Red (0-255)
   * @param {number} g - Green (0-255)
   * @param {number} b - Blue (0-255)
   * @returns {string} ANSI code
   */
  static colorRGB(r, g, b) {
    if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) {
      throw new Error('RGB values must be 0-255');
    }
    return `\x1b[38;2;${r};${g};${b}m`;
  }

  /**
   * Get background 256-color code
   * @param {number} colorNumber - 0-255
   * @returns {string} ANSI code
   */
  static bgColor256(colorNumber) {
    if (colorNumber < 0 || colorNumber > 255) {
      throw new Error('Color number must be 0-255');
    }
    return `\x1b[48;5;${colorNumber}m`;
  }

  /**
   * Get background RGB color code
   * @param {number} r - Red (0-255)
   * @param {number} g - Green (0-255)
   * @param {number} b - Blue (0-255)
   * @returns {string} ANSI code
   */
  static bgColorRGB(r, g, b) {
    if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) {
      throw new Error('RGB values must be 0-255');
    }
    return `\x1b[48;2;${r};${g};${b}m`;
  }

  /**
   * Combine multiple codes
   * @param {...string} codes - Color codes
   * @returns {string} Combined code
   */
  static combine(...codes) {
    return codes.join('');
  }

  /**
   * Apply color to text
   * @param {string} text - Text to colorize
   * @param {string} color - Color code
   * @param {string} [reset] - Reset code (default: RESET)
   * @returns {string} Colorized text
   */
  static apply(text, color, reset = ANSIColors.RESET) {
    return `${color}${text}${reset}`;
  }
}

/**
 * Color Theme
 * Defines colors for each log level
 */
class ColorTheme {
  /**
   * Create color theme
   * @param {Object} config - Configuration object
   * @param {string} config.debug - Debug level color
   * @param {string} config.info - Info level color
   * @param {string} config.warn - Warn level color
   * @param {string} config.error - Error level color
   * @param {string} [config.module] - Module name color
   * @param {string} [config.timestamp] - Timestamp color
   * @param {string} [config.context] - Context color
   */
  constructor(config) {
    this.validateConfig(config);
    this.debug = config.debug;
    this.info = config.info;
    this.warn = config.warn;
    this.error = config.error;
    this.module = config.module || ANSIColors.CYAN;
    this.timestamp = config.timestamp || ANSIColors.BRIGHT_BLACK;
    this.context = config.context || ANSIColors.BRIGHT_BLACK;
    this.correlationId = config.correlationId || ANSIColors.BRIGHT_BLACK;
  }

  /**
   * Validate config
   * @param {Object} config - Config to validate
   * @throws {Error} If config invalid
   */
  validateConfig(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('Theme config must be an object');
    }
    if (!config.debug || !config.info || !config.warn || !config.error) {
      throw new Error('Theme must define colors for: debug, info, warn, error');
    }
  }

  /**
   * Get color for level
   * @param {number} level - Log level (0-3)
   * @returns {string} Color code
   */
  getColor(level) {
    const colors = [this.debug, this.info, this.warn, this.error];
    return colors[level] || this.info;
  }

  /**
   * Get theme as object
   * @returns {Object} Theme object
   */
  toJSON() {
    return {
      debug: this.debug,
      info: this.info,
      warn: this.warn,
      error: this.error,
      module: this.module,
      timestamp: this.timestamp,
      context: this.context,
      correlationId: this.correlationId
    };
  }
}

/**
 * Color Configuration Manager
 */
class ColorConfig {
  static #themes = new Map();
  static #currentTheme = null;
  static #colorsEnabled = true;

  /**
   * Register built-in themes
   */
  static {
    // Standard theme (traditional colors)
    ColorConfig.registerTheme('standard', new ColorTheme({
      debug: ANSIColors.BLUE,
      info: ANSIColors.GREEN,
      warn: ANSIColors.YELLOW,
      error: ANSIColors.RED
    }));

    // Vibrant theme (bright colors)
    ColorConfig.registerTheme('vibrant', new ColorTheme({
      debug: ANSIColors.BRIGHT_BLUE,
      info: ANSIColors.BRIGHT_GREEN,
      warn: ANSIColors.BRIGHT_YELLOW,
      error: ANSIColors.BRIGHT_RED
    }));

    // Soft theme (dim colors)
    ColorConfig.registerTheme('soft', new ColorTheme({
      debug: ANSIColors.DIM + ANSIColors.BLUE,
      info: ANSIColors.DIM + ANSIColors.GREEN,
      warn: ANSIColors.DIM + ANSIColors.YELLOW,
      error: ANSIColors.DIM + ANSIColors.RED
    }));

    // Dark theme (256 colors)
    ColorConfig.registerTheme('dark', new ColorTheme({
      debug: ANSIColors.color256(33),   // Blue
      info: ANSIColors.color256(46),    // Green
      warn: ANSIColors.color256(226),   // Yellow
      error: ANSIColors.color256(196)   // Red
    }));

    // Set default theme
    ColorConfig.setTheme('standard');
  }

  /**
   * Register a color theme
   * @param {string} name - Theme name
   * @param {ColorTheme} theme - Theme instance
   * @throws {Error} If theme invalid
   */
  static registerTheme(name, theme) {
    if (!(theme instanceof ColorTheme)) {
      throw new Error('Theme must be instance of ColorTheme');
    }
    this.#themes.set(name, theme);
  }

  /**
   * Get registered theme
   * @param {string} name - Theme name
   * @returns {ColorTheme} Theme instance
   * @throws {Error} If theme not found
   */
  static getTheme(name) {
    const theme = this.#themes.get(name);
    if (!theme) {
      throw new Error(`Theme '${name}' not found`);
    }
    return theme;
  }

  /**
   * Set current theme
   * @param {string} name - Theme name
   */
  static setTheme(name) {
    this.#currentTheme = this.getTheme(name);
  }

  /**
   * Get current theme
   * @returns {ColorTheme} Current theme
   */
  static getCurrentTheme() {
    return this.#currentTheme;
  }

  /**
   * List all themes
   * @returns {string[]} Array of theme names
   */
  static listThemes() {
    return Array.from(this.#themes.keys());
  }

  /**
   * Check if theme exists
   * @param {string} name - Theme name
   * @returns {boolean} True if exists
   */
  static hasTheme(name) {
    return this.#themes.has(name);
  }

  /**
   * Enable or disable colors
   * @param {boolean} enabled - Enable colors
   */
  static setColorsEnabled(enabled) {
    this.#colorsEnabled = Boolean(enabled);
  }

  /**
   * Check if colors enabled
   * @returns {boolean} True if colors enabled
   */
  static areColorsEnabled() {
    return this.#colorsEnabled;
  }

  /**
   * Auto-detect TTY support
   * @returns {boolean} True if TTY detected
   */
  static detectTTY() {
    try {
      return process.stdout?.isTTY === true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Enable colors only if TTY detected
   */
  static autoDetect() {
    this.setColorsEnabled(this.detectTTY());
  }

  /**
   * Get color for log level
   * @param {number} level - Log level (0-3)
   * @returns {string} Color code
   */
  static getColor(level) {
    if (!this.#currentTheme || !this.#colorsEnabled) {
      return '';
    }
    return this.#currentTheme.getColor(level);
  }

  /**
   * Apply color to text if enabled
   * @param {string} text - Text to colorize
   * @param {string} color - Color code
   * @returns {string} Colorized or plain text
   */
  static colorize(text, color) {
    if (!this.#colorsEnabled) {
      return text;
    }
    return ANSIColors.apply(text, color);
  }

  /**
   * Create custom theme and register
   * @param {string} name - Theme name
   * @param {Object} colors - Color configuration
   * @returns {ColorTheme} Created theme
   */
  static createTheme(name, colors) {
    const theme = new ColorTheme(colors);
    this.registerTheme(name, theme);
    return theme;
  }

  /**
   * Get debug info
   * @returns {Object} Debug information
   */
  static getDebugInfo() {
    return {
      currentTheme: this.#currentTheme ? 'standard' : null,
      colorsEnabled: this.#colorsEnabled,
      ttyDetected: this.detectTTY(),
      availableThemes: this.listThemes()
    };
  }
}

export {
  ANSIColors,
  ColorTheme,
  ColorConfig
};
