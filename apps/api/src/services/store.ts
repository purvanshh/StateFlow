/**
 * Demo Workflow Seeder
 * Seeds a demo workflow on server startup if none exists
 */

// Demo workflow definition
export const DEMO_WORKFLOW = {
    name: 'demo-workflow',
    description: 'A demo workflow that fetches data and processes it with simulated failures',
    definition: {
        steps: [
            {
                id: 'start',
                type: 'log',
                name: 'Start Workflow',
                config: { message: '🚀 Starting demo workflow', level: 'info' },
                next: 'fetch-data',
            },
            {
                id: 'fetch-data',
                type: 'http',
                name: 'Fetch Sample Data',
                config: {
                    url: 'https://jsonplaceholder.typicode.com/posts/1',
                    method: 'GET',
                },
                next: 'process-data',
                retryPolicy: { maxAttempts: 3, delayMs: 1000, backoffMultiplier: 2 },
            },
            {
                id: 'process-data',
                type: 'transform',
                name: 'Process Data',
                config: {
                    mapping: {
                        title: 'fetch-data.data.title',
                        body: 'fetch-data.data.body',
                    },
                },
                next: 'check-result',
            },
            {
                id: 'check-result',
                type: 'condition',
                name: 'Check Result',
                config: {
                    field: 'fetch-data.statusCode',
                    operator: 'eq',
                    value: 200,
                    onTrue: 'success-log',
                    onFalse: 'failure-log',
                },
            },
            {
                id: 'success-log',
                type: 'log',
                name: 'Log Success',
                config: { message: '✅ Workflow completed successfully!', level: 'info' },
            },
            {
                id: 'failure-log',
                type: 'log',
                name: 'Log Failure',
                config: { message: '❌ Workflow failed - HTTP request unsuccessful', level: 'error' },
            },
        ],
        trigger: { type: 'manual' },
    },
    status: 'active' as const,
};

// In-memory store for demo (replace with DB in production)
interface DemoWorkflow {
    id: string;
    name: string;
    description: string;
    definition: typeof DEMO_WORKFLOW.definition;
    status: string;
    createdAt: Date;
}

interface DemoExecution {
    id: string;
    workflowId: string;
    workflowName: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'retry_scheduled';
    input: Record<string, unknown>;
    output: Record<string, unknown> | null;
    error: string | null;
    idempotencyKey?: string;
    nextRetryAt?: Date;
    retryCount?: number;
    currentStepId?: string;
    steps: Array<{
        stepId: string;
        status: string;
        startedAt: Date | null;
        completedAt: Date | null;
        output: unknown;
        error: string | null;
        attempts: number;
    }>;
    logs: Array<{
        timestamp: Date;
        level: string;
        message: string;
        stepId?: string;
    }>;
    createdAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
}

import fs from 'fs';
import path from 'path';

// ... (existing interfaces)

class DemoStore {
    private workflows: Map<string, DemoWorkflow> = new Map();
    private executions: Map<string, DemoExecution> = new Map();
    private idempotencyKeys: Map<string, string> = new Map();
    private persistencePath = path.resolve(process.cwd(), '.data/store.json');

    constructor() {
        this.load();

        // Seed if empty
        if (this.workflows.size === 0) {
            this.seedDemoWorkflow();
        }
    }

    private load() {
        try {
            if (fs.existsSync(this.persistencePath)) {
                const data = JSON.parse(fs.readFileSync(this.persistencePath, 'utf8'));

                // Rehydrate maps
                if (data.workflows) {
                    data.workflows.forEach((w: any) => this.workflows.set(w.id, {
                        ...w, createdAt: new Date(w.createdAt)
                    }));
                }

                if (data.executions) {
                    data.executions.forEach((e: any) => this.executions.set(e.id, {
                        ...e,
                        createdAt: new Date(e.createdAt),
                        startedAt: e.startedAt ? new Date(e.startedAt) : null,
                        completedAt: e.completedAt ? new Date(e.completedAt) : null,
                        steps: e.steps.map((s: any) => ({
                            ...s,
                            startedAt: s.startedAt ? new Date(s.startedAt) : null,
                            completedAt: s.completedAt ? new Date(s.completedAt) : null,
                        })),
                        logs: e.logs.map((l: any) => ({ ...l, timestamp: new Date(l.timestamp) }))
                    }));
                }

                if (data.idempotencyKeys) {
                    data.idempotencyKeys.forEach(([k, v]: [string, string]) => this.idempotencyKeys.set(k, v));
                }

                console.log(`📦 Loaded ${this.executions.size} executions from storage`);
            }
        } catch (error) {
            console.error('Failed to load persistence:', error);
        }
    }

