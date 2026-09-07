import { randomUUID, createHash } from 'node:crypto'
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  renameSync,
  openSync,
  fsyncSync,
  closeSync
} from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { memoryRoundInputSchema } from '../../shared/memory-round-contract.js'
import { queryMemoryRound, type RoundObjectView } from './memory-round-query.js'
import type { SqliteStore } from '../data/sqlite.js'
import {
  memoryRecordSchema,
  memoryReceiptSchema,
  memoryQueryInputSchema,
  memoryMutateInputSchema,
  memoryInspectInputSchema,
  memoryPermissionInputSchema,
  memorySetPermissionsInputSchema,
  memoryConfirmInputSchema,
  memoryReloadInputSchema,
  memoryAcceptReloadInputSchema,
  memoryMutationSchema,
  type MemoryMutation,
  type MemoryRecord,
  type MemorySource,
  type MemoryReceipt,
  type MemoryPermissions
} from '../../shared/memory-contract.js'

type Scope = 'global' | 'assistant'
type FailureCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'STALE_WRITE'
  | 'PERMISSION_DENIED'
  | 'INTEGRITY'
  | 'CONFLICT'
  | 'STORAGE_UNAVAILABLE'
export class MemoryError extends Error {
  constructor(readonly code: FailureCode) {
    super(code)
  }
}
export class MemoryMutationError extends MemoryError {
  constructor(
    code: FailureCode,
    readonly provenNotApplied: boolean
  ) {
    super(code)
  }
}
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const safeMessages: Record<FailureCode, string> = {
  INVALID_INPUT: '记忆操作参数不正确',
  NOT_FOUND: '记忆或操作不存在',
  STALE_WRITE: '内容或权限已变化，请刷新后重试',
  PERMISSION_DENIED: '当前记忆、来源或接收方权限不允许此操作',
  INTEGRITY: '正文与接受版本不一致，已停止使用，请检查并重新载入',
  CONFLICT: '本轮已有不同记忆操作，请在新一轮继续',
  STORAGE_UNAVAILABLE: '记忆存储暂不可用，未确认成功'
}
interface CommandRow {
  id: string
  arguments_hash: string
  state: string
  receipt_json: string | null
  intent_json: string
}
interface VersionRow {
  file_name: string
  body_hash: string
  metadata_json: string
}
export interface MemoryExecution {
  origin?: { kind: 'background' | 'steward' | 'user'; jobId: string }
  assistantId: string
  requestId: string
  fingerprint: string
  assertCurrent: () => void
  sources: MemorySource[]
  toolOperationId?: string
  commitReceipt?: (receipt: MemoryReceipt) => void
}
interface MutationContext {
  assistantId: string
  commandId: string
  mutation: MemoryMutation
  execution?: MemoryExecution
}

/** All paths and accepted versions are derived on the trusted side. */
export class MemoryService {
  private conflictLookup: (id: string) => string[] = () => []
  setConflictLookup(lookup: (id: string) => string[]): void {
    this.conflictLookup = lookup
  }
  private domainSourceCheck?: (
    source: MemorySource,
    assistantId: string,
    fingerprint: string,
    visited: Set<string>
  ) => void
  setDomainSourceCheck(
    check: (
      source: MemorySource,
      assistantId: string,
      fingerprint: string,
      visited: Set<string>
    ) => void
  ): void {
    this.domainSourceCheck = check
  }
  constructor(
    private readonly store: SqliteStore,
    private readonly directory: string,
    private readonly endpoint: (assistantId: string) => {
      fingerprint: string | null
      display: string | null
    },
    private readonly changed: (exceptRequestId?: string) => void = () => undefined,
    private readonly fault?: (phase: string) => void
  ) {
    mkdirSync(directory, { recursive: true })
    // Pending local writes never replay themselves or accept orphan files on startup.
    this.store.transaction(() => {
      this.store.database
        .prepare("UPDATE memory_commands SET state='NOT_APPLIED' WHERE state='PREPARED'")
        .run()
      const interrupted = this.store.database
        .prepare("SELECT intent_json FROM memory_commands WHERE state='NOT_APPLIED'")
        .all() as unknown as { intent_json: string }[]
      for (const row of interrupted) {
        const intent = JSON.parse(row.intent_json) as { toolOperationId?: string }
        if (!intent.toolOperationId) continue
        const op = this.store.database
          .prepare('SELECT record_json FROM tool_operations WHERE id=?')
          .get(intent.toolOperationId) as { record_json: string } | undefined
        if (!op) continue
        const record = JSON.parse(op.record_json) as {
          state: string
          summary: string
          updatedAt: string
        }
        if (['PREPARED', 'DISPATCHING', 'RESULT_UNKNOWN'].includes(record.state)) {
          record.state = 'CONFIRMED_NOT_APPLIED'
          record.summary = '记忆事务未提交，已核查未生效；不会自动重做'
          record.updatedAt = new Date().toISOString()
          this.store.database
            .prepare('UPDATE tool_operations SET record_json=? WHERE id=?')
            .run(JSON.stringify(record), intent.toolOperationId)
        }
      }
    })
  }

