// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DailyPanel } from '../../src/renderer/src/features/daily/DailyPanel'
import type { AssistantSnapshot } from '../../src/shared/assistant-contract'
import type { ProviderApi } from '../../src/shared/provider-contract'
import {
  dailyConfigureInputSchema,
  type DailyApi,
  type DailyChanged
} from '../../src/shared/daily-contract'
import { providerApi007Defaults } from './provider-api-fixture'
import { dailyApiDefaults, dailyAssistantA, operationsApiDefaults } from './daily-api-fixture'

it('sends only editable settings when saving an existing configuration through the strict trusted schema', async () => {
  const api = dailyApiDefaults()
  setup(api)
  await waitFor(() => expect(screen.getByLabelText('模型名称')).toHaveValue('daily-model'))
  fireEvent.click(screen.getByText('自动运行配置'))
  fireEvent.change(screen.getByLabelText('模型名称'), { target: { value: 'edited-model' } })
  fireEvent.click(screen.getByRole('button', { name: '保存配置' }))
  await waitFor(() => expect(api.configure).toHaveBeenCalledTimes(1))
  const input = vi.mocked(api.configure).mock.calls[0]![0]
  expect(dailyConfigureInputSchema.safeParse(input).success).toBe(true)
})

it('keeps an unsaved configuration draft when an ordinary job event reloads the same configuration version', async () => {
  const api = dailyApiDefaults()
  const originalQuery = api.query
  api.query = vi.fn(async (input) => structuredClone(await originalQuery(input)))
  let changed!: (value: DailyChanged) => void
  api.onChanged = vi.fn((listener) => {
    changed = listener
    return () => {}
  })
  setup(api)
  await waitFor(() => expect(screen.getByLabelText('模型名称')).toHaveValue('daily-model'))
  fireEvent.change(screen.getByLabelText('模型名称'), { target: { value: 'my-unsaved-model' } })
  await act(async () => {
    changed({
      revision: 5,
      assistantId: dailyAssistantA,
      feature: 'observation',
      id: null,
      version: null
    })
  })
  await waitFor(() => expect(api.query).toHaveBeenCalledTimes(6))
  expect(screen.getByLabelText('模型名称')).toHaveValue('my-unsaved-model')
})

afterEach(cleanup)
const snapshot: AssistantSnapshot = {
  assistants: [
    {
      id: dailyAssistantA,
      displayName: '合成助手',
      persona: '',
      avatarKey: 'mashiro',
      isArchived: false,
      createdAt: '2030-01-01T00:00:00Z',
      updatedAt: '2030-01-01T00:00:00Z',
      archivedAt: null,
      version: 1
    }
  ],
  currentAssistantId: dailyAssistantA,
  primaryAssistantId: dailyAssistantA,
  stateRevision: 1
}
function setup(daily: DailyApi = dailyApiDefaults()) {
  const operations = operationsApiDefaults()
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
    onEvent: vi.fn(() => () => {})
  }
  render(
    <DailyPanel
      assistantSnapshot={snapshot}
      api={daily}
      operationsApi={operations}
      providerApi={provider}
    />
  )
  return operations
}

it('exposes feature/provider/model/time filters and applies the feature to actual usage queries', async () => {
  const api = setup()
  fireEvent.click(screen.getByRole('tab', { name: '运行与用量' }))
  const region = screen.getByRole('region', { name: '运行状态与分类用量' })
  expect(within(region).getByLabelText(/功能筛选/)).toBeVisible()
  expect(within(region).getByLabelText(/连接筛选/)).toBeVisible()
  expect(within(region).getByLabelText(/模型筛选/)).toBeVisible()
  expect(within(region).getByLabelText(/开始时间/)).toBeVisible()
  expect(within(region).getByLabelText(/结束时间/)).toBeVisible()
  fireEvent.change(within(region).getByLabelText(/功能筛选/), { target: { value: 'daily-brief' } })
  fireEvent.click(within(region).getByRole('tab', { name: '分类用量' }))
  await waitFor(() =>
    expect(api.usage).toHaveBeenCalledWith(expect.objectContaining({ feature: 'daily-brief' }))
  )
})

it('offers the actual business-record view independently from usage totals', async () => {
  const api = setup()
  fireEvent.click(screen.getByRole('tab', { name: '运行与用量' }))
  fireEvent.click(screen.getByRole('tab', { name: '业务记录' }))
  await waitFor(() =>
    expect(api.query).toHaveBeenCalledWith(expect.objectContaining({ view: 'business' }))
  )
})
