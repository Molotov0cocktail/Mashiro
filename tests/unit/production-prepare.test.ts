import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it } from 'vitest'
import { initializeProductionDataSet } from '../../src/main/data/production-initialize.js'
import { prepareProductionData } from '../../src/main/data/production-prepare.js'
import { verifyProductionBackup } from '../../src/main/data/production-backup.js'
import { schemaVersion } from '../../src/main/data/schema.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import type { ProductionLease } from '../../src/main/data/production-lease.js'
import { removeStewardFixture } from '../integration/retention-legacy-fixture.js'

const roots: string[] = [],
  leases: ProductionLease[] = []
afterEach(async () => {
  for (const lease of leases.splice(0)) await lease.release()
  for (const root of roots.splice(0)) {
    if (
      dirname(realpathSync.native(root)) !== realpathSync.native(tmpdir()) ||
      !basename(root).startsWith('mashiro-prepare-test-')
    )
      throw new Error('TEST_CLEANUP_SCOPE')
    rmSync(root, { recursive: true, force: true })
  }
})

async function fixture(legacy = true) {
  const root = mkdtempSync(join(realpathSync.native(tmpdir()), 'mashiro-prepare-test-'))
  roots.push(root)
  const dataDirectory = join(root, '数据'),
    backupParentDirectory = join(root, '备份')
  mkdirSync(dataDirectory)
  mkdirSync(backupParentDirectory)
  const initialized = await initializeProductionDataSet(
    dataDirectory,
    (path) => {
      const store = new SqliteStore(path)
      store.database
        .prepare("INSERT INTO memory_suppressions VALUES('round',?,1,'withdrawal',?)")
        .run('old-user-round', 'old-deletion')
      if (legacy) {
        removeStewardFixture(store.database)
        store.database.exec('PRAGMA user_version=11')
      }
      store.close()
    },
    () => {}
  )
  leases.push(initialized.lease)
  return {
    root,
    dataDirectory,
    backupParentDirectory,
    lease: initialized.lease,
    signal: new AbortController().signal,
    assertQuiescent() {}
  }
}

it('verifies a complete old-version backup before atomically installing migrated SQL', async () => {
  const f = await fixture()
  const old = readFileSync(join(f.dataDirectory, 'mashiro.sqlite'))
  const result = await prepareProductionData(f)
  expect(result).toMatchObject({ state: 'MIGRATED', fromVersion: 11, toVersion: schemaVersion })
  expect(result.backupDirectory).not.toBeNull()
  const receipt = verifyProductionBackup(result.backupDirectory!)
  expect(receipt.schemaVersion).toBe(11)
  expect(readFileSync(join(result.backupDirectory!, 'payload', 'mashiro.sqlite'))).toEqual(old)
  const current = new DatabaseSync(join(f.dataDirectory, 'mashiro.sqlite'), { readOnly: true })
  try {
    expect(current.prepare('PRAGMA user_version').get()?.user_version).toBe(schemaVersion)
    expect(current.prepare('SELECT object_id FROM memory_suppressions').get()?.object_id).toBe(
      'old-deletion'
    )
  } finally {
    current.close()
  }
  expect(readdirSync(f.dataDirectory).some((name) => name.startsWith('.mashiro-upgrade-'))).toBe(
    false
  )
})

it('keeps original SQL byte-identical when a historical schema cannot migrate', async () => {
  const f = await fixture()
  const database = new DatabaseSync(join(f.dataDirectory, 'mashiro.sqlite'))
  database.exec('CREATE TABLE steward_configs(unexpected TEXT)')
  database.close()
  const before = readFileSync(join(f.dataDirectory, 'mashiro.sqlite'))
  await expect(prepareProductionData(f)).rejects.toThrow()
  expect(readFileSync(join(f.dataDirectory, 'mashiro.sqlite'))).toEqual(before)
  const backups = readdirSync(f.backupParentDirectory)
  expect(backups).toHaveLength(1)
  expect(verifyProductionBackup(join(f.backupParentDirectory, backups[0]!)).schemaVersion).toBe(11)
  expect(readdirSync(f.dataDirectory).some((name) => name.startsWith('.mashiro-upgrade-'))).toBe(
    false
  )
})

it('rejects a future schema without making a backup or changing the original', async () => {
  const f = await fixture(false)
  const database = new DatabaseSync(join(f.dataDirectory, 'mashiro.sqlite'))
  database.exec('PRAGMA user_version=' + (schemaVersion + 1))
  database.close()
  const before = readFileSync(join(f.dataDirectory, 'mashiro.sqlite'))
  await expect(prepareProductionData(f)).rejects.toThrow('PREPARATION_SCHEMA_UNSUPPORTED')
  expect(readFileSync(join(f.dataDirectory, 'mashiro.sqlite'))).toEqual(before)
  expect(readdirSync(f.backupParentDirectory)).toHaveLength(0)
})

it('opens the current version without an unnecessary snapshot and honours pre-open cancellation', async () => {
  const f = await fixture(false)
  await expect(prepareProductionData({ ...f, signal: AbortSignal.abort() })).rejects.toThrow(
    'PREPARATION_CANCELLED'
  )
  expect(await prepareProductionData(f)).toMatchObject({ state: 'CURRENT', backupDirectory: null })
  expect(readdirSync(f.backupParentDirectory)).toHaveLength(0)
  expect(existsSync(join(f.dataDirectory, '.mashiro-dataset.json'))).toBe(true)
})
