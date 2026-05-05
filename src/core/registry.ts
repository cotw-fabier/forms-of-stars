import type { FormDefinition } from '../types/index.js';

/**
 * Module-scoped form registry. Forms are registered at integration setup
 * and looked up by id at runtime.
 */
const registry = new Map<string, FormDefinition>();

export function registerForm(form: FormDefinition): void {
  if (registry.has(form.id)) {
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
  return registry.get(id);
}

export function getAllForms(): FormDefinition[] {
  return Array.from(registry.values());
}

export function clearRegistry(): void {
  registry.clear();
}
