import type {
  DailyFeature,
  DailyPeriod,
  DailyPreview,
  DailySchedule
} from '../../shared/daily-contract.js'

function parts(instant: Date, zone: string) {
  const result = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(instant)
  const value = (key: string) => Number(result.find((p) => p.type === key)!.value)
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute')
  }
}
function wall(value: ReturnType<typeof parts>) {
  return Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute)
}
function label(value: number) {
  return new Date(value).toISOString().slice(0, 16)
}
export function localInstants(local: number, zone: string): string[] {
  const offsets = new Set<number>()
  for (const delta of [-36, -12, 0, 12, 36]) {
    const sample = local + delta * 3600000
    offsets.add(wall(parts(new Date(sample), zone)) - sample)
  }
  return [...offsets]
    .map((offset) => local - offset)
    .filter((instant) => wall(parts(new Date(instant), zone)) === local)
    .sort((a, b) => a - b)
    .map((instant) => new Date(instant).toISOString())
}
function dayStart(localDay: number, zone: string): string {
  for (let minute = 0; minute < 2880; minute++) {
    const choices = localInstants(localDay + minute * 60000, zone)
    if (choices.length) return choices[0]!
  }
  throw Error('TIME_ZONE_DATE_UNAVAILABLE')
}
export function dailyPeriod(
  feature: DailyFeature,
  schedule: DailySchedule,
  instant: Date
): DailyPeriod {
  const local = parts(instant, schedule.timeZone)
  let start = Date.UTC(local.year, local.month - 1, local.day)
  let days = 1
  if (feature === 'weekly-plan') {
    if (schedule.weekStartsOn === null) throw Error('WEEK_START_REQUIRED')
    start -= ((new Date(start).getUTCDay() - schedule.weekStartsOn + 7) % 7) * 86400000
    days = 7
  }
  return {
    start: dayStart(start, schedule.timeZone),
    end: dayStart(start + days * 86400000, schedule.timeZone),
    timeZone: schedule.timeZone,
    localLabel: label(start).slice(0, 10) + (days === 7 ? ' 起的一周' : '')
  }
}
export function observationPeriod(period: DailyPeriod, days: number): DailyPeriod {
  const local = parts(new Date(Date.parse(period.end) - 1), period.timeZone)
  const start = Date.UTC(local.year, local.month - 1, local.day) - (days - 1) * 86400000
  return {
    ...period,
    start: dayStart(start, period.timeZone),
    localLabel: label(start).slice(0, 10) + ' 起的 ' + days + ' 个当地日'
  }
}
export function previewDaily(
  feature: DailyFeature,
  schedule: DailySchedule,
  after: Date
): DailyPreview {
  if (!Number.isFinite(after.getTime())) throw Error('INVALID_TIME')
  const local = parts(after, schedule.timeZone)
  if (feature === 'weekly-plan' && (schedule.weekday === null || schedule.weekStartsOn === null))
    throw Error('WEEK_CONFIGURATION_REQUIRED')
  const [hour, minute] = schedule.localTime.split(':').map(Number)
  const today = Date.UTC(local.year, local.month - 1, local.day)
  for (let day = 0; day < 15; day++) {
    const date = today + day * 86400000
    if (feature === 'weekly-plan' && new Date(date).getUTCDay() !== schedule.weekday) continue
    const requested = date + hour! * 3600000 + minute! * 60000
    let choices = localInstants(requested, schedule.timeZone)
    const dst: 'ordinary' | 'fold' | 'gap' =
      choices.length === 2 ? 'fold' : choices.length === 0 ? 'gap' : 'ordinary'
    if (choices.length === 0) {
      if (schedule.gap === 'skip') continue
      if (schedule.gap === null)
        return {
          status: 'NEEDS_DST_CHOICE',
          nextRun: null,
          localDateTime: label(requested),
          occurrence: null,
          period: null,
          dst,
          alternatives: [],
          reason: '当地时刻不存在，请明确跳过或采用下一个合法时刻'
        }
      for (let shift = 1; shift <= 1440 && choices.length === 0; shift++)
        choices = localInstants(requested + shift * 60000, schedule.timeZone)
      if (choices.length === 0) throw Error('TIME_ZONE_DATE_UNAVAILABLE')
    }
    if (choices.length === 2 && schedule.fold === null)
      return {
        status: 'NEEDS_DST_CHOICE',
        nextRun: null,
        localDateTime: label(requested),
        occurrence: null,
        period: null,
        dst,
        alternatives: choices,
        reason: '当地时刻重复，请明确第一次或第二次'
      }
    const selected = choices[schedule.fold === 'later' ? choices.length - 1 : 0]!
    if (Date.parse(selected) <= after.getTime()) continue
    return {
      status: 'READY',
      nextRun: selected,
      localDateTime: label(wall(parts(new Date(selected), schedule.timeZone))),
      occurrence: feature + ':' + schedule.timeZone + ':' + selected,
      period: dailyPeriod(feature, schedule, new Date(selected)),
      dst,
      alternatives: choices,
      reason: dst === 'gap' ? '采用明确选择的下一个合法时刻' : '按明确时区和时刻运行'
    }
  }
  return {
    status: 'SKIPPED_GAP',
    nextRun: null,
    localDateTime: null,
    occurrence: null,
    period: null,
    dst: 'gap',
    alternatives: [],
    reason: '当前窗口没有合法周期，请调整明确配置'
  }
}
