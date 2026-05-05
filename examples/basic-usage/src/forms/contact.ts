/**
 * Example form definitions — these would live in your Astro app, e.g. src/forms/index.ts
 */
import { defineForm } from 'forms-of-stars';

export const contactForm = defineForm({
  id: 'contact',
  title: 'Contact Us',
  submitLabel: 'Send Message',
  honeypot: 'website_url',
  fields: [
    {
      id: 'name',
      type: 'text',
      label: 'Your name',
      required: true,
    },
    {
      id: 'email',
      type: 'email',
      label: 'Email address',
      required: true,
    },
    {
      id: 'reason',
      type: 'select',
      label: 'How can we help?',
      required: true,
      options: [
        { label: 'General question', value: 'general' },
        { label: 'Quote request', value: 'quote' },
        { label: 'Support', value: 'support' },
      ],
    },
    {
      id: 'budget',
      type: 'select',
      label: 'Estimated budget',
      options: [
        { label: 'Under $5k', value: 'under_5k' },
        { label: '$5k–$25k', value: '5k_25k' },
        { label: 'Over $25k', value: 'over_25k' },
      ],
      // Only show when the reason is "quote"
      conditionalLogic: {
        match: 'all',
        action: 'show',
        rules: [{ fieldId: 'reason', operator: 'equals', value: 'quote' }],
      },
    },
    {
      id: 'message',
      type: 'textarea',
      label: 'Tell us more',
      required: true,
    },
    {
      id: 'consent',
      type: 'consent',
      label: 'I agree to be contacted about my inquiry',
      required: true,
    },
  ],
  notifications: [
    {
      id: 'admin-email',
      name: 'Admin notification',
      type: 'email',
      to: 'hello@example.com',
      from: 'forms@example.com',
      replyTo: '{email}',
      subject: 'New {reason} from {name}',
    },
    {
      id: 'autoresponder',
      name: 'Customer autoresponder',
      type: 'email',
      to: '{email}',
      from: 'hello@example.com',
      subject: 'We received your message',
      body: 'Hi {name},\n\nThanks for reaching out! We\'ll be in touch within one business day.\n\n— The team',
    },
    {
      id: 'slack-quote-alert',
      name: 'Slack alert for quote requests',
      type: 'webhook',
      url: 'https://hooks.slack.com/services/T00/B00/XXX',
      conditional: {
        match: 'all',
        action: 'show',
        rules: [{ fieldId: 'reason', operator: 'equals', value: 'quote' }],
      },
    },
  ],
  confirmations: [
    {
      type: 'redirect',
      url: '/thanks/quote',
      conditional: {
        match: 'all',
        action: 'show',
        rules: [{ fieldId: 'reason', operator: 'equals', value: 'quote' }],
      },
    },
    {
      type: 'message',
      message: 'Got it! We\'ll get back to you within one business day.',
    },
  ],
});
