/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          orange: '#F68C1E',
          'orange-hover': '#ff9d38',
          dark: '#040C12',
        },
        surface: {
          base: '#2b2b2b',
          raised: '#3b3b3b',
          overlay: '#484848',
          border: '#565656',
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
