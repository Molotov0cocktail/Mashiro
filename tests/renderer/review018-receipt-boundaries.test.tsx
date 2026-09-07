// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ProviderPanel } from '../../src/renderer/src/features/provider/ProviderPanel'
import { providerApi007Defaults } from './provider-api-fixture'
import { memoryApi008Defaults } from './memory-api-fixture'
import type { AssistantSnapshot } from '../../src/shared/assistant-contract'
import type { ProviderApi } from '../../src/shared/provider-contract'
import type { MemoryApi, MemoryReceipt } from '../../src/shared/memory-contract'
import type { TimelineApi, TimelineMessage } from '../../src/shared/timeline-contract'
import type { RetentionChanged } from '../../src/shared/retention-contract'
import type { ToolOperation } from '../../src/shared/tool-contract'

afterEach(cleanup)
const id = (n: number) => '00000000-0000-4000-8000-' + n.toString().padStart(12, '0')
const assistantId = id(1),
  otherAssistant = id(2),
  requestId = id(3)
const time = '2026-09-07T00:00:00.000Z'
type ToolsResult = Awaited<ReturnType<ProviderApi['tools']>>
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
function assistants(currentAssistantId = assistantId, stateRevision = 1): AssistantSnapshot {
  return {
    assistants: [assistantId, otherAssistant].map((id) => ({
      id,
      displayName: id === assistantId ? '独立旧助手' : '独立另助手',
      persona: '',
      avatarKey: 'mashiro' as const,
      isArchived: false,
      createdAt: time,
      updatedAt: time,
      archivedAt: null,
      version: 1
    })),
    currentAssistantId,
    primaryAssistantId: assistantId,
    stateRevision
  }
}
const old: ToolOperation = {
  operationId: id(10),
  segmentId: id(11),
  modelRequestId: id(12),
  requestId,
  assistantId,
  toolName: 'request_memory_removal',
  state: 'SUCCEEDED',
  createdAt: time,
  updatedAt: time,
  summary: 'REVIEW018_ORIGINAL_OPERATION',
  citations: [],
  memoryReceipt: {
    operationId: id(13),
    objectId: id(14),
    objectVersion: 1,
    state: 'PENDING_CONFIRMATION',
    summary: 'REVIEW018_ORIGINAL_CONFIRMATION',
    confirmationId: id(15)
  }
}
function result(operations: ToolOperation[] = [old]): ToolsResult {
  return { ok: true, data: { assistantId, mode: 'normal', operations } }
}
function fixture() {
  const memoryApi = memoryApi008Defaults()
  const tools = vi.fn<ProviderApi['tools']>(async (input) =>
    input.requestId
      ? result()
      : { ok: true, data: { assistantId: input.assistantId, mode: input.mode, operations: [] } }
  )
  const startChat = vi.fn()
  const api = {
    ...providerApi007Defaults(),
    tools,
    list: vi.fn(async () => ({ ok: true, data: { connections: [], bindings: [] } })),
    saveConnection: vi.fn(),
    setCredential: vi.fn(),
    deleteCredential: vi.fn(),
    bindAssistant: vi.fn(),
    clearChat: vi.fn(),
    startChat,
    cancelChat: vi.fn(),
    onEvent: vi.fn(() => () => {})
  } as ProviderApi
  const messages: TimelineMessage[] = [
    {
      id: id(20),
      requestId,
      role: 'user',
      content: 'REVIEW018_OLD_ROUND',
      status: 'completed',
      createdAt: time,
      saved: true
    },
    {
      id: id(21),
      requestId,
      role: 'assistant',
      content: 'REVIEW018_OLD_REPLY',
      status: 'interrupted',
      createdAt: time,
      saved: true
    }
  ]
  const timelineApi = {
    read: vi.fn(async (input) => ({
      ok: true,
      data: { assistantId: input.assistantId, mode: input.mode, messages: [], hasMore: true }
    })),
    query: vi.fn(async (input) => ({
      ok: true,
      data: {
        assistantId: input.assistantId,
        messages: input.assistantId === assistantId ? messages : [],
        nextCursor: null
      }
    })),
    saveTemporary: vi.fn(),
    permissions: vi.fn(async (input) => ({
      ok: true,
      data: {
        assistantId: input.assistantId,
        connectionId: null,
        endpointFingerprint: null,
        endpointDisplay: null,
        readHistory: true,
        sendHistory: false,
        version: 1
      }
    })),
    setPermissions: vi.fn(async (input) => ({
      ok: true,
      data: {
        assistantId: input.assistantId,
        connectionId: null,
        endpointFingerprint: null,
        endpointDisplay: null,
        readHistory: input.readHistory,
        sendHistory: input.sendHistory,
        version: input.expectedVersion + 1
      }
    }))
  } as TimelineApi
  const changed = vi.fn()
  function element(snapshot = assistants(), epoch = 0, retentionChange?: RetentionChanged) {
    return (
      <ProviderPanel
        assistantSnapshot={snapshot}
        api={api}
        timelineApi={timelineApi}
        memoryApi={memoryApi}
        onMemoryChanged={changed}
        memoryEvidenceRefreshKey={epoch}
        retentionChange={retentionChange}
      />
    )
  }
  return { tools, api, timelineApi, memoryApi, startChat, changed, element }
}
async function open() {
  const round = (await screen.findByText('REVIEW018_OLD_ROUND')).closest('article')!
  fireEvent.click(within(round).getByRole('button', { name: '查看本轮业务与工具回执' }))
}
function receipt() {
  return screen.getByRole('region', { name: '所选轮次业务与工具回执' })
}

