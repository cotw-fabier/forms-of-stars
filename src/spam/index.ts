/**
 * Spam guard — three layered, invisible defenses applied to every form
 * unless the consumer opts out:
 *
 *   1. Honeypot field. A hidden input bots happily fill but real users
 *      can't see. Triggered submissions are silently dropped.
 *   2. Signed timestamp token. The form embeds an HMAC-signed timestamp at
 *      render time; the server rejects submissions that arrive faster than
 *      `minSubmitMs` (bot speed) or older than `maxSubmitMs` (replayed).
 *   3. Per-IP, per-form sliding-window rate limit. Cuts off volume attacks.
 *
 * The HMAC secret comes from (in priority order) `configureForms({ spam:
 * { secret } })`, the `FORMS_OF_STARS_SECRET` env var, or a random per-
 * process value. Multi-instance deploys MUST pin a stable secret — random
 * per-process means a token signed by instance A won't verify on B.
 *
 * Layer 4 (CAPTCHA challenge) is intentionally out of scope here; it
 * lives behind the existing `form.captcha` flag and is wired separately.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FieldDefinition } from '../types/index.js';

// ─── Public types ──────────────────────────────────────────────────────────

export interface SpamConfig {
  /** Honeypot field name. Bots fill anything labeled "website", "url", etc. —
   *  the default is deliberately attractive. Set to `false` to disable. */
  honeypot?: string | false;

  /** Submissions arriving faster than this are silently dropped as bots.
   *  Set to `false` to disable. Default: 2000ms. */
  minSubmitMs?: number | false;

  /** Token expiration. Older tokens are rejected (replay / stale builds).
   *  Set to `false` to disable. Default: 24h. */
  maxSubmitMs?: number | false;

  /** Per-IP, per-form sliding-window limit. Default: 5 per 60s. */
  rateLimit?: { max: number; windowMs: number } | false;

  /** HMAC secret. Required for multi-instance deploys; falls back to env
   *  `FORMS_OF_STARS_SECRET`, then a random per-process value. */
  secret?: string;
}

export interface ResolvedSpamConfig {
  honeypot: string | null;
  minSubmitMs: number | null;
  maxSubmitMs: number | null;
  rateLimit: { max: number; windowMs: number } | null;
  secret: string;
}

export const DEFAULT_SPAM_CONFIG: {
  honeypot: string;
  minSubmitMs: number;
  maxSubmitMs: number;
  rateLimit: { max: number; windowMs: number };
} = {
  honeypot: 'website',
  minSubmitMs: 2000,
  maxSubmitMs: 24 * 60 * 60 * 1000,
  rateLimit: { max: 5, windowMs: 60_000 },
};

/** Hidden form field name carrying the signed timestamp token. */
export const TIMESTAMP_FIELD = '_af_ts';

// ─── Secret management ─────────────────────────────────────────────────────

const SECRET_KEY = '__forms_of_stars_spam_secret__';
type GlobalWithSecret = typeof globalThis & { [SECRET_KEY]?: string };

function getOrCreateProcessSecret(): string {
  const g = globalThis as GlobalWithSecret;
  if (g[SECRET_KEY]) return g[SECRET_KEY]!;
  const envSecret = typeof process !== 'undefined' ? process.env?.FORMS_OF_STARS_SECRET : undefined;
  g[SECRET_KEY] = envSecret && envSecret.length >= 16
    ? envSecret
    : randomBytes(32).toString('hex');
  return g[SECRET_KEY]!;
}

// ─── Resolver ──────────────────────────────────────────────────────────────

/**
 * Merge per-form, runtime-global, and library-default spam settings into a
 * single resolved config. Returns `null` when the consumer has set
 * `form.spam = false` (full opt-out).
 *
 * Precedence (highest first): form.spam fields → form.honeypot (top-level
 * shortcut) → globalSpam → DEFAULT_SPAM_CONFIG.
 *
 * Honeypot is auto-disabled if the chosen name collides with a real field
 * id — otherwise legitimate submissions would be silently dropped.
 */
