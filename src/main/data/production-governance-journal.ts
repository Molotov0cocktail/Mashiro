import { closeSync, fsyncSync, lstatSync, openSync, readSync, writeSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { z } from 'zod'
import { canonicalProductionDirectory } from './production-location.js'
import {
  governanceKey,
  parseGovernanceProjection,
  type GovernanceProjection
} from './production-governance-catalog.js'

const anchorSchema = z.strictObject({
  instanceId: z.uuid(),
  device: z.string().regex(/^\d+$/),
  inode: z.string().regex(/^\d+$/)
})
export type GovernanceAnchor = z.infer<typeof anchorSchema>
const projectionSchema = z.unknown().transform((value) => parseGovernanceProjection(value))
const payloadSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('header'),
    format: z.literal(1),
    dataSetId: z.uuid(),
    journalId: z.uuid()
  }),
  z.strictObject({ kind: z.literal('instance'), anchor: anchorSchema }),
  z.strictObject({ kind: z.literal('baseline'), projection: projectionSchema }),
  z.strictObject({ kind: z.literal('ready') }),
  z.strictObject({
    kind: z.literal('pending'),
    token: z.uuid(),
    instanceId: z.uuid(),
    projection: projectionSchema
  }),
  z.strictObject({
    kind: z.literal('resolve'),
    committed: z.array(z.uuid()).max(1000),
    rolledBack: z.array(z.uuid()).max(1000)
  })
])
type Payload = z.infer<typeof payloadSchema>
const lineSchema = z.strictObject({
  sequence: z.number().int().nonnegative(),
  previous: z.string(),
  payload: payloadSchema,
  hash: z.string().regex(/^[a-f0-9]{64}$/)
})
const digest = (value: string) => createHash('sha256').update(value).digest('hex')

