/**
 * Workflow Engine Service
 * Wraps the workflow engine for use in the API
 */

import { DEMO_WORKFLOW, demoStore } from './store.js';
import { metrics, METRIC_NAMES } from './metrics.js';
import { dlq } from './dlq.js';
import { calculateNextDelay } from './retry-math.js';

interface WorkflowStep {
    id: string;
    type: string;
    name?: string;
    config?: Record<string, unknown>;
    next?: string;
    onError?: string;
    retryPolicy?: {
        maxAttempts: number;
        delayMs: number;
        backoffMultiplier?: number;
    };
}

interface StepResult {
    status: 'completed' | 'failed';
    output?: Record<string, unknown>;
    error?: Error;
    nextStep?: string;
    duration?: number;
}

interface ExecutionContext {
    executionId: string;
    state: Record<string, unknown>;
}

/**
 * Execute a single step (Stateless - no internal retry loop)
 */
async function executeStep(step: WorkflowStep, context: ExecutionContext): Promise<StepResult> {
    const startTime = Date.now();

    // Simulate step-level failure injection
    const failureRate = (step.config as any)?.failureRate as number | undefined;

    if (failureRate !== undefined && Math.random() < failureRate) {
        demoStore.addExecutionLog(context.executionId, {
            timestamp: new Date(),
            level: 'warn',
            message: `💥 Simulated failure (rate: ${failureRate}) in step: ${step.name || step.id}`,
            stepId: step.id,
        });
        return {
            status: 'failed',
            error: new Error('Simulated random failure'),
            duration: Date.now() - startTime,
        };
    }

    try {
        switch (step.type) {
            case 'log': {
                const config = step.config as { message: string; level?: string };
                demoStore.addExecutionLog(context.executionId, {
                    timestamp: new Date(),
                    level: (config.level as 'info' | 'warn' | 'error') || 'info',
                    message: config.message,
                    stepId: step.id,
                });
                return {
                    status: 'completed',
                    output: { logged: true },
                    nextStep: step.next,
                    duration: Date.now() - startTime,
                };
            }

            case 'http': {
                const config = step.config as { url: string; method?: string };
                const response = await fetch(config.url, { method: config.method || 'GET' });
                const data = await response.json().catch(() => ({}));

                if (!response.ok) {
                    return {
                        status: 'failed',
                        error: new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`),
                        duration: Date.now() - startTime,
                    };
                }

                return {
                    status: 'completed',
                    output: { statusCode: response.status, data },
                    nextStep: step.next,
                    duration: Date.now() - startTime,
                };
            }

            case 'transform': {
                const config = step.config as { mapping: Record<string, string> };
                const output: Record<string, unknown> = {};

                if (config.mapping) {
                    for (const [key, path] of Object.entries(config.mapping)) {
                        const parts = path.split('.');
                        let value: unknown = context.state;
                        for (const part of parts) {
                            if (value && typeof value === 'object' && part in value) {
                                value = (value as Record<string, unknown>)[part];
                            } else {
                                value = undefined;
                                break;
                            }
                        }
                        output[key] = value;
                    }
                }

                return {
                    status: 'completed',
                    output,
                    nextStep: step.next,
                    duration: Date.now() - startTime,
                };
            }

            case 'condition': {
                const config = step.config as {
                    field: string;
                    operator: string;
                    value: unknown;
                    onTrue: string;
                    onFalse: string;
                };

                const parts = config.field.split('.');
                let fieldValue: unknown = context.state;
                for (const part of parts) {
                    if (fieldValue && typeof fieldValue === 'object' && part in fieldValue) {
                        fieldValue = (fieldValue as Record<string, unknown>)[part];
                    } else {
                        fieldValue = undefined;
                        break;
                    }
                }

                let result = false;
                switch (config.operator) {
                    case 'eq': result = fieldValue === config.value; break;
                    case 'ne': result = fieldValue !== config.value; break;
                    case 'gt': result = Number(fieldValue) > Number(config.value); break;
                    case 'lt': result = Number(fieldValue) < Number(config.value); break;
                }

                return {
                    status: 'completed',
                    output: { condition: result },
                    nextStep: result ? config.onTrue : config.onFalse,
                    duration: Date.now() - startTime,
                };
            }

            case 'delay': {
                const config = step.config as { durationMs: number };
                await new Promise(r => setTimeout(r, config.durationMs || 1000));
                return {
                    status: 'completed',
                    output: { delayed: true },
                    nextStep: step.next,
                    duration: Date.now() - startTime,
                };
            }

            default:
                return {
                    status: 'failed',
                    error: new Error(`Unknown step type: ${step.type}`),
                    duration: Date.now() - startTime,
                };
        }
    } catch (error) {
        return {
            status: 'failed',
            error: error instanceof Error ? error : new Error(String(error)),
            duration: Date.now() - startTime,
        };
    }
}

/**
 * Run workflow execution (Restart-Safe & Interruptible)
 */
export async function runWorkflowExecution(executionId: string): Promise<void> {
    const execution = demoStore.getExecution(executionId);
    if (!execution) {
        console.error(`Execution not found: ${executionId}`);
        return;
    }

    const workflow = demoStore.getWorkflowById(execution.workflowId);
    if (!workflow) {
        console.error(`Workflow not found: ${execution.workflowId}`);
        demoStore.updateExecution(executionId, {
            status: 'failed',
            error: 'Workflow not found',
            completedAt: new Date(),
        });
        return;
    }

    // Determine start state
    const steps = workflow.definition.steps as WorkflowStep[];
    const stepMap = new Map(steps.map(s => [s.id, s]));

    // Resume or Start - Priority: execution.currentStepId then workflow start
    let currentStepId: string | undefined = execution.currentStepId || steps[0]?.id;

    // Update status to running if not already
    if (execution.status !== 'running') {
        demoStore.updateExecution(executionId, {
            status: 'running',
            startedAt: execution.startedAt || new Date(),
        });

        // Log resume if applicable
        if (execution.status === 'retry_scheduled') {
            demoStore.addExecutionLog(executionId, {
                timestamp: new Date(),
                level: 'info',
                message: `🔄 Resuming retry for step: ${currentStepId}`,
            });
        } else {
            // Only increment total metric on fresh start
            if (execution.steps.length === 0) {
                metrics.increment(METRIC_NAMES.EXECUTIONS_TOTAL);
                demoStore.addExecutionLog(executionId, {
                    timestamp: new Date(),
                    level: 'info',
                    message: `▶️  Starting workflow: ${workflow.name}`,
                });
            }
        }

        metrics.set(METRIC_NAMES.ACTIVE_EXECUTIONS, (metrics.getGauge(METRIC_NAMES.ACTIVE_EXECUTIONS) || 0) + 1);
    }

    const context: ExecutionContext = {
        executionId,
        state: { ...execution.input, ...(execution.output || {}) }, // Merge existing output for resumption
    };

    const startTime = Date.now();

    try {
        while (currentStepId) {
            const step = stepMap.get(currentStepId);
            if (!step) throw new Error(`Step not found: ${currentStepId}`);

            // Update current step in store for crash recovery
            demoStore.updateExecution(executionId, { currentStepId });

            demoStore.addExecutionLog(executionId, {
                timestamp: new Date(),
                level: 'info',
                message: `⚡ Executing step: ${step.name || step.id} (${step.type})`,
                stepId: step.id,
            });

            // Execute Step (Single attempt)
            metrics.increment(METRIC_NAMES.STEPS_TOTAL);

            // Record attempt start (optional, but good for tracking)
            const attemptCount = (execution.retryCount || 0) + 1;

            const result = await executeStep(step, context);

            if (result.status === 'completed') {
                // Success!
                // Reset retry count for this step
                demoStore.updateExecution(executionId, {
                    retryCount: 0,
                    nextRetryAt: undefined
                });

                demoStore.addStepResult(executionId, {
                    stepId: step.id,
                    status: 'completed',
                    startedAt: new Date(), // Approximate
                    completedAt: new Date(),
                    output: result.output,
                    error: null,
                    attempts: attemptCount,
                });

                if (result.output) {
                    context.state[step.id] = result.output;
                    // Persist state incrementally
                    demoStore.updateExecution(executionId, { output: context.state });
                }

                if (result.duration) metrics.observe(METRIC_NAMES.STEP_DURATION, result.duration);
                currentStepId = result.nextStep;
                execution.retryCount = 0; // Local update for loop continuity if needed

            } else {
                // Failure - Check Policy
                const attempts = (execution.retryCount || 0) + 1;
                const maxAttempts = step.retryPolicy?.maxAttempts || 3; // Default 3

                // Record failed result
                demoStore.addStepResult(executionId, {
                    stepId: step.id,
                    status: 'failed',
                    startedAt: new Date(),
                    completedAt: new Date(),
                    output: null,
                    error: result.error?.message,
                    attempts: attempts,
                });

                if (attempts < maxAttempts) { // Note: If attempts < max, we schedule retry. If attempts == max, next one is fatal? No, attempts counts current failure.
                    // If attempts (1) <= max (3), we retry?
                    // Usually: 1st fail -> retry (attempt 2). 2nd fail -> retry (attempt 3). 3rd fail -> Fatal.
                    // So if attempts < maxAttempts, we schedule.

                    // SCHEDULE RETRY
                    const baseDelay = step.retryPolicy?.delayMs || 1000;
                    const delay = calculateNextDelay(attempts, baseDelay);
                    const nextRetryAt = new Date(Date.now() + delay);

                    demoStore.updateExecution(executionId, {
                        status: 'retry_scheduled',
                        retryCount: attempts,
                        nextRetryAt: nextRetryAt,
                        error: result.error?.message,
                        currentStepId: step.id, // Stay on this step
                    });

                    demoStore.addExecutionLog(executionId, {
                        timestamp: new Date(),
                        level: 'warn',
                        message: `⚠️ Step failed. Retrying (${attempts + 1}/${maxAttempts}) in ${delay}ms...`,
                        stepId: step.id,
                    });

                    // EXIT FUNCTION - Release worker
                    metrics.set(METRIC_NAMES.ACTIVE_EXECUTIONS, Math.max(0, (metrics.getGauge(METRIC_NAMES.ACTIVE_EXECUTIONS) || 1) - 1));
                    return;

                } else {
                    // FATAL FAILURE (DLQ)
                    throw result.error || new Error('Step failed max retries');
                }
            }
        }

        // Workflow Completed
        const duration = Date.now() - (execution.startedAt?.getTime() || startTime);
        metrics.increment(METRIC_NAMES.EXECUTIONS_COMPLETED);
        metrics.observe(METRIC_NAMES.EXECUTION_DURATION, duration);
        metrics.set(METRIC_NAMES.ACTIVE_EXECUTIONS, Math.max(0, (metrics.getGauge(METRIC_NAMES.ACTIVE_EXECUTIONS) || 1) - 1));

        demoStore.updateExecution(executionId, {
            status: 'completed',
            output: context.state,
            completedAt: new Date(),
            currentStepId: undefined, // Clear step
        });

        demoStore.addExecutionLog(executionId, {
            timestamp: new Date(),
            level: 'info',
            message: '🎉 Workflow completed successfully!',
        });

    } catch (error) {
        // Handle Fatal Error
        const err = error instanceof Error ? error : new Error(String(error));
        const duration = Date.now() - (execution.startedAt?.getTime() || startTime);

        metrics.increment(METRIC_NAMES.EXECUTIONS_FAILED);
        metrics.observe(METRIC_NAMES.EXECUTION_DURATION, duration);
        metrics.set(METRIC_NAMES.ACTIVE_EXECUTIONS, Math.max(0, (metrics.getGauge(METRIC_NAMES.ACTIVE_EXECUTIONS) || 1) - 1));

        demoStore.updateExecution(executionId, {
            status: 'failed',
            error: err.message,
            output: context.state,
            completedAt: new Date(),
        });

        demoStore.addExecutionLog(executionId, {
            timestamp: new Date(),
            level: 'error',
            message: `💀 Workflow failed: ${err.message}`,
        });

        // Add to Dead Letter Queue
        dlq.add(executionId, err.message);
    }
}
