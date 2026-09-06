import type { DatabaseSync } from 'node:sqlite'

/** Only for constructing synthetic pre-v7 migration fixtures from a fresh current database. */
export function removeRetentionFixture(database: DatabaseSync): void {
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