/** Append-only, fsynced, hash-linked metadata. A torn/invalid record fails closed, never truncates. */
export class ProductionGovernanceJournal {
  private sequence = 0
  private head = ''
  private length = 0
  private ready = false
  private identifier = ''
  private readonly projections = new Map<string, GovernanceProjection>()
  private readonly pending = new Map<string, Extract<Payload, { kind: 'pending' }>>()
  private readonly instances = new Map<string, GovernanceAnchor>()
  readonly path: string
  private readonly fileIdentity: string
  private constructor(
    directory: string,
    readonly dataSetId: string,
    create: boolean
  ) {
    z.uuid().parse(dataSetId)
    this.path = join(canonicalProductionDirectory(directory), 'governance-' + dataSetId + '.jsonl')
    if (create) {
      const fd = openSync(this.path, 'wx', 0o600)
      try {
        fsyncSync(fd)
      } finally {
        closeSync(fd)
      }
    }
    const stat = lstatSync(this.path)
    if (!stat.isFile() || stat.isSymbolicLink()) throw Error('GOVERNANCE_UNSAFE_FILE')
    this.fileIdentity = String(stat.dev) + ':' + String(stat.ino)
    this.read()
  }
  static create(
    directory: string,
    dataSetId: string,
    anchor: GovernanceAnchor,
    projections: GovernanceProjection[],
    journalId: string = randomUUID()
  ): ProductionGovernanceJournal {
    const journal = new ProductionGovernanceJournal(directory, dataSetId, true)
    journal.append({ kind: 'header', format: 1, dataSetId, journalId: z.uuid().parse(journalId) })
    journal.append({ kind: 'instance', anchor: anchorSchema.parse(anchor) })
    for (const projection of projections)
      journal.append({ kind: 'baseline', projection: parseGovernanceProjection(projection) })
    journal.append({ kind: 'ready' })
    return journal
  }
  static open(directory: string, dataSetId: string): ProductionGovernanceJournal {
    const journal = new ProductionGovernanceJournal(directory, dataSetId, false)
    if (!journal.ready) throw Error('GOVERNANCE_INITIALIZATION_INCOMPLETE')
    return journal
  }
  private read(): void {
    const descriptor = openSync(this.path, 'r')
    let tail = Buffer.alloc(0)
    const buffer = Buffer.alloc(65536)
    try {
      for (;;) {
        const count = readSync(descriptor, buffer, 0, buffer.length, null)
        if (!count) break
        this.length += count
        tail = Buffer.concat([tail, buffer.subarray(0, count)])
        let boundary: number
        while ((boundary = tail.indexOf(10)) !== -1) {
          const line = lineSchema.parse(JSON.parse(tail.subarray(0, boundary).toString('utf8')))
          const { hash, ...body } = line
          if (
            line.sequence !== this.sequence ||
            line.previous !== this.head ||
            hash !== digest(JSON.stringify(body))
          )
            throw Error('GOVERNANCE_CHAIN_INVALID')
          this.accept(line.payload)
          this.head = hash
          this.sequence++
          tail = tail.subarray(boundary + 1)
        }
        if (tail.length > 1048576) throw Error('GOVERNANCE_RECORD_LIMIT')
      }
      if (tail.length) throw Error('GOVERNANCE_TORN_RECORD')
    } finally {
      closeSync(descriptor)
    }
  }
  private accept(payload: Payload): void {
    if (this.sequence === 0 && payload.kind !== 'header') throw Error('GOVERNANCE_HEADER_MISSING')
    if (payload.kind === 'header') {
      if (this.sequence !== 0 || payload.dataSetId !== this.dataSetId)
        throw Error('GOVERNANCE_IDENTITY_MISMATCH')
      this.identifier = payload.journalId
    } else if (payload.kind === 'instance') {
      if (this.instances.has(payload.anchor.instanceId))
        throw Error('GOVERNANCE_INSTANCE_DUPLICATE')
      this.instances.set(payload.anchor.instanceId, payload.anchor)
    } else if (payload.kind === 'baseline') {
      if (this.ready) throw Error('GOVERNANCE_BASELINE_AFTER_READY')
      this.projections.set(governanceKey(payload.projection), payload.projection)
    } else if (payload.kind === 'ready') {
      if (this.ready || !this.instances.size) throw Error('GOVERNANCE_READY_INVALID')
      this.ready = true
    } else if (payload.kind === 'pending') {
      if (!this.ready || this.pending.has(payload.token) || !this.instances.has(payload.instanceId))
        throw Error('GOVERNANCE_PENDING_INVALID')
      this.pending.set(payload.token, payload)
    } else {
      const tokens = [...payload.committed, ...payload.rolledBack]
      if (
        new Set(tokens).size !== tokens.length ||
        tokens.some((token) => !this.pending.has(token))
      )
        throw Error('GOVERNANCE_SETTLEMENT_INVALID')
      for (const token of payload.committed) {
        const projection = this.pending.get(token)!.projection
        this.projections.set(governanceKey(projection), projection)
      }
      for (const token of tokens) this.pending.delete(token)
    }
  }
  private append(payload: Payload): void {
    const parsed = payloadSchema.parse(payload)
    const stat = lstatSync(this.path)
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      String(stat.dev) + ':' + String(stat.ino) !== this.fileIdentity ||
      stat.size !== this.length
    )
      throw Error('GOVERNANCE_FILE_CHANGED')
    const body = { sequence: this.sequence, previous: this.head, payload: parsed }
    const hash = digest(JSON.stringify(body)),
      bytes = Buffer.from(JSON.stringify({ ...body, hash }) + '\n')
    const descriptor = openSync(this.path, 'a')
    try {
      let offset = 0
      while (offset < bytes.length)
        offset += writeSync(descriptor, bytes, offset, bytes.length - offset)
      fsyncSync(descriptor)
    } finally {
      closeSync(descriptor)
    }
    this.accept(parsed)
    this.length += bytes.length
    this.sequence++
    this.head = hash
  }
  before(anchor: GovernanceAnchor, projection: GovernanceProjection): string {
    this.assertAnchor(anchor)
    const token = randomUUID()
    this.append({ kind: 'pending', token, instanceId: anchor.instanceId, projection })
    return token
  }
  assertAnchor(anchor: GovernanceAnchor): void {
    anchorSchema.parse(anchor)
    const expected = this.instances.get(anchor.instanceId)
    if (!expected || expected.device !== anchor.device || expected.inode !== anchor.inode)
      throw Error('GOVERNANCE_INSTANCE_MISMATCH')
  }
  pendingTokens(anchor: GovernanceAnchor): string[] {
    this.assertAnchor(anchor)
    return [...this.pending.values()]
      .filter((event) => event.instanceId === anchor.instanceId)
      .map((event) => event.token)
  }
  resolve(anchor: GovernanceAnchor, committed: string[], rolledBack: string[]): void {
    this.assertAnchor(anchor)
    const tokens = [...committed, ...rolledBack]
    if (
      new Set(tokens).size !== tokens.length ||
      tokens.some((token) => this.pending.get(token)?.instanceId !== anchor.instanceId)
    )
      throw Error('GOVERNANCE_PENDING_OWNER_MISMATCH')
    this.append({ kind: 'resolve', committed, rolledBack })
  }
  get journalId(): string {
    return this.identifier
  }
  enrollInstance(anchor: GovernanceAnchor): void {
    this.snapshot()
    if (this.instances.has(anchor.instanceId)) throw Error('GOVERNANCE_INSTANCE_DUPLICATE')
    this.append({ kind: 'instance', anchor: anchorSchema.parse(anchor) })
  }
  snapshot(): { revision: string; projections: GovernanceProjection[] } {
    if (!this.ready || this.pending.size) throw Error('GOVERNANCE_STATE_UNCERTAIN')
    return { revision: this.head, projections: structuredClone([...this.projections.values()]) }
  }
}
