/**
 * Data Sanitizer with Encoding Detection
 * Advanced detection and removal of sensitive data
 * Includes detection of encoded data (Base64, URL encoding, Hex, etc)
 * ✅ Handles circular references thoroughly
 */

import { EncodingDetector } from './encoding-detector.js';
import { CircularReferenceDetector } from '../utils/circular-reference-detector.js';

export class DataSanitizer {
  constructor(config = {}) {
    this.config = {
      
      sensitiveKeys: new Set([
        'password', 'passwd', 'pwd', 'pwd_hash',
        'token', 'apikey', 'api_key', 'api-key',
        'secret', 'private_key', 'privatekey', 'private-key',
        'authorization', 'auth', 'bearer',
        'credit_card', 'creditcard', 'cc', 'cardnumber',
        'ssn', 'social_security', 'social-security',
        'access_token', 'refresh_token',
        'api_secret', 'apisecret',
        'db_password', 'database_password', 'dbpass',
        'aws_secret', 's3_secret', 'aws_access_key',
        'encryption_key', 'encryptionkey',
        'session_id', 'sessionid', 'sid',
        'oauth_token', 'oauthtoken',
        'pin', 'pii',
        'phone', 'email', 
        ...((config.additionalKeys || []).map(k => k.toLowerCase()))
      ]),

      
      patterns: {
        
        creditCard: {
          pattern: /\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b/g,
          description: 'Credit Card Number'
        },
        
        
        ssn: {
          pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
          description: 'Social Security Number'
        },

        
        email: {
          pattern: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Z|a-z]{2,}\b/g,
          description: 'Email Address'
        },

        
        phone: {
          pattern: /\b(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g,
          description: 'Phone Number'
        },

        // JWT Tokens
        jwt: {
          pattern: /eyJ[A-Za-z0-9_\-]+\.eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g,
          description: 'JWT Token'
        },

        // API Keys
        apiKey: {
          pattern: /(?:api[-_]?key|apikey)[\s:=]+['"]?([A-Za-z0-9_\-]{20,})['"']?/gi,
          description: 'API Key'
        },

        
        urlWithAuth: {
          pattern: /https?:\/\/[^:]+:[^@]+@[^\s]+/g,
          description: 'URL with Authentication'
        },

        // Bearer Tokens
        bearerToken: {
          pattern: /Bearer[\s]+[A-Za-z0-9_\-\.]+/gi,
          description: 'Bearer Token'
        },

        // AWS Access Keys
        awsAccessKey: {
          pattern: /AKIA[0-9A-Z]{16}/g,
          description: 'AWS Access Key'
        },

        // Private Keys (RSA, EC, etc)
        privateKey: {
          pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC )?PRIVATE KEY-----/g,
          description: 'Private Key'
        },

        // Database Connection Strings
        dbConnectionString: {
          pattern: /(?:mongodb|mysql|postgresql|sqlserver):\/\/[^\s]+/gi,
          description: 'Database Connection String'
        },

        
        ipAddress: {
          pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
          description: 'IP Address'
        },

        // Credit Card CVV
        cvv: {
          pattern: /\b(?:CVV|CVC|CVV2|CVC2)[\s:=]+(\d{3,4})\b/gi,
          description: 'Card CVV'
        },

        // Slack Tokens
        slackToken: {
          pattern: /xo[bp]-[0-9a-zA-Z\-]{10,}/g,
          description: 'Slack Token'
        },

        // GitHub Tokens
        githubToken: {
          pattern: /ghp_[0-9a-zA-Z]{36}/g,
          description: 'GitHub Token'
        },

        // Stripe Keys
        stripeKey: {
          pattern: /sk_live_[0-9a-zA-Z]{24,}/g,
          description: 'Stripe Secret Key'
        },

        // Encryption Keys (Base64)
        encryptionKey: {
          pattern: /(?:encryption_key|secret_key|master_key)[\s:=]+[A-Za-z0-9+/]{40,}={0,2}/gi,
          description: 'Encryption Key'
        },

        // Session IDs (long hex strings)
        sessionId: {
          pattern: /(?:session[_-]?id|sessionid|sid)[\s:=]+[a-f0-9]{32,}/gi,
          description: 'Session ID'
        }
      },

      
      replacementChar: '*',
      minCharsToShow: 2,
      maxPercentToShow: 0.2, // Show max 20% of the string

      
      // Default to masking common PII in production
      maskEmails: config.maskEmails ?? true,
      maskIPs: config.maskIPs ?? true,
      maskPhones: config.maskPhones ?? true,

      ...config
    };

    
    this.statistics = {
      sensitiveKeysFound: new Map(),
      patternsMatched: new Map(),
      totalSanitized: 0
    };
  }

