import { CompanyBrief, Flashcard, Question } from '../types/kit.js';

/**
 * The Builder's state problem (brief Section 6): regenerating one section
 * must not discard edits made elsewhere, and a hand-written or hand-edited
 * item must survive a regeneration of its own category.
 *
 * Design: kit content stays EXACTLY Appendix A shape (nothing extra bolted
 * onto individual questions/flashcards — automated grading structurally
 * diffs against Appendix A, so items themselves must not carry unexpected
 * fields). Instead, a sibling `KitMeta` structure — never sent to the
 * grader, only used by the app's own persistence + Builder UI — tracks
 * provenance per item id:
 *
 *   generated  — produced by the pipeline, safe to replace on regeneration
 *   edited     — pipeline-generated, then hand-edited by the user; survives
 *   user_added — created by the user directly; survives, and is never
 *                touched by a category regeneration
 *
 * Regenerating a question category means: throw away only the
 * `generated`-tagged questions in that category, keep `edited` and
 * `user_added` ones untouched, and splice in the freshly generated
 * replacements. The same pattern applies to flashcards and to the
 * company_brief's two text fields.
 */

export type ItemSource = 'generated' | 'edited' | 'user_added';

export interface ItemMeta {
  source: ItemSource;
  updated_at: string; // ISO 8601, last time this item's content changed
}

export interface KitMeta {
  questions: Record<string, ItemMeta>;
  flashcards: Record<string, ItemMeta>;
  company_brief: { summary: ItemMeta; what_they_do: ItemMeta };
}

export function initialMetaFor(
  questionIds: string[],
  flashcardIds: string[],
  at: string = new Date().toISOString(),
): KitMeta {
  const tag = (): ItemMeta => ({ source: 'generated', updated_at: at });
  return {
    questions: Object.fromEntries(questionIds.map((id) => [id, tag()])),
    flashcards: Object.fromEntries(flashcardIds.map((id) => [id, tag()])),
    company_brief: { summary: tag(), what_they_do: tag() },
  };
}

/** Call when the user hand-edits an existing item. */
export function markEdited(meta: KitMeta, kind: 'questions' | 'flashcards', id: string, at = new Date().toISOString()): KitMeta {
  return {
    ...meta,
    [kind]: { ...meta[kind], [id]: { source: 'edited', updated_at: at } },
  };
}

/** Call when the user adds a new item by hand (never touched by regeneration). */
export function markUserAdded(meta: KitMeta, kind: 'questions' | 'flashcards', id: string, at = new Date().toISOString()): KitMeta {
  return {
    ...meta,
    [kind]: { ...meta[kind], [id]: { source: 'user_added', updated_at: at } },
  };
}

let idCounter = 0;
/** Deterministic-enough fresh id generator for newly generated replacement items. Tests can seed/reset via resetIdCounterForTests. */
function nextId(prefix: string, existingIds: Set<string>): string {
  let candidate: string;
  do {
    idCounter += 1;
    candidate = `${prefix}${existingIds.size + idCounter}`;
  } while (existingIds.has(candidate));
  return candidate;
}

export function resetIdCounterForTests(): void {
  idCounter = 0;
}

/**
 * Mint the next id for a hand-added item ("q7", "f3").
 *
 * Deliberately NOT the `nextId` above: that one leans on a module-level
 * counter, which is fine inside a single regeneration call but wrong for a
 * long-lived API process where two requests against different kits would
 * interleave and drift. This one derives purely from the ids already in
 * the kit, so the same kit state always yields the same next id — which
 * also makes it testable without resetting global state.
 */
export function nextItemId(prefix: string, existingIds: Iterable<string>): string {
  let highest = 0;
  for (const id of existingIds) {
    if (!id.startsWith(prefix)) continue;
    const suffix = Number(id.slice(prefix.length));
    if (Number.isInteger(suffix) && suffix > highest) highest = suffix;
  }
  return `${prefix}${highest + 1}`;
}

