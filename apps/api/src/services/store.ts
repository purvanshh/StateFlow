/**
 * Store Facade (Shim)
 * Keeps backward compatibility while using the new modular storage architecture
 */

import { FileStore } from './storage/file-store.js';

// Re-export definitions (DEMO_WORKFLOW, TIMEOUT_WORKFLOW)
export * from './storage/definitions.js';

// Re-export types if needed
export * from './storage/types.js';

import { ExecutionStore } from './storage/types.js';

// Export singleton instance of the store
// This replaces the old 'export const demoStore = new DemoStore()'
export const demoStore: ExecutionStore = new FileStore();
