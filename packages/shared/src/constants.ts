// ============================================================================
// Application Constants
// ============================================================================

export const APP_NAME = 'StateFlow';
export const APP_VERSION = '0.1.0';

// ============================================================================
// API Constants
// ============================================================================

export const API_VERSION = 'v1';
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// ============================================================================
// Workflow Constants
// ============================================================================

export const WORKFLOW_STATUSES = ['active', 'inactive', 'archived'] as const;
export const EXECUTION_STATUSES = ['pending', 'running', 'completed', 'failed', 'cancelled'] as const;
export const STEP_STATUSES = ['pending', 'running', 'completed', 'failed', 'skipped'] as const;

export const STEP_TYPES = [
    'http',
    'transform',
    'delay',
    'condition',
    'log',
    'email',
    'webhook',
    'script',
] as const;

export const TRIGGER_TYPES = ['manual', 'schedule', 'webhook'] as const;

// ============================================================================
// Retry Constants
// ============================================================================

export const DEFAULT_MAX_RETRY_ATTEMPTS = 3;
export const DEFAULT_RETRY_DELAY_MS = 1000;
export const DEFAULT_BACKOFF_MULTIPLIER = 2;
export const MAX_RETRY_DELAY_MS = 60000;

// ============================================================================
// UI Constants
// ============================================================================

export const STATUS_COLORS = {
    active: '#22c55e',    // green
    inactive: '#6b7280',  // gray
    archived: '#9ca3af',  // light gray
    pending: '#f59e0b',   // amber
    running: '#3b82f6',   // blue
    completed: '#22c55e', // green
    failed: '#ef4444',    // red
    cancelled: '#6b7280', // gray
    skipped: '#9ca3af',   // light gray
} as const;

export const STATUS_LABELS = {
    active: 'Active',
    inactive: 'Inactive',
    archived: 'Archived',
    pending: 'Pending',
    running: 'Running',
    completed: 'Completed',
    failed: 'Failed',
    cancelled: 'Cancelled',
    skipped: 'Skipped',
} as const;