  /**
 * 
 */
  sanitize(obj, trackStats = true) {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return this._sanitizeString(obj, trackStats);
    }

    if (typeof obj === 'number' || typeof obj === 'boolean') {
      
      return obj;
    }

    if (typeof obj === 'object') {
      return this._sanitizeObject(obj, trackStats);
    }

    return obj;
  }

  /**
 * 
 */
  sanitizeWithEncoding(obj, trackStats = true) {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      
      const detected = EncodingDetector.detectEncoded(obj);
      
      if (detected.isEncoded && this._isSuspiciousContent(detected.decoded)) {
        
        return '***REDACTED***';
      }

      
      return this._sanitizeString(obj, trackStats);
    }

    if (typeof obj === 'number' || typeof obj === 'boolean') {
      return obj;
    }

    if (typeof obj === 'object') {
      return this._sanitizeObjectWithEncoding(obj, trackStats);
    }

    return obj;
  }

  /**
 * 
 */
  _sanitizeObjectWithEncoding(obj, trackStats = true) {
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeWithEncoding(item, trackStats));
    }

    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      
      if (this._isSensitiveKey(key)) {
        sanitized[key] = '***REDACTED***';
        if (trackStats) {
          const currentCount = this.statistics.sensitiveKeysFound.get(key) || 0;
          this.statistics.sensitiveKeysFound.set(key, currentCount + 1);
        }
        continue;
      }

      if (typeof value === 'string') {
        
        const detected = EncodingDetector.detectEncoded(value);
        
        if (detected.isEncoded && this._isSuspiciousContent(detected.decoded)) {
          sanitized[key] = '***REDACTED***';
          continue;
        }

        
        sanitized[key] = this._sanitizeString(value, trackStats);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeWithEncoding(value, trackStats);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
 * 
 */
  _isSuspiciousContent(content) {
    const lowerContent = content.toLowerCase();
    
    for (const keyword of EncodingDetector.SUSPICIOUS_KEYWORDS) {
      if (lowerContent.includes(keyword)) {
        return true;
      }
    }

    return false;
  }

  /**
 * 
 */
  _sanitizeString(str, trackStats = true) {
    let result = str;
    const originalLength = result.length;
    let modified = false;

    
    for (const [name, config] of Object.entries(this.config.patterns)) {
      const pattern = config.pattern || config;
      
      
      if (name === 'email' && !this.config.maskEmails) continue;
      if (name === 'ipAddress' && !this.config.maskIPs) continue;
      if (name === 'phone' && !this.config.maskPhones) continue;

      const matches = result.match(pattern);
      if (matches && matches.length > 0) {
        if (trackStats) {
          const currentCount = this.statistics.patternsMatched.get(name) || 0;
          this.statistics.patternsMatched.set(name, currentCount + matches.length);
        }
        result = result.replace(pattern, this._getMasked);
        modified = true;
      }
    }

    if (trackStats && modified) {
      this.statistics.totalSanitized++;
    }

    return result;
  }

  /**
 * 
 */
  _sanitizeObject(obj, trackStats = true) {
    if (Array.isArray(obj)) {
      return obj.map(item => {
        if (typeof item === 'string') {
          return this._sanitizeString(item, trackStats);
        }
        return this.sanitize(item, trackStats);
      });
    }

    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (this._isSensitiveKey(key)) {
        sanitized[key] = this._getMasked(String(value));
        if (trackStats) {
          const currentCount = this.statistics.sensitiveKeysFound.get(key) || 0;
          this.statistics.sensitiveKeysFound.set(key, currentCount + 1);
        }
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitize(value, trackStats);
      } else if (typeof value === 'string') {
        sanitized[key] = this._sanitizeString(value, trackStats);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  /**
 * 
 */
  _isSensitiveKey(key) {
    const lowerKey = String(key).toLowerCase();
    
    
    if (this.config.sensitiveKeys.has(lowerKey)) {
      return true;
    }

    
    if (this.config.sensitiveKeys.has(lowerKey.replace(/_/g, ''))) {
      return true;
    }

    if (this.config.sensitiveKeys.has(lowerKey.replace(/-/g, ''))) {
      return true;
    }

    
    for (const sensitiveKey of this.config.sensitiveKeys) {
      if (lowerKey.includes(sensitiveKey) || sensitiveKey.includes(lowerKey)) {
        return true;
      }
    }

    return false;
  }

  /**
 * 
 */
  _getMasked = (value) => {
    const str = String(value);
    if (str.length <= this.config.minCharsToShow) {
      return this.config.replacementChar.repeat(str.length);
    }

    
    const visibleChars = Math.max(
      this.config.minCharsToShow,
      Math.ceil(str.length * this.config.maxPercentToShow)
    );

    const firstChars = str.substring(0, visibleChars);
    const masked = this.config.replacementChar.repeat(str.length - visibleChars);
    
    return firstChars + masked;
  }

  /**
 * 
 */
  addCustomPattern(name, pattern, description = '') {
    this.config.patterns[name] = {
      pattern,
      description
    };
    return this;
  }

  /**
 * 
 */
  addSensitiveKey(key) {
    this.config.sensitiveKeys.add(key.toLowerCase());
    return this;
  }

  /**
 * 
 */
  removeSensitiveKey(key) {
    this.config.sensitiveKeys.delete(key.toLowerCase());
    return this;
  }

  /**
 * 
 */
  getSensitiveKeys() {
    return Array.from(this.config.sensitiveKeys).sort();
  }

  /**
 * 
 */
  getPatterns() {
    return Object.entries(this.config.patterns).map(([name, config]) => ({
      name,
      description: config.description || name,
      enabled: true
    }));
  }

  /**
 * 
 */
  setPatternEnabled(name, enabled) {
    if (this.config.patterns[name]) {
      this.config.patterns[name].enabled = enabled;
    }
    return this;
  }

  /**
 * 
 */
  getStatistics() {
    return {
      totalSanitized: this.statistics.totalSanitized,
      sensitiveKeysFound: Object.fromEntries(this.statistics.sensitiveKeysFound),
      patternsMatched: Object.fromEntries(this.statistics.patternsMatched),
      topThreats: this._getTopThreats()
    };
  }

  /**
 * 
 */
  _getTopThreats() {
    const all = new Map([
      ...this.statistics.sensitiveKeysFound,
      ...this.statistics.patternsMatched
    ]);

    return Array.from(all.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));
  }

  /**
 * 
 */
  resetStatistics() {
    this.statistics = {
      sensitiveKeysFound: new Map(),
      patternsMatched: new Map(),
      totalSanitized: 0
    };
    return this;
  }

  /**
 * 
 */
  printStatistics() {
    const stats = this.getStatistics();
    console.log('\n=== SANITIZER STATISTICS ===');
    console.log(`Total Sanitized: ${stats.totalSanitized}`);
    console.log('\nSensitive Keys Found:');
    for (const [key, count] of Object.entries(stats.sensitiveKeysFound)) {
      console.log(`  - ${key}: ${count}`);
    }
    console.log('\nPatterns Matched:');
    for (const [pattern, count] of Object.entries(stats.patternsMatched)) {
      console.log(`  - ${pattern}: ${count}`);
    }
    console.log('\nTop Threats:');
    for (const { name, count } of stats.topThreats) {
      console.log(`  - ${name}: ${count}`);
    }
    console.log('============================\n');
  }

  /**
 * 
 */
  detectAndHandleCircular(obj) {
    const circular = CircularReferenceDetector.detectCircular(obj);
    
    if (circular) {
      return {
        hasCircular: true,
        detection: circular,
        safe: CircularReferenceDetector.breakCircular(obj)
      };
    }

    return {
      hasCircular: false,
      detection: null,
      safe: obj
    };
  }

  /**
 * 
 */
  toSafeJSON(obj, space = 2) {
    return CircularReferenceDetector.toSafeJSON(obj, { space, includeMetadata: false });
  }

  /**
 * 
 */
  isSafeForSerialization(obj) {
    return CircularReferenceDetector.isSafeForSerialization(obj);
  }

  /**
 * 
 */
  analyzeObjectStructure(obj, maxDepth = 5) {
    return CircularReferenceDetector.analyzeStructure(obj, maxDepth);
  }
}
