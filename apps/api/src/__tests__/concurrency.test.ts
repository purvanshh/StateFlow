/**
 * Integration Tests for Concurrency Safety
 * Tests atomic claiming, idempotency, and state consistency
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FileStore } from '../services/storage/file-store.js';

describe('Concurrency Safety', () => {
  let store: FileStore;

  beforeEach(() => {
    store = new FileStore();
    store.load();
  });

  describe('Atomic Job Claiming', () => {
    it('prevents duplicate processing with concurrent workers', async () => {
      await store.createExecution('demo-wf-001', { test: 1 });
      await store.createExecution('demo-wf-001', { test: 2 });
      await store.createExecution('demo-wf-001', { test: 3 });
      await store.createExecution('demo-wf-001', { test: 4 });
      await store.createExecution('demo-wf-001', { test: 5 });

      const [claimedBy1, claimedBy2] = await Promise.all([
        store.claimExecutions('worker-1', 3),
        store.claimExecutions('worker-2', 3),
      ]);

      const allClaimed = [...claimedBy1, ...claimedBy2];
      const claimedIds = allClaimed.map((e: any) => e.id);

      expect(claimedIds.length).toBe(5);
      expect(new Set(claimedIds).size).toBe(5);
    });

    it('distributes work fairly across multiple workers', async () => {
      for (let i = 0; i < 20; i++) {
        await store.createExecution('demo-wf-001', { index: i });
      }

      const workerPromises = [];
      for (let i = 0; i < 4; i++) {
        workerPromises.push(store.claimExecutions(`worker-${i}`, 10));
      }

      const results = await Promise.all(workerPromises);

      const totalClaimed = results.reduce((sum: number, r: any[]) => sum + r.length, 0);
      expect(totalClaimed).toBe(20);
    });

    it('handles burst claim requests without race conditions', async () => {
      for (let i = 0; i < 50; i++) {
        await store.createExecution('demo-wf-001', { burst: i });
      }

      const burstClaims = await Promise.all(
        Array.from({ length: 10 }, (_, i) => store.claimExecutions(`burst-worker-${i}`, 10))
      );

      const claimedCount = burstClaims.reduce((sum: number, batch: any[]) => sum + batch.length, 0);
      expect(claimedCount).toBe(50);
    });

    it('only claims pending or ready-to-retry executions', async () => {
      const pending = await store.createExecution('demo-wf-001', { type: 'pending' });
      const running = await store.createExecution('demo-wf-001', { type: 'running' });
      const completed = await store.createExecution('demo-wf-001', { type: 'completed' });
      const failed = await store.createExecution('demo-wf-001', { type: 'failed' });

      await store.updateExecution(running.id, { status: 'running' });
      await store.updateExecution(completed.id, { status: 'completed' });
      await store.updateExecution(failed.id, { status: 'failed' });

      const claimed = await store.claimExecutions('test-worker', 10);

      expect(claimed.length).toBe(1);
      expect((claimed[0] as any).id).toBe(pending.id);
    });

    it('respects retry scheduling', async () => {
      const readyToRetry = await store.createExecution('demo-wf-001', { type: 'retry' });
      const futureRetry = await store.createExecution('demo-wf-001', { type: 'future' });

      await store.updateExecution(readyToRetry.id, {
        status: 'retry_scheduled',
        nextRetryAt: new Date(Date.now() - 1000),
      });

      await store.updateExecution(futureRetry.id, {
        status: 'retry_scheduled',
        nextRetryAt: new Date(Date.now() + 60000),
      });

      const claimed = await store.claimExecutions('test-worker', 10);

      expect(claimed.length).toBe(1);
      expect((claimed[0] as any).id).toBe(readyToRetry.id);
    });
  });

  describe('Idempotency', () => {
    it('prevents duplicate execution creation with same idempotency key', async () => {
      const [exec1, exec2] = await Promise.all([
        store.createExecution('demo-wf-001', { test: true }, 'idem-key-123'),
        store.createExecution('demo-wf-001', { test: true }, 'idem-key-123'),
      ]);

      expect(exec1.id).toBe(exec2.id);
    });

    it('handles concurrent idempotency requests', async () => {
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          store.createExecution('demo-wf-001', { concurrent: true }, 'concurrent-idem')
        )
      );

      const uniqueIds = new Set(results.map((e: any) => e.id));
      expect(uniqueIds.size).toBe(1);
    });
  });

  describe('State Consistency', () => {
    it('maintains execution state during concurrent updates', async () => {
      const exec = await store.createExecution('demo-wf-001', { state: 'test' });

      const updates = Array.from({ length: 10 }, (_, i) =>
        store.updateExecution(exec.id, { retryCount: i })
      );

      await Promise.all(updates);

      const final = await store.getExecution(exec.id);
      expect(final?.retryCount).toBe(9);
    });

    it('preserves step results during concurrent access', async () => {
      const exec = await store.createExecution('demo-wf-001', { step: 'test' });

      const stepResults = Array.from({ length: 5 }, (_, i) =>
        store.addStepResult(exec.id, {
          stepId: 'test-step',
          status: 'completed' as const,
          startedAt: new Date(),
          completedAt: new Date(),
          output: { attempt: i },
          error: null,
          attempts: i + 1,
        })
      );

      await Promise.all(stepResults);

      const final = await store.getExecution(exec.id);
      expect(final?.steps.length).toBe(5);
    });
  });
});
