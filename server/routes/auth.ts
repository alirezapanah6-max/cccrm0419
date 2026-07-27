import { Router, Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { prisma } from '../utils/prisma.js';
import { hashPassword, verifyPassword, signToken, verifyToken } from '../utils/auth.js';
import { LoginSchema, RegisterSchema } from '../utils/schemas.js';

const router = Router();

/** Cookie configuration for the JWT token */
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
};

/**
 * POST /api/auth/login
 *
 * Authenticates user with username + password.
 * Supports bcrypt verification and SHA-256 migration (legacy).
 * On success, sets an HttpOnly JWT cookie and returns user info.
 */
router.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(401).json({ error: 'نام کاربری یا رمز عبور اشتباه است' });
      return;
    }

    const { username, password } = parsed.data;

    // Look up active user by username
    const user = await prisma.user.findFirst({
      where: { username, isActive: true },
    });

    if (!user) {
      res.status(401).json({ error: 'نام کاربری یا رمز عبور اشتباه است' });
      return;
    }

    // Try bcrypt verification first
    let passwordValid = await verifyPassword(password, user.passwordHash);

    // If bcrypt fails, try SHA-256 migration scenario
    if (!passwordValid) {
      const sha256Hash = createHash('sha256').update(password).digest('hex');

      if (sha256Hash === user.passwordHash) {
        // Legacy SHA-256 match — re-hash with bcrypt and update DB
        passwordValid = true;
        const newHash = await hashPassword(password);
        await prisma.user.update({
          where: { id: user.id },
          data: { passwordHash: newHash },
        });
      }
    }

    if (!passwordValid) {
      res.status(401).json({ error: 'نام کاربری یا رمز عبور اشتباه است' });
      return;
    }

    // Sign JWT and set cookie
    const token = signToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    res.cookie('token', token, COOKIE_OPTIONS);
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
    });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/register
 *
 * Creates a new user account.
 * - Bootstrap mode (no users in DB): no auth required, first user becomes admin.
 * - Normal mode: requires authenticated admin.
 */
router.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    // Check if bootstrap mode (no users exist)
    const userCount = await prisma.user.count();
    const isBootstrap = userCount === 0;

    // If not bootstrap mode, require admin authentication
    if (!isBootstrap) {
      const tokenPayload = extractTokenPayload(req);

      if (!tokenPayload) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      if (tokenPayload.role !== 'admin') {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }
    }

    // Validate request body
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      res.status(400).json({ message: 'Validation failed', errors });
      return;
    }

    const { username, displayName, password } = parsed.data;

    // Check username uniqueness
    const existingUser = await prisma.user.findFirst({
      where: { username },
    });

    if (existingUser) {
      res.status(400).json({ error: 'Username already exists' });
      return;
    }

    // Hash password with bcrypt
    const passwordHash = await hashPassword(password);

    // Determine role
    let role: string;
    if (isBootstrap) {
      role = 'admin';
    } else {
      // Admin creating a user — use role from request body if provided, else default to 'agent'
      role = (req.body.role === 'admin' || req.body.role === 'agent')
        ? req.body.role
        : 'agent';
    }

    // Create the user
    const newUser = await prisma.user.create({
      data: {
        username,
        displayName,
        passwordHash,
        role,
        isActive: true,
      },
    });

    const userResponse = {
      id: newUser.id,
      username: newUser.username,
      displayName: newUser.displayName,
      role: newUser.role,
    };

    // In bootstrap mode, auto-login (set cookie)
    if (isBootstrap) {
      const token = signToken({
        userId: newUser.id,
        username: newUser.username,
        role: newUser.role,
      });

      res.cookie('token', token, COOKIE_OPTIONS);
    }

    res.json({ success: true, user: userResponse });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/logout
 *
 * Clears the token cookie.
 */
router.post('/api/auth/logout', (_req: Request, res: Response) => {
  res.clearCookie('token', { path: '/' });
  res.json({ success: true });
});

/**
 * Extract and verify token from cookie or Authorization header.
 * Used in the register endpoint to manually verify auth since
 * the auth middleware hasn't been applied at this route.
 */
function extractTokenPayload(req: Request) {
  // Try cookie first
  let token: string | undefined = req.cookies?.token;

  // Try Authorization header
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }
  }

  if (!token) return null;

  return verifyToken(token);
}

export default router;
