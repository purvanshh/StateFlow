#!/usr/bin/env node
import 'dotenv/config';
import http from 'http';

const API_HOST = process.env.API_HOST || 'localhost';
const API_PORT = process.env.API_PORT || 4000;
const BASE_URL = `http://${API_HOST}:${API_PORT}`;

async function request(method: string, path: string, body?: unknown) {
  const url = `${BASE_URL}${path}`;
  const options: http.RequestOptions = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  return new Promise<{ data: unknown; error?: string }>((resolve, reject) => {
    const req = http.request(url, options, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode && res.statusCode >= 400) {
            resolve({ data: parsed, error: parsed.error || 'Request failed' });
          } else {
            resolve({ data: parsed });
          }
        } catch {
          resolve({ data: data, error: 'Invalid JSON response' });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function main() {
  const command = process.argv[2];

  if (!command) {
    console.log(`
StateFlow CLI

Commands:
  list              List recent executions
  failed            List failed executions
  dlq               List dead letter queue
  status <id>       Get execution status and timeline
  cancel <id>       Cancel an execution
  retry <id>        Retry a failed execution from start
  retry-step <id>   Retry a failed execution from failed step
  health            Show worker health

Options:
  --help            Show this help
        `);
    return;
  }

  switch (command) {
    case 'list': {
      const result = await request('GET', '/api/executions?limit=20');
      if (result.error) {
        console.error('Error:', result.error);
        return;
      }
      const data = result.data as {
        data: Array<{
          id: string;
          workflowName: string;
          status: string;
          durationMs: number | null;
        }>;
      };
      console.log('\nRecent Executions:\n');
      console.log('ID'.padEnd(30) + 'Workflow'.padEnd(20) + 'Status'.padEnd(12) + 'Duration');
      console.log('-'.repeat(74));
      for (const e of data.data) {
        const duration = e.durationMs ? `${(e.durationMs / 1000).toFixed(2)}s` : '-';
        console.log(
          e.id.substring(0, 30).padEnd(30) +
            e.workflowName.substring(0, 20).padEnd(20) +
            e.status.padEnd(12) +
            duration
        );
      }
      break;
    }

    case 'failed': {
      const result = await request('GET', '/api/executions/failed');
      if (result.error) {
        console.error('Error:', result.error);
        return;
      }
      const data = result.data as {
        data: Array<{ id: string; workflowName: string; error: string | null; failedAt: string }>;
      };
      console.log('\nFailed Executions:\n');
      console.log('ID'.padEnd(30) + 'Workflow'.padEnd(20) + 'Failed At');
      console.log('-'.repeat(74));
      for (const e of data.data) {
        const failedAt = e.failedAt ? new Date(e.failedAt).toLocaleString() : '-';
        console.log(
          e.id.substring(0, 30).padEnd(30) + e.workflowName.substring(0, 20).padEnd(20) + failedAt
        );
        if (e.error) {
          console.log(`  Error: ${e.error.substring(0, 60)}`);
        }
      }
      break;
    }

    case 'dlq': {
      const result = await request('GET', '/api/metrics/dlq');
      if (result.error) {
        console.error('Error:', result.error);
        return;
      }
      const data = result.data as {
        data: Array<{
          id: string;
          executionId: string;
          workflowName: string;
          reason: string;
          failedAt: string;
        }>;
      };
      console.log('\nDead Letter Queue:\n');
      console.log('ID'.padEnd(30) + 'Workflow'.padEnd(20) + 'Reason');
      console.log('-'.repeat(74));
      for (const e of data.data) {
        console.log(
          e.id.substring(0, 30).padEnd(30) +
            e.workflowName.substring(0, 20).padEnd(20) +
            e.reason.substring(0, 30)
        );
      }
      break;
    }

    case 'status': {
      const id = process.argv[3];
      if (!id) {
        console.error('Usage: stateflow status <execution-id>');
        return;
      }
      const result = await request('GET', `/api/executions/${id}`);
      if (result.error) {
        console.error('Error:', result.error);
        return;
      }
      const data = result.data as {
        data: {
          id: string;
          workflowName: string;
          status: string;
          timeline: { durationMs: number | null };
          metrics: { completedSteps: number; failedSteps: number; totalRetries: number };
        };
      };
      const exec = data.data;
      console.log(`\nExecution: ${exec.id}`);
      console.log(`Workflow: ${exec.workflowName}`);
      console.log(`Status: ${exec.status}`);
      console.log(
        `Duration: ${exec.timeline.durationMs ? `${(exec.timeline.durationMs / 1000).toFixed(2)}s` : 'running...'}`
      );
      console.log(
        `Steps: ${exec.metrics.completedSteps} completed, ${exec.metrics.failedSteps} failed`
      );
      console.log(`Retries: ${exec.metrics.totalRetries}`);
      break;
    }

    case 'cancel': {
      const id = process.argv[3];
      if (!id) {
        console.error('Usage: stateflow cancel <execution-id>');
        return;
      }
      const result = await request('POST', `/api/executions/${id}/cancel`);
      if (result.error) {
        console.error('Error:', result.error);
        return;
      }
      console.log('Execution cancelled successfully');
      break;
    }

    case 'health': {
      const result = await request('GET', '/api/health');
      if (result.error) {
        console.error('Error:', result.error);
        return;
      }
      const data = result.data as {
        worker: { running: number; scheduled: number; dlqCount: number; memoryUsageMb: number };
        metrics: {
          totalExecutions: number;
          successfulExecutions: number;
          failedExecutions: number;
        };
      };
      console.log('\nWorker Health:\n');
      console.log(`Running: ${data.worker.running}`);
      console.log(`Scheduled: ${data.worker.scheduled}`);
      console.log(`DLQ Count: ${data.worker.dlqCount}`);
      console.log(`Memory: ${data.worker.memoryUsageMb} MB`);
      console.log('\nMetrics:');
      console.log(`Total Executions: ${data.metrics.totalExecutions}`);
      console.log(`Successful: ${data.metrics.successfulExecutions}`);
      console.log(`Failed: ${data.metrics.failedExecutions}`);
      break;
    }

    case 'retry': {
      const id = process.argv[3];
      if (!id) {
        console.error('Usage: stateflow retry <execution-id>');
        return;
      }
      const result = await request('POST', '/api/events', {
        workflowName: 'demo-workflow',
        idempotencyKey: `retry-${id}`,
      });
      if (result.error) {
        console.error('Error:', result.error);
        return;
      }
      const data = result.data as { data: { executionId: string } };
      console.log(`New execution started: ${data.data.executionId}`);
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run "stateflow --help" for available commands');
  }
}

main().catch(console.error);