export function resolveSpamConfig(
  formSpam: SpamConfig | false | undefined,
  formHoneypotShortcut: string | undefined,
  globalSpam: SpamConfig | undefined,
  fields: FieldDefinition[] = [],
): ResolvedSpamConfig | null {
  if (formSpam === false) return null;

  const pick = <K extends keyof SpamConfig>(key: K): SpamConfig[K] => {
    if (formSpam && key in formSpam) return formSpam[key];
    if (globalSpam && key in globalSpam) return globalSpam[key];
    return undefined;
  };

  let honeypot = pick('honeypot');
  if (honeypot === undefined) honeypot = DEFAULT_SPAM_CONFIG.honeypot;
  if (formHoneypotShortcut !== undefined) honeypot = formHoneypotShortcut;

  let minSubmitMs = pick('minSubmitMs');
  if (minSubmitMs === undefined) minSubmitMs = DEFAULT_SPAM_CONFIG.minSubmitMs;

  let maxSubmitMs = pick('maxSubmitMs');
  if (maxSubmitMs === undefined) maxSubmitMs = DEFAULT_SPAM_CONFIG.maxSubmitMs;

  let rateLimit = pick('rateLimit');
  if (rateLimit === undefined) rateLimit = DEFAULT_SPAM_CONFIG.rateLimit;

  let resolvedHoneypot: string | null = honeypot === false ? null : honeypot ?? null;
  if (resolvedHoneypot && fields.some((f) => f.id === resolvedHoneypot)) {
    resolvedHoneypot = null;
  }

  return {
    honeypot: resolvedHoneypot,
    minSubmitMs: minSubmitMs === false ? null : minSubmitMs ?? null,
    maxSubmitMs: maxSubmitMs === false ? null : maxSubmitMs ?? null,
    rateLimit: rateLimit === false ? null : rateLimit ?? null,
    secret: pick('secret') ?? getOrCreateProcessSecret(),
  };
}

// ─── Timestamp tokens ──────────────────────────────────────────────────────

const SIG_LEN = 24;

export function signTimestamp(ts: number, secret: string): string {
  const sig = createHmac('sha256', secret).update(String(ts)).digest('hex').slice(0, SIG_LEN);
  return `${ts}.${sig}`;
}

export type TimestampVerification =
  | { ok: true }
  | { ok: false; reason: 'missing' | 'malformed' | 'bad_signature' | 'too_fast' | 'expired' };

export function verifyTimestamp(
  token: unknown,
  secret: string,
  minMs: number | null,
  maxMs: number | null,
): TimestampVerification {
  if (typeof token !== 'string' || token.length === 0) return { ok: false, reason: 'missing' };
  const dot = token.indexOf('.');
  if (dot < 0) return { ok: false, reason: 'malformed' };
  const tsStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const ts = Number(tsStr);
  if (!Number.isFinite(ts) || ts <= 0) return { ok: false, reason: 'malformed' };

  const expected = createHmac('sha256', secret).update(tsStr).digest('hex').slice(0, SIG_LEN);
  if (sig.length !== expected.length) return { ok: false, reason: 'bad_signature' };
  const matches = timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  if (!matches) return { ok: false, reason: 'bad_signature' };

  const age = Date.now() - ts;
  if (minMs !== null && age < minMs) return { ok: false, reason: 'too_fast' };
  if (maxMs !== null && age > maxMs) return { ok: false, reason: 'expired' };
  return { ok: true };
}

// ─── Rate limiter ──────────────────────────────────────────────────────────

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterMs: number };

export interface RateLimiter {
  check(key: string, max: number, windowMs: number): Promise<RateLimitResult>;
}

/**
 * In-memory sliding-window limiter. Single-process by definition — multi-
 * instance deploys should plug in a shared store (Redis, KV, etc.).
 */
export class MemoryRateLimiter implements RateLimiter {
  private hits = new Map<string, number[]>();

  async check(key: string, max: number, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    const cutoff = now - windowMs;
    const arr = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (arr.length >= max) {
      const oldest = arr[0] ?? now;
      return { ok: false, retryAfterMs: Math.max(0, oldest + windowMs - now) };
    }
    arr.push(now);
    this.hits.set(key, arr);

    // Bounded cleanup so a wide IP distribution doesn't grow the map forever.
    if (this.hits.size > 5000) {
      for (const [k, v] of this.hits) {
        const filtered = v.filter((t) => t > cutoff);
        if (filtered.length === 0) this.hits.delete(k);
        else this.hits.set(k, filtered);
      }
    }
    return { ok: true };
  }
}
