# StateFlow Architecture

## Overview

StateFlow is a workflow automation platform that allows users to define, execute, and monitor multi-step workflows with built-in retry policies, state management, and real-time logging.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER                               │
├─────────────────────────────────────────────────────────────────────┤
│  Next.js Web App (apps/web)                                         │
│  - Dashboard for workflow management                                 │
│  - Execution monitoring UI                                           │
│  - Workflow builder (future)                                         │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ HTTP/REST
┌───────────────────────────────▼─────────────────────────────────────┐
│                           API LAYER                                  │
├─────────────────────────────────────────────────────────────────────┤
│  Express API (apps/api)                                              │
│  ├── Routes: /workflows, /executions                                 │
│  ├── Middleware: auth, error handling                                │
│  └── Controllers: CRUD operations                                    │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐   ┌───────────────────┐   ┌───────────────────┐
│   Workflow    │   │   Background      │   │    Database       │
│   Engine      │   │   Workers         │   │    Layer          │
│ (packages/    │   │ (apps/api/        │   │ (packages/db)     │
│  workflows)   │◀──│  workers)         │──▶│                   │
└───────┬───────┘   └───────────────────┘   └─────────┬─────────┘
        │                                             │
        └─────────────────────┬───────────────────────┘
                              ▼
                    ┌─────────────────┐
                    │    Supabase     │
                    │   (PostgreSQL)  │
                    └─────────────────┘
```

## Data Flow

### 1. Workflow Creation
```
User → Next.js UI → POST /api/workflows → WorkflowRepository → Supabase
```

### 2. Workflow Execution
```
User clicks "Execute"
    ↓
POST /api/workflows/:id/execute
    ↓
Create execution record (status: pending)
    ↓
Return 202 Accepted
    ↓
Background Worker picks up pending execution
    ↓
WorkflowRunner.run(workflow, input)
    ↓
State Machine manages execution state
    ↓
StepExecutor runs each step with retry
    ↓
Update execution status on completion/failure
```

### 3. Execution Monitoring
```
Next.js UI → GET /api/executions/:id → Supabase → Return with logs/status
```

## Workflow Engine

### Core Components

**WorkflowRunner** (`packages/workflows/src/engine/runner.ts`)
- Orchestrates workflow execution
- Manages step sequencing
- Handles branching logic

**WorkflowStateMachine** (`packages/workflows/src/engine/state-machine.ts`)
- State: idle → running → completed/failed
- Tracks completed/failed steps
- Manages pause/resume/cancel

**StepExecutor** (`packages/workflows/src/engine/executor.ts`)
- Executes individual steps
- Applies retry policies
- Built-in step types: http, transform, delay, condition, log

**RetryPolicy** (`packages/workflows/src/engine/retry-policy.ts`)
- Exponential backoff
- Configurable max attempts
- Non-retryable error detection

## Database Schema

```
workflows
├── id (UUID)
├── name
├── description
├── definition (JSONB)
├── status (active/inactive/archived)
├── created_by
└── timestamps

executions
├── id (UUID)
├── workflow_id (FK)
├── status (pending/running/completed/failed/cancelled)
├── input (JSONB)
├── output (JSONB)
├── current_step
└── timestamps

execution_steps
├── id (UUID)
├── execution_id (FK)
├── step_id
├── status
├── attempt
├── input/output
└── timestamps

execution_logs
├── id (UUID)
├── execution_id (FK)
├── level (debug/info/warn/error)
├── message
└── metadata
```

## Scaling Considerations

### Current Design (MVP)
- Single worker process with configurable concurrency
- Database polling for job queue
- Suitable for ~1000 executions/hour

### Future Enhancements
1. **Redis-based Queue**: Replace DB polling with BullMQ
2. **Horizontal Scaling**: Multiple worker instances
3. **Workflow Versioning**: Version control for definitions
4. **Webhook Triggers**: External event-based execution
5. **Scheduled Workflows**: Cron-based triggers

## Security

- Row Level Security (RLS) enabled on all tables
- JWT-based auth via Supabase
- Service role for background workers
- Input validation with Zod schemas

## Error Handling

1. **Step-level**: Retry policy per step
2. **Execution-level**: Mark failed, allow manual retry
3. **API-level**: Global error middleware with logging
