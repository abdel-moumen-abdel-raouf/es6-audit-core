/**
 * Timezone & Locale Support - Fix #11
 * Sampling for High-Volume - Fix #12
 * Advanced Metrics System - Fix #13
 * 
 * 
 * - Configurable timezone + locale support
 * - Reservoir sampling + adaptive sampling
 * - Comprehensive metrics + health checks + alerting
 */

/**
 * Timezone Support - Fix #11
 */
export class TimezoneFormatter {
    constructor(config = {}) {
        this.timezone = config.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
        this.locale = config.locale || 'en-US';
        this.formatType = config.format || 'ISO'; // ISO, UNIX, CUSTOM
        this.customFormat = config.customFormat;
    }

    /**
     * Format timestamp
     */
    format(timestamp = Date.now()) {
        const date = new Date(timestamp);

        if (this.formatType === 'ISO') {
            return this._formatISO(date);
        } else if (this.formatType === 'UNIX') {
            return timestamp;
        } else if (this.formatType === 'CUSTOM' && this.customFormat) {
            return this._formatCustom(date);
        }

        return date.toISOString();
    }

    /**
     * Format ISO with timezone
     */
    _formatISO(date) {
        const formatter = new Intl.DateTimeFormat('en-CA', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            fractionalSecondDigits: 3,
            timeZone: this.timezone
        });

        const parts = formatter.formatToParts(date);
        const iso = parts
            .map(p => p.value)
            .join('')
            .replace(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{3})/, '$1-$2-$3T$4:$5:$6.$7');

        // Get offset
        const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
        const tzDate = new Date(date.toLocaleString('en-US', { timeZone: this.timezone }));
        const offsetMs = tzDate - utcDate;
        const offsetHours = Math.floor(offsetMs / (1000 * 60 * 60));
        const offsetMinutes = (Math.abs(offsetMs) % (1000 * 60 * 60)) / (1000 * 60);
        const offset = `${offsetHours >= 0 ? '+' : '-'}${String(Math.abs(offsetHours)).padStart(2, '0')}:${String(offsetMinutes).padStart(2, '0')}`;

        return `${iso}${offset}`;
    }

    /**
     * Format custom
     */
    _formatCustom(date) {
        if (!this.customFormat) return date.toISOString();

        const options = {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZone: this.timezone
        };

        const formatter = new Intl.DateTimeFormat(this.locale, options);
        return formatter.format(date);
    }

    /**
     * Get timezone offset
     */
    getOffset() {
        const now = new Date();
        const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
        const tzDate = new Date(now.toLocaleString('en-US', { timeZone: this.timezone }));
        const offsetMs = tzDate - utcDate;
        return offsetMs / (1000 * 60 * 60); // Hours
    }
}

/**
 * Sampling System - Fix #12
 */
export class Sampler {
    constructor(config = {}) {
        this.sampleRate = config.sampleRate || 1.0; // 0.0 to 1.0
        this.algorithm = config.algorithm || 'reservoir'; // reservoir, random, adaptive
        this.reservoirSize = config.reservoirSize || 1000;
        this.adaptiveThreshold = config.adaptiveThreshold || 10000;
        
        this.reservoir = [];
        this.count = 0;
        this.sampled = 0;
        this.dropped = 0;
    }

    /**
     * Should sample this log
     */
    shouldSample() {
        this.count++;

        if (this.algorithm === 'random') {
            return Math.random() < this.sampleRate;
        } else if (this.algorithm === 'adaptive') {
            return this._adaptiveSample();
        } else {
            return this._reservoirSample();
        }
    }

    /**
     * Random sampling
     */
    _randomSample() {
        return Math.random() < this.sampleRate;
    }

    /**
     * Reservoir sampling
     */
    _reservoirSample() {
        if (this.count <= this.reservoirSize) {
            this.sampled++;
            return true;
        }

        // Algorithm R
        const j = Math.floor(Math.random() * this.count);
        if (j < this.reservoirSize) {
            this.sampled++;
            return true;
        }

        this.dropped++;
        return false;
    }

