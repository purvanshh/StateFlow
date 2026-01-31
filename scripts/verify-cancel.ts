
// @ts-nocheck
// using global fetch

const API_URL = 'http://localhost:4000/api';

async function main() {
    try {
        console.log('🚀 Starting Cancel API Verification...');

        // 1. Create Execution (Timeout Workflow)
        console.log('1. Creating execution of timeout-workflow...');
        const createRes = await fetch(`${API_URL}/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workflowName: 'timeout-workflow', input: {} })
        });

        if (!createRes.ok) throw new Error(`Failed to create: ${createRes.statusText}`);
        const responseJson = (await createRes.json() as any);
        const id = responseJson.data.executionId;
        console.log(`   -> Created execution: ${id}`);

        // 2. Wait for it to start and reach delay step (1s)
        console.log('2. Waiting 1s for execution to start...');
        await new Promise(r => setTimeout(r, 1000));

        // 3. Check status (should be running)
        const checkRes = await fetch(`${API_URL}/executions/${id}`);
        const checkData = (await checkRes.json() as any).data;
        console.log(`   -> Current status: ${checkData.status} (Step: ${checkData.currentStepId})`);

        if (checkData.status !== 'running') {
            console.warn('⚠️ Execution is not running! It might have failed early.');
        }

        // 4. Cancel Execution
        console.log('3. Cancelling execution...');
        const cancelRes = await fetch(`${API_URL}/executions/${id}/cancel`, {
            method: 'POST'
        });

        if (!cancelRes.ok) throw new Error(`Failed to cancel: ${cancelRes.statusText}`);
        const cancelData = await cancelRes.json();
        console.log(`   -> Cancel response: ${JSON.stringify(cancelData)}`);

        // 5. Check status immediately
        const cancelCheckRes = await fetch(`${API_URL}/executions/${id}`);
        const cancelCheckData = (await cancelCheckRes.json() as any).data;
        console.log(`   -> Status after cancel: ${cancelCheckData.status}`);

        if (cancelCheckData.status !== 'cancelled') {
            throw new Error(`Expected status 'cancelled', got '${cancelCheckData.status}'`);
        }

        // 6. Wait to ensure it doesn't continue or complete (Wait longer than timeout)
        console.log('4. Waiting 3s to ensure it stays cancelled...');
        await new Promise(r => setTimeout(r, 3000));

        const finalCheckRes = await fetch(`${API_URL}/executions/${id}`);
        const finalCheckData = (await finalCheckRes.json() as any).data;
        console.log(`   -> Final status: ${finalCheckData.status}`);

        if (finalCheckData.status !== 'cancelled') {
            throw new Error(`Execution state changed after cancellation! (Expected 'cancelled', got '${finalCheckData.status}')`);
        }

        console.log('✅ Verification Passed!');

    } catch (error) {
        console.error('❌ Verification Failed:', error);
        process.exit(1);
    }
}

main();
