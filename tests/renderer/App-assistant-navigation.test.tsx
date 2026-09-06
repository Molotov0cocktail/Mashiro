// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/renderer/src/App'
import type { AssistantApi, AssistantSnapshot } from '../../src/shared/assistant-contract'
import type { ProviderApi } from '../../src/shared/provider-contract'
import type { TimelineApi } from '../../src/shared/timeline-contract'
import { itemApi010Defaults, itemPermissions } from './item-api-fixture'
import { memoryApi008Defaults } from './memory-api-fixture'
import { providerApi007Defaults } from './provider-api-fixture'
import { timelineApi006Defaults } from './timeline-api-fixture'

const assistantA = '00000000-0000-4000-8000-000000000001'
const assistantB = '00000000-0000-4000-8000-000000000002'

function assistants(currentAssistantId: string, stateRevision: number): AssistantSnapshot {
  return {
    assistants: [
      {
        id: assistantA,
        displayName: 'Alpha',
        persona: 'Alpha persona',
        avatarKey: 'leaf',
        isArchived: false,
        createdAt: '2026-09-07T00:00:00.000Z',
        updatedAt: '2026-09-07T00:00:00.000Z',
        archivedAt: null,
        version: 1
      },
      {
        id: assistantB,
        displayName: 'Beta',
        persona: 'Beta persona',
        avatarKey: 'moon',
        isArchived: false,
        createdAt: '2026-09-07T00:00:01.000Z',
        updatedAt: '2026-09-07T00:00:01.000Z',
        archivedAt: null,
        version: 1
      }
    ],
    currentAssistantId,
    primaryAssistantId: assistantA,
    stateRevision
  }
}

function installApis(assistantApi: AssistantApi, itemApi = itemApi010Defaults()): void {
  const providerApi = {
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
  } as ProviderApi
  const timelineApi = {
    ...timelineApi006Defaults(),
    read: vi.fn(async (input) => ({
      ok: true as const,
      data: { assistantId: input.assistantId, mode: input.mode, messages: [], hasMore: false }
    })),
    saveTemporary: vi.fn()
  } as TimelineApi
  Object.defineProperty(window, 'mashiro', {
    configurable: true,
    value: {
      assistants: assistantApi,
      provider: providerApi,
      timeline: timelineApi,
      memory: memoryApi008Defaults(),
      items: itemApi
    }
  })
}

afterEach(cleanup)