  private handle<T extends z.ZodType, R>(
    schema: T,
    input: unknown,
    operation: (value: z.infer<T>) => R
  ) {
    try {
      return { ok: true as const, data: operation(schema.parse(input)) }
    } catch (error) {
      const code: FailureCode =
        error instanceof MemoryError
          ? error.code
          : error instanceof z.ZodError
            ? 'INVALID_INPUT'
            : 'STORAGE_UNAVAILABLE'
      return { ok: false as const, error: { code, message: safeMessages[code] } }
    }
  }
  private activeAssistant(id: string): void {
    const row = this.store.database
      .prepare('SELECT archived_at FROM assistants WHERE id=?')
      .get(id) as { archived_at: string | null } | undefined
    if (!row || row.archived_at !== null) throw new MemoryError('PERMISSION_DENIED')
  }
  private metadata(id: string): MemoryRecord {
    const row = this.store.database
      .prepare('SELECT record_json FROM memory_objects WHERE id=?')
      .get(id) as { record_json: string } | undefined
    if (!row) throw new MemoryError('NOT_FOUND')
    return memoryRecordSchema.parse(JSON.parse(row.record_json))
  }
  private owned(assistantId: string, id: string): MemoryRecord {
    this.activeAssistant(assistantId)
    const record = this.metadata(id)
    if (record.scope === 'assistant' && record.ownerAssistantId !== assistantId)
      throw new MemoryError('PERMISSION_DENIED')
    return record
  }
  private version(record: MemoryRecord): VersionRow {
    const row = this.store.database
      .prepare(
        'SELECT file_name,body_hash,metadata_json FROM memory_versions WHERE object_id=? AND version=?'
      )
      .get(record.id, record.objectVersion) as unknown as VersionRow | undefined
    if (!row || !/^[a-f0-9-]+\.md$/.test(row.file_name)) throw new MemoryError('INTEGRITY')
    return row
  }
  private body(record: MemoryRecord): string {
    try {
      const version = this.version(record)
      const bytes = readFileSync(join(this.directory, version.file_name))
      if (digest(bytes) !== version.body_hash || bytes.byteLength > 64000)
        throw new MemoryError('INTEGRITY')
      return bytes.toString('utf8')
    } catch {
      throw new MemoryError('INTEGRITY')
    }
  }
  private safeReceipt(value: unknown): MemoryReceipt {
    const receipt = memoryReceiptSchema.parse(value)
    if (!this.retired(receipt.objectId)) return receipt
    return {
      operationId: receipt.operationId,
      objectId: receipt.objectId,
      objectVersion: receipt.objectVersion,
      state: receipt.state === 'PENDING_CONFIRMATION' ? 'CANCELLED_BEFORE_DISPATCH' : receipt.state,
      confirmationId: null,
      summary: '原操作身份已保留；正文副本已清理或正在清理'
    }
  }
  private retired(id: string): boolean {
    return !!this.store.database
      .prepare("SELECT 1 FROM content_tombstones WHERE kind='memory' AND id=?")
      .get(id)
  }
  private visible(record: MemoryRecord): MemoryRecord {
    if (this.retired(record.id))
      return {
        ...record,
        title: '已清理内容',
        markdown: '',
        event: null,
        sources: [],
        state: 'suppressed'
      }
    const deletedSourceAssistantIds = this.closure(record.sources)
      .filter((source) =>
        this.store.database
          .prepare('SELECT 1 FROM assistant_tombstones WHERE id=?')
          .get(source.assistantId)
      )
      .map((source) => source.assistantId)
    if (deletedSourceAssistantIds.length)
      record = { ...record, deletedSourceAssistantIds: [...new Set(deletedSourceAssistantIds)] }
    if (
      record.state === 'suppressed' ||
      this.closure(record.sources).some((source) => this.withdrawn(source))
    )
      return { ...record, state: 'suppressed', markdown: '' }
    try {
      return {
        ...record,
        markdown: this.body(record),
        unresolvedConflictIds: this.conflictLookup(record.id)
      }
    } catch {
      return { ...record, state: 'integrity-blocked', markdown: '' }
    }
  }
  permissions(input: unknown) {
    return this.handle(memoryPermissionInputSchema, input, (value) =>
      this.permissionState(value.assistantId, value.scope)
    )
  }
  permissionState(
    assistantId: string,
    scope: Scope,
    fingerprint?: string | null
  ): MemoryPermissions {
    this.activeAssistant(assistantId)
    const endpoint = this.endpoint(assistantId)
    const fp = fingerprint === undefined ? endpoint.fingerprint : fingerprint
    const row = this.store.database
      .prepare('SELECT * FROM memory_permissions WHERE assistant_id=? AND scope=?')
      .get(assistantId, scope) as
      | { version: number; read_allowed: number; write_allowed: number; inferences_allowed: number }
      | undefined
    const recipient = fp
      ? (this.store.database
          .prepare(
            'SELECT allowed FROM memory_recipients WHERE assistant_id=? AND scope=? AND fingerprint=?'
          )
          .get(assistantId, scope, fp) as { allowed: number } | undefined)
      : undefined
    return {
      assistantId,
      scope,
      version: row?.version ?? 0,
      read: row?.read_allowed === 1,
      write: row?.write_allowed === 1,
      writeInferences: row?.inferences_allowed === 1,
      receive: recipient?.allowed === 1,
      endpointDisplay: endpoint.display,
      endpointFingerprint: fp
    }
  }
  setPermissions(input: unknown) {
    return this.handle(memorySetPermissionsInputSchema, input, (value) => {
      this.store.transaction(() => {
        const current = this.permissionState(value.assistantId, value.scope)
        if (current.version !== value.expectedVersion) throw new MemoryError('STALE_WRITE')
        if (value.receive && !current.endpointFingerprint)
          throw new MemoryError('PERMISSION_DENIED')
        this.store.database
          .prepare(
            'INSERT INTO memory_permissions VALUES(?,?,?,?,?,?) ON CONFLICT(assistant_id,scope) DO UPDATE SET version=excluded.version,read_allowed=excluded.read_allowed,write_allowed=excluded.write_allowed,inferences_allowed=excluded.inferences_allowed'
          )
          .run(
            value.assistantId,
            value.scope,
            current.version + 1,
            +value.read,
            +value.write,
            +value.writeInferences
          )
        if (current.endpointFingerprint)
          this.store.database
            .prepare(
              'INSERT INTO memory_recipients VALUES(?,?,?,?) ON CONFLICT(assistant_id,scope,fingerprint) DO UPDATE SET allowed=excluded.allowed'
            )
            .run(value.assistantId, value.scope, current.endpointFingerprint, +value.receive)
      })
      this.changed()
      return this.permissionState(value.assistantId, value.scope)
    })
  }
  query(input: unknown) {
    return this.handle(memoryQueryInputSchema, input, (value) => {
      this.activeAssistant(value.assistantId)
      const rows = this.store.database
        .prepare(
          'SELECT rowid AS cursor,record_json FROM memory_objects WHERE rowid>? ORDER BY rowid'
        )
        .all(value.cursor ?? 0) as unknown as { cursor: number; record_json: string }[]
      const found: { cursor: number; record: MemoryRecord }[] = []
      for (const row of rows) {
        const record = memoryRecordSchema.parse(JSON.parse(row.record_json))
        if (record.scope === 'assistant' && record.ownerAssistantId !== value.assistantId) continue
        if (
          (value.scope !== 'all' && record.scope !== value.scope) ||
          (value.kind !== 'all' && record.kind !== value.kind)
        )
          continue
        if (this.retired(record.id)) continue
        if (!value.includeTrash && (record.state === 'suppressed' || record.retention === 'trash'))
          continue
        const visible = this.visible(record)
        if (!value.includeTrash && visible.state === 'suppressed') continue
        // Rebuildable index never authorizes data: accepted file remains the final search oracle.
        if (
          value.query &&
          !visible.title.includes(value.query) &&
          !visible.markdown.includes(value.query)
        )
          continue
        found.push({ cursor: row.cursor, record: visible })
        if (found.length > value.limit) break
      }
      return {
        records: found.slice(0, value.limit).map((row) => row.record),
        nextCursor: found.length > value.limit ? found[value.limit - 1]!.cursor : null
      }
    })
  }
  round(input: unknown) {
    return this.handle(memoryRoundInputSchema, input, (value) => {
      // A temporary view performs no normal-data reads and creates no durable trace.
      if (value.mode === 'temporary')
        return {
          assistantId: value.assistantId,
          requestId: value.requestId,
          evidenceCoverage: 'recorded-only' as const,
          entries: [],
          nextCursor: null
        }
      this.activeAssistant(value.assistantId)
      const owners = this.store.database
        .prepare('SELECT DISTINCT assistant_id FROM timeline_messages WHERE request_id=?')
        .all(value.requestId)
      if (owners.length !== 1 || owners[0]!.assistant_id !== value.assistantId)
        throw new MemoryError('NOT_FOUND')
      const source = {
        type: 'round' as const,
        id: value.requestId,
        assistantId: value.assistantId,
        version: 1
      }
      const grant = this.store.database
        .prepare('SELECT read_history FROM history_permissions WHERE assistant_id=?')
        .get(value.assistantId)
      if (
        grant?.read_history !== 1 ||
        this.withdrawn(source) ||
        this.withdrawn({ ...source, type: 'user-round' }) ||
        this.store.database
          .prepare("SELECT 1 FROM content_tombstones WHERE kind='round' AND id=?")
          .get(value.requestId) ||
        this.store.database
          .prepare('SELECT 1 FROM retention_original_trash WHERE request_id=?')
          .get(value.requestId)
      )
        throw new MemoryError('PERMISSION_DENIED')
      return queryMemoryRound(this.store, value, (id, version): RoundObjectView => {
        const hidden: RoundObjectView = {
          availability: 'unavailable',
          record: null,
          canInspect: false
        }
        try {
          const record = this.owned(value.assistantId, id)
          const fingerprint = this.endpoint(value.assistantId).fingerprint
          if (!fingerprint || this.retired(id)) return hidden
          this.assertRecord(record, value.assistantId, fingerprint)
          if (record.objectVersion !== version)
            return { ...hidden, availability: 'obsolete', canInspect: true }
          const visible = this.visible(record)
          if (visible.state !== 'active') return hidden
          return { availability: 'available', record: visible, canInspect: true }
        } catch {
          return hidden
        }
      })
    })
  }
  inspect(input: unknown) {
    return this.handle(memoryInspectInputSchema, input, (value) => {
      const record = this.owned(value.assistantId, value.id)
      const rows = this.store.database
        .prepare(
          'SELECT intent_json,receipt_json,created_at FROM memory_commands WHERE receipt_json IS NOT NULL ORDER BY rowid DESC'
        )
        .all() as unknown as { intent_json: string; receipt_json: string; created_at: string }[]
      const matching = rows
        .map((row) => ({
          ...row,
          receipt: this.safeReceipt(JSON.parse(row.receipt_json)),
          intent: JSON.parse(row.intent_json) as {
            mutation: MemoryMutation
            actor: 'user' | 'assistant' | 'background' | 'steward'
          }
        }))
        .filter((row) => row.receipt.objectId === value.id)
        .slice(0, 100)
      const provided = this.store.database
        .prepare(
          "SELECT DISTINCT node_id FROM memory_dependencies WHERE node_type='round' AND source_type='memory' AND source_id=? LIMIT 100"
        )
        .all(value.id) as unknown as { node_id: string }[]
      return {
        record: this.visible(record),
        changes: matching
          .filter((row) => row.receipt.state === 'SUCCEEDED')
          .map((row) => ({
            operationId: row.receipt.operationId,
            action: row.intent.mutation.action,
            objectVersion: row.receipt.objectVersion,
            actor: row.intent.actor,
            createdAt: row.created_at
          })),
        receipts: matching.map((row) => row.receipt),
        providedToRequests: provided.map((row) => row.node_id),
        cleanupPending: !!this.store.database
          .prepare('SELECT 1 FROM memory_cleanup WHERE object_id=?')
          .get(value.id),
        organizationPending: !!this.store.database
          .prepare("SELECT 1 FROM memory_pending WHERE object_id=? AND state='pending'")
          .get(value.id)
      }
    })
  }
  businessReceipt(assistantId: string, operationId: string): MemoryReceipt | undefined {
    this.activeAssistant(assistantId)
    const row = this.store.database
      .prepare('SELECT receipt_json FROM memory_commands WHERE id=? AND assistant_id=?')
      .get(operationId, assistantId) as { receipt_json: string | null } | undefined
    return row?.receipt_json ? this.safeReceipt(JSON.parse(row.receipt_json)) : undefined
  }
  mutate(input: unknown) {
    return this.handle(memoryMutateInputSchema, input, (value) =>
      this.apply({
        assistantId: value.assistantId,
        commandId: value.commandId,
        mutation: value.mutation
      })
    )
  }
  private checkMutation(context: MutationContext): MemoryRecord | undefined {
    this.activeAssistant(context.assistantId)
    const mutation = context.mutation
    const target = mutation.targetId
      ? this.owned(context.assistantId, mutation.targetId)
      : undefined
    if (target && this.retired(target.id)) throw new MemoryError('PERMISSION_DENIED')
    if (target && target.retention === 'trash' && 'markdown' in mutation)
      throw new MemoryError('PERMISSION_DENIED')
    if (target && target.objectVersion !== mutation.expectedVersion)
      throw new MemoryError('STALE_WRITE')
    if (mutation.action === 'remember' && (target || mutation.expectedVersion !== null))
      throw new MemoryError('INVALID_INPUT')
    if (mutation.action !== 'remember' && !target) throw new MemoryError('INVALID_INPUT')
    if ('markdown' in mutation) {
      if ((mutation.kind === 'event') !== (mutation.event !== null))
        throw new MemoryError('INVALID_INPUT')
      if (['relationship', 'continuity'].includes(mutation.kind) && mutation.scope !== 'assistant')
        throw new MemoryError('INVALID_INPUT')
      if (target && (target.kind !== mutation.kind || target.scope !== mutation.scope))
        throw new MemoryError('INVALID_INPUT')
      if (target && this.visible(target).state === 'suppressed')
        throw new MemoryError('PERMISSION_DENIED')
    }
    if (context.execution) {
      context.execution.assertCurrent()
      const scope = target?.scope ?? ('scope' in mutation ? mutation.scope : 'assistant')
      const grant = this.permissionState(context.assistantId, scope, context.execution.fingerprint)
      if (
        !grant.write ||
        ('nature' in mutation && mutation.nature === 'inference' && !grant.writeInferences)
      )
        throw new MemoryError('PERMISSION_DENIED')
      if (target) this.assertRecord(target, context.assistantId, context.execution.fingerprint)
      for (const source of context.execution.sources) {
        if (
          !context.execution.origin &&
          source.type === 'user-round' &&
          source.id === context.execution.requestId
        )
          continue
        this.assertSource(source, context.assistantId, context.execution.fingerprint)
      }
    }
    return target
  }
  private command(id: string): CommandRow | undefined {
    return this.store.database
      .prepare(
        'SELECT id,arguments_hash,state,receipt_json,intent_json FROM memory_commands WHERE id=?'
      )
      .get(id) as unknown as CommandRow | undefined
  }
  private apply(context: MutationContext, confirmed = false): MemoryReceipt {
    const mutation = memoryMutationSchema.parse(context.mutation)
    const argumentHash = digest(JSON.stringify({ assistantId: context.assistantId, mutation }))
    const prior = this.command(context.commandId)
    if (prior) {
      if (prior.arguments_hash !== argumentHash) throw new MemoryError('CONFLICT')
      if (prior.receipt_json && !(confirmed && prior.state === 'PENDING_CONFIRMATION'))
        return this.safeReceipt(JSON.parse(prior.receipt_json))
      if (!confirmed && !(context.execution?.origin && prior.state === 'NOT_APPLIED'))
        throw new MemoryError('CONFLICT')
    }
    const target = this.checkMutation(context)
    const objectId = target?.id ?? randomUUID()
    const now = new Date().toISOString()
    if (!prior)
      this.store.database.prepare('INSERT INTO memory_commands VALUES(?,?,?,?,?,?,?,?)').run(
        context.commandId,
        context.assistantId,
        context.execution?.origin ? null : (context.execution?.requestId ?? null),
        argumentHash,
        JSON.stringify({
          mutation,
          actor: context.execution?.origin
            ? context.execution.origin.kind
            : context.execution
              ? 'assistant'
              : 'user',
          origin: context.execution?.origin,
          toolOperationId: context.execution?.toolOperationId
        }),
        'PREPARED',
        null,
        now
      )
    // Separate preview is not a deletion and carries no successful deletion receipt.
    if (!confirmed && (mutation.action === 'delete' || mutation.action === 'withdraw')) {
      const confirmationId = randomUUID()
      const grant = this.permissionState(context.assistantId, target!.scope)
      const summary =
        mutation.action === 'delete'
          ? `待确认：删除“${target!.title}”的记忆表示，原对话和正式事项保留`
          : `待确认：撤回“${target!.title}”及其来源轮次，停止使用相关派生内容；原文与历史副本清理待生命周期处理`
      const receipt: MemoryReceipt = {
        operationId: context.commandId,
        objectId,
        objectVersion: target!.objectVersion,
        state: 'PENDING_CONFIRMATION',
        summary,
        confirmationId
      }
      this.store.transaction(() => {
        if (context.execution && !context.execution.origin)
          this.addDependencies('round', context.execution.requestId, 1, [
            {
              type: 'memory',
              id: objectId,
              assistantId: target!.ownerAssistantId,
              version: target!.objectVersion
            }
          ])
        const impact = this.removalImpact(target!, mutation.action)
        receipt.impact = impact.dto
        this.store.database.prepare('INSERT INTO memory_previews VALUES(?,?,?,?,?)').run(
          confirmationId,
          context.assistantId,
          'removal',
          JSON.stringify({
            context: { assistantId: context.assistantId, commandId: context.commandId, mutation },
            permissionVersion: grant.version,
            scope: target!.scope,
            sourceDigest: digest(JSON.stringify(target!.sources)),
            impactDigest: impact.hash,
            model: !!context.execution
          }),
          'pending'
        )
        this.store.database
          .prepare(
            "UPDATE memory_commands SET state='PENDING_CONFIRMATION',receipt_json=? WHERE id=?"
          )
          .run(JSON.stringify(receipt), context.commandId)
        context.execution?.commitReceipt?.(receipt)
      })
      return receipt
    }
    this.fault?.('intent')
    const nextVersion = (target?.objectVersion ?? 0) + 1
    const write = 'markdown' in mutation
    let body: string
    if (write) body = mutation.markdown
    else if (mutation.action === 'restore') body = this.body(target!)
    else body = ''
    let sources: MemorySource[] = write
      ? (context.execution?.sources ?? [
          { type: 'manual', id: context.commandId, assistantId: context.assistantId, version: 1 }
        ])
      : target!.sources
    // A user-specified correction supersedes the target; it cannot depend on its obsolete version.
    sources = [...(target?.sources ?? []), ...sources].filter(
      (source) => !(source.type === 'memory' && source.id === objectId)
    )
    sources = [...new Map(sources.map((source) => [JSON.stringify(source), source])).values()]
    if (sources.length > 64) throw new MemoryError('INVALID_INPUT')
    const record: MemoryRecord = {
      id: objectId,
      objectVersion: nextVersion,
      kind: write ? mutation.kind : target!.kind,
      scope: write ? mutation.scope : target!.scope,
      ownerAssistantId: target?.ownerAssistantId ?? context.assistantId,
      title: write ? mutation.title : target!.title,
      markdown: '',
      nature: write ? mutation.nature : target!.nature,
      event: write ? mutation.event : target!.event,
      state: ['delete', 'withdraw'].includes(mutation.action) ? 'suppressed' : 'active',
      retention: ['delete', 'withdraw'].includes(mutation.action) ? 'trash' : 'persistent',
      createdAt: target?.createdAt ?? now,
      updatedAt: now,
      sources
    }
    let fileName: string, bodyHash: string
    if (mutation.action === 'delete' || mutation.action === 'withdraw') {
      const previous = this.version(target!)
      fileName = previous.file_name
      bodyHash = previous.body_hash
    } else {
      fileName = `${objectId}-${nextVersion}-${context.commandId}.md`
      bodyHash = digest(body)
      const temp = join(this.directory, fileName + '.tmp')
      writeFileSync(temp, body, { flag: 'wx' })
      const fd = openSync(temp, 'r+')
      try {
        fsyncSync(fd)
      } finally {
        closeSync(fd)
      }
      this.fault?.('file-temp')
      renameSync(temp, join(this.directory, fileName))
      if (digest(readFileSync(join(this.directory, fileName))) !== bodyHash)
        throw new MemoryError('INTEGRITY')
    }
    this.fault?.('file-ready')
    const receipt: MemoryReceipt = {
      operationId: context.commandId,
      objectId,
      objectVersion: nextVersion,
      state: 'SUCCEEDED',
      summary:
        mutation.action === 'withdraw'
          ? '已撤回并停止使用；原文与历史副本清理待生命周期处理'
          : mutation.action === 'delete'
            ? '已删除记忆表示并退出召回；原对话保留'
            : mutation.action === 'restore'
              ? '已恢复记忆表示，旧作业仍受抑制'
              : '记忆已保存并立即生效',
      confirmationId: null
    }
    this.store.transaction(() => {
      this.checkMutation(context)
      if (mutation.action === 'restore') {
        for (const source of sources)
          if (this.withdrawn(source)) throw new MemoryError('PERMISSION_DENIED')
      }
      this.store.database
        .prepare('INSERT INTO memory_versions VALUES(?,?,?,?,?)')
        .run(objectId, nextVersion, fileName, bodyHash, JSON.stringify(record))
      if (target) {
        const changed = this.store.database
          .prepare('UPDATE memory_objects SET version=?,record_json=? WHERE id=? AND version=?')
          .run(nextVersion, JSON.stringify(record), objectId, target.objectVersion)
        if (changed.changes !== 1) throw new MemoryError('STALE_WRITE')
      } else
        this.store.database
          .prepare('INSERT INTO memory_objects VALUES(?,?,?)')
          .run(objectId, nextVersion, JSON.stringify(record))
      this.addDependencies('memory', objectId, nextVersion, sources)
      if (target)
        this.store.database
          .prepare(
            'INSERT INTO retained_source_edges SELECT object_id,?,source_type,source_id,source_version,source_assistant,recipients_json,epoch FROM retained_source_edges WHERE object_id=? AND object_version=?'
          )
          .run(nextVersion, objectId, target.objectVersion)
      if (context.execution && !context.execution.origin && record.state === 'active')
        this.addDependencies('round', context.execution.requestId, 1, [
          {
            type: 'memory',
            id: objectId,
            assistantId: record.ownerAssistantId,
            version: nextVersion
          }
        ])
      if (target)
        this.store.database
          .prepare('INSERT OR IGNORE INTO memory_suppressions VALUES(?,?,?,?,?)')
          .run('memory', objectId, target.objectVersion, 'representation', objectId)
      if (mutation.action === 'withdraw') {
        for (const source of this.closure(sources))
          this.store.database
            .prepare('INSERT OR IGNORE INTO memory_suppressions VALUES(?,?,?,?,?)')
            .run(source.type, source.id, source.version, 'withdrawal', objectId)
        this.store.database
          .prepare("INSERT OR REPLACE INTO memory_cleanup VALUES(?,'pending')")
          .run(objectId)
        const affected = this.store.database
          .prepare('SELECT record_json FROM memory_objects')
          .all() as unknown as { record_json: string }[]
        for (const row of affected) {
          const dependent = memoryRecordSchema.parse(JSON.parse(row.record_json))
          if (this.closure(dependent.sources).some((source) => this.withdrawn(source)))
            this.store.database
              .prepare('DELETE FROM memory_index WHERE object_id=?')
              .run(dependent.id)
        }
      }
      this.store.database.prepare('DELETE FROM memory_index WHERE object_id=?').run(objectId)
      if (record.state === 'active')
        this.store.database
          .prepare('INSERT INTO memory_index VALUES(?,?,?,?)')
          .run(objectId, nextVersion, record.title, body)
      if (record.scope === 'global' && write && context.execution?.origin?.kind !== 'steward')
        this.store.database
          .prepare(
            "INSERT OR REPLACE INTO memory_pending(object_id,version,state,entry_kind,authority_assistant,source_digest,sources_json,candidate_json,created_at) VALUES(?,?,'pending','accepted-memory',?,?,?,NULL,?)"
          )
          .run(
            objectId,
            nextVersion,
            record.ownerAssistantId,
            bodyHash,
            JSON.stringify(sources),
            now
          )
      this.store.database
        .prepare("UPDATE memory_commands SET state='SUCCEEDED',receipt_json=? WHERE id=?")
        .run(JSON.stringify(receipt), context.commandId)
      context.execution?.commitReceipt?.(receipt)
      this.fault?.('before-commit')
    })
    this.fault?.('after-commit')
    // A new background object cannot invalidate an already selected source/version.
    // Corrections, removals and permission changes retain the existing revocation barrier.
    const createsBackgroundObject =
      !!context.execution?.origin && mutation.action === 'remember' && target === undefined
    if (!createsBackgroundObject)
      this.changed(context.execution?.origin ? undefined : context.execution?.requestId)
    return receipt
  }
  private removalImpact(target: MemoryRecord, action: string) {
    const sources =
      action === 'withdraw'
        ? this.closure(target.sources)
        : [
            {
              type: 'memory' as const,
              id: target.id,
              version: target.objectVersion,
              assistantId: target.ownerAssistantId
            }
          ]
    const keys = new Set(
      sources.map((source) => source.type + ':' + source.id + ':' + source.version)
    )
    const intersects = (dependencies: MemorySource[]) =>
      this.closure(dependencies).some((source) =>
        keys.has(source.type + ':' + source.id + ':' + source.version)
      )
    const memories = (
      this.store.database
        .prepare('SELECT record_json FROM memory_objects ORDER BY id')
        .all() as unknown as { record_json: string }[]
    )
      .map((row) => memoryRecordSchema.parse(JSON.parse(row.record_json)))
      .filter((record) => record.id === target.id || intersects(record.sources))
    const roundRows = this.store.database
      .prepare(
        "SELECT DISTINCT node_id FROM memory_dependencies WHERE node_type='round' ORDER BY node_id"
      )
      .all() as unknown as { node_id: string }[]
    const rounds = roundRows
      .filter((row) => intersects(this.dependencies('round', row.node_id, 1)))
      .map((row) => row.node_id)
    const sourceRounds = [
      ...new Map(
        sources
          .filter((source) => source.type === 'round' || source.type === 'user-round')
          .map((source) => [source.id, { assistantId: source.assistantId, requestId: source.id }])
      ).values()
    ]
    const authority = sources.map((source) => ({
      source,
      withdrawn: this.withdrawn(source),
      permission: this.store.database
        .prepare('SELECT * FROM history_permissions WHERE assistant_id=?')
        .get(source.assistantId),
      recipients: this.store.database
        .prepare(
          'SELECT * FROM history_recipient_grants WHERE assistant_id=? ORDER BY endpoint_fingerprint'
        )
        .all(source.assistantId)
    }))
    return {
      dto: {
        sourceRounds: sourceRounds.slice(0, 64),
        memoryIds: memories.slice(0, 64).map((record) => record.id),
        roundIds: rounds.slice(0, 64),
        totalMemories: memories.length,
        totalRounds: rounds.length,
        truncated: sourceRounds.length > 64 || memories.length > 64 || rounds.length > 64
      },
      hash: digest(
        JSON.stringify({
          targetVersion: target.objectVersion,
          memories: memories.map((record) => [record.id, record.objectVersion]),
          rounds,
          authority
        })
      )
    }
  }
  confirm(input: unknown) {
    return this.handle(memoryConfirmInputSchema, input, (value) => {
      this.activeAssistant(value.assistantId)
      const row = this.store.database
        .prepare(
          "SELECT payload_json,state FROM memory_previews WHERE id=? AND assistant_id=? AND kind='removal'"
        )
        .get(value.confirmationId, value.assistantId) as
        { payload_json: string; state: string } | undefined
      if (!row || row.state !== 'pending') throw new MemoryError('STALE_WRITE')
      const payload = JSON.parse(row.payload_json) as {
        context: MutationContext
        permissionVersion: number
        scope: Scope
        sourceDigest: string
        impactDigest: string
        model: boolean
      }
      const current = this.permissionState(value.assistantId, payload.scope)
      const target = this.owned(value.assistantId, payload.context.mutation.targetId!)
      if (
        current.version !== payload.permissionVersion ||
        digest(JSON.stringify(target.sources)) !== payload.sourceDigest ||
        this.removalImpact(target, payload.context.mutation.action).hash !== payload.impactDigest ||
        (payload.model && !current.write)
      )
        throw new MemoryError('STALE_WRITE')
      let receipt: MemoryReceipt
      if (value.accept) receipt = this.apply(payload.context, true)
      else {
        const previous = this.command(payload.context.commandId)!
        receipt = {
          ...(JSON.parse(previous.receipt_json!) as MemoryReceipt),
          state: 'CANCELLED_BEFORE_DISPATCH',
          summary: '已取消，未删除或撤回',
          confirmationId: null
        }
        this.store.database
          .prepare("UPDATE memory_commands SET state='CANCELLED',receipt_json=? WHERE id=?")
          .run(JSON.stringify(receipt), payload.context.commandId)
      }
      this.store.database
        .prepare("UPDATE memory_previews SET state='closed' WHERE id=?")
        .run(value.confirmationId)
      return receipt
    })
  }
  previewReload(input: unknown) {
    return this.handle(memoryReloadInputSchema, input, (value) => {
      const record = this.owned(value.assistantId, value.id)
      if (record.objectVersion !== value.expectedVersion || record.state === 'suppressed')
        throw new MemoryError('STALE_WRITE')
      const candidate = readFileSync(join(this.directory, this.version(record).file_name), 'utf8')
      if (!candidate.trim() || candidate.length > 16000) throw new MemoryError('INVALID_INPUT')
      let currentMarkdown: string | null = null
      try {
        currentMarkdown = this.body(record)
      } catch {
        /* Explicit integrity recovery, never implicit acceptance. */
      }
      const previewId = randomUUID()
      this.store.database.prepare('INSERT INTO memory_previews VALUES(?,?,?,?,?)').run(
        previewId,
        value.assistantId,
        'reload',
        JSON.stringify({
          id: value.id,
          version: value.expectedVersion,
          candidate,
          hash: digest(candidate)
        }),
        'pending'
      )
      return {
        previewId,
        id: value.id,
        expectedVersion: value.expectedVersion,
        currentMarkdown,
        candidateMarkdown: candidate,
        warning:
          '仅接受正文为新版本，权限、归属、来源和删除抑制不从 Markdown 扩大；原版本完整性问题保留记录'
      }
    })
  }
  acceptReload(input: unknown) {
    return this.handle(memoryAcceptReloadInputSchema, input, (value) => {
      const row = this.store.database
        .prepare(
          "SELECT payload_json FROM memory_previews WHERE id=? AND assistant_id=? AND kind='reload' AND state='pending'"
        )
        .get(value.previewId, value.assistantId) as { payload_json: string } | undefined
      if (!row) throw new MemoryError('STALE_WRITE')
      const preview = JSON.parse(row.payload_json) as {
        id: string
        version: number
        candidate: string
        hash: string
      }
      const record = this.owned(value.assistantId, preview.id)
      if (
        record.objectVersion !== preview.version ||
        digest(readFileSync(join(this.directory, this.version(record).file_name))) !== preview.hash
      )
        throw new MemoryError('STALE_WRITE')
      const receipt = this.apply({
        assistantId: value.assistantId,
        commandId: value.previewId,
        mutation: {
          action: 'correct',
          targetId: record.id,
          expectedVersion: record.objectVersion,
          kind: record.kind,
          scope: record.scope,
          title: record.title,
          markdown: preview.candidate,
          nature: record.nature,
          event: record.event
        }
      })
      this.store.database
        .prepare("UPDATE memory_previews SET state='closed' WHERE id=?")
        .run(value.previewId)
      return receipt
    })
  }
  private dependencies(type: string, id: string, version: number): MemorySource[] {
    const rows = this.store.database
      .prepare(
        'SELECT source_type,source_id,source_assistant,source_version FROM memory_dependencies WHERE node_type=? AND node_id=? AND node_version=?'
      )
      .all(type, id, version) as unknown as {
      source_type: MemorySource['type']
      source_id: string
      source_assistant: string
      source_version: number
    }[]
    return rows.map((row) => ({
      type: row.source_type,
      id: row.source_id,
      assistantId: row.source_assistant,
      version: row.source_version
    }))
  }
  private closure(sources: MemorySource[]): MemorySource[] {
    const seen = new Map<string, MemorySource>(),
      queue = [...sources]
    while (queue.length) {
      const source = queue.pop()!,
        key = `${source.type}:${source.id}:${source.version}`
      if (seen.has(key)) continue
      if (seen.size >= 4096) throw new MemoryError('PERMISSION_DENIED')
      seen.set(key, source)
      queue.push(...this.dependencies(source.type, source.id, source.version))
    }
    return [...seen.values()]
  }
  addDependencies(type: string, id: string, version: number, sources: MemorySource[]): void {
    if (
      type === 'round' &&
      this.store.database
        .prepare('SELECT DISTINCT assistant_id FROM timeline_messages WHERE request_id=? LIMIT 2')
        .all(id).length > 1
    )
      throw new MemoryError('PERMISSION_DENIED')
    for (const source of sources)
      this.store.database
        .prepare('INSERT OR IGNORE INTO memory_dependencies VALUES(?,?,?,?,?,?,?)')
        .run(type, id, version, source.type, source.id, source.assistantId, source.version)
  }
  private withdrawn(source: MemorySource): boolean {
    return !!this.store.database
      .prepare(
        "SELECT 1 FROM memory_suppressions WHERE source_type=? AND source_id=? AND source_version=? AND kind='withdrawal'"
      )
      .get(source.type, source.id, source.version)
  }
  assertSource(
    source: MemorySource,
    assistantId: string,
    fingerprint: string,
    correctedInThisRound: MemorySource[] = [],
    domainVisited = new Set<string>()
  ): void {
    // Trusted request-local successful receipts only; never persisted as history exemptions.
    for (const current of correctedInThisRound) this.assertSource(current, assistantId, fingerprint)
    // Only a current memory already validated on this path can resolve its obsolete back-edge.
    // Old-version history roots still fail, and every old source remains subject to withdrawal.
    const active = new Set<string>()
    const completed = new Set<string>()
    const ancestors = new Map(correctedInThisRound.map((current) => [current.id, current.version]))
    let visits = 0
    const visit = (dependency: MemorySource): void => {
      if (domainVisited.size + active.size > 128) throw new MemoryError('PERMISSION_DENIED')
      if (dependency.type === 'item' || dependency.type === 'proposal') {
        if (!this.domainSourceCheck) throw new MemoryError('PERMISSION_DENIED')
        const path = new Set(domainVisited)
        for (const key of active) {
          const [type, id, version] = JSON.parse(key)
          path.add(type + ':' + id + ':' + version)
        }
        this.domainSourceCheck(dependency, assistantId, fingerprint, path)
        return
      }
      if (domainVisited.has(dependency.type + ':' + dependency.id + ':' + dependency.version))
        throw new MemoryError('PERMISSION_DENIED')
      if (this.withdrawn(dependency)) throw new MemoryError('PERMISSION_DENIED')
      const retained = [...ancestors].some(([id, version]) => {
        const edge = this.store.database
          .prepare(
            'SELECT recipients_json FROM retained_source_edges WHERE object_id=? AND object_version=? AND source_type=? AND source_id=? AND source_version=?'
          )
          .get(id, version, dependency.type, dependency.id, dependency.version) as
          { recipients_json: string } | undefined
        return (
          !!edge &&
          (JSON.parse(edge.recipients_json) as [string, string][]).some(
            ([recipient, endpoint]) => recipient === assistantId && endpoint === fingerprint
          )
        )
      })
      const retired =
        this.store.database
          .prepare('SELECT 1 FROM content_tombstones WHERE kind=? AND id=?')
          .get(dependency.type === 'user-round' ? 'round' : dependency.type, dependency.id) ||
        ((dependency.type === 'round' || dependency.type === 'user-round') &&
          this.store.database
            .prepare('SELECT 1 FROM retention_original_trash WHERE request_id=?')
            .get(dependency.id))
      const deletedAssistant = this.store.database
        .prepare('SELECT 1 FROM assistant_tombstones WHERE id=?')
        .get(dependency.assistantId)
      if ((retired || (deletedAssistant && dependency.type !== 'memory')) && !retained)
        throw new MemoryError('PERMISSION_DENIED')
      const key = JSON.stringify([dependency.type, dependency.id, dependency.version])
      if (active.has(key)) return
      const contextKey = JSON.stringify([
        key,
        [...ancestors].sort(([a], [b]) => a.localeCompare(b))
      ])
      if (completed.has(contextKey)) return
      if (++visits > 4096) throw new MemoryError('PERMISSION_DENIED')
      if (dependency.type === 'memory' && !retained) {
        const record = this.metadata(dependency.id)
        const obsoleteBackEdge =
          dependency.version < record.objectVersion &&
          ancestors.get(record.id) === record.objectVersion
        if (
          (record.objectVersion !== dependency.version && !obsoleteBackEdge) ||
          record.state !== 'active' ||
          record.retention === 'trash'
        )
          throw new MemoryError('PERMISSION_DENIED')
        if (record.scope === 'assistant' && record.ownerAssistantId !== assistantId)
          throw new MemoryError('PERMISSION_DENIED')
        const permission = this.permissionState(assistantId, record.scope, fingerprint)
        if (!permission.read || !permission.receive) throw new MemoryError('PERMISSION_DENIED')
        this.body(record)
      }
      if ((dependency.type === 'round' || dependency.type === 'user-round') && !retained) {
        const grant = this.store.database
          .prepare('SELECT read_history FROM history_permissions WHERE assistant_id=?')
          .get(dependency.assistantId) as { read_history: number } | undefined
        const recipient = this.store.database
          .prepare(
            'SELECT send_history FROM history_recipient_grants WHERE assistant_id=? AND endpoint_fingerprint=?'
          )
          .get(dependency.assistantId, fingerprint) as { send_history: number } | undefined
        if (grant?.read_history === 0 || recipient?.send_history !== 1)
          throw new MemoryError('PERMISSION_DENIED')
      }
      active.add(key)
      const previous = ancestors.get(dependency.id)
      if (dependency.type === 'memory' && previous === undefined)
        ancestors.set(dependency.id, dependency.version)
      for (const child of this.dependencies(dependency.type, dependency.id, dependency.version))
        visit(child)
      if (dependency.type === 'memory' && previous === undefined) ancestors.delete(dependency.id)
      active.delete(key)
      completed.add(contextKey)
    }
    visit(source)
  }
  private assertRecord(record: MemoryRecord, assistantId: string, fingerprint: string): void {
    this.assertSource(
      {
        type: 'memory',
        id: record.id,
        version: record.objectVersion,
        assistantId: record.ownerAssistantId
      },
      assistantId,
      fingerprint
    )
  }
  assertRound(
    assistantId: string,
    requestId: string,
    fingerprint: string,
    correctedInThisRound: MemorySource[] = []
  ): void {
    if (
      !this.store.database
        .prepare(
          "SELECT 1 FROM memory_dependencies WHERE source_type IN('memory','item','proposal') LIMIT 1"
        )
        .get() &&
      !this.store.database.prepare('SELECT 1 FROM memory_suppressions LIMIT 1').get() &&
      !this.store.database.prepare('SELECT 1 FROM content_tombstones LIMIT 1').get() &&
      !this.store.database.prepare('SELECT 1 FROM assistant_tombstones LIMIT 1').get() &&
      !this.store.database.prepare('SELECT 1 FROM retention_original_trash LIMIT 1').get()
    )
      return
    if (
      this.store.database
        .prepare('SELECT 1 FROM retention_original_trash WHERE request_id=?')
        .get(requestId) ||
      this.store.database
        .prepare("SELECT 1 FROM content_tombstones WHERE kind='round' AND id=?")
        .get(requestId) ||
      this.store.database.prepare('SELECT 1 FROM assistant_tombstones WHERE id=?').get(assistantId)
    )
      throw new MemoryError('PERMISSION_DENIED')
    const direct = { type: 'round' as const, id: requestId, assistantId, version: 1 }
    if (this.withdrawn(direct) || this.withdrawn({ ...direct, type: 'user-round' }))
      throw new MemoryError('PERMISSION_DENIED')
    for (const source of this.dependencies('round', requestId, 1))
      this.assertSource(source, assistantId, fingerprint, correctedInThisRound)
  }
  search(execution: MemoryExecution, query: string, limit: number): MemoryRecord[] {
    execution.assertCurrent()
    const records = this.store.database
      .prepare('SELECT record_json FROM memory_objects ORDER BY rowid DESC')
      .all() as unknown as { record_json: string }[]
    const found: MemoryRecord[] = []
    for (const row of records) {
      const record = memoryRecordSchema.parse(JSON.parse(row.record_json))
      if (
        record.state !== 'active' ||
        record.retention === 'trash' ||
        this.retired(record.id) ||
        (record.scope === 'assistant' && record.ownerAssistantId !== execution.assistantId)
      )
        continue
      try {
        this.assertRecord(record, execution.assistantId, execution.fingerprint)
      } catch {
        continue
      }
      const body = this.body(record)
      if (!record.title.includes(query) && !body.includes(query)) continue
      const provided = {
        ...record,
        markdown:
          body.slice(0, 1000) +
          (this.conflictLookup(record.id).length
            ? '\n[未决冲突：此资料与另一接受版本存在矛盾；不得作为已确认一致事实。]'
            : ''),
        unresolvedConflictIds: this.conflictLookup(record.id),
        bodyTruncated: body.length > 1000
      }
      if (Buffer.byteLength(JSON.stringify([...found, provided]), 'utf8') > 24000) break
      found.push(provided)
      if (found.length === limit) break
    }
    execution.assertCurrent()
    this.addDependencies(
      'round',
      execution.requestId,
      1,
      found.map((record) => ({
        type: 'memory',
        id: record.id,
        assistantId: record.ownerAssistantId,
        version: record.objectVersion
      }))
    )
    return found
  }
  /** Explicit user review preserves trusted evidence without inventing a conversation round. */
  observationMutation(
    execution: Omit<MemoryExecution, 'requestId' | 'origin'> & { jobId: string; commandId: string },
    mutation: MemoryMutation
  ): MemoryReceipt {
    if (mutation.action !== 'remember' && mutation.action !== 'correct')
      throw new MemoryError('INVALID_INPUT')
    try {
      return this.apply({
        assistantId: execution.assistantId,
        commandId: execution.commandId,
        mutation,
        execution: { ...execution, requestId: '', origin: { kind: 'user', jobId: execution.jobId } }
      })
    } catch (error) {
      const prior = this.command(execution.commandId)
      if (prior?.receipt_json && prior.state === 'SUCCEEDED')
        return this.safeReceipt(JSON.parse(prior.receipt_json))
      this.store.database
        .prepare("UPDATE memory_commands SET state='NOT_APPLIED' WHERE id=? AND state='PREPARED'")
        .run(execution.commandId)
      throw error
    }
  }
  /** Background slots never create a fictitious user-round dependency. */
  backgroundMutation(
    execution: Omit<MemoryExecution, 'requestId' | 'origin'> & {
      jobId: string
      commandId: string
      actor?: 'background' | 'steward'
    },
    mutation: MemoryMutation
  ): MemoryReceipt {
    if (mutation.action !== 'remember') throw new MemoryError('INVALID_INPUT')
    try {
      return this.apply({
        assistantId: execution.assistantId,
        commandId: execution.commandId,
        mutation,
        execution: {
          ...execution,
          requestId: '',
          origin: { kind: execution.actor ?? 'background', jobId: execution.jobId }
        }
      })
    } catch (error) {
      const prior = this.command(execution.commandId)
      if (prior?.receipt_json && prior.state === 'SUCCEEDED')
        return this.safeReceipt(JSON.parse(prior.receipt_json))
      this.store.database
        .prepare("UPDATE memory_commands SET state='NOT_APPLIED' WHERE id=? AND state='PREPARED'")
        .run(execution.commandId)
      throw error
    }
  }
  acceptedBackgroundMemory(assistantId: string, id: string, expectedVersion: number): MemoryRecord {
    const current = this.owned(assistantId, id)
    if (
      current.objectVersion !== expectedVersion ||
      current.state !== 'active' ||
      current.retention === 'trash'
    )
      throw new MemoryError('PERMISSION_DENIED')
    const record = this.visible(current)
    if (record.state === 'integrity-blocked') throw new MemoryError('INTEGRITY')
    if (record.state !== 'active') throw new MemoryError('PERMISSION_DENIED')
    return record
  }
  toolMutation(execution: MemoryExecution, mutation: MemoryMutation): MemoryReceipt {
    // Deterministic original-user-round identity, independent of model request/call IDs.
    const bytes = createHash('sha256')
      .update(`memory:${execution.assistantId}:${execution.requestId}`)
      .digest()
    bytes[6] = (bytes[6]! & 15) | 64
    bytes[8] = (bytes[8]! & 63) | 128
    const hex = bytes.subarray(0, 16).toString('hex')
    const commandId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    try {
      return this.apply({ assistantId: execution.assistantId, commandId, mutation, execution })
    } catch (error) {
      let provenNotApplied = false
      try {
        const row = this.store.database
          .prepare('SELECT state, receipt_json, arguments_hash FROM memory_commands WHERE id=?')
          .get(commandId) as
          Pick<CommandRow, 'state' | 'receipt_json' | 'arguments_hash'> | undefined
        const argumentHash = digest(
          JSON.stringify({
            assistantId: execution.assistantId,
            mutation: memoryMutationSchema.parse(mutation)
          })
        )
        if (row?.receipt_json && row.arguments_hash === argumentHash)
          return this.safeReceipt(JSON.parse(row.receipt_json))
        // Never classify an accepted preview or committed different command as unexecuted.
        provenNotApplied =
          !row || (row.state !== 'SUCCEEDED' && row.state !== 'PENDING_CONFIRMATION')
      } catch {
        /* Unreadable storage cannot prove rollback. */
      }
      throw new MemoryMutationError(
        error instanceof MemoryError ? error.code : 'STORAGE_UNAVAILABLE',
        provenNotApplied
      )
    }
  }
  rebuildIndex(): void {
    this.store.transaction(() => {
      this.store.database.exec('DELETE FROM memory_index')
      const rows = this.store.database
        .prepare('SELECT record_json FROM memory_objects')
        .all() as unknown as { record_json: string }[]
      for (const row of rows) {
        const record = memoryRecordSchema.parse(JSON.parse(row.record_json))
        if (
          record.state !== 'active' ||
          record.retention === 'trash' ||
          this.retired(record.id) ||
          this.closure(record.sources).some((source) => this.withdrawn(source))
        )
          continue
        try {
          this.store.database
            .prepare('INSERT INTO memory_index VALUES(?,?,?,?)')
            .run(record.id, record.objectVersion, record.title, this.body(record))
        } catch {
          /* Keep valid governance; damaged body is not indexed. */
        }
      }
    })
  }
}
