import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { dailyFixture } from './daily-fixture.js'
import type { ItemContent } from '../../src/shared/item-contract.js'

const candidate: ItemContent = {
  kind: 'task',
  title: '独立候选甲',
  description: '',
  status: 'open',
  dueAt: null,
  timeZone: null,
  parentId: null,
  relatedIds: [],
  counterpart: ''
}
it('revoking a source after the first committed proposal prevents the remaining slot and never retries the paid request', async () => {
  const f = dailyFixture({
    send: async () => ({
      status: 'completed',
      usage: null,
      text: JSON.stringify({
        sections: [],
        observations: [],
        proposals: [
          { candidate, sourceHandles: ['source0'] },
          { candidate: { ...candidate, title: '独立候选乙' }, sourceHandles: ['source0'] }
        ]
      })
    }),
    fault: (phase) => {
      if (phase === 'proposal-committed') throw Error('INDEPENDENT_PARTIAL')
    }
  })
  const memory = f.remember('独立来源原文')
  expect(f.configure('weekly-plan', { allowProposals: true }).ok).toBe(true)
  f.run('weekly-plan')
  await vi.waitFor(() => expect(f.query().jobs[0]?.state).toBe('PARTIAL'))
  expect(f.store.database.prepare('SELECT count(*) AS n FROM item_proposals').get()!.n).toBe(1)
  expect(
    f.memory.mutate({
      ...f.base,
      commandId: randomUUID(),
      mutation: {
        action: 'correct',
        targetId: memory.objectId,
        expectedVersion: memory.objectVersion,
        kind: 'user',
        scope: 'global',
        title: '已纠正',
        markdown: '原依据已不成立',
        nature: 'user-statement',
        event: null
      }
    }).ok
  ).toBe(true)
  const job = f.query().jobs[0]!,
    reopened = f.reopen()
  reopened.control({
    ...f.base,
    id: job.id,
    expectedVersion: job.version,
    commandId: randomUUID(),
    action: 'retry'
  })
  await vi.waitFor(() => {
    const result = reopened.query({ ...f.base, view: 'jobs' })
    expect(result).toMatchObject({ ok: true, data: { jobs: [{ state: 'STALE' }] } })
  })
  expect(f.send).toHaveBeenCalledTimes(1)
  expect(f.store.database.prepare('SELECT count(*) AS n FROM item_proposals').get()!.n).toBe(1)
  expect(f.store.database.prepare('SELECT count(*) AS n FROM items').get()!.n).toBe(0)
  expect(f.store.database.prepare('SELECT count(*) AS n FROM reminders').get()!.n).toBe(0)
})

it('changing the recipient during an in-flight observation cannot save a late report or memory', async () => {
  let complete!: (value: { status: 'completed'; usage: null; text: string }) => void
  const f = dailyFixture({
    send: () =>
      new Promise((resolve) => {
        complete = resolve
      })
  })
  f.remember('独立事件甲', true)
  f.remember('独立事件乙', true)
  f.configure('observation')
  const before = f.store.database.prepare('SELECT count(*) AS n FROM memory_objects').get()!.n
  f.run('observation')
  await vi.waitFor(() => expect(f.send).toHaveBeenCalledTimes(1))
  f.changeRecipient()
  complete({
    status: 'completed',
    usage: null,
    text: JSON.stringify({
      sections: [],
      proposals: [],
      observations: [
        {
          title: '迟到推测',
          markdown: '不应生效',
          nature: 'inference',
          sourceHandles: ['source0', 'source1']
        }
      ]
    })
  })
  await vi.waitFor(() => expect(f.query().jobs[0]?.state).toBe('STALE'))
  expect(f.store.database.prepare('SELECT count(*) AS n FROM memory_objects').get()!.n).toBe(before)
  expect(f.store.database.prepare('SELECT count(*) AS n FROM daily_reports').get()!.n).toBe(0)
})
