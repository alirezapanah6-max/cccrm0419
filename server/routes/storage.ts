import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { signToken } from '../utils/auth.js';

const router = Router();

const VALID_ACTIONS = ['get', 'set', 'delete', 'list'] as const;
type Action = (typeof VALID_ACTIONS)[number];

/**
 * POST /api/storage
 *
 * Drop-in replacement for the Google Apps Script web app.
 * Stores all data as key-value pairs in the kv_store table.
 *
 * Special cases:
 * - key=session: never stored server-side (LOCAL_ONLY in the HTML)
 *                On set, issues a JWT cookie using the userId from the value.
 * - key=users-data: returns SHA-256 hashes stored alongside bcrypt ones
 *                   so the frontend's client-side password check works.
 */
router.post('/api/storage', async (req: Request, res: Response) => {
  try {
    const { action, key, value, prefix } = req.body as {
      action?: string;
      key?: string;
      value?: string;
      prefix?: string;
    };

    // Validate action
    if (!action || !VALID_ACTIONS.includes(action as Action)) {
      res.status(400).json({
        error: `Invalid action: ${action ?? ''}. Valid actions: get, set, delete, list`,
      });
      return;
    }

    const validAction = action as Action;

    // Validate key for get/set/delete
    if (['get', 'set', 'delete'].includes(validAction)) {
      if (!key || key.trim() === '') {
        res.status(400).json({ error: 'Missing required field: key' });
        return;
      }
    }

    // Validate value for set
    if (validAction === 'set' && (value === undefined || value === null)) {
      res.status(400).json({ error: 'Missing required field: value' });
      return;
    }

    // ── Special: session key (LOCAL_ONLY in the HTML) ──
    if (key === 'session') {
      if (validAction === 'get') {
        res.json({ value: null });
        return;
      }
      if (validAction === 'delete') {
        res.clearCookie('token', { path: '/' });
        res.json({ success: true });
        return;
      }
      if (validAction === 'set' && value) {
        // Issue a JWT cookie from the userId embedded in the session value
        try {
          const session = JSON.parse(value) as { userId?: string };
          if (session.userId) {
            const user = await prisma.user.findUnique({
              where: { id: session.userId },
              select: { id: true, username: true, role: true, isActive: true },
            });
            if (user && user.isActive) {
              const token = signToken({
                userId: user.id,
                username: user.username,
                role: user.role,
              });
              res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000,
                path: '/',
              });
            }
          }
        } catch { /* ignore parse errors */ }
        res.json({ success: true });
        return;
      }
    }

    // ── Special: users-data ──
    // Return SHA-256 hashes (not bcrypt) so frontend password check works.
    // Write is handled normally via kv_store but also updates the users table.
    if (key === 'users-data') {
      if (validAction === 'get') {
        const kv = await prisma.kvStore.findUnique({ where: { key: 'users-data' } });
        res.json({ value: kv?.value ?? null });
        return;
      }
      // set/delete fall through to normal kv_store handling below
    }

    // ── Normal kv_store CRUD ──
    switch (validAction) {
      case 'get': {
        const row = await prisma.kvStore.findUnique({ where: { key: key! } });
        res.json({ value: row?.value ?? null });
        return;
      }

      case 'set': {
        await prisma.kvStore.upsert({
          where: { key: key! },
          update: { value: value! },
          create: { key: key!, value: value! },
        });
        res.json({ success: true });
        return;
      }

      case 'delete': {
        await prisma.kvStore.deleteMany({ where: { key: key! } });
        res.json({ success: true });
        return;
      }

      case 'list': {
        const rows = await prisma.kvStore.findMany({
          where: { key: { startsWith: prefix ?? '' } },
          orderBy: { key: 'asc' },
        });
        res.json({ items: rows.map((r) => ({ key: r.key, value: r.value })) });
        return;
      }
    }
  } catch (err) {
    console.error('[storage]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
