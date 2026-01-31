import 'dotenv/config';
import { app } from './app.js';
import { demoStore } from './services/store.js';
import { runWorkflowExecution } from './services/engine.js';

const PORT = process.env.API_PORT || 4000;
const HOST = process.env.API_HOST || 'localhost';
const POLL_INTERVAL = 1000;

// In-process worker for development (single process mode)
class InlineWorker {
  private isRunning = false;
  private activeExecutions = new Set<string>();

  async start() {
    this.isRunning = true;
    console.log('  ⚙️  Inline worker started (polling every 1s)\n');
    this.poll();
  }

  private async poll() {
    while (this.isRunning) {
      try {
        const pending = demoStore.getPendingExecutions(3);

        for (const execution of pending) {
          if (this.activeExecutions.has(execution.id)) continue;

          this.activeExecutions.add(execution.id);
          console.log(`\n📋 [Worker] Processing: ${execution.id}`);

          runWorkflowExecution(execution.id)
            .then(() => {
              const e = demoStore.getExecution(execution.id);
              const emoji = e?.status === 'completed' ? '✅' : '❌';
              console.log(`\n${emoji} [Worker] Finished: ${execution.id} (${e?.status})`);
            })
            .finally(() => {
              this.activeExecutions.delete(execution.id);
            });
        }
      } catch (error) {
        console.error('[Worker] Error:', error);
      }

      await new Promise(r => setTimeout(r, POLL_INTERVAL));
    }
  }
}

// Initialize store (seeds demo workflow)
console.log('\n');
demoStore; // Forces initialization

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🚀 StateFlow API Server                                     ║
║                                                               ║
║   API:     http://${HOST}:${PORT}                                  ║
║   Health:  http://${HOST}:${PORT}/api/health                       ║
║                                                               ║
║   📌 Quick Test:                                              ║
║   curl -X POST http://localhost:${PORT}/api/events \\            ║
║     -H "Content-Type: application/json" \\                     ║
║     -d '{"workflowName": "demo-workflow"}'                    ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);

  // Start inline worker
  const worker = new InlineWorker();
  worker.start();
});
