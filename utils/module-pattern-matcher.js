/**
 * ModulePatternMatcher
 * 
 * ÙØ¦Ø© Ù„Ù„ØªØ¹Ø§Ù…Ù„ Ù…Ø¹ Ù…Ø·Ø§Ø¨Ù‚Ø© Ø£Ù†Ù…Ø§Ø· Ø£Ø³Ù…Ø§Ø¡ Ø§Ù„ÙˆØ­Ø¯Ø§Øª
 * ØªØ¯Ø¹Ù… Wildcards Ù…Ø«Ù„: 'math-*', '*-lib', 'drawing-lib'
 * 
 * Ø§Ù„Ø§Ø³ØªØ®Ø¯Ø§Ù…:
 * - ModulePatternMatcher.matches('math-lib', 'math-*') => true
 * - ModulePatternMatcher.matches('drawing-lib', '*-lib') => true
 * - ModulePatternMatcher.matches('custom-module', 'drawing-*') => false
 */

export class ModulePatternMatcher {
  /**
   * Ø§Ù„ØªØ­Ù‚Ù‚ Ù…Ù† ØªØ·Ø§Ø¨Ù‚ Ø§Ø³Ù… Ø§Ù„ÙˆØ­Ø¯Ø© Ù…Ø¹ Ù†Ù…Ø· Ù…Ø¹ÙŠÙ†
   * 
   * @param {string} moduleName - Ø§Ø³Ù… Ø§Ù„ÙˆØ­Ø¯Ø© (Ù…Ø«Ù„: 'math-lib', 'drawing-lib')
   * @param {string} pattern - Ø§Ù„Ù†Ù…Ø· (Ù…Ø«Ù„: 'math-*', '*-lib', 'drawing-lib')
   * @returns {boolean} - true Ø¥Ø°Ø§ ØªØ·Ø§Ø¨Ù‚ Ø§Ù„Ø§Ø³Ù… Ù…Ø¹ Ø§Ù„Ù†Ù…Ø·
   * 
   * @example
   * ModulePatternMatcher.matches('math-lib', 'math-*'); // true
   * ModulePatternMatcher.matches('drawing-lib', 'math-*'); // false
   * ModulePatternMatcher.matches('style-lib', '*-lib'); // true
   */
  static matches(moduleName, pattern) {
    if (!moduleName || !pattern) {
      return false;
    }

    // Ø¥Ø°Ø§ ÙƒØ§Ù† Ø§Ù„Ù†Ù…Ø· ÙŠØ³Ø§ÙˆÙŠ Ø§Ø³Ù… Ø§Ù„ÙˆØ­Ø¯Ø© ØªÙ…Ø§Ù…Ø§Ù‹
    if (moduleName === pattern) {
      return true;
    }

    // ØªØ­ÙˆÙŠÙ„ Ø§Ù„Ù†Ù…Ø· Ø¥Ù„Ù‰ regex
    // * ÙŠØªØ·Ø§Ø¨Ù‚ Ù…Ø¹ Ø£ÙŠ Ø¹Ø¯Ø¯ Ù…Ù† Ø§Ù„Ø£Ø­Ø±Ù
    const regexPattern = pattern
      .replace(/\./g, '\\.')      // escape dots
      .replace(/\*/g, '.*');      // * => .*

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(moduleName);
  }

  /**
   * Ø§Ù„Ø¨Ø­Ø« Ø¹Ù† ÙˆØ­Ø¯Ø§Øª Ù…Ø·Ø§Ø¨Ù‚Ø© Ù…Ù† Ù‚Ø§Ø¦Ù…Ø© Ù…Ø¹Ø·Ø§Ø©
   * 
   * @param {string[]} moduleNames - Ù‚Ø§Ø¦Ù…Ø© Ø£Ø³Ù…Ø§Ø¡ Ø§Ù„ÙˆØ­Ø¯Ø§Øª
   * @param {string} pattern - Ø§Ù„Ù†Ù…Ø· Ø§Ù„Ù…Ø±Ø§Ø¯ Ø§Ù„Ø¨Ø­Ø« Ø¹Ù†Ù‡
   * @returns {string[]} - Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„ÙˆØ­Ø¯Ø§Øª Ø§Ù„Ù…Ø·Ø§Ø¨Ù‚Ø©
   * 
   * @example
   * const modules = ['math-lib', 'drawing-lib', 'style-lib', 'audit-core'];
   * ModulePatternMatcher.findMatching(modules, '*-lib'); 
   * // => ['math-lib', 'drawing-lib', 'style-lib', 'audit-core']
   * 
   * ModulePatternMatcher.findMatching(modules, 'math-*');
   * // => ['math-lib']
   */
  static findMatching(moduleNames, pattern) {
    if (!Array.isArray(moduleNames) || !pattern) {
      return [];
    }

    return moduleNames.filter(name => this.matches(name, pattern));
  }

