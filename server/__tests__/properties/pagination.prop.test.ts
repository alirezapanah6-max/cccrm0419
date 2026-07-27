/**
 * Property-Based Tests: Pagination Bounds Enforcement
 *
 * Tests Property 21 from the design document.
 * Pure logic test — no DB needed.
 *
 * Validates: Requirements 13.2
 */

// Tag: Feature: nodejs-backend, Property 21: Pagination Bounds Enforcement

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Pagination logic (mirrors calls handler / customer profile logic)
// ---------------------------------------------------------------------------

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

/**
 * Resolves the effective page size given the raw input.
 * - pageSize > 100  → 100
 * - pageSize <= 0   → 50
 * - pageSize is undefined/null → 50
 * - 1 <= pageSize <= 100 → pageSize as-is
 */
function resolvePageSize(pageSize: number | undefined | null): number {
  if (pageSize === undefined || pageSize === null) return DEFAULT_PAGE_SIZE;
  if (pageSize <= 0) return DEFAULT_PAGE_SIZE;
  if (pageSize > MAX_PAGE_SIZE) return MAX_PAGE_SIZE;
  return pageSize;
}

/**
 * Paginate an array of items.
 * Returns the slice for the given page (1-indexed) and resolved page size.
 */
function paginate<T>(items: T[], pageSize: number | undefined | null, page = 1): T[] {
  const effective = resolvePageSize(pageSize);
  const start = (page - 1) * effective;
  return items.slice(start, start + effective);
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Any integer page size including edge cases */
const pageSizeArb = fc.oneof(
  fc.integer({ min: -1000, max: 0 }),        // <= 0: should default to 50
  fc.integer({ min: 1, max: 100 }),          // valid range
  fc.integer({ min: 101, max: 100_000 }),    // > 100: should cap to 100
  fc.constant(undefined as undefined),       // missing: should default to 50
  fc.constant(null as null),                 // null: should default to 50
);

/** A dataset of items */
const itemsArb = fc.array(fc.string(), { minLength: 0, maxLength: 500 });

// ---------------------------------------------------------------------------
// Property 21: Pagination Bounds Enforcement
// ---------------------------------------------------------------------------

describe('Property 21: Pagination Bounds Enforcement', () => {
  it(
    'effective page size is 50 when pageSize is missing (undefined or null)',
    () => {
      fc.assert(
        fc.property(
          fc.constantFrom(undefined as undefined, null as null),
          (missingSize) => {
            expect(resolvePageSize(missingSize)).toBe(DEFAULT_PAGE_SIZE);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    'effective page size is 50 when pageSize is <= 0',
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -100_000, max: 0 }),
          (nonPositive) => {
            expect(resolvePageSize(nonPositive)).toBe(DEFAULT_PAGE_SIZE);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    'effective page size is capped at 100 when pageSize > 100',
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 101, max: 100_000 }),
          (largeSize) => {
            expect(resolvePageSize(largeSize)).toBe(MAX_PAGE_SIZE);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    'effective page size equals input when 1 <= pageSize <= 100',
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          (validSize) => {
            expect(resolvePageSize(validSize)).toBe(validSize);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    'result set never exceeds effective page size for any dataset and pageSize',
    () => {
      fc.assert(
        fc.property(itemsArb, pageSizeArb, (items, pageSize) => {
          const result = paginate(items, pageSize);
          const effective = resolvePageSize(pageSize);

          expect(result.length).toBeLessThanOrEqual(effective);
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'result set length equals min(effective page size, remaining items)',
    () => {
      fc.assert(
        fc.property(itemsArb, pageSizeArb, (items, pageSize) => {
          const result = paginate(items, pageSize);
          const effective = resolvePageSize(pageSize);

          expect(result.length).toBe(Math.min(items.length, effective));
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'effective page size is always between 1 and 100 inclusive for any input',
    () => {
      fc.assert(
        fc.property(pageSizeArb, (pageSize) => {
          const effective = resolvePageSize(pageSize);

          expect(effective).toBeGreaterThanOrEqual(1);
          expect(effective).toBeLessThanOrEqual(MAX_PAGE_SIZE);
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'paginate preserves item order within the page',
    () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer(), { minLength: 1, maxLength: 200 }),
          fc.integer({ min: 1, max: 100 }),
          (items, pageSize) => {
            const result = paginate(items, pageSize);
            const effective = resolvePageSize(pageSize);

            // Result should be the first `effective` items
            const expected = items.slice(0, effective);
            expect(result).toEqual(expected);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
