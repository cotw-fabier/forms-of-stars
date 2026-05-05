/**
 * Core types for forms-of-stars
 *
 * Modeled loosely after Gravity Forms' concepts (Form, Field, Entry, Feed)
 * but built on Zod schemas and Astro-native primitives.
 */

import type { z } from 'zod';

// ───────────────────────────────────────────────────────────────────────────
// Field types
// ───────────────────────────────────────────────────────────────────────────

export type FieldType =
  | 'text'
  | 'email'
  | 'tel'
  | 'url'
  | 'number'
  | 'textarea'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'multiselect'
  | 'date'
  | 'time'
  | 'datetime'
  | 'file'
  | 'hidden'
  | 'password'
  | 'address'
  | 'name'
  | 'consent'
  | 'product'      // for ecommerce
  | 'quantity'
  | 'price'
  | 'html';        // raw HTML / instructions block

export interface FieldOption {
  label: string;
  value: string;
  /** Optional price delta when used with product fields */
  priceDelta?: number;
  default?: boolean;
}

export interface ConditionalLogicRule {
  /** ID of the field to check */
  fieldId: string;
  operator: 'equals' | 'notEquals' | 'contains' | 'startsWith' | 'endsWith' | 'isEmpty' | 'isNotEmpty' | 'gt' | 'lt';
  value?: string | number | boolean | null;
}

export interface ConditionalLogic {
  /** "all" = AND, "any" = OR */
  match: 'all' | 'any';
  /** What happens when the rules are met */
  action: 'show' | 'hide';
  rules: ConditionalLogicRule[];
}

export interface FieldDefinition {
  /** Stable id used in submissions, conditionals, and notifications */
  id: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  description?: string;
  required?: boolean;
  defaultValue?: unknown;

  /** For select / radio / multiselect / checkbox-group */
  options?: FieldOption[];

  /** Free-form HTML attributes passed through to the input */
  attributes?: Record<string, string | number | boolean>;

  /** CSS class hooks for custom styling */
  cssClass?: string;

  /** Render only when this evaluates true */
  conditionalLogic?: ConditionalLogic;

  /** For ecommerce product fields */
  price?: number;
  productId?: string;

  /** For html / instructions blocks */
  content?: string;

  /** Custom Zod refinement layered on top of the type-derived schema */
  validate?: (value: unknown) => string | null | Promise<string | null>;
}

// ───────────────────────────────────────────────────────────────────────────
// Confirmations (post-submit behavior)
// ───────────────────────────────────────────────────────────────────────────

export type Confirmation =
  | { type: 'message'; message: string; conditional?: ConditionalLogic }
  | { type: 'redirect'; url: string; queryString?: string; conditional?: ConditionalLogic }
  | { type: 'page'; pageSlug: string; conditional?: ConditionalLogic };

// ───────────────────────────────────────────────────────────────────────────
// Notifications (email / webhook / etc.)
// ───────────────────────────────────────────────────────────────────────────

export interface NotificationDefinition {
  id: string;
  /** Human-readable name for the admin */
  name: string;
  /** Notification type — implementations are pluggable */
  type: 'email' | 'webhook' | 'slack' | 'custom';
  /** Only fire when this evaluates true */
  conditional?: ConditionalLogic;

  // email
  to?: string | string[];
  from?: string;
  replyTo?: string;
  subject?: string;
  /** Body supports {field_id} merge tags */
  body?: string;
  bodyType?: 'text' | 'html';

  // webhook
  url?: string;
  method?: 'POST' | 'PUT' | 'PATCH';
  headers?: Record<string, string>;

  // For 'custom' — handler resolved by name from integration config
  handler?: string;
}

// ───────────────────────────────────────────────────────────────────────────
// Routing & feeds (post-submission integrations: Stripe, Mailchimp, etc.)
// ───────────────────────────────────────────────────────────────────────────

export interface FeedDefinition {
  id: string;
  /** Name of the feed handler registered with the integration */
  handler: string;
  name: string;
  enabled?: boolean;
  conditional?: ConditionalLogic;
  /** Free-form configuration passed to the handler */
  config: Record<string, unknown>;
}

// ───────────────────────────────────────────────────────────────────────────
// Form definition
// ───────────────────────────────────────────────────────────────────────────

export interface FormDefinition {
  /** Unique slug used in URLs, e.g. "contact-us" */
  id: string;
  title: string;
  description?: string;

  fields: FieldDefinition[];

  /** Submit button label */
  submitLabel?: string;

  /** Where the form posts to. Defaults to the integration's mounted endpoint. */
  action?: string;

  /** Multiple confirmations are evaluated in order; first match wins */
  confirmations?: Confirmation[];

  notifications?: NotificationDefinition[];
  feeds?: FeedDefinition[];

  /** Honeypot field name — if present and filled, the submission is silently dropped */
  honeypot?: string;

  /** Enable Cloudflare Turnstile / hCaptcha / reCAPTCHA — provider configured at integration level */
  captcha?: boolean;

  /** Marks this form as an ecommerce form. Total is computed from product/quantity/price fields. */
  isEcommerce?: boolean;

  /** Currency code for ecommerce forms */
  currency?: string;
}

// ───────────────────────────────────────────────────────────────────────────
// Submissions
// ───────────────────────────────────────────────────────────────────────────

export type SubmissionStatus = 'pending' | 'completed' | 'spam' | 'failed' | 'awaiting_payment';

export interface Submission {
  id: string;
  formId: string;
  data: Record<string, unknown>;
  status: SubmissionStatus;
  createdAt: Date;
  updatedAt: Date;
  /** IP, user agent, referrer, etc. */
  meta: {
    ip?: string;
    userAgent?: string;
    referrer?: string;
    [key: string]: unknown;
  };
  /** Total in minor units (cents) for ecommerce submissions */
  amountTotal?: number;
  currency?: string;
}

// ───────────────────────────────────────────────────────────────────────────
// Plugin contracts
// ───────────────────────────────────────────────────────────────────────────

export interface SubmissionStore {
  insert(submission: Omit<Submission, 'id' | 'createdAt' | 'updatedAt'>): Promise<Submission>;
  update(id: string, patch: Partial<Submission>): Promise<Submission>;
  get(id: string): Promise<Submission | null>;
  listByForm(formId: string, opts?: { limit?: number; offset?: number }): Promise<Submission[]>;
}

export interface NotificationDriver {
  type: NotificationDefinition['type'];
  send(notification: NotificationDefinition, submission: Submission, form: FormDefinition): Promise<void>;
}

export interface FeedHandler {
  name: string;
  run(feed: FeedDefinition, submission: Submission, form: FormDefinition): Promise<void | { redirect?: string }>;
}

// ───────────────────────────────────────────────────────────────────────────
// Resolved zod schema per form (built lazily)
// ───────────────────────────────────────────────────────────────────────────

export type FormSchema = z.ZodObject<Record<string, z.ZodTypeAny>>;
