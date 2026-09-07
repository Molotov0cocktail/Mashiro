import { mkdtempSync, rmSync, statSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it, vi } from 'vitest'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { migrateProductionGovernance } from '../../src/main/data/production-governance-schema.js'
import { ProductionGovernanceJournal } from '../../src/main/data/production-governance-journal.js'
import {
  connectGovernanceDatabase,
  readGovernanceBaseline,
  recoverGovernancePending
} from '../../src/main/data/production-governance-connection.js'

const cleanup: (() => void)[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const action of cleanup.splice(0).reverse()) action()
})
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-governance-projection-'))
  cleanup.push(() => rmSync(root, { recursive: true, force: true }))
  const path = join(root, 'state.sqlite'),
    store = new SqliteStore(path)
  cleanup.push(() => store.close())
  migrateProductionGovernance(store.database)
  const stat = statSync(path),
    anchor = {
      instanceId: String(
        store.database.prepare('SELECT instance_id FROM production_governance_state').get()!
          .instance_id
      ),
      device: String(stat.dev),
      inode: String(stat.ino)
    }
  const dataSetId = randomUUID(),
    journal = ProductionGovernanceJournal.create(
      root,
      dataSetId,
      anchor,
      readGovernanceBaseline(store.database)
    )
  const assertFile = () => {
    const current = statSync(path)
    if (String(current.dev) !== anchor.device || String(current.ino) !== anchor.inode)
      throw Error('FILE_CHANGED')
  }
  const database = connectGovernanceDatabase(store.database, journal, anchor, assertFile)
  const id = randomUUID(),
    ownerAssistantId = randomUUID()
  const record = {
    scope: 'assistant',
    ownerAssistantId,
    state: 'active',
    retention: 'persistent',
    title: 'SYNTHETIC-PRIVATE-TITLE',
    markdown: 'SYNTHETIC-PRIVATE-BODY'
  }
  database.prepare('INSERT INTO memory_objects VALUES(?,1,?)').run(id, JSON.stringify(record))
  return { root, path, dataSetId, store, journal, anchor, assertFile, database, id, record }
}

it('captures only the real schema minimal metadata and preserves rollback versions without body leakage', () => {
  const f = fixture()
  f.database.exec('BEGIN IMMEDIATE')
  f.database
    .prepare('UPDATE memory_objects SET version=2,record_json=? WHERE id=?')
    .run(JSON.stringify({ ...f.record, state: 'suppressed' }), f.id)
  f.database.exec('ROLLBACK')
  expect(
    f.journal.snapshot().projections.find((p) => p.table === 'memory_objects')?.values
  ).toEqual([1, 'assistant', f.record.ownerAssistantId, 'active', 'persistent'])
  const bytes = readFileSync(f.journal.path, 'utf8')
  expect(bytes).not.toContain('SYNTHETIC-PRIVATE')
  expect(bytes).not.toContain('markdown')
})

it('recovers a real committed token after simulated postcommit journal failure and rejects a copied database anchor', () => {
  const f = fixture(),
    spy = vi.spyOn(f.journal, 'resolve').mockImplementation(() => {
      throw Error('SYNTHETIC_POSTCOMMIT_CRASH')
    })
  expect(() =>
    f.database.prepare('UPDATE memory_objects SET version=2 WHERE id=?').run(f.id)
  ).toThrow('SYNTHETIC_POSTCOMMIT_CRASH')
  spy.mockRestore()
  const recovered = ProductionGovernanceJournal.open(f.root, f.dataSetId)
  expect(() => recovered.snapshot()).toThrow('GOVERNANCE_STATE_UNCERTAIN')
  expect(() =>
    recoverGovernancePending(f.store.database, recovered, { ...f.anchor, inode: '0' }, f.assertFile)
  ).toThrow('GOVERNANCE_INSTANCE_MISMATCH')
  recoverGovernancePending(f.store.database, recovered, f.anchor, f.assertFile)
  expect(
    recovered.snapshot().projections.find((p) => p.table === 'memory_objects')?.values[0]
  ).toBe(2)
})

it('a transaction that crashes before commit is rolled back by SQLite and settles as non-deletion on healthy reopen', () => {
  const f = fixture(),
    second = new DatabaseSync(f.path)
  const reopenedJournal = ProductionGovernanceJournal.open(f.root, f.dataSetId)
  const writer = connectGovernanceDatabase(second, reopenedJournal, f.anchor, f.assertFile)
  writer.exec('BEGIN IMMEDIATE')
  writer.prepare('DELETE FROM memory_objects WHERE id=?').run(f.id)
  second.close()
  const recovered = ProductionGovernanceJournal.open(f.root, f.dataSetId)
  recoverGovernancePending(f.store.database, recovered, f.anchor, f.assertFile)
  expect(recovered.snapshot().projections.find((p) => p.table === 'memory_objects')?.deleted).toBe(
    false
  )
})
