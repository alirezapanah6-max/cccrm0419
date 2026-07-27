/**
 * Integration tests: Storage API endpoint through the Express HTTP layer.
 * Uses supertest — no real database, Prisma is fully mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set JWT_SECRET before any auth utilities are imported
process.env.JWT_SECRET = 'test-secret';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

// Mock Prisma completely — no real DB
vi.mock('../../utils/prisma.js', () => ({
  prisma: {
    user: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    kvStore: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $disconnect: vi.fn(),
  },
  disconnect: vi.fn(),
}));

import request from 'supertest';
import { signToken } from '../../utils/auth.js';
import { prisma } from '../../utils/prisma.js';
import app from '../../app.js';

// Typed mock helpers
const mockUserFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const mockKvFindUnique = prisma.kvStore.findUnique as ReturnType<typeof vi.fn>;
const mockKvUpsert = prisma.kvStore.upsert as ReturnType<typeof vi.fn>;
const mockKvDeleteMany = prisma.kvStore.deleteMany as ReturnType<typeof vi.fn>;
const mockKvFindMany = prisma.kvStore.findMany as ReturnType<typeof vi.fn>;

/** Build a valid auth cookie header for supertest. */
function authCookie(): string {
  const token = signToken({ userId: 'usr_test', username: 'testuser', role: 'agent' });
  return `token=${token}`;
}

/** Ensure the auth middleware passes for the test user. */
function setupActiveUser(): void {
  mockUserFindUnique.mockResolvedValue({ isActive: true });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helper: send a URL-encoded POST to /api/storage
// ---------------------------------------------------------------------------
function storagePost(
  cookie: string,
  body: Record<string, string>,
): request.Test {
  return request(app)
    .post('/api/storage')
    .set('Cookie', cookie)
    .type('form')
    .send(body);
}

// ---------------------------------------------------------------------------
// 1. action=get — non-existent key returns { value: null }
// ---------------------------------------------------------------------------
describe('POST /api/storage action=get', () => {
  it('returns { value: null } for a non-existent key when authenticated', async () => {
    setupActiveUser();
    mockKvFindUnique.mockResolvedValue(null);

    const res = await storagePost(authCookie(), { action: 'get', key: 'some-unknown-key' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ value: null });
  });
});

// ---------------------------------------------------------------------------
// 2. action=set — stores a value and returns { success: true }
// ---------------------------------------------------------------------------
describe('POST /api/storage action=set', () => {
  it('returns { success: true } when setting a key-value pair', async () => {
    setupActiveUser();
    mockKvUpsert.mockResolvedValue({ key: 'my-key', value: 'my-value' });

    const res = await storagePost(authCookie(), {
      action: 'set',
      key: 'my-key',
      value: 'my-value',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });
});

// ---------------------------------------------------------------------------
// 3. action=delete — deletes a key and returns { success: true }
// ---------------------------------------------------------------------------
describe('POST /api/storage action=delete', () => {
  it('returns { success: true } when deleting a key', async () => {
    setupActiveUser();
    mockKvDeleteMany.mockResolvedValue({ count: 1 });

    const res = await storagePost(authCookie(), { action: 'delete', key: 'my-key' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });
});

// ---------------------------------------------------------------------------
// 4. action=list — returns { items: [] } for an empty store
// ---------------------------------------------------------------------------
describe('POST /api/storage action=list', () => {
  it('returns { items: [] } when no keys match the prefix', async () => {
    setupActiveUser();
    mockKvFindMany.mockResolvedValue([]);

    const res = await storagePost(authCookie(), { action: 'list', prefix: 'no-match:' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [] });
  });
});

// ---------------------------------------------------------------------------
// 5. Invalid action — 400 with error describing valid actions
// ---------------------------------------------------------------------------
describe('POST /api/storage invalid action', () => {
  it('returns 400 with error message listing valid actions', async () => {
    setupActiveUser();

    const res = await storagePost(authCookie(), { action: 'unknown' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid action/i);
    expect(res.body.error).toMatch(/get/);
    expect(res.body.error).toMatch(/set/);
    expect(res.body.error).toMatch(/delete/);
    expect(res.body.error).toMatch(/list/);
  });
});

// ---------------------------------------------------------------------------
// 6. Missing key for get action — 400 with error about missing key
// ---------------------------------------------------------------------------
describe('POST /api/storage missing key for get', () => {
  it('returns 400 with error about missing key field', async () => {
    setupActiveUser();

    const res = await storagePost(authCookie(), { action: 'get' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing required field: key/i);
  });
});

// ---------------------------------------------------------------------------
// 7. Missing value for set action — 400 with error about missing value
// ---------------------------------------------------------------------------
describe('POST /api/storage missing value for set', () => {
  it('returns 400 with error about missing value field', async () => {
    setupActiveUser();

    const res = await storagePost(authCookie(), { action: 'set', key: 'my-key' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing required field: value/i);
  });
});
