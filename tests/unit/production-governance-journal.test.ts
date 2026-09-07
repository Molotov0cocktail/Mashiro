import { mkdtempSync, rmSync, appendFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import { ProductionGovernanceJournal } from '../../src/main/data/production-governance-journal.js'
import type { GovernanceProjection } from '../../src/main/data/production-governance-catalog.js'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-governance-journal-'))
  roots.push(root)
  const dataSetId = randomUUID(),
    anchor = { instanceId: randomUUID(), device: '1', inode: '2' }
  const projection: GovernanceProjection = {
    table: 'memory_objects',
    keys: [randomUUID()],
    values: [1, 'assistant', randomUUID(), 'active', 'persistent'],
    deleted: false
  }
  return {
    root,
    dataSetId,
    anchor,
    projection,
    journal: ProductionGovernanceJournal.create(root, dataSetId, anchor, [projection])
  }
}

it('keeps a pending mutation uncertain across process restart until its real SQL token is resolved', () => {
  const f = fixture(),
    changed = { ...f.projection, values: [2, ...f.projection.values.slice(1)] }
  const token = f.journal.before(f.anchor, changed)
  expect(() => f.journal.snapshot()).toThrow('GOVERNANCE_STATE_UNCERTAIN')
  const reopened = ProductionGovernanceJournal.open(f.root, f.dataSetId)
  expect(reopened.pendingTokens(f.anchor)).toEqual([token])
  expect(() => reopened.snapshot()).toThrow('GOVERNANCE_STATE_UNCERTAIN')
  reopened.resolve(f.anchor, [token], [])
  expect(ProductionGovernanceJournal.open(f.root, f.dataSetId).snapshot().projections).toEqual([
    changed
  ])
})

it('a proven SQL rollback removes only its pending intent and does not impose a completed deletion', () => {
  const f = fixture(),
    token = f.journal.before(f.anchor, { ...f.projection, deleted: true })
  f.journal.resolve(f.anchor, [], [token])
  expect(ProductionGovernanceJournal.open(f.root, f.dataSetId).snapshot().projections).toEqual([
    f.projection
  ])
})

it('rejects copied instance anchors, torn metadata and duplicate settlement without corrupting the valid journal', () => {
  const f = fixture(),
    token = f.journal.before(f.anchor, f.projection)
  expect(() => f.journal.resolve({ ...f.anchor, inode: '3' }, [token], [])).toThrow(
    'GOVERNANCE_INSTANCE_MISMATCH'
  )
  expect(() => f.journal.resolve(f.anchor, [token], [token])).toThrow(
    'GOVERNANCE_PENDING_OWNER_MISMATCH'
  )
  const reopened = ProductionGovernanceJournal.open(f.root, f.dataSetId)
  expect(reopened.pendingTokens(f.anchor)).toEqual([token])
  appendFileSync(f.journal.path, '{"torn":')
  expect(() => ProductionGovernanceJournal.open(f.root, f.dataSetId)).toThrow(
    'GOVERNANCE_TORN_RECORD'
  )
})

it('allows only minimal fixed projections, never a title, body, arbitrary key or unrecognized state', () => {
  const f = fixture()
  expect(() =>
    f.journal.before(f.anchor, { ...f.projection, title: 'not allowed' } as GovernanceProjection)
  ).toThrow()
  expect(() =>
    f.journal.before(f.anchor, {
      ...f.projection,
      values: [1, 'assistant', randomUUID(), 'arbitrary-user-text', 'persistent']
    })
  ).toThrow()
  expect(readFileSync(f.journal.path, 'utf8')).not.toContain('not allowed')
  expect(readFileSync(f.journal.path, 'utf8')).not.toContain('arbitrary-user-text')
  expect(ProductionGovernanceJournal.open(f.root, f.dataSetId).snapshot().projections).toEqual([
    f.projection
  ])
})
