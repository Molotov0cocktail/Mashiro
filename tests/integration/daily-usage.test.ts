import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
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
it('keeps normal sending current without classifying it as a failure', () => {
  const f = dailyFixture()
  const owner = { domain: 'provider' as const, id: 'normal-chain', assistantId: f.assistantId }
  const id = f.operations.begin({
    chainId: 'normal-chain',
    actor: 'assistant',
    assistantId: f.assistantId,
    connectionId: null,
    recipientFingerprint: null,
    model: 'synthetic',
    feature: 'conversation',
    inputCharacters: 12,
    persistent: true,
    owner
  })

  const current = f.operations.query({ protocolVersion: 1, view: 'current' })
  if (!current.ok) throw Error(current.error.code)
  expect(current.data.rows).toEqual([
    expect.objectContaining({ state: 'SENDING', severity: 'INFO', current: true })
  ])
  expect(f.operations.query({ protocolVersion: 1, view: 'failures' })).toMatchObject({
    ok: true,
    data: { rows: [] }
  })

  f.operations.settle(id, { promptTokens: 2, completionTokens: 1, totalTokens: 3 })
  const history = f.operations.query({ protocolVersion: 1, view: 'history' })
  if (!history.ok) throw Error(history.error.code)
  expect(history.data.rows.find((row) => row.state === 'SENDING')).toMatchObject({
    severity: 'INFO',
    current: false,
    recoveredAt: '2030-01-01T12:00:00.000Z'
  })
  expect(f.operations.query({ protocolVersion: 1, view: 'failures' })).toMatchObject({
    ok: true,
    data: { rows: [] }
  })
  expect(f.operations.usage({ protocolVersion: 1 })).toMatchObject({
    ok: true,
    data: { summary: { calls: 1, known: { totalTokens: 3 }, unknownRequests: 0 } }
  })
})

it('keeps real warnings in failures after they recover', () => {
  const f = dailyFixture()
  const owner = { domain: 'daily' as const, id: 'budget-job', assistantId: f.assistantId }
  f.operations.event(owner, 'daily-brief', 'BUDGET_PAUSED', '预算已用尽', 'WARN', true)

  expect(f.operations.query({ protocolVersion: 1, view: 'failures' })).toMatchObject({
    ok: true,
    data: {
      rows: [
        expect.objectContaining({
          state: 'BUDGET_PAUSED',
          severity: 'WARN',
          current: true,
          recoveredAt: null
        })
      ]
    }
  })

  f.operations.event(owner, 'daily-brief', 'COMPLETED', '后续运行已完成', 'INFO', false)
  const failures = f.operations.query({ protocolVersion: 1, view: 'failures' })
  if (!failures.ok) throw Error(failures.error.code)
  expect(failures.data.rows).toEqual([
    expect.objectContaining({
      state: 'BUDGET_PAUSED',
      severity: 'WARN',
      current: false,
      recoveredAt: '2030-01-01T12:00:00.000Z'
    })
  ])
})

