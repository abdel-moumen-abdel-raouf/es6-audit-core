/**
 * Stack Trace Extractor and Parser
 * 
 * Captures and parses stack traces for better error diagnostics.
 * Provides source location information (file, line, column).
 */

/**
 * Represents a single frame in the stack trace
 */
class StackFrame {
  constructor(functionName, fileName, lineNumber, columnNumber, isNative = false) {
    this.functionName = functionName;
    this.fileName = fileName;
    this.lineNumber = lineNumber;
    this.columnNumber = columnNumber;
    this.isNative = isNative;
  }

  /**
   * Get frame location string
   * @returns {string} Formatted location like "file.js:42:15"
   */
  getLocation() {
    if (this.isNative) {
      return '<native>';
    }
    return `${this.fileName}:${this.lineNumber}:${this.columnNumber}`;
  }

  /**
   * Get full frame description
   * @returns {string} Full frame info like "functionName (file.js:42:15)"
   */
  toString() {
    if (this.isNative) {
      return `${this.functionName} <native>`;
    }
    return `${this.functionName} (${this.getLocation()})`;
  }

  /**
   * Convert to JSON
   * @returns {object} JSON representation
   */
  toJSON() {
    return {
      functionName: this.functionName,
      fileName: this.fileName,
      lineNumber: this.lineNumber,
      columnNumber: this.columnNumber,
      isNative: this.isNative,
      location: this.getLocation()
    };
  }
}

/**
 * Stack Trace Parser and Extractor
 */
class StackTraceExtractor {
  /**
   * Extract stack trace from error or current position
   * @param {Error|undefined} error - Error object to extract trace from, or undefined to capture current
   * @param {number} skipFrames - Number of frames to skip from the top
   * @returns {StackFrame[]} Array of StackFrame objects
   */
  static extract(error = null, skipFrames = 1) {
    let stack;

    if (error instanceof Error) {
      stack = error.stack || '';
    } else {
      // Capture current stack trace
      const obj = {};
      Error.captureStackTrace(obj, StackTraceExtractor.extract);
      stack = obj.stack || '';
    }

    return this._parseStack(stack, skipFrames);
  }

  /**
   * Get the immediate caller's frame
   * @returns {StackFrame} Frame info of the immediate caller
   */
  static getCaller(skipFrames = 2) {
    const frames = this.extract(null, skipFrames + 1);
    return frames.length > 0 ? frames[0] : null;
  }

  /**
   * Get source location info (file, line, column)
   * @returns {object} Location object with fileName, lineNumber, columnNumber
   */
  static getSourceLocation(skipFrames = 2) {
    const caller = this.getCaller(skipFrames + 1);
    if (!caller) {
      return { fileName: '<unknown>', lineNumber: 0, columnNumber: 0 };
    }
    return {
      fileName: caller.fileName,
      lineNumber: caller.lineNumber,
      columnNumber: caller.columnNumber
    };
  }

  /**
   * Get formatted stack trace string
   * @param {Error|undefined} error - Error to extract from
   * @param {number} maxFrames - Maximum number of frames to include
   * @returns {string} Formatted stack trace
   */
  static format(error = null, maxFrames = 10) {
    const frames = this.extract(error, 1);
    const limited = frames.slice(0, maxFrames);
    
    return limited
      .map((frame, index) => `  at ${frame.toString()}`)
      .join('\n');
  }

  /**
   * Parse raw stack trace string
   * @private
   * @param {string} stack - Raw stack trace string
   * @param {number} skipFrames - Number of frames to skip
   * @returns {StackFrame[]} Array of parsed frames
   */
  static _parseStack(stack, skipFrames = 0) {
    const frames = [];
    const lines = stack.split('\n').slice(1); // Skip "Error: ..." line

    for (const line of lines) {
      const frame = this._parseFrame(line);
      if (frame) {
        frames.push(frame);
      }
    }

    // Skip requested number of frames
    return frames.slice(skipFrames);
  }

  /**
   * Parse individual stack frame
   * @private
   * @param {string} line - Single line from stack trace
   * @returns {StackFrame|null} Parsed frame or null if invalid
   */
  static _parseFrame(line) {
    // Trim leading whitespace
    line = line.trim();

    // Handle native code
    if (line.includes('native')) {
      const match = /at (.+) \(native\)/.exec(line);
      if (match) {
        return new StackFrame(match[1] || '<anonymous>', '<native>', 0, 0, true);
      }
    }

    // Handle regular V8 format: at functionName (file.js:line:column)
    const match = /at (.+?) \((.+?):(\d+):(\d+)\)/.exec(line);
    if (match) {
      return new StackFrame(
        match[1] || '<anonymous>',
        match[2],
        parseInt(match[3], 10),
        parseInt(match[4], 10)
      );
    }

    // Handle format: at file.js:line:column (no function name)
    const simpleMatch = /at (.+?):(\d+):(\d+)/.exec(line);
    if (simpleMatch) {
      return new StackFrame(
        '<anonymous>',
        simpleMatch[1],
        parseInt(simpleMatch[2], 10),
        parseInt(simpleMatch[3], 10)
      );
    }

    return null;
  }
}

/**
 * Enhanced Error Context
 * Combines error info with stack trace
 */
class ErrorContext {
  constructor(error, customMessage = null) {
    this.message = customMessage || error.message || String(error);
    this.name = error.name || 'Error';
    this.code = error.code || null;
    this.stack = StackTraceExtractor.extract(error, 0);
    this.rawStack = error.stack || '';
    this.timestamp = new Date().toISOString();
  }

  /**
   * Get first frame (immediate error location)
   * @returns {StackFrame|null} First frame or null
   */
  getFirstFrame() {
    return this.stack.length > 0 ? this.stack[0] : null;
  }

  /**
   * Get error location
   * @returns {string} Location of first frame
   */
  getLocation() {
    const frame = this.getFirstFrame();
    return frame ? frame.getLocation() : '<unknown>';
  }

  /**
   * Get formatted stack trace (limited frames)
   * @param {number} maxFrames - Maximum frames to include
   * @returns {string} Formatted trace
   */
  getFormattedStack(maxFrames = 5) {
    return this.stack
      .slice(0, maxFrames)
      .map(frame => `  at ${frame.toString()}`)
      .join('\n');
  }

  /**
   * Convert to JSON
   * @returns {object} JSON representation
   */
  toJSON() {
    return {
      message: this.message,
      name: this.name,
      code: this.code,
      location: this.getLocation(),
      timestamp: this.timestamp,
      stack: this.stack.slice(0, 10).map(f => f.toJSON())
    };
  }

  /**
   * Convert to string
   * @returns {string} String representation
   */
  toString() {
    return `${this.name}: ${this.message}\n${this.getFormattedStack()}`;
  }
}

export { StackFrame, StackTraceExtractor, ErrorContext };
