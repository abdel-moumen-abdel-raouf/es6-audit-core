/**
 * Feature Flag Manager
 * 
 * 1. A/B Testing and Gradual Rollout
 * 2. Context-Based Rules
 * 3. Dynamic Updates and Hot-Reload
 * 4. Audit Trail and Statistics
 */

export class FeatureFlagManager {
    /**
     * Initialize Feature Flag Manager
     * @param {Object} options - Manager configuration
     */
    constructor(options = {}) {
        this.flags = new Map(); // Flag definitions
        this.contexts = new Map(); // User/Device/Tenant contexts
        this.rules = new Map(); // Rules for flag evaluation
        this.evaluationCache = new Map(); // Cache evaluations
        this.listeners = new Set(); // Change listeners
        this.stats = {
            evaluations: 0,
            cacheHits: 0,
            cacheMisses: 0,
            rulesToggles: 0,
            variantAssignments: 0,
            errors: 0
        };
        this.history = []; // Audit trail
        this.maxHistory = options.maxHistory || 1000;
        this.cacheEnabled = options.cacheEnabled !== false;
        this.cacheTTL = options.cacheTTL || 60000; // 60s default
    }

    /**
     * Register a feature flag
     * @param {string} name - Flag name
     * @param {Object} config - Flag configuration
     * @returns {Function} Unregister function
     */
    registerFlag(name, config) {
        const flag = {
            name,
            enabled: config.enabled !== false,
            description: config.description || '',
            owner: config.owner || 'unknown',
            variant: config.variant || null, // A/B test variants
            rolloutPercentage: config.rolloutPercentage !== undefined ? config.rolloutPercentage : (config.enabled ? 100 : 0),
            targetContexts: config.targetContexts || {}, // Condition map
            createdAt: Date.now(),
            updatedAt: Date.now(),
            tags: config.tags || []
        };

        this.flags.set(name, flag);
        this._recordHistory('FLAG_REGISTERED', { flag: name, config });
        this._notifyListeners({ type: 'flag-registered', flag: name });

        // Return unregister function
        return () => {
            this.flags.delete(name);
            this._recordHistory('FLAG_UNREGISTERED', { flag: name });
            this._notifyListeners({ type: 'flag-unregistered', flag: name });
        };
    }

    /**
     * Evaluate a flag for a specific context
     * @param {string} name - Flag name
     * @param {Object} context - Evaluation context (userId, deviceId, etc)
     * @returns {Object} { enabled: boolean, variant: string|null, reason: string }
     */
    evaluateFlag(name, context = {}) {
        this.stats.evaluations++;

        const flag = this.flags.get(name);
        if (!flag) {
            this.stats.errors++;
            return {
                enabled: false,
                variant: null,
                reason: 'FLAG_NOT_FOUND'
            };
        }

        // Check cache
        const cacheKey = this._getCacheKey(name, context);
        if (this.cacheEnabled) {
            const cached = this.evaluationCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
                this.stats.cacheHits++;
                return cached.result;
            }
        }

        this.stats.cacheMisses++;

        // Evaluate flag
        const result = this._evaluateFlagLogic(flag, context);

        // Cache result
        if (this.cacheEnabled) {
            this.evaluationCache.set(cacheKey, {
                result,
                timestamp: Date.now()
            });
        }

