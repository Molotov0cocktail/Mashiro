// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/renderer/src/App'
import type { AssistantApi, AssistantSnapshot } from '../../src/shared/assistant-contract'
import type { ProviderApi, ProviderSnapshot } from '../../src/shared/provider-contract'
import type { TimelineApi } from '../../src/shared/timeline-contract'
import {
  itemApi010Defaults,
  itemAssistantA,
  itemAssistantB,
  itemProposal
} from './item-api-fixture'
import { memoryApi008Defaults } from './memory-api-fixture'
import { providerApi007Defaults } from './provider-api-fixture'
import { timelineApi006Defaults } from './timeline-api-fixture'

function assistants(
  currentAssistantId: string,
  stateRevision: number,
  betaArchived = false
): AssistantSnapshot {
  return {
    assistants: [
      {
        id: itemAssistantA,
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
        id: itemAssistantB,
        displayName: 'Beta',
        persona: '',
        avatarKey: 'mashiro',
        isArchived: betaArchived,
        createdAt: '2026-09-07T00:00:01.000Z',
        updatedAt: '2026-09-07T00:00:01.000Z',
        archivedAt: betaArchived ? '2026-09-07T00:02:00.000Z' : null,
        version: 1
      }
    ],
    currentAssistantId,
    primaryAssistantId: itemAssistantA,
    stateRevision
  }
}

afterEach(cleanup)

