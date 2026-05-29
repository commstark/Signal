import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  // Cream is the default. .dark on <html> opts in to the dark theme.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        'ink-3': 'var(--ink-3)',
        line: 'var(--line)',
        accent: 'var(--accent)',
        'accent-fg': 'var(--accent-fg)',
        'signal-red': 'var(--signal-red)',
        'signal-green': 'var(--signal-green)',
        'signal-orange': 'var(--signal-orange)',
        mint: 'var(--mint)',
        peach: 'var(--peach)',
        lilac: 'var(--lilac)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      // Recalibrated scale for Plus Jakarta Sans — slightly larger body and
      // a more confident display weight to match the Nixtio specimen.
      fontSize: {
        display: ['60px', { lineHeight: '64px', fontWeight: '600', letterSpacing: '-0.02em' }],
        h1: ['36px', { lineHeight: '42px', fontWeight: '600', letterSpacing: '-0.015em' }],
        h2: ['24px', { lineHeight: '30px', fontWeight: '600', letterSpacing: '-0.01em' }],
        h3: ['18px', { lineHeight: '26px', fontWeight: '600' }],
        body: ['16px', { lineHeight: '24px', fontWeight: '400' }],
        small: ['14px', { lineHeight: '20px', fontWeight: '400' }],
        micro: ['12px', { lineHeight: '16px', fontWeight: '500' }],
      },
      borderRadius: {
        DEFAULT: '12px',
        lg: '16px',
        xl: '20px',
        '2xl': '24px',
        '3xl': '32px',
      },
      boxShadow: {
        'soft-sm': '0 1px 2px rgba(20, 14, 4, 0.04), 0 1px 4px rgba(20, 14, 4, 0.04)',
        soft: '0 2px 8px rgba(20, 14, 4, 0.06), 0 4px 16px rgba(20, 14, 4, 0.05)',
        'soft-lg': '0 8px 24px rgba(20, 14, 4, 0.08), 0 16px 48px rgba(20, 14, 4, 0.06)',
      },
      animation: {
        'record-pulse': 'recordPulse 1.2s ease-in-out infinite',
        'dot-pulse': 'dotPulse 1.6s ease-in-out infinite',
        'transcribing': 'transcribing 0.4s steps(4) infinite',
        'tour-pulse': 'tourPulse 1.2s ease-in-out infinite',
        'tour-ripple': 'tourRipple 0.6s ease-out forwards',
        'tour-wave': 'tourWave 0.9s ease-in-out infinite',
      },
      keyframes: {
        tourPulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
        tourRipple: {
          '0%': { transform: 'scale(1)', opacity: '0.8' },
          '100%': { transform: 'scale(2.2)', opacity: '0' },
        },
        tourWave: {
          '0%, 100%': { transform: 'scaleY(0.35)' },
          '50%': { transform: 'scaleY(1)' },
        },
        recordPulse: {
          '0%, 100%': { filter: 'brightness(1)' },
          '50%': { filter: 'brightness(1.03)' },
        },
        dotPulse: {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.35)', opacity: '0.7' },
        },
        transcribing: {
          '0%': { content: '"."' },
          '33%': { content: '".."' },
          '66%': { content: '"..."' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
