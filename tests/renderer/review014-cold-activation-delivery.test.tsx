// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { App } from '../../src/renderer/src/App'
import type { AssistantResult } from '../../src/shared/assistant-contract'
import type {
  ReminderChanged,
  ReminderNavigationDelivery
} from '../../src/shared/reminder-contract'
vi.mock('../../src/renderer/src/features/provider/ProviderPanel', () => ({
  ProviderPanel: ({ itemTarget }: { itemTarget: { id: string } | null }) => (
    <p data-testid="provider-item-context">{itemTarget?.id ?? 'none'}</p>
  )
}))
vi.mock('../../src/renderer/src/features/items/ItemPanel', () => ({
  ItemPanel: ({ openItemTarget }: { openItemTarget: { id: string; nonce: number } | null }) => (
    <>
      <p data-testid="activation-target">{openItemTarget?.id ?? 'none'}</p>
      <p data-testid="activation-nonce">{openItemTarget?.nonce ?? 0}</p>
    </>
  )
}))
vi.mock('../../src/renderer/src/features/reminders/ReminderPanel', () => ({
  ReminderPanel: () => null
}))
vi.mock('../../src/renderer/src/features/memory/MemoryPanel', () => ({ MemoryPanel: () => null }))
vi.mock('../../src/renderer/src/features/retention/RetentionPanel', () => ({
  RetentionPanel: () => null
}))
vi.mock('../../src/renderer/src/features/background/BackgroundPanel', () => ({
  BackgroundPanel: () => null
}))
vi.mock('../../src/renderer/src/features/daily/DailyPanel', () => ({ DailyPanel: () => null }))
vi.mock('../../src/renderer/src/features/steward/StewardPanel', () => ({
  StewardPanel: () => null
}))

afterEach(cleanup)
function fixture(options: { deferPending?: boolean; initialPending?: boolean } = {}) {
  const assistantId = '00000000-0000-4000-8000-000000000001'
  const itemId = '00000000-0000-4000-8000-000000000002'
  const pulledItemId = '00000000-0000-4000-8000-000000000005'
  const snapshot: AssistantResult = {
    ok: true,
    data: {
      currentAssistantId: assistantId,
      primaryAssistantId: assistantId,
      stateRevision: 1,
      assistants: [
        {
          id: assistantId,
          displayName: '合成慢加载助手',
          persona: '',
          avatarKey: 'mashiro',
          isArchived: false,
          version: 1,
          archivedAt: null,
          createdAt: '2030-01-01T00:00:00Z',
          updatedAt: '2030-01-01T00:00:00Z'
        }
      ]
    }
  }
  const listeners = new Set<(event: ReminderChanged) => void>()
  const pulledDeliveryId = '00000000-0000-4000-8000-000000000003'
  const liveDeliveryId = options.initialPending
    ? '00000000-0000-4000-8000-000000000004'
    : pulledDeliveryId
  let pendingNavigation: ReminderNavigationDelivery | null = options.initialPending
    ? {
        kind: 'open-item',
        itemId: pulledItemId,
        deliveryId: pulledDeliveryId,
        assistantId,
        assistantRevision: 1
      }
    : null
  let resolveSnapshot!: (value: AssistantResult) => void
  const pending = new Promise<AssistantResult>((resolve) => {
    resolveSnapshot = resolve
  })
  const onChanged = vi.fn((listener: (event: ReminderChanged) => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  })
  let resolvePending: (() => void) | null = null
  let deferredPendingResponse: ReminderNavigationDelivery | null = null
  const pendingNavigationApi = vi.fn(() => {
    if (!options.deferPending)
      return Promise.resolve({ ok: true as const, data: pendingNavigation })
    deferredPendingResponse = pendingNavigation
    return new Promise<{
      ok: true
      data: ReminderNavigationDelivery | null
    }>((resolve) => {
      resolvePending = () => resolve({ ok: true, data: deferredPendingResponse })
    })
  })
  const ackNavigation = vi.fn(async (input: { deliveryId: string }) => {
    const acknowledged = pendingNavigation?.deliveryId === input.deliveryId
    if (acknowledged) pendingNavigation = null
    return {
      ok: true as const,
      data: { deliveryId: input.deliveryId, acknowledged }
    }
  })
  Object.defineProperty(window, 'mashiro', {
    configurable: true,
    value: {
      assistants: { list: vi.fn(() => pending) },
      reminders: { onChanged, pendingNavigation: pendingNavigationApi, ackNavigation }
    }
  })
  return {
    listeners,
    itemId,
    ackNavigation,
    emit: () => {
      const event: ReminderChanged = {
        kind: 'open-item',
        itemId,
        deliveryId: liveDeliveryId,
        assistantId,
        assistantRevision: 1
      }
      pendingNavigation = {
        kind: 'open-item',
        itemId,
        deliveryId: liveDeliveryId,
        assistantId,
        assistantRevision: 1
      }
      if (options.deferPending && !deferredPendingResponse)
        deferredPendingResponse = pendingNavigation
      listeners.forEach((listener) => listener(event))
    },
    resolve: () => resolveSnapshot(snapshot),
    resolvePending: () => {
      if (!resolvePending) throw new Error('PENDING_REQUEST_NOT_STARTED')
      resolvePending()
    }
  }
}

