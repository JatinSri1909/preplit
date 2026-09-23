import { describe, it, expect } from 'vitest';
import {
  initialMetaFor,
  markEdited,
  markUserAdded,
  mergeRegeneratedQuestions,
  mergeRegeneratedFlashcards,
  mergeRegeneratedBrief,
  nextItemId,
  forgetItem,
} from './kitState.js';
import { CompanyBrief, Flashcard, Question } from '../types/kit.js';

function q(id: string, category: Question['category'] = 'technical'): Question {
  return { id, requirement_ids: ['r1'], category, prompt: `prompt ${id}`, answer_outline: 'outline', difficulty: 2 };
}

function f(id: string): Flashcard {
  return { id, front: `front ${id}`, back: `back ${id}`, requirement_ids: ['r1'] };
}

describe('mergeRegeneratedQuestions', () => {
  it('replaces generated questions in the target category with fresh ones', () => {
    const existing = [q('q1', 'technical'), q('q2', 'technical')];
    const meta = initialMetaFor(['q1', 'q2'], []);

    const result = mergeRegeneratedQuestions(existing, meta, 'technical', [
      { requirement_ids: ['r1'], category: 'technical', prompt: 'new', answer_outline: '', difficulty: 1 },
    ]);

    expect(result.questions.map((x) => x.id)).not.toContain('q1');
    expect(result.questions.map((x) => x.id)).not.toContain('q2');
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].prompt).toBe('new');
  });

  it('preserves a hand-edited question in the same category untouched', () => {
    const existing = [q('q1', 'technical'), q('q2', 'technical')];
    let meta = initialMetaFor(['q1', 'q2'], []);
    meta = markEdited(meta, 'questions', 'q1');

    const result = mergeRegeneratedQuestions(existing, meta, 'technical', [
      { requirement_ids: ['r1'], category: 'technical', prompt: 'new', answer_outline: '', difficulty: 1 },
    ]);

    const survivor = result.questions.find((x) => x.id === 'q1');
    expect(survivor).toBeDefined();
    expect(survivor?.prompt).toBe('prompt q1'); // untouched original content
  });

  it('preserves a user-added question in the same category untouched', () => {
    const existing = [q('q1', 'technical')];
    let meta = initialMetaFor(['q1'], []);
    meta = markUserAdded(meta, 'questions', 'q1');

    const result = mergeRegeneratedQuestions(existing, meta, 'technical', []);
    expect(result.questions.map((x) => x.id)).toContain('q1');
  });

  it('never touches questions in a different category', () => {
    const existing = [q('q1', 'technical'), q('q2', 'behavioural')];
    const meta = initialMetaFor(['q1', 'q2'], []);

    const result = mergeRegeneratedQuestions(existing, meta, 'technical', []);
    expect(result.questions.map((x) => x.id)).toContain('q2');
    expect(result.questions.find((x) => x.id === 'q2')?.category).toBe('behavioural');
  });

  it('assigns fresh ids that do not collide with existing ones', () => {
    const existing = [q('q1', 'technical')];
    const meta = initialMetaFor(['q1'], []);

    const result = mergeRegeneratedQuestions(existing, meta, 'technical', [
      { requirement_ids: ['r1'], category: 'technical', prompt: 'a', answer_outline: '', difficulty: 1 },
      { requirement_ids: ['r1'], category: 'technical', prompt: 'b', answer_outline: '', difficulty: 1 },
    ]);

    const ids = result.questions.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate ids
  });

  it('tags newly generated replacements as generated in the returned meta', () => {
    const existing = [q('q1', 'technical')];
    const meta = initialMetaFor(['q1'], []);

    const result = mergeRegeneratedQuestions(existing, meta, 'technical', [
      { requirement_ids: ['r1'], category: 'technical', prompt: 'a', answer_outline: '', difficulty: 1 },
    ]);
    const newId = result.questions[0].id;
    expect(result.meta.questions[newId].source).toBe('generated');
  });
});

