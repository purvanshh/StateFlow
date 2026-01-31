export const DEMO_WORKFLOW = {
    name: 'demo-workflow',
    description: 'A demo workflow that fetches data and processes it with simulated failures',
    definition: {
        steps: [
            {
                id: 'start',
                type: 'log',
                name: 'Start Workflow',
                config: { message: '🚀 Starting demo workflow', level: 'info' },
                next: 'fetch-data',
            },
            {
                id: 'fetch-data',
                type: 'http',
                name: 'Fetch Sample Data',
                config: {
                    url: 'https://jsonplaceholder.typicode.com/posts/1',
                    method: 'GET',
                },
                next: 'process-data',
                retryPolicy: { maxAttempts: 3, delayMs: 1000, backoffMultiplier: 2 },
            },
            {
                id: 'process-data',
                type: 'transform',
                name: 'Process Data',
                config: {
                    mapping: {
                        title: 'fetch-data.data.title',
                        body: 'fetch-data.data.body',
                    },
                },
                next: 'check-result',
            },
            {
                id: 'check-result',
                type: 'condition',
                name: 'Check Result',
                config: {
                    field: 'fetch-data.statusCode',
                    operator: 'eq',
                    value: 200,
                    onTrue: 'success-log',
                    onFalse: 'failure-log',
                },
            },
            {
                id: 'success-log',
                type: 'log',
                name: 'Log Success',
                config: { message: '✅ Workflow completed successfully!', level: 'info' },
            },
            {
                id: 'failure-log',
                type: 'log',
                name: 'Log Failure',
                config: { message: '❌ Workflow failed - HTTP request unsuccessful', level: 'error' },
            },
        ],
        trigger: { type: 'manual' },
    },
    status: 'active' as const,
};

export const TIMEOUT_WORKFLOW = {
    name: 'timeout-workflow',
    description: 'A workflow that guarantees a timeout failure',
    definition: {
        steps: [
            {
                id: 'start',
                type: 'log',
                name: 'Start Timeout Test',
                config: { message: '🚀 Starting timeout test', level: 'info' },
                next: 'long-delay',
            },
            {
                id: 'long-delay',
                type: 'delay',
                name: 'Long Delay',
                config: { durationMs: 5000 }, // Sleep 5s
                timeoutMs: 2000,              // Timeout 2s
                retryPolicy: { maxAttempts: 2, delayMs: 500 },
                next: 'success',
            },
            {
                id: 'success',
                type: 'log',
                name: 'Should Not Reach Here',
                config: { message: '❌ Timeout failed to trigger!', level: 'error' },
            }
        ],
        trigger: { type: 'manual' },
    },
    status: 'active' as const,
};
