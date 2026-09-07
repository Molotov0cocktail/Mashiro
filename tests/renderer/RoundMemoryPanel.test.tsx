// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryPanel } from '../../src/renderer/src/features/memory/MemoryPanel'
import { HistoryContextPanel } from '../../src/renderer/src/features/provider/HistoryContextPanel'
import { ProviderPanel } from '../../src/renderer/src/features/provider/ProviderPanel'
import { RoundMemoryPanel } from '../../src/renderer/src/features/provider/RoundMemoryPanel'
import type { AssistantSnapshot } from '../../src/shared/assistant-contract'
import type { MemoryApi, MemoryRecord } from '../../src/shared/memory-contract'
import type { MemoryRoundResult } from '../../src/shared/memory-round-contract'
import type { ProviderApi, ProviderSnapshot } from '../../src/shared/provider-contract'
import type { TimelineApi, TimelineMessage } from '../../src/shared/timeline-contract'
import { memoryApi008Defaults } from './memory-api-fixture'
import { providerApi007Defaults } from './provider-api-fixture'
import { timelineApi006Defaults } from './timeline-api-fixture'

afterEach(cleanup)

const assistantA = '00000000-0000-4000-8000-000000000001'
const assistantB = '00000000-0000-4000-8000-000000000002'
const requestA = '00000000-0000-4000-8000-000000000101'
const requestB = '00000000-0000-4000-8000-000000000102'
const objectA = '00000000-0000-4000-8000-000000000201'
const operationA = '00000000-0000-4000-8000-000000000301'
const confirmationA = '00000000-0000-4000-8000-000000000401'

function record(values: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: objectA,
    objectVersion: 4,
    kind: 'user',
    scope: 'global',
    ownerAssistantId: assistantA,
    title: '称呼偏好',
    markdown: '请叫我小真。',
    nature: 'user-statement',
    event: null,
    state: 'active',
    retention: 'persistent',
    createdAt: '2026-09-06T01:00:00.000Z',
    updatedAt: '2026-09-06T02:00:00.000Z',
    sources: [{ type: 'user-round', id: requestA, assistantId: assistantA, version: 1 }],
    ...values
  }
}

function result(
  assistantId: string,
  requestId: string,
  entries: Extract<MemoryRoundResult, { ok: true }>['data']['entries'],
  nextCursor: number | null = null
): MemoryRoundResult {
  return {
    ok: true,
    data: { assistantId, requestId, evidenceCoverage: 'recorded-only', entries, nextCursor }
  }
}

function provided(current = record()) {
  return {
    kind: 'provided' as const,
    objectId: current.id,
    objectVersion: current.objectVersion,
    availability: 'available' as const,
    record: current,
    canInspect: true,
    evidence: 'RESPONSE_OBSERVED' as const,
    dispatchedAt: '2026-09-06T02:01:00.000Z'
  }
}

function change(current = record()) {
  return {
    kind: 'change' as const,
    objectId: current.id,
    objectVersion: current.objectVersion,
    availability: 'available' as const,
    record: current,
    canInspect: true,
    operationId: operationA,
    action: 'correct' as const,
    state: 'PENDING_CONFIRMATION' as const,
    createdAt: '2026-09-06T02:02:00.000Z',
    confirmationId: confirmationA,
    summary: '等待确认纠正'
  }
}

function apiWithRound(round: MemoryApi['round']): MemoryApi {
  return { ...memoryApi008Defaults(), round } as MemoryApi
}

