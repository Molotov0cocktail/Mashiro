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
    files: [
      'scripts/**/*.mjs',
      '.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-current-source-snapshot.mjs',
      '.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-upgrade-backup-verify.mjs',
      '.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/memory-017-format.mjs',
      '.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/memory-017-guarded-writer.mjs',
      '.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/reminders-014-login-electron-probe.cjs'
    ],
    languageOptions: {
      globals: { ...globals.node }
    }
  },
  {
    files: [
      '.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/reminders-014-login-electron-probe.cjs'
    ],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' }
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
