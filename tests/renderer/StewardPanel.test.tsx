// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StewardPanel } from '../../src/renderer/src/features/steward/StewardPanel'
import type { AssistantSnapshot } from '../../src/shared/assistant-contract'
import type { MemoryApi } from '../../src/shared/memory-contract'
import type { ProviderApi } from '../../src/shared/provider-contract'
import type { StewardApi, StewardSnapshot } from '../../src/shared/steward-contract'
import { memoryApi008Defaults } from './memory-api-fixture'
import { providerApi007Defaults } from './provider-api-fixture'
import {
  stewardApi013Defaults,
  stewardAssistantA,
  stewardAssistantB,
  stewardBranch,
  stewardBranchId,
  stewardConflict,
  stewardConflictId,
  stewardConnectionA,
  stewardJob,
  stewardMemoryA,
  stewardPending,
  stewardRecord,
  stewardSnapshot,
  stewardSource
} from './steward-api-fixture'

afterEach(cleanup)

function assistants(currentAssistantId = stewardAssistantA): AssistantSnapshot {
  return {
    assistants: [
      {
        id: stewardAssistantA,
        displayName: 'Alpha',
        persona: '',
        avatarKey: 'mashiro',
        isArchived: false,
        createdAt: '2026-09-07T00:00:00.000Z',
        updatedAt: '2026-09-07T00:00:00.000Z',
        archivedAt: null,
        version: 1
      },
      {
        id: stewardAssistantB,
        displayName: 'Beta',
        persona: '',
        avatarKey: 'violet',
        isArchived: false,
        createdAt: '2026-09-07T00:00:00.000Z',
        updatedAt: '2026-09-07T00:00:00.000Z',
        archivedAt: null,
        version: 1
      }
    ],
    currentAssistantId,
    primaryAssistantId: stewardAssistantA,
    stateRevision: currentAssistantId === stewardAssistantA ? 1 : 2
  }
}

function provider(): ProviderApi {
  return {
    ...providerApi007Defaults(),
    list: vi.fn(async () => ({
      ok: true as const,
      data: {
        connections: [
          {
            id: stewardConnectionA,
            displayName: '资料模型',
            baseUrl: 'https://example.com/v1',
            enabled: true,
            hasCredential: true,
            credentialPersistence: 'temporary' as const,
            createdAt: '2026-09-07T00:00:00.000Z',
            updatedAt: '2026-09-07T00:00:00.000Z',
            version: 1
          }
        ],
        bindings: []
      }
    })),
    saveConnection: vi.fn(),
    setCredential: vi.fn(),
    deleteCredential: vi.fn(),
    bindAssistant: vi.fn(),
    clearChat: vi.fn(),
    startChat: vi.fn(),
    cancelChat: vi.fn(),
    onEvent: vi.fn(() => () => undefined)
  } as ProviderApi
}

function panel(
  api: StewardApi,
  values: {
    assistantSnapshot?: AssistantSnapshot
    memoryApi?: MemoryApi
    onMemoryChanged?: () => void
  } = {}
) {
  return (
    <StewardPanel
      assistantSnapshot={values.assistantSnapshot ?? assistants()}
      api={api}
      memoryApi={values.memoryApi ?? memoryApi008Defaults()}
      providerApi={provider()}
      onMemoryChanged={values.onMemoryChanged}
    />
  )
}

