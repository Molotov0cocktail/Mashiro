import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { openProductionSession } from '../../src/main/data/production-session.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { acquireProductionLease } from '../../src/main/data/production-lease.js'
import { ProductionGovernanceIndex } from '../../src/main/data/production-governance-index.js'
import { governRestoredProductionCopy } from '../../src/main/data/production-governance-restore.js'
import { restoreProductionBackup } from '../../src/main/data/production-restore.js'

it('an explicitly verified portable full backup imports its governance into a genuinely new configuration', async () => {
  const root = mkdtempSync(join(realpathSync.native(tmpdir()), 'mashiro-gov-portable-'))
  const config = join(root, '原配置'),
    other = join(root, '新配置'),
    data = join(root, '原数据'),
    target = join(root, '导入'),
    backup = join(root, '备份')
  for (const path of [config, other, data, target, backup]) mkdirSync(path)
  const source = await openProductionSession({
    configurationDirectory: config,
    choose: async () => ({ action: 'create', directory: data }),
    prepareExisting: async () => {},
    onOwnershipLost: () => {}
  })
  if (!source) throw Error('NO_SESSION')
  let imported: Awaited<ReturnType<typeof openProductionSession>> = null
  try {
    const store = new SqliteStore(source.databasePath),
      id = randomUUID()
    store.database.prepare("INSERT INTO item_tombstones VALUES('proposal',?)").run(id)
    store.close()
    const receipt = await source.backup(backup, () => {})
    expect(receipt.files.map((file) => file.path)).toContain('.mashiro-governance-backup.json')
    const lease = await acquireProductionLease(other, () => {})
    try {
      const index = new ProductionGovernanceIndex(other, lease)
      await restoreProductionBackup({
        backupDirectory: backup,
        destinationDirectory: target,
        expectedReceipt: receipt,
        signal: new AbortController().signal,
        governCopy: (directory, snapshot, check) =>
          governRestoredProductionCopy(index, snapshot.dataSetId, directory, check)
      })
      expect(
        index
          .known(source.dataSetId)!
          .snapshot()
          .projections.some((p) => p.table === 'item_tombstones' && p.keys[1] === id)
      ).toBe(true)
    } finally {
      await lease.release()
    }
    imported = await openProductionSession({
      configurationDirectory: other,
      choose: async () => ({ action: 'select', directory: target }),
      prepareExisting: async () => {},
      onOwnershipLost: () => {}
    })
    expect(imported?.dataSetId).toBe(source.dataSetId)
  } finally {
    await imported?.release()
    await source.release()
    const actual = realpathSync.native(root)
    if (
      dirname(actual) !== realpathSync.native(tmpdir()) ||
      !basename(actual).startsWith('mashiro-gov-portable-')
    )
      rejectUnownedRoot()
    rmSync(actual, { recursive: true, force: true })
  }
})

function rejectUnownedRoot(): never {
  throw Error('UNOWNED_ROOT')
}
