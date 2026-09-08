// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProviderPanel } from '../../src/renderer/src/features/provider/ProviderPanel'
import type { ProviderApi } from '../../src/shared/provider-contract'
import type { TimelineApi } from '../../src/shared/timeline-contract'
import { providerApi007Defaults } from './provider-api-fixture'
import { timelineApi006Defaults } from './timeline-api-fixture'

afterEach(cleanup)

function providerApi(): ProviderApi {
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

function timelineApi(): TimelineApi {
  return {
    ...timelineApi006Defaults(),
    read: vi.fn(async (input) => ({
      ok: true as const,
      data: { assistantId: input.assistantId, mode: input.mode, messages: [], hasMore: false }
    })),
    saveTemporary: vi.fn()
  } as TimelineApi
}

describe('ProviderPanel daily and settings surfaces', () => {
  it('gives an empty workspace a direct assistant-creation path without exposing connection fields in chat', async () => {
    const openSettings = vi.fn()
    const view = render(
      <ProviderPanel
        assistantSnapshot={{
          assistants: [],
          currentAssistantId: null,
          primaryAssistantId: null,
          stateRevision: 0
        }}
        api={providerApi()}
        timelineApi={timelineApi()}
        surface="chat"
        onOpenSettings={openSettings}
      />
    )

    expect(await screen.findByRole('region', { name: '开始使用' })).toBeVisible()
    expect(screen.getByText('先创建你的助手')).toBeVisible()
    expect(screen.getByLabelText('连接名称')).not.toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '创建助手' }))
    expect(openSettings).toHaveBeenCalledWith('assistants')

    view.rerender(
      <ProviderPanel
        assistantSnapshot={{
          assistants: [],
          currentAssistantId: null,
          primaryAssistantId: null,
          stateRevision: 0
        }}
        api={providerApi()}
        timelineApi={timelineApi()}
        surface="settings"
        onOpenSettings={openSettings}
      />
    )
    await waitFor(() => expect(screen.getByLabelText('连接名称')).toBeVisible())
    expect(screen.getByLabelText('正常消息')).not.toBeVisible()

    const assistantId = '00000000-0000-4000-8000-000000002001'
    view.rerender(
      <ProviderPanel
        assistantSnapshot={{
          assistants: [
            {
              id: assistantId,
              displayName: '日常助手',
              persona: '',
              avatarKey: 'mashiro',
              isArchived: false,
              archivedAt: null,
              version: 1,
              createdAt: '2026-09-08T00:00:00.000Z',
              updatedAt: '2026-09-08T00:00:00.000Z'
            }
          ],
          currentAssistantId: assistantId,
          primaryAssistantId: assistantId,
          stateRevision: 1
        }}
        api={providerApi()}
        timelineApi={timelineApi()}
        surface="settings"
        onOpenSettings={openSettings}
      />
    )
    expect(await screen.findByRole('heading', { name: '当前助手使用的模型' })).toBeVisible()
    expect(screen.getByRole('region', { name: '历史权限' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '返回对话' }))
    expect(openSettings).toHaveBeenLastCalledWith('chat')
    expect(screen.getByText('完整正常历史')).not.toBeVisible()

    view.rerender(
      <ProviderPanel
        assistantSnapshot={{
          assistants: [
            {
              id: assistantId,
              displayName: '日常助手',
              persona: '',
              avatarKey: 'mashiro',
              isArchived: false,
              archivedAt: null,
              version: 1,
              createdAt: '2026-09-08T00:00:00.000Z',
              updatedAt: '2026-09-08T00:00:00.000Z'
            }
          ],
          currentAssistantId: assistantId,
          primaryAssistantId: assistantId,
          stateRevision: 1
        }}
        api={providerApi()}
        timelineApi={timelineApi()}
        surface="chat"
        onOpenSettings={openSettings}
      />
    )
    expect(screen.getByText('完整正常历史')).toBeVisible()
    expect(screen.getByText('历史读取与发送权限')).not.toBeVisible()
    expect(screen.getByText('当前助手使用的模型')).not.toBeVisible()
  })
})
