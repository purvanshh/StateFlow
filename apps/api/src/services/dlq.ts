/**
 * Dead Letter Queue (DLQ) Service
 * Stores failed executions that exceeded retry limits
 */

import { demoStore } from './store.js';
import { metrics, METRIC_NAMES } from './metrics.js';
import { logger } from '@stateflow/shared';
import * as fs from 'fs';
import * as path from 'path';

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
  private persistencePath = path.resolve(process.cwd(), '.data/dlq.json');
  private entries: Map<string, DLQEntry> = new Map();

  constructor() {
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(this.persistencePath)) {
        const fileContent = fs.readFileSync(this.persistencePath, 'utf-8');
        const data = JSON.parse(fileContent);

        if (Array.isArray(data)) {
          data.forEach((entry: any) => {
            this.entries.set(entry.id, {
              ...entry,
              failedAt: new Date(entry.failedAt),
            });
          });
          logger.debug(`Loaded DLQ entries from storage`, {
            metadata: { count: this.entries.size },
          });
        }
      }
    } catch (error) {
      logger.error(`Failed to load DLQ persistence`, { error: error as Error });
    }
  }

  private save() {
    try {
      const dir = path.dirname(this.persistencePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const data = Array.from(this.entries.values());
      fs.writeFileSync(this.persistencePath, JSON.stringify(data, null, 2));
    } catch (error) {
      logger.error(`Failed to save DLQ persistence`, { error: error as Error });
    }
  }

  add(executionId: string, reason: string) {
    const execution = demoStore.getExecution(executionId);
    if (!execution) return;

    const id = `dlq-${Date.now()}-${Math.random().toString(36).substring(7)}`;

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
    this.save();

    metrics.increment(METRIC_NAMES.DLQ_TOTAL);

    logger.warn(`Added execution to DLQ`, {
      executionId,
      metadata: { dlqId: id, reason, totalAttempts, workflowName: execution.workflowName },
    });
  }

  getAll(): DLQEntry[] {
    this.load();
    return Array.from(this.entries.values()).sort(
      (a, b) => b.failedAt.getTime() - a.failedAt.getTime()
    );
  }

  get(id: string): DLQEntry | undefined {
    return this.entries.get(id);
  }

  getByExecutionId(executionId: string): DLQEntry | undefined {
    for (const entry of this.entries.values()) {
      if (entry.executionId === executionId) return entry;
    }
    return undefined;
  }

  remove(id: string) {
    this.entries.delete(id);
    this.save();
  }

  markNoRetry(id: string) {
    const entry = this.entries.get(id);
    if (entry) {
      entry.canRetry = false;
      this.save();
    }
  }

  getStats() {
    const entries = this.getAll();
    return {
      total: entries.length,
      retryable: entries.filter(e => e.canRetry).length,
      byWorkflow: entries.reduce(
        (acc, e) => {
          acc[e.workflowName] = (acc[e.workflowName] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
    };
  }
}

export const dlq = new DeadLetterQueue();
