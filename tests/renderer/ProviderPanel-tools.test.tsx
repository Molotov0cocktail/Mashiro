// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProviderPanel } from '../../src/renderer/src/features/provider/ProviderPanel'
import { timelineApi006Defaults } from './timeline-api-fixture'
import { memoryApi008Defaults, memoryPermission } from './memory-api-fixture'
import { itemApi010Defaults, itemId, itemReceipt } from './item-api-fixture'
import type { AssistantSnapshot } from '../../src/shared/assistant-contract'
import type { MemoryApi } from '../../src/shared/memory-contract'
import type {
  CapabilityResult,
  ProviderApi,
  ProviderEvent,
  ProviderSnapshot,
  StartChatInput,
  ToolReadResult
} from '../../src/shared/provider-contract'
import type { ProviderCapabilities, ToolOperation } from '../../src/shared/tool-contract'
import type { TimelineApi, TimelineMessage } from '../../src/shared/timeline-contract'

afterEach(cleanup)

const assistantA = '00000000-0000-4000-8000-000000000001'
const assistantB = '00000000-0000-4000-8000-000000000002'
const connectionId = '00000000-0000-4000-8000-000000000003'
const citedRequestId = '00000000-0000-4000-8000-000000000101'

function assistants(currentAssistantId = assistantA): AssistantSnapshot {
  return {
    assistants: [assistantA, assistantB].map((id, index) => ({
      id,
      displayName: index === 0 ? 'Alpha' : 'Beta',
      persona: '',
      avatarKey: 'mashiro',
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
      displayName: 'GLM receiver',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      enabled: true,
      hasCredential: true,
      credentialPersistence: 'temporary',
      createdAt: '2026-09-06T00:00:00.000Z',
      updatedAt: '2026-09-06T00:00:00.000Z',
      version: 1
    }
  ],
  bindings: [assistantA, assistantB].map((assistantId) => ({
    assistantId,
    connectionId,
    model: 'GLM-5.3-FLASH',
    updatedAt: '2026-09-06T00:00:00.000Z',
    version: 1
  }))
}

const capabilityNames = [
  'text',
  'stream',
  'tools',
  'preserved-thinking',
  'json-object',
  'local-strict',
  'vendor-strict',
  'parallel',
  'usage'
] as const

function capabilities(values: Partial<ProviderCapabilities> = {}): ProviderCapabilities {
  return {
    assistantId: assistantA,
    endpointFingerprint: 'sha256:glm-synthetic',
    endpointDisplay: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'GLM-5.3-FLASH',
    protocol: 'chat-completions-v1',
    adapterVersion: 'glm-tools-v1',
    mode: 'standard-non-preserved',
    toolsAvailable: true,
    reason: '当前端点已启用受限工具',
    evidence: capabilityNames.map((capability) => ({
      capability,
      level:
        capability === 'tools'
          ? ('LIVE_VERIFIED' as const)
          : capability === 'preserved-thinking' || capability === 'vendor-strict'
            ? ('UNVERIFIED' as const)
            : ('LOCAL_TESTED' as const),
      observedAt:
        capability === 'preserved-thinking' || capability === 'vendor-strict'
          ? null
          : '2026-09-06T08:00:00.000Z',
      detail:
        capability === 'preserved-thinking'
          ? '工具保留式思考尚未观察'
          : capability === 'vendor-strict'
            ? '仅验证应用本地严格校验'
            : capability + ' synthetic evidence'
    })),
    ...values
  }
}

function operation(values: Partial<ToolOperation> = {}): ToolOperation {
  return {
    operationId: '00000000-0000-4000-8000-000000000201',
    segmentId: '00000000-0000-4000-8000-000000000202',
    modelRequestId: '00000000-0000-4000-8000-000000000203',
    requestId: '00000000-0000-4000-8000-000000000204',
    assistantId: assistantA,
    toolName: 'search_conversation_history',
    state: 'SUCCEEDED',
    createdAt: '2026-09-06T08:00:00.000Z',
    updatedAt: '2026-09-06T08:00:01.000Z',
    summary: '找到 1 个相关轮次',
    citations: [
      {
        requestId: citedRequestId,
        createdAt: '2026-09-01T10:00:00.000Z',
        excerpt: '我们之前讨论过紫色主题',
        truncated: false
      }
    ],
    ...values
  }
}

function toolResult(
  assistantId: string,
  mode: 'normal' | 'temporary',
  operations: ToolOperation[] = []
): ToolReadResult {
  return { ok: true, data: { assistantId, mode, operations } }
}

function capabilityResult(
  assistantId: string,
  values: Partial<ProviderCapabilities> = {}
): CapabilityResult {
  return { ok: true, data: capabilities({ assistantId, ...values }) }
}

function provider(overrides: Partial<ProviderApi> = {}): ProviderApi {
  return {
    tools: vi.fn(async (input) => toolResult(input.assistantId, input.mode)),
    capabilities: vi.fn(async (input) => capabilityResult(input.assistantId)),
    list: vi.fn().mockResolvedValue({ ok: true, data: providerSnapshot }),
    saveConnection: vi.fn(),
    setCredential: vi.fn(),
    deleteCredential: vi.fn(),
    bindAssistant: vi.fn(),
    clearChat: vi.fn(),
    startChat: vi.fn(),
    cancelChat: vi.fn(),
    onEvent: vi.fn(() => () => undefined),
    ...overrides
  }
}

function pair(requestId: string): TimelineMessage[] {
  return [
    {
      id: '00000000-0000-4000-8000-000000000301',
      requestId,
      role: 'user',
      content: '我们之前聊了什么主题？',
      status: 'completed',
      createdAt: '2026-09-01T10:00:00.000Z',
      saved: true
    },
    {
      id: '00000000-0000-4000-8000-000000000302',
      requestId,
      role: 'assistant',
      content: '讨论过紫色主题。',
      status: 'completed',
      createdAt: '2026-09-01T10:00:01.000Z',
      saved: true
    }
  ]
}

function timeline(overrides: Partial<TimelineApi> = {}): TimelineApi {
  return {
    ...timelineApi006Defaults(),
    read: vi.fn(async (input) => ({
      ok: true as const,
      data: { assistantId: input.assistantId, mode: input.mode, messages: [], hasMore: false }
    })),
    saveTemporary: vi.fn(),
    ...overrides
  } as TimelineApi
}

describe('ProviderPanel trusted tools and capability UI', () => {
  it('defaults tools off, shows all nine observed capability levels, and sends an explicit clock scope', async () => {
    const startChat = vi.fn(async (input: StartChatInput) => ({
      ok: true as const,
      data: {
        requestId: input.requestId,
        assistantId: input.assistantId,
        status: 'completed' as const,
        text: '现在是 16:00。',
        usage: null
      }
    }))
    render(
      <ProviderPanel
        assistantSnapshot={assistants()}
        api={provider({ startChat })}
        timelineApi={timeline()}
      />
    )

    expect(await screen.findByText('当前端点已启用受限工具')).toBeInTheDocument()
    expect(screen.getByText('实际端点：https://open.bigmodel.cn/api/paas/v4')).toBeInTheDocument()
    expect(screen.getByText(/协议：chat-completions-v1/)).toHaveTextContent(
      '模式：standard-non-preserved'
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(9)
    expect(screen.getByText('保留式思考').closest('li')).toHaveTextContent('UNVERIFIED')
    expect(screen.getByText('厂商 strict').closest('li')).toHaveTextContent('UNVERIFIED')
    expect(screen.getByText('本地严格校验').closest('li')).toHaveTextContent('LOCAL_TESTED')
    expect(screen.getByRole('radio', { name: '关闭工具（默认）' })).toBeChecked()

    fireEvent.click(screen.getByRole('radio', { name: '仅本机时钟' }))
    fireEvent.change(screen.getByLabelText('正常消息'), { target: { value: '现在几点？' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(startChat).toHaveBeenCalledTimes(1))
    expect(startChat.mock.calls[0]![0]).toMatchObject({ tools: 'clock' })
  })

  it('requires an explicit full-history scope, intersects it with context, and keeps strict temporary clock-only', async () => {
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
        api={provider({ startChat })}
        timelineApi={timeline()}
      />
    )
    await screen.findByText('当前端点已启用受限工具')

    fireEvent.click(screen.getByRole('radio', { name: '本机时钟 + 按关键词检索本助手完整历史' }))
    expect(screen.getByText(/近期上下文仍只控制随请求直接发送的近期轮次/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: '仅本次输入' }))
    expect(
      screen.getByRole('radio', { name: '本机时钟 + 按关键词检索本助手完整历史' })
    ).toBeDisabled()
    expect(screen.getByRole('radio', { name: '仅本机时钟' })).toBeChecked()

    fireEvent.click(screen.getByRole('radio', { name: '严格临时（不自动保存）' }))
    expect(
      screen.queryByRole('radio', { name: '本机时钟 + 按关键词检索本助手完整历史' })
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(/临时工具不会读取正常历史，也不会形成可重启的协议或操作记录/)
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: '仅本机时钟' }))
    fireEvent.change(screen.getByLabelText('临时消息'), { target: { value: '几点？' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(startChat).toHaveBeenCalledTimes(1))
    expect(startChat.mock.calls[0]![0]).toMatchObject({
      mode: 'temporary',
      context: { kind: 'none' },
      tools: 'clock'
    })
  })

  it('keeps trusted operation receipts independent from the final answer and directly locates a cited round', async () => {
    let listener: ((event: ProviderEvent) => void) | undefined
    let resolveChat: ((value: Awaited<ReturnType<ProviderApi['startChat']>>) => void) | undefined
    const startChat = vi.fn((input: StartChatInput) => {
      void input
      return new Promise<Awaited<ReturnType<ProviderApi['startChat']>>>(
        (resolve) => (resolveChat = resolve)
      )
    })
    const query = vi.fn(async (input: Parameters<TimelineApi['query']>[0]) => ({
      ok: true as const,
      data: { assistantId: input.assistantId, messages: pair(citedRequestId), nextCursor: null }
    }))
    const api = provider({
      startChat,
      onEvent: vi.fn((value) => {
        listener = value
        return () => undefined
      })
    })
    render(
      <ProviderPanel assistantSnapshot={assistants()} api={api} timelineApi={timeline({ query })} />
    )
    await screen.findByText('当前端点已启用受限工具')
    fireEvent.click(screen.getByRole('radio', { name: '仅本机时钟' }))
    fireEvent.change(screen.getByLabelText('正常消息'), { target: { value: '查找之前讨论' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    const requestId = startChat.mock.calls[0]![0].requestId
    const receipt = operation({ requestId })
    act(() =>
      listener?.({ type: 'operation', requestId, assistantId: assistantA, operation: receipt })
    )
    act(() => listener?.({ type: 'interrupted', requestId, assistantId: assistantA }))

    const operationCard = await screen.findByRole('article', { name: '历史检索操作' })
    expect(within(operationCard).getByText('已完成')).toBeInTheDocument()
    expect(within(operationCard).getByText('找到 1 个相关轮次')).toBeInTheDocument()
    expect(within(operationCard).getByText('我们之前讨论过紫色主题')).toBeInTheDocument()
    expect(screen.getByText(/响应中断/)).toBeInTheDocument()

    fireEvent.click(within(operationCard).getByRole('button', { name: '定位原轮次' }))
    await waitFor(() =>
      expect(query).toHaveBeenCalledWith({
        protocolVersion: 1,
        assistantId: assistantA,
        requestId: citedRequestId
      })
    )
    expect(await screen.findByText('我们之前聊了什么主题？')).toBeInTheDocument()
    expect(screen.getByText('已定位引用原轮次')).toBeInTheDocument()

    await act(async () =>
      resolveChat?.({
        ok: true,
        data: {
          requestId,
          assistantId: assistantA,
          status: 'interrupted',
          text: '',
          usage: null
        }
      })
    )
    expect(within(operationCard).getByText('已完成')).toBeInTheDocument()
  })

  it('keeps a late operation and tool scope with the captured assistant and mode', async () => {
    let listener: ((event: ProviderEvent) => void) | undefined
    let persisted: ToolOperation[] = []
    const tools = vi.fn(async (input: Parameters<ProviderApi['tools']>[0]) =>
      toolResult(
        input.assistantId,
        input.mode,
        input.assistantId === assistantA && input.mode === 'normal' ? persisted : []
      )
    )
    const startChat = vi.fn(async (input: StartChatInput) => ({
      ok: true as const,
      data: {
        requestId: input.requestId,
        assistantId: input.assistantId,
        status: 'completed' as const,
        text: '已回答',
        usage: null
      }
    }))
    const api = provider({
      tools,
      startChat,
      onEvent: vi.fn((value) => {
        listener = value
        return () => undefined
      })
    })
    const view = render(
      <ProviderPanel assistantSnapshot={assistants()} api={api} timelineApi={timeline()} />
    )
    await screen.findByText('当前端点已启用受限工具')
    fireEvent.click(screen.getByRole('radio', { name: '仅本机时钟' }))
    fireEvent.change(screen.getByLabelText('正常消息'), { target: { value: '现在几点' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(startChat).toHaveBeenCalledTimes(1))
    const requestId = startChat.mock.calls[0]![0].requestId
    const lateOperation = operation({
      requestId,
      toolName: 'get_current_time',
      summary: 'Alpha 正常模式时钟完成',
      citations: []
    })
    persisted = [lateOperation]

    view.rerender(
      <ProviderPanel
        assistantSnapshot={assistants(assistantB)}
        api={api}
        timelineApi={timeline()}
      />
    )
    await waitFor(() => expect(screen.getByLabelText('当前助手')).toHaveValue(assistantB))
    act(() =>
      listener?.({
        type: 'operation',
        requestId,
        assistantId: assistantA,
        operation: lateOperation
      })
    )
    expect(screen.queryByText('Alpha 正常模式时钟完成')).not.toBeInTheDocument()

    view.rerender(
      <ProviderPanel assistantSnapshot={assistants()} api={api} timelineApi={timeline()} />
    )
    expect(await screen.findByText('Alpha 正常模式时钟完成')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '仅本机时钟' })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: '严格临时（不自动保存）' }))
    expect(screen.queryByText('Alpha 正常模式时钟完成')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: '正常模式（自动保存）' }))
    expect(await screen.findByText('Alpha 正常模式时钟完成')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '仅本机时钟' })).toBeChecked()
  })

  it('restores local unknown operations without sending and refreshes only that request for verification', async () => {
    const unknown = operation({
      toolName: 'get_current_time',
      state: 'RESULT_UNKNOWN',
      summary: '应用退出前未能确认结果',
      citations: []
    })
    const succeeded = operation({
      toolName: 'get_current_time',
      state: 'SUCCEEDED',
      summary: '本机时钟读取完成',
      citations: []
    })
    const tools = vi.fn(async (input: Parameters<ProviderApi['tools']>[0]) =>
      toolResult(input.assistantId, input.mode, [input.requestId ? succeeded : unknown])
    )
    const startChat = vi.fn()
    render(
      <ProviderPanel
        assistantSnapshot={assistants()}
        api={provider({ tools, startChat })}
        timelineApi={timeline()}
      />
    )

    const card = await screen.findByRole('article', { name: '时钟读取操作' })
    expect(within(card).getByText('结果待核查')).toBeInTheDocument()
    expect(startChat).not.toHaveBeenCalled()
    const readsBeforeVerification = tools.mock.calls.length
    fireEvent.click(within(card).getByRole('button', { name: '核查本地状态' }))
    await waitFor(() =>
      expect(
        tools.mock.calls
          .slice(readsBeforeVerification)
          .map(([input]) => input)
          .filter((input) => input.requestId !== undefined)
      ).toEqual([
        {
          protocolVersion: 1,
          assistantId: assistantA,
          mode: 'normal',
          requestId: unknown.requestId
        }
      ])
    )
    expect(await within(card).findByText('已完成')).toBeInTheDocument()
    expect(startChat).not.toHaveBeenCalled()
  })

  it('opens a normal keyword search hit by exact requestId without mixing query or cursor', async () => {
    const query = vi.fn(async (input: Parameters<TimelineApi['query']>[0]) => ({
      ok: true as const,
      data: {
        assistantId: input.assistantId,
        messages: pair(citedRequestId),
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
    await screen.findByText('我们之前聊了什么主题？')
    fireEvent.change(screen.getByLabelText('搜索本助手历史'), {
      target: { value: '紫色主题' }
    })
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    await waitFor(() =>
      expect(query).toHaveBeenCalledWith({
        protocolVersion: 1,
        assistantId: assistantA,
        query: '紫色主题'
      })
    )
    fireEvent.click(screen.getByRole('button', { name: '定位此搜索结果的完整原轮次' }))
    await waitFor(() =>
      expect(query).toHaveBeenLastCalledWith({
        protocolVersion: 1,
        assistantId: assistantA,
        requestId: citedRequestId
      })
    )
    expect(screen.getByText('已定位引用原轮次')).toBeInTheDocument()
  })

  it('removes cached citations after history-read permission is revoked while retaining success', async () => {
    let revoked = false
    let listener: ((event: ProviderEvent) => void) | undefined
    const startChat = vi.fn(
      (...args: [StartChatInput]) => (
        void args,
        new Promise<Awaited<ReturnType<ProviderApi['startChat']>>>(() => {})
      )
    )
    const cited = operation()
    let resolveOldRead: ((value: ToolReadResult) => void) | undefined
    const tools = vi.fn((input: Parameters<ProviderApi['tools']>[0]) => {
      if (!resolveOldRead)
        return new Promise<ToolReadResult>((resolve) => {
          resolveOldRead = resolve
        })
      return Promise.resolve(
        toolResult(input.assistantId, input.mode, [revoked ? { ...cited, citations: [] } : cited])
      )
    })
    const permissions = vi.fn(async () => ({
      ok: true as const,
      data: {
        assistantId: assistantA,
        connectionId,
        endpointFingerprint: 'sha256:glm-synthetic',
        endpointDisplay: 'https://open.bigmodel.cn/api/paas/v4',
        readHistory: true,
        sendHistory: true,
        version: 1
      }
    }))
    const setPermissions = vi.fn(async (input: Parameters<TimelineApi['setPermissions']>[0]) => {
      revoked = true
      return {
        ok: true as const,
        data: {
          assistantId: input.assistantId,
          connectionId: input.connectionId,
          endpointFingerprint: input.endpointFingerprint,
          endpointDisplay: 'https://open.bigmodel.cn/api/paas/v4',
          readHistory: input.readHistory,
          sendHistory: input.sendHistory,
          version: input.expectedVersion + 1
        }
      }
    })
    render(
      <ProviderPanel
        assistantSnapshot={assistants()}
        api={provider({
          tools,
          startChat,
          onEvent: vi.fn((value) => {
            listener = value
            return () => undefined
          })
        })}
        timelineApi={timeline({ permissions, setPermissions })}
      />
    )
    const card = await screen.findByRole('article', { name: '历史检索操作' })
    expect(within(card).getByText('我们之前讨论过紫色主题')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('正常消息'), { target: { value: 'synthetic' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    const requestId = startChat.mock.calls[0]![0].requestId
    act(() =>
      listener?.({
        type: 'operation',
        requestId,
        assistantId: assistantA,
        operation: { ...cited, requestId }
      })
    )
    fireEvent.click(screen.getByRole('checkbox', { name: '允许助手读取自己的正常历史' }))
    await waitFor(() => expect(setPermissions).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(screen.queryByText('我们之前讨论过紫色主题')).not.toBeInTheDocument()
    )
    expect(within(card).getByText('已完成')).toBeInTheDocument()
    expect(tools.mock.calls.some(([input]) => input.mode === 'normal')).toBe(true)
    await act(async () => resolveOldRead?.(toolResult(assistantA, 'normal', [cited])))
    expect(screen.queryByText('我们之前讨论过紫色主题')).not.toBeInTheDocument()
    for (const state of ['PREPARED', 'SUCCEEDED'] as const) {
      act(() =>
        listener?.({
          type: 'operation',
          requestId,
          assistantId: assistantA,
          operation: { ...cited, requestId, state }
        })
      )
      expect(screen.queryByText('我们之前讨论过紫色主题')).not.toBeInTheDocument()
      expect(within(card).getByText('已完成')).toBeInTheDocument()
    }
  })

  it('renders every trusted operation state with a distinct Chinese receipt', async () => {
    const stateLabels: Array<[ToolOperation['state'], string]> = [
      ['PREPARED', '准备'],
      ['DISPATCHING', '读取中'],
      ['SUCCEEDED', '已完成'],
      ['CONFIRMED_NOT_APPLIED', '已确认未执行'],
      ['RESULT_UNKNOWN', '结果待核查'],
      ['CANCELLED_BEFORE_DISPATCH', '被取消'],
      ['BLOCKED_BY_CURRENT_STATE', '权限阻止']
    ]
    const rows = stateLabels.map(([state], index) =>
      operation({
        operationId: '00000000-0000-4000-8000-' + String(201 + index).padStart(12, '0'),
        state,
        toolName: 'get_current_time',
        summary: '状态 ' + state,
        citations: []
      })
    )
    render(
      <ProviderPanel
        assistantSnapshot={assistants()}
        api={provider({
          tools: vi.fn(async (input) => toolResult(input.assistantId, input.mode, rows))
        })}
        timelineApi={timeline()}
      />
    )
    await screen.findByText('状态 PREPARED')
    for (const [state, label] of stateLabels) {
      const row = screen.getByText('状态 ' + state).closest('article')
      expect(row).not.toBeNull()
      expect(within(row!).getByText(label)).toBeInTheDocument()
    }
  })

  it('disables tool scopes when the trusted capability record says tools are unavailable', async () => {
    render(
      <ProviderPanel
        assistantSnapshot={assistants()}
        api={provider({
          capabilities: vi.fn(async (input) =>
            capabilityResult(input.assistantId, {
              toolsAvailable: false,
              reason: '当前端点没有经过工具适配验证'
            })
          )
        })}
        timelineApi={timeline()}
      />
    )

    expect(await screen.findByText('当前端点没有经过工具适配验证')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '仅本机时钟' })).toBeDisabled()
    expect(
      screen.getByRole('radio', { name: '本机时钟 + 按关键词检索本助手完整历史' })
    ).toBeDisabled()
    expect(screen.getByRole('radio', { name: '关闭工具（默认）' })).toBeChecked()
  })

  it.each(['empty', 'prepared'] as const)(
    'keeps live success after a late %s snapshot',
    async (snapshotKind) => {
      let listener: ((event: ProviderEvent) => void) | undefined
      const pendingReads: Array<(value: ToolReadResult) => void> = []
      const tools = vi.fn(
        () => new Promise<ToolReadResult>((resolve) => pendingReads.push(resolve))
      )
      const startChat = vi.fn(
        (...args: [StartChatInput]) => (
          void args,
          new Promise<Awaited<ReturnType<ProviderApi['startChat']>>>(() => {})
        )
      )
      const api = provider({
        tools,
        startChat,
        onEvent: vi.fn((value) => {
          listener = value
          return () => {}
        })
      })
      render(<ProviderPanel assistantSnapshot={assistants()} api={api} timelineApi={timeline()} />)
      await screen.findByText('当前端点已启用受限工具')
      await waitFor(() => expect(pendingReads.length).toBeGreaterThan(0))
      fireEvent.click(screen.getByRole('radio', { name: '仅本机时钟' }))
      fireEvent.change(screen.getByLabelText('正常消息'), { target: { value: 'clock synthetic' } })
      fireEvent.click(screen.getByRole('button', { name: '发送' }))
      const requestId = startChat.mock.calls[0]![0].requestId
      act(() =>
        listener?.({
          type: 'operation',
          requestId,
          assistantId: assistantA,
          operation: operation({
            requestId,
            toolName:
              snapshotKind === 'prepared' ? 'search_conversation_history' : 'get_current_time',
            citations: snapshotKind === 'prepared' ? operation().citations : []
          })
        })
      )
      expect(await screen.findByText('已完成')).toBeInTheDocument()
      await act(async () => {
        for (const resolve of pendingReads)
          resolve(
            toolResult(
              assistantA,
              'normal',
              snapshotKind === 'empty'
                ? []
                : [operation({ requestId, state: 'PREPARED', citations: [] })]
            )
          )
      })
      expect(screen.getByText('已完成')).toBeInTheDocument()
      if (snapshotKind === 'prepared')
        expect(screen.getByText('我们之前讨论过紫色主题')).toBeInTheDocument()
    }
  )

  it('clears temporary receipts and invalidates pending snapshots and old request events', async () => {
    let listener: ((event: ProviderEvent) => void) | undefined
    const pending: Array<(result: ToolReadResult) => void> = []
    const startChat = vi.fn(async (input: StartChatInput) => ({
      ok: true as const,
      data: {
        requestId: input.requestId,
        assistantId: input.assistantId,
        status: 'completed' as const,
        text: 'clock',
        usage: null
      }
    }))
    const api = provider({
      startChat,
      clearChat: vi.fn(async () => ({ ok: true as const, data: providerSnapshot })),
      tools: vi.fn((input) =>
        input.mode === 'temporary'
          ? new Promise<ToolReadResult>((resolve) => pending.push(resolve))
          : Promise.resolve(toolResult(input.assistantId, input.mode))
      ),
      onEvent: vi.fn((value) => {
        listener = value
        return () => undefined
      })
    })
    render(<ProviderPanel assistantSnapshot={assistants()} api={api} timelineApi={timeline()} />)
    await screen.findByText('当前端点已启用受限工具')
    fireEvent.click(screen.getByRole('radio', { name: '严格临时（不自动保存）' }))
    await waitFor(() => expect(pending.length).toBeGreaterThan(0))
    fireEvent.change(screen.getByLabelText('临时消息'), { target: { value: 'clock' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '清空本助手的临时会话' })).toBeEnabled()
    )
    const requestId = startChat.mock.calls[0]![0].requestId
    const receipt = operation({ requestId, toolName: 'get_current_time', citations: [] })
    act(() =>
      listener?.({ type: 'operation', requestId, assistantId: assistantA, operation: receipt })
    )
    await screen.findByText('已完成')
    fireEvent.click(screen.getByRole('button', { name: '清空本助手的临时会话' }))
    await screen.findByText('当前助手的临时会话已清空')
    await act(async () => {
      for (const resolve of pending) resolve(toolResult(assistantA, 'temporary', [receipt]))
    })
    act(() =>
      listener?.({ type: 'operation', requestId, assistantId: assistantA, operation: receipt })
    )
    expect(screen.queryByText('已完成')).not.toBeInTheDocument()
  })

  it('describes selected history tools as limited to the selected rounds', async () => {
    const query = vi.fn(async () => ({
      ok: true as const,
      data: { assistantId: assistantA, messages: pair(citedRequestId), nextCursor: null }
    }))
    render(
      <ProviderPanel
        assistantSnapshot={assistants()}
        api={provider()}
        timelineApi={timeline({ query })}
      />
    )
    await screen.findByText('我们之前聊了什么主题？')
    fireEvent.click(screen.getByRole('checkbox', { name: /选择此轮：/ }))
    fireEvent.click(screen.getByRole('radio', { name: '已选轮次（最多 16 轮）' }))
    fireEvent.click(screen.getByRole('radio', { name: '本机时钟 + 按关键词检索所选轮次' }))
    expect(screen.getByText(/未选择的历史不会进入工具检索范围/)).toBeInTheDocument()
    expect(
      screen.queryByText(/你已明确允许本轮模型按关键词检索本助手完整正常历史/)
    ).not.toBeInTheDocument()
  })
  it('route refresh captured after PREPARED cannot strip a later SUCCEEDED history citation', async () => {
    let listener: ((event: ProviderEvent) => void) | undefined
    let defer = false
    const reads: Array<{ id: string; resolve: (value: ToolReadResult) => void }> = []
    const startChat = vi.fn((input: StartChatInput) => {
      void input
      return new Promise<Awaited<ReturnType<ProviderApi['startChat']>>>(() => {})
    })
    const api = provider({
      tools: vi.fn((input) =>
        defer
          ? new Promise<ToolReadResult>((resolve) => reads.push({ id: input.assistantId, resolve }))
          : Promise.resolve(toolResult(input.assistantId, input.mode))
      ),
      startChat,
      onEvent: vi.fn((value) => {
        listener = value
        return () => {}
      })
    })
    const timelineApi = timeline()
    const view = render(
      <ProviderPanel assistantSnapshot={assistants()} api={api} timelineApi={timelineApi} />
    )
    await screen.findByText('当前端点已启用受限工具')
    fireEvent.click(screen.getByRole('radio', { name: '仅本机时钟' }))
    fireEvent.change(screen.getByLabelText('正常消息'), { target: { value: 'synthetic' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    const requestId = startChat.mock.calls[0]![0].requestId
    const prepared = operation({
      requestId,
      state: 'PREPARED',
      updatedAt: '2026-09-06T08:00:00.000Z',
      summary: '准备读取',
      citations: []
    })
    act(() =>
      listener?.({ type: 'operation', requestId, assistantId: assistantA, operation: prepared })
    )
    defer = true
    view.rerender(
      <ProviderPanel
        assistantSnapshot={assistants(assistantB)}
        api={api}
        timelineApi={timelineApi}
      />
    )
    await waitFor(() => expect(reads.some((r) => r.id === assistantB)).toBe(true))
    view.rerender(
      <ProviderPanel assistantSnapshot={assistants()} api={api} timelineApi={timelineApi} />
    )
    await waitFor(() => expect(reads.some((r) => r.id === assistantA)).toBe(true))
    act(() =>
      listener?.({
        type: 'operation',
        requestId,
        assistantId: assistantA,
        operation: operation({ requestId })
      })
    )
    expect(await screen.findByText('我们之前讨论过紫色主题')).toBeInTheDocument()
    await act(async () => {
      for (const read of reads)
        read.resolve(toolResult(read.id, 'normal', read.id === assistantA ? [prepared] : []))
    })
    expect(screen.getByText('已完成')).toBeInTheDocument()
    expect(screen.getByText('我们之前讨论过紫色主题')).toBeInTheDocument()
  })

  it('does not let a late pending snapshot regress a completed memory business receipt', async () => {
    let listener: ((event: ProviderEvent) => void) | undefined
    const pendingReads: Array<(value: ToolReadResult) => void> = []
    const tools = vi.fn(() => new Promise<ToolReadResult>((resolve) => pendingReads.push(resolve)))
    const startChat = vi.fn(
      (...args: [StartChatInput]) => (
        void args,
        new Promise<Awaited<ReturnType<ProviderApi['startChat']>>>(() => {})
      )
    )
    const memoryApi = {
      ...memoryApi008Defaults(),
      permissions: vi.fn(async (input) => ({
        ok: true as const,
        data: memoryPermission(input.scope, {
          assistantId: input.assistantId,
          write: true
        })
      }))
    }
    render(
      <ProviderPanel
        assistantSnapshot={assistants()}
        api={provider({
          tools,
          startChat,
          onEvent: vi.fn((value) => {
            listener = value
            return () => undefined
          })
        })}
        timelineApi={timeline()}
        memoryApi={memoryApi}
      />
    )
    const memoryScope = await screen.findByRole('radio', {
      name: '本机时钟 + 记忆与个人事件'
    })
    await waitFor(() => expect(memoryScope).toBeEnabled())
    await waitFor(() => expect(pendingReads.length).toBeGreaterThan(0))
    fireEvent.click(memoryScope)
    fireEvent.change(screen.getByLabelText('正常消息'), { target: { value: '撤回旧称呼' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    const requestId = startChat.mock.calls[0]![0].requestId
    const businessOperationId = '00000000-0000-4000-8000-000000000711'
    const removal = operation({
      operationId: '00000000-0000-4000-8000-000000000712',
      requestId,
      toolName: 'request_memory_removal',
      summary: '已准备撤回',
      citations: [],
      memoryReceipt: {
        operationId: businessOperationId,
        objectId: '00000000-0000-4000-8000-000000000713',
        objectVersion: 4,
        state: 'SUCCEEDED',
        summary: '已撤回并停止使用；原文/历史副本清理待生命周期处理。',
        confirmationId: null
      }
    })
    act(() =>
      listener?.({ type: 'operation', requestId, assistantId: assistantA, operation: removal })
    )
    expect(await screen.findByText('已执行')).toBeInTheDocument()
    await act(async () => {
      for (const resolve of pendingReads)
        resolve(
          toolResult(assistantA, 'normal', [
            {
              ...removal,
              memoryReceipt: {
                ...removal.memoryReceipt!,
                state: 'PENDING_CONFIRMATION',
                confirmationId: '00000000-0000-4000-8000-000000000714'
              }
            }
          ])
        )
    })
    expect(screen.getByText('已执行')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认执行' })).not.toBeInTheDocument()
  })
  it('uses scoped trusted memory grants, sends the explicit scope, blocks it in temporary mode, and labels business receipts', async () => {
    let listener: ((event: ProviderEvent) => void) | undefined
    const memoryChanged = vi.fn()
    const locateMemorySource = vi.fn(async () => undefined)
    const startChat = vi.fn(async (input: StartChatInput) => ({
      ok: true as const,
      data: {
        requestId: input.requestId,
        assistantId: input.assistantId,
        status: 'completed' as const,
        text: '已处理',
        usage: null
      }
    }))
    const businessOperationId = '00000000-0000-4000-8000-000000000704'
    const businessObjectId = '00000000-0000-4000-8000-000000000705'
    const businessConfirmationId = '00000000-0000-4000-8000-000000000706'
    const pendingMemoryReceipt = {
      operationId: businessOperationId,
      objectId: businessObjectId,
      objectVersion: 3,
      state: 'PENDING_CONFIRMATION' as const,
      summary: '将撤回旧称呼的当前依据；原对话仍保留',
      confirmationId: businessConfirmationId,
      impact: {
        sourceRounds: [{ assistantId: assistantA, requestId: citedRequestId }],
        memoryIds: [businessObjectId],
        roundIds: [citedRequestId],
        totalMemories: 1,
        totalRounds: 1,
        truncated: false
      }
    }
    const rows = [
      operation({
        operationId: '00000000-0000-4000-8000-000000000701',
        toolName: 'write_memory',
        summary: '已写入个人事件',
        citations: []
      }),
      operation({
        operationId: '00000000-0000-4000-8000-000000000702',
        toolName: 'request_memory_removal',
        summary: '已准备删除预览，等待本地确认',
        citations: [],
        memoryReceipt: pendingMemoryReceipt
      })
    ]
    const confirm = vi.fn<MemoryApi['confirm']>(async () => ({
      ok: true as const,
      data: {
        ...pendingMemoryReceipt,
        state: 'SUCCEEDED' as const,
        summary: '已撤回并停止使用；原文/历史副本清理待生命周期处理。',
        confirmationId: null
      }
    }))
    const memoryApi = {
      ...memoryApi008Defaults(),
      confirm,
      permissions: vi.fn(async (input) => ({
        ok: true as const,
        data: memoryPermission(input.scope, {
          assistantId: input.assistantId,
          read: true,
          write: input.scope === 'global',
          receive: true
        })
      }))
    }
    render(
      <ProviderPanel
        assistantSnapshot={assistants()}
        api={provider({
          startChat,
          tools: vi.fn(async (input) => toolResult(input.assistantId, input.mode, rows)),
          onEvent: vi.fn((value) => {
            listener = value
            return () => undefined
          })
        })}
        timelineApi={timeline()}
        memoryApi={memoryApi}
        onMemoryChanged={memoryChanged}
        onLocateMemorySource={locateMemorySource}
      />
    )

    const memoryScope = await screen.findByRole('radio', {
      name: '本机时钟 + 记忆与个人事件'
    })
    await waitFor(() => expect(memoryScope).toBeEnabled())
    expect(screen.getByText(/全局用户记忆：可读 · 可写/)).toBeInTheDocument()
    fireEvent.click(memoryScope)
    expect(screen.getByText(/每轮最多一个记忆或事件业务写操作/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('正常消息'), { target: { value: '记住我周六可能看展' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(startChat).toHaveBeenCalledTimes(1))
    expect(startChat.mock.calls[0]![0].tools).toBe('clock-and-memory')
    const requestId = startChat.mock.calls[0]![0].requestId
    const liveWrite = operation({
      operationId: '00000000-0000-4000-8000-000000000703',
      requestId,
      toolName: 'write_memory',
      citations: []
    })
    act(() =>
      listener?.({ type: 'operation', requestId, assistantId: assistantA, operation: liveWrite })
    )
    act(() =>
      listener?.({ type: 'operation', requestId, assistantId: assistantA, operation: liveWrite })
    )
    expect(memoryChanged).toHaveBeenCalledTimes(1)
    const liveCorrection = operation({
      operationId: '00000000-0000-4000-8000-000000000707',
      requestId,
      toolName: 'correct_memory',
      summary: '已纠正旧称呼',
      citations: []
    })
    act(() =>
      listener?.({
        type: 'operation',
        requestId,
        assistantId: assistantA,
        operation: liveCorrection
      })
    )
    expect(memoryChanged).toHaveBeenCalledTimes(2)
    const correctionCard = screen.getByRole('article', { name: '纠正记忆操作' })
    expect(within(correctionCard).getByText('已纠正')).toBeInTheDocument()

    const writeCard = (await screen.findByText('已写入个人事件')).closest('article')
    expect(writeCard).not.toBeNull()
    expect(within(writeCard!).getByText('已保存')).toBeInTheDocument()
    const removalCard = screen.getByRole('article', { name: '删除或撤回请求操作' })
    expect(within(removalCard).getByText('待本地确认')).toBeInTheDocument()
    const confirmation = within(removalCard).getByRole('region', { name: '对话记忆操作确认' })
    expect(within(confirmation).getByText(/受影响：1 条记忆或事件/)).toBeInTheDocument()
    expect(within(confirmation).getByText(new RegExp(businessObjectId))).toBeInTheDocument()
    expect(within(confirmation).getByRole('button', { name: '取消操作' })).toBeInTheDocument()
    fireEvent.click(within(confirmation).getByRole('button', { name: '定位受影响来源轮次' }))
    expect(locateMemorySource).toHaveBeenCalledWith({
      assistantId: assistantA,
      id: citedRequestId
    })
    fireEvent.click(within(confirmation).getByRole('button', { name: '确认执行' }))
    await waitFor(() =>
      expect(confirm).toHaveBeenCalledWith({
        protocolVersion: 1,
        assistantId: assistantA,
        confirmationId: businessConfirmationId,
        accept: true
      })
    )
    expect(await within(removalCard).findByText('已执行')).toBeInTheDocument()
    expect(within(removalCard).getByText(/已撤回并停止使用/)).toBeInTheDocument()
    expect(memoryChanged).toHaveBeenCalledTimes(3)

    fireEvent.click(screen.getByRole('radio', { name: '严格临时（不自动保存）' }))
    expect(
      screen.queryByRole('radio', { name: '本机时钟 + 记忆与个人事件' })
    ).not.toBeInTheDocument()
    expect(screen.getByText(/不会读取或写入记忆、个人事件/)).toBeInTheDocument()
  })
  it('labels a prepared formal item update and opens the exact pending confirmation command', async () => {
    const commandId = '00000000-0000-4000-8000-000000000709'
    const onOpenItems = vi.fn()
    const prepared = operation({
      operationId: commandId,
      toolName: 'prepare_item_update',
      summary: '已准备正式事项修改，等待本地确认',
      citations: [],
      itemReceipt: itemReceipt({
        operationId: commandId,
        objectId: itemId,
        objectVersion: 2,
        objectType: 'item',
        state: 'PENDING_CONFIRMATION',
        confirmationId: '00000000-0000-4000-8000-000000000710',
        summary: '将修改原正式事项，尚未写入'
      })
    })
    render(
      <ProviderPanel
        assistantSnapshot={assistants()}
        api={provider({
          tools: vi.fn(async (input) => toolResult(input.assistantId, input.mode, [prepared]))
        })}
        timelineApi={timeline()}
        memoryApi={memoryApi008Defaults()}
        itemApi={itemApi010Defaults()}
        onOpenItems={onOpenItems}
      />
    )

    const card = await screen.findByRole('article', { name: '正式事项修改预览操作' })
    expect(within(card).getByText('等待本机确认')).toBeInTheDocument()
    expect(within(card).getByText('将修改原正式事项，尚未写入')).toBeInTheDocument()
    fireEvent.click(within(card).getByRole('button', { name: '打开事项' }))
    expect(onOpenItems).toHaveBeenCalledWith({
      assistantId: assistantA,
      commandId,
      confirmationAction: 'replace-content'
    })
  })
})
