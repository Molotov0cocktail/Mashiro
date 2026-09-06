import { vi } from 'vitest'
import type { TimelineApi } from '../../src/shared/timeline-contract.js'

export function timelineApi006Defaults(): Pick<
  TimelineApi,
  'query' | 'permissions' | 'setPermissions'
> {
  return {
    query: vi.fn(async (input) => ({
      ok: true as const,
      data: {
        assistantId: input.assistantId,
        messages: [],
        nextCursor: null
      }
    })),
    permissions: vi.fn(async (input) => ({
      ok: true as const,
      data: {
        assistantId: input.assistantId,
        connectionId: null,
        endpointFingerprint: null,
        endpointDisplay: null,
        readHistory: true,
        sendHistory: false,
        version: 0
      }
    })),
    setPermissions: vi.fn(async (input) => ({
      ok: true as const,
      data: {
        assistantId: input.assistantId,
        connectionId: input.connectionId,
        endpointFingerprint: input.endpointFingerprint,
        endpointDisplay: null,
        readHistory: input.readHistory,
        sendHistory: input.sendHistory,
        version: input.expectedVersion + 1
      }
    }))
  }
}
