import { describe, it, expect } from 'vitest';
import {
  orderPracticeQueue,
  practiceProgress,
  recordReview,
  PracticeState,
} from './practiceQueue.js';
import { Flashcard } from '../types/kit.js';

const cards: Flashcard[] = [
  { id: 'f1', front: 'A', back: 'a', requirement_ids: ['r1'] },
  { id: 'f2', front: 'B', back: 'b', requirement_ids: ['r2'] },
  { id: 'f3', front: 'C', back: 'c', requirement_ids: ['r3'] },
];

const ids = (list: Flashcard[]) => list.map((c) => c.id);

describe('orderPracticeQueue', () => {
  it('keeps kit order when nothing has been practised yet', () => {
    expect(ids(orderPracticeQueue(cards))).toEqual(['f1', 'f2', 'f3']);
  });

  it('puts unseen cards ahead of every reviewed card, however badly rated', () => {
    const state: PracticeState = {
      f1: { confidence: 1, reviewed_at: '2026-09-01T10:00:00Z', reviews: 1 },
      f3: { confidence: 1, reviewed_at: '2026-09-01T10:00:00Z', reviews: 1 },
    };
    // f2 is unseen — you cannot be confident about a card you never read.
    expect(ids(orderPracticeQueue(cards, state))[0]).toBe('f2');
  });

  it('orders reviewed cards least-confident first', () => {
    const state: PracticeState = {
      f1: { confidence: 3, reviewed_at: '2026-09-01T10:00:00Z', reviews: 1 },
      f2: { confidence: 1, reviewed_at: '2026-09-01T10:00:00Z', reviews: 1 },
      f3: { confidence: 2, reviewed_at: '2026-09-01T10:00:00Z', reviews: 1 },
    };
    expect(ids(orderPracticeQueue(cards, state))).toEqual(['f2', 'f3', 'f1']);
  });

  it('breaks a confidence tie by least-recently reviewed', () => {
    const state: PracticeState = {
      f1: { confidence: 2, reviewed_at: '2026-09-03T10:00:00Z', reviews: 1 },
      f2: { confidence: 2, reviewed_at: '2026-09-01T10:00:00Z', reviews: 1 },
      f3: { confidence: 2, reviewed_at: '2026-09-02T10:00:00Z', reviews: 1 },
    };
    expect(ids(orderPracticeQueue(cards, state))).toEqual(['f2', 'f3', 'f1']);
  });

  it('is pure — it does not mutate the flashcard array it was given', () => {
    const original = [...cards];
    orderPracticeQueue(cards, {
      f1: { confidence: 3, reviewed_at: '2026-09-01T10:00:00Z', reviews: 1 },
    });
    expect(cards).toEqual(original);
  });
});

describe('recordReview', () => {
  it('increments the review count across sessions', () => {
    let state = recordReview({}, 'f1', 1, '2026-09-01T10:00:00Z');
    state = recordReview(state, 'f1', 3, '2026-09-02T10:00:00Z');
    expect(state.f1).toEqual({
      confidence: 3,
      reviewed_at: '2026-09-02T10:00:00Z',
      reviews: 2,
    });
  });

  it('does not mutate the previous state', () => {
    const before = recordReview({}, 'f1', 1, '2026-09-01T10:00:00Z');
    recordReview(before, 'f1', 3, '2026-09-02T10:00:00Z');
    expect(before.f1.confidence).toBe(1);
  });
});

describe('practiceProgress', () => {
  it('counts unseen, shaky and confident cards separately', () => {
    const state: PracticeState = {
      f1: { confidence: 3, reviewed_at: '2026-09-01T10:00:00Z', reviews: 1 },
      f2: { confidence: 2, reviewed_at: '2026-09-01T10:00:00Z', reviews: 1 },
    };
    expect(practiceProgress(cards, state)).toEqual({
      total: 3,
      reviewed: 2,
      shaky: 1,
      confident: 1,
      unseen: 1,
    });
  });

  it('reports an all-unseen kit rather than dividing by zero', () => {
    expect(practiceProgress([], {})).toEqual({
      total: 0,
      reviewed: 0,
      shaky: 0,
      confident: 0,
      unseen: 0,
    });
  });
});
