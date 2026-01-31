import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowStateMachine } from '../state-machine.js';

describe('WorkflowStateMachine', () => {
    let stateMachine: WorkflowStateMachine;

    beforeEach(() => {
        stateMachine = new WorkflowStateMachine();
    });

    describe('initial state', () => {
        it('should start with idle machine state', () => {
            expect(stateMachine.getState()).toBe('idle');
        });

        it('should have pending execution status', () => {
            expect(stateMachine.getContext().status).toBe('pending');
        });

        it('should have empty completed steps', () => {
            expect(stateMachine.getContext().completedSteps.size).toBe(0);
        });
    });

    describe('START event', () => {
        it('should transition to running state', () => {
            stateMachine.transition({ type: 'START', input: {} });
            expect(stateMachine.getState()).toBe('running');
        });

        it('should set execution status to running', () => {
            stateMachine.transition({ type: 'START', input: {} });
            expect(stateMachine.getContext().status).toBe('running');
        });

        it('should store input in context state', () => {
            stateMachine.transition({ type: 'START', input: { foo: 'bar' } });
            expect(stateMachine.getContext().state).toEqual({ foo: 'bar' });
        });
    });

    describe('STEP_COMPLETED event', () => {
        beforeEach(() => {
            stateMachine.transition({ type: 'START', input: {} });
        });

        it('should add step to completed steps', () => {
            stateMachine.transition({ type: 'STEP_COMPLETED', stepId: 'step-1', output: {} });
            expect(stateMachine.getContext().completedSteps.has('step-1')).toBe(true);
        });

        it('should merge output into state', () => {
            stateMachine.transition({ type: 'STEP_COMPLETED', stepId: 'step-1', output: { result: 42 } });
            expect(stateMachine.getContext().state.result).toBe(42);
        });
    });

    describe('STEP_FAILED event', () => {
        beforeEach(() => {
            stateMachine.transition({ type: 'START', input: {} });
        });

        it('should add step to failed steps', () => {
            stateMachine.transition({ type: 'STEP_FAILED', stepId: 'step-1', error: new Error('Test') });
            expect(stateMachine.getContext().failedSteps.has('step-1')).toBe(true);
        });

        it('should transition to failed state', () => {
            stateMachine.transition({ type: 'STEP_FAILED', stepId: 'step-1', error: new Error('Test') });
            expect(stateMachine.getState()).toBe('failed');
        });

        it('should track attempt count', () => {
            stateMachine.transition({ type: 'STEP_FAILED', stepId: 'step-1', error: new Error('Test') });
            stateMachine.transition({ type: 'STEP_FAILED', stepId: 'step-1', error: new Error('Test 2') });
            expect(stateMachine.getContext().failedSteps.get('step-1')?.attempts).toBe(2);
        });
    });

    describe('PAUSE and RESUME events', () => {
        beforeEach(() => {
            stateMachine.transition({ type: 'START', input: {} });
        });

        it('should transition to paused state on PAUSE', () => {
            stateMachine.transition({ type: 'PAUSE' });
            expect(stateMachine.getState()).toBe('paused');
        });

        it('should transition back to running on RESUME', () => {
            stateMachine.transition({ type: 'PAUSE' });
            stateMachine.transition({ type: 'RESUME' });
            expect(stateMachine.getState()).toBe('running');
        });
    });

    describe('terminal states', () => {
        beforeEach(() => {
            stateMachine.transition({ type: 'START', input: {} });
        });

        it('should not change once completed', () => {
            stateMachine.markCompleted();
            stateMachine.transition({ type: 'PAUSE' }); // Should have no effect
            expect(stateMachine.getState()).toBe('completed');
        });

        it('should not change once failed', () => {
            stateMachine.transition({ type: 'STEP_FAILED', stepId: 'step-1', error: new Error('Test') });
            stateMachine.transition({ type: 'RESUME' }); // Should have no effect
            expect(stateMachine.getState()).toBe('failed');
        });
    });

    describe('canRetry()', () => {
        it('should return true when step has not failed', () => {
            expect(stateMachine.canRetry('step-1', 3)).toBe(true);
        });

        it('should return true when attempts < maxAttempts', () => {
            stateMachine.transition({ type: 'START', input: {} });
            stateMachine.transition({ type: 'STEP_FAILED', stepId: 'step-1', error: new Error('Test') });
            expect(stateMachine.canRetry('step-1', 3)).toBe(true); // 1 attempt < 3
        });

        it('should return false when attempts >= maxAttempts', () => {
            stateMachine.transition({ type: 'START', input: {} });
            for (let i = 0; i < 3; i++) {
                stateMachine.transition({ type: 'STEP_FAILED', stepId: 'step-1', error: new Error('Test') });
            }
            expect(stateMachine.canRetry('step-1', 3)).toBe(false);
        });
    });
});
