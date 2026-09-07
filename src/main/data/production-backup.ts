import { createHash, randomUUID } from 'node:crypto'
import {
  closeSync,
  copyFileSync,
  constants,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  writeFileSync
} from 'node:fs'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { setImmediate } from 'node:timers/promises'
import { z } from 'zod'
import {
  acquireProductionLease,
  assertProductionLease,
  type ProductionLease
} from './production-lease.js'
import { canonicalProductionDirectory, inspectProductionDataSet } from './production-location.js'

interface BackupFile {
  path: string
  bytes: number
  sha256: string
}

export interface ProductionBackupReceipt {
  formatVersion: 1
  backupId: string
  dataSetId: string
  schemaVersion: number
  createdAt: string
  credentialProtection: 'windows-original-user-required'
  files: BackupFile[]
}

function fileDigest(path: string): BackupFile {
  const before = lstatSync(path)
  if (!before.isFile() || before.isSymbolicLink()) throw new Error('BACKUP_UNSAFE_FILE')
  const fd = openSync(path, 'r')
  try {
    const hash = createHash('sha256')
    const chunk = Buffer.alloc(1024 * 1024)
    let bytes = 0
    let count: number
    while ((count = readSync(fd, chunk, 0, chunk.length, null)) !== 0) {
      bytes += count
      hash.update(chunk.subarray(0, count))
    }
    const after = lstatSync(path)
    if (bytes !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs)
      throw new Error('BACKUP_SOURCE_CHANGED')
    return { path, bytes, sha256: hash.digest('hex') }
  } finally {
    closeSync(fd)
  }
}

function inventory(root: string): BackupFile[] {
  const files = ['.mashiro-dataset.json', 'mashiro.sqlite']
  for (const name of ['memory', 'credentials']) {
    const directory = join(root, name)
    if (!existsSync(directory)) continue
    if (canonicalProductionDirectory(directory) !== directory)
      throw new Error('BACKUP_UNSAFE_DIRECTORY')
    for (const entry of readdirSync(directory)) {
      // Only the application's actual immutable bodies / recovery temporaries and protected blobs.
      const allowed =
        name === 'memory'
          ? /^[a-f0-9-]+\.md(?:\.tmp)?$/.test(entry)
          : /^[a-f0-9-]+\.credential(?:\.tmp)?$/.test(entry)
      if (!allowed) throw new Error('BACKUP_UNRECOGNIZED_DOMAIN_FILE')
      files.push(name + '/' + entry)
    }
  }
  return files.sort().map((path) => ({ ...fileDigest(join(root, path)), path }))
}

function validateDatabase(database: DatabaseSync, root: string): number {
  if (
    database.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok' ||
    database.prepare('PRAGMA foreign_key_check').all().length
  )
    throw new Error('BACKUP_DATABASE_INVALID')
  const version = Number(database.prepare('PRAGMA user_version').get()?.user_version)
  if (!Number.isInteger(version) || version < 1) throw new Error('BACKUP_SCHEMA_INVALID')
  const hasMemory = database
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='memory_versions'")
    .get()
  if (hasMemory) {
    for (const row of database
      .prepare(
        'SELECT v.file_name,v.body_hash,o.record_json FROM memory_versions v LEFT JOIN memory_objects o ON o.id=v.object_id'
      )
      .all()) {
      const name = String(row.file_name)
      if (name === '') {
        const record = JSON.parse(String(row.record_json)) as { state?: string; retention?: string }
        if (
          record.state !== 'suppressed' ||
          record.retention !== 'trash' ||
          row.body_hash !== createHash('sha256').update('').digest('hex')
        )
          throw new Error('BACKUP_DELETION_MARKER_INVALID')
      } else if (
        !/^[a-f0-9-]+\.md$/.test(name) ||
        fileDigest(join(root, 'memory', name)).sha256 !== row.body_hash
      ) {
        throw new Error('BACKUP_ACCEPTED_BODY_INVALID')
      }
    }
  }
  return version
}

