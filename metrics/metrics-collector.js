/**
 * Metrics Collection & Aggregation System
 * 
 */

export class MetricsCollector {
    constructor(options = {}) {
        this.serviceName = options.serviceName || 'unknown-service';
        this.environment = options.environment || 'production';
        
        
    this.metrics = new Map();
        
        
        this.MetricTypes = {
            COUNTER: 'counter',      
            GAUGE: 'gauge',          
            HISTOGRAM: 'histogram',  
            SUMMARY: 'summary'       
        };
        
        
    this.buckets = options.buckets || [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
        this.aggregationInterval = options.aggregationInterval ?? 60000;  
    this.maxMetrics = options.maxMetrics ?? 1000;
    this.maxHistogramValues = options.maxHistogramValues ?? 2048;
        
        
        this.aggregations = new Map();
        
        
        this.stats = {
            totalMetricsRecorded: 0,
            totalAggregations: 0,
            lastAggregationTime: null,
            metricsCount: 0
        };
        
        
        this._startAggregation();
    }

    /**
 * 
 */
    createCounter(name, options = {}) {
        const metric = {
            name,
            type: this.MetricTypes.COUNTER,
            value: 0,
            description: options.description || '',
            labels: options.labels || {},
            createdAt: Date.now(),
            lastUpdated: Date.now()
        };

        this.metrics.set(name, metric);
        this.stats.metricsCount = this.metrics.size;

        return {
            increment: (amount = 1) => this._incrementCounter(name, amount),
            getValue: () => metric.value,
            reset: () => { metric.value = 0; }
        };
    }

    /**
 * 
 */
    createGauge(name, options = {}) {
        const metric = {
            name,
            type: this.MetricTypes.GAUGE,
            value: options.initialValue || 0,
            description: options.description || '',
            labels: options.labels || {},
            createdAt: Date.now(),
            lastUpdated: Date.now()
        };

        this.metrics.set(name, metric);
        this.stats.metricsCount = this.metrics.size;

        return {
            set: (value) => this._setGauge(name, value),
            increment: (amount = 1) => this._incrementGauge(name, amount),
            decrement: (amount = 1) => this._decrementGauge(name, amount),
            getValue: () => metric.value,
            reset: () => { metric.value = 0; }
        };
    }

    /**
 * 
 */
    createHistogram(name, options = {}) {
        const metric = {
            name,
            type: this.MetricTypes.HISTOGRAM,
            values: [],
            buckets: options.buckets || this.buckets,
            description: options.description || '',
            labels: options.labels || {},
            createdAt: Date.now(),
            lastUpdated: Date.now(),
            sum: 0,
            count: 0
        };

        this.metrics.set(name, metric);
        this.stats.metricsCount = this.metrics.size;

        return {
            observe: (value) => this._observeValue(name, value),
            getPercentile: (p) => this._getPercentile(name, p),
            getStats: () => this._getHistogramStats(name),
            reset: () => {
                metric.values = [];
                metric.sum = 0;
                metric.count = 0;
            }
        };
    }

    /**
 * 
 */
    _incrementCounter(name, amount) {
        const metric = this.metrics.get(name);
        if (!metric || metric.type !== this.MetricTypes.COUNTER) {
            return;
        }

        metric.value += amount;
        metric.lastUpdated = Date.now();
        this.stats.totalMetricsRecorded++;
    }

    /**
 * 
 */
    _setGauge(name, value) {
        const metric = this.metrics.get(name);
        if (!metric || metric.type !== this.MetricTypes.GAUGE) {
            return;
        }

        metric.value = value;
        metric.lastUpdated = Date.now();
        this.stats.totalMetricsRecorded++;
    }

    /**
 * 
 */
    _incrementGauge(name, amount) {
        const metric = this.metrics.get(name);
        if (!metric || metric.type !== this.MetricTypes.GAUGE) {
            return;
        }

        metric.value += amount;
        metric.lastUpdated = Date.now();
        this.stats.totalMetricsRecorded++;
    }

    /**
 * 
 */
    _decrementGauge(name, amount) {
        const metric = this.metrics.get(name);
        if (!metric || metric.type !== this.MetricTypes.GAUGE) {
            return;
        }

        metric.value = Math.max(0, metric.value - amount);
        metric.lastUpdated = Date.now();
        this.stats.totalMetricsRecorded++;
    }

    /**
 * 
 */
    _observeValue(name, value) {
        const metric = this.metrics.get(name);
        if (!metric || metric.type !== this.MetricTypes.HISTOGRAM) {
            return;
        }

        metric.values.push(value);
        metric.sum += value;
        metric.count++;
        metric.lastUpdated = Date.now();
        this.stats.totalMetricsRecorded++;

        
        if (metric.values.length > this.maxHistogramValues) {
            // Drop oldest to cap memory usage
            metric.values.splice(0, metric.values.length - this.maxHistogramValues);
        }
    }

    /**
 * 
 */
    _getPercentile(name, percentile) {
        const metric = this.metrics.get(name);
        if (!metric || metric.type !== this.MetricTypes.HISTOGRAM) {
            return null;
        }

        if (metric.values.length === 0) {
            return null;
        }

        const sorted = [...metric.values].sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[index];
    }

    /**
 * 
 */
    _getHistogramStats(name) {
        const metric = this.metrics.get(name);
        if (!metric || metric.type !== this.MetricTypes.HISTOGRAM) {
            return null;
        }

        if (metric.values.length === 0) {
            return {
                count: 0,
                sum: 0,
                avg: 0,
                min: 0,
                max: 0,
                p50: 0,
                p95: 0,
                p99: 0
            };
        }

        const sorted = [...metric.values].sort((a, b) => a - b);
        const min = sorted[0];
        const max = sorted[sorted.length - 1];
        const avg = metric.sum / metric.count;

        return {
            count: metric.count,
            sum: metric.sum,
            avg: avg.toFixed(4),
            min: min.toFixed(4),
            max: max.toFixed(4),
            p50: this._getPercentile(name, 50).toFixed(4),
            p95: this._getPercentile(name, 95).toFixed(4),
            p99: this._getPercentile(name, 99).toFixed(4)
        };
    }

    /**
 * 
 */
    getAllMetrics() {
        const result = {};

        for (const [name, metric] of this.metrics.entries()) {
            if (metric.type === this.MetricTypes.HISTOGRAM) {
                result[name] = {
                    type: metric.type,
                    stats: this._getHistogramStats(name)
                };
            } else {
                result[name] = {
                    type: metric.type,
                    value: metric.value
                };
            }
        }

        return result;
    }

    /**
 * 
 */
    exportAsPrometheus() {
        let output = '';

        
        output += `# HELP service_info Service information\n`;
        output += `# TYPE service_info gauge\n`;
        output += `service_info{service="${this.serviceName}",environment="${this.environment}"} 1\n\n`;

        
        for (const [name, metric] of this.metrics.entries()) {
            const safeName = name.replace(/[^a-zA-Z0-9_]/g, '_');

            if (metric.description) {
                output += `# HELP ${safeName} ${metric.description}\n`;
            }

            output += `# TYPE ${safeName} ${metric.type}\n`;

            if (metric.type === this.MetricTypes.HISTOGRAM) {
                
                const stats = this._getHistogramStats(name);
                
                for (const bucket of metric.buckets) {
                    const count = metric.values.filter(v => v <= bucket).length;
                    output += `${safeName}_bucket{le="${bucket}"} ${count}\n`;
                }

                output += `${safeName}_bucket{le="+Inf"} ${metric.count}\n`;
                output += `${safeName}_sum ${metric.sum}\n`;
                output += `${safeName}_count ${metric.count}\n`;
            } else {
                
                const labels = Object.entries(metric.labels || {})
                    .map(([k, v]) => `${k}="${v}"`)
                    .join(',');

                const labelStr = labels ? `{${labels}}` : '';
                output += `${safeName}${labelStr} ${metric.value}\n`;
            }

            output += '\n';
        }

        return output;
    }

    /**
 * 
 */
    _startAggregation() {
        this.aggregationTimer = setInterval(() => {
            this._performAggregation();
        }, this.aggregationInterval);

        if (this.aggregationTimer.unref) {
            this.aggregationTimer.unref();
        }
    }

    /**
 * 
 */
    stopAggregation() {
        if (this.aggregationTimer) {
            clearInterval(this.aggregationTimer);
        }
    }

    /**
 * 
 */
    _performAggregation() {
        const aggregation = {
            timestamp: Date.now(),
            metrics: {}
        };

        for (const [name, metric] of this.metrics.entries()) {
            if (metric.type === this.MetricTypes.HISTOGRAM) {
                aggregation.metrics[name] = this._getHistogramStats(name);
            } else {
                aggregation.metrics[name] = {
                    type: metric.type,
                    value: metric.value
                };
            }
        }

        this.aggregations.set(aggregation.timestamp, aggregation);
        this.stats.totalAggregations++;
        this.stats.lastAggregationTime = Date.now();

        
        if (this.aggregations.size > 100) {
            const first = this.aggregations.keys().next().value;
            this.aggregations.delete(first);
        }
    }

    /**
 * 
 */
    getStatistics() {
        return {
            ...this.stats,
            aggregationsCount: this.aggregations.size,
            serviceInfo: {
                name: this.serviceName,
                environment: this.environment
            }
        };
    }

    /**
 * 
 */
    reset() {
        this.metrics.clear();
        this.aggregations.clear();
        
        this.stats = {
            totalMetricsRecorded: 0,
            totalAggregations: 0,
            lastAggregationTime: null,
            metricsCount: 0
        };
    }
}
