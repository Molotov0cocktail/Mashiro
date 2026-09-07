// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MemoryApi, MemoryPermissions, MemoryRecord } from '../../src/shared/memory-contract'
import { MemoryPanel } from '../../src/renderer/src/features/memory/MemoryPanel'
import { memoryApi008Defaults, memoryPermission } from './memory-api-fixture'

const assistantId = '00000000-0000-4000-8000-000000000001'
const recordId = '00000000-0000-4000-8000-000000000101'
const sourceRoundId = '00000000-0000-4000-8000-000000000201'
const operationId = '00000000-0000-4000-8000-000000000301'
const confirmationId = '00000000-0000-4000-8000-000000000401'
const previewId = '00000000-0000-4000-8000-000000000501'

afterEach(cleanup)

function record(values: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: recordId,
    objectVersion: 2,
    kind: 'user',
    scope: 'global',
    ownerAssistantId: assistantId,
    title: '偏好称呼',
    markdown: '请叫我 **小真**。',
    nature: 'user-statement',
    event: null,
    state: 'active',
    retention: 'persistent',
    createdAt: '2026-09-06T01:00:00.000Z',
    updatedAt: '2026-09-06T02:00:00.000Z',
    sources: [{ type: 'round', id: sourceRoundId, assistantId, version: 1 }],
    ...values
  }
}

function inspection(current = record()) {
  return {
    record: current,
    changes: [
      {
        operationId,
        action: 'remember',
        objectVersion: current.objectVersion,
        createdAt: '2026-09-06T02:00:00.000Z',
        actor: 'assistant' as const
      }
    ],
    receipts: [
      {
        operationId,
        objectId: current.id,
        objectVersion: current.objectVersion,
        state: 'SUCCEEDED' as const,
        summary: '已保存记忆',
        confirmationId: null
      }
    ],
    providedToRequests: ['00000000-0000-4000-8000-000000000601'],
    cleanupPending: false,
    organizationPending: true
  }
}

function api(overrides: Partial<MemoryApi> = {}): MemoryApi {
  return { ...memoryApi008Defaults(), ...overrides } as MemoryApi
}

