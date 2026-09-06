// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProviderPanel } from '../../src/renderer/src/features/provider/ProviderPanel'
import type { AssistantSnapshot } from '../../src/shared/assistant-contract'
import type {
  ProviderApi,
  ProviderChatResult,
  ProviderEvent,
  ProviderSnapshot,
  StartChatInput
} from '../../src/shared/provider-contract'
import type {
  ChatMode,
  TimelineApi,
  TimelineMessage,
  TimelineResult
} from '../../src/shared/timeline-contract'

afterEach(cleanup)

const assistantA = '00000000-0000-4000-8000-000000000001'
const assistantB = '00000000-0000-4000-8000-000000000002'
const connectionId = '00000000-0000-4000-8000-000000000003'

function assistants(currentAssistantId = assistantA): AssistantSnapshot {
  return {
    assistants: [
      {
        id: assistantA,
        displayName: 'Alpha',
        isArchived: false,
        createdAt: '2026-09-06T00:00:00.000Z',
        updatedAt: '2026-09-06T00:00:00.000Z',
        archivedAt: null,
        version: 1
      },
      {
        id: assistantB,
        displayName: 'Beta',
        isArchived: false,
        createdAt: '2026-09-06T00:00:01.000Z',
        updatedAt: '2026-09-06T00:00:01.000Z',
        archivedAt: null,
        version: 1
      }
    ],
    currentAssistantId,
    primaryAssistantId: assistantA,
    stateRevision: 2
  }
}

const providerSnapshot: ProviderSnapshot = {
  connections: [
    {
      id: connectionId,
      displayName: 'Receiver',
      baseUrl: 'https://example.com/v1',
      enabled: true,
      hasCredential: true,
      credentialPersistence: 'temporary',
      createdAt: '2026-09-06T00:00:00.000Z',
      updatedAt: '2026-09-06T00:00:00.000Z',
      version: 1
    }
  ],
  bindings: [
    {
      assistantId: assistantA,
      connectionId,
      model: 'model-a',
      updatedAt: '2026-09-06T00:00:00.000Z',
      version: 1
    },
    {
      assistantId: assistantB,
      connectionId,
      model: 'model-b',
      updatedAt: '2026-09-06T00:00:00.000Z',
      version: 1
    }
  ]
}

function message(
  id: string,
  requestId: string,
  role: TimelineMessage['role'],
  content: string,
  status: TimelineMessage['status'],
  saved: boolean
): TimelineMessage {
  return {
    id,
    requestId,
    role,
    content,
    status,
    saved,
    createdAt: '2026-09-06T00:00:00.000Z'
  }
}

function success(
  assistantId: string,
  mode: ChatMode,
  messages: TimelineMessage[],
  hasMore = false
): TimelineResult {
  return { ok: true, data: { assistantId, mode, messages, hasMore } }
}

function mockProvider(overrides: Partial<ProviderApi> = {}): ProviderApi {
  return {
    list: vi.fn().mockResolvedValue({ ok: true, data: providerSnapshot }),
    saveConnection: vi.fn(),
    setCredential: vi.fn(),
    deleteCredential: vi.fn(),
    bindAssistant: vi.fn(),
    clearChat: vi.fn(),
    startChat: vi.fn(),
    cancelChat: vi.fn(),
    onEvent: vi.fn(() => () => undefined),
    ...overrides
  } as ProviderApi
}

