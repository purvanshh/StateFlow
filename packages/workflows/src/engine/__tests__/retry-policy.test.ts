import { describe, it, expect } from 'vitest';
import { createRetryPolicy, calculateDelay, shouldRetry, withRetry } from '../retry-policy.js';

describe('RetryPolicy', () => {
    describe('createRetryPolicy()', () => {
        it('should create default policy', () => {
            const policy = createRetryPolicy();
            expect(policy.maxAttempts).toBe(3);
            expect(policy.delayMs).toBe(1000);
            expect(policy.backoffMultiplier).toBe(2);
        });

        it('should allow custom overrides', () => {
            const policy = createRetryPolicy({ maxAttempts: 5, delayMs: 500 });
            expect(policy.maxAttempts).toBe(5);
            expect(policy.delayMs).toBe(500);
        });
    });

    describe('calculateDelay()', () => {
        it('should return base delay for first attempt', () => {
            const policy = createRetryPolicy({ delayMs: 1000 });
            expect(calculateDelay(policy, 1)).toBe(1000);
        });

        it('should apply exponential backoff', () => {
            const policy = createRetryPolicy({ delayMs: 1000, backoffMultiplier: 2 });
            expect(calculateDelay(policy, 1)).toBe(1000);
            expect(calculateDelay(policy, 2)).toBe(2000);
            expect(calculateDelay(policy, 3)).toBe(4000);
        });

        it('should respect maxDelayMs cap', () => {
            const policy = createRetryPolicy({
                delayMs: 1000,
                backoffMultiplier: 10,
                maxDelayMs: 5000,
            });
            expect(calculateDelay(policy, 5)).toBeLessThanOrEqual(5000);
        });
    });

    describe('shouldRetry()', () => {
        it('should return true when attempt < maxAttempts', () => {
            const policy = createRetryPolicy({ maxAttempts: 3 });
            expect(shouldRetry(policy, 1, new Error('Network error'))).toBe(true);
            expect(shouldRetry(policy, 2, new Error('Network error'))).toBe(true);
        });

        it('should return false when attempt >= maxAttempts', () => {
            const policy = createRetryPolicy({ maxAttempts: 3 });
            expect(shouldRetry(policy, 3, new Error('Network error'))).toBe(false);
            expect(shouldRetry(policy, 4, new Error('Network error'))).toBe(false);
        });

        it('should return false for non-retryable errors', () => {
            const policy = createRetryPolicy({ maxAttempts: 3 });
            expect(shouldRetry(policy, 1, new Error('UNAUTHORIZED'))).toBe(false);
            expect(shouldRetry(policy, 1, new Error('INVALID_INPUT'))).toBe(false);
            expect(shouldRetry(policy, 1, new Error('FORBIDDEN'))).toBe(false);
        });

        it('should return true for retryable errors', () => {
            const policy = createRetryPolicy({ maxAttempts: 3 });
            expect(shouldRetry(policy, 1, new Error('Network timeout'))).toBe(true);
            expect(shouldRetry(policy, 1, new Error('Connection refused'))).toBe(true);
        });
    });

    describe('withRetry()', () => {
        it('should return result on success', async () => {
            const policy = createRetryPolicy();
            const result = await withRetry(() => Promise.resolve('success'), policy);
            expect(result).toBe('success');
        });

        it('should retry on failure', async () => {
            const policy = createRetryPolicy({ maxAttempts: 3, delayMs: 10 });
            let attempts = 0;

            const result = await withRetry(() => {
                attempts++;
                if (attempts < 2) throw new Error('Temporary failure');
                return Promise.resolve('success');
            }, policy);

            expect(result).toBe('success');
            expect(attempts).toBe(2);
        });

        it('should throw after max attempts', async () => {
            const policy = createRetryPolicy({ maxAttempts: 2, delayMs: 10 });

            await expect(
                withRetry(() => Promise.reject(new Error('Always fails')), policy)
            ).rejects.toThrow('Always fails');
        });

        it('should call onRetry callback', async () => {
            const policy = createRetryPolicy({ maxAttempts: 3, delayMs: 10 });
            const retries: number[] = [];

            await expect(
                withRetry(
                    () => Promise.reject(new Error('Fails')),
                    policy,
                    (attempt) => retries.push(attempt)
                )
            ).rejects.toThrow();

            expect(retries).toEqual([1, 2]);
        });
    });
});
