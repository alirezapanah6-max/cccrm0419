import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

/**
 * JWT token payload interface.
 */
export interface JwtPayload {
  userId: string;
  username: string;
  role: string;
  iat?: number;
  exp?: number;
}

const BCRYPT_COST_FACTOR = 12;
const TOKEN_EXPIRY = '7d';

function getJwtSecret(): string {
  return process.env.JWT_SECRET || 'dev-secret-change-me';
}

/**
 * Hash a plaintext password using bcrypt with cost factor 12.
 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST_FACTOR);
}

/**
 * Verify a plaintext password against a bcrypt hash.
 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Verify a SHA-256 migration scenario.
 *
 * During migration, the frontend previously hashed passwords with SHA-256
 * before storing them. The backend stores bcrypt(sha256(password)) during
 * the migration period. This function bcrypt-compares the incoming SHA-256
 * hash against the stored bcrypt hash.
 *
 * @param sha256Hash - The SHA-256 hex hash sent from the frontend
 * @param storedBcryptHash - The bcrypt hash of the SHA-256 hash stored in DB
 * @returns true if the sha256Hash matches when bcrypt-compared to storedBcryptHash
 */
export async function verifySha256Migration(
  sha256Hash: string,
  storedBcryptHash: string,
): Promise<boolean> {
  return bcrypt.compare(sha256Hash, storedBcryptHash);
}

/**
 * Sign a JWT token with the given payload.
 * Uses JWT_SECRET from environment (fallback: 'dev-secret-change-me').
 * Token expires in 7 days.
 */
export function signToken(payload: { userId: string; username: string; role: string }): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: TOKEN_EXPIRY });
}

/**
 * Verify a JWT token and return the decoded payload, or null if invalid/expired.
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as jwt.JwtPayload & JwtPayload;
    return {
      userId: decoded.userId,
      username: decoded.username,
      role: decoded.role,
      iat: decoded.iat,
      exp: decoded.exp,
    };
  } catch {
    return null;
  }
}