        return result;
    }

    /**
     * Internal flag evaluation logic
     * @private
     */
    _evaluateFlagLogic(flag, context) {
        // Check context-based rules FIRST
        const rules = this.rules.get(flag.name);
        if (rules && rules.length > 0) {
            // If flag has rules, rules are definitive
            for (const rule of rules) {
                if (this._ruleMatches(rule, context)) {
                    this.stats.rulesToggles++;
                    let variant = rule.variant || null;
                    
                    // Assign variant if A/B test is active
                    if (rule.enabled && flag.variant) {
                        variant = this._assignVariant(flag, context);
                        this.stats.variantAssignments++;
                    }
                    
                    return {
                        enabled: rule.enabled,
                        variant,
                        reason: 'CONTEXT_RULE_MATCHED'
                    };
                }
            }
            
            // No rule matched - feature is disabled for this context
            return {
                enabled: false,
                variant: null,
                reason: 'NO_MATCHING_RULE'
            };
        }

        // Check rollout percentage (applies when no specific rules)
        if (flag.rolloutPercentage <= 0) {
            // 0% means completely disabled
            return {
                enabled: false,
                variant: null,
                reason: 'ROLLOUT_PERCENTAGE'
            };
        }

        if (flag.rolloutPercentage < 100) {
            const hash = this._hashContext(context);
            const percentage = (hash % 100) + 1;

            if (percentage > flag.rolloutPercentage) {
                this.stats.rulesToggles++;
                return {
                    enabled: false,
                    variant: null,
                    reason: 'ROLLOUT_PERCENTAGE'
                };
            }
        }

        // Base flag state
        if (!flag.enabled) {
            return {
                enabled: false,
                variant: null,
                reason: 'FLAG_DISABLED'
            };
        }

        // Determine variant if A/B test is active
        let variant = null;
        if (flag.variant) {
            variant = this._assignVariant(flag, context);
            this.stats.variantAssignments++;
        }

        return {
            enabled: true,
            variant,
            reason: 'EVALUATION_SUCCESS'
        };
    }

    /**
     * Evaluate context-based rules
     * @private
     */
    _evaluateContextRules(flag, context) {
        const rules = this.rules.get(flag.name);
        if (!rules || rules.length === 0) {
            return null;
        }

        for (const rule of rules) {
            if (this._ruleMatches(rule, context)) {
                this.stats.rulesToggles++;
                return {
                    enabled: rule.enabled,
                    variant: rule.variant || null,
                    reason: 'CONTEXT_RULE_MATCHED'
                };
            }
        }

        return null;
    }

    /**
     * Check if a rule matches the context
     * @private
     */
    _ruleMatches(rule, context) {
        if (!rule.conditions || rule.conditions.length === 0) {
            return true;
        }

        return rule.conditions.every(condition => {
            const contextValue = this._getContextValue(context, condition.path);
            return this._evaluateCondition(condition, contextValue);
        });
    }

    /**
     * Evaluate a single condition
     * @private
     */
    _evaluateCondition(condition, value) {
        switch (condition.operator) {
            case 'equals':
                return value === condition.value;
            case 'not-equals':
                return value !== condition.value;
            case 'in':
                return Array.isArray(condition.value) && condition.value.includes(value);
            case 'not-in':
                return Array.isArray(condition.value) && !condition.value.includes(value);
            case 'contains':
                return String(value).includes(condition.value);
            case 'starts-with':
                return String(value).startsWith(condition.value);
            case 'ends-with':
                return String(value).endsWith(condition.value);
            case 'greater-than':
                return Number(value) > Number(condition.value);
            case 'less-than':
                return Number(value) < Number(condition.value);
            case 'regex':
                return new RegExp(condition.value).test(String(value));
            default:
                return false;
        }
    }

    /**
     * Get nested value from context
     * @private
     */
    _getContextValue(context, path) {
        return path.split('.').reduce((obj, key) => {
            return obj && obj[key];
        }, context);
    }

    /**
     * Add a context-based rule
     * @param {string} flagName - Flag name
     * @param {Object} rule - Rule definition
     */
    addRule(flagName, rule) {
        if (!this.flags.has(flagName)) {
            throw new Error(`Flag '${flagName}' not found`);
        }

        if (!this.rules.has(flagName)) {
            this.rules.set(flagName, []);
        }

        const ruleObj = {
            id: `rule-${Date.now()}-${Math.random()}`,
            enabled: rule.enabled !== false,
            variant: rule.variant || null,
            conditions: rule.conditions || [],
            priority: rule.priority || 0,
            createdAt: Date.now()
        };

        const ruleList = this.rules.get(flagName);
        ruleList.push(ruleObj);

        // Sort by priority
        ruleList.sort((a, b) => b.priority - a.priority);

        this._recordHistory('RULE_ADDED', { flagName, ruleId: ruleObj.id });
        this._notifyListeners({ type: 'rule-added', flag: flagName });

        return ruleObj.id;
    }

    /**
     * Remove a rule
     * @param {string} flagName - Flag name
     * @param {string} ruleId - Rule ID
     */
    removeRule(flagName, ruleId) {
        const rules = this.rules.get(flagName);
        if (!rules) return;

        const index = rules.findIndex(r => r.id === ruleId);
        if (index >= 0) {
            rules.splice(index, 1);
            this._clearCache(flagName);
            this._recordHistory('RULE_REMOVED', { flagName, ruleId });
            this._notifyListeners({ type: 'rule-removed', flag: flagName });
        }
    }

    /**
     * Update rollout percentage (gradual rollout)
     * @param {string} flagName - Flag name
     * @param {number} percentage - Rollout percentage (0-100)
     */
    updateRolloutPercentage(flagName, percentage) {
        const flag = this.flags.get(flagName);
        if (!flag) {
            throw new Error(`Flag '${flagName}' not found`);
        }

        if (percentage < 0 || percentage > 100) {
            throw new Error('Percentage must be between 0 and 100');
        }

        flag.rolloutPercentage = percentage;
        flag.updatedAt = Date.now();

        this._clearCache(flagName);
        this._recordHistory('ROLLOUT_UPDATED', { flagName, percentage });
        this._notifyListeners({ type: 'rollout-updated', flag: flagName, percentage });
    }

    /**
     * Assign variant for A/B testing
     * @private
     */
    _assignVariant(flag, context) {
        if (!flag.variant || !flag.variant.options) {
            return null;
        }

        const hash = this._hashContext(context);
        const index = hash % flag.variant.options.length;

        return flag.variant.options[index];
    }

    /**
     * Hash context for consistent variant assignment
     * @private
     */
    _hashContext(context) {
        // Use first available identifier, or all context as JSON
        const key = context.userId || context.deviceId || context.tenantId || JSON.stringify(context);
        let hash = 0;

        for (let i = 0; i < key.toString().length; i++) {
            const char = key.toString().charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }

        return Math.abs(hash);
    }

    /**
     * Get cache key
     * @private
     */
    _getCacheKey(name, context) {
        const contextKey = Object.entries(context)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join('|');

        return `${name}:${contextKey}`;
    }

    /**
     * Clear cache for a flag
     * @private
     */
    _clearCache(flagName) {
        for (const [key] of this.evaluationCache) {
            if (key.startsWith(flagName + ':')) {
                this.evaluationCache.delete(key);
            }
        }
    }

    /**
     * Get all flags
     */
    getFlags() {
        const flags = {};
        for (const [name, flag] of this.flags) {
            flags[name] = {
                ...flag,
                rules: this.rules.get(name) || []
            };
        }
        return flags;
    }

    /**
     * Get statistics
     */
    getStatistics() {
        return {
            totalFlags: this.flags.size,
            enabledFlags: Array.from(this.flags.values()).filter(f => f.enabled).length,
            evaluations: this.stats.evaluations,
            cacheHits: this.stats.cacheHits,
            cacheMisses: this.stats.cacheMisses,
            cacheHitRate: this.stats.evaluations > 0 
                ? ((this.stats.cacheHits / this.stats.evaluations) * 100).toFixed(2) + '%'
                : '0%',
            rulesToggles: this.stats.rulesToggles,
            variantAssignments: this.stats.variantAssignments,
            errors: this.stats.errors,
            historyLength: this.history.length
        };
    }

    /**
     * Record history entry
     * @private
     */
    _recordHistory(action, details) {
        this.history.push({
            timestamp: Date.now(),
            action,
            details
        });

        // Keep history size under control
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }
    }

    /**
     * Notify listeners of changes
     * @private
     */
    _notifyListeners(event) {
        for (const listener of this.listeners) {
            try {
                listener(event);
            } catch (error) {
                console.error('Listener error:', error);
            }
        }
    }

    /**
     * Register change listener
     * @param {Function} callback - Listener callback
     * @returns {Function} Unregister function
     */
    onChange(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    /**
     * Get history entries
     * @param {Object} filter - Filter criteria
     */
    getHistory(filter = {}) {
        return this.history.filter(entry => {
            if (filter.action && entry.action !== filter.action) {
                return false;
            }
            if (filter.flagName && entry.details.flagName !== filter.flagName) {
                return false;
            }
            return true;
        });
    }

    /**
     * Reset all flags
     */
    reset() {
        this.flags.clear();
        this.rules.clear();
        this.evaluationCache.clear();
        this.history = [];
        this.stats = {
            evaluations: 0,
            cacheHits: 0,
            cacheMisses: 0,
            rulesToggles: 0,
            variantAssignments: 0,
            errors: 0
        };
        this._notifyListeners({ type: 'reset' });
    }
}

export default FeatureFlagManager;
