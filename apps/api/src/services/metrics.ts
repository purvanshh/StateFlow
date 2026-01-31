/**
 * Metrics Service
 * In-memory metrics collection (can be extended to Prometheus/StatsD)
 */

interface MetricValue {
    count: number;
    sum: number;
    min: number;
    max: number;
    lastUpdated: Date;
}

class MetricsService {
    private counters: Map<string, number> = new Map();
    private gauges: Map<string, number> = new Map();
    private histograms: Map<string, MetricValue> = new Map();
    private startTime: Date = new Date();

    // Counter methods
    increment(name: string, value: number = 1, labels?: Record<string, string>) {
        const key = this.formatKey(name, labels);
        const current = this.counters.get(key) || 0;
        this.counters.set(key, current + value);
    }

    // Gauge methods
    set(name: string, value: number, labels?: Record<string, string>) {
        const key = this.formatKey(name, labels);
        this.gauges.set(key, value);
    }

    // Histogram methods
    observe(name: string, value: number, labels?: Record<string, string>) {
        const key = this.formatKey(name, labels);
        const current = this.histograms.get(key) || {
            count: 0,
            sum: 0,
            min: Infinity,
            max: -Infinity,
            lastUpdated: new Date(),
        };

        this.histograms.set(key, {
            count: current.count + 1,
            sum: current.sum + value,
            min: Math.min(current.min, value),
            max: Math.max(current.max, value),
            lastUpdated: new Date(),
        });
    }

    // Get all metrics
    getAll(): Record<string, unknown> {
        const result: Record<string, unknown> = {
            uptime_seconds: Math.floor((Date.now() - this.startTime.getTime()) / 1000),
            counters: Object.fromEntries(this.counters),
            gauges: Object.fromEntries(this.gauges),
            histograms: {} as Record<string, unknown>,
        };

        // Format histograms
        const histograms = result.histograms as Record<string, unknown>;
        for (const [key, value] of this.histograms) {
            histograms[key] = {
                count: value.count,
                sum: value.sum,
                avg: value.count > 0 ? value.sum / value.count : 0,
                min: value.min === Infinity ? 0 : value.min,
                max: value.max === -Infinity ? 0 : value.max,
            };
        }

        return result;
    }

    // Get specific metric
    getCounter(name: string, labels?: Record<string, string>): number {
        return this.counters.get(this.formatKey(name, labels)) || 0;
    }

    getGauge(name: string, labels?: Record<string, string>): number | undefined {
        return this.gauges.get(this.formatKey(name, labels));
    }

    // Reset all metrics
    reset() {
        this.counters.clear();
        this.gauges.clear();
        this.histograms.clear();
    }

    private formatKey(name: string, labels?: Record<string, string>): string {
        if (!labels || Object.keys(labels).length === 0) {
            return name;
        }
        const labelStr = Object.entries(labels)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}="${v}"`)
            .join(',');
        return `${name}{${labelStr}}`;
    }
}

// Singleton instance
export const metrics = new MetricsService();

// Metric names as constants
export const METRIC_NAMES = {
    // Counters
    EXECUTIONS_TOTAL: 'workflow_executions_total',
    EXECUTIONS_COMPLETED: 'workflow_executions_completed',
    EXECUTIONS_FAILED: 'workflow_executions_failed',
    STEPS_TOTAL: 'workflow_steps_total',
    STEPS_RETRIED: 'workflow_steps_retried',
    DLQ_ENTRIES: 'workflow_dlq_entries',

    // Histograms
    EXECUTION_DURATION: 'workflow_execution_duration_ms',
    STEP_DURATION: 'workflow_step_duration_ms',

    // Gauges
    ACTIVE_EXECUTIONS: 'workflow_active_executions',
    PENDING_EXECUTIONS: 'workflow_pending_executions',
};
