/**
 * Runtime configuration entry point.
 *
 * Wires up the form registry, submission store, and notification / feed
 * drivers from plain user code that gets bundled into the SSR output. Call
 * this at module init from a file that's imported by your middleware (so
 * the runtime is configured before any server-island endpoint or API
 * route handles a request):
 *
 *   // src/forms/runtime.ts
 *   import { configureForms } from 'forms-of-stars/runtime';
 *   import sgMail from '@sendgrid/mail';
 *   import { reservationForm } from './reservation';
 *
 *   if (process.env.SENDGRID_API_KEY) sgMail.setApiKey(process.env.SENDGRID_API_KEY);
 *
 *   configureForms({
 *     forms: [reservationForm],
 *     emailSender: async ({ to, from, replyTo, subject, body, bodyType }) => {
 *       await sgMail.send({ to, from, replyTo, subject,
 *         [bodyType === 'html' ? 'html' : 'text']: body });
 *     },
 *   });
 *
 *   // src/middleware.ts
 *   import './forms/runtime';
 *   export const onRequest = (_, next) => next();
 *
 * Calling `configureForms` more than once is safe — later calls merge into
 * the existing runtime so the user can split configuration across files.
 */
import type {
  FeedHandler,
  FormDefinition,
  NotificationDriver,
  SubmissionStore,
} from '../types/index.js';
import { registerForms } from '../core/registry.js';
import { setRuntime, getRuntime } from '../server/runtime.js';
import { MemorySubmissionStore } from '../db/memory-store.js';
import { WebhookDriver } from '../notifications/webhook.js';
import { EmailDriver, type EmailSender } from '../notifications/email.js';
import { MemoryRateLimiter, type SpamConfig, type RateLimiter } from '../spam/index.js';

export interface ConfigureFormsOptions {
  /** Forms to register. `defineForm` already registers as a side effect, but
   *  passing them here makes the dependency explicit and order-independent. */
  forms?: FormDefinition[];

  /** Submission store. Defaults to in-memory (volatile, fine for dev). */
  store?: SubmissionStore;

  /** Function that sends an email — wires up the built-in `email` driver. */
  emailSender?: EmailSender;

  /** Additional notification drivers, keyed by their `type`. */
  notificationDrivers?: NotificationDriver[];

  /** Feed handlers (Stripe, Mailchimp, etc.), keyed by `name`. */
  feedHandlers?: FeedHandler[];

  /** Spam-guard global defaults. Per-form `form.spam` overrides individual
   *  fields. Pin `spam.secret` (or set `FORMS_OF_STARS_SECRET`) for multi-
   *  instance deploys; otherwise each instance signs with its own random
   *  secret and tokens won't verify across instances. */
  spam?: SpamConfig;

  /** Pluggable rate-limit store. Defaults to an in-memory limiter — fine
   *  for single-process deploys; swap for a shared store (Redis, KV) if
   *  you have multiple instances. */
  rateLimiter?: RateLimiter;

  /** Optional logger — defaults to console. */
  logger?: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };
}

const CONFIGURED_KEY = '__forms_of_stars_configured__';

type GlobalWithFlag = typeof globalThis & { [CONFIGURED_KEY]?: true };

export function configureForms(options: ConfigureFormsOptions): void {
  if (options.forms?.length) registerForms(options.forms);

  const existing = getRuntime();

  // Merge drivers/handlers into the existing maps so multiple `configureForms`
  // calls compose. Webhook driver is included by default the first time only.
  const flag = globalThis as GlobalWithFlag;
  if (!flag[CONFIGURED_KEY]) {
    existing.notificationDrivers.set('webhook', new WebhookDriver());
    flag[CONFIGURED_KEY] = true;
  }

  if (options.emailSender) {
    existing.notificationDrivers.set('email', new EmailDriver(options.emailSender));
  }
  for (const driver of options.notificationDrivers ?? []) {
    existing.notificationDrivers.set(driver.type, driver);
  }
  for (const handler of options.feedHandlers ?? []) {
    existing.feedHandlers.set(handler.name, handler);
  }

  setRuntime({
    store: options.store ?? existing.store ?? new MemorySubmissionStore(),
    notificationDrivers: existing.notificationDrivers,
    feedHandlers: existing.feedHandlers,
    spam: options.spam ?? existing.spam,
    rateLimiter: options.rateLimiter ?? existing.rateLimiter ?? new MemoryRateLimiter(),
    logger: options.logger ?? existing.logger,
  });
}