describe('App item and conversation integration', () => {
  it('opens proposal discussion in the origin assistant normal chat with the new version context', async () => {
    const initial = assistants(itemAssistantA, 2, true)
    const switched = assistants(itemAssistantB, 3)
    const assistantApi = {
      list: vi.fn(async () => ({ ok: true as const, data: initial })),
      switch: vi.fn(async () => ({ ok: true as const, data: switched })),
      create: vi.fn(),
      rename: vi.fn(),
      setPrimary: vi.fn(),
      archive: vi.fn()
    } as AssistantApi
    const itemApi = itemApi010Defaults()
    itemApi.query = vi.fn(async (input) => ({
      ok: true as const,
      data: {
        items: [],
        proposals:
          input.view === 'proposals' ? [itemProposal({ originAssistantId: itemAssistantB })] : [],
        nextCursor: null,
        formalCount: 0
      }
    }))
    itemApi.proposalAction = vi.fn(async () => ({
      ok: true as const,
      data: {
        operationId: '00000000-0000-4000-8000-000000000311',
        objectId: '00000000-0000-4000-8000-000000000201',
        objectVersion: 4,
        objectType: 'proposal' as const,
        state: 'SUCCEEDED' as const,
        confirmationId: null,
        summary: '已进入协商'
      }
    }))
    const providerSnapshot: ProviderSnapshot = {
      connections: [
        {
          id: '00000000-0000-4000-8000-000000000011',
          displayName: 'Receiver',
          baseUrl: 'https://example.com/v1',
          enabled: true,
          hasCredential: true,
          credentialPersistence: 'temporary',
          createdAt: '2026-09-07T00:00:00.000Z',
          updatedAt: '2026-09-07T00:00:00.000Z',
          version: 1
        }
      ],
      bindings: [
        {
          assistantId: itemAssistantA,
          connectionId: '00000000-0000-4000-8000-000000000011',
          model: 'synthetic',
          updatedAt: '2026-09-07T00:00:00.000Z',
          version: 1
        },
        {
          assistantId: itemAssistantB,
          connectionId: '00000000-0000-4000-8000-000000000011',
          model: 'synthetic',
          updatedAt: '2026-09-07T00:00:00.000Z',
          version: 1
        }
      ]
    }
    const startChat = vi.fn(async (input) => ({
      ok: true as const,
      data: {
        requestId: input.requestId,
        assistantId: input.assistantId,
        status: 'completed' as const,
        text: '我们继续修改这个建议。',
        usage: null
      }
    }))
    const providerApi = {
      ...providerApi007Defaults(),
      list: vi.fn(async () => ({ ok: true as const, data: providerSnapshot })),
      startChat,
      saveConnection: vi.fn(),
      setCredential: vi.fn(),
      deleteCredential: vi.fn(),
      bindAssistant: vi.fn(),
      clearChat: vi.fn(),
      cancelChat: vi.fn(),
      onEvent: vi.fn(() => () => undefined),
      capabilities: vi.fn(async (input) => ({
        ok: true as const,
        data: {
          assistantId: input.assistantId,
          endpointFingerprint: 'sha256:synthetic',
          endpointDisplay: 'https://example.com/v1',
          model: 'synthetic',
          protocol: 'chat-completions-v1' as const,
          adapterVersion: 'test',
          mode: 'standard-non-preserved' as const,
          toolsAvailable: true,
          reason: '合成测试可用',
          evidence: []
        }
      }))
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

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: '事项' }))
    fireEvent.click(screen.getByRole('tab', { name: '待确认' }))
    const proposal = await screen.findByRole('article', { name: '待确认提案：考虑预约牙医' })
    fireEvent.click(within(proposal).getByRole('button', { name: '恢复原助手并协商' }))

    await waitFor(() =>
      expect(assistantApi.switch).toHaveBeenCalledWith({
        protocolVersion: 1,
        assistantId: itemAssistantB,
        expectedStateRevision: 2,
        restoreArchived: true
      })
    )
    expect(vi.mocked(assistantApi.switch).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(itemApi.proposalAction).mock.invocationCallOrder[0]!
    )
    expect(itemApi.proposalAction).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantId: itemAssistantB,
        id: '00000000-0000-4000-8000-000000000201',
        expectedVersion: 3,
        action: 'discuss'
      })
    )

    expect(await screen.findByText('当前助手：Beta')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '对话' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText(/正在协商提案/)).toHaveTextContent('版本 4')
    fireEvent.change(screen.getByLabelText('正常消息'), {
      target: { value: '把时间改成下周二下午三点。' }
    })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(startChat).toHaveBeenCalledTimes(1))
    expect(startChat.mock.calls[0]![0]).toEqual(
      expect.objectContaining({
        assistantId: itemAssistantB,
        mode: 'normal',
        tools: 'items',
        itemContext: {
          type: 'proposal',
          id: '00000000-0000-4000-8000-000000000201',
          expectedVersion: 4
        }
      })
    )
  })
  it('sends the selected formal item id and version, then clears that context when receive permission is revoked', async () => {
    const initial = assistants(itemAssistantA, 5)
    const assistantApi = {
      list: vi.fn(async () => ({ ok: true as const, data: initial })),
      switch: vi.fn(),
      create: vi.fn(),
      rename: vi.fn(),
      setPrimary: vi.fn(),
      archive: vi.fn()
    } as AssistantApi
    const itemApi = itemApi010Defaults()
    itemApi.permissions = vi.fn(async (input) => ({
      ok: true as const,
      data: {
        assistantId: input.assistantId,
        version: 1,
        read: true,
        write: false,
        propose: false,
        receive: true,
        endpointDisplay: 'Receiver · https://example.com/v1',
        endpointFingerprint: 'sha256:synthetic'
      }
    }))
    const providerSnapshot: ProviderSnapshot = {
      connections: [
        {
          id: '00000000-0000-4000-8000-000000000011',
          displayName: 'Receiver',
          baseUrl: 'https://example.com/v1',
          enabled: true,
          hasCredential: true,
          credentialPersistence: 'temporary',
          createdAt: '2026-09-07T00:00:00.000Z',
          updatedAt: '2026-09-07T00:00:00.000Z',
          version: 1
        }
      ],
      bindings: [
        {
          assistantId: itemAssistantA,
          connectionId: '00000000-0000-4000-8000-000000000011',
          model: 'synthetic',
          updatedAt: '2026-09-07T00:00:00.000Z',
          version: 1
        }
      ]
    }
    const startChat = vi.fn(async (input) => ({
      ok: true as const,
      data: {
        requestId: input.requestId,
        assistantId: input.assistantId,
        status: 'completed' as const,
        text: '已准备修改，等待你在本地确认。',
        usage: null
      }
    }))
    const providerApi = {
      ...providerApi007Defaults(),
      list: vi.fn(async () => ({ ok: true as const, data: providerSnapshot })),
      startChat,
      saveConnection: vi.fn(),
      setCredential: vi.fn(),
      deleteCredential: vi.fn(),
      bindAssistant: vi.fn(),
      clearChat: vi.fn(),
      cancelChat: vi.fn(),
      onEvent: vi.fn(() => () => undefined),
      capabilities: vi.fn(async (input) => ({
        ok: true as const,
        data: {
          assistantId: input.assistantId,
          endpointFingerprint: 'sha256:synthetic',
          endpointDisplay: 'https://example.com/v1',
          model: 'synthetic',
          protocol: 'chat-completions-v1' as const,
          adapterVersion: 'test',
          mode: 'standard-non-preserved' as const,
          toolsAvailable: true,
          reason: '合成测试可用',
          evidence: []
        }
      }))
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

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: '事项' }))
    const item = await screen.findByRole('article', { name: '正式事项：周五交报告' })
    fireEvent.click(within(item).getByRole('button', { name: '在对话中处理' }))

    expect(screen.getByRole('button', { name: '对话' })).toHaveAttribute('aria-current', 'page')
    expect(await screen.findByText(/正在处理事项/)).toHaveTextContent(
      '00000000-0000-4000-8000-000000000101 · 版本 2'
    )
    expect(assistantApi.switch).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('正常消息'), {
      target: { value: '把期限改为 2026-09-15 16:04，时区 Asia/Shanghai。' }
    })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(startChat).toHaveBeenCalledTimes(1))
    expect(startChat.mock.calls[0]![0]).toEqual(
      expect.objectContaining({
        assistantId: itemAssistantA,
        mode: 'normal',
        tools: 'items',
        itemContext: {
          type: 'item',
          id: '00000000-0000-4000-8000-000000000101',
          expectedVersion: 2
        }
      })
    )

    fireEvent.click(screen.getByRole('button', { name: '事项' }))
    fireEvent.click(await screen.findByText('事项权限与实际接收方'))
    fireEvent.click(screen.getByLabelText('允许当前实际 Provider 端点接收事项上下文'))
    fireEvent.click(screen.getByRole('button', { name: '保存事项权限' }))
    await waitFor(() =>
      expect(itemApi.setPermissions).toHaveBeenCalledWith(
        expect.objectContaining({ receive: false })
      )
    )
    fireEvent.click(screen.getByRole('button', { name: '对话' }))
    await waitFor(() => expect(screen.queryByText(/正在处理事项/)).not.toBeInTheDocument())
  })
})
