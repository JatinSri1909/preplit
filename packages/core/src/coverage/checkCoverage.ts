import { Question, Requirement } from '../types/kit.js';

/**
 * Deterministic coverage check — NOT an LLM call (brief Section 3: "your
 * code's decision to make, not the model's").
 *
 * A requirement is "covered" if at least one question references its id.
 * Only must-have requirements block a kit from shipping clean (brief
 * Section 4), but we return all uncovered ids and let the caller decide
 * what to do with "nice" gaps.
 */
export function findUncoveredRequirementIds(
  requirements: Requirement[],
  questions: Question[],
): string[] {
  const covered = new Set<string>();
  for (const q of questions) {
    for (const rid of q.requirement_ids) covered.add(rid);
  }
  return requirements.filter((r) => !covered.has(r.id)).map((r) => r.id);
}

export function findUncoveredMustHaveIds(
  requirements: Requirement[],
  questions: Question[],
): string[] {
  const uncovered = new Set(findUncoveredRequirementIds(requirements, questions));
  return requirements.filter((r) => r.priority === 'must' && uncovered.has(r.id)).map((r) => r.id);
}