describe('MemoryPanel', () => {
  it('labels the actual background actor in the collapsed source and change panel', async () => {
    const current = record()
    const details = inspection(current)
    render(
      <MemoryPanel
        assistantId={assistantId}
        assistantName="Alpha"
        api={api({
          query: async () => ({ ok: true, data: { records: [current], nextCursor: null } }),
          inspect: async () => ({
            ok: true,
            data: {
              ...details,
              changes: details.changes.map((change) => ({
                ...change,
                actor: 'background' as const
              }))
            }
          })
        })}
        onLocateRound={vi.fn()}
      />
    )
    fireEvent.click(await screen.findByRole('button', { name: '查看与纠正' }))
    const summary = await screen.findByText('来源与变更')
    expect(summary.closest('details')).not.toHaveAttribute('open')
    fireEvent.click(summary)
    expect(await screen.findByText(/后台整理/)).toHaveTextContent('remember')
  })

  it('reuses an unresolved manual operation across remounts and creates a new identity after success', async () => {
    const pendingCommands = new Map<string, string>()
    const accepted = new Set<string>()
    const mutate = vi.fn<MemoryApi['mutate']>(async (input) => {
      accepted.add(input.commandId)
      if (mutate.mock.calls.length === 1) throw new Error('lost receipt after commit')
      return {
        ok: true,
        data: {
          operationId: input.commandId,
          objectId: recordId,
          objectVersion: 1,
          state: 'SUCCEEDED',
          summary: '已保存',
          confirmationId: null
        }
      }
    })
    const memoryApi = api({ mutate, inspect: async () => ({ ok: true, data: inspection() }) })
    const panel = (key: string) => (
      <MemoryPanel
        key={key}
        assistantId={assistantId}
        assistantName="Alpha"
        api={memoryApi}
        pendingCommands={pendingCommands}
        onLocateRound={vi.fn()}
      />
    )
    const view = render(panel('before'))
    const fill = () => {
      fireEvent.change(screen.getByLabelText('标题'), { target: { value: '同一未确认记录' } })
      fireEvent.change(screen.getByLabelText('Markdown 正文'), {
        target: { value: '同一未确认正文' }
      })
      fireEvent.click(screen.getByRole('button', { name: '保存新记录' }))
    }
    fill()
    await screen.findByText(/写入回执未确认/)
    expect(pendingCommands.size).toBe(1)
    const registryKey = [...pendingCommands.keys()][0]!
    expect(registryKey).not.toContain('同一未确认记录')
    expect(registryKey).not.toContain('同一未确认正文')
    expect(JSON.parse(registryKey)).toMatchObject({
      domain: 'memory-mutation',
      assistantId,
      targetId: null,
      payloadSha256: expect.stringMatching(/^[0-9a-f]{64}$/)
    })
    view.rerender(panel('after'))
    fill()
    await waitFor(() => expect(screen.getByLabelText('标题')).toHaveValue(''))
    expect(mutate).toHaveBeenCalledTimes(2)
    expect(mutate.mock.calls[0]![0].commandId).toBe(mutate.mock.calls[1]![0].commandId)
    expect(accepted.size).toBe(1)
    expect(pendingCommands.size).toBe(0)
    fill()
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(3))
    expect(mutate.mock.calls[2]![0].commandId).not.toBe(mutate.mock.calls[1]![0].commandId)
    expect(accepted.size).toBe(2)
  })

  it('binds the correction target and CAS version to the editor while other details are pending', async () => {
    const a = record()
    const b = record({
      id: '00000000-0000-4000-8000-000000000102',
      objectVersion: 7,
      title: '另一条记忆',
      markdown: '另一条正文'
    })
    const mutate = vi.fn<MemoryApi['mutate']>(async () => ({
      ok: false,
      error: { code: 'STALE_WRITE', message: 'changed' }
    }))
    const inspect = vi.fn<MemoryApi['inspect']>(async (input) =>
      input.id === a.id ? { ok: true, data: inspection(a) } : await new Promise(() => {})
    )
    render(
      <MemoryPanel
        assistantId={assistantId}
        assistantName="Alpha"
        api={api({
          query: async () => ({ ok: true, data: { records: [a, b], nextCursor: null } }),
          inspect,
          mutate
        })}
        onLocateRound={vi.fn()}
      />
    )
    const buttons = await screen.findAllByRole('button', { name: '查看与纠正' })
    fireEvent.click(buttons[0]!)
    await screen.findByText('来源与变更')
    fireEvent.click(buttons[1]!)
    fireEvent.click(screen.getByRole('button', { name: '保存纠正版本' }))
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
    expect(mutate.mock.calls[0]![0].mutation).toMatchObject({
      targetId: b.id,
      expectedVersion: 7,
      markdown: b.markdown
    })
    expect(screen.queryByText('来源与变更')).not.toBeInTheDocument()
  })

  it('preserves event seconds and milliseconds when correcting unrelated content', async () => {
    const event = record({
      kind: 'event',
      event: {
        status: 'planned',
        occurredAt: '2026-09-06T08:12:34.567Z',
        timeZone: 'Asia/Shanghai'
      }
    })
    const mutate = vi.fn<MemoryApi['mutate']>(async () => ({
      ok: false,
      error: { code: 'STALE_WRITE', message: 'changed' }
    }))
    render(
      <MemoryPanel
        assistantId={assistantId}
        assistantName="Alpha"
        api={api({
          query: async () => ({ ok: true, data: { records: [event], nextCursor: null } }),
          inspect: async () => ({ ok: true, data: inspection(event) }),
          mutate
        })}
        onLocateRound={vi.fn()}
      />
    )
    fireEvent.click(await screen.findByRole('button', { name: '查看与纠正' }))
    await screen.findByText('来源与变更')
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '只改标题' } })
    fireEvent.click(screen.getByRole('button', { name: '保存纠正版本' }))
    await waitFor(() =>
      expect(mutate.mock.calls[0]![0].mutation).toMatchObject({ event: event.event })
    )
  })

  it('keeps global and assistant grants separate and updates the exact CAS scope', async () => {
    const permissions = vi.fn(async (input: Parameters<MemoryApi['permissions']>[0]) => ({
      ok: true as const,
      data: memoryPermission(input.scope, {
        assistantId,
        version: input.scope === 'global' ? 3 : 8,
        read: input.scope === 'assistant'
      })
    }))
    const setPermissions = vi.fn(async (input: Parameters<MemoryApi['setPermissions']>[0]) => ({
      ok: true as const,
      data: {
        ...memoryPermission(input.scope),
        ...input,
        version: input.expectedVersion + 1
      } as MemoryPermissions
    }))
    render(
      <MemoryPanel
        assistantId={assistantId}
        assistantName="Alpha"
        api={api({ permissions, setPermissions })}
        onLocateRound={vi.fn()}
      />
    )

    const global = await screen.findByRole('group', { name: '全局用户记忆' })
    const privateMemory = screen.getByRole('group', { name: '本助手私有记忆' })
    expect(within(global).getByRole('checkbox', { name: '允许助手读取' })).not.toBeChecked()
    expect(within(privateMemory).getByRole('checkbox', { name: '允许助手读取' })).toBeChecked()
    fireEvent.click(within(global).getByRole('checkbox', { name: '允许正常对话写入' }))
    await waitFor(() => expect(setPermissions).toHaveBeenCalledTimes(1))
    expect(setPermissions).toHaveBeenCalledWith({
      protocolVersion: 1,
      assistantId,
      scope: 'global',
      expectedVersion: 3,
      read: false,
      write: true,
      writeInferences: false,
      receive: false
    })
    expect(within(privateMemory).getByRole('checkbox', { name: '允许助手读取' })).toBeChecked()
  })

  it('searches literal text, exposes event intention/cancelled semantics, and writes through a trusted command', async () => {
    const query = vi.fn(async () => ({
      ok: true as const,
      data: { records: [record()], nextCursor: null }
    }))
    const mutate = vi.fn<MemoryApi['mutate']>(async () => ({
      ok: true as const,
      data: {
        operationId,
        objectId: recordId,
        objectVersion: 1,
        state: 'SUCCEEDED' as const,
        summary: '已保存个人事件',
        confirmationId: null
      }
    }))
    render(
      <MemoryPanel
        assistantId={assistantId}
        assistantName="Alpha"
        api={api({
          query,
          mutate,
          inspect: vi.fn(async () => ({ ok: true as const, data: inspection() }))
        })}
        onLocateRound={vi.fn()}
      />
    )
    await screen.findByText('偏好称呼')
    fireEvent.change(screen.getByLabelText('字面搜索'), { target: { value: ' 100%_中文 ' } })
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    await waitFor(() =>
      expect(query).toHaveBeenCalledWith(expect.objectContaining({ query: ' 100%_中文 ' }))
    )

    const editor = screen.getByRole('region', { name: '写入或纠正记忆' })
    fireEvent.change(within(editor).getByLabelText('类型'), {
      target: { value: 'event' }
    })
    expect(screen.getByRole('option', { name: '意向' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '已取消' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '周末看展' } })
    fireEvent.change(screen.getByLabelText('状态'), { target: { value: 'intention' } })
    fireEvent.change(screen.getByLabelText('Markdown 正文'), {
      target: { value: '可能周六去看展。' }
    })
    fireEvent.click(screen.getByRole('button', { name: '保存新记录' }))
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
    expect(mutate.mock.calls[0]![0]).toMatchObject({
      protocolVersion: 1,
      assistantId,
      mutation: {
        action: 'remember',
        kind: 'event',
        scope: 'global',
        title: '周末看展',
        markdown: '可能周六去看展。',
        nature: 'user-statement',
        event: { status: 'intention' }
      }
    })
    expect(mutate.mock.calls[0]![0].commandId).toMatch(/^[0-9a-f-]{36}$/)
    expect(await screen.findByText('已保存个人事件')).toBeInTheDocument()
  })

  it('routes deletion to the complete retention preview with the exact object version', async () => {
    const onPrepareRetention = vi.fn()
    const mutate = vi.fn(async () => ({
      ok: true as const,
      data: {
        operationId,
        objectId: recordId,
        objectVersion: 2,
        state: 'PENDING_CONFIRMATION' as const,
        summary: '将删除“偏好称呼”的当前表示；不会删除原对话或正式事项',
        confirmationId,
        impact: {
          sourceRounds: [{ assistantId, requestId: sourceRoundId }],
          memoryIds: [recordId],
          roundIds: [sourceRoundId],
          totalMemories: 1,
          totalRounds: 1,
          truncated: false
        }
      }
    }))
    const confirm = vi.fn(async (input: Parameters<MemoryApi['confirm']>[0]) => ({
      ok: true as const,
      data: {
        operationId,
        objectId: recordId,
        objectVersion: 3,
        state: input.accept ? ('SUCCEEDED' as const) : ('CANCELLED_BEFORE_DISPATCH' as const),
        summary: input.accept ? '已删除此表示' : '已取消，未执行删除',
        confirmationId: null
      }
    }))
    render(
      <MemoryPanel
        assistantId={assistantId}
        assistantName="Alpha"
        api={api({
          query: vi.fn(async () => ({
            ok: true as const,
            data: { records: [record()], nextCursor: null }
          })),
          inspect: vi.fn(async () => ({ ok: true as const, data: inspection() })),
          mutate,
          confirm
        })}
        onLocateRound={vi.fn()}
        onPrepareRetention={onPrepareRetention}
      />
    )
    fireEvent.click(await screen.findByRole('button', { name: '查看与纠正' }))
    fireEvent.click(await screen.findByRole('button', { name: '删除此表示' }))
    expect(onPrepareRetention).toHaveBeenCalledWith(
      assistantId,
      { type: 'memories', objects: [{ id: recordId, version: 2 }] },
      'delete-representation'
    )
    expect(mutate).not.toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()
    expect(screen.getByText(/完整可信预览/)).toBeInTheDocument()
  })

  it('keeps provenance folded, distinguishes provided from used, jumps to the round, and previews external reload', async () => {
    const locate = vi.fn(async () => undefined)
    const previewReload = vi.fn(async () => ({
      ok: true as const,
      data: {
        previewId,
        id: recordId,
        expectedVersion: 2,
        currentMarkdown: null,
        candidateMarkdown: '磁盘上的候选正文',
        warning: '接受文件已在应用外变化'
      }
    }))
    render(
      <MemoryPanel
        assistantId={assistantId}
        assistantName="Alpha"
        api={api({
          query: vi.fn(async () => ({
            ok: true as const,
            data: { records: [record()], nextCursor: null }
          })),
          inspect: vi.fn(async () => ({ ok: true as const, data: inspection() })),
          previewReload
        })}
        onLocateRound={locate}
      />
    )
    fireEvent.click(await screen.findByRole('button', { name: '查看与纠正' }))
    const details = await screen.findByText('来源与变更')
    expect(details.closest('details')).not.toHaveAttribute('open')
    fireEvent.click(details)
    expect(screen.getByText(/不能证明模型实际使用了它/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '定位原轮次' }))
    expect(locate).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'round', id: sourceRoundId })
    )

    fireEvent.click(screen.getByRole('button', { name: '预览外部修改' }))
    const preview = await screen.findByRole('region', { name: '外部修改预览' })
    expect(within(preview).getByText('磁盘上的候选正文')).toBeInTheDocument()
    expect(within(preview).getByText(/无法作为可信当前正文显示/)).toBeInTheDocument()
    expect(within(preview).getByText(/frontmatter 不会扩大归属、来源或权限/)).toBeInTheDocument()
  })

  it('invalidates a pending external reload preview when cleanup changes the assistant', async () => {
    let resolvePreview!: (value: Awaited<ReturnType<MemoryApi['previewReload']>>) => void
    const previewReload = vi.fn<MemoryApi['previewReload']>(
      () =>
        new Promise((resolve) => {
          resolvePreview = resolve
        })
    )
    const query = vi
      .fn<MemoryApi['query']>()
      .mockResolvedValueOnce({
        ok: true,
        data: { records: [record()], nextCursor: null }
      })
      .mockResolvedValue({
        ok: true,
        data: { records: [], nextCursor: null }
      })
    const memory = api({
      query,
      inspect: vi.fn(async () => ({ ok: true as const, data: inspection() })),
      previewReload
    })
    const view = render(
      <MemoryPanel
        assistantId={assistantId}
        assistantName="Alpha"
        api={memory}
        onLocateRound={vi.fn()}
      />
    )
    fireEvent.click(await screen.findByRole('button', { name: '查看与纠正' }))
    fireEvent.click(await screen.findByRole('button', { name: '预览外部修改' }))
    await waitFor(() => expect(previewReload).toHaveBeenCalledTimes(1))

    view.rerender(
      <MemoryPanel
        assistantId={assistantId}
        assistantName="Alpha"
        api={memory}
        onLocateRound={vi.fn()}
        retentionChange={{
          epoch: 8,
          assistantIds: [assistantId],
          memoryIds: [recordId],
          requestIds: [],
          reason: 'cleanup'
        }}
      />
    )
    await act(async () => {
      resolvePreview({
        ok: true,
        data: {
          previewId,
          id: recordId,
          expectedVersion: 2,
          currentMarkdown: '不应恢复的当前正文',
          candidateMarkdown: '不应恢复的磁盘正文',
          warning: '迟到预览'
        }
      })
      await Promise.resolve()
    })

    expect(screen.queryByRole('region', { name: '外部修改预览' })).not.toBeInTheDocument()
    expect(screen.queryByText('不应恢复的当前正文')).not.toBeInTheDocument()
    expect(screen.queryByText('不应恢复的磁盘正文')).not.toBeInTheDocument()
    expect(screen.getByLabelText('标题')).toHaveValue('')
    expect(screen.getByLabelText('Markdown 正文')).toHaveValue('')
  })
})
