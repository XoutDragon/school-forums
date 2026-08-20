/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Every colour resolves through a CSS variable so one token table drives both
        // themes. Raw hex belongs in index.css and nowhere else.
        ink: 'rgb(var(--ink) / <alpha-value>)',
        panel: 'rgb(var(--panel) / <alpha-value>)',
        raised: 'rgb(var(--raised) / <alpha-value>)',
        edge: 'rgb(var(--edge) / <alpha-value>)',
        chalk: 'rgb(var(--chalk) / <alpha-value>)',
        dim: 'rgb(var(--dim) / <alpha-value>)',
        faint: 'rgb(var(--faint) / <alpha-value>)',
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          lift: 'rgb(var(--accent-lift) / <alpha-value>)',
          // The selected-row fill. A token rather than accent/10, because it has to
          // stay legible in both themes and an alpha of one hue cannot do that.
          wash: 'rgb(var(--accent-wash) / <alpha-value>)',
        },
        // Per-feature secondary hues. Desaturated relative to the original palette:
        // they label a card, they do not decorate the page.
        clubs: 'rgb(var(--clubs) / <alpha-value>)',
        courses: 'rgb(var(--courses) / <alpha-value>)',
        events: 'rgb(var(--events) / <alpha-value>)',
      },
      fontFamily: {
        // No CDN fonts — the app has to run offline. The stack leads with the two
        // faces the reference products actually use: Segoe UI on Windows, SF on
        // Apple platforms, so the app looks native on whichever it opens on.
        display: [
          '"Segoe UI Variable Display"',
          '"SF Pro Display"',
          '-apple-system',
          '"Segoe UI"',
          'Inter',
          'system-ui',
          'sans-serif',
        ],
        sans: [
          '"Segoe UI Variable Text"',
          '"SF Pro Text"',
          '-apple-system',
          '"Segoe UI"',
          'system-ui',
          'sans-serif',
        ],
        mono: ['"Cascadia Code"', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      fontSize: {
        // Looser than the previous scale. Teams and macOS both set headings at
        // normal tracking and normal-ish weight; the tight, heavy display type read
        // as a consumer app rather than as software the registrar would deploy.
        'display-xl': [
          '2.75rem',
          { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '600' },
        ],
        'display-lg': [
          '2rem',
          { lineHeight: '1.15', letterSpacing: '-0.016em', fontWeight: '600' },
        ],
        'display-md': [
          '1.375rem',
          { lineHeight: '1.25', letterSpacing: '-0.01em', fontWeight: '600' },
        ],
        // The utility face. Uppercase, wide, small — used for terms, codes and eyebrows.
        eyebrow: ['0.6875rem', { lineHeight: '1', letterSpacing: '0.1em', fontWeight: '600' }],
        code: ['0.8125rem', { lineHeight: '1.2', letterSpacing: '0.01em', fontWeight: '600' }],
      },
      borderRadius: {
        // Between Teams (4px, tight) and Apple (12px, soft). Corners are visible but
        // the interface does not read as a set of pills.
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
      keyframes: {
        'rise-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
        /* Voice activity ring. Slow enough to read as "live", not as a warning. */
        'speak-ring': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgb(var(--courses) / 0.55)' },
          '50%': { boxShadow: '0 0 0 4px rgb(var(--courses) / 0)' },
        },
      },
      animation: {
        'rise-in': 'rise-in 150ms ease-out both',
        'fade-in': 'fade-in 150ms ease-out both',
        'pulse-dot': 'pulse-dot 2s ease-in-out infinite',
        'speak-ring': 'speak-ring 1.4s ease-out infinite',
      },
    },
  },
  plugins: [],
};
