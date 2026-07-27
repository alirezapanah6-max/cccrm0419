/**
 * Property-Based Tests: Validation Error Structure & HTML Tag Sanitization
 *
 * Tests Properties 16 and 17 from the design document.
 * Pure logic tests — no DB needed.
 *
 * Validates: Requirements 11.5, 11.7
 */

// Tag: Feature: nodejs-backend, Property 16: Validation Error Structure
// Tag: Feature: nodejs-backend, Property 17: HTML Tag Sanitization

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { CallRecordSchema } from '../../utils/schemas.js';
import { stripHtmlTags } from '../../utils/sanitize.js';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Any string including empty */
const anyStringArb = fc.string();

/** A valid call record (all required fields present) */
const validCallArb = fc.record({
  id: fc.uuid(),
  date: fc.integer({ min: 1577836800000, max: 1924905600000 }).map((ms) =>
    new Date(ms).toISOString().slice(0, 10),
  ),
  phone: fc.stringMatching(/^\d{10,11}$/),
  status: fc.constantFrom<'open' | 'in_progress' | 'escalated' | 'resolved' | 'closed'>(
    'open', 'in_progress', 'escalated', 'resolved', 'closed',
  ),
  agentId: fc.uuid(),
  agentName: fc.string({ minLength: 1, maxLength: 50 }),
});

/** A call object missing at least one required field.
 *  We use fc.boolean() to decide whether each required field is present or absent.
 */
const missingFieldCallArb = fc
  .record({
    includeId: fc.boolean(),
    includeDate: fc.boolean(),
    includePhone: fc.boolean(),
    includeStatus: fc.boolean(),
    includeAgentId: fc.boolean(),
    includeAgentName: fc.boolean(),
    // Concrete values for when we do include them
    id: fc.uuid(),
    date: fc.integer({ min: 1577836800000, max: 1924905600000 }).map((ms) =>
      new Date(ms).toISOString().slice(0, 10),
    ),
    phone: fc.stringMatching(/^\d{10,11}$/),
    status: fc.constantFrom<'open' | 'in_progress' | 'escalated' | 'resolved' | 'closed'>(
      'open', 'in_progress', 'escalated', 'resolved', 'closed',
    ),
    agentId: fc.uuid(),
    agentName: fc.string({ minLength: 1 }),
  })
  .map(({ includeId, includeDate, includePhone, includeStatus, includeAgentId, includeAgentName, ...vals }) => ({
    ...(includeId ? { id: vals.id } : {}),
    ...(includeDate ? { date: vals.date } : {}),
    ...(includePhone ? { phone: vals.phone } : {}),
    ...(includeStatus ? { status: vals.status } : {}),
    ...(includeAgentId ? { agentId: vals.agentId } : {}),
    ...(includeAgentName ? { agentName: vals.agentName } : {}),
  }))
  .filter(
    (obj) =>
      // At least one required field is missing/undefined
      !('id' in obj) ||
      !('date' in obj) ||
      !('phone' in obj) ||
      !('status' in obj) ||
      !('agentId' in obj) ||
      !('agentName' in obj),
  );

/** A string containing at least one HTML-like tag */
const htmlStringArb = fc
  .tuple(
    fc.string({ maxLength: 30 }),
    fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !/[<>]/.test(s)), // tag name chars
    fc.string({ maxLength: 30 }),
  )
  .map(([before, tagContent, after]) => `${before}<${tagContent}>${after}`);

// ---------------------------------------------------------------------------
// Property 16: Validation Error Structure
// ---------------------------------------------------------------------------

