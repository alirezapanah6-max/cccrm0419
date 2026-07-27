import 'dotenv/config';
import app from './app.js';
import { prisma, disconnect } from './utils/prisma.js';

const PORT = process.env.PORT || 3000;

/**
 * Attempt to connect to the database with exponential backoff.
 * Delays: 1s, 2s, 4s, 8s, 16s — max 5 attempts.
 */
async function connectWithRetry(maxAttempts = 5): Promise<void> {
  let delay = 1000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await prisma.$connect();
      console.log('[startup] Database connection established');
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[startup] Database connection attempt ${attempt}/${maxAttempts} failed: ${message}`
      );

      if (attempt === maxAttempts) {
        throw new Error(
          `Failed to connect to database after ${maxAttempts} attempts`
        );
      }

      console.log(`[startup] Retrying in ${delay / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
}

async function startServer(): Promise<void> {
  try {
    await connectWithRetry();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[startup] Fatal: ${message}`);
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    console.log(`[startup] Server running on port ${PORT}`);
    console.log(`[startup] Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  // Graceful shutdown handler
  const shutdown = (signal: string) => {
    console.log(`\n[shutdown] Received ${signal}, shutting down gracefully...`);
    server.close(async () => {
      console.log('[shutdown] HTTP server closed');
      await disconnect();
      console.log('[shutdown] Database connection closed');
      process.exit(0);
    });

    // Force exit after 10 seconds if connections aren't drained
    setTimeout(() => {
      console.error('[shutdown] Forced exit after timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer();
