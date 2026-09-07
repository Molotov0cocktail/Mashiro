import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import {
  mkdtempSync,
  openSync,
  closeSync,
  writeFileSync,
  fsyncSync,
  readFileSync,
  rmSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { guardGovernanceDatabase } from '../../src/main/data/production-governance-database.js'

const cleanup: (() => void)[] = []
afterEach(() => {
  for (const action of cleanup.splice(0).reverse()) action()
})
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-governance-mechanism-'))
  cleanup.push(() => rmSync(root, { recursive: true, force: true }))
  const raw = new DatabaseSync(join(root, 'state.sqlite'))
  cleanup.push(() => raw.close())
  raw.exec(
    "CREATE TABLE production_governance_commits(token TEXT PRIMARY KEY); CREATE TABLE governed(id TEXT PRIMARY KEY, version INTEGER NOT NULL); INSERT INTO governed VALUES('one',1); CREATE TABLE cascade_source(id TEXT); CREATE TRIGGER cascade_update AFTER INSERT ON cascade_source BEGIN UPDATE governed SET version=version+1 WHERE id=NEW.id; END;"
  )
  const previouslyPrepared = raw.prepare("UPDATE governed SET version=version+1 WHERE id='one'")
  const events: string[] = []
  let rejectBefore = false,
    rejectSettlement = false
  const logPath = join(root, 'governance-pending.log')
  const guarded = guardGovernanceDatabase(raw, [{ table: 'governed', keys: ['id'] }], {
    before(table, keys) {
      events.push('before')
      if (rejectBefore) throw Error('SYNTHETIC_FSYNC_FAILURE')
      const fd = openSync(logPath, 'a')
      try {
        writeFileSync(fd, JSON.stringify({ table, keys }) + '\n')
        fsyncSync(fd)
      } finally {
        closeSync(fd)
      }
      return randomUUID()
    },
    settle(database) {
      if (rejectSettlement) throw Error('SYNTHETIC_SETTLEMENT_FAILURE')
      expect(database.isTransaction).toBe(false)
      events.push(
        'settled:' +
          String(database.prepare("SELECT version FROM governed WHERE id='one'").get()!.version)
      )
    }
  })
  return {
    ...guarded,
    raw,
    previouslyPrepared,
    events,
    logPath,
    rejectBefore() {
      rejectBefore = true
    },
    rejectSettlement() {
      rejectSettlement = true
    }
  }
}

it('fsyncs a minimal pending event before commit and precisely settles actual rollback state', () => {
  const f = fixture()
  f.database.exec('BEGIN IMMEDIATE')
  f.database.prepare("UPDATE governed SET version=2 WHERE id='one'").run()
  expect(f.events).toEqual(['before'])
  expect(JSON.parse(readFileSync(f.logPath, 'utf8'))).toEqual({ table: 'governed', keys: ['one'] })
  f.database.exec('ROLLBACK')
  expect(f.events).toEqual(['before', 'settled:1'])
  expect(f.raw.prepare('SELECT token FROM production_governance_commits').all()).toEqual([])
})

it('covers autocommit, RETURNING, trigger cascades and prepared-before-hook writes', () => {
  const f = fixture()
  expect(
    f.database.prepare("UPDATE governed SET version=2 WHERE id='one' RETURNING version").get()!
      .version
  ).toBe(2)
  expect(f.events).toEqual(['before', 'settled:2'])
  f.database.prepare("INSERT INTO cascade_source VALUES('one')").run()
  expect(f.events.slice(-2)).toEqual(['before', 'settled:3'])
  f.previouslyPrepared.run()
  expect(f.events.at(-1)).toBe('before')
  f.settle()
  expect(f.events.at(-1)).toBe('settled:4')
})

it('refuses SQL when pending fsync fails, while a postcommit failure remains explicitly unsettled', () => {
  const failed = fixture()
  failed.rejectBefore()
  expect(() =>
    failed.database.prepare("UPDATE governed SET version=2 WHERE id='one'").run()
  ).toThrow()
  expect(failed.raw.prepare("SELECT version FROM governed WHERE id='one'").get()!.version).toBe(1)
  const committed = fixture()
  committed.rejectSettlement()
  expect(() =>
    committed.database.prepare("UPDATE governed SET version=2 WHERE id='one'").run()
  ).toThrow('SYNTHETIC_SETTLEMENT_FAILURE')
  expect(committed.raw.prepare("SELECT version FROM governed WHERE id='one'").get()!.version).toBe(
    2
  )
  expect(committed.events).toEqual(['before'])
  expect(
    committed.raw.prepare('SELECT token FROM production_governance_commits').all()
  ).toHaveLength(1)
  expect(() => committed.settle()).toThrow('SYNTHETIC_SETTLEMENT_FAILURE')
})
