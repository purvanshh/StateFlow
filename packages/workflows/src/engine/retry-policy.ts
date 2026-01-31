import type { RetryPolicy } from '../types.js';

const DEFAULT_RETRY_POLICY: RetryPolicy = {
    maxAttempts: 3,
    delayMs: 1000,
    backoffMultiplier: 2,
    maxDelayMs: 30000,
};

export function createRetryPolicy(custom?: Partial<RetryPolicy>): RetryPolicy {
    return { ...DEFAULT_RETRY_POLICY, ...custom };
}

export function calculateDelay(policy: RetryPolicy, attempt: number): number {
    const multiplier = policy.backoffMultiplier ?? 1;
    const delay = policy.delayMs * Math.pow(multiplier, attempt - 1);

    if (policy.maxDelayMs) {
        return Math.min(delay, policy.maxDelayMs);
    }

    return delay;
}

export function shouldRetry(
    policy: RetryPolicy,
    attempt: number,
    error: Error
): boolean {
    // Check if we've exceeded max attempts
    if (attempt >= policy.maxAttempts) {
        return false;
    }

    // Check if error is retryable (can be extended)
    if (isNonRetryableError(error)) {
        return false;
    }

    return true;
}

function isNonRetryableError(error: Error): boolean {
    // Define errors that should not trigger retry
    const nonRetryablePatterns = [
        'INVALID_INPUT',
        'UNAUTHORIZED',
        'FORBIDDEN',
        'NOT_FOUND',
        'VALIDATION_ERROR',
    ];

    return nonRetryablePatterns.some(
        pattern => error.message.includes(pattern) || error.name.includes(pattern)
    );
}

export async function withRetry<T>(
    fn: () => Promise<T>,
    policy: RetryPolicy,
    onRetry?: (attempt: number, error: Error, delayMs: number) => void
): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (!shouldRetry(policy, attempt, lastError)) {
                throw lastError;
            }

            if (attempt < policy.maxAttempts) {
                const delay = calculateDelay(policy, attempt);
                onRetry?.(attempt, lastError, delay);
                await sleep(delay);
            }
        }
    }

    throw lastError ?? new Error('Retry failed');
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
