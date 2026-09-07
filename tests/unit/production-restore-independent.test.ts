import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { createProductionBackup } from '../../src/main/data/production-backup.js'
import { initializeProductionDataSet } from '../../src/main/data/production-initialize.js'
import {
  acquireProductionLease,
  type ProductionLease
} from '../../src/main/data/production-lease.js'
import { inspectProductionDataSet } from '../../src/main/data/production-location.js'
import { restoreProductionBackup } from '../../src/main/data/production-restore.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'

const roots: string[] = []
const leases: ProductionLease[] = []

afterEach(async () => {
  await Promise.all(leases.splice(0).map((lease) => lease.release()))
  for (const root of roots.splice(0)) {
    const absolute = realpathSync.native(root)
    if (
      dirname(absolute) !== realpathSync.native(tmpdir()) ||
      !basename(absolute).startsWith('mashiro-restore-independent-')
    )
      throw new Error('TEST_CLEANUP_SCOPE')
    rmSync(absolute, { recursive: true, force: true })
  }
})

async function fixture() {
  const root = mkdtempSync(join(realpathSync.native(tmpdir()), 'mashiro-restore-independent-'))
  roots.push(root)
  const source = join(root, 'current')
  const backup = join(root, 'backup')
  const destination = join(root, 'restored')
  for (const directory of [source, backup, destination]) mkdirSync(directory)
  const initialized = await initializeProductionDataSet(
    source,
    (databasePath) => {
      const store = new SqliteStore(databasePath)
      store.close()
    },
    vi.fn()
  )
  leases.push(initialized.lease)
  const receipt = await createProductionBackup({
    sourceDirectory: source,
    destinationDirectory: backup,
    sourceLease: initialized.lease,
    signal: new AbortController().signal,
    assertQuiescent: vi.fn()
  })
  return { root, backup, destination, receipt }
}

it('requires exclusive leases on both the backup and destination before restoring any bytes', async () => {
  const f = await fixture()
  const backupLease = await acquireProductionLease(f.backup, vi.fn())
  await expect(
    restoreProductionBackup({
      backupDirectory: f.backup,
      destinationDirectory: f.destination,
      signal: new AbortController().signal
    })
  ).rejects.toThrow('DATA_SET_IN_USE')
  expect(existsSync(join(f.destination, '.mashiro-snapshot.json'))).toBe(false)
  await backupLease.release()

  const destinationLease = await acquireProductionLease(f.destination, vi.fn())
  await expect(
    restoreProductionBackup({
      backupDirectory: f.backup,
      destinationDirectory: f.destination,
      signal: new AbortController().signal
    })
  ).rejects.toThrow('DATA_SET_IN_USE')
  expect(existsSync(join(f.destination, '.mashiro-snapshot.json'))).toBe(false)
  await destinationLease.release()

  await expect(
    restoreProductionBackup({
      backupDirectory: f.backup,
      destinationDirectory: f.destination,
      signal: new AbortController().signal
    })
  ).resolves.toEqual(f.receipt)
  expect(inspectProductionDataSet(f.destination).manifest.dataSetId).toBe(f.receipt.dataSetId)
})

it('rejects a destination junction before it can become a restored dataset', async () => {
  const f = await fixture()
  const actual = join(f.root, 'actual-target')
  const alias = join(f.root, 'target-alias')
  mkdirSync(actual)
  symlinkSync(actual, alias, 'junction')

  await expect(
    restoreProductionBackup({
      backupDirectory: f.backup,
      destinationDirectory: alias,
      signal: new AbortController().signal
    })
  ).rejects.toThrow('LOCATION_UNSAFE')
  expect(existsSync(join(actual, '.mashiro-snapshot.json'))).toBe(false)
  expect(existsSync(join(actual, '.mashiro-dataset.json'))).toBe(false)
})
