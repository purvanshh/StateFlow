import fs from 'fs';
import path from 'path';
import { DEMO_WORKFLOW, TIMEOUT_WORKFLOW } from './definitions.js';
import { ExecutionStore, WorkflowDefinition, Execution, ExecutionLog, StepResultRecord } from './types.js';
import { logger } from '@stateflow/shared';

export class FileStore implements ExecutionStore {
    private workflows: Map<string, WorkflowDefinition> = new Map();
    private executions: Map<string, Execution> = new Map();
    private idempotencyKeys: Map<string, string> = new Map();
    private persistencePath = path.resolve(process.cwd(), '.data/store.json');

    constructor() {
        this.load();

        // Seed if empty
        if (this.workflows.size === 0) {
            this.seedDemoWorkflow();
        }
    }

    public load() {
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
                        nextRetryAt: e.nextRetryAt ? new Date(e.nextRetryAt) : undefined,
                        lockedAt: e.lockedAt ? new Date(e.lockedAt) : undefined,
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

                logger.info(`📦 Loaded ${this.executions.size} executions from storage`);
            }
        } catch (error) {
            logger.error('Failed to load persistence', { error: error as Error });
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
            logger.error('Failed to save persistence', { error: error as Error });
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

        const timeoutId = 'timeout-wf-001';
        this.workflows.set(timeoutId, {
            id: timeoutId,
            name: TIMEOUT_WORKFLOW.name,
            description: TIMEOUT_WORKFLOW.description,
            definition: TIMEOUT_WORKFLOW.definition as any,
            status: TIMEOUT_WORKFLOW.status,
            createdAt: new Date(),
        });

        this.save();
        logger.info('📦 Seeded demo & timeout workflows');
    }

    getWorkflowByName(name: string): WorkflowDefinition | undefined {
        for (const wf of this.workflows.values()) {
            if (wf.name === name) return wf;
        }
        return undefined;
    }

    getWorkflowById(id: string): WorkflowDefinition | undefined {
        return this.workflows.get(id);
    }

    getAllWorkflows(): WorkflowDefinition[] {
        return Array.from(this.workflows.values());
    }

    private lockPath = path.resolve(process.cwd(), '.data/store.lock');

    findByIdempotencyKey(key: string): Execution | undefined {
        const executionId = this.idempotencyKeys.get(key);
        if (executionId) {
            return this.executions.get(executionId);
        }
        return undefined;
    }

    getExecution(id: string): Execution | undefined {
        return this.executions.get(id);
    }

    getAllExecutions(): Execution[] {
        return Array.from(this.executions.values()).sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
        );
    }

    // (Locking logic moved to individual methods)


    createExecution(
        workflowId: string,
        input: Record<string, unknown>,
        idempotencyKey?: string
    ): Execution {
        // We can't easily make this async without changing the interface to Promise<Execution>
        // But for now, let's use a sync version logic or just assume create is safe enough?
        // Actually, create IS NOT safe if we have duplicate IDs or idempotency checks.
        // Ideally we should refactor store interface to be async.
        // BUT, changing to async is a big refactor.
        // Let's implement a synchronous spinlock for now to satisfy the interface.

        return this.createExecutionSync(workflowId, input, idempotencyKey);
    }

    private createExecutionSync(
        workflowId: string,
        input: Record<string, unknown>,
        idempotencyKey?: string
    ): Execution {
        // Sync implementation of locking
        const start = Date.now();
        while (true) {
            try {
                fs.mkdirSync(this.lockPath);
                try {
                    this.load();

                    // IDEMPOTENCY CHECK MUST BE HERE inside lock
                    if (idempotencyKey) {
                        const existingId = this.idempotencyKeys.get(idempotencyKey);
                        if (existingId) {
                            const existing = this.executions.get(existingId);
                            if (existing) {
                                // Clean up lock before returning
                                fs.rmdirSync(this.lockPath);
                                return existing;
                            }
                        }
                    }

                    const workflow = this.workflows.get(workflowId);
                    const id = `exec-${Date.now()}-${Math.random().toString(36).substring(7)}`;

                    const execution: Execution = {
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

                    if (idempotencyKey) {
                        this.idempotencyKeys.set(idempotencyKey, id);
                    }

                    this.save();
                    return execution;
                } finally {
                    try { fs.rmdirSync(this.lockPath); } catch { }
                }
            } catch (e: any) {
                if (e.code === 'EEXIST') {
                    // Check stale
                    try {
                        const stats = fs.statSync(this.lockPath);
                        if (Date.now() - stats.mtimeMs > 5000) {
                            try { fs.rmdirSync(this.lockPath); } catch { }
                        }
                    } catch { }

                    // Busy wait (bad but effective for sync interface)
                    // Node.js doesn't have sleep, so we just spin or use execSync sleep?
                    // Or just spin loop
                    const waitStart = Date.now();
                    while (Date.now() - waitStart < 50); // 50ms block
                    if (Date.now() - start > 5000) throw new Error('Lock timeout');
                    continue;
                }
                throw e;
            }
        }
    }

    claimExecutions(workerId: string, limit: number): Execution[] {
        // Sync lock
        const start = Date.now();
        while (true) {
            try {
                fs.mkdirSync(this.lockPath);
                try {
                    this.load(); // Critical load inside lock

                    const now = new Date();
                    const candidates = Array.from(this.executions.values())
                        .filter(e => {
                            if (e.status === 'pending') return true;
                            if (e.status === 'retry_scheduled') {
                                return e.nextRetryAt && e.nextRetryAt <= now;
                            }
                            return false;
                        })
                        .sort((a, b) => {
                            const timeA = a.nextRetryAt || a.createdAt;
                            const timeB = b.nextRetryAt || b.createdAt;
                            return timeA.getTime() - timeB.getTime();
                        })
                        .slice(0, limit);

                    const claimed: Execution[] = [];

                    for (const execution of candidates) {
                        const fresh = this.executions.get(execution.id);
                        if (!fresh) continue;
                        // Check lock expiry again
                        if (fresh.lockedAt && (now.getTime() - fresh.lockedAt.getTime()) < 300000) continue;

                        fresh.workerId = workerId;
                        fresh.lockedAt = now;
                        if (fresh.status === 'pending' || fresh.status === 'retry_scheduled') {
                            fresh.status = 'running';
                            fresh.startedAt = fresh.startedAt || now;
                        }
                        claimed.push(fresh);
                    }

                    if (claimed.length > 0) {
                        this.save();
                    }
                    return claimed;
                } finally {
                    try { fs.rmdirSync(this.lockPath); } catch { }
                }
            } catch (e: any) {
                if (e.code === 'EEXIST') {
                    try {
                        const stats = fs.statSync(this.lockPath);
                        if (Date.now() - stats.mtimeMs > 5000) { try { fs.rmdirSync(this.lockPath); } catch { } }
                    } catch { }
                    const waitStart = Date.now();
                    while (Date.now() - waitStart < 50);
                    if (Date.now() - start > 5000) return []; // Just return empty on timeout
                    continue;
                }
                throw e;
            }
        }
    }

    updateExecution(id: string, updates: Partial<Execution>) {
        // Sync lock implementation
        const start = Date.now();
        while (true) {
            try {
                fs.mkdirSync(this.lockPath);
                try {
                    this.load();
                    const execution = this.executions.get(id);
                    if (execution) {
                        Object.assign(execution, updates);
                        this.save();
                    }
                    return;
                } finally {
                    try { fs.rmdirSync(this.lockPath); } catch { }
                }
            } catch (e: any) {
                if (e.code === 'EEXIST') {
                    try {
                        const stats = fs.statSync(this.lockPath);
                        if (Date.now() - stats.mtimeMs > 5000) { try { fs.rmdirSync(this.lockPath); } catch { } }
                    } catch { }
                    const waitStart = Date.now();
                    while (Date.now() - waitStart < 50);
                    if (Date.now() - start > 5000) return;
                    continue;
                }
                throw e;
            }
        }
    }


    addExecutionLog(id: string, log: ExecutionLog) {
        // Sync lock implementation
        const start = Date.now();
        while (true) {
            try {
                fs.mkdirSync(this.lockPath);
                try {
                    this.load();
                    const execution = this.executions.get(id);
                    if (execution) {
                        execution.logs.push(log);
                        this.save();
                        logger.info(`[${id.substring(0, 12)}] ${log.stepId ? `[${log.stepId}]` : ''} ${log.message}`, {
                            executionId: id,
                            stepId: log.stepId,
                            level: log.level as any
                        });
                    }
                    return;
                } finally {
                    try { fs.rmdirSync(this.lockPath); } catch { }
                }
            } catch (e: any) {
                if (e.code === 'EEXIST') {
                    try {
                        const stats = fs.statSync(this.lockPath);
                        if (Date.now() - stats.mtimeMs > 5000) { try { fs.rmdirSync(this.lockPath); } catch { } }
                    } catch { }
                    const waitStart = Date.now();
                    while (Date.now() - waitStart < 50);
                    if (Date.now() - start > 5000) return;
                    continue;
                }
                throw e;
            }
        }
    }

    addStepResult(id: string, stepResult: StepResultRecord) {
        // Sync lock implementation
        const start = Date.now();
        while (true) {
            try {
                fs.mkdirSync(this.lockPath);
                try {
                    this.load();
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
                    return;
                } finally {
                    try { fs.rmdirSync(this.lockPath); } catch { }
                }
            } catch (e: any) {
                if (e.code === 'EEXIST') {
                    try {
                        const stats = fs.statSync(this.lockPath);
                        if (Date.now() - stats.mtimeMs > 5000) { try { fs.rmdirSync(this.lockPath); } catch { } }
                    } catch { }
                    const waitStart = Date.now();
                    while (Date.now() - waitStart < 50);
                    if (Date.now() - start > 5000) return;
                    continue;
                }
                throw e;
            }
        }
    }
}
