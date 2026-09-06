// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AssistantPanel } from '../../../src/renderer/src/features/assistants/AssistantPanel'
import type { AssistantApi, AssistantSnapshot } from '../../../src/shared/assistant-contract'

const id = '00000000-0000-4000-8000-000000000001'
function snapshot(revision: number, present = true): AssistantSnapshot {
  return { assistants: present ? [{ id, displayName: '已删除私密身份', isArchived: false, createdAt: '2026-09-06T00:00:00.000Z', updatedAt: '2026-09-06T00:00:00.000Z', archivedAt: null, version: revision }] : [], currentAssistantId: present ? id : null, primaryAssistantId: present ? id : null, stateRevision: revision }
}
afterEach(cleanup)

it('review: late assistant-management mutation must not restore an identity after a newer external purge snapshot', async () => {
  let resolveRename!: (value: Awaited<ReturnType<AssistantApi['rename']>>) => void
  const api = { list: vi.fn(async () => ({ ok: true as const, data: snapshot(1) })), rename: vi.fn(() => new Promise((resolve) => { resolveRename = resolve })), create: vi.fn(), switch: vi.fn(), setPrimary: vi.fn(), archive: vi.fn() } as AssistantApi
  const view = render(<AssistantPanel api={api} externalSnapshot={snapshot(1)} />)
  await screen.findByText('已删除私密身份')
  fireEvent.click(screen.getByRole('button', { name: '保存名称' }))
  await waitFor(() => expect(api.rename).toHaveBeenCalledTimes(1))
  view.rerender(<AssistantPanel api={api} externalSnapshot={snapshot(3, false)} />)
  await waitFor(() => expect(screen.queryByText('已删除私密身份')).not.toBeInTheDocument())
  await act(async () => { resolveRename({ ok: true, data: snapshot(2) }); await Promise.resolve() })
  expect(screen.queryByText('已删除私密身份')).not.toBeInTheDocument()
})

import { App } from '../../../src/renderer/src/App'
import type { RetentionChanged } from '../../../src/shared/retention-contract'
vi.mock('../../../src/renderer/src/features/provider/ProviderPanel', () => ({ ProviderPanel: ({ assistantSnapshot, onLocateMemorySource }: { assistantSnapshot: AssistantSnapshot | null; onLocateMemorySource: (source: { assistantId: string; id: string }) => void }) => <><output data-testid="current-id">{assistantSnapshot?.currentAssistantId ?? 'none'}</output><button onClick={() => onLocateMemorySource({ assistantId: id, id: '00000000-0000-4000-8000-000000000099' })}>review-source</button></> }))
vi.mock('../../../src/renderer/src/features/memory/MemoryPanel', () => ({ MemoryPanel: () => null }))
vi.mock('../../../src/renderer/src/features/retention/RetentionPanel', () => ({ RetentionPanel: () => null }))

it('review: App rejects source-switch receipt arriving after purge', async () => {
  const b = '00000000-0000-4000-8000-000000000002'
  const old = snapshot(1)
  old.assistants.push({ ...old.assistants[0]!, id: b, displayName: '保留助手' })
  old.currentAssistantId = b
  old.primaryAssistantId = b
  const purged = { ...old, assistants: old.assistants.filter((entry) => entry.id === b), stateRevision: 3 }
  const switched = { ...old, currentAssistantId: id, stateRevision: 2 }
  let emit!: (event: RetentionChanged) => void
  let resolveSwitch!: (value: Awaited<ReturnType<AssistantApi['switch']>>) => void
  const api = { list: vi.fn().mockResolvedValueOnce({ ok: true, data: old }).mockResolvedValue({ ok: true, data: purged }), switch: vi.fn(() => new Promise((resolve) => { resolveSwitch = resolve })), create: vi.fn(), rename: vi.fn(), setPrimary: vi.fn(), archive: vi.fn() }
  Object.defineProperty(window, 'mashiro', { configurable: true, value: { assistants: api, retention: { onChanged: (listener: (event: RetentionChanged) => void) => { emit = listener; return () => undefined } } } })
  render(<App />)
  await waitFor(() => expect(screen.getByTestId('current-id')).toHaveTextContent(b))
  fireEvent.click(screen.getByRole('button', { name: 'review-source' }))
  await waitFor(() => expect(api.switch).toHaveBeenCalledTimes(1))
  await act(async () => { emit({ epoch: 3, assistantIds: [id,b], memoryIds: [], requestIds: [], reason: 'purge' }); await Promise.resolve() })
  await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2))
  await act(async () => { resolveSwitch({ ok: true, data: switched }); await Promise.resolve() })
  expect(screen.getByTestId('current-id')).toHaveTextContent(b)
  expect(screen.queryByText('已删除私密身份')).not.toBeInTheDocument()
})

