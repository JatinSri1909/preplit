import type { Response } from 'express';
import type { ZodError } from 'zod';

export function badRequest(res: Response, error: ZodError): void {
  res.status(400).json({
    error: {
      code: 'VALIDATION_FAILED',
      message: 'Check the job description, company URL and number of days.',
      details: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    },
  });
}
