import { randomUUID } from 'node:crypto'
import {
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  openSync,
  fsyncSync,
  closeSync
} from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { schemaVersion } from './schema.js'
import { SqliteStore } from './sqlite.js'
import { assertProductionLease, type ProductionLease } from './production-lease.js'
import { canonicalProductionDirectory, inspectProductionDataSet } from './production-location.js'
import {
  createProductionBackup,
  verifyProductionBackup,
  assertProductionDataMatchesBackup
} from './production-backup.js'

export interface ProductionPreparationResult {
  state: 'CURRENT' | 'MIGRATED'
  fromVersion: number
  toVersion: number
  backupDirectory: string | null
}

/** Run before opening any application writer. Migrations operate on a disposable SQL copy. */
export async function prepareProductionData(options: {
  dataDirectory: string
  backupParentDirectory: string
  lease: ProductionLease
  signal: AbortSignal
  assertQuiescent(): void
  authorizeReplacement?(candidatePath: string): void
}): Promise<ProductionPreparationResult> {
  const dataPath = canonicalProductionDirectory(options.dataDirectory)
  const assertCurrent = () => {
    if (options.signal.aborted) throw new Error('PREPARATION_CANCELLED')
    assertProductionLease(options.lease, dataPath)
    options.assertQuiescent()
  }
  assertCurrent()
  const identity = inspectProductionDataSet(dataPath)
  const databasePath = join(dataPath, 'mashiro.sqlite')
  const probe = new DatabaseSync(databasePath, { readOnly: true })
  let current: number
  try {
    current = Number(probe.prepare('PRAGMA user_version').get()?.user_version)
    if (!Number.isInteger(current) || current < 1 || current > schemaVersion)
      throw new Error('PREPARATION_SCHEMA_UNSUPPORTED')
    if (
      probe.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok' ||
      probe.prepare('PRAGMA foreign_key_check').all().length
    )
      throw new Error('PREPARATION_DATABASE_INVALID')
    if (current === schemaVersion) {
      // Application validation includes rolled-back constraint probes, so run it on our own copy.
      // Keep a read transaction on the original DELETE-journal database while copying.
      if (probe.prepare('PRAGMA journal_mode').get()?.journal_mode !== 'delete')
        throw new Error('PREPARATION_JOURNAL_MODE_UNSUPPORTED')
      const validationPath = join(dataPath, '.mashiro-validation-' + randomUUID() + '.sqlite')
      let copied = false
      probe.exec('BEGIN')
      try {
        probe.prepare('SELECT count(*) FROM sqlite_master').get()
        copyFileSync(databasePath, validationPath, constants.COPYFILE_EXCL)
        copied = true
        const validation = new SqliteStore(validationPath)
        validation.close()
        assertCurrent()
        inspectProductionDataSet(dataPath, identity.manifest.dataSetId)
      } finally {
        try {
          if (copied) unlinkSync(validationPath)
        } finally {
          probe.exec('ROLLBACK')
        }
      }
    }
  } finally {
    probe.close()
  }
  if (current === schemaVersion)
    return { state: 'CURRENT', fromVersion: current, toVersion: current, backupDirectory: null }
  const parent = canonicalProductionDirectory(options.backupParentDirectory)
  const backupDirectory = join(parent, 'mashiro-before-upgrade-' + randomUUID())
  mkdirSync(backupDirectory)
  const receipt = await createProductionBackup({
    sourceDirectory: dataPath,
    destinationDirectory: backupDirectory,
    sourceLease: options.lease,
    signal: options.signal,
    assertQuiescent: options.assertQuiescent
  })
  verifyProductionBackup(backupDirectory)
  assertCurrent()
  const temporary = join(dataPath, '.mashiro-upgrade-' + randomUUID() + '.sqlite')
  let owned = false
  try {
    copyFileSync(
      join(backupDirectory, 'payload', 'mashiro.sqlite'),
      temporary,
      constants.COPYFILE_EXCL
    )
    owned = true
    const candidate = new SqliteStore(temporary)
    try {
      if (
        candidate.database.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok' ||
        candidate.database.prepare('PRAGMA foreign_key_check').all().length
      )
        throw new Error('PREPARATION_MIGRATION_INVALID')
    } finally {
      candidate.close()
    }
    assertCurrent()
    inspectProductionDataSet(dataPath, identity.manifest.dataSetId)
    // No older snapshot can overwrite intervening user corrections/deletions or new receipts.
    assertProductionDataMatchesBackup(dataPath, receipt)
    options.authorizeReplacement?.(temporary)
    assertCurrent()
    const descriptor = openSync(temporary, 'r+')
    try {
      fsyncSync(descriptor)
    } finally {
      closeSync(descriptor)
    }
    renameSync(temporary, databasePath)
    owned = false
    return { state: 'MIGRATED', fromVersion: current, toVersion: schemaVersion, backupDirectory }
  } finally {
    // Only our exact uncommitted candidate is disposable. Source and verified snapshot remain.
    if (owned && existsSync(temporary)) unlinkSync(temporary)
  }
}
