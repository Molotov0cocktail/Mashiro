import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { dailyFixture } from './daily-fixture.js'
import type { ItemContent } from '../../src/shared/item-contract.js'
const candidate: ItemContent = {
  kind: 'task',
  title: '合成删除目标',
  description: '不能留在变更历史的旧正文',
  status: 'open',
  dueAt: null,
  timeZone: null,
  parentId: null,
  relatedIds: [],
  counterpart: ''
}

it('reports deletion once with a body-free checkpoint and purges obsolete item change content', async () => {
  const f = dailyFixture()
  const made = f.items.mutate({
    ...f.base,
    commandId: randomUUID(),
    mutation: { action: 'create', content: candidate }
  })
  if (!made.ok) throw Error('create')
  const preview = f.items.preview({
    ...f.base,
    commandId: randomUUID(),
    action: 'delete',
    targets: [{ id: made.data.objectId, expectedVersion: 1 }]
  })
  if (!preview.ok) throw Error('preview')
  expect(
    f.items.confirm({ ...f.base, confirmationId: preview.data.confirmationId, accept: true }).ok
  ).toBe(true)
  expect(
    JSON.stringify(f.store.database.prepare('SELECT * FROM daily_item_changes').all())
  ).not.toContain(candidate.description)
  f.configure('deadline-change')
  f.run('deadline-change')
  await vi.waitFor(() => expect(f.query().jobs[0]?.state).toBe('COMPLETED'))
  const report = f.query('reports').reports[0]!
  expect(
    f.service.inspect({
      ...f.base,
      id: report.id,
      expectedVersion: report.version,
      governanceVersion: report.governanceVersion
    })
  ).toMatchObject({
    ok: true,
    data: {
      checkpoints: [
        { fields: ['deleted'], fromVersion: 1, toVersion: 2, before: null, consumed: true }
      ]
    }
  })
  expect(f.send).not.toHaveBeenCalled()
})

it('does not send accepted global bodies when global daily scope is off even if recipient grant exists', async () => {
  const f = dailyFixture()
  f.remember('合成禁止发送正文')
  f.configure()
  f.configure('daily-brief', { dataScope: { ...f.settings.dataScope, globalMemories: false } })
  f.run()
  await vi.waitFor(() => expect(f.query().jobs[0]?.state).toBe('COMPLETED'))
  expect(f.send).not.toHaveBeenCalled()
})

it('invalidates report and scrubs stored copies when generated proposal access is revoked', async () => {
  const f = dailyFixture({
    send: async () => ({
      status: 'completed',
      usage: null,
      text: JSON.stringify({
        sections: [],
        observations: [],
        proposals: [{ candidate, sourceHandles: ['source0'] }]
      })
    })
  })
  f.remember()
  f.configure('weekly-plan', { allowProposals: true })
  f.run('weekly-plan')
  await vi.waitFor(() => expect(f.query().jobs[0]?.state).toBe('COMPLETED'))
  const report = f.query('reports').reports[0]!
  f.store.database
    .prepare('UPDATE item_permissions SET read_allowed=0,version=version+1 WHERE assistant_id=?')
    .run(f.assistantId)
  expect(
    f.service.inspect({
      ...f.base,
      id: report.id,
      expectedVersion: report.version,
      governanceVersion: report.governanceVersion
    })
  ).toMatchObject({ ok: false, error: { code: 'STALE_WRITE' } })
  expect(
    f.store.database.prepare('SELECT content_json FROM daily_reports WHERE id=?').get(report.id)!
      .content_json
  ).toBe('{}')
})

it('keeps a rejected observation suppressed across another run with the same independent roots', async () => {
  const f = dailyFixture()
  f.remember('事件甲', true)
  f.remember('事件乙', true)
  f.configure('observation')
  f.run('observation')
  await vi.waitFor(() => expect(f.query().jobs[0]?.state).toBe('COMPLETED'))
  const report = f.query('reports').reports[0]!
  const detail = f.service.inspect({
    ...f.base,
    id: report.id,
    expectedVersion: report.version,
    governanceVersion: report.governanceVersion
  })
  if (!detail.ok) throw Error('detail')
  expect(
    detail.data.observations.find((row) => row.nature === 'faithful-summary')?.markdown
  ).toContain('用户报告已发生 2')
  const observation = detail.data.observations[0]!
  expect(
    f.service.decide({
      ...f.base,
      reportId: report.id,
      expectedReportVersion: report.version,
      governanceVersion: report.governanceVersion,
      observationId: observation.id,
      expectedVersion: observation.version,
      commandId: randomUUID(),
      action: 'reject'
    }).ok
  ).toBe(true)
  f.run('observation')
  await vi.waitFor(() =>
    expect(f.query().jobs.every((row) => row.state === 'COMPLETED')).toBe(true)
  )
  const next = f.query('reports').reports[0]!
  expect(
    f.service.inspect({
      ...f.base,
      id: next.id,
      expectedVersion: next.version,
      governanceVersion: next.governanceVersion
    })
  ).toMatchObject({ ok: true, data: { observations: [] } })
})
