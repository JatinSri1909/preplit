import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Express 4 does not automatically forward a rejected promise from an
 * async handler to the error-handling middleware — an unhandled rejection
 * would otherwise crash the request silently. Wrap every async route
 * handler with this so thrown/rejected errors reach the centralized
 * error handler in index.ts.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
