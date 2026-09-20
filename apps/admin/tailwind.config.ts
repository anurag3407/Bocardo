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
          50: '#F0FDFA',
          100: '#CCFBF1',
          500: '#0D9488',
          600: '#0F766E',
          700: '#115E59',
        },
      },
    },
  },
  plugins: [],
};
export default config;
