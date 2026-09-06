import { describe, expect, it, vi } from 'vitest'
import {
  chatCompletions,
  validateBaseUrl
} from '../../src/main/provider/chat-completions-transport.js'

const request = {
  baseUrl: 'https://example.test/v1',
  apiKey: 'synthetic-secret',
  model: 'test',
  messages: [{ role: 'user' as const, content: 'hello' }],
  stream: true
}
function fixture(text: string, size = 1) {
  const bytes = new TextEncoder().encode(text)
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += size) controller.enqueue(bytes.slice(i, i + size))
        controller.close()
      }
    }),
    { headers: { 'content-type': 'text/event-stream' } }
  )
}
const delta = (text: string) =>
  JSON.stringify({ choices: [{ index: 0, delta: { content: text }, finish_reason: null }] })
const finish = JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })
const run = (body: string) => chatCompletions(request, { fetch: vi.fn(async () => fixture(body)) })

describe('bounded Chat Completions transport', () => {
  it('rejects unsafe base URLs', () => {
    for (const url of [
      'http://example.test',
      'https://user:pass@example.test',
      'https://example.test/?key=x',
      'https://example.test/#x'
    ])
      expect(() => validateBaseUrl(url)).toThrow()
  })
  it('decodes fragmented UTF-8, CRLF/CR/LF, comments and multiline data', async () => {
    const result = await run(
      ': comment\r\ndata: {"choices":\r\ndata: [{"index":0,"delta":{"content":"你好"},"finish_reason":null}]}\r\n\r\ndata: ' +
        finish +
        '\r\rdata: [DONE]\n\n'
    )
    expect(result).toEqual({ status: 'completed', text: '你好', usage: null })
  })
  it('requires finish and DONE, preserves partial output on truncation', async () => {
    for (const suffix of ['', 'data: [DONE]\n\n', 'data: ' + finish + '\n\n']) {
      expect(await run('data: ' + delta('partial') + '\n\n' + suffix)).toMatchObject({
        status: 'interrupted',
        text: 'partial',
        error: 'protocol'
      })
    }
  })
  it('uses final usage once and handles standalone usage chunks', async () => {
    const usage = JSON.stringify({
      choices: [],
      usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 }
    })
    const result = await run(
      'data: ' +
        delta('yes') +
        '\n\ndata: ' +
        finish +
        '\n\ndata: ' +
        usage +
        '\n\ndata: ' +
        usage +
        '\n\ndata: [DONE]\n\n'
    )
    expect(result.usage).toEqual({ promptTokens: 2, completionTokens: 3, totalTokens: 5 })
  })
  it('validates JSON completion and ignores remote tool payloads', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                index: 0,
                message: {
                  content: 'safe',
                  tool_calls: [{ function: { name: 'shell', arguments: 'bad' } }]
                },
                finish_reason: 'stop'
              }
            ]
          }),
          { headers: { 'content-type': 'application/json' } }
        )
    )
    expect(await chatCompletions({ ...request, stream: false }, { fetch: fetcher })).toEqual({
      status: 'completed',
      text: 'safe',
      usage: null
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('rejects redirect and classifies HTTP errors without bodies or retry', async () => {
    for (const [status, error] of [
      [302, 'configuration'],
      [401, 'authentication'],
      [429, 'quota'],
      [503, 'temporary']
    ] as const) {
      const fetcher = vi.fn(async () => new Response('synthetic-secret', { status }))
      const result = await chatCompletions(request, { fetch: fetcher })
      expect(result.error).toBe(error)
      expect(JSON.stringify(result)).not.toContain('synthetic-secret')
      expect(fetcher).toHaveBeenCalledTimes(1)
      expect(fetcher.mock.calls[0]?.length).toBe(2)
    }
  })
  it('cancels a hanging fetch and enforces timeout even on an uncooperative fixture', async () => {
    const fetcher = vi.fn(() => new Promise<Response>(() => {}))
    expect((await chatCompletions(request, { fetch: fetcher, timeoutMs: 5 })).error).toBe('timeout')
    const controller = new AbortController()
    const pending = chatCompletions({ ...request, signal: controller.signal }, { fetch: fetcher })
    controller.abort()
    expect((await pending).status).toBe('cancelled')
  })
  it('bounds total response and unframed data', async () => {
    expect(
      (
        await chatCompletions(request, {
          fetch: async () => fixture('x'.repeat(100)),
          maxResponseBytes: 20
        })
      ).error
    ).toBe('limit')
    expect(
      (
        await chatCompletions(request, {
          fetch: async () => fixture('x'.repeat(100)),
          maxBufferChars: 20
        })
      ).error
    ).toBe('limit')
  })
  it('only applies controlled BigModel thinking settings and never follows redirects', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      fixture('data: ' + finish + '\n\ndata: [DONE]\n\n')
    )
    await chatCompletions(
      { ...request, baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'GLM-5.3-FLASH' },
      { fetch: fetcher }
    )
    const options = fetcher.mock.calls[0]?.[1]
    expect(options?.redirect).toBe('error')
    const body = JSON.parse(options?.body as string)
    // The former disabled oracle followed generic docs; live GLM-5.3-FLASH rejected it with HTTP 400 / 1210.
    expect(body.thinking).toEqual({ type: 'enabled' })
    expect(body.reasoning_effort).toBe('low')
    expect(body).not.toHaveProperty('stream_options')
  })
})

