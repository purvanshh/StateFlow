import 'dotenv/config';
import { app } from './app.js';
import { demoStore } from './services/store.js';
import { runWorkflowExecution } from './services/engine.js';
import { logger } from '@stateflow/shared';

const PORT = process.env.API_PORT || 4000;
const HOST = process.env.API_HOST || 'localhost';
const POLL_INTERVAL = 1000;

class InlineWorker {
  private isRunning = false;
  private activeExecutions = new Set<string>();
  private workerId = `inline-worker-${Math.random().toString(36).substring(7)}`;

  async start() {
    this.isRunning = true;
    logger.info(`Inline worker started`, {
      workerId: this.workerId,
      metadata: { pollIntervalMs: POLL_INTERVAL },
    });
    this.poll();
  }

  private async poll() {
    while (this.isRunning) {
      try {
        const availableSlots = 3 - this.activeExecutions.size;
        if (availableSlots > 0) {
          const pending = demoStore.claimExecutions(this.workerId, availableSlots);

          for (const execution of pending) {
            if (this.activeExecutions.has(execution.id)) continue;

            this.activeExecutions.add(execution.id);
            logger.info(`Processing execution`, {
              executionId: execution.id,
              workerId: this.workerId,
            });

            runWorkflowExecution(execution.id)
              .then(() => {
                const e = demoStore.getExecution(execution.id);
                const status = e?.status || 'unknown';
                logger.info(`Execution finished`, {
                  executionId: execution.id,
                  workerId: this.workerId,
                  metadata: { status },
                });
              })
              .finally(() => {
                this.activeExecutions.delete(execution.id);
              });
          }
        }
      } catch (error) {
        logger.error(`Worker poll error`, { error: error as Error, workerId: this.workerId });
      }

      await new Promise(r => setTimeout(r, POLL_INTERVAL));
    }
  }
}

demoStore;

app.listen(PORT, () => {
  logger.info(`StateFlow API Server started`, {
    metadata: {
      host: HOST,
      port: PORT,
      apiUrl: `http://${HOST}:${PORT}`,
      healthUrl: `http://${HOST}:${PORT}/api/health`,
    },
  });

  const worker = new InlineWorker();
  worker.start();
});
