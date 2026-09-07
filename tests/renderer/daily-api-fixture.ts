import { vi } from 'vitest'
import type {
  DailyApi,
  DailyConfiguration,
  DailyDetail,
  DailyJob,
  DailyReport
} from '../../src/shared/daily-contract.js'
import type { OperationsApi, OperationsUsage } from '../../src/shared/operations-contract.js'

export const dailyAssistantA = '00000000-0000-4000-8000-000000003001'
export const dailyAssistantB = '00000000-0000-4000-8000-000000003002'
export const dailyConnection = '00000000-0000-4000-8000-000000003003'
export const dailyConfigurationId = '00000000-0000-4000-8000-000000003004'
export const dailyJobId = '00000000-0000-4000-8000-000000003005'
export const dailyReportId = '00000000-0000-4000-8000-000000003006'
export const dailyObservationId = '00000000-0000-4000-8000-000000003007'
export const dailyProposalId = '00000000-0000-4000-8000-000000003008'
export const dailyMemoryId = '00000000-0000-4000-8000-000000003009'

export function dailyConfiguration(
  overrides: Partial<DailyConfiguration> = {}
): DailyConfiguration {
  return {
    id: dailyConfigurationId,
    assistantId: dailyAssistantA,
    feature: 'observation',
    version: 2,
    enabled: true,
    connectionId: dailyConnection,
    model: 'daily-model',
    dataScope: {
      ownRounds: true,
      chapters: false,
      privateMemories: false,
      globalMemories: false,
      events: true,
      items: true,
      proposals: false,
      maxSources: 16,
      lookbackDays: 7
    },
    budget: { window: 'utc-day', calls: 5, inputCharacters: 100_000, maxOutputTokens: 1200 },
    schedule: {
      timeZone: 'Asia/Shanghai',
      localTime: '08:00',
      weekday: null,
      weekStartsOn: null,
      fold: null,
      gap: null
    },
    recovery: { mode: 'EXPLICIT', catchUpMinutes: 120, merge: false, expire: true },
    allowSaveObservations: true,
    allowProposals: true,
    deadlineWindowHours: 72,
    changeFields: [],
    mergeChanges: null,
    recipientFingerprint: 'a'.repeat(64),
    authorizedRecipient: true,
    ...overrides
  }
}

export function dailyJob(overrides: Partial<DailyJob> = {}): DailyJob {
  return {
    id: dailyJobId,
    version: 3,
    feature: 'observation',
    authorityAssistantId: dailyAssistantA,
    configurationId: dailyConfigurationId,
    configurationVersion: 2,
    occurrence: 'observation:2026-09-07',
    period: {
      start: '2026-09-06T00:00:00.000Z',
      end: '2026-09-07T00:00:00.000Z',
      timeZone: 'Asia/Shanghai',
      localLabel: '2026-09-07 观察'
    },
    state: 'PARTIAL',
    reason: '报告已生成，一项提案受限',
    attempts: 1,
    slots: [],
    createdAt: '2026-09-07T00:00:00.000Z',
    updatedAt: '2026-09-07T00:01:00.000Z',
    reportId: dailyReportId,
    budget: { callsUsed: 1, inputCharactersUsed: 2000, windowId: '2026-09-07' },
    ...overrides
  }
}

export function dailyReport(overrides: Partial<DailyReport> = {}): DailyReport {
  return {
    id: dailyReportId,
    version: 4,
    governanceVersion: 6,
    assistantId: dailyAssistantA,
    feature: 'observation',
    jobId: dailyJobId,
    period: {
      start: '2026-09-06T00:00:00.000Z',
      end: '2026-09-07T00:00:00.000Z',
      timeZone: 'Asia/Shanghai',
      localLabel: '今天的观察'
    },
    state: 'ACTIVE',
    unread: true,
    bodyAvailable: true,
    createdAt: '2026-09-07T00:02:00.000Z',
    connectionId: dailyConnection,
    model: 'daily-model',
    recipientFingerprint: 'a'.repeat(64),
    range: { included: 2, available: 3, limited: true, description: '最近 7 天，最多 16 条来源' },
    modelSkippedReason: null,
    ...overrides
  }
}

