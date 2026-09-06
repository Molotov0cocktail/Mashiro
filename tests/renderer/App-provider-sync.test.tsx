// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../src/renderer/src/App'
import { timelineApi006Defaults } from './timeline-api-fixture'
import type { AssistantApi, AssistantSnapshot } from '../../src/shared/assistant-contract'
import type { ProviderApi, ProviderSnapshot } from '../../src/shared/provider-contract'
import type { TimelineApi } from '../../src/shared/timeline-contract'

const assistantA = '00000000-0000-4000-8000-000000000001'
const assistantB = '00000000-0000-4000-8000-000000000002'
function assistants(currentAssistantId: string, revision: number): AssistantSnapshot {
  return {
    assistants: [
      {
        id: assistantA,
        displayName: 'Alpha',
        isArchived: false,
        createdAt: '2026-09-06T00:00:00.000Z',
        updatedAt: '2026-09-06T00:00:00.000Z',
        archivedAt: null,
        version: 1
      },
      {
        id: assistantB,
        displayName: 'Beta',
        isArchived: false,
        createdAt: '2026-09-06T00:00:01.000Z',
        updatedAt: '2026-09-06T00:00:01.000Z',
        archivedAt: null,
        version: 1
      }
    ],
    currentAssistantId,
    primaryAssistantId: assistantA,
    stateRevision: revision
  }
}
const providerSnapshot: ProviderSnapshot = {
  connections: [
    {
      id: '00000000-0000-4000-8000-000000000011',
      displayName: 'Receiver A',
      baseUrl: 'https://a.example/v1',
      enabled: true,
      hasCredential: true,
      credentialPersistence: 'temporary',
      createdAt: '2026-09-06T00:00:00.000Z',
      updatedAt: '2026-09-06T00:00:00.000Z',
      version: 1
    },
    {
      id: '00000000-0000-4000-8000-000000000012',
      displayName: 'Receiver B',
      baseUrl: 'https://b.example/v1',
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
      assistantId: assistantA,
      connectionId: '00000000-0000-4000-8000-000000000011',
      model: 'model-a',
      updatedAt: '2026-09-06T00:00:00.000Z',
      version: 1
    },
    {
      assistantId: assistantB,
      connectionId: '00000000-0000-4000-8000-000000000012',
      model: 'model-b',
      updatedAt: '2026-09-06T00:00:01.000Z',
      version: 1
    }
  ]
}

describe('App assistant and Provider synchronization', () => {
  it('updates the Provider assistant and execution receiver after the real switch action', async () => {
    const assistantApi = {
      list: vi.fn().mockResolvedValue({ ok: true, data: assistants(assistantA, 2) }),
      switch: vi.fn().mockResolvedValue({ ok: true, data: assistants(assistantB, 3) }),
      create: vi.fn(),
      rename: vi.fn(),
      setPrimary: vi.fn(),
      archive: vi.fn()
    } as AssistantApi
    const providerApi = {
      list: vi.fn().mockResolvedValue({ ok: true, data: providerSnapshot }),
      saveConnection: vi.fn(),
      setCredential: vi.fn(),
      deleteCredential: vi.fn(),
      bindAssistant: vi.fn(),
      clearChat: vi.fn(),
      startChat: vi.fn(),
      cancelChat: vi.fn(),
      onEvent: vi.fn(() => () => undefined)
    } as ProviderApi
    const timelineApi = {
      ...timelineApi006Defaults(),
      read: vi.fn(async (input) => ({
        ok: true as const,
        data: { assistantId: input.assistantId, mode: input.mode, messages: [], hasMore: false }
      })),
      saveTemporary: vi.fn()
    } as TimelineApi
    Object.defineProperty(window, 'mashiro', {
      configurable: true,
      value: { assistants: assistantApi, provider: providerApi, timeline: timelineApi }
    })

    render(<App />)
    expect(await screen.findByText(/实际接收方：Receiver A/)).toBeInTheDocument()
    const betaItem = screen.getByText('Beta').closest('li')
    if (!betaItem) throw new Error('Beta item missing')
    fireEvent.click(within(betaItem).getByRole('button', { name: '设为当前' }))
    expect(await screen.findByText(/实际接收方：Receiver B/)).toBeInTheDocument()
    expect(screen.getByLabelText('当前助手')).toHaveValue(assistantB)
    expect(assistantApi.switch).toHaveBeenCalledTimes(1)
  })
})
