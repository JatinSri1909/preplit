/**
 * Types mirroring Appendix A of the assessment brief.
 *
 * These field names and nesting are EXACT per the brief ("these fields must
 * be present and named exactly as given"). Do not rename anything here
 * without re-checking Appendix A — the batch pipeline is graded against
 * job descriptions we have not seen, so drift here is a silent scoring loss.
 *
 * Extension point: additional fields may be added (the brief allows
 * extending "where that genuinely helps"), but only ADD, never rename or
 * remove a listed field.
 */

import { z } from 'zod';

export type RequirementKind = 'technical' | 'behavioural' | 'domain';
export type RequirementPriority = 'must' | 'nice';
export type QuestionCategory =
  | 'technical'
  | 'behavioural'
  | 'system-design'
  | 'company-fit';

export interface KitSource {
  company: string;
  company_url: string;
  role: string;
  location: string;
  jd_chars: number;
  researched_at: string; // ISO 8601
  pages_used: string[];
}

export interface CompanyBrief {
  summary: string;
  what_they_do: string;
  sources: string[];
}

export interface Requirement {
  id: string; // stable within a kit, e.g. "r1"
  text: string;
  kind: RequirementKind;
  priority: RequirementPriority;
}

export interface RoleSection {
  title: string;
  seniority: string;
  responsibilities: string[];
  requirements: Requirement[];
}

export interface Question {
  id: string; // stable within a kit, e.g. "q1"
  requirement_ids: string[];
  category: QuestionCategory;
  prompt: string;
  answer_outline: string;
  difficulty: 1 | 2 | 3;
}

export interface Flashcard {
  id: string; // stable within a kit, e.g. "f1"
  front: string;
  back: string;
  requirement_ids: string[];
}

export interface ScheduleDay {
  day: number; // 1-indexed
  focus: string;
  question_ids: string[];
  minutes: number; // integer minutes, no floats
}

export interface Schedule {
  days_available: number;
  days: ScheduleDay[];
}

export interface Coverage {
  uncovered_requirement_ids: string[];
  passes: number;
}

export interface Kit {
  source: KitSource;
  company_brief: CompanyBrief;
  role: RoleSection;
  questions: Question[];
  flashcards: Flashcard[];
  schedule: Schedule;
  coverage: Coverage;
}

// --- zod schema (runtime validation; see packages/core/src/validation) ---

export const RequirementSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  kind: z.enum(['technical', 'behavioural', 'domain']),
  priority: z.enum(['must', 'nice']),
});

export const KitSourceSchema = z.object({
  company: z.string(),
  company_url: z.string(),
  role: z.string(),
  location: z.string(),
  jd_chars: z.number().int().nonnegative(),
  researched_at: z.string(),
  pages_used: z.array(z.string()),
});

export const CompanyBriefSchema = z.object({
  summary: z.string(),
  what_they_do: z.string(),
  sources: z.array(z.string()),
});

export const RoleSectionSchema = z.object({
  title: z.string(),
  seniority: z.string(),
  responsibilities: z.array(z.string()),
  requirements: z.array(RequirementSchema),
});

export const QuestionSchema = z.object({
  id: z.string().min(1),
  requirement_ids: z.array(z.string()),
  category: z.enum(['technical', 'behavioural', 'system-design', 'company-fit']),
  prompt: z.string(),
  answer_outline: z.string(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

export const FlashcardSchema = z.object({
  id: z.string().min(1),
  front: z.string(),
  back: z.string(),
  requirement_ids: z.array(z.string()),
});

export const ScheduleDaySchema = z.object({
  day: z.number().int().positive(),
  focus: z.string(),
  question_ids: z.array(z.string()),
  minutes: z.number().int().nonnegative(),
});

export const ScheduleSchema = z.object({
  days_available: z.number().int().positive(),
  days: z.array(ScheduleDaySchema),
});

export const CoverageSchema = z.object({
  uncovered_requirement_ids: z.array(z.string()),
  passes: z.number().int().nonnegative(),
});

export const KitSchema = z.object({
  source: KitSourceSchema,
  company_brief: CompanyBriefSchema,
  role: RoleSectionSchema,
  questions: z.array(QuestionSchema),
  flashcards: z.array(FlashcardSchema),
  schedule: ScheduleSchema,
  coverage: CoverageSchema,
});
