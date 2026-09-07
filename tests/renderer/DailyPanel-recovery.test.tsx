// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DailyPanel } from '../../src/renderer/src/features/daily/DailyPanel'
import type { AssistantSnapshot } from '../../src/shared/assistant-contract'
import type { DailyApi } from '../../src/shared/daily-contract'
import type { ProviderApi } from '../../src/shared/provider-contract'
import { providerApi007Defaults } from './provider-api-fixture'
import {
  dailyApiDefaults,
  dailyAssistantA,
  dailyAssistantB,
  dailyReport,
  operationsApiDefaults
} from './daily-api-fixture'

afterEach(cleanup)

function snapshot(assistantId: string, name: string): AssistantSnapshot {
  return {
    assistants: [
      {
        id: assistantId,
        displayName: name,
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

function providerApi(): ProviderApi {
  return {
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
  }
}

describe('DailyPanel routing and recovery', () => {
  it('reuses the same run command after a lost receipt', async () => {
    const api = dailyApiDefaults()
    api.run = vi.fn(async () => {
      throw new Error('synthetic lost receipt')
    }) as DailyApi['run']
    render(
      <DailyPanel
        assistantSnapshot={snapshot(dailyAssistantA, 'Alpha')}
        api={api}
        operationsApi={operationsApiDefaults()}
        providerApi={providerApi()}
      />
    )

    const run = await screen.findByRole('button', { name: '立即运行' })
    fireEvent.click(run)
    expect(await screen.findByText(/运行回执未知/)).toBeVisible()
    fireEvent.click(run)
    await waitFor(() => expect(api.run).toHaveBeenCalledTimes(2))
    expect(vi.mocked(api.run).mock.calls[1]![0].commandId).toBe(
      vi.mocked(api.run).mock.calls[0]![0].commandId
    )
  })

  it('blocks an A report page that arrives after switching to B', async () => {
    let resolveA!: (value: Awaited<ReturnType<DailyApi['query']>>) => void
    const api = dailyApiDefaults()
    api.query = vi.fn((input) => {
      if (input.view === 'reports' && input.assistantId === dailyAssistantA)
        return new Promise((resolve) => {
          resolveA = resolve
        })
      return Promise.resolve({
        ok: true as const,
        data: {
          view: input.view,
          configurations: [],
          jobs: [],
          reports:
            input.view === 'reports'
              ? [
                  dailyReport({
                    assistantId: dailyAssistantB,
                    period: {
                      ...dailyReport().period,
                      localLabel: 'B 的当前报告'
                    }
                  })
                ]
              : [],
          nextCursor: null,
          attention: { unread: 0, currentFailures: 0 }
        }
      })
    }) as DailyApi['query']
    const view = render(
      <DailyPanel
        assistantSnapshot={snapshot(dailyAssistantA, 'Alpha')}
        api={api}
        operationsApi={operationsApiDefaults()}
        providerApi={providerApi()}
      />
    )
    await waitFor(() =>
      expect(api.query).toHaveBeenCalledWith(
        expect.objectContaining({ assistantId: dailyAssistantA, view: 'reports' })
      )
    )
    view.rerender(
      <DailyPanel
        assistantSnapshot={snapshot(dailyAssistantB, 'Beta')}
        api={api}
        operationsApi={operationsApiDefaults()}
        providerApi={providerApi()}
      />
    )
    expect(await screen.findByText('B 的当前报告')).toBeVisible()
    await act(async () => {
      resolveA({
        ok: true,
        data: {
          view: 'reports',
          configurations: [],
          jobs: [],
          reports: [
            dailyReport({ period: { ...dailyReport().period, localLabel: 'A 的迟到报告' } })
          ],
          nextCursor: null,
          attention: { unread: 1, currentFailures: 0 }
        }
      })
    })
    expect(screen.queryByText('A 的迟到报告')).not.toBeInTheDocument()
    expect(screen.getByText('B 的当前报告')).toBeVisible()
  })
})
