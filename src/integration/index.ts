/**
 * Astro integration entry point.
 *
 * Usage in astro.config.mjs:
 *
 *   import formsOfStars from 'forms-of-stars/integration';
 *
 *   export default defineConfig({
 *     integrations: [
 *       formsOfStars({
 *         forms: [contactForm, orderForm],
 *         endpoint: '/api/forms',
 *       }),
 *     ],
 *   });
 */
import type { AstroIntegration } from 'astro';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  FormDefinition,
  FeedHandler,
  NotificationDriver,
  SubmissionStore,
} from '../types/index.js';
import { registerForms } from '../core/registry.js';
import { setRuntime } from '../server/runtime.js';
import { MemorySubmissionStore } from '../db/memory-store.js';
import { WebhookDriver } from '../notifications/webhook.js';
import { EmailDriver, type EmailSender } from '../notifications/email.js';

export interface FormsOfStarsOptions {
  /** Forms to register at startup */
  forms: FormDefinition[];

  /** Base path for the auto-mounted submission endpoint. Default: "/api/forms" */
  endpoint?: string;

  /** Custom submission store. Default: in-memory (volatile). */
  store?: SubmissionStore;

  /** Function that sends an email — wires up the built-in email driver. */
  emailSender?: EmailSender;

  /** Additional notification drivers, keyed by their `type` */
  notificationDrivers?: NotificationDriver[];

  /** Feed handlers (Stripe, Mailchimp, etc.), keyed by name */
  feedHandlers?: FeedHandler[];

  /** When false, disables the auto-mounted API route (you'll need to wire your own) */
  injectRoute?: boolean;
}

export default function formsOfStars(options: FormsOfStarsOptions): AstroIntegration {
  const endpointBase = (options.endpoint ?? '/api/forms').replace(/\/$/, '');

  return {
    name: 'forms-of-stars',

    hooks: {
      'astro:config:setup': ({ injectRoute, logger, createCodegenDir }) => {
        // 1. Register forms in the module-level registry
        registerForms(options.forms);

        // 2. Build runtime
        const drivers = new Map<string, NotificationDriver>();
        drivers.set('webhook', new WebhookDriver());
        if (options.emailSender) {
          drivers.set('email', new EmailDriver(options.emailSender));
        }
        for (const driver of options.notificationDrivers ?? []) {
          drivers.set(driver.type, driver);
        }

        const feeds = new Map<string, FeedHandler>();
        for (const handler of options.feedHandlers ?? []) {
          feeds.set(handler.name, handler);
        }

        setRuntime({
          store: options.store ?? new MemorySubmissionStore(),
          notificationDrivers: drivers,
          feedHandlers: feeds,
          logger,
        });

        // 3. Inject the catch-all API route — unless the user opts out
        if (options.injectRoute !== false) {
          const codegenDir = createCodegenDir();
          const routeFile = fileURLToPath(new URL('./submission-route.mjs', codegenDir));

          mkdirSync(dirname(routeFile), { recursive: true });
          writeFileSync(routeFile, ROUTE_SOURCE, 'utf8');

          injectRoute({
            pattern: `${endpointBase}/[id]`,
            entrypoint: routeFile,
            prerender: false,
          });

          logger.info(`Mounted submission endpoint at ${endpointBase}/[id]`);
        }

        logger.info(`Registered ${options.forms.length} form(s): ${options.forms.map((f) => f.id).join(', ')}`);
      },
    },
  };
}

/**
 * Code injected as the API route. Kept inline so the integration is self-contained
 * — no separate template file to ship.
 */
const ROUTE_SOURCE = `
import { handleSubmission } from 'forms-of-stars/server';

export const prerender = false;

export async function POST({ request, params }) {
  return handleSubmission(request, params.id);
}

export async function GET() {
  return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
}
`;
