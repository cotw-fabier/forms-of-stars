/**
 * Astro integration entry point.
 *
 * The integration is now optional and only does route injection. All runtime
 * wiring (forms, drivers, store) lives in plain user code at server runtime —
 * see `forms-of-stars/runtime`. The previous version tried to register forms
 * and drivers from `astro.config.mjs` during `astro:config:setup`, but that
 * hook only runs at build time, so the deployed Node server's drivers Map
 * was always empty and `emailSender` callbacks (closures over config-time
 * env vars) never made it into the bundle.
 *
 * Recommended usage:
 *
 *   // src/forms/runtime.ts — registers forms + drivers at module init
 *   import { configureForms } from 'forms-of-stars/runtime';
 *   import sgMail from '@sendgrid/mail';
 *   import { contactForm } from './contact';
 *   sgMail.setApiKey(process.env.SENDGRID_API_KEY!);
 *   configureForms({ forms: [contactForm], emailSender: ({ to, ...rest }) => sgMail.send({ to, ...rest }) });
 *
 *   // src/middleware.ts — guarantees the runtime is wired before any
 *   // server-island endpoint or API route handles a request
 *   import './forms/runtime';
 *   export const onRequest = (_, next) => next();
 *
 *   // src/pages/api/forms/[id].ts
 *   import { handleSubmission } from 'forms-of-stars/server';
 *   export const prerender = false;
 *   export const POST = ({ request, params }) => handleSubmission(request, params.id);
 *
 * If you'd rather not author the API route file yourself, pass
 * `injectRoute: true` (the default) and the integration will write one for
 * you — but you still need a middleware that imports your runtime module so
 * the registry is populated when the route runs.
 */
import type { AstroIntegration } from 'astro';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface FormsOfStarsOptions {
  /** Base path for the auto-mounted submission endpoint. Default: "/api/forms" */
  endpoint?: string;

  /** When false, disables the auto-mounted API route (you'll write your own). */
  injectRoute?: boolean;
}

export default function formsOfStars(options: FormsOfStarsOptions = {}): AstroIntegration {
  const endpointBase = (options.endpoint ?? '/api/forms').replace(/\/$/, '');

  return {
    name: 'forms-of-stars',
    hooks: {
      'astro:config:setup': ({ injectRoute, logger, createCodegenDir }) => {
        if (options.injectRoute === false) return;

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
      },
    },
  };
}

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
