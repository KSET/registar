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
          base: '#1b1b1b',
          raised: '#262626',
          overlay: '#32302e',
          border: '#4a413b',
        },
        content: {
          primary: '#F3F0EC',
          secondary: '#D0C9C3',
          muted: '#9A928C',
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
