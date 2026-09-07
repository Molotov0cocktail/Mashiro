import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  realpathSync,
  writeFileSync
} from 'node:fs'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { initializeProductionDataSet } from '../../src/main/data/production-initialize.js'
import {
  acquireProductionLease,
  type ProductionLease
} from '../../src/main/data/production-lease.js'
import { inspectProductionDataSet } from '../../src/main/data/production-location.js'

vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>()
  return { ...fs, renameSync: vi.fn(fs.renameSync) }
})
vi.mock('node:crypto', async (original) => {
  const crypto = await original<typeof import('node:crypto')>()
  return { ...crypto, randomUUID: vi.fn(crypto.randomUUID) }
})
const roots: string[] = []
const leases: ProductionLease[] = []
const makeRoot = () => {
  const root = mkdtempSync(join(realpathSync.native(tmpdir()), 'mashiro-initialize-'))
  roots.push(root)
  return root
}
const initializeDatabase = (path: string): void => {
  const database = new DatabaseSync(path)
  try {
    database.exec("CREATE TABLE synthetic(value TEXT); INSERT INTO synthetic VALUES ('preserve')")
  } finally {
    database.close()
  }
}
afterEach(async () => {
  await Promise.all(leases.splice(0).map((lease) => lease.release()))
  for (const root of roots.splice(0)) {
    const absolute = realpathSync.native(root)
    if (
      dirname(absolute) !== realpathSync.native(tmpdir()) ||
      !basename(absolute).startsWith('mashiro-initialize-')
    )
      throw new Error('Unowned fixture')
    rmSync(absolute, { recursive: true, force: true })
  }
})

it('creates a ready identity only after initialization and retains ownership for startup', async () => {
  const root = makeRoot()
  const initialized = await initializeProductionDataSet(root, initializeDatabase, vi.fn())
  leases.push(initialized.lease)
  expect(initialized.manifest.state).toBe('READY')
  expect(inspectProductionDataSet(root, initialized.manifest.dataSetId)).toMatchObject({
    manifest: initialized.manifest
  })
  await expect(acquireProductionLease(root, vi.fn())).rejects.toThrow('DATA_SET_IN_USE')
  const before = readFileSync(join(root, 'mashiro.sqlite'))
  await initialized.lease.release()
  await expect(initializeProductionDataSet(root, initializeDatabase, vi.fn())).rejects.toThrow(
    'DATA_SET_NOT_EMPTY'
  )
  expect(readFileSync(join(root, 'mashiro.sqlite'))).toEqual(before)
})

it('does not overwrite an existing selected directory or call the initializer', async () => {
  const root = makeRoot()
  writeFileSync(join(root, '用户资料.txt'), 'preserve')
  const initialize = vi.fn()
  await expect(initializeProductionDataSet(root, initialize, vi.fn())).rejects.toThrow(
    'DATA_SET_NOT_EMPTY'
  )
  expect(initialize).not.toHaveBeenCalled()
  expect(readdirSync(root)).toEqual(['用户资料.txt'])
})

it('preserves a partial database and PREPARING marker on initialization failure without locking recovery out', async () => {
  const root = makeRoot()
  await expect(
    initializeProductionDataSet(
      root,
      (path) => {
        initializeDatabase(path)
        throw new Error('synthetic initialization failure')
      },
      vi.fn()
    )
  ).rejects.toThrow('synthetic initialization failure')
  expect(JSON.parse(readFileSync(join(root, '.mashiro-dataset.json'), 'utf8')).state).toBe(
    'PREPARING'
  )
  expect(readFileSync(join(root, 'mashiro.sqlite')).subarray(0, 16).toString()).toBe(
    'SQLite format 3\0'
  )
  leases.push(await acquireProductionLease(root, vi.fn()))
  expect(() => inspectProductionDataSet(root)).toThrow('DATA_SET_IDENTITY_MISMATCH')
})

it('does not accept a non-SQLite initializer result', async () => {
  const root = makeRoot()
  await expect(
    initializeProductionDataSet(root, (path) => writeFileSync(path, 'invalid'), vi.fn())
  ).rejects.toThrow('DATA_SET_DATABASE_INVALID')
  expect(JSON.parse(readFileSync(join(root, '.mashiro-dataset.json'), 'utf8')).state).toBe(
    'PREPARING'
  )
})

it('preserves PREPARING and removes only its owned temporary file when finalization fails', async () => {
  const root = makeRoot()
  vi.mocked(renameSync).mockImplementationOnce(() => {
    throw new Error('synthetic rename failure')
  })
  await expect(initializeProductionDataSet(root, initializeDatabase, vi.fn())).rejects.toThrow(
    'synthetic rename failure'
  )
  expect(JSON.parse(readFileSync(join(root, '.mashiro-dataset.json'), 'utf8')).state).toBe(
    'PREPARING'
  )
  expect(readdirSync(root).sort()).toEqual(['.mashiro-dataset.json', 'mashiro.sqlite'])
  leases.push(await acquireProductionLease(root, vi.fn()))
})

it('does not delete a colliding finalization file it did not create', async () => {
  const root = makeRoot()
  const fixed = 'ab65027d-cf71-4b3c-a712-7587c5b1d731'
  vi.mocked(randomUUID).mockReturnValueOnce(fixed).mockReturnValueOnce(fixed)
  const collision = join(root, '.mashiro-finalize-' + fixed + '.tmp')
  await expect(
    initializeProductionDataSet(
      root,
      (path) => {
        initializeDatabase(path)
        writeFileSync(collision, 'external addition')
      },
      vi.fn()
    )
  ).rejects.toThrow()
  expect(readFileSync(collision, 'utf8')).toBe('external addition')
  expect(JSON.parse(readFileSync(join(root, '.mashiro-dataset.json'), 'utf8')).state).toBe(
    'PREPARING'
  )
})
