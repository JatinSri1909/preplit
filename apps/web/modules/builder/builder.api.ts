import type { Kit, KitMeta, PracticeState, ResumeMatch } from '@prep-kit/core';
import { request } from '../../common/api/api-client';
import type { KitStatus } from '../kits/kits.api';

/** Every builder mutation returns the whole kit; see builderRoutes.ts. */
export interface BuilderResult {
  id: string;
  status: KitStatus;
  kit: Kit;
  meta: KitMeta;
  practice: PracticeState;
  resume_match: ResumeMatch | null;
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

  uploadResume: (id: string, file: File) => {
    const body = new FormData();
    body.append('resume', file);
    return builderRequest(id, '/resume', { method: 'POST', body });
  },
};
