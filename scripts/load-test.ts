import { SqlExecutionStore } from '../apps/api/src/services/storage/sql-store';

const store = new SqlExecutionStore();

async function runLoadTest() {
    const TOTAL_EXECUTIONS = 1000;
    const CONCURRENCY = 50;

    console.log(`Starting Load Test: ${TOTAL_EXECUTIONS} executions...`);

    const start = Date.now();
    const promises = [];

    for (let i = 0; i < TOTAL_EXECUTIONS; i++) {
        promises.push(
            store.createExecution('demo-workflow', {
                title: `Load Test ${i}`,
                body: `Payload for ${i}`
            }, `load-test-${Date.now()}-${i}`)
        );

        if (promises.length >= CONCURRENCY) {
            await Promise.all(promises);
            promises.length = 0;
            process.stdout.write('.');
        }
    }

    await Promise.all(promises);

    const duration = (Date.now() - start) / 1000;
    console.log(`\nCreated ${TOTAL_EXECUTIONS} executions in ${duration.toFixed(2)}s (${(TOTAL_EXECUTIONS / duration).toFixed(0)} req/s)`);
}

runLoadTest().catch(console.error);
