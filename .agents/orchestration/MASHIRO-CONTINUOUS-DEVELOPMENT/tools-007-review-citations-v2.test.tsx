// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ProviderPanel } from '../../../src/renderer/src/features/provider/ProviderPanel'
import { timelineApi006Defaults } from '../../../tests/renderer/timeline-api-fixture'
import type { AssistantSnapshot } from '../../../src/shared/assistant-contract'
import type {
  CapabilityResult,
  ProviderApi,
  ProviderEvent,
  ProviderSnapshot,
  StartChatInput,
  ToolReadResult
} from '../../../src/shared/provider-contract'
import type { ProviderCapabilities, ToolOperation } from '../../../src/shared/tool-contract'
import type { TimelineApi } from '../../../src/shared/timeline-contract'

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

it('review: refresh captured after PREPARED cannot strip a later SUCCEEDED history citation', async () => {
 let listener: ((event: ProviderEvent) => void) | undefined
 let defer = false
 const reads: Array<{ id: string; resolve: (value: ToolReadResult) => void }> = []
 const startChat = vi.fn<(input: StartChatInput) => ReturnType<ProviderApi['startChat']>>(() => new Promise<Awaited<ReturnType<ProviderApi['startChat']>>>(() => {}))
 const api = provider({ tools: vi.fn(input => defer ? new Promise<ToolReadResult>(resolve => reads.push({ id: input.assistantId, resolve })) : Promise.resolve(toolResult(input.assistantId, input.mode))), startChat, onEvent: vi.fn(value => { listener = value; return () => {} }) })
 const timelineApi = timeline()
 const view = render(<ProviderPanel assistantSnapshot={assistants()} api={api} timelineApi={timelineApi} />)
 await screen.findByText('当前端点已启用受限工具')
 fireEvent.click(screen.getByRole('radio', { name: '仅本机时钟' }))
 fireEvent.change(screen.getByLabelText('正常消息'), { target: { value: 'synthetic' } })
 fireEvent.click(screen.getByRole('button', { name: '发送' }))
 const requestId = startChat.mock.calls[0]![0].requestId
 const prepared = operation({ requestId, state: 'PREPARED', updatedAt: '2026-09-06T08:00:00.000Z', summary: '准备读取', citations: [] })
 act(() => listener?.({ type: 'operation', requestId, assistantId: assistantA, operation: prepared }))
 defer = true
 view.rerender(<ProviderPanel assistantSnapshot={assistants(assistantB)} api={api} timelineApi={timelineApi} />)
 await waitFor(() => expect(reads.some(r => r.id === assistantB)).toBe(true))
 view.rerender(<ProviderPanel assistantSnapshot={assistants()} api={api} timelineApi={timelineApi} />)
 await waitFor(() => expect(reads.some(r => r.id === assistantA)).toBe(true))
 act(() => listener?.({ type: 'operation', requestId, assistantId: assistantA, operation: operation({ requestId }) }))
 expect(await screen.findByText('我们之前讨论过紫色主题')).toBeInTheDocument()
 await act(async () => { for (const read of reads) read.resolve(toolResult(read.id, 'normal', read.id === assistantA ? [prepared] : [])) })
 expect(screen.getByText('已完成')).toBeInTheDocument()
 expect(screen.getByText('我们之前讨论过紫色主题')).toBeInTheDocument()
})