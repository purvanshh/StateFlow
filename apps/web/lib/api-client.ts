const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface ApiOptions extends RequestInit {
    json?: unknown;
}

class ApiClient {
    private baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    private async request<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
        const { json, ...init } = options;

        const headers: HeadersInit = {
            'Content-Type': 'application/json',
            ...init.headers,
        };

        const config: RequestInit = {
            ...init,
            headers,
        };

        if (json) {
            config.body = JSON.stringify(json);
        }

        const response = await fetch(`${this.baseUrl}${endpoint}`, config);

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Request failed' }));
            throw new Error(error.message || `HTTP ${response.status}`);
        }

        return response.json();
    }

    get<T>(endpoint: string, options?: ApiOptions) {
        return this.request<T>(endpoint, { ...options, method: 'GET' });
    }

    post<T>(endpoint: string, data?: unknown, options?: ApiOptions) {
        return this.request<T>(endpoint, { ...options, method: 'POST', json: data });
    }

    put<T>(endpoint: string, data?: unknown, options?: ApiOptions) {
        return this.request<T>(endpoint, { ...options, method: 'PUT', json: data });
    }

    patch<T>(endpoint: string, data?: unknown, options?: ApiOptions) {
        return this.request<T>(endpoint, { ...options, method: 'PATCH', json: data });
    }

    delete<T>(endpoint: string, options?: ApiOptions) {
        return this.request<T>(endpoint, { ...options, method: 'DELETE' });
    }
}

export const api = new ApiClient(API_BASE);

// Workflow API methods
export const workflowsApi = {
    list: () => api.get('/api/workflows'),
    get: (id: string) => api.get(`/api/workflows/${id}`),
    create: (data: unknown) => api.post('/api/workflows', data),
    update: (id: string, data: unknown) => api.put(`/api/workflows/${id}`, data),
    delete: (id: string) => api.delete(`/api/workflows/${id}`),
    execute: (id: string, input?: unknown) => api.post(`/api/workflows/${id}/execute`, input),
};

export const executionsApi = {
    list: (workflowId?: string) =>
        api.get(`/api/executions${workflowId ? `?workflowId=${workflowId}` : ''}`),
    get: (id: string) => api.get(`/api/executions/${id}`),
    cancel: (id: string) => api.post(`/api/executions/${id}/cancel`),
};
