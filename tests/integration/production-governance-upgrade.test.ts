import { mkdirSync, mkdtempSync, realpathSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, basename } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it, vi } from 'vitest'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { initializeProductionDataSet } from '../../src/main/data/production-initialize.js'
import { acquireProductionLease } from '../../src/main/data/production-lease.js'
import { ProductionGovernanceIndex } from '../../src/main/data/production-governance-index.js'
import { ProductionGovernanceJournal } from '../../src/main/data/production-governance-journal.js'
import { anchorFor } from '../../src/main/data/production-governance-lifecycle.js'
import { readGovernanceBaseline } from '../../src/main/data/production-governance-connection.js'
import { prepareProductionData } from '../../src/main/data/production-prepare.js'
import { authorizeProductionGovernanceMigration } from '../../src/main/data/production-governance-migration.js'

it('real prepare upgrades a governed schema17 with a durable new instance anchor and unchanged old backup', async () => {
  const root = mkdtempSync(join(realpathSync.native(tmpdir()), 'mashiro-governance-upgrade-'))
  const data = join(root, '数据'),
    config = join(root, '配置'),
    backups = join(root, '备份')
  for (const p of [data, config, backups]) mkdirSync(p)
  const initialized = await initializeProductionDataSet(
    data,
    (path) => {
      const store = new SqliteStore(path)
      store.database.exec('DROP TABLE memory_round_evidence; PRAGMA user_version=17')
      store.close()
    },
    () => {}
  )
  const lease = await acquireProductionLease(config, () => {})
  try {
    const index = new ProductionGovernanceIndex(config, lease),
      path = join(data, 'mashiro.sqlite')
    const raw = new DatabaseSync(path)
    const beforeAnchor = anchorFor(path, raw)
    const journal = index.initialize(
      initialized.manifest.dataSetId,
      data,
      beforeAnchor,
      readGovernanceBaseline(raw)
    )
    raw.close()
    const before = readFileSync(path)
    const result = await prepareProductionData({
      dataDirectory: data,
      backupParentDirectory: backups,
      lease: initialized.lease,
      signal: new AbortController().signal,
      assertQuiescent() {},
      authorizeReplacement(candidate) {
        authorizeProductionGovernanceMigration(
          index,
          initialized.manifest.dataSetId,
          data,
          candidate,
          () => {}
        )
      }
    })
    expect(result).toMatchObject({ state: 'MIGRATED', fromVersion: 17, toVersion: 18 })
    expect(readFileSync(join(result.backupDirectory!, 'payload', 'mashiro.sqlite'))).toEqual(before)
    const after = new SqliteStore(path)
    try {
      const anchor = anchorFor(path, after.database)
      expect(anchor.inode).not.toBe(beforeAnchor.inode)
      expect(anchor.instanceId).not.toBe(beforeAnchor.instanceId)
      expect(() => journal.assertAnchor(beforeAnchor)).not.toThrow()
      expect(() =>
        new ProductionGovernanceIndex(config, lease)
          .known(initialized.manifest.dataSetId)!
          .assertAnchor(anchor)
      ).not.toThrow()
      expect(
        after.database
          .prepare("SELECT name FROM sqlite_master WHERE name='memory_round_evidence'")
          .get()
      ).toBeTruthy()
    } finally {
      after.close()
    }
  } finally {
    await lease.release()
    await initialized.lease.release()
    if (
      dirname(realpathSync.native(root)) !== realpathSync.native(tmpdir()) ||
      !basename(root).startsWith('mashiro-governance-upgrade-')
    )
      rejectUnownedRoot()
    rmSync(root, { recursive: true, force: true })
  }
})

it('an approved imported PREPARING seed recovers after journal creation fails, while READY never repairs a lost ledger', async () => {
  const root = mkdtempSync(join(realpathSync.native(tmpdir()), 'mashiro-governance-upgrade-'))
  const data = join(root, '数据'),
    config = join(root, '配置')
  mkdirSync(data)
  mkdirSync(config)
  const initialized = await initializeProductionDataSet(
    data,
    (path) => {
      const store = new SqliteStore(path)
      store.close()
    },
    () => {}
  )
  const lease = await acquireProductionLease(config, () => {})
  try {
    const index = new ProductionGovernanceIndex(config, lease)
    const raw = new DatabaseSync(join(data, 'mashiro.sqlite'))
    const anchor = anchorFor(join(data, 'mashiro.sqlite'), raw),
      baseline = readGovernanceBaseline(raw)
    raw.close()
    const create = vi.spyOn(ProductionGovernanceJournal, 'create').mockImplementationOnce(() => {
      throw Error('SYNTHETIC_CRASH_BEFORE_JOURNAL')
    })
    expect(() =>
      index.importVerified(
        initialized.manifest.dataSetId,
        data,
        anchor,
        baseline,
        anchor.instanceId
      )
    ).toThrow('SYNTHETIC_CRASH')
    create.mockRestore()
    const resumed = new ProductionGovernanceIndex(config, lease).known(
      initialized.manifest.dataSetId
    )!
    expect(resumed.snapshot().projections).toEqual(baseline)
    expect(resumed.journalId).toBe(anchor.instanceId)
    const log = join(
      config,
      'governance',
      'governance-' + initialized.manifest.dataSetId + '.jsonl'
    )
    rmSync(log)
    expect(() =>
      new ProductionGovernanceIndex(config, lease).known(initialized.manifest.dataSetId)
    ).toThrow()
  } finally {
    vi.restoreAllMocks()
    await lease.release()
    await initialized.lease.release()
    if (
      dirname(realpathSync.native(root)) !== realpathSync.native(tmpdir()) ||
      !basename(root).startsWith('mashiro-governance-upgrade-')
    )
      rejectUnownedRoot()
    rmSync(root, { recursive: true, force: true })
  }
})

function rejectUnownedRoot(): never {
  throw Error('UNOWNED_ROOT')
}
