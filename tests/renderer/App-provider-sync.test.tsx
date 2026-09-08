// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/renderer/src/App'
import { providerApi007Defaults } from './provider-api-fixture'
import { memoryApi008Defaults } from './memory-api-fixture'
import { timelineApi006Defaults } from './timeline-api-fixture'
import type { AssistantApi, AssistantSnapshot } from '../../src/shared/assistant-contract'
import type { ProviderApi, ProviderSnapshot } from '../../src/shared/provider-contract'
import type { TimelineApi } from '../../src/shared/timeline-contract'
import type { MemoryApi } from '../../src/shared/memory-contract'

const assistantA = '00000000-0000-4000-8000-000000000001'
const assistantB = '00000000-0000-4000-8000-000000000002'
function assistants(currentAssistantId: string, revision: number): AssistantSnapshot {
  return {
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
      },
      {
        id: assistantB,
        displayName: 'Beta',
        persona: '',
        avatarKey: 'mashiro',
        isArchived: false,
        createdAt: '2026-09-06T00:00:01.000Z',
        updatedAt: '2026-09-06T00:00:01.000Z',
        archivedAt: null,
        version: 1
      }
    ],
    currentAssistantId,
    primaryAssistantId: assistantA,
    stateRevision: revision
  }
}
const providerSnapshot: ProviderSnapshot = {
  connections: [
    {
      id: '00000000-0000-4000-8000-000000000011',
      displayName: 'Receiver A',
      baseUrl: 'https://a.example/v1',
      enabled: true,
      hasCredential: true,
      credentialPersistence: 'temporary',
      createdAt: '2026-09-06T00:00:00.000Z',
      updatedAt: '2026-09-06T00:00:00.000Z',
      version: 1
    },
    {
      id: '00000000-0000-4000-8000-000000000012',
      displayName: 'Receiver B',
      baseUrl: 'https://b.example/v1',
      enabled: true,
      hasCredential: true,
      credentialPersistence: 'temporary',
      createdAt: '2026-09-06T00:00:01.000Z',
      updatedAt: '2026-09-06T00:00:01.000Z',
      version: 1
    }
  ],
  bindings: [
    {
      assistantId: assistantA,
      connectionId: '00000000-0000-4000-8000-000000000011',
      model: 'model-a',
      updatedAt: '2026-09-06T00:00:00.000Z',
      version: 1
    },
    {
      assistantId: assistantB,
      connectionId: '00000000-0000-4000-8000-000000000012',
      model: 'model-b',
      updatedAt: '2026-09-06T00:00:01.000Z',
      version: 1
    }
  ]
}

afterEach(cleanup)

