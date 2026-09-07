import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { dirname, isAbsolute, join, parse, resolve } from 'node:path'
import { z } from 'zod'

const manifestSchema = z
  .object({
    formatVersion: z.literal(1),
    dataSetId: z.uuid(),
    state: z.enum(['PREPARING', 'READY']),
    createdAt: z.iso.datetime()
  })
  .strict()
const locatorSchema = z
  .object({
    formatVersion: z.literal(1),
    dataSetId: z.uuid(),
    dataPath: z.string().min(1).max(32767),
    revision: z.uuid()
  })
  .strict()
export type DataSetManifest = z.infer<typeof manifestSchema>
export type ProductionLocator = z.infer<typeof locatorSchema>
export type LocationInspection =
  | { state: 'UNCONFIGURED'; fingerprint: null }
  | {
      state: 'RECOVERY'
      fingerprint: string | null
      reason: 'LOCATOR_UNREADABLE' | 'LOCATOR_INVALID' | 'DATA_UNAVAILABLE'
      locator: ProductionLocator | null
    }
  | { state: 'READY'; fingerprint: string; locator: ProductionLocator }

const manifestName = '.mashiro-dataset.json'
const locatorName = 'location.json'
const digest = (value: Buffer): string => createHash('sha256').update(value).digest('hex')
const isMissing = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'

