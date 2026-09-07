import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'out/**',
      'coverage/**',
      'test-results/**',
      '.npm-cache/**',
      '.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/items-010-*-oracle.{ts,tsx}',
      '.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/reminders-012-review-*.test.{ts,tsx}',
      '.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/background-013-review-retention-proof.test.ts',
      '.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/background-013-review-retention-race.test.ts',
      '.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/background-013-review-memory-inspect.test.ts'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node }
    }
  },
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser }
    },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.flat.recommended.rules
  }
)