describe('mergeRegeneratedFlashcards', () => {
  it('replaces generated flashcards and preserves edited/user_added ones', () => {
    const existing = [f('f1'), f('f2'), f('f3')];
    let meta = initialMetaFor([], ['f1', 'f2', 'f3']);
    meta = markEdited(meta, 'flashcards', 'f1');
    meta = markUserAdded(meta, 'flashcards', 'f2');

    const result = mergeRegeneratedFlashcards(existing, meta, [
      { front: 'new front', back: 'new back', requirement_ids: ['r1'] },
    ]);

    const ids = result.flashcards.map((x) => x.id);
    expect(ids).toContain('f1');
    expect(ids).toContain('f2');
    expect(ids).not.toContain('f3');
    expect(result.flashcards.find((x) => x.id === 'f1')?.front).toBe('front f1');
  });
});

describe('mergeRegeneratedBrief', () => {
  const existing: CompanyBrief = {
    summary: 'old summary',
    what_they_do: 'old what_they_do',
    sources: ['https://old.example.com'],
  };
  const fresh: CompanyBrief = {
    summary: 'new summary',
    what_they_do: 'new what_they_do',
    sources: ['https://new.example.com'],
  };

  it('replaces both fields when neither has been edited', () => {
    const meta = initialMetaFor([], []);
    const result = mergeRegeneratedBrief(existing, meta, fresh);
    expect(result.brief.summary).toBe('new summary');
    expect(result.brief.what_they_do).toBe('new what_they_do');
  });

  it('preserves a hand-edited summary but still refreshes what_they_do', () => {
    let meta = initialMetaFor([], []);
    meta = {
      ...meta,
      company_brief: { ...meta.company_brief, summary: { source: 'edited', updated_at: 'x' } },
    };
    const result = mergeRegeneratedBrief(existing, meta, fresh);
    expect(result.brief.summary).toBe('old summary');
    expect(result.brief.what_they_do).toBe('new what_they_do');
  });

  it('always refreshes sources regardless of edit state', () => {
    let meta = initialMetaFor([], []);
    meta = {
      ...meta,
      company_brief: {
        summary: { source: 'edited', updated_at: 'x' },
        what_they_do: { source: 'edited', updated_at: 'x' },
      },
    };
    const result = mergeRegeneratedBrief(existing, meta, fresh);
    expect(result.brief.sources).toEqual(fresh.sources);
  });
});

describe('nextItemId', () => {
  it('mints the next id above the highest existing numeric suffix', () => {
    expect(nextItemId('q', ['q1', 'q2', 'q3'])).toBe('q4');
    expect(nextItemId('f', ['f1', 'f7', 'f3'])).toBe('f8'); // gaps do not get reused
  });

  it('starts at 1 for an empty kit', () => {
    expect(nextItemId('q', [])).toBe('q1');
  });

  it('ignores ids of a different prefix or a non-numeric suffix', () => {
    expect(nextItemId('q', ['f9', 'qabc', 'q2'])).toBe('q3');
  });

  it('is deterministic — the same kit state always yields the same next id', () => {
    expect(nextItemId('q', ['q1', 'q2'])).toBe(nextItemId('q', ['q1', 'q2']));
  });
});

describe('forgetItem', () => {
  it('removes only the deleted item\'s provenance entry', () => {
    const meta = initialMetaFor(['q1', 'q2'], ['f1']);
    const after = forgetItem(meta, 'questions', 'q1');
    expect(after.questions.q1).toBeUndefined();
    expect(after.questions.q2).toBeDefined();
    expect(after.flashcards.f1).toBeDefined();
  });

  it('does not mutate the meta it was given', () => {
    const meta = initialMetaFor(['q1'], []);
    forgetItem(meta, 'questions', 'q1');
    expect(meta.questions.q1).toBeDefined();
  });
});
