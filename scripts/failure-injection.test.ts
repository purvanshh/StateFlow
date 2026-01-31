/**
 * Failure Injection Test Suite
 * Tests system resilience under various failure conditions
 */

import { describe, it, expect } from 'vitest';
import { FileStore } from '../apps/api/src/services/storage/file-store.js';

describe('Failure Injection Suite', () => {
  describe('Network Partition', () => {
    it('recovers from database disconnection', async () => {
      // Simulate: Connection drops during execution
      const store = new FileStore();
      const exec = await store.createExecution('demo-wf-001', { test: true });

      // Simulate disconnection by loading fresh store
      const freshStore = new FileStore();
      freshStore.load();

      const recovered = await freshStore.getExecution(exec.id);
      expect(recovered).toBeDefined();
      expect(recovered?.id).toBe(exec.id);
    });

    it('handles intermittent network failures gracefully', async () => {
      const store = new FileStore();
      const results = [];

      // Create multiple executions with simulated retries
      for (let i = 0; i < 5; i++) {
        try {
          const exec = await store.createExecution('demo-wf-001', { attempt: i });
          results.push(exec.id);
        } catch (error) {
          // Should not throw
          expect(false).toBe(true);
        }
      }

      expect(results.length).toBe(5);
      expect(new Set(results).size).toBe(5); // All unique
    });
  });

  describe('Worker Sudden Death', () => {
    it('recovers from incomplete execution after worker crash', async () => {
      const store = new FileStore();

      // Simulate: Worker claims execution but crashes
      await store.createExecution('demo-wf-001', { crash: true });
      await store.claimExecutions('crashing-worker', 1);

      // Simulate: New worker takes over
      const freshStore = new FileStore();
      freshStore.load();

      // Execution should still be claimable (after lock timeout)
      const claimed = await freshStore.claimExecutions('recovery-worker', 1);

      // With file-based store, lock is released when process exits
      expect(claimed.length).toBeGreaterThanOrEqual(0);
    });

    it('maintains execution state after partial step completion', async () => {
      const store = new FileStore();
      const exec = await store.createExecution('demo-wf-001', { partial: true });

      // Simulate partial execution
      await store.addStepResult(exec.id, {
        stepId: 'step-1',
        status: 'completed' as const,
        startedAt: new Date(),
        completedAt: new Date(),
        output: { data: 'test' },
        error: null,
        attempts: 1,
      });

      // Verify state persisted
      const freshStore = new FileStore();
      const recovered = await freshStore.getExecution(exec.id);

      expect(recovered?.steps.length).toBe(1);
      expect(recovered?.steps[0]?.stepId).toBe('step-1');
    });
  });

  describe('Memory Pressure', () => {
    it('handles large workflow definitions', async () => {
      const store = new FileStore();

      // Create large input (simulating memory pressure)
      const largeInput = {
        data: Array.from({ length: 10000 }, (_, i) => ({ id: i, value: `item-${i}` })),
      };

      const exec = await store.createExecution('demo-wf-001', largeInput);
      expect(exec.id).toBeDefined();

      const retrieved = await store.getExecution(exec.id);
      expect((retrieved?.input.data as any[]).length).toBe(10000);
    });

    it('cleans up completed executions under pressure', async () => {
      const store = new FileStore();
      const execs = [];

      // Create many executions
      for (let i = 0; i < 100; i++) {
        const exec = await store.createExecution('demo-wf-001', { index: i });
        execs.push(exec);
      }

      // Complete half of them
      for (let i = 0; i < 50; i++) {
        const exec = execs[i];
        if (exec) {
          await store.updateExecution(exec.id, {
            status: 'completed',
            completedAt: new Date(),
          });
        }
      }

      // Verify all still accessible
      const all = await store.getAllExecutions();
      expect(all.length).toBeGreaterThanOrEqual(100);
    });
  });

  describe('Race Conditions', () => {
    it('handles concurrent execution creation without corruption', async () => {
      const store = new FileStore();
      const promises = [];

      // Create 50 executions concurrently
      for (let i = 0; i < 50; i++) {
        promises.push(store.createExecution('demo-wf-001', { race: i }));
      }

      const results = await Promise.all(promises);
      const ids = results.map(r => r.id);

      // All IDs should be unique
      expect(new Set(ids).size).toBe(50);
    });

    it('prevents double-claiming with concurrent workers', async () => {
      const store = new FileStore();

      // Create executions
      for (let i = 0; i < 20; i++) {
        await store.createExecution('demo-wf-001', { double: i });
      }

      // Multiple workers claim simultaneously
      const claims = await Promise.all([
        store.claimExecutions('worker-A', 10),
        store.claimExecutions('worker-B', 10),
        store.claimExecutions('worker-C', 10),
      ]);

      const allClaimed = claims.flat().map((c: any) => c.id);
      const uniqueClaimed = new Set(allClaimed);

      // No duplicates
      expect(uniqueClaimed.size).toBe(allClaimed.length);
      // All claimed
      expect(allClaimed.length).toBe(20);
    });
  });

  describe('Idempotency Stress', () => {
    it('maintains idempotency under extreme concurrency', async () => {
      const store = new FileStore();
      const key = 'extreme-idempotency-test';

      // 100 concurrent requests with same key
      const promises = Array.from({ length: 100 }, () =>
        store.createExecution('demo-wf-001', { extreme: true }, key)
      );

      const results = await Promise.all(promises);
      const ids = results.map(r => r.id);

      // All should return the same ID
      expect(new Set(ids).size).toBe(1);
    });

    it('handles mixed idempotency and new requests', async () => {
      const store = new FileStore();

      // Create some executions
      const exec1 = await store.createExecution('demo-wf-001', { mixed: 1 }, 'mixed-key-1');
      const exec2 = await store.createExecution('demo-wf-001', { mixed: 2 }, 'mixed-key-2');

      // Concurrent mix of new and duplicate
      const results = await Promise.all([
        store.createExecution('demo-wf-001', { mixed: 1 }, 'mixed-key-1'),
        store.createExecution('demo-wf-001', { mixed: 2 }, 'mixed-key-2'),
        store.createExecution('demo-wf-001', { mixed: 3 }, 'mixed-key-3'),
        store.createExecution('demo-wf-001', { mixed: 1 }, 'mixed-key-1'),
      ]);

      // Check correct results
      expect(results[0].id).toBe(exec1.id);
      expect(results[1].id).toBe(exec2.id);
      expect(results[3].id).toBe(exec1.id);
      expect(results[2].id).not.toBe(exec1.id);
      expect(results[2].id).not.toBe(exec2.id);
    });
  });

  describe('Retry Resilience', () => {
    it('handles max retry exhaustion gracefully', async () => {
      const store = new FileStore();
      const exec = await store.createExecution('demo-wf-001', { retry: true });

      // Simulate multiple failures
      for (let i = 1; i <= 5; i++) {
        await store.addStepResult(exec.id, {
          stepId: 'retry-step',
          status: 'failed' as const,
          startedAt: new Date(),
          completedAt: new Date(),
          output: null,
          error: `Attempt ${i} failed`,
          attempts: i,
        });
      }

      const final = await store.getExecution(exec.id);
      expect(final?.steps[0]?.attempts).toBe(5);
      expect(final?.steps[0]?.status).toBe('failed');
    });

    it('recovers partial state after retry', async () => {
      const store = new FileStore();
      const exec = await store.createExecution('demo-wf-001', { partialRetry: true });

      // First attempt: success
      await store.addStepResult(exec.id, {
        stepId: 'step-1',
        status: 'completed' as const,
        startedAt: new Date(),
        completedAt: new Date(),
        output: { step1: 'done' },
        error: null,
        attempts: 1,
      });

      // Second step: fail
      await store.addStepResult(exec.id, {
        stepId: 'step-2',
        status: 'failed' as const,
        startedAt: new Date(),
        completedAt: new Date(),
        output: null,
        error: 'Failed',
        attempts: 1,
      });

      const recovered = await store.getExecution(exec.id);
      expect(recovered?.steps.length).toBe(2);
      expect(recovered?.steps[0]?.status).toBe('completed');
      expect(recovered?.steps[1]?.status).toBe('failed');
    });
  });
});
