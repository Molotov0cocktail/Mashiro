import { expect, it, vi } from 'vitest'
import { dailyFixture } from './daily-fixture.js'
import { dailyEventFacts } from '../../src/main/background/daily-event-facts.js'
import { dailyInputsSchema } from '../../src/main/background/daily-sources.js'
import { validateDailyOutput } from '../../src/main/background/daily-model.js'

it('deduplicates event roots, separates planned from happened, and rejects model support manufactured from repeated summaries', () => {
  const f = dailyFixture()
  f.remember('一个原始事件', true)
  f.remember('第二个原始事件', true)
  f.configure('observation')
  const made = f.run('observation')
  if (!made.ok) throw Error('run')
  const inputs = dailyInputsSchema.parse(
    JSON.parse(
      String(
        f.store.database.prepare('SELECT inputs_json FROM daily_jobs WHERE id=?').get(made.data.id)!
          .inputs_json
      )
    )
  )
  inputs.entries[0]!.evidence.eventStatus = 'planned'
  inputs.entries[0]!.evidence.occurredAt = null
  expect(dailyEventFacts(inputs)).toMatchObject({
    independentRoots: 2,
    unknownOccurrenceTime: 1,
    counts: { planned: 1, 'reported-happened': 1, completed: 0 }
  })
  inputs.entries[1]!.independentRoots = [...inputs.entries[0]!.independentRoots]
  expect(dailyEventFacts(inputs)).toMatchObject({
    independentRoots: 1,
    counts: { unknown: 1, completed: 0 }
  })
  expect(() =>
    validateDailyOutput(
      {
        sections: [],
        proposals: [],
        observations: [
          {
            title: '错误支持',
            markdown: '两次意味着固定习惯',
            nature: 'faithful-summary',
            sourceHandles: ['source0', 'source1']
          }
        ]
      },
      inputs
    )
  ).toThrow('INSUFFICIENT_INDEPENDENT_EVENTS')
})

it('persists an explicit disputed observation without accepting a memory, then permits a separately versioned correction', async () => {
  const f = dailyFixture()
  f.remember('合成事件甲', true)
  f.remember('合成事件乙', true)
  f.configure('observation')
  f.run('observation')
  await vi.waitFor(() => expect(f.query().jobs[0]?.state).toBe('COMPLETED'))
  let report = f.query('reports').reports[0]!
  let detail = f.service.inspect({
    ...f.base,
    id: report.id,
    expectedVersion: report.version,
    governanceVersion: report.governanceVersion
  })
  if (!detail.ok) throw Error('detail')
  let observation = detail.data.observations[0]!
  expect(
    f.service.decide({
      ...f.base,
      reportId: report.id,
      expectedReportVersion: report.version,
      governanceVersion: report.governanceVersion,
      observationId: observation.id,
      expectedVersion: observation.version,
      commandId: crypto.randomUUID(),
      action: 'dispute'
    })
  ).toMatchObject({ ok: true, data: { state: 'SUCCEEDED', memory: null } })
  report = f.query('reports').reports[0]!
  detail = f.service.inspect({
    ...f.base,
    id: report.id,
    expectedVersion: report.version,
    governanceVersion: report.governanceVersion
  })
  if (!detail.ok) throw Error('detail')
  observation = detail.data.observations[0]!
  expect(observation).toMatchObject({ status: 'disputed', memoryId: null })
  expect(
    f.service.decide({
      ...f.base,
      reportId: report.id,
      expectedReportVersion: report.version,
      governanceVersion: report.governanceVersion,
      observationId: observation.id,
      expectedVersion: observation.version,
      commandId: crypto.randomUUID(),
      action: 'correct',
      correction: { title: '用户即时纠正', markdown: '这是合成用户明确说明' }
    })
  ).toMatchObject({ ok: true, data: { memory: { state: 'SUCCEEDED' } } })
})