describe('App assistant and Provider synchronization', () => {
  it('does not show an old assistant memory write receipt after switching assistants', async () => {
    let finishWrite!: (value: Awaited<ReturnType<MemoryApi['mutate']>>) => void
    const memory = memoryApi008Defaults()
    memory.mutate = vi.fn<MemoryApi['mutate']>(
      () =>
        new Promise((resolve) => {
          finishWrite = resolve
        })
    )
    const assistantApi = {
      list: vi.fn().mockResolvedValue({ ok: true, data: assistants(assistantA, 2) }),
      switch: vi.fn().mockResolvedValue({ ok: true, data: assistants(assistantB, 3) }),
      create: vi.fn(),
      rename: vi.fn(),
      setPrimary: vi.fn(),
      archive: vi.fn()
    } as AssistantApi
    const provider = {
      ...providerApi007Defaults(),
      list: vi.fn().mockResolvedValue({ ok: true, data: providerSnapshot }),
      onEvent: vi.fn(() => () => undefined)
    }
    const timeline = {
      ...timelineApi006Defaults(),
      saveTemporary: vi.fn(),
      read: vi.fn(async (input) => ({
        ok: true as const,
        data: { assistantId: input.assistantId, mode: input.mode, messages: [], hasMore: false }
      }))
    } as TimelineApi
    Object.defineProperty(window, 'mashiro', {
      configurable: true,
      value: { assistants: assistantApi, provider, timeline, memory }
    })
    render(<App />)
    await screen.findByText(/实际接收方：Receiver A/)
    fireEvent.click(screen.getByRole('button', { name: '记忆' }))
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: 'A待完成记忆' } })
    fireEvent.change(screen.getByLabelText('Markdown 正文'), { target: { value: 'A待完成正文' } })
    fireEvent.click(screen.getByRole('button', { name: '保存新记录' }))
    await waitFor(() => expect(memory.mutate).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: '对话' }))
    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    const betaAssistant = screen.getByRole('listitem', { name: '助手配置：Beta' })
    fireEvent.click(within(betaAssistant).getByRole('button', { name: '设为当前' }))
    await screen.findByText(/实际接收方：Receiver B/)
    fireEvent.click(screen.getByRole('button', { name: '记忆' }))
    expect(screen.getByLabelText('标题')).toHaveValue('')
    await act(async () => {
      finishWrite({
        ok: true,
        data: {
          operationId: '00000000-0000-4000-8000-000000000901',
          objectId: '00000000-0000-4000-8000-000000000902',
          objectVersion: 1,
          state: 'SUCCEEDED',
          summary: 'A迟到的写入回执',
          confirmationId: null
        }
      })
    })
    expect(screen.queryByText('A迟到的写入回执')).not.toBeInTheDocument()
    expect(screen.getByLabelText('标题')).toHaveValue('')
    expect(screen.getByText('当前助手：Beta')).toBeInTheDocument()
  })

  it('updates the Provider assistant and execution receiver after the real switch action', async () => {
    const assistantApi = {
      list: vi.fn().mockResolvedValue({ ok: true, data: assistants(assistantA, 2) }),
      switch: vi.fn().mockResolvedValue({ ok: true, data: assistants(assistantB, 3) }),
      create: vi.fn(),
      rename: vi.fn(),
      setPrimary: vi.fn(),
      archive: vi.fn()
    } as AssistantApi
    const providerApi = {
      ...providerApi007Defaults(),
      list: vi.fn().mockResolvedValue({ ok: true, data: providerSnapshot }),
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
        memory: memoryApi008Defaults(),
        provider: providerApi,
        timeline: timelineApi
      }
    })

    render(<App />)
    expect(screen.getByRole('button', { name: '对话' })).toHaveAttribute('aria-current', 'page')
    expect(document.querySelector("section[aria-label='记忆与事件页面']")).not.toBeVisible()
    const assistantSettings = document.querySelector("section[aria-label='助手与人设设置']")
    expect(assistantSettings).not.toBeVisible()
    expect(await screen.findByText(/实际接收方：Receiver A/)).toBeInTheDocument()
    const shellSwitcher = document.querySelector('.assistant-switcher select')
    expect(shellSwitcher).toHaveValue(assistantA)
    fireEvent.change(shellSwitcher!, { target: { value: assistantB } })
    expect(await screen.findByText(/实际接收方：Receiver B/)).toBeInTheDocument()
    expect(shellSwitcher).toHaveValue(assistantB)
    expect(assistantApi.switch).toHaveBeenCalledTimes(1)
  })

  it('keeps panels mounted and returns to the normal conversation when a memory source is opened', async () => {
    const sourceRoundId = '00000000-0000-4000-8000-000000000201'
    const memoryId = '00000000-0000-4000-8000-000000000301'
    const assistantApi = {
      list: vi.fn().mockResolvedValue({ ok: true, data: assistants(assistantA, 2) }),
      switch: vi.fn(),
      create: vi.fn(),
      rename: vi.fn(),
      setPrimary: vi.fn(),
      archive: vi.fn()
    } as AssistantApi
    const providerApi = {
      ...providerApi007Defaults(),
      list: vi.fn().mockResolvedValue({ ok: true, data: providerSnapshot }),
      saveConnection: vi.fn(),
      setCredential: vi.fn(),
      deleteCredential: vi.fn(),
      bindAssistant: vi.fn(),
      clearChat: vi.fn(),
      startChat: vi.fn(),
      cancelChat: vi.fn(),
      onEvent: vi.fn(() => () => undefined)
    } as ProviderApi
    const timelineQuery = vi.fn(async (input) => ({
      ok: true as const,
      data: { assistantId: input.assistantId, messages: [], nextCursor: null }
    }))
    const timelineApi = {
      ...timelineApi006Defaults(),
      read: vi.fn(async (input) => ({
        ok: true as const,
        data: { assistantId: input.assistantId, mode: input.mode, messages: [], hasMore: false }
      })),
      query: timelineQuery,
      saveTemporary: vi.fn()
    } as TimelineApi
    const memoryRecord = {
      id: memoryId,
      objectVersion: 1,
      kind: 'user' as const,
      scope: 'global' as const,
      ownerAssistantId: assistantA,
      title: '来源跳转测试',
      markdown: '正文',
      nature: 'user-statement' as const,
      event: null,
      state: 'active' as const,
      retention: 'persistent' as const,
      createdAt: '2026-09-06T00:00:00.000Z',
      updatedAt: '2026-09-06T00:00:00.000Z',
      sources: [
        { type: 'user-round' as const, id: sourceRoundId, assistantId: assistantA, version: 0 }
      ]
    }
    const memoryQuery = vi.fn(async () => ({
      ok: true as const,
      data: { records: [memoryRecord], nextCursor: null }
    }))
    const memoryApi = {
      ...memoryApi008Defaults(),
      query: memoryQuery,
      inspect: vi.fn(async () => ({
        ok: true as const,
        data: {
          record: memoryRecord,
          changes: [],
          receipts: [],
          providedToRequests: [],
          cleanupPending: false,
          organizationPending: false
        }
      }))
    }
    Object.defineProperty(window, 'mashiro', {
      configurable: true,
      value: {
        assistants: assistantApi,
        memory: memoryApi,
        provider: providerApi,
        timeline: timelineApi
      }
    })

    render(<App />)
    await waitFor(() => expect(memoryQuery).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: '记忆' }))
    await waitFor(() => expect(memoryQuery.mock.calls.length).toBeGreaterThanOrEqual(2))
    expect(document.querySelector("section[aria-label='对话与模型连接页面']")).not.toBeVisible()
    fireEvent.click(await screen.findByRole('button', { name: '查看与纠正' }))
    fireEvent.click(await screen.findByText('来源与变更'))
    fireEvent.click(screen.getByRole('button', { name: '定位原轮次' }))

    expect(screen.getByRole('button', { name: '对话' })).toHaveAttribute('aria-current', 'page')
    expect(document.querySelector("section[aria-label='记忆与事件页面']")).not.toBeVisible()
    await waitFor(() =>
      expect(timelineQuery).toHaveBeenCalledWith({
        protocolVersion: 1,
        assistantId: assistantA,
        requestId: sourceRoundId
      })
    )
  })
})
