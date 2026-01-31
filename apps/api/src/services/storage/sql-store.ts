import { ExecutionStore, Execution, WorkflowDefinition, ExecutionLog, StepResultRecord } from './types.js';
import { db } from '@stateflow/db';
import { logger } from '@stateflow/shared';
import { DEMO_WORKFLOW, TIMEOUT_WORKFLOW } from './definitions.js';

export class SqlExecutionStore implements ExecutionStore {
    private client = db(); // Use service client for backend

    // Workflows - Still hardcoded for now, but could be DB-backed later
    getWorkflowById(id: string): WorkflowDefinition | undefined {
        // In Phase 5, workflows are still definitions in code, but we track executions in DB
        if (id === 'demo-workflow') return { id: 'demo-workflow', ...DEMO_WORKFLOW, createdAt: new Date() };
        if (id === 'timeout-workflow') return { id: 'timeout-workflow', ...TIMEOUT_WORKFLOW, createdAt: new Date() };
        return undefined;
    }

    getWorkflowByName(name: string): WorkflowDefinition | undefined {
        if (name === 'demo-workflow') return { id: 'demo-workflow', ...DEMO_WORKFLOW, createdAt: new Date() };
        if (name === 'timeout-workflow') return { id: 'timeout-workflow', ...TIMEOUT_WORKFLOW, createdAt: new Date() };
        return undefined;
    }

    getAllWorkflows(): WorkflowDefinition[] {
        return [
            { id: 'demo-workflow', ...DEMO_WORKFLOW, createdAt: new Date() },
            { id: 'timeout-workflow', ...TIMEOUT_WORKFLOW, createdAt: new Date() },
        ];
    }

    // Executions
    async createExecution(workflowId: string, input: Record<string, unknown>, idempotencyKey?: string): Promise<Execution> {
        const workflow = this.getWorkflowById(workflowId);
        if (!workflow) throw new Error(`Workflow ${workflowId} not found`);

        const { data, error } = await this.client
            .from('executions')
            .insert({
                workflow_id: workflowId,
                workflow_name: workflow.name,
                status: 'pending',
                input: input as any,
                idempotency_key: idempotencyKey,
            })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') { // Unique violation
                return this.findByIdempotencyKey(idempotencyKey!) as Promise<Execution>;
            }
            throw new Error(`Failed to create execution: ${error.message}`);
        }

        return this.mapToExecution(data);
    }

    async getExecution(id: string): Promise<Execution | undefined> {
        const { data, error } = await this.client
            .from('executions')
            .select(`
        *,
        step_results (*)
      `)
            .eq('id', id)
            .single();

        if (error || !data) return undefined;

        // Logs optional fetched separately or excluded for performance
        return this.mapToExecution(data, data.step_results);
    }

    async updateExecution(id: string, updates: Partial<Execution>): Promise<void> {
        const dbUpdates: any = {};
        if (updates.status) dbUpdates.status = updates.status;
        if (updates.output) dbUpdates.output = updates.output;
        if (updates.error) dbUpdates.error = updates.error;
        if (updates.currentStepId) dbUpdates.current_step_id = updates.currentStepId;
        if (updates.retryCount !== undefined) dbUpdates.retry_count = updates.retryCount;
        if (updates.nextRetryAt) dbUpdates.next_retry_at = updates.nextRetryAt.toISOString();
        if (updates.startedAt) dbUpdates.started_at = updates.startedAt.toISOString();
        if (updates.completedAt) dbUpdates.completed_at = updates.completedAt.toISOString();

        // If resetting lock
        if (updates.workerId === null) dbUpdates.worker_id = null;
        if (updates.lockedAt === null) dbUpdates.locked_at = null;

        const { error } = await this.client.from('executions').update(dbUpdates).eq('id', id);
        if (error) {
            logger.error('Failed to update execution', { error: error as Error, executionId: id });
        }
    }

    // Atomic Claiming
    async claimExecutions(workerId: string, limit: number): Promise<Execution[]> {
        // Uses RPC call for atomic locking
        const { data, error } = await this.client.rpc('claim_executions', {
            p_worker_id: workerId,
            p_batch_size: limit,
        });

        if (error) {
            logger.error('Failed to claim executions', { error: error as Error, workerId });
            return [];
        }

        if (!data || data.length === 0) return [];

        return data.map((row: any) => this.mapToExecution(row));
    }

    // Querying
    async getAllExecutions(): Promise<Execution[]> {
        const { data } = await this.client
            .from('executions')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        return (data || []).map((row: any) => this.mapToExecution(row));
    }

    async findByIdempotencyKey(key: string): Promise<Execution | undefined> {
        const { data } = await this.client
            .from('executions')
            .select('*')
            .eq('idempotency_key', key)
            .single();

        return data ? this.mapToExecution(data) : undefined;
    }

    // Logging
    async addExecutionLog(id: string, log: ExecutionLog): Promise<void> {
        // Optional: write to execution_logs table
        // For now we might just use standard logger or a separate table if needed
        logger.info(`[${id}] ${log.message}`, { level: log.level as any, stepId: log.stepId });
    }

    async addStepResult(id: string, result: StepResultRecord): Promise<void> {
        const { error } = await this.client.from('step_results').insert({
            execution_id: id,
            step_id: result.stepId,
            status: result.status,
            output: result.output as any,
            error: result.error,
            attempt: result.attempts,
            duration_ms: result.completedAt && result.startedAt ? result.completedAt.getTime() - result.startedAt.getTime() : null,
            started_at: result.startedAt?.toISOString(),
            completed_at: result.completedAt?.toISOString(),
        });

        if (error) {
            logger.error('Failed to add step result', { error: error as Error, executionId: id });
        }
    }

    load() {
        // No-op for SQL store
    }

    private mapToExecution(row: any, stepResults: any[] = []): Execution {
        return {
            id: row.id,
            workflowId: row.workflow_id,
            workflowName: row.workflow_name,
            status: row.status,
            input: row.input,
            output: row.output,
            error: row.error,
            retryCount: row.retry_count,
            nextRetryAt: row.next_retry_at ? new Date(row.next_retry_at) : undefined,
            currentStepId: row.current_step_id || undefined,
            workerId: row.worker_id || undefined,
            lockedAt: row.locked_at ? new Date(row.locked_at) : undefined,
            createdAt: new Date(row.created_at),
            startedAt: row.started_at ? new Date(row.started_at) : null,
            completedAt: row.completed_at ? new Date(row.completed_at) : null,
            steps: stepResults.map(s => ({
                stepId: s.step_id,
                status: s.status,
                startedAt: s.started_at ? new Date(s.started_at) : null,
                completedAt: s.completed_at ? new Date(s.completed_at) : null,
                output: s.output,
                error: s.error,
                attempts: s.attempt,
            })),
            logs: [], // Fetch logs separately if needed
            idempotencyKey: row.idempotency_key || undefined,
        };
    }
}
