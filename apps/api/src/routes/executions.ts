import { Router, Request, Response } from 'express';
import { demoStore } from '../services/store.js';
import { metrics, METRIC_NAMES } from '../services/metrics.js';
import { logger } from '@stateflow/shared';

const executionsRouter: Router = Router();

executionsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const workflow = req.query.workflow as string | undefined;
    const since = req.query.since as string | undefined;
    const limitStr = req.query.limit as string | undefined;

    let executions = demoStore.getAllExecutions();

    if (status) {
      executions = executions.filter(e => e.status === status);
    }

    if (workflow) {
      executions = executions.filter(e => e.workflowName === workflow);
    }

    if (since) {
      const sinceTime = new Date(since);
      if (!isNaN(sinceTime.getTime())) {
        executions = executions.filter(e => e.createdAt >= sinceTime);
      }
    }

    const limitNum = limitStr ? parseInt(limitStr, 10) : 50;
    executions = executions.slice(0, limitNum);

    const summary = {
      total: executions.length,
      running: executions.filter(e => e.status === 'running').length,
      completed: executions.filter(e => e.status === 'completed').length,
      failed: executions.filter(e => e.status === 'failed').length,
      pending: executions.filter(e => e.status === 'pending').length,
      retry_scheduled: executions.filter(e => e.status === 'retry_scheduled').length,
      cancelled: executions.filter(e => e.status === 'cancelled').length,
    };

    res.json({
      data: executions.map(e => ({
        id: e.id,
        workflowId: e.workflowId,
        workflowName: e.workflowName,
        status: e.status,
        createdAt: e.createdAt,
        startedAt: e.startedAt,
        completedAt: e.completedAt,
        durationMs:
          e.completedAt && e.startedAt ? e.completedAt.getTime() - e.startedAt.getTime() : null,
        retryCount: e.retryCount || 0,
      })),
      summary,
    });
  } catch (error) {
    logger.error('Failed to fetch executions', { error: error as Error });
    res.status(500).json({ error: 'Failed to fetch executions' });
  }
});

executionsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const execution = demoStore.getExecution(id || '');

    if (!execution) {
      return res.status(404).json({ error: 'Execution not found' });
    }

    const duration =
      execution.completedAt && execution.startedAt
        ? execution.completedAt.getTime() - execution.startedAt.getTime()
        : null;

    const totalRetries = execution.steps.reduce((sum, s) => sum + (s.attempts - 1), 0);
    const failedSteps = execution.steps.filter(s => s.status === 'failed').length;
    const completedSteps = execution.steps.filter(s => s.status === 'completed').length;

    const stepTimelines = execution.steps.map(s => {
      const stepDuration =
        s.completedAt && s.startedAt ? s.completedAt.getTime() - s.startedAt.getTime() : null;

      return {
        stepId: s.stepId,
        status: s.status,
        startedAt: s.startedAt,
        finishedAt: s.completedAt,
        durationMs: stepDuration,
        attempts: s.attempts,
        output: s.output,
        error: s.error,
        logs: execution.logs.filter(l => l.stepId === s.stepId),
      };
    });

    res.json({
      data: {
        id: execution.id,
        workflowId: execution.workflowId,
        workflowName: execution.workflowName,
        status: execution.status,
        input: execution.input,
        output: execution.output,
        error: execution.error,
        workerId: execution.workerId,
        retryCount: execution.retryCount || 0,

        timeline: {
          startedAt: execution.startedAt,
          finishedAt: execution.completedAt,
          durationMs: duration,
        },

        steps: stepTimelines,

        logs: execution.logs,

        metrics: {
          totalRetries,
          completedSteps,
          failedSteps,
          stepCount: execution.steps.length,
        },

        createdAt: execution.createdAt,
        startedAt: execution.startedAt,
        completedAt: execution.completedAt,
      },
    });
  } catch (error) {
    logger.error('Failed to fetch execution', { error: error as Error });
    res.status(500).json({ error: 'Failed to fetch execution' });
  }
});

executionsRouter.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const execution = demoStore.getExecution(id || '');

    if (!execution) {
      return res.status(404).json({ error: 'Execution not found' });
    }

    if (execution.status === 'completed' || execution.status === 'failed') {
      return res.status(400).json({ error: 'Cannot cancel finished execution' });
    }

    demoStore.updateExecution(id || '', {
      status: 'cancelled',
      completedAt: new Date(),
      error: 'Cancelled by user',
    });

    demoStore.addExecutionLog(id || '', {
      timestamp: new Date(),
      level: 'warn',
      message: 'Cancellation requested via API',
    });

    metrics.increment(METRIC_NAMES.EXECUTIONS_CANCELLED);
    metrics.set(
      METRIC_NAMES.ACTIVE_EXECUTIONS,
      Math.max(0, (metrics.getGauge(METRIC_NAMES.ACTIVE_EXECUTIONS) || 1) - 1)
    );

    res.json({ message: `Execution ${id} cancelled successfully` });
  } catch (error) {
    logger.error('Failed to cancel execution', { error: error as Error });
    res.status(500).json({ error: 'Failed to cancel execution' });
  }
});

executionsRouter.get('/:id/logs', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const execution = demoStore.getExecution(id || '');

    if (!execution) {
      return res.status(404).json({ error: 'Execution not found' });
    }

    res.json({ data: execution.logs });
  } catch (error) {
    logger.error('Failed to fetch logs', { error: error as Error });
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

executionsRouter.get('/failed', async (_req: Request, res: Response) => {
  try {
    const failedExecutions = demoStore
      .getAllExecutions()
      .filter(e => e.status === 'failed')
      .map(e => ({
        id: e.id,
        workflowName: e.workflowName,
        error: e.error,
        failedAt: e.completedAt,
        retryCount: e.retryCount || 0,
      }));

    res.json({ data: failedExecutions, total: failedExecutions.length });
  } catch (error) {
    logger.error('Failed to fetch failed executions', { error: error as Error });
    res.status(500).json({ error: 'Failed to fetch failed executions' });
  }
});

export { executionsRouter };
