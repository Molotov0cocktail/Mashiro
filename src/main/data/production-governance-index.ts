import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { readGovernanceSeed } from './production-governance-seed.js'
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { canonicalProductionDirectory } from './production-location.js'
import { assertProductionLease, type ProductionLease } from './production-lease.js'
import {
  ProductionGovernanceJournal,
  type GovernanceAnchor
} from './production-governance-journal.js'
import {
  parseGovernanceProjection,
  type GovernanceProjection
} from './production-governance-catalog.js'

const entrySchema = z.strictObject({
  dataSetId: z.uuid(),
  state: z.enum(['PREPARING', 'READY']),
  journalId: z.uuid().nullable(),
  seed: z
    .strictObject({
      id: z.uuid(),
      hash: z.string().regex(/^[a-f0-9]{64}$/),
      bytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional()
    })
    .optional(),
  anchor: z.strictObject({ instanceId: z.uuid(), device: z.string(), inode: z.string() })
})
const registrySchema = z.strictObject({ format: z.literal(1), entries: z.array(entrySchema) })
const markerSchema = z.strictObject({
  format: z.literal(1),
  dataSetId: z.uuid(),
  journalId: z.uuid()
})
type Registry = z.infer<typeof registrySchema>
const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex')
function readMetadata(path: string): Buffer {
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8388608)
    throw Error('GOVERNANCE_METADATA_INVALID')
  return readFileSync(path)
}
function durableWrite(path: string, value: unknown, replace: boolean) {
  const temporary = replace ? path + '.' + randomUUID() + '.tmp' : path
  const descriptor = openSync(temporary, 'wx', 0o600)
  try {
    writeFileSync(descriptor, JSON.stringify(value))
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
  if (replace) renameSync(temporary, path)
}

/** Persistent known-dataset registration prevents a missing ledger becoming a new empty history. */
export class ProductionGovernanceIndex {
  readonly directory: string
  private readonly path: string
  private registry: Registry
  private fingerprint: string
  constructor(
    private readonly configurationDirectory: string,
    private readonly lease: ProductionLease
  ) {
    this.assertHeld()
    const root = canonicalProductionDirectory(configurationDirectory)
    this.directory = join(root, 'governance')
    if (!existsSync(this.directory)) mkdirSync(this.directory)
    canonicalProductionDirectory(this.directory)
    this.path = join(root, 'governance-registry.json')
    if (!existsSync(this.path)) durableWrite(this.path, { format: 1, entries: [] }, false)
    const bytes = readMetadata(this.path)
    this.registry = registrySchema.parse(JSON.parse(bytes.toString('utf8')))
    if (
      new Set(this.registry.entries.map((entry) => entry.dataSetId)).size !==
      this.registry.entries.length
    )
      throw Error('GOVERNANCE_REGISTRY_INVALID')
    this.fingerprint = hash(bytes)
  }
  private assertHeld() {
    assertProductionLease(this.lease, this.configurationDirectory)
  }
  private persist() {
    this.assertHeld()
    if (hash(readMetadata(this.path)) !== this.fingerprint)
      throw Error('GOVERNANCE_REGISTRY_CHANGED')
    durableWrite(this.path, this.registry, true)
    this.fingerprint = hash(readMetadata(this.path))
  }
  resumeInitialization(
    dataSetId: string,
    dataDirectory: string,
    anchor: GovernanceAnchor,
    projections: GovernanceProjection[],
    hasCommitTokens: boolean
  ): void {
    this.assertHeld()
    const entry = this.registry.entries.find((value) => value.dataSetId === dataSetId)
    if (!entry || entry.state === 'READY') return
    if (JSON.stringify(entry.anchor) !== JSON.stringify(anchor) || hasCommitTokens)
      throw Error('GOVERNANCE_INITIALIZATION_SOURCE_UNCERTAIN')
    if (entry.seed) {
      const journal = this.known(dataSetId)!
      this.stamp(dataDirectory, journal)
      return
    }
    const marker = join(canonicalProductionDirectory(dataDirectory), '.mashiro-governance.json')
    try {
      const ready = ProductionGovernanceJournal.open(this.directory, dataSetId)
      ready.assertAnchor(anchor)
      ready.snapshot()
      entry.state = 'READY'
      entry.journalId = ready.journalId
      this.persist()
      this.stamp(dataDirectory, ready)
      return
    } catch (error) {
      if (existsSync(marker) || entry.journalId) throw error
      // PREPARING was durable before creation; no application writer has ever been exposed.
      // Preserve the incomplete exact file as evidence; never repair a READY ledger this way.
      const path = join(this.directory, 'governance-' + dataSetId + '.jsonl')
      if (existsSync(path)) {
        readMetadata(path)
        renameSync(path, path + '.initialization-' + randomUUID() + '.incomplete')
      }
    }
    const journal = ProductionGovernanceJournal.create(
      this.directory,
      dataSetId,
      anchor,
      projections
    )
    entry.state = 'READY'
    entry.journalId = journal.journalId
    this.persist()
    this.stamp(dataDirectory, journal)
  }
  private seedEntry(
    dataSetId: string,
    anchor: GovernanceAnchor,
    projections: GovernanceProjection[],
    journalId: string = randomUUID()
  ): Registry['entries'][number] {
    const id = randomUUID()
    const value = {
      dataSetId,
      journalId,
      anchor,
      projections: projections.map(parseGovernanceProjection)
    }
    const path = join(this.directory, 'seed-' + id + '.json')
    const serialized = Buffer.from(JSON.stringify(value))
    const bytes = serialized.length,
      expectedHash = hash(serialized)
    durableWrite(path, value, false)
    readGovernanceSeed(path, expectedHash, bytes)
    return {
      dataSetId,
      state: 'PREPARING',
      journalId,
      anchor,
      seed: { id, hash: expectedHash, bytes }
    }
  }
  known(dataSetId: string): ProductionGovernanceJournal | undefined {
    this.assertHeld()
    const entry = this.registry.entries.find((value) => value.dataSetId === dataSetId)
    if (!entry) return undefined
    let journal: ProductionGovernanceJournal
    try {
      journal = ProductionGovernanceJournal.open(this.directory, dataSetId)
    } catch (error) {
      if (entry.state !== 'PREPARING' || !entry.seed) throw error
      const bytes = readGovernanceSeed(
        join(this.directory, 'seed-' + entry.seed.id + '.json'),
        entry.seed.hash,
        entry.seed.bytes
      )
      if (hash(bytes) !== entry.seed.hash) throw Error('GOVERNANCE_SEED_CHANGED', { cause: error })
      const seed = z
        .strictObject({
          dataSetId: z.uuid(),
          journalId: z.uuid(),
          anchor: entrySchema.shape.anchor,
          projections: z.array(z.unknown())
        })
        .parse(JSON.parse(bytes.toString('utf8')))
      if (
        seed.dataSetId !== dataSetId ||
        seed.journalId !== entry.journalId ||
        JSON.stringify(seed.anchor) !== JSON.stringify(entry.anchor)
      )
        throw Error('GOVERNANCE_SEED_MISMATCH', { cause: error })
      const projections = seed.projections.map(parseGovernanceProjection)
      // No writer is exposed before READY. Only this durable, hash-bound initial seed may be replayed.
      const path = join(this.directory, 'governance-' + dataSetId + '.jsonl')
      if (lstatSync(path, { throwIfNoEntry: false })) {
        const partial = lstatSync(path)
        if (!partial.isFile() || partial.isSymbolicLink())
          throw Error('GOVERNANCE_PARTIAL_INVALID', { cause: error })
        renameSync(path, path + '.initialization-' + randomUUID() + '.incomplete')
      }
      journal = ProductionGovernanceJournal.create(
        this.directory,
        dataSetId,
        seed.anchor,
        projections,
        seed.journalId
      )
    }
    if (entry.journalId && entry.journalId !== journal.journalId)
      throw Error('GOVERNANCE_JOURNAL_ID_MISMATCH')
    if (entry.state !== 'READY') {
      journal.assertAnchor(entry.anchor)
      journal.snapshot()
      entry.state = 'READY'
      entry.journalId = journal.journalId
      this.persist()
    }
    return journal
  }
  initialize(
    dataSetId: string,
    dataDirectory: string,
    anchor: GovernanceAnchor,
    projections: GovernanceProjection[]
  ): ProductionGovernanceJournal {
    this.assertHeld()
    const marker = join(canonicalProductionDirectory(dataDirectory), '.mashiro-governance.json')
    if (this.registry.entries.some((entry) => entry.dataSetId === dataSetId) || existsSync(marker))
      throw Error('GOVERNANCE_KNOWN_DATASET_REQUIRES_LEDGER')
    const entry = this.seedEntry(dataSetId, anchor, projections)
    this.registry.entries.push(entry)
    this.persist()
    const journal = ProductionGovernanceJournal.create(
      this.directory,
      dataSetId,
      anchor,
      projections,
      entry.journalId!
    )
    entry.state = 'READY'
    entry.journalId = journal.journalId
    this.persist()
    this.stamp(dataDirectory, journal)
    return journal
  }
  importVerified(
    dataSetId: string,
    dataDirectory: string,
    anchor: GovernanceAnchor,
    projections: GovernanceProjection[],
    journalId: string
  ): ProductionGovernanceJournal {
    this.assertHeld()
    if (this.registry.entries.some((entry) => entry.dataSetId === dataSetId))
      throw Error('GOVERNANCE_IMPORT_ALREADY_KNOWN')
    const locatorPath = join(this.configurationDirectory, 'location.json')
    if (existsSync(locatorPath)) {
      const locator = JSON.parse(readMetadata(locatorPath).toString('utf8'))
      if (locator.dataSetId === dataSetId) throw Error('GOVERNANCE_KNOWN_LOCATOR_REQUIRES_LEDGER')
    }
    const markerPath = join(canonicalProductionDirectory(dataDirectory), '.mashiro-governance.json')
    if (existsSync(markerPath)) {
      const marker = markerSchema.parse(JSON.parse(readMetadata(markerPath).toString('utf8')))
      if (marker.dataSetId !== dataSetId || marker.journalId !== journalId)
        throw Error('GOVERNANCE_IMPORT_MARKER_MISMATCH')
    }
    const entry = this.seedEntry(dataSetId, anchor, projections, journalId)
    this.registry.entries.push(entry)
    this.persist()
    const journal = ProductionGovernanceJournal.create(
      this.directory,
      dataSetId,
      anchor,
      projections,
      journalId
    )
    entry.state = 'READY'
    this.persist()
    this.stamp(dataDirectory, journal)
    return journal
  }
  stamp(dataDirectory: string, journal: ProductionGovernanceJournal): void {
    this.assertHeld()
    const path = join(canonicalProductionDirectory(dataDirectory), '.mashiro-governance.json')
    const expected = {
      format: 1 as const,
      dataSetId: journal.dataSetId,
      journalId: journal.journalId
    }
    if (existsSync(path)) {
      const current = markerSchema.parse(JSON.parse(readMetadata(path).toString('utf8')))
      if (current.dataSetId !== expected.dataSetId || current.journalId !== expected.journalId)
        throw Error('GOVERNANCE_MARKER_MISMATCH')
    } else durableWrite(path, expected, false)
  }
}
