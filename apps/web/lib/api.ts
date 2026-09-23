import type { Kit, KitMeta, PipelineStep, PracticeState, PracticeProgress, Flashcard } from '@prep-kit/core';

/**
 * The only place in the web app that knows the API exists.
 *
 * Everything goes through `request`, so the three things that must never
 * be forgotten — sending the session cookie, parsing the API's structured
 * error envelope, and turning a 401 into something the UI can act on —
 * happen once rather than at forty call sites.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: string[],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** The session is gone or was never there — the shell should sign out. */
  get isUnauthenticated(): boolean {
    return this.status === 401;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      // Cross-origin in production, so the session cookie only rides along
      // if this is set on every single request.
      credentials: 'include',
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch {
    // fetch only rejects on a genuine network fault — worth distinguishing
    // from a server error, because the useful advice is different.
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Check your connection and try again.');
  }

  if (response.status === 204) return undefined as T;

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const error = body?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'UNKNOWN',
      error?.message ?? 'Something went wrong. Try again.',
      error?.details,
    );
  }

  return body as T;
}

// --- auth ---

export interface User {
  id: string;
  email: string;
}

export const auth = {
  me: () => request<{ user: User | null }>('/auth/me'),
  register: (email: string, password: string) =>
    request<User>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    request<User>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
};

// --- kits ---

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

// --- builder ---

/** Every builder mutation returns the whole kit; see builderRoutes.ts. */
export interface BuilderResult {
  id: string;
  status: KitStatus;
  kit: Kit;
  meta: KitMeta;
  practice: PracticeState;
}

const builderRequest = (id: string, path: string, init: RequestInit) =>
  request<BuilderResult>(`/kits/${id}${path}`, init);

export const builder = {
  editBrief: (id: string, patch: { summary?: string; what_they_do?: string }) =>
    builderRequest(id, '/brief', { method: 'PATCH', body: JSON.stringify(patch) }),

  reorderQuestions: (id: string, ids: string[]) =>
    builderRequest(id, '/questions/order', { method: 'PATCH', body: JSON.stringify({ ids }) }),

  addQuestion: (
    id: string,
    question: {
      prompt: string;
      answer_outline?: string;
      category: string;
      difficulty?: 1 | 2 | 3;
      requirement_ids?: string[];
    },
  ) => builderRequest(id, '/questions', { method: 'POST', body: JSON.stringify(question) }),

  editQuestion: (
    id: string,
    qid: string,
    patch: { prompt?: string; answer_outline?: string; difficulty?: 1 | 2 | 3; category?: string },
  ) => builderRequest(id, `/questions/${qid}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  deleteQuestion: (id: string, qid: string) =>
    builderRequest(id, `/questions/${qid}`, { method: 'DELETE' }),

  addFlashcard: (id: string, card: { front: string; back?: string; requirement_ids?: string[] }) =>
    builderRequest(id, '/flashcards', { method: 'POST', body: JSON.stringify(card) }),

  editFlashcard: (id: string, fid: string, patch: { front?: string; back?: string }) =>
    builderRequest(id, `/flashcards/${fid}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  deleteFlashcard: (id: string, fid: string) =>
    builderRequest(id, `/flashcards/${fid}`, { method: 'DELETE' }),

  regenerateQuestions: (id: string, category: string) =>
    builderRequest(id, `/regenerate/questions/${category}`, { method: 'POST' }),

  regenerateBrief: (id: string) => builderRequest(id, '/regenerate/brief', { method: 'POST' }),

  regenerateSchedule: (id: string, days?: number) =>
    builderRequest(id, '/regenerate/schedule', {
      method: 'POST',
      body: JSON.stringify(days ? { days } : {}),
    }),
};

// --- practice ---

export interface PracticeSession {
  queue: Flashcard[];
  progress: PracticeProgress;
  state: PracticeState;
}

export const practice = {
  session: (id: string) => request<PracticeSession>(`/kits/${id}/practice`),
  review: (id: string, fid: string, confidence: 1 | 2 | 3) =>
    request<{ state: PracticeState; progress: PracticeProgress }>(`/kits/${id}/practice/${fid}`, {
      method: 'POST',
      body: JSON.stringify({ confidence }),
    }),
  reset: (id: string) =>
    request<{ state: PracticeState; progress: PracticeProgress }>(`/kits/${id}/practice`, {
      method: 'DELETE',
    }),
};
