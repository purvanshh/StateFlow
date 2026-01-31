import { Router } from 'express';
import { healthRouter } from './health.js';
import { workflowsRouter } from './workflows.js';
import { executionsRouter } from './executions.js';
import { eventsRouter } from './events.js';
import { metricsRouter } from './metrics.js';
import { adminRouter } from './admin.js';

const router: Router = Router();

// Health check
router.use('/health', healthRouter);

// Admin dashboard
router.use('/admin', adminRouter);

// Events (trigger workflows)
router.use('/events', eventsRouter);

// Metrics & DLQ
router.use('/metrics', metricsRouter);

// Workflow routes
router.use('/workflows', workflowsRouter);

// Execution routes
router.use('/executions', executionsRouter);

export { router };
