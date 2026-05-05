import type { FormDefinition, NotificationDefinition, NotificationDriver, Submission } from '../types/index.js';
import { renderMergeTags, renderMergeTagsRecord } from '../core/merge-tags.js';

export class WebhookDriver implements NotificationDriver {
  type = 'webhook' as const;

  async send(notification: NotificationDefinition, submission: Submission, form: FormDefinition): Promise<void> {
    if (!notification.url) throw new Error(`Webhook notification ${notification.id} has no url`);

    const url = renderMergeTags(notification.url, submission, form);
    const headers = renderMergeTagsRecord(notification.headers ?? {}, submission, form);

    // Body precedence: explicit body template (rendered as text) > full submission JSON
    const body = notification.body
      ? renderMergeTags(notification.body, submission, form)
      : JSON.stringify({
          formId: form.id,
          submissionId: submission.id,
          data: submission.data,
          meta: submission.meta,
          createdAt: submission.createdAt,
        });

    const res = await fetch(url, {
      method: notification.method ?? 'POST',
      headers: {
        'Content-Type': notification.body ? (notification.bodyType === 'html' ? 'text/html' : 'text/plain') : 'application/json',
        ...headers,
      },
      body,
    });

    if (!res.ok) {
      throw new Error(`Webhook ${notification.id} failed: ${res.status} ${res.statusText}`);
    }
  }
}
