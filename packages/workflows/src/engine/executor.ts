import type {
    WorkflowStep,
    ExecutionContext,
    StepResult,
    StepHandler,
    StepHandlerRegistry,
} from '../types.js';
import { withRetry, createRetryPolicy } from './retry-policy.js';

// Built-in step handlers
const builtInHandlers: Map<string, StepHandler> = new Map();

// HTTP Request Handler
builtInHandlers.set('http', {
    type: 'http',
    async execute(step, context): Promise<StepResult> {
        const config = step.config as {
            url: string;
            method?: string;
            headers?: Record<string, string>;
            body?: unknown;
        };

        if (!config.url) {
            throw new Error('HTTP step requires url in config');
        }

        const startTime = Date.now();

        try {
            const response = await fetch(config.url, {
                method: config.method || 'GET',
                headers: config.headers,
                body: config.body ? JSON.stringify(config.body) : undefined,
            });

            const data = await response.json().catch(() => ({}));

            return {
                status: response.ok ? 'completed' : 'failed',
                output: {
                    statusCode: response.status,
                    data,
                },
                duration: Date.now() - startTime,
                nextStep: step.next,
            };
        } catch (error) {
            return {
                status: 'failed',
                error: error instanceof Error ? error : new Error(String(error)),
                duration: Date.now() - startTime,
            };
        }
    },
});

// Transform/Map Handler
builtInHandlers.set('transform', {
    type: 'transform',
    async execute(step, context): Promise<StepResult> {
        const config = step.config as {
            expression?: string;
            mapping?: Record<string, string>;
        };

        const startTime = Date.now();
        const output: Record<string, unknown> = {};

        try {
            if (config.mapping) {
                // Simple key mapping
                for (const [outputKey, inputPath] of Object.entries(config.mapping)) {
                    output[outputKey] = getNestedValue(context.state, inputPath);
                }
            }

            return {
                status: 'completed',
                output,
                duration: Date.now() - startTime,
                nextStep: step.next,
            };
        } catch (error) {
            return {
                status: 'failed',
                error: error instanceof Error ? error : new Error(String(error)),
                duration: Date.now() - startTime,
            };
        }
    },
});

// Delay Handler
builtInHandlers.set('delay', {
    type: 'delay',
    async execute(step, _context): Promise<StepResult> {
        const config = step.config as { durationMs: number };
        const startTime = Date.now();

        await new Promise(resolve => setTimeout(resolve, config.durationMs || 1000));

        return {
            status: 'completed',
            output: { delayed: true },
            duration: Date.now() - startTime,
            nextStep: step.next,
        };
    },
});

// Condition/Branch Handler
builtInHandlers.set('condition', {
    type: 'condition',
    async execute(step, context): Promise<StepResult> {
        const config = step.config as {
            field: string;
            operator: 'eq' | 'ne' | 'gt' | 'lt' | 'contains';
            value: unknown;
            onTrue: string;
            onFalse: string;
        };

        const fieldValue = getNestedValue(context.state, config.field);
        let result = false;

        switch (config.operator) {
            case 'eq':
                result = fieldValue === config.value;
                break;
            case 'ne':
                result = fieldValue !== config.value;
                break;
            case 'gt':
                result = Number(fieldValue) > Number(config.value);
                break;
            case 'lt':
                result = Number(fieldValue) < Number(config.value);
                break;
            case 'contains':
                result = String(fieldValue).includes(String(config.value));
                break;
        }

        return {
            status: 'completed',
            output: { condition: result },
            nextStep: result ? config.onTrue : config.onFalse,
        };
    },
});

// Log Handler
builtInHandlers.set('log', {
    type: 'log',
    async execute(step, context): Promise<StepResult> {
        const config = step.config as { message: string; level?: string };

        context.logs.push({
            timestamp: new Date(),
            level: (config.level as 'info' | 'debug' | 'warn' | 'error') || 'info',
            message: config.message,
            stepId: step.id,
        });

        return {
            status: 'completed',
            output: { logged: true },
            nextStep: step.next,
        };
    },
});

// Helper function to get nested object values
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce<unknown>((acc, key) => {
        if (acc && typeof acc === 'object' && key in acc) {
            return (acc as Record<string, unknown>)[key];
        }
        return undefined;
    }, obj);
}

// Step Handler Registry implementation
class DefaultStepHandlerRegistry implements StepHandlerRegistry {
    private handlers: Map<string, StepHandler>;

    constructor() {
        this.handlers = new Map(builtInHandlers);
    }

    register(handler: StepHandler): void {
        this.handlers.set(handler.type, handler);
    }

    get(type: string): StepHandler | undefined {
        return this.handlers.get(type);
    }

    has(type: string): boolean {
        return this.handlers.has(type);
    }
}

export const stepHandlerRegistry = new DefaultStepHandlerRegistry();

// Execute a single step with retry support
export async function executeStep(
    step: WorkflowStep,
    context: ExecutionContext,
    registry: StepHandlerRegistry = stepHandlerRegistry
): Promise<StepResult> {
    const handler = registry.get(step.type);

    if (!handler) {
        return {
            status: 'failed',
            error: new Error(`Unknown step type: ${step.type}`),
        };
    }

    const retryPolicy = step.retryPolicy
        ? createRetryPolicy(step.retryPolicy)
        : createRetryPolicy({ maxAttempts: 1 });

    try {
        const result = await withRetry(
            () => handler.execute(step, context),
            retryPolicy,
            (attempt, error, delay) => {
                context.logs.push({
                    timestamp: new Date(),
                    level: 'warn',
                    message: `Step ${step.id} failed (attempt ${attempt}), retrying in ${delay}ms: ${error.message}`,
                    stepId: step.id,
                });
            }
        );

        return result;
    } catch (error) {
        return {
            status: 'failed',
            error: error instanceof Error ? error : new Error(String(error)),
        };
    }
}
