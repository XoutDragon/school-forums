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
        },
        // Per-feature secondary hues, fixed by the brief.
        clubs: 'rgb(var(--clubs) / <alpha-value>)',
        courses: 'rgb(var(--courses) / <alpha-value>)',
        events: 'rgb(var(--events) / <alpha-value>)',
      },
      fontFamily: {
        // No CDN fonts — the app has to run offline. Personality comes from how these
        // are set, not from which files get downloaded.
        display: [
          '"Segoe UI Variable Display"',
          '"SF Pro Display"',
          'Inter',
          'system-ui',
          'sans-serif',
        ],
        sans: [
          '"Segoe UI Variable Text"',
          '"Segoe UI"',
          '-apple-system',
          'system-ui',
          'sans-serif',
        ],
        mono: ['"Cascadia Code"', '"JetBrains Mono"', 'ui-monospace', 'Consolas', 'monospace'],
      },
      fontSize: {
        // Display sizes carry their own tracking — negative and tightening as they grow.
        'display-xl': ['3.25rem', { lineHeight: '1', letterSpacing: '-0.04em', fontWeight: '680' }],
        'display-lg': [
          '2.25rem',
          { lineHeight: '1.05', letterSpacing: '-0.032em', fontWeight: '660' },
        ],
        'display-md': [
          '1.5rem',
          { lineHeight: '1.15', letterSpacing: '-0.024em', fontWeight: '640' },
        ],
        // The utility face. Uppercase, wide, small — used for terms, codes and eyebrows.
        eyebrow: ['0.6875rem', { lineHeight: '1', letterSpacing: '0.14em', fontWeight: '600' }],
        code: ['0.8125rem', { lineHeight: '1.2', letterSpacing: '0.02em', fontWeight: '600' }],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
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
      },
      animation: {
        'rise-in': 'rise-in 150ms ease-out both',
        'fade-in': 'fade-in 150ms ease-out both',
        'pulse-dot': 'pulse-dot 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