describe('App assistant configuration navigation', () => {
  it('switches first and focuses the real item permission controls after their trusted data arrives', async () => {
    const itemApi = itemApi010Defaults()
    let resolveBetaPermissions!: (value: Awaited<ReturnType<typeof itemApi.permissions>>) => void
    itemApi.permissions = vi.fn<typeof itemApi.permissions>((input) => {
      if (input.assistantId === assistantA) {
        return Promise.resolve({
          ok: true as const,
          data: itemPermissions({ assistantId: assistantA })
        })
      }
      return new Promise((resolve) => {
        resolveBetaPermissions = resolve
      })
    })
    const assistantApi = {
      list: vi.fn(async () => ({ ok: true as const, data: assistants(assistantA, 2) })),
      switch: vi.fn(async () => ({ ok: true as const, data: assistants(assistantB, 3) })),
      create: vi.fn(),
      rename: vi.fn(),
      setPrimary: vi.fn(),
      archive: vi.fn()
    } as AssistantApi
    installApis(assistantApi, itemApi)

    render(<App />)
    fireEvent.click(screen.getByText('助手管理'))
    const beta = await screen.findByRole('listitem', { name: '助手配置：Beta' })
    fireEvent.click(within(beta).getByRole('button', { name: '设为当前并打开事项授权' }))

    await waitFor(() =>
      expect(assistantApi.switch).toHaveBeenCalledWith({
        protocolVersion: 1,
        assistantId: assistantB,
        expectedStateRevision: 2
      })
    )
    expect(await screen.findByRole('tab', { name: '事项' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(document.getElementById('item-permissions')).not.toHaveAttribute('open')
    expect(document.activeElement?.id).not.toBe('item-permissions')

    await act(async () => {
      resolveBetaPermissions({
        ok: true,
        data: itemPermissions({ assistantId: assistantB, endpointDisplay: 'Receiver B' })
      })
    })
    await waitFor(() => expect(document.activeElement?.id).toBe('item-permissions'))
    expect(document.getElementById('item-permissions')).toHaveAttribute('open')
    expect(vi.mocked(assistantApi.switch).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(itemApi.permissions).mock.invocationCallOrder.at(-1)!
    )
  })

  it('ignores an old switch failure after a newer current-assistant navigation wins', async () => {
    let rejectSwitch!: (reason?: unknown) => void
    const assistantApi = {
      list: vi.fn(async () => ({ ok: true as const, data: assistants(assistantA, 2) })),
      switch: vi.fn(
        () =>
          new Promise((_resolve, reject) => {
            rejectSwitch = reject
          })
      ),
      create: vi.fn(),
      rename: vi.fn(),
      setPrimary: vi.fn(),
      archive: vi.fn()
    } as AssistantApi
    installApis(assistantApi)

    render(<App />)
    fireEvent.click(screen.getByText('助手管理'))
    const beta = await screen.findByRole('listitem', { name: '助手配置：Beta' })
    const alpha = screen.getByRole('listitem', { name: '助手配置：Alpha' })
    fireEvent.click(within(beta).getByRole('button', { name: '设为当前并打开Provider 与模型' }))
    await waitFor(() => expect(assistantApi.switch).toHaveBeenCalledTimes(1))
    fireEvent.click(within(alpha).getByRole('button', { name: '打开记忆与个人事件授权' }))
    expect(screen.getByRole('tab', { name: '记忆与事件' })).toHaveAttribute('aria-selected', 'true')

    await act(async () => {
      rejectSwitch(new Error('late switch failure'))
      await Promise.resolve()
    })
    expect(screen.getByRole('tab', { name: '记忆与事件' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByText('无法切换到目标助手，当前页面状态已保留。')).not.toBeInTheDocument()
    expect(
      screen.queryByText('未能打开Provider 与模型，当前页面状态已保留。')
    ).not.toBeInTheDocument()
  })

  it('does not replay a consumed history focus on an unrelated parent snapshot update', async () => {
    const changed = assistants(assistantA, 3)
    changed.primaryAssistantId = assistantB
    const assistantApi = {
      list: vi.fn(async () => ({ ok: true as const, data: assistants(assistantA, 2) })),
      switch: vi.fn(),
      create: vi.fn(),
      rename: vi.fn(),
      setPrimary: vi.fn(async () => ({ ok: true as const, data: changed })),
      archive: vi.fn()
    } as AssistantApi
    installApis(assistantApi)

    render(<App />)
    fireEvent.click(screen.getByText('助手管理'))
    const alpha = await screen.findByRole('listitem', { name: '助手配置：Alpha' })
    fireEvent.click(within(alpha).getByRole('button', { name: '打开对话历史授权' }))
    await waitFor(() => expect(document.activeElement?.id).toBe('history-permissions'))
    fireEvent.click(screen.getByRole('radio', { name: '严格临时（不自动保存）' }))
    expect(screen.getByRole('radio', { name: '严格临时（不自动保存）' })).toBeChecked()

    const beta = screen.getByRole('listitem', { name: '助手配置：Beta' })
    fireEvent.click(within(beta).getByRole('button', { name: '设为主要' }))
    await waitFor(() => expect(assistantApi.setPrimary).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('radio', { name: '严格临时（不自动保存）' })).toBeChecked()
  })

  it('does not replay a consumed history focus after switching away and back', async () => {
    const assistantApi = {
      list: vi.fn(async () => ({ ok: true as const, data: assistants(assistantA, 2) })),
      switch: vi.fn(async (input) => ({
        ok: true as const,
        data:
          input.assistantId === assistantB ? assistants(assistantB, 3) : assistants(assistantA, 4)
      })),
      create: vi.fn(),
      rename: vi.fn(),
      setPrimary: vi.fn(),
      archive: vi.fn()
    } as AssistantApi
    installApis(assistantApi)

    render(<App />)
    fireEvent.click(screen.getByText('助手管理'))
    const alpha = await screen.findByRole('listitem', { name: '助手配置：Alpha' })
    const beta = screen.getByRole('listitem', { name: '助手配置：Beta' })
    fireEvent.click(within(alpha).getByRole('button', { name: '打开对话历史授权' }))
    await waitFor(() => expect(document.activeElement?.id).toBe('history-permissions'))
    fireEvent.click(screen.getByRole('radio', { name: '严格临时（不自动保存）' }))

    fireEvent.click(within(beta).getByRole('button', { name: '设为当前' }))
    await waitFor(() => expect(screen.getByText('当前助手：Beta')).toBeInTheDocument())
    const refreshedAlpha = screen.getByRole('listitem', { name: '助手配置：Alpha' })
    fireEvent.click(within(refreshedAlpha).getByRole('button', { name: '设为当前' }))
    await waitFor(() => expect(screen.getByText('当前助手：Alpha')).toBeInTheDocument())

    expect(screen.getByRole('radio', { name: '严格临时（不自动保存）' })).toBeChecked()
    expect(assistantApi.switch).toHaveBeenCalledTimes(2)
  })

  it.each(['resolve', 'reject'] as const)(
    'keeps an explicit primary-tab choice when an older switch later %s',
    async (settlement) => {
      let resolveSwitch!: (value: Awaited<ReturnType<AssistantApi['switch']>>) => void
      let rejectSwitch!: (reason?: unknown) => void
      const assistantApi = {
        list: vi.fn(async () => ({ ok: true as const, data: assistants(assistantA, 2) })),
        switch: vi.fn(
          () =>
            new Promise((resolve, reject) => {
              resolveSwitch = resolve
              rejectSwitch = reject
            })
        ),
        create: vi.fn(),
        rename: vi.fn(),
        setPrimary: vi.fn(),
        archive: vi.fn()
      } as AssistantApi
      installApis(assistantApi)

      render(<App />)
      fireEvent.click(screen.getByText('助手管理'))
      const beta = await screen.findByRole('listitem', { name: '助手配置：Beta' })
      fireEvent.click(within(beta).getByRole('button', { name: '设为当前并打开Provider 与模型' }))
      await waitFor(() => expect(assistantApi.switch).toHaveBeenCalledTimes(1))
      fireEvent.click(screen.getByRole('tab', { name: '保留与清理' }))

      await act(async () => {
        if (settlement === 'resolve') {
          resolveSwitch({ ok: true, data: assistants(assistantB, 3) })
        } else {
          rejectSwitch(new Error('late switch failure'))
        }
        await Promise.resolve()
      })
      expect(screen.getByRole('tab', { name: '保留与清理' })).toHaveAttribute(
        'aria-selected',
        'true'
      )
      expect(screen.queryByText('无法切换到目标助手，当前页面状态已保留。')).not.toBeInTheDocument()
      expect(
        screen.queryByText('未能打开Provider 与模型，当前页面状态已保留。')
      ).not.toBeInTheDocument()
    }
  )
})
