import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import {
  createProductionBackup,
  verifyProductionBackup
} from '../../src/main/data/production-backup.js'
import { initializeProductionDataSet } from '../../src/main/data/production-initialize.js'
import { inspectProductionDataSet } from '../../src/main/data/production-location.js'
import { restoreProductionBackup } from '../../src/main/data/production-restore.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import type { ProductionLease } from '../../src/main/data/production-lease.js'

const roots: string[] = []
const leases: ProductionLease[] = []
afterEach(async () => {
  for (const lease of leases.splice(0)) await lease.release()
  for (const root of roots.splice(0)) {
    if (
      dirname(realpathSync.native(root)) !== realpathSync.native(tmpdir()) ||
      !basename(root).startsWith('mashiro-restore-test-')
    )
      throw new Error('TEST_CLEANUP_SCOPE')
    rmSync(root, { recursive: true, force: true })
  }
})

async function fixture() {
  const root = mkdtempSync(join(realpathSync.native(tmpdir()), 'mashiro-restore-test-'))
  roots.push(root)
  const source = join(root, '当前 数据'),
    backup = join(root, '快照'),
    destination = join(root, '还原 数据')
  for (const path of [source, backup, destination]) mkdirSync(path)
  const initialized = await initializeProductionDataSet(
    source,
    (path) => {
      const store = new SqliteStore(path)
      store.close()
    },
    () => {}
  )
  leases.push(initialized.lease)
  const signal = new AbortController().signal
  const receipt = await createProductionBackup({
    sourceDirectory: source,
    destinationDirectory: backup,
    sourceLease: initialized.lease,
    signal,
    assertQuiescent() {}
  })
  return {
    source,
    backup,
    destination,
    receipt,
    options: { backupDirectory: backup, destinationDirectory: destination, signal }
  }
}

it('restores exact authority into a separate selectable dataset without touching the current data or snapshot', async () => {
  const f = await fixture()
  const original = readFileSync(join(f.source, 'mashiro.sqlite'))
  expect(await restoreProductionBackup(f.options)).toEqual(f.receipt)
  expect(inspectProductionDataSet(f.destination).manifest.dataSetId).toBe(f.receipt.dataSetId)
  expect(readFileSync(join(f.destination, 'mashiro.sqlite'))).toEqual(original)
  expect(readFileSync(join(f.source, 'mashiro.sqlite'))).toEqual(original)
  expect(verifyProductionBackup(f.backup)).toEqual(f.receipt)
})

it('refuses a nonempty destination and corrupt snapshot before copying', async () => {
  const f = await fixture()
  writeFileSync(join(f.destination, 'user.txt'), 'preserve')
  await expect(restoreProductionBackup(f.options)).rejects.toThrow('RESTORE_DESTINATION_NOT_EMPTY')
  expect(readFileSync(join(f.destination, 'user.txt'), 'utf8')).toBe('preserve')
  const empty = join(dirname(f.destination), 'empty')
  mkdirSync(empty)
  writeFileSync(join(f.backup, 'payload', 'mashiro.sqlite'), 'corrupt')
  await expect(
    restoreProductionBackup({ ...f.options, destinationDirectory: empty })
  ).rejects.toThrow()
  expect(existsSync(join(empty, '.mashiro-dataset.json'))).toBe(false)
})

it('cancellation after copy starts leaves an unselectable partial dataset', async () => {
  const f = await fixture()
  const controller = new AbortController()
  const pending = restoreProductionBackup({ ...f.options, signal: controller.signal })
  const timer = setInterval(() => {
    if (existsSync(join(f.destination, '.mashiro-snapshot.json'))) controller.abort()
  }, 0)
  try {
    await expect(pending).rejects.toThrow('RESTORE_CANCELLED')
    expect(() => inspectProductionDataSet(f.destination)).toThrow('SNAPSHOT_RESTORE_REQUIRED')
    expect(verifyProductionBackup(f.backup)).toEqual(f.receipt)
  } finally {
    clearInterval(timer)
  }
})

it('rejects overlapping paths and pre-cancelled work without altering the snapshot', async () => {
  const f = await fixture()
  await expect(
    restoreProductionBackup({ ...f.options, destinationDirectory: join(f.backup, 'payload') })
  ).rejects.toThrow('RESTORE_PATH_OVERLAP')
  await expect(
    restoreProductionBackup({ ...f.options, signal: AbortSignal.abort() })
  ).rejects.toThrow('RESTORE_CANCELLED')
  expect(verifyProductionBackup(f.backup)).toEqual(f.receipt)
  expect(existsSync(join(f.destination, '.mashiro-snapshot.json'))).toBe(false)
})
