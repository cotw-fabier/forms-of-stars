// astro.config.mjs (in the consuming app)
import { defineConfig } from 'astro/config';
import formsOfStars from 'forms-of-stars/integration';
import { contactForm } from './src/forms/contact';

// Bring your own email transport
async function sendEmail({ to, from, replyTo, subject, body, bodyType }) {
  // Example: Resend
  // await resend.emails.send({ from, to, reply_to: replyTo, subject, [bodyType]: body });
  console.log('Would send email:', { to, subject });
}

export default defineConfig({
  output: 'server', // submissions need an SSR adapter
  integrations: [
    formsOfStars({
      forms: [contactForm],
      endpoint: '/api/forms',
      emailSender: sendEmail,
    }),
  ],
});
