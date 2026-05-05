import type { FormDefinition, NotificationDefinition, NotificationDriver, Submission } from '../types/index.js';
import { renderMergeTags } from '../core/merge-tags.js';

export interface EmailMessage {
  to: string[];
  from: string;
  replyTo?: string;
  subject: string;
  body: string;
  bodyType: 'text' | 'html';
}

export type EmailSender = (msg: EmailMessage) => Promise<void>;

/**
 * Email driver — transport agnostic. Pass any function that knows how to send
 * an email (Resend, Postmark, SES, nodemailer, etc.) when configuring the integration.
 */
export class EmailDriver implements NotificationDriver {
  type = 'email' as const;

  constructor(private readonly send_: EmailSender) {}

  async send(notification: NotificationDefinition, submission: Submission, form: FormDefinition): Promise<void> {
    if (!notification.to) throw new Error(`Email notification ${notification.id} has no recipient`);
    if (!notification.from) throw new Error(`Email notification ${notification.id} has no from address`);

    const recipients = Array.isArray(notification.to) ? notification.to : [notification.to];

    const message: EmailMessage = {
      to: recipients.map((r) => renderMergeTags(r, submission, form)),
      from: renderMergeTags(notification.from, submission, form),
      replyTo: notification.replyTo ? renderMergeTags(notification.replyTo, submission, form) : undefined,
      subject: renderMergeTags(notification.subject ?? `New submission: ${form.title}`, submission, form),
      body: renderMergeTags(notification.body ?? defaultBody(submission, form), submission, form),
      bodyType: notification.bodyType ?? 'text',
    };

    await this.send_(message);
  }
}

/**
 * Reasonable default body when none is provided — a labelled list of all submission values.
 */
function defaultBody(submission: Submission, form: FormDefinition): string {
  const lines: string[] = [`New submission for ${form.title}`, ''];
  for (const field of form.fields) {
    if (field.type === 'html') continue;
    const value = submission.data[field.id];
    if (value === undefined || value === '' || value === null) continue;
    const display = Array.isArray(value) ? value.join(', ') : String(value);
    lines.push(`${field.label}: ${display}`);
  }
  return lines.join('\n');
}
