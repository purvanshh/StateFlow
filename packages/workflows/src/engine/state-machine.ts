import type { ExecutionStatus, StepStatus } from '../types.js';

// State machine states
export type MachineState = 'idle' | 'running' | 'paused' | 'completed' | 'failed';

// State machine events
export type MachineEvent =
    | { type: 'START'; input: Record<string, unknown> }
    | { type: 'STEP_COMPLETED'; stepId: string; output: Record<string, unknown> }
    | { type: 'STEP_FAILED'; stepId: string; error: Error }
    | { type: 'PAUSE' }
    | { type: 'RESUME' }
    | { type: 'CANCEL' }
    | { type: 'RETRY'; stepId: string };

export interface StateMachineContext {
    currentStep: string | null;
    completedSteps: Set<string>;
    failedSteps: Map<string, { error: Error; attempts: number }>;
    state: Record<string, unknown>;
    status: ExecutionStatus;
}

export class WorkflowStateMachine {
    private machineState: MachineState = 'idle';
    private context: StateMachineContext;

    constructor() {
        this.context = {
            currentStep: null,
            completedSteps: new Set(),
            failedSteps: new Map(),
            state: {},
            status: 'pending',
        };
    }

    getState(): MachineState {
        return this.machineState;
    }

    getContext(): Readonly<StateMachineContext> {
        return this.context;
    }

    transition(event: MachineEvent): MachineState {
        switch (this.machineState) {
            case 'idle':
                return this.handleIdleState(event);
            case 'running':
                return this.handleRunningState(event);
            case 'paused':
                return this.handlePausedState(event);
            case 'completed':
            case 'failed':
                // Terminal states - no transitions allowed
                return this.machineState;
            default:
                return this.machineState;
        }
    }

    private handleIdleState(event: MachineEvent): MachineState {
        if (event.type === 'START') {
            this.context.state = { ...event.input };
            this.context.status = 'running';
            this.machineState = 'running';
        }
        return this.machineState;
    }

    private handleRunningState(event: MachineEvent): MachineState {
        switch (event.type) {
            case 'STEP_COMPLETED':
                this.context.completedSteps.add(event.stepId);
                this.context.state = { ...this.context.state, ...event.output };
                break;

            case 'STEP_FAILED':
                const existing = this.context.failedSteps.get(event.stepId);
                this.context.failedSteps.set(event.stepId, {
                    error: event.error,
                    attempts: (existing?.attempts ?? 0) + 1,
                });
                this.context.status = 'failed';
                this.machineState = 'failed';
                break;

            case 'PAUSE':
                this.machineState = 'paused';
                break;

            case 'CANCEL':
                this.context.status = 'cancelled';
                this.machineState = 'failed'; // Treat cancel as terminal
                break;
        }
        return this.machineState;
    }

    private handlePausedState(event: MachineEvent): MachineState {
        switch (event.type) {
            case 'RESUME':
                this.machineState = 'running';
                break;
            case 'CANCEL':
                this.context.status = 'cancelled';
                this.machineState = 'failed';
                break;
        }
        return this.machineState;
    }

    setCurrentStep(stepId: string | null) {
        this.context.currentStep = stepId;
    }

    markCompleted() {
        this.context.status = 'completed';
        this.machineState = 'completed';
    }

    canRetry(stepId: string, maxAttempts: number): boolean {
        const failed = this.context.failedSteps.get(stepId);
        return !failed || failed.attempts < maxAttempts;
    }
}
