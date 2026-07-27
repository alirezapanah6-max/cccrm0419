import { Request, Response, NextFunction } from 'express';

/**
 * Restricted key prefixes that agents cannot access at all.
 * Any key starting with these prefixes is blocked for non-admin users.
 */
const AGENT_BLOCKED_PREFIXES = ['dashboard:', 'performance:'];

/**
 * Check whether a given role + action + key/prefix combination is permitted.
 *
 * Rules:
 * 1. Admin: full access to everything
 * 2. Agent restrictions:
 *    - CANNOT write (set/delete) to `users-data` key
 *    - CANNOT access (read or write) keys starting with `dashboard:` or `performance:`
 *    - CAN read `users-data` (needed to show user list in UI)
 *    - CAN read/write their own calls (`call:*`)
 *    - CAN read/write `categories-data`
 *    - CAN read/write any other kv_store key
 *
 * @returns true if the operation is allowed, false if denied
 */
export function checkStoragePermission(
  role: string,
  action: string,
  key?: string,
  prefix?: string,
): boolean {
  // Admin has full access
  if (role === 'admin') {
    return true;
  }

  // For agent role, apply restrictions
  const effectiveKey = key || prefix || '';

  // Block access to dashboard/performance data keys (any action)
  if (isBlockedPrefix(effectiveKey)) {
    return false;
  }

  // Block write operations on users-data (set/delete)
  if (effectiveKey === 'users-data' && (action === 'set' || action === 'delete')) {
    return false;
  }

  // Block list with prefix matching blocked prefixes
  if (action === 'list' && prefix && isBlockedPrefix(prefix)) {
    return false;
  }

  // All other operations are allowed for agents
  return true;
}

/**
 * Check if a key starts with any of the blocked prefixes for agents.
 */
function isBlockedPrefix(key: string): boolean {
  return AGENT_BLOCKED_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/**
 * Express middleware that enforces RBAC on storage requests.
 *
 * Must be used AFTER auth middleware (req.user must be populated).
 * Inspects the storage request body's `action`, `key`, and `prefix` fields.
 */
export function rbacMiddleware(req: Request, res: Response, next: NextFunction): void {
  // If no user is attached (shouldn't happen if auth middleware ran first), deny
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const { action, key, prefix } = req.body as {
    action?: string;
    key?: string;
    prefix?: string;
  };

  const allowed = checkStoragePermission(req.user.role, action || '', key, prefix);

  if (!allowed) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  next();
}
