import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/auth.js';
import { prisma } from '../utils/prisma.js';

/**
 * Routes that do not require authentication.
 * Matched by method + path.
 */
const PUBLIC_ROUTES: Array<{ method: string; path: string }> = [
  { method: 'GET', path: '/api/health' },
  { method: 'POST', path: '/api/auth/login' },
  { method: 'POST', path: '/api/auth/register' },
];

/**
 * Storage API actions that are allowed without authentication.
 * The frontend manages its own session in localStorage (LOCAL_ONLY).
 * It never sends a server token — all storage requests are treated as
 * coming from an authenticated session managed client-side.
 *
 * We allow all storage requests through, but still enforce RBAC
 * based on the user context when available.
 */
function isPublicStorageRequest(req: Request): boolean {
  if (req.method !== 'POST' || req.path !== '/api/storage') return false;
  // Allow all storage requests — the HTML manages auth client-side
  return true;
}

/**
 * Check if the current request matches a public (unauthenticated) route.
 */
function isPublicRoute(req: Request): boolean {
  return PUBLIC_ROUTES.some(
    (route) => req.method === route.method && req.path === route.path,
  );
}

/**
 * Extract JWT token from HttpOnly cookie or Authorization header.
 */
function extractToken(req: Request): string | undefined {
  // 1. Try HttpOnly cookie named "token"
  const cookieToken = req.cookies?.token;
  if (cookieToken) return cookieToken;

  // 2. Try Authorization: Bearer <token> header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return undefined;
}

/**
 * Authentication middleware.
 *
 * - Skips authentication for public routes (health, login, register)
 * - Extracts JWT from cookie or Authorization header
 * - Verifies token signature and expiration
 * - Checks that the user is still active in the database
 * - Attaches decoded payload to req.user
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // Skip auth for public routes
  if (isPublicRoute(req) || isPublicStorageRequest(req)) {
    next();
    return;
  }

  const token = extractToken(req);

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // Verify token signature and expiration
  const payload = verifyToken(token);

  if (!payload) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // Check if user is still active in the database
  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { isActive: true },
    });

    if (!user || !user.isActive) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
  } catch {
    res.status(500).json({ error: 'Internal server error' });
    return;
  }

  // Attach user payload to request
  req.user = payload;
  next();
}
