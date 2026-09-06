import { defineConfig } from 'vitest/config'
export default defineConfig({ esbuild: { jsx: 'automatic' }, test: { include: ['.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/retention-009-review-ui-oracles.test.tsx'], setupFiles: ['./tests/setup.ts'], restoreMocks: true } })