const backupReceiptSchema = z
  .object({
    formatVersion: z.literal(1),
    backupId: z.uuid(),
    dataSetId: z.uuid(),
    schemaVersion: z.number().int().positive(),
    createdAt: z.iso.datetime(),
    credentialProtection: z.literal('windows-original-user-required'),
    files: z.array(
      z
        .object({
          path: z
            .string()
            .regex(
              /^(?:\.mashiro-dataset\.json|mashiro\.sqlite|memory\/[a-f0-9-]+\.md(?:\.tmp)?|credentials\/[a-f0-9-]+\.credential(?:\.tmp)?)$/
            ),
          bytes: z.number().int().nonnegative(),
          sha256: z.string().regex(/^[a-f0-9]{64}$/)
        })
        .strict()
    )
  })
  .strict()

/** Verification is read-only and does not bind an old snapshot as a current data set. */
export function verifyProductionBackup(directory: string): ProductionBackupReceipt {
  const root = canonicalProductionDirectory(directory)
  const receiptPath = join(root, 'backup.json')
  const stat = lstatSync(receiptPath)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32 * 1024 * 1024)
    throw new Error('BACKUP_RECEIPT_INVALID')
  const receipt = backupReceiptSchema.parse(JSON.parse(readFileSync(receiptPath, 'utf8')))
  const payload = canonicalProductionDirectory(join(root, 'payload'))
  if (JSON.stringify(inventory(payload)) !== JSON.stringify(receipt.files))
    throw new Error('BACKUP_INVENTORY_INVALID')
  const snapshotPath = join(payload, '.mashiro-snapshot.json')
  const snapshotStat = lstatSync(snapshotPath)
  if (!snapshotStat.isFile() || snapshotStat.isSymbolicLink() || snapshotStat.size > 4096)
    throw new Error('BACKUP_IDENTITY_INVALID')
  const snapshotMarker = JSON.parse(readFileSync(snapshotPath, 'utf8')) as {
    backupId?: string
    dataSetId?: string
  }
  if (
    snapshotMarker.backupId !== receipt.backupId ||
    snapshotMarker.dataSetId !== receipt.dataSetId
  )
    throw new Error('BACKUP_IDENTITY_INVALID')
  const marker = JSON.parse(readFileSync(join(payload, '.mashiro-dataset.json'), 'utf8')) as {
    dataSetId?: string
    state?: string
  }
  if (marker.dataSetId !== receipt.dataSetId || marker.state !== 'READY')
    throw new Error('BACKUP_IDENTITY_INVALID')
  const database = new DatabaseSync(join(payload, 'mashiro.sqlite'), { readOnly: true })
  try {
    if (validateDatabase(database, payload) !== receipt.schemaVersion)
      throw new Error('BACKUP_SCHEMA_CHANGED')
  } finally {
    database.close()
  }
  return receipt
}

/** Recheck the complete authority inventory before replacing only a successfully migrated SQL file. */
export function assertProductionDataMatchesBackup(
  directory: string,
  receipt: ProductionBackupReceipt
): void {
  assertProductionFilesMatchBackup(directory, receipt)
  inspectProductionDataSet(directory, receipt.dataSetId)
}

/** Validate copied authority bytes while an incomplete-restore marker still blocks opening. */
export function assertProductionFilesMatchBackup(
  directory: string,
  receipt: ProductionBackupReceipt
): void {
  const root = canonicalProductionDirectory(directory)
  if (JSON.stringify(inventory(root)) !== JSON.stringify(receipt.files))
    throw new Error('PREPARATION_SOURCE_CHANGED')
}

function contains(base: string, candidate: string): boolean {
  const segment = relative(base, candidate)
  return (
    segment === '' || (!isAbsolute(segment) && segment !== '..' && !segment.startsWith('..' + sep))
  )
}

