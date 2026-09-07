import type { DatabaseSync } from 'node:sqlite'
import { reminderRecordSchema } from '../../shared/reminder-contract.js'
import type { GovernanceProjection } from './production-governance-catalog.js'

/** Later claims/terminal states survive restoration; unchanged healthy schedules remain usable. */
export function applyRestoredReminderGovernance(
  database: DatabaseSync,
  projections: GovernanceProjection[],
  unavailableItems: Set<string>
): void {
  for (const p of projections) {
    if (p.table === 'reminder_occurrences' && !p.deleted)
      database
        .prepare('INSERT OR REPLACE INTO reminder_occurrences VALUES(?,?,?)')
        .run(...p.keys, ...p.values)
  }
  const known = new Map(
    projections.filter((p) => p.table === 'reminders').map((p) => [String(p.keys[0]), p])
  )
  for (const row of database.prepare('SELECT version,record_json FROM reminders').all()) {
    const record = reminderRecordSchema.parse(JSON.parse(String(row.record_json))),
      prior = known.get(record.id)
    let terminal = false
    if (prior) {
      const version = Number(prior.values[1]),
        state = String(prior.values[2])
      terminal = prior.deleted || state === 'CANCELLED' || state === 'HANDLED'
      if (terminal) record.state = state === 'HANDLED' ? 'HANDLED' : 'CANCELLED'
      else if (version > record.version || state !== 'SCHEDULED') record.state = 'RESULT_UNKNOWN'
      record.version = Math.max(record.version, version)
      record.itemVersion = Math.max(record.itemVersion, Number(prior.values[4]))
      if (version > Number(row.version ?? 0)) {
        record.dueAt = String(prior.values[3])
        record.timeZone = String(prior.values[5])
      }
    }
    if (
      !terminal &&
      (unavailableItems.has(record.itemId) ||
        database
          .prepare('SELECT 1 FROM reminder_occurrences WHERE reminder_id=? AND version=?')
          .get(record.id, record.version))
    )
      record.state = 'RESULT_UNKNOWN'
    database
      .prepare('UPDATE reminders SET version=?,state=?,due_at=?,record_json=? WHERE id=?')
      .run(record.version, record.state, record.dueAt, JSON.stringify(record), record.id)
  }
  // A pending old confirmation is never approval to dispatch or change a restored schedule.
  database.exec('DELETE FROM reminder_previews')
}
