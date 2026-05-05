/**
 * Render-side helper used by Form.astro. Lives in its own file so the
 * component import path doesn't pull node:crypto into client bundles via
 * the main spam module's named exports — only the runtime needs that.
 */
import type { FormDefinition } from '../types/index.js';
import { getRuntime } from '../server/runtime.js';
import {
  resolveSpamConfig,
  signTimestamp,
  TIMESTAMP_FIELD,
} from './index.js';

export interface RenderSpamFields {
  /** Honeypot field name to render, or null when disabled / collides. */
  honeypot: string | null;
  /** Hidden input name for the time token. Constant — exposed for parity. */
  timestampField: string;
  /** Signed token to embed, or null when timestamp checking is off. */
  timestampToken: string | null;
}

export function getRenderSpamFields(form: FormDefinition): RenderSpamFields {
  const runtime = getRuntime();
  const spam = resolveSpamConfig(form.spam, form.honeypot, runtime.spam, form.fields);

  if (!spam) {
    return { honeypot: null, timestampField: TIMESTAMP_FIELD, timestampToken: null };
  }

  const needsToken = spam.minSubmitMs !== null || spam.maxSubmitMs !== null;
  return {
    honeypot: spam.honeypot,
    timestampField: TIMESTAMP_FIELD,
    timestampToken: needsToken ? signTimestamp(Date.now(), spam.secret) : null,
  };
}
