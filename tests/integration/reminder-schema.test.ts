import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { removeReminderFixture } from './retention-legacy-fixture.js'

it('v9 reminder migration rolls back a collision, preserves previous rows and starts with unconfigured policy', () => {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-reminder-schema-'))
  const path = join(root, 'state.sqlite')
  try {
    const current = new SqliteStore(path)
    removeReminderFixture(current.database)
    current.database.exec(
      "PRAGMA user_version=9; CREATE TABLE reminder_commands(collision TEXT); INSERT INTO reminder_commands VALUES('legacy-marker')"
    )
    const previous = current.database.prepare('SELECT * FROM assistant_state').all()
    current.close()
    expect(() => new SqliteStore(path)).toThrow()
    const raw = new DatabaseSync(path)
    expect(raw.prepare('PRAGMA user_version').get()).toEqual({ user_version: 9 })
    expect(raw.prepare('SELECT * FROM reminder_commands').all()).toEqual([
      { collision: 'legacy-marker' }
    ])
    expect(raw.prepare("SELECT 1 FROM sqlite_master WHERE name='reminders'").get()).toBeUndefined()
    raw.exec('DROP TABLE reminder_commands')
    raw.close()
    const migrated = new SqliteStore(path)
    expect(migrated.database.prepare('PRAGMA user_version').get()).toEqual({ user_version: 18 })
    expect(migrated.database.prepare('SELECT * FROM assistant_state').all()).toEqual(previous)
    expect(migrated.database.prepare('SELECT * FROM reminder_settings').get()).toEqual({
      singleton: 1,
      version: 0,
      policy_json: '{"mode":"UNCONFIGURED"}'
    })
    migrated.database.exec(
      'ALTER TABLE reminder_occurrences RENAME COLUMN version TO corrupted_version'
    )
    migrated.close()
    expect(() => new SqliteStore(path)).toThrow('columns invalid')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