  /**
   * Ø§Ù„ØªØ­Ù‚Ù‚ Ù…Ù† Ø£Ù† Ø§Ù„Ù†Ù…Ø· ØµØ­ÙŠØ­ (Ù„Ø§ ÙŠØ­ØªÙˆÙŠ Ø¹Ù„Ù‰ Ø£Ø­Ø±Ù ØºÙŠØ± ØµØ§Ù„Ø­Ø©)
   * 
   * @param {string} pattern - Ø§Ù„Ù†Ù…Ø· Ø§Ù„Ù…Ø±Ø§Ø¯ Ø§Ù„ØªØ­Ù‚Ù‚ Ù…Ù†Ù‡
   * @returns {boolean} - true Ø¥Ø°Ø§ ÙƒØ§Ù† Ø§Ù„Ù†Ù…Ø· ØµØ­ÙŠØ­Ø§Ù‹
   * 
   * @example
   * ModulePatternMatcher.isValidPattern('math-*'); // true
   * ModulePatternMatcher.isValidPattern('*-lib'); // true
   * ModulePatternMatcher.isValidPattern(''); // false
   */
  static isValidPattern(pattern) {
    if (!pattern || typeof pattern !== 'string' || pattern.trim() === '') {
      return false;
    }

    // ÙŠØ¬Ø¨ Ø£Ù† ÙŠØ­ØªÙˆÙŠ Ø¹Ù„Ù‰ Ø£Ø­Ø±Ù ÙˆØ£Ø±Ù‚Ø§Ù… ÙˆØ´Ø±Ø·Ø§Øª ÙˆØ¹Ù„Ø§Ù…Ø§Øª Ù†Ø¬Ù…Ø© ÙÙ‚Ø·
    const validPatternRegex = /^[a-zA-Z0-9\-*]+$/;
    return validPatternRegex.test(pattern);
  }

  /**
   * Ø§Ù„Ø­ØµÙˆÙ„ Ø¹Ù„Ù‰ Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø£Ù†Ù…Ø§Ø· Ø§Ù„Ù…Ø·Ø§Ø¨Ù‚Ø© Ù„Ø§Ø³Ù… ÙˆØ­Ø¯Ø© Ù…Ø¹ÙŠÙ†
   * 
   * @param {string} moduleName - Ø§Ø³Ù… Ø§Ù„ÙˆØ­Ø¯Ø©
   * @param {string[]} patterns - Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø£Ù†Ù…Ø§Ø· Ø§Ù„Ù…ØªØ§Ø­Ø©
   * @returns {string[]} - Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø£Ù†Ù…Ø§Ø· Ø§Ù„Ù…Ø·Ø§Ø¨Ù‚Ø©
   * 
   * @example
   * const patterns = ['math-*', '*-lib', 'math-lib'];
   * ModulePatternMatcher.getMatchingPatterns('math-lib', patterns);
   * // => ['math-*', '*-lib', 'math-lib']
   */
  static getMatchingPatterns(moduleName, patterns) {
    if (!moduleName || !Array.isArray(patterns)) {
      return [];
    }

    return patterns.filter(pattern => this.matches(moduleName, pattern));
  }

  /**
   * ØªØ­ÙˆÙŠÙ„ Ù†Ù…Ø· Ø¥Ù„Ù‰ regex object
   * 
   * @param {string} pattern - Ø§Ù„Ù†Ù…Ø· Ø§Ù„Ù…Ø±Ø§Ø¯ ØªØ­ÙˆÙŠÙ„Ù‡
   * @returns {RegExp|null} - regex object Ø£Ùˆ null Ø¥Ø°Ø§ ÙƒØ§Ù† Ø§Ù„Ù†Ù…Ø· ØºÙŠØ± ØµØ­ÙŠØ­
   * 
   * @example
   * ModulePatternMatcher.toRegex('math-*');
   * // => /^math-.*$/
   */
  static toRegex(pattern) {
    if (!this.isValidPattern(pattern)) {
      return null;
    }

    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*');

    try {
      return new RegExp(`^${regexPattern}$`);
    } catch (error) {
      return null;
    }
  }
}

export default ModulePatternMatcher;

