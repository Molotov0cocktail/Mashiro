import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
  existsSync
} from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import {
  acquireProductionLease,
  type ProductionLease
} from '../../src/main/data/production-lease.js'
import { recoverProductionLocationLock } from '../../src/main/data/production-location-lock.js'
import { ProductionLocationStore } from '../../src/main/data/production-location.js'
import { initializeProductionDataSet } from '../../src/main/data/production-initialize.js'

const roots: string[] = []
const leases: ProductionLease[] = []
const fixture = () => {
  const root = mkdtempSync(join(realpathSync.native(tmpdir()), 'mashiro-location-lock-'))
  roots.push(root)
  const config = join(root, 'config')
  mkdirSync(config)
  return { root, config, lock: join(config, '.location-write-lock') }
}
afterEach(async () => {
  await Promise.all(leases.splice(0).map((lease) => lease.release()))
  for (const root of roots.splice(0)) {
    const absolute = realpathSync.native(root)
    if (
      dirname(absolute) !== realpathSync.native(tmpdir()) ||
      !basename(absolute).startsWith('mashiro-location-lock-')
    )
      throw new Error('Unowned fixture')
    rmSync(absolute, { recursive: true, force: true })
  }
})

it('recovers an empty abandoned lock under real OS ownership and completes a real locator binding', async () => {
  const { root, config, lock } = fixture()
  mkdirSync(lock)
  const lease = await acquireProductionLease(config, vi.fn())
  leases.push(lease)
  expect(recoverProductionLocationLock(config, lease)).toBe(true)
  expect(recoverProductionLocationLock(config, lease)).toBe(false)
  const data = join(root, '数据 Data')
  mkdirSync(data)
  const initialized = await initializeProductionDataSet(
    data,
    (path) => {
      const db = new DatabaseSync(path)
      try {
        db.exec('CREATE TABLE synthetic(value TEXT)')
      } finally {
        db.close()
      }
    },
    vi.fn()
  )
  leases.push(initialized.lease)
  const locations = new ProductionLocationStore(config, lease)
  locations.bind(data, null, initialized.manifest.dataSetId)
  expect(locations.inspect()).toMatchObject({
    state: 'READY',
    locator: { dataSetId: initialized.manifest.dataSetId }
  })
  expect(existsSync(lock)).toBe(false)
})

it('does not accept a forged or copied lease as authority to clear a lock', async () => {
  const { config, lock } = fixture()
  mkdirSync(lock)
  const real = await acquireProductionLease(config, vi.fn())
  leases.push(real)
  expect(() => recoverProductionLocationLock(config, { ...real })).toThrow('DATA_SET_NOT_OWNED')
  expect(existsSync(lock)).toBe(true)
})

it('does not accept released ownership while another lease now owns the directory', async () => {
  const { config, lock } = fixture()
  const old = await acquireProductionLease(config, vi.fn())
  await old.release()
  leases.push(await acquireProductionLease(config, vi.fn()))
  mkdirSync(lock)
  expect(() => recoverProductionLocationLock(config, old)).toThrow('DATA_SET_NOT_OWNED')
  expect(existsSync(lock)).toBe(true)
})

it('preserves any content found in the reserved lock directory', async () => {
  const { config, lock } = fixture()
  const lease = await acquireProductionLease(config, vi.fn())
  leases.push(lease)
  mkdirSync(lock)
  writeFileSync(join(lock, 'unexpected.txt'), 'preserve')
  expect(() => recoverProductionLocationLock(config, lease)).toThrow('LOCATION_LOCK_NEEDS_RECOVERY')
  expect(readFileSync(join(lock, 'unexpected.txt'), 'utf8')).toBe('preserve')
})

it('does not follow a junction occupying the reserved lock path', async () => {
  const { root, config, lock } = fixture()
  const target = join(root, 'elsewhere')
  mkdirSync(target)
  writeFileSync(join(target, 'retained.txt'), 'preserve')
  const lease = await acquireProductionLease(config, vi.fn())
  leases.push(lease)
  symlinkSync(target, lock, 'junction')
  expect(() => recoverProductionLocationLock(config, lease)).toThrow('LOCATION_LOCK_NEEDS_RECOVERY')
  expect(readFileSync(join(target, 'retained.txt'), 'utf8')).toBe('preserve')
})
