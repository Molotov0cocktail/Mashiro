import type { DatabaseSync } from 'node:sqlite'

export function migrateReminderNotifications(database: DatabaseSync): void {
  if (Number(database.prepare('PRAGMA user_version').get()!.user_version) === 14) {
    if (
      database.prepare('PRAGMA integrity_check').get()!.integrity_check !== 'ok' ||
      database.prepare('PRAGMA foreign_key_check').all().length
    )
      throw new Error('REMINDER_NOTIFICATION_INTEGRITY')
    database.exec('BEGIN IMMEDIATE')
    try {
      database.exec(`CREATE TABLE reminder_notification_members(group_id TEXT NOT NULL,reminder_id TEXT NOT NULL,version INTEGER NOT NULL CHECK(version>0),PRIMARY KEY(group_id,reminder_id,version));
        PRAGMA user_version=15;`)
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
  }
  const columns = database.prepare('PRAGMA table_info(reminder_notification_members)').all()
  const expected = [
    { name: 'group_id', type: 'TEXT', notnull: 1, pk: 1 },
    { name: 'reminder_id', type: 'TEXT', notnull: 1, pk: 2 },
    { name: 'version', type: 'INTEGER', notnull: 1, pk: 3 }
  ]
  const actual = columns.map((row) => ({
    name: String(row.name),
    type: String(row.type),
    notnull: Number(row.notnull),
    pk: Number(row.pk)
  }))
  const definition = database
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='reminder_notification_members'"
    )
    .get()?.sql
  if (
    JSON.stringify(actual) !== JSON.stringify(expected) ||
    typeof definition !== 'string' ||
    !definition.replace(/\s+/g, '').toLowerCase().includes('check(version>0)')
  )
    throw new Error('REMINDER_NOTIFICATION_SCHEMA_INVALID')
}
