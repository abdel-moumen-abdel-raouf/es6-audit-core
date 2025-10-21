/**
 * Health Checks System
 *
 */

export class HealthCheckManager {
  constructor(options = {}) {
    this.serviceName = options.serviceName || 'unknown-service';

    this.checks = new Map();

    this.CheckStatus = {
      HEALTHY: 'healthy',
      DEGRADED: 'degraded',
      UNHEALTHY: 'unhealthy',
    };

    this.CheckTypes = {
      LIVENESS: 'liveness',
      READINESS: 'readiness',
      STARTUP: 'startup',
    };

    this.timeoutMs = options.timeoutMs || 5000;
    this.retries = options.retries || 1;

    this.stats = {
      totalChecks: 0,
      lastCheckTime: null,
      checksHistory: [],
      checkCounts: {
        healthy: 0,
        degraded: 0,
        unhealthy: 0,
      },
    };

    this.startupTime = Date.now();
    this.readyTime = null;
  }

  /**
   *
   */
  registerCheck(name, checkFn, options = {}) {
    const check = {
      name,
      fn: checkFn,
      type: options.type || this.CheckTypes.LIVENESS,
      description: options.description || '',
      timeout: options.timeout || this.timeoutMs,
      retries: options.retries || this.retries,
      lastResult: null,
      lastCheckedAt: null,
      failureCount: 0,
      successCount: 0,
    };

    this.checks.set(name, check);
    return () => this.checks.delete(name);
  }

  /**
   *
   */
  async runCheck(checkName) {
    const check = this.checks.get(checkName);

    if (!check) {
      return {
        status: this.CheckStatus.UNHEALTHY,
        name: checkName,
        error: 'Check not found',
      };
    }

    let lastError = null;

    for (let attempt = 0; attempt <= check.retries; attempt++) {
      try {
        const result = await Promise.race([
          Promise.resolve(check.fn()),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), check.timeout)),
        ]);

