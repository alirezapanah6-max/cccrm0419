import rateLimit from 'express-rate-limit';

/**
 * Rate limiter for authentication endpoints.
 * Limits to 10 requests per minute per IP address.
 * Returns HTTP 429 with retryAfter (seconds remaining) when exceeded.
 */
export const authRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 10, // 10 requests per window per IP
  handler: (_req, res) => {
    const resetTime = res.getHeader('X-RateLimit-Reset');
    const retryAfter = resetTime
      ? Math.ceil((Number(resetTime) * 1000 - Date.now()) / 1000)
      : 60;
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: Math.max(retryAfter, 1),
    });
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
