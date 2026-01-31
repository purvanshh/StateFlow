import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function seed() {
    console.log('🌱 Starting database seed...\n');

    // Sample workflows
    const workflows = [
        {
            name: 'Welcome Email Workflow',
            description: 'Sends a welcome email when a new user signs up',
            definition: {
                steps: [
                    {
                        id: 'log-start',
                        type: 'log',
                        name: 'Log Start',
                        config: { message: 'Starting welcome email workflow', level: 'info' },
                        next: 'fetch-user',
                    },
                    {
                        id: 'fetch-user',
                        type: 'http',
                        name: 'Fetch User Details',
                        config: {
                            url: 'https://jsonplaceholder.typicode.com/users/1',
                            method: 'GET',
                        },
                        next: 'send-email',
                        retryPolicy: { maxAttempts: 3, delayMs: 1000 },
                    },
                    {
                        id: 'send-email',
                        type: 'log',
                        name: 'Send Email (Mock)',
                        config: { message: 'Email sent to user', level: 'info' },
                    },
                ],
                trigger: { type: 'manual' },
            },
            status: 'active',
        },
        {
            name: 'Data Sync Workflow',
            description: 'Syncs data between two APIs on a schedule',
            definition: {
                steps: [
                    {
                        id: 'fetch-source',
                        type: 'http',
                        name: 'Fetch Source Data',
                        config: {
                            url: 'https://jsonplaceholder.typicode.com/posts',
                            method: 'GET',
                        },
                        next: 'transform',
                        retryPolicy: { maxAttempts: 3, delayMs: 2000, backoffMultiplier: 2 },
                    },
                    {
                        id: 'transform',
                        type: 'transform',
                        name: 'Transform Data',
                        config: { mapping: { posts: 'fetch-source.data' } },
                        next: 'log-complete',
                    },
                    {
                        id: 'log-complete',
                        type: 'log',
                        name: 'Log Completion',
                        config: { message: 'Data sync completed', level: 'info' },
                    },
                ],
                trigger: { type: 'schedule', config: { cron: '0 * * * *' } },
            },
            status: 'active',
        },
        {
            name: 'Conditional Branching Example',
            description: 'Demonstrates conditional logic in workflows',
            definition: {
                steps: [
                    {
                        id: 'check-condition',
                        type: 'condition',
                        name: 'Check Value',
                        config: {
                            field: 'input.value',
                            operator: 'gt',
                            value: 100,
                            onTrue: 'high-value-path',
                            onFalse: 'low-value-path',
                        },
                    },
                    {
                        id: 'high-value-path',
                        type: 'log',
                        config: { message: 'High value detected!', level: 'info' },
                    },
                    {
                        id: 'low-value-path',
                        type: 'log',
                        config: { message: 'Low value detected', level: 'info' },
                    },
                ],
                trigger: { type: 'manual' },
            },
            status: 'active',
        },
    ];

    // Insert workflows
    console.log('📝 Inserting sample workflows...');

    for (const workflow of workflows) {
        const { data, error } = await supabase
            .from('workflows')
            .insert(workflow)
            .select()
            .single();

        if (error) {
            console.error(`❌ Failed to insert "${workflow.name}":`, error.message);
        } else {
            console.log(`✅ Created workflow: ${data.name} (${data.id})`);
        }
    }

    console.log('\n🎉 Seed completed!');
}

seed().catch(console.error);
