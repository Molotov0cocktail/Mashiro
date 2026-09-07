import type { DatabaseSync } from 'node:sqlite'

/** Only for constructing synthetic pre-v7 migration fixtures from a fresh current database. */
export function removeStewardFixture(database: DatabaseSync): void {
  for (const table of [
    'memory_conflicts',
    'branch_members',
    'memory_branches',
    'steward_controls',
    'steward_consumptions',
    'steward_slots',
    'steward_attempts',
    'steward_jobs',
    'discovery_configs',
    'steward_configs'
  ])
    database.exec('DROP TABLE ' + table)
  for (const column of [
    'created_at',
    'candidate_json',
    'sources_json',
    'source_digest',
    'authority_assistant',
    'entry_kind'
  ])
    database.exec('ALTER TABLE memory_pending DROP COLUMN ' + column)
}
export function removeBackgroundFixture(database: DatabaseSync): void {
  removeStewardFixture(database)
  for (const table of [
    'background_controls',
    'background_chapters',
    'background_attempts',
    'background_jobs',
    'background_configs'
  ])
    database.exec('DROP TABLE ' + table)
}
export function removeReminderFixture(database: DatabaseSync): void {
  removeBackgroundFixture(database)
  for (const table of [
    'reminders',
    'reminder_commands',
    'reminder_occurrences',
    'reminder_settings',
    'reminder_previews',
    'reminder_activations'
  ])
    database.exec('DROP TABLE ' + table)
}
export function removeRetentionFixture(database: DatabaseSync): void {
  removeReminderFixture(database)
  database.exec(
    'ALTER TABLE assistants DROP COLUMN persona; ALTER TABLE assistants DROP COLUMN avatar_key'
  )
  const guards = database
    .prepare(
      "SELECT name,sql FROM sqlite_master WHERE type='trigger' AND name IN('assistant_state_primary_active','assistant_state_current_active')"
    )
    .all() as { name: string; sql: string }[]
  for (const guard of guards) {
    database.exec(`DROP TRIGGER ${guard.name}`)
    database.exec(guard.sql.replaceAll(' AND id NOT IN(SELECT id FROM assistant_tombstones)', ''))
  }
  for (const row of database
    .prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'retention_%'")
    .all() as { name: string }[]) {
    if (!/^retention_[a-zA-Z_]+$/.test(row.name)) throw Error('Unexpected synthetic trigger')
    database.exec(`DROP TRIGGER ${row.name}`)
  }
  database.exec('DROP VIEW readable_timeline_messages')
  for (const name of [
    'items',
    'item_proposals',
    'item_commands',
    'item_sources',
    'item_permissions',
    'item_recipients',
    'item_confirmations',
    'item_rejections',
    'item_tombstones',
    'item_retained_edges'
  ])
    database.exec(`DROP TABLE ${name}`)
  for (const name of [
    'retention_job_items',
    'retention_jobs',
    'retention_commands',
    'retention_previews',
    'retention_original_trash',
    'retained_source_edges',
    'assistant_tombstones',
    'content_tombstones',
    'retention_state'
  ])
    database.exec(`DROP TABLE ${name}`)
}
