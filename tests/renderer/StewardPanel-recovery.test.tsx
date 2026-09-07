// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StewardPanel } from '../../src/renderer/src/features/steward/StewardPanel'
import type { AssistantSnapshot } from '../../src/shared/assistant-contract'
import type { ProviderApi } from '../../src/shared/provider-contract'
import type { StewardApi, StewardChanged } from '../../src/shared/steward-contract'
import { memoryApi008Defaults } from './memory-api-fixture'
import { providerApi007Defaults } from './provider-api-fixture'
import {
  stewardApi013Defaults,
  stewardAssistantA,
  stewardBranch,
  stewardBranchId,
  stewardJob,
  stewardRecord,
  stewardSnapshot
} from './steward-api-fixture'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function assistants(): AssistantSnapshot {
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
      }
    ],
    currentAssistantId: stewardAssistantA,
    primaryAssistantId: stewardAssistantA,
    stateRevision: 1
  }
}

function provider(): ProviderApi {
  return {
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
}

function renderPanel(api: StewardApi): void {
  render(
    <StewardPanel
      assistantSnapshot={assistants()}
      api={api}
      memoryApi={memoryApi008Defaults()}
      providerApi={provider()}
    />
  )
}

describe('StewardPanel recovery controls', () => {
  it('downloads every Markdown page with one fixed branch version', async () => {
    const branch = stewardBranch({ title: '工作/方式' })
    const snapshot = stewardSnapshot(stewardAssistantA, { branches: [branch] })
    const api = stewardApi013Defaults(snapshot)
    api.branch = vi.fn(async (input) => ({
      ok: true as const,
      data:
        input.cursor === 0
          ? {
              branch,
              members: [stewardRecord()],
              conflicts: [],
              markdown: '# 第一页',
              nextCursor: 100
            }
          : {
              branch,
              members: [],
              conflicts: [],
              markdown: '# 第二页',
              nextCursor: null
            }
    }))
    const createObjectURL = vi.fn(() => 'blob:steward-export')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
    let downloadedName = ''
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      downloadedName = this.download
    })
    renderPanel(api)

    fireEvent.click(await screen.findByRole('button', { name: '下载完整分支 Markdown' }))
    expect(await screen.findByText('完整分支 Markdown 已下载。')).toBeInTheDocument()
    expect(api.branch).toHaveBeenNthCalledWith(1, {
      protocolVersion: 1,
      assistantId: stewardAssistantA,
      id: stewardBranchId,
      expectedVersion: 4,
      cursor: 0
    })
    expect(api.branch).toHaveBeenNthCalledWith(2, {
      protocolVersion: 1,
      assistantId: stewardAssistantA,
      id: stewardBranchId,
      expectedVersion: 4,
      cursor: 100
    })
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:steward-export')
    expect(downloadedName).toBe('工作_方式.md')
  })

  it('cancels an in-flight full export without leaving the control stuck', async () => {
    const branch = stewardBranch()
    const api = stewardApi013Defaults(stewardSnapshot(stewardAssistantA, { branches: [branch] }))
    let resolveBranch!: (value: Awaited<ReturnType<StewardApi['branch']>>) => void
    api.branch = vi.fn<StewardApi['branch']>(
      () =>
        new Promise((resolve) => {
          resolveBranch = resolve
        })
    )
    renderPanel(api)

    fireEvent.click(await screen.findByRole('button', { name: '下载完整分支 Markdown' }))
    fireEvent.click(await screen.findByRole('button', { name: '取消完整导出' }))
    expect(await screen.findByText('已取消完整分支导出。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下载完整分支 Markdown' })).toBeEnabled()
    await act(async () => {
      resolveBranch({
        ok: true,
        data: { branch, members: [], conflicts: [], markdown: '# 不应下载', nextCursor: null }
      })
      await Promise.resolve()
    })
    expect(screen.getByRole('button', { name: '下载完整分支 Markdown' })).toBeEnabled()
  })

  it('cancels an old-version export when a changed snapshot invalidates the branch', async () => {
    const originalBranch = stewardBranch({ version: 4 })
    const changedBranch = stewardBranch({ version: 5 })
    let snapshot = stewardSnapshot(stewardAssistantA, { branches: [originalBranch] })
    const api = stewardApi013Defaults(snapshot)
    let change!: (event: StewardChanged) => void
    api.onChanged = vi.fn((listener) => {
      change = listener
      return () => undefined
    })
    api.query = vi.fn(async () => ({ ok: true as const, data: snapshot }))
    let finish!: (value: Awaited<ReturnType<StewardApi['branch']>>) => void
    api.branch = vi.fn<StewardApi['branch']>(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const createObjectURL = vi.fn(() => 'blob:stale-export')
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    renderPanel(api)

    fireEvent.click(await screen.findByRole('button', { name: '下载完整分支 Markdown' }))
    await waitFor(() => expect(api.branch).toHaveBeenCalledTimes(1))
    snapshot = stewardSnapshot(stewardAssistantA, { branches: [changedBranch] })
    await act(async () => {
      change({ revision: 2 })
    })
    expect(await screen.findByText('分支 v5')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下载完整分支 Markdown' })).toBeEnabled()

    await act(async () => {
      finish({
        ok: true,
        data: {
          branch: originalBranch,
          members: [],
          conflicts: [],
          markdown: '# 已失效正文',
          nextCursor: null
        }
      })
    })
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('reuses the same retry-unknown command identity after a lost receipt', async () => {
    const job = stewardJob({ state: 'REMOTE_UNKNOWN' })
    const api = stewardApi013Defaults(stewardSnapshot(stewardAssistantA, { jobs: [job] }))
    api.control = vi.fn(async () => {
      throw new Error('lost receipt')
    })
    renderPanel(api)

    fireEvent.click(await screen.findByRole('button', { name: '核查后重试未知调用' }))
    await screen.findByText(/再次操作会复用同一命令身份/)
    fireEvent.click(screen.getByRole('button', { name: '核查后重试未知调用' }))
    await waitFor(() => expect(api.control).toHaveBeenCalledTimes(2))
    expect(vi.mocked(api.control).mock.calls[0]![0].commandId).toBe(
      vi.mocked(api.control).mock.calls[1]![0].commandId
    )
  })
})