export function dailyDetail(overrides: Partial<DailyDetail> = {}): DailyDetail {
  const report = dailyReport()
  return {
    report,
    markdown: '# 今天\n\n保留正文。',
    sections: [
      {
        title: '进展',
        markdown: '完成了一项任务。',
        nature: 'faithful-summary',
        sourceHandles: ['S1']
      }
    ],
    observations: [
      {
        id: dailyObservationId,
        version: 2,
        title: '上午更专注',
        markdown: '连续两次在上午完成复杂任务。',
        nature: 'inference',
        status: 'pending-verification',
        independentRoots: 2,
        sourceHandles: ['S1'],
        memoryId: null,
        memoryVersion: null,
        suppressionId: null
      }
    ],
    proposalLinks: [
      {
        id: dailyProposalId,
        version: 1,
        candidate: {
          kind: 'task',
          title: '整理周报',
          description: '建议，尚未确认',
          status: 'open',
          dueAt: null,
          timeZone: null,
          parentId: null,
          relatedIds: [],
          counterpart: ''
        },
        originAssistantId: dailyAssistantA,
        state: 'DRAFT_PROPOSAL',
        acceptedItemId: null,
        sources: [],
        sourceUnavailable: false,
        createdAt: '2026-09-07T00:02:00.000Z',
        updatedAt: '2026-09-07T00:02:00.000Z'
      }
    ],
    providedSources: [
      {
        handle: 'S1',
        source: { type: 'memory', id: dailyMemoryId, assistantId: dailyAssistantA, version: 2 },
        title: '工作记录',
        eventStatus: null,
        occurredAt: null,
        timeZone: null
      }
    ],
    citedSources: [],
    checkpoints: [],
    nextCursor: null,
    ...overrides
  }
}

export function dailyApiDefaults(): DailyApi {
  const configuration = dailyConfiguration()
  const report = dailyReport()
  return {
    configure: vi.fn(async (input) => ({
      ok: true as const,
      data: dailyConfiguration({ ...input.settings, version: input.expectedVersion + 1 })
    })),
    query: vi.fn(async (input) => ({
      ok: true as const,
      data: {
        view: input.view,
        configurations: input.view === 'configurations' ? [configuration] : [],
        jobs: input.view === 'jobs' ? [dailyJob()] : [],
        reports: input.view === 'reports' ? [report] : [],
        nextCursor: null,
        attention: { unread: 1, currentFailures: 1 }
      }
    })),
    preview: vi.fn(async () => ({
      ok: true as const,
      data: {
        status: 'READY',
        nextRun: '2026-09-08T00:00:00.000Z',
        localDateTime: '2026-09-08 08:00',
        occurrence: 'observation:2026-09-08',
        period: null,
        dst: 'ordinary',
        alternatives: [],
        reason: '将在本地时间运行'
      }
    })) as DailyApi['preview'],
    inspect: vi.fn(async () => ({ ok: true as const, data: dailyDetail() })),
    run: vi.fn(async () => ({
      ok: true as const,
      data: dailyJob({ state: 'QUEUED', reason: '等待运行' })
    })),
    control: vi.fn(async (input) => ({
      ok: true as const,
      data: dailyJob({
        version: input.expectedVersion + 1,
        state: input.action === 'cancel' ? 'CANCELLED' : 'QUEUED',
        reason: '已处理'
      })
    })),
    decide: vi.fn(async (input) => ({
      ok: true as const,
      data: {
        commandId: input.commandId,
        state: 'SUCCEEDED',
        objectId: input.observationId,
        objectVersion: input.expectedVersion + 1,
        memory: null,
        suppressionId: null,
        summary: '观察已处理'
      }
    })) as DailyApi['decide'],
    ack: vi.fn(async (input) => ({
      ok: true as const,
      data: {
        commandId: input.commandId,
        state: 'SUCCEEDED',
        objectId: input.id,
        objectVersion: input.expectedVersion + 1,
        memory: null,
        suppressionId: null,
        summary: '已标为已读'
      }
    })) as DailyApi['ack'],
    onChanged: vi.fn(() => () => undefined)
  }
}

export function operationsUsage(): OperationsUsage {
  return {
    attempts: [],
    nextCursor: null,
    groups: [],
    groupsNextCursor: null,
    filters: { assistantId: dailyAssistantA },
    summary: {
      calls: 2,
      known: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      unknownRequests: 1,
      sendingRequests: 0,
      inputCharacters: 100,
      complete: false,
      historicalCoverage: '自启用持久用量记录以来'
    }
  }
}

export function operationsApiDefaults(): OperationsApi {
  return {
    query: vi.fn(async (input) => ({
      ok: true as const,
      data: { view: input.view, rows: [], nextCursor: null }
    })),
    usage: vi.fn(async () => ({ ok: true as const, data: operationsUsage() })),
    onChanged: vi.fn(() => () => undefined)
  }
}
