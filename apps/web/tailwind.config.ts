import type { Config } from 'tailwindcss';

/**
 * "Blueprint" design system — a drafting table, not a stack of sticky notes.
 * Colors are driven by CSS variables (see styles/globals.css) so dark mode is
 * a single token swap.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--canvas)',
        surface: 'var(--surface)',
        rule: 'var(--rule)',
        ink: {
          DEFAULT: 'var(--ink)',
          muted: 'var(--ink-muted)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          wash: 'var(--accent-wash)',
        },
        spine: {
          urgent: 'var(--spine-urgent)',
          normal: 'var(--spine-normal)',
          idea: 'var(--spine-idea)',
        },
      },
      fontFamily: {
        sans: ['var(--font-instrument)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '6px',
      },
      boxShadow: {
        // The only elevation in the app — reserved for the dragging card.
        drag: '0 12px 24px -8px rgba(23, 33, 45, 0.35)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fade-in 120ms ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
