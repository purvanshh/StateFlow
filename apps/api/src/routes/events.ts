import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { demoStore } from '../services/store.js';
import { logger } from '@stateflow/shared';

const eventsRouter: Router = Router();

// Validation schema
const triggerEventSchema = z.object({
  workflowName: z.string().min(1).default('demo-workflow'),
  input: z.record(z.unknown()).optional().default({}),
  idempotencyKey: z.string().optional(),
});

/**
 * POST /api/events
 * Trigger a workflow execution by workflow name
 *
 * This is the main entry point for executing workflows.
 * Returns immediately with execution ID (async execution)
 */
eventsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = triggerEventSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.issues,
      });
    }

    const { workflowName, input, idempotencyKey } = parsed.data;

    // Find workflow by name
    const workflow = demoStore.getWorkflowByName(workflowName);

    if (!workflow) {
      return res.status(404).json({
        error: `Workflow not found: ${workflowName}`,
        availableWorkflows: demoStore.getAllWorkflows().map(w => w.name),
      });
    }

    // Check idempotency key for duplicates
    if (idempotencyKey) {
      const existing = demoStore.findByIdempotencyKey(idempotencyKey);
      if (existing) {
        logger.info(`Idempotency hit - returning existing execution`, {
          executionId: existing.id,
          metadata: { idempotencyKey, duplicate: true },
        });

        return res.status(200).json({
          message: 'Existing execution returned (idempotency)',
          duplicate: true,
          data: {
            executionId: existing.id,
            workflowId: existing.workflowId,
            workflowName: existing.workflowName,
            status: existing.status,
            createdAt: existing.createdAt,
          },
        });
      }
    }

    const execution = demoStore.createExecution(workflow.id, input, idempotencyKey);

    logger.info(`Event received - triggering workflow`, {
      executionId: execution.id,
      metadata: { workflowName, idempotencyKey, input },
    });

    // Add initial log
    demoStore.addExecutionLog(execution.id, {
      timestamp: new Date(),
      level: 'info',
      message: `Execution queued for workflow: ${workflowName}`,
    });

    // Return immediately (worker will pick it up)
    res.status(202).json({
      message: 'Execution queued',
      data: {
        executionId: execution.id,
        workflowId: workflow.id,
        workflowName: workflow.name,
        status: execution.status,
        createdAt: execution.createdAt,
      },
    });
  } catch (error) {
    logger.error(`Failed to trigger workflow`, { error: error as Error });
    res.status(500).json({ error: 'Failed to trigger workflow' });
  }
});

/**
 * GET /api/events/workflows
 * List available workflows that can be triggered
 */
eventsRouter.get('/workflows', (_req: Request, res: Response) => {
  const workflows = demoStore.getAllWorkflows().map(w => ({
    name: w.name,
    description: w.description,
    status: w.status,
  }));

  res.json({ data: workflows });
});

export { eventsRouter };
