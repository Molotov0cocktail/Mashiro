import { removeReminderFixture } from './retention-legacy-fixture.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { SqliteStore } from '../../src/main/data/sqlite.js'

it('upgrades genuine v7 atomically and rolls back a v8 object collision without editing legacy data', () => {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-item-schema-'))
  const path = join(root, 'state.sqlite')
  try {
    const current = new SqliteStore(path)
    removeReminderFixture(current.database)
    current.database.exec(
      'ALTER TABLE assistants DROP COLUMN persona; ALTER TABLE assistants DROP COLUMN avatar_key'
    )
    for (const table of [
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
      current.database.exec(`DROP TABLE ${table}`)
    current.database.exec(
      "PRAGMA user_version=7; CREATE TABLE item_proposals(collision TEXT); INSERT INTO item_proposals VALUES('legacy-marker')"
    )
    const before = current.database.prepare('SELECT * FROM assistant_state').all()
    current.close()
    expect(() => new SqliteStore(path)).toThrow()
    const raw = new DatabaseSync(path)
    expect(raw.prepare('PRAGMA user_version').get()).toEqual({ user_version: 7 })
    expect(raw.prepare('SELECT * FROM assistant_state').all()).toEqual(before)
    expect(raw.prepare('SELECT * FROM item_proposals').all()).toEqual([
      { collision: 'legacy-marker' }
    ])
    expect(raw.prepare("SELECT 1 FROM sqlite_master WHERE name='items'").get()).toBeUndefined()
    raw.exec('DROP TABLE item_proposals')
    raw.close()
    const upgraded = new SqliteStore(path)
    expect(upgraded.database.prepare('PRAGMA user_version').get()).toEqual({ user_version: 13 })
    expect(upgraded.database.prepare('SELECT * FROM assistant_state').all()).toEqual(before)
    upgraded.close()
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
