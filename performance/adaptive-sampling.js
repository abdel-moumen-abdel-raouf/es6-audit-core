/**
 * Adaptive Sampling Manager
 *
 * 1. Context-Based Sampling Rules
 * 2. Dynamic Sampling Decisions
 * 3. Performance-Aware Adjustment
 * 4. Statistical Tracking
 */

import { EventEmitter } from 'events';

export class AdaptiveSamplingManager extends EventEmitter {
  /**
   * Initialize Adaptive Sampling Manager
   * @param {Object} options - Configuration options
   */
  constructor(options = {}) {
    super();

    // Base sampling rules
    this.defaultSamplingRate = options.defaultSamplingRate || 0.1; // 10%
    this.rules = new Map(); // name -> rule definition
    this.ruleStats = new Map(); // track rule effectiveness

    // Adaptive thresholds
    this.cpuThreshold = options.cpuThreshold || 80; // 80% CPU
    this.memoryThreshold = options.memoryThreshold || 85; // 85% memory
    this.queueDepthThreshold = options.queueDepthThreshold || 1000;

    // Context storage
    this.context = new Map(); // module/context -> sampling state
    this.contextTimeout = options.contextTimeout || 60000; // 1 minute

    // Statistics
    this.stats = {
      totalDecisions: 0,
      sampledEvents: 0,
      skippedEvents: 0,
      dynamicAdjustments: 0,
      avgSamplingRate: 0,
      contextCount: 0,
    };

    this.history = [];
    this.maxHistory = options.maxHistory || 500;

    // Initialize built-in rules
    this._initializeDefaultRules();
  }

  /**
   * Initialize default sampling rules
   * @private
   */
  _initializeDefaultRules() {
    // Rule 1: Error logging always samples (100%)
    this.addRule('error-always-sample', {
      description: 'Sample all error-level logs',
      condition: (entry) => entry.level === 'error' || entry.level === 'fatal',
      samplingRate: 1.0,
      priority: 100,
    });

    // Rule 2: Performance metrics sampling (50%)
    this.addRule('performance-sample-high', {
      description: 'Sample performance metrics at higher rate',
      condition: (entry) => entry.type === 'performance' || entry.type === 'metric',
      samplingRate: 0.5,
      priority: 80,
    });

    // Rule 3: Debug logs lower sampling (5%)
    this.addRule('debug-sample-low', {
      description: 'Sample debug logs at lower rate',
      condition: (entry) => entry.level === 'debug' || entry.level === 'trace',
      samplingRate: 0.05,
      priority: 20,
    });

    // Rule 4: Context-based sampling
    this.addRule('context-aware', {
      description: 'Adjust sampling based on module context',
      condition: (entry, context) => {
        if (!context) return false;
        const contextState = this.context.get(context.module);
        return contextState && contextState.isActive;
      },
      samplingRate: 0.75,
      priority: 60,
      dynamic: true,
    });

    // Rule 5: Load-based adaptive sampling
    this.addRule('load-adaptive', {
      description: 'Reduce sampling under high load',
      condition: (entry, context) => {
        if (!context) return false;
        return context.cpuUsage > this.cpuThreshold || context.memoryUsage > this.memoryThreshold;
      },
      samplingRate: 0.02,
      priority: 50,
      dynamic: true,
    });
  }

  /**
   * Add a custom sampling rule
   * @param {string} name - Rule name
   * @param {Object} rule - Rule definition
   */
  addRule(name, rule) {
    const ruleEntry = {
      name,
      condition: rule.condition,
      samplingRate: rule.samplingRate || this.defaultSamplingRate,
      priority: rule.priority || 50,
      dynamic: rule.dynamic || false,
      description: rule.description || 'Custom sampling rule',
    };

    this.rules.set(name, ruleEntry);
    this.ruleStats.set(name, {
      applicableCount: 0,
      sampledCount: 0,
      skippedCount: 0,
      effectiveness: 0,
    });

    this._recordHistory('RULE_ADDED', { ruleName: name, samplingRate: rule.samplingRate });
  }

  /**
   * Remove a sampling rule
   * @param {string} name - Rule name
   */
  removeRule(name) {
    if (this.rules.delete(name)) {
      this.ruleStats.delete(name);
      this._recordHistory('RULE_REMOVED', { ruleName: name });
    }
  }

