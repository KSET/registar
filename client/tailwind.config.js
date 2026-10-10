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
          base: '#20201f',
          raised: '#2c2b2a',
          overlay: '#383634',
          border: '#514942',
        },
        content: {
          primary: '#FFFFFF',
          secondary: '#C4C4C4',
          muted: '#8A8A8A',
        },
        state: {
          error: '#F87171',
          success: '#4ADE80',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
