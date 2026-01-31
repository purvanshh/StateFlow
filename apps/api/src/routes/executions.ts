import { Router, Request, Response } from 'express';
import { demoStore } from '../services/store.js';

const executionsRouter: Router = Router();

// GET /api/executions - List executions
executionsRouter.get('/', async (_req: Request, res: Response) => {
    try {
        const executions = demoStore.getAllExecutions().map(e => ({
            id: e.id,
            workflowId: e.workflowId,
            workflowName: e.workflowName,
            status: e.status,
            createdAt: e.createdAt,
            startedAt: e.startedAt,
            completedAt: e.completedAt,
            duration: e.completedAt && e.startedAt
                ? e.completedAt.getTime() - e.startedAt.getTime()
                : null,
        }));

        res.json({
            data: executions,
            total: executions.length,
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch executions' });
    }
});

// GET /api/executions/:id - Get execution details with full observability
executionsRouter.get('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const execution = demoStore.getExecution(id || '');

        if (!execution) {
            return res.status(404).json({ error: 'Execution not found' });
        }

        // Calculate metrics
        const duration = execution.completedAt && execution.startedAt
            ? execution.completedAt.getTime() - execution.startedAt.getTime()
            : null;

        const totalRetries = execution.steps.reduce((sum, s) => sum + (s.attempts - 1), 0);
        const failedSteps = execution.steps.filter(s => s.status === 'failed').length;
        const completedSteps = execution.steps.filter(s => s.status === 'completed').length;

        res.json({
            data: {
                id: execution.id,
                workflowId: execution.workflowId,
                workflowName: execution.workflowName,
                status: execution.status,
                input: execution.input,
                output: execution.output,
                error: execution.error,

                // Step-by-step breakdown (observability)
                steps: execution.steps.map(s => ({
                    stepId: s.stepId,
                    status: s.status,
                    attempts: s.attempts,
                    startedAt: s.startedAt,
                    completedAt: s.completedAt,
                    output: s.output,
                    error: s.error,
                })),

                // Execution logs
                logs: execution.logs,

                // Metrics
                metrics: {
                    duration,
                    totalRetries,
                    completedSteps,
                    failedSteps,
                    stepCount: execution.steps.length,
                },

                // Timestamps
                createdAt: execution.createdAt,
                startedAt: execution.startedAt,
                completedAt: execution.completedAt,
            },
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch execution' });
    }
});

// POST /api/executions/:id/cancel - Cancel execution
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

        // Implement actual cancellation
        demoStore.updateExecution(id || '', {
            status: 'cancelled',
            completedAt: new Date(), // Mark as finished
            error: 'Cancelled by user',
        });

        demoStore.addExecutionLog(id || '', {
            timestamp: new Date(),
            level: 'warn',
            message: '🛑 Cancellation requested via API',
        });

        res.json({ message: `Execution ${id} cancelled successfully` });
    } catch (error) {
        res.status(500).json({ error: 'Failed to cancel execution' });
    }
});

// GET /api/executions/:id/logs - Get execution logs only
executionsRouter.get('/:id/logs', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const execution = demoStore.getExecution(id || '');

        if (!execution) {
            return res.status(404).json({ error: 'Execution not found' });
        }

        res.json({ data: execution.logs });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

export { executionsRouter };
