import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { dailyFixture } from './daily-fixture.js'
import type { ItemContent } from '../../src/shared/item-contract.js'
const candidate: ItemContent = {
  kind: 'task',
  title: '合成建议',
  description: '',
  status: 'open',
  dueAt: null,
  timeZone: null,
  parentId: null,
  relatedIds: [],
  counterpart: ''
}

it('recovers a committed proposal slot without another paid call or duplicate proposal and never creates a formal item', async () => {
  let fail = true
  const f = dailyFixture({
    send: async () => ({
      status: 'completed',
      usage: null,
      text: JSON.stringify({
        sections: [],
        observations: [],
        proposals: [{ candidate, sourceHandles: ['source0'] }]
      })
    }),
    fault: (phase) => {
      if (phase === 'proposal-committed' && fail) {
        fail = false
        throw Error('synthetic stop')
      }
    }
  })
  f.remember()
  expect(f.configure('weekly-plan', { allowProposals: true }).ok).toBe(true)
  f.run('weekly-plan')
  await vi.waitFor(() => expect(f.query().jobs[0]?.state).toBe('PARTIAL'))
  expect(f.store.database.prepare('SELECT count(*) AS n FROM item_proposals').get()!.n).toBe(1)
  const job = f.query().jobs[0]!,
    reopened = f.reopen()
  expect(
    reopened.control({
      ...f.base,
      id: job.id,
      expectedVersion: job.version,
      commandId: randomUUID(),
      action: 'retry'
    }).ok
  ).toBe(true)
  await vi.waitFor(() => {
    const result = reopened.query({ ...f.base, view: 'jobs' })
    expect(result).toMatchObject({ ok: true, data: { jobs: [{ state: 'COMPLETED' }] } })
  })
  expect(f.send).toHaveBeenCalledTimes(1)
  expect(f.store.database.prepare('SELECT count(*) AS n FROM item_proposals').get()!.n).toBe(1)
  expect(f.store.database.prepare('SELECT count(*) AS n FROM items').get()!.n).toBe(0)
})

it('consumes every accepted intermediate item change only after a successful report', async () => {
  const f = dailyFixture()
  const made = f.items.mutate({
    ...f.base,
    commandId: randomUUID(),
    mutation: { action: 'create', content: candidate }
  })
  if (!made.ok) throw Error('create')
  for (const [version, status] of [
    [1, 'active'],
    [2, 'completed']
  ] as const)
    expect(
      f.items.mutate({
        ...f.base,
        commandId: randomUUID(),
        mutation: { action: 'transition', id: made.data.objectId, expectedVersion: version, status }
      }).ok
    ).toBe(true)
  expect(f.configure('deadline-change').ok).toBe(true)
  f.run('deadline-change')
  await vi.waitFor(() => expect(f.query().jobs[0]?.state).toBe('COMPLETED'))
  const report = f.query('reports').reports[0]!
  const detail = f.service.inspect({
    ...f.base,
    id: report.id,
    expectedVersion: report.version,
    governanceVersion: report.governanceVersion
  })
  expect(detail).toMatchObject({
    ok: true,
    data: {
      checkpoints: [
        { toVersion: 1, consumed: true },
        { fromVersion: 1, toVersion: 2, consumed: true },
        { fromVersion: 2, toVersion: 3, consumed: true }
      ]
    }
  })
  expect(
    f.store.database.prepare('SELECT version FROM daily_item_checkpoints').get()!.version
  ).toBe(3)
  f.run('deadline-change')
  await vi.waitFor(() =>
    expect(f.query().jobs.every((job) => job.state === 'COMPLETED')).toBe(true)
  )
  expect(f.send).toHaveBeenCalledTimes(1)
})

it('resumes budget-paused work automatically in a new UTC window without forgiving unknown requests', async () => {
  const f = dailyFixture()
  f.remember()
  f.configure('daily-brief', {
    budget: { window: 'utc-day', calls: 1, inputCharacters: 500000, maxOutputTokens: 2048 }
  })
  f.run()
  await vi.waitFor(() => expect(f.query().jobs[0]?.state).toBe('COMPLETED'))
  f.run()
  await vi.waitFor(() =>
    expect(f.query().jobs.some((job) => job.state === 'BUDGET_PAUSED')).toBe(true)
  )
  expect(f.send).toHaveBeenCalledTimes(1)
  f.advance(86400000)
  await vi.waitFor(() => expect(f.send).toHaveBeenCalledTimes(2))
})

it('preserves explicit undecided recovery as pending with zero automatic calls', async () => {
  const f = dailyFixture()
  f.remember()
  f.configure('evening-review', { recovery: { mode: 'UNCONFIGURED' } })
  f.advance(3600000)
  await vi.waitFor(() => expect(f.query().jobs[0]?.state).toBe('RECOVERY_PENDING'))
  expect(f.send).not.toHaveBeenCalled()
})
