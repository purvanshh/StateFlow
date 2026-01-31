import { DEMO_WORKFLOW, TIMEOUT_WORKFLOW } from './definitions.js';

export interface WorkflowDefinition {
    id: string;
    name: string;
    description: string;
    definition: typeof DEMO_WORKFLOW.definition | typeof TIMEOUT_WORKFLOW.definition;
    steps: unknown[]; // Keeping loose for now, will tighten with Zod
    version: number;
    createdAt: Date;
    [key: string]: unknown;
}

export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'retry_scheduled' | 'cancelled';

export interface Execution {
    id: string;
    workflowId: string;
    workflowName: string;
    workflowVersion?: number; // Phase 6: Versioning
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
    // Workflows - Phase 6: Sync -> Async for DB access
    getWorkflowById(id: string): Promise<WorkflowDefinition | undefined>;
    getWorkflowByName(name: string, version?: number): Promise<WorkflowDefinition | undefined>;
    getAllWorkflows(): Promise<WorkflowDefinition[]>;

    // Executions
    createExecution(workflowId: string, input: Record<string, unknown>, idempotencyKey?: string): Promise<Execution>;
    getExecution(id: string): Promise<Execution | undefined>;
    updateExecution(id: string, updates: Partial<Execution>): Promise<void>;

    // Querying
    getAllExecutions(): Promise<Execution[]>;
    claimExecutions(workerId: string, limit: number): Promise<Execution[]>;
    findByIdempotencyKey(key: string): Promise<Execution | undefined>;

    // Logging/Updates
    addExecutionLog(id: string, log: ExecutionLog): Promise<void>;
    addStepResult(id: string, result: StepResultRecord): Promise<void>;

    // Utility
    load(): void; // synchronous load is fine for FileStore, no-op for SQL
}
