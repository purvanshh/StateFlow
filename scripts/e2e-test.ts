
// @ts-nocheck
const API_URL = 'http://localhost:4000/api';

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runBasicTest() {
    console.log('\n🔵 [Test 1] Basic Execution Success');

    // Trigger
    const res = await fetch(`${API_URL}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowName: 'demo-workflow', input: { foo: 'bar' } })
    });

    if (!res.ok) throw new Error(`Trigger failed: ${res.statusText}`);
    const { data: { executionId } } = await res.json();
    console.log(`   -> Started: ${executionId}`);

    // Poll for completion
    let status = 'pending';
    let attempts = 0;
    while (status !== 'completed' && status !== 'failed' && attempts < 10) {
        await sleep(1000);
        const check = await fetch(`${API_URL}/executions/${executionId}`);
        const data = (await check.json()).data;
        status = data.status;
        console.log(`   -> Poll: ${status}`);
        attempts++;
    }

    if (status !== 'completed') {
        throw new Error(`Expected completed, got ${status}`);
    }
    console.log('✅ Basic Test Passed');
}

async function runCancelTest() {
    console.log('\n🔵 [Test 2] Cancel Execution');

    // Trigger
    const res = await fetch(`${API_URL}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowName: 'timeout-workflow', input: {} })
    });

    if (!res.ok) throw new Error(`Trigger failed: ${res.statusText}`);
    const { data: { executionId } } = await res.json();
    console.log(`   -> Started: ${executionId}`);

    // Wait for start
    await sleep(1000);

    // Cancel
    const cancelRes = await fetch(`${API_URL}/executions/${executionId}/cancel`, { method: 'POST' });
    if (!cancelRes.ok) throw new Error('Cancel failed');
    console.log('   -> Cancelled');

    // Check immediate status
    const check1 = await fetch(`${API_URL}/executions/${executionId}`);
    const status1 = (await check1.json()).data.status;
    if (status1 !== 'cancelled') throw new Error(`Immediate status check failed: ${status1}`);

    // Wait for potential race condition (retry overwrite)
    await sleep(3000);

    const check2 = await fetch(`${API_URL}/executions/${executionId}`);
    const status2 = (await check2.json()).data.status;

    if (status2 !== 'cancelled') {
        throw new Error(`Status changed after cancellation! Got: ${status2}`);
    }
    console.log('✅ Cancel Test Passed');
}

async function main() {
    try {
        console.log('🚀 Starting E2E Suite...');
        await runBasicTest();
        await runCancelTest();
        console.log('\n🎉 ALL TESTS PASSED');
    } catch (e) {
        console.error('\n❌ TEST FAILED:', e);
        process.exit(1);
    }
}

main();
