import { expect, it, vi } from 'vitest'
import { chatCompletions } from '../../src/main/provider/chat-completions-transport.js'
const request = {
  baseUrl: 'https://example.test/v1',
  apiKey: 'synthetic',
  model: 'test',
  messages: [{ role: 'user' as const, content: 'synthetic' }],
  stream: false
}
it('maps the background output ceiling into the actual HTTP payload', async () => {
  const fetch = vi.fn(async (_url: unknown, input?: RequestInit) => {
    expect(JSON.parse(String(input!.body)).max_tokens).toBe(2048)
    return new Response(
      JSON.stringify({
        choices: [{ index: 0, message: { content: '{}' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 }
      }),
      { headers: { 'content-type': 'application/json' } }
    )
  })
  expect(
    await chatCompletions(
      { ...request, maxOutputTokens: 2048 },
      { fetch: fetch as typeof globalThis.fetch }
    )
  ).toMatchObject({ status: 'completed', usage: { totalTokens: 3 } })
  expect(fetch).toHaveBeenCalledTimes(1)
})
it('rejects invalid ceilings before any network request', async () => {
  const fetch = vi.fn()
  for (const limit of [0, -1, 1.5, 8193, Infinity])
    expect(await chatCompletions({ ...request, maxOutputTokens: limit }, { fetch })).toMatchObject({
      status: 'failed',
      error: 'configuration'
    })
  expect(fetch).not.toHaveBeenCalled()
})
