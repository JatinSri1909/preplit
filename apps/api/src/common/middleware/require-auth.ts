import type { Request, Response, NextFunction } from 'express';

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
