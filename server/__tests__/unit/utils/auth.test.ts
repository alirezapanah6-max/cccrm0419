import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  verifySha256Migration,
  signToken,
  verifyToken,
} from '../../../utils/auth.js';
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';

describe('auth utilities', () => {
  const originalEnv = process.env.JWT_SECRET;

  beforeEach(() => {
    delete process.env.JWT_SECRET;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.JWT_SECRET = originalEnv;
    } else {
      delete process.env.JWT_SECRET;
    }
  });

  describe('hashPassword', () => {
    it('should return a valid bcrypt hash', async () => {
      const hash = await hashPassword('my-secret');
      expect(hash).toMatch(/^\$2[aby]?\$\d{2}\$/);
    });

    it('should use cost factor 12', async () => {
      const hash = await hashPassword('test-password');
      const rounds = bcrypt.getRounds(hash);
      expect(rounds).toBe(12);
    });

    it('should produce different hashes for the same password (salted)', async () => {
      const hash1 = await hashPassword('same-password');
      const hash2 = await hashPassword('same-password');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyPassword', () => {
    it('should return true for correct password', async () => {
      const hash = await hashPassword('correct-password');
      const result = await verifyPassword('correct-password', hash);
      expect(result).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const hash = await hashPassword('correct-password');
      const result = await verifyPassword('wrong-password', hash);
      expect(result).toBe(false);
    });
  });

  describe('verifySha256Migration', () => {
    it('should return true when sha256 hash matches bcrypt of sha256', async () => {
      const password = 'user-password';
      const sha256Hash = createHash('sha256').update(password).digest('hex');
      // Simulate what the backend stores during migration: bcrypt(sha256(password))
      const storedBcrypt = await bcrypt.hash(sha256Hash, 12);

      const result = await verifySha256Migration(sha256Hash, storedBcrypt);
      expect(result).toBe(true);
    });

    it('should return false when sha256 hash does not match', async () => {
      const sha256Hash = createHash('sha256').update('password-a').digest('hex');
      const differentSha256 = createHash('sha256').update('password-b').digest('hex');
      const storedBcrypt = await bcrypt.hash(differentSha256, 12);

      const result = await verifySha256Migration(sha256Hash, storedBcrypt);
      expect(result).toBe(false);
    });
  });

  describe('signToken', () => {
    it('should return a JWT string with three dot-separated parts', () => {
      const token = signToken({ userId: 'usr_1', username: 'admin', role: 'admin' });
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
    });

    it('should use the fallback secret when JWT_SECRET is not set', () => {
      delete process.env.JWT_SECRET;
      const token = signToken({ userId: 'usr_1', username: 'admin', role: 'admin' });
      // Should not throw and should produce a valid token
      expect(token).toBeTruthy();
    });

    it('should use JWT_SECRET from environment when set', () => {
      process.env.JWT_SECRET = 'custom-secret';
      const token = signToken({ userId: 'usr_1', username: 'admin', role: 'admin' });
      // Verify with the custom secret
      const payload = verifyToken(token);
      expect(payload).not.toBeNull();
      expect(payload!.userId).toBe('usr_1');
    });
  });

  describe('verifyToken', () => {
    it('should return the payload for a valid token', () => {
      const token = signToken({ userId: 'usr_abc', username: 'testuser', role: 'agent' });
      const payload = verifyToken(token);
      expect(payload).not.toBeNull();
      expect(payload!.userId).toBe('usr_abc');
      expect(payload!.username).toBe('testuser');
      expect(payload!.role).toBe('agent');
      expect(payload!.iat).toBeTypeOf('number');
      expect(payload!.exp).toBeTypeOf('number');
    });

    it('should return null for an invalid token', () => {
      const result = verifyToken('invalid.token.value');
      expect(result).toBeNull();
    });

    it('should return null for a token signed with a different secret', () => {
      process.env.JWT_SECRET = 'secret-a';
      const token = signToken({ userId: 'usr_1', username: 'admin', role: 'admin' });

      process.env.JWT_SECRET = 'secret-b';
      const result = verifyToken(token);
      expect(result).toBeNull();
    });

    it('should return null for an empty string', () => {
      const result = verifyToken('');
      expect(result).toBeNull();
    });
  });
});