describe('transport failure and cleanup boundaries', () => {
  it('marks malformed JSON, invalid UTF-8 and non-JSON responses as protocol failures', async () => {
    const bodies = [
      fixture('data: invalid\n\n'),
      new Response(new Uint8Array([0xff]), { headers: { 'content-type': 'text/event-stream' } }),
      new Response('<html>synthetic-secret</html>', { headers: { 'content-type': 'text/html' } })
    ]
    for (const body of bodies) {
      const result = await chatCompletions(request, { fetch: async () => body })
      expect(result).toMatchObject({ status: 'failed', error: 'protocol' })
      expect(JSON.stringify(result)).not.toContain('synthetic-secret')
    }
  })
  it('cancels an incomplete body and preserves streamed partial text on timeout', async () => {
    const cancel = vi.fn()
    const onDelta = vi.fn()
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: ' + delta('partial') + '\n\n'))
        },
        cancel
      }),
      { headers: { 'content-type': 'text/event-stream' } }
    )
    const result = await chatCompletions(
      { ...request, onDelta },
      { fetch: async () => response, timeoutMs: 10 }
    )
    expect(result).toMatchObject({ status: 'interrupted', text: 'partial', error: 'timeout' })
    expect(onDelta).toHaveBeenCalledExactlyOnceWith('partial')
    expect(cancel).toHaveBeenCalledTimes(1)
  })
  it('does not dispatch an unterminated SSE event or accept tool/length finishes as success', async () => {
    expect((await run('data: ' + delta('discarded'))).text).toBe('')
    for (const reason of ['length', 'tool_calls', 'content_filter']) {
      const result = await run(
        'data: ' +
          delta('partial') +
          '\n\ndata: ' +
          JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: reason }] }) +
          '\n\ndata: [DONE]\n\n'
      )
      expect(result).toMatchObject({ status: 'interrupted', text: 'partial' })
    }
  })
  it('rejects malformed usage and does not invent totals', async () => {
    const result = await run(
      'data: ' +
        JSON.stringify({ choices: [], usage: { prompt_tokens: 1, completion_tokens: 2 } }) +
        '\n\n'
    )
    expect(result).toMatchObject({ status: 'failed', usage: null, error: 'protocol' })
  })
  it('pre-abort makes no request and generic requests omit BigModel settings', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      fixture('data: ' + finish + '\n\ndata: [DONE]\n\n')
    )
    const signal = AbortSignal.abort()
    expect((await chatCompletions({ ...request, signal }, { fetch: fetcher })).status).toBe(
      'cancelled'
    )
    expect(fetcher).not.toHaveBeenCalled()
    await chatCompletions(request, { fetch: fetcher })
    expect(JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string)).not.toHaveProperty('thinking')
  })
  it('sanitizes network errors and never retries', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('https://user:synthetic-secret@private.test')
    })
    const result = await chatCompletions(request, { fetch: fetcher })
    expect(result).toEqual({ status: 'failed', text: '', usage: null, error: 'temporary' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})

