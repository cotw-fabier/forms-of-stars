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

// Spam guard (honeypot, signed timestamp, rate limit)
export type {
  SpamConfig,
  ResolvedSpamConfig,
  RateLimiter,
  RateLimitResult,
} from './spam/index.js';
export {
  DEFAULT_SPAM_CONFIG,
  TIMESTAMP_FIELD,
  resolveSpamConfig,
  signTimestamp,
  verifyTimestamp,
  MemoryRateLimiter,
} from './spam/index.js';
export { getRenderSpamFields, type RenderSpamFields } from './spam/render.js';

// Default implementations
export { MemorySubmissionStore } from './db/memory-store.js';
export { WebhookDriver } from './notifications/webhook.js';
export { EmailDriver, type EmailMessage, type EmailSender } from './notifications/email.js';

// Runtime configuration — call from user code (middleware / API route) so the
// registry and drivers are wired up at server runtime, not just build time.
export { configureForms, type ConfigureFormsOptions } from './runtime/index.js';

import { registerForm as _registerForm } from './core/registry.js';

/**
 * Type-narrowing helper for defining forms with full IDE autocomplete.
 *
 * Forms are *also* registered in the module-scoped registry as a side
 * effect of being defined. The Astro integration registers forms in the
 * config-setup hook (which runs in the main build process), but Astro's
 * prerender worker is a separate Node context whose registry starts
 * empty. Auto-registering on define means a side-effect import of the
 * form module from any page (`import '../forms/contact';`) populates the
 * registry in that worker too. The registry is idempotent for the same
 * reference, so double-registration via both paths is safe.
 *
 *   export const contactForm = defineForm({ id: 'contact', ... });
 */
export function defineForm<T extends import('./types/index.js').FormDefinition>(form: T): T {
  _registerForm(form);
  return form;
}