it('confirms the original pending memory identity once and never dispatches the model', async () => {
  const f = fixture()
  const confirmation = deferred<Awaited<ReturnType<MemoryApi['confirm']>>>()
  f.memoryApi.confirm = vi.fn(() => confirmation.promise)
  render(f.element())
  await open()
  await screen.findByText(old.memoryReceipt!.summary)
  expect(f.memoryApi.confirm).not.toHaveBeenCalled()
  const button = within(receipt()).getByRole('button', { name: '确认执行' })
  fireEvent.click(button)
  fireEvent.click(button)
  expect(f.memoryApi.confirm).toHaveBeenCalledTimes(1)
  expect(f.memoryApi.confirm).toHaveBeenCalledWith({
    protocolVersion: 1,
    assistantId,
    confirmationId: id(15),
    accept: true
  })
  const committed: MemoryReceipt = {
    ...old.memoryReceipt!,
    state: 'SUCCEEDED',
    confirmationId: null
  }
  f.tools.mockImplementation(async (input) =>
    input.requestId
      ? result([{ ...old, memoryReceipt: committed }])
      : { ok: true, data: { assistantId: input.assistantId, mode: input.mode, operations: [] } }
  )
  await act(async () => confirmation.resolve({ ok: true, data: committed }))
  expect(f.changed).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('button', { name: '确认执行' })).not.toBeInTheDocument()
  await open()
  await screen.findByText('可信业务操作已完成')
  expect(f.memoryApi.confirm).toHaveBeenCalledTimes(1)
  expect(f.startChat).not.toHaveBeenCalled()
  expect(f.memoryApi.mutate).not.toHaveBeenCalled()
})

it.each(['assistant', 'round'] as const)(
  'rejects a receipt whose %s identity differs from the selected old round',
  async (kind) => {
    const f = fixture()
    const wrong = {
      ...old,
      ...(kind === 'assistant' ? { assistantId: otherAssistant } : { requestId: id(999) })
    }
    f.tools.mockImplementation(async (input) =>
      input.requestId
        ? result([wrong])
        : { ok: true, data: { assistantId: input.assistantId, mode: input.mode, operations: [] } }
    )
    render(f.element())
    await open()
    await screen.findByText('回执与所选轮次归属不一致，已拒绝显示。')
    expect(screen.queryByText(old.summary)).not.toBeInTheDocument()
    expect(f.memoryApi.confirm).not.toHaveBeenCalled()
  }
)

it('normal to temporary to normal discards a late old receipt without auto-reading it again', async () => {
  const f = fixture()
  const pending = deferred<ToolsResult>()
  f.tools.mockImplementation(async (input) =>
    input.requestId
      ? pending.promise
      : { ok: true, data: { assistantId: input.assistantId, mode: input.mode, operations: [] } }
  )
  render(f.element())
  await open()
  await waitFor(() => expect(f.tools).toHaveBeenCalledWith(expect.objectContaining({ requestId })))
  fireEvent.click(screen.getByLabelText('严格临时（不自动保存）'))
  fireEvent.click(screen.getByLabelText('正常模式（自动保存）'))
  await act(async () => pending.resolve(result()))
  expect(screen.queryByText(old.summary)).not.toBeInTheDocument()
  expect(f.tools.mock.calls.filter(([input]) => input.requestId === requestId)).toHaveLength(1)
})

it('assistant A to B to A discards a late response and does not resurrect the old expansion', async () => {
  const f = fixture()
  const pending = deferred<ToolsResult>()
  f.tools.mockImplementation(async (input) =>
    input.requestId
      ? pending.promise
      : { ok: true, data: { assistantId: input.assistantId, mode: input.mode, operations: [] } }
  )
  const view = render(f.element())
  await open()
  view.rerender(f.element(assistants(otherAssistant, 2)))
  view.rerender(f.element(assistants(assistantId, 3)))
  await act(async () => pending.resolve(result()))
  expect(screen.queryByText(old.summary)).not.toBeInTheDocument()
  expect(f.tools.mock.calls.filter(([input]) => input.requestId === requestId)).toHaveLength(1)
})

