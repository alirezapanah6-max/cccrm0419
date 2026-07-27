import express, { Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './types.js'; // Express Request augmentation
import { authMiddleware } from './middleware/auth.middleware.js';
import { authRateLimiter } from './middleware/rate-limit.middleware.js';
import authRouter from './routes/auth.js';
import storageRouter from './routes/storage.js';
import healthRouter from './routes/health.js';
import exportRouter from './routes/export.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const app = express();

// 1. Parse URL-encoded bodies (matching GAS contract)
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// 2. Parse JSON bodies
app.use(express.json({ limit: '1mb' }));

// 3. Cookie parser (for HttpOnly JWT cookie)
app.use(cookieParser());

// 4. Security headers via helmet
// index.html is a single-file app with all JS inline — CSP must allow unsafe-inline
// for scripts and styles. All other helmet protections remain active.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        scriptSrcAttr: ["'unsafe-hashes'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  }),
);

// 5. Static file serving
// Serve index.html at root
app.get('/', (_req, res) => {
  res.sendFile(path.resolve(projectRoot, 'index.html'));
});

// Serve /public/* static assets (fonts, SVGs)
app.use('/public', express.static(path.resolve(projectRoot, 'public')));

// 6. Health check (no auth required) — uses proper route with DB connectivity check
app.use(healthRouter);

// 7. Rate limit auth endpoints (max 10 requests/min/IP)
app.use('/api/auth', authRateLimiter);

// 8. Auth routes (login/register are public, handled before auth middleware)
app.use(authRouter);

// 9. Auth middleware — applied AFTER static/health/auth routes, BEFORE storage
app.use(authMiddleware);

// 10. Storage API route (requires authentication)
app.use(storageRouter);

// 11. Export route (requires authentication — registered after auth middleware)
app.use(exportRouter);

// 12. Catch-all 404 handler — must be LAST middleware registered
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

export default app;
