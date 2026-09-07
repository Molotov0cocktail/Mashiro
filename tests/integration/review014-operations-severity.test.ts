import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { OperationsService } from '../../src/main/background/operations-service.js'

it('review014: active and legacy normal sends remain observable without becoming failures or rewriting history', () => {
  const store = new SqliteStore(':memory:')
  const service = new OperationsService(store)
  try {
    const owner = { domain: 'provider' as const, id: randomUUID(), assistantId: null }
    const query = (view: 'current' | 'history' | 'failures') => {
      const result = service.query({ protocolVersion: 1, view })
      if (!result.ok) throw Error(result.error.code)
      return result.data.rows
    }
    const attempt = service.begin({
      chainId: owner.id,
      actor: 'system',
      assistantId: null,
      connectionId: null,
      recipientFingerprint: null,
      model: null,
      feature: 'conversation',
      inputCharacters: 12,
      persistent: true,
      owner
    })
    expect(query('current')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ state: 'SENDING', severity: 'INFO', current: true })
      ])
    )
    expect(query('failures')).toEqual([])
    service.settle(attempt, { promptTokens: 2, completionTokens: 1, totalTokens: 3 })
    expect(query('failures')).toEqual([])
    const prior = query('history').find((row) => row.state === 'SENDING')!
    expect(prior).toMatchObject({ severity: 'INFO', current: false })
    const legacy = { ...prior, id: randomUUID(), severity: 'WARN' }
    store.database
      .prepare('INSERT INTO operation_events VALUES(?,?)')
      .run(legacy.id, JSON.stringify(legacy))
    const legacyDaily = (['QUEUED', 'RUNNING'] as const).map((state) => ({
      ...legacy,
      id: randomUUID(),
      state,
      current: true,
      owner: { domain: 'daily' as const, id: randomUUID(), assistantId: null }
    }))
    for (const row of legacyDaily)
      store.database
        .prepare('INSERT INTO operation_events VALUES(?,?)')
        .run(row.id, JSON.stringify(row))
    for (const row of legacyDaily) {
      expect(query('current').find((value) => value.id === row.id)).toMatchObject({
        state: row.state,
        severity: 'INFO',
        current: true
      })
      expect(query('history').find((value) => value.id === row.id)).toMatchObject({
        state: row.state,
        severity: 'INFO',
        current: true
      })
    }
    const before = store.database.prepare('SELECT * FROM operation_events ORDER BY id').all()
    const usage = store.database.prepare('SELECT * FROM usage_attempts ORDER BY id').all()
    expect(query('history').find((row) => row.id === legacy.id)).toMatchObject({
      state: 'SENDING',
      severity: 'INFO',
      current: false
    })
    expect(query('failures')).toEqual([])
    expect(store.database.prepare('SELECT * FROM operation_events ORDER BY id').all()).toEqual(
      before
    )
    expect(store.database.prepare('SELECT * FROM usage_attempts ORDER BY id').all()).toEqual(usage)
    const budgetOwner = { ...owner, id: randomUUID() }
    service.event(budgetOwner, 'chapter', 'BUDGET_PAUSED', '预算不足', 'WARN', true)
    expect(query('failures')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ state: 'BUDGET_PAUSED', severity: 'WARN', current: true })
      ])
    )
    service.event(budgetOwner, 'chapter', 'COMPLETED', '已完成', 'INFO', false)
    expect(query('failures')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          state: 'BUDGET_PAUSED',
          severity: 'WARN',
          current: false,
          recoveredAt: expect.any(String)
        })
      ])
    )
  } finally {
    service.close()
    store.close()
  }
})
