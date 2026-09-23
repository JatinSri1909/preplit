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
 * `covered` confirms one. `violet`/`teal`/`rose` extend that same idea to
 * question category — technical stays the primary accent, the other
 * three categories get their own hue so the bank is scannable at a
 * glance.
 *
 * The palette itself (warm cream canvas, deep forest-green accent) is
 * pulled from trao.ai, who this kit is built for — matched by sampling
 * their live site's computed styles rather than eyeballing a screenshot.
 * Cards stay a cleaner white than Trao's own (barely-there beige) because
 * this is a workbench full of dense forms and lists, not a marketing
 * page — real content needs the extra contrast to stay legible. Corners
 * match Trao's sharp rectangles exactly: `borderRadius` below zeroes out
 * every rounded-* size except `full` (true circles — icon badges, dots —
 * stay circular), so every card and button goes sharp without touching
 * each component's own className.
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './common/**/*.{ts,tsx}',
    './modules/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: '#FAF9F5',
        surface: '#FFFFFF',
        ink: '#141413',
        muted: '#6B6B64',
        rule: '#E5E1D8',
        accent: '#017752',
        'accent-strong': '#014F38',
        'accent-soft': '#E6F2ED',
        gap: '#9B6836',
        'gap-soft': '#F5EDE3',
        covered: '#15803D',
        'covered-soft': '#EDF6EC',
        violet: '#6D42C7',
        'violet-soft': '#F1ECFB',
        teal: '#0E8074',
        'teal-soft': '#E9F7F5',
        rose: '#BE3C6D',
        'rose-soft': '#FBEEF3',
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
      borderRadius: {
        DEFAULT: '0px',
        sm: '0px',
        md: '0px',
        lg: '0px',
        xl: '0px',
        '2xl': '0px',
        '3xl': '0px',
        // `full` is untouched — true circles (icon badges, status dots)
        // stay round; only rectangular corners go sharp.
      },
      boxShadow: {
        // A resting card: barely there, just enough to lift it off the canvas.
        soft: '0 1px 2px rgba(26,29,35,0.04), 0 6px 16px -8px rgba(26,29,35,0.10)',
        // What a card gains on hover — reads as "this responds to you".
        lift: '0 10px 24px -10px rgba(1,119,82,0.35)',
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.35s ease-out both',
        float: 'float 5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
