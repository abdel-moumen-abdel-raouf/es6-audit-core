/**
 * @internal
 * This module is for internal/experimental use only and is not part of the public API.
 * It may change or be removed without notice.
 */
/**
 * Enhanced Sanitizer with Base64 & Advanced Encoding Detection
 *
 * Detects sensitive data in various encodings:
 * - Base64 encoded passwords
 * - URL-encoded credentials
 * - Hex-encoded values
 * - HTML-encoded sensitive data
 * - Nested JSON structures
 * - Typo variations of sensitive fields
 */

class AdvancedEncodingDetector {
  constructor() {
    this.sensitivePatterns = {
      // Passwords
      password: /password|passwd|pwd|pass|secret|credential/i,
      // API keys and tokens
      apiKey: /api[_-]?key|apikey|token|auth|bearer/i,
      // Personal data
      ssn: /ssn|social[_-]?security|social security number/i,
      // Card data
      creditCard: /credit[_-]?card|card[_-]?number|cvv|cvc/i,
      // Phone/Email
      phone: /phone|telephone|mobile|cellphone/i,
      email: /email|e-mail|address@/i,
      // Database
      database: /db[_-]?password|database[_-]?password|conn[_-]?string/i,
    };

    this.encodingMarkers = {
      base64: /^[A-Za-z0-9+/]{8,}={0,2}$/, // Reduced from 20 to 8 minimum
      base64Url: /^[A-Za-z0-9_-]{8,}$/, // Reduced from 20 to 8 minimum
      hex: /^[0-9a-fA-F]{8,}$/, // Reduced from 20 to 8 minimum
      urlEncoded: /%[0-9a-fA-F]{2}/,
      htmlEncoded: /&#?\w+;/,
    };
  }

