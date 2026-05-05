/**
 * Replace {field_id} merge tags in a string with submission values.
 * Also supports a few special tags: {form_title}, {submission_id}, {date}, {ip}.
 */
import type { FormDefinition, Submission } from '../types/index.js';

const TAG_RE = /\{([a-zA-Z0-9_:.-]+)\}/g;

export function renderMergeTags(
  template: string,
  submission: Submission,
  form: FormDefinition,
): string {
  return template.replace(TAG_RE, (match, key: string) => {
    if (key === 'form_title') return form.title;
    if (key === 'submission_id') return submission.id;
    if (key === 'date') return new Date().toISOString();
    if (key === 'ip') return String(submission.meta.ip ?? '');

    if (Object.prototype.hasOwnProperty.call(submission.data, key)) {
      const value = submission.data[key];
      if (Array.isArray(value)) return value.join(', ');
      if (value === null || value === undefined) return '';
      return String(value);
    }

    // unknown tag — leave it alone so it's debuggable in the output
    return match;
  });
}

/**
 * Render every value in a record. Useful for notification headers, etc.
 */
export function renderMergeTagsRecord(
  record: Record<string, string>,
  submission: Submission,
  form: FormDefinition,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(record)) {
    out[k] = renderMergeTags(v, submission, form);
  }
  return out;
}
