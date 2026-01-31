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
    status: 'pending' | 'running' | 'completed' | 'failed';
    input: Record<string, unknown>;
    output: Record<string, unknown> | null;
    error: string | null;
    idempotencyKey?: string;
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

class DemoStore {
    private workflows: Map<string, DemoWorkflow> = new Map();
    private executions: Map<string, DemoExecution> = new Map();
    private idempotencyKeys: Map<string, string> = new Map(); // key -> executionId

    constructor() {
        // Seed demo workflow
        this.seedDemoWorkflow();
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
        };

        this.executions.set(id, execution);

        // Track idempotency key
        if (idempotencyKey) {
            this.idempotencyKeys.set(idempotencyKey, id);
        }

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

    getPendingExecutions(limit: number): DemoExecution[] {
        return Array.from(this.executions.values())
            .filter(e => e.status === 'pending')
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
            .slice(0, limit);
    }

    updateExecution(id: string, updates: Partial<DemoExecution>) {
        const execution = this.executions.get(id);
        if (execution) {
            Object.assign(execution, updates);
        }
    }

    addExecutionLog(id: string, log: DemoExecution['logs'][0]) {
        const execution = this.executions.get(id);
        if (execution) {
            execution.logs.push(log);
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
        }
    }
}

// Singleton instance
export const demoStore = new DemoStore();
