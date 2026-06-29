import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'scripts/write-omr-grading.cjs',
    'dist',
    'dist-electron',
    'out',
    'release',
    'node_modules',
    'omr_engine',
    'wppconnect-master',
    'student-portal-standalone/dist',
    'debug_scans',
    'RENAME/**',
  ]),
  {
    files: ['src/main/**/*.js', 'scripts/**/*.cjs', 'pm2-vite-server.js', 'ecosystem.config.cjs'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
])
