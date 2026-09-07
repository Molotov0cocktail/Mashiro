import { expect, it } from 'vitest'
import { previewDaily, dailyPeriod } from '../../src/main/background/daily-time.js'
import type { DailySchedule } from '../../src/shared/daily-contract.js'
const base: DailySchedule = {
  timeZone: 'America/New_York',
  localTime: '02:30',
  weekday: 1,
  weekStartsOn: 1,
  fold: null,
  gap: null
}
it('requires explicit DST gap and fold choices and returns actual instants', () => {
  const after = new Date('2026-03-08T00:00:00Z')
  expect(previewDaily('daily-brief', base, after)).toMatchObject({
    status: 'NEEDS_DST_CHOICE',
    dst: 'gap',
    nextRun: null
  })
  expect(previewDaily('daily-brief', { ...base, gap: 'next-valid' }, after)).toMatchObject({
    status: 'READY',
    dst: 'gap',
    nextRun: '2026-03-08T07:00:00.000Z'
  })
  expect(previewDaily('daily-brief', { ...base, gap: 'skip' }, after).nextRun).toBe(
    '2026-03-09T06:30:00.000Z'
  )
  const fold = { ...base, localTime: '01:30' },
    beforeFold = new Date('2026-11-01T00:00:00Z')
  expect(previewDaily('daily-brief', fold, beforeFold)).toMatchObject({
    status: 'NEEDS_DST_CHOICE',
    alternatives: ['2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z']
  })
  expect(previewDaily('daily-brief', { ...fold, fold: 'later' }, beforeFold).nextRun).toBe(
    '2026-11-01T06:30:00.000Z'
  )
})
it('uses real DST day boundaries and explicit week start instead of fixed 24 hour arithmetic', () => {
  const period = dailyPeriod('evening-review', base, new Date('2026-03-08T12:00:00Z'))
  expect(Date.parse(period.end) - Date.parse(period.start)).toBe(23 * 3600000)
  expect(() => previewDaily('weekly-plan', { ...base, weekStartsOn: null }, new Date())).toThrow(
    'WEEK_CONFIGURATION_REQUIRED'
  )
  expect(() =>
    previewDaily('daily-brief', { ...base, timeZone: 'invalid-zone' }, new Date())
  ).toThrow()
})
