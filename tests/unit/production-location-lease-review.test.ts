import { randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it, vi } from 'vitest'
import {
  acquireProductionLease,
  type ProductionLease
} from '../../src/main/data/production-lease.js'
import { recoverProductionLocationLock } from '../../src/main/data/production-location-lock.js'
import { ProductionLocationStore } from '../../src/main/data/production-location.js'

const fault = vi.hoisted(() => ({ locationLockCleanup: false }))
vi.mock('node:fs', async (original) => {
  const actual = await original<typeof import('node:fs')>()
  return {
    ...actual,
    rmdirSync: (...args: Parameters<typeof actual.rmdirSync>) => {
      if (fault.locationLockCleanup && String(args[0]).endsWith('.location-write-lock')) {
        fault.locationLockCleanup = false
        throw new Error('synthetic post-commit location lock cleanup failure')
      }
      return actual.rmdirSync(...args)
    }
  }
})

const roots: string[] = []
const leases: ProductionLease[] = []

function fixture() {
  const root = mkdtempSync(join(realpathSync.native(tmpdir()), 'mashiro-location-lease-review-'))
  roots.push(root)
  const config = join(root, 'config')
  const otherConfig = join(root, 'other-config')
  const data = join(root, 'data')
  mkdirSync(config)
  mkdirSync(otherConfig)
  mkdirSync(data)
  const dataSetId = randomUUID()
  const database = new DatabaseSync(join(data, 'mashiro.sqlite'))
  try {
    database.exec('CREATE TABLE synthetic(value TEXT)')
  } finally {
    database.close()
  }
  writeFileSync(
    join(data, '.mashiro-dataset.json'),
    JSON.stringify({
      formatVersion: 1,
      dataSetId,
      state: 'READY',
      createdAt: new Date().toISOString()
    })
  )
  return {
    root,
    config,
    otherConfig,
    data,
    dataSetId,
    locator: join(config, 'location.json'),
    lock: join(config, '.location-write-lock')
  }
}

async function acquire(path: string): Promise<ProductionLease> {
  const lease = await acquireProductionLease(path, vi.fn())
  leases.push(lease)
  return lease
}

afterEach(async () => {
  fault.locationLockCleanup = false
  await Promise.all(leases.splice(0).map((lease) => lease.release()))
  for (const root of roots.splice(0)) {
    const resolved = realpathSync.native(root)
    if (
      dirname(resolved) !== realpathSync.native(tmpdir()) ||
      !basename(resolved).startsWith('mashiro-location-lease-review-')
    )
      throw new Error('UNOWNED_TEST_ROOT')
    rmSync(resolved, { recursive: true, force: true })
  }
})

it('performs zero locator writes with a missing, forged, released, or wrong-directory lease', async () => {
  const f = fixture()

  expect(() => new ProductionLocationStore(f.config).bind(f.data, null, f.dataSetId)).toThrow(
    'CONFIGURATION_LEASE_REQUIRED'
  )

  const real = await acquire(f.config)
  const forged = { dataPath: real.dataPath, release: real.release } as ProductionLease
  expect(() =>
    new ProductionLocationStore(f.config, forged).bind(f.data, null, f.dataSetId)
  ).toThrow('DATA_SET_NOT_OWNED')

  await real.release()
  expect(() => new ProductionLocationStore(f.config, real).bind(f.data, null, f.dataSetId)).toThrow(
    'DATA_SET_NOT_OWNED'
  )

  const wrongDirectory = await acquire(f.otherConfig)
  expect(() =>
    new ProductionLocationStore(f.config, wrongDirectory).bind(f.data, null, f.dataSetId)
  ).toThrow('DATA_SET_NOT_OWNED')

  expect(existsSync(f.locator)).toBe(false)
  expect(existsSync(f.lock)).toBe(false)
})

it('does not let a second owner acquire and recover an active owner lock', async () => {
  const f = fixture()
  const owner = await acquire(f.config)
  mkdirSync(f.lock)

  await expect(acquireProductionLease(f.config, vi.fn())).rejects.toThrow('DATA_SET_IN_USE')
  expect(existsSync(f.lock)).toBe(true)
  expect(recoverProductionLocationLock(f.config, owner)).toBe(true)
  expect(existsSync(f.lock)).toBe(false)
})

it('keeps relocation read-only when no live configuration lease is supplied', async () => {
  const f = fixture()
  const owner = await acquire(f.config)
  const writer = new ProductionLocationStore(f.config, owner)
  writer.bind(f.data, null, f.dataSetId)
  const before = readFileSync(f.locator)
  await owner.release()
  const moved = join(f.root, 'moved-data')
  renameSync(f.data, moved)
  const reader = new ProductionLocationStore(f.config)
  const recovery = reader.inspect()
  const fingerprint = recovery.fingerprint
  if (!fingerprint) throw new Error('EXPECTED_LOCATOR_FINGERPRINT')

  expect(() => reader.relocate(moved, fingerprint)).toThrow('CONFIGURATION_LEASE_REQUIRED')
  expect(readFileSync(f.locator)).toEqual(before)
})

it('returns the committed locator when lock cleanup fails and permits owned recovery', async () => {
  const f = fixture()
  const owner = await acquire(f.config)
  const store = new ProductionLocationStore(f.config, owner)
  fault.locationLockCleanup = true

  const locator = store.bind(f.data, null, f.dataSetId)

  expect(locator).toMatchObject({ dataSetId: f.dataSetId, dataPath: f.data })
  expect(JSON.parse(readFileSync(f.locator, 'utf8'))).toEqual(locator)
  expect(store.inspect()).toMatchObject({ state: 'READY', locator })
  expect(existsSync(f.lock)).toBe(true)
  expect(recoverProductionLocationLock(f.config, owner)).toBe(true)
  expect(existsSync(f.lock)).toBe(false)
})
