// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProviderPanel } from '../../src/renderer/src/features/provider/ProviderPanel'
import { providerApi007Defaults } from './provider-api-fixture'
import { timelineApi006Defaults } from './timeline-api-fixture'
import type { AssistantSnapshot } from '../../src/shared/assistant-contract'
import type {
  ProviderApi,
  ProviderChatResult,
  ProviderResult,
  ProviderEvent,
  ProviderSnapshot,
  StartChatInput
} from '../../src/shared/provider-contract'
import type { TimelineApi } from '../../src/shared/timeline-contract'

afterEach(cleanup)
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

function mockTimelineApi(): TimelineApi {
  const reads = new Map<string, number>()
  return {
    ...timelineApi006Defaults(),
    read: vi.fn(async (input) => {
      const key = input.assistantId + ':' + input.mode
      const count = (reads.get(key) ?? 0) + 1
      reads.set(key, count)
      if (count > 1) throw new Error('synthetic refresh failure')
      return {
        ok: true as const,
        data: { assistantId: input.assistantId, mode: input.mode, messages: [], hasMore: false }
      }
    }),
    saveTemporary: vi.fn()
  } as TimelineApi
}

describe('ProviderPanel late response routing', () => {
  it('retains the captured assistant transcript when clear fails after a switch', async () => {
    let resolveClear: ((result: ProviderResult) => void) | undefined
    const clearChat = vi.fn(
      () => new Promise<ProviderResult>((resolve) => (resolveClear = resolve))
    )
    const api = {
      ...providerApi007Defaults(),
      list: vi.fn().mockResolvedValue({ ok: true, data: providerSnapshot }),
      saveConnection: vi.fn(),
      setCredential: vi.fn(),
      deleteCredential: vi.fn(),
      bindAssistant: vi.fn(),
      clearChat,
      startChat: vi.fn(async (input: StartChatInput) => ({
        ok: true as const,
        data: {
          requestId: input.requestId,
          assistantId: input.assistantId,
          status: 'completed' as const,
          text: 'answer A',
          usage: null
        }
      })),
      cancelChat: vi.fn(),
      onEvent: vi.fn(() => () => undefined)
    } as ProviderApi
    const timelineApi = mockTimelineApi()
    const view = render(
      <ProviderPanel
        assistantSnapshot={assistants(assistantA)}
        api={api}
        timelineApi={timelineApi}
      />
    )
    await screen.findByText(/实际接收方：Receiver/)
    fireEvent.click(screen.getByRole('radio', { name: '严格临时（不自动保存）' }))
    fireEvent.change(screen.getByLabelText('临时消息'), { target: { value: 'question A' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    expect(await screen.findByText('answer A')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '清空本助手的临时会话' }))
    view.rerender(
      <ProviderPanel
        assistantSnapshot={assistants(assistantB)}
        api={api}
        timelineApi={timelineApi}
      />
    )
    await act(async () => {
      resolveClear?.({
        ok: false,
        error: {
          code: 'STORAGE_UNAVAILABLE',
          message: 'Storage unavailable',
          correlationId: 'clear-failure',
          retryable: true
        }
      })
    })
    expect(screen.queryByText('answer A')).not.toBeInTheDocument()
    view.rerender(
      <ProviderPanel
        assistantSnapshot={assistants(assistantA)}
        api={api}
        timelineApi={timelineApi}
      />
    )
    expect(screen.getByText('answer A')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('本地时间线或 Provider 设置暂时无法读取')
  })
  it('keeps an old A promise on its request after A to B to A and a newer request', async () => {
    let listener: ((event: ProviderEvent) => void) | undefined
    const pending = new Map<string, (result: ProviderChatResult) => void>()
    const startChat = vi.fn(
      (input: StartChatInput) =>
        new Promise<ProviderChatResult>((resolve) => pending.set(input.requestId, resolve))
    )
    const api = {
      ...providerApi007Defaults(),
      list: vi.fn().mockResolvedValue({ ok: true, data: providerSnapshot }),
      saveConnection: vi.fn(),
      setCredential: vi.fn(),
      deleteCredential: vi.fn(),
      bindAssistant: vi.fn(),
      clearChat: vi.fn(),
      startChat,
      cancelChat: vi.fn(),
      onEvent: vi.fn((value: (event: ProviderEvent) => void) => {
        listener = value
        return () => undefined
      })
    } as ProviderApi
    const timelineApi = mockTimelineApi()
    const view = render(
      <ProviderPanel
        assistantSnapshot={assistants(assistantA)}
        api={api}
        timelineApi={timelineApi}
      />
    )
    await screen.findByText(/实际接收方：Receiver/)

    fireEvent.change(screen.getByLabelText('正常消息'), { target: { value: 'old A' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    const oldInput = startChat.mock.calls[0]![0]
    act(() =>
      listener?.({ type: 'cancelled', requestId: oldInput.requestId, assistantId: assistantA })
    )

    view.rerender(
      <ProviderPanel
        assistantSnapshot={assistants(assistantB)}
        api={api}
        timelineApi={timelineApi}
      />
    )
    expect(screen.getByLabelText('当前助手')).toHaveValue(assistantB)
    view.rerender(
      <ProviderPanel
        assistantSnapshot={assistants(assistantA)}
        api={api}
        timelineApi={timelineApi}
      />
    )
    fireEvent.change(screen.getByLabelText('正常消息'), { target: { value: 'new A' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    const newInput = startChat.mock.calls[1]![0]

    await act(async () => {
      pending.get(newInput.requestId)?.({
        ok: true,
        data: {
          requestId: newInput.requestId,
          assistantId: assistantA,
          status: 'completed',
          text: 'new answer',
          usage: null
        }
      })
    })
    expect(screen.getByText('new answer')).toBeInTheDocument()

    await act(async () => {
      pending.get(oldInput.requestId)?.({
        ok: true,
        data: {
          requestId: oldInput.requestId,
          assistantId: assistantA,
          status: 'completed',
          text: 'old answer',
          usage: null
        }
      })
    })
    expect(screen.getByText('new answer')).toBeInTheDocument()
    expect(screen.getByText('old answer')).toBeInTheDocument()
    expect(startChat).toHaveBeenCalledTimes(2)
  })
})