describe('ProviderPanel persistent timeline UI', () => {
  it('defaults to normal, restores real status, has no normal clear, and sends explicit normal mode', async () => {
    const restored = [
      message(
        '00000000-0000-4000-8000-000000000101',
        '00000000-0000-4000-8000-000000000201',
        'user',
        '重启后恢复的问题',
        'completed',
        true
      ),
      message(
        '00000000-0000-4000-8000-000000000102',
        '00000000-0000-4000-8000-000000000201',
        'assistant',
        '部分回答',
        'interrupted',
        true
      ),
      message(
        '00000000-0000-4000-8000-000000000103',
        '00000000-0000-4000-8000-000000000202',
        'assistant',
        '',
        'failed',
        true
      )
    ]
    const completed = [
      ...restored,
      message(
        '00000000-0000-4000-8000-000000000104',
        '00000000-0000-4000-8000-000000000203',
        'assistant',
        '新回答',
        'completed',
        true
      )
    ]
    let reads = 0
    const timelineApi = {
      read: vi.fn(async (input) => {
        reads += 1
        return success(input.assistantId, input.mode, reads === 1 ? restored : completed, true)
      }),
      saveTemporary: vi.fn()
    } as TimelineApi
    const startChat = vi.fn(async (input: StartChatInput) => ({
      ok: true as const,
      data: {
        requestId: input.requestId,
        assistantId: input.assistantId,
        status: 'completed' as const,
        text: '新回答',
        usage: null
      }
    }))

    render(
      <ProviderPanel
        assistantSnapshot={assistants()}
        api={mockProvider({ startChat })}
        timelineApi={timelineApi}
      />
    )

    expect(await screen.findByText('重启后恢复的问题')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '正常模式（自动保存）' })).toBeChecked()
    expect(screen.queryByRole('button', { name: '清空本助手的临时会话' })).toBeNull()
    expect(screen.getByText(/最多最近 16 组已完成的正常对话/)).toBeInTheDocument()
    expect(screen.getByText(/更早内容仍保留在本机/)).toBeInTheDocument()
    expect(screen.getByText(/响应中断.*不会自动重发/)).toBeInTheDocument()
    expect(screen.getByText(/失败，已保留现有正文/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('正常消息'), { target: { value: '新的正常问题' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(startChat).toHaveBeenCalledTimes(1))
    expect(startChat.mock.calls[0]![0]).toMatchObject({
      assistantId: assistantA,
      mode: 'normal',
      text: '新的正常问题'
    })
    expect(await screen.findByText('新回答')).toBeInTheDocument()
  })

  it('isolates temporary content and marks it saved only after trusted success', async () => {
    const temporary = [
      message(
        '00000000-0000-4000-8000-000000000111',
        '00000000-0000-4000-8000-000000000211',
        'user',
        '临时正文',
        'completed',
        false
      ),
      message(
        '00000000-0000-4000-8000-000000000112',
        '00000000-0000-4000-8000-000000000211',
        'assistant',
        '临时回答',
        'cancelled',
        false
      )
    ]
    const saved = temporary.map((item) => ({ ...item, saved: true }))
    const saveTemporary = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: 'STORAGE_UNAVAILABLE',
          message: 'save failed',
          correlationId: '00000000-0000-4000-8000-000000000301',
          retryable: true
        }
      })
      .mockResolvedValue(success(assistantA, 'temporary', saved))
    const timelineApi = {
      read: vi.fn(async (input) =>
        input.mode === 'normal'
          ? success(assistantA, 'normal', [
              message(
                '00000000-0000-4000-8000-000000000113',
                '00000000-0000-4000-8000-000000000212',
                'user',
                '正常历史不得混入',
                'completed',
                true
              )
            ])
          : success(assistantA, 'temporary', temporary)
      ),
      saveTemporary
    } as TimelineApi

    render(
      <ProviderPanel
        assistantSnapshot={assistants()}
        api={mockProvider()}
        timelineApi={timelineApi}
      />
    )

    expect(await screen.findByText('正常历史不得混入')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: '严格临时（不自动保存）' }))
    expect(await screen.findByText('临时正文')).toBeInTheDocument()
    expect(screen.queryByText('正常历史不得混入')).toBeNull()
    expect(screen.getByText(/保存目标：“Alpha”的正常时间线/)).toBeInTheDocument()
    const temporaryArticle = screen.getByText('临时正文').closest('article')
    if (!temporaryArticle) throw new Error('temporary article missing')
    expect(within(temporaryArticle).getByText(/未保存/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '保存到此助手时间线' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '本地时间线或 Provider 设置暂时无法读取'
    )
    expect(screen.getByText('临时正文')).toBeInTheDocument()
    expect(within(temporaryArticle).getByText(/未保存/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '保存到此助手时间线' }))
    expect(await screen.findByText(/已将当前临时会话中 2 条尚未保存的消息/)).toBeInTheDocument()
    const savedArticle = screen.getByText('临时正文').closest('article')
    if (!savedArticle) throw new Error('saved article missing')
    expect(within(savedArticle).getByText(/已保存/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '保存到此助手时间线' }))
    expect(await screen.findByText(/没有新的临时消息需要保存/)).toBeInTheDocument()
    expect(saveTemporary).toHaveBeenCalledTimes(3)
  })

  it('routes streaming updates to the captured mode after the user switches modes', async () => {
    let listener: ((event: ProviderEvent) => void) | undefined
    let resolveRequest: ((result: ProviderChatResult) => void) | undefined
    let finished = false
    let streamed = false
    const startChat = vi.fn((input: StartChatInput) => {
      void input
      return new Promise<ProviderChatResult>((resolve) => (resolveRequest = resolve))
    })
    const timelineApi = {
      read: vi.fn(async (input) =>
        input.mode === 'temporary' && (streamed || finished)
          ? success(assistantA, 'temporary', [
              message(
                '00000000-0000-4000-8000-000000000121',
                '00000000-0000-4000-8000-000000000221',
                'assistant',
                '局部输出',
                finished ? 'interrupted' : 'pending',
                false
              )
            ])
          : success(input.assistantId, input.mode, [])
      ),
      saveTemporary: vi.fn()
    } as TimelineApi
    const api = mockProvider({
      startChat,
      onEvent: vi.fn((value: (event: ProviderEvent) => void) => {
        listener = value
        return () => undefined
      })
    })

    render(<ProviderPanel assistantSnapshot={assistants()} api={api} timelineApi={timelineApi} />)
    await screen.findByText(/实际接收方：Receiver/)
    fireEvent.click(screen.getByRole('radio', { name: '严格临时（不自动保存）' }))
    fireEvent.change(screen.getByLabelText('临时消息'), { target: { value: '临时问题' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(startChat).toHaveBeenCalledTimes(1))
    const request = startChat.mock.calls[0]![0]
    expect(request.mode).toBe('temporary')

    fireEvent.click(screen.getByRole('radio', { name: '正常模式（自动保存）' }))
    streamed = true
    act(() =>
      listener?.({
        type: 'delta',
        assistantId: assistantA,
        requestId: request.requestId,
        text: '局部输出'
      })
    )
    expect(screen.queryByText('局部输出')).toBeNull()

    fireEvent.click(screen.getByRole('radio', { name: '严格临时（不自动保存）' }))
    expect(await screen.findByText('局部输出')).toBeInTheDocument()
    finished = true
    await act(async () => {
      resolveRequest?.({
        ok: true,
        data: {
          assistantId: assistantA,
          requestId: request.requestId,
          status: 'interrupted',
          text: '局部输出',
          usage: null
        }
      })
    })
    expect(await screen.findByText(/响应中断.*不会自动重发/)).toBeInTheDocument()
    const interruptedArticle = screen.getByText('局部输出').closest('article')
    if (!interruptedArticle) throw new Error('interrupted article missing')
    expect(within(interruptedArticle).getByText(/未保存/)).toBeInTheDocument()
  })

  it('does not let a late read replace the newly selected assistant pane', async () => {
    let resolveAlpha: ((result: TimelineResult) => void) | undefined
    const timelineApi = {
      read: vi.fn((input) => {
        if (input.assistantId === assistantA) {
          return new Promise<TimelineResult>((resolve) => (resolveAlpha = resolve))
        }
        return Promise.resolve(
          success(assistantB, input.mode, [
            message(
              '00000000-0000-4000-8000-000000000131',
              '00000000-0000-4000-8000-000000000231',
              'user',
              'Beta 的历史',
              'completed',
              true
            )
          ])
        )
      }),
      saveTemporary: vi.fn()
    } as TimelineApi
    const api = mockProvider()
    const view = render(
      <ProviderPanel
        assistantSnapshot={assistants(assistantA)}
        api={api}
        timelineApi={timelineApi}
      />
    )
    view.rerender(
      <ProviderPanel
        assistantSnapshot={assistants(assistantB)}
        api={api}
        timelineApi={timelineApi}
      />
    )
    expect(await screen.findByText('Beta 的历史')).toBeInTheDocument()

    await act(async () => {
      resolveAlpha?.(
        success(assistantA, 'normal', [
          message(
            '00000000-0000-4000-8000-000000000132',
            '00000000-0000-4000-8000-000000000232',
            'user',
            'Alpha 的迟到历史',
            'completed',
            true
          )
        ])
      )
    })
    expect(screen.getByText('Beta 的历史')).toBeInTheDocument()
    expect(screen.queryByText('Alpha 的迟到历史')).toBeNull()
  })
})
