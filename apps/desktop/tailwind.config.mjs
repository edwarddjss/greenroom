/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        spotify: '#1DB954',
        discord: '#5865F2',
        bg: '#0B0B0F',
        surface: '#15151C',
        border: '#26263200',
        muted: '#9A9AA8',
        danger: '#ED4245',
        warn: '#FAA61A',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
