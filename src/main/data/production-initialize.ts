import {
  closeSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { acquireProductionLease, type ProductionLease } from './production-lease.js'
import {
  canonicalProductionDirectory,
  inspectProductionDataSet,
  type DataSetManifest
} from './production-location.js'

function writeExclusive(path: string, bytes: Buffer, onCreated: () => void = () => {}): void {
  const descriptor = openSync(path, 'wx', 0o600)
  try {
    onCreated()
    writeFileSync(descriptor, bytes)
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
}

function checkDatabaseHeader(path: string): void {
  const entry = lstatSync(path)
  if (!entry.isFile() || entry.isSymbolicLink() || entry.size < 100)
    throw new Error('DATA_SET_DATABASE_INVALID')
  const descriptor = openSync(path, 'r')
  try {
    const header = Buffer.alloc(16)
    if (
      readSync(descriptor, header, 0, 16, 0) !== 16 ||
      header.toString('ascii') !== 'SQLite format 3\0'
    )
      throw new Error('DATA_SET_DATABASE_INVALID')
  } finally {
    closeSync(descriptor)
  }
}

/** Explicit first creation only. The trusted caller must initialize and verify the full schema. */
export async function initializeProductionDataSet(
  selectedEmptyDirectory: string,
  initializeAndVerifyDatabase: (databasePath: string) => void | Promise<void>,
  onLost: (error: Error) => void
): Promise<{ dataPath: string; manifest: DataSetManifest; lease: ProductionLease }> {
  let lost = false
  const lease = await acquireProductionLease(selectedEmptyDirectory, (error) => {
    lost = true
    onLost(error)
  })
  let temporary: string | undefined
  let temporaryOwned = false
  try {
    // A failed/partial earlier attempt and an existing dataset both require explicit recovery.
    if (readdirSync(lease.dataPath).length !== 0) throw new Error('DATA_SET_NOT_EMPTY')
    const manifestPath = join(lease.dataPath, '.mashiro-dataset.json')
    const preparing: DataSetManifest = {
      formatVersion: 1,
      dataSetId: randomUUID(),
      state: 'PREPARING',
      createdAt: new Date().toISOString()
    }
    const preparedBytes = Buffer.from(JSON.stringify(preparing, null, 2) + '\n')
    writeExclusive(manifestPath, preparedBytes)
    const databasePath = join(lease.dataPath, 'mashiro.sqlite')
    await initializeAndVerifyDatabase(databasePath)
    if (lost) throw new Error('DATA_SET_LOCK_LOST')
    if (canonicalProductionDirectory(lease.dataPath) !== lease.dataPath)
      throw new Error('DATA_SET_LOCATION_CHANGED')
    checkDatabaseHeader(databasePath)
    const marker = lstatSync(manifestPath)
    if (
      !marker.isFile() ||
      marker.isSymbolicLink() ||
      marker.size !== preparedBytes.length ||
      !readFileSync(manifestPath).equals(preparedBytes)
    )
      throw new Error('DATA_SET_MANIFEST_CHANGED')
    const ready: DataSetManifest = { ...preparing, state: 'READY' }
    temporary = join(lease.dataPath, '.mashiro-finalize-' + randomUUID() + '.tmp')
    writeExclusive(temporary, Buffer.from(JSON.stringify(ready, null, 2) + '\n'), () => {
      temporaryOwned = true
    })
    renameSync(temporary, manifestPath)
    temporary = undefined
    const verified = inspectProductionDataSet(lease.dataPath, ready.dataSetId)
    return { ...verified, lease }
  } catch (error) {
    // Preserve PREPARING, partial database and original selected directory for recovery.
    try {
      if (temporary !== undefined && temporaryOwned) unlinkSync(temporary)
    } catch {
      // An owned finalization residue remains recoverable; never delete a colliding foreign file.
    } finally {
      await lease.release()
    }
    throw error
  }
}
