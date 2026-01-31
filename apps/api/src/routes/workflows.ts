import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '@stateflow/shared';
// import { WorkflowRepository } from '@stateflow/db';
// import { WorkflowEngine } from '@stateflow/workflows';

const workflowsRouter: Router = Router();

// Validation schemas
const createWorkflowSchema = z.object({
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    steps: z.array(z.object({
        id: z.string(),
        type: z.string(),
        config: z.record(z.unknown()).optional(),
        next: z.string().optional(),
        onError: z.string().optional(),
    })),
    trigger: z.object({
        type: z.enum(['manual', 'schedule', 'webhook']),
        config: z.record(z.unknown()).optional(),
    }).optional(),
});

// GET /api/workflows - List all workflows
workflowsRouter.get('/', async (_req: Request, res: Response) => {
    try {
        const { db } = await import('@stateflow/db');

        // Get latest version of each workflow
        // Valid query for Supabase/Postgres to get latest group by name
        // Or just fetch all and dedup in memory for MVP

        const { data, error } = await db()
            .from('workflows')
            .select('*')
            .order('name', { ascending: true })
            .order('version', { ascending: false });

        if (error) throw error;

        // Deduplicate to show only latest version
        const latest = new Map();
        for (const w of data || []) {
            if (!latest.has(w.name)) {
                latest.set(w.name, w);
            }
        }

        const workflows = Array.from(latest.values());
        res.json({ data: workflows, total: workflows.length });
    } catch (error) {
        logger.error('Failed to fetch workflows', { error: error as Error });
        res.status(500).json({ error: 'Failed to fetch workflows' });
    }
});

// GET /api/workflows/:id - Get workflow by ID
workflowsRouter.get('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { db } = await import('@stateflow/db');

        const { data: workflow, error } = await db()
            .from('workflows')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !workflow) {
            return res.status(404).json({ error: 'Workflow not found' });
        }

        res.json({ data: workflow });
    } catch (error) {
        logger.error('Failed to fetch workflow', { error: error as Error });
        res.status(500).json({ error: 'Failed to fetch workflow' });
    }
});

// POST /api/workflows - Create new workflow
workflowsRouter.post('/', async (req: Request, res: Response) => {
    try {
        const parsed = createWorkflowSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
        }

        // Logic:
        // 1. Check if workflow with name exists to determine next version
        // 2. Insert new version

        // We need direct DB access or expand Store interface?
        // Let's use the Store interface. We need to cast it to something that supports management
        // or just use direct DB client here if store is only for execution?
        // The instructions say "Implement API to POST /workflows".
        // SqlExecutionStore has getWorkflowByName.

        // However, we need to WRITE. Store interface currently only has createExecution and logs.
        // We should probably add `createWorkflow` to the Store interface or use the repository pattern if available.
        // Looking at packages/db, there is `WorkflowRepository`.
        // But for now, let's implement usage of `db` client directly here as seen in `sql-store.ts` 
        // OR better, instantiate a service/repository.

        // Let's check if we can import `db` from `@stateflow/db` directly here.
        // Yes, imports are available.

        // Note: We need to import `db` at top level.
        // For now, let's rewrite the imports to include `db`. 
        // Waiting for next tool call to fix imports.

        // Using `db` directly for now as this is the API layer.
        const { db } = await import('@stateflow/db');
        const client = db();

        // Check latest version
        const { data: existing } = await client
            .from('workflows')
            .select('version')
            .eq('name', parsed.data.name)
            .order('version', { ascending: false })
            .limit(1)
            .single();

        const nextVersion = existing ? existing.version + 1 : 1;

        const { data: workflow, error } = await client
            .from('workflows')
            .insert({
                name: parsed.data.name,
                version: nextVersion,
                definition: parsed.data, // content includes steps, etc.
            })
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({ data: workflow });
    } catch (error) {
        logger.error('Failed to create workflow', { error: error as Error });
        res.status(500).json({ error: 'Failed to create workflow' });
    }
});

// PUT /api/workflows/:id - Update workflow
workflowsRouter.put('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const parsed = createWorkflowSchema.partial().safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
        }

        // TODO: Update in database
        const workflow = { id, ...parsed.data, updatedAt: new Date() };
        res.json({ data: workflow });
    } catch (error) {
        logger.error('Failed to update workflow', { error: error as Error });
        res.status(500).json({ error: 'Failed to update workflow' });
    }
});

// DELETE /api/workflows/:id - Delete workflow
workflowsRouter.delete('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        // TODO: Delete from database
        res.json({ message: `Workflow ${id} deleted successfully` });
    } catch (error) {
        logger.error('Failed to delete workflow', { error: error as Error });
        res.status(500).json({ error: 'Failed to delete workflow' });
    }
});

// POST /api/workflows/:id/execute - Execute workflow
workflowsRouter.post('/:id/execute', async (req: Request, res: Response) => {
    try {
        const { demoStore } = await import('../services/store.js');
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ error: 'Missing workflow ID' });
        }
        const input = req.body.input || {};

        const execution = await demoStore.createExecution(id, input);

        res.status(202).json({ data: execution });
    } catch (error) {
        logger.error('Failed to execute workflow', { error: error as Error });
        res.status(500).json({ error: 'Failed to execute workflow' });
    }
});

export { workflowsRouter };
