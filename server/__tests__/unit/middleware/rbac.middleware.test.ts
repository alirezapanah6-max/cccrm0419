import { describe, it, expect } from 'vitest';
import { checkStoragePermission } from '../../../middleware/rbac.middleware.js';

describe('checkStoragePermission', () => {
  describe('Admin role', () => {
    it('allows admin full access to any key and action', () => {
      expect(checkStoragePermission('admin', 'get', 'users-data')).toBe(true);
      expect(checkStoragePermission('admin', 'set', 'users-data')).toBe(true);
      expect(checkStoragePermission('admin', 'delete', 'users-data')).toBe(true);
      expect(checkStoragePermission('admin', 'get', 'dashboard:stats')).toBe(true);
      expect(checkStoragePermission('admin', 'set', 'dashboard:stats')).toBe(true);
      expect(checkStoragePermission('admin', 'get', 'performance:report')).toBe(true);
      expect(checkStoragePermission('admin', 'set', 'performance:report')).toBe(true);
      expect(checkStoragePermission('admin', 'list', undefined, 'dashboard:')).toBe(true);
      expect(checkStoragePermission('admin', 'list', undefined, 'call:')).toBe(true);
    });
  });

  describe('Agent role — users-data', () => {
    it('allows agent to read users-data', () => {
      expect(checkStoragePermission('agent', 'get', 'users-data')).toBe(true);
    });

    it('denies agent write (set) to users-data', () => {
      expect(checkStoragePermission('agent', 'set', 'users-data')).toBe(false);
    });

    it('denies agent delete on users-data', () => {
      expect(checkStoragePermission('agent', 'delete', 'users-data')).toBe(false);
    });
  });

  describe('Agent role — dashboard/performance data', () => {
    it('denies agent access to dashboard: keys (get)', () => {
      expect(checkStoragePermission('agent', 'get', 'dashboard:overview')).toBe(false);
    });

    it('denies agent access to dashboard: keys (set)', () => {
      expect(checkStoragePermission('agent', 'set', 'dashboard:stats')).toBe(false);
    });

    it('denies agent access to performance: keys (get)', () => {
      expect(checkStoragePermission('agent', 'get', 'performance:monthly')).toBe(false);
    });

    it('denies agent access to performance: keys (set)', () => {
      expect(checkStoragePermission('agent', 'set', 'performance:agent-report')).toBe(false);
    });

    it('denies agent list with dashboard: prefix', () => {
      expect(checkStoragePermission('agent', 'list', undefined, 'dashboard:')).toBe(false);
    });

    it('denies agent list with performance: prefix', () => {
      expect(checkStoragePermission('agent', 'list', undefined, 'performance:')).toBe(false);
    });
  });

  describe('Agent role — allowed operations', () => {
    it('allows agent to read/write calls', () => {
      expect(checkStoragePermission('agent', 'get', 'call:123')).toBe(true);
      expect(checkStoragePermission('agent', 'set', 'call:456')).toBe(true);
      expect(checkStoragePermission('agent', 'delete', 'call:789')).toBe(true);
      expect(checkStoragePermission('agent', 'list', undefined, 'call:')).toBe(true);
    });

    it('allows agent to read/write categories-data', () => {
      expect(checkStoragePermission('agent', 'get', 'categories-data')).toBe(true);
      expect(checkStoragePermission('agent', 'set', 'categories-data')).toBe(true);
    });

    it('allows agent to read/write other kv_store keys', () => {
      expect(checkStoragePermission('agent', 'get', 'some-random-key')).toBe(true);
      expect(checkStoragePermission('agent', 'set', 'some-random-key')).toBe(true);
      expect(checkStoragePermission('agent', 'delete', 'some-random-key')).toBe(true);
      expect(checkStoragePermission('agent', 'list', undefined, 'some-prefix')).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('handles undefined key and prefix', () => {
      expect(checkStoragePermission('agent', 'list', undefined, undefined)).toBe(true);
      expect(checkStoragePermission('admin', 'list', undefined, undefined)).toBe(true);
    });

    it('handles empty string key', () => {
      expect(checkStoragePermission('agent', 'get', '')).toBe(true);
    });
  });
});
