import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it } from 'vitest'
import { SqliteStore } from '../../src/main/data/sqlite.js'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function databasePath(): string {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-reminder-group-schema-review-'))
  roots.push(root)
  return join(root, 'state.sqlite')
}

it('rolls back a v14 notification-table collision before advancing the schema version', () => {
  const path = databasePath()
  const current = new SqliteStore(path)
  current.database.exec(
    'DROP TABLE reminder_notification_members; PRAGMA user_version=14; CREATE TABLE reminder_notification_members(group_id TEXT,reminder_id TEXT,version TEXT);'
  )
  current.close()

  expect(() => new SqliteStore(path)).toThrow()

  const raw = new DatabaseSync(path)
  expect(raw.prepare('PRAGMA user_version').get()).toEqual({ user_version: 14 })
  expect(raw.prepare('PRAGMA table_info(reminder_notification_members)').all()).toHaveLength(3)
  raw.exec('DROP TABLE reminder_notification_members')
  raw.close()

  const migrated = new SqliteStore(path)
  expect(migrated.database.prepare('PRAGMA user_version').get()).toEqual({ user_version: 15 })
  expect(
    String(
      migrated.database
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type='table' AND name='reminder_notification_members'"
        )
        .get()!.sql
    )
  ).toContain('CHECK(version>0)')
  migrated.close()
})

it('rejects a v15 notification table that keeps names but drops types, nullability, key and version check', () => {
  const path = databasePath()
  const current = new SqliteStore(path)
  current.database.exec(
    'DROP TABLE reminder_notification_members; CREATE TABLE reminder_notification_members(group_id,reminder_id,version);'
  )
  current.close()

  expect(() => {
    const reopened = new SqliteStore(path)
    reopened.close()
  }).toThrow('REMINDER_NOTIFICATION_SCHEMA_INVALID')
})
