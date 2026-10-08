/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          orange: '#F16F18',
          'orange-hover': '#FE7929',
          dark: '#111111',
        },
        surface: {
          base: '#111111',
          raised: '#1b1b1b',
          overlay: '#242424',
          border: '#3a342f',
        },
        content: {
          primary: '#F3F0EC',
          secondary: '#C6C0BB',
          muted: '#88827D',
        },
        state: {
          error: '#F87171',
          success: '#4ADE80',
        },
      },
      fontFamily: {
        sans: ['Open Sans', 'system-ui', 'sans-serif'],
        display: ['Roboto Slab', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
