// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/renderer/src/App'
import type { AssistantApi, AssistantSnapshot } from '../../src/shared/assistant-contract'
import type { ReminderChanged } from '../../src/shared/reminder-contract'
import type { ProviderApi } from '../../src/shared/provider-contract'
import type { TimelineApi } from '../../src/shared/timeline-contract'
import { itemApi010Defaults, itemAssistantA, itemId } from './item-api-fixture'
import { memoryApi008Defaults } from './memory-api-fixture'
import { providerApi007Defaults } from './provider-api-fixture'
import { reminderApi012Defaults } from './reminder-api-fixture'
import { timelineApi006Defaults } from './timeline-api-fixture'

afterEach(cleanup)

function snapshot(): AssistantSnapshot {
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

describe('App reminder navigation', () => {
  it('opens merged reminders as a list and revalidates a single notification item before showing detail', async () => {
    let changed!: (event: ReminderChanged) => void
    const reminders = reminderApi012Defaults()
    reminders.onChanged = vi.fn((listener) => {
      changed = listener
      return () => undefined
    })
    const items = itemApi010Defaults()
    const provider = {
      ...providerApi007Defaults(),
      list: vi.fn(async () => ({
        ok: true as const,
        data: { connections: [], bindings: [] }
      })),
      saveConnection: vi.fn(),
      setCredential: vi.fn(),
      deleteCredential: vi.fn(),
      bindAssistant: vi.fn(),
      clearChat: vi.fn(),
      startChat: vi.fn(),
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
      saveTemporary: vi.fn()
    } as TimelineApi
    const assistantApi = {
      list: vi.fn(async () => ({ ok: true as const, data: snapshot() })),
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
        items,
        reminders
      }
    })

    render(<App />)
    await waitFor(() => expect(reminders.onChanged).toHaveBeenCalledTimes(1))
    await act(async () => changed({ kind: 'open-reminders', itemId: null }))
    expect(screen.getByRole('tab', { name: '提醒' })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByRole('region', { name: '提醒' })).toBeInTheDocument()

    await act(async () => changed({ kind: 'open-item', itemId }))
    expect(screen.getByRole('tab', { name: '事项' })).toHaveAttribute('aria-selected', 'true')
    await waitFor(() =>
      expect(items.inspect).toHaveBeenCalledWith({
        protocolVersion: 1,
        assistantId: itemAssistantA,
        id: itemId,
        type: 'item'
      })
    )
    expect(await screen.findByRole('region', { name: '事项详情' })).toHaveTextContent('周五交报告')
    expect(items.permissions).toHaveBeenCalledWith({
      protocolVersion: 1,
      assistantId: itemAssistantA
    })
  })
})
