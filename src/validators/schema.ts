/**
 * Build a Zod schema from a FormDefinition. Used on the server to validate
 * incoming submissions and (optionally) on the client to mirror validation.
 */
import { z } from 'zod';
import type { FieldDefinition, FormDefinition, FormSchema } from '../types/index.js';

function schemaForField(field: FieldDefinition): z.ZodTypeAny {
  let base: z.ZodTypeAny;

  switch (field.type) {
    case 'email':
      base = z.string().email('Please enter a valid email address');
      break;
    case 'url':
      base = z.string().url('Please enter a valid URL');
      break;
    case 'tel':
      // intentionally permissive — phone validation is locale-specific
      base = z.string().min(5, 'Please enter a valid phone number');
      break;
    case 'number':
    case 'price':
    case 'quantity':
      base = z.coerce.number({ invalid_type_error: 'Please enter a number' });
      break;
    case 'date':
    case 'time':
    case 'datetime':
      base = z.string().min(1);
      break;
    case 'checkbox':
      // single checkbox: boolean. group of checkboxes: array of strings.
      if (field.options && field.options.length > 0) {
        base = z.array(z.string());
      } else {
        base = z.coerce.boolean();
      }
      break;
    case 'consent':
      base = z.literal(true, {
        errorMap: () => ({ message: 'You must agree to continue' }),
      });
      break;
    case 'multiselect':
      base = z.array(z.string());
      break;
    case 'select':
    case 'radio': {
      const allowed = field.options?.map((o) => o.value);
      if (allowed && allowed.length > 0) {
        // build a union of literals so any value not in the option list is rejected
        const [first, ...rest] = allowed;
        if (first === undefined) {
          base = z.string();
        } else if (rest.length === 0) {
          base = z.literal(first);
        } else {
          base = z.enum([first, ...rest] as [string, ...string[]]);
        }
      } else {
        base = z.string();
      }
      break;
    }
    case 'file':
      // The transport is handled separately; here we only validate that *something* came through.
      // Astro's FormData will give us a File — we coerce to a marker string at parse time.
      base = z.unknown();
      break;
    case 'html':
      // HTML blocks aren't user input; skip.
      return z.any().optional();
    case 'hidden':
    case 'product':
    case 'address':
    case 'name':
    case 'text':
    case 'textarea':
    case 'password':
    default:
      base = z.string();
      break;
  }

  // Required handling — zod's `.optional()` is the cleanest way to model "not required".
  if (!field.required) {
    // Allow empty strings to pass through as undefined for textual fields
    if (base instanceof z.ZodString) {
      base = base.optional().or(z.literal('').transform(() => undefined));
    } else {
      base = base.optional();
    }
  } else if (base instanceof z.ZodString) {
    base = base.min(1, `${field.label} is required`);
  }

  // Layer on user-provided custom validation
  if (field.validate) {
    base = base.superRefine(async (value, ctx) => {
      const result = await field.validate!(value);
      if (typeof result === 'string') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: result });
      }
    });
  }

  return base;
}

/**
 * Build a Zod schema for the whole form. Field IDs become the keys.
 */
export function buildFormSchema(form: FormDefinition): FormSchema {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of form.fields) {
    if (field.type === 'html') continue;
    shape[field.id] = schemaForField(field);
  }

  return z.object(shape);
}