describe('RoundMemoryPanel', () => {
  it('loads only after expansion, explains evidence, paginates, and opens an object without UUID copying', async () => {
    const second = record({
      id: '00000000-0000-4000-8000-000000000202',
      objectVersion: 2,
      title: '第二条记忆',
      markdown: '第二页内容'
    })
    const round = vi.fn<MemoryApi['round']>(async (input) => {
      if (input.section === 'changes') return result(input.assistantId, input.requestId, [change()])
      return input.cursor === 20
        ? result(input.assistantId, input.requestId, [provided(second)])
        : result(input.assistantId, input.requestId, [provided()], 20)
    })
    const onOpenMemory = vi.fn()
    render(
      <RoundMemoryPanel
        assistantId={assistantA}
        requestId={requestA}
        mode="normal"
        api={apiWithRound(round)}
        onOpenMemory={onOpenMemory}
      />
    )

    const summary = screen.getByText('记忆来源与变更')
    expect(summary.closest('details')).not.toHaveAttribute('open')
    expect(round).not.toHaveBeenCalled()
    fireEvent.click(summary)

    const providedSection = await screen.findByRole('region', { name: '本轮实际提供的记忆' })
    expect(within(providedSection).getByText('称呼偏好')).toBeInTheDocument()
    expect(
      within(providedSection).getByText(
        /模型收到的正文可能是节选.*最多 1000 字符.*不代表完整外发内容/
      )
    ).toBeInTheDocument()
    expect(within(providedSection).getByText(/已观察到 Provider 响应/)).toBeInTheDocument()
    expect(within(providedSection).getByText(/仍不能证明模型采用/)).toBeInTheDocument()
    expect(within(providedSection).getByText(/用户明确陈述.*接受版本 v4/)).toBeInTheDocument()
    expect(within(providedSection).getByText(/本轮用户原话.*来源版本 v1/)).toBeInTheDocument()
    expect(screen.getByText('等待确认纠正')).toBeInTheDocument()
    expect(round).toHaveBeenCalledWith(
      expect.objectContaining({ section: 'provided', limit: 20, mode: 'normal' })
    )
    expect(round).toHaveBeenCalledWith(
      expect.objectContaining({ section: 'changes', limit: 20, mode: 'normal' })
    )

    fireEvent.click(screen.getAllByRole('button', { name: '打开记忆详情与操作' })[0]!)
    expect(onOpenMemory).toHaveBeenCalledWith({ assistantId: assistantA, id: objectA })
    fireEvent.click(screen.getByRole('button', { name: '加载更多提供记录' }))
    expect(await screen.findByText('第二条记忆')).toBeInTheDocument()
    expect(round).toHaveBeenCalledWith(expect.objectContaining({ section: 'provided', cursor: 20 }))
  })

  it('does not substitute a current body for an obsolete provided version', async () => {
    const round = vi.fn<MemoryApi['round']>(async (input) =>
      result(
        input.assistantId,
        input.requestId,
        input.section === 'provided'
          ? [
              {
                kind: 'provided',
                objectId: objectA,
                objectVersion: 3,
                availability: 'obsolete',
                record: null,
                canInspect: true,
                evidence: 'DISPATCH_STARTED',
                dispatchedAt: null
              }
            ]
          : []
      )
    )
    render(
      <RoundMemoryPanel
        assistantId={assistantA}
        requestId={requestA}
        mode="normal"
        api={apiWithRound(round)}
        onOpenMemory={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('记忆来源与变更'))
    expect(await screen.findByText(/当时的 v3 已不可用/)).toBeInTheDocument()
    expect(screen.getByText(/当前正文也不代表当时提供的正文/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '打开当前版本（当时版本不可用）' })).toBeEnabled()
    expect(screen.queryByText('请叫我小真。')).not.toBeInTheDocument()
  })

  it('drops an expanded cached body when permissions change and the trusted query refuses it', async () => {
    let revoked = false
    const round = vi.fn<MemoryApi['round']>(async (input) => {
      if (revoked) {
        return {
          ok: false as const,
          error: { code: 'PERMISSION_DENIED' as const, message: 'revoked' }
        }
      }
      return result(
        input.assistantId,
        input.requestId,
        input.section === 'provided' ? [provided()] : []
      )
    })
    const view = render(
      <RoundMemoryPanel
        assistantId={assistantA}
        requestId={requestA}
        mode="normal"
        api={apiWithRound(round)}
        refreshKey={0}
      />
    )
    fireEvent.click(screen.getByText('记忆来源与变更'))
    expect(await screen.findByText('请叫我小真。')).toBeInTheDocument()
    revoked = true
    view.rerender(
      <RoundMemoryPanel
        assistantId={assistantA}
        requestId={requestA}
        mode="normal"
        api={apiWithRound(round)}
        refreshKey={1}
      />
    )
    expect(
      await screen.findAllByText('当前读取、来源或实际接收方权限不允许显示本轮详情。')
    ).toHaveLength(2)
    expect(screen.queryByText('请叫我小真。')).not.toBeInTheDocument()
  })

  it('ignores a late result from the previous assistant and request', async () => {
    let resolveOld: ((value: MemoryRoundResult) => void) | undefined
    const round = vi.fn<MemoryApi['round']>((input) => {
      if (input.assistantId === assistantA && input.section === 'provided') {
        return new Promise((resolve) => {
          resolveOld = resolve
        })
      }
      return Promise.resolve(
        result(
          input.assistantId,
          input.requestId,
          input.section === 'provided'
            ? [provided(record({ title: '新助手记忆', markdown: 'NEW_BODY' }))]
            : []
        )
      )
    })
    const memoryApi = apiWithRound(round)
    const view = render(
      <RoundMemoryPanel
        assistantId={assistantA}
        requestId={requestA}
        mode="normal"
        api={memoryApi}
      />
    )
    fireEvent.click(screen.getByText('记忆来源与变更'))
    await waitFor(() => expect(round).toHaveBeenCalledTimes(2))
    view.rerender(
      <RoundMemoryPanel
        assistantId={assistantB}
        requestId={requestB}
        mode="normal"
        api={memoryApi}
      />
    )
    expect(await screen.findByText('NEW_BODY')).toBeInTheDocument()
    resolveOld?.(
      result(assistantA, requestA, [
        provided(record({ title: '旧助手记忆', markdown: 'OLD_BODY' }))
      ])
    )
    await waitFor(() => expect(screen.queryByText('OLD_BODY')).not.toBeInTheDocument())
    expect(screen.getByText('NEW_BODY')).toBeInTheDocument()
  })

  it('never calls the round API for strict temporary mode', () => {
    const round = vi.fn<MemoryApi['round']>()
    render(
      <RoundMemoryPanel
        assistantId={assistantA}
        requestId={requestA}
        mode="temporary"
        api={apiWithRound(round)}
      />
    )
    expect(screen.queryByText('记忆来源与变更')).not.toBeInTheDocument()
    expect(round).not.toHaveBeenCalled()
  })

  it('navigates into the existing inspect, correct, delete, and withdraw entry', async () => {
    const current = record()
    const memoryApi = apiWithRound(async (input) =>
      result(
        input.assistantId,
        input.requestId,
        input.section === 'provided' ? [provided(current)] : []
      )
    )
    memoryApi.query = vi.fn(async () => ({
      ok: true as const,
      data: { records: [current], nextCursor: null }
    }))
    memoryApi.inspect = vi.fn(async () => ({
      ok: true as const,
      data: {
        record: current,
        changes: [],
        receipts: [],
        providedToRequests: [requestA],
        cleanupPending: false,
        organizationPending: false
      }
    }))

    function Harness(): React.JSX.Element {
      const [target, setTarget] = useState<{ assistantId: string; id: string } | null>(null)
      return target ? (
        <MemoryPanel
          assistantId={assistantA}
          assistantName="Alpha"
          api={memoryApi}
          onLocateRound={vi.fn()}
          openTarget={{ ...target, nonce: 1 }}
        />
      ) : (
        <RoundMemoryPanel
          assistantId={assistantA}
          requestId={requestA}
          mode="normal"
          api={memoryApi}
          onOpenMemory={setTarget}
        />
      )
    }

    render(<Harness />)
    fireEvent.click(screen.getByText('记忆来源与变更'))
    fireEvent.click(await screen.findByRole('button', { name: '打开记忆详情与操作' }))
    expect(await screen.findByRole('heading', { name: '当前记录 v4' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '纠正当前版本' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '删除此表示' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '撤回来源与信息' })).toBeInTheDocument()
    expect(memoryApi.inspect).toHaveBeenCalledWith({
      protocolVersion: 1,
      assistantId: assistantA,
      id: objectA
    })
  })

  it('mounts the panel on a concrete assistant answer in the realtime transcript', async () => {
    const answer: TimelineMessage = {
      id: '00000000-0000-4000-8000-000000000501',
      requestId: requestA,
      role: 'assistant',
      content: '实时回答',
      status: 'completed',
      createdAt: '2026-09-06T03:00:01.000Z',
      saved: true
    }
    const question: TimelineMessage = {
      ...answer,
      id: '00000000-0000-4000-8000-000000000502',
      role: 'user',
      content: '实时问题',
      createdAt: '2026-09-06T03:00:00.000Z'
    }
    const assistantSnapshot: AssistantSnapshot = {
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
        }
      ],
      currentAssistantId: assistantA,
      primaryAssistantId: assistantA,
      stateRevision: 1
    }
    const connectionId = '00000000-0000-4000-8000-000000000601'
    const providerSnapshot: ProviderSnapshot = {
      connections: [
        {
          id: connectionId,
          displayName: 'Receiver',
          baseUrl: 'https://example.com/v1',
          enabled: true,
          hasCredential: true,
          credentialPersistence: 'temporary',
          createdAt: '2026-09-06T00:00:00.000Z',
          updatedAt: '2026-09-06T00:00:00.000Z',
          version: 1
        }
      ],
      bindings: [
        {
          assistantId: assistantA,
          connectionId,
          model: 'model-a',
          updatedAt: '2026-09-06T00:00:00.000Z',
          version: 1
        }
      ]
    }
    const providerApi = {
      ...providerApi007Defaults(),
      list: vi.fn(async () => ({ ok: true as const, data: providerSnapshot })),
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
        data: {
          assistantId: input.assistantId,
          mode: input.mode,
          messages: [question, answer],
          hasMore: false
        }
      })),
      saveTemporary: vi.fn()
    } as TimelineApi
    const round = vi.fn<MemoryApi['round']>(async (input) =>
      result(input.assistantId, input.requestId, input.section === 'provided' ? [provided()] : [])
    )

    render(
      <ProviderPanel
        assistantSnapshot={assistantSnapshot}
        api={providerApi}
        timelineApi={timelineApi}
        memoryApi={apiWithRound(round)}
      />
    )
    expect(await screen.findByText('实时回答')).toBeInTheDocument()
    expect(round).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('记忆来源与变更'))
    expect(await screen.findByText('请叫我小真。')).toBeInTheDocument()
    expect(round).toHaveBeenCalledWith(
      expect.objectContaining({ assistantId: assistantA, requestId: requestA, mode: 'normal' })
    )
  })

  it('mounts the same request-bound panel when browsing historical answers', async () => {
    const historicalAnswer: TimelineMessage = {
      id: '00000000-0000-4000-8000-000000000701',
      requestId: requestA,
      role: 'assistant',
      content: '历史回答',
      status: 'interrupted',
      createdAt: '2026-09-06T04:00:01.000Z',
      saved: true
    }
    const timelineApi = {
      ...timelineApi006Defaults(),
      query: vi.fn(async (input) => ({
        ok: true as const,
        data: {
          assistantId: input.assistantId,
          messages: [historicalAnswer],
          nextCursor: null
        }
      }))
    } as unknown as TimelineApi
    const round = vi.fn<MemoryApi['round']>(async (input) =>
      result(input.assistantId, input.requestId, input.section === 'changes' ? [change()] : [])
    )

    render(
      <HistoryContextPanel
        assistantId={assistantA}
        mode="normal"
        bindingKey="receiver:model"
        timelineApi={timelineApi}
        memoryApi={apiWithRound(round)}
        contextIntent={{ kind: 'recent' }}
        selectedRequestIds={[]}
        onContextIntentChange={vi.fn()}
        onSelectedRequestIdsChange={vi.fn()}
      />
    )
    expect(await screen.findByText('历史回答')).toBeInTheDocument()
    expect(round).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('记忆来源与变更'))
    expect(await screen.findByText('等待确认纠正')).toBeInTheDocument()
    expect(round).toHaveBeenCalledWith(
      expect.objectContaining({ assistantId: assistantA, requestId: requestA, mode: 'normal' })
    )
  })
})
