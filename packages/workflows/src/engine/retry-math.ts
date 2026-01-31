/**
 * Calculate the next retry delay with Exponential Backoff and Jitter.
 * 
 * Formula: 
 * delay = min(base * 2^(attempt-1), maxDelay)
 * jitter = random(0, 0.2 * delay)
 * total = delay + jitter
 * 
 * Jitter prevents Thundering Herd problem.
 */
export function calculateNextDelay(
    attempt: number,
    baseDelayMs: number = 1000,
    maxDelayMs: number = 30000
): number {
    // Ensure attempt is at least 1
    const safeAttempt = Math.max(1, attempt);

    // Exponential backoff: base * 2 ^ (attempt - 1)
    const exponentialDelay = baseDelayMs * Math.pow(2, safeAttempt - 1);

    // Cap at maxDelay
    const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

    // Add 0-20% Jitter
    // Random float between 0 and 0.2
    const jitterFactor = Math.random() * 0.2;
    const jitter = cappedDelay * jitterFactor;

    return Math.floor(cappedDelay + jitter);
}
