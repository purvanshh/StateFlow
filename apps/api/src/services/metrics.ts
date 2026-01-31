/**
 * Metrics Service
 * In-memory metrics collection for observability
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

  increment(name: string, value: number = 1, labels?: Record<string, string>) {
    const key = this.formatKey(name, labels);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);
  }

  set(name: string, value: number, labels?: Record<string, string>) {
    const key = this.formatKey(name, labels);
    this.gauges.set(key, value);
  }

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

  getAll(): Record<string, unknown> {
    const result: Record<string, unknown> = {
      uptime_seconds: Math.floor((Date.now() - this.startTime.getTime()) / 1000),
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms: {} as Record<string, unknown>,
    };

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

  getCounter(name: string, labels?: Record<string, string>): number {
    return this.counters.get(this.formatKey(name, labels)) || 0;
  }

  getGauge(name: string, labels?: Record<string, string>): number | undefined {
    return this.gauges.get(this.formatKey(name, labels));
  }

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

export const metrics = new MetricsService();

export const METRIC_NAMES = {
  EXECUTIONS_TOTAL: 'executions_total',
  EXECUTIONS_SUCCESS: 'executions_success',
  EXECUTIONS_FAILED: 'executions_failed',
  EXECUTIONS_CANCELLED: 'executions_cancelled',
  EXECUTIONS_RETRY_SCHEDULED: 'executions_retry_scheduled',
  STEPS_TOTAL: 'steps_total',
  STEPS_COMPLETED: 'steps_completed',
  STEPS_FAILED: 'steps_failed',
  STEPS_RETRIED: 'steps_retried',
  RETRIES_TOTAL: 'retries_total',
  DLQ_TOTAL: 'dlq_total',
  TIMEOUTS_TOTAL: 'timeouts_total',

  EXECUTION_DURATION_MS: 'execution_duration_ms',
  STEP_DURATION_MS: 'step_duration_ms',
  RETRY_DELAY_MS: 'retry_delay_ms',

  ACTIVE_EXECUTIONS: 'active_executions',
  PENDING_EXECUTIONS: 'pending_executions',
  SCHEDULED_EXECUTIONS: 'scheduled_executions',
};
