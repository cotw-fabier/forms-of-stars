/**
 * Server-side submission pipeline.
 *
 *   1. parse FormData / JSON
 *   2. honeypot check
 *   3. zod validation
 *   4. compute ecommerce total (if applicable)
 *   5. insert submission record
 *   6. fire notifications (with conditionals)
 *   7. run feeds (with conditionals) — feeds may request a redirect (e.g. Stripe Checkout)
 *   8. resolve confirmation
 */

import type {
  FormDefinition,
  NotificationDriver,
  Submission,
  SubmissionStore,
  FeedHandler,
  Confirmation,
} from '../types/index.js';
import { buildFormSchema } from '../validators/schema.js';
import { evaluateConditional } from '../core/conditional.js';
import {
  resolveSpamConfig,
  verifyTimestamp,
  TIMESTAMP_FIELD,
  type SpamConfig,
  type RateLimiter,
} from '../spam/index.js';

export interface FormsRuntime {
  store: SubmissionStore;
  notificationDrivers: Map<string, NotificationDriver>;
  feedHandlers: Map<string, FeedHandler>;
  /** Global spam-guard defaults — merged under per-form `form.spam`. */
  spam?: SpamConfig;
  /** Pluggable rate-limit store. Defaults to an in-memory limiter. */
  rateLimiter?: RateLimiter;
  /** Optional logger — defaults to console. Compatible with Astro's logger. */
  logger?: { info: (message: string) => void; warn: (message: string) => void; error: (message: string) => void };
}

export interface ProcessedResult {
  ok: boolean;
  /** When ok=false, a map of fieldId → error message */
  errors?: Record<string, string>;
  submission?: Submission;
  /** Resolved confirmation — message or redirect target */
  confirmation?: Confirmation;
  /** A feed (e.g. Stripe) requested a redirect that takes precedence over confirmation */
  redirect?: string;
  /** Override the response status (e.g. 429 for rate limiting). */
  status?: number;
  /** Suggested Retry-After header value, in seconds. */
  retryAfter?: number;
}

/**
 * Convert FormData into a plain object, collapsing single-value entries
 * to scalars and grouping repeats into arrays.
 */
function formDataToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of fd.entries()) {
    const val = value instanceof File ? value : String(value);
    if (key in out) {
      const prev = out[key];
      if (Array.isArray(prev)) prev.push(val);
      else out[key] = [prev, val];
    } else {
      out[key] = val;
    }
  }
  return out;
}

function computeEcommerceTotal(form: FormDefinition, data: Record<string, unknown>): number | undefined {
  if (!form.isEcommerce) return undefined;
  let total = 0;
  for (const field of form.fields) {
    if (field.type === 'product' && typeof field.price === 'number') {
      // companion quantity field convention: same id + "_qty"
      const qty = Number(data[`${field.id}_qty`] ?? 1);
      total += field.price * (Number.isFinite(qty) ? qty : 1);
    }
    if (field.type === 'price') {
      total += Number(data[field.id] ?? 0);
    }
  }
  // minor units (cents) — round to avoid float drift
  return Math.round(total * 100);
}

