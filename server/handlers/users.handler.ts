import { prisma } from '../utils/prisma.js';
import { hashPassword } from '../utils/auth.js';
import { createHash } from 'node:crypto';

/**
 * Frontend user object shape.
 */
interface FrontendUser {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  role: string;
  active: boolean;
  createdAt: number;
}

/**
 * Derive a SHA-256 hash from a bcrypt hash for client-side comparison.
 * The frontend SHA-256s the plaintext password and compares against this value.
 *
 * We store an extra field `sha256Hash` in a kv_store entry keyed by userId
 * so the client can do its local comparison. If not found, we return a
 * fixed sentinel that will never match any real SHA-256 hash, forcing
 * the user to go through the server-side /api/auth/login flow instead.
 */
async function getSha256HashForUser(userId: string): Promise<string> {
  const kv = await prisma.kvStore.findUnique({
    where: { key: `sha256:${userId}` },
  });
  return kv?.value ?? '__server_auth_only__';
}

/**
 * Get all users from DB, serialized to frontend format.
 * Returns the SHA-256 hash stored in kv_store for client-side comparison.
 * Falls back to a sentinel value that never matches, requiring server-side auth.
 */
export async function usersGet(): Promise<{ value: string }> {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
  });

  const frontendUsers: FrontendUser[] = await Promise.all(
    users.map(async (u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      passwordHash: await getSha256HashForUser(u.id),
      role: u.role,
      active: u.isActive,
      createdAt: u.createdAt.getTime(),
    })),
  );

  return { value: JSON.stringify(frontendUsers) };
}

/**
 * Set (sync) users from the frontend's full user list.
 *
 * The frontend sends the complete user array. The handler:
 * - Parses the JSON array
 * - For each user: update if exists, create if new
 * - If password changed (not "***"), bcrypt-hash the new password
 * - Enforces last-admin protection
 *
 * @param value - JSON string of the full user array
 * @param requestingUser - The authenticated user making the request
 */
export async function usersSet(
  value: string,
  requestingUser: { userId: string; role: string },
): Promise<{ success: true } | { error: string }> {
  let incomingUsers: FrontendUser[];

  try {
    incomingUsers = JSON.parse(value);
  } catch {
    return { error: 'Invalid JSON for users-data value' };
  }

  if (!Array.isArray(incomingUsers)) {
    return { error: 'users-data value must be a JSON array' };
  }

  // Enforce last-admin protection:
  // Count how many active admins would remain after this update
  const activeAdminsInPayload = incomingUsers.filter(
    (u) => u.role === 'admin' && u.active !== false,
  );

  if (activeAdminsInPayload.length === 0) {
    return { error: 'Cannot deactivate the last active admin' };
  }

  // Process each user in the incoming array
  for (const incomingUser of incomingUsers) {
    const existingUser = await prisma.user.findUnique({
      where: { id: incomingUser.id },
    });

    if (existingUser) {
      // Update existing user
      const updateData: {
        displayName?: string;
        role?: string;
        isActive?: boolean;
        passwordHash?: string;
      } = {
        displayName: incomingUser.displayName,
        role: incomingUser.role,
        isActive: incomingUser.active,
      };

      // If password changed (not the placeholder), hash and update
      if (incomingUser.passwordHash && incomingUser.passwordHash !== '***' && incomingUser.passwordHash !== '__server_auth_only__') {
        // If it looks like a SHA-256 hex string (64 chars), treat as already-hashed client input
        const isSha256 = /^[a-f0-9]{64}$/.test(incomingUser.passwordHash);
        if (isSha256) {
          // Store the SHA-256 for client comparison, store bcrypt for server auth
          updateData.passwordHash = await hashPassword(incomingUser.passwordHash);
          await prisma.kvStore.upsert({
            where: { key: `sha256:${incomingUser.id}` },
            update: { value: incomingUser.passwordHash },
            create: { key: `sha256:${incomingUser.id}`, value: incomingUser.passwordHash },
          });
        } else {
          // Plaintext — hash with bcrypt and store SHA-256
          const sha256 = createHash('sha256').update(incomingUser.passwordHash).digest('hex');
          updateData.passwordHash = await hashPassword(incomingUser.passwordHash);
          await prisma.kvStore.upsert({
            where: { key: `sha256:${incomingUser.id}` },
            update: { value: sha256 },
            create: { key: `sha256:${incomingUser.id}`, value: sha256 },
          });
        }
      }

      await prisma.user.update({
        where: { id: incomingUser.id },
        data: updateData,
      });
    } else {
      // Create new user — password must be provided (not placeholder)
      if (!incomingUser.passwordHash || incomingUser.passwordHash === '***' || incomingUser.passwordHash === '__server_auth_only__') {
        return { error: `New user "${incomingUser.username}" must have a password` };
      }

      const isSha256 = /^[a-f0-9]{64}$/.test(incomingUser.passwordHash);
      const sha256Hash = isSha256
        ? incomingUser.passwordHash
        : createHash('sha256').update(incomingUser.passwordHash).digest('hex');
      const hashedPassword = await hashPassword(isSha256 ? incomingUser.passwordHash : incomingUser.passwordHash);

      const created = await prisma.user.create({
        data: {
          id: incomingUser.id,
          username: incomingUser.username,
          displayName: incomingUser.displayName,
          passwordHash: hashedPassword,
          role: incomingUser.role,
          isActive: incomingUser.active !== false,
        },
      });

      // Store SHA-256 for client-side comparison
      await prisma.kvStore.upsert({
        where: { key: `sha256:${created.id}` },
        update: { value: sha256Hash },
        create: { key: `sha256:${created.id}`, value: sha256Hash },
      });
    }
  }

  return { success: true };
}

/**
 * Delete handler for users-data key.
 * Not typically called but handled gracefully.
 */
export async function usersDelete(): Promise<{ success: true }> {
  return { success: true };
}
