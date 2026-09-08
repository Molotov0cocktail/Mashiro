// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ProviderPanel } from '../../src/renderer/src/features/provider/ProviderPanel'
import { providerApi007Defaults } from './provider-api-fixture'
import { timelineApi006Defaults } from './timeline-api-fixture'
import type { AssistantSnapshot } from '../../src/shared/assistant-contract'
import type {
  ProviderApi,
  ProviderChatResult,
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

it('keeps one live request and both drafts while settings and another page hide chat', async () => {
  let complete: ((result: ProviderChatResult) => void) | undefined
  const startChat = vi.fn(
    (_input: StartChatInput) =>
      new Promise<ProviderChatResult>((resolve) => {
        void _input
        complete = resolve
      })
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
    onEvent: vi.fn(() => () => undefined)
  } as ProviderApi
  const timelineApi = mockTimelineApi()
  const snapshot = assistants(assistantA)
  const page = (surface: 'chat' | 'settings', hidden = false) => (
    <section hidden={hidden}>
      <ProviderPanel
        assistantSnapshot={snapshot}
        api={api}
        timelineApi={timelineApi}
        surface={surface}
      />
    </section>
  )
  const view = render(page('chat'))
  await screen.findByText(/实际接收方：Receiver/)
  fireEvent.change(screen.getByLabelText('正常消息'), { target: { value: 'first request' } })
  fireEvent.click(screen.getByRole('button', { name: '发送' }))
  fireEvent.change(screen.getByLabelText('正常消息'), { target: { value: 'next unsent draft' } })
  view.rerender(page('settings'))
  fireEvent.change(screen.getByLabelText('连接名称'), {
    target: { value: 'unsaved connection name' }
  })
  expect(screen.getByLabelText('正常消息')).not.toBeVisible()
  view.rerender(page('chat', true))
  const input = startChat.mock.calls[0]![0]
  await act(async () =>
    complete!({
      ok: true,
      data: {
        requestId: input.requestId,
        assistantId: assistantA,
        status: 'completed',
        text: 'answer while hidden',
        usage: null
      }
    })
  )
  view.rerender(page('chat'))
  expect(screen.getByText('answer while hidden')).toBeVisible()
  expect(screen.getByLabelText('正常消息')).toHaveValue('next unsent draft')
  view.rerender(page('settings'))
  expect(screen.getByLabelText('连接名称')).toHaveValue('unsaved connection name')
  expect(startChat).toHaveBeenCalledOnce()
  expect(api.cancelChat).not.toHaveBeenCalled()
  expect(api.saveConnection).not.toHaveBeenCalled()
  expect(api.onEvent).toHaveBeenCalledOnce()
})
