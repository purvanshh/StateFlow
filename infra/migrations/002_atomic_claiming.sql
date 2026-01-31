-- ============================================================================
-- Atomic Claim Function (Supabase RPC)
-- Migration: 002_atomic_claiming.sql
-- ============================================================================
-- This function atomically claims UP TO batch_size executions for a specific worker.
-- Uses FOR UPDATE SKIP LOCKED to ensure zero race conditions.
-- Critical for multi-worker safety - prevents duplicate processing.
-- ============================================================================

CREATE OR REPLACE FUNCTION claim_executions(
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
        FOR UPDATE SKIP LOCKED
    )
    RETURNING *;
END;
$$;

-- ============================================================================
-- Helper function to release stale locks
-- Run this periodically to clean up locks from crashed workers
-- ============================================================================
CREATE OR REPLACE FUNCTION release_stale_locks(
    stale_threshold_minutes INT DEFAULT 30
)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
    released_count INT := 0;
BEGIN
    UPDATE executions
    SET
        status = 'pending',
        worker_id = NULL,
        locked_at = NULL,
        updated_at = NOW()
    WHERE
        status = 'running'
        AND locked_at IS NOT NULL
        AND locked_at < NOW() - (stale_threshold_minutes || ' minutes')::INTERVAL;

    GET DIAGNOSTICS released_count = ROW_COUNT;
    RETURN released_count;
END;
$$;

-- Grant execute to service role (for API server)
-- Note: In Supabase, RPC functions are automatically available to authenticated clients
-- Adjust permissions based on your security requirements
