import type { FormsRuntime } from './process.js';
import { MemorySubmissionStore } from '../db/memory-store.js';

// The runtime is pinned to globalThis rather than a module-scoped variable
// so it survives the multiple module-instance situation Astro creates: the
// integration's `astro:config:setup` hook runs under Node's ESM loader
// (writing `setRuntime`), while the auto-injected API route is evaluated
// inside Vite's SSR module pipeline (calling `getRuntime`). Those are two
// separate module caches; a plain `let runtime` would give each side its
// own copy, and the route side would silently fall back to an empty
// drivers Map ("No driver registered for type 'email'"). globalThis is
// shared across both, so all callers see the same runtime object.
const RUNTIME_KEY = '__forms_of_stars_runtime__';

type GlobalWithRuntime = typeof globalThis & {
  [RUNTIME_KEY]?: FormsRuntime;
};

export function setRuntime(rt: FormsRuntime): void {
  (globalThis as GlobalWithRuntime)[RUNTIME_KEY] = rt;
}

export function getRuntime(): FormsRuntime {
  const g = globalThis as GlobalWithRuntime;
  if (!g[RUNTIME_KEY]) {
    // Sensible default for first-run / dev before the integration has set up.
    g[RUNTIME_KEY] = {
      store: new MemorySubmissionStore(),
      notificationDrivers: new Map(),
      feedHandlers: new Map(),
    };
  }
  return g[RUNTIME_KEY]!;
}

export function isRuntimeConfigured(): boolean {
  return (globalThis as GlobalWithRuntime)[RUNTIME_KEY] !== undefined;
}
