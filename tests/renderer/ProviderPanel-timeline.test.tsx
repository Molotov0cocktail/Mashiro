// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProviderPanel } from '../../src/renderer/src/features/provider/ProviderPanel'
import { providerApi007Defaults } from './provider-api-fixture'
import { timelineApi006Defaults } from './timeline-api-fixture'
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
    ...providerApi007Defaults(),
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
  it.each(['failure', 'exception'] as const)(
    'preserves accepted partial when final receipt and read are unavailable: %s',
    async (failureMode) => {
      let listener: ((event: ProviderEvent) => void) | undefined
      let reads = 0
      const unavailable = {
        ok: false as const,
        error: {
          code: 'STORAGE_UNAVAILABLE' as const,
          message: 'unavailable',
          correlationId: 'read-failure',
          retryable: true
        }
      }
      const timelineApi = {
        ...timelineApi006Defaults(),
        read: vi.fn(async (input) =>
          ++reads === 1 ? success(input.assistantId, input.mode, []) : unavailable
        ),
        saveTemporary: vi.fn()
      } as TimelineApi
      const api = mockProvider({
        onEvent: vi.fn((callback) => {
          listener = callback
          return () => undefined
        }),
        startChat: vi.fn(async (input) => {
          listener?.({
            type: 'delta',
            assistantId: input.assistantId,
            requestId: input.requestId,
            text: 'ALREADY_RECEIVED_FROM_PROVIDER'
          })
          if (failureMode === 'exception') throw new Error('lost command reply')
          return unavailable
        })
      })
      render(<ProviderPanel assistantSnapshot={assistants()} api={api} timelineApi={timelineApi} />)
      await screen.findByText(/实际接收方：Receiver/)
      fireEvent.change(screen.getByLabelText('正常消息'), {
        target: { value: 'ACTUALLY_SENT_INPUT' }
      })
      fireEvent.click(screen.getByRole('button', { name: '发送' }))
      await screen.findByRole('alert')
      expect(screen.getByText('ALREADY_RECEIVED_FROM_PROVIDER')).toBeInTheDocument()
      expect(screen.getByText('ACTUALLY_SENT_INPUT')).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: '未发送草稿' })).toBeNull()
      expect(screen.getAllByText(/请求已发送，最终状态或保存情况未确认/)).toHaveLength(2)
      expect(api.startChat).toHaveBeenCalledTimes(1)
    }
  )

  it('retains an unknown command outcome without claiming the input was never sent', async () => {
    let reads = 0
    const timelineApi = {
      ...timelineApi006Defaults(),
      read: vi.fn(async (input) => {
        if (++reads === 1) return success(input.assistantId, input.mode, [])
        throw new Error('read unavailable')
      }),
      saveTemporary: vi.fn()
    } as TimelineApi
    const api = mockProvider({
      startChat: vi.fn(async () => {
        throw new Error('lost IPC reply')
      })
    })
    render(<ProviderPanel assistantSnapshot={assistants()} api={api} timelineApi={timelineApi} />)
    await screen.findByText(/实际接收方：Receiver/)
    fireEvent.change(screen.getByLabelText('正常消息'), { target: { value: 'UNKNOWN_DELIVERY' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await screen.findByRole('alert')
    expect(screen.getByText('UNKNOWN_DELIVERY')).toBeInTheDocument()
    expect(screen.getAllByText(/请求结果未确认，可能已经发送/)).toHaveLength(2)
    expect(screen.queryByRole('region', { name: '未发送草稿' })).toBeNull()
    expect(api.startChat).toHaveBeenCalledTimes(1)
  })

  it('keeps positively observed completion when the command reply and later read are lost', async () => {
    let listener: ((event: ProviderEvent) => void) | undefined
    let reads = 0
    const timelineApi = {
      ...timelineApi006Defaults(),
      read: vi.fn(async (input) => {
        if (++reads === 1) return success(input.assistantId, input.mode, [])
        throw new Error('read unavailable')
      }),
      saveTemporary: vi.fn()
    } as TimelineApi
    const api = mockProvider({
      onEvent: vi.fn((callback) => {
        listener = callback
        return () => undefined
      }),
      startChat: vi.fn(async (input) => {
        listener?.({
          type: 'delta',
          assistantId: input.assistantId,
          requestId: input.requestId,
          text: 'CONFIRMED_COMPLETE'
        })
        listener?.({
          type: 'completed',
          assistantId: input.assistantId,
          requestId: input.requestId
        })
        throw new Error('lost IPC reply')
      })
    })
    render(<ProviderPanel assistantSnapshot={assistants()} api={api} timelineApi={timelineApi} />)
    await screen.findByText(/实际接收方：Receiver/)
    fireEvent.change(screen.getByLabelText('正常消息'), { target: { value: 'confirmed input' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await screen.findByRole('alert')
    const article = screen.getByText('CONFIRMED_COMPLETE').closest('article')!
    expect(within(article).getByText('完成')).toBeInTheDocument()
    expect(within(article).queryByText(/未确认|未发送/)).toBeNull()
  })

  it('does not turn a superseded empty read into rejection or erase a newer request', async () => {
    let listener: ((event: ProviderEvent) => void) | undefined
    let resolveOldRead!: (result: TimelineResult) => void
    let reads = 0
    const requests: StartChatInput[] = []
    const unavailable = {
      ok: false as const,
      error: {
        code: 'STORAGE_UNAVAILABLE' as const,
        message: 'unavailable',
        correlationId: 'old-failure',
        retryable: true
      }
    }
    const rows = (): TimelineMessage[] => [
      message(
        '00000000-0000-4000-8000-000000000601',
        requests[0]!.requestId,
        'user',
        'old accepted input',
        'completed',
        true
      ),
      message(
        '00000000-0000-4000-8000-000000000602',
        requests[0]!.requestId,
        'assistant',
        '',
        'pending',
        true
      ),
      message(
        '00000000-0000-4000-8000-000000000603',
        requests[1]!.requestId,
        'user',
        'new accepted input',
        'completed',
        true
      ),
      message(
        '00000000-0000-4000-8000-000000000604',
        requests[1]!.requestId,
        'assistant',
        'NEW_CONFIRMED_REPLY',
        'completed',
        true
      )
    ]
    const timelineApi = {
      ...timelineApi006Defaults(),
      read: vi.fn(async (input) => {
        reads += 1
        if (reads === 1) return success(input.assistantId, input.mode, [])
        if (reads === 2)
          return new Promise<TimelineResult>((resolve) => {
            resolveOldRead = resolve
          })
        return success(input.assistantId, input.mode, rows())
      }),
      saveTemporary: vi.fn()
    } as TimelineApi
    const api = mockProvider({
      onEvent: vi.fn((callback) => {
        listener = callback
        return () => undefined
      }),
      startChat: vi.fn(async (input) => {
        requests.push(input)
        if (requests.length === 1) {
          listener?.({
            type: 'delta',
            assistantId: input.assistantId,
            requestId: input.requestId,
            text: 'OLD_ACCEPTED_PARTIAL'
          })
          return unavailable
        }
        return {
          ok: true as const,
          data: {
            assistantId: input.assistantId,
            requestId: input.requestId,
            status: 'completed' as const,
            text: 'NEW_CONFIRMED_REPLY',
            usage: null
          }
        }
      })
    })
    render(<ProviderPanel assistantSnapshot={assistants()} api={api} timelineApi={timelineApi} />)
    await screen.findByText(/实际接收方：Receiver/)
    fireEvent.change(screen.getByLabelText('正常消息'), { target: { value: 'old accepted input' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(timelineApi.read).toHaveBeenCalledTimes(2))
    fireEvent.change(screen.getByLabelText('正常消息'), { target: { value: 'new accepted input' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(timelineApi.read).toHaveBeenCalledTimes(3))
    await act(async () => {
      resolveOldRead(success(assistantA, 'normal', []))
    })
    expect(screen.getByText('OLD_ACCEPTED_PARTIAL')).toBeInTheDocument()
    expect(screen.getByText('old accepted input')).toBeInTheDocument()
    expect(screen.getByText('NEW_CONFIRMED_REPLY')).toBeInTheDocument()
    expect(screen.getByText('new accepted input')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '未发送草稿' })).toBeNull()
    expect(api.startChat).toHaveBeenCalledTimes(2)
  })

  it('uses the confirmed saved total after optimistic IDs failed to refresh, while keeping rejected drafts', async () => {
    let reads = 0
    let sends = 0
    let acceptedRequestId = ''
    const unavailable = {
      ok: false as const,
      error: {
        code: 'STORAGE_UNAVAILABLE' as const,
        message: 'unavailable',
        correlationId: 'read-failure',
        retryable: true
      }
    }
    const saved = (): TimelineMessage[] => [
      message(
        '00000000-0000-4000-8000-000000000701',
        acceptedRequestId,
        'user',
        'accepted temporary input',
        'completed',
        true
      ),
      message(
        '00000000-0000-4000-8000-000000000702',
        acceptedRequestId,
        'assistant',
        'accepted reply',
        'completed',
        true
      )
    ]
    const timelineApi = {
      ...timelineApi006Defaults(),
      read: vi.fn(async (input) =>
        ++reads <= 3 ? success(input.assistantId, input.mode, []) : unavailable
      ),
      saveTemporary: vi.fn(async () => success(assistantA, 'temporary', saved()))
    } as TimelineApi
    const api = mockProvider({
      startChat: vi.fn(async (input) => {
        if (++sends === 1)
          return {
            ok: false as const,
            error: { ...unavailable.error, code: 'CREDENTIAL_MISSING' as const }
          }
        acceptedRequestId = input.requestId
        return {
          ok: true as const,
          data: {
            assistantId: input.assistantId,
            requestId: input.requestId,
            status: 'completed' as const,
            text: 'accepted reply',
            usage: null
          }
        }
      })
    })
    render(<ProviderPanel assistantSnapshot={assistants()} api={api} timelineApi={timelineApi} />)
    await screen.findByText(/实际接收方：Receiver/)
    fireEvent.click(screen.getByRole('radio', { name: '严格临时（不自动保存）' }))
    await waitFor(() => expect(timelineApi.read).toHaveBeenCalledTimes(2))
    fireEvent.change(screen.getByLabelText('临时消息'), {
      target: { value: 'rejected draft remains' }
    })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await screen.findByRole('region', { name: '未发送草稿' })
    fireEvent.change(screen.getByLabelText('临时消息'), {
      target: { value: 'accepted temporary input' }
    })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(timelineApi.read).toHaveBeenCalledTimes(4))
    for (let count = 1; count <= 2; count++) {
      fireEvent.click(screen.getByRole('button', { name: '保存到此助手时间线' }))
      await waitFor(() => expect(timelineApi.saveTemporary).toHaveBeenCalledTimes(count))
      expect(
        await screen.findByText(/已将当前临时会话中 2 条消息.*已确认的保存总数/)
      ).toBeInTheDocument()
      expect(screen.queryByText(/没有临时时间线消息被保存/)).toBeNull()
      expect(screen.getByText('rejected draft remains')).toBeInTheDocument()
      expect(screen.getByText('accepted temporary input')).toBeInTheDocument()
      expect(screen.getByText('accepted reply')).toBeInTheDocument()
    }
    expect(within(screen.getByLabelText('消息时间线')).getAllByRole('article')).toHaveLength(2)
    expect(api.startChat).toHaveBeenCalledTimes(2)
  })

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
    let completedRequestId = ''
    const completed = (): TimelineMessage[] => [
      ...restored,
      message(
        '00000000-0000-4000-8000-000000000104',
        completedRequestId,
        'user',
        '新的正常问题',
        'completed',
        true
      ),
      message(
        '00000000-0000-4000-8000-000000000105',
        completedRequestId,
        'assistant',
        '新回答',
        'completed',
        true
      )
    ]
    let reads = 0
    const timelineApi = {
      ...timelineApi006Defaults(),
      read: vi.fn(async (input) => {
        reads += 1
        return success(input.assistantId, input.mode, reads === 1 ? restored : completed(), true)
      }),
      saveTemporary: vi.fn()
    } as TimelineApi
    const startChat = vi.fn(async (input: StartChatInput) => {
      completedRequestId = input.requestId
      return {
        ok: true as const,
        data: {
          requestId: input.requestId,
          assistantId: input.assistantId,
          status: 'completed' as const,
          text: '新回答',
          usage: null
        }
      }
    })

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
      ...timelineApi006Defaults(),
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
    expect(
      await screen.findByText(/已将当前临时会话中 2 条消息.*已确认的保存总数/)
    ).toBeInTheDocument()
    const savedArticle = screen.getByText('临时正文').closest('article')
    if (!savedArticle) throw new Error('saved article missing')
    expect(within(savedArticle).getByText(/已保存/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '保存到此助手时间线' }))
    expect(
      await screen.findByText(/已将当前临时会话中 2 条消息.*已确认的保存总数/)
    ).toBeInTheDocument()
    expect(saveTemporary).toHaveBeenCalledTimes(3)
  })

  it('routes streaming updates to the captured mode after the user switches modes', async () => {
    let listener: ((event: ProviderEvent) => void) | undefined
    let resolveRequest: ((result: ProviderChatResult) => void) | undefined
    let finished = false
    let streamed = false
    let capturedRequestId = ''
    const startChat = vi.fn((input: StartChatInput) => {
      capturedRequestId = input.requestId
      return new Promise<ProviderChatResult>((resolve) => (resolveRequest = resolve))
    })
    const timelineApi = {
      ...timelineApi006Defaults(),
      read: vi.fn(async (input) =>
        input.mode === 'temporary' && (streamed || finished)
          ? success(assistantA, 'temporary', [
              message(
                '00000000-0000-4000-8000-000000000121',
                capturedRequestId,
                'user',
                '临时问题',
                'completed',
                false
              ),
              message(
                '00000000-0000-4000-8000-000000000122',
                capturedRequestId,
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
    await waitFor(() => expect(timelineApi.read).toHaveBeenCalledTimes(2))
    fireEvent.change(screen.getByLabelText('临时消息'), { target: { value: '临时问题' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(startChat).toHaveBeenCalledTimes(1))
    const request = startChat.mock.calls[0]![0]
    expect(request.mode).toBe('temporary')

    fireEvent.click(screen.getByRole('radio', { name: '正常模式（自动保存）' }))
    await waitFor(() => expect(timelineApi.read).toHaveBeenCalledTimes(3))
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
    await waitFor(() => expect(timelineApi.read).toHaveBeenCalledTimes(4))
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
      ...timelineApi006Defaults(),
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

  it('keeps a rejected temporary input as an unsent draft and reports an empty save honestly', async () => {
    const timelineApi = {
      ...timelineApi006Defaults(),
      read: vi.fn(async (input) => success(input.assistantId, input.mode, [])),
      saveTemporary: vi.fn(async () => success(assistantA, 'temporary', []))
    } as TimelineApi
    const api = mockProvider({
      startChat: vi.fn(async () => ({
        ok: false as const,
        error: {
          code: 'CREDENTIAL_MISSING' as const,
          message: 'missing credential',
          correlationId: 'corr-rejected',
          retryable: false
        }
      }))
    })
    render(<ProviderPanel assistantSnapshot={assistants()} api={api} timelineApi={timelineApi} />)
    await screen.findByText(/实际接收方：Receiver/)
    fireEvent.click(screen.getByRole('radio', { name: '严格临时（不自动保存）' }))
    await waitFor(() => expect(timelineApi.read).toHaveBeenCalledTimes(2))
    fireEvent.change(screen.getByLabelText('临时消息'), {
      target: { value: 'USER_EXPECTS_TO_SAVE_THIS' }
    })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(api.startChat).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/请先为连接设置 API Key/)).toBeInTheDocument()
    expect(screen.getByText('USER_EXPECTS_TO_SAVE_THIS')).toBeInTheDocument()
    expect(screen.getByText(/未发送.*未保存.*未进入可保存的临时时间线/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '保存到此助手时间线' }))
    expect(await screen.findByText(/没有临时时间线消息被保存/)).toBeInTheDocument()
    expect(screen.queryByText(/已将当前临时会话中 2 条/)).toBeNull()
    expect(screen.getByText('USER_EXPECTS_TO_SAVE_THIS')).toBeInTheDocument()
    expect(screen.getByText(/未发送.*未保存.*未进入可保存的临时时间线/)).toBeInTheDocument()
  })

  it('preserves a captured normal partial across mode, assistant, and stale pending reads', async () => {
    let listener: ((event: ProviderEvent) => void) | undefined
    let activeRequestId = ''
    let finalized = false
    let delayNextNormalRead = false
    let resolveDelayedRead: ((result: TimelineResult) => void) | undefined
    let resolveRequest: ((result: ProviderChatResult) => void) | undefined
    const pending = (): TimelineMessage[] => [
      message(
        '00000000-0000-4000-8000-000000000151',
        activeRequestId,
        'user',
        '触发流式响应',
        'completed',
        true
      ),
      message(
        '00000000-0000-4000-8000-000000000152',
        activeRequestId,
        'assistant',
        '',
        'pending',
        true
      )
    ]
    const terminal = (): TimelineMessage[] => [
      message(
        '00000000-0000-4000-8000-000000000151',
        activeRequestId,
        'user',
        '触发流式响应',
        'completed',
        true
      ),
      message(
        '00000000-0000-4000-8000-000000000152',
        activeRequestId,
        'assistant',
        'RECEIVED_PARTIAL_MUST_REMAIN',
        'interrupted',
        true
      )
    ]
    const timelineApi = {
      ...timelineApi006Defaults(),
      read: vi.fn(async (input) => {
        if (input.assistantId === assistantB) {
          return success(assistantB, input.mode, [
            message(
              '00000000-0000-4000-8000-000000000153',
              '00000000-0000-4000-8000-000000000253',
              'user',
              'Beta 独立历史',
              'completed',
              true
            )
          ])
        }
        if (input.mode === 'temporary' || !activeRequestId)
          return success(input.assistantId, input.mode, [])
        if (delayNextNormalRead) {
          delayNextNormalRead = false
          return new Promise<TimelineResult>((resolve) => {
            resolveDelayedRead = resolve
          })
        }
        return success(assistantA, 'normal', finalized ? terminal() : pending())
      }),
      saveTemporary: vi.fn()
    } as TimelineApi
    const startChat = vi.fn((input: StartChatInput) => {
      activeRequestId = input.requestId
      return new Promise<ProviderChatResult>((resolve) => {
        resolveRequest = resolve
      })
    })
    const api = mockProvider({
      startChat,
      onEvent: vi.fn((callback) => {
        listener = callback
        return () => undefined
      })
    })
    const view = render(
      <ProviderPanel
        assistantSnapshot={assistants(assistantA)}
        api={api}
        timelineApi={timelineApi}
      />
    )
    await screen.findByText(/实际接收方：Receiver/)
    fireEvent.change(screen.getByLabelText('正常消息'), { target: { value: '触发流式响应' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(startChat).toHaveBeenCalledTimes(1))
    act(() => {
      listener?.({
        type: 'delta',
        assistantId: assistantA,
        requestId: activeRequestId,
        text: 'RECEIVED_PARTIAL_MUST_REMAIN'
      })
    })
    expect(screen.getByText('RECEIVED_PARTIAL_MUST_REMAIN')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: '严格临时（不自动保存）' }))
    await waitFor(() => expect(timelineApi.read).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByRole('radio', { name: '正常模式（自动保存）' }))
    await waitFor(() => expect(timelineApi.read).toHaveBeenCalledTimes(3))
    expect(screen.getByText('RECEIVED_PARTIAL_MUST_REMAIN')).toBeInTheDocument()
    view.rerender(
      <ProviderPanel
        assistantSnapshot={assistants(assistantB)}
        api={api}
        timelineApi={timelineApi}
      />
    )
    expect(await screen.findByText('Beta 独立历史')).toBeInTheDocument()
    view.rerender(
      <ProviderPanel
        assistantSnapshot={assistants(assistantA)}
        api={api}
        timelineApi={timelineApi}
      />
    )
    expect(await screen.findByText('RECEIVED_PARTIAL_MUST_REMAIN')).toBeInTheDocument()
    expect(screen.queryByText('Beta 独立历史')).toBeNull()

    const readsBeforeTerminalRace = vi.mocked(timelineApi.read).mock.calls.length
    fireEvent.click(screen.getByRole('radio', { name: '严格临时（不自动保存）' }))
    await waitFor(() => expect(timelineApi.read).toHaveBeenCalledTimes(readsBeforeTerminalRace + 1))
    delayNextNormalRead = true
    fireEvent.click(screen.getByRole('radio', { name: '正常模式（自动保存）' }))
    await waitFor(() => expect(resolveDelayedRead).toBeTypeOf('function'))
    act(() => {
      listener?.({ type: 'interrupted', assistantId: assistantA, requestId: activeRequestId })
    })
    await act(async () => {
      resolveDelayedRead?.(success(assistantA, 'normal', pending()))
    })
    expect(screen.getByText('RECEIVED_PARTIAL_MUST_REMAIN')).toBeInTheDocument()
    const interruptedArticle = screen.getByText('RECEIVED_PARTIAL_MUST_REMAIN').closest('article')
    if (!interruptedArticle) throw new Error('interrupted article missing')
    expect(within(interruptedArticle).getByText(/响应中断/)).toBeInTheDocument()
    finalized = true
    await act(async () => {
      resolveRequest?.({
        ok: true,
        data: {
          assistantId: assistantA,
          requestId: activeRequestId,
          status: 'interrupted',
          text: 'RECEIVED_PARTIAL_MUST_REMAIN',
          usage: null
        }
      })
    })
    const finalArticle = screen.getByText('RECEIVED_PARTIAL_MUST_REMAIN').closest('article')
    if (!finalArticle) throw new Error('final article missing')
    expect(within(finalArticle).getByText(/响应中断/)).toBeInTheDocument()
  })
})
