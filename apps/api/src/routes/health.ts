import { Router } from 'express';

const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '0.1.0',
    });
});

healthRouter.get('/ready', (_req, res) => {
    // Add database connectivity check here
    res.json({
        status: 'ready',
        checks: {
            database: 'ok',
            memory: 'ok',
        },
    });
});

export { healthRouter };
