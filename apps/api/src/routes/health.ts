import { Router, Request, Response } from 'express';
import { demoStore } from '../services/store.js';
import { metrics, METRIC_NAMES } from '../services/metrics.js';
import { dlq } from '../services/dlq.js';

const healthRouter: Router = Router();

healthRouter.get('/', (_req: Request, res: Response) => {
  const allExecutions = demoStore.getAllExecutions();
  const now = new Date();

  const running = allExecutions.filter(e => e.status === 'running').length;
  const scheduled = allExecutions.filter(
    e =>
      e.status === 'pending' ||
      (e.status === 'retry_scheduled' && e.nextRetryAt && e.nextRetryAt > now)
  ).length;
  const dlqStats = dlq.getStats();
  const memoryUsage = process.memoryUsage();

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptimeSec: Math.floor(process.uptime()),
    version: process.env.npm_package_version || '0.1.0',

    worker: {
      workerAlive: true,
      uptimeSec: Math.floor(process.uptime()),
      queueDepth: scheduled,
      running,
      scheduled,
      dlqCount: dlqStats.total,
      memoryUsageMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
    },

    metrics: {
      activeExecutions: metrics.getGauge(METRIC_NAMES.ACTIVE_EXECUTIONS) || running,
      totalExecutions: metrics.getCounter(METRIC_NAMES.EXECUTIONS_TOTAL),
      successfulExecutions: metrics.getCounter(METRIC_NAMES.EXECUTIONS_SUCCESS),
      failedExecutions: metrics.getCounter(METRIC_NAMES.EXECUTIONS_FAILED),
      cancelledExecutions: metrics.getCounter(METRIC_NAMES.EXECUTIONS_CANCELLED),
    },
  });
});

healthRouter.get('/ready', (_req: Request, res: Response) => {
  const allExecutions = demoStore.getAllExecutions();
  const now = new Date();
  const hasPendingWork = allExecutions.some(
    e =>
      e.status === 'pending' ||
      (e.status === 'retry_scheduled' && e.nextRetryAt && e.nextRetryAt <= now)
  );

  const memoryUsage = process.memoryUsage();
  const memoryOk = memoryUsage.heapUsed < 1024 * 1024 * 512;

  res.json({
    status: hasPendingWork && memoryOk ? 'ready' : 'degraded',
    checks: {
      database: 'ok',
      memory: memoryOk ? 'ok' : 'warning',
      pendingWork: hasPendingWork ? 'yes' : 'no',
    },
  });
});

healthRouter.get('/live', (_req: Request, res: Response) => {
  res.json({ status: 'alive', timestamp: new Date().toISOString() });
});

export { healthRouter };
