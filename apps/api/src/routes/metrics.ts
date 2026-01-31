import { Router, Request, Response } from 'express';
import { metrics } from '../services/metrics.js';
import { dlq } from '../services/dlq.js';
import { demoStore } from '../services/store.js';

const metricsRouter: Router = Router();

/**
 * GET /api/metrics
 * Returns all collected metrics
 */
metricsRouter.get('/', async (_req: Request, res: Response) => {
    const allMetrics = metrics.getAll();

    // Add computed metrics
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

    const avgDuration = durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0;

    const successRate = executions.length > 0
        ? Math.round((completed / executions.length) * 100)
        : 0;

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
