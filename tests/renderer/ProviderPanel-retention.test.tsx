// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProviderPanel } from '../../src/renderer/src/features/provider/ProviderPanel'
import type { AssistantSnapshot } from '../../src/shared/assistant-contract'
import type {
  ProviderApi,
  ProviderChatResult,
  ProviderEvent,
  ProviderSnapshot
} from '../../src/shared/provider-contract'
import type { RetentionChanged } from '../../src/shared/retention-contract'
import type { TimelineApi, TimelineMessage } from '../../src/shared/timeline-contract'
import type { ToolOperation } from '../../src/shared/tool-contract'
import { providerApi007Defaults } from './provider-api-fixture'
import { timelineApi006Defaults } from './timeline-api-fixture'

const assistantA = '00000000-0000-4000-8000-000000000001'
const assistantB = '00000000-0000-4000-8000-000000000002'
const connectionId = '00000000-0000-4000-8000-000000000003'

function assistants(currentAssistantId: string): AssistantSnapshot {
  return {
    assistants: [
      {
        id: assistantA,
        displayName: 'Alpha',
        persona: '',
        avatarKey: 'mashiro',
        isArchived: false,
        createdAt: '2026-09-06T00:00:00.000Z',
        updatedAt: '2026-09-06T00:00:00.000Z',
        archivedAt: null,
        version: 1
      },
      {
        id: assistantB,
        displayName: 'Beta',
        persona: '',
        avatarKey: 'mashiro',
        isArchived: false,
        createdAt: '2026-09-06T00:00:01.000Z',
        updatedAt: '2026-09-06T00:00:01.000Z',
        archivedAt: null,
        version: 1
      }
    ],
    currentAssistantId,
    primaryAssistantId: assistantA,
    stateRevision: 2
  }
}

const providerSnapshot: ProviderSnapshot = {
  connections: [
    {
      id: connectionId,
      displayName: 'Receiver',
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
    },
    {
      assistantId: assistantB,
      connectionId,
      model: 'model-b',
      updatedAt: '2026-09-06T00:00:00.000Z',
      version: 1
    }
  ]
}

afterEach(cleanup)

