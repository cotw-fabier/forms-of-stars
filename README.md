# forms-of-stars

Schema-driven forms for Astro (a play on _astro_ → _stars_). A spiritual successor to Gravity Forms, but built around Zod schemas, Astro components, and pluggable backends. Designed for a future that includes payments and ecommerce.

> **Status:** v0.1.0 — foundational. Core form rendering, validation, notifications, conditional logic, and confirmations are working. Database adapters and the Stripe feed are scaffolded but not yet implemented.

## What you get

- **Form definitions as data.** A form is a TypeScript object — fields, validation, notifications, conditional logic, confirmations, and (eventually) feeds for ecommerce.
- **Auto-mounted submission endpoint.** The integration injects an Astro API route at `/api/forms/[id]` so you don't write boilerplate.
- **Schema-derived validation.** Zod schemas are built from the form definition. Server-side validation always; client-side mirroring is opt-in.
- **Conditional logic.** Show/hide fields, fire/skip notifications, run/skip feeds — same evaluator everywhere.
- **Pluggable storage.** In-memory by default. Swap in a real `SubmissionStore` for production.
- **Pluggable notifications.** Email and webhook drivers built in. Add your own by implementing `NotificationDriver`.
- **Pluggable feeds.** Hook for post-submission actions like payment processing, CRM sync, list subscription. The interface is in place; concrete handlers come next.

## Local install (npm link)

From the package directory:

```bash
cd /path/to/forms-of-stars
npm install
npm run build
npm link
```

In your Astro app:

```bash
cd /path/to/your-astro-app
npm link forms-of-stars
```

Or skip linking and reference it by file path in your app's `package.json`:

```json
{
  "dependencies": {
    "forms-of-stars": "file:../forms-of-stars"
  }
}
```

## Quick start

**1. Define a form:**

```ts
// src/forms/contact.ts
import { defineForm } from 'forms-of-stars';

export const contactForm = defineForm({
  id: 'contact',
  title: 'Contact Us',
  fields: [
    { id: 'name', type: 'text', label: 'Your name', required: true },
    { id: 'email', type: 'email', label: 'Email', required: true },
    { id: 'message', type: 'textarea', label: 'Message', required: true },
  ],
  notifications: [
    {
      id: 'admin', name: 'Admin', type: 'email',
      to: 'you@example.com', from: 'forms@example.com',
      subject: 'New message from {name}',
    },
  ],
  confirmations: [
    { type: 'message', message: 'Thanks! We got your message.' },
  ],
});
```

**2. Register the integration:**

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import formsOfStars from 'forms-of-stars/integration';
import { contactForm } from './src/forms/contact';

export default defineConfig({
  output: 'server',
  integrations: [
    formsOfStars({
      forms: [contactForm],
      emailSender: async ({ to, from, subject, body }) => {
        // wire to Resend, Postmark, SES, nodemailer, etc.
      },
    }),
  ],
});
```

**3. Drop the form into a page:**

```astro
---
import Form from 'forms-of-stars/components/Form.astro';
---
<Form id="contact" />
```

That's the whole thing. The integration injects `/api/forms/contact`, the form posts to it, validation runs, the email goes out, the confirmation fires.

## Field types

`text`, `email`, `tel`, `url`, `number`, `textarea`, `select`, `radio`, `checkbox`, `multiselect`, `date`, `time`, `datetime`, `file`, `hidden`, `password`, `address`, `name`, `consent`, `product`, `quantity`, `price`, `html`.

## Conditional logic

The same `ConditionalLogic` block applies to fields, confirmations, notifications, and feeds:

```ts
conditionalLogic: {
  match: 'all',                          // 'all' = AND, 'any' = OR
  action: 'show',                        // or 'hide'
  rules: [
    { fieldId: 'reason', operator: 'equals', value: 'quote' },
  ],
}
```

Operators: `equals`, `notEquals`, `contains`, `startsWith`, `endsWith`, `isEmpty`, `isNotEmpty`, `gt`, `lt`.

## Merge tags

In notification subjects, bodies, webhook URLs, and headers:

- `{field_id}` — any submitted value
- `{form_title}` — the form's title
- `{submission_id}` — the stored submission's id
- `{date}` — ISO timestamp
- `{ip}` — submitter's IP

## Custom notification drivers

```ts
import type { NotificationDriver } from 'forms-of-stars';

const slackDriver: NotificationDriver = {
  type: 'slack',
  async send(notification, submission, form) {
    // your logic
  },
};

// in astro.config.mjs:
formsOfStars({
  forms: [...],
  notificationDrivers: [slackDriver],
});
```

## Custom storage

Implement `SubmissionStore` and pass it as `store`. The interface is `insert`, `update`, `get`, `listByForm` — easy to back with Drizzle, Prisma, libSQL, or raw SQL.

## Roadmap

- Database adapters (Drizzle / SQLite / Postgres)
- Stripe Checkout feed (the `awaiting_payment` status and `amountTotal` are already in the submission model)
- File upload handler with pluggable storage backends
- Multi-step / paged forms
- Admin dashboard route for browsing submissions
- Cloudflare Turnstile / hCaptcha drivers

## Project layout

```
src/
├── components/         Form.astro, Field.astro
├── core/               registry, conditional logic, merge tags
├── db/                 storage adapters (memory by default)
├── integration/        the Astro integration entry
├── notifications/      email + webhook drivers
├── server/             submission pipeline + runtime
├── types/              all type definitions
└── validators/         Zod schema builder
```
