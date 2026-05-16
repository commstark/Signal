import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        'ink-3': 'var(--ink-3)',
        line: 'var(--line)',
        accent: 'var(--accent)',
        'accent-fg': 'var(--accent-fg)',
        'signal-red': 'var(--signal-red)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        display: ['56px', { lineHeight: '60px', fontWeight: '500' }],
        h1: ['32px', { lineHeight: '38px', fontWeight: '500' }],
        h2: ['22px', { lineHeight: '28px', fontWeight: '500' }],
        h3: ['17px', { lineHeight: '24px', fontWeight: '500' }],
        body: ['15px', { lineHeight: '22px', fontWeight: '400' }],
        small: ['13px', { lineHeight: '18px', fontWeight: '400' }],
        micro: ['11px', { lineHeight: '14px', fontWeight: '500' }],
      },
      borderRadius: {
        DEFAULT: '4px',
      },
      animation: {
        'record-pulse': 'recordPulse 1.2s ease-in-out infinite',
        'launch-pulse': 'launchPulse 1.2s ease-in-out infinite',
        'transcribing': 'transcribing 0.4s steps(4) infinite',
      },
      keyframes: {
        recordPulse: {
          '0%, 100%': { filter: 'brightness(1)' },
          '50%': { filter: 'brightness(1.03)' },
        },
        launchPulse: {
          '0%, 100%': { filter: 'brightness(1)' },
          '50%': { filter: 'brightness(1.05)' },
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
