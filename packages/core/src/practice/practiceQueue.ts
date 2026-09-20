import { Flashcard } from '../types/kit.js';

/**
 * Practice mode ordering (brief Section 7: "Order the next session by what
 * they were least confident about ... A simple confidence-weighted sort is
 * fine; a proper spaced-repetition interval is fine. Pick one and defend
 * it.").
 *
 * Choice: confidence-weighted sort, not a spaced-repetition interval.
 *
 * Defence: SM-2 and friends schedule cards into the future in days. That
 * is the right model when you are retaining material for months. This user
 * has an interview in a known, small number of days — often one — so a
 * scheduler that decides a card is "not due for 4 days" is actively wrong
 * here: there may not be a day 4, and every card should still be revisited
 * before the interview. Confidence weighting gives the same core benefit
 * (weak material comes back first) with none of that failure mode, and it
 * is trivial to explain to the user, which matters for a tool they are
 * using under stress.
 *
 * Order, first key wins:
 *   1. Never seen — you cannot be confident about a card you have not read.
 *   2. Lowest recorded confidence.
 *   3. Least recently reviewed, so a tie does not replay the same card.
 *   4. Kit order, so the queue is stable and reproducible.
 *
 * Deterministic and pure: same inputs, same queue. No LLM, no clock.
 */

/** 1 = guessed, 2 = shaky, 3 = confident. */
export type Confidence = 1 | 2 | 3;

export interface CardReview {
  confidence: Confidence;
  /** ISO 8601 timestamp of the most recent review. */
  reviewed_at: string;
  /** How many times this card has been reviewed in total. */
  reviews: number;
}

/** flashcard id -> its review history. Cards absent from the map are unseen. */
export type PracticeState = Record<string, CardReview>;

export interface PracticeProgress {
  total: number;
  reviewed: number;
  /** Cards last rated 1 or 2 — the "still shaky" pile. */
  shaky: number;
  /** Cards last rated 3. */
  confident: number;
  unseen: number;
}

export function orderPracticeQueue(
  flashcards: Flashcard[],
  state: PracticeState = {},
): Flashcard[] {
  return flashcards
    .map((card, index) => ({ card, index, review: state[card.id] }))
    .sort((a, b) => {
      const aUnseen = a.review === undefined;
      const bUnseen = b.review === undefined;
      if (aUnseen !== bUnseen) return aUnseen ? -1 : 1;
      if (aUnseen && bUnseen) return a.index - b.index;

      if (a.review!.confidence !== b.review!.confidence) {
        return a.review!.confidence - b.review!.confidence;
      }
      const byRecency = a.review!.reviewed_at.localeCompare(b.review!.reviewed_at);
      if (byRecency !== 0) return byRecency; // oldest review first
      return a.index - b.index;
    })
    .map((entry) => entry.card);
}

/** "Show what has been covered and what has not" (brief Section 7). */
export function practiceProgress(
  flashcards: Flashcard[],
  state: PracticeState = {},
): PracticeProgress {
  let shaky = 0;
  let confident = 0;
  let unseen = 0;

  for (const card of flashcards) {
    const review = state[card.id];
    if (!review) unseen++;
    else if (review.confidence === 3) confident++;
    else shaky++;
  }

  return {
    total: flashcards.length,
    reviewed: flashcards.length - unseen,
    shaky,
    confident,
    unseen,
  };
}

/**
 * Record one review. Returns a new state object — the caller persists it.
 * Kept here rather than inline in the route so the "reviews" counter and
 * the queue ordering that consumes it cannot drift apart.
 */
export function recordReview(
  state: PracticeState,
  flashcardId: string,
  confidence: Confidence,
  at: string = new Date().toISOString(),
): PracticeState {
  const previous = state[flashcardId];
  return {
    ...state,
    [flashcardId]: {
      confidence,
      reviewed_at: at,
      reviews: (previous?.reviews ?? 0) + 1,
    },
  };
}
