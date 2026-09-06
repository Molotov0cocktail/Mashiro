import { describe, it, expect } from 'vitest'
import { chatCompletions } from '../../src/main/provider/chat-completions-transport.js'
import { ToolAccumulator } from '../../src/main/provider/tool-protocol.js'
const packet = (delta: unknown, finish_reason: string | null = null) =>
  'data: ' + JSON.stringify({ choices: [{ index: 0, delta, finish_reason }] }) + '\n\n'
const call = (index = 0, id = 'a', name = 'get_current_time', args = '{}') => ({
  index,
  id,
  type: 'function',
  function: { name, arguments: args }
})
const wire = (body: string) =>
  new Response(
    new ReadableStream({
      start(c) {
        for (const b of new TextEncoder().encode(body)) c.enqueue(new Uint8Array([b]))
        c.close()
      }
    }),
    { headers: { 'content-type': 'text/event-stream' } }
  )
describe('007 complete tool response oracle', () => {
  it.each([
    [call(1)],
    [call(0), call(1, 'a')],
    [call(0, '', 'get_current_time')],
    [call(0, 'a', 'shell')],
    [call(0, 'a', 'get_current_time', '{"timezone":"other"}')],
    [call(0, 'a', 'search_conversation_history', '{"query":"x","limit":1,"assistantId":"theft"}')],
    [call(0, 'a', 'get_current_time', '{')],
    [call(4)],
    [call(0, 'a', 'get_current_time', ' '.repeat(32769))]
  ])('rejects invalid complete call set without executing %#', (...calls) => {
    expect(() => {
      const a = new ToolAccumulator()
      a.consume({ tool_calls: calls }, true)
      a.finish('tool_calls')
    }).toThrow()
  })
  it('accepts byte-fragmented SSE with usage tail and explicit clear true only for tool mode', async () => {
    const body =
      packet({
        reasoning_content: '思考😀',
        tool_calls: [call(0, 'a', 'search_conversation_history', '{"query":"😀",')]
      }) +
      packet({ tool_calls: [{ index: 0, function: { arguments: '"limit":1}' } }] }, 'tool_calls') +
      'data: ' +
      JSON.stringify({
        choices: [],
        usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 }
      }) +
      '\n\ndata: [DONE]\n\n'
    let sent: Record<string, unknown> = {}
    const result = await chatCompletions(
      {
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        model: 'GLM-5.3-FLASH',
        apiKey: 'synthetic',
        messages: [{ role: 'user', content: '合成' }],
        stream: true,
        tools: 'clock-and-history'
      },
      {
        fetch: async (_url, init) => {
          sent = JSON.parse(init!.body as string)
          return wire(body)
        }
      }
    )
    expect(result.status).toBe('completed')
    expect(result.toolCalls?.[0]!.function.arguments).toBe('{"query":"😀","limit":1}')
    expect(result.reasoning).toBe('思考😀')
    expect(sent.thinking).toEqual({ type: 'enabled', clear_thinking: true })
    expect(sent.tool_stream).toBe(true)
    expect(result.usage?.totalTokens).toBe(5)
  })
  it('never exposes actionable calls on missing DONE, bad finish or conflicting fragments', async () => {
    for (const suffix of [
      '',
      packet({}, 'stop') + 'data: [DONE]\n\n',
      packet({ tool_calls: [{ index: 0, id: 'conflict' }] }, 'tool_calls') + 'data: [DONE]\n\n'
    ]) {
      const result = await chatCompletions(
        {
          baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
          model: 'glm-5.3-flash',
          apiKey: 'synthetic',
          messages: [{ role: 'user', content: '合成' }],
          stream: true,
          tools: 'clock'
        },
        { fetch: async () => wire(packet({ tool_calls: [call()] }) + suffix) }
      )
      expect(result.status).toBe('failed')
      expect(result.toolCalls).toBeUndefined()
    }
  })

  it('aggregates interleaved calls and exact reasoning only after finish', () => {
    const accumulator = new ToolAccumulator()
    accumulator.consume(
      {
        reasoning_content: '思考A',
        tool_calls: [
          {
            index: 0,
            id: 'a',
            type: 'function',
            function: { name: 'get_current_time', arguments: '{' }
          }
        ]
      },
      true
    )
    accumulator.consume(
      {
        reasoning_content: '思考B',
        tool_calls: [
          {
            index: 1,
            id: 'b',
            type: 'function',
            function: { name: 'search_conversation_history', arguments: '{"query":"😀","limit":1}' }
          }
        ]
      },
      true
    )
    accumulator.consume({ tool_calls: [{ index: 0, function: { arguments: '}' } }] }, true)
    expect(accumulator.finish('tool_calls').toolCalls).toHaveLength(2)
    expect(accumulator.finish('tool_calls').reasoning).toBe('思考A思考B')
  })
  it.each(['stop', 'length', undefined])('never accepts calls at wrong finish %s', (reason) => {
    const a = new ToolAccumulator()
    a.consume(
      {
        tool_calls: [
          {
            index: 0,
            id: 'a',
            type: 'function',
            function: { name: 'get_current_time', arguments: '{}' }
          }
        ]
      },
      true
    )
    expect(() => a.finish(reason)).toThrow()
  })
  it('rejects conflicting identities and truncated JSON before execution', () => {
    const a = new ToolAccumulator()
    a.consume(
      {
        tool_calls: [
          {
            index: 0,
            id: 'a',
            type: 'function',
            function: { name: 'get_current_time', arguments: '{' }
          }
        ]
      },
      true
    )
    expect(() => a.consume({ tool_calls: [{ index: 0, id: 'b' }] }, true)).toThrow()
    expect(() => a.finish('tool_calls')).toThrow()
  })
})
