import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { ToolRepository } from '../../src/main/provider/tool-repository.js'
import { providerProfile } from '../../src/main/provider/provider-profile.js'

const profile = providerProfile('https://api.deepseek.com/v1', 'deepseek-v4-flash')!

it.each(['recipient', 'model', 'adapter'] as const)(
  'does not export hidden retained fields across a changed %s',
  (change) => {
    const ledger = new ToolRepository()
    const assistantId = randomUUID()
    const requestId = randomUUID()
    const id = randomUUID()
    const messages = [
      { role: 'user' as const, content: 'synthetic question' },
      {
        role: 'assistant' as const,
        content: 'synthetic answer',
        reasoning_content: 'hidden canary'
      }
    ]
    ledger.create({
      id,
      assistantId,
      requestId,
      endpointFingerprint: 'original-recipient',
      model: 'deepseek-v4-flash',
      adapterVersion: profile.adapterVersion,
      mode: profile.mode,
      messages,
      createdAt: new Date().toISOString()
    })
    ledger.messages(id, messages, true)
    const previous = messages.map(({ role, content }) => ({ role, content }))
    expect(() =>
      ledger.expandContext(
        assistantId,
        previous,
        [requestId],
        change === 'recipient' ? 'new-recipient' : 'original-recipient',
        change === 'model' ? 'deepseek-v4-pro' : 'deepseek-v4-flash',
        change === 'adapter' ? { ...profile, adapterVersion: 'future-unreviewed' } : profile
      )
    ).toThrow('CONFIGURATION')
    expect(
      ledger.expandContext(
        assistantId,
        previous,
        [requestId],
        'original-recipient',
        'deepseek-v4-flash',
        profile
      )
    ).toEqual(messages)
  }
)

it('counts hidden tool result payload even when the visible selected round is short', () => {
  const ledger = new ToolRepository()
  const assistantId = randomUUID()
  const requestId = randomUUID()
  const id = randomUUID()
  const messages = [
    { role: 'user' as const, content: 'q' },
    {
      role: 'assistant' as const,
      content: '',
      reasoning_content: '',
      tool_calls: [
        {
          id: 'call',
          type: 'function' as const,
          function: { name: 'get_current_time' as const, arguments: '{}' }
        }
      ]
    },
    { role: 'tool' as const, content: 'x'.repeat(120000), tool_call_id: 'call' },
    { role: 'assistant' as const, content: 'a', reasoning_content: '' }
  ]
  ledger.create({
    id,
    assistantId,
    requestId,
    endpointFingerprint: 'recipient',
    model: 'deepseek-v4-flash',
    adapterVersion: profile.adapterVersion,
    mode: profile.mode,
    messages,
    createdAt: new Date().toISOString()
  })
  ledger.messages(id, messages, true)
  expect(() =>
    ledger.expandContext(
      assistantId,
      [
        { role: 'user', content: 'q' },
        { role: 'assistant', content: 'a' }
      ],
      [requestId],
      'recipient',
      'deepseek-v4-flash',
      profile
    )
  ).toThrow('LIMIT')
})
