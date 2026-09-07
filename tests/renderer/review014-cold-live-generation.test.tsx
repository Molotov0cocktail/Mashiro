// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { App } from '../../src/renderer/src/App'
import type { AssistantSnapshot } from '../../src/shared/assistant-contract'
import type { ReminderNavigationDelivery } from '../../src/shared/reminder-contract'

const assistantId = '00000000-0000-4000-8000-000000000001'
const itemId = '00000000-0000-4000-8000-000000000002'
function snapshot(stateRevision: number): AssistantSnapshot {
  return {
    currentAssistantId: assistantId,
    primaryAssistantId: assistantId,
    stateRevision,
    assistants: [
      {
        id: assistantId,
        displayName: '合成A',
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
vi.mock('../../src/renderer/src/features/assistants/AssistantPanel', () => ({
  AssistantPanel: ({ onSnapshot }: { onSnapshot: (value: AssistantSnapshot) => void }) => (
    <>
      <button onClick={() => onSnapshot(snapshot(1))}>A revision 1</button>
      <button onClick={() => onSnapshot(snapshot(3))}>A after unseen B roundtrip</button>
    </>
  )
}))
vi.mock('../../src/renderer/src/features/provider/ProviderPanel', () => ({
  ProviderPanel: () => null
}))
vi.mock('../../src/renderer/src/features/items/ItemPanel', () => ({
  ItemPanel: ({ openItemTarget }: { openItemTarget: { id: string } | null }) => (
    <p data-testid="review-generation-target">{openItemTarget?.id ?? 'none'}</p>
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
it('rejects an old-generation live event in the new listener, but accepts a current one', async () => {
  const listeners = new Set<(value: ReminderNavigationDelivery) => void>()
  const pendingNavigation = vi.fn(async () => ({ ok: true, data: null }))
  const ackNavigation = vi.fn(async (input: { deliveryId: string }) => ({
    ok: true as const,
    data: { deliveryId: input.deliveryId, acknowledged: true }
  }))
  Object.defineProperty(window, 'mashiro', {
    configurable: true,
    value: {
      reminders: {
        onChanged: (listener: (value: ReminderNavigationDelivery) => void) => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        pendingNavigation,
        ackNavigation
      }
    }
  })
  render(<App />)
  fireEvent.click(screen.getByText('A revision 1'))
  await waitFor(() => expect(pendingNavigation).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByText('A after unseen B roundtrip'))
  await waitFor(() => expect(pendingNavigation).toHaveBeenCalledTimes(2))
  const event: ReminderNavigationDelivery = {
    deliveryId: '00000000-0000-4000-8000-000000000004',
    assistantId,
    assistantRevision: 1,
    kind: 'open-item',
    itemId
  }
  act(() => listeners.forEach((listener) => listener(event)))
  expect(screen.getByTestId('review-generation-target')).toHaveTextContent('none')
  expect(ackNavigation).not.toHaveBeenCalled()
  act(() =>
    listeners.forEach((listener) =>
      listener({
        ...event,
        deliveryId: '00000000-0000-4000-8000-000000000005',
        assistantRevision: 3
      })
    )
  )
  expect(screen.getByTestId('review-generation-target')).toHaveTextContent(itemId)
  await waitFor(() => expect(ackNavigation).toHaveBeenCalledTimes(1))
})
