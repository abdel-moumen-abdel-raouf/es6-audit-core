/**
 * Structured Logging Schema Validation - Fix #8
 *
 *
 * - JSON Schema validation
 * - Type checking
 * - Required fields enforcement
 * - Type coercion
 * - Schema registry
 */

export class FieldSchema {
  constructor(config = {}) {
    this.name = config.name;
    this.type = config.type || 'string'; // string, number, boolean, object, array, date
    this.required = config.required !== false;
    this.description = config.description || '';
    this.default = config.default;
    this.enum = config.enum; // Allowed values
    this.pattern = config.pattern; // Regex for strings
    this.minLength = config.minLength;
    this.maxLength = config.maxLength;
    this.min = config.min; // For numbers
    this.max = config.max;
    this.validator = config.validator; // Custom validator function
    this.transform = config.transform; // Custom transform function
  }

  /**
   * Validate field value
   */
  validate(value) {
    const errors = [];

    // Required check
    if (this.required && (value === undefined || value === null)) {
      errors.push(`Field '${this.name}' is required`);
      return { valid: false, errors };
    }

    if (value === undefined || value === null) {
      return { valid: true, errors: [], value: this.default };
    }

    // Type check
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== this.type && this.type !== 'any') {
      // Try type coercion
      const coerced = this._coerceType(value);
      if (coerced.error) {
        errors.push(`Field '${this.name}' must be ${this.type}, got ${actualType}`);
      } else {
        value = coerced.value;
      }
    }

    // Enum check
    if (this.enum && !this.enum.includes(value)) {
      errors.push(`Field '${this.name}' must be one of: ${this.enum.join(', ')}`);
    }

    // String checks
    if (this.type === 'string') {
      if (this.minLength && value.length < this.minLength) {
        errors.push(`Field '${this.name}' must be at least ${this.minLength} characters`);
      }
      if (this.maxLength && value.length > this.maxLength) {
        errors.push(`Field '${this.name}' must be at most ${this.maxLength} characters`);
      }
      if (this.pattern && !new RegExp(this.pattern).test(value)) {
        errors.push(`Field '${this.name}' does not match pattern: ${this.pattern}`);
      }
    }

    // Number checks
    if (this.type === 'number') {
      if (this.min !== undefined && value < this.min) {
        errors.push(`Field '${this.name}' must be at least ${this.min}`);
      }
      if (this.max !== undefined && value > this.max) {
        errors.push(`Field '${this.name}' must be at most ${this.max}`);
      }
    }

    // Custom validator
    if (this.validator) {
      const customResult = this.validator(value);
      if (customResult !== true) {
        errors.push(
          typeof customResult === 'string'
            ? customResult
            : `Custom validation failed for '${this.name}'`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      value,
    };
  }

  /**
   * Try to coerce value to expected type
   */
  _coerceType(value) {
    try {
      if (this.type === 'number') {
        const num = Number(value);
        if (isNaN(num)) {
          return { error: true };
        }
        return { value: num };
      }
      if (this.type === 'boolean') {
        if (typeof value === 'string') {
          return { value: value.toLowerCase() === 'true' };
        }
        return { value: Boolean(value) };
      }
      if (this.type === 'date') {
        return { value: new Date(value) };
      }
      return { value };
    } catch {
      return { error: true };
    }
  }

  /**
   * Transform value
   */
  transformValue(value) {
    if (this.transform && typeof this.transform === 'function') {
      return this.transform(value);
    }
    return value;
  }
}

export class LogSchema {
  constructor(config = {}) {
    this.name = config.name || 'default';
    this.version = config.version || '1.0.0';
    this.fields = new Map();

    // Add fields from config
    if (config.fields) {
      for (const [name, fieldConfig] of Object.entries(config.fields)) {
        this.addField(name, fieldConfig);
      }
    }

    // Stats
    this.stats = {
      validationAttempts: 0,
      successfulValidations: 0,
      failedValidations: 0,
      totalErrors: 0,
    };
  }

  /**
   * Add field to schema
   */
  addField(name, config = {}) {
    const field = new FieldSchema({
      name,
      ...config,
    });
    this.fields.set(name, field);
    return this;
  }

  /**
   * Validate log entry
   */
  validate(entry) {
    this.stats.validationAttempts++;
    const validatedEntry = {};
    const allErrors = [];

    // Validate each field in schema
    for (const [name, field] of this.fields.entries()) {
      const value = entry[name];
      const result = field.validate(value);

      if (!result.valid) {
        allErrors.push(...result.errors);
        this.stats.failedValidations++;
      } else {
        validatedEntry[name] = field.transformValue(result.value);
        this.stats.successfulValidations++;
      }
    }

    // Check for extra fields
    for (const key in entry) {
      if (!this.fields.has(key)) {
        // Allow extra fields but log warning
        validatedEntry[key] = entry[key];
      }
    }

    return {
      valid: allErrors.length === 0,
      errors: allErrors,
      entry: validatedEntry,
    };
  }