describe('StewardPanel', () => {
  it('keeps assistant discovery and singleton steward settings separate and opt-in', async () => {
    const initial = stewardSnapshot()
    const configure = vi.fn<StewardApi['configure']>(async (input) => ({
      ok: true,
      data:
        input.role === 'assistant'
          ? {
              ...initial,
              discovery: {
                ...initial.discovery,
                ...input.settings,
                version: 1,
                recipientFingerprint: null
              }
            }
          : {
              ...initial,
              configuration: {
                ...initial.configuration,
                ...input.settings,
                version: 1,
                recipientFingerprint: null
              }
            }
    }))
    const api = stewardApi013Defaults(initial)
    api.configure = configure
    render(panel(api))

    const discovery = await screen.findByRole('region', { name: '当前助手共享增量识别' })
    const warehouse = screen.getByRole('region', { name: '全局仓储员配置' })
    expect(within(discovery).getByRole('checkbox', { name: '启用共享增量识别' })).not.toBeChecked()
    expect(within(warehouse).getByRole('checkbox', { name: '启用仓储员' })).not.toBeChecked()
    expect(within(warehouse).getByRole('checkbox', { name: '允许写入待核验推测' })).toBeDisabled()

    fireEvent.click(within(discovery).getByRole('checkbox', { name: '启用共享增量识别' }))
    fireEvent.change(within(discovery).getByLabelText('识别连接'), {
      target: { value: stewardConnectionA }
    })
    fireEvent.change(within(discovery).getByLabelText('识别模型'), {
      target: { value: 'discover-model' }
    })
    fireEvent.click(
      within(discovery).getByRole('checkbox', { name: '允许读取本助手已完成的正常轮次' })
    )
    fireEvent.click(within(discovery).getByRole('checkbox', { name: '设置 UTC 日硬预算' }))
    fireEvent.change(within(discovery).getByLabelText('每日最多调用次数'), {
      target: { value: '3' }
    })
    fireEvent.change(within(discovery).getByLabelText('每日最多输入字符'), {
      target: { value: '2000' }
    })
    fireEvent.click(
      within(discovery).getByRole('checkbox', { name: '本次保存时授权所选识别接收方' })
    )
    fireEvent.click(within(discovery).getByRole('button', { name: '保存识别配置' }))
    await waitFor(() => expect(configure).toHaveBeenCalledTimes(1))
    expect(configure.mock.calls[0]![0]).toEqual({
      protocolVersion: 1,
      assistantId: stewardAssistantA,
      role: 'assistant',
      expectedVersion: 0,
      settings: {
        enabled: true,
        connectionId: stewardConnectionA,
        model: 'discover-model',
        allowOwnCompletedRounds: true,
        budget: { window: 'utc-day', calls: 3, inputCharacters: 2000 }
      },
      grantSelectedRecipient: true
    })

    fireEvent.click(within(warehouse).getByRole('checkbox', { name: '启用仓储员' }))
    fireEvent.change(within(warehouse).getByLabelText('仓储连接'), {
      target: { value: stewardConnectionA }
    })
    fireEvent.change(within(warehouse).getByLabelText('仓储模型'), {
      target: { value: 'steward-model' }
    })
    fireEvent.click(within(warehouse).getByRole('checkbox', { name: 'Alpha' }))
    fireEvent.click(within(warehouse).getByRole('checkbox', { name: '读取待整理共享候选' }))
    fireEvent.click(within(warehouse).getByRole('checkbox', { name: '允许写入忠实归纳和组织关系' }))
    fireEvent.click(within(warehouse).getByRole('checkbox', { name: '允许写入待核验推测' }))
    fireEvent.click(within(warehouse).getByRole('checkbox', { name: '设置 UTC 日硬预算' }))
    fireEvent.change(within(warehouse).getByLabelText('每日最多调用次数'), {
      target: { value: '2' }
    })
    fireEvent.change(within(warehouse).getByLabelText('每日最多输入字符'), {
      target: { value: '5000' }
    })
    fireEvent.click(
      within(warehouse).getByRole('checkbox', {
        name: '本次保存同时授权所选仓储接收方读取这些已选来源'
      })
    )
    fireEvent.click(within(warehouse).getByRole('button', { name: '保存仓储配置' }))
    await waitFor(() => expect(configure).toHaveBeenCalledTimes(2))
    expect(configure.mock.calls[1]![0]).toMatchObject({
      role: 'steward',
      expectedVersion: 0,
      grantSelectedRecipient: true,
      settings: {
        assistantIds: [stewardAssistantA],
        allowAcceptedMemories: false,
        allowSharedCandidates: true,
        allowWrite: true,
        allowInferences: true
      }
    })
  })

  it('shows pending semantics, PARTIAL receipts, and accumulates paginated real branch members', async () => {
    const branch = stewardBranch()
    const first = stewardRecord()
    const second = stewardRecord({
      id: '00000000-0000-4000-8000-000000001520',
      objectVersion: 1,
      title: '第二条资料',
      markdown: '第二页正文。'
    })
    const snapshot = stewardSnapshot(stewardAssistantA, {
      pending: [stewardPending()],
      jobs: [stewardJob()],
      branches: [branch]
    })
    const api = stewardApi013Defaults(snapshot)
    api.branch = vi.fn(async (input) => ({
      ok: true as const,
      data:
        input.cursor === 0
          ? {
              branch,
              members: [first],
              conflicts: [],
              markdown: '# 工作方式\n\n第一页',
              nextCursor: 100
            }
          : { branch, members: [second], conflicts: [], markdown: '第二页', nextCursor: null }
    }))
    render(panel(api))

    expect(await screen.findByText(/待整理，尚未接受/)).toBeInTheDocument()
    expect(screen.getByText(/部分完成 · 仓储整理/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('来源与分项回执'))
    expect(screen.getByText(new RegExp(stewardJob().slots[0]!.commandId))).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '读取候选正文' }))
    expect(await screen.findByText('候选 Markdown')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '读取分支' }))
    const detail = await screen.findByRole('region', { name: '工作方式分支详情' })
    expect(within(detail).getByText('长期偏好')).toBeInTheDocument()
    fireEvent.click(within(detail).getByRole('button', { name: '加载更多分支成员' }))
    expect(await within(detail).findByText('第二条资料')).toBeInTheDocument()
    expect(within(detail).getByText(/已读取完整分支/)).toBeInTheDocument()
    expect(api.branch).toHaveBeenNthCalledWith(2, {
      protocolVersion: 1,
      assistantId: stewardAssistantA,
      id: stewardBranchId,
      expectedVersion: 4,
      cursor: 100
    })
  })

  it('distinguishes sources provided to the model from sources cited by its output', async () => {
    const providedOnly = stewardSource('00000000-0000-4000-8000-000000001530', 1)
    const cited = stewardSource('00000000-0000-4000-8000-000000001531', 2)
    const job = stewardJob()
    const api = stewardApi013Defaults(
      stewardSnapshot(stewardAssistantA, {
        jobs: [
          stewardJob({
            slots: [
              {
                ...job.slots[0]!,
                providedSources: [providedOnly, cited],
                citedSources: [cited]
              }
            ]
          })
        ]
      })
    )
    render(panel(api))

    const receiptSummary = await screen.findByText('来源与分项回执')
    expect(screen.getByText('提供给模型的来源')).not.toBeVisible()
    fireEvent.click(receiptSummary)

    const providedGroup = screen.getByRole('group', { name: '提供给模型的来源' })
    const citedGroup = screen.getByRole('group', { name: '模型输出引用的来源' })
    expect(within(providedGroup).getByText(providedOnly.id)).toBeInTheDocument()
    expect(within(providedGroup).getByText(cited.id)).toBeInTheDocument()
    expect(within(citedGroup).getByText(cited.id)).toBeInTheDocument()
    expect(within(citedGroup).queryByText(providedOnly.id)).not.toBeInTheDocument()
    expect(
      within(providedGroup).getByText(/未明确引用不代表该来源没有产生影响/)
    ).toBeInTheDocument()
  })

  it('only resolves a conflict with the new version returned by an immediate correction', async () => {
    const conflict = stewardConflict({ state: 'STALE' })
    const open = stewardSnapshot(stewardAssistantA, { conflicts: [conflict] })
    const closed = stewardSnapshot(stewardAssistantA, {
      conflicts: [
        { ...conflict, version: 3, state: 'RESOLVED', resolution: { ...conflict.left, version: 8 } }
      ]
    })
    const api = stewardApi013Defaults(open)
    api.resolveConflict = vi.fn(async () => ({ ok: true as const, data: closed }))
    const current = stewardRecord({ objectVersion: 7 })
    const memory = memoryApi008Defaults()
    memory.inspect = vi.fn(async () => ({
      ok: true as const,
      data: {
        record: current,
        changes: [],
        receipts: [],
        providedToRequests: [],
        cleanupPending: false,
        organizationPending: true
      }
    }))
    memory.mutate = vi.fn(async (input) => ({
      ok: true as const,
      data: {
        operationId: input.commandId,
        objectId: stewardMemoryA,
        objectVersion: 8,
        state: 'SUCCEEDED' as const,
        summary: '已保存纠正',
        confirmationId: null
      }
    }))
    render(panel(api, { memoryApi: memory }))

    fireEvent.click(await screen.findByRole('button', { name: '纠正左侧后解决' }))
    const editor = await screen.findByRole('region', { name: '冲突即时纠正' })
    fireEvent.change(within(editor).getByLabelText('Markdown 正文'), {
      target: { value: '以用户刚纠正的内容为准。' }
    })
    fireEvent.click(within(editor).getByRole('button', { name: '保存即时纠正并关闭冲突' }))
    await waitFor(() => expect(api.resolveConflict).toHaveBeenCalledTimes(1))
    expect(memory.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        mutation: expect.objectContaining({
          action: 'correct',
          targetId: stewardMemoryA,
          expectedVersion: 7,
          markdown: '以用户刚纠正的内容为准。'
        })
      })
    )
    expect(api.resolveConflict).toHaveBeenCalledWith(
      expect.objectContaining({
        conflictId: stewardConflictId,
        expectedVersion: 2,
        resolutionMemoryId: stewardMemoryA,
        resolutionMemoryVersion: 8
      })
    )
    expect(await screen.findByText(/即时纠正已接受/)).toBeInTheDocument()
  })

  it('ignores A-to-B-to-A late snapshots and clears route-local busy state', async () => {
    const resolvers: Array<(value: { ok: true; data: StewardSnapshot }) => void> = []
    const query = vi.fn<StewardApi['query']>(
      () => new Promise((resolve) => resolvers.push(resolve))
    )
    const api = stewardApi013Defaults()
    api.query = query
    const view = render(panel(api, { assistantSnapshot: assistants(stewardAssistantA) }))
    await waitFor(() => expect(query).toHaveBeenCalledTimes(1))
    view.rerender(panel(api, { assistantSnapshot: assistants(stewardAssistantB) }))
    await waitFor(() => expect(query).toHaveBeenCalledTimes(2))
    view.rerender(panel(api, { assistantSnapshot: assistants(stewardAssistantA) }))
    await waitFor(() => expect(query).toHaveBeenCalledTimes(3))

    await act(async () => {
      resolvers[2]!({
        ok: true,
        data: stewardSnapshot(stewardAssistantA, {
          discovery: { ...stewardSnapshot(stewardAssistantA).discovery, model: 'current-a' }
        })
      })
      resolvers[1]!({
        ok: true,
        data: stewardSnapshot(stewardAssistantB, {
          discovery: { ...stewardSnapshot(stewardAssistantB).discovery, model: 'late-b' }
        })
      })
      resolvers[0]!({
        ok: true,
        data: stewardSnapshot(stewardAssistantA, {
          discovery: { ...stewardSnapshot(stewardAssistantA).discovery, model: 'old-a' }
        })
      })
      await Promise.resolve()
    })
    expect(screen.getByLabelText('识别模型')).toHaveValue('current-a')
    expect(screen.getByLabelText('识别模型')).not.toHaveValue('late-b')
    expect(screen.getByRole('button', { name: '刷新全部' })).toBeEnabled()
  })

  it('keeps an edited member bound to its original CAS when a branch snapshot changes', async () => {
    const originalBranch = stewardBranch({ version: 4 })
    const changedBranch = stewardBranch({ version: 5 })
    const initial = stewardSnapshot(stewardAssistantA, { branches: [originalBranch] })
    const changed = stewardSnapshot(stewardAssistantA, { branches: [changedBranch] })
    let changedListener: (() => void) | undefined
    const api = stewardApi013Defaults(initial)
    api.query = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, data: initial })
      .mockResolvedValue({ ok: true, data: changed })
    api.branch = vi.fn(async () => ({
      ok: true as const,
      data: {
        branch: originalBranch,
        members: [stewardRecord()],
        conflicts: [],
        markdown: '# 原正文',
        nextCursor: null
      }
    }))
    api.onChanged = vi.fn((listener) => {
      changedListener = listener
      return () => undefined
    })
    const memory = memoryApi008Defaults()
    render(panel(api, { memoryApi: memory }))

    fireEvent.click(await screen.findByRole('button', { name: '读取分支' }))
    fireEvent.click(await screen.findByRole('button', { name: '在应用内编辑' }))
    fireEvent.change(
      screen.getByRole('region', { name: '编辑分支成员' }).querySelector('textarea')!,
      { target: { value: '未保存的用户草稿' } }
    )
    await act(async () => {
      changedListener?.()
      await Promise.resolve()
    })
    expect(await screen.findByText(/分支版本已变化/)).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: '编辑分支成员' }).querySelector('textarea')
    ).toHaveValue('未保存的用户草稿')
    fireEvent.click(screen.getByRole('button', { name: '保存纠正版本' }))
    expect(await screen.findByText(/草稿仍按原版本保留/)).toBeInTheDocument()
    expect(memory.mutate).not.toHaveBeenCalled()
  })
})
