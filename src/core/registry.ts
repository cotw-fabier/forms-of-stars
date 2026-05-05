import type { FormDefinition } from '../types/index.js';

/**
 * Form registry. Pinned to globalThis for the same reason the server runtime
 * is (see ../server/runtime.ts): the integration's `astro:config:setup` hook
 * runs under Node's ESM loader (calling `registerForms`), while the auto-
 * injected API route is evaluated inside Vite's SSR module pipeline (calling
 * `getForm`). Those are separate module caches, so a plain module-level Map
 * gives each side its own copy and `getForm` returns undefined → 404
 * "Unknown form".
 */
const REGISTRY_KEY = '__forms_of_stars_registry__';

type GlobalWithRegistry = typeof globalThis & {
  [REGISTRY_KEY]?: Map<string, FormDefinition>;
};

function getRegistry(): Map<string, FormDefinition> {
  const g = globalThis as GlobalWithRegistry;
  if (!g[REGISTRY_KEY]) g[REGISTRY_KEY] = new Map();
  return g[REGISTRY_KEY]!;
}

export function registerForm(form: FormDefinition): void {
  const registry = getRegistry();
  const existing = registry.get(form.id);
  if (existing && existing !== form) {
    // Two distinct objects share an id. In dev, this is almost always Vite HMR
    // re-evaluating the form module — the source is unchanged but `defineForm`
    // produces a fresh reference. Replacing is the right move so the dev server
    // doesn't crash on every save. In production, modules evaluate once, so a
    // mismatched reference signals a real duplicate-id bug worth surfacing.
    if (process.env.NODE_ENV !== 'production') {
      registry.set(form.id, form);
      return;
    }
    throw new Error(
      `[forms-of-stars] Duplicate form id: "${form.id}". Form ids must be unique across the app.`,
    );
  }
  registry.set(form.id, form);
}

export function registerForms(forms: FormDefinition[]): void {
  for (const form of forms) registerForm(form);
}

export function getForm(id: string): FormDefinition | undefined {
  return getRegistry().get(id);
}

export function getAllForms(): FormDefinition[] {
  return Array.from(getRegistry().values());
}

export function clearRegistry(): void {
  getRegistry().clear();
}
