import { expect, it, vi } from 'vitest'
import { chatCompletions } from '../../src/main/provider/chat-completions-transport.js'
import { providerProfile } from '../../src/main/provider/provider-profile.js'

const request = {
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-v4-flash',
  apiKey: 'synthetic-only',
  messages: [{ role: 'user' as const, content: '合成问题' }],
  stream: false
}
function response(message: object): Response {
  return new Response(
    JSON.stringify({
      choices: [{ index: 0, message, finish_reason: 'stop' }],
      usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 }
    }),
    { headers: { 'content-type': 'application/json' } }
  )
}

it.each(['deepseek-v4-flash', 'deepseek-v4-pro'])(
  'captures plain %s reasoning without leaking it as display text',
  async (model) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      response({ content: '合成回答', reasoning_content: '协议专属推理' })
    )
    const onDelta = vi.fn()
    const result = await chatCompletions({ ...request, model, onDelta }, { fetch })
    expect(result).toMatchObject({
      text: '合成回答',
      reasoning: '协议专属推理',
      finishReason: 'stop'
    })
    expect(onDelta.mock.calls.flat()).toEqual(['合成回答'])
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))
    expect(body).toMatchObject({ thinking: { type: 'enabled' }, reasoning_effort: 'low' })
    expect(body).not.toHaveProperty('tools')
    expect(body).not.toHaveProperty('tool_stream')
    expect(body.thinking).not.toHaveProperty('clear_thinking')
  }
)

it('retains fragmented SSE reasoning across plain completion while deltas contain only the answer', async () => {
  const chunks = [
    { reasoning_content: '推理甲' },
    { reasoning_content: '乙' },
    { content: '答复' }
  ].map(
    (delta) =>
      'data: ' +
      JSON.stringify({ choices: [{ index: 0, delta, finish_reason: null }] }) +
      '\r\n\r\n'
  )
  chunks.push(
    'data: ' +
      JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) +
      '\n\ndata: [DONE]\n\n'
  )
  const bytes = new TextEncoder().encode(chunks.join(''))
  const fetch = vi.fn(
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            for (const byte of bytes) controller.enqueue(new Uint8Array([byte]))
            controller.close()
          }
        }),
        { headers: { 'content-type': 'text/event-stream' } }
      )
  )
  const onDelta = vi.fn()
  expect(await chatCompletions({ ...request, stream: true, onDelta }, { fetch })).toMatchObject({
    status: 'completed',
    text: '答复',
    reasoning: '推理甲乙',
    usage: null
  })
  expect(onDelta.mock.calls.flat().join('')).toBe('答复')
})

it.each([
  { content: '回答' },
  { content: '回答', reasoning_content: { invalid: true } },
  { content: '回答', reasoning_content: 'x'.repeat(120001) }
])('does not fabricate or truncate required reasoning', async (message) => {
  const result = await chatCompletions(request, { fetch: vi.fn(async () => response(message)) })
  expect(result.status).not.toBe('completed')
  expect(result.error).toMatch(/protocol|limit/)
})

it('distinguishes a real empty reasoning field from an absent field', async () => {
  expect(
    await chatCompletions(request, {
      fetch: vi.fn(async () => response({ content: '答', reasoning_content: '' }))
    })
  ).toMatchObject({
    status: 'completed',
    reasoning: ''
  })
})

it('blocks missing historical reasoning and its full input budget before network I/O', async () => {
  const fetch = vi.fn()
  for (const assistant of [
    { role: 'assistant' as const, content: '旧回答' },
    { role: 'assistant' as const, content: '旧回答', reasoning_content: 'x'.repeat(120000) }
  ]) {
    const result = await chatCompletions(
      { ...request, tools: 'clock', messages: [...request.messages, assistant] },
      { fetch }
    )
    expect(result.status).toBe('failed')
  }
  expect(fetch).not.toHaveBeenCalled()
})

it('keeps hosting variants and unadapted models out of retained tools', async () => {
  const fetch = vi.fn()
  for (const [baseUrl, model] of [
    ['https://api.deepseek.com/beta', 'deepseek-v4-flash'],
    ['https://api.deepseek.com.evil.invalid/v1', 'deepseek-v4-flash'],
    ['https://api.deepseek.com/v1', 'some-future-model'],
    ['https://dashscope.aliyuncs.com/compatible-mode/v1', 'deepseek-v4-flash']
  ]) {
    expect(providerProfile(baseUrl!, model!)).toBeUndefined()
    expect(
      await chatCompletions(
        { ...request, baseUrl: baseUrl!, model: model!, tools: 'clock' },
        { fetch }
      )
    ).toMatchObject({ error: 'configuration' })
  }
  expect(fetch).not.toHaveBeenCalled()
})
