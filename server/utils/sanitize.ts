/**
 * Input sanitization utilities.
 * Strips HTML tags from user-provided strings to prevent XSS.
 * Requirements: 11.7
 */

/**
 * Removes all HTML tags from a string while preserving text content.
 * Handles self-closing tags, attributes, nested tags, and script/style tags.
 */
export function stripHtmlTags(input: string): string {
  if (input == null) return '';
  if (input === '') return '';
  return input.replace(/<[^>]*>/g, '');
}

/**
 * Main sanitization function applied to user-provided string values.
 * Strips HTML tags and trims whitespace.
 */
export function sanitizeValue(input: string): string {
  if (input == null) return '';
  return stripHtmlTags(input).trim();
}

/**
 * Recursively sanitizes all string values in an object.
 * - Strings: applies sanitizeValue
 * - Nested objects: recurses
 * - Arrays: iterates and applies to each element
 * - Non-strings (numbers, booleans, null): left unchanged
 */
export function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = sanitizeValue(value);
    } else if (Array.isArray(value)) {
      result[key] = sanitizeArray(value);
    } else if (value !== null && typeof value === 'object') {
      result[key] = sanitizeObject(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Recursively sanitizes all string values in an array.
 */
function sanitizeArray(arr: unknown[]): unknown[] {
  return arr.map((item) => {
    if (typeof item === 'string') {
      return sanitizeValue(item);
    } else if (Array.isArray(item)) {
      return sanitizeArray(item);
    } else if (item !== null && typeof item === 'object') {
      return sanitizeObject(item as Record<string, unknown>);
    }
    return item;
  });
}
