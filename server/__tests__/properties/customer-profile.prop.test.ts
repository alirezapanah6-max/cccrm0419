/**
 * Property-Based Tests: Customer Profile Phone Query & Summary Accuracy
 *
 * Tests Properties 20 and 22 from the design document.
 * Pure logic tests — no DB needed.
 *
 * Validates: Requirements 13.1, 13.3, 13.5
 */

// Tag: Feature: nodejs-backend, Property 20: Customer Profile Phone Query
// Tag: Feature: nodejs-backend, Property 22: Customer Profile Summary Accuracy

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Types and pure logic functions (mirrors the calls handler logic)
// ---------------------------------------------------------------------------

interface CallRecord {
  id: string;
  phone: string;
  agentId: string;
  status: 'open' | 'in_progress' | 'escalated' | 'resolved' | 'closed';
  followupRootId: string | null;
  createdAt: number; // Unix timestamp ms
}

/**
 * Filter calls by phone number and sort descending by createdAt.
 * Returns all matching calls regardless of agent.
 */
function getCallsByPhone(calls: CallRecord[], phone: string): CallRecord[] {
  return calls
    .filter((c) => c.phone === phone)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Compute summary stats for a set of call records (all for the same phone).
 */
interface ProfileSummary {
  totalCalls: number;
  openFollowUps: number;
  resolvedCount: number;
  followUpChains: number;
}

function computeProfileSummary(calls: CallRecord[]): ProfileSummary {
  const totalCalls = calls.length;

  // Open follow-ups: calls that have a followupRootId AND are in open/in_progress/escalated status
  const openFollowUps = calls.filter(
    (c) =>
      c.followupRootId !== null &&
      (c.status === 'open' || c.status === 'in_progress' || c.status === 'escalated'),
  ).length;

  const resolvedCount = calls.filter(
    (c) => c.status === 'resolved' || c.status === 'closed',
  ).length;

  // Follow-up chains: distinct root call IDs referenced by followupRootId
  const rootIds = new Set(
    calls.filter((c) => c.followupRootId !== null).map((c) => c.followupRootId as string),
  );
  const followUpChains = rootIds.size;

  return { totalCalls, openFollowUps, resolvedCount, followUpChains };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const statusArb = fc.constantFrom<CallRecord['status']>(
  'open',
  'in_progress',
  'escalated',
  'resolved',
  'closed',
);

const phoneArb = fc.stringMatching(/^\d{10,11}$/);

/**
 * Generates a pool of call IDs we can reference as followupRootId.
 */
const callIdArb = fc.uuid();

const callArb = (phone: string): fc.Arbitrary<CallRecord> =>
  fc.record({
    id: callIdArb,
    phone: fc.constant(phone),
    agentId: fc.uuid(),
    status: statusArb,
    followupRootId: fc.option(callIdArb, { nil: null }),
    createdAt: fc.integer({ min: 0, max: 2_000_000_000_000 }),
  });

/** Generates calls for two distinct phones from multiple agents */
const multiPhoneDatasetArb = fc
  .tuple(
    phoneArb,
    phoneArb,
    fc.integer({ min: 1, max: 3 }), // number of agents
  )
  .filter(([phoneX, phoneY]) => phoneX !== phoneY)
  .chain(([phoneX, phoneY, agentCount]) => {
    const agentIds = Array.from({ length: agentCount }, (_, i) => `agent-${i}`);

    const callsForXArb = fc.array(callArb(phoneX), { minLength: 1, maxLength: 15 }).map(
      (calls) =>
        calls.map((c, i) => ({
          ...c,
          agentId: agentIds[i % agentIds.length],
        })),
    );

    const callsForYArb = fc.array(callArb(phoneY), { minLength: 1, maxLength: 15 }).map(
      (calls) =>
        calls.map((c, i) => ({
          ...c,
          agentId: agentIds[i % agentIds.length],
        })),
    );

    return fc.record({
      phoneX: fc.constant(phoneX),
      phoneY: fc.constant(phoneY),
      callsForX: callsForXArb,
      callsForY: callsForYArb,
    });
  });

// ---------------------------------------------------------------------------
// Property 20: Customer Profile Phone Query
// ---------------------------------------------------------------------------

describe('Property 20: Customer Profile Phone Query', () => {
  it(
    'filtering by phone X returns only calls with phone X — no calls from phone Y',
    () => {
      fc.assert(
        fc.property(multiPhoneDatasetArb, ({ phoneX, phoneY, callsForX, callsForY }) => {
          const allCalls = [...callsForX, ...callsForY];
          const result = getCallsByPhone(allCalls, phoneX);

          // All results must have phone X
          for (const call of result) {
            expect(call.phone).toBe(phoneX);
          }

          // No call from phone Y appears
          const resultIds = new Set(result.map((c) => c.id));
          for (const call of callsForY) {
            expect(resultIds.has(call.id)).toBe(false);
          }
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'result contains all calls for phone X regardless of which agent created them',
    () => {
      fc.assert(
        fc.property(multiPhoneDatasetArb, ({ phoneX, callsForX, callsForY }) => {
          const allCalls = [...callsForX, ...callsForY];
          const result = getCallsByPhone(allCalls, phoneX);

          // Every X call must appear in result, no matter the agentId
          const resultIds = new Set(result.map((c) => c.id));
          for (const call of callsForX) {
            expect(resultIds.has(call.id)).toBe(true);
          }
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'result is sorted by createdAt descending (newest first)',
    () => {
      fc.assert(
        fc.property(multiPhoneDatasetArb, ({ phoneX, callsForX, callsForY }) => {
          const allCalls = [...callsForX, ...callsForY];
          const result = getCallsByPhone(allCalls, phoneX);

          for (let i = 1; i < result.length; i++) {
            expect(result[i - 1].createdAt).toBeGreaterThanOrEqual(result[i].createdAt);
          }
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'result count equals the exact number of calls for phone X',
    () => {
      fc.assert(
        fc.property(multiPhoneDatasetArb, ({ phoneX, callsForX, callsForY }) => {
          const allCalls = [...callsForX, ...callsForY];
          const result = getCallsByPhone(allCalls, phoneX);

          expect(result.length).toBe(callsForX.length);
        }),
        { numRuns: 100 },
      );
    },
  );
});

// ---------------------------------------------------------------------------
// Property 22: Customer Profile Summary Accuracy
// ---------------------------------------------------------------------------

describe('Property 22: Customer Profile Summary Accuracy', () => {
  /** An array of calls for a single phone */
  const callsForPhoneArb = phoneArb.chain((phone) =>
    fc.array(callArb(phone), { minLength: 0, maxLength: 30 }),
  );

  it(
    'totalCalls matches the length of the calls array',
    () => {
      fc.assert(
        fc.property(callsForPhoneArb, (calls) => {
          const summary = computeProfileSummary(calls);
          expect(summary.totalCalls).toBe(calls.length);
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'resolvedCount equals the count of calls with status resolved or closed',
    () => {
      fc.assert(
        fc.property(callsForPhoneArb, (calls) => {
          const summary = computeProfileSummary(calls);
          const manual = calls.filter(
            (c) => c.status === 'resolved' || c.status === 'closed',
          ).length;

          expect(summary.resolvedCount).toBe(manual);
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'openFollowUps equals count of calls with followupRootId AND open/in_progress/escalated status',
    () => {
      fc.assert(
        fc.property(callsForPhoneArb, (calls) => {
          const summary = computeProfileSummary(calls);
          const manual = calls.filter(
            (c) =>
              c.followupRootId !== null &&
              (c.status === 'open' || c.status === 'in_progress' || c.status === 'escalated'),
          ).length;

          expect(summary.openFollowUps).toBe(manual);
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'followUpChains equals the count of distinct root call IDs referenced',
    () => {
      fc.assert(
        fc.property(callsForPhoneArb, (calls) => {
          const summary = computeProfileSummary(calls);
          const manual = new Set(
            calls.filter((c) => c.followupRootId !== null).map((c) => c.followupRootId),
          ).size;

          expect(summary.followUpChains).toBe(manual);
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'summary stats are always non-negative',
    () => {
      fc.assert(
        fc.property(callsForPhoneArb, (calls) => {
          const summary = computeProfileSummary(calls);

          expect(summary.totalCalls).toBeGreaterThanOrEqual(0);
          expect(summary.openFollowUps).toBeGreaterThanOrEqual(0);
          expect(summary.resolvedCount).toBeGreaterThanOrEqual(0);
          expect(summary.followUpChains).toBeGreaterThanOrEqual(0);
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'resolvedCount + non-resolved count = totalCalls (partition completeness)',
    () => {
      fc.assert(
        fc.property(callsForPhoneArb, (calls) => {
          const summary = computeProfileSummary(calls);
          const nonResolvedCount = calls.filter(
            (c) => c.status !== 'resolved' && c.status !== 'closed',
          ).length;

          expect(summary.resolvedCount + nonResolvedCount).toBe(summary.totalCalls);
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'openFollowUps never exceeds totalCalls',
    () => {
      fc.assert(
        fc.property(callsForPhoneArb, (calls) => {
          const summary = computeProfileSummary(calls);
          expect(summary.openFollowUps).toBeLessThanOrEqual(summary.totalCalls);
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'followUpChains never exceeds totalCalls',
    () => {
      fc.assert(
        fc.property(callsForPhoneArb, (calls) => {
          const summary = computeProfileSummary(calls);
          expect(summary.followUpChains).toBeLessThanOrEqual(summary.totalCalls);
        }),
        { numRuns: 100 },
      );
    },
  );
});
