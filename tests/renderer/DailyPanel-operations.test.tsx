// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DailyPanel } from '../../src/renderer/src/features/daily/DailyPanel'
import type { AssistantSnapshot } from '../../src/shared/assistant-contract'
import type { OperationRow } from '../../src/shared/operations-contract'
import type { ProviderApi } from '../../src/shared/provider-contract'
import { dailyApiDefaults, dailyAssistantA, operationsApiDefaults } from './daily-api-fixture'
import { providerApi007Defaults } from './provider-api-fixture'

afterEach(cleanup)

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

const provider: ProviderApi = {
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

it('loads business records independently and sends their trusted owner to navigation', async () => {
  const operations = operationsApiDefaults()
  const row: OperationRow = {
    id: 'item:00000000-0000-4000-8000-000000003099',
    owner: {
      domain: 'item',
      id: '00000000-0000-4000-8000-000000003099',
      assistantId: dailyAssistantA
    },
    feature: 'tool-chain',
    state: 'FAILED',
    severity: 'ERROR',
    summary: '事项写入需要处理',
    firstAt: '2026-09-07T00:00:00.000Z',
    lastAt: '2026-09-07T00:01:00.000Z',
    count: 1,
    current: true,
    recoveredAt: null
  }
  operations.query = vi.fn(async (input) => ({
    ok: true as const,
    data: { view: input.view, rows: input.view === 'business' ? [row] : [], nextCursor: null }
  }))
  const onOpenOperationOwner = vi.fn()
  render(
    <DailyPanel
      assistantSnapshot={snapshot}
      api={dailyApiDefaults()}
      operationsApi={operations}
      providerApi={provider}
      onOpenOperationOwner={onOpenOperationOwner}
    />
  )

  fireEvent.click(await screen.findByRole('tab', { name: '运行与用量' }))
  fireEvent.click(screen.getByRole('tab', { name: '业务记录' }))
  expect(await screen.findByText('事项写入需要处理')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '打开所属功能或对象' }))
  expect(onOpenOperationOwner).toHaveBeenCalledWith(row)
  expect(operations.usage).not.toHaveBeenCalled()
})
