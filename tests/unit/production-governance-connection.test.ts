import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { guardGovernanceDatabase } from '../../src/main/data/production-governance-database.js'

const cleanup: (() => void)[] = []
afterEach(() => {
  for (const action of cleanup.splice(0).reverse()) action()
})
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-governance-connections-'))
  cleanup.push(() => rmSync(root, { recursive: true, force: true }))
  const path = join(root, 'state.sqlite'),
    raw = new DatabaseSync(path)
  cleanup.push(() => raw.close())
  raw.exec(
    "CREATE TABLE production_governance_commits(token TEXT PRIMARY KEY); CREATE TABLE governed(id TEXT PRIMARY KEY,version INTEGER); INSERT INTO governed VALUES('one',1),('two',1)"
  )
  const events: unknown[] = []
  const guarded = guardGovernanceDatabase(
    raw,
    [{ table: 'governed', keys: ['id'], values: [{ column: 'version' }] }],
    {
      before(_table, keys, values, deleted) {
        events.push({ keys, values, deleted })
        return randomUUID()
      },
      settle() {
        events.push('settled')
      }
    }
  )
  return { ...guarded, raw, path, events }
}

it('records removal of an OLD key and the NEW keyed projection in the same SQL commit', () => {
  const f = fixture()
  f.database.prepare("UPDATE governed SET id='renamed',version=2 WHERE id='one'").run()
  expect(f.events).toEqual([
    { keys: ['one'], values: [1], deleted: true },
    { keys: ['renamed'], values: [2], deleted: false },
    'settled'
  ])
  expect(f.raw.prepare('SELECT token FROM production_governance_commits').all()).toHaveLength(2)
})

it('does not settle an incompletely consumed RETURNING iterator even when another read occurs', () => {
  const f = fixture()
  const iterator = f.database.prepare('UPDATE governed SET version=2 RETURNING id').iterate()
  expect(iterator.next().done).toBe(false)
  f.database.prepare('SELECT count(*) n FROM governed').get()
  expect(f.events).not.toContain('settled')
  iterator.return?.()
  expect(f.events.at(-1)).toBe('settled')
  const reopened = new DatabaseSync(f.path)
  try {
    expect(reopened.prepare('SELECT version FROM governed').all()).toEqual([
      { version: 2 },
      { version: 2 }
    ])
  } finally {
    reopened.close()
  }
})

it('each connection settles only its own dirty transaction, including rollback', () => {
  const f = fixture(),
    other = new DatabaseSync(f.path)
  cleanup.push(() => other.close())
  const otherEvents: string[] = []
  const second = guardGovernanceDatabase(other, [{ table: 'governed', keys: ['id'] }], {
    before() {
      otherEvents.push('before')
      return randomUUID()
    },
    settle() {
      otherEvents.push('settled')
    }
  }).database
  f.database.exec('BEGIN IMMEDIATE')
  f.database.prepare("UPDATE governed SET version=2 WHERE id='one'").run()
  expect(second.prepare("SELECT version FROM governed WHERE id='one'").get()!.version).toBe(1)
  expect(otherEvents).toEqual([])
  f.database.exec('ROLLBACK')
  expect(f.events.at(-1)).toBe('settled')
  second.prepare("UPDATE governed SET version=3 WHERE id='one'").run()
  expect(otherEvents).toEqual(['before', 'settled'])
})