describe('Property 16: Validation Error Structure', () => {
  it(
    'safeParse on object missing required fields returns success=false with issues array',
    () => {
      fc.assert(
        fc.property(missingFieldCallArb, (invalidCall) => {
          const result = CallRecordSchema.safeParse(invalidCall);

          // Must fail
          expect(result.success).toBe(false);

          if (!result.success) {
            // Must have an error with issues array
            expect(result.error).toBeDefined();
            expect(Array.isArray(result.error.issues)).toBe(true);
            expect(result.error.issues.length).toBeGreaterThan(0);

            // Each issue must have path and message
            for (const issue of result.error.issues) {
              expect(Array.isArray(issue.path)).toBe(true);
              expect(typeof issue.message).toBe('string');
              expect(issue.message.length).toBeGreaterThan(0);
            }
          }
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'safeParse on completely empty object fails with issues for all required fields',
    () => {
      fc.assert(
        fc.property(fc.constant({}), (emptyObj) => {
          const result = CallRecordSchema.safeParse(emptyObj);

          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error.issues.length).toBeGreaterThan(0);

            // Required fields that must have issues: id, date, phone, status, agentId, agentName
            const issuePaths = result.error.issues.map((i) => i.path[0]);
            const requiredFields = ['id', 'date', 'phone', 'status', 'agentId', 'agentName'];
            for (const field of requiredFields) {
              expect(issuePaths).toContain(field);
            }
          }
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'safeParse on valid call record always returns success=true',
    () => {
      fc.assert(
        fc.property(validCallArb, (validCall) => {
          const result = CallRecordSchema.safeParse(validCall);
          expect(result.success).toBe(true);
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'safeParse on object with wrong phone format fails with path=["phone"]',
    () => {
      fc.assert(
        fc.property(
          validCallArb,
          // Override phone with non-digit characters
          fc.string({ minLength: 1 }).filter((s) => /[^0-9]/.test(s)),
          (validCall, badPhone) => {
            const result = CallRecordSchema.safeParse({ ...validCall, phone: badPhone });
            expect(result.success).toBe(false);

            if (!result.success) {
              const paths = result.error.issues.map((i) => i.path[0]);
              expect(paths).toContain('phone');

              // Each issue has a non-empty message
              for (const issue of result.error.issues) {
                expect(typeof issue.message).toBe('string');
                expect(issue.message.length).toBeGreaterThan(0);
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ---------------------------------------------------------------------------
// Property 17: HTML Tag Sanitization
// ---------------------------------------------------------------------------

describe('Property 17: HTML Tag Sanitization', () => {
  it(
    'no <...> patterns remain in the output for any string with HTML tags',
    () => {
      fc.assert(
        fc.property(htmlStringArb, (input) => {
          const output = stripHtmlTags(input);

          // No <tag> patterns should remain
          expect(/<[^>]*>/.test(output)).toBe(false);
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'text between tags is preserved after stripping',
    () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 30 }).filter((s) => !/[<>]/.test(s)),
          fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !/[<>]/.test(s)),
          (text, tagName) => {
            // Wrap text in an HTML tag
            const input = `<${tagName}>${text}</${tagName}>`;
            const output = stripHtmlTags(input);

            // The text content must be preserved
            expect(output).toContain(text);

            // No tags should remain
            expect(/<[^>]*>/.test(output)).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    'strings without any HTML tags are returned unchanged',
    () => {
      fc.assert(
        fc.property(
          anyStringArb.filter((s) => !/<[^>]*>/.test(s)),
          (plainText) => {
            const output = stripHtmlTags(plainText);
            expect(output).toBe(plainText);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    'output never contains <tag> patterns for any arbitrary string input',
    () => {
      fc.assert(
        fc.property(anyStringArb, (input) => {
          const output = stripHtmlTags(input);

          // The regex used in stripHtmlTags strips <...> patterns
          // Verify no complete tag pattern remains
          const tagPattern = /<[^>]*>/g;
          expect(tagPattern.test(output)).toBe(false);
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'multiple nested tags are all stripped while preserving all text segments',
    () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              text: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !/[<>]/.test(s)),
              tag: fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /^[a-zA-Z]+$/.test(s)),
            }),
            { minLength: 1, maxLength: 5 },
          ),
          (segments) => {
            // Build nested HTML: <tag1>text1<tag2>text2</tag2></tag1> etc
            const input = segments.map((s) => `<${s.tag}>${s.text}</${s.tag}>`).join('');
            const output = stripHtmlTags(input);

            // No tags remain
            expect(/<[^>]*>/.test(output)).toBe(false);

            // All text segments are preserved
            for (const s of segments) {
              expect(output).toContain(s.text);
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
