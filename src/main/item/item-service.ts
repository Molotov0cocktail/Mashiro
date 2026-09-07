import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { SqliteStore } from '../data/sqlite.js'
import { itemSourceClosure } from './item-retention.js'
import { retentionEpoch } from '../retention/retention-schema.js'
import {
  itemContentSchema,
  itemRecordSchema,
  itemProposalSchema,
  itemReceiptSchema,
  itemQueryInputSchema,
  itemInspectInputSchema,
  itemMutateInputSchema,
  itemProposalActionInputSchema,
  itemOperationInputSchema,
  itemPreviewInputSchema,
  itemPreviewRequestSchema,
  itemConfirmInputSchema,
  itemPermissionInputSchema,
  itemSetPermissionsInputSchema,
  type ItemContent,
  type ItemRecord,
  type ItemProposal,
  type ItemReceipt,
  type ItemSource,
  type ItemPermissions,
  type ItemMutation
} from '../../shared/item-contract.js'

type Code =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'STALE_WRITE'
  | 'PERMISSION_DENIED'
  | 'INTEGRITY'
  | 'CONFLICT'
  | 'STORAGE_UNAVAILABLE'
export class ItemError extends Error {
  constructor(readonly code: Code) {
    super(code)
  }
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function itemOperationId(assistantId: string, requestId: string, slot: string): string {
  const h = hash([assistantId, requestId, slot])
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}
export interface ItemExecution {
  assistantId: string
  requestId: string
  jobId?: string
  fingerprint: string
  sources: ItemSource[]
  assertCurrent: () => void
  commitReceipt?: (receipt: ItemReceipt) => void
}
type BackgroundItemExecution = Omit<ItemExecution, 'requestId'> & { jobId: string }
type SourceCheck = (
  source: ItemSource,
  assistantId: string,
  fingerprint: string,
  visited: Set<string>
) => void
/** SQLite owns formal business state; receipts intentionally contain no business body. */
export class ItemService {
  constructor(
    private readonly store: SqliteStore,
    private readonly endpoint: (assistantId: string) => {
      fingerprint: string | null
      display: string | null
    },
    private readonly sourceCheck: SourceCheck,
    private readonly changed: (exceptRequestId?: string) => void = () => undefined,
    private readonly fault?: (phase: string) => void
  ) {}
  private handle<T extends z.ZodType, R>(schema: T, input: unknown, fn: (value: z.infer<T>) => R) {
    try {
      return { ok: true as const, data: fn(schema.parse(input)) }
    } catch (error) {
      const code: Code =
        error instanceof ItemError
          ? error.code
          : error instanceof z.ZodError
            ? 'INVALID_INPUT'
            : 'STORAGE_UNAVAILABLE'
      return {
        ok: false as const,
        error: {
          code,
          message: {
            INVALID_INPUT: '事项参数不正确',
            NOT_FOUND: '事项、提案或操作不存在',
            STALE_WRITE: '内容或权限已变化，请刷新',
            PERMISSION_DENIED: '事项或来源权限不允许此操作',
            INTEGRITY: '来源不可用，请核查后明确重写',
            CONFLICT: '同一操作身份不能用于不同内容',
            STORAGE_UNAVAILABLE: '事项存储暂不可用，未确认成功'
          }[code]
        }
      }
    }
  }
  private active(id: string): void {
    if (
      !this.store.database
        .prepare(
          'SELECT 1 FROM assistants WHERE id=? AND archived_at IS NULL AND id NOT IN(SELECT id FROM assistant_tombstones)'
        )
        .get(id)
    )
      throw new ItemError('PERMISSION_DENIED')
  }
  private unavailable(sources: ItemSource[]): boolean {
    return itemSourceClosure(this.store, sources).some(
      (s) =>
        !!this.store.database
          .prepare("SELECT 1 FROM memory_suppressions WHERE source_id=? AND kind='withdrawal'")
          .get(s.id) ||
        !!this.store.database
          .prepare('SELECT 1 FROM content_tombstones WHERE kind=? AND id=?')
          .get(s.type === 'user-round' ? 'round' : s.type, s.id) ||
        ((s.type === 'round' || s.type === 'user-round') &&
          !!this.store.database
            .prepare('SELECT 1 FROM retention_original_trash WHERE request_id=?')
            .get(s.id)) ||
        ((s.type === 'round' || s.type === 'user-round' || s.type === 'manual') &&
          !!this.store.database
            .prepare('SELECT 1 FROM assistant_tombstones WHERE id=?')
            .get(s.assistantId))
    )
  }
  private readItem(id: string): ItemRecord {
    const row = this.store.database.prepare('SELECT record_json FROM items WHERE id=?').get(id)
    if (!row) throw new ItemError('NOT_FOUND')
    const record = itemRecordSchema.parse(JSON.parse(String(row.record_json)))
    record.sourceUnavailable ||= this.unavailable(record.sources)
    return record
  }
  private readProposal(id: string): ItemProposal {
    const row = this.store.database
      .prepare('SELECT record_json FROM item_proposals WHERE id=?')
      .get(id)
    if (!row) throw new ItemError('NOT_FOUND')
    const record = itemProposalSchema.parse(JSON.parse(String(row.record_json)))
    record.sourceUnavailable ||= this.unavailable(record.sources)
    if (record.sourceUnavailable && record.state !== 'ACCEPTED') {
      record.candidate = {
        kind: record.candidate.kind,
        title: '来源已清理的提案',
        description: '',
        status: 'open',
        dueAt: null,
        timeZone: null,
        parentId: null,
        relatedIds: [],
        counterpart: ''
      }
      record.state = 'STALE'
    }
    return record
  }
  private receipt(
    commandId: string,
    type: 'item' | 'proposal' | null,
    id: string | null,
    version: number,
    state: ItemReceipt['state'] = 'SUCCEEDED'
  ): ItemReceipt {
    return {
      operationId: commandId,
      objectId: id,
      objectVersion: version,
      objectType: type,
      state,
      confirmationId: null,
      summary:
        state === 'SUCCEEDED'
          ? '事项操作已提交'
          : state === 'SUPPRESSED'
            ? '相同来源的建议已处理，未重复建立'
            : '事项操作状态已核查'
    }
  }
  private command(
    assistantId: string,
    commandId: string,
    intent: unknown,
    fn: () => ItemReceipt,
    execution?: ItemExecution | BackgroundItemExecution
  ): ItemReceipt {
    this.active(assistantId)
    execution?.assertCurrent()
    const digest = hash(intent)
    const result = this.store.transaction(() => {
      this.active(assistantId)
      execution?.assertCurrent()
      const row = this.store.database
        .prepare('SELECT assistant_id,intent_hash,receipt_json FROM item_commands WHERE id=?')
        .get(commandId)
      if (row) {
        if (row.assistant_id !== assistantId || row.intent_hash !== digest)
          throw new ItemError('CONFLICT')
        const receipt = itemReceiptSchema.parse(JSON.parse(String(row.receipt_json)))
        execution?.commitReceipt?.(receipt)
        return receipt
      }
      const reservation = this.store.database
        .prepare('SELECT id,assistant_id FROM item_confirmations WHERE command_id=?')
        .get(commandId)
      if (
        reservation &&
        (reservation.assistant_id !== assistantId ||
          ![true, false].some(
            (accept) => hash({ confirmationId: String(reservation.id), accept }) === digest
          ))
      )
        throw new ItemError('CONFLICT')
      const receipt = fn()
      this.fault?.('before-receipt')
      this.store.database
        .prepare('INSERT INTO item_commands VALUES(?,?,?,?)')
        .run(commandId, assistantId, digest, JSON.stringify(receipt))
      execution?.commitReceipt?.(receipt)
      this.fault?.('before-commit')
      return receipt
    })
    return result
  }
  permissionState(assistantId: string, fingerprint?: string): ItemPermissions {
    const row = this.store.database
      .prepare('SELECT * FROM item_permissions WHERE assistant_id=?')
      .get(assistantId)
    const bound = this.endpoint(assistantId)
    const endpoint =
      fingerprint === undefined
        ? bound
        : { fingerprint, display: bound.fingerprint === fingerprint ? bound.display : null }
    const grant = endpoint.fingerprint
      ? this.store.database
          .prepare('SELECT allowed FROM item_recipients WHERE assistant_id=? AND fingerprint=?')
          .get(assistantId, endpoint.fingerprint)
      : undefined
    return {
      assistantId,
      version: Number(row?.version ?? 0),
      read: row?.read_allowed === 1,
      write: row?.write_allowed === 1,
      propose: row?.propose_allowed === 1,
      receive: grant?.allowed === 1,
      endpointDisplay: endpoint.display,
      endpointFingerprint: endpoint.fingerprint
    }
  }
  permissions(input: unknown) {
    return this.handle(itemPermissionInputSchema, input, (v) => {
      this.active(v.assistantId)
      return this.permissionState(v.assistantId)
    })
  }
  setPermissions(input: unknown) {
    return this.handle(itemSetPermissionsInputSchema, input, (v) => {
      this.store.transaction(() => {
        this.active(v.assistantId)
        const current = this.permissionState(v.assistantId)
        if (current.version !== v.expectedVersion) throw new ItemError('STALE_WRITE')
        if (v.receive && !current.endpointFingerprint) throw new ItemError('PERMISSION_DENIED')
        this.store.database
          .prepare(
            'INSERT INTO item_permissions VALUES(?,?,?,?,?) ON CONFLICT(assistant_id) DO UPDATE SET version=excluded.version,read_allowed=excluded.read_allowed,write_allowed=excluded.write_allowed,propose_allowed=excluded.propose_allowed'
          )
          .run(
            v.assistantId,
            current.version + 1,
            Number(v.read),
            Number(v.write),
            Number(v.propose)
          )
        if (current.endpointFingerprint)
          this.store.database
            .prepare(
              'INSERT INTO item_recipients VALUES(?,?,?) ON CONFLICT(assistant_id,fingerprint) DO UPDATE SET allowed=excluded.allowed'
            )
            .run(v.assistantId, current.endpointFingerprint, Number(v.receive))
      })
      this.changed()
      return this.permissionState(v.assistantId)
    })
  }
  assertAccess(
    execution: ItemExecution | BackgroundItemExecution,
    action: 'read' | 'write' | 'propose'
  ): void {
    execution.assertCurrent()
    this.active(execution.assistantId)
    if (
      !execution.jobId &&
      this.endpoint(execution.assistantId).fingerprint !== execution.fingerprint
    )
      throw new ItemError('PERMISSION_DENIED')
    const p = this.permissionState(execution.assistantId, execution.fingerprint)
    if (!p.read || !p.receive || !p[action] || p.endpointFingerprint !== execution.fingerprint)
      throw new ItemError('PERMISSION_DENIED')
  }
  assertSource(
    source: ItemSource,
    assistantId: string,
    fingerprint: string,
    visited = new Set<string>()
  ): void {
    const key = `${source.type}:${source.id}:${source.version}`
    if (visited.has(key) || visited.size >= 128) throw new ItemError('INTEGRITY')
    const next = new Set(visited)
    next.add(key)
    if (source.type !== 'item' && source.type !== 'proposal') {
      this.sourceCheck(source, assistantId, fingerprint, visited)
      return
    }
    const p = this.permissionState(assistantId, fingerprint)
    if (!p.read || !p.receive || p.endpointFingerprint !== fingerprint)
      throw new ItemError('PERMISSION_DENIED')
    const record = source.type === 'item' ? this.readItem(source.id) : this.readProposal(source.id)
    if (record.version !== source.version || record.originAssistantId !== source.assistantId)
      throw new ItemError('PERMISSION_DENIED')
    if (
      source.type === 'proposal' &&
      (record.sourceUnavailable || record.originAssistantId !== assistantId)
    )
      throw new ItemError('PERMISSION_DENIED')
    for (const edge of record.sources) {
      try {
        this.assertSource(edge, assistantId, fingerprint, next)
      } catch (error) {
        if (
          source.type !== 'item' ||
          !(error instanceof Error) ||
          !('code' in error) ||
          error.code !== 'PERMISSION_DENIED'
        )
          throw error
        const closure = itemSourceClosure(this.store, [edge])
        const withdrawn = closure.some(
          (ancestor) =>
            !!this.store.database
              .prepare("SELECT 1 FROM memory_suppressions WHERE source_id=? AND kind='withdrawal'")
              .get(ancestor.id)
        )
        const retired =
          this.store.database
            .prepare('SELECT 1 FROM content_tombstones WHERE kind=? AND id=?')
            .get(edge.type === 'user-round' ? 'round' : edge.type, edge.id) ||
          ((edge.type === 'round' || edge.type === 'user-round') &&
            this.store.database
              .prepare('SELECT 1 FROM retention_original_trash WHERE request_id=?')
              .get(edge.id)) ||
          ((edge.type === 'round' || edge.type === 'user-round' || edge.type === 'manual') &&
            this.store.database
              .prepare('SELECT 1 FROM assistant_tombstones WHERE id=?')
              .get(edge.assistantId))
        const retained = this.store.database
          .prepare(
            'SELECT recipients_json FROM item_retained_edges WHERE item_id=? AND item_version=? AND source_json=?'
          )
          .get(record.id, record.version, JSON.stringify(edge))
        if (
          withdrawn ||
          !retired ||
          !retained ||
          !(JSON.parse(String(retained.recipients_json)) as [string, string][]).some(
            ([a, f]) => a === assistantId && f === fingerprint
          )
        )
          throw error
        for (const ancestor of closure) {
          if (JSON.stringify(ancestor) === JSON.stringify(edge)) continue
          const ancestorRetired =
            this.store.database
              .prepare('SELECT 1 FROM content_tombstones WHERE kind=? AND id=?')
              .get(ancestor.type === 'user-round' ? 'round' : ancestor.type, ancestor.id) ||
            ((ancestor.type === 'round' || ancestor.type === 'user-round') &&
              this.store.database
                .prepare('SELECT 1 FROM retention_original_trash WHERE request_id=?')
                .get(ancestor.id)) ||
            ((ancestor.type === 'round' ||
              ancestor.type === 'user-round' ||
              ancestor.type === 'manual') &&
              this.store.database
                .prepare('SELECT 1 FROM assistant_tombstones WHERE id=?')
                .get(ancestor.assistantId))
          if (!ancestorRetired) this.assertSource(ancestor, assistantId, fingerprint, next)
        }
      }
    }
  }
  private checkContent(
    content: ItemContent,
    targetId?: string,
    execution?: ItemExecution | BackgroundItemExecution
  ): void {
    itemContentSchema.parse(content)
    if (content.parentId === targetId || content.relatedIds.includes(targetId ?? ''))
      throw new ItemError('INVALID_INPUT')
    for (const id of [...content.relatedIds, ...(content.parentId ? [content.parentId] : [])]) {
      const record = this.readItem(id)
      if (execution)
        this.assertSource(
          { type: 'item', id, version: record.version, assistantId: record.originAssistantId },
          execution.assistantId,
          execution.fingerprint
        )
    }
    const visited = new Set<string>(targetId ? [targetId] : [])
    let cursor = content.parentId
    while (cursor) {
      if (visited.has(cursor) || visited.size >= 128) throw new ItemError('CONFLICT')
      visited.add(cursor)
      cursor = this.readItem(cursor).content.parentId
    }
  }
  private saveItem(record: ItemRecord): void {
    const previous = this.store.database
      .prepare('SELECT version FROM items WHERE id=?')
      .get(record.id)
    this.store.database
      .prepare(
        'INSERT INTO items VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,record_json=excluded.record_json'
      )
      .run(
        record.id,
        record.version,
        record.originProposalId,
        JSON.stringify(itemRecordSchema.parse(record))
      )
    this.store.database
      .prepare('INSERT OR IGNORE INTO daily_item_changes VALUES(?,?,?)')
      .run(record.id, record.version, JSON.stringify(record))
    // Persist the stop in the same item transaction: reopening before the next tick
    // must not revive the old reminder occurrence.
    if (['completed', 'cancelled'].includes(record.content.status))
      this.store.database
        .prepare(
          "UPDATE reminders SET state='CANCELLED',record_json=json_set(record_json,'$.state','CANCELLED','$.updatedAt',?) WHERE item_id=? AND state NOT IN ('CANCELLED','HANDLED','EXPIRED')"
        )
        .run(record.updatedAt, record.id)
    this.edges('item', record.id, record.version, record.sources)
    // Inherit only previously audited recipients for this exact object's unchanged source edges.
    if (previous && Number(previous.version) < record.version)
      for (const source of record.sources)
        this.store.database
          .prepare(
            'INSERT OR IGNORE INTO item_retained_edges SELECT item_id,?,source_json,recipients_json FROM item_retained_edges WHERE item_id=? AND item_version=? AND source_json=?'
          )
          .run(record.version, record.id, Number(previous.version), JSON.stringify(source))
  }
  private saveProposal(record: ItemProposal, identity?: string): void {
    if (identity)
      this.store.database
        .prepare('INSERT INTO item_proposals VALUES(?,?,?,?,?,?)')
        .run(
          record.id,
          record.version,
          record.originAssistantId,
          record.state,
          identity,
          JSON.stringify(itemProposalSchema.parse(record))
        )
    else
      this.store.database
        .prepare('UPDATE item_proposals SET version=?,state=?,record_json=? WHERE id=?')
        .run(
          record.version,
          record.state,
          JSON.stringify(itemProposalSchema.parse(record)),
          record.id
        )
    this.edges('proposal', record.id, record.version, record.sources)
  }
  private edges(type: string, id: string, version: number, sources: ItemSource[]): void {
    for (const source of sources)
      this.store.database
        .prepare('INSERT OR IGNORE INTO item_sources VALUES(?,?,?,?,?,?,?)')
        .run(type, id, version, source.type, source.id, source.assistantId, source.version)
  }
  query(input: unknown) {
    return this.handle(itemQueryInputSchema, input, (v) => {
      this.active(v.assistantId)
      const allItems = this.store.database
        .prepare('SELECT record_json FROM items ORDER BY rowid DESC')
        .all()
        .map((r) => this.readItem(itemRecordSchema.parse(JSON.parse(String(r.record_json))).id))
      const matches = (content: ItemContent) =>
        (v.kind === 'all' || content.kind === v.kind) &&
        (v.status === 'all' || content.status === v.status) &&
        (content.title.includes(v.query) || content.description.includes(v.query))
      const items = v.view === 'items' ? allItems.filter((r) => matches(r.content)) : []
      const proposals =
        v.view === 'proposals'
          ? this.store.database
              .prepare('SELECT record_json FROM item_proposals ORDER BY rowid DESC')
              .all()
              .map((r) =>
                this.readProposal(itemProposalSchema.parse(JSON.parse(String(r.record_json))).id)
              )
              .filter((r) => matches(r.candidate))
          : []
      const count = items.length + proposals.length
      return {
        items: items.slice(v.cursor, v.cursor + v.limit),
        proposals: proposals.slice(v.cursor, v.cursor + v.limit),
        formalCount: allItems.length,
        nextCursor: count > v.cursor + v.limit ? v.cursor + v.limit : null
      }
    })
  }
  hasNavigableItem(assistantId: string, itemId: string): boolean {
    try {
      this.active(assistantId)
      return Boolean(this.store.database.prepare('SELECT 1 FROM items WHERE id=?').get(itemId))
    } catch {
      return false
    }
  }
  inspect(input: unknown) {
    return this.handle(itemInspectInputSchema, input, (v) => {
      this.active(v.assistantId)
      const receipts = this.store.database
        .prepare(
          'SELECT receipt_json FROM item_commands WHERE assistant_id=? ORDER BY rowid DESC LIMIT 100'
        )
        .all(v.assistantId)
        .map((r) => itemReceiptSchema.parse(JSON.parse(String(r.receipt_json))))
        .filter((r) => r.objectId === v.id)
      return {
        item: v.type === 'item' ? this.readItem(v.id) : null,
        proposal: v.type === 'proposal' ? this.readProposal(v.id) : null,
        receipts
      }
    })
  }
  mutate(input: unknown) {
    return this.handle(itemMutateInputSchema, input, (v) =>
      this.applyMutation(v.assistantId, v.commandId, v.mutation, [])
    )
  }
  private mergeItemSources(sources: ItemSource[], previous?: ItemRecord): ItemSource[] {
    const merged = [
      ...new Map(
        sources
          .filter(
            (source) =>
              !(
                previous &&
                source.type === 'item' &&
                source.id === previous.id &&
                source.version === previous.version &&
                source.assistantId === previous.originAssistantId
              )
          )
          .map((source) => [
            JSON.stringify([source.type, source.id, source.version, source.assistantId]),
            source
          ])
      ).values()
    ]
    if (merged.length > 64) throw new ItemError('CONFLICT')
    // Do not erase another object's genuine dependency to make an indirect cycle disappear.
    if (
      previous &&
      itemSourceClosure(this.store, merged).some(
        (source) => source.type === 'item' && source.id === previous.id
      )
    )
      throw new ItemError('CONFLICT')
    return merged
  }
  applyMutation(
    assistantId: string,
    commandId: string,
    mutation: ItemMutation,
    sources: ItemSource[],
    execution?: ItemExecution | BackgroundItemExecution
  ): ItemReceipt {
    return this.command(
      assistantId,
      commandId,
      { mutation, sources },
      () => {
        if (execution) {
          this.assertAccess(execution, 'write')
          for (const source of sources)
            this.assertSource(source, assistantId, execution.fingerprint)
        }
        const now = new Date().toISOString()
        let record: ItemRecord
        if (mutation.action === 'create') {
          this.checkContent(mutation.content, undefined, execution)
          record = {
            id: randomUUID(),
            version: 1,
            content: mutation.content,
            originAssistantId: assistantId,
            originProposalId: null,
            createdAt: now,
            updatedAt: now,
            sources: this.mergeItemSources(sources),
            sourceUnavailable: false
          }
        } else {
          record = this.readItem(mutation.id)
          if (record.version !== mutation.expectedVersion) throw new ItemError('STALE_WRITE')
          if (execution)
            this.assertSource(
              {
                type: 'item',
                id: record.id,
                version: record.version,
                assistantId: record.originAssistantId
              },
              assistantId,
              execution.fingerprint
            )
          const content =
            mutation.action === 'update'
              ? mutation.content
              : { ...record.content, status: mutation.status }
          if (
            mutation.action === 'update' &&
            ((record.content.parentId && record.content.parentId !== content.parentId) ||
              record.content.relatedIds.some((id) => !content.relatedIds.includes(id)))
          )
            throw new ItemError('PERMISSION_DENIED')
          this.checkContent(content, record.id, execution)
          // A local full edit is an explicit user rewrite. A mere state change retains provenance.
          record = {
            ...record,
            content,
            version: record.version + 1,
            updatedAt: now,
            sources:
              mutation.action === 'update' && !execution
                ? this.mergeItemSources(sources, record)
                : this.mergeItemSources([...record.sources, ...sources], record),
            sourceUnavailable:
              mutation.action === 'update' && !execution ? false : record.sourceUnavailable
          }
        }
        this.saveItem(record)
        return this.receipt(commandId, 'item', record.id, record.version)
      },
      execution
    )
  }
  backgroundProposal(
    execution: Omit<ItemExecution, 'requestId'> & { jobId: string },
    commandId: string,
    candidate: ItemContent,
    identity: string
  ): ItemReceipt {
    this.assertAccess(execution, 'propose')
    return this.proposeLocal(
      execution.assistantId,
      commandId,
      candidate,
      execution.sources,
      identity,
      execution
    )
  }
  proposeLocal(
    assistantId: string,
    commandId: string,
    candidate: ItemContent,
    sources: ItemSource[],
    identity = hash([commandId]),
    execution?: ItemExecution | BackgroundItemExecution
  ): ItemReceipt {
    return this.command(
      assistantId,
      commandId,
      { candidate, sources, identity },
      () => {
        if (execution) {
          this.assertAccess(execution, 'propose')
          for (const source of sources)
            this.assertSource(source, assistantId, execution.fingerprint)
        }
        this.checkContent(candidate, undefined, execution)
        const old = this.store.database
          .prepare(
            'SELECT id,version,state FROM item_proposals WHERE origin_assistant_id=? AND identity_hash=?'
          )
          .get(assistantId, identity)
        if (old)
          return this.receipt(
            commandId,
            'proposal',
            String(old.id),
            Number(old.version),
            'SUPPRESSED'
          )
        const now = new Date().toISOString()
        const proposal: ItemProposal = {
          id: randomUUID(),
          version: 1,
          candidate,
          originAssistantId: assistantId,
          state: 'DRAFT_PROPOSAL',
          acceptedItemId: null,
          sources,
          sourceUnavailable: false,
          createdAt: now,
          updatedAt: now
        }
        this.saveProposal(proposal, identity)
        return this.receipt(commandId, 'proposal', proposal.id, 1)
      },
      execution
    )
  }
  proposalAction(input: unknown) {
    return this.handle(itemProposalActionInputSchema, input, (v) => this.actProposal(v))
  }
  actProposal(
    v: z.infer<typeof itemProposalActionInputSchema>,
    execution?: ItemExecution | BackgroundItemExecution
  ): ItemReceipt {
    return this.command(
      v.assistantId,
      v.commandId,
      v,
      () => {
        const proposal = this.readProposal(v.id)
        if (proposal.version !== v.expectedVersion) throw new ItemError('STALE_WRITE')
        if (proposal.state === 'ACCEPTED') throw new ItemError('CONFLICT')
        if (v.candidate && v.action !== 'revise') throw new ItemError('INVALID_INPUT')
        if (
          ['discuss', 'revise'].includes(v.action) &&
          proposal.originAssistantId !== v.assistantId
        )
          throw new ItemError('PERMISSION_DENIED')
        if (execution) {
          this.assertAccess(execution, v.action === 'accept' ? 'write' : 'propose')
          this.assertSource(
            {
              type: 'proposal',
              id: proposal.id,
              version: proposal.version,
              assistantId: proposal.originAssistantId
            },
            v.assistantId,
            execution.fingerprint
          )
        }
        if (proposal.sourceUnavailable && ['accept', 'discuss', 'revise'].includes(v.action))
          throw new ItemError('INTEGRITY')
        if (v.action === 'accept') {
          this.checkContent(proposal.candidate, undefined, execution)
          const now = new Date().toISOString()
          const record: ItemRecord = {
            id: randomUUID(),
            version: 1,
            content: proposal.candidate,
            originAssistantId: proposal.originAssistantId,
            originProposalId: proposal.id,
            createdAt: now,
            updatedAt: now,
            sources: proposal.sources,
            sourceUnavailable: false
          }
          this.saveItem(record)
          proposal.acceptedItemId = record.id
        }
        if (v.action === 'revise' && execution)
          proposal.sources = [
            ...new Map(
              [
                ...proposal.sources,
                ...execution.sources.filter((s) => !(s.type === 'proposal' && s.id === proposal.id))
              ].map((s) => [JSON.stringify(s), s])
            ).values()
          ]
        if (v.action === 'revise') {
          if (!v.candidate) throw new ItemError('INVALID_INPUT')
          this.checkContent(v.candidate, undefined, execution)
          proposal.candidate = v.candidate
        }
        proposal.state = (
          {
            accept: 'ACCEPTED',
            reject: 'REJECTED',
            defer: 'DEFERRED',
            resume: 'DRAFT_PROPOSAL',
            discuss: 'DISCUSSING',
            revise: 'DISCUSSING'
          } as const
        )[v.action]
        proposal.version++
        proposal.updatedAt = new Date().toISOString()
        this.saveProposal(proposal)
        if (v.action === 'reject') {
          const row = this.store.database
            .prepare('SELECT identity_hash FROM item_proposals WHERE id=?')
            .get(proposal.id)!
          this.store.database
            .prepare('INSERT OR IGNORE INTO item_rejections VALUES(?,?)')
            .run(String(row.identity_hash), proposal.id)
        }
        return this.receipt(v.commandId, 'proposal', proposal.id, proposal.version)
      },
      execution
    )
  }
  operation(input: unknown) {
    return this.handle(itemOperationInputSchema, input, (v) => {
      this.active(v.assistantId)
      const row = this.store.database
        .prepare('SELECT receipt_json FROM item_commands WHERE id=? AND assistant_id=?')
        .get(v.commandId, v.assistantId)
      if (row) return itemReceiptSchema.parse(JSON.parse(String(row.receipt_json)))
      const pending = this.store.database
        .prepare('SELECT id,state FROM item_confirmations WHERE command_id=? AND assistant_id=?')
        .get(v.commandId, v.assistantId)
      return pending?.state === 'pending'
        ? {
            ...this.receipt(v.commandId, null, null, 0, 'PENDING_CONFIRMATION'),
            confirmationId: String(pending.id)
          }
        : this.receipt(v.commandId, null, null, 0, 'CONFIRMED_NOT_APPLIED')
    })
  }
  private previewGuard(): string {
    // Pure protocol/receipt/round completion is not a business or authority change.
    const tables = [
      'items',
      'item_proposals',
      'item_sources',
      'item_permissions',
      'item_recipients',
      'item_tombstones',
      'item_retained_edges',
      'assistants',
      'assistant_state',
      'assistant_tombstones',
      'provider_connections',
      'assistant_provider_bindings',
      'history_permissions',
      'history_recipient_grants',
      'memory_objects',
      'memory_permissions',
      'memory_recipients',
      'memory_suppressions',
      'content_tombstones',
      'retention_original_trash',
      'retained_source_edges'
    ]
    return hash([
      ...tables.map((table) =>
        this.store.database.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all()
      ),
      this.store.database.prepare('SELECT generation FROM retention_state WHERE singleton=1').get()
    ])
  }
  preview(input: unknown, execution?: ItemExecution | BackgroundItemExecution) {
    return this.handle(itemPreviewRequestSchema, input, (request) => {
      this.active(request.assistantId)
      if (execution) {
        execution.assertCurrent()
        this.assertAccess(execution, 'write')
        for (const source of execution.sources)
          this.assertSource(source, execution.assistantId, execution.fingerprint)
      }
      let v: z.infer<typeof itemPreviewInputSchema>
      if (request.action === 'recover') {
        const row = this.store.database
          .prepare(
            'SELECT payload_json,state FROM item_confirmations WHERE command_id=? AND assistant_id=?'
          )
          .get(request.commandId, request.assistantId)
        if (!row || row.state !== 'pending') throw new ItemError('NOT_FOUND')
        v = itemPreviewInputSchema.parse(JSON.parse(String(row.payload_json)).plan)
      } else v = request
      return this.store.transaction(() => {
        const previous = this.store.database
          .prepare('SELECT * FROM item_confirmations WHERE command_id=?')
          .get(v.commandId)
        if (previous) {
          if (
            previous.assistant_id !== v.assistantId ||
            hash(JSON.parse(String(previous.payload_json)).plan) !== hash(v)
          )
            throw new ItemError('CONFLICT')
          if (
            previous.state !== 'pending' ||
            JSON.parse(String(previous.payload_json)).guard !== this.previewGuard()
          )
            throw new ItemError('STALE_WRITE')
        }
        if (this.store.database.prepare('SELECT 1 FROM item_commands WHERE id=?').get(v.commandId))
          throw new ItemError('CONFLICT')
        if (new Set(v.targets.map((t) => t.id)).size !== v.targets.length)
          throw new ItemError('INVALID_INPUT')
        const targets = v.targets.map((t) => {
          const r = this.readItem(t.id)
          if (r.version !== t.expectedVersion) throw new ItemError('STALE_WRITE')
          return r
        })
        const relatedItemIds = this.store.database
          .prepare('SELECT record_json FROM items')
          .all()
          .map((r) => itemRecordSchema.parse(JSON.parse(String(r.record_json))))
          .filter((r) =>
            v.targets.some(
              (t) => r.content.parentId === t.id || r.content.relatedIds.includes(t.id)
            )
          )
          .map((r) => r.id)
        if (v.action === 'delete' && v.content) throw new ItemError('INVALID_INPUT')
        if (v.action === 'replace-links' || v.action === 'replace-content') {
          if (targets.length !== 1 || !v.content) throw new ItemError('INVALID_INPUT')
          this.checkContent(v.content, targets[0]!.id, execution)
        }
        if (execution) {
          execution.assertCurrent()
          for (const item of [...targets, ...relatedItemIds.map((id) => this.readItem(id))])
            this.assertSource(
              {
                type: 'item',
                id: item.id,
                version: item.version,
                assistantId: item.originAssistantId
              },
              execution.assistantId,
              execution.fingerprint
            )
        }
        const inheritedSources =
          execution && v.action === 'replace-content'
            ? this.mergeItemSources([...targets[0]!.sources, ...execution.sources], targets[0]!)
            : undefined
        const confirmationId = previous ? String(previous.id) : randomUUID()
        const receipt = {
          ...this.receipt(v.commandId, null, null, 0, 'PENDING_CONFIRMATION'),
          confirmationId
        }
        if (!previous)
          this.store.database.prepare('INSERT INTO item_confirmations VALUES(?,?,?,?,?,?)').run(
            confirmationId,
            v.assistantId,
            v.commandId,
            retentionEpoch(this.store.database),
            JSON.stringify({
              plan: v,
              guard: this.previewGuard(),
              ...(inheritedSources ? { sources: inheritedSources } : {})
            }),
            'pending'
          )
        execution?.commitReceipt?.(receipt)
        return {
          confirmationId,
          receipt,
          targets,
          relatedItemIds,
          ...(v.content ? { replacementContent: v.content } : {})
        }
      })
    })
  }
  confirm(input: unknown) {
    return this.handle(itemConfirmInputSchema, input, (v) => {
      this.active(v.assistantId)
      const row = this.store.database
        .prepare('SELECT * FROM item_confirmations WHERE id=? AND assistant_id=?')
        .get(v.confirmationId, v.assistantId)
      if (!row) throw new ItemError('NOT_FOUND')
      const commandId = String(row.command_id)
      const receipt = this.command(
        v.assistantId,
        commandId,
        { confirmationId: v.confirmationId, accept: v.accept },
        () => {
          if (row.state !== 'pending') throw new ItemError('STALE_WRITE')
          if (v.accept && JSON.parse(String(row.payload_json)).guard !== this.previewGuard())
            throw new ItemError('STALE_WRITE')
          const plan = itemPreviewInputSchema.parse(JSON.parse(String(row.payload_json)).plan)
          if (v.accept && (plan.action === 'replace-links' || plan.action === 'replace-content')) {
            const target = plan.targets[0]!,
              item = this.readItem(target.id)
            if (item.version !== target.expectedVersion || !plan.content)
              throw new ItemError('STALE_WRITE')
            this.checkContent(plan.content, item.id)
            this.saveItem({
              ...item,
              content: plan.content,
              sources: JSON.parse(String(row.payload_json)).sources
                ? itemRecordSchema.shape.sources.parse(JSON.parse(String(row.payload_json)).sources)
                : item.sources,
              version: item.version + 1,
              updatedAt: new Date().toISOString()
            })
          }
          if (v.accept && plan.action === 'delete') {
            for (const target of plan.targets)
              if (this.readItem(target.id).version !== target.expectedVersion)
                throw new ItemError('STALE_WRITE')
            for (const target of plan.targets) {
              // A related object is retained; the explicit preview names every link that will be cut.
              for (const r of this.store.database.prepare('SELECT record_json FROM items').all()) {
                const item = itemRecordSchema.parse(JSON.parse(String(r.record_json)))
                if (
                  item.content.parentId === target.id ||
                  item.content.relatedIds.includes(target.id)
                ) {
                  item.content.parentId =
                    item.content.parentId === target.id ? null : item.content.parentId
                  item.content.relatedIds = item.content.relatedIds.filter((id) => id !== target.id)
                  item.version++
                  item.updatedAt = new Date().toISOString()
                  this.saveItem(item)
                }
              }
              this.store.database
                .prepare('DELETE FROM daily_item_changes WHERE item_id=?')
                .run(target.id)
              this.store.database
                .prepare('DELETE FROM daily_item_checkpoints WHERE item_id=?')
                .run(target.id)
              this.store.database.prepare('INSERT INTO daily_item_changes VALUES(?,?,?)').run(
                target.id,
                target.expectedVersion + 1,
                JSON.stringify({
                  deleted: true,
                  id: target.id,
                  version: target.expectedVersion + 1,
                  originAssistantId: this.readItem(target.id).originAssistantId
                })
              )
              this.store.database.prepare('DELETE FROM items WHERE id=?').run(target.id)
              this.store.database
                .prepare("INSERT OR IGNORE INTO item_tombstones VALUES('item',?)")
                .run(target.id)
            }
          }
          this.store.database
            .prepare("UPDATE item_confirmations SET state='closed',payload_json='{}' WHERE id=?")
            .run(v.confirmationId)
          const updatedItem =
            v.accept && (plan.action === 'replace-links' || plan.action === 'replace-content')
              ? this.readItem(plan.targets[0]!.id)
              : null
          return this.receipt(
            commandId,
            updatedItem ? 'item' : null,
            updatedItem?.id ?? null,
            updatedItem?.version ?? 0,
            v.accept ? 'SUCCEEDED' : 'CANCELLED_BEFORE_DISPATCH'
          )
        }
      )
      this.changed()
      return receipt
    })
  }
  search(
    execution: ItemExecution | BackgroundItemExecution,
    query: string,
    limit = 10
  ): { items: ItemRecord[]; proposals: ItemProposal[] } {
    this.assertAccess(execution, 'read')
    if (
      limit > 100 &&
      Number(this.store.database.prepare('SELECT count(*) AS count FROM items').get()!.count) > 4096
    )
      throw new ItemError('CONFLICT')
    const items: ItemRecord[] = [],
      proposals: ItemProposal[] = []
    for (const type of ['item', 'proposal'] as const) {
      const rows = this.store.database
        .prepare(
          type === 'item'
            ? 'SELECT id FROM items ORDER BY rowid DESC'
            : 'SELECT id FROM item_proposals ORDER BY rowid DESC'
        )
        .all()
      for (const row of rows) {
        const record =
          type === 'item' ? this.readItem(String(row.id)) : this.readProposal(String(row.id))
        const content = 'content' in record ? record.content : record.candidate
        if (!content.title.includes(query) && !content.description.includes(query)) continue
        try {
          this.assertSource(
            { type, id: record.id, version: record.version, assistantId: record.originAssistantId },
            execution.assistantId,
            execution.fingerprint
          )
        } catch {
          continue
        }
        if (type === 'item') items.push(record as ItemRecord)
        else proposals.push(record as ItemProposal)
        if (items.length + proposals.length >= limit) return { items, proposals }
      }
    }
    return { items, proposals }
  }
  schedulingCandidates(): ItemRecord[] {
    return this.store.database
      .prepare('SELECT record_json FROM items')
      .all()
      .map((r) => itemRecordSchema.parse(JSON.parse(String(r.record_json))))
      .filter((r) => r.content.dueAt && !['completed', 'cancelled'].includes(r.content.status))
  }
}
