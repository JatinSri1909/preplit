import type { Config } from 'tailwindcss';

/**
 * Design direction, in one place.
 *
 * This is a workbench, not a landing page — the brief says polish is
 * welcome but interaction design is the point. So the palette is quiet and
 * the one deliberate move is typographic: generated kit content is set in
 * a serif, and every control, label and piece of app chrome is sans. That
 * one rule means you can tell at a glance what the model wrote from what
 * the application is offering you, which is exactly the distinction this
 * product is about. Both families are system stacks — no webfont request,
 * because a prep tool should not blank its own text while a font loads.
 *
 * Colour carries state, never decoration: `accent` marks the primary
 * action and focus, `gap` marks an uncovered must-have requirement, and
 * `covered` confirms one. Nothing else is coloured.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#F4F5F7',
        surface: '#FFFFFF',
        ink: '#1A1D23',
        muted: '#5B6270',
        rule: '#E2E5EA',
        accent: '#2F5BD7',
        'accent-soft': '#EEF2FD',
        gap: '#B45309',
        'gap-soft': '#FEF6EC',
        covered: '#15803D',
      },
      fontFamily: {
        // App chrome: buttons, labels, navigation, counts.
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        // Kit content: briefs, questions, answer outlines, flashcards.
        read: ['Iowan Old Style', 'Palatino Linotype', 'Georgia', 'serif'],
      },
      maxWidth: {
        // Body copy stays under ~75 characters.
        read: '68ch',
      },
    },
  },
  plugins: [],
};

export default config;
