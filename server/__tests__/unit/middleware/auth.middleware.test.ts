import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { signToken } from '../../../utils/auth.js';

// Mock prisma
vi.mock('../../../utils/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from '../../../utils/prisma.js';
import { authMiddleware } from '../../../middleware/auth.middleware.js';

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    method: 'POST',
    path: '/api/storage',
    cookies: {},
    headers: {},
    ...overrides,
  } as unknown as Request;
}

function createMockRes(): Response & { statusCode: number; body: unknown } {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: unknown) {
      res.body = data;
      return res;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

describe('authMiddleware', () => {
  let mockNext: NextFunction;

  beforeEach(() => {
    mockNext = vi.fn();
    vi.clearAllMocks();
  });

  describe('public routes', () => {
    it('should skip auth for GET /api/health', async () => {
      const req = createMockReq({ method: 'GET', path: '/api/health' });
      const res = createMockRes();

      await authMiddleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should skip auth for POST /api/auth/login', async () => {
      const req = createMockReq({ method: 'POST', path: '/api/auth/login' });
      const res = createMockRes();

      await authMiddleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should skip auth for POST /api/auth/register', async () => {
      const req = createMockReq({ method: 'POST', path: '/api/auth/register' });
      const res = createMockRes();

      await authMiddleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('missing token', () => {
    it('should return 401 when no token in cookie or header', async () => {
      const req = createMockReq();
      const res = createMockRes();

      await authMiddleware(req, res, mockNext);

      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: 'Authentication required' });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('invalid token', () => {
    it('should return 401 for a malformed token', async () => {
      const req = createMockReq({
        cookies: { token: 'not-a-valid-jwt' },
      });
      const res = createMockRes();

      await authMiddleware(req, res, mockNext);

      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: 'Authentication required' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 for an expired token', async () => {
      // Sign a token that's already expired
      const jwt = await import('jsonwebtoken');
      const token = jwt.default.sign(
        { userId: 'u1', username: 'test', role: 'admin' },
        process.env.JWT_SECRET || 'dev-secret-change-me',
        { expiresIn: '-1s' },
      );
      const req = createMockReq({ cookies: { token } });
      const res = createMockRes();

      await authMiddleware(req, res, mockNext);

      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: 'Authentication required' });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('valid token from cookie', () => {
    it('should attach user to request and call next when user is active', async () => {
      const token = signToken({ userId: 'user-1', username: 'admin', role: 'admin' });
      const req = createMockReq({ cookies: { token } });
      const res = createMockRes();

      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        isActive: true,
      });

      await authMiddleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user?.userId).toBe('user-1');
      expect(req.user?.username).toBe('admin');
      expect(req.user?.role).toBe('admin');
    });

    it('should return 401 when user is deactivated', async () => {
      const token = signToken({ userId: 'user-2', username: 'agent1', role: 'agent' });
      const req = createMockReq({ cookies: { token } });
      const res = createMockRes();

      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        isActive: false,
      });

      await authMiddleware(req, res, mockNext);

      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: 'Authentication required' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when user not found in DB', async () => {
      const token = signToken({ userId: 'nonexistent', username: 'ghost', role: 'admin' });
      const req = createMockReq({ cookies: { token } });
      const res = createMockRes();

      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await authMiddleware(req, res, mockNext);

      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: 'Authentication required' });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('valid token from Authorization header', () => {
    it('should extract token from Bearer header', async () => {
      const token = signToken({ userId: 'user-3', username: 'agent2', role: 'agent' });
      const req = createMockReq({
        headers: { authorization: `Bearer ${token}` } as any,
      });
      const res = createMockRes();

      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        isActive: true,
      });

      await authMiddleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(req.user?.userId).toBe('user-3');
      expect(req.user?.role).toBe('agent');
    });
  });

  describe('cookie takes priority over header', () => {
    it('should prefer cookie token over Authorization header', async () => {
      const cookieToken = signToken({ userId: 'cookie-user', username: 'fromcookie', role: 'admin' });
      const headerToken = signToken({ userId: 'header-user', username: 'fromheader', role: 'agent' });

      const req = createMockReq({
        cookies: { token: cookieToken },
        headers: { authorization: `Bearer ${headerToken}` } as any,
      });
      const res = createMockRes();

      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        isActive: true,
      });

      await authMiddleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(req.user?.userId).toBe('cookie-user');
    });
  });

  describe('database error handling', () => {
    it('should return 500 when database query fails', async () => {
      const token = signToken({ userId: 'user-1', username: 'admin', role: 'admin' });
      const req = createMockReq({ cookies: { token } });
      const res = createMockRes();

      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('DB connection failed'),
      );

      await authMiddleware(req, res, mockNext);

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
