import { randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import {
  createProductionBackup,
  verifyProductionBackup
} from '../../src/main/data/production-backup.js'
import { initializeProductionDataSet } from '../../src/main/data/production-initialize.js'
import type { ProductionLease } from '../../src/main/data/production-lease.js'
import { prepareProductionData } from '../../src/main/data/production-prepare.js'
import { openProductionSession } from '../../src/main/data/production-session.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { removeStewardFixture } from '../integration/retention-legacy-fixture.js'

const roots: string[] = []
const leases: ProductionLease[] = []

afterEach(async () => {
  for (const lease of leases.splice(0)) await lease.release()
  for (const root of roots.splice(0)) {
    if (
      dirname(realpathSync.native(root)) !== realpathSync.native(tmpdir()) ||
      !basename(root).startsWith('mashiro-delivery-review-')
    )
      throw new Error('TEST_CLEANUP_SCOPE')
    rmSync(root, { recursive: true, force: true })
  }
})

async function dataFixture(legacy = false) {
  const root = mkdtempSync(join(realpathSync.native(tmpdir()), 'mashiro-delivery-review-'))
  roots.push(root)
  const source = join(root, '源 数据')
  const destination = join(root, '备份 数据')
  const backupParent = join(root, '升级备份')
  const configuration = join(root, '配置')
  mkdirSync(source)
  mkdirSync(destination)
  mkdirSync(backupParent)
  mkdirSync(configuration)
  const initialized = await initializeProductionDataSet(
    source,
    (path) => {
      const store = new SqliteStore(path)
      if (legacy) {
        removeStewardFixture(store.database)
        store.database.exec('PRAGMA user_version=11')
      }
      store.close()
    },
    () => undefined
  )
  leases.push(initialized.lease)
  return { root, source, destination, backupParent, configuration, initialized }
}

it('rejects an application-domain junction without publishing a completed backup', async () => {
  const f = await dataFixture()
  const redirected = join(f.root, 'redirected-memory')
  mkdirSync(redirected)
  writeFileSync(join(redirected, randomUUID() + '.md.tmp'), 'must not cross directory identity')
  symlinkSync(redirected, join(f.source, 'memory'), 'junction')

  await expect(
    createProductionBackup({
      sourceDirectory: f.source,
      destinationDirectory: f.destination,
      sourceLease: f.initialized.lease,
      signal: new AbortController().signal,
      assertQuiescent() {}
    })
  ).rejects.toThrow('LOCATION_UNSAFE')
  expect(existsSync(join(f.destination, 'backup.json'))).toBe(false)
})

it('keeps source SQL and a verified old snapshot when a source file is deleted after backup', async () => {
  const f = await dataFixture(true)
  const memoryDirectory = join(f.source, 'memory')
  mkdirSync(memoryDirectory)
  const changing = join(memoryDirectory, randomUUID() + '.md.tmp')
  writeFileSync(changing, 'pending body')
  const originalSql = readFileSync(join(f.source, 'mashiro.sqlite'))
  let removed = false

  await expect(
    prepareProductionData({
      dataDirectory: f.source,
      backupParentDirectory: f.backupParent,
      lease: f.initialized.lease,
      signal: new AbortController().signal,
      assertQuiescent() {
        const completed = readdirSync(f.backupParent).some((name) =>
          existsSync(join(f.backupParent, name, 'backup.json'))
        )
        if (completed && !removed) {
          removed = true
          unlinkSync(changing)
        }
      }
    })
  ).rejects.toThrow('PREPARATION_SOURCE_CHANGED')

  expect(readFileSync(join(f.source, 'mashiro.sqlite'))).toEqual(originalSql)
  const backup = readdirSync(f.backupParent)
  expect(backup).toHaveLength(1)
  expect(verifyProductionBackup(join(f.backupParent, backup[0]!)).schemaVersion).toBe(11)
  expect(readdirSync(f.source).some((name) => name.startsWith('.mashiro-upgrade-'))).toBe(false)
})

it('cannot bind a verified backup payload through the ordinary existing-data selection path', async () => {
  const f = await dataFixture()
  await createProductionBackup({
    sourceDirectory: f.source,
    destinationDirectory: f.destination,
    sourceLease: f.initialized.lease,
    signal: new AbortController().signal,
    assertQuiescent() {}
  })
  expect(verifyProductionBackup(f.destination).dataSetId).toBe(f.initialized.manifest.dataSetId)
  const prepareExisting = vi.fn()

  await expect(
    openProductionSession({
      configurationDirectory: f.configuration,
      async choose() {
        return { action: 'select', directory: join(f.destination, 'payload') }
      },
      prepareExisting,
      onOwnershipLost() {}
    })
  ).rejects.toThrow('SNAPSHOT_RESTORE_REQUIRED')
  expect(prepareExisting).not.toHaveBeenCalled()
  expect(existsSync(join(f.configuration, 'location.json'))).toBe(false)
})
