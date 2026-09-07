import { vi } from 'vitest'
import type { MemoryRecord, MemorySource } from '../../src/shared/memory-contract.js'
import type {
  StewardApi,
  StewardBranch,
  StewardConflict,
  StewardJob,
  StewardPending,
  StewardSnapshot
} from '../../src/shared/steward-contract.js'

export const stewardAssistantA = '00000000-0000-4000-8000-000000001501'
export const stewardAssistantB = '00000000-0000-4000-8000-000000001502'
export const stewardConnectionA = '00000000-0000-4000-8000-000000001503'
export const stewardPendingId = '00000000-0000-4000-8000-000000001504'
export const stewardJobId = '00000000-0000-4000-8000-000000001505'
export const stewardBranchId = '00000000-0000-4000-8000-000000001506'
export const stewardConflictId = '00000000-0000-4000-8000-000000001507'
export const stewardMemoryA = '00000000-0000-4000-8000-000000001508'
export const stewardMemoryB = '00000000-0000-4000-8000-000000001509'
export const stewardCommandId = '00000000-0000-4000-8000-000000001510'

export function stewardSource(id = stewardMemoryA, version = 2): MemorySource {
  return { type: 'memory', id, assistantId: stewardAssistantA, version }
}

export function stewardRecord(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: stewardMemoryA,
    objectVersion: 2,
    kind: 'user',
    scope: 'global',
    ownerAssistantId: stewardAssistantA,
    title: '长期偏好',
    markdown: '喜欢在上午处理复杂工作。',
    nature: 'user-statement',
    event: null,
    state: 'active',
    retention: 'persistent',
    createdAt: '2026-09-07T01:00:00.000Z',
    updatedAt: '2026-09-07T01:00:00.000Z',
    sources: [stewardSource()],
    ...overrides
  }
}

export function stewardPending(overrides: Partial<StewardPending> = {}): StewardPending {
  return {
    id: stewardPendingId,
    version: 1,
    entryKind: 'shared-candidate',
    authorityAssistantId: stewardAssistantA,
    state: 'pending',
    title: '工作时间偏好',
    nature: 'faithful-summary',
    createdAt: '2026-09-07T01:00:00.000Z',
    sources: [stewardSource('00000000-0000-4000-8000-000000001511', 1)],
    available: true,
    ...overrides
  }
}

export function stewardJob(overrides: Partial<StewardJob> = {}): StewardJob {
  return {
    id: stewardJobId,
    version: 3,
    role: 'steward',
    authorityAssistantId: stewardAssistantA,
    entryId: stewardPendingId,
    entryVersion: 1,
    configurationVersion: 2,
    state: 'PARTIAL',
    attempts: 1,
    createdAt: '2026-09-07T01:01:00.000Z',
    updatedAt: '2026-09-07T01:02:00.000Z',
    reason: '一个分项已完成，一个分项等待权限',
    slots: [
      {
        id: '00000000-0000-4000-8000-000000001512',
        commandId: stewardCommandId,
        state: 'COMPLETED',
        action: 'remember',
        memoryId: stewardMemoryA,
        memoryVersion: 2,
        branchId: stewardBranchId,
        conflictId: null,
        reason: '已保存'
      }
    ],
    ...overrides
  }
}

export function stewardBranch(overrides: Partial<StewardBranch> = {}): StewardBranch {
  return { id: stewardBranchId, version: 4, title: '工作方式', ...overrides }
}

export function stewardConflict(overrides: Partial<StewardConflict> = {}): StewardConflict {
  return {
    id: stewardConflictId,
    version: 2,
    state: 'OPEN',
    left: stewardSource(stewardMemoryA, 2),
    right: stewardSource(stewardMemoryB, 3),
    branchIds: [stewardBranchId],
    resolution: null,
    ...overrides
  }
}

export function stewardSnapshot(
  assistantId = stewardAssistantA,
  overrides: Partial<StewardSnapshot> = {}
): StewardSnapshot {
  const usage = {
    windowId: '2026-09-07',
    calls: 0,
    inputCharacters: 0,
    knownPromptTokens: 0,
    knownCompletionTokens: 0,
    knownTotalTokens: 0,
    unknownAttempts: 0
  }
  return {
    discovery: {
      assistantId,
      version: 0,
      role: 'assistant',
      feature: 'shared-candidates',
      enabled: false,
      connectionId: null,
      model: null,
      allowOwnCompletedRounds: false,
      budget: null,
      recipientFingerprint: null
    },
    configuration: {
      version: 0,
      role: 'steward',
      enabled: false,
      connectionId: null,
      model: null,
      assistantIds: [],
      allowAcceptedMemories: false,
      allowSharedCandidates: false,
      allowWrite: false,
      allowInferences: false,
      budget: null,
      recipientFingerprint: null
    },
    usage,
    discoveryUsage: usage,
    pending: [],
    jobs: [],
    branches: [],
    conflicts: [],
    nextCursor: null,
    ...overrides
  }
}

export function stewardApi013Defaults(snapshot = stewardSnapshot()): StewardApi {
  return {
    query: vi.fn(async () => ({ ok: true as const, data: snapshot })),
    configure: vi.fn(async () => ({ ok: true as const, data: snapshot })),
    run: vi.fn(async () => ({ ok: true as const, data: snapshot })),
    control: vi.fn(async () => ({ ok: true as const, data: snapshot })),
    pending: vi.fn(async () => ({
      ok: true as const,
      data: { entry: stewardPending(), markdown: '候选 Markdown' }
    })),
    branch: vi.fn(async () => ({
      ok: true as const,
      data: {
        branch: stewardBranch(),
        members: [stewardRecord()],
        conflicts: [],
        markdown: '# 工作方式',
        nextCursor: null
      }
    })),
    organize: vi.fn(async () => ({ ok: true as const, data: snapshot })),
    resolveConflict: vi.fn(async () => ({ ok: true as const, data: snapshot })),
    onChanged: vi.fn(() => () => undefined)
  }
}
