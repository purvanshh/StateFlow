/**
 * Background Worker Process
 * 
 * Polls for pending executions and runs them through the workflow engine.
 * Handles retries, backoff, and DLQ.
 */

import 'dotenv/config';
import { demoStore } from '../services/store.js';
import { runWorkflowExecution } from '../services/engine.js';

const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '3', 10);
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '1000', 10);

class WorkflowWorker {
    private isRunning = false;
    private activeExecutions = new Set<string>();
    private processedCount = 0;
    private failedCount = 0;
    private workerId = `worker-${Math.random().toString(36).substring(7)}`;

    async start() {
        console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   ⚙️  StateFlow Worker Started                                 ║
║                                                               ║
║   Worker ID:      ${this.workerId.padEnd(36)}                ║
║   Concurrency:    ${WORKER_CONCURRENCY.toString().padEnd(4)}                                       ║
║   Poll Interval:  ${POLL_INTERVAL}ms                                        ║
║                                                               ║
║   Waiting for executions...                                   ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
    `);

        this.isRunning = true;
        this.poll();
    }

    async stop() {
        console.log('\n[Worker] Stopping...');
        this.isRunning = false;

        // Wait for active executions
        while (this.activeExecutions.size > 0) {
            console.log(`[Worker] Waiting for ${this.activeExecutions.size} active execution(s)...`);
            await this.sleep(500);
        }

        console.log(`[Worker] Stopped. Processed: ${this.processedCount}, Failed: ${this.failedCount}`);
    }

    private async poll() {
        while (this.isRunning) {
            try {
                // Check capacity
                const availableSlots = WORKER_CONCURRENCY - this.activeExecutions.size;

                if (availableSlots > 0) {
                    // Claim pending and scheduled executions
                    const pending = demoStore.claimExecutions(this.workerId, availableSlots);

                    for (const execution of pending) {
                        // Skip if already processing
                        if (this.activeExecutions.has(execution.id)) continue;

                        this.activeExecutions.add(execution.id);

                        console.log(`\n📋 [Worker] Picked up execution: ${execution.id}`);
                        console.log(`   Workflow: ${execution.workflowName}`);

                        // Run async
                        this.processExecution(execution.id).finally(() => {
                            this.activeExecutions.delete(execution.id);
                        });
                    }
                }
            } catch (error) {
                console.error('[Worker] Poll error:', error);
            }

            await this.sleep(POLL_INTERVAL);
        }
    }

    private async processExecution(executionId: string) {
        const startTime = Date.now();

        try {
            await runWorkflowExecution(executionId);

            const execution = demoStore.getExecution(executionId);
            const duration = Date.now() - startTime;

            if (execution?.status === 'completed') {
                this.processedCount++;
                console.log(`\n✅ [Worker] Execution completed: ${executionId} (${duration}ms)`);
            } else {
                this.failedCount++;
                console.log(`\n❌ [Worker] Execution failed: ${executionId} (${duration}ms)`);
                console.log(`   Error: ${execution?.error || 'Unknown'}`);
            }
        } catch (error) {
            this.failedCount++;
            console.error(`[Worker] Execution error for ${executionId}:`, error);
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getStats() {
        return {
            running: this.isRunning,
            activeExecutions: this.activeExecutions.size,
            processed: this.processedCount,
            failed: this.failedCount,
        };
    }
}

// Create and start worker
const worker = new WorkflowWorker();

// Graceful shutdown
process.on('SIGTERM', async () => {
    await worker.stop();
    process.exit(0);
});

process.on('SIGINT', async () => {
    await worker.stop();
    process.exit(0);
});

// Start polling
worker.start();
