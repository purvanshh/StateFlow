/**
 * Dead Letter Queue (DLQ) Service
 * Stores failed executions that exceeded retry limits
 */

import { demoStore } from './store.js';
import { metrics, METRIC_NAMES } from './metrics.js';

interface DLQEntry {
    id: string;
    executionId: string;
    workflowId: string;
    workflowName: string;
    failedAt: Date;
    reason: string;
    lastError: string;
    totalAttempts: number;
    input: Record<string, unknown>;
    lastStepId: string | null;
    canRetry: boolean;
}

class DeadLetterQueue {
    private entries: Map<string, DLQEntry> = new Map();

    /**
     * Add a failed execution to the DLQ
     */
    add(executionId: string, reason: string) {
        const execution = demoStore.getExecution(executionId);
        if (!execution) return;

        const id = `dlq-${Date.now()}-${Math.random().toString(36).substring(7)}`;

        // Find the last failed step
        const failedStep = execution.steps.find(s => s.status === 'failed');
        const totalAttempts = execution.steps.reduce((sum, s) => sum + s.attempts, 0);

        const entry: DLQEntry = {
            id,
            executionId,
            workflowId: execution.workflowId,
            workflowName: execution.workflowName,
            failedAt: new Date(),
            reason,
            lastError: execution.error || 'Unknown error',
            totalAttempts,
            input: execution.input,
            lastStepId: failedStep?.stepId || null,
            canRetry: true,
        };

        this.entries.set(id, entry);

        // Update metrics
        metrics.increment(METRIC_NAMES.DLQ_ENTRIES);

        console.log(`\n💀 [DLQ] Added: ${id}`);
        console.log(`   Execution: ${executionId}`);
        console.log(`   Reason: ${reason}`);
        console.log(`   Attempts: ${totalAttempts}`);
    }

    /**
     * Get all DLQ entries
     */
    getAll(): DLQEntry[] {
        return Array.from(this.entries.values()).sort(
            (a, b) => b.failedAt.getTime() - a.failedAt.getTime()
        );
    }

    /**
     * Get DLQ entry by ID
     */
    get(id: string): DLQEntry | undefined {
        return this.entries.get(id);
    }

    /**
     * Get DLQ entry by execution ID
     */
    getByExecutionId(executionId: string): DLQEntry | undefined {
        for (const entry of this.entries.values()) {
            if (entry.executionId === executionId) return entry;
        }
        return undefined;
    }

    /**
     * Remove entry from DLQ (after successful retry or manual removal)
     */
    remove(id: string) {
        this.entries.delete(id);
    }

    /**
     * Mark entry as not retryable
     */
    markNoRetry(id: string) {
        const entry = this.entries.get(id);
        if (entry) {
            entry.canRetry = false;
        }
    }

    /**
     * Get DLQ stats
     */
    getStats() {
        const entries = this.getAll();
        return {
            total: entries.length,
            retryable: entries.filter(e => e.canRetry).length,
            byWorkflow: entries.reduce((acc, e) => {
                acc[e.workflowName] = (acc[e.workflowName] || 0) + 1;
                return acc;
            }, {} as Record<string, number>),
        };
    }
}

// Singleton instance
export const dlq = new DeadLetterQueue();
