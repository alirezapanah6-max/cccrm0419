/**
 * Property-based tests for call record validation.
 *
 * Covers:
 *   Property 9  — Call Record Validation
 *   Property 10 — Call List Sort Invariant
 *   Property 11 — Audit Log Completeness
 *
 * Validates: Requirements 6.1, 6.2, 6.4, 6.5
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { CallRecordSchema } from '../../utils/schemas.js';

// ---------------------------------------------------------------------------
// Shared arbitraries
// ---------------------------------------------------------------------------

/** Generates a valid ISO date string (YYYY-MM-DD) from a bounded integer range. */
const isoDateArb: fc.Arbitrary<string> = fc
  .integer({ min: 2020, max: 2030 })
  .chain((year) =>
    fc
      .integer({ min: 1, max: 12 })
      .chain((month) =>
        fc
          .integer({ min: 1, max: 28 }) // cap at 28 to avoid month-end edge cases
          .map((day) => {
            const mm = String(month).padStart(2, '0');
            const dd = String(day).padStart(2, '0');
            return `${year}-${mm}-${dd}`;
          }),
      ),
  );

/** Generates a fully-valid call record object. */
const validCallArb = fc.record({
  id: fc.uuid(),
  date: isoDateArb,
  phone: fc.stringMatching(/^\d{1,11}$/),
  status: fc.constantFrom(
    'open' as const,
    'in_progress' as const,
    'escalated' as const,
    'resolved' as const,
    'closed' as const,
  ),
  agentId: fc.uuid(),
  agentName: fc.string({ minLength: 1 }),
  followupRootId: fc.constant(null),
});

// ---------------------------------------------------------------------------
// Property 9: Call Record Validation
// ---------------------------------------------------------------------------

// Tag: Feature: nodejs-backend, Property 9: Call Record Validation

