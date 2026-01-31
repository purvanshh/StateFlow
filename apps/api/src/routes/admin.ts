import { Router, Request, Response } from 'express';
import { demoStore } from '../services/store.js';
import { dlq } from '../services/dlq.js';

const adminRouter: Router = Router();

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime_seconds: number;
}

interface SystemMetrics {
  queue_depth: number;
  oldest_pending_seconds: number | null;
  workers_active: number;
  success_rate_1h: number;
  failure_rate_by_type: Record<string, number>;
  execution_rate_per_minute: number;
}

interface HealthCheck {
  name: string;
  status: 'ok' | 'warning' | 'error';
  latency_ms?: number;
  last_seen?: string;
  message?: string;
}

/**
 * GET /admin/health
 * Comprehensive health dashboard
 */
adminRouter.get('/health', async (_req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    const now = new Date();

    // Get all executions for analysis
    const allExecutions = await demoStore.getAllExecutions();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Calculate metrics
    const pending = allExecutions.filter(e => e.status === 'pending');
    const running = allExecutions.filter(e => e.status === 'running');
    const completed = allExecutions.filter(e => e.status === 'completed');
    const failed = allExecutions.filter(e => e.status === 'failed');
    const recentExecutions = allExecutions.filter(e => e.createdAt >= oneHourAgo);
    const recentCompleted = recentExecutions.filter(e => e.status === 'completed');
    const recentFailed = recentExecutions.filter(e => e.status === 'failed');

    // Find oldest pending execution
    const oldestPending =
      pending.length > 0
        ? Math.min(...pending.map(e => (now.getTime() - e.createdAt.getTime()) / 1000))
        : null;

    // Calculate success rate for last hour
    const recentTotal = recentCompleted.length + recentFailed.length;
    const successRate =
      recentTotal > 0 ? Math.round((recentCompleted.length / recentTotal) * 1000) / 10 : 100;

    // Calculate execution rate per minute
    const executionRate = recentExecutions.length / 60;

    // Calculate failure breakdown
    const failureByType: Record<string, number> = {};
    recentFailed.forEach(e => {
      const errorType = e.error?.includes('timeout')
        ? 'timeout'
        : e.error?.includes('HTTP')
          ? 'http_error'
          : e.error?.includes('cancelled')
            ? 'cancelled'
            : 'other';
      failureByType[errorType] = (failureByType[errorType] || 0) + 1;
    });

    // Determine overall health status
    let status: HealthStatus['status'] = 'healthy';
    if (failed.length > completed.length * 0.1) {
      status = 'degraded';
    }
    if (failed.length > completed.length * 0.5 || pending.length > 1000) {
      status = 'unhealthy';
    }

    // Build health checks
    const checks: HealthCheck[] = [
      {
        name: 'database',
        status: 'ok',
        latency_ms: Date.now() - startTime,
        message: 'Connected and responsive',
      },
      {
        name: 'worker_pool',
        status: running.length > 0 ? 'ok' : 'warning',
        last_seen: new Date().toISOString(),
        message: `${running.length} executions currently processing`,
      },
      {
        name: 'queue_depth',
        status: pending.length < 100 ? 'ok' : pending.length < 500 ? 'warning' : 'error',
        message: `${pending.length} pending executions`,
      },
      {
        name: 'success_rate',
        status: successRate > 95 ? 'ok' : successRate > 80 ? 'warning' : 'error',
        message: `${successRate}% success rate (last hour)`,
      },
      {
        name: 'memory',
        status: process.memoryUsage().heapUsed < 500 * 1024 * 1024 ? 'ok' : 'warning',
        message: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB heap used`,
      },
    ];

    const response = {
      status,
      timestamp: now.toISOString(),
      version: process.env.npm_package_version || '0.1.0',
      uptime_seconds: Math.floor(process.uptime()),

      metrics: {
        queue_depth: pending.length,
        oldest_pending_seconds: oldestPending,
        workers_active: running.length,
        success_rate_1h: successRate,
        failure_rate_by_type: failureByType,
        execution_rate_per_minute: Math.round(executionRate * 10) / 10,
      } as SystemMetrics,

      summary: {
        total_executions: allExecutions.length,
        completed_24h: completed.filter(
          e => e.completedAt && e.completedAt >= new Date(now.getTime() - 24 * 60 * 60 * 1000)
        ).length,
        failed_24h: failed.filter(
          e => e.completedAt && e.completedAt >= new Date(now.getTime() - 24 * 60 * 60 * 1000)
        ).length,
        dlq_count: dlq.getStats().total,
        average_duration_ms:
          completed.length > 0
            ? Math.round(
                completed.reduce(
                  (sum, e) =>
                    sum + ((e.completedAt?.getTime() || 0) - (e.startedAt?.getTime() || 0)),
                  0
                ) / completed.length
              )
            : 0,
      },

      checks,

      alerts: [
        ...(pending.length > 100
          ? [{ level: 'warning', message: `High queue depth: ${pending.length} pending` }]
          : []),
        ...(successRate < 90
          ? [{ level: 'warning', message: `Low success rate: ${successRate}%` }]
          : []),
        ...(failed.length > 10
          ? [{ level: 'info', message: `${failed.length} failed executions need attention` }]
          : []),
      ],
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Failed to generate health report',
      checks: [
        {
          name: 'health_check',
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      ],
    });
  }
});

/**
 * GET /admin/health/detailed
 * Detailed health information for debugging
 */
adminRouter.get('/health/detailed', async (_req: Request, res: Response) => {
  try {
    const allExecutions = await demoStore.getAllExecutions();
    const now = new Date();

    const statusCounts = {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      retry_scheduled: 0,
    };

    allExecutions.forEach(e => {
      statusCounts[e.status] = (statusCounts[e.status] || 0) + 1;
    });

    const workflows = [...new Set(allExecutions.map(e => e.workflowName))];
    const byWorkflow = workflows.map(name => ({
      name,
      total: allExecutions.filter(e => e.workflowName === name).length,
      completed: allExecutions.filter(e => e.workflowName === name && e.status === 'completed')
        .length,
      failed: allExecutions.filter(e => e.workflowName === name && e.status === 'failed').length,
    }));

    res.json({
      timestamp: now.toISOString(),
      execution_status_breakdown: statusCounts,
      by_workflow: byWorkflow,
      recent_errors: allExecutions
        .filter(e => e.status === 'failed' && e.error)
        .slice(0, 10)
        .map(e => ({
          id: e.id,
          workflow: e.workflowName,
          error: e.error,
          failed_at: e.completedAt,
        })),
      system: {
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        pid: process.pid,
        platform: process.platform,
        node_version: process.version,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate detailed health report' });
  }
});

export { adminRouter };
