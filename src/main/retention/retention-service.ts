import { createHash, randomUUID } from 'node:crypto'
import { link, lstat, readFile, readdir, realpath, rename, unlink } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { z } from 'zod'
import type { SqliteStore } from '../data/sqlite.js'
import type { MemoryService } from '../memory/memory-service.js'
import {
  memoryRecordSchema,
  type MemoryRecord,
  type MemorySource
} from '../../shared/memory-contract.js'
import {
  retentionConfirmInputSchema,
  retentionJobsInputSchema,
  retentionMoveInputSchema,
  retentionOverviewInputSchema,
  retentionPreviewInputSchema,
  retentionRetryInputSchema,
  type RetentionChanged,
  type RetentionIntent,
  type RetentionJob,
  type RetentionPreview,
  type RetentionReceipt
} from '../../shared/retention-contract.js'
import { retentionEpoch } from './retention-schema.js'

type Code =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'STALE_PREVIEW'
  | 'PERMISSION_DENIED'
  | 'DEPENDENCY_BLOCKED'
  | 'NOT_RECOVERABLE'
  | 'CONFLICT'
  | 'STORAGE_UNAVAILABLE'
class RetentionError extends Error {
  constructor(readonly code: Code) {
    super(code)
  }
}
class FileError extends Error {
  constructor(readonly code: 'UNSAFE_PATH' | 'FILE_CHANGED') {
    super(code)
  }
}
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const yieldBatch = () => new Promise<void>((resolve) => setImmediate(resolve))
interface FileEntry {
  name: string
  hash: string
}
interface Manifest {
  itemPlan?: import('../item/item-retention.js').ItemRetentionPlan
  commandIds: string[]
  previewIds: string[]
  accepted: { id: string; version: number; hash: string }[]
  input: RetentionIntent
  preview: RetentionPreview
  files: FileEntry[]
  retainedEdges: {
    objectId: string
    objectVersion: number
    source: MemorySource
    recipients: [string, string][]
  }[]
}
/** Q9 must supply accepted, versioned products and unresolved dependencies; no boolean bypass. */
export interface RetentionDependencies {
  inspectOriginal(
    assistantId: string,
    requestIds: string[]
  ): { blockers: string[]; accepted: { id: string; version: number; hash: string }[] }
  inspectAssistant(assistantId: string): { blockers: string[] }
}
const dependencies: RetentionDependencies = {
  inspectOriginal: () => ({
    blockers: ['原文回收尚缺章节、已接受摘要及未完成话题依赖检查；等待仓储员接入'],
    accepted: []
  }),
  inspectAssistant: () => ({ blockers: [] })
}

import {
  inspectItemRetention,
  applyItemRetention,
  prepareItemRetainedEdges
} from '../item/item-retention.js'

