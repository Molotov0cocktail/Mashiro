import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Archived review snapshots retain their original fixtures; run new reviews with an explicit config.
    include: ['tests/**/*.test.{ts,tsx}'],
    // Bound host process contention without relaxing individual test deadlines.
    maxWorkers: 2,
    setupFiles: ['./tests/setup.ts'],
    restoreMocks: true
  }
})
