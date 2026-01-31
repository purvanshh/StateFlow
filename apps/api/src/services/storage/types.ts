import { DEMO_WORKFLOW, TIMEOUT_WORKFLOW } from './definitions.js';

export interface WorkflowDefinition {
    id: string;
    name: string;
    description: string;
    definition: typeof DEMO_WORKFLOW.definition | typeof TIMEOUT_WORKFLOW.definition;
    status: string;
    createdAt: Date;
}

export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'retry_scheduled' | 'cancelled';

export interface Execution {
    id: string;
    workflowId: string;
    workflowName: string;
    status: ExecutionStatus;
    input: Record<string, unknown>;
    output: Record<string, unknown> | null;
    error: string | null;
    idempotencyKey?: string;
    nextRetryAt?: Date;
    retryCount?: number;
    currentStepId?: string;
    workerId?: string;
    lockedAt?: Date;
    steps: Array<StepResultRecord>;
    logs: Array<ExecutionLog>;
    createdAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
}

export interface StepResultRecord {
    stepId: string;
    status: string;
    startedAt: Date | null;
    completedAt: Date | null;
    output: unknown;
    error: string | null;
    attempts: number;
}

export interface ExecutionLog {
    timestamp: Date;
    level: string;
    message: string;
    stepId?: string;
}

export interface ExecutionStore {
    // Workflows
    getWorkflowById(id: string): WorkflowDefinition | undefined;
    getWorkflowByName(name: string): WorkflowDefinition | undefined;
    getAllWorkflows(): WorkflowDefinition[];

    // Executions
    createExecution(workflowId: string, input: Record<string, unknown>, idempotencyKey?: string): Execution;
    getExecution(id: string): Execution | undefined;
    updateExecution(id: string, updates: Partial<Execution>): void;

    // Querying
    getAllExecutions(): Execution[];
    claimExecutions(workerId: string, limit: number): Execution[];
    findByIdempotencyKey(key: string): Execution | undefined;

    // Logging/Updates
    addExecutionLog(id: string, log: ExecutionLog): void;
    addStepResult(id: string, result: StepResultRecord): void;

    // Utility
    load(): void; // For multi-process sync
}
