import { vi } from 'vitest'
import type {
  RetentionApi,
  RetentionPolicySettings,
  RetentionPolicySnapshot
} from '../../src/shared/retention-contract.js'

const previewId = '00000000-0000-4000-8000-000000000091'

export const retentionPolicySettings009: RetentionPolicySettings = {
  persistentCapacity: { enabled: true, limitBytes: 100 * 1024 * 1024 },
  stagingExpiry: { enabled: true, days: 90 }
}

export function retentionPolicySnapshot009(
  settings: RetentionPolicySettings = retentionPolicySettings009
): RetentionPolicySnapshot {
  return {
    revision: 1,
    settings,
    activatedAt: '2026-09-06T00:00:00.000Z',
    updatedAt: '2026-09-06T00:00:00.000Z',
    restoredPaused: false,
    usage: {
      acceptedBytes: 20,
      measurement: 'COMPLETE',
      unknownObjects: 0,
      overLimit: false
    },
    audit: {
      state: 'COMPLETE',
      checkedObjects: 1,
      totalObjects: 1,
      startedAt: '2026-09-06T00:00:00.000Z',
      completedAt: '2026-09-06T00:00:00.000Z'
    },
    staging: {
      trackedObjects: 0,
      dueObjects: 0,
      failedObjects: 0,
      nextDueAt: null,
      nextRetryAt: null,
      nextCheckAt: null
    },
    recentRun: null
  }
}

export function retentionPolicyApi009Defaults(): Pick<
  RetentionApi,
  'policy' | 'previewPolicy' | 'configurePolicy' | 'runPolicy'
> {
  return {
    policy: vi.fn(async () => ({ ok: true as const, data: retentionPolicySnapshot009() })),
    previewPolicy: vi.fn(async (input) => ({
      ok: true as const,
      data: {
        id: previewId,
        expectedRevision: input.expectedRevision,
        settings: input.settings,
        dueObjects: 0,
        firstBatch: [],
        capacityAfterSave: {
          acceptedBytes: 20,
          measurement: 'COMPLETE' as const,
          overLimit: false
        },
        restoredPauseWillClear: false
      }
    })),
    configurePolicy: vi.fn(async (input) => ({
      ok: true as const,
      data: retentionPolicySnapshot009(input.settings)
    })),
    runPolicy: vi.fn(async () => ({ ok: true as const, data: retentionPolicySnapshot009() }))
  }
}
