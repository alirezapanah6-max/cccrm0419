import { describe, test, expect } from 'vitest';
import { StorageRequestSchema, CallRecordSchema, LoginSchema, RegisterSchema, CategoryTreeSchema } from './schemas.js';

describe('StorageRequestSchema', () => {
  test('accepts valid get request', () => {
    expect(StorageRequestSchema.safeParse({ action: 'get', key: 'test' }).success).toBe(true);
  });

  test('accepts valid list request', () => {
    expect(StorageRequestSchema.safeParse({ action: 'list', prefix: 'call:' }).success).toBe(true);
  });

  test('rejects invalid action', () => {
    expect(StorageRequestSchema.safeParse({ action: 'invalid' }).success).toBe(false);
  });

  test('accepts set/delete actions', () => {
    expect(StorageRequestSchema.safeParse({ action: 'set', key: 'k', value: 'v' }).success).toBe(true);
    expect(StorageRequestSchema.safeParse({ action: 'delete', key: 'k' }).success).toBe(true);
  });
});

describe('CallRecordSchema', () => {
  const validCall = {
    id: 'req_1',
    date: '2024-01-15',
    phone: '09121234567',
    status: 'open' as const,
    agentId: 'usr_1',
    agentName: 'Agent 1',
  };

  test('accepts minimal valid call record', () => {
    expect(CallRecordSchema.safeParse(validCall).success).toBe(true);
  });

  test('accepts full call record with optional fields', () => {
    const full = {
      ...validCall,
      customerName: 'علی احمدی',
      category: 'فروش',
      subCategory: 'مشاوره',
      subSubCategory: '',
      description: 'Test description',
      followupRootId: null,
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    };
    expect(CallRecordSchema.safeParse(full).success).toBe(true);
  });

  test('rejects phone with non-digit characters', () => {
    expect(CallRecordSchema.safeParse({ ...validCall, phone: '0912abc1234' }).success).toBe(false);
  });

  test('rejects phone longer than 11 characters', () => {
    expect(CallRecordSchema.safeParse({ ...validCall, phone: '091212345678' }).success).toBe(false);
  });

  test('accepts phone with fewer than 11 digits', () => {
    expect(CallRecordSchema.safeParse({ ...validCall, phone: '0912123456' }).success).toBe(true);
  });

  test('rejects invalid date format', () => {
    expect(CallRecordSchema.safeParse({ ...validCall, date: '2024-1-5' }).success).toBe(false);
  });

  test('rejects invalid status', () => {
    expect(CallRecordSchema.safeParse({ ...validCall, status: 'unknown' }).success).toBe(false);
  });

  test('createdAt and updatedAt are optional', () => {
    const withoutTimestamps = { ...validCall };
    expect(CallRecordSchema.safeParse(withoutTimestamps).success).toBe(true);
  });
});

describe('LoginSchema', () => {
  test('accepts valid credentials', () => {
    expect(LoginSchema.safeParse({ username: 'admin', password: 'pass123' }).success).toBe(true);
  });

  test('accepts single-char username and password', () => {
    expect(LoginSchema.safeParse({ username: 'a', password: 'b' }).success).toBe(true);
  });

  test('rejects empty username', () => {
    expect(LoginSchema.safeParse({ username: '', password: 'pass' }).success).toBe(false);
  });

  test('rejects empty password', () => {
    expect(LoginSchema.safeParse({ username: 'admin', password: '' }).success).toBe(false);
  });
});

describe('RegisterSchema', () => {
  test('accepts valid registration', () => {
    expect(RegisterSchema.safeParse({ username: 'user1', displayName: 'User One', password: 'pass' }).success).toBe(true);
  });

  test('accepts minimum length fields', () => {
    expect(RegisterSchema.safeParse({ username: 'u', displayName: 'd', password: 'abcd' }).success).toBe(true);
  });

  test('rejects empty username', () => {
    expect(RegisterSchema.safeParse({ username: '', displayName: 'd', password: 'abcd' }).success).toBe(false);
  });

  test('rejects empty displayName', () => {
    expect(RegisterSchema.safeParse({ username: 'u', displayName: '', password: 'abcd' }).success).toBe(false);
  });

  test('rejects short password (less than 4 chars)', () => {
    expect(RegisterSchema.safeParse({ username: 'u', displayName: 'd', password: 'abc' }).success).toBe(false);
  });

  test('rejects username longer than 100 chars', () => {
    expect(RegisterSchema.safeParse({ username: 'a'.repeat(101), displayName: 'd', password: 'abcd' }).success).toBe(false);
  });

  test('rejects displayName longer than 200 chars', () => {
    expect(RegisterSchema.safeParse({ username: 'u', displayName: 'a'.repeat(201), password: 'abcd' }).success).toBe(false);
  });

  test('accepts username at max 100 chars', () => {
    expect(RegisterSchema.safeParse({ username: 'a'.repeat(100), displayName: 'd', password: 'abcd' }).success).toBe(true);
  });

  test('accepts displayName at max 200 chars', () => {
    expect(RegisterSchema.safeParse({ username: 'u', displayName: 'a'.repeat(200), password: 'abcd' }).success).toBe(true);
  });
});

describe('CategoryTreeSchema', () => {
  test('accepts valid 3-level tree', () => {
    const tree = [
      {
        id: 'cat_1',
        name: 'فروش',
        children: [
          {
            id: 'cat_1_1',
            name: 'مشاوره',
            children: [
              { id: 'cat_1_1_1', name: 'آنلاین', children: [] },
            ],
          },
        ],
      },
    ];
    expect(CategoryTreeSchema.safeParse(tree).success).toBe(true);
  });

  test('accepts empty array', () => {
    expect(CategoryTreeSchema.safeParse([]).success).toBe(true);
  });

  test('accepts tree with no children at any level', () => {
    const tree = [{ id: '1', name: 'Test', children: [] }];
    expect(CategoryTreeSchema.safeParse(tree).success).toBe(true);
  });

  test('rejects 4th level nesting', () => {
    const tree = [
      {
        id: '1',
        name: 'L1',
        children: [
          {
            id: '2',
            name: 'L2',
            children: [
              {
                id: '3',
                name: 'L3',
                children: [{ id: '4', name: 'L4', children: [] }],
              },
            ],
          },
        ],
      },
    ];
    expect(CategoryTreeSchema.safeParse(tree).success).toBe(false);
  });

  test('rejects missing id or name', () => {
    expect(CategoryTreeSchema.safeParse([{ name: 'NoId', children: [] }]).success).toBe(false);
    expect(CategoryTreeSchema.safeParse([{ id: '1', children: [] }]).success).toBe(false);
  });
});
