/**
 * Circular Reference Detector and Handler
 *
 */

export class CircularReferenceDetector {
  /**
   *
   */
  static detectCircular(obj, visited = new Map(), path = []) {
    if (obj === null || obj === undefined) {
      return null;
    }

    if (typeof obj !== 'object') {
      return null;
    }

    const objType = Object.prototype.toString.call(obj);

    if (
      objType === '[object Date]' ||
      objType === '[object RegExp]' ||
      objType === '[object Error]' ||
      objType === '[object Function]'
    ) {
      return null;
    }

    if (visited.has(obj)) {
      return {
        detected: true,
        circularPath: visited.get(obj),
        currentPath: path,
        referenceType: Array.isArray(obj) ? 'array' : 'object',
        depth: path.length,
        message: `Circular reference detected at depth ${path.length}: ${path.join(' → ')}`,
      };
    }

    visited.set(obj, [...path]);

    try {
      for (const [key, value] of Object.entries(obj)) {
        const newPath = [...path, `${key}`];
        const circular = this.detectCircular(value, visited, newPath);

        if (circular) {
          return circular;
        }
      }
    } catch (e) {}

    visited.delete(obj);

    return null;
  }

  /**
   *
   */
  static breakCircular(obj, options = {}) {
    const {
      maxDepth = 10,
      circularPlaceholder = '[Circular]',
      includeMetadata = false,
      preserveType = true,
    } = options;

    const visited = new WeakSet();
    const circularRefs = [];

    const process = (value, depth = 0, path = []) => {
      if (depth > maxDepth) {
        return {
          [circularPlaceholder]: `Max depth (${maxDepth}) exceeded at ${path.join('.')}`,
        };
      }

      if (value === null || value === undefined) {
        return value;
      }

      if (typeof value !== 'object') {
        return value;
      }

      if (visited.has(value)) {
        const ref = {
          path: path.join('.'),
          depth: depth,
          type: Array.isArray(value) ? 'array' : 'object',
          keys: Object.keys(value).length,
        };
        circularRefs.push(ref);

        return {
          [circularPlaceholder]: `Reference to ${ref.path} (type: ${ref.type})`,
        };
      }

      visited.add(value);

      try {
        if (Array.isArray(value)) {
          return value.map((item, idx) => process(item, depth + 1, [...path, `[${idx}]`]));
        }

        const result = {};
        for (const [key, val] of Object.entries(value)) {
          result[key] = process(val, depth + 1, [...path, key]);
        }

        if (includeMetadata) {
          result.__metadata__ = {
            type: preserveType ? value.constructor?.name || 'Object' : 'Object',
            depth: depth,
            keysCount: Object.keys(value).length,
          };
        }

        return result;
      } catch (e) {
        return {
          [circularPlaceholder]: `Error processing: ${e.message}`,
        };
      }
    };

    const result = process(obj);

    if (includeMetadata) {
      return {
        data: result,
        circularReferences: circularRefs,
        hadCirculars: circularRefs.length > 0,
        processedAt: new Date().toISOString(),
      };
    }

    return result;
  }

  /**
   *
   */
  static toSafeJSON(obj, options = {}) {
    const { space = 2, includeMetadata = false, maxDepth = 10 } = options;

    try {
      return JSON.stringify(obj, null, space);
    } catch (e) {
      if (e.message.includes('circular') || e.message.includes('Converting circular')) {
        const safe = this.breakCircular(obj, { maxDepth, includeMetadata });
        return JSON.stringify(safe, null, space);
      }

      throw e;
    }
  }

  /**
   *
   */
  static isSafeForSerialization(obj) {
    try {
      JSON.stringify(obj);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   *
   */
  static analyzeStructure(obj, maxDepth = 5) {
    const analysis = {
      type: typeof obj,
      constructor: obj?.constructor?.name,
      isArray: Array.isArray(obj),
      isNull: obj === null,
      depth: 0,
      hasCircular: false,
      circularPath: null,
      keys: [],
      estimatedSize: 0,
    };

    if (typeof obj !== 'object' || obj === null) {
      return analysis;
    }

    const circular = this.detectCircular(obj);
    if (circular) {
      analysis.hasCircular = true;
      analysis.circularPath = circular.currentPath;
    }

    const traverse = (value, depth = 0) => {
      if (depth > maxDepth) return;
      if (typeof value !== 'object' || value === null) return;

      if (Array.isArray(value)) {
        analysis.keys.push(`[Array: ${value.length}]`);
        value.forEach((item, idx) => {
          traverse(item, depth + 1);
        });
      } else {
        Object.entries(value).forEach(([key, val]) => {
          analysis.keys.push(key);
          traverse(val, depth + 1);
        });
      }
    };

    traverse(obj);
    analysis.depth = maxDepth;
    analysis.estimatedSize = JSON.stringify(obj).length;

    return analysis;
  }
}