/** Drop an item's provenance entry — used when the user deletes it outright. */
export function forgetItem(meta: KitMeta, kind: 'questions' | 'flashcards', id: string): KitMeta {
  const next = { ...meta[kind] };
  delete next[id];
  return { ...meta, [kind]: next };
}

export interface RegenerateQuestionsResult {
  questions: Question[];
  meta: KitMeta;
}

/**
 * Regenerate all `generated`-sourced questions in one category, keeping
 * every `edited` / `user_added` question in that category (and every
 * question in OTHER categories) exactly as-is.
 */
export function mergeRegeneratedQuestions(
  existingQuestions: Question[],
  meta: KitMeta,
  category: Question['category'],
  freshQuestions: Omit<Question, 'id'>[],
): RegenerateQuestionsResult {
  const survivors = existingQuestions.filter((q) => {
    if (q.category !== category) return true; // other categories untouched
    const m = meta.questions[q.id];
    return m?.source === 'edited' || m?.source === 'user_added';
  });

  const existingIds = new Set(existingQuestions.map((q) => q.id));
  const now = new Date().toISOString();
  const nextMeta: KitMeta = { ...meta, questions: { ...meta.questions } };

  // Drop meta entries for replaced (generated, same-category) questions.
  for (const q of existingQuestions) {
    if (q.category === category) {
      const m = meta.questions[q.id];
      if (m?.source === 'generated') delete nextMeta.questions[q.id];
    }
  }

  const added: Question[] = freshQuestions.map((fq) => {
    const id = nextId('q', existingIds);
    existingIds.add(id);
    nextMeta.questions[id] = { source: 'generated', updated_at: now };
    return { ...fq, id };
  });

  return { questions: [...survivors, ...added], meta: nextMeta };
}

export interface RegenerateFlashcardsResult {
  flashcards: Flashcard[];
  meta: KitMeta;
}

export function mergeRegeneratedFlashcards(
  existingFlashcards: Flashcard[],
  meta: KitMeta,
  freshFlashcards: Omit<Flashcard, 'id'>[],
): RegenerateFlashcardsResult {
  const survivors = existingFlashcards.filter((f) => {
    const m = meta.flashcards[f.id];
    return m?.source === 'edited' || m?.source === 'user_added';
  });

  const existingIds = new Set(existingFlashcards.map((f) => f.id));
  const now = new Date().toISOString();
  const nextMeta: KitMeta = { ...meta, flashcards: { ...meta.flashcards } };

  for (const f of existingFlashcards) {
    const m = meta.flashcards[f.id];
    if (m?.source === 'generated') delete nextMeta.flashcards[f.id];
  }

  const added: Flashcard[] = freshFlashcards.map((ff) => {
    const id = nextId('f', existingIds);
    existingIds.add(id);
    nextMeta.flashcards[id] = { source: 'generated', updated_at: now };
    return { ...ff, id };
  });

  return { flashcards: [...survivors, ...added], meta: nextMeta };
}

/**
 * Regenerate the company brief: each of the two text fields is replaced
 * independently only if it hasn't been hand-edited.
 */
export function mergeRegeneratedBrief(
  existing: CompanyBrief,
  meta: KitMeta,
  fresh: CompanyBrief,
): { brief: CompanyBrief; meta: KitMeta } {
  const now = new Date().toISOString();
  const nextBriefMeta = { ...meta.company_brief };
  const brief: CompanyBrief = { ...existing };

  if (meta.company_brief.summary.source === 'generated') {
    brief.summary = fresh.summary;
    nextBriefMeta.summary = { source: 'generated', updated_at: now };
  }
  if (meta.company_brief.what_they_do.source === 'generated') {
    brief.what_they_do = fresh.what_they_do;
    nextBriefMeta.what_they_do = { source: 'generated', updated_at: now };
  }
  // sources[] is always refreshed — it's provenance metadata, not user-facing prose.
  brief.sources = fresh.sources;

  return { brief, meta: { ...meta, company_brief: nextBriefMeta } };
}
