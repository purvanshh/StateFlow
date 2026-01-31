// Generated types from Supabase
// Run: npx supabase gen types typescript --project-id your-project-id > types.ts

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
                Row: {
                    id: string;
                    workflow_id: string;
                    status: ExecutionStatus;
                    input: Record<string, unknown>;
                    output: Record<string, unknown> | null;
                    error: string | null;
                    current_step: string | null;
                    started_at: string | null;
                    completed_at: string | null;
                    created_at: string;
                };
                Insert: Omit<Database['public']['Tables']['executions']['Row'], 'id' | 'created_at'>;
                Update: Partial<Database['public']['Tables']['executions']['Insert']>;
            };
            execution_steps: {
                Row: {
                    id: string;
                    execution_id: string;
                    step_id: string;
                    status: StepStatus;
                    input: Record<string, unknown>;
                    output: Record<string, unknown> | null;
                    error: string | null;
                    attempt: number;
                    started_at: string | null;
                    completed_at: string | null;
                    created_at: string;
                };
                Insert: Omit<Database['public']['Tables']['execution_steps']['Row'], 'id' | 'created_at'>;
                Update: Partial<Database['public']['Tables']['execution_steps']['Insert']>;
            };
            execution_logs: {
                Row: {
                    id: string;
                    execution_id: string;
                    step_id: string | null;
                    level: 'debug' | 'info' | 'warn' | 'error';
                    message: string;
                    metadata: Record<string, unknown> | null;
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
        config?: Record<string, unknown>;
    };
}

export interface WorkflowStep {
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

export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