export async function processSubmission(
  form: FormDefinition,
  request: Request,
  runtime: FormsRuntime,
): Promise<ProcessedResult> {
  const log = runtime.logger ?? console;

  // ── 1. parse payload ───────────────────────────────────────────────────
  const contentType = request.headers.get('content-type') ?? '';
  let data: Record<string, unknown>;
  if (contentType.includes('application/json')) {
    data = (await request.json()) as Record<string, unknown>;
  } else {
    data = formDataToObject(await request.formData());
  }

  // ── 2. spam guard (honeypot, timestamp, rate limit) ───────────────────
  const spam = resolveSpamConfig(form.spam, form.honeypot, runtime.spam, form.fields);
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('cf-connecting-ip')
    ?? 'unknown';

  if (spam) {
    // Honeypot — silent success so bots don't learn what tripped them.
    if (spam.honeypot && data[spam.honeypot]) {
      log.warn(`[forms-of-stars] Honeypot triggered on form "${form.id}" — silently dropping`);
      return { ok: true, confirmation: { type: 'message', message: 'Thanks!' } };
    }

    // Time-to-submit token. Same silent-success treatment so attackers can't
    // probe the bounds. Skip entirely when both windows are off (e.g. the
    // consumer disabled timestamp checking but kept the honeypot).
    if (spam.minSubmitMs !== null || spam.maxSubmitMs !== null) {
      const verdict = verifyTimestamp(data[TIMESTAMP_FIELD], spam.secret, spam.minSubmitMs, spam.maxSubmitMs);
      if (!verdict.ok) {
        log.warn(`[forms-of-stars] Timestamp check failed (${verdict.reason}) on form "${form.id}" from ${clientIp}`);
        return { ok: true, confirmation: { type: 'message', message: 'Thanks!' } };
      }
    }

    // Per-IP rate limit. Unlike the silent layers above, we surface this as
    // a 429 so a real user retrying doesn't see a fake success.
    if (spam.rateLimit && runtime.rateLimiter) {
      const verdict = await runtime.rateLimiter.check(
        `${form.id}:${clientIp}`,
        spam.rateLimit.max,
        spam.rateLimit.windowMs,
      );
      if (!verdict.ok) {
        log.warn(`[forms-of-stars] Rate limit hit on form "${form.id}" from ${clientIp}`);
        return {
          ok: false,
          status: 429,
          retryAfter: Math.ceil(verdict.retryAfterMs / 1000),
          errors: { _form: 'Too many submissions — please try again in a moment.' },
        };
      }
    }
  }

  // ── 3. validation ──────────────────────────────────────────────────────
  const schema = buildFormSchema(form);
  const parsed = await schema.safeParseAsync(data);

  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const fieldId = String(issue.path[0] ?? '_form');
      // first error per field wins
      if (!errors[fieldId]) errors[fieldId] = issue.message;
    }
    return { ok: false, errors };
  }

  const cleanData = parsed.data;

  // ── 4. ecommerce total ────────────────────────────────────────────────
  const amountTotal = computeEcommerceTotal(form, cleanData);

  // ── 5. store ──────────────────────────────────────────────────────────
  const meta = {
    ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? request.headers.get('cf-connecting-ip')
      ?? undefined,
    userAgent: request.headers.get('user-agent') ?? undefined,
    referrer: request.headers.get('referer') ?? undefined,
  };

  const submission = await runtime.store.insert({
    formId: form.id,
    data: cleanData,
    status: form.isEcommerce ? 'awaiting_payment' : 'completed',
    meta,
    amountTotal,
    currency: form.currency,
  });

  // ── 6. notifications ──────────────────────────────────────────────────
  for (const notification of form.notifications ?? []) {
    if (!evaluateConditional(notification.conditional, cleanData)) continue;
    const driver = runtime.notificationDrivers.get(notification.type);
    if (!driver) {
      log.warn(`[forms-of-stars] No driver registered for notification type "${notification.type}"`);
      continue;
    }
    try {
      await driver.send(notification, submission, form);
    } catch (err) {
      // Notifications shouldn't fail the submission — log and continue
      log.error(`[forms-of-stars] Notification "${notification.id}" failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── 7. feeds ──────────────────────────────────────────────────────────
  let feedRedirect: string | undefined;
  for (const feed of form.feeds ?? []) {
    if (feed.enabled === false) continue;
    if (!evaluateConditional(feed.conditional, cleanData)) continue;
    const handler = runtime.feedHandlers.get(feed.handler);
    if (!handler) {
      log.warn(`[forms-of-stars] No feed handler registered for "${feed.handler}"`);
      continue;
    }
    try {
      const result = await handler.run(feed, submission, form);
      if (result?.redirect && !feedRedirect) feedRedirect = result.redirect;
    } catch (err) {
      log.error(`[forms-of-stars] Feed "${feed.id}" failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── 8. confirmation ───────────────────────────────────────────────────
  const confirmation = (form.confirmations ?? []).find((c) => evaluateConditional(c.conditional, cleanData))
    ?? defaultConfirmation();

  return {
    ok: true,
    submission,
    confirmation,
    redirect: feedRedirect,
  };
}

function defaultConfirmation(): Confirmation {
  return { type: 'message', message: 'Thank you for your form submission!' };
}
