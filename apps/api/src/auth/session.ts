import cookieSession from 'cookie-session';
import type { Request, Response, NextFunction } from 'express';

/**
 * Minimal session handling (brief Section 1): signed, httpOnly cookies
 * carrying just a userId — no server-side session store needed for this
 * scope. "Sensible handling of expired or invalid sessions" means:
 * requireAuth returns 401 for a missing/expired/tampered session rather
 * than letting the request reach a protected handler.
 */
export function sessionMiddleware() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set. See .env.example.');
  return cookieSession({
    name: 'session',
    secret,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}

declare module 'express-serve-static-core' {
  interface Request {
    userId?: string;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const userId = req.session?.userId;
  if (typeof userId !== 'string' || userId.length === 0) {
    res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } });
    return;
  }
  req.userId = userId;
  next();
}
