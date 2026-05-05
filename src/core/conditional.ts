import type { ConditionalLogic, ConditionalLogicRule } from '../types/index.js';

/**
 * Evaluate a single rule against a submission's data bag.
 */
function evaluateRule(rule: ConditionalLogicRule, data: Record<string, unknown>): boolean {
  const actual = data[rule.fieldId];
  const expected = rule.value;

  switch (rule.operator) {
    case 'equals':
      // loose-ish comparison — form data often arrives as strings
      return String(actual ?? '') === String(expected ?? '');
    case 'notEquals':
      return String(actual ?? '') !== String(expected ?? '');
    case 'contains':
      return typeof actual === 'string' && typeof expected === 'string' && actual.includes(expected);
    case 'startsWith':
      return typeof actual === 'string' && typeof expected === 'string' && actual.startsWith(expected);
    case 'endsWith':
      return typeof actual === 'string' && typeof expected === 'string' && actual.endsWith(expected);
    case 'isEmpty':
      return actual === undefined || actual === null || actual === '' || (Array.isArray(actual) && actual.length === 0);
    case 'isNotEmpty':
      return !(actual === undefined || actual === null || actual === '' || (Array.isArray(actual) && actual.length === 0));
    case 'gt':
      return Number(actual) > Number(expected);
    case 'lt':
      return Number(actual) < Number(expected);
    default:
      return false;
  }
}

/**
 * Evaluate a conditional logic block. Returns true when the consumer should proceed
 * (e.g. show the field, fire the notification, run the feed).
 */
export function evaluateConditional(
  logic: ConditionalLogic | undefined,
  data: Record<string, unknown>,
): boolean {
  if (!logic) return true;

  const matches = logic.match === 'all'
    ? logic.rules.every((r) => evaluateRule(r, data))
    : logic.rules.some((r) => evaluateRule(r, data));

  // action: "show" → true means "yes, render/fire". action: "hide" inverts.
  return logic.action === 'show' ? matches : !matches;
}