    /**
     * Adaptive sampling based on load
     */
    _adaptiveSample() {
        const rate = Math.max(this.sampleRate, 1 / Math.max(1, this.count / this.adaptiveThreshold));
        return Math.random() < rate;
    }

    /**
     * Get statistics
     */
    getStatistics() {
        return {
            total: this.count,
            sampled: this.sampled,
            dropped: this.dropped,
            sampleRate: this.sampleRate,
            algorithm: this.algorithm,
            effectiveSampleRate: this.count > 0 ? (this.sampled / this.count * 100).toFixed(2) + '%' : 'N/A'
        };
    }

    /**
     * Reset statistics
     */
    reset() {
        this.count = 0;
        this.sampled = 0;
        this.dropped = 0;
    }
}

/**
 * Advanced Metrics System - Fix #13
 */
export class MetricsCollector {
    constructor(config = {}) {
        this.enabled = config.enabled !== false;
        this.collectionInterval = config.collectionInterval || 10000; // 10 seconds
        this.retentionPeriod = config.retentionPeriod || 24 * 60 * 60 * 1000; // 24 hours
        this.alertThresholds = config.alertThresholds || {};
        
        this.metrics = {
            logs: {
                total: 0,
                byLevel: {},
                byModule: {},
                rate: 0
            },
            performance: {
                avgLatency: 0,
                maxLatency: 0,
                minLatency: Infinity,
                p99Latency: 0
            },
            errors: {
                total: 0,
                byType: {},
                lastError: null
            },
            memory: {
                heapUsed: 0,
                heapTotal: 0,
                external: 0,
                trend: [] // Array of memory snapshots
            },
            buffers: {
                size: 0,
                capacity: 0,
                utilization: 0,
                flushCount: 0
            }
        };

        this.alerts = [];
        this.latencies = [];
        this.collectionTimer = null;

        if (this.enabled) {
            this._startCollection();
        }
    }

    /**
     * Record log entry
     */
    recordLog(level, module) {
        this.metrics.logs.total++;
        this.metrics.logs.byLevel[level] = (this.metrics.logs.byLevel[level] || 0) + 1;
        this.metrics.logs.byModule[module] = (this.metrics.logs.byModule[module] || 0) + 1;
    }

    /**
     * Record latency
     */
    recordLatency(latency) {
        this.latencies.push(latency);
        this.metrics.performance.maxLatency = Math.max(this.metrics.performance.maxLatency, latency);
        this.metrics.performance.minLatency = Math.min(this.metrics.performance.minLatency, latency);
        this.metrics.performance.avgLatency = this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;

        // Calculate P99
        const sorted = [...this.latencies].sort((a, b) => a - b);
        const index = Math.floor(sorted.length * 0.99);
        this.metrics.performance.p99Latency = sorted[index] || 0;
    }

    /**
     * Record error
     */
    recordError(type) {
        this.metrics.errors.total++;
        this.metrics.errors.byType[type] = (this.metrics.errors.byType[type] || 0) + 1;
        this.metrics.errors.lastError = { type, timestamp: Date.now() };
    }

    /**
     * Update memory metrics
     */
    updateMemoryMetrics() {
        if (!global.gc && !process.memoryUsage) {
            return;
        }

        const memUsage = process.memoryUsage();
        this.metrics.memory.heapUsed = memUsage.heapUsed;
        this.metrics.memory.heapTotal = memUsage.heapTotal;
        this.metrics.memory.external = memUsage.external;

        // Track trend
        this.metrics.memory.trend.push({
            timestamp: Date.now(),
            heapUsed: memUsage.heapUsed
        });

        // Keep only recent data
        const now = Date.now();
        this.metrics.memory.trend = this.metrics.memory.trend.filter(
            item => now - item.timestamp < this.retentionPeriod
        );
    }

