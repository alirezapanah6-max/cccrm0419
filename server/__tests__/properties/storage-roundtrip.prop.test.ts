/**
 * Property-Based Tests: KV Handler Storage Round-Trip
 *
 * Tests Properties 1, 2, 3 from the design document.
 * These tests exercise the kv handler functions directly with a mocked Prisma client.
 *
 * Validates: Requirements 1.2, 1.3, 1.4, 1.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Mock the Prisma client BEFORE importing the handler under test
// ---------------------------------------------------------------------------
vi.mock('../../utils/prisma.js', () => ({
  prisma: {
    kvStore: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from '../../utils/prisma.js';
import { kvGet, kvSet, kvDelete, kvList } from '../../handlers/kv.handler.js';

// ---------------------------------------------------------------------------
// Typed references to the mocked Prisma methods
// ---------------------------------------------------------------------------
const mockFindUnique = prisma.kvStore.findUnique as ReturnType<typeof vi.fn>;
const mockUpsert = prisma.kvStore.upsert as ReturnType<typeof vi.fn>;
const mockDeleteMany = prisma.kvStore.deleteMany as ReturnType<typeof vi.fn>;
const mockFindMany = prisma.kvStore.findMany as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Reserved prefixes that are dispatched to other handlers — exclude them
// ---------------------------------------------------------------------------
const RESERVED_PREFIXES = ['call:', 'users-data', 'categories-data', 'session'];

function isReservedKey(key: string): boolean {
  return RESERVED_PREFIXES.some((prefix) => key.startsWith(prefix));
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** A valid KV key: non-empty, max 200 chars, not starting with reserved prefixes */
const validKeyArb = fc
  .string({ minLength: 1, maxLength: 200 })
  .filter((key) => !isReservedKey(key));

/** Any string value (including empty string) */
const anyValueArb = fc.string();

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Property 1: Key-Value Storage Round-Trip
// ---------------------------------------------------------------------------
// Tag: Feature: nodejs-backend, Property 1: Key-Value Storage Round-Trip

describe('Property 1: Key-Value Storage Round-Trip', () => {
  it(
    'set then get returns the original value unchanged',
    async () => {
      await fc.assert(
        fc.asyncProperty(validKeyArb, anyValueArb, async (key, value) => {
          // Set up: upsert succeeds, findUnique returns the stored value
          mockUpsert.mockResolvedValue({ key, value });
          mockFindUnique.mockResolvedValue({ key, value });

          // Act
          const setResult = await kvSet(key, value);
          const getResult = await kvGet(key);

          // Assert
          expect(setResult).toEqual({ success: true });
          expect(getResult).toEqual({ value });

          // Verify the mock was called with the right key
          expect(mockUpsert).toHaveBeenCalledWith(
            expect.objectContaining({
              where: { key },
              update: { value },
              create: { key, value },
            }),
          );
          expect(mockFindUnique).toHaveBeenCalledWith(
            expect.objectContaining({ where: { key } }),
          );
        }),
        { numRuns: 100 },
      );
    },
  );
});

// ---------------------------------------------------------------------------
// Property 2: Delete Then Get Returns Null
// ---------------------------------------------------------------------------
// Tag: Feature: nodejs-backend, Property 2: Delete Then Get Returns Null

describe('Property 2: Delete Then Get Returns Null', () => {
  it(
    'after delete, get returns null — for any key (pre-stored or not)',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          validKeyArb,
          // Whether the key was stored before the delete
          fc.boolean(),
          anyValueArb,
          async (key, wasStored, storedValue) => {
            // Set up:
            // - deleteMany always succeeds (no-op if key didn't exist)
            // - findUnique returns null after deletion
            mockDeleteMany.mockResolvedValue({ count: wasStored ? 1 : 0 });
            mockFindUnique.mockResolvedValue(null);

            if (wasStored) {
              // Pre-store the key (just wires up the mock; actual state is mocked)
              mockUpsert.mockResolvedValue({ key, value: storedValue });
              await kvSet(key, storedValue);
            }

            // Act
            await kvDelete(key);
            const getResult = await kvGet(key);

            // Assert
            expect(getResult).toEqual({ value: null });

            expect(mockDeleteMany).toHaveBeenCalledWith(
              expect.objectContaining({ where: { key } }),
            );
            expect(mockFindUnique).toHaveBeenLastCalledWith(
              expect.objectContaining({ where: { key } }),
            );
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ---------------------------------------------------------------------------
// Property 3: List Returns Exactly Prefix-Matched Items
// ---------------------------------------------------------------------------
// Tag: Feature: nodejs-backend, Property 3: List Returns Exactly Prefix-Matched Items

describe('Property 3: List Returns Exactly Prefix-Matched Items', () => {
  it(
    'list returns exactly those items whose key starts with the given prefix',
    async () => {
      /**
       * Generate a dataset of key-value pairs and a query prefix.
       * We derive the dataset from the prefix to guarantee controlled overlap:
       * some pairs start with the prefix, others don't.
       */
      const datasetArb = fc
        .record({
          prefix: fc.string({ minLength: 1, maxLength: 20 }).filter((p) => !isReservedKey(p)),
          // Keys that DO start with the prefix
          matchingKeys: fc.array(fc.string({ minLength: 1, maxLength: 30 }), {
            minLength: 0,
            maxLength: 10,
          }),
          // Keys that do NOT start with the prefix (ensured by filtering below)
          nonMatchingKeys: fc.array(fc.string({ minLength: 1, maxLength: 30 }), {
            minLength: 0,
            maxLength: 10,
          }),
        })
        .filter(({ prefix, nonMatchingKeys }) =>
          // Ensure non-matching keys really don't start with the prefix
          nonMatchingKeys.every((k) => !k.startsWith(prefix)),
        );

      await fc.assert(
        fc.asyncProperty(datasetArb, anyValueArb, async ({ prefix, matchingKeys, nonMatchingKeys }, value) => {
          // Build the full store: matching keys prefixed, non-matching as-is
          const matchingPairs = matchingKeys.map((suffix) => ({
            key: `${prefix}${suffix}`,
            value,
          }));
          const nonMatchingPairs = nonMatchingKeys
            .filter((k) => !k.startsWith(prefix)) // belt-and-suspenders
            .map((k) => ({ key: k, value }));

          // The mock simulates what the DB's `startsWith` filter does:
          // findMany with { key: { startsWith: prefix } } returns only matchingPairs
          mockFindMany.mockImplementation(
            (args: { where?: { key?: { startsWith?: string } } }) => {
              const filterPrefix = args?.where?.key?.startsWith;
              if (filterPrefix === undefined) {
                return Promise.resolve([...matchingPairs, ...nonMatchingPairs]);
              }
              const matched = [...matchingPairs, ...nonMatchingPairs].filter((p) =>
                p.key.startsWith(filterPrefix),
              );
              return Promise.resolve(matched);
            },
          );

          // Act
          const { items } = await kvList(prefix);

          // Assert: every returned item's key starts with the prefix
          for (const item of items) {
            expect(item.key.startsWith(prefix)).toBe(true);
          }

          // Assert: no prefix-matching item is missing from the result
          const returnedKeys = new Set(items.map((i) => i.key));
          for (const pair of matchingPairs) {
            expect(returnedKeys.has(pair.key)).toBe(true);
          }

          // Assert: no non-matching item appears in the result
          const nonMatchingKeySet = new Set(nonMatchingPairs.map((p) => p.key));
          for (const item of items) {
            expect(nonMatchingKeySet.has(item.key)).toBe(false);
          }
        }),
        { numRuns: 100 },
      );
    },
  );
});
