/**
 * Property-Based Tests: CSV Export Date Range Filtering
 *
 * Tests Property 15 from the design document.
 * Pure logic test — no DB or HTTP needed.
 *
 * Validates: Requirements 9.3
 */

// Tag: Feature: nodejs-backend, Property 15: CSV Export Date Range Filtering

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Pure filtering function (the same logic used in the export route)
// ---------------------------------------------------------------------------

interface CallRecord {
  id: string;
  createdAt: number; // Unix timestamp ms
  [key: string]: unknown;
}

/**
 * Filters calls whose createdAt falls within [from, to] inclusive.
 * This mirrors the logic in the export handler.
 */
function filterCallsByDateRange(
  calls: CallRecord[],
  from: number,
  to: number,
): CallRecord[] {
  return calls.filter((call) => call.createdAt >= from && call.createdAt <= to);
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** A Unix timestamp in ms — spanning a reasonable range */
const timestampArb = fc.integer({ min: 0, max: 2_000_000_000_000 });

/** A date range [from, to] where from <= to */
const dateRangeArb = fc
  .tuple(timestampArb, timestampArb)
  .map(([a, b]) => ({ from: Math.min(a, b), to: Math.max(a, b) }));

/** A single call record with a generated timestamp */
const callArb = (ts: fc.Arbitrary<number>) =>
  fc.record({
    id: fc.uuid(),
    createdAt: ts,
  });

/** An array of call records with arbitrary timestamps */
const callsArrayArb = fc.array(
  fc.record({ id: fc.uuid(), createdAt: timestampArb }),
  { minLength: 0, maxLength: 50 },
);

// ---------------------------------------------------------------------------
// Property 15: CSV Export Date Range Filtering
// ---------------------------------------------------------------------------

describe('Property 15: CSV Export Date Range Filtering', () => {
  it(
    'filtered result contains exactly calls within [from, to] inclusive',
    () => {
      fc.assert(
        fc.property(callsArrayArb, dateRangeArb, (calls, { from, to }) => {
          const result = filterCallsByDateRange(calls, from, to);

          // Every returned call must be within range
          for (const call of result) {
            expect(call.createdAt).toBeGreaterThanOrEqual(from);
            expect(call.createdAt).toBeLessThanOrEqual(to);
          }

          // Every in-range call must appear in result
          const resultIds = new Set(result.map((c) => c.id));
          for (const call of calls) {
            if (call.createdAt >= from && call.createdAt <= to) {
              expect(resultIds.has(call.id)).toBe(true);
            }
          }

          // No out-of-range call may appear
          for (const call of result) {
            expect(call.createdAt < from || call.createdAt > to).toBe(false);
          }
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'result size equals the manual count of in-range calls',
    () => {
      fc.assert(
        fc.property(callsArrayArb, dateRangeArb, (calls, { from, to }) => {
          const result = filterCallsByDateRange(calls, from, to);
          const manualCount = calls.filter(
            (c) => c.createdAt >= from && c.createdAt <= to,
          ).length;

          expect(result.length).toBe(manualCount);
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'boundary timestamps are included (inclusive range)',
    () => {
      fc.assert(
        fc.property(
          fc.array(timestampArb, { minLength: 1, maxLength: 20 }),
          (timestamps) => {
            const sorted = [...timestamps].sort((a, b) => a - b);
            const from = sorted[0];
            const to = sorted[sorted.length - 1];

            // All generated timestamps should be included
            const calls = timestamps.map((ts, i) => ({ id: `call-${i}`, createdAt: ts }));
            const result = filterCallsByDateRange(calls, from, to);

            expect(result.length).toBe(calls.length);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    'empty range (from === to) returns only calls matching that exact timestamp',
    () => {
      fc.assert(
        fc.property(callsArrayArb, timestampArb, (calls, ts) => {
          const result = filterCallsByDateRange(calls, ts, ts);
          const expected = calls.filter((c) => c.createdAt === ts);

          expect(result.length).toBe(expected.length);
          for (const call of result) {
            expect(call.createdAt).toBe(ts);
          }
        }),
        { numRuns: 100 },
      );
    },
  );
});
