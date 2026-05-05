/**
 * Public server entry. An Astro API route hands a Request to handleSubmission()
 * and returns whatever Response handleSubmission produces.
 */
import { getForm } from '../core/registry.js';
import { processSubmission } from './process.js';
import { getRuntime } from './runtime.js';
import type { Confirmation } from '../types/index.js';

export { setRuntime, getRuntime } from './runtime.js';
export { processSubmission } from './process.js';
export type { FormsRuntime, ProcessedResult } from './process.js';

export interface HandleSubmissionOptions {
  /** Override how confirmations are rendered as Responses. */
  responder?: (result: Awaited<ReturnType<typeof processSubmission>>) => Response;
}

/**
 * Handle an Astro API POST. The route must include the form id, e.g.
 *
 *   // src/pages/api/forms/[id].ts
 *   import { handleSubmission } from 'forms-of-stars/server';
 *   export const POST: APIRoute = (ctx) => handleSubmission(ctx.request, ctx.params.id);
 */
export async function handleSubmission(
  request: Request,
  formId: string | undefined,
  options: HandleSubmissionOptions = {},
): Promise<Response> {
  if (!formId) return jsonError(400, 'Missing form id');

  const form = getForm(formId);
  if (!form) return jsonError(404, `Unknown form: ${formId}`);

  const runtime = getRuntime();
  const result = await processSubmission(form, request, runtime);

  if (options.responder) return options.responder(result);
  return defaultResponder(result, request);
}

function defaultResponder(
  result: Awaited<ReturnType<typeof processSubmission>>,
  request: Request,
): Response {
  const wantsJson = (request.headers.get('accept') ?? '').includes('application/json')
    || (request.headers.get('content-type') ?? '').includes('application/json');

  if (!result.ok) {
    const status = result.status ?? 422;
    const baseHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (result.retryAfter !== undefined) baseHeaders['Retry-After'] = String(result.retryAfter);

    if (wantsJson) {
      return new Response(JSON.stringify({ ok: false, errors: result.errors ?? {} }), {
        status,
        headers: baseHeaders,
      });
    }
    // For traditional form posts, redirect back with an error query string
    // (the form component reads this to highlight fields)
    const referer = request.headers.get('referer') ?? '/';
    const url = new URL(referer);
    url.searchParams.set('astro_forms_error', '1');
    return Response.redirect(url, 303);
  }

  // JSON clients (AJAX) always get JSON, including the redirect URL as data —
  // the client decides whether to navigate. Returning a 303 to a fetch() call
  // either follows it transparently (wrong target rendered) or fails CORS,
  // both of which break the AJAX flow.
  if (wantsJson) {
    return new Response(
      JSON.stringify({
        ok: true,
        confirmation: result.confirmation,
        redirect: result.redirect,
        submissionId: result.submission?.id,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // No-JS fallback: a feed (e.g. Stripe Checkout) takes precedence
  if (result.redirect) return Response.redirect(result.redirect, 303);

  return confirmationToResponse(result.confirmation, request);
}

function confirmationToResponse(
  confirmation: Confirmation | undefined,
  request: Request,
): Response {
  if (!confirmation) return new Response('OK', { status: 200 });

  if (confirmation.type === 'redirect') {
    const target = confirmation.queryString
      ? `${confirmation.url}${confirmation.url.includes('?') ? '&' : '?'}${confirmation.queryString}`
      : confirmation.url;
    return Response.redirect(target, 303);
  }
  if (confirmation.type === 'page') {
    const url = new URL(confirmation.pageSlug, new URL(request.url).origin);
    return Response.redirect(url, 303);
  }
  // type: 'message' — bounce back with a query flag the page can read
  const referer = request.headers.get('referer') ?? '/';
  const url = new URL(referer);
  url.searchParams.set('astro_forms_success', '1');
  return Response.redirect(url, 303);
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
