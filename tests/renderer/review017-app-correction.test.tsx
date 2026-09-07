// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { App } from '../../src/renderer/src/App'
import { RoundMemoryPanel } from '../../src/renderer/src/features/provider/RoundMemoryPanel'
import type { AssistantSnapshot } from '../../src/shared/assistant-contract'
import type { MemoryApi, MemoryRecord } from '../../src/shared/memory-contract'
import { memoryApi008Defaults } from './memory-api-fixture'

const assistantId = '00000000-0000-4000-8000-000000000001'
const requestId = '00000000-0000-4000-8000-000000000101'
const objectId = '00000000-0000-4000-8000-000000000201'
vi.mock('../../src/renderer/src/features/assistants/AssistantPanel', () => ({
  AssistantPanel: ({ onSnapshot }: { onSnapshot: (value: AssistantSnapshot) => void }) => (
    <button
      onClick={() =>
        onSnapshot({
          currentAssistantId: assistantId,
          primaryAssistantId: assistantId,
          stateRevision: 1,
          assistants: [
            {
              id: assistantId,
              displayName: 'Alpha',
              persona: '',
              avatarKey: 'mashiro',
              isArchived: false,
              version: 1,
              archivedAt: null,
              createdAt: '2026-09-06T00:00:00.000Z',
              updatedAt: '2026-09-06T00:00:00.000Z'
            }
          ]
        })
      }
    >
      Review set A
    </button>
  )
}))
vi.mock('../../src/renderer/src/features/provider/ProviderPanel', () => ({
  ProviderPanel: ({
    memoryApi,
    memoryEvidenceRefreshKey,
    onOpenMemory
  }: {
    memoryApi: MemoryApi
    memoryEvidenceRefreshKey: number
    onOpenMemory: (target: { assistantId: string; id: string }) => void
  }) => (
    <RoundMemoryPanel
      assistantId={assistantId}
      requestId={requestId}
      mode="normal"
      api={memoryApi}
      refreshKey={memoryEvidenceRefreshKey}
      onOpenMemory={onOpenMemory}
    />
  )
}))
afterEach(cleanup)

it('real memory correction invalidates the hidden answer panel before returning to chat', async () => {
  let current: MemoryRecord = {
    id: objectId,
    objectVersion: 1,
    kind: 'user',
    scope: 'global',
    ownerAssistantId: assistantId,
    title: '独立纠正',
    markdown: 'REVIEW017_BEFORE_CORRECTION',
    nature: 'user-statement',
    event: null,
    state: 'active',
    retention: 'persistent',
    sources: [],
    createdAt: '2026-09-06T00:00:00.000Z',
    updatedAt: '2026-09-06T00:00:00.000Z'
  }
  const memory = memoryApi008Defaults()
  memory.round = vi.fn(async (input) => ({
    ok: true as const,
    data: {
      assistantId,
      requestId,
      evidenceCoverage: 'recorded-only' as const,
      nextCursor: null,
      entries:
        input.section === 'changes'
          ? []
          : [
              {
                kind: 'provided' as const,
                objectId,
                objectVersion: 1,
                availability:
                  current.objectVersion === 1 ? ('available' as const) : ('obsolete' as const),
                canInspect: true,
                record: current.objectVersion === 1 ? current : null,
                evidence: 'RESPONSE_OBSERVED' as const,
                dispatchedAt: null
              }
            ]
    }
  }))
  memory.query = vi.fn(async () => ({
    ok: true as const,
    data: { records: [current], nextCursor: null }
  }))
  memory.inspect = vi.fn(async () => ({
    ok: true as const,
    data: {
      record: current,
      changes: [],
      receipts: [],
      providedToRequests: [requestId],
      cleanupPending: false,
      organizationPending: false
    }
  }))
  memory.mutate = vi.fn(async () => {
    current = { ...current, objectVersion: 2, markdown: 'REVIEW017_AFTER_CORRECTION' }
    return {
      ok: true as const,
      data: {
        operationId: '00000000-0000-4000-8000-000000000301',
        objectId,
        objectVersion: 2,
        state: 'SUCCEEDED' as const,
        confirmationId: null,
        summary: '独立纠正已提交'
      }
    }
  })
  Object.defineProperty(window, 'mashiro', { configurable: true, value: { memory } })
  render(<App />)
  fireEvent.click(screen.getByText('Review set A'))
  fireEvent.click(screen.getByText('记忆来源与变更'))
  const conversation = screen.getByRole('region', { name: '对话页面' })
  await within(conversation).findByText('REVIEW017_BEFORE_CORRECTION')
  fireEvent.click(within(conversation).getByRole('button', { name: '打开记忆详情与操作' }))
  await screen.findByRole('heading', { name: '纠正当前版本' })
  fireEvent.change(screen.getByLabelText('Markdown 正文'), {
    target: { value: 'REVIEW017_AFTER_CORRECTION' }
  })
  fireEvent.click(screen.getByRole('button', { name: '保存纠正版本' }))
  await waitFor(() => expect(memory.mutate).toHaveBeenCalledTimes(1))
  await screen.findByRole('heading', { name: '当前记录 v2' })
  fireEvent.click(screen.getByRole('tab', { name: '对话' }))
  expect(within(conversation).queryByText('REVIEW017_BEFORE_CORRECTION')).not.toBeInTheDocument()
  expect(await within(conversation).findByText(/当时的 v1 已不可用/)).toBeInTheDocument()
})

