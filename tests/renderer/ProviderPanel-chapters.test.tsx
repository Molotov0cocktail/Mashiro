// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProviderPanel } from '../../src/renderer/src/features/provider/ProviderPanel'
import type { AssistantSnapshot } from '../../src/shared/assistant-contract'
import type {
  ProviderApi,
  ProviderSnapshot,
  StartChatInput
} from '../../src/shared/provider-contract'
import type { TimelineApi } from '../../src/shared/timeline-contract'
import { backgroundChapterId } from './background-api-fixture'
import { providerApi007Defaults } from './provider-api-fixture'
import { timelineApi006Defaults } from './timeline-api-fixture'

afterEach(cleanup)

const assistantId = '00000000-0000-4000-8000-000000001301'
const connectionId = '00000000-0000-4000-8000-000000001303'

function assistants(): AssistantSnapshot {
  return {
    assistants: [
      {
        id: assistantId,
        displayName: 'Alpha',
        persona: '',
        avatarKey: 'mashiro',
        isArchived: false,
        createdAt: '2026-09-07T00:00:00.000Z',
        updatedAt: '2026-09-07T00:00:00.000Z',
        archivedAt: null,
        version: 1
      }
    ],
    currentAssistantId: assistantId,
    primaryAssistantId: assistantId,
    stateRevision: 1
  }
}

function providerSnapshot(): ProviderSnapshot {
  return {
    connections: [
      {
        id: connectionId,
        displayName: 'Synthetic receiver',
        baseUrl: 'https://example.com/v1',
        enabled: true,
        hasCredential: true,
        credentialPersistence: 'temporary',
        createdAt: '2026-09-07T00:00:00.000Z',
        updatedAt: '2026-09-07T00:00:00.000Z',
        version: 1
      }
    ],
    bindings: [
      {
        assistantId,
        connectionId,
        model: 'model-a',
        updatedAt: '2026-09-07T00:00:00.000Z',
        version: 1
      }
    ]
  }
}

function provider(startChat: ProviderApi['startChat']): ProviderApi {
  return {
    ...providerApi007Defaults(),
    list: vi.fn(async () => ({ ok: true as const, data: providerSnapshot() })),
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

function timeline(): TimelineApi {
  return {
    ...timelineApi006Defaults(),
    read: vi.fn(async (input) => ({
      ok: true as const,
      data: { assistantId: input.assistantId, mode: input.mode, messages: [], hasMore: false }
    })),
    query: vi.fn(async (input) => ({
      ok: true as const,
      data: { assistantId: input.assistantId, messages: [], nextCursor: null }
    })),
    permissions: vi.fn(async (input) => ({
      ok: true as const,
      data: {
        assistantId: input.assistantId,
        connectionId,
        endpointFingerprint: 'sha256:synthetic',
        endpointDisplay: 'https://example.com/v1',
        readHistory: true,
        sendHistory: true,
        version: 1
      }
    })),
    saveTemporary: vi.fn()
  } as TimelineApi
}

describe('ProviderPanel chapter context', () => {
  it('forces the selected accepted chapter versions into a normal chat request without substituting recent history', async () => {
    const startChat = vi.fn(async (input: StartChatInput) => ({
      ok: true as const,
      data: {
        requestId: input.requestId,
        assistantId: input.assistantId,
        status: 'completed' as const,
        text: '已结合章节回答',
        usage: null
      }
    }))
    render(
      <ProviderPanel
        assistantSnapshot={assistants()}
        api={provider(startChat)}
        timelineApi={timeline()}
        chapterContextTarget={{
          assistantId,
          chapters: [{ id: backgroundChapterId, expectedVersion: 3 }],
          nonce: 1
        }}
      />
    )

    expect(await screen.findByRole('region', { name: '当前章节上下文' })).toHaveTextContent(
      '1 个已接受章节'
    )
    expect(screen.getByRole('radio', { name: '已选章节（1 章）' })).toBeChecked()
    fireEvent.change(screen.getByLabelText('正常消息'), { target: { value: '接着讨论' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() => expect(startChat).toHaveBeenCalledTimes(1))
    expect(startChat.mock.calls[0]![0]).toMatchObject({
      assistantId,
      mode: 'normal',
      context: {
        kind: 'chapters',
        chapters: [{ id: backgroundChapterId, expectedVersion: 3 }]
      }
    })
  })
})