  /**
   * Make sampling decision for an entry
   * @param {Object} entry - Log entry or event
   * @param {Object} context - Execution context (optional)
   * @returns {boolean} Whether to sample this entry
   */
  shouldSample(entry, context = null) {
    this.stats.totalDecisions++;

    // Track context if provided
    if (context && context.module) {
      const sample = Math.random() < this.defaultSamplingRate;
      this._updateContext(context.module, sample);
    }

    // Find applicable rules ordered by priority
    const applicableRules = Array.from(this.rules.values())
      .filter((rule) => {
        try {
          return rule.condition(entry, context);
        } catch (error) {
          console.error(`Error evaluating rule condition: ${error.message}`);
          return false;
        }
      })
      .sort((a, b) => b.priority - a.priority);

    if (applicableRules.length === 0) {
      // Use default sampling rate
      const sample = Math.random() < this.defaultSamplingRate;
      this._updateStats('default', sample);
      return sample;
    }

    // Use highest priority rule
    const selectedRule = applicableRules[0];
    const shouldSample = Math.random() < selectedRule.samplingRate;

    // Update statistics
    this._updateRuleStats(selectedRule.name, shouldSample);
    this._updateStats(selectedRule.name, shouldSample);

    return shouldSample;
  }

  /**
   * Update statistics for a sampling decision
   * @private
   */
  _updateStats(ruleName, sampled) {
    if (sampled) {
      this.stats.sampledEvents++;
    } else {
      this.stats.skippedEvents++;
    }

    // Calculate average sampling rate
    const total = this.stats.sampledEvents + this.stats.skippedEvents;
    this.stats.avgSamplingRate = this.stats.sampledEvents / total;
  }

  /**
   * Update rule statistics
   * @private
   */
  _updateRuleStats(ruleName, sampled) {
    const stats = this.ruleStats.get(ruleName);
    if (!stats) return;

    stats.applicableCount++;
    if (sampled) {
      stats.sampledCount++;
    } else {
      stats.skippedCount++;
    }

    // Calculate effectiveness (how well the rule performs)
    const totalForRule = stats.sampledCount + stats.skippedCount;
    const expectedSampled = this.rules.get(ruleName).samplingRate * totalForRule;
    stats.effectiveness =
      Math.abs(stats.sampledCount - expectedSampled) / Math.max(expectedSampled, 1);
  }

  /**
   * Update context state for adaptive sampling
   * @private
   */
  _updateContext(moduleName, sampled) {
    let contextState = this.context.get(moduleName);

    if (!contextState) {
      contextState = {
        module: moduleName,
        isActive: sampled,
        eventCount: 0,
        sampledCount: 0,
        createdAt: Date.now(),
        lastUpdate: Date.now(),
      };
      this.context.set(moduleName, contextState);
      this.stats.contextCount++;
    }

    contextState.eventCount++;
    if (sampled) {
      contextState.sampledCount++;
    }
    contextState.lastUpdate = Date.now();

    // Update context activity status based on sampling ratio
    const samplingRatio = contextState.sampledCount / contextState.eventCount;
    contextState.isActive = samplingRatio > this.defaultSamplingRate;
  }

  /**
   * Get sampling recommendations for high-load scenarios
   * @param {Object} systemMetrics - System metrics (CPU, memory, queue depth)
   * @returns {Object} Recommended sampling adjustments
   */
  getAdaptiveRecommendation(systemMetrics = {}) {
    const cpuUsage = systemMetrics.cpuUsage || 0;
    const memoryUsage = systemMetrics.memoryUsage || 0;
    const queueDepth = systemMetrics.queueDepth || 0;

    const recommendation = {
      shouldAdjust: false,
      adjustmentFactor: 1.0,
      reason: '',
      severity: 'normal',
    };

    // Determine adjustment needs
    if (cpuUsage > this.cpuThreshold) {
      const overage = cpuUsage - this.cpuThreshold;
      recommendation.adjustmentFactor = Math.max(0.05, 1.0 - (overage / 100) * 0.5);
      recommendation.shouldAdjust = true;
      recommendation.reason = `High CPU usage: ${cpuUsage}%`;
      recommendation.severity = 'high';
    }

    if (memoryUsage > this.memoryThreshold) {
      const overage = memoryUsage - this.memoryThreshold;
      recommendation.adjustmentFactor = Math.max(
        0.05,
        recommendation.adjustmentFactor * (1.0 - (overage / 100) * 0.4)
      );
      recommendation.shouldAdjust = true;
      recommendation.reason = `High memory usage: ${memoryUsage}%`;
      recommendation.severity = 'high';
    }

    if (queueDepth > this.queueDepthThreshold) {
      const depthRatio = queueDepth / this.queueDepthThreshold;
      recommendation.adjustmentFactor = Math.max(
        0.05,
        recommendation.adjustmentFactor * (1.0 / depthRatio)
      );
      recommendation.shouldAdjust = true;
      recommendation.reason = `Queue depth: ${queueDepth}`;
      recommendation.severity = 'medium';
    }

    if (recommendation.shouldAdjust) {
      this.stats.dynamicAdjustments++;
      this._recordHistory('ADAPTIVE_ADJUSTMENT', {
        adjustmentFactor: recommendation.adjustmentFactor,
        reason: recommendation.reason,
        severity: recommendation.severity,
      });
    }

    return recommendation;
  }

