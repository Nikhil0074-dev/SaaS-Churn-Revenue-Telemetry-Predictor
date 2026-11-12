/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F4F2EC', card: '#FFFFFF', line: '#E2DED1', ink: '#16231F', muted: '#5F6B66', faint: '#8B958F',
        pine: { DEFAULT: '#0E5C54', dark: '#0A423D', soft: '#DCEBE8' },
        night: '#12201C',
        risk: { high: '#B4321F', highsoft: '#F7E1DC', med: '#B96F00', medsoft: '#FBEBCB', low: '#2F7D4F', lowsoft: '#DDEFE3', none: '#6B7570', nonesoft: '#E9E7DF' },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'Segoe UI', 'sans-serif'],
        serif: ['"Source Serif 4"', 'Georgia', 'serif'],
      },
      boxShadow: { card: '0 1px 0 rgba(22,35,31,0.04), 0 1px 3px rgba(22,35,31,0.06)' },
    },
  },
  plugins: [],
}