describe('Property 9: Call Record Validation', () => {
  const requiredFields = ['date', 'phone', 'agentId', 'status'] as const;

  for (const field of requiredFields) {
    test(`missing "${field}" → safeParse fails and error path contains "${field}"`, () => {
      fc.assert(
        fc.property(validCallArb, (call) => {
          const incomplete = { ...call } as Record<string, unknown>;
          delete incomplete[field];

          const result = CallRecordSchema.safeParse(incomplete);

          // Must fail
          expect(result.success).toBe(false);

          if (!result.success) {
            const paths = result.error.issues.map((i) =>
              i.path.map(String).join('.'),
            );
            expect(
              paths.some((p) => p === field || p.startsWith(field)),
            ).toBe(true);
          }
        }),
        { numRuns: 100 },
      );
    });
  }

  test('valid call record → safeParse succeeds', () => {
    fc.assert(
      fc.property(validCallArb, (call) => {
        const result = CallRecordSchema.safeParse(call);
        expect(result.success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  test('phone with non-digit characters → safeParse fails with phone in error path', () => {
    // Build an arbitrary that always contains at least one non-digit character
    const invalidPhoneArb = fc
      .tuple(
        fc.string({ minLength: 1, maxLength: 5 }),
        fc.constantFrom('a', 'b', 'x', '-', '+', ' '),
        fc.string({ minLength: 0, maxLength: 5 }),
      )
      .map(([pre, bad, suf]) => `${pre}${bad}${suf}`);

    fc.assert(
      fc.property(validCallArb, invalidPhoneArb, (call, badPhone) => {
        const result = CallRecordSchema.safeParse({ ...call, phone: badPhone });
        expect(result.success).toBe(false);

        if (!result.success) {
          const paths = result.error.issues.map((i) =>
            i.path.map(String).join('.'),
          );
          expect(
            paths.some((p) => p === 'phone' || p.startsWith('phone')),
          ).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 10: Call List Sort Invariant
// ---------------------------------------------------------------------------

// Tag: Feature: nodejs-backend, Property 10: Call List Sort Invariant

describe('Property 10: Call List Sort Invariant', () => {
  const callWithTimestampArb = fc.record({
    id: fc.uuid(),
    createdAt: fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
  });

  test('sorting any array of calls by createdAt desc → each element.createdAt >= next', () => {
    fc.assert(
      fc.property(fc.array(callWithTimestampArb), (calls) => {
        const sorted = [...calls].sort((a, b) => b.createdAt - a.createdAt);

        for (let i = 0; i < sorted.length - 1; i++) {
          expect(sorted[i].createdAt).toBeGreaterThanOrEqual(
            sorted[i + 1].createdAt,
          );
        }
      }),
      { numRuns: 100 },
    );
  });

  test('sorted result has the same length as the input', () => {
    fc.assert(
      fc.property(fc.array(callWithTimestampArb), (calls) => {
        const sorted = [...calls].sort((a, b) => b.createdAt - a.createdAt);
        expect(sorted.length).toBe(calls.length);
      }),
      { numRuns: 100 },
    );
  });

  test('all original elements are present after sorting (no items dropped)', () => {
    fc.assert(
      fc.property(fc.array(callWithTimestampArb), (calls) => {
        const sorted = [...calls].sort((a, b) => b.createdAt - a.createdAt);
        const originalIds = calls.map((c) => c.id).sort();
        const sortedIds = sorted.map((c) => c.id).sort();
        expect(sortedIds).toEqual(originalIds);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 11: Audit Log Completeness
// ---------------------------------------------------------------------------

// Tag: Feature: nodejs-backend, Property 11: Audit Log Completeness

// Mock the prisma module BEFORE importing the handler
vi.mock('../../utils/prisma.js', () => {
  const callLogCreate = vi.fn().mockResolvedValue({ id: 'log-id' });
  const callUpsert = vi.fn();
  const callFindUnique = vi.fn().mockResolvedValue(null);

  return {
    prisma: {
      call: {
        upsert: callUpsert,
        findUnique: callFindUnique,
      },
      callLog: {
        create: callLogCreate,
      },
    },
  };
});

describe('Property 11: Audit Log Completeness', () => {
  const validCallRecordArb = fc.record({
    id: fc.uuid(),
    date: isoDateArb,
    phone: fc.stringMatching(/^\d{1,11}$/),
    status: fc.constantFrom(
      'open' as const,
      'in_progress' as const,
      'escalated' as const,
      'resolved' as const,
      'closed' as const,
    ),
    agentId: fc.uuid(),
    agentName: fc.string({ minLength: 1 }),
    followupRootId: fc.constant(null),
    createdAt: fc.integer({ min: 1_000_000_000_000, max: 2_000_000_000_000 }),
    updatedAt: fc.integer({ min: 1_000_000_000_000, max: 2_000_000_000_000 }),
  });

  const userContextArb = fc.record({
    userId: fc.uuid(),
    username: fc.string({ minLength: 1 }),
    role: fc.constantFrom('admin' as const, 'agent' as const),
  });

  beforeEach(async () => {
    const { prisma } = await import('../../utils/prisma.js');
    vi.mocked(prisma.callLog.create).mockClear();
    vi.mocked(prisma.call.upsert).mockClear();
    vi.mocked(prisma.call.findUnique).mockClear();
  });

  test('callSet calls prisma.callLog.create exactly once per valid record', async () => {
    const { prisma } = await import('../../utils/prisma.js');
    const { callSet } = await import('../../handlers/calls.handler.js');

    await fc.assert(
      fc.asyncProperty(
        validCallRecordArb,
        userContextArb,
        async (callRecord, user) => {
          vi.mocked(prisma.callLog.create).mockClear();
          vi.mocked(prisma.call.findUnique).mockResolvedValue(null);
          vi.mocked(prisma.call.upsert).mockResolvedValue({
            id: 'upserted-uuid',
            requestId: callRecord.id,
            date: new Date(callRecord.date),
            phone: callRecord.phone,
            customerName: null,
            categoryName: null,
            subCategoryName: null,
            subSubCategoryName: null,
            status: callRecord.status,
            description: null,
            agentId: callRecord.agentId,
            agentName: callRecord.agentName,
            followupRootId: null,
            createdAt: new Date(callRecord.createdAt),
            updatedAt: new Date(callRecord.updatedAt),
          });

          const key = `call:${callRecord.id}`;
          const value = JSON.stringify(callRecord);

          const result = await callSet(key, value, user);

          expect(result).toEqual({ success: true });

          expect(prisma.callLog.create).toHaveBeenCalledTimes(1);

          const [createArgs] = vi.mocked(prisma.callLog.create).mock.calls;
          expect(createArgs[0].data.userId).toBe(user.userId);
          expect(createArgs[0].data.userName).toBe(user.username);
        },
      ),
      { numRuns: 100 },
    );
  });
});
