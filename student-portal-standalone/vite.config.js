import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'

/** تمرير التكوين ككائن يمنع Tailwind من محاولة تحميل ملف CSS كـ JS (خطأ sucrase). */
const tailwindInlineConfig = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        header: ['var(--font-header)', 'sans-serif'],
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  css: {
    postcss: {
      plugins: [tailwindcss({ config: tailwindInlineConfig }), autoprefixer()],
    },
  },
  base: '/',
  appType: 'spa',
})
