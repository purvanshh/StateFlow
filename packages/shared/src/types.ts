// ============================================================================
// Common Types across Frontend and Backend
// ============================================================================

// API Response wrapper
export interface ApiResponse<T> {
    data: T;
    error?: never;
}

export interface ApiError {
    data?: never;
    error: {
        message: string;
        code: string;
        details?: unknown;
    };
}

export type ApiResult<T> = ApiResponse<T> | ApiError;

// Pagination
export interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
}

export interface PaginationParams {
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

// User types (shared between Supabase auth and API)
export interface User {
    id: string;
    email: string;
    name?: string;
    avatarUrl?: string;
    createdAt: string;
}

// Workflow summary (for listing)
export interface WorkflowSummary {
    id: string;
    name: string;
    description?: string;
    status: 'active' | 'inactive' | 'archived';
    stepCount: number;
    lastExecutedAt?: string;
    createdAt: string;
    updatedAt: string;
}

// Execution summary (for listing)
export interface ExecutionSummary {
    id: string;
    workflowId: string;
    workflowName: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    startedAt?: string;
    completedAt?: string;
    duration?: number;
    createdAt: string;
}

// Filters
export interface WorkflowFilters {
    status?: 'active' | 'inactive' | 'archived';
    search?: string;
}

export interface ExecutionFilters {
    workflowId?: string;
    status?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    dateFrom?: string;
    dateTo?: string;
}
