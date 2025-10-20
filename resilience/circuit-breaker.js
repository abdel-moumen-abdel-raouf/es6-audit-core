/**
 * Enhanced Circuit Breaker Pattern - Fix #7
 * 
 * 
 * - Circuit breaker pattern (CLOSED, OPEN, HALF_OPEN)
 * - Health monitoring
 * - Automatic recovery
 * - Fallback mechanism
 * - Performance optimization
 */

export class CircuitBreakerEnhanced {
    constructor(config = {}) {
        // Configuration
        this.failureThreshold = config.failureThreshold || 5;      
        this.successThreshold = config.successThreshold || 2;      
        this.timeout = config.timeout || 60000;                    
        this.halfOpenTimeout = config.halfOpenTimeout || 10000;    
        this.healthCheckInterval = config.healthCheckInterval || 5000; 
        
        // Metrics
        this.consecutiveFailures = 0;
        this.consecutiveSuccesses = 0;
        this.state = 'CLOSED';  // CLOSED, OPEN, HALF_OPEN
        this.lastFailureTime = null;
        this.lastSuccessTime = null;
        this.nextAttemptTime = null;
        this.openedAt = null;
        
        // Health monitoring
        this.healthCheckEnabled = config.healthCheckEnabled !== false;
        this.healthCheckFn = config.healthCheckFn;
        this.healthCheckTimer = null;
        this.lastHealthCheck = null;
        this.healthStatus = 'UNKNOWN';
        
        // Callbacks
        this.onStateChange = config.onStateChange;
        this.onHealthCheck = config.onHealthCheck;
        
        // Stats
        this.stats = {
            totalCalls: 0,
            successfulCalls: 0,
            failedCalls: 0,
            rejectedCalls: 0,
            stateChanges: 0,
            openCount: 0,
            halfOpenCount: 0,
            closeCount: 0
        };
        
        // Start health check if enabled
        if (this.healthCheckEnabled && this.healthCheckFn) {
            this._startHealthCheck();
        }
    }

    /**
     * Call function with circuit breaker protection
     */
    async call(fn, fallback = null) {
        this.stats.totalCalls++;
        
        // State machine
        if (this.state === 'OPEN') {
            // Check if should attempt recovery
            if (this._shouldAttemptReset()) {
                this._changeState('HALF_OPEN');
            } else {
                // Circuit is OPEN - reject call
                this.stats.rejectedCalls++;
                if (fallback) {
                    return fallback();
                }
                throw new Error(`Circuit breaker is OPEN. Retry after ${this.getRetryAfter()}ms`);
            }
        }

        try {
            const result = await fn();
            this._recordSuccess();
            this.stats.successfulCalls++;
            return result;
        } catch (error) {
            this._recordFailure();
            this.stats.failedCalls++;
            
            if (fallback) {
                return fallback();
            }
            throw error;
        }
    }

    /**
     * Record successful call
     */
    _recordSuccess() {
        this.lastSuccessTime = Date.now();
        this.consecutiveFailures = 0;
        this.consecutiveSuccesses++;

        // Check if should close the circuit
        if (this.state === 'HALF_OPEN') {
            if (this.consecutiveSuccesses >= this.successThreshold) {
                this._changeState('CLOSED');
            }
        } else if (this.state === 'CLOSED') {
            this.consecutiveSuccesses = 0; // Reset on success in CLOSED state
        }
    }

    /**
     * Record failed call
     */
    _recordFailure() {
        this.lastFailureTime = Date.now();
        this.consecutiveFailures++;
        this.consecutiveSuccesses = 0;

        // Check if should open the circuit
        if (this.state === 'CLOSED' || this.state === 'HALF_OPEN') {
            if (this.consecutiveFailures >= this.failureThreshold) {
                this._changeState('OPEN');
                this.openedAt = Date.now();
            }
        }
    }

    /**
     * Check if should attempt reset
     */
    _shouldAttemptReset() {
        return (Date.now() - this.openedAt) >= this.timeout;
    }

    /**
     * Get retry after milliseconds
     */
    getRetryAfter() {
        if (this.state !== 'OPEN') {
            return 0;
        }
        const elapsed = Date.now() - this.openedAt;
        const remaining = this.timeout - elapsed;
        return Math.max(0, remaining);
    }