it('keeps legacy sending events in history but excludes them from failures', () => {
  const f = dailyFixture()
  const legacy = {
    id: randomUUID(),
    owner: { domain: 'provider' as const, id: 'legacy-chain', assistantId: f.assistantId },
    feature: 'conversation' as const,
    state: 'SENDING',
    severity: 'WARN' as const,
    summary: '正在调用已授权的实际模型',
    firstAt: '2029-12-31T23:59:00.000Z',
    lastAt: '2029-12-31T23:59:00.000Z',
    count: 1,
    current: false,
    recoveredAt: '2030-01-01T00:00:00.000Z'
  }
  f.store.database
    .prepare('INSERT INTO operation_events VALUES(?,?)')
    .run(legacy.id, JSON.stringify(legacy))

  expect(f.operations.query({ protocolVersion: 1, view: 'history' })).toMatchObject({
    ok: true,
    data: { rows: [expect.objectContaining({ ...legacy, severity: 'INFO' })] }
  })
  expect(f.operations.query({ protocolVersion: 1, view: 'failures' })).toMatchObject({
    ok: true,
    data: { rows: [] }
  })
  expect(
    JSON.parse(
      String(
        f.store.database
          .prepare('SELECT record_json FROM operation_events WHERE id=?')
          .get(legacy.id)!.record_json
      )
    )
  ).toEqual(legacy)
})
it('keeps normal daily queued and running states out of failures', async () => {
  let finish!: (value: {
    status: 'completed'
    usage: { promptTokens: number; completionTokens: number; totalTokens: number }
    text: string
  }) => void
  const f = dailyFixture({
    send: () =>
      new Promise((resolve) => {
        finish = resolve
      })
  })
  f.remember()
  expect(f.configure().ok).toBe(true)
  expect(f.run().ok).toBe(true)

  const queued = f.operations.query({ protocolVersion: 1, view: 'history' })
  if (!queued.ok) throw Error(queued.error.code)
  expect(queued.data.rows.find((row) => row.state === 'QUEUED')).toMatchObject({
    severity: 'INFO',
    current: true
  })

  await vi.waitFor(() => expect(f.query().jobs[0]?.state).toBe('RUNNING'))
  const running = f.operations.query({ protocolVersion: 1, view: 'current' })
  if (!running.ok) throw Error(running.error.code)
  expect(running.data.rows.find((row) => row.state === 'RUNNING')).toMatchObject({
    severity: 'INFO',
    current: true
  })
  expect(f.operations.query({ protocolVersion: 1, view: 'failures' })).toMatchObject({
    ok: true,
    data: { rows: [] }
  })

  finish({
    status: 'completed',
    usage: { promptTokens: 2, completionTokens: 1, totalTokens: 3 },
    text: JSON.stringify({
      sections: [
        {
          title: '合成结果',
          markdown: '根据已提供的资料作合成回顾。',
          nature: 'inference',
          sourceHandles: ['source0']
        }
      ],
      observations: [],
      proposals: []
    })
  })
  await vi.waitFor(() => expect(f.query().jobs[0]?.state).toBe('COMPLETED'))
  expect(f.operations.query({ protocolVersion: 1, view: 'failures' })).toMatchObject({
    ok: true,
    data: { rows: [] }
  })
})

it('normalizes legacy normal daily states without rewriting their stored rows', () => {
  const f = dailyFixture()
  const legacy = (['QUEUED', 'RUNNING'] as const).map((state) => ({
    id: randomUUID(),
    owner: { domain: 'daily' as const, id: 'legacy-' + state, assistantId: f.assistantId },
    feature: 'daily-brief' as const,
    state,
    severity: 'WARN' as const,
    summary: '旧版正常运行状态',
    firstAt: '2029-12-31T23:59:00.000Z',
    lastAt: '2029-12-31T23:59:00.000Z',
    count: 1,
    current: false,
    recoveredAt: '2030-01-01T00:00:00.000Z'
  }))
  for (const row of legacy)
    f.store.database
      .prepare('INSERT INTO operation_events VALUES(?,?)')
      .run(row.id, JSON.stringify(row))

  const history = f.operations.query({ protocolVersion: 1, view: 'history' })
  if (!history.ok) throw Error(history.error.code)
  for (const row of legacy)
    expect(history.data.rows.find((record) => record.id === row.id)).toMatchObject({
      state: row.state,
      severity: 'INFO',
      current: false
    })
  expect(f.operations.query({ protocolVersion: 1, view: 'failures' })).toMatchObject({
    ok: true,
    data: { rows: [] }
  })
  for (const row of legacy)
    expect(
      JSON.parse(
        String(
          f.store.database
            .prepare('SELECT record_json FROM operation_events WHERE id=?')
            .get(row.id)!.record_json
        )
      )
    ).toEqual(row)
})
