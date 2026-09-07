// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { RetentionPanel } from '../../src/renderer/src/features/retention/RetentionPanel'
import type { AssistantSnapshot } from '../../src/shared/assistant-contract'
import type { MemoryApi, MemoryRecord } from '../../src/shared/memory-contract'
import type { RetentionApi, RetentionPreview } from '../../src/shared/retention-contract'
import { memoryApi008Defaults } from './memory-api-fixture'
import { retentionPolicyApi009Defaults } from './retention-api-fixture'

const assistantId = '00000000-0000-4000-8000-000000000001'
const memoryId = '00000000-0000-4000-8000-000000000002'
const previewId = '00000000-0000-4000-8000-000000000003'
const nonce = '00000000-0000-4000-8000-000000000004'
const jobId = '00000000-0000-4000-8000-000000000005'
const requestId = '00000000-0000-4000-8000-000000000006'

const snapshot: AssistantSnapshot = {
  assistants: [
    {
      id: assistantId,
      displayName: '日常助手',
      persona: '',
      avatarKey: 'mashiro',
      isArchived: false,
      createdAt: '2026-09-06T00:00:00.000Z',
      updatedAt: '2026-09-06T00:00:00.000Z',
      archivedAt: null,
      version: 1
    }
  ],
  currentAssistantId: assistantId,
  primaryAssistantId: assistantId,
  stateRevision: 1
}

const record: MemoryRecord = {
  id: memoryId,
  objectVersion: 3,
  kind: 'user',
  scope: 'global',
  ownerAssistantId: assistantId,
  title: '旅行偏好',
  markdown: '喜欢靠窗座位',
  nature: 'user-statement',
  event: null,
  state: 'active',
  retention: 'persistent',
  createdAt: '2026-09-06T00:00:00.000Z',
  updatedAt: '2026-09-06T00:00:00.000Z',
  sources: []
}

function preview(blockers: string[] = []): RetentionPreview {
  return {
    id: previewId,
    nonce,
    epoch: 7,
    intent: 'withdraw-information',
    rounds: [
      {
        assistantId,
        requestId,
        createdAt: '2026-09-06T00:30:00.000Z',
        summary: '讨论靠窗座位'
      }
    ],
    memories: [
      {
        id: memoryId,
        version: 3,
        ownerAssistantId: assistantId,
        kind: 'user',
        scope: 'global',
        title: '旅行偏好'
      }
    ],
    memoryIds: [memoryId],
    requestIds: [requestId],
    retainedMemoryIds: [],
    itemImpact: {
      items: [{ id: '00000000-0000-4000-8000-000000000021', version: 2 }],
      proposals: [
        { id: '00000000-0000-4000-8000-000000000022', version: 3, delete: true },
        { id: '00000000-0000-4000-8000-000000000023', version: 4, delete: false }
      ]
    },
    files: 2,
    expandedToRounds: true,
    irreversible: true,
    replacementAssistantId: null,
    blockers,
    warning: '将立即停止使用，并异步清理受管副本。'
  }
}

function retentionApi(value = preview()): RetentionApi {
  return {
    ...retentionPolicyApi009Defaults(),
    overview: vi.fn(async () => ({
      ok: true as const,
      data: {
        epoch: 7,
        zones: [
          {
            zone: 'persistent' as const,
            objects: 1,
            acceptedBytes: 20,
            measurement: 'COMPLETE' as const,
            unknownObjects: 0
          },
          {
            zone: 'staging' as const,
            objects: 0,
            acceptedBytes: 0,
            measurement: 'COMPLETE' as const,
            unknownObjects: 0
          },
          {
            zone: 'trash' as const,
            objects: 0,
            acceptedBytes: 0,
            measurement: 'COMPLETE' as const,
            unknownObjects: 0
          }
        ],
        managedFileBytes: 32,
        databaseBytes: 64,
        automaticPolicy: 'ACTIVE' as const
      }
    })),
    move: vi.fn(async (input) => ({
      ok: true as const,
      data: {
        commandId: input.commandId,
        epoch: 8,
        jobId: null,
        state: 'MOVED' as const,
        objectVersion: 4
      }
    })),
    preview: vi.fn(async () => ({ ok: true as const, data: value })),
    confirm: vi.fn(async (input) => ({
      ok: true as const,
      data: {
        commandId: input.commandId,
        epoch: 8,
        jobId,
        state: 'CLEANUP_PENDING' as const,
        objectVersion: null
      }
    })),
    jobs: vi.fn(async () => ({ ok: true as const, data: { jobs: [], nextCursor: null } })),
    retry: vi.fn(),
    onChanged: vi.fn(() => () => undefined)
  } as RetentionApi
}

function memoryApi(): MemoryApi {
  return {
    ...memoryApi008Defaults(),
    query: vi.fn(async () => ({
      ok: true as const,
      data: { records: [record], nextCursor: null }
    }))
  } as MemoryApi
}

afterEach(cleanup)

it.each(['job-status', 'policy-status'] as const)(
  '%s refresh preserves an unsaved capacity setting',
  async (reason) => {
    const api = retentionApi()
    const props = {
      api,
      memoryApi: memoryApi(),
      assistantSnapshot: snapshot,
      fallbackAssistantId: assistantId,
      pendingCommands: new Map(),
      onRefreshAssistants: vi.fn()
    }
    const view = render(<RetentionPanel {...props} />)
    const capacity = await screen.findByLabelText('容量上限（MiB）')
    fireEvent.change(capacity, { target: { value: '64' } })
    expect(capacity).toHaveValue(64)
    const beforeCalls = vi.mocked(api.policy).mock.calls.length
    view.rerender(
      <RetentionPanel
        {...props}
        changed={{
          epoch: 1,
          assistantIds: reason === 'job-status' ? [assistantId] : [],
          memoryIds: [],
          requestIds: [],
          reason
        }}
      />
    )
    await waitFor(() => expect(api.policy).toHaveBeenCalledTimes(beforeCalls + 1))
    await waitFor(() => expect(screen.getByLabelText('容量上限（MiB）')).toHaveValue(64))
  }
)
