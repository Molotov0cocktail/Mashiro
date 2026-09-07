import { mkdtempSync, mkdirSync, rmSync, realpathSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import {
  acquireProductionLease,
  type ProductionLease
} from '../../src/main/data/production-lease.js'

const roots: string[] = []
const leases: ProductionLease[] = []
const makeRoot = (): string => {
  const path = mkdtempSync(join(realpathSync.native(tmpdir()), 'mashiro-production-lease-'))
  roots.push(path)
  return path
}
afterEach(async () => {
  await Promise.all(leases.splice(0).map((lease) => lease.release()))
  for (const root of roots.splice(0)) {
    const absolute = realpathSync.native(root)
    if (
      dirname(absolute) !== realpathSync.native(tmpdir()) ||
      !basename(absolute).startsWith('mashiro-production-lease-')
    )
      throw new Error('Unowned fixture')
    rmSync(absolute, { recursive: true, force: true })
  }
})

it('excludes a second owner of the same Windows directory, including case aliases, until release', async () => {
  const root = makeRoot()
  const data = join(root, '中文 Data')
  mkdirSync(data)
  const lost = vi.fn()
  const first = await acquireProductionLease(data, lost)
  leases.push(first)
  await expect(acquireProductionLease(data, lost)).rejects.toThrow('DATA_SET_IN_USE')
  await expect(acquireProductionLease(data.toUpperCase(), lost)).rejects.toThrow('DATA_SET_IN_USE')
  await Promise.all([first.release(), first.release()])
  const reopened = await acquireProductionLease(data, lost)
  leases.push(reopened)
  expect(reopened.dataPath).toBe(realpathSync.native(data))
  expect(lost).not.toHaveBeenCalled()
})

it('permits independent selected datasets without conflating all installations', async () => {
  const root = makeRoot()
  const left = join(root, 'left')
  const right = join(root, 'right')
  mkdirSync(left)
  mkdirSync(right)
  leases.push(await acquireProductionLease(left, vi.fn()))
  leases.push(await acquireProductionLease(right, vi.fn()))
  await expect(acquireProductionLease(left, vi.fn())).rejects.toThrow('DATA_SET_IN_USE')
  await expect(acquireProductionLease(right, vi.fn())).rejects.toThrow('DATA_SET_IN_USE')
})

it('rejects a junction route before acquiring any dataset authority', async () => {
  const root = makeRoot()
  const target = join(root, 'target')
  const alias = join(root, 'alias')
  mkdirSync(target)
  symlinkSync(target, alias, 'junction')
  await expect(acquireProductionLease(alias, vi.fn())).rejects.toThrow('LOCATION_UNSAFE')
  leases.push(await acquireProductionLease(target, vi.fn()))
})
