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

it('an old pending reply cannot revive after same assistant returns with a newer state revision', async () => {
  let resolveOld!: (value: { ok: true; data: ReminderNavigationDelivery }) => void
  const oldPull = new Promise<{ ok: true; data: ReminderNavigationDelivery }>((resolve) => {
    resolveOld = resolve
  })
  const pendingNavigation = vi
    .fn()
    .mockImplementationOnce(() => oldPull)
    .mockResolvedValue({ ok: true, data: null })
  const ackNavigation = vi.fn(async (input: { deliveryId: string }) => ({
    ok: true as const,
    data: { deliveryId: input.deliveryId, acknowledged: false }
  }))
  Object.defineProperty(window, 'mashiro', {
    configurable: true,
    value: { reminders: { onChanged: () => () => undefined, pendingNavigation, ackNavigation } }
  })
  render(<App />)
  fireEvent.click(screen.getByText('A revision 1'))
  await waitFor(() => expect(pendingNavigation).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByText('A after unseen B roundtrip'))
  await act(async () =>
    resolveOld({
      ok: true,
      data: {
        deliveryId: '00000000-0000-4000-8000-000000000003',
        assistantId,
        assistantRevision: 1,
        kind: 'open-item',
        itemId
      }
    })
  )
  expect(screen.getByTestId('review-generation-target')).toHaveTextContent('none')
})
