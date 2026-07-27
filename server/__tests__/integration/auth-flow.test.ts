/**
 * Integration tests: Full auth flow through the Express HTTP layer.
 * Uses supertest — no real database, Prisma is fully mocked.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

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
    $queryRaw: vi.fn(),
    $disconnect: vi.fn(),
  },
  disconnect: vi.fn(),
}));

import request from 'supertest';
import bcrypt from 'bcryptjs';
import { signToken } from '../../utils/auth.js';
import { prisma } from '../../utils/prisma.js';
import app from '../../app.js';

// Typed mock helpers
const mockUserCount = prisma.user.count as ReturnType<typeof vi.fn>;
const mockUserFindFirst = prisma.user.findFirst as ReturnType<typeof vi.fn>;
const mockUserFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const mockUserCreate = prisma.user.create as ReturnType<typeof vi.fn>;
const mockQueryRaw = prisma.$queryRaw as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Bootstrap mode — POST /api/auth/register
// ---------------------------------------------------------------------------
describe('POST /api/auth/register — bootstrap mode', () => {
  it('creates the first admin user and returns a cookie when no users exist', async () => {
    mockUserCount.mockResolvedValue(0);
    mockUserFindFirst.mockResolvedValue(null); // no duplicate username
    mockUserCreate.mockResolvedValue({
      id: 'usr_1',
      username: 'admin',
      displayName: 'Admin',
      role: 'admin',
      isActive: true,
      passwordHash: 'hash',
    });

    const res = await request(app).post('/api/auth/register').send({
      username: 'admin',
      displayName: 'Admin',
      password: 'secret123',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.role).toBe('admin');

    // Cookie must be set
    const setCookie = res.headers['set-cookie'] as string[] | string | undefined;
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie ?? ''];
    expect(cookies.some((c) => c.startsWith('token='))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Login success
// ---------------------------------------------------------------------------
describe('POST /api/auth/login', () => {
  it('returns 200, sets token cookie, and returns user object on correct credentials', async () => {
    const hash = await bcrypt.hash('secret123', 10);
    const fakeUser = {
      id: 'usr_1',
      username: 'admin',
      displayName: 'Admin',
      role: 'admin',
      isActive: true,
      passwordHash: hash,
    };

    mockUserFindFirst.mockResolvedValue(fakeUser);

    const res = await request(app).post('/api/auth/login').send({
      username: 'admin',
      password: 'secret123',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user).toMatchObject({
      id: 'usr_1',
      username: 'admin',
      displayName: 'Admin',
      role: 'admin',
    });

    const setCookie = res.headers['set-cookie'] as string[] | string | undefined;
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie ?? ''];
    expect(cookies.some((c) => c.startsWith('token='))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 3. Login failure — wrong password
  // -------------------------------------------------------------------------
  it('returns 401 with Persian error message on wrong password', async () => {
    const hash = await bcrypt.hash('correct-password', 10);
    mockUserFindFirst.mockResolvedValue({
      id: 'usr_1',
      username: 'admin',
      displayName: 'Admin',
      role: 'admin',
      isActive: true,
      passwordHash: hash,
    });

    const res = await request(app).post('/api/auth/login').send({
      username: 'admin',
      password: 'wrong-password',
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('نام کاربری یا رمز عبور اشتباه است');
  });

  // -------------------------------------------------------------------------
  // 4. Login failure — unknown user
  // -------------------------------------------------------------------------
  it('returns 401 with same Persian error message for unknown username', async () => {
    mockUserFindFirst.mockResolvedValue(null);

    const res = await request(app).post('/api/auth/login').send({
      username: 'nobody',
      password: 'whatever',
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('نام کاربری یا رمز عبور اشتباه است');
  });
});

// ---------------------------------------------------------------------------
// 5. Unauthenticated storage request — POST /api/storage without cookie
// ---------------------------------------------------------------------------
describe('POST /api/storage — unauthenticated', () => {
  it('returns 401 when no cookie is provided', async () => {
    const res = await request(app).post('/api/storage').send('action=get&key=test');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });
});

// ---------------------------------------------------------------------------
// 6. Logout — POST /api/auth/logout
// ---------------------------------------------------------------------------
describe('POST /api/auth/logout', () => {
  it('returns 200 and clears the token cookie', async () => {
    const res = await request(app).post('/api/auth/logout');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Cookie must be cleared (expires in the past / empty value)
    const setCookie = res.headers['set-cookie'] as string[] | string | undefined;
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie ?? ''];
    const tokenCookie = cookies.find((c) => c.startsWith('token='));
    expect(tokenCookie).toBeDefined();
    // Cleared cookies either have empty value or Max-Age=0 / Expires in the past
    expect(tokenCookie).toMatch(/token=;|token=\s*;|Max-Age=0/i);
  });
});

// ---------------------------------------------------------------------------
// 7. Health check — GET /api/health
// ---------------------------------------------------------------------------
describe('GET /api/health', () => {
  it('returns 200 with { status: "healthy" } when DB responds', async () => {
    mockQueryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
  });
});

// ---------------------------------------------------------------------------
// 8. 404 catch-all
// ---------------------------------------------------------------------------
describe('GET /api/nonexistent', () => {
  it('returns 404 with { error: "Not found" } for an authenticated request to an unknown route', async () => {
    // Auth middleware runs before the 404 handler, so we need a valid token.
    // Mock the DB lookup so the middleware passes the request through.
    mockUserFindUnique.mockResolvedValue({ isActive: true });

    const token = signToken({ userId: 'usr_test', username: 'testuser', role: 'admin' });
    const res = await request(app)
      .get('/api/nonexistent')
      .set('Cookie', `token=${token}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });
});
