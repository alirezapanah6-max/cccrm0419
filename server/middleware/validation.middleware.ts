import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ZodType } from 'zod';

/**
 * Generic Zod validation middleware factory.
 *
 * Validates `req.body` against the provided schema.
 * On success, calls `next()`.
 * On failure, returns HTTP 400 with structured error response.
 *
 * @param schema - A Zod schema to validate the request body against
 * @returns Express RequestHandler middleware
 */
export function validate(schema: ZodType): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));

      res.status(400).json({
        message: 'Validation failed',
        errors,
      });
      return;
    }

    // Attach validated data to the request body so downstream handlers use the parsed values
    req.body = result.data;
    next();
  };
}
