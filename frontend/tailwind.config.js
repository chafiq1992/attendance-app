/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        background: 'var(--color-bg-start)',
        foreground: 'var(--color-foreground)',
        emerald: 'var(--color-emerald)',
        coral: 'var(--color-coral)',
        sapphire: 'var(--color-sapphire)',
        violet: 'var(--color-violet)'
      },
    },
  },
  plugins: [],
}
