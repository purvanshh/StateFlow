import { SupabaseClient } from '@supabase/supabase-js';
import type { Database, ExecutionStatus } from '../types.js';

type DbClient = SupabaseClient<Database>;

export interface CreateExecutionInput {
    workflowId: string;
    input: Record<string, unknown>;
}

export interface UpdateExecutionInput {
    status?: ExecutionStatus;
    output?: Record<string, unknown>;
    error?: string;
    currentStep?: string;
    startedAt?: string;
    completedAt?: string;
}

export class ExecutionRepository {
    constructor(private db: DbClient) { }

    async findAll(options?: {
        workflowId?: string;
        status?: ExecutionStatus;
        limit?: number;
        offset?: number;
    }) {
        let query = this.db
            .from('executions')
            .select('*, workflows(name)')
            .order('created_at', { ascending: false });

        if (options?.workflowId) {
            query = query.eq('workflow_id', options.workflowId);
        }
        if (options?.status) {
            query = query.eq('status', options.status);
        }
        if (options?.limit) {
            query = query.limit(options.limit);
        }
        if (options?.offset) {
            query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data;
    }

    async findById(id: string) {
        const { data, error } = await this.db
            .from('executions')
            .select('*, workflows(name, definition), execution_steps(*)')
            .eq('id', id)
            .single();

        if (error) throw error;
        return data;
    }

    async create(input: CreateExecutionInput) {
        const { data, error } = await this.db
            .from('executions')
            .insert({
                workflow_id: input.workflowId,
                status: 'pending',
                input: input.input,
                output: null,
                error: null,
                current_step: null,
                started_at: null,
                completed_at: null,
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async update(id: string, input: UpdateExecutionInput) {
        const updateData: Record<string, unknown> = {};

        if (input.status !== undefined) updateData.status = input.status;
        if (input.output !== undefined) updateData.output = input.output;
        if (input.error !== undefined) updateData.error = input.error;
        if (input.currentStep !== undefined) updateData.current_step = input.currentStep;
        if (input.startedAt !== undefined) updateData.started_at = input.startedAt;
        if (input.completedAt !== undefined) updateData.completed_at = input.completedAt;

        const { data, error } = await this.db
            .from('executions')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async fetchPending(limit: number) {
        const { data, error } = await this.db
            .from('executions')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: true })
            .limit(limit);

        if (error) throw error;
        return data;
    }

    async addLog(executionId: string, log: {
        stepId?: string;
        level: 'debug' | 'info' | 'warn' | 'error';
        message: string;
        metadata?: Record<string, unknown>;
    }) {
        const { error } = await this.db
            .from('execution_logs')
            .insert({
                execution_id: executionId,
                step_id: log.stepId ?? null,
                level: log.level,
                message: log.message,
                metadata: log.metadata ?? null,
            });

        if (error) throw error;
    }

    async getLogs(executionId: string) {
        const { data, error } = await this.db
            .from('execution_logs')
            .select('*')
            .eq('execution_id', executionId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return data;
    }
}