it('warm activation reaches the App item target after assistant initialization', async () => {
  const f = fixture()
  render(<App />)
  await act(async () => f.resolve())
  await waitFor(() => expect(f.listeners.size).toBe(1))
  act(() => f.emit())
  expect(screen.getByTestId('activation-target')).toHaveTextContent(f.itemId)
  expect(screen.getByRole('region', { name: '事项页面' })).toBeVisible()
  expect(screen.getByTestId('provider-item-context')).toHaveTextContent('none')
  await waitFor(() => expect(f.ackNavigation).toHaveBeenCalledTimes(1))
})

it('cold activation during slow initial assistants load is delivered after initialization', async () => {
  const f = fixture()
  render(<App />)
  expect(f.listeners.size).toBe(0)
  act(() => f.emit())
  await act(async () => f.resolve())
  await waitFor(() => expect(f.listeners.size).toBe(1))
  expect(screen.getByTestId('activation-target')).toHaveTextContent(f.itemId)
  expect(screen.getByRole('region', { name: '事项页面' })).toBeVisible()
  expect(screen.getByTestId('provider-item-context')).toHaveTextContent('none')
  await waitFor(() => expect(f.ackNavigation).toHaveBeenCalledTimes(1))
})

it('listener delivery wins once when the pending pull returns the same delivery later', async () => {
  const f = fixture({ deferPending: true })
  render(<App />)
  await act(async () => f.resolve())
  await waitFor(() => expect(f.listeners.size).toBe(1))
  act(() => f.emit())
  expect(screen.getByTestId('activation-target')).toHaveTextContent(f.itemId)
  expect(screen.getByTestId('activation-nonce')).toHaveTextContent('1')
  await act(async () => f.resolvePending())
  await waitFor(() => expect(f.ackNavigation).toHaveBeenCalledTimes(1))
  expect(screen.getByTestId('activation-target')).toHaveTextContent(f.itemId)
  expect(screen.getByTestId('activation-nonce')).toHaveTextContent('1')
})
it('a newer live delivery prevents an older delayed pending reply from replacing the route', async () => {
  const f = fixture({ deferPending: true, initialPending: true })
  render(<App />)
  await act(async () => f.resolve())
  await waitFor(() => expect(f.listeners.size).toBe(1))
  act(() => f.emit())
  expect(screen.getByTestId('activation-target')).toHaveTextContent(f.itemId)
  expect(screen.getByTestId('activation-nonce')).toHaveTextContent('1')
  await act(async () => f.resolvePending())
  await waitFor(() => expect(f.ackNavigation).toHaveBeenCalledTimes(1))
  expect(screen.getByTestId('activation-target')).toHaveTextContent(f.itemId)
  expect(screen.getByTestId('activation-nonce')).toHaveTextContent('1')
})