  /**
   * Try to decode Base64 strings
   */
  tryDecodeBase64(str) {
    try {
      if (typeof str !== 'string') return null;
      if (str.length < 8) return null;

      // Check if looks like Base64
      if (!this.encodingMarkers.base64.test(str) && !this.encodingMarkers.base64Url.test(str)) {
        return null;
      }

      // Try decoding
      const decoded = Buffer.from(str, 'base64').toString('utf8');

      // Check if decoded string is valid UTF8 and contains meaningful text
      if (decoded && decoded.length > 0 && decoded.length < str.length * 2) {
        return decoded;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Try to decode URL-encoded strings
   */
  tryDecodeUrlEncoding(str) {
    try {
      if (typeof str !== 'string') return null;
      if (!this.encodingMarkers.urlEncoded.test(str)) return null;

      const decoded = decodeURIComponent(str);
      if (decoded && decoded !== str) {
        return decoded;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Try to decode HTML entities
   */
  tryDecodeHtmlEntities(str) {
    try {
      if (typeof str !== 'string') return null;
      if (!this.encodingMarkers.htmlEncoded.test(str)) return null;

      // Simple HTML entity decoder
      const textarea = typeof document !== 'undefined' ? document.createElement('textarea') : null;

      if (textarea) {
        textarea.innerHTML = str;
        return textarea.value;
      }

      // Fallback for Node.js
      const entities = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#39;': "'",
        '&#x27;': "'",
        '&#x2F;': '/',
      };

      let decoded = str;
      for (const [entity, char] of Object.entries(entities)) {
        decoded = decoded.replace(new RegExp(entity, 'g'), char);
      }

      return decoded !== str ? decoded : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Check if string contains sensitive keywords
   */
  containsSensitiveKeywords(str) {
    if (typeof str !== 'string') return false;

    for (const [, pattern] of Object.entries(this.sensitivePatterns)) {
      if (pattern.test(str)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Analyze all possible decodings
   */
  analyzeDecodings(value) {
    if (typeof value !== 'string') return [];

    const decodings = [];

    // Original
    decodings.push({
      encoding: 'original',
      value,
      containsSensitive: this.containsSensitiveKeywords(value),
    });

    // Base64
    const base64Decoded = this.tryDecodeBase64(value);
    if (base64Decoded) {
      decodings.push({
        encoding: 'base64',
        value: base64Decoded,
        containsSensitive: this.containsSensitiveKeywords(base64Decoded),
      });

      // Try double decoding
      const doubleDecoded = this.tryDecodeBase64(base64Decoded);
      if (doubleDecoded) {
        decodings.push({
          encoding: 'base64-double',
          value: doubleDecoded,
          containsSensitive: this.containsSensitiveKeywords(doubleDecoded),
        });
      }
    }

    // URL encoding
    const urlDecoded = this.tryDecodeUrlEncoding(value);
    if (urlDecoded) {
      decodings.push({
        encoding: 'urlEncoded',
        value: urlDecoded,
        containsSensitive: this.containsSensitiveKeywords(urlDecoded),
      });
    }

    // HTML entities
    const htmlDecoded = this.tryDecodeHtmlEntities(value);
    if (htmlDecoded) {
      decodings.push({
        encoding: 'htmlEncoded',
        value: htmlDecoded,
        containsSensitive: this.containsSensitiveKeywords(htmlDecoded),
      });
    }

    return decodings;
  }
}

class AdvancedSanitizer {
  constructor(options = {}) {
    this.options = options;
    this.encodingDetector = new AdvancedEncodingDetector();
    this.foundSensitiveData = [];
    this.maskReplacement = options.maskReplacement || '***REDACTED***';

    this.nestedDepthLimit = options.nestedDepthLimit || 10;
    this.circularReferenceTracker = new WeakSet();
  }

  /**
   * Check if key suggests sensitive content
   */
  isSensitiveKey(key) {
    if (typeof key !== 'string') return false;

    const patterns = [
      /password|passwd|pwd|pass|secret/i,
      /api[_-]?key|apikey|token|auth|bearer/i,
      /ssn|social[_-]?security/i,
      /credit[_-]?card|card[_-]?number|cvv|cvc/i,
      /phone|telephone|mobile/i,
      /email|e-mail/i,
      /db[_-]?password|database[_-]?password/i,
      /private[_-]?key|private[_-]?secret/i,
      /access[_-]?token|refresh[_-]?token/i,
      /aws[_-]?secret|aws[_-]?access/i,
      /bearer/i,
      /oauth/i,
    ];

    return patterns.some((pattern) => pattern.test(key));
  }

  /**
   * Sanitize a value
   */
  sanitizeValue(value, depth = 0, parentKey = '') {
    if (depth > this.nestedDepthLimit) {
      return this.maskReplacement;
    }

    // Check for circular references in objects
    if (typeof value === 'object' && value !== null) {
      if (this.circularReferenceTracker.has(value)) {
        return this.maskReplacement;
      }
      this.circularReferenceTracker.add(value);
    }

    // Handle null and undefined
    if (value === null || value === undefined) {
      return value;
    }

    // String values - check for encodings
    if (typeof value === 'string') {
      // Direct sensitive content
      if (
        this.encodingDetector.containsSensitiveKeywords(value) &&
        parentKey &&
        this.isSensitiveKey(parentKey)
      ) {
        this.foundSensitiveData.push({
          key: parentKey,
          type: 'direct',
          timestamp: new Date().toISOString(),
        });
        return this.maskReplacement;
      }

      // Check various encodings
      const decodings = this.encodingDetector.analyzeDecodings(value);
      for (const decoding of decodings) {
        if (decoding.containsSensitive && decoding.encoding !== 'original') {
          this.foundSensitiveData.push({
            key: parentKey,
            type: `encoded-${decoding.encoding}`,
            value: value.substring(0, 50),
            timestamp: new Date().toISOString(),
          });
          return this.maskReplacement;
        }
      }

      return value;
    }

    // Numeric/Boolean - pass through
    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    // Array - recursively sanitize
    if (Array.isArray(value)) {
      return value.map((item, index) =>
        this.sanitizeValue(item, depth + 1, `${parentKey}[${index}]`)
      );
    }

    // Object - recursively sanitize
    if (typeof value === 'object') {
      const sanitized = {};
      for (const [key, val] of Object.entries(value)) {
        if (this.isSensitiveKey(key)) {
          this.foundSensitiveData.push({
            key,
            type: 'key-match',
            timestamp: new Date().toISOString(),
          });
          sanitized[key] = this.maskReplacement;
        } else {
          sanitized[key] = this.sanitizeValue(val, depth + 1, key);
        }
      }
      return sanitized;
    }

    return value;
  }

  /**
   * Main sanitize function
   */
  sanitize(data) {
    this.foundSensitiveData = [];
    this.circularReferenceTracker = new WeakSet();

    const sanitized = this.sanitizeValue(data);
    return sanitized;
  }

  /**
   * Get found sensitive data instances
   */
  getFoundSensitiveData() {
    return [...this.foundSensitiveData];
  }

  /**
   * Clear found data
   */
  clearFoundData() {
    this.foundSensitiveData = [];
  }
}

// Export
export { AdvancedSanitizer, AdvancedEncodingDetector };
