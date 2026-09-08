// @vitest-environment jsdom
import { createElement } from 'react'
import type { ProviderApi } from '../../src/shared/provider-contract'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { BackgroundPanel } from '../../src/renderer/src/features/background/BackgroundPanel'
import {
  backgroundApi013Defaults,
  backgroundAssistantA as A,
  backgroundAssistantB as B,
  backgroundSnapshot,
  backgroundChapter
} from './background-api-fixture'
import { providerApi007Defaults } from './provider-api-fixture'
afterEach(cleanup)
function deferred<T>() {
  let resolve!: (v: T) => void
  return {
    promise: new Promise<T>((r) => {
      resolve = r
    }),
    resolve: (v: T) => resolve(v)
  }
}

it('switching assistants during a pending configure does not leave the new assistant permanently busy', async () => {
  const user = userEvent.setup()
  const api = backgroundApi013Defaults()
  vi.mocked(api.query).mockImplementation(async (input) => ({
    ok: true,
    data: backgroundSnapshot(input.assistantId)
  }))
  const pending = deferred<Awaited<ReturnType<typeof api.configure>>>()
  vi.mocked(api.configure).mockReturnValue(pending.promise)
  const providers = {
    ...(providerApi007Defaults() as ProviderApi),
    list: vi.fn(async () => ({ ok: true as const, data: { connections: [], bindings: [] } }))
  }
  const element = (assistantId: string) =>
    createElement(BackgroundPanel, {
      assistantId,
      assistantName: assistantId,
      api,
      providerApi: providers,
      onUseChapters: () => undefined
    })
  const view = render(element(A))
  await screen.findByText('当前没有整理任务。')
  await user.type(screen.getByLabelText('整理使用的模型'), 'synthetic')
  await waitFor(() => expect(screen.getByRole('button', { name: '保存整理设置' })).toBeEnabled())
  await user.click(screen.getByRole('button', { name: '保存整理设置' }))
  expect(api.configure).toHaveBeenCalledTimes(1)
  view.rerender(element(B))
  await waitFor(() =>
    expect(api.query).toHaveBeenCalledWith(expect.objectContaining({ assistantId: B }))
  )
  await act(async () => pending.resolve({ ok: true, data: backgroundSnapshot(A) }))
  expect(screen.queryByRole('button', { name: '处理中…' })).not.toBeInTheDocument()
  await user.type(screen.getByLabelText('整理使用的模型'), 'another')
  expect(screen.getByRole('button', { name: '保存整理设置' })).toBeEnabled()
})

it('does not redisplay a deferred chapter body after its chapter becomes unavailable', async () => {
  const user = userEvent.setup()
  const chapter = backgroundChapter()
  let current = backgroundSnapshot(A, { chapters: [chapter] })
  const api = backgroundApi013Defaults(current)
  vi.mocked(api.query).mockImplementation(async () => ({ ok: true, data: current }))
  const pending = deferred<Awaited<ReturnType<typeof api.chapter>>>()
  vi.mocked(api.chapter).mockReturnValue(pending.promise)
  render(
    createElement(BackgroundPanel, {
      assistantId: A,
      assistantName: 'Alpha',
      api,
      providerApi: {
        ...(providerApi007Defaults() as ProviderApi),
        list: vi.fn(async () => ({ ok: true as const, data: { connections: [], bindings: [] } }))
      },
      onUseChapters: () => undefined
    })
  )
  await screen.findByText(chapter.title)
  await user.click(screen.getByText('展开章节正文'))
  await user.click(screen.getByRole('button', { name: '读取正文' }))
  current = backgroundSnapshot(A, {
    chapters: [{ ...chapter, state: 'UNAVAILABLE', title: '不可用章节', topics: [] }]
  })
  await user.click(screen.getByRole('button', { name: '刷新' }))
  await screen.findByText('不可用章节')
  await act(async () =>
    pending.resolve({ ok: true, data: { chapter, markdown: 'SYNTHETIC WITHDRAWN BODY' } })
  )
  expect(screen.queryByText('SYNTHETIC WITHDRAWN BODY')).not.toBeInTheDocument()
})

it('does not resurrect a chapter response from an earlier visit to the same assistant', async () => {
  const user = userEvent.setup(),
    chapter = backgroundChapter()
  const api = backgroundApi013Defaults()
  vi.mocked(api.query).mockImplementation(async (input) => ({
    ok: true,
    data: backgroundSnapshot(input.assistantId, {
      chapters: input.assistantId === A ? [chapter] : []
    })
  }))
  const pending = deferred<Awaited<ReturnType<typeof api.chapter>>>()
  vi.mocked(api.chapter).mockReturnValue(pending.promise)
  const provider = {
    ...(providerApi007Defaults() as ProviderApi),
    list: vi.fn(async () => ({ ok: true as const, data: { connections: [], bindings: [] } }))
  }
  const element = (assistantId: string) =>
    createElement(BackgroundPanel, {
      assistantId,
      assistantName: assistantId,
      api,
      providerApi: provider,
      onUseChapters: () => undefined
    })
  const view = render(element(A))
  await screen.findByText(chapter.title)
  await user.click(screen.getByText('展开章节正文'))
  await user.click(screen.getByRole('button', { name: '读取正文' }))
  view.rerender(element(B))
  await screen.findByText('尚无章节。正常完整轮次整理完成后会显示在这里。')
  view.rerender(element(A))
  await screen.findByText(chapter.title)
  await act(async () =>
    pending.resolve({ ok: true, data: { chapter, markdown: 'SYNTHETIC OLD VISIT' } })
  )
  expect(screen.queryByText('SYNTHETIC OLD VISIT')).not.toBeInTheDocument()
})

