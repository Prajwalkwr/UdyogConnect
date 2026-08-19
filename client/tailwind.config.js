/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#F2B71D',
        'primary-dark': '#D4A017',
        'primary-light': '#FEF9E7',
        secondary: '#1A1A2E',
        'secondary-light': '#2D2E50',
        'bg-main': '#F5F6FA',
        'bg-card': '#FFFFFF',
      },
    },
  },
  plugins: [],
};
