import type { Flashcard, PracticeProgress, PracticeState } from '@prep-kit/core';
import { request } from '../../common/api/api-client';

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
