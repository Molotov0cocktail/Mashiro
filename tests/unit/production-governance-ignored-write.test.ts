import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { guardGovernanceDatabase } from '../../src/main/data/production-governance-database.js'

it('ignored INSERT and conflicting UPDATE never commit a governance projection for a row that did not change', () => {
  const raw = new DatabaseSync(':memory:')
  try {
    raw.exec(
      "CREATE TABLE production_governance_commits(token TEXT PRIMARY KEY); CREATE TABLE governed(id TEXT PRIMARY KEY, version INTEGER); INSERT INTO governed VALUES('one',1),('two',2)"
    )
    const projections: unknown[] = []
    const guarded = guardGovernanceDatabase(
      raw,
      [{ table: 'governed', keys: ['id'], values: [{ column: 'version' }] }],
      {
        before(table, keys, values) {
          projections.push({ table, keys, values })
          return randomUUID()
        },
        settle() {}
      }
    ).database
    guarded.prepare("INSERT OR IGNORE INTO governed VALUES('one',99)").run()
    guarded.prepare("UPDATE OR IGNORE governed SET id='two',version=99 WHERE id='one'").run()
    expect(raw.prepare('SELECT * FROM governed ORDER BY id').all()).toEqual([
      { id: 'one', version: 1 },
      { id: 'two', version: 2 }
    ])
    expect(projections).toEqual([])
    expect(raw.prepare('SELECT * FROM production_governance_commits').all()).toEqual([])
  } finally {
    raw.close()
  }
})
