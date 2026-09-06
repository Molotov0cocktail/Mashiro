// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HistoryContextPanel } from '../../src/renderer/src/features/provider/HistoryContextPanel'
import { ProviderPanel } from '../../src/renderer/src/features/provider/ProviderPanel'
import { providerApi007Defaults } from './provider-api-fixture'
import type { AssistantSnapshot } from '../../src/shared/assistant-contract'
import type {
  ProviderApi,
  ProviderSnapshot,
  StartChatInput
} from '../../src/shared/provider-contract'
import type {
  HistoryPermissions,
  TimelineApi,
  TimelineMessage
} from '../../src/shared/timeline-contract'

afterEach(cleanup)
const assistantA = '00000000-0000-4000-8000-000000000001'
const assistantB = '00000000-0000-4000-8000-000000000002'
const connectionId = '00000000-0000-4000-8000-000000000003'
const requestOld = '00000000-0000-4000-8000-000000000101'
const requestOlder = '00000000-0000-4000-8000-000000000102'

function assistants(currentAssistantId = assistantA): AssistantSnapshot {
  return {
    assistants: [assistantA, assistantB].map((id, index) => ({
      id,
      displayName: index ? 'Beta' : 'Alpha',
      isArchived: false,
      createdAt: '2026-09-06T00:00:0' + index + '.000Z',
      updatedAt: '2026-09-06T00:00:0' + index + '.000Z',
      archivedAt: null,
      version: 1
    })),
    currentAssistantId,
    primaryAssistantId: assistantA,
    stateRevision: currentAssistantId === assistantA ? 1 : 2
  }
}
const providerSnapshot: ProviderSnapshot = {
  connections: [
    {
      id: connectionId,
      displayName: 'Synthetic receiver',
      baseUrl: 'https://example.com/v1',
      enabled: true,
      hasCredential: true,
      credentialPersistence: 'temporary',
      createdAt: '2026-09-06T00:00:00.000Z',
      updatedAt: '2026-09-06T00:00:00.000Z',
      version: 1
    }
  ],
  bindings: [
    {
      assistantId: assistantA,
      connectionId,
      model: 'model-a',
      updatedAt: '2026-09-06T00:00:00.000Z',
      version: 1
    }
  ]
}
function pair(requestId: string, userText: string): TimelineMessage[] {
  return [
    {
      id: requestId.slice(0, -1) + '3',
      requestId,
      role: 'user',
      content: userText,
      status: 'completed',
      createdAt: '2026-09-01T00:00:00.000Z',
      saved: true
    },
    {
      id: requestId.slice(0, -1) + '4',
      requestId,
      role: 'assistant',
      content: '回答：' + userText,
      status: 'completed',
      createdAt: '2026-09-01T00:00:01.000Z',
      saved: true
    }
  ]
}
function permission(values: Partial<HistoryPermissions> = {}): HistoryPermissions {
  return {
    assistantId: assistantA,
    connectionId,
    endpointFingerprint: 'sha256:synthetic',
    endpointDisplay: 'https://example.com/v1',
    readHistory: true,
    sendHistory: false,
    version: 0,
    ...values
  }
}
function provider(startChat = vi.fn()): ProviderApi {
  return {
    ...providerApi007Defaults(),
    list: vi.fn().mockResolvedValue({ ok: true, data: providerSnapshot }),
    saveConnection: vi.fn(),
    setCredential: vi.fn(),
    deleteCredential: vi.fn(),
    bindAssistant: vi.fn(),
    clearChat: vi.fn(),
    startChat,
    cancelChat: vi.fn(),
    onEvent: vi.fn(() => () => undefined)
  } as ProviderApi
}
function timeline(overrides: Partial<TimelineApi> = {}): TimelineApi {
  return {
    read: vi.fn(async (input) => ({
      ok: true as const,
      data: { assistantId: input.assistantId, mode: input.mode, messages: [], hasMore: false }
    })),
    saveTemporary: vi.fn(),
    query: vi.fn(async (input) => ({
      ok: true as const,
      data: {
        assistantId: input.assistantId,
        messages: pair(requestOld, '较早问题'),
        nextCursor: null
      }
    })),
    permissions: vi.fn(async () => ({ ok: true as const, data: permission() })),
    setPermissions: vi.fn(async (input) => ({
      ok: true as const,
      data: permission({
        readHistory: input.readHistory,
        sendHistory: input.sendHistory,
        version: input.expectedVersion + 1
      })
    })),
    ...overrides
  } as TimelineApi
}

