import { describe, it, expect } from 'vitest';
import { calculateNextDelay } from '../retry-math.js';

describe('Retry Math', () => {
    describe('calculateNextDelay', () => {
        it('should calculate exponential backoff correctly', () => {
            // Attempt 1: 1000 * 2^0 = 1000
            const delay1 = calculateNextDelay(1, 1000, 30000);
            expect(delay1).toBeGreaterThanOrEqual(1000);
            expect(delay1).toBeLessThanOrEqual(1200); // Allow 20% jitter
        });

        it('should double the delay for next attempt', () => {
            // Attempt 2: 1000 * 2^1 = 2000
            const delay2 = calculateNextDelay(2, 1000, 30000);
            expect(delay2).toBeGreaterThanOrEqual(2000);
            expect(delay2).toBeLessThanOrEqual(2400); // 2000 + 20%
        });

        it('should respect max delay cap', () => {
            // High attempt to force cap
            const delay = calculateNextDelay(10, 1000, 5000);
            expect(delay).toBeLessThanOrEqual(6000); // 5000 + 20% jitter
            expect(delay).toBeGreaterThanOrEqual(5000);
        });

        it('should apply randomness (jitter)', () => {
            const delays = new Set();
            for (let i = 0; i < 50; i++) {
                delays.add(calculateNextDelay(2, 1000, 30000));
            }
            // Should have multiple different values due to jitter
            expect(delays.size).toBeGreaterThan(1);
        });

        it('should handle invalid inputs gracefully', () => {
            expect(calculateNextDelay(0, 1000, 30000)).toBeGreaterThan(0);
            expect(calculateNextDelay(-1, 1000, 30000)).toBeGreaterThan(0);
        });
    });
});
