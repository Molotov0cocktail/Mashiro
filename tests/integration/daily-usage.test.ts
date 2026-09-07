import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { dailyFixture } from './daily-fixture.js'
it('never persists strict temporary usage identity or operation events', () => {
  const f = dailyFixture(),
    chainId = randomUUID()
  const id = f.operations.begin({
    chainId,
    actor: 'assistant',
    assistantId: f.assistantId,
    connectionId: randomUUID(),
    recipientFingerprint: 'b'.repeat(64),
    model: 'synthetic',
    feature: 'conversation',
    inputCharacters: 40,
    persistent: false,
    owner: { domain: 'provider', id: chainId, assistantId: f.assistantId }
  })
  f.operations.settle(id, { promptTokens: 5, completionTokens: 3, totalTokens: 8 })
  expect(f.operations.usage({ protocolVersion: 1 })).toMatchObject({
    ok: true,
    data: { summary: { calls: 1, known: { totalTokens: 8 } } }
  })
  expect(f.store.database.prepare('SELECT count(*) AS n FROM usage_attempts').get()!.n).toBe(0)
  expect(f.store.database.prepare('SELECT count(*) AS n FROM operation_events').get()!.n).toBe(0)
})
it('keeps mixed known/unknown chain totals incomplete and independently paginates groups', () => {
  const f = dailyFixture()
  for (let index = 0; index < 52; index++) {
    const id = f.operations.begin({
      chainId: 'same-chain',
      actor: 'assistant',
      assistantId: f.assistantId,
      connectionId: null,
      recipientFingerprint: null,
      model: 'model-' + index,
      feature: 'tool-chain',
      inputCharacters: 10,
      persistent: true,
      owner: { domain: 'provider', id: 'same-chain', assistantId: f.assistantId }
    })
    f.operations.settle(
      id,
      index === 51 ? null : { promptTokens: 2, completionTokens: 1, totalTokens: 3 }
    )
  }
  expect(f.operations.usage({ protocolVersion: 1, cursor: 0, groupsCursor: 50 })).toMatchObject({
    ok: true,
    data: {
      attempts: expect.any(Array),
      nextCursor: 50,
      groups: expect.any(Array),
      groupsNextCursor: null,
      summary: { calls: 52, known: { totalTokens: 153 }, unknownRequests: 1, complete: false }
    }
  })
  const result = f.operations.usage({ protocolVersion: 1, cursor: 50, groupsCursor: 0 })
  if (!result.ok) throw Error('usage')
  expect(result.data.attempts).toHaveLength(2)
  expect(result.data.groups).toHaveLength(50)
})
