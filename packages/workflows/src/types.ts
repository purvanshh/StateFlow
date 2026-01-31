// ============================================================================
// Workflow Types
// ============================================================================

export interface Workflow {
    id: string;
    name: string;
    description?: string;
    steps: WorkflowStep[];
    trigger?: WorkflowTrigger;
}

export interface WorkflowStep {
    id: string;
    type: string;
    name?: string;
    config?: Record<string, unknown>;
    next?: string;
    onError?: string;
    retryPolicy?: RetryPolicy;
}

export interface WorkflowTrigger {
    type: 'manual' | 'schedule' | 'webhook';
    config?: Record<string, unknown>;
}

export interface RetryPolicy {
    maxAttempts: number;
    delayMs: number;
    backoffMultiplier?: number;
    maxDelayMs?: number;
}

// ============================================================================
// Execution Types
// ============================================================================

export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface ExecutionContext {
    executionId: string;
    workflowId: string;
    input: Record<string, unknown>;
    state: Record<string, unknown>;
    logs: ExecutionLog[];
}

export interface ExecutionLog {
    timestamp: Date;
    level: 'debug' | 'info' | 'warn' | 'error';
    message: string;
    stepId?: string;
    metadata?: Record<string, unknown>;
}

export interface StepResult {
    status: StepStatus;
    output?: Record<string, unknown>;
    error?: Error;
    nextStep?: string;
    duration?: number;
}

// ============================================================================
// Step Handler Types
// ============================================================================

export interface StepHandler {
    type: string;
    execute(
        step: WorkflowStep,
        context: ExecutionContext
    ): Promise<StepResult>;
}

export interface StepHandlerRegistry {
    register(handler: StepHandler): void;
    get(type: string): StepHandler | undefined;
    has(type: string): boolean;
}
