import type { FormsRuntime } from './process.js';
import { MemorySubmissionStore } from '../db/memory-store.js';

let runtime: FormsRuntime | null = null;

export function setRuntime(rt: FormsRuntime): void {
  runtime = rt;
}

export function getRuntime(): FormsRuntime {
  if (!runtime) {
    // Sensible default — useful for first-run / dev mode before user configures anything
    runtime = {
      store: new MemorySubmissionStore(),
      notificationDrivers: new Map(),
      feedHandlers: new Map(),
    };
  }
  return runtime;
}

export function isRuntimeConfigured(): boolean {
  return runtime !== null;
}
