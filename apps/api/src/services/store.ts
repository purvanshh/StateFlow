import { SqlExecutionStore } from './storage/sql-store.js';
// import { FileStore } from './storage/file-store.js';

// Phase 5: Switched to SQL Store
export const demoStore = new SqlExecutionStore();

// load() is no-op for SQL store but safe to call
demoStore.load();