    /**
     * Update buffer metrics
     */
    updateBufferMetrics(size, capacity) {
        this.metrics.buffers.size = size;
        this.metrics.buffers.capacity = capacity;
        this.metrics.buffers.utilization = capacity > 0 ? (size / capacity * 100).toFixed(2) : 0;
    }

    /**
     * Record flush
     */
    recordFlush() {
        this.metrics.buffers.flushCount++;
    }

    /**
     * Check alerts
     */
    _checkAlerts() {
        // Memory alert
        if (this.alertThresholds.memoryPercent) {
            const heapPercent = (this.metrics.memory.heapUsed / this.metrics.memory.heapTotal) * 100;
            if (heapPercent > this.alertThresholds.memoryPercent) {
                this._createAlert('HIGH_MEMORY_USAGE', heapPercent);
            }
        }

        // Error rate alert
        if (this.alertThresholds.errorRate) {
            const errorRate = this.metrics.logs.total > 0
                ? (this.metrics.errors.total / this.metrics.logs.total) * 100
                : 0;
            if (errorRate > this.alertThresholds.errorRate) {
                this._createAlert('HIGH_ERROR_RATE', errorRate);
            }
        }

        // Buffer utilization alert
        if (this.alertThresholds.bufferUtilization) {
            if (this.metrics.buffers.utilization > this.alertThresholds.bufferUtilization) {
                this._createAlert('HIGH_BUFFER_UTILIZATION', this.metrics.buffers.utilization);
            }
        }

        // Latency alert
        if (this.alertThresholds.maxLatency) {
            if (this.metrics.performance.maxLatency > this.alertThresholds.maxLatency) {
                this._createAlert('HIGH_LATENCY', this.metrics.performance.maxLatency);
            }
        }
    }

    /**
     * Create alert
     */
    _createAlert(type, value) {
        const alert = {
            type,
            value,
            timestamp: Date.now()
        };

        this.alerts.push(alert);

        // Keep only recent alerts
        this.alerts = this.alerts.filter(a => Date.now() - a.timestamp < this.retentionPeriod);
    }

    /**
     * Start collection
     */
    _startCollection() {
        this.collectionTimer = setInterval(() => {
            this.updateMemoryMetrics();
            this._checkAlerts();
            
            // Calculate rate
            const now = Date.now();
            // Rate is logs per second
            this.metrics.logs.rate = (this.metrics.logs.total / (now / 1000)).toFixed(2);
        }, this.collectionInterval);
    }

    /**
     * Get snapshot
     */
    getSnapshot() {
        return {
            timestamp: Date.now(),
            metrics: JSON.parse(JSON.stringify(this.metrics)),
            alerts: this.alerts.slice(-10),
            alertCount: this.alerts.length
        };
    }

    /**
     * Get health status
     */
    getHealthStatus() {
        const errors = this.metrics.errors.total;
        const logs = this.metrics.logs.total;
        const errorRate = logs > 0 ? (errors / logs) * 100 : 0;

        let status = 'HEALTHY';
        if (errorRate > 5 || this.alerts.length > 0) {
            status = 'DEGRADED';
        }
        if (errorRate > 10 || this.alerts.length > 5) {
            status = 'CRITICAL';
        }

        return {
            status,
            errorRate: errorRate.toFixed(2) + '%',
            activeAlerts: this.alerts.length,
            metrics: this.metrics
        };
    }

    /**
     * Reset metrics
     */
    reset() {
        this.metrics = {
            logs: { total: 0, byLevel: {}, byModule: {}, rate: 0 },
            performance: { avgLatency: 0, maxLatency: 0, minLatency: Infinity, p99Latency: 0 },
            errors: { total: 0, byType: {}, lastError: null },
            memory: { heapUsed: 0, heapTotal: 0, external: 0, trend: [] },
            buffers: { size: 0, capacity: 0, utilization: 0, flushCount: 0 }
        };
        this.latencies = [];
        this.alerts = [];
    }

    /**
     * Stop collection
     */
    stop() {
        if (this.collectionTimer) {
            clearInterval(this.collectionTimer);
            this.collectionTimer = null;
        }
    }
}
