export const CATEGORIES = [
  'technical',
  'behavioural',
  'system-design',
  'company-fit',
] as const;

export type Category = (typeof CATEGORIES)[number];

// Resume text sent to the model, capped to stay well under this app's
// configured per-model token bucket (GROQ_TPM_BUDGET, 6000 by default) once
// the system prompt and a fully-loaded requirement list are added on top —
// see matchResume.ts's system prompt for the rest of that budget.
export const RESUME_TEXT_CHAR_CAP = 6_000;

