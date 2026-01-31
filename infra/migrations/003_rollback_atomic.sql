-- ============================================================================
-- Rollback Migration for Atomic Claiming
-- Migration: 003_rollback_atomic.sql
-- ============================================================================
-- Use this if you need to rollback the atomic claiming function
-- WARNING: This will remove the atomic claiming capability
-- ============================================================================

-- Drop the atomic claiming function
DROP FUNCTION IF EXISTS claim_executions(UUID, INT);

-- Drop the stale lock release function
DROP FUNCTION IF EXISTS release_stale_locks(INT);

-- ============================================================================
-- Alternative: Simple polling without atomic claiming
-- This is less safe for multi-worker setups but works for single-worker
-- ============================================================================

-- Create simple non-atomic claim function (for rollback scenarios)
CREATE OR REPLACE FUNCTION claim_executions_simple(
    p_worker_id UUID,
    p_batch_size INT
)
RETURNS SETOF executions
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    UPDATE executions
    SET
        status = 'running',
        worker_id = p_worker_id,
        locked_at = NOW(),
        started_at = COALESCE(started_at, NOW()),
        updated_at = NOW()
    WHERE id IN (
        SELECT id
        FROM executions
        WHERE
            (status = 'pending')
            OR
            (status = 'retry_scheduled' AND next_retry_at <= NOW())
        ORDER BY created_at ASC
        LIMIT p_batch_size
        -- NO FOR UPDATE SKIP LOCKED - Race condition possible!
    )
    RETURNING *;
END;
$$;

-- ============================================================================
-- Migration Notes:
-- 
-- This rollback should only be used if:
-- 1. You're experiencing issues with the atomic claiming function
-- 2. You need to run on a database that doesn't support SKIP LOCKED
-- 3. You're debugging and need to isolate issues
--
-- WARNING: Without SKIP LOCKED, you may see:
-- - Duplicate execution processing with multiple workers
-- - Lost executions under high concurrency
-- - Race conditions during claiming
--
-- To re-apply the atomic claiming, run migration 002 again.
-- ============================================================================
