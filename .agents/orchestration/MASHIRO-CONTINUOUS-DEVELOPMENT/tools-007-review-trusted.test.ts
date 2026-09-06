import { expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { executeToolChat } from '../../../src/main/provider/tool-execution'
import { ToolRepository } from '../../../src/main/provider/tool-repository'
import { chatCompletions } from '../../../src/main/provider/chat-completions-transport'
const call = { id: 'clock', type: 'function' as const, function: { name: 'get_current_time' as const, arguments: '{}' } }
function fixture() {
 const ledger = new ToolRepository()
 const assistantId = randomUUID(), requestId = randomUUID()
 const messages = [{ role: 'user' as const, content: 'synthetic' }]
 const clock = vi.fn(() => new Date('2026-09-06T00:00:00.000Z'))
 return { ledger, assistantId, requestId, clock, options: { ledger, clock, scope: 'clock' as const, assertCurrent: () => {}, history: () => ({ matches: [], truncated: false }), emit: () => {}, request: { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', apiKey: 'synthetic', model: 'GLM-5.3-FLASH', stream: false, messages }, segment: { id: randomUUID(), assistantId, requestId, endpointFingerprint: 'synthetic', model: 'GLM-5.3-FLASH', adapterVersion: 'glm-5.3-flash-tools-v1', createdAt: '2026-09-06T00:00:00.000Z', messages } } }
}
it('review: all complete calls must be in requested scope before first allowed clock executes', async () => {
 const f = fixture()
 await expect(executeToolChat({ ...f.options, transport: async () => ({ status: 'completed', text: '', usage: null, finishReason: 'tool_calls', toolCalls: [call, { id: 'history', type: 'function', function: { name: 'search_conversation_history', arguments: '{"query":"synthetic","limit":1}' } }] }) })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
 expect(f.clock).not.toHaveBeenCalled()
 expect(f.ledger.read(f.assistantId)).toHaveLength(0)
})
it('review: missing usage in continuation keeps whole chain unknown and actual read remains succeeded', async () => {
 const f = fixture()
 const transport = vi.fn().mockResolvedValueOnce({ status: 'completed', text: '', usage: { promptTokens: 5, completionTokens: 2, totalTokens: 7 }, finishReason: 'tool_calls', toolCalls: [call] }).mockResolvedValueOnce({ status: 'completed', text: 'done', usage: null, finishReason: 'stop' })
 const result = await executeToolChat({ ...f.options, transport })
 expect(result.usage).toBeNull()
 expect(f.clock).toHaveBeenCalledTimes(1)
 expect(f.ledger.read(f.assistantId)[0]?.state).toBe('SUCCEEDED')
})
it('review: malformed SSE choice after a complete-looking call exposes no tool intent', async () => {
 const f = fixture()
 const packet = (value: unknown) => 'data: ' + JSON.stringify(value) + '\n\n'
 const body = packet({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, ...call }] }, finish_reason: null }] }) + packet({ choices: [{ index: 1, delta: {}, finish_reason: 'tool_calls' }] }) + 'data: [DONE]\n\n'
 const result = await chatCompletions({ ...f.options.request, stream: true, tools: 'clock' }, { fetch: async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } }) })
 expect(result.status).toBe('failed')
 expect(result.toolCalls).toBeUndefined()
})