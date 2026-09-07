// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { RoundMemoryPanel } from '../../src/renderer/src/features/provider/RoundMemoryPanel'
import { MemoryPanel } from '../../src/renderer/src/features/memory/MemoryPanel'
import type { MemoryRecord } from '../../src/shared/memory-contract'
import type { MemoryRoundResult } from '../../src/shared/memory-round-contract'
import { memoryApi008Defaults } from './memory-api-fixture'

afterEach(cleanup)
const assistantId = '00000000-0000-4000-8000-000000000001'
const requestId = '00000000-0000-4000-8000-000000000101'
const record: MemoryRecord = {
  id: '00000000-0000-4000-8000-000000000201',
  objectVersion: 1,
  kind: 'user',
  scope: 'assistant',
  ownerAssistantId: assistantId,
  title: '独立边界',
  markdown: 'REVIEW017_OLD_BODY',
  nature: 'user-statement',
  event: null,
  state: 'active',
  retention: 'persistent',
  sources: [],
  createdAt: '2026-09-06T01:00:00.000Z',
  updatedAt: '2026-09-06T01:00:00.000Z'
}
function response(section: 'provided' | 'changes'): MemoryRoundResult {
  return {
    ok: true,
    data: {
      assistantId,
      requestId,
      evidenceCoverage: 'recorded-only',
      nextCursor: null,
      entries:
        section === 'changes'
          ? []
          : [
              {
                kind: 'provided',
                objectId: record.id,
                objectVersion: 1,
                availability: 'available',
                canInspect: true,
                record,
                evidence: 'RESPONSE_OBSERVED',
                dispatchedAt: null
              }
            ]
    }
  }
}

it('withdraws cached body synchronously on a permission epoch before any queued refresh runs', async () => {
  const api = memoryApi008Defaults()
  api.round = vi.fn(async (input) => response(input.section))
  const view = render(
    <RoundMemoryPanel
      assistantId={assistantId}
      requestId={requestId}
      mode="normal"
      api={api}
      refreshKey={0}
    />
  )
  fireEvent.click(screen.getByText('记忆来源与变更'))
  await screen.findByText('REVIEW017_OLD_BODY')
  api.round = vi.fn<typeof api.round>(() => new Promise(() => undefined))
  view.rerender(
    <RoundMemoryPanel
      assistantId={assistantId}
      requestId={requestId}
      mode="normal"
      api={api}
      refreshKey={1}
    />
  )
  expect(screen.queryByText('REVIEW017_OLD_BODY')).not.toBeInTheDocument()
})

it('normal to temporary to normal never paints an old body before renewed authority returns', async () => {
  const api = memoryApi008Defaults()
  api.round = vi.fn(async (input) => response(input.section))
  const view = render(
    <RoundMemoryPanel assistantId={assistantId} requestId={requestId} mode="normal" api={api} />
  )
  fireEvent.click(screen.getByText('记忆来源与变更'))
  await screen.findByText('REVIEW017_OLD_BODY')
  view.rerender(
    <RoundMemoryPanel assistantId={assistantId} requestId={requestId} mode="temporary" api={api} />
  )
  api.round = vi.fn<typeof api.round>(() => new Promise(() => undefined))
  view.rerender(
    <RoundMemoryPanel assistantId={assistantId} requestId={requestId} mode="normal" api={api} />
  )
  expect(screen.queryByText('REVIEW017_OLD_BODY')).not.toBeInTheDocument()
})

it('refresh epoch invalidates an in-flight navigation inspection before it can display a stale body', async () => {
  const api = memoryApi008Defaults()
  let finish!: (v: Awaited<ReturnType<typeof api.inspect>>) => void
  api.inspect = vi.fn<typeof api.inspect>(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const target = { assistantId, id: record.id, nonce: 1 }
  const view = render(
    <MemoryPanel
      assistantId={assistantId}
      assistantName="合成"
      api={api}
      onLocateRound={vi.fn()}
      openTarget={target}
      refreshKey={0}
    />
  )
  await waitFor(() => expect(api.inspect).toHaveBeenCalledTimes(1))
  view.rerender(
    <MemoryPanel
      assistantId={assistantId}
      assistantName="合成"
      api={api}
      onLocateRound={vi.fn()}
      openTarget={target}
      refreshKey={1}
    />
  )
  await act(async () => {
    finish({
      ok: true,
      data: {
        record,
        changes: [],
        receipts: [],
        providedToRequests: [],
        cleanupPending: false,
        organizationPending: false
      }
    })
  })
  expect(screen.queryByText('REVIEW017_OLD_BODY')).not.toBeInTheDocument()
})

it('cancels a queued normal-mode refresh before dispatch when temporary mode replaces it', async () => {
  const api = memoryApi008Defaults()
  api.round = vi.fn(async (input) => response(input.section))
  const view = render(
    <RoundMemoryPanel
      assistantId={assistantId}
      requestId={requestId}
      mode="normal"
      api={api}
      refreshKey={0}
    />
  )
  fireEvent.click(screen.getByText('记忆来源与变更'))
  await screen.findByText('REVIEW017_OLD_BODY')
  const queued: (() => void)[] = []
  const scheduler = vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((callback) => {
    queued.push(callback)
  })
  try {
    view.rerender(
      <RoundMemoryPanel
        assistantId={assistantId}
        requestId={requestId}
        mode="normal"
        api={api}
        refreshKey={1}
      />
    )
    expect(queued.length).toBeGreaterThan(0)
    view.rerender(
      <RoundMemoryPanel
        assistantId={assistantId}
        requestId={requestId}
        mode="temporary"
        api={api}
        refreshKey={1}
      />
    )
    vi.mocked(api.round).mockClear()
    await act(async () => {
      for (const callback of queued.splice(0)) callback()
    })
    expect(api.round).not.toHaveBeenCalled()
  } finally {
    scheduler.mockRestore()
  }
})

it('an unrelated refresh must not replay the consumed navigation target over an unsaved correction draft', async () => {
  const api = memoryApi008Defaults()
  api.inspect = vi.fn<typeof api.inspect>(async () => ({
    ok: true as const,
    data: {
      record,
      changes: [],
      receipts: [],
      providedToRequests: [],
      cleanupPending: false,
      organizationPending: false
    }
  }))
  const target = { assistantId, id: record.id, nonce: 1 }
  const view = render(
    <MemoryPanel
      assistantId={assistantId}
      assistantName="合成"
      api={api}
      onLocateRound={vi.fn()}
      openTarget={target}
      refreshKey={0}
    />
  )
  await screen.findByRole('heading', { name: '纠正当前版本' })
  fireEvent.change(screen.getByLabelText('Markdown 正文'), {
    target: { value: 'REVIEW017_UNSAVED_DRAFT' }
  })
  view.rerender(
    <MemoryPanel
      assistantId={assistantId}
      assistantName="合成"
      api={api}
      onLocateRound={vi.fn()}
      openTarget={target}
      refreshKey={1}
    />
  )
  await act(async () => {
    await Promise.resolve()
  })
  expect(screen.getByLabelText('Markdown 正文')).toHaveValue('REVIEW017_UNSAVED_DRAFT')
})
