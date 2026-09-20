import { Kit, KitSchema } from '../types/kit.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Structural validation against Appendix A, plus the cross-referential
 * rules the brief calls out explicitly:
 *   - every question.requirement_ids entry must reference an existing requirement id
 *   - every flashcard.requirement_ids entry must reference an existing requirement id
 *   - every schedule.days[].question_ids entry must reference an existing question id
 *   - schedule.days.length must equal schedule.days_available
 *
 * This is deterministic code, not an LLM call — see brief Section 3.
 */
export function validateKit(candidate: unknown): ValidationResult {
  const parsed = KitSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    };
  }

  const kit = parsed.data as Kit;
  const errors: string[] = [];

  const requirementIds = new Set(kit.role.requirements.map((r) => r.id));
  const questionIds = new Set(kit.questions.map((q) => q.id));

  for (const q of kit.questions) {
    for (const rid of q.requirement_ids) {
      if (!requirementIds.has(rid)) {
        errors.push(`question ${q.id} references unknown requirement_id "${rid}"`);
      }
    }
  }

  for (const f of kit.flashcards) {
    for (const rid of f.requirement_ids) {
      if (!requirementIds.has(rid)) {
        errors.push(`flashcard ${f.id} references unknown requirement_id "${rid}"`);
      }
    }
  }

  for (const day of kit.schedule.days) {
    for (const qid of day.question_ids) {
      if (!questionIds.has(qid)) {
        errors.push(`schedule day ${day.day} references unknown question_id "${qid}"`);
      }
    }
  }

  if (kit.schedule.days.length !== kit.schedule.days_available) {
    errors.push(
      `schedule.days.length (${kit.schedule.days.length}) !== schedule.days_available (${kit.schedule.days_available})`,
    );
  }

  return { valid: errors.length === 0, errors };
}
