import type { Kit, KitMeta, PipelineStep, PracticeState, ResumeMatch } from '@prep-kit/core';
import { request } from '../../common/api/api-client';

export type KitStatus = 'generating' | 'ready' | 'failed';

export interface KitSummary {
  id: string;
  status: KitStatus;
  error: string | null;
  company: string | null;
  role: string | null;
  company_url: string | null;
  days: number | null;
  uncovered_count: number;
  created_at: string;
  updated_at: string;
}

export interface KitRecord {
  id: string;
  status: KitStatus;
  /** Which pipeline step is currently running; only meaningful while status is 'generating'. */
  step: PipelineStep | null;
  error: string | null;
  kit: Kit | null;
  meta: KitMeta | null;
  practice: PracticeState;
  resume_match: ResumeMatch | null;
  input: { jd: string; company_url: string; days: number };
}

export interface CreateKitInput {
  jd: string;
  company_url: string;
  days: number;
}

export interface CreateKitResult {
  id: string;
  status: KitStatus;
  duplicate_of_existing_kit: boolean;
}

export interface BatchRowResult {
  index: number;
  id: string | null;
  status: KitStatus;
  duplicate_of_existing_kit?: boolean;
  error?: string;
}

export const kits = {
  list: () => request<KitSummary[]>('/kits'),
  get: (id: string) => request<KitRecord>(`/kits/${id}`),
  create: (input: CreateKitInput) =>
    request<CreateKitResult>('/kits', { method: 'POST', body: JSON.stringify(input) }),
  createBatch: (cases: CreateKitInput[]) =>
    request<{ results: BatchRowResult[] }>('/kits/batch', {
      method: 'POST',
      body: JSON.stringify({ cases }),
    }),
  remove: (id: string) => request<void>(`/kits/${id}`, { method: 'DELETE' }),
};
