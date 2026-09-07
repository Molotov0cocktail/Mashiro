// @vitest-environment jsdom
// Independent product oracle: preserved old round must have a receipt entry.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ProviderPanel } from '../../src/renderer/src/features/provider/ProviderPanel'
import { providerApi007Defaults } from './provider-api-fixture'
import type { AssistantSnapshot } from '../../src/shared/assistant-contract'
import type { ProviderApi } from '../../src/shared/provider-contract'
import type { TimelineApi, TimelineMessage } from '../../src/shared/timeline-contract'
import type { ToolOperation } from '../../src/shared/tool-contract'

afterEach(cleanup)
const assistantId = '00000000-0000-4000-8000-000000000001'
const requestId = '00000000-0000-4000-8000-000000000002'
const time = '2026-09-01T00:00:00.000Z'
const id = (n: number) => '00000000-0000-4000-8000-' + n.toString().padStart(12, '0')
const snapshot: AssistantSnapshot = {
  assistants: [
    {
      id: assistantId,
      displayName: '合成助手',
      persona: '',
      avatarKey: 'mashiro',
      isArchived: false,
      createdAt: time,
      updatedAt: time,
      archivedAt: null,
      version: 1
    }
  ],
  currentAssistantId: assistantId,
  primaryAssistantId: assistantId,
  stateRevision: 1
}
const messages: TimelineMessage[] = [
  {
    id: id(3),
    requestId,
    role: 'user',
    content: '旧轮待核查记忆操作',
    status: 'completed',
    createdAt: time,
    saved: true
  },
  {
    id: id(4),
    requestId,
    role: 'assistant',
    content: '回复中断，操作待核查',
    status: 'interrupted',
    createdAt: time,
    saved: true
  }
]
function operation(n: number): ToolOperation {
  return {
    operationId: id(1000 + n),
    segmentId: id(2000 + n),
    modelRequestId: id(3000 + n),
    requestId: n === 0 ? requestId : id(4000 + n),
    assistantId,
    toolName: n === 0 ? 'write_memory' : 'get_current_time',
    state: n === 0 ? 'RESULT_UNKNOWN' : 'SUCCEEDED',
    createdAt: time,
    updatedAt: time,
    summary: n === 0 ? '独立旧操作结果未知回执' : '合成新时钟回执',
    citations: []
  }
}
it('an old searched round opens its original unknown receipt without entering IDs or sending again', async () => {
  const old = operation(0)
  const tools = vi.fn(async (input: Parameters<ProviderApi['tools']>[0]) => ({
    ok: true as const,
    data: {
      assistantId,
      mode: input.mode,
      operations:
        input.requestId === requestId
          ? [old]
          : Array.from({ length: 384 }, (_, i) => operation(i + 2))
    }
  }))
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
  const timelineApi = {
    read: vi.fn(async () => ({
      ok: true,
      data: { assistantId, mode: 'normal', messages: [], hasMore: true }
    })),
    saveTemporary: vi.fn(),
    query: vi.fn(async () => ({ ok: true, data: { assistantId, messages, nextCursor: null } })),
    permissions: vi.fn(async () => ({
      ok: true,
      data: {
        assistantId,
        connectionId: null,
        endpointFingerprint: null,
        endpointDisplay: null,
        readHistory: true,
        sendHistory: false,
        version: 0
      }
    })),
    setPermissions: vi.fn()
  } as TimelineApi
  // Fresh mount models a restarted renderer: no operation events or cached older results.
  render(<ProviderPanel assistantSnapshot={snapshot} api={api} timelineApi={timelineApi} />)
  await screen.findByText('旧轮待核查记忆操作')
  await waitFor(() => expect(tools).toHaveBeenCalled())
  expect(screen.queryByText(old.summary)).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('搜索本助手历史'), {
    target: { value: '旧轮待核查记忆操作' }
  })
  fireEvent.click(screen.getByRole('button', { name: '搜索' }))
  const locate = await screen.findByRole('button', { name: '定位此搜索结果的完整原轮次' })
  fireEvent.click(locate)
  await waitFor(() =>
    expect(timelineApi.query).toHaveBeenCalledWith(expect.objectContaining({ requestId }))
  )
  expect(startChat).not.toHaveBeenCalled()
  const round = screen.getByText('旧轮待核查记忆操作').closest('article')!
  // RED on the pre-repair product: there is no receipt control for a browsed old round.
  fireEvent.click(within(round).getByRole('button', { name: /(?:工具|业务|操作).*回执|回执/ }))
  await screen.findByText(old.summary)
  expect(tools).toHaveBeenCalledWith({ protocolVersion: 1, assistantId, mode: 'normal', requestId })
  expect(screen.getByRole('button', { name: '核查本地状态' })).toBeInTheDocument()
  expect(startChat).not.toHaveBeenCalled()
})
