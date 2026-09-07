// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/renderer/src/App'
import type { AssistantApi, AssistantSnapshot } from '../../src/shared/assistant-contract'
import { backgroundApi013Defaults } from './background-api-fixture'
import { dailyApiDefaults, dailyAssistantA, operationsApiDefaults } from './daily-api-fixture'
import { itemApi010Defaults } from './item-api-fixture'
import { memoryApi008Defaults } from './memory-api-fixture'
import { providerApi007Defaults } from './provider-api-fixture'
import { reminderApi012Defaults } from './reminder-api-fixture'
import { stewardApi013Defaults, stewardSnapshot } from './steward-api-fixture'
import { timelineApi006Defaults } from './timeline-api-fixture'

afterEach(cleanup)

describe('App daily navigation', () => {
  it('opens the first-class six-category 日常与运行 entry', async () => {
    const snapshot: AssistantSnapshot = {
      assistants: [
        {
          id: dailyAssistantA,
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
      currentAssistantId: dailyAssistantA,
      primaryAssistantId: dailyAssistantA,
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
    const daily = dailyApiDefaults()
    Object.defineProperty(window, 'mashiro', {
      configurable: true,
      value: {
        assistants,
        provider: {
          ...providerApi007Defaults(),
          list: vi.fn(async () => ({ ok: true as const, data: { connections: [], bindings: [] } })),
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
        steward: stewardApi013Defaults(stewardSnapshot(dailyAssistantA)),
        daily,
        operations: operationsApiDefaults()
      }
    })

    render(<App />)
    fireEvent.click(await screen.findByRole('tab', { name: '日常与运行' }))
    expect(screen.getByRole('tab', { name: '日常与运行' })).toHaveAttribute('aria-selected', 'true')
    const panel = screen.getByRole('region', { name: '日常与运行' })
    expect(panel).toBeVisible()
    for (const name of ['观察', '每日简报', '晚间复盘', '周规划', '期限与变更', '运行与用量']) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument()
    }
    await waitFor(() =>
      expect(daily.query).toHaveBeenCalledWith(
        expect.objectContaining({ assistantId: dailyAssistantA, view: 'reports' })
      )
    )
  })
})
