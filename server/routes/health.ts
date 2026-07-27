import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';

const healthRouter = Router();

/**
 * GET /api/health
 * No authentication required.
 * Checks DB connectivity by running SELECT 1 with a 5-second timeout.
 * Returns 200 { status: "healthy" } on success, 503 { status: "unhealthy" } on failure.
 */
healthRouter.get('/api/health', async (_req: Request, res: Response) => {
  const timeoutMs = 5000;

  const dbCheck = prisma.$queryRaw`SELECT 1`;

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('DB health check timed out')), timeoutMs)
  );

  try {
    await Promise.race([dbCheck, timeout]);
    res.status(200).json({ status: 'healthy' });
  } catch {
    res.status(503).json({ status: 'unhealthy' });
  }
});

export default healthRouter;
