// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/renderer/src/App'
import type { AssistantApi, AssistantSnapshot } from '../../src/shared/assistant-contract'
import { backgroundApi013Defaults } from './background-api-fixture'
import { itemApi010Defaults } from './item-api-fixture'
import { memoryApi008Defaults } from './memory-api-fixture'
import { providerApi007Defaults } from './provider-api-fixture'
import { reminderApi012Defaults } from './reminder-api-fixture'
import { stewardApi013Defaults, stewardAssistantA, stewardSnapshot } from './steward-api-fixture'
import { timelineApi006Defaults } from './timeline-api-fixture'

afterEach(cleanup)

describe('App steward navigation', () => {
  it('opens the memory organizer for the current assistant and cross-assistant work', async () => {
    const snapshot: AssistantSnapshot = {
      assistants: [
        {
          id: stewardAssistantA,
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
      currentAssistantId: stewardAssistantA,
      primaryAssistantId: stewardAssistantA,
      stateRevision: 1
    }
    const assistants = {
      list: vi.fn(async () => ({ ok: true as const, data: snapshot })),
      switch: vi.fn(),
      create: vi.fn(),
      rename: vi.fn(),
      setPrimary: vi.fn(),
      archive: vi.fn()
    } as AssistantApi
    const steward = stewardApi013Defaults(stewardSnapshot(stewardAssistantA))
    Object.defineProperty(window, 'mashiro', {
      configurable: true,
      value: {
        assistants,
        provider: {
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
        },
        timeline: timelineApi006Defaults(),
        memory: memoryApi008Defaults(),
        items: itemApi010Defaults(),
        reminders: reminderApi012Defaults(),
        background: backgroundApi013Defaults(),
        steward
      }
    })

    render(<App />)
    await waitFor(() =>
      expect(steward.query).toHaveBeenCalledWith({
        protocolVersion: 1,
        assistantId: stewardAssistantA,
        cursor: 0
      })
    )
    fireEvent.click(screen.getByRole('button', { name: '自动工作' }))
    fireEvent.click(screen.getByRole('button', { name: '记忆整理' }))
    expect(screen.getByRole('button', { name: '记忆整理' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('region', { name: '记忆整理' })).toBeVisible()
    expect(screen.getByRole('region', { name: '当前助手的新内容发现' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '全局记忆整理设置' })).toBeInTheDocument()
  })
})
