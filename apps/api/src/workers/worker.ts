/**
 * Background Worker Process
 * 
 * Polls for pending executions and runs them through the workflow engine.
 * Handles retries, backoff, and DLQ.
 */

import 'dotenv/config';
import { demoStore } from '../services/store.js';
import { runWorkflowExecution } from '../services/engine.js';
import { logger } from '@stateflow/shared';

const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '3', 10);
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '1000', 10);

class WorkflowWorker {
    private isRunning = false;
    private activeExecutions = new Set<string>();
    private processedCount = 0;
    private failedCount = 0;
    private workerId = `worker-${Math.random().toString(36).substring(7)}`;

    async start() {
        logger.info('⚙️ StateFlow Worker Started', {
            workerId: this.workerId,
            metadata: {
                concurrency: WORKER_CONCURRENCY,
                pollInterval: POLL_INTERVAL
            }
        });

        this.isRunning = true;
        this.poll();
    }

    async stop() {
        logger.info('[Worker] Stopping...', { workerId: this.workerId });
        this.isRunning = false;

        // Wait for active executions
        while (this.activeExecutions.size > 0) {
            logger.info(`[Worker] Waiting for ${this.activeExecutions.size} active execution(s)...`, { workerId: this.workerId });
            await this.sleep(500);
        }

        logger.info(`[Worker] Stopped`, {
            workerId: this.workerId,
            metadata: {
                processed: this.processedCount,
                failed: this.failedCount
            }
        });
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

                        logger.info(`📋 [Worker] Picked up execution`, {
                            executionId: execution.id,
                            workerId: this.workerId,
                            metadata: { workflowName: execution.workflowName }
                        });

                        // Run async
                        this.processExecution(execution.id).finally(() => {
                            this.activeExecutions.delete(execution.id);
                        });
                    }
                }
            } catch (error) {
                logger.error('[Worker] Poll error', { error: error as Error, workerId: this.workerId });
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
                logger.info(`✅ [Worker] Execution completed`, {
                    executionId,
                    workerId: this.workerId,
                    metadata: { duration }
                });
            } else {
                this.failedCount++;
                logger.warn(`❌ [Worker] Execution failed`, {
                    executionId,
                    workerId: this.workerId,
                    metadata: {
                        duration,
                        errorMessage: execution?.error
                    }
                });
            }
        } catch (error) {
            this.failedCount++;
            logger.error(`[Worker] Execution error`, { executionId, error: error as Error, workerId: this.workerId });
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