  /**
   * Get rule statistics
   * @param {string} ruleName - Optional specific rule name
   * @returns {Object} Statistics
   */
  getRuleStatistics(ruleName = null) {
    if (ruleName) {
      return {
        ruleName,
        ...this.ruleStats.get(ruleName),
      };
    }

    // Return all rule statistics
    const allStats = {};
    for (const [name, stats] of this.ruleStats) {
      allStats[name] = stats;
    }

    return allStats;
  }

  /**
   * Get context statistics
   * @returns {Object} Context statistics
   */
  getContextStatistics() {
    const contexts = {};

    for (const [moduleName, state] of this.context) {
      contexts[moduleName] = {
        module: moduleName,
        eventCount: state.eventCount,
        sampledCount: state.sampledCount,
        samplingRate: state.eventCount > 0 ? state.sampledCount / state.eventCount : 0,
        isActive: state.isActive,
        age: Date.now() - state.createdAt,
      };
    }

    return contexts;
  }

  /**
   * Get overall sampling statistics
   * @returns {Object} Overall statistics
   */
  getStatistics() {
    return {
      totalDecisions: this.stats.totalDecisions,
      sampledEvents: this.stats.sampledEvents,
      skippedEvents: this.stats.skippedEvents,
      avgSamplingRate: Math.round(this.stats.avgSamplingRate * 10000) / 100 + '%',
      dynamicAdjustments: this.stats.dynamicAdjustments,
      activeContexts: this.stats.contextCount,
      registeredRules: this.rules.size,
      ruleStatistics: this.getRuleStatistics(),
      contextStatistics: this.getContextStatistics(),
    };
  }

  /**
   * Clear expired contexts
   */
  clearExpiredContexts() {
    const now = Date.now();
    let clearedCount = 0;

    for (const [moduleName, state] of this.context) {
      if (now - state.lastUpdate > this.contextTimeout) {
        this.context.delete(moduleName);
        clearedCount++;
      }
    }

    if (clearedCount > 0) {
      this.stats.contextCount -= clearedCount;
      this._recordHistory('CONTEXTS_CLEARED', { count: clearedCount });
    }

    return clearedCount;
  }

  /**
   * Reset all statistics
   */
  resetStatistics() {
    this.stats = {
      totalDecisions: 0,
      sampledEvents: 0,
      skippedEvents: 0,
      dynamicAdjustments: 0,
      avgSamplingRate: 0,
      contextCount: 0,
    };

    for (const stats of this.ruleStats.values()) {
      stats.applicableCount = 0;
      stats.sampledCount = 0;
      stats.skippedCount = 0;
      stats.effectiveness = 0;
    }

    this._recordHistory('STATISTICS_RESET', {});
  }

  /**
   * Get history entries
   * @param {Object} filter - Filter criteria
   * @returns {Array} History entries
   */
  getHistory(filter = {}) {
    return this.history.filter((entry) => {
      if (filter.action && entry.action !== filter.action) return false;
      if (filter.ruleName && entry.details && entry.details.ruleName !== filter.ruleName)
        return false;
      return true;
    });
  }

  /**
   * Record history entry
   * @private
   */
  _recordHistory(action, details) {
    this.history.push({
      timestamp: Date.now(),
      action,
      details,
    });

    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }
}
