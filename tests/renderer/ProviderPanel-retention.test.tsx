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
import type { TimelineApi } from '../../src/shared/timeline-contract'
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
})
