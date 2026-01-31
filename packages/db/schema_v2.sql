-- Create workflows table for versioned definitions
CREATE TABLE IF NOT EXISTS workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  version INT NOT NULL,
  definition JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name, version)
);

-- Add workflow_version to executions to link to specific definition snapshot
ALTER TABLE executions ADD COLUMN IF NOT EXISTS workflow_version INT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_workflows_name_version ON workflows(name, version DESC);