/** Caller closes all application writers before entering maintenance; source remains untouched. */
export async function createProductionBackup(options: {
  sourceDirectory: string
  destinationDirectory: string
  sourceLease: ProductionLease
  signal: AbortSignal
  assertQuiescent(): void
}): Promise<ProductionBackupReceipt> {
  const source = canonicalProductionDirectory(options.sourceDirectory)
  const destination = canonicalProductionDirectory(options.destinationDirectory)
  if (contains(source, destination) || contains(destination, source))
    throw new Error('BACKUP_LOCATION_OVERLAP')
  assertProductionLease(options.sourceLease, source)
  let lost = false
  const lease = await acquireProductionLease(destination, () => {
    lost = true
  })
  const assertCurrent = () => {
    if (lost || options.signal.aborted) throw new Error('BACKUP_CANCELLED')
    assertProductionLease(options.sourceLease, source)
    assertProductionLease(lease, destination)
    options.assertQuiescent()
  }
  let database: DatabaseSync | undefined
  let locked = false
  try {
    assertCurrent()
    if (readdirSync(destination).length) throw new Error('BACKUP_DESTINATION_NOT_EMPTY')
    const original = inspectProductionDataSet(source)
    const databasePath = join(source, 'mashiro.sqlite')
    database = new DatabaseSync(databasePath)
    database.exec('PRAGMA busy_timeout = 1000')
    if (database.prepare('PRAGMA journal_mode').get()?.journal_mode !== 'delete')
      throw new Error('BACKUP_JOURNAL_MODE_UNSUPPORTED')
    // An active external SQLite writer must prevent a copy of an inconsistent database.
    database.exec('BEGIN EXCLUSIVE')
    locked = true
    const before = inventory(source)
    const schemaVersion = validateDatabase(database, source)
    const payload = join(destination, 'payload')
    const backupId = randomUUID()
    mkdirSync(payload)
    const snapshotDescriptor = openSync(join(payload, '.mashiro-snapshot.json'), 'wx', 0o600)
    try {
      writeFileSync(
        snapshotDescriptor,
        JSON.stringify({ formatVersion: 1, backupId, dataSetId: original.manifest.dataSetId })
      )
      fsyncSync(snapshotDescriptor)
    } finally {
      closeSync(snapshotDescriptor)
    }
    for (const file of before) {
      assertCurrent()
      const target = join(payload, file.path)
      mkdirSync(dirname(target), { recursive: true })
      canonicalProductionDirectory(dirname(target))
      if (fileDigest(join(source, file.path)).sha256 !== file.sha256)
        throw new Error('BACKUP_SOURCE_CHANGED')
      copyFileSync(join(source, file.path), target, constants.COPYFILE_EXCL)
      const descriptor = openSync(target, 'r+')
      try {
        fsyncSync(descriptor)
      } finally {
        closeSync(descriptor)
      }
      if (fileDigest(target).sha256 !== file.sha256) throw new Error('BACKUP_COPY_INVALID')
      await setImmediate()
    }
    assertCurrent()
    if (JSON.stringify(inventory(source)) !== JSON.stringify(before))
      throw new Error('BACKUP_SOURCE_CHANGED')
    inspectProductionDataSet(source, original.manifest.dataSetId)
    const copy = new DatabaseSync(join(payload, 'mashiro.sqlite'), { readOnly: true })
    try {
      if (validateDatabase(copy, payload) !== schemaVersion)
        throw new Error('BACKUP_SCHEMA_CHANGED')
    } finally {
      copy.close()
    }
    assertCurrent()
    const receipt: ProductionBackupReceipt = {
      formatVersion: 1,
      backupId,
      dataSetId: original.manifest.dataSetId,
      schemaVersion,
      createdAt: new Date().toISOString(),
      credentialProtection: 'windows-original-user-required',
      files: before
    }
    const receiptPath = join(destination, 'backup.json')
    const descriptor = openSync(receiptPath, 'wx', 0o600)
    try {
      writeFileSync(descriptor, JSON.stringify(receipt, null, 2) + '\n')
      fsyncSync(descriptor)
    } finally {
      closeSync(descriptor)
    }
    if (JSON.stringify(JSON.parse(readFileSync(receiptPath, 'utf8'))) !== JSON.stringify(receipt))
      throw new Error('BACKUP_RECEIPT_INVALID')
    return receipt
  } finally {
    try {
      if (locked) database!.exec('ROLLBACK')
    } finally {
      try {
        database?.close()
      } finally {
        await lease.release()
      }
    }
  }
}
