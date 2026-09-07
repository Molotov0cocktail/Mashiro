// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { App } from '../../src/renderer/src/App'
import type { AssistantSnapshot } from '../../src/shared/assistant-contract'
import { memoryApi008Defaults } from './memory-api-fixture'

const assistantA = '00000000-0000-4000-8000-000000000001'
const assistantB = '00000000-0000-4000-8000-000000000002'
const objectId = '00000000-0000-4000-8000-000000000201'
function snapshot(currentAssistantId: string, stateRevision: number): AssistantSnapshot {
  return {
    currentAssistantId,
    primaryAssistantId: assistantA,
    stateRevision,
    assistants: [assistantA, assistantB].map((id) => ({
      id,
      displayName: id === assistantA ? 'Alpha' : 'Beta',
      persona: '',
      avatarKey: 'mashiro',
      isArchived: false,
      version: 1,
      archivedAt: null,
      createdAt: '2026-09-06T00:00:00.000Z',
      updatedAt: '2026-09-06T00:00:00.000Z'
    }))
  }
}
vi.mock('../../src/renderer/src/features/assistants/AssistantPanel', () => ({
  AssistantPanel: ({ onSnapshot }: { onSnapshot: (value: AssistantSnapshot) => void }) => (
    <div>
      <button onClick={() => onSnapshot(snapshot(assistantA, 1))}>Review initial A</button>
      <button onClick={() => onSnapshot(snapshot(assistantB, 2))}>Review switch B</button>
      <button onClick={() => onSnapshot(snapshot(assistantA, 3))}>Review return A</button>
    </div>
  )
}))
vi.mock('../../src/renderer/src/features/provider/ProviderPanel', () => ({
  ProviderPanel: ({
    onOpenMemory
  }: {
    onOpenMemory: (target: { assistantId: string; id: string }) => void
  }) => (
    <button onClick={() => onOpenMemory({ assistantId: assistantA, id: objectId })}>
      Review open memory
    </button>
  )
}))
afterEach(cleanup)

it('App must retire the old object target when switching away, even if the same assistant returns', async () => {
  const memory = memoryApi008Defaults()
  memory.inspect = vi.fn(async () => ({
    ok: false as const,
    error: { code: 'NOT_FOUND' as const, message: 'synthetic absent' }
  }))
  Object.defineProperty(window, 'mashiro', { configurable: true, value: { memory } })
  render(<App />)
  fireEvent.click(screen.getByText('Review initial A'))
  fireEvent.click(screen.getByText('Review open memory'))
  await waitFor(() => expect(memory.inspect).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByText('Review switch B'))
  await waitFor(() => expect(screen.getByText('当前助手：Beta')).toBeInTheDocument())
  fireEvent.click(screen.getByText('Review return A'))
  await waitFor(() => expect(screen.getByText('当前助手：Alpha')).toBeInTheDocument())
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(memory.inspect).toHaveBeenCalledTimes(1)
})

it('permission revocation retires the previous object target across the permission-keyed remount', async () => {
  const memory = memoryApi008Defaults()
  const originalPermissions = memory.permissions
  memory.permissions = vi.fn(async (input) => {
    const result = await originalPermissions(input)
    return result.ok ? { ...result, data: { ...result.data, read: true } } : result
  })
  memory.inspect = vi.fn(async () => ({
    ok: false as const,
    error: { code: 'NOT_FOUND' as const, message: 'synthetic absent' }
  }))
  Object.defineProperty(window, 'mashiro', { configurable: true, value: { memory } })
  render(<App />)
  fireEvent.click(screen.getByText('Review initial A'))
  fireEvent.click(screen.getByText('Review open memory'))
  await waitFor(() => expect(memory.inspect).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(screen.getAllByLabelText('允许助手读取')[0]).toBeChecked())
  fireEvent.click(screen.getAllByLabelText('允许助手读取')[0]!)
  await waitFor(() => expect(memory.setPermissions).toHaveBeenCalledTimes(1))
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(memory.inspect).toHaveBeenCalledTimes(1)
})
