import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { validate } from '../../../middleware/validation.middleware.js';

function mockReqResNext(body: unknown) {
  const req = { body } as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  const next = vi.fn() as NextFunction;
  return { req, res, next };
}

describe('validate middleware', () => {
  const schema = z.object({
    username: z.string().min(1, 'Username is required'),
    password: z.string().min(4, 'Password must be at least 4 characters'),
  });

  it('calls next() when body is valid', () => {
    const { req, res, next } = mockReqResNext({ username: 'admin', password: 'secret' });
    validate(schema)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('attaches parsed data to req.body on success', () => {
    const { req, res, next } = mockReqResNext({ username: 'admin', password: 'secret', extra: 'ignored' });
    validate(schema)(req, res, next);

    expect(next).toHaveBeenCalled();
    // Zod strips unknown keys by default
    expect(req.body).toEqual({ username: 'admin', password: 'secret' });
  });

  it('returns 400 with structured errors on validation failure', () => {
    const { req, res, next } = mockReqResNext({ username: '', password: 'ab' });
    validate(schema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Validation failed',
      errors: expect.arrayContaining([
        expect.objectContaining({ path: 'username', message: expect.any(String) }),
        expect.objectContaining({ path: 'password', message: expect.any(String) }),
      ]),
    });
  });

  it('returns 400 when body is completely missing fields', () => {
    const { req, res, next } = mockReqResNext({});
    validate(schema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    const jsonCall = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(jsonCall.message).toBe('Validation failed');
    expect(jsonCall.errors.length).toBeGreaterThan(0);
  });

  it('includes dot-notation path for nested fields', () => {
    const nestedSchema = z.object({
      user: z.object({
        email: z.string().email('Invalid email'),
      }),
    });
    const { req, res, next } = mockReqResNext({ user: { email: 'not-email' } });
    validate(nestedSchema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    const jsonCall = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(jsonCall.errors[0].path).toBe('user.email');
  });
});