it('review: selected memory trash must remain the explicit empty-trash target', async () => {
  const { RetentionPanel } = await vi.importActual<typeof import('../../../src/renderer/src/features/retention/RetentionPanel')>('../../../src/renderer/src/features/retention/RetentionPanel')
  const mid = '00000000-0000-4000-8000-000000000033'
  const api = { overview: vi.fn(async () => ({ ok: true, data: { epoch: 4, zones: [], managedFileBytes: 0, databaseBytes: 0, automaticPolicy: 'UNCONFIGURED' } })), jobs: vi.fn(async () => ({ ok: true, data: { jobs: [], nextCursor: null } })), preview: vi.fn(async () => ({ ok: false, error: { code: 'DEPENDENCY_BLOCKED', message: 'synthetic stop' } })) }
  const memory = { query: vi.fn(async () => ({ ok: true, data: { records: [{ id: mid, title: '待清空的记忆垃圾', markdown: '合成垃圾正文', objectVersion: 2, kind: 'continuity', scope: 'assistant', ownerAssistantId: id, retention: 'trash' }], nextCursor: null } })) }
  render(<RetentionPanel api={api as unknown as import('../../../src/shared/retention-contract').RetentionApi} memoryApi={memory as unknown as import('../../../src/shared/memory-contract').MemoryApi} assistantSnapshot={snapshot(1)} fallbackAssistantId={id} pendingCommands={new Map()} onRefreshAssistants={async () => undefined} />)
  fireEvent.click(await screen.findByRole('checkbox', { name: /选择“待清空的记忆垃圾”/ }))
  fireEvent.change(screen.getByLabelText('操作意图'), { target: { value: 'empty-trash' } })
  fireEvent.click(screen.getByRole('button', { name: '查看完整影响' }))
  await waitFor(() => expect(api.preview).toHaveBeenCalledTimes(1))
  expect(api.preview).toHaveBeenCalledWith({ protocolVersion: 1, assistantId: id, intent: 'empty-trash', target: { type: 'memories', objects: [{ id: mid, version: 2 }] } })
})
import { memoryApi008Defaults } from '../../../tests/renderer/memory-api-fixture'
import type { MemoryApi } from '../../../src/shared/memory-contract'
it('review: discarded late-success receipt retains retry identity across unrelated cleanup', async () => {
  const { MemoryPanel } = await vi.importActual<typeof import('../../../src/renderer/src/features/memory/MemoryPanel')>('../../../src/renderer/src/features/memory/MemoryPanel')
  const registry = new Map<string,string>()
  let finish!: (value: Awaited<ReturnType<MemoryApi['mutate']>>) => void
  const api = memoryApi008Defaults()
  api.mutate = vi.fn<MemoryApi['mutate']>().mockImplementationOnce(() => new Promise((resolve) => { finish = resolve })).mockRejectedValue(new Error('synthetic unknown'))
  const panel = (change?: RetentionChanged) => <MemoryPanel assistantId={id} assistantName="B" api={api} pendingCommands={registry} onLocateRound={() => undefined} retentionChange={change} />
  const view = render(panel())
  const fill = () => {
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '延迟成功标题' } })
    fireEvent.change(screen.getByLabelText('Markdown 正文'), { target: { value: '延迟成功正文' } })
    fireEvent.click(screen.getByRole('button', { name: '保存新记录' }))
  }
  fill()
  await waitFor(() => expect(api.mutate).toHaveBeenCalledTimes(1))
  const originalId = vi.mocked(api.mutate).mock.calls[0]![0].commandId
  view.rerender(panel({ epoch: 8, assistantIds: [id,'00000000-0000-4000-8000-000000000088'], memoryIds: [], requestIds: [], reason: 'cleanup' }))
  await waitFor(() => expect(screen.getByLabelText('标题')).toHaveValue(''))
  await act(async () => { finish({ ok: true, data: { operationId: originalId, objectId: '00000000-0000-4000-8000-000000000044', objectVersion: 1, state: 'SUCCEEDED', summary: '迟到成功不应展示', confirmationId: null } }); await Promise.resolve() })
  expect(screen.queryByText('迟到成功不应展示')).not.toBeInTheDocument()
  fill()
  await waitFor(() => expect(api.mutate).toHaveBeenCalledTimes(2))
  expect(vi.mocked(api.mutate).mock.calls[1]![0].commandId).toBe(originalId)
})