    private save() {
        try {
            const dir = path.dirname(this.persistencePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            const data = {
                workflows: Array.from(this.workflows.values()),
                executions: Array.from(this.executions.values()),
                idempotencyKeys: Array.from(this.idempotencyKeys.entries()),
            };

            fs.writeFileSync(this.persistencePath, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Failed to save persistence:', error);
        }
    }

    private seedDemoWorkflow() {
        const id = 'demo-wf-001';
        this.workflows.set(id, {
            id,
            name: DEMO_WORKFLOW.name,
            description: DEMO_WORKFLOW.description,
            definition: DEMO_WORKFLOW.definition,
            status: DEMO_WORKFLOW.status,
            createdAt: new Date(),
        });
        this.save();
        console.log('📦 Seeded demo workflow:', DEMO_WORKFLOW.name);
    }

    getWorkflowByName(name: string): DemoWorkflow | undefined {
        for (const wf of this.workflows.values()) {
            if (wf.name === name) return wf;
        }
        return undefined;
    }

    getWorkflowById(id: string): DemoWorkflow | undefined {
        return this.workflows.get(id);
    }

    getAllWorkflows(): DemoWorkflow[] {
        return Array.from(this.workflows.values());
    }

    createExecution(
        workflowId: string,
        input: Record<string, unknown>,
        idempotencyKey?: string
    ): DemoExecution {
        const workflow = this.workflows.get(workflowId);
        const id = `exec-${Date.now()}-${Math.random().toString(36).substring(7)}`;

        const execution: DemoExecution = {
            id,
            workflowId,
            workflowName: workflow?.name || 'unknown',
            status: 'pending',
            input,
            output: null,
            error: null,
            idempotencyKey,
            steps: [],
            logs: [],
            createdAt: new Date(),
            startedAt: null,
            completedAt: null,
            retryCount: 0,
            nextRetryAt: undefined,
            currentStepId: undefined,
        };

        this.executions.set(id, execution);

        // Track idempotency key
        if (idempotencyKey) {
            this.idempotencyKeys.set(idempotencyKey, id);
        }

        this.save();
        return execution;
    }

    findByIdempotencyKey(key: string): DemoExecution | undefined {
        const executionId = this.idempotencyKeys.get(key);
        if (executionId) {
            return this.executions.get(executionId);
        }
        return undefined;
    }

    getExecution(id: string): DemoExecution | undefined {
        return this.executions.get(id);
    }


    getAllExecutions(): DemoExecution[] {
        return Array.from(this.executions.values()).sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
        );
    }

    // Replace getPendingExecutions with smarter polling
    getRunnableExecutions(limit: number): DemoExecution[] {
        const now = new Date();
        return Array.from(this.executions.values())
            .filter(e => {
                if (e.status === 'pending') return true;
                if (e.status === 'retry_scheduled') {
                    return e.nextRetryAt && e.nextRetryAt <= now;
                }
                return false;
            })
            .sort((a, b) => {
                // Prioritize retries that are overdue, then oldest pending
                const timeA = a.nextRetryAt || a.createdAt;
                const timeB = b.nextRetryAt || b.createdAt;
                return timeA.getTime() - timeB.getTime();
            })
            .slice(0, limit);
    }

    // Kept for backward compatibility if needed, but worker should use getRunnableExecutions
    getPendingExecutions(limit: number): DemoExecution[] {
        return this.getRunnableExecutions(limit);
    }

    updateExecution(id: string, updates: Partial<DemoExecution>) {
        const execution = this.executions.get(id);
        if (execution) {
            Object.assign(execution, updates);
            this.save();
        }
    }

    addExecutionLog(id: string, log: DemoExecution['logs'][0]) {
        const execution = this.executions.get(id);
        if (execution) {
            execution.logs.push(log);
            this.save();
            // Also log to console for visibility
            const emoji = log.level === 'error' ? '❌' : log.level === 'warn' ? '⚠️' : 'ℹ️';
            console.log(`${emoji} [${id.substring(0, 12)}] ${log.stepId ? `[${log.stepId}]` : ''} ${log.message}`);
        }
    }

    addStepResult(id: string, stepResult: DemoExecution['steps'][0]) {
        const execution = this.executions.get(id);
        if (execution) {
            const existingIndex = execution.steps.findIndex(s => s.stepId === stepResult.stepId);
            if (existingIndex >= 0) {
                execution.steps[existingIndex] = stepResult;
            } else {
                execution.steps.push(stepResult);
            }
            this.save();
        }
    }
}

// Singleton instance
export const demoStore = new DemoStore();