it('a successful correction invalidates evidence even while follow-up local reads never settle', async () => {
  let current: MemoryRecord = {
    id: objectId,
    objectVersion: 1,
    kind: 'user',
    scope: 'global',
    ownerAssistantId: assistantId,
    title: '独立纠正',
    markdown: 'REVIEW017_BEFORE_CORRECTION',
    nature: 'user-statement',
    event: null,
    state: 'active',
    retention: 'persistent',
    sources: [],
    createdAt: '2026-09-06T00:00:00.000Z',
    updatedAt: '2026-09-06T00:00:00.000Z'
  }
  const memory = memoryApi008Defaults()
  memory.round = vi.fn(async (input) => ({
    ok: true as const,
    data: {
      assistantId,
      requestId,
      evidenceCoverage: 'recorded-only' as const,
      nextCursor: null,
      entries:
        input.section === 'changes'
          ? []
          : [
              {
                kind: 'provided' as const,
                objectId,
                objectVersion: 1,
                availability:
                  current.objectVersion === 1 ? ('available' as const) : ('obsolete' as const),
                canInspect: true,
                record: current.objectVersion === 1 ? current : null,
                evidence: 'RESPONSE_OBSERVED' as const,
                dispatchedAt: null
              }
            ]
    }
  }))
  memory.query = vi.fn(async () => ({
    ok: true as const,
    data: { records: [current], nextCursor: null }
  }))
  memory.inspect = vi.fn(async () => ({
    ok: true as const,
    data: {
      record: current,
      changes: [],
      receipts: [],
      providedToRequests: [requestId],
      cleanupPending: false,
      organizationPending: false
    }
  }))
  memory.mutate = vi.fn(async () => {
    memory.query = vi.fn<MemoryApi['query']>(() => new Promise(() => undefined))
    memory.inspect = vi.fn<MemoryApi['inspect']>(() => new Promise(() => undefined))
    current = { ...current, objectVersion: 2, markdown: 'REVIEW017_AFTER_CORRECTION' }
    return {
      ok: true as const,
      data: {
        operationId: '00000000-0000-4000-8000-000000000301',
        objectId,
        objectVersion: 2,
        state: 'SUCCEEDED' as const,
        confirmationId: null,
        summary: '独立纠正已提交'
      }
    }
  })
  Object.defineProperty(window, 'mashiro', { configurable: true, value: { memory } })
  render(<App />)
  fireEvent.click(screen.getByText('Review set A'))
  fireEvent.click(screen.getByText('记忆来源与变更'))
  const conversation = screen.getByRole('region', { name: '对话页面' })
  await within(conversation).findByText('REVIEW017_BEFORE_CORRECTION')
  fireEvent.click(within(conversation).getByRole('button', { name: '打开记忆详情与操作' }))
  await screen.findByRole('heading', { name: '纠正当前版本' })
  fireEvent.change(screen.getByLabelText('Markdown 正文'), {
    target: { value: 'REVIEW017_AFTER_CORRECTION' }
  })
  fireEvent.click(screen.getByRole('button', { name: '保存纠正版本' }))
  await waitFor(() => expect(memory.mutate).toHaveBeenCalledTimes(1))
  await screen.findByText('独立纠正已提交')
  fireEvent.click(screen.getByRole('tab', { name: '对话' }))
  expect(within(conversation).queryByText('REVIEW017_BEFORE_CORRECTION')).not.toBeInTheDocument()
  expect(await within(conversation).findByText(/当时的 v1 已不可用/)).toBeInTheDocument()
})
