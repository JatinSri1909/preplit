/**
 * Types mirroring Appendix B — the batch entry point contract. Exact match
 * required: this is what `npm run evaluate` reads and writes.
 */

import { z } from 'zod';
import { Kit, KitSchema } from './kit.js';

export interface BatchCase {
  id: string;
  jd: string;
  company_url: string;
  days: number;
}

export const BatchCaseSchema = z.object({
  id: z.string().min(1),
  jd: z.string(),
  company_url: z.string(),
  days: z.number().int().positive(),
});

export const BatchInputSchema = z.array(BatchCaseSchema);

export type BatchStatus = 'ok' | 'failed';

export interface BatchError {
  code: string;
  message: string;
}

export interface BatchKitResult {
  id: string;
  status: BatchStatus;
  kit: Kit | null;
  error: BatchError | null;
}

export interface BatchOutput {
  version: string;
  generated_at: string; // ISO 8601
  kits: BatchKitResult[];
}

// Known error codes used across the pipeline. Extend as needed, but keep
// codes stable — they're what the README's failure-handling section refers to.
export const ErrorCodes = {
  COMPANY_URL_INVALID: 'COMPANY_URL_INVALID',
  COMPANY_UNREACHABLE: 'COMPANY_UNREACHABLE',
  NO_HIRING_PAGE_FOUND: 'NO_HIRING_PAGE_FOUND',
  JD_TOO_THIN: 'JD_TOO_THIN',
  LLM_INVALID_JSON: 'LLM_INVALID_JSON',
  LLM_RATE_LIMITED: 'LLM_RATE_LIMITED',
  LLM_PROVIDER_ERROR: 'LLM_PROVIDER_ERROR',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNKNOWN: 'UNKNOWN',
} as const;
