import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, basename } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { migrateProductionGovernance } from '../../src/main/data/production-governance-schema.js'
import { removeGovernanceFixture } from './governance-legacy-fixture.js'

it.each([false, true])(
  'migrates a genuine schema16, preserving its protocol tables and atomically rejecting a name collision=%s',
  (collision) => {
    const root = mkdtempSync(join(realpathSync.native(tmpdir()), 'mashiro-gov-migrate-')),
      path = join(root, 'mashiro.sqlite')
    let database: DatabaseSync | undefined
    try {
      const store = new SqliteStore(path)
      removeGovernanceFixture(store.database)
      store.database.exec('PRAGMA user_version=16')
      store.close()
      database = new DatabaseSync(path)
      if (collision) database.exec('CREATE TABLE production_governance_commits(wrong_column TEXT)')
      const before = database.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY name').all()
      if (collision) {
        expect(() => migrateProductionGovernance(database!)).toThrow()
        expect(database.prepare('PRAGMA user_version').get()!.user_version).toBe(16)
        expect(
          database.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY name').all()
        ).toEqual(before)
      } else {
        migrateProductionGovernance(database)
        expect(database.prepare('PRAGMA user_version').get()!.user_version).toBe(17)
        expect(
          database.prepare('SELECT instance_id FROM production_governance_state').get()!.instance_id
        ).toMatch(/^[a-f0-9-]{36}$/)
        expect(
          database.prepare("SELECT sql FROM sqlite_master WHERE name='protocol_segments'").get()
        ).toEqual(
          before.find((row) => row.name === 'protocol_segments') && {
            sql: before.find((row) => row.name === 'protocol_segments')!.sql
          }
        )
        expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
      }
    } finally {
      database?.close()
      const actual = realpathSync.native(root)
      if (
        dirname(actual) !== realpathSync.native(tmpdir()) ||
        !basename(actual).startsWith('mashiro-gov-migrate-')
      )
        rejectUnownedRoot()
      rmSync(actual, { recursive: true, force: true })
    }
  }
)

function rejectUnownedRoot(): never {
  throw Error('UNOWNED_ROOT')
}
