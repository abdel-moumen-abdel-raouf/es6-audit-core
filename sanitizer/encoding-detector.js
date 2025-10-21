/**
 * Encoding Detector for detecting encoded sensitive data
 * Detects Base64, URL encoding, Hex encoding, etc.
 */

export class EncodingDetector {
  static PATTERNS = {
    base64: /^(?:[A-Za-z0-9+\/]{4})*(?:[A-Za-z0-9+\/]{2}==|[A-Za-z0-9+\/]{3}=)?$/,
    hex: /^(?:0x)?[0-9a-fA-F]+$/,
    url: /%[0-9A-Fa-f]{2}/,
    unicode: /\\u[0-9a-fA-F]{4}/,
  };

  static SUSPICIOUS_KEYWORDS = [
    'password',
    'pass',
    'pwd',
    'secret',
    'token',
    'apikey',
    'api_key',
    'auth',
    'credential',
    'login',
    'bearer',
    'session',
    'nonce',
    'access_token',
    'refresh_token',
    'private_key',
    'private-key',
    'ssh_key',
    'passphrase',
    'encryption_key',
    'hash',
    'api',
    'key',
    'authorization',
    'oauth',
    'jwt',
  ];

  /**
   *
   */
  static detectBase64(str) {
    if (typeof str !== 'string') return false;
    if (str.length < 4) return false;

    if (!this.PATTERNS.base64.test(str)) return false;

    try {
      const decoded = Buffer.from(str, 'base64').toString('utf8');

      if (/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/.test(decoded)) {
        return false;
      }

      const lowerDecoded = decoded.toLowerCase();
      for (const keyword of this.SUSPICIOUS_KEYWORDS) {
        if (lowerDecoded.includes(keyword)) {
          return true;
        }
      }

      return false;
    } catch (e) {
      return false;
    }
  }

  /**
   *
   */
  static detectUrlEncoding(str) {
    if (typeof str !== 'string') return false;

    if (!this.PATTERNS.url.test(str)) return false;

    try {
      const decoded = decodeURIComponent(str);

      const lowerDecoded = decoded.toLowerCase();
      for (const keyword of this.SUSPICIOUS_KEYWORDS) {
        if (lowerDecoded.includes(keyword)) {
          return true;
        }
      }

      return false;
    } catch (e) {
      return false;
    }
  }

  /**
   *
   */
  static detectHex(str) {
    if (typeof str !== 'string') return false;
    if (!this.PATTERNS.hex.test(str)) return false;

    try {
      const hexStr = str.startsWith('0x') ? str.slice(2) : str;

      if (hexStr.length % 2 !== 0) return false;

      const decoded = Buffer.from(hexStr, 'hex').toString('utf8');

      const lowerDecoded = decoded.toLowerCase();
      for (const keyword of this.SUSPICIOUS_KEYWORDS) {
        if (lowerDecoded.includes(keyword)) {
          return true;
        }
      }

      return false;
    } catch (e) {
      return false;
    }
  }

  /**
   *
   */
  static detectEncoded(value) {
    if (typeof value !== 'string') return null;

    if (this.detectBase64(value)) {
      try {
        return {
          isEncoded: true,
          encoding: 'base64',
          decoded: Buffer.from(value, 'base64').toString('utf8'),
        };
      } catch (e) {}
    }

    if (this.detectUrlEncoding(value)) {
      try {
        return {
          isEncoded: true,
          encoding: 'url',
          decoded: decodeURIComponent(value),
        };
      } catch (e) {}
    }

    if (this.detectHex(value)) {
      try {
        const hexStr = value.startsWith('0x') ? value.slice(2) : value;
        return {
          isEncoded: true,
          encoding: 'hex',
          decoded: Buffer.from(hexStr, 'hex').toString('utf8'),
        };
      } catch (e) {}
    }

    return {
      isEncoded: false,
      encoding: null,
      decoded: value,
    };
  }
}
