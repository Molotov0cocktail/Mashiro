import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { removeBackgroundFixture } from './retention-legacy-fixture.js'
it('upgrades genuine v10 additively and rolls back a DDL collision without accepting a partial schema', () => {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-background-schema-')),
    path = join(root, 'db.sqlite')
  try {
    const current = new SqliteStore(path)
    const before = current.database.prepare('SELECT * FROM assistant_state').all()
    removeBackgroundFixture(current.database)
    current.database.exec(
      "PRAGMA user_version=10; CREATE TABLE background_jobs(collision TEXT); INSERT INTO background_jobs VALUES('sentinel')"
    )
    current.close()
    expect(() => new SqliteStore(path)).toThrow()
    const raw = new DatabaseSync(path)
    expect(raw.prepare('PRAGMA user_version').get()).toEqual({ user_version: 10 })
    expect(raw.prepare('SELECT * FROM background_jobs').all()).toEqual([{ collision: 'sentinel' }])
    expect(
      raw.prepare("SELECT 1 FROM sqlite_master WHERE name='background_configs'").get()
    ).toBeUndefined()
    raw.exec('DROP TABLE background_jobs')
    raw.close()
    const migrated = new SqliteStore(path)
    expect(migrated.database.prepare('PRAGMA user_version').get()).toEqual({ user_version: 18 })
    expect(migrated.database.prepare('SELECT * FROM assistant_state').all()).toEqual(before)
    migrated.close()
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