describe('ProviderPanel retention epochs', () => {
  it('keeps cleanup management collapsed after the timeline and preserves preview paths', async () => {
    const messages: TimelineMessage[] = [
      {
        id: '00000000-0000-4000-8000-000000000101',
        requestId: '00000000-0000-4000-8000-000000000201',
        role: 'user',
        content: '先看到的历史问题',
        status: 'completed',
        saved: true,
        createdAt: '2026-09-06T00:00:00.000Z'
      },
      {
        id: '00000000-0000-4000-8000-000000000102',
        requestId: '00000000-0000-4000-8000-000000000201',
        role: 'assistant',
        content: '随后看到的历史回答',
        status: 'completed',
        saved: true,
        createdAt: '2026-09-06T00:00:01.000Z'
      }
    ]
    const api = {
      ...providerApi007Defaults(),
      list: vi.fn().mockResolvedValue({ ok: true, data: providerSnapshot }),
      saveConnection: vi.fn(),
      setCredential: vi.fn(),
      deleteCredential: vi.fn(),
      bindAssistant: vi.fn(),
      clearChat: vi.fn(),
      startChat: vi.fn(),
      cancelChat: vi.fn(),
      onEvent: vi.fn(() => () => undefined)
    } as ProviderApi
    const timelineApi = {
      ...timelineApi006Defaults(),
      read: vi.fn(async (input) => ({
        ok: true as const,
        data: { assistantId: input.assistantId, mode: input.mode, messages, hasMore: false }
      })),
      saveTemporary: vi.fn()
    } as TimelineApi
    const onPrepareRetention = vi.fn()
    render(
      <ProviderPanel
        assistantSnapshot={assistants(assistantA)}
        api={api}
        timelineApi={timelineApi}
        onPrepareRetention={onPrepareRetention}
      />
    )
    await screen.findByText('先看到的历史问题')
    const timeline = screen.getByLabelText('消息时间线')
    const disclosure = screen.getByText('时间线管理').closest('details')
    expect(disclosure).not.toBeNull()
    expect(disclosure).not.toHaveAttribute('open')
    expect(
      timeline.compareDocumentPosition(disclosure!) & Node.DOCUMENT_POSITION_FOLLOWING
    ).not.toBe(0)
    const wholeTimelineButton = screen.getByRole('button', { name: '预览清理整条时间线' })
    expect(disclosure).toContainElement(wholeTimelineButton)
    expect(wholeTimelineButton).not.toBeVisible()
    fireEvent.click(screen.getByText('时间线管理'))
    expect(disclosure).toHaveAttribute('open')
    expect(wholeTimelineButton).toBeVisible()
    fireEvent.click(wholeTimelineButton)
    expect(onPrepareRetention).toHaveBeenLastCalledWith(assistantA, { type: 'timeline' })
    const anchors = screen.getAllByRole('checkbox', { name: '作为区段端点' })
    fireEvent.click(anchors[0]!)
    fireEvent.click(anchors[1]!)
    fireEvent.click(screen.getByRole('button', { name: '预览清理所选区段' }))
    expect(onPrepareRetention).toHaveBeenLastCalledWith(assistantA, {
      type: 'range',
      firstMessageId: messages[0]!.id,
      lastMessageId: messages[1]!.id
    })
  })

  it('drops cached A bodies and ignores late stream, operation and Promise completion after cleanup', async () => {
    let listener: ((event: ProviderEvent) => void) | undefined
    let finish!: (result: ProviderChatResult) => void
    const startChat = vi.fn<ProviderApi['startChat']>(
      () => new Promise<ProviderChatResult>((resolve) => (finish = resolve))
    )
    const api = {
      ...providerApi007Defaults(),
      list: vi.fn().mockResolvedValue({ ok: true, data: providerSnapshot }),
      startChat,
      clearChat: vi.fn(),
      cancelChat: vi.fn(),
      saveConnection: vi.fn(),
      setCredential: vi.fn(),
      deleteCredential: vi.fn(),
      bindAssistant: vi.fn(),
      onEvent: vi.fn((value: (event: ProviderEvent) => void) => {
        listener = value
        return () => undefined
      })
    } as ProviderApi
    const timelineApi = {
      ...timelineApi006Defaults(),
      read: vi.fn(async (input) => ({
        ok: true as const,
        data: { assistantId: input.assistantId, mode: input.mode, messages: [], hasMore: false }
      })),
      saveTemporary: vi.fn()
    } as TimelineApi
    const view = render(
      <ProviderPanel
        assistantSnapshot={assistants(assistantA)}
        api={api}
        timelineApi={timelineApi}
      />
    )
    await screen.findByText(/实际接收方：Receiver/)
    fireEvent.change(screen.getByLabelText('正常消息'), {
      target: { value: 'private marker A' }
    })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await screen.findByText('private marker A')
    const sent = startChat.mock.calls[0]![0]

    const changed: RetentionChanged = {
      epoch: 11,
      assistantIds: [assistantA],
      memoryIds: [],
      requestIds: [sent.requestId],
      reason: 'cleanup'
    }
    view.rerender(
      <ProviderPanel
        assistantSnapshot={assistants(assistantA)}
        api={api}
        timelineApi={timelineApi}
        retentionChange={changed}
      />
    )
    await waitFor(() => expect(screen.queryByText('private marker A')).not.toBeInTheDocument())
    expect(screen.getByLabelText('正常消息')).toHaveValue('')

    const lateOperation: ToolOperation = {
      operationId: '00000000-0000-4000-8000-000000000010',
      segmentId: '00000000-0000-4000-8000-000000000011',
      modelRequestId: '00000000-0000-4000-8000-000000000012',
      requestId: sent.requestId,
      assistantId: assistantA,
      toolName: 'search_conversation_history',
      state: 'SUCCEEDED',
      createdAt: '2026-09-06T00:00:00.000Z',
      updatedAt: '2026-09-06T00:00:00.000Z',
      summary: 'late private operation marker',
      citations: []
    }
    act(() => {
      listener?.({
        type: 'delta',
        requestId: sent.requestId,
        assistantId: assistantA,
        text: 'late private stream marker'
      })
      listener?.({
        type: 'operation',
        requestId: sent.requestId,
        assistantId: assistantA,
        operation: lateOperation
      })
    })
    await act(async () => {
      finish({
        ok: true,
        data: {
          requestId: sent.requestId,
          assistantId: assistantA,
          status: 'completed',
          text: 'late private Promise marker',
          usage: null
        }
      })
    })
    expect(screen.queryByText(/late private/)).not.toBeInTheDocument()

    view.rerender(
      <ProviderPanel
        assistantSnapshot={assistants(assistantB)}
        api={api}
        timelineApi={timelineApi}
        retentionChange={changed}
      />
    )
    view.rerender(
      <ProviderPanel
        assistantSnapshot={assistants(assistantA)}
        api={api}
        timelineApi={timelineApi}
        retentionChange={changed}
      />
    )
    expect(screen.queryByText(/private marker/)).not.toBeInTheDocument()
  })
  it('keeps a temporary stream through policy status and still consumes a same-epoch cleanup', async () => {
    let listener: ((event: ProviderEvent) => void) | undefined
    const startChat = vi.fn<ProviderApi['startChat']>(() => new Promise(() => undefined))
    const api = {
      ...providerApi007Defaults(),
      list: vi.fn().mockResolvedValue({ ok: true, data: providerSnapshot }),
      saveConnection: vi.fn(),
      setCredential: vi.fn(),
      deleteCredential: vi.fn(),
      bindAssistant: vi.fn(),
      clearChat: vi.fn(),
      cancelChat: vi.fn(),
      startChat,
      onEvent: vi.fn((value: (event: ProviderEvent) => void) => {
        listener = value
        return () => undefined
      })
    } as ProviderApi
    const timelineApi = {
      ...timelineApi006Defaults(),
      read: vi.fn(async (input) => ({
        ok: true as const,
        data: { assistantId: input.assistantId, mode: input.mode, messages: [], hasMore: false }
      })),
      saveTemporary: vi.fn()
    } as TimelineApi
    const view = render(
      <ProviderPanel
        assistantSnapshot={assistants(assistantA)}
        api={api}
        timelineApi={timelineApi}
      />
    )
    await screen.findByText(/实际接收方：Receiver/)
    fireEvent.click(screen.getByRole('radio', { name: /严格临时/ }))
    fireEvent.change(screen.getByLabelText('临时消息'), {
      target: { value: 'temporary status marker' }
    })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await screen.findByText('temporary status marker')
    const sent = startChat.mock.calls[0]![0]
    act(() => {
      listener?.({
        type: 'delta',
        requestId: sent.requestId,
        assistantId: assistantA,
        text: 'active stream marker'
      })
    })
    await screen.findByText('active stream marker')

    const status: RetentionChanged = {
      epoch: 11,
      assistantIds: [],
      memoryIds: [],
      requestIds: [],
      reason: 'policy-status'
    }
    view.rerender(
      <ProviderPanel
        assistantSnapshot={assistants(assistantA)}
        api={api}
        timelineApi={timelineApi}
        retentionChange={status}
      />
    )
    expect(screen.getByRole('radio', { name: /严格临时/ })).toBeChecked()
    expect(screen.getByText('temporary status marker')).toBeInTheDocument()
    expect(screen.getByText('active stream marker')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '取消' })).toBeEnabled()

    view.rerender(
      <ProviderPanel
        assistantSnapshot={assistants(assistantA)}
        api={api}
        timelineApi={timelineApi}
        retentionChange={{
          ...status,
          assistantIds: [assistantA],
          requestIds: [sent.requestId],
          reason: 'cleanup'
        }}
      />
    )
    await waitFor(() => expect(screen.queryByText('active stream marker')).not.toBeInTheDocument())
    expect(screen.queryByText('temporary status marker')).not.toBeInTheDocument()
  })
})