describe('BigModel required-thinking model adaptation', () => {
  it.each(['GLM-5.3', 'glm-5.3', 'GLM-5.3-FLASH', 'glm-5.3-flash', 'GlM-5.3-FlAsH'])(
    'uses lowest supported thinking for %s without changing the wire model',
    async (model) => {
      const fetcher = vi.fn<typeof fetch>(async () =>
        fixture('data: ' + finish + '\n\ndata: [DONE]\n\n')
      )
      await chatCompletions(
        { ...request, baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model },
        { fetch: fetcher }
      )
      const body = JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string)
      expect(body.model).toBe(model)
      expect(body.thinking).toEqual({ type: 'enabled' })
      expect(body.reasoning_effort).toBe('low')
      expect(body).not.toHaveProperty('stream_options')
    }
  )
  it('retains the previous generic BigModel adapter for other models', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      fixture('data: ' + finish + '\n\ndata: [DONE]\n\n')
    )
    await chatCompletions(
      { ...request, baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4.7' },
      { fetch: fetcher }
    )
    const body = JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string)
    expect(body.thinking).toEqual({ type: 'disabled' })
    expect(body).not.toHaveProperty('reasoning_effort')
  })
  it('does not apply the model-specific adapter to another host', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      fixture('data: ' + finish + '\n\ndata: [DONE]\n\n')
    )
    await chatCompletions({ ...request, model: 'GLM-5.3-FLASH' }, { fetch: fetcher })
    const body = JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string)
    expect(body).not.toHaveProperty('thinking')
    expect(body).not.toHaveProperty('reasoning_effort')
  })
})

describe('cross-layer visible text bounds', () => {
  it('rejects a real 200001-character JSON completion under default wire limits without retry', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ index: 0, message: { content: 'x'.repeat(200001) }, finish_reason: 'stop' }]
          }),
          { headers: { 'content-type': 'application/json' } }
        )
    )
    const onDelta = vi.fn()
    const result = await chatCompletions({ ...request, stream: false, onDelta }, { fetch: fetcher })
    expect(result).toEqual({ status: 'failed', text: '', usage: null, error: 'limit' })
    expect(onDelta).not.toHaveBeenCalled()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('splits one >65536-character delta into lossless IPC-sized chunks without splitting surrogate pairs', async () => {
    const content = 'a'.repeat(16383) + '😀'.repeat(30000)
    const chunks: string[] = []
    const fetcher = vi.fn(async () =>
      fixture('data: ' + delta(content) + '\n\ndata: ' + finish + '\n\ndata: [DONE]\n\n', 8192)
    )
    const result = await chatCompletions(
      { ...request, onDelta: (text) => chunks.push(text) },
      { fetch: fetcher }
    )
    expect(result.status).toBe('completed')
    expect(result.text).toBe(content)
    expect(chunks.join('')).toBe(content)
    expect(chunks.length).toBeGreaterThan(1)
    expect(
      chunks.every(
        (chunk) =>
          chunk.length <= 16384 &&
          new TextDecoder().decode(new TextEncoder().encode(chunk)) === chunk
      )
    ).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('returns a representable partial prefix on cumulative stream overflow and never splits its last pair', async () => {
    const prefix = 'x'.repeat(119999)
    const chunks: string[] = []
    const fetcher = vi.fn(async () =>
      fixture(
        'data: ' +
          delta(prefix) +
          '\n\ndata: ' +
          delta('😀more') +
          '\n\ndata: ' +
          finish +
          '\n\ndata: [DONE]\n\n',
        8192
      )
    )
    const result = await chatCompletions(
      { ...request, onDelta: (text) => chunks.push(text) },
      { fetch: fetcher }
    )
    expect(result).toMatchObject({ status: 'interrupted', error: 'limit', text: prefix })
    expect(result.text.length).toBeLessThanOrEqual(120000)
    expect(new TextDecoder().decode(new TextEncoder().encode(result.text))).toBe(result.text)
    expect(chunks.join('')).toBe(result.text)
    expect(
      chunks.every(
        (chunk) =>
          chunk.length <= 16384 &&
          new TextDecoder().decode(new TextEncoder().encode(chunk)) === chunk
      )
    ).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('retains a bounded partial for a single 200001-character SSE delta at default limits', async () => {
    const chunks: string[] = []
    const fetcher = vi.fn(async () =>
      fixture(
        'data: ' + delta('x'.repeat(200001)) + '\n\ndata: ' + finish + '\n\ndata: [DONE]\n\n',
        8192
      )
    )
    const result = await chatCompletions(
      { ...request, onDelta: (text) => chunks.push(text) },
      { fetch: fetcher }
    )
    expect(result).toMatchObject({ status: 'interrupted', error: 'limit' })
    expect(result.text).toBe('x'.repeat(120000))
    expect(chunks.join('')).toBe(result.text)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
