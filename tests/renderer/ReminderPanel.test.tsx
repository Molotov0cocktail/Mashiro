// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ReminderPanel,
  resolveWallClock
} from '../../src/renderer/src/features/reminders/ReminderPanel'
import type { ReminderApi, ReminderRecord } from '../../src/shared/reminder-contract'
import {
  itemApi010Defaults,
  itemAssistantA,
  itemAssistantB,
  itemContent,
  itemRecord
} from './item-api-fixture'
import {
  reminderApi012Defaults,
  reminderRecord,
  reminderReceipt,
  reminderRuntime
} from './reminder-api-fixture'

afterEach(cleanup)

describe('ReminderPanel', () => {
  it('resolves normal wall clocks exactly and requires an explicit choice for DST overlap', () => {
    expect(resolveWallClock('2026-09-12T09:30:00', 'Asia/Shanghai')).toEqual([
      { dueAt: '2026-09-12T09:30:00+08:00', offsetLabel: 'UTC+08:00' }
    ])
    expect(resolveWallClock('2026-03-08T02:30:00', 'America/New_York')).toEqual([])
    expect(resolveWallClock('2026-11-01T01:30:00', 'America/New_York')).toEqual([
      { dueAt: '2026-11-01T01:30:00-04:00', offsetLabel: 'UTC-04:00' },
      { dueAt: '2026-11-01T01:30:00-05:00', offsetLabel: 'UTC-05:00' }
    ])
  })

  it('creates from a formal item with a visible wall clock and never infers from its due date', async () => {
    const api = reminderApi012Defaults()
    const item = itemRecord({
      content: itemContent({
        dueAt: '2026-09-20T18:00:00+08:00',
        timeZone: 'Asia/Shanghai'
      })
    })
    render(
      <ReminderPanel
        assistantId={itemAssistantA}
        assistantName="Alpha"
        api={api}
        itemApi={itemApi010Defaults()}
        item={item}
      />
    )

    expect(await screen.findByText(/事项期限不会自动成为提醒/)).toBeInTheDocument()
    await waitFor(() => expect(api.query).toHaveBeenCalled())
    expect(screen.getByLabelText('提醒本地日期和时间')).toHaveValue('')
    fireEvent.change(screen.getByLabelText('提醒本地日期和时间'), {
      target: { value: '2026-09-12T09:30:00' }
    })
    fireEvent.change(screen.getByLabelText('提醒时区'), {
      target: { value: 'Asia/Shanghai' }
    })
    expect(await screen.findByText(/2026-09-12T09:30:00\+08:00/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '保存提醒' }))

    await waitFor(() =>
      expect(api.mutate).toHaveBeenCalledWith({
        protocolVersion: 1,
        assistantId: itemAssistantA,
        commandId: expect.any(String),
        mutation: {
          action: 'create',
          itemId: item.id,
          expectedItemVersion: item.version,
          dueAt: '2026-09-12T09:30:00+08:00',
          timeZone: 'Asia/Shanghai'
        }
      })
    )
  })

  it('shows honest delivery states and only saves an explicit catch-up policy after the user acts', async () => {
    const states: ReminderRecord['state'][] = [
      'SCHEDULED',
      'DISPLAY_OBSERVED',
      'RESULT_UNKNOWN',
      'FAILED',
      'RECOVERY_PENDING',
      'CANCELLED',
      'HANDLED'
    ]
    const records = states.map((state, index) =>
      reminderRecord({
        id: `00000000-0000-4000-8000-${String(600 + index).padStart(12, '0')}`,
        state
      })
    )
    const api = reminderApi012Defaults(records)
    render(
      <ReminderPanel
        assistantId={itemAssistantA}
        assistantName="Alpha"
        api={api}
        itemApi={itemApi010Defaults()}
      />
    )

    expect(await screen.findByText('计划中')).toBeInTheDocument()
    expect(screen.getByText('已观察到展示')).toBeInTheDocument()
    expect(screen.getByText('展示结果未知')).toBeInTheDocument()
    expect(screen.getByText('通知失败')).toBeInTheDocument()
    expect(screen.getByText('恢复待处理')).toBeInTheDocument()
    expect(screen.getByText('已取消')).toBeInTheDocument()
    expect(screen.getByText('已处理')).toBeInTheDocument()
    expect(screen.getByText(/这不代表你已阅读或处理/)).toBeInTheDocument()
    expect(screen.getByText(/明确退出 Mashiro 后不再承诺提醒/)).toBeInTheDocument()
    expect(api.configure).not.toHaveBeenCalled()

    fireEvent.click(screen.getByLabelText('使用我明确设置的补发规则'))
    fireEvent.change(screen.getByLabelText('补发窗口（分钟）'), { target: { value: '90' } })
    fireEvent.click(screen.getByLabelText('同次恢复时合并可补发提醒'))
    fireEvent.click(screen.getByRole('button', { name: '保存运行设置' }))
    await waitFor(() =>
      expect(api.configure).toHaveBeenCalledWith({
        protocolVersion: 1,
        expectedVersion: 0,
        policy: { mode: 'EXPLICIT', catchUpMinutes: 90, merge: true },
        loginStartup: false
      })
    )
  })

  it('keeps a mutation identity across remount and checks the prior result before redispatch', async () => {
    const registry = new Map<string, string>()
    const api = reminderApi012Defaults()
    api.mutate = vi.fn(async () => {
      throw new Error('synthetic lost receipt')
    })
    api.operation = vi.fn(async (input) => ({
      ok: true as const,
      data: reminderReceipt({ operationId: input.commandId, summary: '已核查：提醒此前已保存' })
    }))
    const item = itemRecord()
    const panel = (key: string) => (
      <ReminderPanel
        key={key}
        assistantId={itemAssistantA}
        assistantName="Alpha"
        api={api}
        itemApi={itemApi010Defaults()}
        item={item}
        pendingCommands={registry}
      />
    )
    const fill = (): void => {
      fireEvent.change(screen.getByLabelText('提醒本地日期和时间'), {
        target: { value: '2026-09-12T09:30:00' }
      })
      fireEvent.change(screen.getByLabelText('提醒时区'), {
        target: { value: 'Asia/Shanghai' }
      })
      fireEvent.click(screen.getByRole('button', { name: '保存提醒' }))
    }
    const view = render(panel('before'))
    fill()
    expect(await screen.findByText(/操作回执未确认/)).toBeInTheDocument()
    const originalCommandId = vi.mocked(api.mutate).mock.calls[0]![0].commandId
    expect(registry).toHaveLength(1)

    view.rerender(panel('after'))
    fill()
    await waitFor(() =>
      expect(api.operation).toHaveBeenCalledWith({
        protocolVersion: 1,
        assistantId: itemAssistantA,
        commandId: originalCommandId
      })
    )
    expect(api.mutate).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('已核查：提醒此前已保存')).toBeInTheDocument()
  })

  it('does not choose either repeated DST instant until the user selects its offset', async () => {
    const api = reminderApi012Defaults()
    render(
      <ReminderPanel
        assistantId={itemAssistantA}
        assistantName="Alpha"
        api={api}
        itemApi={itemApi010Defaults()}
        item={itemRecord()}
      />
    )
    await waitFor(() => expect(api.query).toHaveBeenCalled())
    fireEvent.change(screen.getByLabelText('提醒本地日期和时间'), {
      target: { value: '2026-11-01T01:30:00' }
    })
    fireEvent.change(screen.getByLabelText('提醒时区'), {
      target: { value: 'America/New_York' }
    })
    const choices = await screen.findByRole('group', { name: '这个时间出现两次，请明确选择' })
    expect(screen.getByRole('button', { name: '保存提醒' })).toBeDisabled()
    fireEvent.click(within(choices).getByLabelText(/UTC-05:00/))
    fireEvent.click(screen.getByRole('button', { name: '保存提醒' }))
    await waitFor(() =>
      expect(api.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          mutation: expect.objectContaining({ dueAt: '2026-11-01T01:30:00-05:00' })
        })
      )
    )
  })

  it('preserves a dirty settings draft and error across same-version background refreshes', async () => {
    let currentRuntime = reminderRuntime()
    const api = reminderApi012Defaults()
    api.query = vi.fn(async () => ({
      ok: true as const,
      data: { records: [], runtime: currentRuntime }
    }))
    api.configure = vi.fn(async () => ({
      ok: false as const,
      error: { code: 'STORAGE_UNAVAILABLE' as const, message: '合成保存失败' }
    }))
    const panel = (refreshKey: number) => (
      <ReminderPanel
        assistantId={itemAssistantA}
        assistantName="Alpha"
        api={api}
        itemApi={itemApi010Defaults()}
        refreshKey={refreshKey}
      />
    )
    const view = render(panel(0))
    fireEvent.click(await screen.findByLabelText('使用我明确设置的补发规则'))
    expect(screen.getByLabelText('补发窗口（分钟）')).toHaveValue(null)
    fireEvent.change(screen.getByLabelText('补发窗口（分钟）'), { target: { value: '90' } })
    fireEvent.click(screen.getByLabelText('同次恢复时合并可补发提醒'))
    fireEvent.click(screen.getByRole('button', { name: '保存运行设置' }))
    expect(await screen.findByText('合成保存失败')).toBeInTheDocument()

    view.rerender(panel(1))
    await waitFor(() => expect(api.query).toHaveBeenCalledTimes(2))
    expect(screen.getByLabelText('补发窗口（分钟）')).toHaveValue(90)
    expect(screen.getByLabelText('同次恢复时合并可补发提醒')).toBeChecked()
    expect(screen.getByText('合成保存失败')).toBeInTheDocument()

    currentRuntime = reminderRuntime({
      version: 1,
      policy: { mode: 'EXPLICIT', catchUpMinutes: 15, merge: false }
    })
    view.rerender(panel(2))
    expect(await screen.findByText(/本机运行设置已更新到版本 1/)).toBeInTheDocument()
    expect(screen.getByLabelText('补发窗口（分钟）')).toHaveValue(90)
    expect(screen.getByRole('button', { name: '保存运行设置' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '加载本机最新设置' }))
    expect(screen.getByLabelText('补发窗口（分钟）')).toHaveValue(15)
    expect(screen.getByLabelText('同次恢复时合并可补发提醒')).not.toBeChecked()
  })

  it('ignores a late query from the previous assistant even after switching A to B', async () => {
    let resolveOld!: (value: Awaited<ReturnType<ReminderApi['query']>>) => void
    const api = reminderApi012Defaults()
    api.query = vi.fn((input) => {
      if (input.assistantId === itemAssistantA)
        return new Promise((resolve) => {
          resolveOld = resolve
        })
      return Promise.resolve({
        ok: true as const,
        data: { records: [], runtime: reminderRuntime() }
      })
    }) as ReminderApi['query']
    const panel = (assistantId: string, name: string) => (
      <ReminderPanel
        assistantId={assistantId}
        assistantName={name}
        api={api}
        itemApi={itemApi010Defaults()}
      />
    )
    const view = render(panel(itemAssistantA, 'Alpha'))
    await waitFor(() =>
      expect(api.query).toHaveBeenCalledWith(
        expect.objectContaining({ assistantId: itemAssistantA })
      )
    )
    view.rerender(panel(itemAssistantB, 'Beta'))
    await screen.findByText(/Beta · 提醒由本机确定性运行/)
    await act(async () => {
      resolveOld({
        ok: true,
        data: {
          records: [reminderRecord({ state: 'FAILED' })],
          runtime: reminderRuntime()
        }
      })
    })
    expect(screen.queryByText('通知失败')).not.toBeInTheDocument()
    expect(screen.getByText('当前没有已保存提醒。')).toBeInTheDocument()
  })

  it('keeps an in-flight reminder mutation alive across a same-assistant record refresh', async () => {
    let finish!: (value: Awaited<ReturnType<ReminderApi['mutate']>>) => void
    const api = reminderApi012Defaults()
    api.mutate = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    ) as ReminderApi['mutate']
    const item = itemRecord()
    const itemApi = itemApi010Defaults()
    const panel = (refreshKey: number) => (
      <ReminderPanel
        assistantId={itemAssistantA}
        assistantName="Alpha"
        api={api}
        itemApi={itemApi}
        item={item}
        refreshKey={refreshKey}
      />
    )
    const view = render(panel(0))
    fireEvent.change(await screen.findByLabelText('提醒本地日期和时间'), {
      target: { value: '2026-09-12T09:30:00' }
    })
    fireEvent.change(screen.getByLabelText('提醒时区'), {
      target: { value: 'Asia/Shanghai' }
    })
    fireEvent.click(screen.getByRole('button', { name: '保存提醒' }))
    await waitFor(() => expect(api.mutate).toHaveBeenCalledTimes(1))

    view.rerender(panel(1))
    await act(async () => {
      finish({
        ok: true,
        data: reminderReceipt({ summary: '刷新期间保存的提醒已确认' })
      })
    })
    expect(await screen.findByText('刷新期间保存的提醒已确认')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('提醒本地日期和时间'), {
      target: { value: '2026-09-13T09:30:00' }
    })
    fireEvent.change(screen.getByLabelText('提醒时区'), {
      target: { value: 'Asia/Shanghai' }
    })
    expect(screen.getByRole('button', { name: '保存提醒' })).toBeEnabled()
  })

  it('keeps an in-flight settings receipt scoped across an ordinary runtime refresh', async () => {
    let finish!: (value: Awaited<ReturnType<ReminderApi['configure']>>) => void
    const api = reminderApi012Defaults()
    api.configure = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    ) as ReminderApi['configure']
    const itemApi = itemApi010Defaults()
    const panel = (refreshKey: number) => (
      <ReminderPanel
        assistantId={itemAssistantA}
        assistantName="Alpha"
        api={api}
        itemApi={itemApi}
        refreshKey={refreshKey}
      />
    )
    const view = render(panel(0))
    fireEvent.click(await screen.findByLabelText('使用我明确设置的补发规则'))
    fireEvent.change(screen.getByLabelText('补发窗口（分钟）'), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: '保存运行设置' }))
    await waitFor(() => expect(api.configure).toHaveBeenCalledTimes(1))

    view.rerender(panel(1))
    await act(async () => {
      finish({
        ok: true,
        data: reminderRuntime({
          version: 1,
          policy: { mode: 'EXPLICIT', catchUpMinutes: 30, merge: false }
        })
      })
    })
    expect(await screen.findByText('提醒运行设置已由本机服务确认。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存运行设置' })).toBeEnabled()
    expect(screen.getByLabelText('补发窗口（分钟）')).toHaveValue(30)
  })
})
