import { expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { ToolRepository } from '../../src/main/provider/tool-repository.js'
import { providerProfile } from '../../src/main/provider/provider-profile.js'
import type { ProtocolMessage } from '../../src/main/provider/tool-protocol.js'

const profile = providerProfile('https://api.deepseek.com/v1', 'deepseek-v4-flash')!
function fixture(messages: ProtocolMessage[]) {
  const ledger = new ToolRepository(),
    assistantId = randomUUID(),
    requestId = randomUUID(),
    id = randomUUID()
  ledger.create({
    id,
    assistantId,
    requestId,
    endpointFingerprint: 'synthetic',
    model: 'deepseek-v4-flash',
    adapterVersion: profile.adapterVersion,
    mode: profile.mode,
    messages,
    createdAt: '2026-09-07T00:00:00.000Z'
  })
  ledger.messages(id, messages, true)
  return {
    ledger,
    expand: () =>
      ledger.expandContext(
        assistantId,
        [
          { role: 'user', content: 'selected' },
          { role: 'assistant', content: 'answer' }
        ],
        [requestId],
        'synthetic',
        'deepseek-v4-flash',
        profile
      )
  }
}

it('replays only the selected current turn, never the earlier context stored inside its segment', () => {
  const f = fixture([
    { role: 'user', content: 'not selected' },
    {
      role: 'assistant',
      content: 'private earlier answer',
      reasoning_content: 'private earlier reasoning'
    },
    { role: 'user', content: 'selected' },
    { role: 'assistant', content: 'answer', reasoning_content: 'selected reasoning' }
  ])
  expect(f.expand()).toEqual([
    { role: 'user', content: 'selected' },
    { role: 'assistant', content: 'answer', reasoning_content: 'selected reasoning' }
  ])
})

it.each(['missing-result', 'wrong-result-id', 'missing-final-reasoning'] as const)(
  'blocks corrupted retained adjacency: %s',
  (defect) => {
    const messages: ProtocolMessage[] = [
      { role: 'user', content: 'selected' },
      {
        role: 'assistant',
        content: '',
        reasoning_content: 'call reasoning',
        tool_calls: [
          { id: 'call', type: 'function', function: { name: 'get_current_time', arguments: '{}' } }
        ]
      }
    ]
    if (defect !== 'missing-result')
      messages.push({
        role: 'tool',
        tool_call_id: defect === 'wrong-result-id' ? 'unrelated' : 'call',
        content: '{}'
      })
    messages.push({
      role: 'assistant',
      content: 'answer',
      ...(defect === 'missing-final-reasoning' ? {} : { reasoning_content: 'final reasoning' })
    })
    expect(() => fixture(messages).expand()).toThrow('PROTOCOL')
  }
)
