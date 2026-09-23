export const SECTIONS = [
  ['brief', 'Company'],
  ['role', 'Role'],
  ['questions', 'Questions'],
  ['flashcards', 'Flashcards'],
  ['schedule', 'Schedule'],
  ['resume', 'Resume match'],
] as const;

export type SectionId = (typeof SECTIONS)[number][0];

// One glance-able glyph per section, so the nav reads as a row of places
// rather than a row of labels — purely wayfinding, so it takes the same
// muted/accent colouring as the label next to it, never its own colour.
export const SECTION_ICONS: Record<SectionId, string> = {
  brief: 'M4 19.5V6a2 2 0 0 1 2-2h9l5 5v10.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z|M8 9h5M8 13h8M8 17h8',
  role: 'M16 19v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1|M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
  questions: 'M12 17.5v.01M12 14c0-1.5 1.6-1.7 2.3-2.9.6-1 .2-2.6-1-3.3-1.1-.6-2.6-.4-3.4.6|M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-4 3v-3H6a2 2 0 0 1-2-2Z',
  flashcards: 'M4 8a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z|M8.5 4h9a2 2 0 0 1 2 2v9',
  schedule: 'M4 9h16M7 3v4M17 3v4|M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z',
  resume: 'M6 3h7l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z|m8.5 13.5 2.5 2.5 5-5',
};
