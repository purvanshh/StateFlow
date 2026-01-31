import { describe, it, expect } from 'vitest';
import { executeStep, stepHandlerRegistry } from '../executor.js';
import type { WorkflowStep, ExecutionContext, StepHandler } from '../../types.js';

describe('Step Timeouts', () => {
    // Mock context
    const context: ExecutionContext = {
        executionId: 'exec-1',
        workflowId: 'wf-1',
        input: {},
        state: {},
        logs: [],
    };

    // Register a mock handler that we can control
    const slowHandler: StepHandler = {
        type: 'slow-test',
        execute: async (step, _ctx) => {
            const delay = (step.config as any)?.delay || 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
            return { status: 'completed' };
        },
    };

    stepHandlerRegistry.register(slowHandler);

    it('should complete successfully if execution is faster than timeout', async () => {
        const step: WorkflowStep = {
            id: 'step-1',
            type: 'slow-test',
            config: { delay: 10 }, // 10ms execution
            timeoutMs: 100, // 100ms timeout
        };

        const result = await executeStep(step, context);
        expect(result.status).toBe('completed');
    });

    it('should fail with timeout error if execution exceeds timeout', async () => {
        const step: WorkflowStep = {
            id: 'step-2',
            type: 'slow-test',
            config: { delay: 200 }, // 200ms execution
            timeoutMs: 50, // 50ms timeout
            retryPolicy: { maxAttempts: 1, delayMs: 1 }, // No retries for simpler assertion
        };

        const startTime = Date.now();
        const result = await executeStep(step, context);
        const duration = Date.now() - startTime;

        expect(result.status).toBe('failed');
        expect(result.error?.message).toContain('Step execution timed out after 50ms');
        expect(duration).toBeLessThan(150); // Should fail closer to 50ms than 200ms
    });

    it('should trigger retry policy on timeout', async () => {
        const step: WorkflowStep = {
            id: 'step-3',
            type: 'slow-test',
            config: { delay: 100 },
            timeoutMs: 20,
            retryPolicy: {
                maxAttempts: 2, // 1 original + 1 retry
                delayMs: 10
            },
        };

        const result = await executeStep(step, context);

        // It should still fail eventually, but logs should show a retry occurred
        expect(result.status).toBe('failed');
        expect(context.logs.some(log => log.message.includes('timed out'))).toBe(true);
        // We expect at least one warning log for the retry
        expect(context.logs.filter(l => l.level === 'warn').length).toBeGreaterThanOrEqual(1);
    });
});
