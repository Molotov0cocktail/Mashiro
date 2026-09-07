import { randomUUID } from 'node:crypto'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it } from 'vitest'
import {
  openProductionSession,
  type ProductionSession
} from '../../src/main/data/production-session.js'
import { prepareProductionData } from '../../src/main/data/production-prepare.js'
import { initializeProductionDataSet } from '../../src/main/data/production-initialize.js'
import { ProductionGovernanceJournal } from '../../src/main/data/production-governance-journal.js'
import { anchorFor } from '../../src/main/data/production-governance-lifecycle.js'
import { readGovernanceBaseline } from '../../src/main/data/production-governance-connection.js'
import { ProductionGovernanceIndex } from '../../src/main/data/production-governance-index.js'
import { acquireProductionLease } from '../../src/main/data/production-lease.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { restoreProductionAtStartup } from '../../src/main/data/production-startup-restore.js'
import { inspectProductionDataSet } from '../../src/main/data/production-location.js'
import { removeRetentionPolicyFixture } from './governance-legacy-fixture.js'

const roots: string[] = []
const sessions: ProductionSession[] = []
afterEach(async () => {
  for (const session of sessions.splice(0)) await session.release()
  for (const root of roots.splice(0)) {
    const actual = realpathSync.native(root)
    if (
      dirname(actual) !== realpathSync.native(tmpdir()) ||
      !basename(actual).startsWith('mashiro-review014-')
    )
      throw Error('UNOWNED_ROOT')
    rmSync(actual, { recursive: true, force: true })
  }
})
function fixture() {
  const root = mkdtempSync(join(realpathSync.native(tmpdir()), 'mashiro-review014-'))
  roots.push(root)
  const config = join(root, '配置'),
    data = join(root, '数据'),
    backups = join(root, '备份')
  for (const path of [config, data, backups]) mkdirSync(path)
  const open = async (create = false) => {
    const session = await openProductionSession({
      configurationDirectory: config,
      choose: async () => ({ action: create ? 'create' : 'select', directory: data }),
      prepareExisting: async (_path, directory, signal, lease, authorizeReplacement) => {
        await prepareProductionData({
          dataDirectory: directory,
          backupParentDirectory: backups,
          signal,
          lease,
          authorizeReplacement,
          assertQuiescent() {}
        })
      },
      onOwnershipLost() {}
    })
    if (!session) throw Error('NO_SESSION')
    sessions.push(session)
    return session
  }
  return { root, config, data, backups, open }
}

it('review014: real session selection migrates governed17 to19 and a second real session preserves a later committed tombstone', async () => {
  const f = fixture()
  const initialized = await initializeProductionDataSet(
    f.data,
    (path) => {
      const store = new SqliteStore(path)
      try {
        removeRetentionPolicyFixture(store.database)
        store.database.exec('DROP TABLE memory_round_evidence; PRAGMA user_version=17')
      } finally {
        store.close()
      }
    },
    () => {}
  )
  const lease = await acquireProductionLease(f.config, () => {})
  const raw = new DatabaseSync(join(f.data, 'mashiro.sqlite'))
  try {
    new ProductionGovernanceIndex(f.config, lease).initialize(
      initialized.manifest.dataSetId,
      f.data,
      anchorFor(join(f.data, 'mashiro.sqlite'), raw),
      readGovernanceBaseline(raw)
    )
  } finally {
    raw.close()
    await lease.release()
    await initialized.lease.release()
  }
  const first = await f.open()
  const store = new SqliteStore(first.databasePath)
  const id = randomUUID()
  try {
    expect(store.database.prepare('PRAGMA user_version').get()!.user_version).toBe(19)
    store.database.prepare("INSERT INTO item_tombstones VALUES('proposal',?)").run(id)
  } finally {
    store.close()
  }
  await first.release()
  const second = await f.open()
  expect(second.dataSetId).toBe(first.dataSetId)
  const reopened = new SqliteStore(second.databasePath)
  try {
    expect(reopened.database.prepare('SELECT id FROM item_tombstones WHERE id=?').get(id)?.id).toBe(
      id
    )
  } finally {
    reopened.close()
  }
})

it('review014: a full session reopens committed and rolled-back pending tokens without guessing row state', async () => {
  const f = fixture(),
    first = await f.open(true)
  await first.release()
  const raw = new DatabaseSync(first.databasePath)
  const journal = ProductionGovernanceJournal.open(join(f.config, 'governance'), first.dataSetId)
  const anchor = anchorFor(first.databasePath, raw)
  const committedId = randomUUID(),
    rolledBackId = randomUUID()
  const committed = journal.before(anchor, {
    table: 'item_tombstones',
    keys: ['proposal', committedId],
    values: [],
    deleted: false
  })
  journal.before(anchor, {
    table: 'item_tombstones',
    keys: ['proposal', rolledBackId],
    values: [],
    deleted: false
  })
  try {
    raw.exec('BEGIN IMMEDIATE')
    raw.prepare("INSERT INTO item_tombstones VALUES('proposal',?)").run(committedId)
    raw.prepare('INSERT INTO production_governance_commits VALUES(?)').run(committed)
    raw.exec('COMMIT')
  } finally {
    raw.close()
  }
  expect(() => journal.snapshot()).toThrow('GOVERNANCE_STATE_UNCERTAIN')
  await f.open()
  const snapshot = ProductionGovernanceJournal.open(
    join(f.config, 'governance'),
    first.dataSetId
  ).snapshot()
  expect(snapshot.projections.some((p) => p.keys.includes(committedId))).toBe(true)
  expect(snapshot.projections.some((p) => p.keys.includes(rolledBackId))).toBe(false)
})

it('review014: a damaged ready ledger blocks restore, preserves original locator and backup bytes, and leaves the destination unopenable', async () => {
  const f = fixture(),
    session = await f.open(true)
  const backup = join(f.backups, '完整'),
    target = join(f.root, '恢复')
  mkdirSync(backup)
  mkdirSync(target)
  const receipt = await session.backup(backup, () => {})
  const before = readFileSync(session.databasePath),
    locator = readFileSync(join(f.config, 'location.json'))
  const backupBefore = readFileSync(join(backup, 'payload', 'mashiro.sqlite'))
  appendFileSync(
    join(f.config, 'governance', 'governance-' + session.dataSetId + '.jsonl'),
    '{"torn":'
  )
  await expect(session.restore(backup, target, receipt, () => {})).rejects.toThrow(
    'GOVERNANCE_TORN_RECORD'
  )
  await session.release()
  const choices = [backup, target]
  await expect(
    restoreProductionAtStartup(
      {
        showMessageBox: async () => ({ response: 1 }),
        showOpenDialog: async () => ({ canceled: false, filePaths: [choices.shift()!] })
      },
      f.config
    )
  ).rejects.toThrow('GOVERNANCE_TORN_RECORD')
  expect(readFileSync(join(target, '.mashiro-snapshot.json'), 'utf8')).toContain(receipt.backupId)
  expect(() => inspectProductionDataSet(target)).toThrow()
  expect(readFileSync(session.databasePath)).toEqual(before)
  expect(readFileSync(join(f.config, 'location.json'))).toEqual(locator)
  expect(readFileSync(join(backup, 'payload', 'mashiro.sqlite'))).toEqual(backupBefore)
}, 15000)
