import { lstatSync, readdirSync, rmdirSync } from 'node:fs'
import { join } from 'node:path'
import { assertProductionLease, type ProductionLease } from './production-lease.js'

/** Only after acquiring the OS configuration lease can an abandoned cooperative lock be cleared. */
export function recoverProductionLocationLock(
  configurationDirectory: string,
  lease: ProductionLease
): boolean {
  assertProductionLease(lease, configurationDirectory)
  const path = join(lease.dataPath, '.location-write-lock')
  let entry
  try {
    entry = lstatSync(path)
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT')
      return false
    throw error
  }
  if (!entry.isDirectory() || entry.isSymbolicLink() || readdirSync(path).length !== 0)
    throw new Error('LOCATION_LOCK_NEEDS_RECOVERY')
  // Exact empty reserved directory only; never recursive and never a link target.
  rmdirSync(path)
  return true
}
