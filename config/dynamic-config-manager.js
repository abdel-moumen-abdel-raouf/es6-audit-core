/**
 * Dynamic Configuration Management System
 * 
 */

export class DynamicConfigManager {
    constructor(options = {}) {
        this.currentConfig = options.initialConfig || {};
        this.previousConfig = null;
        this.configHistory = [];
        this.validators = new Map();
        this.listeners = [];
        
        
        this.schema = options.schema || {};
        
        
        this.maxHistorySize = options.maxHistorySize ?? 50;
        this.maxRetries = options.maxRetries ?? 3;
        this.retryDelay = options.retryDelay ?? 1000;
        
        
        this.stats = {
            totalUpdates: 0,
            successfulUpdates: 0,
            failedUpdates: 0,
            rollbacks: 0,
            validationErrors: 0,
            lastUpdateTime: null,
            lastUpdateKey: null,
            updateHistory: []
        };

        
        this.watchers = new Map();
        
        
        if (options.initialConfig) {
            this._recordUpdate('initialization', options.initialConfig);
        }
    }

    /**
 * 
 */
    registerValidator(key, validatorFn) {
        if (typeof validatorFn !== 'function') {
            throw new Error('Validator must be a function');
        }
        
        this.validators.set(key, validatorFn);
    }

    /**
 * 
 */
    validateValue(key, value) {
        
        if (this.schema[key]) {
            const schemaValidator = this._getSchemaValidator(this.schema[key]);
            const schemaResult = schemaValidator(value);
            
            if (!schemaResult.valid) {
                return {
                    valid: false,
                    reason: schemaResult.reason,
                    details: schemaResult.details
                };
            }
        }

        
        if (this.validators.has(key)) {
            try {
                const result = this.validators.get(key)(value);
                
                if (result === false || (result && result.valid === false)) {
                    return {
                        valid: false,
                        reason: 'Custom validator failed',
                        details: result?.message || 'Unknown error'
                    };
                }
            } catch (error) {
                return {
                    valid: false,
                    reason: 'Validator threw error',
                    details: error.message
                };
            }
        }

        return { valid: true };
    }

    /**
 * 
 */
    _getSchemaValidator(schema) {
        return (value) => {
            
            if (schema.type) {
                const valueType = typeof value;
                if (valueType !== schema.type) {
                    return {
                        valid: false,
                        reason: `Type mismatch: expected ${schema.type}, got ${valueType}`
                    };
                }
            }

            
            if (schema.enum && !schema.enum.includes(value)) {
                return {
                    valid: false,
                    reason: `Value must be one of: ${schema.enum.join(', ')}`
                };
            }

            
            if (schema.min !== undefined && value < schema.min) {
                return {
                    valid: false,
                    reason: `Value must be >= ${schema.min}`
                };
            }

            if (schema.max !== undefined && value > schema.max) {
                return {
                    valid: false,
                    reason: `Value must be <= ${schema.max}`
                };
            }

            
            if (schema.minLength && value.length < schema.minLength) {
                return {
                    valid: false,
                    reason: `Length must be >= ${schema.minLength}`
                };
            }

            if (schema.maxLength && value.length > schema.maxLength) {
                return {
                    valid: false,
                    reason: `Length must be <= ${schema.maxLength}`
                };
            }

            return { valid: true };
        };
    }

    /**
 * 
 */
    updateConfig(key, value, options = {}) {
        
        const validation = this.validateValue(key, value);
        
        if (!validation.valid) {
            this.stats.validationErrors++;
            return {
                success: false,
                error: validation.reason,
                details: validation.details
            };
        }

        
        this.previousConfig = { ...this.currentConfig };
        
        
        this.currentConfig[key] = value;

        
        this._recordUpdate(key, value, options);

        
        this._notifyListeners({
            type: 'update',
            key,
            value,
            timestamp: Date.now()
        });

        
        this._executeWatchers(key, value);

        this.stats.successfulUpdates++;

        return {
            success: true,
            key,
            value,
            timestamp: Date.now()
        };
    }

    /**
 * 
 */
    updateConfigs(updates, options = {}) {
        const results = [];
        const backup = { ...this.currentConfig };

        for (const [key, value] of Object.entries(updates)) {
            const result = this.updateConfig(key, value, options);
            results.push(result);

            if (!result.success && options.rollbackOnError) {
                
                this.currentConfig = backup;
                return {
                    success: false,
                    error: 'Rollback due to error',
                    failedKey: key,
                    details: result.details,
                    partialUpdates: results.filter(r => r.success)
                };
            }
        }

        return {
            success: true,
            updates: results,
            totalUpdated: results.filter(r => r.success).length
        };
    }

    /**
 * 
 */
    getConfig(key = null) {
        if (key === null) {
            return { ...this.currentConfig };
        }

        return this.currentConfig[key];
    }

