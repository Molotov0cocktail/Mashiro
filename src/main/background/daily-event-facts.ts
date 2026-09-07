import type { DailyInputs } from './daily-sources.js'
export function dailyEventFacts(inputs: DailyInputs) {
  const roots = new Map<string, Set<string>>()
  const unknownTime = new Set<string>()
  for (const entry of inputs.entries) {
    if (entry.evidence.eventStatus === null) continue
    for (const root of entry.independentRoots) {
      const statuses = roots.get(root) ?? new Set<string>()
      statuses.add(entry.evidence.eventStatus)
      roots.set(root, statuses)
      if (!entry.evidence.occurredAt) unknownTime.add(root)
    }
  }
  const counts = {
    intention: 0,
    planned: 0,
    arranged: 0,
    'reported-happened': 0,
    completed: 0,
    cancelled: 0,
    unknown: 0
  }
  for (const statuses of roots.values()) {
    const status = statuses.size === 1 ? [...statuses][0]! : 'unknown'
    counts[status as keyof typeof counts]++
  }
  return { independentRoots: roots.size, unknownOccurrenceTime: unknownTime.size, counts }
}
export function objectiveObservation(inputs: DailyInputs) {
  const facts = dailyEventFacts(inputs)
  return {
    title: '所选事件范围的客观统计',
    nature: 'faithful-summary' as const,
    markdown: `当前范围有 ${facts.independentRoots} 个独立事件来源根：意向 ${facts.counts.intention}，计划 ${facts.counts.planned}，已安排 ${facts.counts.arranged}，用户报告已发生 ${facts.counts['reported-happened']}，已完成 ${facts.counts.completed}，取消 ${facts.counts.cancelled}，未知或同根状态冲突 ${facts.counts.unknown}。其中 ${facts.unknownOccurrenceTime} 个来源根缺少发生时间；不以记录时间补造。计划和安排不计为已发生或已完成。这是所选资料统计，不代表完整生活记录。`,
    sourceHandles: inputs.entries
      .filter((entry) => entry.evidence.eventStatus !== null)
      .map((entry) => entry.evidence.handle)
  }
}
