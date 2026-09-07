import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { removeDailyFixture } from './retention-legacy-fixture.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'

it('migrates populated v12 branch metadata to a persistent v13 guard without replacing its identity', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mashiro-branch-migration-'))
  const path = join(directory, 'state.sqlite')
  let store = new SqliteStore(path)
  const id = randomUUID()
  const record = { id, version: 17, title: '已存在的分支' }
  store.database
    .prepare('INSERT INTO memory_branches(id,version,record_json) VALUES(?,?,?)')
    .run(id, 17, JSON.stringify(record))
  store.close()
  // Restore exactly the prior branch column layout; all other v12 tables are retained.
  const prior = new DatabaseSync(path)
  removeDailyFixture(prior)
  prior.exec('ALTER TABLE memory_branches DROP COLUMN governance_digest; PRAGMA user_version=12')
  prior.close()
  try {
    store = new SqliteStore(path)
    expect(store.database.prepare('PRAGMA user_version').get()!.user_version).toBe(15)
    expect(store.database.prepare('SELECT * FROM memory_branches').get()).toMatchObject({
      id,
      version: 17,
      record_json: JSON.stringify(record),
      governance_digest: ''
    })
    store.close()
    store = new SqliteStore(path)
    expect(store.database.prepare('SELECT count(*) AS n FROM memory_branches').get()!.n).toBe(1)
  } finally {
    store.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
