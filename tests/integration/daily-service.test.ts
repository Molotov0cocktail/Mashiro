import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { dailyFixture } from './daily-fixture.js'
import { dailyDetailResultSchema } from '../../src/shared/daily-contract.js'

it('runs a real configured daily occurrence automatically and records separated usage without formal reminders', async () => {
  const f = dailyFixture()
  f.remember()
  expect(f.configure().ok).toBe(true)
  f.advance(60000)
  await vi.waitFor(() => expect(f.query().jobs[0]?.state).toBe('COMPLETED'))
  expect(f.send).toHaveBeenCalledTimes(1)
  const report = f.query('reports').reports[0]!
  expect(
    dailyDetailResultSchema.parse(
      f.service.inspect({
        ...f.base,
        id: report.id,
        expectedVersion: report.version,
        governanceVersion: report.governanceVersion
      })
    )
  ).toMatchObject({ ok: true, data: { providedSources: [{ source: { type: 'memory' } }] } })
  expect(f.operations.usage({ protocolVersion: 1 })).toMatchObject({
    ok: true,
    data: { summary: { calls: 1, known: { totalTokens: 15 }, complete: true } }
  })
  expect(f.store.database.prepare('SELECT count(*) AS n FROM reminders').get()!.n).toBe(0)
})
it('empty configuration or insufficient independent events causes zero model calls', async () => {
  const f = dailyFixture()
  expect(f.run().ok).toBe(false)
  f.remember('一次事件', true)
  expect(f.configure('observation').ok).toBe(true)
  f.run('observation')
  await vi.waitFor(() => expect(f.query().jobs[0]?.state).toBe('COMPLETED'))
  expect(f.send).not.toHaveBeenCalled()
  expect(f.query('reports').reports[0]?.modelSkippedReason).toContain('不足两个')
})
it('accepts a sourced pending observation as a real user-reviewed memory and replays its same receipt', async () => {
  const f = dailyFixture()
  f.remember('一次合成事件', true)
  f.remember('另一次合成事件', true)
  f.configure('observation')
  f.run('observation')
  await vi.waitFor(() => expect(f.query().jobs[0]?.state).toBe('COMPLETED'))
  const report = f.query('reports').reports[0]!,
    detail = f.service.inspect({
      ...f.base,
      id: report.id,
      expectedVersion: report.version,
      governanceVersion: report.governanceVersion
    })
  if (!detail.ok) throw Error('detail')
  const observation = detail.data.observations[0]!
  const args = {
    ...f.base,
    reportId: report.id,
    expectedReportVersion: report.version,
    governanceVersion: report.governanceVersion,
    observationId: observation.id,
    expectedVersion: observation.version,
    commandId: randomUUID(),
    action: 'accept' as const
  }
  const result = f.service.decide(args)
  expect(result).toMatchObject({
    ok: true,
    data: { state: 'SUCCEEDED', memory: { state: 'SUCCEEDED' } }
  })
  expect(f.service.decide(args)).toEqual(result)
  if (!result.ok || !result.data.memory) throw Error('receipt')
  expect(f.memory.inspect({ ...f.base, id: result.data.memory.objectId })).toMatchObject({
    ok: true,
    data: { changes: [{ actor: 'user' }] }
  })
})
it('blocks a late result after source correction and retains unknown usage as unknown', async () => {
  let finish!: (value: { status: 'completed'; text: string; usage: null }) => void
  const f = dailyFixture({
      send: () =>
        new Promise((resolve) => {
          finish = resolve
        })
    }),
    source = f.remember()
  f.configure()
  f.run()
  await vi.waitFor(() => expect(f.send).toHaveBeenCalledTimes(1))
  expect(
    f.memory.mutate({
      ...f.base,
      commandId: randomUUID(),
      mutation: {
        action: 'correct',
        targetId: source.objectId,
        expectedVersion: 1,
        kind: 'user',
        scope: 'global',
        title: '纠正',
        markdown: '用户新纠正',
        nature: 'user-statement',
        event: null
      }
    }).ok
  ).toBe(true)
  finish({
    status: 'completed',
    usage: null,
    text: JSON.stringify({ sections: [], observations: [], proposals: [] })
  })
  await vi.waitFor(() => expect(f.query().jobs[0]?.state).toBe('STALE'))
  expect(f.query('reports').reports).toHaveLength(0)
  expect(f.operations.usage({ protocolVersion: 1 })).toMatchObject({
    ok: true,
    data: { summary: { calls: 1, unknownRequests: 1, complete: false } }
  })
})