// Setup owns explicit directory creation. Resolving only the leaf would accept a junction.
function canonicalDirectory(path: string): string {
  if (!isAbsolute(path) || path.startsWith('\\\\')) throw new Error('LOCATION_UNSUPPORTED')
  const absolute = resolve(path)
  // Windows also accepts forward or mixed slashes in UNC paths; reject before any I/O.
  if (absolute.startsWith('\\\\')) throw new Error('LOCATION_UNSUPPORTED')
  let current = absolute
  for (;;) {
    const entry = lstatSync(current)
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('LOCATION_UNSAFE')
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  const canonical = realpathSync.native(absolute)
  const comparable = (value: string): string =>
    process.platform === 'win32' ? value.toLowerCase() : value
  if (comparable(canonical) !== comparable(absolute) || canonical === parse(canonical).root)
    throw new Error('LOCATION_UNSAFE')
  return canonical
}

function readRegularFile(path: string, maximumBytes: number): Buffer {
  const entry = lstatSync(path)
  if (!entry.isFile() || entry.isSymbolicLink() || entry.size > maximumBytes)
    throw new Error('LOCATION_FILE_INVALID')
  return readFileSync(path)
}

function verifyWritable(directory: string): void {
  const probe = join(directory, '.mashiro-probe-' + randomUUID())
  let fd: number | undefined
  try {
    fd = openSync(probe, 'wx', 0o600)
    writeFileSync(fd, 'Mashiro location probe\n')
    fsyncSync(fd)
  } finally {
    if (fd !== undefined) {
      closeSync(fd)
      unlinkSync(probe)
    }
  }
}

/** Inspect an initialized data set without creating a database or fallback directory. */
export function inspectProductionDataSet(
  path: string,
  expectedId?: string
): {
  dataPath: string
  manifest: DataSetManifest
} {
  const dataPath = canonicalDirectory(path)
  const manifest = manifestSchema.parse(
    JSON.parse(readRegularFile(join(dataPath, manifestName), 4096).toString('utf8'))
  )
  if (manifest.state !== 'READY' || (expectedId !== undefined && manifest.dataSetId !== expectedId))
    throw new Error('DATA_SET_IDENTITY_MISMATCH')
  // Integrity/schema and accepted Markdown verification remain the store/backup validator's job.
  const databasePath = join(dataPath, 'mashiro.sqlite')
  const entry = lstatSync(databasePath)
  if (!entry.isFile() || entry.isSymbolicLink() || entry.size < 100)
    throw new Error('DATA_SET_DATABASE_MISSING')
  const header = Buffer.alloc(16)
  const fd = openSync(databasePath, 'r')
  try {
    if (readSync(fd, header, 0, 16, 0) !== 16 || header.toString('ascii') !== 'SQLite format 3\0')
      throw new Error('DATA_SET_DATABASE_INVALID')
  } finally {
    closeSync(fd)
  }
  verifyWritable(dataPath)
  return { dataPath, manifest }
}

/** Only the trusted setup/maintenance coordinator supplies paths and expected fingerprints. */
export class ProductionLocationStore {
  constructor(private readonly configurationDirectory: string) {}

  inspect(): LocationInspection {
    let bytes: Buffer
    try {
      const directory = canonicalDirectory(this.configurationDirectory)
      bytes = readRegularFile(join(directory, locatorName), 65536)
    } catch (error) {
      if (isMissing(error)) {
        try {
          canonicalDirectory(this.configurationDirectory)
          if (!this.locatorExists()) return { state: 'UNCONFIGURED', fingerprint: null }
        } catch {
          /* Unavailable config must never look like first use. */
        }
      }
      return { state: 'RECOVERY', fingerprint: null, reason: 'LOCATOR_UNREADABLE', locator: null }
    }
    const fingerprint = digest(bytes)
    let locator: ProductionLocator
    try {
      locator = locatorSchema.parse(JSON.parse(bytes.toString('utf8')))
    } catch {
      return { state: 'RECOVERY', fingerprint, reason: 'LOCATOR_INVALID', locator: null }
    }
    try {
      inspectProductionDataSet(locator.dataPath, locator.dataSetId)
      return { state: 'READY', fingerprint, locator }
    } catch {
      return { state: 'RECOVERY', fingerprint, reason: 'DATA_UNAVAILABLE', locator }
    }
  }

  private locatorExists(): boolean {
    try {
      lstatSync(join(this.configurationDirectory, locatorName))
      return true
    } catch (error) {
      if (isMissing(error)) return false
      throw error
    }
  }

  /** Explicitly bind an initialized data set; never initialize one or fall back. */
  bind(
    path: string,
    expectedFingerprint: string | null,
    expectedDataSetId: string
  ): ProductionLocator {
    const directory = canonicalDirectory(this.configurationDirectory)
    const lock = join(directory, '.location-write-lock')
    // A stale lock is not removed automatically: recovery must verify ownership first.
    mkdirSync(lock)
    const temporary = join(directory, '.location-' + randomUUID() + '.tmp')
    let temporaryOwned = false
    try {
      const current = this.inspect()
      if (
        current.fingerprint !== expectedFingerprint ||
        (current.state === 'RECOVERY' && current.fingerprint === null)
      )
        throw new Error('LOCATION_CHANGED_OR_UNREADABLE')
      const selected = inspectProductionDataSet(path, expectedDataSetId)
      const locator: ProductionLocator = {
        formatVersion: 1,
        dataSetId: selected.manifest.dataSetId,
        dataPath: selected.dataPath,
        revision: randomUUID()
      }
      const fd = openSync(temporary, 'wx', 0o600)
      temporaryOwned = true
      try {
        writeFileSync(fd, JSON.stringify(locator, null, 2) + '\n', 'utf8')
        fsyncSync(fd)
      } finally {
        closeSync(fd)
      }
      // Same-directory replacement leaves the old locator intact until rename succeeds.
      renameSync(temporary, join(directory, locatorName))
      temporaryOwned = false
      return locator
    } finally {
      try {
        if (temporaryOwned) unlinkSync(temporary)
      } finally {
        rmdirSync(lock)
      }
    }
  }

  /** Recovery relocation must retain the known data-set identity. */
  relocate(path: string, expectedFingerprint: string): ProductionLocator {
    const previous = this.inspect()
    if (previous.fingerprint !== expectedFingerprint || !previous.locator)
      throw new Error('LOCATION_CHANGED_OR_UNKNOWN')
    return this.bind(path, expectedFingerprint, previous.locator.dataSetId)
  }
}
