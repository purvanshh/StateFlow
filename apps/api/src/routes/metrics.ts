import { Router, Request, Response } from 'express';
import { metrics, METRIC_NAMES } from '../services/metrics.js';
import { dlq } from '../services/dlq.js';
import { demoStore } from '../services/store.js';

const metricsRouter: Router = Router();

function formatValue(value: number | undefined): string {
  if (value === undefined || value === null) return '0';
  return value.toString();
}

/**
 * GET /api/metrics
 * Returns all collected metrics in JSON format
 */
metricsRouter.get('/', async (_req: Request, res: Response) => {
  const allMetrics = metrics.getAll();

  const executions = await demoStore.getAllExecutions();
  const completed = executions.filter(e => e.status === 'completed').length;
  const failed = executions.filter(e => e.status === 'failed').length;
  const pending = executions.filter(e => e.status === 'pending').length;
  const running = executions.filter(e => e.status === 'running').length;

  const totalRetries = executions.reduce((sum, e) => {
    return sum + e.steps.reduce((s, step) => s + Math.max(0, step.attempts - 1), 0);
  }, 0);

  const durations = executions
    .filter(e => e.completedAt && e.startedAt)
    .map(e => e.completedAt!.getTime() - e.startedAt!.getTime());

  const avgDuration =
    durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

  const successRate = executions.length > 0 ? Math.round((completed / executions.length) * 100) : 0;

  res.json({
    summary: {
      total_executions: executions.length,
      completed,
      failed,
      pending,
      running,
      success_rate_percent: successRate,
      total_retries: totalRetries,
      avg_duration_ms: avgDuration,
      dlq_entries: dlq.getStats().total,
    },
    raw: allMetrics,
    dlq_stats: dlq.getStats(),
  });
});

/**
 * GET /api/metrics/prometheus
 * Returns metrics in Prometheus text format for scraping
 */
metricsRouter.get('/prometheus', async (_req: Request, res: Response) => {
  try {
    const allExecutions = await demoStore.getAllExecutions();
    const now = new Date();

    const running = allExecutions.filter(e => e.status === 'running').length;
    const pending = allExecutions.filter(e => e.status === 'pending').length;
    const completed = allExecutions.filter(e => e.status === 'completed').length;
    const failed = allExecutions.filter(e => e.status === 'failed').length;
    const cancelled = allExecutions.filter(e => e.status === 'cancelled').length;
    const retryScheduled = allExecutions.filter(
      e => e.status === 'retry_scheduled' && e.nextRetryAt && e.nextRetryAt <= now
    ).length;

    const dlqStats = dlq.getStats();

    const memoryUsage = process.memoryUsage();
    const uptimeSeconds = Math.floor(process.uptime());

    const allMetrics = metrics.getAll();

    let output = `# StateFlow Metrics\n`;
    output += `# Generated at ${new Date().toISOString()}\n\n`;

    const counters = allMetrics.counters as Record<string, number | undefined>;
    output += `# TYPE stateflow_executions_total counter\n`;
    output += `stateflow_executions_total ${formatValue(counters?.[METRIC_NAMES.EXECUTIONS_TOTAL])}\n`;
    output += `# TYPE stateflow_executions_success_total counter\n`;
    output += `stateflow_executions_success_total ${formatValue(counters?.[METRIC_NAMES.EXECUTIONS_SUCCESS])}\n`;
    output += `# TYPE stateflow_executions_failed_total counter\n`;
    output += `stateflow_executions_failed_total ${formatValue(counters?.[METRIC_NAMES.EXECUTIONS_FAILED])}\n`;
    output += `# TYPE stateflow_executions_cancelled_total counter\n`;
    output += `stateflow_executions_cancelled_total ${formatValue(counters?.[METRIC_NAMES.EXECUTIONS_CANCELLED])}\n`;
    output += `# TYPE stateflow_steps_total counter\n`;
    output += `stateflow_steps_total ${formatValue(counters?.[METRIC_NAMES.STEPS_TOTAL])}\n`;
    output += `# TYPE stateflow_dlq_total counter\n`;
    output += `stateflow_dlq_total ${formatValue(counters?.[METRIC_NAMES.DLQ_TOTAL])}\n`;
    output += `# TYPE stateflow_timeouts_total counter\n`;
    output += `stateflow_timeouts_total ${formatValue(counters?.[METRIC_NAMES.TIMEOUTS_TOTAL])}\n\n`;

    output += `# TYPE stateflow_active_executions gauge\n`;
    output += `stateflow_active_executions ${running}\n`;
    output += `# TYPE stateflow_pending_executions gauge\n`;
    output += `stateflow_pending_executions ${pending}\n`;
    output += `# TYPE stateflow_retry_scheduled_executions gauge\n`;
    output += `stateflow_retry_scheduled_executions ${retryScheduled}\n`;
    output += `# TYPE stateflow_dlq_count gauge\n`;
    output += `stateflow_dlq_count ${dlqStats.total}\n`;
    output += `# TYPE stateflow_memory_heap_bytes gauge\n`;
    output += `stateflow_memory_heap_bytes ${memoryUsage.heapUsed}\n`;
    output += `# TYPE stateflow_memory_rss_bytes gauge\n`;
    output += `stateflow_memory_rss_bytes ${memoryUsage.rss}\n`;
    output += `# TYPE stateflow_uptime_seconds gauge\n`;
    output += `stateflow_uptime_seconds ${uptimeSeconds}\n\n`;

    output += `# TYPE stateflow_execution_duration_ms histogram\n`;
    output += `# Histogram buckets would be added here in full implementation\n`;
    output += `# TYPE stateflow_step_duration_ms histogram\n`;
    output += `# Histogram buckets would be added here in full implementation\n`;

    output += `\n# Execution Status Counts\n`;
    output += `stateflow_status_pending ${pending}\n`;
    output += `stateflow_status_running ${running}\n`;
    output += `stateflow_status_completed ${completed}\n`;
    output += `stateflow_status_failed ${failed}\n`;
    output += `stateflow_status_cancelled ${cancelled}\n`;

    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    res.send(output);
  } catch (error) {
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.status(500).send('# Error generating metrics\n');
  }
});

/**
 * GET /api/metrics/dlq
 * Returns DLQ entries
 */
metricsRouter.get('/dlq', (_req: Request, res: Response) => {
  res.json({
    data: dlq.getAll(),
    stats: dlq.getStats(),
  });
});

export { metricsRouter };
