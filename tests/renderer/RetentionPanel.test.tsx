// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RetentionPanel } from '../../src/renderer/src/features/retention/RetentionPanel'
import type { AssistantSnapshot } from '../../src/shared/assistant-contract'
import type { MemoryApi, MemoryRecord } from '../../src/shared/memory-contract'
import type { RetentionApi, RetentionPreview } from '../../src/shared/retention-contract'
import { memoryApi008Defaults } from './memory-api-fixture'

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
    overview: vi.fn(async () => ({
      ok: true as const,
      data: {
        epoch: 7,
        zones: [
          { zone: 'persistent' as const, objects: 1, acceptedBytes: 20 },
          { zone: 'staging' as const, objects: 0, acceptedBytes: 0 },
          { zone: 'trash' as const, objects: 0, acceptedBytes: 0 }
        ],
        managedFileBytes: 32,
        databaseBytes: 64,
        automaticPolicy: 'UNCONFIGURED' as const
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

describe('RetentionPanel', () => {
  it('shows manual zones and blocks confirmation when the complete preview has blockers', async () => {
    const api = retentionApi(preview(['缺少仓储员接受结果，不能回收原文']))
    render(
      <RetentionPanel
        api={api}
        memoryApi={memoryApi()}
        assistantSnapshot={snapshot}
        fallbackAssistantId={assistantId}
        pendingCommands={new Map()}
        onRefreshAssistants={vi.fn()}
      />
    )

    expect(
      await screen.findByText(/受管 Markdown 文件占用：32 B · 数据库及运行文件占用：64 B/)
    ).toBeInTheDocument()
    expect(screen.getByText(/当前只提供手动操作/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: /选择“旅行偏好”/ }))
    fireEvent.change(screen.getByLabelText('操作意图'), {
      target: { value: 'withdraw-information' }
    })
    fireEvent.click(screen.getByRole('button', { name: '查看完整影响' }))

    expect(await screen.findByText('缺少仓储员接受结果，不能回收原文')).toBeInTheDocument()
    expect(screen.getByText('讨论靠窗座位')).toBeInTheDocument()
    const itemImpact = screen.getByRole('region', { name: '事项与提案清理影响' })
    expect(itemImpact).toHaveTextContent('正式事项保留')
    expect(itemImpact).toHaveTextContent('00000000-0000-4000-8000-000000000021')
    expect(itemImpact).toHaveTextContent('提案永久删除')
    expect(itemImpact).toHaveTextContent('提案保留')
    expect(screen.getByText(requestId).closest('li')).toHaveTextContent('日常助手')
    expect(screen.getByRole('button', { name: '本机确认执行' })).toBeDisabled()
    expect(api.confirm).not.toHaveBeenCalled()
  })

  it('reuses the same command id when a confirmation receipt is unknown', async () => {
    const api = retentionApi()
    vi.mocked(api.confirm)
      .mockRejectedValueOnce(new Error('synthetic lost receipt'))
      .mockImplementationOnce(async (input) => ({
        ok: true as const,
        data: {
          commandId: input.commandId,
          epoch: 8,
          jobId,
          state: 'CLEANUP_PENDING' as const,
          objectVersion: null
        }
      }))
    render(
      <RetentionPanel
        api={api}
        memoryApi={memoryApi()}
        assistantSnapshot={snapshot}
        fallbackAssistantId={assistantId}
        pendingCommands={new Map()}
        onRefreshAssistants={vi.fn()}
      />
    )
    fireEvent.click(await screen.findByRole('checkbox', { name: /选择“旅行偏好”/ }))
    fireEvent.change(screen.getByLabelText('操作意图'), {
      target: { value: 'withdraw-information' }
    })
    fireEvent.click(screen.getByRole('button', { name: '查看完整影响' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: /我已核对上述全部范围/ }))
    fireEvent.click(screen.getByRole('button', { name: '本机确认执行' }))
    expect(await screen.findByText(/确认回执未知/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '本机确认执行' }))
    await waitFor(() => expect(api.confirm).toHaveBeenCalledTimes(2))
    expect(vi.mocked(api.confirm).mock.calls[0]![0].commandId).toBe(
      vi.mocked(api.confirm).mock.calls[1]![0].commandId
    )
  })

  it('keeps failed cleanup jobs reachable without an active assistant', async () => {
    const api = retentionApi()
    vi.mocked(api.jobs).mockResolvedValue({
      ok: true,
      data: {
        jobs: [
          {
            id: jobId,
            state: 'FAILED_RETRYABLE',
            total: 3,
            completed: 1,
            error: 'STORAGE_UNAVAILABLE',
            createdAt: '2026-09-06T01:00:00.000Z',
            assistantId
          }
        ],
        nextCursor: 12
      }
    })
    vi.mocked(api.retry).mockResolvedValue({
      ok: true,
      data: {
        commandId: '00000000-0000-4000-8000-000000000007',
        epoch: 9,
        jobId,
        state: 'CLEANUP_PENDING',
        objectVersion: null
      }
    })
    render(
      <RetentionPanel
        api={api}
        memoryApi={memoryApi()}
        assistantSnapshot={{
          assistants: [],
          currentAssistantId: null,
          primaryAssistantId: null,
          stateRevision: 9
        }}
        fallbackAssistantId=""
        pendingCommands={new Map()}
        onRefreshAssistants={vi.fn()}
      />
    )
    fireEvent.click(await screen.findByRole('button', { name: '加载更多清理作业' }))
    await waitFor(() => expect(api.jobs).toHaveBeenCalledWith({ protocolVersion: 1, cursor: 12 }))
    fireEvent.click(screen.getAllByRole('button', { name: '重试核查与清理' })[0]!)
    await waitFor(() => expect(api.jobs).toHaveBeenCalledWith({ protocolVersion: 1 }))
    expect(api.retry).toHaveBeenCalledWith({ protocolVersion: 1, jobId })
  })

  it('does not restore a preview that resolves after governance changed', async () => {
    const api = retentionApi()
    const memories = memoryApi()
    let resolvePreview!: (value: Awaited<ReturnType<RetentionApi['preview']>>) => void
    vi.mocked(api.preview).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePreview = resolve
        })
    )
    const view = render(
      <RetentionPanel
        api={api}
        memoryApi={memories}
        assistantSnapshot={snapshot}
        fallbackAssistantId={assistantId}
        pendingCommands={new Map()}
        onRefreshAssistants={vi.fn()}
      />
    )
    await screen.findByRole('checkbox', { name: /选择“旅行偏好”/ })
    fireEvent.click(screen.getByRole('button', { name: '查看完整影响' }))
    await waitFor(() => expect(api.preview).toHaveBeenCalledTimes(1))
    view.rerender(
      <RetentionPanel
        api={api}
        memoryApi={memories}
        assistantSnapshot={snapshot}
        fallbackAssistantId={assistantId}
        changed={{
          epoch: 9,
          assistantIds: [assistantId],
          memoryIds: [memoryId],
          requestIds: [requestId],
          reason: 'cleanup'
        }}
        pendingCommands={new Map()}
        onRefreshAssistants={vi.fn()}
      />
    )
    await act(async () => {
      resolvePreview({ ok: true, data: preview() })
      await Promise.resolve()
    })
    expect(screen.queryByLabelText('可信清理确认')).not.toBeInTheDocument()
    expect(screen.getByText('数据已变化，旧预览已经失效。请重新查看完整影响。')).toBeInTheDocument()
  })
  it('uses only selected trash memories and their exact versions for empty-trash', async () => {
    const api = retentionApi()
    const memories = memoryApi()
    const trashRecord: MemoryRecord = {
      ...record,
      id: '00000000-0000-4000-8000-000000000008',
      objectVersion: 5,
      title: '待清空的记忆垃圾',
      retention: 'trash'
    }
    vi.mocked(memories.query).mockResolvedValue({
      ok: true,
      data: { records: [record, trashRecord], nextCursor: 101 }
    })
    render(
      <RetentionPanel
        api={api}
        memoryApi={memories}
        assistantSnapshot={snapshot}
        fallbackAssistantId={assistantId}
        pendingCommands={new Map()}
        onRefreshAssistants={vi.fn()}
      />
    )

    fireEvent.click(await screen.findByRole('checkbox', { name: /选择“旅行偏好”/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /选择“待清空的记忆垃圾”/ }))
    fireEvent.change(screen.getByLabelText('操作意图'), { target: { value: 'empty-trash' } })
    expect(screen.getByRole('checkbox', { name: /选择“旅行偏好”/ })).not.toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: '查看完整影响' }))

    await waitFor(() =>
      expect(api.preview).toHaveBeenCalledWith({
        protocolVersion: 1,
        assistantId,
        intent: 'empty-trash',
        target: {
          type: 'memories',
          objects: [{ id: trashRecord.id, version: trashRecord.objectVersion }]
        }
      })
    )
  })

  it('does not present the first loaded page as all memory trash when nothing is selected', async () => {
    render(
      <RetentionPanel
        api={retentionApi()}
        memoryApi={memoryApi()}
        assistantSnapshot={snapshot}
        fallbackAssistantId={assistantId}
        pendingCommands={new Map()}
        onRefreshAssistants={vi.fn()}
      />
    )
    await screen.findByRole('checkbox', { name: /选择“旅行偏好”/ })
    fireEvent.change(screen.getByLabelText('操作意图'), { target: { value: 'empty-trash' } })

    expect(
      screen.getByText(/请选择垃圾区中的具体记忆.+不会把当前页当作全部垃圾/)
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看完整影响' })).toBeDisabled()
  })

  it('preserves an explicitly prepared original-trash conversation target', async () => {
    const api = retentionApi()
    render(
      <RetentionPanel
        api={api}
        memoryApi={memoryApi()}
        assistantSnapshot={snapshot}
        fallbackAssistantId={assistantId}
        preparedTarget={{
          assistantId,
          target: { type: 'message', messageId: '00000000-0000-4000-8000-000000000009' },
          intent: 'empty-trash',
          nonce: 1
        }}
        pendingCommands={new Map()}
        onRefreshAssistants={vi.fn()}
      />
    )

    await waitFor(() => expect(screen.getByLabelText('操作意图')).toHaveValue('empty-trash'))
    expect(screen.getByText(/从对话带入的原文垃圾范围/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '查看完整影响' }))
    await waitFor(() =>
      expect(api.preview).toHaveBeenCalledWith({
        protocolVersion: 1,
        assistantId,
        intent: 'empty-trash',
        target: { type: 'message', messageId: '00000000-0000-4000-8000-000000000009' }
      })
    )
  })
})
