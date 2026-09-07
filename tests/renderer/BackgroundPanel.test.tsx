// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BackgroundPanel } from '../../src/renderer/src/features/background/BackgroundPanel'
import type { BackgroundApi } from '../../src/shared/background-contract'
import type { ProviderApi, ProviderConnection } from '../../src/shared/provider-contract'
import {
  backgroundApi013Defaults,
  backgroundAssistantA,
  backgroundAssistantB,
  backgroundChapter,
  backgroundChapterId,
  backgroundConnectionA,
  backgroundConnectionB,
  backgroundJob,
  backgroundSnapshot,
  backgroundTopicId,
  backgroundUnavailableChapterId
} from './background-api-fixture'
import { providerApi007Defaults } from './provider-api-fixture'

afterEach(cleanup)

function connection(id: string, displayName: string): ProviderConnection {
  return {
    id,
    displayName,
    baseUrl: `https://${displayName.toLowerCase()}.example/v1`,
    enabled: true,
    hasCredential: true,
    credentialPersistence: 'temporary',
    createdAt: '2026-09-07T00:00:00.000Z',
    updatedAt: '2026-09-07T00:00:00.000Z',
    version: 1
  }
}

function providerApi(): ProviderApi {
  return {
    ...providerApi007Defaults(),
    list: vi.fn(async () => ({
      ok: true as const,
      data: {
        connections: [
          connection(backgroundConnectionA, 'ChatReceiver'),
          connection(backgroundConnectionB, 'ChapterReceiver')
        ],
        bindings: [
          {
            assistantId: backgroundAssistantA,
            connectionId: backgroundConnectionA,
            model: 'chat-model',
            updatedAt: '2026-09-07T00:00:00.000Z',
            version: 1
          }
        ]
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

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

describe('BackgroundPanel', () => {
  it('requires an explicit receiver, readable scope and UTC-day character budget without changing chat binding', async () => {
    const user = userEvent.setup()
    const initial = backgroundSnapshot()
    const saved = backgroundSnapshot(backgroundAssistantA, {
      configuration: {
        ...initial.configuration,
        version: 1,
        enabled: true,
        connectionId: backgroundConnectionB,
        model: 'chapter-model',
        allowOwnCompletedRounds: true,
        budget: { window: 'utc-day', calls: 3, inputCharacters: 12000 },
        recipientFingerprint: 'b'.repeat(64),
        recipientAuthorized: true
      }
    })
    const api = backgroundApi013Defaults(initial)
    vi.mocked(api.configure).mockResolvedValue({ ok: true, data: saved })
    const providers = providerApi()

    render(
      <BackgroundPanel
        assistantId={backgroundAssistantA}
        assistantName="Alpha"
        api={api}
        providerApi={providers}
        onUseChapters={() => undefined}
      />
    )

    expect(
      await screen.findByText('当前所选连接尚无有效接收授权。', { exact: false })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '立即检查并整理' })).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: '启用本助手的章节后台' }))
    expect(screen.getByRole('alert')).toHaveTextContent('启用前请明确选择')
    await user.selectOptions(screen.getByLabelText('后台执行连接'), backgroundConnectionB)
    await user.type(screen.getByLabelText('后台执行模型'), 'chapter-model')
    await user.click(screen.getByRole('checkbox', { name: '允许读取本助手已完成的正常对话轮次' }))
    await user.click(screen.getByRole('checkbox', { name: '设置 UTC 日硬预算' }))
    await user.type(screen.getByLabelText('每 UTC 日最多调用次数'), '3')
    await user.type(screen.getByLabelText('每 UTC 日最多输入字符数'), '12000')
    await user.click(screen.getByRole('checkbox', { name: '允许所选连接接收本助手历史与私有记忆' }))
    await user.click(screen.getByRole('button', { name: '保存后台配置' }))

    await waitFor(() => expect(api.configure).toHaveBeenCalledTimes(1))
    expect(api.configure).toHaveBeenCalledWith({
      protocolVersion: 1,
      assistantId: backgroundAssistantA,
      expectedVersion: 0,
      settings: {
        enabled: true,
        connectionId: backgroundConnectionB,
        model: 'chapter-model',
        allowOwnCompletedRounds: true,
        budget: { window: 'utc-day', calls: 3, inputCharacters: 12000 }
      },
      grantSelectedRecipient: true
    })
    expect(providers.bindAssistant).not.toHaveBeenCalled()
    expect(screen.getByText('当前所选连接已获得接收授权。', { exact: false })).toBeInTheDocument()
    expect(
      screen.getByText('token 仅为 Provider 返回的用量统计', { exact: false })
    ).toBeInTheDocument()
  })

  it('reuses the same command after an unknown control receipt and uses the distinct remote-unknown retry action', async () => {
    const user = userEvent.setup()
    const current = backgroundSnapshot(backgroundAssistantA, {
      jobs: [backgroundJob('REMOTE_UNKNOWN')]
    })
    const api = backgroundApi013Defaults(current)
    vi.mocked(api.control)
      .mockRejectedValueOnce(new Error('reply lost'))
      .mockResolvedValueOnce({ ok: true, data: current })

    render(
      <BackgroundPanel
        assistantId={backgroundAssistantA}
        assistantName="Alpha"
        api={api}
        providerApi={providerApi()}
        onUseChapters={() => undefined}
      />
    )

    const retry = await screen.findByRole('button', { name: '先核查远端再重试' })
    await user.click(retry)
    expect(await screen.findByRole('alert')).toHaveTextContent('回执未确认')
    await user.click(retry)
    await waitFor(() => expect(api.control).toHaveBeenCalledTimes(2))
    expect(vi.mocked(api.control).mock.calls[0]![0]).toMatchObject({ action: 'retry-unknown' })
    expect(vi.mocked(api.control).mock.calls[1]![0].commandId).toBe(
      vi.mocked(api.control).mock.calls[0]![0].commandId
    )
  })

  it('keeps bodies and sources collapsed, passes only available accepted versions to chat, and handles topics and pagination', async () => {
    const user = userEvent.setup()
    const available = backgroundChapter()
    const unavailable = backgroundChapter({
      id: backgroundUnavailableChapterId,
      title: '已撤回章节',
      version: 5,
      state: 'UNAVAILABLE',
      topics: []
    })
    const first = backgroundSnapshot(backgroundAssistantA, {
      nextCursor: 100,
      chapters: [available, unavailable],
      usage: {
        ...backgroundSnapshot().usage,
        calls: 2,
        inputCharacters: 3210,
        knownPromptTokens: 80,
        knownCompletionTokens: 20,
        knownTotalTokens: 100,
        unknownAttempts: 1
      }
    })
    const api = backgroundApi013Defaults(first)
    vi.mocked(api.query).mockImplementation(async (input) => ({
      ok: true,
      data:
        input.cursor === 100
          ? backgroundSnapshot(backgroundAssistantA, {
              chapters: [
                backgroundChapter({
                  id: '00000000-0000-4000-8000-000000001399',
                  title: '更早章节',
                  topics: []
                })
              ]
            })
          : first
    }))
    const onUseChapters = vi.fn()

    render(
      <BackgroundPanel
        assistantId={backgroundAssistantA}
        assistantName="Alpha"
        api={api}
        providerApi={providerApi()}
        onUseChapters={onUseChapters}
      />
    )

    expect(await screen.findByText('项目决策与后续')).toBeInTheDocument()
    expect(screen.getByText('用量未知次数').nextElementSibling).toHaveTextContent('1')
    expect(screen.queryByText('# 项目决策')).not.toBeInTheDocument()
    const sourceDetails = screen.getAllByText('查看原文来源')[0]!.closest('details')
    expect(sourceDetails).not.toHaveAttribute('open')
    expect(screen.getByRole('checkbox', { name: '选择章节：已撤回章节' })).toBeDisabled()

    const availableArticle = screen.getByText('项目决策与后续').closest('article')
    expect(availableArticle).not.toBeNull()
    await user.click(within(availableArticle!).getByText('展开章节正文'))
    await user.click(within(availableArticle!).getByRole('button', { name: '读取正文' }))
    expect(await screen.findByText('# 项目决策', { exact: false })).toBeInTheDocument()
    expect(api.chapter).toHaveBeenCalledWith({
      protocolVersion: 1,
      assistantId: backgroundAssistantA,
      chapterId: backgroundChapterId,
      expectedVersion: 3
    })

    await user.click(screen.getByRole('checkbox', { name: '选择章节：项目决策与后续' }))
    await user.click(screen.getByRole('button', { name: '在对话中使用已选章节（1）' }))
    expect(onUseChapters).toHaveBeenCalledWith({
      assistantId: backgroundAssistantA,
      chapters: [{ id: backgroundChapterId, expectedVersion: 3 }]
    })

    await user.click(screen.getByRole('button', { name: '标记已解决' }))
    expect(api.topic).toHaveBeenCalledWith({
      protocolVersion: 1,
      assistantId: backgroundAssistantA,
      chapterId: backgroundChapterId,
      expectedChapterVersion: 3,
      topicId: backgroundTopicId,
      expectedVersion: 1,
      state: 'RESOLVED'
    })

    await user.click(screen.getByRole('button', { name: '加载更多后台记录' }))
    expect(api.query).toHaveBeenLastCalledWith({
      protocolVersion: 1,
      assistantId: backgroundAssistantA,
      cursor: 100
    })
    expect(await screen.findByText('更早章节')).toBeInTheDocument()
    expect(screen.getByText('项目决策与后续')).toBeInTheDocument()
  })

  it('offers only actions accepted by the trusted job state and attempt limit', async () => {
    const cancelled = backgroundJob('CANCELLED', {
      id: '00000000-0000-4000-8000-000000001391'
    })
    const stale = backgroundJob('STALE', {
      id: '00000000-0000-4000-8000-000000001392',
      attempts: 4
    })
    const capped = backgroundJob('FAILED_CONFIRMED', {
      id: '00000000-0000-4000-8000-000000001393',
      attempts: 5
    })
    const api = backgroundApi013Defaults(
      backgroundSnapshot(backgroundAssistantA, { jobs: [cancelled, stale, capped] })
    )
    render(
      <BackgroundPanel
        assistantId={backgroundAssistantA}
        assistantName="Alpha"
        api={api}
        providerApi={providerApi()}
        onUseChapters={() => undefined}
      />
    )

    const cancelledCard = (await screen.findByText('已取消')).closest('article')
    const staleCard = screen.getByText('已过期').closest('article')
    const cappedCard = screen.getByText('确认失败').closest('article')
    expect(cancelledCard).not.toBeNull()
    expect(staleCard).not.toBeNull()
    expect(cappedCard).not.toBeNull()
    expect(
      within(cancelledCard!).queryByRole('button', { name: '按当前条件重试' })
    ).not.toBeInTheDocument()
    expect(
      within(cancelledCard!).queryByRole('button', { name: '取消任务' })
    ).not.toBeInTheDocument()
    expect(within(staleCard!).getByRole('button', { name: '按当前条件重试' })).toBeInTheDocument()
    expect(within(staleCard!).getByRole('button', { name: '取消任务' })).toBeInTheDocument()
    expect(
      within(cappedCard!).queryByRole('button', { name: '按当前条件重试' })
    ).not.toBeInTheDocument()
    expect(within(cappedCard!).getByText(/已达到 5 次尝试上限/)).toBeInTheDocument()
  })

  it('ignores a late query from the previous assistant after switching routes', async () => {
    const pendingA = deferred<Awaited<ReturnType<BackgroundApi['query']>>>()
    const api = backgroundApi013Defaults()
    vi.mocked(api.query).mockImplementation((input) => {
      if (input.assistantId === backgroundAssistantA) return pendingA.promise
      return Promise.resolve({
        ok: true,
        data: backgroundSnapshot(backgroundAssistantB, {
          chapters: [
            backgroundChapter({
              id: '00000000-0000-4000-8000-000000001398',
              assistantId: backgroundAssistantB,
              title: 'Beta 章节',
              topics: []
            })
          ]
        })
      })
    })
    const view = render(
      <BackgroundPanel
        assistantId={backgroundAssistantA}
        assistantName="Alpha"
        api={api}
        providerApi={providerApi()}
        onUseChapters={() => undefined}
      />
    )
    view.rerender(
      <BackgroundPanel
        assistantId={backgroundAssistantB}
        assistantName="Beta"
        api={api}
        providerApi={providerApi()}
        onUseChapters={() => undefined}
      />
    )
    expect(await screen.findByText('Beta 章节')).toBeInTheDocument()
    await act(async () => {
      pendingA.resolve({
        ok: true,
        data: backgroundSnapshot(backgroundAssistantA, {
          chapters: [backgroundChapter({ title: 'Alpha 迟到章节', topics: [] })]
        })
      })
      await pendingA.promise
    })
    expect(screen.queryByText('Alpha 迟到章节')).not.toBeInTheDocument()
    expect(screen.getByText('Beta 章节')).toBeInTheDocument()
  })
})