    /**
     * Change state
     */
    _changeState(newState) {
        const oldState = this.state;
        this.state = newState;
        this.stats.stateChanges++;

        if (newState === 'OPEN') {
            this.stats.openCount++;
        } else if (newState === 'HALF_OPEN') {
            this.stats.halfOpenCount++;
            this.consecutiveSuccesses = 0;
        } else if (newState === 'CLOSED') {
            this.stats.closeCount++;
            this.consecutiveFailures = 0;
            this.consecutiveSuccesses = 0;
        }

        // Callback
        if (this.onStateChange) {
            this.onStateChange({ oldState, newState, timestamp: Date.now() });
        }
    }

    /**
     * Start health check
     */
    _startHealthCheck() {
        this.healthCheckTimer = setInterval(() => {
            this._performHealthCheck();
        }, this.healthCheckInterval);
    }

    /**
     * Perform health check
     */
    async _performHealthCheck() {
        if (!this.healthCheckFn) {
            return;
        }

        try {
            const result = await this.healthCheckFn();
            this.healthStatus = result ? 'HEALTHY' : 'UNHEALTHY';
            this.lastHealthCheck = Date.now();

            // If OPEN and health is HEALTHY, try to recover
            if (this.state === 'OPEN' && this.healthStatus === 'HEALTHY') {
                if (this._shouldAttemptReset()) {
                    this._changeState('HALF_OPEN');
                }
            }

            if (this.onHealthCheck) {
                this.onHealthCheck({ status: this.healthStatus, timestamp: this.lastHealthCheck });
            }
        } catch (error) {
            this.healthStatus = 'UNKNOWN';
            if (this.onHealthCheck) {
                this.onHealthCheck({ status: 'ERROR', error: error.message });
            }
        }
    }

    /**
     * Get current state
     */
    getState() {
        return {
            state: this.state,
            consecutiveFailures: this.consecutiveFailures,
            consecutiveSuccesses: this.consecutiveSuccesses,
            lastFailureTime: this.lastFailureTime,
            lastSuccessTime: this.lastSuccessTime,
            nextAttemptTime: this.nextAttemptTime,
            healthStatus: this.healthStatus,
            stats: this.stats
        };
    }

    /**
     * Manual reset
     */
    reset() {
        this._changeState('CLOSED');
        this.consecutiveFailures = 0;
        this.consecutiveSuccesses = 0;
    }

    /**
     * Get statistics
     */
    getStatistics() {
        const stats = this.stats;
        return {
            ...stats,
            successRate: stats.totalCalls > 0 ? ((stats.successfulCalls / stats.totalCalls) * 100).toFixed(2) + '%' : 'N/A',
            failureRate: stats.totalCalls > 0 ? ((stats.failedCalls / stats.totalCalls) * 100).toFixed(2) + '%' : 'N/A',
            rejectionRate: stats.totalCalls > 0 ? ((stats.rejectedCalls / stats.totalCalls) * 100).toFixed(2) + '%' : 'N/A',
            currentState: this.state,
            healthStatus: this.healthStatus
        };
    }

    /**
     * Stop health check
     */
    stop() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
    }

    /**
     * Destructor
     */
    destroy() {
        this.stop();
    }
}

/**
 * Health Check Factory
 */
export class HealthChecker {
    /**
     * HTTP Endpoint health check
     */
    static httpHealthCheck(endpoint, timeout = 5000) {
        return async () => {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeout);

                const response = await fetch(endpoint, {
                    method: 'HEAD',
                    signal: controller.signal,
                    timeout
                });

                clearTimeout(timeoutId);
                return response.ok;
            } catch (error) {
                return false;
            }
        };
    }

    /**
     * Custom function health check
     */
    static customHealthCheck(fn) {
        return async () => {
            try {
                return await fn();
            } catch {
                return false;
            }
        };
    }

    /**
     * Multiple checks (all must pass)
     */
    static allChecks(...checks) {
        return async () => {
            const results = await Promise.all(checks.map(check => {
                try {
                    return check();
                } catch {
                    return false;
                }
            }));
            return results.every(r => r === true);
        };
    }

    /**
     * Any check passes
     */
    static anyCheck(...checks) {
        return async () => {
            const results = await Promise.all(checks.map(check => {
                try {
                    return check();
                } catch {
                    return false;
                }
            }));
            return results.some(r => r === true);
        };
    }
}
