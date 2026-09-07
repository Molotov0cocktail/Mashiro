// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/renderer/src/App'
import type { AssistantApi, AssistantSnapshot } from '../../src/shared/assistant-contract'
import type { ProviderApi, StartChatInput } from '../../src/shared/provider-contract'
import type { TimelineApi } from '../../src/shared/timeline-contract'
import {
  backgroundApi013Defaults,
  backgroundChapter,
  backgroundChapterId,
  backgroundConnectionA,
  backgroundSnapshot
} from './background-api-fixture'
import { itemApi010Defaults, itemAssistantA } from './item-api-fixture'
import { memoryApi008Defaults } from './memory-api-fixture'
import { providerApi007Defaults } from './provider-api-fixture'
import { reminderApi012Defaults } from './reminder-api-fixture'
import { timelineApi006Defaults } from './timeline-api-fixture'

afterEach(cleanup)

function assistants(): AssistantSnapshot {
  return {
    assistants: [
      {
        id: itemAssistantA,
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
    currentAssistantId: itemAssistantA,
    primaryAssistantId: itemAssistantA,
    stateRevision: 1
  }
}

describe('App background navigation', () => {
  it('opens the first-class background page and carries selected chapter versions into chat', async () => {
    const chapter = backgroundChapter({ assistantId: itemAssistantA })
    const background = backgroundApi013Defaults(
      backgroundSnapshot(itemAssistantA, { chapters: [chapter] })
    )
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
    const provider = {
      ...providerApi007Defaults(),
      list: vi.fn(async () => ({
        ok: true as const,
        data: {
          connections: [
            {
              id: backgroundConnectionA,
              displayName: 'Receiver',
              baseUrl: 'https://example.com/v1',
              enabled: true,
              hasCredential: true,
              credentialPersistence: 'temporary' as const,
              createdAt: '2026-09-07T00:00:00.000Z',
              updatedAt: '2026-09-07T00:00:00.000Z',
              version: 1
            }
          ],
          bindings: [
            {
              assistantId: itemAssistantA,
              connectionId: backgroundConnectionA,
              model: 'chat-model',
              updatedAt: '2026-09-07T00:00:00.000Z',
              version: 1
            }
          ]
        }
      })),
      saveConnection: vi.fn(),
      setCredential: vi.fn(),
      deleteCredential: vi.fn(),
      bindAssistant: vi.fn(),
      clearChat: vi.fn(),
      startChat,
      cancelChat: vi.fn(),
      onEvent: vi.fn(() => () => undefined)
    } as ProviderApi
    const timeline = {
      ...timelineApi006Defaults(),
      read: vi.fn(async (input) => ({
        ok: true as const,
        data: {
          assistantId: input.assistantId,
          mode: input.mode,
          messages: [],
          hasMore: false
        }
      })),
      query: vi.fn(async (input) => ({
        ok: true as const,
        data: { assistantId: input.assistantId, messages: [], nextCursor: null }
      })),
      saveTemporary: vi.fn()
    } as TimelineApi
    const assistantApi = {
      list: vi.fn(async () => ({ ok: true as const, data: assistants() })),
      switch: vi.fn(),
      create: vi.fn(),
      rename: vi.fn(),
      setPrimary: vi.fn(),
      archive: vi.fn()
    } as AssistantApi
    Object.defineProperty(window, 'mashiro', {
      configurable: true,
      value: {
        assistants: assistantApi,
        provider,
        timeline,
        memory: memoryApi008Defaults(),
        items: itemApi010Defaults(),
        reminders: reminderApi012Defaults(),
        background
      }
    })

    render(<App />)
    await waitFor(() =>
      expect(background.query).toHaveBeenCalledWith({
        protocolVersion: 1,
        assistantId: itemAssistantA,
        cursor: 0
      })
    )
    fireEvent.click(screen.getByRole('tab', { name: '章节后台' }))
    expect(screen.getByRole('tab', { name: '章节后台' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(await screen.findByRole('checkbox', { name: '选择章节：项目决策与后续' }))
    fireEvent.click(screen.getByRole('button', { name: '在对话中使用已选章节（1）' }))

    expect(screen.getByRole('tab', { name: '对话' })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByRole('region', { name: '当前章节上下文' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('正常消息'), { target: { value: '继续讨论' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(startChat).toHaveBeenCalledTimes(1))
    expect(startChat.mock.calls[0]![0]).toMatchObject({
      context: { kind: 'chapters', chapters: [{ id: backgroundChapterId, expectedVersion: 3 }] }
    })
  })
})