        if (typeof result === 'boolean') {
          const status = result ? this.CheckStatus.HEALTHY : this.CheckStatus.UNHEALTHY;

          check.lastResult = {
            status,
            timestamp: Date.now(),
            attempt,
          };
          check.lastCheckedAt = Date.now();

          if (status === this.CheckStatus.HEALTHY) {
            check.successCount++;
          } else {
            check.failureCount++;
          }

          return {
            status,
            name: checkName,
            description: check.description,
            type: check.type,
            timestamp: check.lastResult.timestamp,
            attempt,
          };
        } else if (typeof result === 'object' && result.status) {
          check.lastResult = result;
          check.lastCheckedAt = Date.now();

          if (result.status === this.CheckStatus.HEALTHY) {
            check.successCount++;
          } else {
            check.failureCount++;
          }

          return {
            status: result.status,
            name: checkName,
            description: check.description,
            type: check.type,
            details: result.details,
            timestamp: Date.now(),
            attempt,
          };
        }
      } catch (error) {
        lastError = error;

        if (attempt < check.retries) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    }

    check.failureCount++;
    check.lastResult = {
      status: this.CheckStatus.UNHEALTHY,
      error: lastError.message,
    };
    check.lastCheckedAt = Date.now();

    return {
      status: this.CheckStatus.UNHEALTHY,
      name: checkName,
      description: check.description,
      type: check.type,
      error: lastError.message,
      timestamp: Date.now(),
    };
  }

  /**
   *
   */
  async runChecks(type = null) {
    const checks = Array.from(this.checks.values()).filter((c) => !type || c.type === type);

    const results = await Promise.all(checks.map((c) => this.runCheck(c.name)));

    this.stats.lastCheckTime = Date.now();
    this.stats.checksHistory.push({
      timestamp: Date.now(),
      type,
      results,
    });

    if (this.stats.checksHistory.length > 100) {
      this.stats.checksHistory.shift();
    }

    for (const result of results) {
      if (result.status === this.CheckStatus.HEALTHY) {
        this.stats.checkCounts.healthy++;
      } else if (result.status === this.CheckStatus.DEGRADED) {
        this.stats.checkCounts.degraded++;
      } else {
        this.stats.checkCounts.unhealthy++;
      }
    }

    return results;
  }

  /**
   *
   */
  async getLiveness() {
    const results = await this.runChecks(this.CheckTypes.LIVENESS);

    return {
      status: this._aggregateStatus(results),
      checks: results,
      timestamp: Date.now(),
      uptime: Date.now() - this.startupTime,
    };
  }

  /**
   *
   */
  async getReadiness() {
    const results = await this.runChecks(this.CheckTypes.READINESS);

    return {
      status: this._aggregateStatus(results),
      checks: results,
      timestamp: Date.now(),
      ready: this.readyTime !== null,
    };
  }

  /**
   *
   */
  async getStartup() {
    const results = await this.runChecks(this.CheckTypes.STARTUP);

    const started = results.every((r) => r.status === this.CheckStatus.HEALTHY);

    if (started && !this.readyTime) {
      this.readyTime = Date.now();
    }

    return {
      status: this._aggregateStatus(results),
      checks: results,
      timestamp: Date.now(),
      startupTime: this.readyTime ? this.readyTime - this.startupTime : null,
    };
  }

  /**
   *
   */
  async getFullStatus() {
    const [liveness, readiness, startup] = await Promise.all([
      this.getLiveness(),
      this.getReadiness(),
      this.getStartup(),
    ]);

    const overallStatus = this._determineOverallStatus([
      liveness.status,
      readiness.status,
      startup.status,
    ]);

    return {
      serviceName: this.serviceName,
      status: overallStatus,
      timestamp: Date.now(),
      uptime: Date.now() - this.startupTime,
      liveness,
      readiness,
      startup,
    };
  }

  /**
   *
   */
  _aggregateStatus(results) {
    if (results.length === 0) {
      return this.CheckStatus.HEALTHY;
    }

    const unhealthy = results.filter((r) => r.status === this.CheckStatus.UNHEALTHY).length;
    const degraded = results.filter((r) => r.status === this.CheckStatus.DEGRADED).length;

    if (unhealthy > 0) {
      return this.CheckStatus.UNHEALTHY;
    }

    if (degraded > 0) {
      return this.CheckStatus.DEGRADED;
    }

    return this.CheckStatus.HEALTHY;
  }

  /**
   *
   */
  _determineOverallStatus(statuses) {
    if (statuses.includes(this.CheckStatus.UNHEALTHY)) {
      return this.CheckStatus.UNHEALTHY;
    }

    if (statuses.includes(this.CheckStatus.DEGRADED)) {
      return this.CheckStatus.DEGRADED;
    }

    return this.CheckStatus.HEALTHY;
  }

  /**
   *
   */
  async getHealthCheckJSON() {
    const status = await this.getFullStatus();

    return JSON.stringify(status, null, 2);
  }

  /**
   *
   */
  getStatistics() {
    const allChecks = Array.from(this.checks.values());

    return {
      ...this.stats,
      totalChecksDefined: allChecks.length,
      livenessChecks: allChecks.filter((c) => c.type === this.CheckTypes.LIVENESS).length,
      readinessChecks: allChecks.filter((c) => c.type === this.CheckTypes.READINESS).length,
      startupChecks: allChecks.filter((c) => c.type === this.CheckTypes.STARTUP).length,
      averageSuccessRate: this._calculateSuccessRate(),
    };
  }

  /**
   *
   */
  _calculateSuccessRate() {
    const allChecks = Array.from(this.checks.values());

    if (allChecks.length === 0) return 100;

    const totalChecks = allChecks.reduce((sum, c) => sum + c.successCount + c.failureCount, 0);

    if (totalChecks === 0) return 100;

    const totalSuccesses = allChecks.reduce((sum, c) => sum + c.successCount, 0);

    return ((totalSuccesses / totalChecks) * 100).toFixed(1);
  }

  /**
   *
   */
  reset() {
    this.checks.clear();
    this.stats = {
      totalChecks: 0,
      lastCheckTime: null,
      checksHistory: [],
      checkCounts: {
        healthy: 0,
        degraded: 0,
        unhealthy: 0,
      },
    };
    this.startupTime = Date.now();
    this.readyTime = null;
  }
}
