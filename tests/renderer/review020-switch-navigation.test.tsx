// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { retentionPolicyApi009Defaults } from './retention-api-fixture'
import type { RetentionChanged } from '../../src/shared/retention-contract'
import { App } from '../../src/renderer/src/App'
import { providerApi007Defaults } from './provider-api-fixture'
import { memoryApi008Defaults } from './memory-api-fixture'
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

afterEach(cleanup)

it('keeps a successful assistant switch synchronized when the user navigates before its reply', async () => {
  let finishSwitch!: (value: Awaited<ReturnType<AssistantApi['switch']>>) => void
  const assistantApi = {
    list: vi.fn().mockResolvedValue({ ok: true, data: assistants(assistantA, 2) }),
    switch: vi.fn<AssistantApi['switch']>(
      () =>
        new Promise((resolve) => {
          finishSwitch = resolve
        })
    ),
    create: vi.fn(),
    rename: vi.fn(),
    setPrimary: vi.fn(),
    archive: vi.fn()
  } as AssistantApi
  const providerApi = {
    ...providerApi007Defaults(),
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
    value: {
      assistants: assistantApi,
      memory: memoryApi008Defaults(),
      provider: providerApi,
      timeline: timelineApi
    }
  })

  render(<App />)
  expect(screen.getByRole('button', { name: '对话' })).toHaveAttribute('aria-current', 'page')
  expect(document.querySelector("section[aria-label='记忆与事件页面']")).not.toBeVisible()
  const assistantSettings = document.querySelector("section[aria-label='助手与人设设置']")
  expect(assistantSettings).not.toBeVisible()
  expect(await screen.findByText(/实际接收方：Receiver A/)).toBeInTheDocument()
  const shellSwitcher = document.querySelector('.assistant-switcher select')
  expect(shellSwitcher).toHaveValue(assistantA)
  fireEvent.change(shellSwitcher!, { target: { value: assistantB } })
  fireEvent.click(screen.getByRole('button', { name: '记忆' }))
  await act(async () => finishSwitch({ ok: true, data: assistants(assistantB, 3) }))
  expect(screen.getByRole('button', { name: '记忆' })).toHaveAttribute('aria-current', 'page')
  await waitFor(() => expect(shellSwitcher).toHaveValue(assistantB))
  expect(screen.getByText(/实际接收方：Receiver B/)).toBeInTheDocument()
  expect(shellSwitcher).toHaveValue(assistantB)
  expect(assistantApi.switch).toHaveBeenCalledTimes(1)
})

it('does not revive a switched assistant after a newer purge snapshot', async () => {
  let finishSwitch!: (value: Awaited<ReturnType<AssistantApi['switch']>>) => void
  let emitRetention!: (event: RetentionChanged) => void
  const retention = {
    ...retentionPolicyApi009Defaults(),
    onChanged: vi.fn((listener: (event: RetentionChanged) => void) => {
      emitRetention = listener
      return () => undefined
    })
  }
  const assistantApi = {
    list: vi.fn().mockResolvedValue({ ok: true, data: assistants(assistantA, 2) }),
    switch: vi.fn<AssistantApi['switch']>(
      () =>
        new Promise((resolve) => {
          finishSwitch = resolve
        })
    ),
    create: vi.fn(),
    rename: vi.fn(),
    setPrimary: vi.fn(),
    archive: vi.fn()
  } as AssistantApi
  const providerApi = {
    ...providerApi007Defaults(),
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
    value: {
      retention,
      assistants: assistantApi,
      memory: memoryApi008Defaults(),
      provider: providerApi,
      timeline: timelineApi
    }
  })

  render(<App />)
  expect(screen.getByRole('button', { name: '对话' })).toHaveAttribute('aria-current', 'page')
  expect(document.querySelector("section[aria-label='记忆与事件页面']")).not.toBeVisible()
  const assistantSettings = document.querySelector("section[aria-label='助手与人设设置']")
  expect(assistantSettings).not.toBeVisible()
  expect(await screen.findByText(/实际接收方：Receiver A/)).toBeInTheDocument()
  const shellSwitcher = document.querySelector('.assistant-switcher select')
  expect(shellSwitcher).toHaveValue(assistantA)
  fireEvent.change(shellSwitcher!, { target: { value: assistantB } })
  vi.mocked(assistantApi.list).mockResolvedValue({
    ok: true,
    data: { assistants: [], currentAssistantId: null, primaryAssistantId: null, stateRevision: 4 }
  })
  await act(async () =>
    emitRetention({
      epoch: 4,
      reason: 'purge',
      assistantIds: [assistantA, assistantB],
      memoryIds: [],
      requestIds: []
    })
  )
  await waitFor(() => expect(shellSwitcher).toHaveValue(''))
  await act(async () => finishSwitch({ ok: true, data: assistants(assistantB, 3) }))
  expect(shellSwitcher).toHaveValue('')
  expect(screen.queryByText(/实际接收方：Receiver B/)).not.toBeInTheDocument()
})
