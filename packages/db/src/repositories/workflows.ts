import { SupabaseClient } from '@supabase/supabase-js';
import type { Database, WorkflowDefinition } from '../types.js';

type DbClient = SupabaseClient<Database>;

export interface CreateWorkflowInput {
    name: string;
    description?: string;
    definition: WorkflowDefinition;
    createdBy?: string;
}

export interface UpdateWorkflowInput {
    name?: string;
    description?: string;
    definition?: WorkflowDefinition;
    status?: 'active' | 'inactive' | 'archived';
}

export class WorkflowRepository {
    constructor(private db: DbClient) { }

    async findAll(options?: { status?: string; limit?: number; offset?: number }) {
        let query = this.db
            .from('workflows')
            .select('*')
            .order('created_at', { ascending: false });

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
            .from('workflows')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        return data;
    }

    async create(input: CreateWorkflowInput) {
        const { data, error } = await (this.db
            .from('workflows') as any)
            .insert({
                name: input.name,
                description: input.description ?? null,
                definition: input.definition as any,
                status: 'active',
                created_by: input.createdBy ?? null,
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async update(id: string, input: UpdateWorkflowInput) {
        const { data, error } = await (this.db
            .from('workflows') as any)
            .update(input)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async delete(id: string) {
        const { error } = await this.db
            .from('workflows')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }

    async count(status?: string) {
        let query = this.db
            .from('workflows')
            .select('*', { count: 'exact', head: true });

        if (status) {
            query = query.eq('status', status);
        }

        const { count, error } = await query;
        if (error) throw error;
        return count ?? 0;
    }
}
