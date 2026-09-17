import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bocardo: {
          50: '#FFF7ED',
          100: '#FFEDD5',
          500: '#FC8019',
          600: '#EA580C',
          700: '#C2410C',
        },
      },
    },
  },
  plugins: [],
};
export default config;