/** Trusted local governance. Manifests contain IDs/hashes only, never deleted prose. */
export class RetentionService {
  private readonly listeners = new Set<(event: RetentionChanged) => void>()
  private stopped = false
  private running = false
  constructor(
    private readonly store: SqliteStore,
    private readonly directory: string,
    private readonly memory: MemoryService,
    private readonly changed: (event: RetentionChanged) => void = () => undefined,
    private readonly deps: RetentionDependencies = dependencies,
    private readonly fault?: (phase: string) => void
  ) {
    this.store.database
      .prepare(
        "UPDATE retention_jobs SET state='CLEANUP_PENDING' WHERE state IN('CLEANING','FAILED_RETRYABLE')"
      )
      .run()
    this.schedule()
  }
  get epoch(): number {
    return retentionEpoch(this.store.database)
  }
  onChanged(listener: (event: RetentionChanged) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  close(): void {
    this.stopped = true
    this.listeners.clear()
  }
  private emit(event: RetentionChanged): void {
    if (event.reason !== 'job-status') {
      event = {
        ...event,
        assistantIds: (
          this.store.database.prepare('SELECT id FROM assistants').all() as { id: string }[]
        ).map((row) => row.id)
      }
      this.changed(event)
    }
    for (const listener of this.listeners) listener(event)
  }
  private async handle<T extends z.ZodType, R>(
    schema: T,
    input: unknown,
    run: (value: z.infer<T>) => R | Promise<R>
  ) {
    try {
      return { ok: true as const, data: await run(schema.parse(input)) }
    } catch (error) {
      const code: Code =
        error instanceof RetentionError
          ? error.code
          : error instanceof z.ZodError
            ? 'INVALID_INPUT'
            : 'STORAGE_UNAVAILABLE'
      return {
        ok: false as const,
        error: {
          code,
          message: {
            INVALID_INPUT: '治理参数不正确',
            NOT_FOUND: '对象或作业不存在',
            STALE_PREVIEW: '内容、权限或助手状态已变化，请重新预览',
            PERMISSION_DENIED: '当前归属或治理权限不允许此操作',
            DEPENDENCY_BLOCKED: '尚有未完成依赖，未执行清理',
            NOT_RECOVERABLE: '原文已清除、来源已撤回或原助手已删除，不能恢复',
            CONFLICT: '命令身份与原操作不一致',
            STORAGE_UNAVAILABLE: '治理存储暂不可用，尚未确认完成'
          }[code]
        }
      }
    }
  }
  private assistant(id: string, allowDeleted = false): void {
    if (!this.store.database.prepare('SELECT 1 FROM assistants WHERE id=?').get(id))
      throw new RetentionError('NOT_FOUND')
    if (
      !allowDeleted &&
      this.store.database.prepare('SELECT 1 FROM assistant_tombstones WHERE id=?').get(id)
    )
      throw new RetentionError('PERMISSION_DENIED')
  }
  private async records(): Promise<MemoryRecord[]> {
    const records: MemoryRecord[] = []
    let cursor = ''
    while (true) {
      const rows = this.store.database
        .prepare('SELECT id,record_json FROM memory_objects WHERE id>? ORDER BY id LIMIT 128')
        .all(cursor) as { id: string; record_json: string }[]
      if (!rows.length) return records
      records.push(...rows.map((row) => memoryRecordSchema.parse(JSON.parse(row.record_json))))
      cursor = rows.at(-1)!.id
      await yieldBatch()
    }
  }
  private owned(assistantId: string, id: string): MemoryRecord {
    const row = this.store.database
      .prepare('SELECT record_json FROM memory_objects WHERE id=?')
      .get(id) as { record_json: string } | undefined
    if (!row) throw new RetentionError('NOT_FOUND')
    const record = memoryRecordSchema.parse(JSON.parse(row.record_json))
    if (record.scope === 'assistant' && record.ownerAssistantId !== assistantId)
      throw new RetentionError('PERMISSION_DENIED')
    return record
  }
  private tombstone(kind: string, id: string): boolean {
    return !!this.store.database
      .prepare('SELECT 1 FROM content_tombstones WHERE kind=? AND id=?')
      .get(kind, id)
  }
  private prior(
    commandId: string,
    assistantId: string,
    intentHash: string
  ): RetentionReceipt | undefined {
    const row = this.store.database
      .prepare('SELECT * FROM retention_commands WHERE id=?')
      .get(commandId) as
      { assistant_id: string; intent_hash: string; receipt_json: string } | undefined
    if (!row) return
    if (row.assistant_id !== assistantId || row.intent_hash !== intentHash)
      throw new RetentionError('CONFLICT')
    return JSON.parse(row.receipt_json) as RetentionReceipt
  }
  private saveReceipt(assistantId: string, intentHash: string, receipt: RetentionReceipt): void {
    this.store.database
      .prepare('INSERT INTO retention_commands VALUES(?,?,?,?)')
      .run(receipt.commandId, assistantId, intentHash, JSON.stringify(receipt))
  }
  async overview(input: unknown) {
    return this.handle(retentionOverviewInputSchema, input, async (value) => {
      this.assistant(value.assistantId, true)
      const zones = (['persistent', 'staging', 'trash'] as const).map((zone) => ({
        zone,
        objects: 0,
        acceptedBytes: 0
      }))
      for (const record of await this.records()) {
        if (record.scope === 'assistant' && record.ownerAssistantId !== value.assistantId) continue
        if (this.tombstone('memory', record.id)) continue
        const zone = zones.find((zone) => zone.zone === record.retention)!
        zone.objects++
        const row = this.store.database
          .prepare(
            'SELECT file_name,body_hash FROM memory_versions WHERE object_id=? AND version=?'
          )
          .get(record.id, record.objectVersion) as
          { file_name: string; body_hash: string } | undefined
        if (row)
          try {
            const bytes = await readFile(await this.safePath(row.file_name))
            if (hash(bytes) === row.body_hash) zone.acceptedBytes += bytes.length
          } catch {
            /* Damaged or absent files are not accepted bytes. */
          }
      }
      let managedFileBytes = 0
      for (const name of await readdir(this.directory))
        if (this.managedName(name))
          try {
            const path = await this.safePath(name)
            managedFileBytes += (await lstat(path)).size
          } catch {
            /* Unsafe/unknown files are outside managed count. */
          }
      const databasePath = String(
        this.store.database
          .prepare('PRAGMA database_list')
          .all()
          .find((row) => row.name === 'main')!.file
      )
      let databaseBytes = 0
      for (const file of [databasePath, databasePath + '-wal', databasePath + '-shm'])
        try {
          const stats = await lstat(file)
          if (stats.isFile() && !stats.isSymbolicLink()) databaseBytes += stats.size
        } catch {
          /* A sidecar may not exist. */
        }
      return {
        epoch: this.epoch,
        zones,
        managedFileBytes,
        databaseBytes,
        automaticPolicy: 'UNCONFIGURED' as const
      }
    })
  }
  async move(input: unknown) {
    return this.handle(retentionMoveInputSchema, input, async (value) => {
      const intentHash = hash(JSON.stringify(value)),
        prior = this.prior(value.commandId, value.assistantId, intentHash)
      if (prior) return prior
      this.assistant(value.assistantId)
      const current = this.owned(value.assistantId, value.id)
      if (this.epoch !== value.expectedEpoch || current.objectVersion !== value.expectedVersion)
        throw new RetentionError('STALE_PREVIEW')
      if (this.tombstone('memory', current.id) || current.state === 'suppressed')
        throw new RetentionError('NOT_RECOVERABLE')
      // Restoration is a new CAS transition; no source withdrawal is ever undone.
      if (
        value.zone !== 'trash' &&
        this.closure(current.sources).some((source) => this.withdrawn(source))
      )
        throw new RetentionError('NOT_RECOVERABLE')
      const row = this.store.database
        .prepare('SELECT file_name,body_hash FROM memory_versions WHERE object_id=? AND version=?')
        .get(current.id, current.objectVersion) as { file_name: string; body_hash: string }
      const bytes = await readFile(await this.safePath(row.file_name))
      if (hash(bytes) !== row.body_hash) throw new RetentionError('NOT_RECOVERABLE')
      const receipt = this.store.transaction(() => {
        if (this.epoch !== value.expectedEpoch) throw new RetentionError('STALE_PREVIEW')
        const next = {
          ...current,
          objectVersion: current.objectVersion + 1,
          retention: value.zone,
          updatedAt: new Date().toISOString()
        }
        this.store.database
          .prepare('UPDATE retention_state SET generation=generation+1 WHERE singleton=1')
          .run()
        this.store.database
          .prepare('INSERT INTO memory_versions VALUES(?,?,?,?,?)')
          .run(current.id, next.objectVersion, row.file_name, row.body_hash, JSON.stringify(next))
        this.store.database
          .prepare('UPDATE memory_objects SET version=?,record_json=? WHERE id=?')
          .run(next.objectVersion, JSON.stringify(next), current.id)
        this.memory.addDependencies('memory', current.id, next.objectVersion, current.sources)
        this.store.database
          .prepare(
            'INSERT INTO retained_source_edges SELECT object_id,?,source_type,source_id,source_version,source_assistant,recipients_json,epoch FROM retained_source_edges WHERE object_id=? AND object_version=?'
          )
          .run(next.objectVersion, current.id, current.objectVersion)
        this.store.database.prepare('DELETE FROM memory_index WHERE object_id=?').run(current.id)
        if (value.zone !== 'trash')
          this.store.database
            .prepare('INSERT INTO memory_index VALUES(?,?,?,?)')
            .run(current.id, next.objectVersion, next.title, bytes.toString('utf8'))
        const receipt: RetentionReceipt = {
          commandId: value.commandId,
          epoch: this.epoch,
          jobId: null,
          state: 'MOVED',
          objectVersion: next.objectVersion
        }
        this.saveReceipt(value.assistantId, intentHash, receipt)
        return receipt
      })
      this.emit({
        epoch: receipt.epoch,
        assistantIds: [value.assistantId],
        memoryIds: [value.id],
        requestIds: [],
        reason: 'move'
      })
      return receipt
    })
  }
  private withdrawn(source: MemorySource): boolean {
    return !!this.store.database
      .prepare(
        "SELECT 1 FROM memory_suppressions WHERE source_type=? AND source_id=? AND source_version=? AND kind='withdrawal'"
      )
      .get(source.type, source.id, source.version)
  }
  private children(source: MemorySource): MemorySource[] {
    return (
      this.store.database
        .prepare(
          `SELECT source_type,source_id,source_assistant,source_version FROM ${source.type === 'item' || source.type === 'proposal' ? 'item_sources' : 'memory_dependencies'} WHERE node_type=? AND node_id=? AND node_version=?`
        )
        .all(source.type, source.id, source.version) as {
        source_type: MemorySource['type']
        source_id: string
        source_assistant: string
        source_version: number
      }[]
    ).map((row) => ({
      type: row.source_type,
      id: row.source_id,
      assistantId: row.source_assistant,
      version: row.source_version
    }))
  }
  private closure(roots: MemorySource[]): MemorySource[] {
    const seen = new Map<string, MemorySource>(),
      queue = [...roots]
    while (queue.length) {
      const source = queue.pop()!,
        key = JSON.stringify(source)
      if (seen.has(key)) continue
      if (seen.size >= 4096) throw new RetentionError('DEPENDENCY_BLOCKED')
      seen.set(key, source)
      queue.push(...this.children(source))
    }
    return [...seen.values()]
  }
  private async copies(
    input: RetentionIntent,
    memoryIds: Set<string>,
    requestIds: Set<string>
  ): Promise<{ commandIds: string[]; previewIds: string[] }> {
    const commandIds: string[] = [],
      previewIds: string[] = []
    let cursor = 0
    while (true) {
      const rows = this.store.database
        .prepare(
          'SELECT rowid AS cursor,id,assistant_id,request_id,intent_json,receipt_json FROM memory_commands WHERE rowid>? ORDER BY rowid LIMIT 128'
        )
        .all(cursor) as {
        cursor: number
        id: string
        assistant_id: string
        request_id: string | null
        intent_json: string
        receipt_json: string | null
      }[]
      if (!rows.length) break
      for (const row of rows) {
        const receipt = row.receipt_json
          ? (JSON.parse(row.receipt_json) as { objectId?: string })
          : null
        const intent = JSON.parse(row.intent_json) as { mutation?: { targetId?: string } }
        if (
          (input.intent === 'purge-assistant' && row.assistant_id === input.assistantId) ||
          memoryIds.has(receipt?.objectId ?? intent.mutation?.targetId ?? '') ||
          requestIds.has(row.request_id ?? '')
        )
          commandIds.push(row.id)
      }
      cursor = rows.at(-1)!.cursor
      await yieldBatch()
    }
    cursor = 0
    while (true) {
      const rows = this.store.database
        .prepare(
          'SELECT rowid AS cursor,id,assistant_id,payload_json FROM memory_previews WHERE rowid>? ORDER BY rowid LIMIT 128'
        )
        .all(cursor) as { cursor: number; id: string; assistant_id: string; payload_json: string }[]
      if (!rows.length) break
      for (const row of rows) {
        const payload = JSON.parse(row.payload_json) as {
          id?: string
          context?: { mutation?: { targetId?: string } }
        }
        if (
          (input.intent === 'purge-assistant' && row.assistant_id === input.assistantId) ||
          memoryIds.has(payload.id ?? payload.context?.mutation?.targetId ?? '')
        )
          previewIds.push(row.id)
      }
      cursor = rows.at(-1)!.cursor
      await yieldBatch()
    }
    if (commandIds.length + previewIds.length > 32768)
      throw new RetentionError('DEPENDENCY_BLOCKED')
    return { commandIds, previewIds }
  }
  async preview(input: unknown) {
    return this.handle(retentionPreviewInputSchema, input, async (value) => {
      const manifest = await this.plan(value)
      if (this.epoch !== manifest.preview.epoch) throw new RetentionError('STALE_PREVIEW')
      this.store.database
        .prepare('INSERT INTO retention_previews VALUES(?,?,?,?,?,?)')
        .run(
          manifest.preview.id,
          value.assistantId,
          manifest.preview.nonce,
          manifest.preview.epoch,
          JSON.stringify(manifest),
          'pending'
        )
      return manifest.preview
    })
  }
  private async plan(input: RetentionIntent): Promise<Manifest> {
    this.assistant(input.assistantId)
    const epoch = this.epoch,
      records = await this.records(),
      memoryIds = new Set<string>(),
      requestIds = new Set<string>(),
      retained = new Set<string>(),
      roots: MemorySource[] = []
    if ((input.intent === 'purge-assistant') !== (input.target.type === 'assistant'))
      throw new RetentionError('INVALID_INPUT')
    if (
      ['recycle-original', 'restore-original'].includes(input.intent) &&
      input.target.type === 'memories'
    )
      throw new RetentionError('INVALID_INPUT')
    if (input.target.type === 'memories') {
      for (const item of input.target.objects) {
        const record = this.owned(input.assistantId, item.id)
        if (record.objectVersion !== item.version) throw new RetentionError('STALE_PREVIEW')
        if (input.intent === 'empty-trash' && record.retention !== 'trash')
          throw new RetentionError('INVALID_INPUT')
        memoryIds.add(item.id)
        roots.push({
          type: 'memory',
          id: item.id,
          assistantId: record.ownerAssistantId,
          version: record.objectVersion
        })
        if (input.intent === 'withdraw-information') roots.push(...this.closure(record.sources))
      }
    } else {
      let rows: { request_id: string }[]
      if (input.target.type === 'message' || input.target.type === 'range') {
        const firstId =
            input.target.type === 'message' ? input.target.messageId : input.target.firstMessageId,
          lastId =
            input.target.type === 'message' ? input.target.messageId : input.target.lastMessageId
        const first = this.store.database
          .prepare('SELECT sequence FROM timeline_messages WHERE assistant_id=? AND id=?')
          .get(input.assistantId, firstId) as { sequence: number } | undefined
        const last = this.store.database
          .prepare('SELECT sequence FROM timeline_messages WHERE assistant_id=? AND id=?')
          .get(input.assistantId, lastId) as { sequence: number } | undefined
        if (!first || !last || first.sequence > last.sequence)
          throw new RetentionError('INVALID_INPUT')
        rows = this.store.database
          .prepare(
            'SELECT DISTINCT request_id FROM timeline_messages WHERE assistant_id=? AND sequence BETWEEN ? AND ?'
          )
          .all(input.assistantId, first.sequence, last.sequence) as { request_id: string }[]
      } else
        rows = this.store.database
          .prepare('SELECT DISTINCT request_id FROM timeline_messages WHERE assistant_id=?')
          .all(input.assistantId) as { request_id: string }[]
      for (const row of rows) {
        requestIds.add(row.request_id)
        roots.push(
          { type: 'round', id: row.request_id, version: 1, assistantId: input.assistantId },
          { type: 'user-round', id: row.request_id, version: 1, assistantId: input.assistantId }
        )
      }
    }
    if (input.intent === 'purge-assistant')
      for (const record of records)
        if (record.ownerAssistantId === input.assistantId && record.scope === 'assistant') {
          memoryIds.add(record.id)
          roots.push({
            type: 'memory',
            id: record.id,
            assistantId: input.assistantId,
            version: record.objectVersion
          })
        }
    if (input.intent === 'withdraw-information')
      for (const source of roots)
        if (source.type === 'round' || source.type === 'user-round') requestIds.add(source.id)
    // Propagate by exact stable identities, never by keyword matching or text replacement.
    const affected = new Set(
      roots
        .filter(
          (source) =>
            input.intent !== 'empty-trash' ||
            input.target.type === 'memories' ||
            requestIds.has(source.id)
        )
        .map((source) => source.type + ':' + source.id)
    )
    for (const id of requestIds) {
      affected.add('round:' + id)
      affected.add('user-round:' + id)
    }
    if (
      input.intent === 'restore-original' ||
      (input.intent === 'empty-trash' && input.target.type !== 'memories')
    ) {
      for (const id of [...requestIds])
        if (
          !this.store.database
            .prepare('SELECT 1 FROM retention_original_trash WHERE request_id=?')
            .get(id)
        )
          requestIds.delete(id)
      affected.clear()
      for (const id of requestIds) {
        affected.add('round:' + id)
        affected.add('user-round:' + id)
      }
    }
    let grew = input.intent !== 'restore-original'
    while (grew) {
      grew = false
      const domain = inspectItemRetention(
        this.store,
        input.intent === 'purge-assistant' ? input.assistantId : null,
        [...requestIds],
        [...memoryIds]
      )
      for (const key of [
        ...domain.items.map((r) => 'item:' + r.id),
        ...domain.proposals.map((r) => 'proposal:' + r.id)
      ]) {
        if (!affected.has(key)) {
          affected.add(key)
          grew = true
        }
      }
      let scanned = 0
      for (const record of records) {
        if (++scanned % 24 === 0) await yieldBatch()
        if (memoryIds.has(record.id)) continue
        if (
          this.closure(record.sources).some((source) => affected.has(source.type + ':' + source.id))
        ) {
          if (
            input.intent === 'purge-assistant' &&
            (record.scope === 'global' || record.ownerAssistantId !== input.assistantId)
          ) {
            retained.add(record.id)
            continue
          }
          if (input.intent === 'recycle-original') {
            retained.add(record.id)
            continue
          }
          memoryIds.add(record.id)
          affected.add('memory:' + record.id)
          grew = true
        }
      }
      const edges = this.store.database
        .prepare(
          "SELECT node_id,source_type,source_id FROM memory_dependencies WHERE node_type='round'"
        )
        .all() as { node_id: string; source_type: string; source_id: string }[]
      const history = this.store.database
        .prepare('SELECT request_id,source_request_id FROM timeline_sources')
        .all() as { request_id: string; source_request_id: string }[]
      for (const edge of [
        ...edges.map((edge) => ({
          id: edge.node_id,
          key: edge.source_type + ':' + edge.source_id
        })),
        ...history.map((edge) => ({ id: edge.request_id, key: 'round:' + edge.source_request_id }))
      ])
        if (!requestIds.has(edge.id) && affected.has(edge.key)) {
          requestIds.add(edge.id)
          affected.add('round:' + edge.id)
          affected.add('user-round:' + edge.id)
          grew = true
        }
      if (memoryIds.size > 4096 || requestIds.size > 4096 || retained.size > 4096)
        throw new RetentionError('DEPENDENCY_BLOCKED')
      await yieldBatch()
    }
    const rounds: RetentionPreview['rounds'] = []
    const blockers: string[] = []
    for (const id of requestIds) {
      const owners = this.store.database
        .prepare('SELECT DISTINCT assistant_id FROM timeline_messages WHERE request_id=?')
        .all(id) as { assistant_id: string }[]
      if (owners.length > 1)
        blockers.push('旧轮次身份在多个助手间冲突，无法安全核定派生范围；未执行清理')
      rounds.push(
        ...owners.map((owner) => {
          const time = this.store.database
            .prepare(
              'SELECT min(created_at) AS created_at FROM timeline_messages WHERE assistant_id=? AND request_id=?'
            )
            .get(owner.assistant_id, id) as { created_at: string | null }
          const visible =
            owner.assistant_id === input.assistantId
              ? (this.store.database
                  .prepare(
                    "SELECT content FROM readable_timeline_messages WHERE assistant_id=? AND request_id=? AND role='user'"
                  )
                  .get(owner.assistant_id, id) as { content: string } | undefined)
              : undefined
          return {
            assistantId: owner.assistant_id,
            requestId: id,
            createdAt: time.created_at,
            summary: visible?.content.slice(0, 120) ?? null
          }
        })
      )
    }
    if (rounds.length > 4096) throw new RetentionError('DEPENDENCY_BLOCKED')
    if (
      !memoryIds.size &&
      !requestIds.size &&
      input.intent !== 'purge-assistant' &&
      input.intent !== 'recycle-original'
    )
      blockers.push('所选范围没有可治理的记录')
    let accepted: Manifest['accepted'] = []
    if (
      input.intent === 'purge-assistant' &&
      records.some(
        (record) =>
          record.ownerAssistantId === input.assistantId &&
          record.scope === 'assistant' &&
          (record.kind === 'user' || record.kind === 'event')
      )
    )
      blockers.push('该助手尚有私有个人记忆或事件；其永久删除范围待用户确认，当前未执行')
    if (input.intent === 'restore-original') {
      if (!requestIds.size) blockers.push('没有可恢复的原文垃圾')
      for (const id of requestIds) {
        const row = this.store.database
          .prepare('SELECT accepted_json FROM retention_original_trash WHERE request_id=?')
          .get(id) as { accepted_json: string }
        const products = JSON.parse(row.accepted_json) as Manifest['accepted']
        accepted.push(...products)
        if (
          this.tombstone('round', id) ||
          this.closure([{ type: 'round', id, assistantId: input.assistantId, version: 1 }]).some(
            (source) => this.withdrawn(source)
          )
        )
          blockers.push('原文或来源已被后续撤回，不能恢复')
        if (
          Number(
            this.store.database
              .prepare(
                "SELECT count(*) AS n FROM timeline_messages WHERE request_id=? AND status='completed' AND content<>''"
              )
              .get(id)!.n
          ) !== 2
        )
          blockers.push('原文消息配对不完整或已被清理，不能恢复')
        for (const product of products)
          if (
            !this.store.database
              .prepare(
                "SELECT 1 FROM memory_objects o JOIN memory_versions v ON v.object_id=o.id AND v.version=o.version WHERE o.id=? AND v.version=? AND v.body_hash=? AND json_extract(o.record_json,'$.state')='active' AND json_extract(o.record_json,'$.retention')<>'trash'"
              )
              .get(product.id, product.version, product.hash)
          )
            blockers.push('接受结果已变化，恢复依赖检查未通过')
      }
    }
    if (input.intent === 'recycle-original') {
      const dependencies = this.deps.inspectOriginal(input.assistantId, [...requestIds])
      blockers.push(...dependencies.blockers)
      accepted = dependencies.accepted
      if (!dependencies.accepted.length) blockers.push('尚无可核验的已接受整理结果，原文保持不动')
      // Q9 must provide actual accepted products whose IDs, versions and hashes match storage.
      for (const accepted of dependencies.accepted)
        if (
          !this.store.database
            .prepare(
              'SELECT 1 FROM memory_versions v JOIN memory_objects o ON o.id=v.object_id AND o.version=v.version WHERE v.object_id=? AND v.version=? AND v.body_hash=?'
            )
            .get(accepted.id, accepted.version, accepted.hash)
        )
          blockers.push('整理结果版本或正文未通过核验')
    }
    let replacementAssistantId: string | null = null
    if (input.target.type === 'assistant') {
      blockers.push(...this.deps.inspectAssistant(input.assistantId).blockers)
      const state = this.store.database
        .prepare(
          'SELECT primary_assistant_id,current_assistant_id FROM assistant_state WHERE singleton=1'
        )
        .get() as { primary_assistant_id: string | null; current_assistant_id: string | null }
      const alternatives = this.store.database
        .prepare(
          'SELECT id FROM assistants WHERE id<>? AND archived_at IS NULL AND id NOT IN(SELECT id FROM assistant_tombstones)'
        )
        .all(input.assistantId) as { id: string }[]
      replacementAssistantId = input.target.replacementAssistantId
      if (replacementAssistantId && !alternatives.some((row) => row.id === replacementAssistantId))
        throw new RetentionError('INVALID_INPUT')
      if (
        state.primary_assistant_id === input.assistantId &&
        alternatives.length &&
        !replacementAssistantId
      )
        blockers.push('删除主助手前请选择现有的接替助手')
      if (state.primary_assistant_id !== input.assistantId)
        replacementAssistantId = state.primary_assistant_id
    }
    const copies = await this.copies(input, memoryIds, requestIds)
    const files: FileEntry[] = [],
      names = new Map<string, string>()
    const orphanCommandIds = input.intent === 'purge-assistant' ? copies.commandIds : []
    for (const id of memoryIds)
      for (const row of this.store.database
        .prepare('SELECT file_name,body_hash,metadata_json FROM memory_versions WHERE object_id=?')
        .all(id) as { file_name: string; body_hash: string; metadata_json: string }[]) {
        if (this.cleanedVersion(id, row)) continue
        if (names.has(row.file_name) && names.get(row.file_name) !== row.body_hash)
          throw new RetentionError('DEPENDENCY_BLOCKED')
        names.set(row.file_name, row.body_hash)
      }
    // Include interrupted accepted-command files and versioned .tmp siblings, not arbitrary files.
    for (const name of await readdir(this.directory))
      if (this.managedName(name)) {
        const selected = [...memoryIds].some((id) => name.startsWith(id + '-'))
        const orphan = orphanCommandIds.some(
          (id) => name.endsWith('-' + id + '.md') || name.endsWith('-' + id + '.md.tmp')
        )
        if (
          !selected &&
          (!orphan ||
            this.store.database
              .prepare('SELECT 1 FROM memory_versions WHERE file_name=?')
              .get(name))
        )
          continue
        const bytes = await readFile(await this.safePath(name))
        if (!names.has(name)) names.set(name, hash(bytes))
      }
    for (const [name, expected] of names) {
      const retainedRefs = this.store.database
        .prepare('SELECT DISTINCT object_id FROM memory_versions WHERE file_name=?')
        .all(name) as { object_id: string }[]
      if (retainedRefs.some((row) => !memoryIds.has(row.object_id))) {
        blockers.push('待清理文件仍被保留对象引用')
        continue
      }
      files.push({ name, hash: expected })
    }
    const retainedEdges: Manifest['retainedEdges'] = []
    if (input.intent === 'purge-assistant' || input.intent === 'recycle-original') {
      // Accepted results survive; only exact unavailable private source nodes are cut.
      for (const record of records.filter(
        (record) =>
          input.intent === 'recycle-original' ||
          record.scope === 'global' ||
          record.ownerAssistantId !== input.assistantId
      )) {
        const sources = this.closure(record.sources).filter((source) =>
          input.intent === 'recycle-original'
            ? (source.type === 'round' || source.type === 'user-round') && requestIds.has(source.id)
            : source.assistantId === input.assistantId &&
              (source.type !== 'memory' ||
                records.find((record) => record.id === source.id)?.scope === 'assistant')
        )
        if (!sources.length) continue
        retained.add(record.id)
        for (const source of sources) {
          const recipients: [string, string][] = []
          const grants = this.store.database
            .prepare(
              'SELECT assistant_id,fingerprint FROM memory_recipients WHERE scope=? AND allowed=1'
            )
            .all(record.scope) as { assistant_id: string; fingerprint: string }[]
          for (const grant of grants) {
            if (input.intent === 'purge-assistant' && grant.assistant_id === input.assistantId)
              continue
            try {
              this.memory.assertSource(source, grant.assistant_id, grant.fingerprint)
              recipients.push([grant.assistant_id, grant.fingerprint])
            } catch {
              /* Existing denial is preserved. */
            }
          }
          retainedEdges.push({
            objectId: record.id,
            objectVersion: record.objectVersion,
            source,
            recipients
          })
        }
      }
    }
    if (retained.size > 4096 || files.length > 16384) throw new RetentionError('DEPENDENCY_BLOCKED')
    const memories: RetentionPreview['memories'] = records
      .filter((record) => memoryIds.has(record.id) || retained.has(record.id))
      .map((record) => ({
        id: record.id,
        version: record.objectVersion,
        ownerAssistantId: record.ownerAssistantId,
        kind: record.kind,
        scope: record.scope,
        title:
          (record.scope === 'global' || record.ownerAssistantId === input.assistantId) &&
          record.state === 'active' &&
          !this.tombstone('memory', record.id) &&
          !this.closure(record.sources).some((source) => this.withdrawn(source))
            ? record.title
            : null
      }))
    if (memories.length > 4096) throw new RetentionError('DEPENDENCY_BLOCKED')
    const warning =
      input.intent === 'recycle-original'
        ? '先核验已接受整理结果及未完成依赖，随后将列出的完整原文轮次移入可恢复垃圾；接受的派生结果保持原权限。缺依赖时不执行。'
        : input.intent === 'restore-original'
          ? '恢复所列仍完整的原文配对，重新核验已接受结果、权限及后续撤回；恢复不撤销用户后续的信息撤回。'
          : '确认范围包括列出的完整轮次、曾获提供这些来源的派生副本、所有受管旧版本及协议内容；不声称模型实际使用了每个来源。清理后不能恢复原文。全局正式事项由其独立领域保留。此操作不承诺介质安全擦除或清除备份、外部副本。'
    const itemPlan = inspectItemRetention(
      this.store,
      input.intent === 'purge-assistant' ? input.assistantId : null,
      [...requestIds],
      [...memoryIds]
    )
    if (input.intent === 'purge-assistant' || input.intent === 'recycle-original')
      prepareItemRetainedEdges(this.store, itemPlan, this.memory)
    const preview: RetentionPreview = {
      memories,
      rounds,
      id: randomUUID(),
      nonce: randomUUID(),
      epoch,
      intent: input.intent,
      memoryIds: [...memoryIds].sort(),
      requestIds: [...requestIds].sort(),
      retainedMemoryIds: [...retained].sort(),
      itemImpact: { items: itemPlan.items, proposals: itemPlan.proposals },
      files: files.length,
      expandedToRounds:
        input.target.type === 'message' ||
        input.target.type === 'range' ||
        rounds.some((round) => round.assistantId !== input.assistantId),
      irreversible: !['recycle-original', 'restore-original'].includes(input.intent),
      replacementAssistantId,
      blockers: [...new Set(blockers)].slice(0, 20),
      warning
    }
    return { input, preview, files, retainedEdges, accepted, itemPlan, ...copies }
  }
  async confirm(input: unknown) {
    return this.handle(retentionConfirmInputSchema, input, async (value) => {
      const intentHash = hash(JSON.stringify(value)),
        prior = this.prior(value.commandId, value.assistantId, intentHash)
      if (prior) return prior
      const row = this.store.database
        .prepare(
          "SELECT manifest_json FROM retention_previews WHERE id=? AND assistant_id=? AND nonce=? AND state='pending'"
        )
        .get(value.previewId, value.assistantId, value.nonce) as
        { manifest_json: string } | undefined
      if (!row) throw new RetentionError('STALE_PREVIEW')
      const manifest = JSON.parse(row.manifest_json) as Manifest,
        preview = manifest.preview
      if (value.accept && this.epoch !== preview.epoch) throw new RetentionError('STALE_PREVIEW')
      if (value.accept && preview.blockers.length) throw new RetentionError('DEPENDENCY_BLOCKED')
      if (value.accept && preview.intent === 'recycle-original') {
        const current = this.deps.inspectOriginal(value.assistantId, preview.requestIds)
        if (
          current.blockers.length ||
          JSON.stringify(current.accepted) !== JSON.stringify(manifest.accepted)
        )
          throw new RetentionError('STALE_PREVIEW')
      }
      if (value.accept && ['recycle-original', 'restore-original'].includes(preview.intent))
        for (const accepted of manifest.accepted) {
          const version = this.store.database
            .prepare(
              'SELECT file_name FROM memory_versions WHERE object_id=? AND version=? AND body_hash=?'
            )
            .get(accepted.id, accepted.version, accepted.hash) as { file_name: string } | undefined
          if (
            !version ||
            hash(await readFile(await this.safePath(version.file_name))) !== accepted.hash
          )
            throw new RetentionError('DEPENDENCY_BLOCKED')
        }
      const receipt = this.store.transaction(() => {
        this.fault?.('before-confirm')
        if (value.accept && this.epoch !== preview.epoch) throw new RetentionError('STALE_PREVIEW')
        const reversible = ['recycle-original', 'restore-original'].includes(preview.intent)
        if (value.accept && preview.intent !== 'restore-original' && manifest.itemPlan)
          applyItemRetention(this.store, manifest.itemPlan)
        if (value.accept && reversible) {
          for (const id of preview.requestIds) {
            if (preview.intent === 'restore-original')
              this.store.database
                .prepare('DELETE FROM retention_original_trash WHERE request_id=?')
                .run(id)
            else
              this.store.database
                .prepare('INSERT OR REPLACE INTO retention_original_trash VALUES(?,?,?,?)')
                .run(id, value.assistantId, JSON.stringify(manifest.accepted), this.epoch)
          }
          for (const edge of manifest.retainedEdges)
            this.store.database
              .prepare('INSERT OR REPLACE INTO retained_source_edges VALUES(?,?,?,?,?,?,?,?)')
              .run(
                edge.objectId,
                edge.objectVersion,
                edge.source.type,
                edge.source.id,
                edge.source.version,
                edge.source.assistantId,
                JSON.stringify(edge.recipients),
                this.epoch
              )
          this.store.database
            .prepare(
              'UPDATE retention_state SET epoch=epoch+1,generation=generation+1 WHERE singleton=1'
            )
            .run()
        }
        const jobId = value.accept && !reversible ? randomUUID() : null
        if (jobId) {
          this.store.database
            .prepare('INSERT INTO retention_jobs VALUES(?,?,?,?,?,NULL)')
            .run(
              jobId,
              value.assistantId,
              value.commandId,
              'CLEANUP_PENDING',
              new Date().toISOString()
            )
          for (const id of preview.memoryIds) this.suppress('memory', id, preview.intent)
          for (const id of preview.requestIds) this.suppress('round', id, preview.intent)
          for (const edge of manifest.retainedEdges)
            this.store.database
              .prepare('INSERT OR REPLACE INTO retained_source_edges VALUES(?,?,?,?,?,?,?,?)')
              .run(
                edge.objectId,
                edge.objectVersion,
                edge.source.type,
                edge.source.id,
                edge.source.version,
                edge.source.assistantId,
                JSON.stringify(edge.recipients),
                this.epoch
              )
          if (preview.intent === 'purge-assistant')
            this.purgeAssistant(value.assistantId, preview.replacementAssistantId)
          for (const file of manifest.files) this.item(jobId, 'file', file.name, file.hash)
          for (const id of preview.memoryIds) this.item(jobId, 'memory', id, '')
          for (const round of preview.rounds)
            this.item(
              jobId,
              'round',
              JSON.stringify({ assistantId: round.assistantId, requestId: round.requestId }),
              ''
            )
          for (const id of manifest.commandIds) this.item(jobId, 'command', id, '')
          for (const id of manifest.previewIds) this.item(jobId, 'preview', id, '')
        }
        const receipt: RetentionReceipt = {
          commandId: value.commandId,
          epoch: this.epoch,
          jobId,
          state: value.accept ? (reversible ? 'MOVED' : 'CLEANUP_PENDING') : 'CANCELLED',
          objectVersion: null
        }
        this.saveReceipt(value.assistantId, intentHash, receipt)
        if (value.accept)
          this.store.database
            .prepare("UPDATE retention_previews SET state='closed',manifest_json='{}'")
            .run()
        else
          this.store.database
            .prepare("UPDATE retention_previews SET state='closed',manifest_json='{}' WHERE id=?")
            .run(value.previewId)
        return receipt
      })
      if (value.accept) {
        this.emit({
          epoch: this.epoch,
          assistantIds: [value.assistantId],
          memoryIds: preview.memoryIds,
          requestIds: preview.requestIds,
          reason: preview.intent === 'purge-assistant' ? 'purge' : 'cleanup'
        })
        this.schedule()
      }
      this.fault?.('after-confirm')
      return receipt
    })
  }
  private item(job: string, kind: string, id: string, expected: string): void {
    this.store.database
      .prepare("INSERT OR IGNORE INTO retention_job_items VALUES(?,?,?,?,'pending')")
      .run(job, kind, id, expected)
  }
  private suppress(kind: string, id: string, reason: string): void {
    this.store.database
      .prepare('INSERT OR IGNORE INTO content_tombstones VALUES(?,?,0,?,?)')
      .run(kind, id, reason, this.epoch)
    this.store.database
      .prepare('UPDATE retention_state SET epoch=epoch+1,generation=generation+1 WHERE singleton=1')
      .run()
    if (kind === 'memory') {
      const row = this.store.database
        .prepare('SELECT record_json FROM memory_objects WHERE id=?')
        .get(id) as { record_json: string } | undefined
      if (row) {
        const record = memoryRecordSchema.parse(JSON.parse(row.record_json))
        record.state = 'suppressed'
        record.retention = 'trash'
        this.store.database
          .prepare('UPDATE memory_objects SET record_json=? WHERE id=?')
          .run(JSON.stringify(record), id)
      }
      this.store.database.prepare('DELETE FROM memory_index WHERE object_id=?').run(id)
    }
    if (reason === 'withdraw-information')
      for (const type of kind === 'round' ? ['round', 'user-round'] : ['memory'])
        this.store.database
          .prepare("INSERT OR IGNORE INTO memory_suppressions VALUES(?,?,1,'withdrawal',?)")
          .run(type, id, id)
  }
  private purgeAssistant(id: string, replacement: string | null): void {
    this.store.database
      .prepare('UPDATE retention_state SET epoch=epoch+1,generation=generation+1 WHERE singleton=1')
      .run()
    this.store.database.prepare('INSERT INTO assistant_tombstones VALUES(?,?)').run(id, this.epoch)
    this.store.database
      .prepare(
        'UPDATE assistant_state SET primary_assistant_id=CASE WHEN primary_assistant_id=? THEN ? ELSE primary_assistant_id END,current_assistant_id=CASE WHEN current_assistant_id=? THEN ? ELSE current_assistant_id END,revision=revision+1 WHERE singleton=1'
      )
      .run(id, replacement, id, replacement)
    const now = new Date().toISOString()
    this.store.database
      .prepare(
        "UPDATE assistants SET display_name='已删除助手',archived_at=?,updated_at=?,version=version+1 WHERE id=?"
      )
      .run(now, now, id)
    for (const table of [
      'assistant_provider_bindings',
      'history_permissions',
      'history_recipient_grants',
      'memory_permissions',
      'memory_recipients',
      'item_permissions',
      'item_recipients'
    ])
      this.store.database.prepare(`DELETE FROM ${table} WHERE assistant_id=?`).run(id)
  }
  async jobs(input: unknown) {
    return this.handle(retentionJobsInputSchema, input, (value) => {
      if (value.assistantId) this.assistant(value.assistantId, true)
      // Local user management remains available after deleting the last active assistant.
      const rows = this.store.database
        .prepare(
          'SELECT rowid AS cursor,* FROM retention_jobs WHERE (? IS NULL OR assistant_id=?) AND rowid>? ORDER BY rowid LIMIT 101'
        )
        .all(
          value.assistantId ?? null,
          value.assistantId ?? null,
          value.cursor ?? 0
        ) as (RetentionJob & { cursor: number; assistant_id: string; created_at: string })[]
      return {
        jobs: rows.slice(0, 100).map((row) => this.job(row.id)),
        nextCursor: rows.length > 100 ? rows[99]!.cursor : null
      }
    })
  }
  private job(id: string): RetentionJob {
    const row = this.store.database.prepare('SELECT * FROM retention_jobs WHERE id=?').get(id) as {
      id: string
      assistant_id: string
      state: RetentionJob['state']
      created_at: string
      error: RetentionJob['error']
    }
    const counts = this.store.database
      .prepare(
        "SELECT count(*) AS total,sum(CASE WHEN state='done' THEN 1 ELSE 0 END) AS completed FROM retention_job_items WHERE job_id=?"
      )
      .get(id) as { total: number; completed: number | null }
    return {
      id: row.id,
      assistantId: row.assistant_id,
      state: row.state,
      createdAt: row.created_at,
      error: row.error,
      total: counts.total,
      completed: counts.completed ?? 0
    }
  }
  async retry(input: unknown) {
    return this.handle(retentionRetryInputSchema, input, (value) => {
      if (value.assistantId) this.assistant(value.assistantId, true)
      const row = this.store.database
        .prepare(
          'SELECT command_id FROM retention_jobs WHERE id=? AND (? IS NULL OR assistant_id=?)'
        )
        .get(value.jobId, value.assistantId ?? null, value.assistantId ?? null) as
        { command_id: string } | undefined
      if (!row) throw new RetentionError('NOT_FOUND')
      this.store.database
        .prepare(
          "UPDATE retention_jobs SET state='CLEANUP_PENDING',error=NULL WHERE id=? AND state='FAILED_RETRYABLE'"
        )
        .run(value.jobId)
      this.schedule()
      return {
        commandId: row.command_id,
        epoch: this.epoch,
        jobId: value.jobId,
        state:
          this.job(value.jobId).state === 'COMPLETED'
            ? ('COMPLETED' as const)
            : ('CLEANUP_PENDING' as const),
        objectVersion: null
      }
    })
  }
  private cleanedVersion(
    id: string,
    row: { file_name: string; body_hash: string; metadata_json: string },
    excludedJob = ''
  ): boolean {
    if (row.file_name !== '' || row.body_hash !== hash('') || row.metadata_json !== '{}')
      return false
    // A canonical SQL placeholder alone is not proof: its retired identity must have
    // a completed memory item, after every file item in that earlier job finished.
    return !!this.store.database
      .prepare(
        "SELECT 1 FROM content_tombstones t JOIN retention_job_items m ON m.kind='memory' AND m.resource_id=t.id JOIN retention_jobs j ON j.id=m.job_id JOIN retention_commands c ON c.id=j.command_id WHERE t.kind='memory' AND t.id=? AND t.version=0 AND m.state='done' AND m.job_id<>? AND json_extract(c.receipt_json,'$.jobId')=m.job_id AND t.epoch<=json_extract(c.receipt_json,'$.epoch') AND NOT EXISTS(SELECT 1 FROM retention_job_items f WHERE f.job_id=m.job_id AND f.kind='file' AND f.state<>'done') LIMIT 1"
      )
      .get(id, excludedJob)
  }
  private completedEmptyResource(jobId: string, expected: string): boolean {
    if (expected !== hash('')) return false
    // Old unpublished schema-7 jobs may already contain the empty resource.
    // Keep that identity; only discharge it when each associated empty version
    // has independent prior cleanup evidence. Never reinterpret an arbitrary path.
    const rows = this.store.database
      .prepare(
        "SELECT v.object_id,v.file_name,v.body_hash,v.metadata_json FROM memory_versions v JOIN retention_job_items m ON m.resource_id=v.object_id AND m.kind='memory' WHERE m.job_id=? AND v.file_name=''"
      )
      .all(jobId) as {
      object_id: string
      file_name: string
      body_hash: string
      metadata_json: string
    }[]
    return rows.length > 0 && rows.every((row) => this.cleanedVersion(row.object_id, row, jobId))
  }
  private managedName(name: string): boolean {
    return /^[a-f0-9-]+\.md(?:\.tmp)?$/.test(name)
  }
  private async safePath(name: string, quarantine = false): Promise<string> {
    if (
      !(quarantine
        ? /^\.retention-[a-f0-9-]+-[a-f0-9-]+\.md(?:\.tmp)?\.quarantine$/.test(name)
        : this.managedName(name))
    )
      throw new FileError('UNSAFE_PATH')
    const root = resolve(this.directory),
      target = resolve(root, name),
      rel = relative(root, target)
    if (isAbsolute(rel) || rel.startsWith('..') || rel.includes(':'))
      throw new FileError('UNSAFE_PATH')
    let parent = root
    while (true) {
      const stat = await lstat(parent)
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new FileError('UNSAFE_PATH')
      const next = dirname(parent)
      if (next === parent) break
      parent = next
    }
    if ((await realpath(root)).toLowerCase() !== root.toLowerCase())
      throw new FileError('UNSAFE_PATH')
    try {
      const stat = await lstat(target)
      if (stat.isSymbolicLink() || !stat.isFile()) throw new FileError('UNSAFE_PATH')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    return target
  }
  private async cleanFile(jobId: string, name: string, expected: string): Promise<void> {
    const original = await this.safePath(name)
    const quarantineName = '.retention-' + jobId + '-' + name + '.quarantine'
    const quarantine = await this.safePath(quarantineName, true)
    let isolated = false
    try {
      await lstat(quarantine)
      isolated = true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    if (!isolated) {
      try {
        if ((await lstat(original)).size > 64000 || hash(await readFile(original)) !== expected)
          throw new FileError('FILE_CHANGED')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
        throw error
      }
      this.fault?.('before-unlink')
      await this.safePath(name)
      await rename(original, quarantine)
      this.fault?.('after-quarantine')
    }
    if ((await lstat(quarantine)).size > 64000 || hash(await readFile(quarantine)) !== expected) {
      // link is exclusive: never overwrite a concurrently created original pathname.
      try {
        await this.safePath(name)
        await link(quarantine, original)
        await unlink(quarantine)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      }
      throw new FileError('FILE_CHANGED')
    }
    await this.safePath(quarantineName, true)
    await unlink(quarantine)
    this.fault?.('after-unlink')
    try {
      await lstat(original)
      throw new FileError('FILE_CHANGED')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  private schedule(): void {
    if (this.running || this.stopped) return
    this.running = true
    setImmediate(() => {
      void this.drain().finally(() => {
        this.running = false
      })
    })
  }
  async drain(): Promise<void> {
    while (!this.stopped) {
      const job = this.store.database
        .prepare(
          "SELECT id FROM retention_jobs WHERE state IN('CLEANUP_PENDING','CLEANING') ORDER BY rowid LIMIT 1"
        )
        .get() as { id: string } | undefined
      if (!job) return
      this.store.database
        .prepare("UPDATE retention_jobs SET state='CLEANING' WHERE id=?")
        .run(job.id)
      try {
        const items = this.store.database
          .prepare(
            "SELECT kind,resource_id,expected_hash FROM retention_job_items WHERE job_id=? AND state='pending' ORDER BY CASE kind WHEN 'file' THEN 0 ELSE 1 END,rowid LIMIT 24"
          )
          .all(job.id) as { kind: string; resource_id: string; expected_hash: string }[]
        for (const item of items) {
          if (this.stopped) return
          this.fault?.('before-item-' + item.kind)
          if (item.kind === 'file') {
            if (item.resource_id !== '' || !this.completedEmptyResource(job.id, item.expected_hash))
              await this.cleanFile(job.id, item.resource_id, item.expected_hash)
          } else this.store.transaction(() => this.cleanSql(item.kind, item.resource_id))
          if (this.stopped) return
          this.store.database
            .prepare(
              "UPDATE retention_job_items SET state='done' WHERE job_id=? AND kind=? AND resource_id=?"
            )
            .run(job.id, item.kind, item.resource_id)
          this.fault?.('after-item-' + item.kind)
        }
        if (
          !this.store.database
            .prepare("SELECT 1 FROM retention_job_items WHERE job_id=? AND state='pending'")
            .get(job.id)
        ) {
          this.fault?.('before-complete')
          this.store.database
            .prepare("UPDATE retention_jobs SET state='COMPLETED',error=NULL WHERE id=?")
            .run(job.id)
          const jobState = this.job(job.id)
          this.emit({
            epoch: this.epoch,
            assistantIds: [jobState.assistantId],
            memoryIds: [],
            requestIds: [],
            reason: 'job-status'
          })
        }
      } catch (error) {
        if (this.stopped) return
        this.store.database
          .prepare("UPDATE retention_jobs SET state='FAILED_RETRYABLE',error=? WHERE id=?")
          .run(error instanceof FileError ? error.code : 'STORAGE_UNAVAILABLE', job.id)
      }
      await yieldBatch()
    }
  }
  private cleanSql(kind: string, id: string): void {
    if (kind === 'memory') {
      const row = this.store.database
        .prepare('SELECT record_json FROM memory_objects WHERE id=?')
        .get(id) as { record_json: string } | undefined
      if (row) {
        const record = memoryRecordSchema.parse(JSON.parse(row.record_json))
        const empty = {
          ...record,
          title: '已清理内容',
          markdown: '',
          event: null,
          state: 'suppressed',
          retention: 'trash',
          sources: []
        }
        this.store.database
          .prepare('UPDATE memory_objects SET record_json=? WHERE id=?')
          .run(JSON.stringify(empty), id)
        this.store.database
          .prepare(
            'UPDATE memory_versions SET metadata_json=?,file_name=?,body_hash=? WHERE object_id=?'
          )
          .run('{}', '', hash(''), id)
      }
      for (const table of ['memory_index', 'memory_pending', 'memory_cleanup'])
        this.store.database.prepare(`DELETE FROM ${table} WHERE object_id=?`).run(id)
    } else if (kind === 'round') {
      const round = z
        .strictObject({ assistantId: z.string().uuid(), requestId: z.string().uuid() })
        .parse(JSON.parse(id))
      this.store.database
        .prepare(
          "UPDATE timeline_messages SET content='',source_session_id=NULL,source_message_id=NULL,status='interrupted' WHERE assistant_id=? AND request_id=?"
        )
        .run(round.assistantId, round.requestId)
      const segments = this.store.database
        .prepare('SELECT id FROM protocol_segments WHERE assistant_id=? AND request_id=?')
        .all(round.assistantId, round.requestId) as { id: string }[]
      for (const segment of segments) {
        const ops = this.store.database
          .prepare('SELECT id,record_json FROM tool_operations WHERE segment_id=?')
          .all(segment.id) as { id: string; record_json: string }[]
        for (const op of ops) {
          const record = JSON.parse(op.record_json) as Record<string, unknown>
          record.summary = '操作内容已清理'
          record.citations = []
          delete record.memoryReceipt
          delete record.retentionIntent
          delete record.retentionPreview
          this.store.database
            .prepare("UPDATE tool_operations SET arguments_json='{}',record_json=? WHERE id=?")
            .run(JSON.stringify(record), op.id)
          this.store.database
            .prepare("UPDATE protocol_results SET result_json='{}' WHERE operation_id=?")
            .run(op.id)
        }
        this.store.database
          .prepare(
            "UPDATE protocol_segments SET messages_json='[]',status='interrupted' WHERE id=?"
          )
          .run(segment.id)
      }
    } else if (kind === 'command') {
      const row = this.store.database
        .prepare('SELECT intent_json,receipt_json FROM memory_commands WHERE id=?')
        .get(id) as { intent_json: string; receipt_json: string | null } | undefined
      if (!row) return
      const intent = JSON.parse(row.intent_json) as {
        mutation?: { action?: string }
        actor?: string
      }
      const receipt = row.receipt_json
        ? (JSON.parse(row.receipt_json) as Record<string, unknown>)
        : null
      if (receipt) {
        receipt.summary = '操作已处理，正文副本已清理'
        receipt.confirmationId = null
        delete receipt.impact
      }
      this.store.database
        .prepare('UPDATE memory_commands SET intent_json=?,receipt_json=? WHERE id=?')
        .run(
          JSON.stringify({
            mutation: { action: intent.mutation?.action ?? 'delete' },
            actor: intent.actor ?? 'user'
          }),
          receipt ? JSON.stringify(receipt) : null,
          id
        )
    } else if (kind === 'preview')
      this.store.database
        .prepare("UPDATE memory_previews SET payload_json='{}',state='closed' WHERE id=?")
        .run(id)
  }
}
