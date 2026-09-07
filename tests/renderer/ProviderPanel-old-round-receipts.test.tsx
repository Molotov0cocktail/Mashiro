// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProviderPanel } from '../../src/renderer/src/features/provider/ProviderPanel'
import { memoryApi008Defaults } from './memory-api-fixture'
import { providerApi007Defaults } from './provider-api-fixture'
import type { AssistantSnapshot } from '../../src/shared/assistant-contract'
import type { MemoryApi, MemoryReceipt } from '../../src/shared/memory-contract'
import type { ProviderApi, ToolReadResult } from '../../src/shared/provider-contract'
import type { TimelineApi, TimelineMessage } from '../../src/shared/timeline-contract'
import type { ToolOperation } from '../../src/shared/tool-contract'

afterEach(cleanup)

const assistantA = '00000000-0000-4000-8000-000000000001'
const assistantB = '00000000-0000-4000-8000-000000000002'
const requestA = '00000000-0000-4000-8000-000000000101'
const requestB = '00000000-0000-4000-8000-000000000102'
const time = '2026-09-07T08:00:00.000Z'

function assistants(currentAssistantId: string, stateRevision: number): AssistantSnapshot {
  return {
    assistants: [assistantA, assistantB].map((id, index) => ({
      id,
      displayName: index === 0 ? '甲助手' : '乙助手',
      persona: '',
      avatarKey: 'mashiro',
      isArchived: false,
      createdAt: time,
      updatedAt: time,
      archivedAt: null,
      version: 1
    })),
    currentAssistantId,
    primaryAssistantId: assistantA,
    stateRevision
  }
}

function messages(assistantId: string): TimelineMessage[] {
  const requestId = assistantId === assistantA ? requestA : requestB
  return [
    {
      id: assistantId === assistantA ? requestA : requestB,
      requestId,
      role: 'user',
      content: assistantId === assistantA ? '甲助手的旧轮操作' : '乙助手的旧轮操作',
      status: 'completed',
      createdAt: time,
      saved: true
    },
    {
      id:
        assistantId === assistantA
          ? '00000000-0000-4000-8000-000000000201'
          : '00000000-0000-4000-8000-000000000202',
      requestId,
      role: 'assistant',
      content: '旧轮回复',
      status: 'interrupted',
      createdAt: time,
      saved: true
    }
  ]
}

function operation(values: Partial<ToolOperation> = {}): ToolOperation {
  return {
    operationId: '00000000-0000-4000-8000-000000000301',
    segmentId: '00000000-0000-4000-8000-000000000302',
    modelRequestId: '00000000-0000-4000-8000-000000000303',
    requestId: requestA,
    assistantId: assistantA,
    toolName: 'write_memory',
    state: 'RESULT_UNKNOWN',
    createdAt: time,
    updatedAt: time,
    summary: '旧轮结果仍待核查',
    citations: [],
    ...values
  }
}

function timeline(): TimelineApi {
  return {
    read: vi.fn(async (input) => ({
      ok: true as const,
      data: { assistantId: input.assistantId, mode: input.mode, messages: [], hasMore: true }
    })),
    saveTemporary: vi.fn(),
    query: vi.fn(async (input) => ({
      ok: true as const,
      data: {
        assistantId: input.assistantId,
        messages: messages(input.assistantId),
        nextCursor: null
      }
    })),
    permissions: vi.fn(async (input) => ({
      ok: true as const,
      data: {
        assistantId: input.assistantId,
        connectionId: null,
        endpointFingerprint: null,
        endpointDisplay: null,
        readHistory: true,
        sendHistory: false,
        version: 0
      }
    })),
    setPermissions: vi.fn()
  } as TimelineApi
}

function provider(tools: ProviderApi['tools'], startChat = vi.fn()): ProviderApi {
  return {
    ...providerApi007Defaults(),
    tools,
    list: vi.fn(async () => ({ ok: true as const, data: { connections: [], bindings: [] } })),
    saveConnection: vi.fn(),
    setCredential: vi.fn(),
    deleteCredential: vi.fn(),
    bindAssistant: vi.fn(),
    clearChat: vi.fn(),
    startChat,
    cancelChat: vi.fn(),
    onEvent: vi.fn(() => () => undefined)
  } as ProviderApi
}

function result(assistantId: string, operations: ToolOperation[]): ToolReadResult {
  return { ok: true, data: { assistantId, mode: 'normal', operations } }
}

