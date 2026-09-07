import { vi } from 'vitest'
import type {
  BackgroundApi,
  BackgroundChapter,
  BackgroundJob,
  BackgroundSnapshot
} from '../../src/shared/background-contract.js'

export const backgroundAssistantA = '00000000-0000-4000-8000-000000001301'
export const backgroundAssistantB = '00000000-0000-4000-8000-000000001302'
export const backgroundConnectionA = '00000000-0000-4000-8000-000000001303'
export const backgroundConnectionB = '00000000-0000-4000-8000-000000001304'
export const backgroundJobId = '00000000-0000-4000-8000-000000001305'
export const backgroundChapterId = '00000000-0000-4000-8000-000000001306'
export const backgroundUnavailableChapterId = '00000000-0000-4000-8000-000000001307'
export const backgroundTopicId = '00000000-0000-4000-8000-000000001308'
export const backgroundRequestId = '00000000-0000-4000-8000-000000001309'

export function backgroundJob(
  state: BackgroundJob['state'] = 'REMOTE_UNKNOWN',
  overrides: Partial<BackgroundJob> = {}
): BackgroundJob {
  return {
    id: backgroundJobId,
    version: 2,
    assistantId: backgroundAssistantA,
    requestIds: [backgroundRequestId],
    configurationVersion: 1,
    state,
    attempts: 1,
    createdAt: '2026-09-07T01:00:00.000Z',
    updatedAt: '2026-09-07T01:01:00.000Z',
    reason: '等待核查远端是否已经执行',
    chapterId: null,
    receipt: null,
    ...overrides
  }
}

export function backgroundChapter(overrides: Partial<BackgroundChapter> = {}): BackgroundChapter {
  return {
    id: backgroundChapterId,
    version: 3,
    assistantId: backgroundAssistantA,
    jobId: backgroundJobId,
    title: '项目决策与后续',
    requestIds: [backgroundRequestId],
    createdAt: '2026-09-07T01:02:00.000Z',
    memoryId: '00000000-0000-4000-8000-000000001310',
    memoryVersion: 4,
    bodyHash: 'a'.repeat(64),
    state: 'AVAILABLE',
    topics: [
      {
        id: backgroundTopicId,
        version: 1,
        text: '确认下周的交付日期',
        nature: 'model-suggestion',
        state: 'OPEN'
      }
    ],
    ...overrides
  }
}

export function backgroundSnapshot(
  assistantId = backgroundAssistantA,
  overrides: Partial<BackgroundSnapshot> = {}
): BackgroundSnapshot {
  return {
    configuration: {
      assistantId,
      recipientFingerprint: null,
      recipientAuthorized: false,
      version: 0,
      role: 'assistant',
      feature: 'chapters',
      enabled: false,
      connectionId: null,
      model: null,
      allowOwnCompletedRounds: false,
      budget: null
    },
    usage: {
      windowId: '2026-09-07',
      calls: 0,
      inputCharacters: 0,
      knownPromptTokens: 0,
      knownCompletionTokens: 0,
      knownTotalTokens: 0,
      unknownAttempts: 0
    },
    nextCursor: null,
    jobs: [],
    chapters: [],
    ...overrides
  }
}

export function backgroundApi013Defaults(snapshot = backgroundSnapshot()): BackgroundApi {
  return {
    query: vi.fn(async () => ({ ok: true as const, data: snapshot })),
    configure: vi.fn(async () => ({ ok: true as const, data: snapshot })),
    run: vi.fn(async () => ({ ok: true as const, data: snapshot })),
    control: vi.fn(async () => ({ ok: true as const, data: snapshot })),
    chapter: vi.fn(async () => ({
      ok: true as const,
      data: { chapter: backgroundChapter(), markdown: '# 项目决策\n\n正文' }
    })),
    topic: vi.fn(async () => ({ ok: true as const, data: snapshot })),
    onChanged: vi.fn(() => () => undefined)
  }
}
