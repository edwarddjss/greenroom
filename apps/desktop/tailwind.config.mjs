/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // greenroom's own accent — a deeper emerald, deliberately not Spotify's #1DB954.
        accent: { DEFAULT: '#1FA877', hover: '#27C089', ink: '#04140D' },
        // Platform colors are semantic: use only where they literally mean that service.
        spotify: '#1DB954',
        discord: '#5865F2',
        // Elevation scale (dark UI: higher in the stack = lighter surface).
        bg: '#0A0A0C',
        surface: '#15151B',
        raised: '#1D1D25',
        sunken: '#0E0E13',
        text: '#F3F3F5',
        muted: '#9A9AA8',
        // One hairline, one emphasis line — replaces the ad-hoc white/[0.0x] sprawl.
        line: 'rgba(255,255,255,0.07)',
        'line-strong': 'rgba(255,255,255,0.13)',
        danger: '#ED4245',
        warn: '#FAA61A',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      // Default border + ring colors so bare `border` / `ring` use the system line.
      borderColor: { DEFAULT: 'rgba(255,255,255,0.07)' },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.35)',
        raised: '0 16px 48px -12px rgba(0,0,0,0.7)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'pop-in': {
          from: { opacity: '0', transform: 'translateY(6px) scale(0.985)' },
          to: { opacity: '1', transform: 'none' },
        },
      },
      animation: {
        'fade-in': 'fade-in 120ms ease-out',
        'pop-in': 'pop-in 180ms cubic-bezier(0.16,1,0.3,1)',
      },
    },
  },
  plugins: [],
};