describe('ProviderPanel old-round business receipts', () => {
  it('loads only the selected request on demand and never resends the provider request', async () => {
    const startChat = vi.fn()
    const tools = vi.fn<ProviderApi['tools']>(async (input) =>
      result(input.assistantId, input.requestId === requestA ? [operation()] : [])
    )
    render(
      <ProviderPanel
        assistantSnapshot={assistants(assistantA, 1)}
        api={provider(tools, startChat)}
        timelineApi={timeline()}
      />
    )

    const turn = (await screen.findByText('甲助手的旧轮操作')).closest('article')!
    expect(within(turn).queryByText('旧轮结果仍待核查')).not.toBeInTheDocument()
    fireEvent.click(within(turn).getByRole('button', { name: '查看本轮业务与工具回执' }))

    expect(await within(turn).findByText('旧轮结果仍待核查')).toBeInTheDocument()
    expect(within(turn).getByText('所选轮次：甲助手的旧轮操作')).toBeInTheDocument()
    expect(tools).toHaveBeenCalledWith({
      protocolVersion: 1,
      assistantId: assistantA,
      mode: 'normal',
      requestId: requestA
    })
    expect(within(turn).getByRole('button', { name: '核查本地状态' })).toBeInTheDocument()
    expect(startChat).not.toHaveBeenCalled()
  })

  it('drops a late old-assistant response and does not replay it after returning', async () => {
    let resolveOld: ((value: ToolReadResult) => void) | undefined
    const tools = vi.fn<ProviderApi['tools']>((input) => {
      if (input.requestId === requestA)
        return new Promise<ToolReadResult>((resolve) => {
          resolveOld = resolve
        })
      return Promise.resolve(result(input.assistantId, []))
    })
    const api = provider(tools)
    const timelineApi = timeline()
    const view = render(
      <ProviderPanel
        assistantSnapshot={assistants(assistantA, 1)}
        api={api}
        timelineApi={timelineApi}
      />
    )
    const turn = (await screen.findByText('甲助手的旧轮操作')).closest('article')!
    fireEvent.click(within(turn).getByRole('button', { name: '查看本轮业务与工具回执' }))
    await waitFor(() => expect(resolveOld).toBeDefined())

    view.rerender(
      <ProviderPanel
        assistantSnapshot={assistants(assistantB, 2)}
        api={api}
        timelineApi={timelineApi}
      />
    )
    await screen.findByText('乙助手的旧轮操作')
    await act(async () => resolveOld?.(result(assistantA, [operation()])))
    expect(screen.queryByText('旧轮结果仍待核查')).not.toBeInTheDocument()

    view.rerender(
      <ProviderPanel
        assistantSnapshot={assistants(assistantA, 3)}
        api={api}
        timelineApi={timelineApi}
      />
    )
    const returned = (await screen.findByText('甲助手的旧轮操作')).closest('article')!
    expect(
      within(returned).getByRole('button', { name: '查看本轮业务与工具回执' })
    ).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('旧轮结果仍待核查')).not.toBeInTheDocument()
  })

  it('reuses the original pending memory confirmation and makes no scoped read in temporary mode', async () => {
    const confirmationId = '00000000-0000-4000-8000-000000000401'
    const businessId = '00000000-0000-4000-8000-000000000402'
    const receipt: MemoryReceipt = {
      operationId: '00000000-0000-4000-8000-000000000403',
      objectId: businessId,
      objectVersion: 2,
      state: 'PENDING_CONFIRMATION',
      summary: '旧轮删除仍等待你的确认',
      confirmationId
    }
    let accepted = false
    const pending = operation({
      operationId: '00000000-0000-4000-8000-000000000404',
      toolName: 'request_memory_removal',
      state: 'SUCCEEDED',
      summary: '旧轮删除预览',
      memoryReceipt: receipt
    })
    const tools = vi.fn<ProviderApi['tools']>(async (input) =>
      result(
        input.assistantId,
        input.requestId === requestA
          ? [
              accepted
                ? {
                    ...pending,
                    memoryReceipt: {
                      ...receipt,
                      state: 'CANCELLED_BEFORE_DISPATCH',
                      summary: '已确认不执行旧轮删除',
                      confirmationId: null
                    }
                  }
                : pending
            ]
          : []
      )
    )
    const confirm = vi.fn<MemoryApi['confirm']>(async () => {
      accepted = true
      return {
        ok: true,
        data: {
          ...receipt,
          state: 'CANCELLED_BEFORE_DISPATCH',
          summary: '已确认不执行旧轮删除',
          confirmationId: null,
          operationId: receipt.operationId,
          objectId: receipt.objectId
        }
      }
    })
    const api = provider(tools)
    render(
      <ProviderPanel
        assistantSnapshot={assistants(assistantA, 1)}
        api={api}
        timelineApi={timeline()}
        memoryApi={{ ...memoryApi008Defaults(), confirm }}
      />
    )
    const turn = (await screen.findByText('甲助手的旧轮操作')).closest('article')!
    fireEvent.click(within(turn).getByRole('button', { name: '查看本轮业务与工具回执' }))
    const confirmation = await within(turn).findByRole('region', { name: '对话记忆操作确认' })
    fireEvent.click(within(confirmation).getByRole('button', { name: '取消操作' }))
    await waitFor(() =>
      expect(confirm).toHaveBeenCalledWith({
        protocolVersion: 1,
        assistantId: assistantA,
        confirmationId,
        accept: false
      })
    )
    expect(await within(turn).findByText('已确认不执行旧轮删除')).toBeInTheDocument()

    const scopedCalls = () => tools.mock.calls.filter(([input]) => input.requestId !== undefined)
    expect(scopedCalls()).toHaveLength(2)
    fireEvent.click(screen.getByRole('radio', { name: '严格临时（不自动保存）' }))
    expect(screen.queryByRole('button', { name: '查看本轮业务与工具回执' })).not.toBeInTheDocument()
    await Promise.resolve()
    expect(scopedCalls()).toHaveLength(2)
  })
})
