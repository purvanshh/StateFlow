-- Atomic Claim Function (Supabase RPC)
-- This function atomically claims UP TO batch_size executions for a specific worker.
-- Uses FOR UPDATE SKIP LOCKED to ensure zero race conditions.

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
