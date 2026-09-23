import type { QuestionCategory } from '@prep-kit/core';

export const CATEGORIES: QuestionCategory[] = ['technical', 'behavioural', 'system-design', 'company-fit'];

export const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  technical: 'Technical',
  behavioural: 'Behavioural',
  'system-design': 'System design',
  'company-fit': 'Company fit',
};

/**
 * Category is state, same as coverage — so it gets the same treatment: a
 * colour that means one specific thing everywhere it appears, not a
 * decorative accent. Technical stays the app's primary blue; the other
 * three get their own hue so a mixed bank is scannable at a glance
 * without reading every label.
 */
export const CATEGORY_COLORS: Record<QuestionCategory, { text: string; solid: string; soft: string }> = {
  technical: { text: 'text-accent', solid: 'bg-accent', soft: 'bg-accent-soft' },
  behavioural: { text: 'text-violet', solid: 'bg-violet', soft: 'bg-violet-soft' },
  'system-design': { text: 'text-teal', solid: 'bg-teal', soft: 'bg-teal-soft' },
  'company-fit': { text: 'text-rose', solid: 'bg-rose', soft: 'bg-rose-soft' },
};
