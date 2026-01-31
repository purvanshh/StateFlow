-- Phase 5 Execution Schema

-- 1. Executions Table (Primary State)
CREATE TABLE IF NOT EXISTS executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id TEXT NOT NULL,
    workflow_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, running, completed, failed, retry_scheduled, cancelled
    input JSONB DEFAULT '{}',
    output JSONB,
    error TEXT,
    
    -- State Tracking
    current_step_id TEXT,
    retry_count INT DEFAULT 0,
    next_retry_at TIMESTAMPTZ,
    
    -- Concurrency & Locking
    worker_id UUID,
    locked_at TIMESTAMPTZ,
    idempotency_key TEXT UNIQUE,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for Poll Performance
CREATE INDEX IF NOT EXISTS idx_executions_poll ON executions (status, next_retry_at, created_at) WHERE status IN ('pending', 'retry_scheduled');
CREATE INDEX IF NOT EXISTS idx_executions_idempotency ON executions (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_executions_workflow ON executions (workflow_name);

-- 2. Step Results (History)
CREATE TABLE IF NOT EXISTS step_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID REFERENCES executions(id) ON DELETE CASCADE,
    step_id TEXT NOT NULL,
    status TEXT NOT NULL, -- completed, failed
    output JSONB,
    error TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_ms INT,
    attempt INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_step_results_execution ON step_results (execution_id);

-- 3. Dead Letter Queue (DLQ)
CREATE TABLE IF NOT EXISTS dlq_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID REFERENCES executions(id) ON DELETE CASCADE,
    workflow_name TEXT,
    reason TEXT,
    payload JSONB, -- Initial input or state
    failed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Logs (Optional, for DB-based logging if moved from File)
-- We'll keep logs in a separate table if we want them durable
CREATE TABLE IF NOT EXISTS execution_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID REFERENCES executions(id) ON DELETE CASCADE,
    level TEXT NOT NULL, -- info, warn, error, debug
    message TEXT NOT NULL,
    step_id TEXT,
    metadata JSONB,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logs_execution ON execution_logs (execution_id);
