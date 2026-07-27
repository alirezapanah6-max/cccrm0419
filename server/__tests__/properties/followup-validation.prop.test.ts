// Tag: Feature: nodejs-backend, Property 18: Follow-Up Root Validation
// Tag: Feature: nodejs-backend, Property 19: Follow-Up Chain Query Ordering

/**
 * Property-based tests for follow-up validation and chain ordering.
 *
 * Validates: Requirements 12.1, 12.2, 12.4
 *
 * Property 18 uses a mocked Prisma to isolate the self-reference guard in callSet.
 * Property 19 is a pure sort-logic test — no DB needed.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

interface FollowUpCall {
  requestId: string;
  followupRootId: string;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Property 19: Follow-Up Chain Query Ordering (pure sort logic)
// ---------------------------------------------------------------------------

describe('Property 19: Follow-Up Chain Query Ordering', () => {
  /**
   * Generate an array of follow-up calls with distinct requestIds and
   * arbitrary createdAt timestamps.
   */
  const followUpArrayArb: fc.Arbitrary<FollowUpCall[]> = fc.array(
    fc.record({
      requestId: fc.uuid(),
      followupRootId: fc.uuid(),
      // Use integer timestamps to avoid NaN dates from fc.date()
      createdAt: fc
        .integer({ min: 1577836800000, max: 1924905600000 }) // 2020-01-01 to 2031-01-01
        .map((ts) => new Date(ts)),
    }),
    { minLength: 1, maxLength: 50 },
  );

  test(
    'sorting follow-ups by createdAt asc yields non-decreasing order',
    () => {
      fc.assert(
        fc.property(followUpArrayArb, (calls) => {
          const sorted = [...calls].sort(
            (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
          );

          for (let i = 1; i < sorted.length; i++) {
            expect(sorted[i].createdAt.getTime()).toBeGreaterThanOrEqual(
              sorted[i - 1].createdAt.getTime(),
            );
          }
        }),
        { numRuns: 100 },
      );
    },
  );

  test(
    'sorted result contains exactly the same items as the original array',
    () => {
      fc.assert(
        fc.property(followUpArrayArb, (calls) => {
          const sorted = [...calls].sort(
            (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
          );

          // Same length
          expect(sorted.length).toBe(calls.length);

          // Same set of requestIds
          const originalIds = calls.map((c) => c.requestId).sort();
          const sortedIds = sorted.map((c) => c.requestId).sort();
          expect(sortedIds).toEqual(originalIds);
        }),
        { numRuns: 100 },
      );
    },
  );

  test(
    'all calls whose followupRootId matches the root are included in sorted chain',
    () => {
      fc.assert(
        fc.property(
          fc.uuid(), // rootId
          fc.array(
            fc.record({
              requestId: fc.uuid(),
              followupRootId: fc.uuid(),
              // Use integer timestamps to avoid NaN dates from fc.date()
              createdAt: fc
                .integer({ min: 1577836800000, max: 1924905600000 }) // 2020-01-01 to 2031-01-01
                .map((ts) => new Date(ts)),
            }),
            { minLength: 0, maxLength: 30 },
          ),
          (rootId, calls) => {
            // Mark some calls as belonging to this root
            const withRoot = calls.map((c, idx) => ({
              ...c,
              followupRootId: idx % 2 === 0 ? rootId : c.followupRootId,
            }));

            const chain = withRoot
              .filter((c) => c.followupRootId === rootId)
              .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

            // All chain items must reference the root
            for (const item of chain) {
              expect(item.followupRootId).toBe(rootId);
            }

            // Chain must be in ascending order
            for (let i = 1; i < chain.length; i++) {
              expect(chain[i].createdAt.getTime()).toBeGreaterThanOrEqual(
                chain[i - 1].createdAt.getTime(),
              );
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ---------------------------------------------------------------------------
// Property 18: Follow-Up Root Validation (mocked Prisma)
// ---------------------------------------------------------------------------

// We mock the prisma module before importing the handler so the module factory
// is in place when the handler module is first loaded.
vi.mock('../../utils/prisma.js', () => {
  const mockPrisma = {
    call: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    callLog: {
      create: vi.fn(),
    },
  };
  return { prisma: mockPrisma };
});

describe('Property 18: Follow-Up Root Validation', () => {
  let callSet: (
    key: string,
    value: string,
    user: { userId: string; username: string; role?: string },
  ) => Promise<unknown>;

  let mockPrisma: {
    call: {
      findUnique: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
    };
    callLog: {
      create: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(async () => {
    // Import the mocked prisma and handler after mock is registered
    const prismaModule = await import('../../utils/prisma.js');
    mockPrisma = (prismaModule as { prisma: typeof mockPrisma }).prisma;

    vi.clearAllMocks();

    // Import handler (resolves to the same module cache with mocked prisma)
    const handlerModule = await import('../../handlers/calls.handler.js');
    callSet = handlerModule.callSet;
  });

  /**
   * Generate a valid minimal call record that would normally pass Zod validation,
   * with the followupRootId set to equal the call's own requestId.
   */
  const selfReferencingCallArb = fc.uuid().chain((requestId) =>
    fc
      .record({
        date: fc.constant('2024-01-15'),
        phone: fc
          .array(fc.integer({ min: 0, max: 9 }), { minLength: 10, maxLength: 11 })
          .map((digits) => digits.join('')),
        status: fc.constantFrom(
          'open' as const,
          'in_progress' as const,
          'escalated' as const,
          'resolved' as const,
          'closed' as const,
        ),
        agentId: fc.uuid(),
        agentName: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
      })
      .map((fields) => ({
        requestId,
        record: {
          id: requestId, // same as requestId
          ...fields,
          followupRootId: requestId, // self-reference
        },
      })),
  );

  test(
    'callSet rejects with "Follow-up root cannot reference itself" when followupRootId === requestId',
    () => {
      fc.assert(
        fc.asyncProperty(selfReferencingCallArb, async ({ requestId, record }) => {
          const key = `call:${requestId}`;
          const value = JSON.stringify(record);
          const user = { userId: 'usr_test', username: 'tester', role: 'admin' };

          const result = await callSet(key, value, user);

          expect(result).toHaveProperty('error', 'Follow-up root cannot reference itself');
        }),
        { numRuns: 100 },
      );
    },
  );

  test(
    'callSet rejects when followupRootId equals the record id field (not just the key)',
    () => {
      fc.assert(
        fc.asyncProperty(
          fc.uuid().chain((id) =>
            fc
              .record({
                date: fc.constant('2024-06-01'),
                phone: fc
                  .array(fc.integer({ min: 0, max: 9 }), { minLength: 10, maxLength: 11 })
                  .map((digits) => digits.join('')),
                status: fc.constantFrom(
                  'open' as const,
                  'in_progress' as const,
                  'resolved' as const,
                ),
                agentId: fc.uuid(),
                agentName: fc
                  .string({ minLength: 1, maxLength: 20 })
                  .filter((s) => s.trim().length > 0),
              })
              .map((fields) => ({
                id,
                record: {
                  id,
                  ...fields,
                  followupRootId: id, // self-reference via id field
                },
                differentKey: `call:${fc.sample(fc.uuid(), 1)[0]}`, // key is different from id
              })),
          ),
          async ({ id, record, differentKey }) => {
            const value = JSON.stringify(record);
            const user = { userId: 'usr_test', username: 'tester', role: 'admin' };

            const result = await callSet(differentKey, value, user);

            // The handler checks sanitized.followupRootId === record.id
            // so even with a different key, self-reference via id field is caught
            expect(result).toHaveProperty('error', 'Follow-up root cannot reference itself');
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  test(
    'callSet does not reject self-reference error when followupRootId is null',
    () => {
      fc.assert(
        fc.asyncProperty(
          fc.uuid().chain((requestId) =>
            fc
              .record({
                date: fc.constant('2024-01-15'),
                phone: fc
                  .array(fc.integer({ min: 0, max: 9 }), { minLength: 10, maxLength: 11 })
                  .map((digits) => digits.join('')),
                status: fc.constantFrom('open' as const, 'resolved' as const),
                agentId: fc.uuid(),
                agentName: fc
                  .string({ minLength: 1, maxLength: 20 })
                  .filter((s) => s.trim().length > 0),
              })
              .map((fields) => ({
                requestId,
                record: {
                  id: requestId,
                  ...fields,
                  followupRootId: null, // no self-reference
                },
              })),
          ),
          async ({ requestId, record }) => {
            const key = `call:${requestId}`;
            const value = JSON.stringify(record);
            const user = { userId: 'usr_test', username: 'tester', role: 'admin' };

            // Mock: no existing call, successful upsert
            mockPrisma.call.findUnique.mockResolvedValue(null);
            mockPrisma.call.upsert.mockResolvedValue({
              id: 'internal-uuid',
              requestId,
              date: new Date(record.date),
              phone: record.phone,
              customerName: null,
              status: record.status,
              description: null,
              categoryName: null,
              subCategoryName: null,
              subSubCategoryName: null,
              agentId: record.agentId,
              agentName: record.agentName,
              followupRootId: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
            mockPrisma.callLog.create.mockResolvedValue({});

            const result = await callSet(key, value, user);

            // Should NOT have the self-reference error
            expect(result).not.toHaveProperty('error', 'Follow-up root cannot reference itself');
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