describe('ProviderPanel history, context and permissions', () => {
  it('browses literal paged history separately, persists permissions with CAS, and sends selected IDs', async () => {
    const query = vi.fn(async (input: Parameters<TimelineApi['query']>[0]) => {
      const messages =
        input.query === '100%_中文'
          ? pair(requestOlder, '命中 100%_中文')
          : input.before === 40
            ? pair(requestOlder, '更早问题')
            : pair(requestOld, '较早问题')
      return {
        ok: true as const,
        data: {
          assistantId: input.assistantId,
          messages,
          nextCursor: input.query || input.before ? null : 40
        }
      }
    })
    const setPermissions = vi.fn(async (input: Parameters<TimelineApi['setPermissions']>[0]) => ({
      ok: true as const,
      data: permission({
        readHistory: input.readHistory,
        sendHistory: input.sendHistory,
        version: input.expectedVersion + 1
      })
    }))
    const startChat = vi.fn(async (input: StartChatInput) => ({
      ok: true as const,
      data: {
        requestId: input.requestId,
        assistantId: input.assistantId,
        status: 'completed' as const,
        text: '完成',
        usage: null
      }
    }))
    render(
      <ProviderPanel
        assistantSnapshot={assistants()}
        api={provider(startChat)}
        timelineApi={timeline({ query, setPermissions })}
      />
    )

    expect(await screen.findByText('较早问题')).toBeInTheDocument()
    expect(screen.getByLabelText('浏览正常历史')).toBeInTheDocument()
    expect(screen.getByLabelText('消息时间线')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '加载更早' }))
    expect(await screen.findByText('更早问题')).toBeInTheDocument()
    expect(query).toHaveBeenCalledWith({
      protocolVersion: 1,
      assistantId: assistantA,
      query: '',
      before: 40
    })

    fireEvent.change(screen.getByLabelText('搜索本助手历史'), { target: { value: '100%_中文' } })
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    expect(await screen.findByText('命中 100%_中文')).toBeInTheDocument()
    expect(query).toHaveBeenCalledWith({
      protocolVersion: 1,
      assistantId: assistantA,
      query: '100%_中文'
    })
    fireEvent.click(screen.getByRole('button', { name: '清除搜索' }))
    await waitFor(() =>
      expect(query).toHaveBeenLastCalledWith({
        protocolVersion: 1,
        assistantId: assistantA,
        query: ''
      })
    )

    expect(screen.getByText('历史实际接收地址：https://example.com/v1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: '允许向当前实际接收方发送历史' }))
    await waitFor(() =>
      expect(setPermissions).toHaveBeenCalledWith({
        protocolVersion: 1,
        assistantId: assistantA,
        connectionId,
        endpointFingerprint: 'sha256:synthetic',
        expectedVersion: 0,
        readHistory: true,
        sendHistory: true
      })
    )

    fireEvent.click(screen.getByRole('checkbox', { name: '选择此轮：较早问题' }))
    fireEvent.click(screen.getByRole('radio', { name: '已选轮次（最多 16 轮）' }))
    fireEvent.change(screen.getByLabelText('正常消息'), { target: { value: '继续' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(startChat).toHaveBeenCalledTimes(1))
    expect(startChat.mock.calls[0]![0]).toMatchObject({
      mode: 'normal',
      context: { kind: 'selected', requestIds: [requestOld] }
    })
  })

  it('isolates intent by assistant and never queries or forwards normal history in strict temporary mode', async () => {
    const query = vi.fn(async (input: Parameters<TimelineApi['query']>[0]) => ({
      ok: true as const,
      data: {
        assistantId: input.assistantId,
        messages: pair(requestOld, '较早问题'),
        nextCursor: null
      }
    }))
    const startChat = vi.fn(async (input: StartChatInput) => ({
      ok: true as const,
      data: {
        requestId: input.requestId,
        assistantId: input.assistantId,
        status: 'completed' as const,
        text: '临时完成',
        usage: null
      }
    }))
    const api = provider(startChat)
    const timelineApi = timeline({ query })
    const view = render(
      <ProviderPanel assistantSnapshot={assistants()} api={api} timelineApi={timelineApi} />
    )
    expect(await screen.findByText('较早问题')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: '仅本次输入' }))
    const queryCount = query.mock.calls.length
    fireEvent.click(screen.getByRole('radio', { name: '严格临时（不自动保存）' }))
    expect(screen.queryByLabelText('浏览正常历史')).not.toBeInTheDocument()
    expect(query).toHaveBeenCalledTimes(queryCount)

    fireEvent.change(screen.getByLabelText('临时消息'), { target: { value: '临时问题' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(startChat).toHaveBeenCalledTimes(1))
    expect(startChat.mock.calls[0]![0]).toMatchObject({
      mode: 'temporary',
      context: { kind: 'none' }
    })

    view.rerender(
      <ProviderPanel
        assistantSnapshot={assistants(assistantB)}
        api={api}
        timelineApi={timelineApi}
      />
    )
    fireEvent.click(screen.getByRole('radio', { name: '正常模式（自动保存）' }))
    expect(screen.getByRole('radio', { name: '近期合格历史（最多 16 轮）' })).toBeChecked()
    view.rerender(
      <ProviderPanel
        assistantSnapshot={assistants(assistantA)}
        api={api}
        timelineApi={timelineApi}
      />
    )
    fireEvent.click(screen.getByRole('radio', { name: '正常模式（自动保存）' }))
    expect(screen.getByRole('radio', { name: '仅本次输入' })).toBeChecked()
  })

  it('keeps a selected-context permission rejection as an unsent draft without silent fallback', async () => {
    const startChat = vi.fn(async (_input: StartChatInput) => ({
      ok: false as const,
      error: {
        code: 'PERMISSION_DENIED' as const,
        message: 'Permission denied for ' + _input.assistantId,
        correlationId: '00000000-0000-4000-8000-000000000999',
        retryable: false
      }
    }))
    render(
      <ProviderPanel
        assistantSnapshot={assistants()}
        api={provider(startChat)}
        timelineApi={timeline()}
      />
    )

    expect(await screen.findByText('较早问题')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: '选择此轮：较早问题' }))
    fireEvent.click(screen.getByRole('radio', { name: '已选轮次（最多 16 轮）' }))
    fireEvent.change(screen.getByLabelText('正常消息'), { target: { value: '需要权限' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    expect(await screen.findByText('未发送草稿')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('当前没有读取并向实际接收方发送历史的权限')
    expect(startChat).toHaveBeenCalledTimes(1)
    expect(startChat.mock.calls[0]![0]).toMatchObject({
      context: { kind: 'selected', requestIds: [requestOld] }
    })
  })

  it('shows failed or single-sided stored history with its real status but does not make it selectable', async () => {
    const query = vi.fn(async () => ({
      ok: true as const,
      data: {
        assistantId: assistantA,
        messages: [
          {
            id: '00000000-0000-4000-8000-000000000401',
            requestId: '00000000-0000-4000-8000-000000000402',
            role: 'assistant' as const,
            content: '失败正文仍可浏览',
            status: 'failed' as const,
            createdAt: '2026-09-05T08:00:00.000Z',
            saved: true
          }
        ],
        nextCursor: null
      }
    }))
    render(
      <ProviderPanel
        assistantSnapshot={assistants()}
        api={provider()}
        timelineApi={timeline({ query })}
      />
    )

    expect(await screen.findByText('失败正文仍可浏览')).toBeInTheDocument()
    expect(screen.getByText(/助手：失败/)).toBeInTheDocument()
    expect(screen.getByText('此条记录尚未形成可选的完整完成轮次。')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /选择此轮/ })).not.toBeInTheDocument()
  })

  it('preserves leading and trailing whitespace in literal history searches', async () => {
    const query = vi.fn<TimelineApi['query']>().mockResolvedValue({
      ok: true,
      data: { assistantId: assistantA, messages: pair(requestOld, '旧结果'), nextCursor: null }
    })
    render(
      <HistoryContextPanel
        assistantId={assistantA}
        mode="normal"
        bindingKey="none"
        timelineApi={timeline({ query })}
        contextIntent={{ kind: 'recent' }}
        selectedRequestIds={[]}
        onContextIntentChange={() => undefined}
        onSelectedRequestIdsChange={() => undefined}
      />
    )
    await screen.findByText('旧结果')
    fireEvent.change(screen.getByLabelText('搜索本助手历史'), {
      target: { value: ' 空 格 ' }
    })
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    await waitFor(() => expect(query).toHaveBeenCalledTimes(2))
    expect(query.mock.calls[1]![0].query).toBe(' 空 格 ')
  })

  it('keeps the last successful query, messages and cursor together across search, page and clear failures', async () => {
    const query = vi.fn<TimelineApi['query']>().mockResolvedValue({
      ok: true,
      data: { assistantId: assistantA, messages: pair(requestOld, '旧结果'), nextCursor: 50 }
    })
    render(
      <HistoryContextPanel
        assistantId={assistantA}
        mode="normal"
        bindingKey="none"
        timelineApi={timeline({ query })}
        contextIntent={{ kind: 'recent' }}
        selectedRequestIds={[]}
        onContextIntentChange={() => undefined}
        onSelectedRequestIdsChange={() => undefined}
      />
    )
    await screen.findByText('旧结果')

    query.mockResolvedValueOnce({
      ok: false,
      error: {
        code: 'STORAGE_UNAVAILABLE',
        message: 'search failed',
        correlationId: '00000000-0000-4000-8000-000000000501',
        retryable: true
      }
    })
    fireEvent.change(screen.getByLabelText('搜索本助手历史'), {
      target: { value: 'NEW_QUERY' }
    })
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    await screen.findByRole('alert')

    query.mockRejectedValueOnce(new Error('page failed'))
    fireEvent.click(screen.getByRole('button', { name: '加载更早' }))
    await waitFor(() => expect(query).toHaveBeenCalledTimes(3))
    expect(query.mock.calls[2]![0]).toMatchObject({ query: '', before: 50 })
    expect(screen.getByText('旧结果')).toBeInTheDocument()

    query.mockResolvedValueOnce({
      ok: false,
      error: {
        code: 'STORAGE_UNAVAILABLE',
        message: 'clear failed',
        correlationId: '00000000-0000-4000-8000-000000000502',
        retryable: true
      }
    })
    fireEvent.click(screen.getByRole('button', { name: '清除搜索' }))
    await waitFor(() => expect(query).toHaveBeenCalledTimes(4))
    expect(query.mock.calls[3]![0]).toMatchObject({ query: '' })

    fireEvent.click(screen.getByRole('button', { name: '加载更早' }))
    await waitFor(() => expect(query).toHaveBeenCalledTimes(5))
    expect(query.mock.calls[4]![0]).toMatchObject({ query: '', before: 50 })
    expect(screen.getByText('旧结果')).toBeInTheDocument()
  })
})