  /**
   * Get schema description
   */
  describe() {
    const description = {
      name: this.name,
      version: this.version,
      fields: {},
    };

    for (const [name, field] of this.fields.entries()) {
      description.fields[name] = {
        type: field.type,
        required: field.required,
        description: field.description,
        default: field.default,
        enum: field.enum,
        pattern: field.pattern,
        min: field.min,
        max: field.max,
        minLength: field.minLength,
        maxLength: field.maxLength,
      };
    }

    return description;
  }

  /**
   * Merge with another schema
   */
  merge(other) {
    const merged = new LogSchema({
      name: `${this.name}_merged_${other.name}`,
      version: '1.0.0',
    });

    for (const [name, field] of this.fields.entries()) {
      merged.fields.set(name, field);
    }

    for (const [name, field] of other.fields.entries()) {
      merged.fields.set(name, field);
    }

    return merged;
  }

  /**
   * Get statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      successRate:
        this.stats.validationAttempts > 0
          ? ((this.stats.successfulValidations / this.stats.validationAttempts) * 100).toFixed(2) +
            '%'
          : 'N/A',
    };
  }
}

export class SchemaRegistry {
  constructor() {
    this.schemas = new Map();
    this.defaultSchema = null;
  }

  /**
   * Register schema
   */
  register(name, schema) {
    if (!(schema instanceof LogSchema)) {
      throw new Error('Schema must be instance of LogSchema');
    }
    this.schemas.set(name, schema);

    // Set as default if first
    if (!this.defaultSchema) {
      this.defaultSchema = schema;
    }

    return this;
  }

  /**
   * Get schema
   */
  get(name) {
    return this.schemas.get(name) || this.defaultSchema;
  }

  /**
   * List all schemas
   */
  list() {
    return Array.from(this.schemas.keys());
  }

  /**
   * Validate with schema
   */
  validate(name, entry) {
    const schema = this.get(name);
    if (!schema) {
      throw new Error(`Schema '${name}' not found`);
    }
    return schema.validate(entry);
  }

  /**
   * Create schema for module
   */
  createModuleSchema(moduleName, fields = {}) {
    const defaultFields = {
      timestamp: {
        type: 'date',
        required: true,
        description: 'Log entry timestamp',
      },
      level: {
        type: 'string',
        required: true,
        enum: ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'],
        description: 'Log level',
      },
      module: {
        type: 'string',
        required: true,
        description: 'Module name',
      },
      message: {
        type: 'string',
        required: true,
        description: 'Log message',
      },
      context: {
        type: 'object',
        required: false,
        description: 'Additional context',
      },
    };

    const merged = { ...defaultFields, ...fields };
    const schema = new LogSchema({
      name: `module_${moduleName}`,
      fields: merged,
    });

    this.register(`module_${moduleName}`, schema);
    return schema;
  }
}

/**
 * Standard schemas
 */
export const StandardSchemas = {
  /**
   * Create basic log schema
   */
  basicLog() {
    return new LogSchema({
      name: 'basic_log',
      fields: {
        timestamp: { type: 'date', required: true },
        level: {
          type: 'string',
          required: true,
          enum: ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'],
        },
        message: { type: 'string', required: true },
        module: { type: 'string', required: false },
      },
    });
  },

  /**
   * Create detailed log schema
   */
  detailedLog() {
    return new LogSchema({
      name: 'detailed_log',
      fields: {
        timestamp: { type: 'date', required: true },
        level: {
          type: 'string',
          required: true,
          enum: ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'],
        },
        message: { type: 'string', required: true },
        module: { type: 'string', required: true },
        userId: { type: 'string', required: false },
        requestId: { type: 'string', required: false },
        duration: { type: 'number', required: false, min: 0 },
        error: { type: 'object', required: false },
        context: { type: 'object', required: false },
      },
    });
  },

  /**
   * Create API request schema
   */
  apiRequest() {
    return new LogSchema({
      name: 'api_request',
      fields: {
        timestamp: { type: 'date', required: true },
        method: { type: 'string', required: true, enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
        path: { type: 'string', required: true },
        statusCode: { type: 'number', required: true, min: 100, max: 599 },
        duration: { type: 'number', required: true, min: 0 },
        userId: { type: 'string', required: false },
        error: { type: 'string', required: false },
      },
    });
  },
};