    /**
 * 
 */
    getConfigWithMetadata(key = null) {
        const config = key ? { [key]: this.currentConfig[key] } : this.currentConfig;

        return {
            config,
            metadata: {
                lastUpdate: this.stats.lastUpdateTime,
                totalUpdates: this.stats.totalUpdates,
                version: this.configHistory.length,
                schema: this.schema
            }
        };
    }

    /**
 * 
 */
    rollback() {
        if (!this.previousConfig) {
            return {
                success: false,
                error: 'No previous configuration to rollback to'
            };
        }

        const current = { ...this.currentConfig };
        this.currentConfig = this.previousConfig;
        this.previousConfig = current;

        this.stats.rollbacks++;

        this._notifyListeners({
            type: 'rollback',
            previousConfig: current,
            restoredConfig: this.currentConfig,
            timestamp: Date.now()
        });

        return {
            success: true,
            previousConfig: current,
            restoredConfig: this.currentConfig,
            timestamp: Date.now()
        };
    }

    /**
 * 
 */
    rollbackToVersion(versionIndex) {
        if (versionIndex < 0 || versionIndex >= this.configHistory.length) {
            return {
                success: false,
                error: 'Invalid version index'
            };
        }

        const targetVersion = this.configHistory[versionIndex];
        this.previousConfig = { ...this.currentConfig };
        this.currentConfig = { ...targetVersion.config };

        this.stats.rollbacks++;

        return {
            success: true,
            version: versionIndex,
            restoredAt: Date.now()
        };
    }

    /**
 * 
 */
    watch(key, callback) {
        if (!this.watchers.has(key)) {
            this.watchers.set(key, []);
        }

        this.watchers.get(key).push(callback);

        return () => {
            const callbacks = this.watchers.get(key);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        };
    }

    /**
 * 
 */
    _executeWatchers(key, value) {
        if (this.watchers.has(key)) {
            const callbacks = this.watchers.get(key);
            for (const callback of callbacks) {
                try {
                    callback(value);
                } catch (error) {
                    console.error(`[DynamicConfig] Watcher error for key "${key}":`, error.message);
                }
            }
        }
    }

    /**
 * 
 */
    onChange(callback) {
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
 */
    _notifyListeners(event) {
        for (const listener of this.listeners) {
            try {
                listener(event);
            } catch (error) {
                console.error('[DynamicConfig] Listener error:', error.message);
            }
        }
    }

    /**
 * 
 */
    _recordUpdate(key, value, options = {}) {
        const record = {
            timestamp: Date.now(),
            key,
            value: typeof value === 'object' ? { ...value } : value,
            reason: options.reason || null,
            userId: options.userId || null,
            source: options.source || 'api'
        };

        this.configHistory.push(record);

        
        if (this.configHistory.length > this.maxHistorySize) {
            this.configHistory.shift();
        }

        this.stats.totalUpdates++;
        this.stats.lastUpdateTime = record.timestamp;
        this.stats.lastUpdateKey = key;
        this.stats.updateHistory.push(record);

        if (this.stats.updateHistory.length > 100) {
            this.stats.updateHistory.shift();
        }
    }

    /**
 * 
 */
    getUpdateHistory(limit = 10) {
        return this.configHistory
            .slice(-limit)
            .reverse()
            .map((record, index) => ({
                ...record,
                index: this.configHistory.length - 1 - index
            }));
    }

    /**
 * 
 */
    searchHistory(criteria) {
        return this.configHistory.filter(record => {
            if (criteria.key && record.key !== criteria.key) {
                return false;
            }
            if (criteria.startTime && record.timestamp < criteria.startTime) {
                return false;
            }
            if (criteria.endTime && record.timestamp > criteria.endTime) {
                return false;
            }
            if (criteria.source && record.source !== criteria.source) {
                return false;
            }
            return true;
        });
    }

    /**
 * 
 */
    getStatistics() {
        const successRate = this.stats.totalUpdates > 0 ?
            ((this.stats.successfulUpdates / this.stats.totalUpdates) * 100).toFixed(1) :
            0;

        return {
            ...this.stats,
            successRate: `${successRate}%`,
            totalConfigKeys: Object.keys(this.currentConfig).length,
            historySize: this.configHistory.length,
            watchers: this.watchers.size,
            listeners: this.listeners.length
        };
    }

    /**
 * 
 */
    reset(newConfig = {}) {
        this.previousConfig = { ...this.currentConfig };
        this.currentConfig = newConfig;
        this.configHistory = [];
        
        this.stats = {
            totalUpdates: 0,
            successfulUpdates: 0,
            failedUpdates: 0,
            rollbacks: 0,
            validationErrors: 0,
            lastUpdateTime: null,
            lastUpdateKey: null,
            updateHistory: []
        };

        this._notifyListeners({
            type: 'reset',
            timestamp: Date.now()
        });
    }
}