it('permission epoch retires an already visible confirmation before any new read returns', async () => {
  const f = fixture()
  const view = render(f.element())
  await open()
  await screen.findByText(old.summary)
  const reads = f.tools.mock.calls.length
  view.rerender(f.element(assistants(), 1))
  expect(screen.queryByText(old.summary)).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '确认执行' })).not.toBeInTheDocument()
  expect(f.tools.mock.calls.length).toBe(reads)
})

it('retention cleanup removes the old round and rejects its late receipt response', async () => {
  const f = fixture()
  const pending = deferred<ToolsResult>()
  f.tools.mockImplementation(async (input) =>
    input.requestId
      ? pending.promise
      : { ok: true, data: { assistantId: input.assistantId, mode: input.mode, operations: [] } }
  )
  const view = render(f.element())
  await open()
  f.timelineApi.query = vi.fn<TimelineApi['query']>(async (input) => ({
    ok: true,
    data: { assistantId: input.assistantId, messages: [], nextCursor: null }
  }))
  view.rerender(
    f.element(assistants(), 0, {
      epoch: 1,
      assistantIds: [assistantId],
      memoryIds: [],
      requestIds: [requestId],
      reason: 'cleanup'
    })
  )
  await act(async () => pending.resolve(result()))
  expect(screen.queryByText(old.summary)).not.toBeInTheDocument()
  expect(screen.queryByText('REVIEW018_OLD_ROUND')).not.toBeInTheDocument()
  expect(f.memoryApi.confirm).not.toHaveBeenCalled()
})

it('a late confirmation after permission invalidation cannot notify or repaint an old success', async () => {
  const f = fixture()
  const pending = deferred<Awaited<ReturnType<MemoryApi['confirm']>>>()
  f.memoryApi.confirm = vi.fn(() => pending.promise)
  const view = render(f.element())
  await open()
  fireEvent.click(await screen.findByRole('button', { name: '确认执行' }))
  view.rerender(f.element(assistants(), 1))
  await act(async () =>
    pending.resolve({
      ok: true,
      data: { ...old.memoryReceipt!, state: 'SUCCEEDED', confirmationId: null }
    })
  )
  expect(screen.queryByText('可信业务操作已完成')).not.toBeInTheDocument()
  expect(f.changed).not.toHaveBeenCalled()
  expect(f.memoryApi.confirm).toHaveBeenCalledTimes(1)
})

it('real history permission revocation clears old citations and ignores a previously pending receipt', async () => {
  const f = fixture()
  const pending = deferred<ToolsResult>()
  const withCitation: ToolOperation = {
    ...old,
    citations: [
      { requestId: id(90), createdAt: time, excerpt: 'REVIEW018_REVOKED_SOURCE', truncated: false }
    ]
  }
  let scopedReads = 0
  f.tools.mockImplementation(async (input) => {
    if (!input.requestId)
      return {
        ok: true,
        data: { assistantId: input.assistantId, mode: input.mode, operations: [] }
      }
    scopedReads += 1
    return scopedReads === 1 ? result([withCitation]) : pending.promise
  })
  render(f.element())
  await open()
  await screen.findByText('REVIEW018_REVOKED_SOURCE')
  fireEvent.click(screen.getByRole('button', { name: '收起本轮业务与工具回执' }))
  await open()
  const permission = screen.getByLabelText('允许助手读取自己的正常历史')
  await waitFor(() => expect(permission).not.toBeDisabled())
  fireEvent.click(permission)
  await waitFor(() =>
    expect(f.timelineApi.setPermissions).toHaveBeenCalledWith(
      expect.objectContaining({ readHistory: false })
    )
  )
  await act(async () => pending.resolve(result([withCitation])))
  expect(screen.queryByText('REVIEW018_REVOKED_SOURCE')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '确认执行' })).not.toBeInTheDocument()
  expect(f.startChat).not.toHaveBeenCalled()
})

it('unknown local inspection uses the same round query and does not reissue a business command', async () => {
  const f = fixture()
  const unknown: ToolOperation = { ...old, toolName: 'write_memory', state: 'RESULT_UNKNOWN' }
  delete unknown.memoryReceipt
  f.tools.mockImplementation(async (input) =>
    input.requestId
      ? result([unknown])
      : { ok: true, data: { assistantId: input.assistantId, mode: input.mode, operations: [] } }
  )
  render(f.element())
  await open()
  fireEvent.click(await screen.findByRole('button', { name: '核查本地状态' }))
  await waitFor(() =>
    expect(f.tools.mock.calls.filter(([input]) => input.requestId)).toHaveLength(2)
  )
  for (const [input] of f.tools.mock.calls.filter(([input]) => input.requestId)) {
    expect(input).toEqual({ protocolVersion: 1, assistantId, mode: 'normal', requestId })
  }
  expect(f.memoryApi.mutate).not.toHaveBeenCalled()
  expect(f.memoryApi.confirm).not.toHaveBeenCalled()
  expect(f.startChat).not.toHaveBeenCalled()
})
