// Generated types from Supabase
// Run: npx supabase gen types typescript --project-id your-project-id > types.ts

export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export interface Database {
    public: {
        Tables: {
            workflows: {
                Row: {
                    id: string;
                    name: string;
                    description: string | null;
                    definition: WorkflowDefinition;
                    status: 'active' | 'inactive' | 'archived';
                    created_at: string;
                    updated_at: string;
                    created_by: string | null;
                };
                Insert: Omit<Database['public']['Tables']['workflows']['Row'], 'id' | 'created_at' | 'updated_at'>;
                Update: Partial<Database['public']['Tables']['workflows']['Insert']>;
            };
            executions: {
                Row: ExecutionRow;
                Insert: Omit<ExecutionRow, 'id' | 'created_at'>;
                Update: Partial<Omit<ExecutionRow, 'id' | 'created_at'>>;
            };
            step_results: {
                Row: {
                    id: string;
                    execution_id: string;
                    step_id: string;
                    status: string;
                    input: Json;
                    output: Json | null;
                    error: string | null;
                    attempt: number;
                    duration_ms: number | null;
                    started_at: string | null;
                    completed_at: string | null;
                    created_at: string;
                };
                Insert: Omit<Database['public']['Tables']['step_results']['Row'], 'id' | 'created_at'>;
                Update: Partial<Database['public']['Tables']['step_results']['Insert']>;
            };
            dlq_entries: {
                Row: {
                    id: string;
                    execution_id: string;
                    workflow_name: string | null;
                    reason: string | null;
                    payload: Json | null;
                    failed_at: string;
                    created_at: string;
                };
                Insert: Omit<Database['public']['Tables']['dlq_entries']['Row'], 'id' | 'created_at' | 'failed_at'>;
                Update: Partial<Database['public']['Tables']['dlq_entries']['Insert']>;
            };
            execution_logs: {
                Row: {
                    id: string;
                    execution_id: string;
                    step_id: string | null;
                    level: 'debug' | 'info' | 'warn' | 'error';
                    message: string;
                    metadata: Json | null;
                    created_at: string;
                };
                Insert: Omit<Database['public']['Tables']['execution_logs']['Row'], 'id' | 'created_at'>;
                Update: Partial<Database['public']['Tables']['execution_logs']['Insert']>;
            };
        };
    };
}

export interface WorkflowDefinition {
    steps: WorkflowStep[];
    trigger?: {
        type: 'manual' | 'schedule' | 'webhook';
        config?: Json;
    };
}

export interface WorkflowStep {
    id: string;
    type: string;
    name?: string;
    config?: Json;
    next?: string;
    onError?: string;
    retryPolicy?: {
        maxAttempts: number;
        delayMs: number;
        backoffMultiplier?: number;
    };
}

export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
export interface ExecutionRow {
    id: string;
    workflow_id: string;
    workflow_name: string;
    workflow_version?: number;
    status: ExecutionStatus;
    input: Json;
    output: Json | null;
    error: string | null;
    current_step_id: string | null;
    retry_count: number;
    next_retry_at: string | null;
    worker_id: string | null;
    locked_at: string | null;
    idempotency_key: string | null;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface WorkflowRow {
    id: string;
    name: string;
    version: number;
    definition: Json;
    created_at: string;
}
