/**
 * Workflow Engine Service
 * Wraps the workflow engine for use in the API
 */

import { DEMO_WORKFLOW, demoStore } from './store.js';
import { metrics, METRIC_NAMES } from './metrics.js';
import { dlq } from './dlq.js';

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

// Failure simulation flag (set to true to enable random failures)
const SIMULATE_FAILURES = true;
const FAILURE_RATE = 0.2; // 20% chance of failure

/**
 * Execute a single step
 */
async function executeStep(step: WorkflowStep, context: ExecutionContext): Promise<StepResult> {
    const startTime = Date.now();

    // Simulate random failure for testing
    if (SIMULATE_FAILURES && step.type === 'http' && Math.random() < FAILURE_RATE) {
        demoStore.addExecutionLog(context.executionId, {
            timestamp: new Date(),
            level: 'warn',
            message: `💥 Simulated failure in step: ${step.name || step.id}`,
            stepId: step.id,
        });
        return {
            status: 'failed',
            error: new Error('Simulated network failure'),
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

                return {
                    status: response.ok ? 'completed' : 'failed',
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
 * Calculate retry delay with exponential backoff
 */
function calculateDelay(attempt: number, policy: WorkflowStep['retryPolicy']): number {
    if (!policy) return 1000;
    const multiplier = policy.backoffMultiplier || 1;
    return policy.delayMs * Math.pow(multiplier, attempt - 1);
}

/**
 * Execute a single step with retry logic
 */
async function executeStepWithRetry(
    step: WorkflowStep,
    context: ExecutionContext
): Promise<StepResult> {
    const maxAttempts = step.retryPolicy?.maxAttempts || 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        demoStore.addStepResult(context.executionId, {
            stepId: step.id,
            status: 'running',
            startedAt: new Date(),
            completedAt: null,
            output: null,
            error: null,
            attempts: attempt,
        });

        const result = await executeStep(step, context);

        if (result.status === 'completed') {
            demoStore.addStepResult(context.executionId, {
                stepId: step.id,
                status: 'completed',
                startedAt: new Date(),
                completedAt: new Date(),
                output: result.output,
                error: null,
                attempts: attempt,
            });
            return result;
        }

        // Step failed
        if (attempt < maxAttempts) {
            const delay = calculateDelay(attempt, step.retryPolicy);
            demoStore.addExecutionLog(context.executionId, {
                timestamp: new Date(),
                level: 'warn',
                message: `🔄 Retry ${attempt}/${maxAttempts} for step "${step.name || step.id}" in ${delay}ms`,
                stepId: step.id,
            });
            await new Promise(r => setTimeout(r, delay));
        } else {
            demoStore.addStepResult(context.executionId, {
                stepId: step.id,
                status: 'failed',
                startedAt: new Date(),
                completedAt: new Date(),
                output: null,
                error: result.error?.message || 'Unknown error',
                attempts: attempt,
            });
            return result;
        }
    }

    return { status: 'failed', error: new Error('Max retries exceeded') };
}

/**
 * Run a complete workflow execution
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

    // Start execution
    metrics.increment(METRIC_NAMES.EXECUTIONS_TOTAL);
    metrics.set(METRIC_NAMES.ACTIVE_EXECUTIONS,
        (metrics.getGauge(METRIC_NAMES.ACTIVE_EXECUTIONS) || 0) + 1);

    demoStore.updateExecution(executionId, {
        status: 'running',
        startedAt: new Date(),
    });

    demoStore.addExecutionLog(executionId, {
        timestamp: new Date(),
        level: 'info',
        message: `▶️  Starting workflow: ${workflow.name}`,
    });

    const context: ExecutionContext = {
        executionId,
        state: { ...execution.input },
    };

    const steps = workflow.definition.steps as WorkflowStep[];
    const stepMap = new Map(steps.map(s => [s.id, s]));
    let currentStepId: string | undefined = steps[0]?.id;
    const startTime = Date.now();

    try {
        while (currentStepId) {
            const step = stepMap.get(currentStepId);
            if (!step) {
                throw new Error(`Step not found: ${currentStepId}`);
            }

            demoStore.addExecutionLog(executionId, {
                timestamp: new Date(),
                level: 'info',
                message: `⚡ Executing step: ${step.name || step.id} (${step.type})`,
                stepId: step.id,
            });

            metrics.increment(METRIC_NAMES.STEPS_TOTAL);
            const result = await executeStepWithRetry(step, context);

            if (result.status === 'completed') {
                // Store step output in state
                if (result.output) {
                    context.state[step.id] = result.output;
                }
                if (result.duration) {
                    metrics.observe(METRIC_NAMES.STEP_DURATION, result.duration);
                }
                currentStepId = result.nextStep;
            } else {
                // Step failed after retries
                if (step.onError) {
                    currentStepId = step.onError;
                } else {
                    throw result.error || new Error('Step failed');
                }
            }
        }

        // Workflow completed successfully
        const duration = Date.now() - startTime;
        metrics.increment(METRIC_NAMES.EXECUTIONS_COMPLETED);
        metrics.observe(METRIC_NAMES.EXECUTION_DURATION, duration);
        metrics.set(METRIC_NAMES.ACTIVE_EXECUTIONS,
            Math.max(0, (metrics.getGauge(METRIC_NAMES.ACTIVE_EXECUTIONS) || 1) - 1));

        demoStore.updateExecution(executionId, {
            status: 'completed',
            output: context.state,
            completedAt: new Date(),
        });

        demoStore.addExecutionLog(executionId, {
            timestamp: new Date(),
            level: 'info',
            message: '🎉 Workflow completed successfully!',
        });

    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        const duration = Date.now() - startTime;

        metrics.increment(METRIC_NAMES.EXECUTIONS_FAILED);
        metrics.observe(METRIC_NAMES.EXECUTION_DURATION, duration);
        metrics.set(METRIC_NAMES.ACTIVE_EXECUTIONS,
            Math.max(0, (metrics.getGauge(METRIC_NAMES.ACTIVE_EXECUTIONS) || 1) - 1));

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

