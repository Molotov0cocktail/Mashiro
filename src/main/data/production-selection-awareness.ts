import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { assertProductionLease, type ProductionLease } from './production-lease.js'
import { canonicalProductionDirectory } from './production-location.js'

const filename = 'data-selection-awareness.json'
const noticeVersion = 1

interface DataSelectionAwareness {
  formatVersion: 1
  noticeVersion: 1
  dataSetId: string
  acknowledgedAt: string
}

function parse(path: string): DataSelectionAwareness {
  const entry = lstatSync(path)
  if (!entry.isFile() || entry.isSymbolicLink() || entry.size > 4096)
    throw new Error('DATA_SELECTION_AWARENESS_INVALID')
  const value = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  if (
    Object.keys(value).sort().join(',') !==
      'acknowledgedAt,dataSetId,formatVersion,noticeVersion' ||
    value.formatVersion !== 1 ||
    value.noticeVersion !== noticeVersion ||
    typeof value.dataSetId !== 'string' ||
    !/^[0-9a-f-]{36}$/iu.test(value.dataSetId) ||
    typeof value.acknowledgedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.acknowledgedAt))
  )
    throw new Error('DATA_SELECTION_AWARENESS_INVALID')
  return value as unknown as DataSelectionAwareness
}

export function isProductionDataSelectionAcknowledged(
  configurationDirectory: string,
  dataSetId: string
): boolean {
  const directory = canonicalProductionDirectory(configurationDirectory)
  const path = join(directory, filename)
  if (!existsSync(path)) return false
  try {
    const value = parse(path)
    return value.dataSetId === dataSetId
  } catch {
    return false
  }
}

export function acknowledgeProductionDataSelection(
  configurationDirectory: string,
  dataSetId: string,
  lease: ProductionLease
): void {
  assertProductionLease(lease, configurationDirectory)
  const directory = canonicalProductionDirectory(configurationDirectory)
  const path = join(directory, filename)
  if (existsSync(path)) parse(path)
  const value: DataSelectionAwareness = {
    formatVersion: 1,
    noticeVersion,
    dataSetId,
    acknowledgedAt: new Date().toISOString()
  }
  const temporary = join(directory, '.data-selection-awareness-' + randomUUID() + '.tmp')
  let descriptor: number | undefined
  let owned = false
  try {
    descriptor = openSync(temporary, 'wx', 0o600)
    owned = true
    writeFileSync(descriptor, JSON.stringify(value, null, 2) + '\n', 'utf8')
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = undefined
    assertProductionLease(lease, configurationDirectory)
    renameSync(temporary, path)
    owned = false
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
    if (owned)
      try {
        unlinkSync(temporary)
      } catch {
        // Preserve the first failure; an owned temporary file is harmless and identifiable.
      }
  }
}
