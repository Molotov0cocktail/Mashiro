import type { SqliteStore } from '../data/sqlite.js'
import { itemRecordSchema, type ItemContent } from '../../shared/item-contract.js'
import type {
  DailyConfiguration,
  DailyCheckpoint,
  DailyPeriod
} from '../../shared/daily-contract.js'

export function dailyItemChanges(
  store: SqliteStore,
  config: DailyConfiguration,
  itemId: string,
  currentVersion: number,
  current: ItemContent,
  period: DailyPeriod,
  limit: number
) {
  const previous = store.database
    .prepare(
      'SELECT version,content_json FROM daily_item_checkpoints WHERE config_id=? AND item_id=?'
    )
    .get(config.id, itemId)
  let old = previous ? (JSON.parse(String(previous.content_json)) as ItemContent) : null
  let version = previous ? Number(previous.version) : null
  const pending = store.database
    .prepare(
      'SELECT record_json FROM daily_item_changes WHERE item_id=? AND version>? AND version<=? ORDER BY version'
    )
    .all(itemId, version ?? 0, currentVersion)
    .map((row) => itemRecordSchema.parse(JSON.parse(String(row.record_json))))
  const changes = config.mergeChanges ? pending.slice(-1) : pending
  const checkpoints: DailyCheckpoint[] = []
  const excerpt = (content: ItemContent) => {
    const text = JSON.stringify(content)
    return text.length <= 1000 ? text : text.slice(0, 975) + '…（内容过长，此处仅显示节选）'
  }
  for (const next of changes) {
    if (checkpoints.length >= limit) break
    const fields = config.changeFields.filter((field) => !old || old[field] !== next.content[field])
    checkpoints.push({
      itemId,
      fromVersion: version,
      toVersion: next.version,
      fields,
      before: old ? excerpt(old) : null,
      after: excerpt(next.content),
      consumed: false
    })
    old = next.content
    version = next.version
  }
  const upcoming =
    !!current.dueAt &&
    !['completed', 'cancelled'].includes(current.status) &&
    Date.parse(current.dueAt) >= Date.parse(period.start) &&
    Date.parse(current.dueAt) <= Date.parse(period.start) + config.deadlineWindowHours * 3600000
  if (!changes.length && upcoming && limit > 0)
    checkpoints.push({
      itemId,
      fromVersion: version,
      toVersion: currentVersion,
      fields: [],
      before: old ? excerpt(old) : null,
      after: excerpt(current),
      consumed: false
    })
  return {
    checkpoints,
    limited: changes.length > checkpoints.length,
    relevant: upcoming || checkpoints.some((row) => row.fields.length > 0)
  }
}
