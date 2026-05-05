/**
 * forms-of-stars
 *
 * Schema-driven forms for Astro. Inspired by Gravity Forms.
 */

// Core types
export type {
  FormDefinition,
  FieldDefinition,
  FieldType,
  FieldOption,
  ConditionalLogic,
  ConditionalLogicRule,
  Confirmation,
  NotificationDefinition,
  FeedDefinition,
  Submission,
  SubmissionStatus,
  SubmissionStore,
  NotificationDriver,
  FeedHandler,
  FormSchema,
} from './types/index.js';

// Helpers
export { buildFormSchema } from './validators/schema.js';
export { evaluateConditional } from './core/conditional.js';
export { renderMergeTags, renderMergeTagsRecord } from './core/merge-tags.js';
export { registerForm, registerForms, getForm, getAllForms } from './core/registry.js';

// Default implementations
export { MemorySubmissionStore } from './db/memory-store.js';
export { WebhookDriver } from './notifications/webhook.js';
export { EmailDriver, type EmailMessage, type EmailSender } from './notifications/email.js';

/**
 * Type-narrowing helper for defining forms with full IDE autocomplete.
 *
 *   export const contactForm = defineForm({ id: 'contact', ... });
 */
export function defineForm<T extends import('./types/index.js').FormDefinition>(form: T): T {
  return form;
}
