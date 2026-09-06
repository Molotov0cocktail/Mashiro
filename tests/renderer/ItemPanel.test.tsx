// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ItemPanel } from '../../src/renderer/src/features/items/ItemPanel'
import type { ItemApi } from '../../src/shared/item-contract'
import type { RetentionChanged } from '../../src/shared/retention-contract'
import {
  itemApi010Defaults,
  itemContent,
  itemAssistantA,
  itemAssistantB,
  itemId,
  itemProposal,
  itemPermissions,
  itemRecord,
  itemReceipt,
  proposalId
} from './item-api-fixture'

afterEach(cleanup)

describe('ItemPanel', () => {
  it('keeps proposals outside the formal count and binds acceptance to the displayed version', async () => {
    const api = itemApi010Defaults()
    render(<ItemPanel assistantId={itemAssistantA} assistantName="日常助手" api={api} />)

    const panel = await screen.findByRole('region', { name: '事项与提案' })
    expect(panel).toHaveTextContent('日常助手 · 1 个正式事项')
    expect(screen.getByText('周五交报告')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: '待确认' }))
    const proposal = await screen.findByRole('article', { name: '待确认提案：考虑预约牙医' })
    expect(within(proposal).getByText('建议，尚未成为正式事项')).toBeInTheDocument()
    expect(panel).toHaveTextContent('日常助手 · 1 个正式事项')

    fireEvent.click(within(proposal).getByRole('button', { name: '接受为正式事项' }))
    await waitFor(() =>
      expect(api.proposalAction).toHaveBeenCalledWith(
        expect.objectContaining({
          assistantId: itemAssistantA,
          id: proposalId,
          expectedVersion: 3,
          action: 'accept'
        })
      )
    )
    expect(within(proposal).getByRole('button', { name: '接受为正式事项' })).toBeDisabled()
  })

  it('ignores an old assistant query and keeps the same command for unknown-result verification', async () => {
    let resolveOld!: (value: Awaited<ReturnType<ItemApi['query']>>) => void
    const api = itemApi010Defaults()
    api.query = vi.fn((input) => {
      if (input.assistantId === itemAssistantA)
        return new Promise((resolve) => {
          resolveOld = resolve
        })
      return Promise.resolve({
        ok: true as const,
        data: { items: [], proposals: [], nextCursor: null, formalCount: 0 }
      })
    }) as ItemApi['query']
    let rejectMutation = true
    api.mutate = vi.fn(async (input) => {
      if (rejectMutation) throw new Error('synthetic lost receipt')
      return { ok: true as const, data: itemReceipt({ operationId: input.commandId }) }
    })
    const check = vi.mocked(api.operation)
    const view = render(<ItemPanel assistantId={itemAssistantA} assistantName="Alpha" api={api} />)
    await waitFor(() =>
      expect(api.query).toHaveBeenCalledWith(
        expect.objectContaining({ assistantId: itemAssistantA })
      )
    )
    view.rerender(<ItemPanel assistantId={itemAssistantB} assistantName="Beta" api={api} />)
    const panel = await screen.findByRole('region', { name: '事项与提案' })
    await waitFor(() => expect(panel).toHaveTextContent('Beta · 0 个正式事项'))
    await act(async () => {
      resolveOld({
        ok: true,
        data: {
          items: [],
          proposals: [
            itemProposal({ candidate: { ...itemProposal().candidate, title: 'A 的旧提案' } })
          ],
          nextCursor: null,
          formalCount: 99
        }
      })
    })
    expect(panel).not.toHaveTextContent('99 个正式事项')
    expect(screen.queryByText('A 的旧提案')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('事项标题'), { target: { value: 'Beta 新任务' } })
    fireEvent.click(screen.getByRole('button', { name: '创建正式事项' }))
    expect(await screen.findByText(/写入回执未确认/)).toBeInTheDocument()
    const commandId = vi.mocked(api.mutate).mock.calls[0]![0].commandId
    fireEvent.click(screen.getByRole('button', { name: '核查本地状态' }))
    await waitFor(() =>
      expect(check).toHaveBeenCalledWith({
        protocolVersion: 1,
        assistantId: itemAssistantB,
        commandId
      })
    )
    rejectMutation = false
  })

  it('shows the exact delete preview and does not confirm before the local choice', async () => {
    const api = itemApi010Defaults()
    render(<ItemPanel assistantId={itemAssistantA} assistantName="日常助手" api={api} />)
    const item = await screen.findByRole('article', { name: '正式事项：周五交报告' })
    fireEvent.click(within(item).getByRole('button', { name: '查看与编辑' }))
    fireEvent.click(await screen.findByRole('button', { name: '永久删除此事项' }))

    const confirmation = await screen.findByRole('region', { name: '事项删除确认' })
    expect(confirmation).toHaveTextContent('周五交报告')
    expect(confirmation).toHaveTextContent('1 个关联事项不会被级联删除')
    expect(api.confirm).not.toHaveBeenCalled()
    fireEvent.click(within(confirmation).getByRole('button', { name: '取消' }))
    await waitFor(() =>
      expect(api.confirm).toHaveBeenCalledWith(expect.objectContaining({ accept: false }))
    )
  })

  it('recovers the original pending confirmation manifest before retrying a lost preview', async () => {
    const api = itemApi010Defaults()
    const originalPreview = api.preview
    const seeded = await originalPreview({
      protocolVersion: 1,
      assistantId: itemAssistantA,
      commandId: '00000000-0000-4000-8000-000000000399',
      action: 'delete',
      targets: [{ id: itemId, expectedVersion: 2 }]
    })
    if (!seeded.ok) throw new Error('fixture preview failed')
    api.preview = vi.fn(async (input) => {
      if (input.action !== 'recover') throw new Error('synthetic lost preview receipt')
      return {
        ok: true as const,
        data: {
          ...seeded.data,
          receipt: { ...seeded.data.receipt, operationId: input.commandId }
        }
      }
    }) as ItemApi['preview']
    api.operation = vi.fn(async (input) => ({
      ok: true as const,
      data: itemReceipt({
        operationId: input.commandId,
        state: 'PENDING_CONFIRMATION',
        confirmationId: seeded.data.confirmationId,
        summary: '原删除范围仍等待确认'
      })
    }))
    render(<ItemPanel assistantId={itemAssistantA} assistantName="Alpha" api={api} />)
    const item = await screen.findByRole('article', { name: '正式事项：周五交报告' })
    fireEvent.click(within(item).getByRole('button', { name: '查看与编辑' }))
    const deleteButton = await screen.findByRole('button', { name: '永久删除此事项' })
    fireEvent.click(deleteButton)
    expect(await screen.findByText(/确认预览结果未知/)).toBeInTheDocument()
    const commandId = vi.mocked(api.preview).mock.calls[0]![0].commandId

    fireEvent.click(deleteButton)
    await waitFor(() =>
      expect(api.operation).toHaveBeenCalledWith({
        protocolVersion: 1,
        assistantId: itemAssistantA,
        commandId
      })
    )
    expect(api.preview).toHaveBeenLastCalledWith({
      protocolVersion: 1,
      assistantId: itemAssistantA,
      commandId,
      action: 'recover'
    })
    expect(await screen.findByRole('region', { name: '事项删除确认' })).toHaveTextContent(
      '周五交报告'
    )
  })

  it('requires a trusted replacement preview before removing links', async () => {
    const api = itemApi010Defaults()
    const relatedId = '00000000-0000-4000-8000-000000000102'
    const linked = itemRecord({ content: itemContent({ relatedIds: [relatedId] }) })
    api.query = vi.fn(async (input) => ({
      ok: true as const,
      data: {
        items: input.view === 'items' ? [linked] : [],
        proposals: [],
        nextCursor: null,
        formalCount: 1
      }
    }))
    api.inspect = vi.fn(async () => ({
      ok: true as const,
      data: { item: linked, proposal: null, receipts: [] }
    }))
    api.preview = vi.fn(async (input) => ({
      ok: true as const,
      data: {
        confirmationId: '00000000-0000-4000-8000-000000000401',
        receipt: itemReceipt({
          operationId: input.commandId,
          state: 'PENDING_CONFIRMATION',
          confirmationId: '00000000-0000-4000-8000-000000000401',
          summary: '将移除已有事项关联'
        }),
        targets: [linked],
        relatedItemIds: [relatedId],
        replacementContent: input.content
      }
    }))
    render(<ItemPanel assistantId={itemAssistantA} assistantName="Alpha" api={api} />)
    const item = await screen.findByRole('article', { name: '正式事项：周五交报告' })
    fireEvent.click(within(item).getByRole('button', { name: '查看与编辑' }))
    const detail = await screen.findByRole('region', { name: '事项详情' })
    fireEvent.change(within(detail).getByLabelText('相关事项 ID'), { target: { value: '' } })
    fireEvent.change(within(detail).getByLabelText('事项说明'), {
      target: { value: '移除关联时也更新说明' }
    })
    fireEvent.click(within(detail).getByRole('button', { name: '保存修改' }))

    await waitFor(() =>
      expect(api.preview).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'replace-links',
          targets: [{ id: itemId, expectedVersion: 2 }],
          content: expect.objectContaining({
            description: '移除关联时也更新说明',
            relatedIds: []
          })
        })
      )
    )
    expect(api.mutate).not.toHaveBeenCalled()
    const confirmation = screen.getByRole('region', { name: '事项关联变更确认' })
    expect(confirmation).toHaveTextContent(`原值：${relatedId}`)
    expect(confirmation).toHaveTextContent('新值：无')
    expect(confirmation).toHaveTextContent('原值：整理最终版本并提交')
    expect(confirmation).toHaveTextContent('新值：移除关联时也更新说明')
    fireEvent.click(within(confirmation).getByRole('button', { name: '确认移除关联并保存' }))
    await waitFor(() => expect(api.confirm).toHaveBeenCalledTimes(1))
  })

  it('preserves the original offset, seconds, and milliseconds when editing another field', async () => {
    const api = itemApi010Defaults()
    const exactDueAt = '2026-09-12T15:04:05.678+08:00'
    const timed = itemRecord({
      content: itemContent({ dueAt: exactDueAt, timeZone: 'Asia/Shanghai' })
    })
    api.query = vi.fn(async (input) => ({
      ok: true as const,
      data: {
        items: input.view === 'items' ? [timed] : [],
        proposals: [],
        nextCursor: null,
        formalCount: 1
      }
    }))
    api.inspect = vi.fn(async () => ({
      ok: true as const,
      data: { item: timed, proposal: null, receipts: [] }
    }))
    render(<ItemPanel assistantId={itemAssistantA} assistantName="Alpha" api={api} />)
    const item = await screen.findByRole('article', { name: '正式事项：周五交报告' })
    fireEvent.click(within(item).getByRole('button', { name: '查看与编辑' }))
    const detail = await screen.findByRole('region', { name: '事项详情' })
    fireEvent.change(within(detail).getByLabelText('编辑标题'), { target: { value: '只改标题' } })
    fireEvent.click(within(detail).getByRole('button', { name: '保存修改' }))
    await waitFor(() =>
      expect(api.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          mutation: expect.objectContaining({
            action: 'update',
            content: expect.objectContaining({
              title: '只改标题',
              dueAt: exactDueAt,
              timeZone: 'Asia/Shanghai'
            })
          })
        })
      )
    )
  })

  it('keeps a non-body command identity across remounts and checks it before any redispatch', async () => {
    const registry = new Map<string, string>()
    const api = itemApi010Defaults()
    api.mutate = vi.fn(async () => {
      throw new Error('synthetic lost receipt after commit')
    })
    api.operation = vi.fn(async (input) => ({
      ok: true as const,
      data: itemReceipt({ operationId: input.commandId, summary: '已核查：任务此前已创建' })
    }))
    const panel = (key: string) => (
      <ItemPanel
        key={key}
        assistantId={itemAssistantA}
        assistantName="Alpha"
        api={api}
        pendingCommands={registry}
      />
    )
    const fill = (): void => {
      fireEvent.change(screen.getByLabelText('事项标题'), { target: { value: '私密待办正文' } })
      fireEvent.click(screen.getByRole('button', { name: '创建正式事项' }))
    }
    const view = render(panel('before'))
    fill()
    expect(await screen.findByText(/写入回执未确认/)).toBeInTheDocument()
    const firstCommandId = vi.mocked(api.mutate).mock.calls[0]![0].commandId
    expect(registry).toHaveLength(1)
    expect([...registry.keys()][0]).not.toContain('私密待办正文')

    view.rerender(panel('after'))
    fill()
    await waitFor(() => expect(api.operation).toHaveBeenCalledTimes(1))
    expect(api.operation).toHaveBeenCalledWith({
      protocolVersion: 1,
      assistantId: itemAssistantA,
      commandId: firstCommandId
    })
    expect(api.mutate).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('已核查：任务此前已创建')).toBeInTheDocument()
    expect(registry).toHaveLength(0)
  })

  it('drops private UI state and ignores a late success after a governance epoch change', async () => {
    const registry = new Map<string, string>()
    let finish!: (value: Awaited<ReturnType<ItemApi['mutate']>>) => void
    const api = itemApi010Defaults()
    api.mutate = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    ) as ItemApi['mutate']
    const changed = (epoch: number): RetentionChanged => ({
      epoch,
      assistantIds: [itemAssistantA],
      memoryIds: [],
      requestIds: [],
      reason: 'cleanup'
    })
    const view = render(
      <ItemPanel
        assistantId={itemAssistantA}
        assistantName="Alpha"
        api={api}
        pendingCommands={registry}
      />
    )
    fireEvent.change(screen.getByLabelText('事项标题'), { target: { value: '清理前私密任务' } })
    fireEvent.click(screen.getByRole('button', { name: '创建正式事项' }))
    await waitFor(() => expect(api.mutate).toHaveBeenCalledTimes(1))
    const commandId = vi.mocked(api.mutate).mock.calls[0]![0].commandId
    view.rerender(
      <ItemPanel
        assistantId={itemAssistantA}
        assistantName="Alpha"
        api={api}
        pendingCommands={registry}
        retentionChange={changed(9)}
      />
    )
    await waitFor(() => expect(screen.getByLabelText('事项标题')).toHaveValue(''))
    expect(screen.queryByText('清理前私密任务')).not.toBeInTheDocument()
    await act(async () => {
      finish({
        ok: true,
        data: itemReceipt({ operationId: commandId, summary: '迟到成功不应显示' })
      })
    })
    expect(screen.queryByText('迟到成功不应显示')).not.toBeInTheDocument()
    expect(registry).toHaveLength(1)
  })
  it('keeps local item management available while model item permissions remain denied', async () => {
    const api = itemApi010Defaults()
    api.permissions = vi.fn(async (input) => ({
      ok: true as const,
      data: itemPermissions({
        assistantId: input.assistantId,
        read: false,
        write: false,
        propose: false,
        receive: false
      })
    }))
    render(<ItemPanel assistantId={itemAssistantA} assistantName="Alpha" api={api} />)

    fireEvent.click(await screen.findByText('事项权限与实际接收方'))
    expect(screen.getByLabelText('允许此助手执行明确的事项写入')).not.toBeChecked()
    expect(screen.getByLabelText('允许此助手保存待确认建议')).not.toBeChecked()

    const item = await screen.findByRole('article', { name: '正式事项：周五交报告' })
    fireEvent.click(within(item).getByRole('button', { name: '查看与编辑' }))
    expect(await screen.findByRole('button', { name: '保存修改' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '标为已完成' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '永久删除此事项' })).toBeEnabled()

    fireEvent.change(screen.getByLabelText('事项标题'), { target: { value: '本地明确创建' } })
    const create = screen.getByRole('button', { name: '创建正式事项' })
    expect(create).toBeEnabled()
    fireEvent.click(create)
    await waitFor(() => expect(api.mutate).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('tab', { name: '待确认' }))
    const proposal = await screen.findByRole('article', { name: '待确认提案：考虑预约牙医' })
    fireEvent.click(within(proposal).getByRole('button', { name: '查看与修改建议' }))
    expect(await screen.findByRole('button', { name: '保存建议修改' })).toBeEnabled()
  })

  it('keeps a non-discuss proposal command when governance hides a late success', async () => {
    const registry = new Map<string, string>()
    let finish!: (value: Awaited<ReturnType<ItemApi['proposalAction']>>) => void
    const api = itemApi010Defaults()
    api.proposalAction = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    ) as ItemApi['proposalAction']
    const view = render(
      <ItemPanel
        assistantId={itemAssistantA}
        assistantName="Alpha"
        api={api}
        pendingCommands={registry}
      />
    )
    fireEvent.click(await screen.findByRole('tab', { name: '待确认' }))
    const proposal = await screen.findByRole('article', { name: '待确认提案：考虑预约牙医' })
    fireEvent.click(within(proposal).getByRole('button', { name: '接受为正式事项' }))
    await waitFor(() => expect(api.proposalAction).toHaveBeenCalledTimes(1))
    const commandId = vi.mocked(api.proposalAction).mock.calls[0]![0].commandId

    view.rerender(
      <ItemPanel
        assistantId={itemAssistantA}
        assistantName="Alpha"
        api={api}
        pendingCommands={registry}
        retentionChange={{
          epoch: 10,
          assistantIds: [itemAssistantA],
          memoryIds: [],
          requestIds: [],
          reason: 'cleanup'
        }}
      />
    )
    await act(async () => {
      finish({
        ok: true,
        data: itemReceipt({ operationId: commandId, summary: '迟到接受不应显示' })
      })
    })

    expect(screen.queryByText('迟到接受不应显示')).not.toBeInTheDocument()
    expect(registry).toHaveLength(1)
    expect([...registry.values()]).toContain(commandId)
  })
  it('shows every exact field change for a prepared formal item update and cancels without accepting', async () => {
    const api = itemApi010Defaults()
    const commandId = '00000000-0000-4000-8000-000000000398'
    const parentId = '00000000-0000-4000-8000-000000000501'
    const relatedIds = [
      '00000000-0000-4000-8000-000000000502',
      '00000000-0000-4000-8000-000000000503'
    ]
    const target = itemRecord()
    const replacement = itemContent({
      kind: 'commitment',
      title: '向客户交付最终报告',
      description: '包含评审意见与附件',
      status: 'active',
      dueAt: '2026-09-15T16:04:05.678+08:00',
      timeZone: 'Asia/Shanghai',
      parentId,
      relatedIds,
      counterpart: '客户代表'
    })
    api.preview = vi.fn(async (input) => ({
      ok: true as const,
      data: {
        confirmationId: '00000000-0000-4000-8000-000000000401',
        receipt: itemReceipt({
          operationId: input.commandId,
          objectId: itemId,
          objectVersion: 2,
          state: 'PENDING_CONFIRMATION',
          confirmationId: '00000000-0000-4000-8000-000000000401',
          summary: '将修改原正式事项，等待本地确认'
        }),
        targets: [target],
        relatedItemIds: relatedIds,
        replacementContent: replacement
      }
    }))
    render(
      <ItemPanel
        assistantId={itemAssistantA}
        assistantName="Alpha"
        api={api}
        recoveryTarget={{
          assistantId: itemAssistantA,
          commandId,
          nonce: 1,
          confirmationAction: 'replace-content'
        }}
      />
    )

    const confirmation = await screen.findByRole('region', { name: '事项修改确认' })
    expect(api.preview).toHaveBeenCalledWith({
      protocolVersion: 1,
      assistantId: itemAssistantA,
      commandId,
      action: 'recover'
    })
    expect(confirmation).toHaveTextContent(`对象 ${itemId} · 版本 2`)
    for (const expected of [
      '类型',
      '原值：任务',
      '新值：承诺',
      '标题',
      '新值：向客户交付最终报告',
      '说明',
      '新值：包含评审意见与附件',
      '状态',
      '原值：待办',
      '新值：履行中',
      '期限',
      '新值：2026-09-15T16:04:05.678+08:00',
      '时区',
      '新值：Asia/Shanghai',
      '父事项',
      `新值：${parentId}`,
      '相关事项',
      `新值：${relatedIds.join('、')}`,
      '相关对象',
      '新值：客户代表'
    ])
      expect(confirmation).toHaveTextContent(expected)
    expect(api.confirm).not.toHaveBeenCalled()

    fireEvent.click(within(confirmation).getByRole('button', { name: '取消' }))
    await waitFor(() =>
      expect(api.confirm).toHaveBeenCalledWith({
        protocolVersion: 1,
        assistantId: itemAssistantA,
        confirmationId: '00000000-0000-4000-8000-000000000401',
        accept: false
      })
    )
    expect(api.confirm).not.toHaveBeenCalledWith(expect.objectContaining({ accept: true }))
  })

  it('does not restore a delayed item update preview after governance invalidates the assistant', async () => {
    const registry = new Map<string, string>()
    const commandId = '00000000-0000-4000-8000-000000000397'
    let finish!: (value: Awaited<ReturnType<ItemApi['preview']>>) => void
    const api = itemApi010Defaults()
    api.preview = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    ) as ItemApi['preview']
    const view = render(
      <ItemPanel
        assistantId={itemAssistantA}
        assistantName="Alpha"
        api={api}
        pendingCommands={registry}
        recoveryTarget={{
          assistantId: itemAssistantA,
          commandId,
          nonce: 1,
          confirmationAction: 'replace-content'
        }}
      />
    )
    await waitFor(() => expect(api.preview).toHaveBeenCalledTimes(1))
    view.rerender(
      <ItemPanel
        assistantId={itemAssistantA}
        assistantName="Alpha"
        api={api}
        pendingCommands={registry}
        recoveryTarget={{
          assistantId: itemAssistantA,
          commandId,
          nonce: 1,
          confirmationAction: 'replace-content'
        }}
        retentionChange={{
          epoch: 11,
          assistantIds: [itemAssistantA],
          memoryIds: [],
          requestIds: [],
          reason: 'cleanup'
        }}
      />
    )
    await act(async () => {
      finish({
        ok: true,
        data: {
          confirmationId: '00000000-0000-4000-8000-000000000401',
          receipt: itemReceipt({
            operationId: commandId,
            state: 'PENDING_CONFIRMATION',
            confirmationId: '00000000-0000-4000-8000-000000000401'
          }),
          targets: [itemRecord()],
          relatedItemIds: [],
          replacementContent: itemContent({ description: '撤权后不得显示的内容' })
        }
      })
    })

    expect(screen.queryByRole('region', { name: '事项修改确认' })).not.toBeInTheDocument()
    expect(screen.queryByText('撤权后不得显示的内容')).not.toBeInTheDocument()
    expect([...registry.values()]).toContain(commandId)
  })
})
