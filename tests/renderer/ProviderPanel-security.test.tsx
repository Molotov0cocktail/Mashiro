// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProviderPanel } from '../../src/renderer/src/features/provider/ProviderPanel'
import type { AssistantSnapshot } from '../../src/shared/assistant-contract'
import type {
  ProviderApi,
  ProviderSnapshot,
  StartChatInput
} from '../../src/shared/provider-contract'
import type { TimelineApi } from '../../src/shared/timeline-contract'

afterEach(cleanup)

const assistantId = '00000000-0000-4000-8000-000000000001'
const editingId = '00000000-0000-4000-8000-000000000002'
const boundId = '00000000-0000-4000-8000-000000000003'
const assistantSnapshot: AssistantSnapshot = {
  assistants: [
    {
      id: assistantId,
      displayName: 'Assistant',
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
const providerSnapshot: ProviderSnapshot = {
  connections: [
    {
      id: editingId,
      displayName: 'Editing connection',
      baseUrl: 'https://editing.example/v1',
      enabled: true,
      hasCredential: true,
      credentialPersistence: 'temporary',
      createdAt: '2026-09-06T00:00:00.000Z',
      updatedAt: '2026-09-06T00:00:00.000Z',
      version: 1
    },
    {
      id: boundId,
      displayName: 'Bound receiver',
      baseUrl: 'https://bound.example/v1',
      enabled: true,
      hasCredential: true,
      credentialPersistence: 'temporary',
      createdAt: '2026-09-06T00:00:01.000Z',
      updatedAt: '2026-09-06T00:00:01.000Z',
      version: 1
    }
  ],
  bindings: [
    {
      assistantId,
      connectionId: boundId,
      model: 'safe-model',
      updatedAt: '2026-09-06T00:00:01.000Z',
      version: 1
    }
  ]
}
function mockTimelineApi(completedText?: string, requestId?: () => string): TimelineApi {
  let reads = 0
  return {
    read: vi.fn(async (input) => {
      reads += 1
      return {
        ok: true as const,
        data: {
          assistantId: input.assistantId,
          mode: input.mode,
          messages:
            completedText && reads > 1
              ? [
                  {
                    id: '00000000-0000-4000-8000-000000000101',
                    requestId: requestId?.() ?? '00000000-0000-4000-8000-000000000201',
                    role: 'user' as const,
                    content: 'synthetic request',
                    status: 'completed' as const,
                    saved: true,
                    createdAt: '2026-09-06T00:00:00.000Z'
                  },
                  {
                    id: '00000000-0000-4000-8000-000000000102',
                    requestId: requestId?.() ?? '00000000-0000-4000-8000-000000000201',
                    role: 'assistant' as const,
                    content: completedText,
                    status: 'completed' as const,
                    saved: true,
                    createdAt: '2026-09-06T00:00:00.000Z'
                  }
                ]
              : [],
          hasMore: false
        }
      }
    }),
    saveTemporary: vi.fn()
  } as TimelineApi
}
function mockApi(overrides: Partial<ProviderApi> = {}): ProviderApi {
  return {
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
  } as ProviderApi
}

describe('ProviderPanel security and receiver routing', () => {
  it('shows the bound execution receiver instead of the settings selection', async () => {
    render(
      <ProviderPanel
        assistantSnapshot={assistantSnapshot}
        api={mockApi()}
        timelineApi={mockTimelineApi()}
      />
    )
    expect(
      await screen.findByText('实际接收方：Bound receiver · https://bound.example/v1 · safe-model')
    ).toBeInTheDocument()
    expect(screen.getByLabelText('正在编辑')).toHaveValue(editingId)
  })

  it('renders a remote response as text without creating injected markup', async () => {
    const hostile = '<img src=x onerror=alert(1)>'
    let capturedRequestId = ''
    const startChat = vi.fn(async (input: StartChatInput) => {
      capturedRequestId = input.requestId
      return {
        ok: true as const,
        data: {
          requestId: input.requestId,
          assistantId: input.assistantId,
          status: 'completed' as const,
          text: hostile,
          usage: null
        }
      }
    })
    render(
      <ProviderPanel
        assistantSnapshot={assistantSnapshot}
        api={mockApi({ startChat })}
        timelineApi={mockTimelineApi(hostile, () => capturedRequestId)}
      />
    )
    await screen.findByText(/实际接收方：Bound receiver/)
    fireEvent.change(screen.getByLabelText('正常消息'), { target: { value: 'synthetic request' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    expect(await screen.findByText(hostile)).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
    expect(startChat).toHaveBeenCalledTimes(1)
  })
})
