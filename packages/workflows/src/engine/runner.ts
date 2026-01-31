import type { Workflow, ExecutionContext, ExecutionLog } from '../types.js';
import { WorkflowStateMachine } from './state-machine.js';
import { executeStep, stepHandlerRegistry } from './executor.js';

export interface RunnerOptions {
    onStepStart?: (stepId: string) => void;
    onStepComplete?: (stepId: string, output: Record<string, unknown>) => void;
    onStepError?: (stepId: string, error: Error) => void;
    onLog?: (log: ExecutionLog) => void;
}

export interface RunResult {
    status: 'completed' | 'failed' | 'cancelled';
    output: Record<string, unknown>;
    logs: ExecutionLog[];
    error?: Error;
    duration: number;
}

export class WorkflowRunner {
    private stateMachine: WorkflowStateMachine;
    private options: RunnerOptions;

    constructor(options: RunnerOptions = {}) {
        this.stateMachine = new WorkflowStateMachine();
        this.options = options;
    }

    async run(workflow: Workflow, input: Record<string, unknown>): Promise<RunResult> {
        const startTime = Date.now();
        const context: ExecutionContext = {
            executionId: crypto.randomUUID(),
            workflowId: workflow.id,
            input,
            state: { ...input },
            logs: [],
        };

        // Start the state machine
        this.stateMachine.transition({ type: 'START', input });

        // Build step map for quick lookup
        const stepMap = new Map(workflow.steps.map(s => [s.id, s]));

        // Find entry point (first step or step with no incoming edges)
        let currentStepId: string | undefined = workflow.steps[0]?.id;

        try {
            while (currentStepId && this.stateMachine.getState() === 'running') {
                const step = stepMap.get(currentStepId);
                if (!step) {
                    throw new Error(`Step not found: ${currentStepId}`);
                }

                this.stateMachine.setCurrentStep(currentStepId);
                this.options.onStepStart?.(currentStepId);

                // Log step start
                const stepStartLog: ExecutionLog = {
                    timestamp: new Date(),
                    level: 'info',
                    message: `Starting step: ${step.name || step.id}`,
                    stepId: step.id,
                };
                context.logs.push(stepStartLog);
                this.options.onLog?.(stepStartLog);

                // Execute the step
                const result = await executeStep(step, context, stepHandlerRegistry);

                if (result.status === 'completed') {
                    // Merge output into state
                    if (result.output) {
                        context.state = { ...context.state, [step.id]: result.output };
                    }

                    this.stateMachine.transition({
                        type: 'STEP_COMPLETED',
                        stepId: step.id,
                        output: result.output || {},
                    });

                    this.options.onStepComplete?.(step.id, result.output || {});

                    // Log step completion
                    const stepCompleteLog: ExecutionLog = {
                        timestamp: new Date(),
                        level: 'info',
                        message: `Completed step: ${step.name || step.id}`,
                        stepId: step.id,
                        metadata: { duration: result.duration },
                    };
                    context.logs.push(stepCompleteLog);
                    this.options.onLog?.(stepCompleteLog);

                    // Determine next step
                    currentStepId = result.nextStep;
                } else {
                    // Step failed
                    const error = result.error || new Error('Step failed');

                    this.stateMachine.transition({
                        type: 'STEP_FAILED',
                        stepId: step.id,
                        error,
                    });

                    this.options.onStepError?.(step.id, error);

                    // Log step failure
                    const stepFailLog: ExecutionLog = {
                        timestamp: new Date(),
                        level: 'error',
                        message: `Step failed: ${step.name || step.id} - ${error.message}`,
                        stepId: step.id,
                    };
                    context.logs.push(stepFailLog);
                    this.options.onLog?.(stepFailLog);

                    // Check for error handler
                    if (step.onError) {
                        currentStepId = step.onError;
                        // Reset state to running to continue with error handler
                        // This is a simplified approach; real implementation would need more state management
                    } else {
                        break; // No error handler, workflow fails
                    }
                }
            }

            // Mark as completed if we ran out of steps
            if (this.stateMachine.getState() === 'running') {
                this.stateMachine.markCompleted();
            }

            const machineContext = this.stateMachine.getContext();

            return {
                status: machineContext.status === 'completed' ? 'completed' : 'failed',
                output: context.state,
                logs: context.logs,
                duration: Date.now() - startTime,
            };
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));

            // Log fatal error
            context.logs.push({
                timestamp: new Date(),
                level: 'error',
                message: `Workflow execution failed: ${err.message}`,
            });

            return {
                status: 'failed',
                output: context.state,
                logs: context.logs,
                error: err,
                duration: Date.now() - startTime,
            };
        }
    }

    cancel() {
        this.stateMachine.transition({ type: 'CANCEL' });
    }

    pause() {
        this.stateMachine.transition({ type: 'PAUSE' });
    }

    resume() {
        this.stateMachine.transition({ type: 'RESUME' });
    }
}

// Factory function for convenience
export function createRunner(options?: RunnerOptions): WorkflowRunner {
    return new WorkflowRunner(options);
}