it('invalidates already displayed body when the same chapter ID receives a different accepted memory hash', async () => {
  const user = userEvent.setup(),
    chapter = backgroundChapter()
  let current = backgroundSnapshot(A, { chapters: [chapter] })
  const api = backgroundApi013Defaults(current)
  vi.mocked(api.query).mockImplementation(async () => ({ ok: true, data: current }))
  vi.mocked(api.chapter).mockResolvedValue({
    ok: true,
    data: { chapter, markdown: 'SYNTHETIC OLD HASH' }
  })
  render(
    createElement(BackgroundPanel, {
      assistantId: A,
      assistantName: 'Alpha',
      api,
      providerApi: {
        ...(providerApi007Defaults() as ProviderApi),
        list: vi.fn(async () => ({ ok: true as const, data: { connections: [], bindings: [] } }))
      },
      onUseChapters: () => undefined
    })
  )
  await screen.findByText(chapter.title)
  await user.click(screen.getByText('展开章节正文'))
  await user.click(screen.getByRole('button', { name: '读取正文' }))
  await screen.findByText('SYNTHETIC OLD HASH')
  current = backgroundSnapshot(A, {
    chapters: [
      {
        ...chapter,
        version: chapter.version + 1,
        memoryVersion: chapter.memoryVersion + 1,
        bodyHash: 'b'.repeat(64)
      }
    ]
  })
  await user.click(screen.getByRole('button', { name: '刷新' }))
  await waitFor(() => expect(screen.queryByText('SYNTHETIC OLD HASH')).not.toBeInTheDocument())
})

it('does not silently rebase an edited configuration over a concurrently changed configuration', async () => {
  const user = userEvent.setup()
  let current = backgroundSnapshot(A)
  current = {
    ...current,
    configuration: { ...current.configuration, version: 1, model: 'original' }
  }
  const api = backgroundApi013Defaults(current)
  vi.mocked(api.query).mockImplementation(async () => ({ ok: true, data: current }))
  render(
    createElement(BackgroundPanel, {
      assistantId: A,
      assistantName: 'Alpha',
      api,
      providerApi: {
        ...(providerApi007Defaults() as ProviderApi),
        list: vi.fn(async () => ({ ok: true as const, data: { connections: [], bindings: [] } }))
      },
      onUseChapters: () => undefined
    })
  )
  await screen.findByDisplayValue('original')
  await user.clear(screen.getByLabelText('整理使用的模型'))
  await user.type(screen.getByLabelText('整理使用的模型'), 'local draft')
  current = {
    ...current,
    configuration: { ...current.configuration, version: 2, model: 'concurrent change' }
  }
  await user.click(screen.getByRole('button', { name: '刷新' }))
  await waitFor(() => expect(api.query).toHaveBeenCalledTimes(2))
  const save = screen.getByRole('button', { name: '保存整理设置' })
  if (!save.hasAttribute('disabled')) await user.click(save)
  const sent = vi.mocked(api.configure).mock.calls[0]?.[0]
  expect(sent?.expectedVersion === 2 && sent?.settings.model === 'local draft').not.toBe(true)
})

it('uses a fresh base only after explicitly reloading a conflicted configuration draft', async () => {
  const user = userEvent.setup()
  let current = backgroundSnapshot(A)
  current = {
    ...current,
    configuration: { ...current.configuration, version: 1, model: 'original' }
  }
  const api = backgroundApi013Defaults(current)
  vi.mocked(api.query).mockImplementation(async () => ({ ok: true, data: current }))
  vi.mocked(api.configure).mockImplementation(async (input) =>
    input.expectedVersion !== current.configuration.version
      ? { ok: false, error: { code: 'STALE_WRITE', message: 'synthetic conflict' } }
      : { ok: true, data: current }
  )
  render(
    createElement(BackgroundPanel, {
      assistantId: A,
      assistantName: 'Alpha',
      api,
      providerApi: {
        ...(providerApi007Defaults() as ProviderApi),
        list: vi.fn(async () => ({ ok: true as const, data: { connections: [], bindings: [] } }))
      },
      onUseChapters: () => undefined
    })
  )
  await screen.findByDisplayValue('original')
  await user.clear(screen.getByLabelText('整理使用的模型'))
  await user.type(screen.getByLabelText('整理使用的模型'), 'local draft')
  current = {
    ...current,
    configuration: { ...current.configuration, version: 2, model: 'concurrent change' }
  }
  await user.click(screen.getByRole('button', { name: '刷新' }))
  await user.click(screen.getByRole('button', { name: '保存整理设置' }))
  expect(vi.mocked(api.configure).mock.calls[0]?.[0].expectedVersion).toBe(1)
  expect(screen.getByLabelText('整理使用的模型')).toHaveValue('local draft')
  await user.click(screen.getByRole('button', { name: '重新载入已保存配置' }))
  expect(screen.getByLabelText('整理使用的模型')).toHaveValue('concurrent change')
  await user.clear(screen.getByLabelText('整理使用的模型'))
  await user.type(screen.getByLabelText('整理使用的模型'), 'resolved draft')
  await user.click(screen.getByRole('button', { name: '保存整理设置' }))
  expect(vi.mocked(api.configure).mock.calls[1]?.[0]).toMatchObject({
    expectedVersion: 2,
    settings: { model: 'resolved draft' }
  })
})
